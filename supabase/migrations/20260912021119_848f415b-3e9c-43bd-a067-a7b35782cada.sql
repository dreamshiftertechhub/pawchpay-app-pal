
-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  account_number TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- WALLETS
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wallet" ON public.wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- TRANSACTIONS
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','pending','failed')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_created_idx ON public.transactions (user_id, created_at DESC);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- LOGIN CODES
CREATE TABLE public.login_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  code TEXT NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.login_codes TO authenticated;
GRANT ALL ON public.login_codes TO service_role;
ALTER TABLE public.login_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own codes" ON public.login_codes FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER wallets_touch BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- new user -> profile + wallet
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acct TEXT;
BEGIN
  LOOP
    acct := '81' || lpad((floor(random() * 100000000))::bigint::text, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE account_number = acct);
  END LOOP;

  INSERT INTO public.profiles (id, full_name, phone, account_number)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.raw_user_meta_data->>'phone', acct);

  INSERT INTO public.wallets (user_id, balance) VALUES (NEW.id, 0);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- OTP issue / verify
CREATE OR REPLACE FUNCTION public.issue_login_code()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  c := lpad((floor(random() * 1000000))::int::text, 6, '0');
  UPDATE public.login_codes SET consumed = true WHERE user_id = auth.uid() AND consumed = false;
  INSERT INTO public.login_codes (user_id, code) VALUES (auth.uid(), c);
  RETURN c;
END; $$;
GRANT EXECUTE ON FUNCTION public.issue_login_code() TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_login_code(p_code TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO rec FROM public.login_codes
   WHERE user_id = auth.uid() AND consumed = false AND expires_at > now() AND code = p_code
   ORDER BY created_at DESC LIMIT 1;
  IF rec IS NULL THEN RETURN false; END IF;
  UPDATE public.login_codes SET consumed = true WHERE id = rec.id;
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.verify_login_code(TEXT) TO authenticated;

-- Money movements
CREATE OR REPLACE FUNCTION public.wallet_credit(p_amount NUMERIC, p_kind TEXT, p_title TEXT, p_category TEXT, p_note TEXT DEFAULT NULL)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_balance NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  UPDATE public.wallets SET balance = balance + p_amount WHERE user_id = auth.uid() RETURNING balance INTO new_balance;
  INSERT INTO public.transactions (user_id, kind, title, category, amount, direction, note)
  VALUES (auth.uid(), p_kind, p_title, p_category, p_amount, 'in', p_note);
  RETURN new_balance;
END; $$;
GRANT EXECUTE ON FUNCTION public.wallet_credit(NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.wallet_debit(p_amount NUMERIC, p_kind TEXT, p_title TEXT, p_category TEXT, p_note TEXT DEFAULT NULL)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur NUMERIC; new_balance NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  SELECT balance INTO cur FROM public.wallets WHERE user_id = auth.uid() FOR UPDATE;
  IF cur IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF cur < p_amount THEN
    INSERT INTO public.transactions (user_id, kind, title, category, amount, direction, status, note)
    VALUES (auth.uid(), p_kind, p_title, p_category, p_amount, 'out', 'failed', 'Insufficient balance');
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  UPDATE public.wallets SET balance = balance - p_amount WHERE user_id = auth.uid() RETURNING balance INTO new_balance;
  INSERT INTO public.transactions (user_id, kind, title, category, amount, direction, note)
  VALUES (auth.uid(), p_kind, p_title, p_category, p_amount, 'out', p_note);
  RETURN new_balance;
END; $$;
GRANT EXECUTE ON FUNCTION public.wallet_debit(NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated;

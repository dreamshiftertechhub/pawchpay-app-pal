CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.transaction_security (
  user_id uuid PRIMARY KEY,
  pin_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.transaction_security TO service_role;
ALTER TABLE public.transaction_security ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reference text NOT NULL UNIQUE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  provider text NOT NULL DEFAULT 'paystack',
  provider_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_intents TO authenticated;
GRANT ALL ON public.payment_intents TO service_role;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own payment intents" ON public.payment_intents FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reference text NOT NULL UNIQUE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  recipient_name text NOT NULL,
  account_number text NOT NULL,
  bank_code text NOT NULL,
  bank_name text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','reversed')),
  provider_transfer_code text,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transfer_requests TO authenticated;
GRANT ALL ON public.transfer_requests TO service_role;
ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own transfers" ON public.transfer_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.paystack_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  reference text,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.paystack_events TO service_role;
ALTER TABLE public.paystack_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  account_number text NOT NULL,
  bank_code text NOT NULL,
  bank_name text NOT NULL,
  recipient_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_number, bank_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiaries TO authenticated;
GRANT ALL ON public.beneficiaries TO service_role;
ALTER TABLE public.beneficiaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own beneficiaries" ON public.beneficiaries FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  target_amount numeric(14,2) NOT NULL CHECK (target_amount > 0),
  saved_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (saved_amount >= 0),
  target_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.savings_goals TO authenticated;
GRANT ALL ON public.savings_goals TO service_role;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own savings goals" ON public.savings_goals FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.savings_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_id uuid NOT NULL REFERENCES public.savings_goals(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.savings_contributions TO authenticated;
GRANT ALL ON public.savings_contributions TO service_role;
ALTER TABLE public.savings_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own savings contributions" ON public.savings_contributions FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX payment_intents_user_created_idx ON public.payment_intents(user_id, created_at DESC);
CREATE INDEX transfer_requests_user_created_idx ON public.transfer_requests(user_id, created_at DESC);
CREATE INDEX savings_goals_user_created_idx ON public.savings_goals(user_id, created_at DESC);
CREATE INDEX savings_contributions_goal_created_idx ON public.savings_contributions(goal_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_transaction_pin_for_user(p_user_id uuid, p_pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF p_pin !~ '^\d{4}$' THEN RAISE EXCEPTION 'PIN must be exactly four digits'; END IF;
  INSERT INTO public.transaction_security(user_id, pin_hash, failed_attempts, locked_until, updated_at)
  VALUES (p_user_id, crypt(p_pin, gen_salt('bf')), 0, NULL, now())
  ON CONFLICT (user_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.set_transaction_pin_for_user(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_transaction_pin_for_user(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.verify_transaction_pin_for_user(p_user_id uuid, p_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE rec public.transaction_security%ROWTYPE;
BEGIN
  SELECT * INTO rec FROM public.transaction_security WHERE user_id = p_user_id FOR UPDATE;
  IF rec.user_id IS NULL THEN RAISE EXCEPTION 'Transaction PIN has not been set'; END IF;
  IF rec.locked_until IS NOT NULL AND rec.locked_until > now() THEN RAISE EXCEPTION 'PIN locked. Try again later'; END IF;
  IF rec.pin_hash = crypt(p_pin, rec.pin_hash) THEN
    UPDATE public.transaction_security SET failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE user_id = p_user_id;
    RETURN true;
  END IF;
  UPDATE public.transaction_security
  SET failed_attempts = failed_attempts + 1,
      locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END,
      updated_at = now()
  WHERE user_id = p_user_id;
  RETURN false;
END; $$;
REVOKE ALL ON FUNCTION public.verify_transaction_pin_for_user(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_transaction_pin_for_user(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_transfer_for_user(p_user_id uuid, p_reference text, p_amount numeric, p_recipient_name text, p_account_number text, p_bank_code text, p_bank_name text, p_note text DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur numeric; new_balance numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  SELECT balance INTO cur FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF cur IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF cur < p_amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  UPDATE public.wallets SET balance = balance - p_amount WHERE user_id = p_user_id RETURNING balance INTO new_balance;
  INSERT INTO public.transfer_requests(user_id,reference,amount,recipient_name,account_number,bank_code,bank_name,note)
  VALUES(p_user_id,p_reference,p_amount,p_recipient_name,p_account_number,p_bank_code,p_bank_name,p_note);
  INSERT INTO public.transactions(user_id,kind,title,category,amount,direction,status,note)
  VALUES(p_user_id,'transfer',p_recipient_name,'Transfer',p_amount,'out','pending',p_reference);
  RETURN new_balance;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_transfer_for_user(uuid,text,numeric,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_transfer_for_user(uuid,text,numeric,text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.reverse_transfer_by_reference(p_reference text, p_reason text DEFAULT 'Transfer reversed')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tr public.transfer_requests%ROWTYPE;
BEGIN
  SELECT * INTO tr FROM public.transfer_requests WHERE reference = p_reference FOR UPDATE;
  IF tr.id IS NULL OR tr.reversed_at IS NOT NULL OR tr.status = 'success' THEN RETURN; END IF;
  UPDATE public.wallets SET balance = balance + tr.amount WHERE user_id = tr.user_id;
  UPDATE public.transfer_requests SET status='reversed', reversed_at=now(), updated_at=now() WHERE id=tr.id;
  UPDATE public.transactions SET status='failed', note=p_reason WHERE user_id=tr.user_id AND note=p_reference AND kind='transfer';
  INSERT INTO public.transactions(user_id,kind,title,category,amount,direction,status,note)
  VALUES(tr.user_id,'reversal','Transfer reversal','Money in',tr.amount,'in','success',p_reference);
END; $$;
REVOKE ALL ON FUNCTION public.reverse_transfer_by_reference(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transfer_by_reference(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_funding_by_reference(p_reference text, p_amount numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE intent public.payment_intents%ROWTYPE;
BEGIN
  SELECT * INTO intent FROM public.payment_intents WHERE reference=p_reference FOR UPDATE;
  IF intent.id IS NULL OR intent.amount <> p_amount THEN RETURN false; END IF;
  IF intent.status='success' THEN RETURN true; END IF;
  IF intent.status<>'pending' THEN RETURN false; END IF;
  UPDATE public.payment_intents SET status='success', updated_at=now() WHERE id=intent.id;
  UPDATE public.wallets SET balance=balance+intent.amount WHERE user_id=intent.user_id;
  INSERT INTO public.transactions(user_id,kind,title,category,amount,direction,status,note)
  VALUES(intent.user_id,'funding','Wallet funding','Money in',intent.amount,'in','success',p_reference);
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_funding_by_reference(text,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_funding_by_reference(text,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.fund_savings_goal_for_user(p_user_id uuid, p_goal_id uuid, p_amount numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur numeric; total numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  PERFORM 1 FROM public.savings_goals WHERE id=p_goal_id AND user_id=p_user_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Savings goal not found'; END IF;
  SELECT balance INTO cur FROM public.wallets WHERE user_id=p_user_id FOR UPDATE;
  IF cur < p_amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  UPDATE public.wallets SET balance=balance-p_amount WHERE user_id=p_user_id;
  UPDATE public.savings_goals SET saved_amount=saved_amount+p_amount, status=CASE WHEN saved_amount+p_amount>=target_amount THEN 'completed' ELSE status END, updated_at=now() WHERE id=p_goal_id RETURNING saved_amount INTO total;
  INSERT INTO public.savings_contributions(user_id,goal_id,amount) VALUES(p_user_id,p_goal_id,p_amount);
  INSERT INTO public.transactions(user_id,kind,title,category,amount,direction,status,note)
  SELECT p_user_id,'savings',name,'Target savings',p_amount,'out','success',p_goal_id::text FROM public.savings_goals WHERE id=p_goal_id;
  RETURN total;
END; $$;
REVOKE ALL ON FUNCTION public.fund_savings_goal_for_user(uuid,uuid,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fund_savings_goal_for_user(uuid,uuid,numeric) TO service_role;

REVOKE EXECUTE ON FUNCTION public.wallet_credit(numeric,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wallet_debit(numeric,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_credit(numeric,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_debit(numeric,text,text,text,text) TO service_role;
-- Atomic, retry-safe savings withdrawals back to the user's wallet.
CREATE TABLE public.savings_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_id uuid NOT NULL REFERENCES public.savings_goals(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.savings_withdrawals TO authenticated;
GRANT ALL ON public.savings_withdrawals TO service_role;
ALTER TABLE public.savings_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own savings withdrawals" ON public.savings_withdrawals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX savings_withdrawals_user_created_idx
  ON public.savings_withdrawals(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.withdraw_savings_goal_for_user(
  p_user_id uuid,
  p_goal_id uuid,
  p_amount numeric,
  p_reference text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing public.savings_withdrawals%ROWTYPE;
  goal public.savings_goals%ROWTYPE;
  new_saved numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF p_reference IS NULL OR p_reference !~ '^[a-zA-Z0-9-]{16,60}$' THEN
    RAISE EXCEPTION 'Invalid withdrawal reference';
  END IF;

  SELECT * INTO existing
  FROM public.savings_withdrawals
  WHERE reference = p_reference
  FOR UPDATE;

  IF FOUND THEN
    IF existing.user_id <> p_user_id OR existing.goal_id <> p_goal_id OR existing.amount <> p_amount THEN
      RAISE EXCEPTION 'Withdrawal reference already used';
    END IF;
    SELECT saved_amount INTO new_saved
    FROM public.savings_goals
    WHERE id = p_goal_id AND user_id = p_user_id;
    RETURN new_saved;
  END IF;

  SELECT * INTO goal
  FROM public.savings_goals
  WHERE id = p_goal_id AND user_id = p_user_id
  FOR UPDATE;
  IF goal.id IS NULL THEN RAISE EXCEPTION 'Savings goal not found'; END IF;
  IF goal.status = 'closed' THEN RAISE EXCEPTION 'Savings goal is closed'; END IF;
  IF goal.saved_amount < p_amount THEN RAISE EXCEPTION 'Amount exceeds savings balance'; END IF;

  PERFORM 1 FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;

  INSERT INTO public.savings_withdrawals(user_id, goal_id, reference, amount)
  VALUES (p_user_id, p_goal_id, p_reference, p_amount);

  UPDATE public.savings_goals
  SET saved_amount = saved_amount - p_amount,
      status = CASE WHEN saved_amount - p_amount >= target_amount THEN 'completed' ELSE 'active' END,
      updated_at = now()
  WHERE id = p_goal_id
  RETURNING saved_amount INTO new_saved;

  UPDATE public.wallets
  SET balance = balance + p_amount
  WHERE user_id = p_user_id;

  INSERT INTO public.transactions(user_id, kind, title, category, amount, direction, status, note)
  VALUES (p_user_id, 'savings_withdrawal', 'Savings withdrawal', 'Money in', p_amount, 'in', 'success', p_reference);

  RETURN new_saved;
END;
$$;
REVOKE ALL ON FUNCTION public.withdraw_savings_goal_for_user(uuid,uuid,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_savings_goal_for_user(uuid,uuid,numeric,text) TO service_role;

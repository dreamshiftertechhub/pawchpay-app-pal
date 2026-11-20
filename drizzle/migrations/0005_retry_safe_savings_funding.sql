-- Make wallet-to-savings contributions safe to retry after a lost response.
ALTER TABLE public.savings_contributions ADD COLUMN reference text;
CREATE UNIQUE INDEX savings_contributions_reference_uidx
  ON public.savings_contributions(reference) WHERE reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fund_savings_goal_for_user(
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
  existing public.savings_contributions%ROWTYPE;
  goal public.savings_goals%ROWTYPE;
  wallet_balance numeric;
  new_total numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF p_reference IS NULL OR p_reference !~ '^[a-zA-Z0-9-]{16,60}$' THEN
    RAISE EXCEPTION 'Invalid savings reference';
  END IF;

  SELECT * INTO existing
  FROM public.savings_contributions
  WHERE reference = p_reference
  FOR UPDATE;

  IF FOUND THEN
    IF existing.user_id <> p_user_id OR existing.goal_id <> p_goal_id OR existing.amount <> p_amount THEN
      RAISE EXCEPTION 'Savings reference already used';
    END IF;
    SELECT saved_amount INTO new_total
    FROM public.savings_goals
    WHERE id = p_goal_id AND user_id = p_user_id;
    RETURN new_total;
  END IF;

  SELECT * INTO goal
  FROM public.savings_goals
  WHERE id = p_goal_id AND user_id = p_user_id AND status = 'active'
  FOR UPDATE;
  IF goal.id IS NULL THEN RAISE EXCEPTION 'Savings goal not found or inactive'; END IF;

  SELECT balance INTO wallet_balance
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;
  IF wallet_balance IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF wallet_balance < p_amount THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  INSERT INTO public.savings_contributions(user_id, goal_id, amount, reference)
  VALUES (p_user_id, p_goal_id, p_amount, p_reference);

  UPDATE public.wallets
  SET balance = balance - p_amount
  WHERE user_id = p_user_id;

  UPDATE public.savings_goals
  SET saved_amount = saved_amount + p_amount,
      status = CASE WHEN saved_amount + p_amount >= target_amount THEN 'completed' ELSE status END,
      updated_at = now()
  WHERE id = p_goal_id
  RETURNING saved_amount INTO new_total;

  INSERT INTO public.transactions(user_id, kind, title, category, amount, direction, status, note)
  VALUES (p_user_id, 'savings', goal.name, 'Target savings', p_amount, 'out', 'success', p_reference);

  RETURN new_total;
END;
$$;

REVOKE ALL ON FUNCTION public.fund_savings_goal_for_user(uuid,uuid,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fund_savings_goal_for_user(uuid,uuid,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fund_savings_goal_for_user(uuid,uuid,numeric,text) TO service_role;

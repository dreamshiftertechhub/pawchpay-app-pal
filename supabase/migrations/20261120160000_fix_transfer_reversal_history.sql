-- Preserve the original transfer reference in transaction history when reversing.
-- This keeps the failed transfer linked to its reference while recording the reason
-- in the transfer_requests status/event data.
CREATE OR REPLACE FUNCTION public.reverse_transfer_by_reference(
  p_reference text,
  p_reason text DEFAULT 'Transfer reversed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tr public.transfer_requests%ROWTYPE;
BEGIN
  SELECT *
  INTO tr
  FROM public.transfer_requests
  WHERE reference = p_reference
  FOR UPDATE;

  IF tr.id IS NULL OR tr.reversed_at IS NOT NULL OR tr.status = 'success' THEN
    RETURN;
  END IF;

  UPDATE public.wallets
  SET balance = balance + tr.amount
  WHERE user_id = tr.user_id;

  UPDATE public.transfer_requests
  SET status = 'reversed',
      reversed_at = now(),
      updated_at = now()
  WHERE id = tr.id;

  -- Keep note=p_reference: history and reconciliation use this stable reference.
  UPDATE public.transactions
  SET status = 'failed'
  WHERE user_id = tr.user_id
    AND note = p_reference
    AND kind = 'transfer';

  INSERT INTO public.transactions(user_id, kind, title, category, amount, direction, status, note)
  VALUES(tr.user_id, 'reversal', 'Transfer reversal', 'Money in', tr.amount, 'in', 'success', p_reference);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_transfer_by_reference(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transfer_by_reference(text, text)
  TO service_role;

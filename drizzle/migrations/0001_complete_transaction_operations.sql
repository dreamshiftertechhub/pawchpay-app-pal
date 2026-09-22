CREATE OR REPLACE FUNCTION public.complete_transfer_by_reference(p_reference text, p_provider_transfer_code text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.transfer_requests
  SET status = 'success',
      provider_transfer_code = COALESCE(p_provider_transfer_code, provider_transfer_code),
      updated_at = now()
  WHERE reference = p_reference
    AND status = 'pending'
    AND reversed_at IS NULL;

  IF FOUND THEN
    UPDATE public.transactions
    SET status = 'success'
    WHERE kind = 'transfer'
      AND note = p_reference
      AND status = 'pending';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_airtime_for_user(
  p_user_id uuid,
  p_amount numeric,
  p_network text,
  p_phone text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE cur numeric; new_balance numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF p_phone IS NULL OR p_phone !~ '^0[789][01][0-9]{8}$' THEN RAISE EXCEPTION 'Enter a valid Nigerian phone number'; END IF;
  IF p_network NOT IN ('MTN', 'Airtel', 'Glo', '9mobile') THEN RAISE EXCEPTION 'Unsupported network'; END IF;

  SELECT balance INTO cur FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF cur IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF cur < p_amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  UPDATE public.wallets SET balance = balance - p_amount WHERE user_id = p_user_id RETURNING balance INTO new_balance;
  INSERT INTO public.transactions(user_id, kind, title, category, amount, direction, status, note)
  VALUES(p_user_id, 'airtime', p_network || ' Airtime', 'Airtime', p_amount, 'out', 'success', p_phone);
  RETURN new_balance;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_transfer_by_reference(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_transfer_by_reference(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.purchase_airtime_for_user(uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_airtime_for_user(uuid, numeric, text, text) TO service_role;
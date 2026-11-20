-- Wallet balances must only be changed by trusted server-side workflows.
-- The browser must never be able to mint or debit wallet funds by calling
-- these generic RPCs with arbitrary amounts and transaction metadata.
REVOKE ALL ON FUNCTION public.wallet_credit(NUMERIC, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_debit(NUMERIC, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- Keep access for trusted backend code using the service-role key.
GRANT EXECUTE ON FUNCTION public.wallet_credit(NUMERIC, TEXT, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_debit(NUMERIC, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

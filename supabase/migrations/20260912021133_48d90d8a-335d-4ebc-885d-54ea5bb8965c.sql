
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_login_code() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_login_code(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wallet_credit(NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wallet_debit(NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_login_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_login_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_credit(NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_debit(NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated;

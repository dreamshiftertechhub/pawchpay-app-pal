-- The previous browser OTP returned its own code to the authenticated client.
-- That is not a second factor. Disable the legacy endpoints and prevent users
-- from reading stored login codes until a real delivery/MFA provider is configured.
REVOKE ALL ON TABLE public.login_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_login_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_login_code(text) FROM PUBLIC, anon, authenticated;

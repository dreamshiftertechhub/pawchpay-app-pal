-- Keep profile identity and account-number fields server-managed.
-- Signup still creates profiles through the SECURITY DEFINER auth trigger.
-- Authenticated clients may edit only their display name; phone changes remain
-- disabled until a verified server-side phone-change workflow exists.

REVOKE INSERT, UPDATE ON TABLE public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name) ON TABLE public.profiles TO authenticated;

-- service_role and the table owner retain their existing server-side access.

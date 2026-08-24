-- Module 14 security hygiene: no anonymous access to internal AI mode mapping helper.
REVOKE ALL ON FUNCTION public.ai_capability_from_mode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_capability_from_mode(text) TO authenticated, service_role;

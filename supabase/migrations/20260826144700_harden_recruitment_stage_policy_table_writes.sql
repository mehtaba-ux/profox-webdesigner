-- Force all authenticated recruitment-pipeline mutations through the guarded
-- SECURITY DEFINER RPCs. Admins retain read access, while postgres/service_role
-- keep backend write access for trusted server-side operations.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.recruitment_stage_policies
FROM authenticated, anon, PUBLIC;

GRANT SELECT ON TABLE public.recruitment_stage_policies TO authenticated;

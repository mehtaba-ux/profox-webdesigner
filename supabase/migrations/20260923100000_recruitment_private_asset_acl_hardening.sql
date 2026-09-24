-- Seller lifecycle readiness hardening.
-- Close the production privilege drift on the private recruitment asset helper.
-- The Edge Function authenticates the reviewer and invokes this helper through
-- a service-role Supabase client. Browser roles must never call it directly.

DO $$
BEGIN
  IF to_regprocedure('public.service_authorize_recruitment_asset_access(uuid,uuid,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Required recruitment private-asset authorization helper is missing.';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.service_authorize_recruitment_asset_access(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_authorize_recruitment_asset_access(uuid, uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.service_authorize_recruitment_asset_access(uuid, uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.service_authorize_recruitment_asset_access(uuid, uuid, text, text, text) TO service_role;

COMMENT ON FUNCTION public.service_authorize_recruitment_asset_access(uuid, uuid, text, text, text) IS
  'Service-role-only authorization helper for short-lived private recruitment asset links. Browser roles are denied; reviewer identity must be authenticated by the recruitment-private-asset-url Edge Function before invocation.';

DO $$
DECLARE
  v_oid oid;
BEGIN
  SELECT p.oid
  INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='service_authorize_recruitment_asset_access'
    AND pg_get_function_identity_arguments(p.oid)='p_actor_user_id uuid, p_applicant_id uuid, p_asset_type text, p_ip_hash text, p_user_agent text'
  LIMIT 1;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Recruitment private-asset authorization helper identity could not be verified.';
  END IF;

  IF has_function_privilege('anon',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous execution remains on service_authorize_recruitment_asset_access.';
  END IF;

  IF has_function_privilege('authenticated',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated browser execution remains on service_authorize_recruitment_asset_access.';
  END IF;

  IF NOT has_function_privilege('service_role',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'Service role lost required execution on service_authorize_recruitment_asset_access.';
  END IF;
END $$;

-- Remove retired applicant-facing Sales application fields without deleting historical evidence.
-- Current applicants no longer provide B2B experience months or a sample cold outreach message.
-- Historical applicant columns remain intact for previously submitted applications.
-- The V3 core remains service-role-only; the public wrapper remains the only browser entry point.

DO $migration$
DECLARE
  v_core text;
  v_snapshot text;
  v_core_needle text := $needle$IF char_length(trim(coalesce(p_application->>'sampleOutreachMessage','')))<20 THEN RETURN jsonb_build_object('success',false,'field','sampleOutreachMessage','error','Please provide a short sample cold outreach message.');END IF;$needle$;
  v_snapshot_needle text := $needle$jsonb_build_object('key','outreach','label','Sample outreach provided','passed',char_length(coalesce(a.sample_outreach_message,''))>=20),$needle$;
BEGIN
  SELECT pg_get_functiondef(to_regprocedure('public.submit_public_sales_application_v3_core(jsonb)'))
  INTO v_core;

  IF v_core IS NULL THEN
    RAISE EXCEPTION 'Required sales application V3 core function is missing.';
  END IF;

  IF position(v_core_needle in v_core)=0 THEN
    RAISE EXCEPTION 'Expected sample outreach validation was not found in the sales application V3 core.';
  END IF;

  v_core:=replace(v_core,v_core_needle,'');
  EXECUTE v_core;

  SELECT pg_get_functiondef(to_regprocedure('public.admin_get_applicant_review_snapshot(uuid)'))
  INTO v_snapshot;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Required applicant review snapshot function is missing.';
  END IF;

  IF position(v_snapshot_needle in v_snapshot)=0 THEN
    RAISE EXCEPTION 'Expected sample outreach readiness check was not found in the applicant review snapshot.';
  END IF;

  v_snapshot:=replace(v_snapshot,v_snapshot_needle,'');
  EXECUTE v_snapshot;
END
$migration$;

REVOKE ALL ON FUNCTION public.submit_public_sales_application_v3_core(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_sales_application_v3_core(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_applicant_review_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_applicant_review_snapshot(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.submit_public_sales_application_v3_core(jsonb) IS
  'Canonical service-role Sales application V3 insert/validation core. Sample cold outreach is no longer required for new applications; historical evidence remains preserved.';

DO $verify$
DECLARE
  v_core text;
  v_snapshot text;
  v_core_oid oid;
  v_snapshot_oid oid;
BEGIN
  SELECT p.oid,pg_get_functiondef(p.oid)
  INTO v_core_oid,v_core
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='submit_public_sales_application_v3_core'
    AND pg_get_function_identity_arguments(p.oid)='p_application jsonb'
  LIMIT 1;

  IF v_core_oid IS NULL THEN
    RAISE EXCEPTION 'Sales application V3 core function could not be verified.';
  END IF;

  IF position('Please provide a short sample cold outreach message.' in v_core)>0 THEN
    RAISE EXCEPTION 'Sample outreach validation still exists in the sales application V3 core.';
  END IF;

  IF has_function_privilege('anon',v_core_oid,'EXECUTE')
     OR has_function_privilege('authenticated',v_core_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'Browser execution remains on the internal sales application V3 core.';
  END IF;

  IF NOT has_function_privilege('service_role',v_core_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'Service role lost required execution on the sales application V3 core.';
  END IF;

  SELECT p.oid,pg_get_functiondef(p.oid)
  INTO v_snapshot_oid,v_snapshot
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='admin_get_applicant_review_snapshot'
    AND pg_get_function_identity_arguments(p.oid)='p_applicant_id uuid'
  LIMIT 1;

  IF v_snapshot_oid IS NULL THEN
    RAISE EXCEPTION 'Applicant review snapshot function could not be verified.';
  END IF;

  IF position('Sample outreach provided' in v_snapshot)>0 THEN
    RAISE EXCEPTION 'Sample outreach readiness check still exists in the applicant review snapshot.';
  END IF;

  IF has_function_privilege('anon',v_snapshot_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous execution remains on the applicant review snapshot.';
  END IF;

  IF NOT has_function_privilege('authenticated',v_snapshot_oid,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_snapshot_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'Required reviewer execution was lost on the applicant review snapshot.';
  END IF;
END
$verify$;

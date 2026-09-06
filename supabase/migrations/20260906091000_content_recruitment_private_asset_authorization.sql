-- Service-only authorization for short-lived Content Writer recruitment asset links.
-- The caller supplies applicant + asset type, never an arbitrary storage path.

CREATE OR REPLACE FUNCTION public.service_authorize_recruitment_asset_access(
  p_actor_user_id uuid,
  p_applicant_id uuid,
  p_asset_type text,
  p_ip_hash text DEFAULT '',
  p_user_agent text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor public.user_profiles%rowtype;
  v_app public.applicants%rowtype;
  v_job public.career_jobs%rowtype;
  v_cap public.workforce_capability_profiles%rowtype;
  v_path text;
  v_allowed boolean := false;
BEGIN
  IF p_actor_user_id IS NULL OR p_applicant_id IS NULL THEN
    RAISE EXCEPTION 'Reviewer and applicant are required.';
  END IF;

  SELECT * INTO v_actor FROM public.user_profiles WHERE id = p_actor_user_id;
  IF NOT FOUND OR v_actor.status <> 'active' THEN
    RAISE EXCEPTION 'Active reviewer account required.';
  END IF;

  IF v_actor.role = 'admin' THEN
    v_allowed := true;
  ELSE
    SELECT * INTO v_cap FROM public.workforce_capability_profiles WHERE user_id = p_actor_user_id;
    v_allowed := FOUND
      AND v_cap.reviewer_eligible = true
      AND 'content_recruitment_review' = ANY(coalesce(v_cap.reviewer_qualifications, '{}'::text[]));
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Content recruitment reviewer permission required.';
  END IF;

  SELECT * INTO v_app FROM public.applicants WHERE id = p_applicant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.'; END IF;
  SELECT * INTO v_job FROM public.career_jobs WHERE id = v_app.career_job_id;
  IF NOT FOUND OR v_job.application_type <> 'content_writer' THEN
    RAISE EXCEPTION 'This asset is not part of Content Writer recruitment.';
  END IF;

  CASE lower(btrim(coalesce(p_asset_type, '')))
    WHEN 'cv' THEN v_path := v_app.cv_storage_path;
    WHEN 'video' THEN v_path := v_app.video_storage_path;
    ELSE RAISE EXCEPTION 'Asset type must be cv or video.';
  END CASE;

  IF coalesce(btrim(v_path), '') = '' THEN
    RAISE EXCEPTION 'Requested recruitment asset is not available.';
  END IF;
  IF v_path !~ '^applications/[A-Za-z0-9._/-]+$' OR position('..' in v_path) > 0 THEN
    RAISE EXCEPTION 'Stored recruitment asset path is invalid.';
  END IF;

  INSERT INTO public.applicant_events(
    applicant_id, category, event_type, title, detail, actor_type, actor_user_id, source_table, source_id, metadata
  ) VALUES (
    p_applicant_id,
    'Recruitment',
    'Private Asset Access Authorized',
    CASE lower(p_asset_type) WHEN 'cv' THEN 'Secure CV access authorized' ELSE 'Secure introduction video access authorized' END,
    'A short-lived private recruitment asset link was authorized for an approved reviewer.',
    CASE WHEN v_actor.role = 'admin' THEN 'Admin' ELSE 'Content Reviewer' END,
    p_actor_user_id,
    'applicants',
    p_applicant_id,
    jsonb_build_object(
      'assetType', lower(p_asset_type),
      'ipHash', left(coalesce(p_ip_hash, ''), 128),
      'userAgent', left(coalesce(p_user_agent, ''), 500),
      'expiresInSeconds', 600
    )
  );

  RETURN jsonb_build_object(
    'authorized', true,
    'applicantId', p_applicant_id,
    'assetType', lower(p_asset_type),
    'path', v_path,
    'expiresInSeconds', 600
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.service_authorize_recruitment_asset_access(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_authorize_recruitment_asset_access(uuid, uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.service_authorize_recruitment_asset_access(uuid, uuid, text, text, text) TO service_role;

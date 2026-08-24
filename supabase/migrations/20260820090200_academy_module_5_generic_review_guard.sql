-- Module 5 must be graded through admin_review_lead_research_assignment so that
-- the 100-point rubric and critical-integrity rules cannot be bypassed.

CREATE OR REPLACE FUNCTION public.admin_review_training_progress(p_progress_id uuid,p_status text,p_feedback text DEFAULT '',p_score integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_progress public.user_training_progress%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_score integer;
  v_missing_prior integer;
  v_submission_count integer;
  v_submission jsonb;
  v_exam_score integer;
  v_event_time timestamptz := clock_timestamp();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: only an active Admin may review training submissions.'; END IF;
  IF p_status NOT IN ('Passed','Retry Required') THEN RAISE EXCEPTION 'Training review status must be Passed or Retry Required.'; END IF;

  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training progress record not found.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training module is missing or inactive.'; END IF;
  IF v_module.requires_admin_review IS NOT TRUE THEN RAISE EXCEPTION 'This module does not require an Admin review.'; END IF;
  IF v_module.slug='lead-research' THEN RAISE EXCEPTION 'Use the dedicated Lead Research rubric review workflow for Module 5.'; END IF;
  IF p_status='Passed' AND v_progress.status<>'Submitted' THEN RAISE EXCEPTION 'The trainee must submit or resubmit this module before it can be passed.'; END IF;

  SELECT count(*) INTO v_submission_count FROM public.training_assignments WHERE progress_id=v_progress.id AND user_id=v_progress.user_id AND module_id=v_progress.module_id;
  SELECT submission_data INTO v_submission FROM public.training_assignments WHERE progress_id=v_progress.id AND user_id=v_progress.user_id AND module_id=v_progress.module_id ORDER BY created_at DESC,id DESC LIMIT 1;

  IF v_module.slug IN ('loom-outreach','mock-call-test','crm-training','final-certification') AND v_submission_count=0 THEN
    RAISE EXCEPTION 'A trainee submission is required before this module can be reviewed.';
  END IF;
  IF p_status='Passed' AND v_module.slug='loom-outreach' THEN
    IF COALESCE(v_submission->>'type','')<>'loom_outreach' OR COALESCE(v_submission->>'loomUrl','') !~* '^https?://(www\.)?loom\.com/(share|v)/' THEN
      RAISE EXCEPTION 'A valid Loom share URL is required before Admin Pass.';
    END IF;
  END IF;
  IF p_status='Passed' AND v_module.slug='mock-call-test' THEN
    IF COALESCE(v_submission->>'type','')<>'mock_sales_call' OR COALESCE(v_submission->>'mode','') NOT IN ('live','recording') THEN
      RAISE EXCEPTION 'A valid live or recorded mock sales call submission is required.';
    END IF;
    IF COALESCE(v_submission->>'mode','')='recording' AND COALESCE(trim(v_submission->>'videoUrl'),'')='' THEN
      RAISE EXCEPTION 'Recorded mock sales calls require a recording URL.';
    END IF;
  END IF;
  IF p_status='Passed' AND v_module.slug='crm-training' AND COALESCE(v_submission->>'type','')<>'crm_practical' THEN
    RAISE EXCEPTION 'A CRM practical submission is required before Admin Pass.';
  END IF;

  IF v_module.slug='final-certification' THEN
    IF COALESCE(v_submission->>'type','')<>'final_certification_exam' OR jsonb_typeof(v_submission->'answers') IS DISTINCT FROM 'array' OR jsonb_array_length(v_submission->'answers')<>15 THEN
      RAISE EXCEPTION 'A server-scored 15-question Final Certification submission is required.';
    END IF;
    BEGIN v_exam_score := (v_submission->>'score')::integer; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Final Certification server score is missing or invalid.'; END;
    v_score := v_exam_score;
  ELSE
    v_score := COALESCE(p_score,CASE WHEN p_status='Passed' THEN 100 ELSE 50 END);
  END IF;

  IF v_score<0 OR v_score>100 THEN RAISE EXCEPTION 'Training review score must be between 0 and 100.'; END IF;
  IF p_status='Passed' AND v_module.passing_score IS NOT NULL AND v_score<v_module.passing_score THEN RAISE EXCEPTION 'A score of at least % is required to pass this module.',v_module.passing_score; END IF;

  IF v_module.slug='final-certification' AND p_status='Passed' THEN
    SELECT count(*) INTO v_missing_prior
    FROM public.training_modules m
    WHERE m.active=true AND m.required=true AND m.sort_order<v_module.sort_order
      AND NOT EXISTS (
        SELECT 1 FROM public.user_training_progress p
        WHERE p.user_id=v_progress.user_id AND p.module_id=m.id
          AND p.status IN ('Passed','Completed')
          AND (m.passing_score IS NULL OR COALESCE(p.score,0)>=m.passing_score)
      );
    IF v_missing_prior>0 THEN RAISE EXCEPTION 'Final Certification cannot pass until all previous required modules are complete. Missing: %',v_missing_prior; END IF;
  END IF;

  INSERT INTO public.training_reviews(progress_id,reviewer_id,status,feedback,score,created_at)
  VALUES(v_progress.id,auth.uid(),p_status,COALESCE(p_feedback,''),v_score,v_event_time);

  UPDATE public.user_training_progress
  SET status=CASE WHEN p_status='Passed' THEN 'Passed' ELSE 'Retry Required' END,
      review_status=p_status,reviewed_by=auth.uid(),reviewed_at=v_event_time,
      feedback=COALESCE(p_feedback,''),score=v_score,
      progress_percent=CASE WHEN p_status='Passed' THEN 100 ELSE 50 END,
      completed_at=CASE WHEN p_status='Passed' THEN v_event_time ELSE NULL END,
      updated_at=v_event_time
  WHERE id=v_progress.id;
END;
$function$;

-- Atomic Admin review for practical Academy modules.
CREATE OR REPLACE FUNCTION public.admin_review_training_progress(
  p_progress_id uuid,
  p_status text,
  p_feedback text DEFAULT '',
  p_score integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_progress public.user_training_progress%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_score integer;
  v_missing_prior integer;
  v_submission_count integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: only an active Admin may review training submissions.'; END IF;
  IF p_status NOT IN ('Passed','Retry Required') THEN RAISE EXCEPTION 'Training review status must be Passed or Retry Required.'; END IF;

  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training progress record not found.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training module is missing or inactive.'; END IF;
  IF v_module.requires_admin_review IS NOT TRUE THEN RAISE EXCEPTION 'This module does not require an Admin review.'; END IF;

  v_score:=COALESCE(p_score,CASE WHEN p_status='Passed' THEN 100 ELSE 50 END);
  IF v_score<0 OR v_score>100 THEN RAISE EXCEPTION 'Training review score must be between 0 and 100.'; END IF;
  IF p_status='Passed' AND v_module.passing_score IS NOT NULL AND v_score<v_module.passing_score THEN RAISE EXCEPTION 'A score of at least % is required to pass this module.',v_module.passing_score; END IF;

  SELECT count(*) INTO v_submission_count FROM public.training_assignments WHERE progress_id=v_progress.id AND user_id=v_progress.user_id AND module_id=v_progress.module_id;
  IF v_module.slug IN ('lead-research','loom-outreach','mock-call-test','crm-training','final-certification') AND v_submission_count=0 THEN RAISE EXCEPTION 'A trainee submission is required before this module can be reviewed.'; END IF;

  IF v_module.slug='final-certification' AND p_status='Passed' THEN
    SELECT count(*) INTO v_missing_prior FROM public.training_modules m
    WHERE m.active=true AND m.required=true AND m.sort_order<v_module.sort_order
      AND NOT EXISTS(SELECT 1 FROM public.user_training_progress p WHERE p.user_id=v_progress.user_id AND p.module_id=m.id AND p.status IN ('Passed','Completed') AND (m.passing_score IS NULL OR COALESCE(p.score,0)>=m.passing_score));
    IF v_missing_prior>0 THEN RAISE EXCEPTION 'Final Certification cannot pass until all previous required modules are complete. Missing: %',v_missing_prior; END IF;
  END IF;

  INSERT INTO public.training_reviews(progress_id,reviewer_id,status,feedback,score)
  VALUES(v_progress.id,auth.uid(),p_status,COALESCE(p_feedback,''),v_score);

  UPDATE public.user_training_progress
  SET status=CASE WHEN p_status='Passed' THEN 'Passed' ELSE 'Retry Required' END,
      review_status=p_status,reviewed_by=auth.uid(),reviewed_at=now(),feedback=COALESCE(p_feedback,''),score=v_score,
      progress_percent=CASE WHEN p_status='Passed' THEN 100 ELSE 50 END,
      completed_at=CASE WHEN p_status='Passed' THEN now() ELSE NULL END,updated_at=now()
  WHERE id=v_progress.id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_training_progress(uuid,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_review_training_progress(uuid,text,text,integer) TO authenticated;

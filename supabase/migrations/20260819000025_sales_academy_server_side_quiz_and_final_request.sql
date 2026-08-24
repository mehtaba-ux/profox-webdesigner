-- Sales Academy QA hardening: make scored exams authoritative in Postgres,
-- validate practical submissions at Admin review, and provide a safe trainee
-- request transition into Final Approval without granting approval/activation.

CREATE OR REPLACE FUNCTION public.protect_training_progress_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_module public.training_modules%ROWTYPE;
  v_quiz_rpc text := COALESCE(current_setting('profox.training_quiz_rpc', true), '');
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Training progress may only be changed by its owner or an Admin.';
  END IF;

  SELECT * INTO v_module FROM public.training_modules WHERE id=NEW.module_id;
  IF NOT FOUND OR v_module.active IS NOT TRUE THEN
    RAISE EXCEPTION 'Training module is missing or inactive.';
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_status IS NOT NULL OR COALESCE(trim(NEW.feedback),'')<>'' THEN
      RAISE EXCEPTION 'Training review fields are Admin-only.';
    END IF;
    IF NEW.score IS NOT NULL AND v_quiz_rpc<>'1' THEN
      RAISE EXCEPTION 'Training scores must be recorded through the secure quiz/review workflow.';
    END IF;
    IF v_module.requires_admin_review AND NEW.status IN ('Passed','Completed','Retry Required') THEN
      RAISE EXCEPTION 'This module requires Admin review before it can be passed.';
    END IF;
  ELSE
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.module_id IS DISTINCT FROM OLD.module_id THEN
      RAISE EXCEPTION 'Training progress ownership and module are immutable.';
    END IF;
    IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_status IS DISTINCT FROM OLD.review_status
       OR NEW.feedback IS DISTINCT FROM OLD.feedback THEN
      RAISE EXCEPTION 'Training review fields are Admin-only.';
    END IF;
    IF NEW.score IS DISTINCT FROM OLD.score AND v_quiz_rpc<>'1' THEN
      RAISE EXCEPTION 'Training scores must be recorded through the secure quiz/review workflow.';
    END IF;
    IF v_module.requires_admin_review AND NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status THEN
      RAISE EXCEPTION 'This module requires Admin review before it can be passed.';
    END IF;
    IF v_module.slug='product-training'
       AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.score IS DISTINCT FROM OLD.score)
       AND NEW.status IN ('Passed','Retry Required','Completed')
       AND v_quiz_rpc<>'1' THEN
      RAISE EXCEPTION 'Product quiz results must be recorded through the secure quiz workflow.';
    END IF;
  END IF;

  IF v_module.requires_admin_review AND NEW.status NOT IN ('Not Started','In Progress','Submitted','Retry Required') THEN
    RAISE EXCEPTION 'Reviewed modules may only be submitted by trainees; pass/fail is Admin-controlled.';
  END IF;

  IF NOT v_module.requires_admin_review
     AND NEW.status IN ('Passed','Completed')
     AND v_module.passing_score IS NOT NULL
     AND COALESCE(NEW.score,0) < v_module.passing_score THEN
    RAISE EXCEPTION 'Passing score of % is required for this module.',v_module.passing_score;
  END IF;

  NEW.progress_percent := GREATEST(0,LEAST(COALESCE(NEW.progress_percent,0),100));
  NEW.attempts := GREATEST(COALESCE(NEW.attempts,0),0);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_sales_academy_quiz(
  p_progress_id uuid,
  p_answers integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_progress public.user_training_progress%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_expected integer[];
  v_required_count integer;
  v_correct integer := 0;
  v_score integer;
  v_index integer;
  v_missing_prior integer;
  v_passed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;

  SELECT * INTO v_progress
  FROM public.user_training_progress
  WHERE id=p_progress_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training progress record not found.'; END IF;
  IF v_progress.user_id<>auth.uid() THEN RAISE EXCEPTION 'You may only submit your own training quiz.'; END IF;

  SELECT * INTO v_module
  FROM public.training_modules
  WHERE id=v_progress.module_id AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training module is missing or inactive.'; END IF;

  IF v_module.slug='product-training' THEN
    v_expected := ARRAY[1,2,2,1,1];
    v_required_count := 5;
  ELSIF v_module.slug='final-certification' THEN
    v_expected := ARRAY[0,1,1,2,2,0,0,0,1,2,1,2,2,0,1];
    v_required_count := 15;
  ELSE
    RAISE EXCEPTION 'This module does not use the secure Sales Academy quiz workflow.';
  END IF;

  IF COALESCE(array_length(p_answers,1),0)<>v_required_count THEN
    RAISE EXCEPTION 'Exactly % quiz answers are required.',v_required_count;
  END IF;

  FOR v_index IN 1..v_required_count LOOP
    IF p_answers[v_index]=v_expected[v_index] THEN v_correct:=v_correct+1; END IF;
  END LOOP;
  v_score := round((v_correct::numeric * 100) / v_required_count)::integer;
  v_passed := v_score >= COALESCE(v_module.passing_score,80);

  IF v_module.slug='final-certification' AND v_passed THEN
    SELECT count(*) INTO v_missing_prior
    FROM public.training_modules m
    WHERE m.active=true AND m.required=true AND m.sort_order<v_module.sort_order
      AND NOT EXISTS (
        SELECT 1 FROM public.user_training_progress p
        WHERE p.user_id=v_progress.user_id AND p.module_id=m.id
          AND p.status IN ('Passed','Completed')
          AND (m.passing_score IS NULL OR COALESCE(p.score,0)>=m.passing_score)
      );
    IF v_missing_prior>0 THEN
      RAISE EXCEPTION 'Final Certification cannot be submitted until all previous required modules are complete. Missing: %',v_missing_prior;
    END IF;
  END IF;

  PERFORM set_config('profox.training_quiz_rpc','1',true);

  INSERT INTO public.training_assignments(user_id,module_id,progress_id,submission_data)
  VALUES(
    v_progress.user_id,
    v_progress.module_id,
    v_progress.id,
    jsonb_build_object(
      'type', CASE WHEN v_module.slug='final-certification' THEN 'final_certification_exam' ELSE 'product_quiz' END,
      'answers', to_jsonb(p_answers),
      'score', v_score,
      'passed', v_passed,
      'submittedAt', now()
    )
  );

  UPDATE public.user_training_progress
  SET status = CASE
        WHEN v_module.requires_admin_review AND v_passed THEN 'Submitted'
        WHEN v_passed THEN 'Passed'
        ELSE 'Retry Required'
      END,
      score=v_score,
      progress_percent=CASE WHEN v_passed THEN 100 ELSE 50 END,
      attempts=GREATEST(COALESCE(attempts,0),0)+1,
      completed_at=CASE WHEN NOT v_module.requires_admin_review AND v_passed THEN now() ELSE NULL END,
      updated_at=now()
  WHERE id=v_progress.id;

  RETURN jsonb_build_object(
    'score',v_score,
    'passed',v_passed,
    'status',CASE
      WHEN v_module.requires_admin_review AND v_passed THEN 'Submitted'
      WHEN v_passed THEN 'Passed'
      ELSE 'Retry Required'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_sales_academy_quiz(uuid,integer[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_sales_academy_quiz(uuid,integer[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_training_progress(
  p_progress_id uuid,
  p_status text,
  p_feedback text DEFAULT '',
  p_score integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_progress public.user_training_progress%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_score integer;
  v_missing_prior integer;
  v_submission_count integer;
  v_submission jsonb;
  v_exam_score integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only an active Admin may review training submissions.';
  END IF;
  IF p_status NOT IN ('Passed','Retry Required') THEN
    RAISE EXCEPTION 'Training review status must be Passed or Retry Required.';
  END IF;

  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training progress record not found.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training module is missing or inactive.'; END IF;
  IF v_module.requires_admin_review IS NOT TRUE THEN
    RAISE EXCEPTION 'This module does not require an Admin review.';
  END IF;
  IF p_status='Passed' AND v_progress.status<>'Submitted' THEN
    RAISE EXCEPTION 'The trainee must submit or resubmit this module before it can be passed.';
  END IF;

  SELECT count(*) INTO v_submission_count
  FROM public.training_assignments
  WHERE progress_id=v_progress.id AND user_id=v_progress.user_id AND module_id=v_progress.module_id;

  SELECT submission_data INTO v_submission
  FROM public.training_assignments
  WHERE progress_id=v_progress.id AND user_id=v_progress.user_id AND module_id=v_progress.module_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_module.slug IN ('lead-research','loom-outreach','mock-call-test','crm-training','final-certification')
     AND v_submission_count=0 THEN
    RAISE EXCEPTION 'A trainee submission is required before this module can be reviewed.';
  END IF;

  IF p_status='Passed' AND v_module.slug='lead-research' THEN
    IF COALESCE(v_submission->>'type','')<>'lead_research'
       OR jsonb_typeof(v_submission->'prospects') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_submission->'prospects')<>5 THEN
      RAISE EXCEPTION 'Lead Research requires exactly 5 prospect records before Admin Pass.';
    END IF;
  END IF;

  IF p_status='Passed' AND v_module.slug='loom-outreach' THEN
    IF COALESCE(v_submission->>'type','')<>'loom_outreach'
       OR COALESCE(v_submission->>'loomUrl','') !~* '^https?://(www\.)?loom\.com/(share|v)/' THEN
      RAISE EXCEPTION 'A valid Loom share URL is required before Admin Pass.';
    END IF;
  END IF;

  IF p_status='Passed' AND v_module.slug='mock-call-test' THEN
    IF COALESCE(v_submission->>'type','')<>'mock_sales_call'
       OR COALESCE(v_submission->>'mode','') NOT IN ('live','recording') THEN
      RAISE EXCEPTION 'A valid live or recorded mock sales call submission is required.';
    END IF;
    IF COALESCE(v_submission->>'mode','')='recording' AND COALESCE(trim(v_submission->>'videoUrl'),'')='' THEN
      RAISE EXCEPTION 'Recorded mock sales calls require a recording URL.';
    END IF;
  END IF;

  IF p_status='Passed' AND v_module.slug='crm-training' THEN
    IF COALESCE(v_submission->>'type','')<>'crm_practical' THEN
      RAISE EXCEPTION 'A CRM practical submission is required before Admin Pass.';
    END IF;
  END IF;

  IF v_module.slug='final-certification' THEN
    IF COALESCE(v_submission->>'type','')<>'final_certification_exam'
       OR jsonb_typeof(v_submission->'answers') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_submission->'answers')<>15 THEN
      RAISE EXCEPTION 'A server-scored 15-question Final Certification submission is required.';
    END IF;
    BEGIN
      v_exam_score := (v_submission->>'score')::integer;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Final Certification server score is missing or invalid.';
    END;
    v_score := v_exam_score;
  ELSE
    v_score := COALESCE(p_score, CASE WHEN p_status='Passed' THEN 100 ELSE 50 END);
  END IF;

  IF v_score<0 OR v_score>100 THEN RAISE EXCEPTION 'Training review score must be between 0 and 100.'; END IF;
  IF p_status='Passed' AND v_module.passing_score IS NOT NULL AND v_score<v_module.passing_score THEN
    RAISE EXCEPTION 'A score of at least % is required to pass this module.',v_module.passing_score;
  END IF;

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
    IF v_missing_prior>0 THEN
      RAISE EXCEPTION 'Final Certification cannot pass until all previous required modules are complete. Missing: %',v_missing_prior;
    END IF;
  END IF;

  INSERT INTO public.training_reviews(progress_id,reviewer_id,status,feedback,score)
  VALUES(v_progress.id,auth.uid(),p_status,COALESCE(p_feedback,''),v_score);

  UPDATE public.user_training_progress
  SET status=CASE WHEN p_status='Passed' THEN 'Passed' ELSE 'Retry Required' END,
      review_status=p_status,
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      feedback=COALESCE(p_feedback,''),
      score=v_score,
      progress_percent=CASE WHEN p_status='Passed' THEN 100 ELSE 50 END,
      completed_at=CASE WHEN p_status='Passed' THEN now() ELSE NULL END,
      updated_at=now()
  WHERE id=v_progress.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_training_progress(uuid,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_review_training_progress(uuid,text,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_sales_final_approval()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_app public.applicants%ROWTYPE;
  v_final public.user_training_progress%ROWTYPE;
  v_final_module public.training_modules%ROWTYPE;
  v_missing_prior integer;
  v_missing_prior_reviews integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;

  SELECT * INTO v_app
  FROM public.applicants
  WHERE linked_user_id=auth.uid()
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linked sales candidate record not found.'; END IF;
  IF v_app.stage='Final Approval' THEN RETURN; END IF;
  IF v_app.stage<>'One-Day Training' THEN
    RAISE EXCEPTION 'Candidate must be in One-Day Training before requesting Final Approval.';
  END IF;
  IF lower(COALESCE(v_app.agreement_status,''))<>'signed' THEN
    RAISE EXCEPTION 'Signed sales agreement is required.';
  END IF;

  SELECT * INTO v_final_module
  FROM public.training_modules
  WHERE slug='final-certification' AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Final Certification module is unavailable.'; END IF;

  SELECT * INTO v_final
  FROM public.user_training_progress
  WHERE user_id=auth.uid() AND module_id=v_final_module.id
  FOR UPDATE;
  IF NOT FOUND OR v_final.status<>'Submitted' OR COALESCE(v_final.score,0)<COALESCE(v_final_module.passing_score,80) THEN
    RAISE EXCEPTION 'Pass and submit the server-scored Final Certification exam before requesting Final Approval.';
  END IF;

  SELECT count(*) INTO v_missing_prior
  FROM public.training_modules m
  WHERE m.active=true AND m.required=true AND m.sort_order<v_final_module.sort_order
    AND NOT EXISTS (
      SELECT 1 FROM public.user_training_progress p
      WHERE p.user_id=auth.uid() AND p.module_id=m.id
        AND p.status IN ('Passed','Completed')
        AND (m.passing_score IS NULL OR COALESCE(p.score,0)>=m.passing_score)
    );
  IF v_missing_prior>0 THEN
    RAISE EXCEPTION 'All previous required modules must be complete before Final Approval. Missing: %',v_missing_prior;
  END IF;

  SELECT count(*) INTO v_missing_prior_reviews
  FROM public.training_modules m
  WHERE m.active=true AND m.requires_admin_review=true AND m.sort_order<v_final_module.sort_order
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_training_progress p
      JOIN LATERAL (
        SELECT tr.status,tr.reviewer_id
        FROM public.training_reviews tr
        WHERE tr.progress_id=p.id
        ORDER BY tr.created_at DESC
        LIMIT 1
      ) r ON true
      WHERE p.user_id=auth.uid() AND p.module_id=m.id
        AND p.status='Passed' AND r.status='Passed' AND r.reviewer_id IS NOT NULL
    );
  IF v_missing_prior_reviews>0 THEN
    RAISE EXCEPTION 'All prior Admin-reviewed practical gates must be passed before Final Approval. Missing: %',v_missing_prior_reviews;
  END IF;

  UPDATE public.applicants
  SET stage='Final Approval',onboarding_status='in_progress',onboarding_progress=100,updated_at=now()
  WHERE id=v_app.id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_sales_final_approval() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_sales_final_approval() TO authenticated;

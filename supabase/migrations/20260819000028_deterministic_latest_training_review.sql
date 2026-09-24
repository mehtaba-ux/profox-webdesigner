-- Review history may contain rows with identical timestamps (batch imports/tests).
-- Use the review UUID as a deterministic tie-breaker everywhere a latest review
-- controls final approval or activation.
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
  SELECT * INTO v_app FROM public.applicants WHERE linked_user_id=auth.uid() ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linked sales candidate record not found.'; END IF;
  IF v_app.stage='Final Approval' THEN RETURN; END IF;
  IF v_app.stage<>'One-Day Training' THEN RAISE EXCEPTION 'Candidate must be in One-Day Training before requesting Final Approval.'; END IF;
  IF lower(COALESCE(v_app.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'Signed sales agreement is required.'; END IF;

  SELECT * INTO v_final_module FROM public.training_modules WHERE slug='final-certification' AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Final Certification module is unavailable.'; END IF;
  SELECT * INTO v_final FROM public.user_training_progress WHERE user_id=auth.uid() AND module_id=v_final_module.id FOR UPDATE;
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
  IF v_missing_prior>0 THEN RAISE EXCEPTION 'All previous required modules must be complete before Final Approval. Missing: %',v_missing_prior; END IF;

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
        ORDER BY tr.created_at DESC,tr.id DESC
        LIMIT 1
      ) r ON true
      WHERE p.user_id=auth.uid() AND p.module_id=m.id
        AND p.status='Passed' AND r.status='Passed' AND r.reviewer_id IS NOT NULL
    );
  IF v_missing_prior_reviews>0 THEN RAISE EXCEPTION 'All prior Admin-reviewed practical gates must be passed before Final Approval. Missing: %',v_missing_prior_reviews; END IF;

  UPDATE public.applicants SET stage='Final Approval',onboarding_status='in_progress',onboarding_progress=100,updated_at=now() WHERE id=v_app.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_sales_candidate_final(p_applicant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_app public.applicants%ROWTYPE;
  v_missing_required integer;
  v_missing_reviews integer;
  v_final_ok boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: only an active Admin may grant final approval.'; END IF;
  SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.'; END IF;
  IF v_app.linked_user_id IS NULL THEN RAISE EXCEPTION 'Candidate account must be linked before final approval.'; END IF;
  IF lower(COALESCE(v_app.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'Signed sales agreement is required.'; END IF;
  IF v_app.stage NOT IN ('One-Day Training','Final Approval','Ready for System Access') THEN RAISE EXCEPTION 'Candidate must be in the training/final approval stage.'; END IF;

  SELECT count(*) INTO v_missing_required
  FROM public.training_modules m
  WHERE m.active=true AND m.required=true
    AND NOT EXISTS (
      SELECT 1 FROM public.user_training_progress p
      WHERE p.user_id=v_app.linked_user_id AND p.module_id=m.id
        AND p.status IN ('Passed','Completed')
        AND (m.passing_score IS NULL OR COALESCE(p.score,0)>=m.passing_score)
    );
  IF v_missing_required>0 THEN RAISE EXCEPTION 'All required Sales Academy modules must be passed before final approval. Missing: %',v_missing_required; END IF;

  SELECT count(*) INTO v_missing_reviews
  FROM public.training_modules m
  WHERE m.active=true AND m.requires_admin_review=true
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_training_progress p
      JOIN LATERAL (
        SELECT tr.status,tr.score,tr.reviewer_id
        FROM public.training_reviews tr
        WHERE tr.progress_id=p.id
        ORDER BY tr.created_at DESC,tr.id DESC
        LIMIT 1
      ) r ON true
      WHERE p.user_id=v_app.linked_user_id
        AND p.module_id=m.id
        AND p.status='Passed'
        AND r.status='Passed'
        AND r.reviewer_id IS NOT NULL
        AND (m.passing_score IS NULL OR COALESCE(r.score,0)>=m.passing_score)
    );
  IF v_missing_reviews>0 THEN RAISE EXCEPTION 'All Admin-reviewed training gates must pass before final approval. Missing: %',v_missing_reviews; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.training_modules m
    JOIN public.user_training_progress p ON p.module_id=m.id
    JOIN LATERAL (
      SELECT tr.status,tr.score,tr.reviewer_id
      FROM public.training_reviews tr
      WHERE tr.progress_id=p.id
      ORDER BY tr.created_at DESC,tr.id DESC
      LIMIT 1
    ) r ON true
    WHERE m.slug='final-certification' AND m.active=true
      AND p.user_id=v_app.linked_user_id
      AND p.status='Passed'
      AND r.status='Passed'
      AND COALESCE(r.score,0)>=80
      AND r.reviewer_id IS NOT NULL
  ) INTO v_final_ok;
  IF NOT v_final_ok THEN RAISE EXCEPTION 'Final Certification must score at least 80%% and receive Admin Pass.'; END IF;

  PERFORM set_config('profox.final_approval_rpc','1',true);
  UPDATE public.applicants SET final_approval=true,stage='Ready for System Access',onboarding_status='in_progress',onboarding_progress=100,updated_at=now() WHERE id=p_applicant_id;
  UPDATE public.user_profiles SET onboarding_progress=100,onboarding_status='in_progress',status='onboarding',updated_at=now() WHERE id=v_app.linked_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_salesperson(target_user_id uuid,admin_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_app public.applicants%ROWTYPE;
  v_missing_required integer;
  v_missing_reviews integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: only an active Admin may activate a salesperson.'; END IF;
  SELECT * INTO v_app FROM public.applicants WHERE linked_user_id=target_user_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate record not found for the linked account.'; END IF;
  IF v_app.stage='Activated' AND EXISTS(SELECT 1 FROM public.user_profiles WHERE id=target_user_id AND role='sales' AND status='active') THEN RETURN; END IF;
  IF v_app.stage<>'Ready for System Access' THEN RAISE EXCEPTION 'Candidate must reach Ready for System Access before activation.'; END IF;
  IF lower(COALESCE(v_app.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'Signed sales agreement is required before activation.'; END IF;
  IF COALESCE(v_app.final_approval,false) IS NOT TRUE THEN RAISE EXCEPTION 'Final Admin approval is required before activation.'; END IF;

  SELECT count(*) INTO v_missing_required
  FROM public.training_modules m
  WHERE m.active=true AND m.required=true
    AND NOT EXISTS (
      SELECT 1 FROM public.user_training_progress p
      WHERE p.user_id=target_user_id AND p.module_id=m.id
        AND p.status IN ('Passed','Completed')
        AND (m.passing_score IS NULL OR COALESCE(p.score,0)>=m.passing_score)
    );
  IF v_missing_required>0 THEN RAISE EXCEPTION 'All required Sales Academy modules must be completed before activation. Missing: %',v_missing_required; END IF;

  SELECT count(*) INTO v_missing_reviews
  FROM public.training_modules m
  WHERE m.active=true AND m.requires_admin_review=true
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_training_progress p
      JOIN LATERAL (
        SELECT tr.status,tr.score,tr.reviewer_id
        FROM public.training_reviews tr
        WHERE tr.progress_id=p.id
        ORDER BY tr.created_at DESC,tr.id DESC
        LIMIT 1
      ) r ON true
      WHERE p.user_id=target_user_id AND p.module_id=m.id
        AND p.status='Passed' AND r.status='Passed' AND r.reviewer_id IS NOT NULL
        AND (m.passing_score IS NULL OR COALESCE(r.score,0)>=m.passing_score)
    );
  IF v_missing_reviews>0 THEN RAISE EXCEPTION 'All Admin-reviewed training gates must be passed before activation. Missing: %',v_missing_reviews; END IF;

  PERFORM set_config('profox.sales_activation_rpc','1',true);
  UPDATE public.user_profiles SET role='sales',department='Sales',status='active',onboarding_status='completed',onboarding_progress=100,updated_at=now() WHERE id=target_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linked user profile not found.'; END IF;
  UPDATE public.applicants SET stage='Activated',onboarding_status='completed',onboarding_progress=100,updated_at=now() WHERE id=v_app.id;
END;
$$;

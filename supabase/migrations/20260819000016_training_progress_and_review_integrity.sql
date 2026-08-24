-- Sales Academy progress and review integrity.
-- Trainees can manage only their own progress and cannot self-approve reviewed modules.

UPDATE public.training_modules SET passing_score=80,updated_at=now() WHERE slug='product-training';
UPDATE public.training_modules SET passing_score=NULL,updated_at=now() WHERE slug='confidentiality-data-protection';

CREATE OR REPLACE FUNCTION public.protect_training_progress_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_module public.training_modules%ROWTYPE;
BEGIN
 IF public.is_admin() THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Training progress may only be changed by its owner or an Admin.'; END IF;
 SELECT * INTO v_module FROM public.training_modules WHERE id=NEW.module_id;
 IF NOT FOUND OR v_module.active IS NOT TRUE THEN RAISE EXCEPTION 'Training module is missing or inactive.'; END IF;

 IF TG_OP='INSERT' THEN
   IF NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_status IS NOT NULL OR COALESCE(trim(NEW.feedback),'')<>'' THEN RAISE EXCEPTION 'Training review fields are Admin-only.'; END IF;
   IF v_module.requires_admin_review AND NEW.status IN ('Passed','Completed','Retry Required') THEN RAISE EXCEPTION 'This module requires Admin review before it can be passed.'; END IF;
 ELSE
   IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.module_id IS DISTINCT FROM OLD.module_id THEN RAISE EXCEPTION 'Training progress ownership and module are immutable.'; END IF;
   IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.review_status IS DISTINCT FROM OLD.review_status OR NEW.feedback IS DISTINCT FROM OLD.feedback THEN RAISE EXCEPTION 'Training review fields are Admin-only.'; END IF;
   IF v_module.requires_admin_review AND NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status THEN RAISE EXCEPTION 'This module requires Admin review before it can be passed.'; END IF;
 END IF;

 IF v_module.requires_admin_review AND NEW.status NOT IN ('Not Started','In Progress','Submitted','Retry Required') THEN RAISE EXCEPTION 'Reviewed modules may only be submitted by trainees; pass/fail is Admin-controlled.'; END IF;
 IF NOT v_module.requires_admin_review AND NEW.status IN ('Passed','Completed') AND v_module.passing_score IS NOT NULL AND COALESCE(NEW.score,0)<v_module.passing_score THEN RAISE EXCEPTION 'Passing score of % is required for this module.',v_module.passing_score; END IF;
 NEW.progress_percent:=GREATEST(0,LEAST(COALESCE(NEW.progress_percent,0),100));
 NEW.attempts:=GREATEST(COALESCE(NEW.attempts,0),0);
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_training_review_fields ON public.user_training_progress;
DROP TRIGGER IF EXISTS trg_protect_training_progress_fields ON public.user_training_progress;
CREATE TRIGGER trg_protect_training_progress_fields BEFORE INSERT OR UPDATE ON public.user_training_progress FOR EACH ROW EXECUTE FUNCTION public.protect_training_progress_fields();

CREATE OR REPLACE FUNCTION public.approve_sales_candidate_final(p_applicant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_app public.applicants%ROWTYPE; v_missing_required integer; v_missing_reviews integer; v_final_ok boolean;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: only an active Admin may grant final approval.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.'; END IF;
 IF v_app.linked_user_id IS NULL THEN RAISE EXCEPTION 'Candidate account must be linked before final approval.'; END IF;
 IF lower(COALESCE(v_app.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'Signed sales agreement is required.'; END IF;
 IF v_app.stage NOT IN ('One-Day Training','Final Approval','Ready for System Access') THEN RAISE EXCEPTION 'Candidate must be in the training/final approval stage.'; END IF;
 SELECT count(*) INTO v_missing_required FROM public.training_modules m WHERE m.active=true AND m.required=true AND NOT EXISTS(SELECT 1 FROM public.user_training_progress p WHERE p.user_id=v_app.linked_user_id AND p.module_id=m.id AND p.status IN ('Passed','Completed') AND (m.passing_score IS NULL OR COALESCE(p.score,0)>=m.passing_score));
 IF v_missing_required>0 THEN RAISE EXCEPTION 'All required Sales Academy modules must be passed before final approval. Missing: %',v_missing_required; END IF;
 SELECT count(*) INTO v_missing_reviews FROM public.training_modules m WHERE m.active=true AND m.requires_admin_review=true AND NOT EXISTS(
   SELECT 1 FROM public.user_training_progress p
   JOIN LATERAL (SELECT tr.status,tr.score,tr.reviewer_id FROM public.training_reviews tr WHERE tr.progress_id=p.id ORDER BY tr.created_at DESC LIMIT 1) r ON true
   WHERE p.user_id=v_app.linked_user_id AND p.module_id=m.id AND p.status='Passed' AND r.status='Passed' AND r.reviewer_id IS NOT NULL AND (m.passing_score IS NULL OR COALESCE(r.score,0)>=m.passing_score)
 );
 IF v_missing_reviews>0 THEN RAISE EXCEPTION 'All Admin-reviewed training gates must pass before final approval. Missing: %',v_missing_reviews; END IF;
 SELECT EXISTS(
   SELECT 1 FROM public.training_modules m JOIN public.user_training_progress p ON p.module_id=m.id
   JOIN LATERAL (SELECT tr.status,tr.score,tr.reviewer_id FROM public.training_reviews tr WHERE tr.progress_id=p.id ORDER BY tr.created_at DESC LIMIT 1) r ON true
   WHERE m.slug='final-certification' AND m.active=true AND p.user_id=v_app.linked_user_id AND p.status='Passed' AND r.status='Passed' AND COALESCE(r.score,0)>=80 AND r.reviewer_id IS NOT NULL
 ) INTO v_final_ok;
 IF NOT v_final_ok THEN RAISE EXCEPTION 'Final Certification must score at least 80%% and receive Admin Pass.'; END IF;
 PERFORM set_config('profox.final_approval_rpc','1',true);
 UPDATE public.applicants SET final_approval=true,stage='Ready for System Access',onboarding_status='in_progress',onboarding_progress=100,updated_at=now() WHERE id=p_applicant_id;
 UPDATE public.user_profiles SET onboarding_progress=100,onboarding_status='in_progress',status='onboarding',updated_at=now() WHERE id=v_app.linked_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_salesperson(target_user_id uuid, admin_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_app public.applicants%ROWTYPE; v_missing_required integer; v_missing_reviews integer;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: only an active Admin may activate a salesperson.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE linked_user_id=target_user_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Candidate record not found for the linked account.'; END IF;
 IF v_app.stage='Activated' AND EXISTS(SELECT 1 FROM public.user_profiles WHERE id=target_user_id AND role='sales' AND status='active') THEN RETURN; END IF;
 IF v_app.stage<>'Ready for System Access' THEN RAISE EXCEPTION 'Candidate must reach Ready for System Access before activation.'; END IF;
 IF lower(COALESCE(v_app.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'Signed sales agreement is required before activation.'; END IF;
 IF COALESCE(v_app.final_approval,false) IS NOT TRUE THEN RAISE EXCEPTION 'Final Admin approval is required before activation.'; END IF;
 SELECT count(*) INTO v_missing_required FROM public.training_modules m WHERE m.active=true AND m.required=true AND NOT EXISTS(SELECT 1 FROM public.user_training_progress p WHERE p.user_id=target_user_id AND p.module_id=m.id AND p.status IN ('Passed','Completed') AND (m.passing_score IS NULL OR COALESCE(p.score,0)>=m.passing_score));
 IF v_missing_required>0 THEN RAISE EXCEPTION 'All required Sales Academy modules must be completed before activation. Missing: %',v_missing_required; END IF;
 SELECT count(*) INTO v_missing_reviews FROM public.training_modules m WHERE m.active=true AND m.requires_admin_review=true AND NOT EXISTS(
   SELECT 1 FROM public.user_training_progress p
   JOIN LATERAL (SELECT tr.status,tr.score,tr.reviewer_id FROM public.training_reviews tr WHERE tr.progress_id=p.id ORDER BY tr.created_at DESC LIMIT 1) r ON true
   WHERE p.user_id=target_user_id AND p.module_id=m.id AND p.status='Passed' AND r.status='Passed' AND r.reviewer_id IS NOT NULL AND (m.passing_score IS NULL OR COALESCE(r.score,0)>=m.passing_score)
 );
 IF v_missing_reviews>0 THEN RAISE EXCEPTION 'All Admin-reviewed training gates must be passed before activation. Missing: %',v_missing_reviews; END IF;
 PERFORM set_config('profox.sales_activation_rpc','1',true);
 UPDATE public.user_profiles SET role='sales',department='Sales',status='active',onboarding_status='completed',onboarding_progress=100,updated_at=now() WHERE id=target_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Linked user profile not found.'; END IF;
 UPDATE public.applicants SET stage='Activated',onboarding_status='completed',onboarding_progress=100,updated_at=now() WHERE id=v_app.id;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_training_progress_fields() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_sales_candidate_final(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_salesperson(uuid,uuid) TO authenticated;

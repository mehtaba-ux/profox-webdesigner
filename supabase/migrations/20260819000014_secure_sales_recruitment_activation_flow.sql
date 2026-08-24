-- Secure sales recruitment lifecycle.
-- Account linking starts onboarding only after signed agreement; final approval and activation are server-gated.

CREATE OR REPLACE FUNCTION public.link_sales_candidate_account(p_applicant_id uuid, p_target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_app public.applicants%ROWTYPE; v_profile public.user_profiles%ROWTYPE;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: only an active Admin may link a candidate account.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.'; END IF;
 IF v_app.refusal_reason IS NOT NULL AND trim(v_app.refusal_reason)<>'' THEN RAISE EXCEPTION 'A refused candidate cannot be linked for onboarding.'; END IF;
 IF v_app.stage NOT IN ('Selected','Agreement Pending','One-Day Training','Final Approval','Ready for System Access') THEN RAISE EXCEPTION 'Candidate must be selected before an onboarding account can be linked.'; END IF;
 IF lower(COALESCE(v_app.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'Signed sales agreement is required before training access is granted.'; END IF;
 SELECT * INTO v_profile FROM public.user_profiles WHERE id=p_target_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found.'; END IF;
 IF lower(trim(COALESCE(v_profile.email,'')))<>lower(trim(COALESCE(v_app.email,''))) THEN RAISE EXCEPTION 'Candidate email must exactly match the linked system account.'; END IF;
 IF v_profile.role='admin' THEN RAISE EXCEPTION 'An Admin account cannot be linked as a sales trainee.'; END IF;
 IF EXISTS(SELECT 1 FROM public.applicants a WHERE a.linked_user_id=p_target_user_id AND a.id<>p_applicant_id AND a.stage<>'Activated') THEN RAISE EXCEPTION 'This system account is already linked to another active candidate record.'; END IF;
 UPDATE public.applicants SET linked_user_id=p_target_user_id,stage=CASE WHEN stage IN ('Selected','Agreement Pending') THEN 'One-Day Training' ELSE stage END,onboarding_status=CASE WHEN onboarding_status='completed' THEN onboarding_status ELSE 'in_progress' END,updated_at=now() WHERE id=p_applicant_id;
 UPDATE public.user_profiles SET full_name=COALESCE(NULLIF(trim(v_app.full_name),''),full_name),phone=COALESCE(NULLIF(trim(v_app.phone),''),phone),country=COALESCE(NULLIF(trim(v_app.country),''),country),timezone=COALESCE(NULLIF(trim(v_app.timezone),''),timezone),role='sales',department='Sales',status='onboarding',onboarding_status='in_progress',onboarding_progress=LEAST(COALESCE(onboarding_progress,0),99),updated_at=now() WHERE id=p_target_user_id;
END;
$$;

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
 SELECT count(*) INTO v_missing_reviews FROM public.training_modules m WHERE m.active=true AND m.requires_admin_review=true AND NOT EXISTS(SELECT 1 FROM public.user_training_progress p WHERE p.user_id=v_app.linked_user_id AND p.module_id=m.id AND p.review_status='Passed' AND p.reviewed_by IS NOT NULL AND (m.passing_score IS NULL OR COALESCE(p.score,0)>=m.passing_score));
 IF v_missing_reviews>0 THEN RAISE EXCEPTION 'All Admin-reviewed training gates must pass before final approval. Missing: %',v_missing_reviews; END IF;
 SELECT EXISTS(SELECT 1 FROM public.training_modules m JOIN public.user_training_progress p ON p.module_id=m.id WHERE m.slug='final-certification' AND m.active=true AND p.user_id=v_app.linked_user_id AND p.status IN ('Passed','Completed') AND COALESCE(p.score,0)>=80 AND p.review_status='Passed' AND p.reviewed_by IS NOT NULL) INTO v_final_ok;
 IF NOT v_final_ok THEN RAISE EXCEPTION 'Final Certification must score at least 80%% and receive Admin Pass.'; END IF;
 PERFORM set_config('profox.final_approval_rpc','1',true);
 UPDATE public.applicants SET final_approval=true,stage='Ready for System Access',onboarding_status='in_progress',onboarding_progress=100,updated_at=now() WHERE id=p_applicant_id;
 UPDATE public.user_profiles SET onboarding_progress=100,onboarding_status='in_progress',status='onboarding',updated_at=now() WHERE id=v_app.linked_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_sales_candidate_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_final_rpc text:=COALESCE(current_setting('profox.final_approval_rpc',true),''); v_activation_rpc text:=COALESCE(current_setting('profox.sales_activation_rpc',true),'');
BEGIN
 IF OLD.stage='Activated' AND NEW.stage IS DISTINCT FROM OLD.stage THEN RAISE EXCEPTION 'Activated candidate stage is immutable through direct updates.'; END IF;
 IF (NEW.final_approval IS TRUE AND OLD.final_approval IS DISTINCT FROM TRUE) OR (NEW.stage='Ready for System Access' AND OLD.stage IS DISTINCT FROM NEW.stage) THEN
   IF v_final_rpc<>'1' AND v_activation_rpc<>'1' THEN RAISE EXCEPTION 'Final approval must use the secure final-approval workflow.'; END IF;
 END IF;
 IF NEW.stage='Activated' AND OLD.stage IS DISTINCT FROM NEW.stage AND v_activation_rpc<>'1' THEN RAISE EXCEPTION 'Candidate activation must use the secure activation workflow.'; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_sales_candidate_activation ON public.applicants;
CREATE TRIGGER trg_protect_sales_candidate_activation BEFORE UPDATE ON public.applicants FOR EACH ROW EXECUTE FUNCTION public.protect_sales_candidate_activation();

CREATE OR REPLACE FUNCTION public.protect_sales_profile_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_activation_rpc text:=COALESCE(current_setting('profox.sales_activation_rpc',true),'');
BEGIN
 IF NEW.role='sales' AND NEW.status='active' AND (OLD.role IS DISTINCT FROM NEW.role OR OLD.status IS DISTINCT FROM NEW.status) AND v_activation_rpc<>'1' THEN RAISE EXCEPTION 'Sales activation must use the secure Sales Academy activation workflow.'; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_sales_profile_activation ON public.user_profiles;
CREATE TRIGGER trg_protect_sales_profile_activation BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.protect_sales_profile_activation();

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
 SELECT count(*) INTO v_missing_reviews FROM public.training_modules m WHERE m.active=true AND m.requires_admin_review=true AND NOT EXISTS(SELECT 1 FROM public.user_training_progress p WHERE p.user_id=target_user_id AND p.module_id=m.id AND p.review_status='Passed' AND p.reviewed_by IS NOT NULL AND (m.passing_score IS NULL OR COALESCE(p.score,0)>=m.passing_score));
 IF v_missing_reviews>0 THEN RAISE EXCEPTION 'All Admin-reviewed training gates must be passed before activation. Missing: %',v_missing_reviews; END IF;
 PERFORM set_config('profox.sales_activation_rpc','1',true);
 UPDATE public.user_profiles SET role='sales',department='Sales',status='active',onboarding_status='completed',onboarding_progress=100,updated_at=now() WHERE id=target_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Linked user profile not found.'; END IF;
 UPDATE public.applicants SET stage='Activated',onboarding_status='completed',onboarding_progress=100,updated_at=now() WHERE id=v_app.id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_sales_candidate_account(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.approve_sales_candidate_final(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.activate_salesperson(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.protect_sales_candidate_activation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.protect_sales_profile_activation() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.link_sales_candidate_account(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_sales_candidate_final(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_salesperson(uuid,uuid) TO authenticated;

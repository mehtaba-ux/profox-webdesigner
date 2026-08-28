-- Approved Sales recruitment flow: suitability before conditional selection,
-- training before ProFox-specific competency certification, then controlled activation.

UPDATE public.recruitment_stage_policies p
SET sort_order=p.sort_order+1000,updated_at=now()
WHERE p.job_id IN (SELECT j.id FROM public.career_jobs j WHERE coalesce(public.career_job_system_role(j.id),'')='sales');

INSERT INTO public.recruitment_stage_policies(job_id,stage,sort_order,active,assessment_required,passing_score,sla_hours,interview_required,rubric,created_at,updated_at)
SELECT j.id,'Sales Practical Assessment',10,true,true,75,48,true,
       coalesce((SELECT p.rubric FROM public.recruitment_stage_policies p WHERE p.job_id=j.id AND p.stage='Sales Assessment' ORDER BY p.updated_at DESC LIMIT 1),'[]'::jsonb),now(),now()
FROM public.career_jobs j
WHERE coalesce(public.career_job_system_role(j.id),'')='sales'
ON CONFLICT (job_id,stage) DO UPDATE
SET active=true,assessment_required=true,passing_score=75,sla_hours=48,interview_required=true,rubric=excluded.rubric,updated_at=now();

INSERT INTO public.recruitment_stage_policies(job_id,stage,sort_order,active,assessment_required,passing_score,sla_hours,interview_required,rubric,created_at,updated_at)
SELECT j.id,'Final Certification',13,true,false,null,72,false,'[]'::jsonb,now(),now()
FROM public.career_jobs j
WHERE coalesce(public.career_job_system_role(j.id),'')='sales'
ON CONFLICT (job_id,stage) DO UPDATE
SET active=true,assessment_required=false,passing_score=null,sla_hours=72,interview_required=false,rubric='[]'::jsonb,updated_at=now();

UPDATE public.recruitment_stage_policies p
SET sort_order=CASE p.stage
 WHEN 'New Application' THEN 1 WHEN 'Video Pending' THEN 2 WHEN 'Video Review' THEN 3
 WHEN 'Initial Screening' THEN 4 WHEN 'Shortlisted' THEN 5 WHEN 'Sales Assessment' THEN 6
 WHEN 'Selected' THEN 7 WHEN 'Agreement Pending' THEN 8 WHEN 'Sales Academy Training' THEN 9
 WHEN 'Sales Practical Assessment' THEN 10 WHEN 'Lead Research Test' THEN 11 WHEN 'CRM Assessment' THEN 12
 WHEN 'Final Certification' THEN 13 WHEN 'Final Approval' THEN 14 WHEN 'Ready for System Access' THEN 15
 WHEN 'Activated' THEN 16 ELSE p.sort_order END,updated_at=now()
WHERE p.job_id IN (SELECT j.id FROM public.career_jobs j WHERE coalesce(public.career_job_system_role(j.id),'')='sales');

UPDATE public.recruitment_stage_policies p
SET passing_score=75,assessment_required=true,interview_required=true,
 rubric='[{"key":"communication","label":"Clear professional communication","maxPoints":25},{"key":"listening","label":"Listening and question quality","maxPoints":20},{"key":"salesJudgment","label":"General sales judgment and customer understanding","maxPoints":20},{"key":"professionalism","label":"Confidence and professionalism","maxPoints":20},{"key":"coachability","label":"Coachability and learning readiness","maxPoints":15}]'::jsonb,updated_at=now()
WHERE p.stage='Sales Assessment'
 AND p.job_id IN (SELECT j.id FROM public.career_jobs j WHERE coalesce(public.career_job_system_role(j.id),'')='sales');

CREATE OR REPLACE FUNCTION public.recruitment_next_stage(p_stage text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $function$
SELECT CASE p_stage
 WHEN 'New Application' THEN 'Video Pending' WHEN 'Video Pending' THEN 'Video Review'
 WHEN 'Video Review' THEN 'Initial Screening' WHEN 'Initial Screening' THEN 'Shortlisted'
 WHEN 'Shortlisted' THEN 'Sales Assessment' WHEN 'Sales Assessment' THEN 'Selected'
 WHEN 'Selected' THEN 'Agreement Pending' WHEN 'Agreement Pending' THEN 'Sales Academy Training'
 WHEN 'Sales Academy Training' THEN 'Sales Practical Assessment' WHEN 'Sales Practical Assessment' THEN 'Lead Research Test'
 WHEN 'Lead Research Test' THEN 'CRM Assessment' WHEN 'CRM Assessment' THEN 'Final Certification'
 WHEN 'Final Certification' THEN 'Final Approval' WHEN 'Final Approval' THEN 'Ready for System Access'
 WHEN 'Ready for System Access' THEN 'Activated' ELSE NULL END;
$function$;

CREATE OR REPLACE FUNCTION public.recruitment_stage_rank(p_stage text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $function$
SELECT CASE p_stage
 WHEN 'New Application' THEN 1 WHEN 'Video Pending' THEN 2 WHEN 'Video Review' THEN 3
 WHEN 'Initial Screening' THEN 4 WHEN 'Shortlisted' THEN 5 WHEN 'Sales Assessment' THEN 6
 WHEN 'Selected' THEN 7 WHEN 'Agreement Pending' THEN 8 WHEN 'Sales Academy Training' THEN 9
 WHEN 'Sales Practical Assessment' THEN 10 WHEN 'Lead Research Test' THEN 11 WHEN 'CRM Assessment' THEN 12
 WHEN 'Final Certification' THEN 13 WHEN 'Final Approval' THEN 14 WHEN 'Ready for System Access' THEN 15
 WHEN 'Activated' THEN 16 ELSE NULL END;
$function$;

CREATE OR REPLACE FUNCTION public.recruitment_candidate_stage_label(p_stage text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $function$
SELECT CASE p_stage
 WHEN 'New Application' THEN 'Application'
 WHEN 'Video Pending' THEN 'Application - Video Required'
 WHEN 'Sales Assessment' THEN 'Sales Suitability Assessment'
 WHEN 'Selected' THEN 'Conditional Selected'
 WHEN 'Agreement Pending' THEN 'Agreement'
 WHEN 'Sales Academy Training' THEN 'Sales Academy'
 WHEN 'Lead Research Test' THEN 'Lead Research Assessment'
 WHEN 'Ready for System Access' THEN 'System Access'
 ELSE p_stage END;
$function$;

CREATE OR REPLACE FUNCTION public.recruitment_stage_is_system_protected(p_job_id uuid,p_stage text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_role text;v_type text;v_stage text:=trim(coalesce(p_stage,''));
BEGIN
 IF p_job_id IS NULL OR v_stage='' THEN RETURN false; END IF;
 SELECT application_type,coalesce(public.career_job_system_role(id),'pending') INTO v_type,v_role FROM public.career_jobs WHERE id=p_job_id;
 IF NOT FOUND THEN RETURN false; END IF;
 IF v_stage IN('New Application','Selected','Activated') THEN RETURN true; END IF;
 IF v_role='sales' OR v_type='sales_representative' THEN
   RETURN v_stage IN('Video Pending','Video Review','Agreement Pending','Sales Academy Training','Sales Practical Assessment','Lead Research Test','CRM Assessment','Final Certification','Final Approval','Ready for System Access');
 ELSIF v_role='uiux_designer' THEN RETURN v_stage IN('Agreement Pending','Design Academy','Final Approval','Ready for System Access');
 ELSIF v_role='developer' THEN RETURN v_stage IN('Agreement Pending','Developer Academy','Final Approval','Ready for System Access');
 ELSIF v_role='content_writer' OR v_type='content_writer' THEN RETURN v_stage IN('Content Academy','Practical Certification');
 END IF;
 RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sales_academy_training_phase_ready(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_total integer:=0;v_missing integer:=0;v_missing_reviews integer:=0;
BEGIN
 IF p_user_id IS NULL THEN RETURN false; END IF;
 SELECT count(*)::integer INTO v_total FROM public.training_track_modules tm JOIN public.training_modules m ON m.id=tm.module_id
 WHERE tm.track_key='sales' AND tm.required=true AND m.active=true AND m.slug<>'final-certification';
 IF v_total=0 THEN RETURN false; END IF;
 SELECT count(*)::integer INTO v_missing FROM public.training_track_modules tm JOIN public.training_modules m ON m.id=tm.module_id
 WHERE tm.track_key='sales' AND tm.required=true AND m.active=true AND m.slug<>'final-certification'
  AND NOT EXISTS(SELECT 1 FROM public.user_training_progress p WHERE p.user_id=p_user_id AND p.module_id=m.id AND p.status IN('Passed','Completed')
   AND (coalesce(tm.passing_score_override,m.passing_score) IS NULL OR coalesce(p.score,100)>=coalesce(tm.passing_score_override,m.passing_score)));
 IF v_missing>0 THEN RETURN false; END IF;
 SELECT count(*)::integer INTO v_missing_reviews FROM public.training_track_modules tm JOIN public.training_modules m ON m.id=tm.module_id
 WHERE tm.track_key='sales' AND tm.required=true AND m.active=true AND m.slug<>'final-certification'
  AND coalesce(tm.requires_review_override,m.requires_admin_review,false)=true
  AND NOT EXISTS(SELECT 1 FROM public.user_training_progress p
   JOIN LATERAL(SELECT tr.status,tr.score,tr.reviewer_id FROM public.training_reviews tr WHERE tr.progress_id=p.id ORDER BY tr.created_at DESC,tr.id DESC LIMIT 1) r ON true
   WHERE p.user_id=p_user_id AND p.module_id=m.id AND p.status='Passed' AND r.status='Passed' AND r.reviewer_id IS NOT NULL
    AND (coalesce(tm.passing_score_override,m.passing_score) IS NULL OR coalesce(r.score,100)>=coalesce(tm.passing_score_override,m.passing_score)));
 RETURN v_missing_reviews=0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_sales_academy_module(p_module_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
SELECT public.is_admin() OR (
 EXISTS(SELECT 1 FROM public.training_track_modules tm JOIN public.training_modules m ON m.id=tm.module_id
  WHERE tm.track_key='sales' AND tm.module_id=p_module_id AND m.active=true
   AND (m.slug<>'final-certification' OR public.has_active_role(array['sales'::text]) OR EXISTS(
    SELECT 1 FROM public.applicants a WHERE a.linked_user_id=auth.uid()
     AND a.stage=ANY(array['Final Certification'::text,'Final Approval'::text,'Ready for System Access'::text,'Activated'::text])
     AND coalesce(trim(a.refusal_reason),'')='')))
 AND (EXISTS(SELECT 1 FROM public.applicants a WHERE a.linked_user_id=auth.uid()
  AND a.stage=ANY(array['Sales Academy Training'::text,'Sales Practical Assessment'::text,'Lead Research Test'::text,'CRM Assessment'::text,'Final Certification'::text,'Final Approval'::text,'Ready for System Access'::text,'Activated'::text])
  AND coalesce(trim(a.refusal_reason),'')='') OR public.has_active_role(array['sales'::text]))
);
$function$;

CREATE OR REPLACE FUNCTION public.start_sales_academy_training()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_app public.applicants%rowtype;v_started timestamptz;v_due timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE linked_user_id=auth.uid() AND coalesce(trim(refusal_reason),'')='' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Linked Sales Academy candidate record not found.'; END IF;
 IF v_app.stage NOT IN('Sales Academy Training','Sales Practical Assessment','Lead Research Test','CRM Assessment','Final Certification','Final Approval','Ready for System Access','Activated') THEN RAISE EXCEPTION 'Sales Academy access is not available at the current recruitment stage.'; END IF;
 IF lower(coalesce(v_app.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'A verified Sales Partner Agreement is required before Academy training can start.'; END IF;
 IF v_app.academy_started_at IS NULL THEN
  IF v_app.stage<>'Sales Academy Training' THEN RAISE EXCEPTION 'The Academy completion window can only start during Sales Academy Training.'; END IF;
  v_started:=now();v_due:=v_started+interval '10 days';
  UPDATE public.applicants SET academy_started_at=v_started,academy_due_at=v_due,academy_completed_at=null,academy_last_reminder_key=null,academy_review_wait_started_at=null,onboarding_status='in_progress',updated_at=now() WHERE id=v_app.id;
  PERFORM public.enqueue_notification('recruitment:'||v_app.id::text||':sales-academy-started','recruitment_academy_started',lower(trim(v_app.email)),v_app.linked_user_id,public.recruitment_notification_payload(v_app)||jsonb_build_object('academyUrl','https://www.profoxwebdesigner.com/admin/app/sales_academy?tab=training','deadlineLabel',to_char(v_due at time zone 'UTC','FMMonth DD, YYYY HH24:MI')||' UTC','daysRemaining',10,'applicationReference',v_app.application_reference),now());
 ELSE v_started:=v_app.academy_started_at;v_due:=v_app.academy_due_at; END IF;
 RETURN jsonb_build_object('stage',v_app.stage,'startedAt',v_started,'dueAt',v_due,'completedAt',v_app.academy_completed_at,'secondsRemaining',case when v_due is null then null else greatest(0,floor(extract(epoch from(v_due-now())))::bigint) end,'overdue',coalesce(v_due<now() and v_app.academy_completed_at is null,false),'pausedForReview',v_app.academy_review_wait_started_at is not null);
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_sales_candidate_account(p_applicant_id uuid,p_target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_app public.applicants%ROWTYPE;v_profile public.user_profiles%ROWTYPE;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: only an active Admin may link a candidate account.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.';END IF;
 IF coalesce(trim(v_app.refusal_reason),'')<>'' THEN RAISE EXCEPTION 'A refused candidate cannot be linked for onboarding.';END IF;
 IF v_app.stage NOT IN('Selected','Agreement Pending','Sales Academy Training','Sales Practical Assessment','Lead Research Test','CRM Assessment','Final Certification','Final Approval','Ready for System Access') THEN RAISE EXCEPTION 'Candidate must be conditionally selected before an onboarding account can be linked.';END IF;
 IF lower(coalesce(v_app.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'Signed sales agreement is required before training access is granted.';END IF;
 SELECT * INTO v_profile FROM public.user_profiles WHERE id=p_target_user_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found.';END IF;
 IF lower(trim(coalesce(v_profile.email,'')))<>lower(trim(coalesce(v_app.email,''))) THEN RAISE EXCEPTION 'Candidate email must exactly match the linked system account.';END IF;
 IF v_profile.role='admin' THEN RAISE EXCEPTION 'An Admin account cannot be linked as a sales trainee.';END IF;
 IF EXISTS(SELECT 1 FROM public.applicants a WHERE a.linked_user_id=p_target_user_id AND a.id<>p_applicant_id AND a.stage<>'Activated') THEN RAISE EXCEPTION 'This system account is already linked to another active candidate record.';END IF;
 PERFORM set_config('profox.recruitment_stage_rpc','1',true);
 UPDATE public.applicants SET linked_user_id=p_target_user_id,stage=CASE WHEN stage IN('Selected','Agreement Pending') THEN 'Sales Academy Training' ELSE stage END,onboarding_status=CASE WHEN onboarding_status='completed' THEN onboarding_status ELSE 'in_progress' END,updated_at=now() WHERE id=p_applicant_id;
 UPDATE public.user_profiles SET full_name=coalesce(nullif(trim(v_app.full_name),''),full_name),phone=coalesce(nullif(trim(v_app.phone),''),phone),country=coalesce(nullif(trim(v_app.country),''),country),timezone=coalesce(nullif(trim(v_app.timezone),''),timezone),role='sales',department='Sales',status='onboarding',onboarding_status='in_progress',onboarding_progress=least(coalesce(onboarding_progress,0),99),updated_at=now() WHERE id=p_target_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_advance_applicant_stage(p_applicant_id uuid,p_target_stage text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_app public.applicants%rowtype;v_job public.career_jobs%rowtype;v_target text;v_policy public.recruitment_stage_policies%rowtype;v_from_rank integer;v_to_rank integer;v_role text;
BEGIN
 SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.';END IF;
 SELECT * INTO v_job FROM public.career_jobs WHERE id=v_app.career_job_id;IF NOT FOUND THEN RAISE EXCEPTION 'Candidate career job is missing.';END IF;
 IF NOT public.is_admin() AND NOT(v_job.application_type='content_writer' AND public.can_manage_content_applicant(v_app.id)) THEN RAISE EXCEPTION 'Recruitment management access required.';END IF;
 IF coalesce(trim(v_app.refusal_reason),'')<>'' THEN RAISE EXCEPTION 'Closed candidates cannot progress.';END IF;
 v_role:=coalesce(public.career_job_system_role(v_app.career_job_id),case when v_job.application_type='sales_representative' then 'sales' else 'pending' end);
 v_target:=coalesce(p_target_stage,public.recruitment_next_stage_for_job(v_app.career_job_id,v_app.stage));IF v_target IS NULL THEN RAISE EXCEPTION 'No next stage is available.';END IF;
 v_from_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_app.stage);v_to_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_target);
 IF v_from_rank IS NULL OR v_to_rank IS NULL OR v_to_rank<>v_from_rank+1 THEN RAISE EXCEPTION 'Recruitment stages must progress sequentially through the selected job workflow.';END IF;
 IF v_job.application_type='sales_representative' OR v_role='sales' THEN
  IF v_app.stage='New Application' AND v_target='Video Pending' AND(coalesce(v_app.video_url,'')<>'' OR coalesce(v_app.video_storage_path,'')<>'') THEN v_target:='Video Review';END IF;
  IF v_app.stage='Video Pending' AND v_target='Video Review' AND coalesce(v_app.video_url,'')='' AND coalesce(v_app.video_storage_path,'')='' THEN RAISE EXCEPTION 'Introduction video is required before Video Review.';END IF;
 END IF;
 SELECT * INTO v_policy FROM public.recruitment_stage_policies WHERE job_id=v_app.career_job_id AND stage=v_app.stage AND active=true;
 IF FOUND AND v_policy.assessment_required AND NOT public.recruitment_latest_assessment_passed(v_app.id,v_app.stage) THEN RAISE EXCEPTION 'A passed structured assessment for % is required before progression.',public.recruitment_candidate_stage_label(v_app.stage);END IF;
 IF FOUND AND v_policy.interview_required AND NOT public.recruitment_interview_requirement_satisfied(v_app.id,v_app.stage) THEN RAISE EXCEPTION 'A completed or administratively skipped structured interview for % is required before progression.',public.recruitment_candidate_stage_label(v_app.stage);END IF;
 IF v_job.application_type='content_writer' THEN
  IF v_app.stage='Selected' THEN RAISE EXCEPTION 'Content Academy access is provisioned through the protected recruitment account invitation flow.';END IF;
  IF v_app.stage='Content Academy' THEN RAISE EXCEPTION 'Content Academy completion and practical submission control the next stage.';END IF;
  IF v_app.stage='Practical Certification' OR v_target='Activated' THEN RAISE EXCEPTION 'Content Writer activation is controlled by the protected practical certification gate.';END IF;
 ELSE
  IF v_app.stage='Selected' THEN RAISE EXCEPTION 'Issue the approved candidate agreement to move a Conditional Selected candidate into Agreement.';END IF;
  IF v_app.stage='Agreement Pending' THEN RAISE EXCEPTION 'A verified agreement and protected account invitation are required before Sales Academy.';END IF;
  IF v_role='sales' AND v_app.stage='Sales Academy Training' THEN
   IF v_app.linked_user_id IS NULL THEN RAISE EXCEPTION 'A linked Sales Academy account is required before post-Academy assessment.';END IF;
   IF lower(coalesce(v_app.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'A verified Sales Partner Agreement is required before post-Academy assessment.';END IF;
   IF v_app.academy_started_at IS NULL OR v_app.academy_due_at IS NULL THEN RAISE EXCEPTION 'Sales Academy must be started before post-Academy assessment.';END IF;
   IF v_app.academy_review_wait_started_at IS NOT NULL THEN RAISE EXCEPTION 'Sales Academy progression is locked while a required Management review is pending.';END IF;
   IF v_app.academy_completed_at IS NULL AND now()>v_app.academy_due_at THEN RAISE EXCEPTION 'The Sales Academy deadline has passed. Complete the controlled Management review process before progression.';END IF;
   IF NOT public.sales_academy_training_phase_ready(v_app.linked_user_id) THEN RAISE EXCEPTION 'Complete every required Sales Academy training module and Management review before Sales Practical Assessment.';END IF;
  ELSIF v_app.stage IN('Design Academy','Developer Academy') THEN RAISE EXCEPTION 'The candidate must complete the assigned Academy and request Final Approval through the protected workflow.';END IF;
  IF v_role='sales' AND v_app.stage='Final Certification' THEN RAISE EXCEPTION 'Complete Final Certification and use the protected Final Approval request.';END IF;
  IF v_app.stage='Final Approval' THEN RAISE EXCEPTION 'Use the protected Final Approval action.';END IF;
  IF v_app.stage='Ready for System Access' THEN RAISE EXCEPTION 'Use protected workforce activation.';END IF;
 END IF;
 PERFORM set_config('profox.recruitment_stage_rpc','1',true);UPDATE public.applicants SET stage=v_target,updated_at=now() WHERE id=v_app.id;
 RETURN jsonb_build_object('success',true,'fromStage',v_app.stage,'toStage',v_target,'systemRole',v_role,'applicationType',v_job.application_type);
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_sales_academy_non_bypassable_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_role text;v_ready boolean:=false;v_phase_ready boolean:=false;v_test_bypass boolean:=false;
 v_test_context text:=coalesce(current_setting('profox.sales_academy_test_bypass_applicant',true),'');v_test_activation_context text:=coalesce(current_setting('profox.sales_academy_test_activation_applicant',true),'');
BEGIN
 v_role:=coalesce(public.career_job_system_role(coalesce(new.career_job_id,old.career_job_id)),'');IF v_role<>'sales' THEN RETURN new;END IF;
 IF new.stage IS DISTINCT FROM old.stage THEN
  IF new.stage='Sales Practical Assessment' AND old.stage<>'Sales Academy Training' THEN RAISE EXCEPTION 'Sales Practical Assessment is available only after Sales Academy.';END IF;
  IF new.stage='Lead Research Test' AND old.stage<>'Sales Practical Assessment' THEN RAISE EXCEPTION 'Lead Research Assessment is available only after Sales Practical Assessment.';END IF;
  IF new.stage='CRM Assessment' AND old.stage<>'Lead Research Test' THEN RAISE EXCEPTION 'CRM Assessment is available only after Lead Research Assessment.';END IF;
  IF new.stage='Final Certification' AND old.stage<>'CRM Assessment' THEN RAISE EXCEPTION 'Final Certification is available only after CRM Assessment.';END IF;
  IF new.stage='Final Approval' AND old.stage<>'Final Certification' THEN RAISE EXCEPTION 'Final Approval is available only after Final Certification.';END IF;
  IF new.stage='Ready for System Access' AND old.stage<>'Final Approval' THEN RAISE EXCEPTION 'System Access is available only after Final Approval.';END IF;
  IF new.stage='Activated' AND old.stage<>'Ready for System Access' THEN RAISE EXCEPTION 'Sales candidates can be activated only from System Access.';END IF;
 END IF;
 IF new.stage='Sales Practical Assessment' AND old.stage='Sales Academy Training' AND v_test_context=new.id::text THEN v_test_bypass:=true;
 ELSIF new.stage='Ready for System Access' OR(new.final_approval IS true AND old.final_approval IS DISTINCT FROM true) THEN v_test_bypass:=public.sales_academy_test_bypass_active(new.id);
 ELSIF new.stage='Activated' AND old.stage='Ready for System Access' AND v_test_activation_context=new.id::text AND public.sales_academy_test_activation_allowed(new.id) THEN v_test_bypass:=true;END IF;
 IF new.stage IN('Sales Practical Assessment','Lead Research Test','CRM Assessment','Final Certification','Final Approval','Ready for System Access','Activated') OR(new.final_approval IS true AND old.final_approval IS DISTINCT FROM true) THEN
  IF new.linked_user_id IS NULL THEN RAISE EXCEPTION 'A linked Sales Academy account is required before advanced access.';END IF;
  IF lower(coalesce(new.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'A verified Sales Partner Agreement is required before advanced access.';END IF;
  IF new.academy_started_at IS NULL OR new.academy_due_at IS NULL THEN RAISE EXCEPTION 'Sales Academy must be started before advanced access.';END IF;
  IF NOT v_test_bypass THEN
   IF new.academy_review_wait_started_at IS NOT NULL AND new.academy_completed_at IS NULL THEN RAISE EXCEPTION 'Sales Academy progression is locked while a required Management review is pending.';END IF;
   IF new.stage='Sales Practical Assessment' THEN
    v_phase_ready:=public.sales_academy_training_phase_ready(new.linked_user_id);IF NOT v_phase_ready THEN RAISE EXCEPTION 'All required Sales Academy training modules and Management reviews must be complete before Sales Practical Assessment.';END IF;
    IF new.academy_completed_at IS NULL AND now()>new.academy_due_at THEN RAISE EXCEPTION 'The Sales Academy deadline has passed. Management review is required before post-Academy assessment.';END IF;
   ELSIF new.stage IN('Lead Research Test','CRM Assessment','Final Certification') THEN
    IF new.academy_completed_at IS NULL THEN RAISE EXCEPTION 'Sales Academy completion must be recorded before post-Academy assessment progression.';END IF;
    IF NOT public.sales_academy_training_phase_ready(new.linked_user_id) THEN RAISE EXCEPTION 'Sales Academy training readiness is no longer satisfied.';END IF;
   ELSE
    v_ready:=public.sales_academy_training_ready(new.linked_user_id);IF NOT v_ready THEN RAISE EXCEPTION 'Full Sales Academy completion, including Final Certification, is mandatory before Final Approval or system access.';END IF;
   END IF;
  END IF;
 END IF;
 RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_sales_academy_completion_timestamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF old.stage='Sales Academy Training' AND new.stage='Sales Practical Assessment' AND coalesce(current_setting('profox.sales_academy_test_bypass_applicant',true),'')<>new.id::text THEN new.academy_completed_at:=coalesce(new.academy_completed_at,now());END IF;
 RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_sales_final_approval()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_app public.applicants%rowtype;v_final public.user_training_progress%rowtype;v_final_module public.training_modules%rowtype;v_missing_prior int;v_missing_prior_reviews int;v_review public.training_reviews%rowtype;v_session public.final_certification_sessions%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.';END IF;
 SELECT * INTO v_app FROM public.applicants WHERE linked_user_id=auth.uid() ORDER BY created_at DESC LIMIT 1 FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Linked sales candidate record not found.';END IF;
 IF v_app.stage='Final Approval' THEN RETURN;END IF;
 IF v_app.stage<>'Final Certification' THEN RAISE EXCEPTION 'Complete Sales Practical Assessment, Lead Research Assessment and CRM Assessment before requesting Final Approval.';END IF;
 IF lower(coalesce(v_app.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'Signed sales agreement is required.';END IF;
 IF v_app.academy_started_at IS NULL OR v_app.academy_due_at IS NULL OR v_app.academy_completed_at IS NULL THEN RAISE EXCEPTION 'Sales Academy training must be completed before Final Certification.';END IF;
 IF v_app.academy_review_wait_started_at IS NOT NULL THEN RAISE EXCEPTION 'A required Sales Academy submission is still waiting for Management review.';END IF;
 SELECT m.* INTO v_final_module FROM public.training_modules m JOIN public.training_track_modules tm ON tm.module_id=m.id WHERE tm.track_key='sales' AND m.slug='final-certification' AND m.active=true ORDER BY tm.sort_order DESC LIMIT 1;IF NOT FOUND THEN RAISE EXCEPTION 'Sales Final Certification module is unavailable.';END IF;
 SELECT * INTO v_final FROM public.user_training_progress WHERE user_id=auth.uid() AND module_id=v_final_module.id FOR UPDATE;
 IF NOT FOUND OR v_final.status<>'Passed' OR coalesce(v_final.score,0)<coalesce(v_final_module.passing_score,90) THEN RAISE EXCEPTION 'Pass the complete Final Certification capstone before requesting Final Approval.';END IF;
 SELECT * INTO v_review FROM public.training_reviews WHERE progress_id=v_final.id ORDER BY created_at DESC,id DESC LIMIT 1;IF NOT FOUND OR v_review.status<>'Passed' OR v_review.reviewer_id IS NULL OR coalesce(v_review.score,0)<coalesce(v_final_module.passing_score,90) THEN RAISE EXCEPTION 'Final Certification requires a passing Management live review.';END IF;
 SELECT * INTO v_session FROM public.final_certification_sessions WHERE progress_id=v_final.id AND status='passed' ORDER BY attempt_no DESC LIMIT 1;IF NOT FOUND OR coalesce(v_session.score,0)<coalesce(v_final_module.passing_score,90) OR jsonb_array_length(coalesce(v_session.critical_failures,'[]'::jsonb))>0 THEN RAISE EXCEPTION 'A passing live capstone with zero critical failures is required.';END IF;
 SELECT count(*) INTO v_missing_prior FROM public.training_track_modules tm JOIN public.training_modules m ON m.id=tm.module_id WHERE tm.track_key='sales' AND tm.required=true AND m.active=true AND m.slug<>'final-certification' AND NOT EXISTS(SELECT 1 FROM public.user_training_progress p WHERE p.user_id=auth.uid() AND p.module_id=m.id AND p.status IN('Passed','Completed') AND(coalesce(tm.passing_score_override,m.passing_score) IS NULL OR coalesce(p.score,0)>=coalesce(tm.passing_score_override,m.passing_score)));IF v_missing_prior>0 THEN RAISE EXCEPTION 'All required Sales Academy training modules must be complete before Final Approval. Missing: %',v_missing_prior;END IF;
 SELECT count(*) INTO v_missing_prior_reviews FROM public.training_track_modules tm JOIN public.training_modules m ON m.id=tm.module_id WHERE tm.track_key='sales' AND tm.required=true AND m.active=true AND m.slug<>'final-certification' AND coalesce(tm.requires_review_override,m.requires_admin_review,false)=true AND NOT EXISTS(SELECT 1 FROM public.user_training_progress p JOIN LATERAL(SELECT tr.status,tr.reviewer_id FROM public.training_reviews tr WHERE tr.progress_id=p.id ORDER BY tr.created_at DESC,tr.id DESC LIMIT 1) r ON true WHERE p.user_id=auth.uid() AND p.module_id=m.id AND p.status='Passed' AND r.status='Passed' AND r.reviewer_id IS NOT NULL);IF v_missing_prior_reviews>0 THEN RAISE EXCEPTION 'All Management-reviewed Sales Academy practical gates must be passed before Final Approval. Missing: %',v_missing_prior_reviews;END IF;
 IF NOT public.sales_academy_training_ready(auth.uid()) THEN RAISE EXCEPTION 'Full Sales Academy and Final Certification readiness is required before Final Approval.';END IF;
 PERFORM set_config('profox.recruitment_stage_rpc','1',true);UPDATE public.applicants SET stage='Final Approval',onboarding_status='in_progress',onboarding_progress=100,updated_at=now() WHERE id=v_app.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reorder_recruitment_stages(p_job_id uuid,p_stage_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_count integer;v_distinct integer;v_names text[];v_role text;v_suffix text[];v_prefix text[];v_suffix_len integer;v_total integer;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.';END IF;IF NOT EXISTS(SELECT 1 FROM public.career_jobs WHERE id=p_job_id) THEN RAISE EXCEPTION 'Job Post not found.';END IF;PERFORM 1 FROM public.recruitment_stage_policies WHERE job_id=p_job_id FOR UPDATE;
 SELECT count(*) INTO v_count FROM public.recruitment_stage_policies WHERE job_id=p_job_id AND active=true;SELECT count(distinct x) INTO v_distinct FROM unnest(coalesce(p_stage_ids,'{}'::uuid[])) x;
 IF cardinality(coalesce(p_stage_ids,'{}'::uuid[]))<>v_count OR v_distinct<>v_count THEN RAISE EXCEPTION 'Reordering must include every active stage exactly once.';END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_stage_ids) x LEFT JOIN public.recruitment_stage_policies p ON p.id=x AND p.job_id=p_job_id AND p.active=true WHERE p.id IS NULL) THEN RAISE EXCEPTION 'One or more stages do not belong to this active pipeline.';END IF;
 SELECT array_agg(p.stage ORDER BY u.ord) INTO v_names FROM unnest(p_stage_ids) WITH ORDINALITY u(id,ord) JOIN public.recruitment_stage_policies p ON p.id=u.id;v_total:=cardinality(v_names);
 IF v_total<2 THEN RAISE EXCEPTION 'A recruitment pipeline requires at least two active stages.';END IF;IF v_names[1]<>'New Application' THEN RAISE EXCEPTION 'New Application is a protected intake stage and must remain first.';END IF;IF v_names[v_total]<>'Activated' THEN RAISE EXCEPTION 'Activated is a protected terminal stage and must remain last.';END IF;
 SELECT coalesce(public.career_job_system_role(p_job_id),'pending') INTO v_role;
 IF v_role='sales' THEN v_prefix:=array['New Application','Video Pending','Video Review'];v_suffix:=array['Selected','Agreement Pending','Sales Academy Training','Sales Practical Assessment','Lead Research Test','CRM Assessment','Final Certification','Final Approval','Ready for System Access','Activated'];IF v_total<cardinality(v_prefix) OR v_names[1:cardinality(v_prefix)]<>v_prefix THEN RAISE EXCEPTION 'The protected Sales intake sequence must remain New Application, Video Pending, Video Review.';END IF;
 ELSIF v_role='uiux_designer' THEN v_suffix:=array['Selected','Agreement Pending','Design Academy','Final Approval','Ready for System Access','Activated'];
 ELSIF v_role='developer' THEN v_suffix:=array['Selected','Agreement Pending','Developer Academy','Final Approval','Ready for System Access','Activated'];
 ELSIF v_role='content_writer' THEN v_suffix:=array['Selected','Content Academy','Practical Certification','Activated'];ELSE v_suffix:=array['Selected','Activated'];END IF;
 v_suffix_len:=cardinality(v_suffix);IF v_total<v_suffix_len OR v_names[(v_total-v_suffix_len+1):v_total]<>v_suffix THEN RAISE EXCEPTION 'The protected selection, onboarding, assessment and activation sequence must remain intact at the end of this pipeline.';END IF;
 UPDATE public.recruitment_stage_policies p SET sort_order=u.ord::integer,updated_by=auth.uid(),updated_at=now() FROM unnest(p_stage_ids) WITH ORDINALITY u(id,ord) WHERE p.id=u.id AND p.job_id=p_job_id AND p.active=true;
 RETURN jsonb_build_object('success',true,'stageCount',v_count);
END;
$function$;

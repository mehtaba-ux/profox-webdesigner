-- Ensure Agreement Pending produces one actionable signing email when the secure agreement workflow issues the document.

CREATE OR REPLACE FUNCTION public.admin_issue_sales_partner_agreement(p_applicant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 SELECT public.create_sales_partner_agreement_internal(p_applicant_id) INTO v_result;
 PERFORM set_config('profox.agreement_workflow_rpc','1',true);
 PERFORM set_config('profox.agreement_issue_stage','1',true);
 UPDATE public.applicants SET stage='Agreement Pending',agreement_status='sent',updated_at=now() WHERE id=p_applicant_id AND stage='Selected';
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.queue_recruitment_stage_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_admin record;
 v_template text;
 v_cycle text:=md5(clock_timestamp()::text||random()::text||NEW.id::text);
 v_secure_issue boolean:=COALESCE(current_setting('profox.agreement_issue_stage',true),'')='1';
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.stage='Video Pending' THEN PERFORM public.queue_recruitment_email(NEW,'recruitment_video_pending','video-pending-'||v_cycle,now()); PERFORM public.queue_recruitment_video_pending_followups(NEW,v_cycle); ELSE PERFORM public.queue_recruitment_email(NEW,'recruitment_application_received','application-received',now()); END IF;
  FOR v_admin IN SELECT id FROM public.user_profiles WHERE role='admin' AND status='active' LOOP PERFORM public.enqueue_in_app_notification(v_admin.id,'Recruitment','New sales application',NEW.full_name||' submitted an application for the Independent Sales Representative role.','/admin/app/recruitment','recruitment:new-applicant:'||NEW.id::text||':'||v_admin.id::text); END LOOP;
  RETURN NEW;
 END IF;
 IF NEW.refusal_reason IS DISTINCT FROM OLD.refusal_reason AND COALESCE(trim(NEW.refusal_reason),'')<>'' THEN PERFORM public.cancel_recruitment_video_pending_followups(NEW.id,'Candidate application was closed.'); PERFORM public.queue_recruitment_email(NEW,'recruitment_not_selected','not-selected',now()); RETURN NEW; END IF;
 IF NEW.stage IS DISTINCT FROM OLD.stage THEN
  IF OLD.stage='Video Pending' AND NEW.stage<>'Video Pending' THEN PERFORM public.cancel_recruitment_video_pending_followups(NEW.id,'Candidate progressed beyond Video Pending.'); END IF;
  IF NEW.stage='Agreement Pending' AND OLD.stage='Selected' AND COALESCE(NEW.agreement_status,'not_sent')='not_sent' THEN
    PERFORM public.create_sales_partner_agreement_internal(NEW.id);
    v_secure_issue:=true;
  END IF;
  v_template:=CASE NEW.stage
    WHEN 'New Application' THEN 'recruitment_application_received'
    WHEN 'Video Pending' THEN 'recruitment_video_pending'
    WHEN 'Video Review' THEN 'recruitment_video_received'
    WHEN 'Initial Screening' THEN 'recruitment_initial_screening'
    WHEN 'Shortlisted' THEN 'recruitment_shortlisted'
    WHEN 'Sales Assessment' THEN 'recruitment_sales_assessment'
    WHEN 'Lead Research Test' THEN 'recruitment_lead_research'
    WHEN 'CRM Assessment' THEN 'recruitment_crm_assessment'
    WHEN 'Selected' THEN 'recruitment_selected'
    WHEN 'Agreement Pending' THEN CASE WHEN v_secure_issue THEN NULL ELSE 'recruitment_agreement_pending' END
    WHEN 'One-Day Training' THEN 'recruitment_training'
    WHEN 'Final Approval' THEN 'recruitment_final_review'
    WHEN 'Ready for System Access' THEN 'recruitment_final_approved'
    WHEN 'Activated' THEN 'recruitment_activated'
    ELSE NULL END;
  IF v_template IS NOT NULL THEN PERFORM public.queue_recruitment_email(NEW,v_template,'stage-'||lower(replace(NEW.stage,' ','-'))||'-'||v_cycle,now()); END IF;
  IF NEW.stage='Video Pending' THEN PERFORM public.queue_recruitment_video_pending_followups(NEW,v_cycle); END IF;
 END IF;
 RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.admin_issue_sales_partner_agreement(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_issue_sales_partner_agreement(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.queue_recruitment_stage_notifications() FROM PUBLIC,anon,authenticated;

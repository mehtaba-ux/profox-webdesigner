-- Launch polish: avoid duplicate Agreement Pending emails when a secure agreement is auto-issued,
-- and allow high-DPI mouse/touch/stylus signatures without false rejection.

CREATE OR REPLACE FUNCTION public.queue_recruitment_stage_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_admin record;
  v_template text;
  v_cycle text:=md5(clock_timestamp()::text||random()::text||NEW.id::text);
  v_auto_agreement boolean:=false;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.stage='Video Pending' THEN
      PERFORM public.queue_recruitment_email(NEW,'recruitment_video_pending','video-pending-'||v_cycle,now());
      PERFORM public.queue_recruitment_video_pending_followups(NEW,v_cycle);
    ELSE
      PERFORM public.queue_recruitment_email(NEW,'recruitment_application_received','application-received',now());
    END IF;
    FOR v_admin IN SELECT id FROM public.user_profiles WHERE role='admin' AND status='active' LOOP
      PERFORM public.enqueue_in_app_notification(v_admin.id,'Recruitment','New sales application',NEW.full_name||' submitted an application for the Independent Sales Representative role.','/admin/app/recruitment','recruitment:new-applicant:'||NEW.id::text||':'||v_admin.id::text);
    END LOOP;
    RETURN NEW;
  END IF;

  IF NEW.refusal_reason IS DISTINCT FROM OLD.refusal_reason AND COALESCE(trim(NEW.refusal_reason),'')<>'' THEN
    PERFORM public.cancel_recruitment_video_pending_followups(NEW.id,'Candidate application was closed.');
    PERFORM public.queue_recruitment_email(NEW,'recruitment_not_selected','not-selected',now());
    RETURN NEW;
  END IF;

  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    IF OLD.stage='Video Pending' AND NEW.stage<>'Video Pending' THEN
      PERFORM public.cancel_recruitment_video_pending_followups(NEW.id,'Candidate progressed beyond Video Pending.');
    END IF;

    -- When Selected -> Agreement Pending automatically issues the secure agreement,
    -- the agreement-ready email already contains the actionable signing link. Do not send a second generic email.
    IF NEW.stage='Agreement Pending' AND OLD.stage='Selected' AND COALESCE(NEW.agreement_status,'not_sent')='not_sent' THEN
      PERFORM public.create_sales_partner_agreement_internal(NEW.id);
      v_auto_agreement:=true;
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
      WHEN 'Agreement Pending' THEN CASE WHEN v_auto_agreement THEN NULL ELSE 'recruitment_agreement_pending' END
      WHEN 'One-Day Training' THEN 'recruitment_training'
      WHEN 'Final Approval' THEN 'recruitment_final_review'
      WHEN 'Ready for System Access' THEN 'recruitment_final_approved'
      WHEN 'Activated' THEN 'recruitment_activated'
      ELSE NULL
    END;
    IF v_template IS NOT NULL THEN
      PERFORM public.queue_recruitment_email(NEW,v_template,'stage-'||lower(replace(NEW.stage,' ','-'))||'-'||v_cycle,now());
    END IF;
    IF NEW.stage='Video Pending' THEN
      PERFORM public.queue_recruitment_video_pending_followups(NEW,v_cycle);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_sign_sales_partner_agreement(
  p_token uuid,p_signer_name text,p_signature_svg text,p_acknowledgements jsonb,p_ip text DEFAULT '',p_user_agent text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.sales_partner_agreements%ROWTYPE; v_app public.applicants%ROWTYPE; v_missing int; v_sig_hash text; v_admin record;
BEGIN
 SELECT * INTO v_row FROM public.sales_partner_agreements WHERE token_hash=encode(extensions.digest(p_token::text,'sha256'),'hex') AND status IN ('Sent','Viewed') AND token_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agreement link is invalid, expired, already signed or no longer active.'; END IF;
 IF lower(trim(COALESCE(p_signer_name,'')))<>lower(trim(COALESCE(v_row.partner_snapshot->>'fullName',''))) THEN RAISE EXCEPTION 'Typed legal name must match the name on the Agreement Record.'; END IF;
 IF COALESCE(length(p_signature_svg),0)<100 OR length(p_signature_svg)>500000 OR left(ltrim(p_signature_svg),4)<>'<svg' THEN RAISE EXCEPTION 'A valid drawn signature is required.'; END IF;
 SELECT count(*) INTO v_missing FROM jsonb_array_elements(v_row.template_snapshot->'acknowledgements') a WHERE COALESCE(p_acknowledgements->>(a->>'key'),'false')<>'true';
 IF v_missing>0 THEN RAISE EXCEPTION 'All required acknowledgements must be accepted before signing.'; END IF;
 v_sig_hash:=encode(extensions.digest(p_signature_svg,'sha256'),'hex');
 UPDATE public.sales_partner_agreements SET status='Partner Signed',partner_signer_name=trim(p_signer_name),partner_signature_svg=p_signature_svg,partner_signature_hash=v_sig_hash,partner_acknowledgements=p_acknowledgements,partner_signed_at=now(),partner_ip=left(COALESCE(p_ip,''),200),partner_user_agent=left(COALESCE(p_user_agent,''),1000),updated_at=now() WHERE id=v_row.id;
 INSERT INTO public.sales_agreement_events(agreement_id,event_type,actor_type,actor_email,ip_address,user_agent,metadata) VALUES(v_row.id,'Partner Signed','Partner',COALESCE(v_row.partner_snapshot->>'email',''),left(COALESCE(p_ip,''),200),left(COALESCE(p_user_agent,''),1000),jsonb_build_object('signatureHash',v_sig_hash,'documentHash',v_row.document_hash));
 SELECT * INTO v_app FROM public.applicants WHERE id=v_row.applicant_id;
 PERFORM public.enqueue_notification('sales-agreement:'||v_row.id::text||':partner-signed','recruitment_agreement_signature_received',v_app.email,NULL,public.recruitment_notification_payload(v_app)||jsonb_build_object('agreementNumber',v_row.agreement_number),now());
 FOR v_admin IN SELECT id,email FROM public.user_profiles WHERE role='admin' AND status='active' LOOP
   PERFORM public.enqueue_in_app_notification(v_admin.id,'Recruitment','Agreement signature received',v_app.full_name||' signed the Sales Partner Agreement. Review and countersign it.','/admin/agreements','sales-agreement:partner-signed:'||v_row.id::text||':'||v_admin.id::text);
 END LOOP;
 SELECT id,email INTO v_admin FROM public.user_profiles WHERE role='admin' AND status='active' AND COALESCE(trim(email),'')<>'' ORDER BY CASE WHEN lower(trim(email))='mehtaba@profoxwebdesigner.com' THEN 0 ELSE 1 END,created_at LIMIT 1;
 IF v_admin.email IS NOT NULL THEN
   PERFORM public.enqueue_notification('sales-agreement:'||v_row.id::text||':admin-review','recruitment_admin_agreement_signed',lower(trim(v_admin.email)),v_admin.id,public.recruitment_notification_payload(v_app)||jsonb_build_object('agreementNumber',v_row.agreement_number,'agreementId',v_row.id),now());
 END IF;
 RETURN jsonb_build_object('success',true,'agreementId',v_row.id,'agreementNumber',v_row.agreement_number,'status','Partner Signed');
END; $$;

CREATE OR REPLACE FUNCTION public.admin_verify_sales_partner_agreement(p_agreement_id uuid,p_signer_name text,p_signer_title text,p_signature_svg text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.sales_partner_agreements%ROWTYPE; v_app public.applicants%ROWTYPE; v_sig_hash text; v_exec_hash text;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 SELECT * INTO v_row FROM public.sales_partner_agreements WHERE id=p_agreement_id FOR UPDATE;
 IF NOT FOUND OR v_row.status<>'Partner Signed' THEN RAISE EXCEPTION 'Partner signature is required before company verification.'; END IF;
 IF COALESCE(trim(p_signer_name),'')='' OR COALESCE(trim(p_signer_title),'')='' THEN RAISE EXCEPTION 'Company signer name and title are required.'; END IF;
 IF COALESCE(length(p_signature_svg),0)<100 OR length(p_signature_svg)>500000 OR left(ltrim(p_signature_svg),4)<>'<svg' THEN RAISE EXCEPTION 'A valid company signature is required.'; END IF;
 v_sig_hash:=encode(extensions.digest(p_signature_svg,'sha256'),'hex');
 v_exec_hash:=encode(extensions.digest(v_row.document_hash||'|'||COALESCE(v_row.partner_signature_hash,'')||'|'||v_sig_hash||'|'||v_row.partner_signed_at::text||'|'||now()::text,'sha256'),'hex');
 UPDATE public.sales_partner_agreements SET status='Verified',company_signer_name=trim(p_signer_name),company_signer_title=trim(p_signer_title),company_signature_svg=p_signature_svg,company_signature_hash=v_sig_hash,company_signed_at=now(),company_signer_user_id=auth.uid(),verified_at=now(),verified_by=auth.uid(),execution_hash=v_exec_hash,updated_at=now() WHERE id=p_agreement_id;
 INSERT INTO public.sales_agreement_events(agreement_id,event_type,actor_type,actor_user_id,actor_email,metadata) VALUES(p_agreement_id,'Verified','Admin',auth.uid(),COALESCE((SELECT email FROM public.user_profiles WHERE id=auth.uid()),''),jsonb_build_object('companySignatureHash',v_sig_hash,'executionHash',v_exec_hash));
 SELECT * INTO v_app FROM public.applicants WHERE id=v_row.applicant_id;
 PERFORM set_config('profox.agreement_workflow_rpc','1',true);
 UPDATE public.applicants SET agreement_status='signed',updated_at=now() WHERE id=v_row.applicant_id;
 PERFORM public.enqueue_notification('sales-agreement:'||p_agreement_id::text||':verified','recruitment_agreement_verified',v_app.email,NULL,public.recruitment_notification_payload(v_app)||jsonb_build_object('agreementNumber',v_row.agreement_number),now());
 RETURN jsonb_build_object('success',true,'agreementId',p_agreement_id,'status','Verified','executionHash',v_exec_hash);
END; $$;

REVOKE ALL ON FUNCTION public.service_sign_sales_partner_agreement(uuid,text,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_sign_sales_partner_agreement(uuid,text,text,jsonb,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_verify_sales_partner_agreement(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_sales_partner_agreement(uuid,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.queue_recruitment_stage_notifications() FROM PUBLIC,anon,authenticated;

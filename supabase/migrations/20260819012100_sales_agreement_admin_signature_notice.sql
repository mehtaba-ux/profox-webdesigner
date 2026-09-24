-- Send the existing Admin agreement-review email when a partner signs.
CREATE OR REPLACE FUNCTION public.service_sign_sales_partner_agreement(
  p_token uuid,p_signer_name text,p_signature_svg text,p_acknowledgements jsonb,p_ip text DEFAULT '',p_user_agent text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.sales_partner_agreements%ROWTYPE; v_app public.applicants%ROWTYPE; v_missing int; v_sig_hash text; v_admin record;
BEGIN
 SELECT * INTO v_row FROM public.sales_partner_agreements WHERE token_hash=encode(digest(p_token::text,'sha256'),'hex') AND status IN ('Sent','Viewed') AND token_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agreement link is invalid, expired, already signed or no longer active.'; END IF;
 IF lower(trim(COALESCE(p_signer_name,'')))<>lower(trim(COALESCE(v_row.partner_snapshot->>'fullName',''))) THEN RAISE EXCEPTION 'Typed legal name must match the name on the Agreement Record.'; END IF;
 IF COALESCE(length(p_signature_svg),0)<100 OR length(p_signature_svg)>120000 OR left(ltrim(p_signature_svg),4)<>'<svg' THEN RAISE EXCEPTION 'A valid drawn signature is required.'; END IF;
 SELECT count(*) INTO v_missing FROM jsonb_array_elements(v_row.template_snapshot->'acknowledgements') a WHERE COALESCE(p_acknowledgements->>(a->>'key'),'false')<>'true';
 IF v_missing>0 THEN RAISE EXCEPTION 'All required acknowledgements must be accepted before signing.'; END IF;
 v_sig_hash:=encode(digest(p_signature_svg,'sha256'),'hex');
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
REVOKE ALL ON FUNCTION public.service_sign_sales_partner_agreement(uuid,text,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_sign_sales_partner_agreement(uuid,text,text,jsonb,text,text) TO service_role;

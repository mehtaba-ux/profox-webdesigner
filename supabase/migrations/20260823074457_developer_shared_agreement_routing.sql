-- Shared candidate agreement routing extended for Developer while preserving Sales and UI/UX behavior.
create or replace function public.admin_issue_candidate_agreement(p_applicant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare a public.applicants%rowtype; v_role text;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into a from public.applicants where id=p_applicant_id;
  if not found then raise exception 'Candidate not found.'; end if;
  v_role:=coalesce(public.career_job_system_role(a.career_job_id),'sales');
  if v_role='developer' then return public.create_web_developer_agreement_internal(a.id); end if;
  if v_role='uiux_designer' then return public.create_uiux_designer_agreement_internal(a.id); end if;
  if v_role='sales' then return public.admin_issue_sales_partner_agreement(a.id); end if;
  raise exception 'No approved agreement workflow is configured for this role.';
end;
$$;

create or replace function public.service_sign_sales_partner_agreement(
  p_token uuid,p_signer_name text,p_signature_svg text,p_acknowledgements jsonb,p_ip text default '',p_user_agent text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_row public.sales_partner_agreements%rowtype;
  a public.applicants%rowtype;
  v_missing int;
  v_sig_hash text;
  v_admin record;
  v_label text;
  v_template text;
  v_prefix text;
begin
  select * into v_row from public.sales_partner_agreements
  where token_hash=encode(extensions.digest(p_token::text,'sha256'),'hex') and status in('Sent','Viewed') and token_expires_at>now()
  for update;
  if not found then raise exception 'Agreement link is invalid, expired, already signed or no longer active.'; end if;
  if lower(trim(coalesce(p_signer_name,'')))<>lower(trim(coalesce(v_row.partner_snapshot->>'fullName',''))) then raise exception 'Typed legal name must match the name on the Agreement Record.'; end if;
  if coalesce(length(p_signature_svg),0)<100 or length(p_signature_svg)>500000 or left(ltrim(p_signature_svg),4)<>'<svg' then raise exception 'A valid drawn signature is required.'; end if;
  select count(*) into v_missing from jsonb_array_elements(v_row.template_snapshot->'acknowledgements') x
  where coalesce(p_acknowledgements->>(x->>'key'),'false')<>'true';
  if v_missing>0 then raise exception 'All required acknowledgements must be accepted before signing.'; end if;
  v_sig_hash:=encode(extensions.digest(p_signature_svg,'sha256'),'hex');
  update public.sales_partner_agreements
  set status='Partner Signed',partner_signer_name=trim(p_signer_name),partner_signature_svg=p_signature_svg,
      partner_signature_hash=v_sig_hash,partner_acknowledgements=p_acknowledgements,partner_signed_at=now(),
      partner_ip=left(coalesce(p_ip,''),200),partner_user_agent=left(coalesce(p_user_agent,''),1000),updated_at=now()
  where id=v_row.id;
  insert into public.sales_agreement_events(agreement_id,event_type,actor_type,actor_email,ip_address,user_agent,metadata)
  values(v_row.id,'Candidate Signed','Partner',coalesce(v_row.partner_snapshot->>'email',''),left(coalesce(p_ip,''),200),left(coalesce(p_user_agent,''),1000),jsonb_build_object('signatureHash',v_sig_hash,'documentHash',v_row.document_hash,'agreementType',v_row.agreement_type));
  select * into a from public.applicants where id=v_row.applicant_id;
  v_label:=case when v_row.agreement_type='uiux_designer' then 'UI/UX Designer Agreement' when v_row.agreement_type='web_developer' then 'Web Developer Agreement' else 'Sales Partner Agreement' end;
  v_template:=case when v_row.agreement_type='uiux_designer' then 'recruitment_uiux_agreement_signature_received' else 'recruitment_agreement_signature_received' end;
  v_prefix:=case when v_row.agreement_type='uiux_designer' then 'uiux-agreement:' when v_row.agreement_type='web_developer' then 'developer-agreement:' else 'sales-agreement:' end;
  perform public.enqueue_notification(v_prefix||v_row.id::text||':candidate-signed',v_template,a.email,null,public.recruitment_notification_payload(a)||jsonb_build_object('agreementNumber',v_row.agreement_number),now());
  for v_admin in select id from public.user_profiles where role='admin' and status='active' loop
    perform public.enqueue_in_app_notification(v_admin.id,'Recruitment','Agreement signature received',a.full_name||' signed the '||v_label||'. Review and countersign it.','/admin/agreements',v_prefix||'candidate-signed:'||v_row.id::text||':'||v_admin.id::text);
  end loop;
  return jsonb_build_object('success',true,'agreementId',v_row.id,'agreementNumber',v_row.agreement_number,'status','Partner Signed','agreementType',v_row.agreement_type);
end;
$$;

create or replace function public.admin_verify_sales_partner_agreement(
  p_agreement_id uuid,p_signer_name text,p_signer_title text,p_signature_svg text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_row public.sales_partner_agreements%rowtype;
  a public.applicants%rowtype;
  v_sig_hash text;
  v_exec_hash text;
  v_template text;
  v_prefix text;
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;
  select * into v_row from public.sales_partner_agreements where id=p_agreement_id for update;
  if not found or v_row.status<>'Partner Signed' then raise exception 'Candidate signature is required before company verification.'; end if;
  if coalesce(trim(p_signer_name),'')='' or coalesce(trim(p_signer_title),'')='' then raise exception 'Company signer name and title are required.'; end if;
  if coalesce(length(p_signature_svg),0)<100 or length(p_signature_svg)>500000 or left(ltrim(p_signature_svg),4)<>'<svg' then raise exception 'A valid company signature is required.'; end if;
  v_sig_hash:=encode(extensions.digest(p_signature_svg,'sha256'),'hex');
  v_exec_hash:=encode(extensions.digest(v_row.document_hash||'|'||coalesce(v_row.partner_signature_hash,'')||'|'||v_sig_hash||'|'||v_row.partner_signed_at::text||'|'||now()::text,'sha256'),'hex');
  update public.sales_partner_agreements
  set status='Verified',company_signer_name=trim(p_signer_name),company_signer_title=trim(p_signer_title),
      company_signature_svg=p_signature_svg,company_signature_hash=v_sig_hash,company_signed_at=now(),company_signer_user_id=auth.uid(),
      verified_at=now(),verified_by=auth.uid(),execution_hash=v_exec_hash,updated_at=now()
  where id=p_agreement_id;
  insert into public.sales_agreement_events(agreement_id,event_type,actor_type,actor_user_id,actor_email,metadata)
  values(p_agreement_id,'Verified','Admin',auth.uid(),coalesce((select email from public.user_profiles where id=auth.uid()),''),jsonb_build_object('companySignatureHash',v_sig_hash,'executionHash',v_exec_hash,'agreementType',v_row.agreement_type));
  select * into a from public.applicants where id=v_row.applicant_id;
  perform set_config('profox.agreement_workflow_rpc','1',true);
  update public.applicants set agreement_status='signed',updated_at=now() where id=v_row.applicant_id;
  v_template:=case when v_row.agreement_type='uiux_designer' then 'recruitment_uiux_agreement_verified' when v_row.agreement_type='web_developer' then 'recruitment_developer_agreement_verified' else 'recruitment_agreement_verified' end;
  v_prefix:=case when v_row.agreement_type='uiux_designer' then 'uiux-agreement:' when v_row.agreement_type='web_developer' then 'developer-agreement:' else 'sales-agreement:' end;
  perform public.enqueue_notification(v_prefix||p_agreement_id::text||':verified',v_template,a.email,null,public.recruitment_notification_payload(a)||jsonb_build_object('agreementNumber',v_row.agreement_number),now());
  return jsonb_build_object('success',true,'agreementId',p_agreement_id,'status','Verified','executionHash',v_exec_hash,'agreementType',v_row.agreement_type);
end;
$$;

grant execute on function public.admin_issue_candidate_agreement(uuid) to authenticated;
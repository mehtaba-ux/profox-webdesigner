-- PF UI/UX Designer Team — preserve canonical sales_agreement_events actor values.
-- The existing table constrains actor_type to Admin / Partner / System. UI remains role-neutral,
-- while the stored audit value stays backward-compatible as Partner for any external candidate signer/viewer.

create or replace function public.public_get_sales_partner_agreement(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_row public.sales_partner_agreements%rowtype;
begin
  select * into v_row
  from public.sales_partner_agreements
  where token_hash=encode(extensions.digest(p_token::text,'sha256'),'hex')
    and status in('Sent','Viewed','Partner Signed','Verified')
    and (status in('Partner Signed','Verified') or token_expires_at>now())
  limit 1;
  if not found then return jsonb_build_object('success',false,'error','This agreement link is invalid, expired or no longer active.'); end if;
  if v_row.status='Sent' then
    update public.sales_partner_agreements set status='Viewed',viewed_at=coalesce(viewed_at,now()),updated_at=now() where id=v_row.id;
    insert into public.sales_agreement_events(agreement_id,event_type,actor_type,actor_email,metadata)
    values(v_row.id,'Viewed','Partner',coalesce(v_row.partner_snapshot->>'email',''),jsonb_build_object('agreementType',v_row.agreement_type));
    v_row.status:='Viewed'; v_row.viewed_at:=now();
  end if;
  return jsonb_build_object('success',true,'agreement',jsonb_build_object(
    'id',v_row.id,'agreementNumber',v_row.agreement_number,'templateVersion',v_row.template_version,'status',v_row.status,
    'agreementType',v_row.agreement_type,'targetRole',v_row.target_role,'targetDepartment',v_row.target_department,
    'partner',v_row.partner_snapshot,'company',v_row.company_snapshot,'commercial',v_row.commercial_snapshot,'training',v_row.training_snapshot,
    'hiring',v_row.hiring_snapshot,'template',v_row.template_snapshot,'documentHash',v_row.document_hash,'sentAt',v_row.sent_at,'viewedAt',v_row.viewed_at,
    'partnerSignedAt',v_row.partner_signed_at,'companySignerName',v_row.company_signer_name,'companySignerTitle',v_row.company_signer_title,
    'companySignedAt',v_row.company_signed_at,'verifiedAt',v_row.verified_at,'executionHash',v_row.execution_hash
  ));
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
  v_row public.sales_partner_agreements%rowtype; a public.applicants%rowtype; v_missing int; v_sig_hash text;
  v_admin record; v_label text; v_template text; v_prefix text;
begin
  select * into v_row from public.sales_partner_agreements
  where token_hash=encode(extensions.digest(p_token::text,'sha256'),'hex') and status in('Sent','Viewed') and token_expires_at>now() for update;
  if not found then raise exception 'Agreement link is invalid, expired, already signed or no longer active.'; end if;
  if lower(trim(coalesce(p_signer_name,'')))<>lower(trim(coalesce(v_row.partner_snapshot->>'fullName',''))) then raise exception 'Typed legal name must match the name on the Agreement Record.'; end if;
  if coalesce(length(p_signature_svg),0)<100 or length(p_signature_svg)>500000 or left(ltrim(p_signature_svg),4)<>'<svg' then raise exception 'A valid drawn signature is required.'; end if;
  select count(*) into v_missing from jsonb_array_elements(v_row.template_snapshot->'acknowledgements') x
  where coalesce(p_acknowledgements->>(x->>'key'),'false')<>'true';
  if v_missing>0 then raise exception 'All required acknowledgements must be accepted before signing.'; end if;
  v_sig_hash:=encode(extensions.digest(p_signature_svg,'sha256'),'hex');
  update public.sales_partner_agreements set status='Partner Signed',partner_signer_name=trim(p_signer_name),partner_signature_svg=p_signature_svg,
    partner_signature_hash=v_sig_hash,partner_acknowledgements=p_acknowledgements,partner_signed_at=now(),partner_ip=left(coalesce(p_ip,''),200),
    partner_user_agent=left(coalesce(p_user_agent,''),1000),updated_at=now() where id=v_row.id;
  insert into public.sales_agreement_events(agreement_id,event_type,actor_type,actor_email,ip_address,user_agent,metadata)
  values(v_row.id,'Candidate Signed','Partner',coalesce(v_row.partner_snapshot->>'email',''),left(coalesce(p_ip,''),200),left(coalesce(p_user_agent,''),1000),
    jsonb_build_object('signatureHash',v_sig_hash,'documentHash',v_row.document_hash,'agreementType',v_row.agreement_type));
  select * into a from public.applicants where id=v_row.applicant_id;
  v_label:=case when v_row.agreement_type='uiux_designer' then 'UI/UX Designer Agreement' else 'Sales Partner Agreement' end;
  v_template:=case when v_row.agreement_type='uiux_designer' then 'recruitment_uiux_agreement_signature_received' else 'recruitment_agreement_signature_received' end;
  v_prefix:=case when v_row.agreement_type='uiux_designer' then 'uiux-agreement:' else 'sales-agreement:' end;
  perform public.enqueue_notification(v_prefix||v_row.id::text||':candidate-signed',v_template,a.email,null,
    public.recruitment_notification_payload(a)||jsonb_build_object('agreementNumber',v_row.agreement_number),now());
  for v_admin in select id from public.user_profiles where role='admin' and status='active' loop
    perform public.enqueue_in_app_notification(v_admin.id,'Recruitment','Agreement signature received',a.full_name||' signed the '||v_label||'. Review and countersign it.',
      '/admin/agreements',v_prefix||'candidate-signed:'||v_row.id::text||':'||v_admin.id::text);
  end loop;
  return jsonb_build_object('success',true,'agreementId',v_row.id,'agreementNumber',v_row.agreement_number,'status','Partner Signed','agreementType',v_row.agreement_type);
end;
$$;

revoke all on function public.public_get_sales_partner_agreement(uuid) from public;
grant execute on function public.public_get_sales_partner_agreement(uuid) to anon,authenticated;
revoke all on function public.service_sign_sales_partner_agreement(uuid,text,text,jsonb,text,text) from public,anon,authenticated;

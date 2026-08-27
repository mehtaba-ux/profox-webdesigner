create or replace function public.admin_verify_sales_partner_agreement(
  p_agreement_id uuid,
  p_signer_name text,
  p_signer_title text,
  p_signature_svg text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_row public.sales_partner_agreements%rowtype;
  a public.applicants%rowtype;
  v_sig_hash text;
  v_exec_hash text;
  v_template text;
  v_prefix text;
  v_now timestamptz := now();
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;

  select * into v_row
  from public.sales_partner_agreements
  where id=p_agreement_id
  for update;

  if not found then raise exception 'Agreement not found.'; end if;

  -- A retry after a successful countersignature must be a safe no-op. This also
  -- protects against a stale Admin browser snapshot calling verification twice.
  if v_row.status='Verified' then
    if v_row.partner_signed_at is null
       or coalesce(v_row.partner_signature_svg,'')=''
       or coalesce(v_row.partner_signature_hash,'')=''
       or v_row.company_signed_at is null
       or coalesce(v_row.company_signature_svg,'')=''
       or coalesce(v_row.company_signature_hash,'')=''
       or v_row.verified_at is null
       or coalesce(v_row.execution_hash,'')='' then
      raise exception 'Verified agreement is missing required signature or execution evidence.';
    end if;

    return jsonb_build_object(
      'success',true,
      'agreementId',p_agreement_id,
      'status','Verified',
      'executionHash',v_row.execution_hash,
      'agreementType',v_row.agreement_type,
      'alreadyVerified',true
    );
  end if;

  if v_row.status<>'Partner Signed'
     or v_row.partner_signed_at is null
     or coalesce(v_row.partner_signature_svg,'')=''
     or coalesce(v_row.partner_signature_hash,'')='' then
    raise exception 'Agreement must be signed by the candidate before company verification. Current status: %.',v_row.status;
  end if;

  if coalesce(trim(p_signer_name),'')='' or coalesce(trim(p_signer_title),'')='' then
    raise exception 'Company signer name and title are required.';
  end if;

  if coalesce(length(p_signature_svg),0)<100
     or length(p_signature_svg)>500000
     or left(ltrim(p_signature_svg),4)<>'<svg' then
    raise exception 'A valid company signature is required.';
  end if;

  v_sig_hash:=encode(extensions.digest(p_signature_svg,'sha256'),'hex');
  v_exec_hash:=encode(
    extensions.digest(
      v_row.document_hash||'|'||coalesce(v_row.partner_signature_hash,'')||'|'||v_sig_hash||'|'||v_row.partner_signed_at::text||'|'||v_now::text,
      'sha256'
    ),
    'hex'
  );

  update public.sales_partner_agreements
  set status='Verified',
      company_signer_name=trim(p_signer_name),
      company_signer_title=trim(p_signer_title),
      company_signature_svg=p_signature_svg,
      company_signature_hash=v_sig_hash,
      company_signed_at=v_now,
      company_signer_user_id=auth.uid(),
      verified_at=v_now,
      verified_by=auth.uid(),
      execution_hash=v_exec_hash,
      updated_at=v_now
  where id=p_agreement_id;

  insert into public.sales_agreement_events(
    agreement_id,event_type,actor_type,actor_user_id,actor_email,metadata
  ) values (
    p_agreement_id,
    'Verified',
    'Admin',
    auth.uid(),
    coalesce((select email from public.user_profiles where id=auth.uid()),''),
    jsonb_build_object(
      'companySignatureHash',v_sig_hash,
      'executionHash',v_exec_hash,
      'agreementType',v_row.agreement_type
    )
  );

  select * into a from public.applicants where id=v_row.applicant_id;
  if not found then raise exception 'Agreement applicant record not found.'; end if;

  perform set_config('profox.agreement_workflow_rpc','1',true);
  update public.applicants
  set agreement_status='signed',updated_at=v_now
  where id=v_row.applicant_id;

  v_template:=case
    when v_row.agreement_type='uiux_designer' then 'recruitment_uiux_agreement_verified'
    when v_row.agreement_type='web_developer' then 'recruitment_developer_agreement_verified'
    else 'recruitment_agreement_verified'
  end;
  v_prefix:=case
    when v_row.agreement_type='uiux_designer' then 'uiux-agreement:'
    when v_row.agreement_type='web_developer' then 'developer-agreement:'
    else 'sales-agreement:'
  end;

  perform public.enqueue_notification(
    v_prefix||p_agreement_id::text||':verified',
    v_template,
    a.email,
    null,
    public.recruitment_notification_payload(a)||jsonb_build_object(
      'agreementId',p_agreement_id,
      'agreementNumber',v_row.agreement_number,
      'agreementName',case
        when v_row.agreement_type='uiux_designer' then 'UI/UX Designer Services Agreement'
        when v_row.agreement_type='web_developer' then 'Web Developer Agreement'
        else 'Independent Sales Partner Agreement'
      end,
      'attachExecutedAgreement',true
    ),
    v_now
  );

  return jsonb_build_object(
    'success',true,
    'agreementId',p_agreement_id,
    'status','Verified',
    'executionHash',v_exec_hash,
    'agreementType',v_row.agreement_type,
    'alreadyVerified',false
  );
end;
$function$;

-- Future verification emails remain role-aware and now explicitly tell the
-- candidate that the fully signed PDF is attached.
update public.notification_templates
set body_template=replace(
      body_template,
      'The agreement gate is now complete.',
      'The agreement gate is now complete.\n\nA PDF copy of the fully signed agreement is attached to this email for your records. Please keep it in a safe place for future reference.'
    ),
    html_template=replace(
      html_template,
      'The agreement gate is now complete.<br><br>',
      'The agreement gate is now complete.<br><br><strong>A PDF copy of the fully signed agreement is attached to this email for your records. Please keep it in a safe place for future reference.</strong><br><br>'
    ),
    description='Sent after Admin countersignature and protected agreement verification. Includes the fully signed agreement PDF.'
where template_key='recruitment_agreement_verified';

update public.notification_templates
set body_template=replace(
      body_template,
      'The agreement gate is complete. Your next controlled step is the ProFox Developer Academy account setup and required onboarding.',
      'The agreement gate is complete.\n\nA PDF copy of the fully signed agreement is attached to this email for your records. Please keep it in a safe place for future reference.\n\nYour next controlled step is the ProFox Developer Academy account setup and required onboarding.'
    ),
    html_template=replace(
      html_template,
      'The agreement gate is complete. Your next controlled step is the ProFox Developer Academy account setup and required onboarding.<br><br>',
      'The agreement gate is complete.<br><br><strong>A PDF copy of the fully signed agreement is attached to this email for your records. Please keep it in a safe place for future reference.</strong><br><br>Your next controlled step is the ProFox Developer Academy account setup and required onboarding.<br><br>'
    ),
    description='Developer verified-agreement notification with the fully signed agreement PDF.'
where template_key='recruitment_developer_agreement_verified';

update public.notification_templates
set body_template=replace(
      body_template,
      'The agreement gate is complete.',
      'The agreement gate is complete.\n\nA PDF copy of the fully signed agreement is attached to this email for your records. Please keep it in a safe place for future reference.'
    ),
    html_template=replace(
      html_template,
      'The agreement gate is complete.<br><br>',
      'The agreement gate is complete.<br><br><strong>A PDF copy of the fully signed agreement is attached to this email for your records. Please keep it in a safe place for future reference.</strong><br><br>'
    ),
    description='UI/UX Designer agreement verification notice with the fully signed agreement PDF.'
where template_key='recruitment_uiux_agreement_verified';

insert into public.notification_templates(
  template_key,name,subject_template,body_template,html_template,active,description
)
select
  'recruitment_agreement_executed_copy',
  'Recruitment - executed agreement PDF copy',
  'Your completed ProFox agreement - signed PDF copy',
  $body$Hi {{fullName}},

Your ProFox {{agreementName}} has been fully signed and verified.

A PDF copy of the executed agreement is attached to this email for your records. Please keep it in a safe place for future reference.

Agreement number: {{agreementNumber}}

This PDF contains the frozen agreement terms and the recorded candidate and ProFox signatures. Future changes to ProFox templates or pricing do not change this executed copy.

If you have questions, contact {{supportEmail}}.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$body$,
  $html$<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f5fb"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080;font-size:0;line-height:0">&nbsp;</td></tr><tr><td style="padding:24px 28px 18px;border-bottom:1px solid #eef2f7"><div style="font-size:19px;line-height:26px;font-weight:700;color:#000080">ProFox Web Designer</div><div style="margin-top:4px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.2px;color:#64748b">RECRUITMENT</div></td></tr><tr><td style="padding:28px"><h1 style="margin:0 0 18px;font-size:24px;line-height:32px;font-weight:700;color:#0f172a">Your completed ProFox agreement</h1><p style="margin:0;font-size:15px;line-height:24px;color:#334155">Hi {{fullName}},<br><br>Your ProFox {{agreementName}} has been fully signed and verified.<br><br><strong>A PDF copy of the executed agreement is attached to this email for your records.</strong> Please keep it in a safe place for future reference.</p><div style="margin-top:20px;padding:16px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;font-size:14px;line-height:22px;color:#334155"><strong>Agreement number</strong><br>{{agreementNumber}}</div><p style="margin:20px 0 0;font-size:13px;line-height:21px;color:#64748b">The attachment contains the frozen agreement terms and the recorded candidate and ProFox signatures. Future template or pricing changes do not change this executed copy.<br><br>Questions? Contact {{supportEmail}}.</p></td></tr><tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:19px;color:#64748b">ProFox Recruitment Team</td></tr></table></td></tr></table></body></html>$html$,
  true,
  'One-time delivery of the fully signed PDF for an agreement verified before attachment delivery was enabled.'
where not exists(
  select 1 from public.notification_templates where template_key='recruitment_agreement_executed_copy'
);

-- Backfill only real verified agreements with complete evidence. The dedupe key
-- prevents any duplicate executed-copy notification.
do $block$
declare
  r public.sales_partner_agreements%rowtype;
  a public.applicants%rowtype;
  v_prefix text;
  v_name text;
begin
  for r in
    select *
    from public.sales_partner_agreements s
    where s.status='Verified'
      and s.partner_signed_at is not null
      and coalesce(s.partner_signature_svg,'')<>''
      and coalesce(s.partner_signature_hash,'')<>''
      and s.company_signed_at is not null
      and coalesce(s.company_signature_svg,'')<>''
      and coalesce(s.company_signature_hash,'')<>''
      and s.verified_at is not null
      and coalesce(s.document_hash,'')<>''
      and coalesce(s.execution_hash,'')<>''
  loop
    v_prefix:=case
      when r.agreement_type='uiux_designer' then 'uiux-agreement:'
      when r.agreement_type='web_developer' then 'developer-agreement:'
      else 'sales-agreement:'
    end;
    v_name:=case
      when r.agreement_type='uiux_designer' then 'UI/UX Designer Services Agreement'
      when r.agreement_type='web_developer' then 'Web Developer Agreement'
      else 'Independent Sales Partner Agreement'
    end;

    if not exists(
      select 1 from public.notification_outbox n
      where n.dedupe_key=v_prefix||r.id::text||':executed-copy-v1'
    ) then
      select * into a from public.applicants where id=r.applicant_id;
      if found and coalesce(trim(a.email),'')<>'' then
        perform public.enqueue_notification(
          v_prefix||r.id::text||':executed-copy-v1',
          'recruitment_agreement_executed_copy',
          lower(trim(a.email)),
          null,
          public.recruitment_notification_payload(a)||jsonb_build_object(
            'agreementId',r.id,
            'agreementNumber',r.agreement_number,
            'agreementName',v_name,
            'attachExecutedAgreement',true
          ),
          now()
        );
      end if;
    end if;
  end loop;
end;
$block$;

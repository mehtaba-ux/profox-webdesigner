-- PF UI/UX Designer Team — runtime compatibility closure.
-- Finalizes canonical notification templates, role-aware agreement messaging/admin data,
-- and designer-specific recruitment routing. No production data/system duplication.

-- Normalize all UI/UX notification templates into the existing canonical schema.
insert into public.notification_templates(template_key,name,subject_template,body_template,active,description,updated_at) values
('recruitment_uiux_application_received','Recruitment — UI/UX application received','We received your ProFox UI/UX Designer application','Hi {{fullName}},\n\nThank you for applying for {{roleTitle}}. Your application reference is {{applicationReference}}. We will review your portfolio and application evidence through our structured hiring process.\n\nProFox Recruitment',true,'UI/UX Designer application receipt.',now()),
('recruitment_uiux_portfolio_review','Recruitment — UI/UX portfolio review','Your ProFox UI/UX application is in portfolio review','Hi {{fullName}},\n\nYour {{roleTitle}} application has moved to Portfolio Review. No action is required unless our team contacts you for clarification.\n\nProFox Recruitment',true,'UI/UX Designer portfolio review update.',now()),
('recruitment_uiux_assessment','Recruitment — UI/UX assessment','Next step in your ProFox UI/UX Designer application','Hi {{fullName}},\n\nYour application has progressed to {{stage}}. Follow the instructions provided by the ProFox recruitment team and submit only the requested evidence.\n\nProFox Recruitment',true,'UI/UX Designer assessment-stage update.',now()),
('recruitment_uiux_selected','Recruitment — UI/UX selected','You have been selected for ProFox UI/UX Designer onboarding','Hi {{fullName}},\n\nYou have passed the required UI/UX recruitment evaluations. The next controlled step is your ProFox UI/UX Designer agreement and onboarding.\n\nProFox Recruitment',true,'UI/UX Designer selection notice.',now()),
('recruitment_uiux_agreement_ready','Recruitment — UI/UX agreement ready','Your ProFox UI/UX Designer agreement is ready','Hi {{fullName}},\n\nYour UI/UX Designer agreement is ready. Review the complete agreement and sign using the secure link below.\n\nSecure agreement link: {{agreementUrl}}\nAgreement: {{agreementNumber}}\n\nProFox',true,'UI/UX Designer agreement issuance.',now()),
('recruitment_uiux_agreement_signature_received','Recruitment — UI/UX signature received','We received your ProFox UI/UX Designer agreement signature','Hi {{fullName}},\n\nWe received your electronic signature on the ProFox UI/UX Designer Services Agreement. ProFox will review and countersign the exact issued agreement before Design Academy access is unlocked.\n\nProFox',true,'UI/UX Designer agreement signature receipt.',now()),
('recruitment_uiux_agreement_verified','Recruitment — UI/UX agreement verified','Your ProFox UI/UX Designer agreement is complete','Hi {{fullName}},\n\nYour ProFox UI/UX Designer Services Agreement has been countersigned and verified. The agreement gate is complete. The next onboarding step is your secure ProFox Design Academy account and required training.\n\nProFox',true,'UI/UX Designer agreement verification notice.',now()),
('recruitment_uiux_account_invite','Recruitment — UI/UX Design Academy account','Set up your ProFox Design Academy account','Hi {{fullName}},\n\nYour verified UI/UX Designer agreement is complete. Set up your ProFox Design Academy account using the newest secure link below.\n\n{{accountInviteUrl}}\n\nProduction client-work access remains locked until the required Design Academy, Final Approval and activation gates are complete.\n\nProFox',true,'UI/UX Designer onboarding account invitation.',now()),
('recruitment_uiux_design_academy','Recruitment — UI/UX Design Academy','Your ProFox Design Academy onboarding is ready','Hi {{fullName}},\n\nYour UI/UX Design onboarding account is ready. Complete the required ProFox Design Academy modules and final certification before production activation.\n\nProFox',true,'UI/UX Designer Academy-stage update.',now()),
('recruitment_uiux_final_review','Recruitment — UI/UX final review','Your ProFox UI/UX onboarding is in final review','Hi {{fullName}},\n\nYour required Design Academy work has been submitted for Final Approval. Production access remains locked until Management approval.\n\nProFox',true,'UI/UX Designer final-review update.',now()),
('recruitment_uiux_activated','Recruitment — UI/UX activated','Welcome to the active ProFox UI/UX Design team','Hi {{fullName}},\n\nYour UI/UX Designer account is now active. Sign in to ProFox and use My Work / Design Delivery as the source of truth for assigned client work.\n\nProFox',true,'UI/UX Designer activation notice.',now())
on conflict(template_key) do update set
  name=excluded.name,
  subject_template=excluded.subject_template,
  body_template=excluded.body_template,
  active=true,
  description=excluded.description,
  updated_at=now();

-- The compatibility trigger has already mapped alternate fields into canonical fields.
-- Remove all temporary columns so the final schema remains exactly on the existing notification-template model.
drop trigger if exists trg_uiux_notification_template_compatibility_map on public.notification_templates;
drop function if exists public.uiux_notification_template_compatibility_map();
alter table public.notification_templates
  drop column if exists channel,
  drop column if exists subject,
  drop column if exists body_text,
  drop column if exists body_html,
  drop column if exists variables;

-- Public agreement reader remains API-compatible, but now exposes role metadata to the role-aware document renderer.
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
    values(v_row.id,'Viewed','Candidate',coalesce(v_row.partner_snapshot->>'email',''),jsonb_build_object('agreementType',v_row.agreement_type));
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

-- Existing Admin list function is kept API-compatible while adding role metadata for one consolidated Candidate Agreements UI.
create or replace function public.admin_list_sales_partner_agreements()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'agreementNumber',a.agreement_number,'applicantId',a.applicant_id,'candidateName',a.partner_snapshot->>'fullName',
      'candidateEmail',a.partner_snapshot->>'email','status',a.status,'templateVersion',a.template_version,'sentAt',a.sent_at,
      'partnerSignedAt',a.partner_signed_at,'verifiedAt',a.verified_at,'documentHash',a.document_hash,
      'agreementType',a.agreement_type,'targetRole',a.target_role,'targetDepartment',a.target_department,
      'jobTitle',a.hiring_snapshot->>'jobTitle'
    ) order by a.created_at desc)
    from public.sales_partner_agreements a
  ),'[]'::jsonb);
end;
$$;

-- Resend keeps the same secure agreement record/token-rotation engine but chooses the correct role notification.
create or replace function public.admin_resend_sales_partner_agreement(p_agreement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_row public.sales_partner_agreements%rowtype; v_app public.applicants%rowtype; v_token uuid:=gen_random_uuid();
  v_url text; v_base text; v_template text; v_prefix text;
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;
  select * into v_row from public.sales_partner_agreements where id=p_agreement_id for update;
  if not found or v_row.status not in('Sent','Viewed') then raise exception 'Only an unsigned active agreement can be resent.'; end if;
  select * into v_app from public.applicants where id=v_row.applicant_id;
  update public.sales_partner_agreements
    set token_hash=encode(extensions.digest(v_token::text,'sha256'),'hex'),token_expires_at=now()+interval '14 days',status='Sent',sent_at=now(),updated_at=now()
  where id=p_agreement_id;
  select coalesce(config_value->>'publicBaseUrl','https://www.profoxwebdesigner.com') into v_base from public.system_configuration where config_key='notification_settings';
  v_url:=rtrim(coalesce(nullif(v_base,''),'https://www.profoxwebdesigner.com'),'/')||'/agreement/sign/'||v_token::text;
  v_template:=case when v_row.agreement_type='uiux_designer' then 'recruitment_uiux_agreement_ready' else 'recruitment_agreement_ready' end;
  v_prefix:=case when v_row.agreement_type='uiux_designer' then 'uiux-agreement:' else 'sales-agreement:' end;
  perform public.enqueue_notification(v_prefix||p_agreement_id::text||':resent:'||extract(epoch from clock_timestamp())::bigint,v_template,v_app.email,null,
    public.recruitment_notification_payload(v_app)||jsonb_build_object('agreementUrl',v_url,'agreementNumber',v_row.agreement_number,'agreementId',p_agreement_id),now());
  insert into public.sales_agreement_events(agreement_id,event_type,actor_type,actor_user_id,actor_email,metadata)
  values(p_agreement_id,'Resent','Admin',auth.uid(),coalesce((select email from public.user_profiles where id=auth.uid()),''),jsonb_build_object('agreementType',v_row.agreement_type));
  return jsonb_build_object('agreementId',p_agreement_id,'signingUrl',v_url,'agreementType',v_row.agreement_type);
end;
$$;

-- Candidate signature receipt is agreement-type aware. The Edge Function API remains unchanged.
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
  values(v_row.id,'Candidate Signed','Candidate',coalesce(v_row.partner_snapshot->>'email',''),left(coalesce(p_ip,''),200),left(coalesce(p_user_agent,''),1000),
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

-- Countersign/verification chooses the correct onboarding message while preserving the existing protected agreement gate.
create or replace function public.admin_verify_sales_partner_agreement(p_agreement_id uuid,p_signer_name text,p_signer_title text,p_signature_svg text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_row public.sales_partner_agreements%rowtype; a public.applicants%rowtype; v_sig_hash text; v_exec_hash text; v_template text; v_prefix text;
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;
  select * into v_row from public.sales_partner_agreements where id=p_agreement_id for update;
  if not found or v_row.status<>'Partner Signed' then raise exception 'Candidate signature is required before company verification.'; end if;
  if coalesce(trim(p_signer_name),'')='' or coalesce(trim(p_signer_title),'')='' then raise exception 'Company signer name and title are required.'; end if;
  if coalesce(length(p_signature_svg),0)<100 or length(p_signature_svg)>500000 or left(ltrim(p_signature_svg),4)<>'<svg' then raise exception 'A valid company signature is required.'; end if;
  v_sig_hash:=encode(extensions.digest(p_signature_svg,'sha256'),'hex');
  v_exec_hash:=encode(extensions.digest(v_row.document_hash||'|'||coalesce(v_row.partner_signature_hash,'')||'|'||v_sig_hash||'|'||v_row.partner_signed_at::text||'|'||now()::text,'sha256'),'hex');
  update public.sales_partner_agreements set status='Verified',company_signer_name=trim(p_signer_name),company_signer_title=trim(p_signer_title),
    company_signature_svg=p_signature_svg,company_signature_hash=v_sig_hash,company_signed_at=now(),company_signer_user_id=auth.uid(),verified_at=now(),
    verified_by=auth.uid(),execution_hash=v_exec_hash,updated_at=now() where id=p_agreement_id;
  insert into public.sales_agreement_events(agreement_id,event_type,actor_type,actor_user_id,actor_email,metadata)
  values(p_agreement_id,'Verified','Admin',auth.uid(),coalesce((select email from public.user_profiles where id=auth.uid()),''),
    jsonb_build_object('companySignatureHash',v_sig_hash,'executionHash',v_exec_hash,'agreementType',v_row.agreement_type));
  select * into a from public.applicants where id=v_row.applicant_id;
  perform set_config('profox.agreement_workflow_rpc','1',true);
  update public.applicants set agreement_status='signed',updated_at=now() where id=v_row.applicant_id;
  v_template:=case when v_row.agreement_type='uiux_designer' then 'recruitment_uiux_agreement_verified' else 'recruitment_agreement_verified' end;
  v_prefix:=case when v_row.agreement_type='uiux_designer' then 'uiux-agreement:' else 'sales-agreement:' end;
  perform public.enqueue_notification(v_prefix||p_agreement_id::text||':verified',v_template,a.email,null,
    public.recruitment_notification_payload(a)||jsonb_build_object('agreementNumber',v_row.agreement_number),now());
  return jsonb_build_object('success',true,'agreementId',p_agreement_id,'status','Verified','executionHash',v_exec_hash,'agreementType',v_row.agreement_type);
end;
$$;

-- Role-aware initial Admin routing. Sales stays in Sales Recruitment; UI/UX opens the dedicated UI/UX hiring workspace.
create or replace function public.queue_recruitment_stage_notifications()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_admin record; v_template text; v_cycle text:=md5(clock_timestamp()::text||random()::text||new.id::text);
  v_secure_issue boolean:=coalesce(current_setting('profox.agreement_issue_stage',true),'')='1';
  v_role text:=coalesce(public.career_job_system_role(new.career_job_id),'sales');
  v_admin_path text;
begin
  v_admin_path:=case when v_role='uiux_designer' then '/admin/uiux-recruitment' else '/admin/app/recruitment?tab=recruitment' end;
  if tg_op='INSERT' then
    if v_role='sales' then
      if new.stage='Video Pending' then
        perform public.queue_recruitment_email(new,'recruitment_video_pending','video-pending-'||v_cycle,now());
        perform public.queue_recruitment_video_pending_followups(new,v_cycle);
      else
        perform public.queue_recruitment_email(new,'recruitment_application_received','application-received',now());
      end if;
    elsif v_role='uiux_designer' then
      perform public.queue_recruitment_email(new,'recruitment_uiux_application_received','application-received',now());
    end if;
    for v_admin in select id from public.user_profiles where role='admin' and status='active' loop
      perform public.enqueue_in_app_notification(v_admin.id,'Recruitment',
        'New '||coalesce((select title from public.career_jobs where id=new.career_job_id),new.position)||' application',
        new.full_name||' submitted application '||coalesce(new.application_reference,'')||'.',v_admin_path,
        'recruitment:new-applicant:'||new.id::text||':'||v_admin.id::text);
    end loop;
    return new;
  end if;
  if new.refusal_reason is distinct from old.refusal_reason and coalesce(trim(new.refusal_reason),'')<>'' then
    if v_role='sales' then perform public.cancel_recruitment_video_pending_followups(new.id,'Candidate application was closed.'); end if;
    perform public.queue_recruitment_email(new,'recruitment_not_selected','not-selected',now());
    return new;
  end if;
  if new.stage is distinct from old.stage then
    if v_role='sales' then
      if old.stage='Video Pending' and new.stage<>'Video Pending' then perform public.cancel_recruitment_video_pending_followups(new.id,'Candidate progressed beyond Video Pending.'); end if;
      if new.stage='Agreement Pending' and old.stage='Selected' and coalesce(new.agreement_status,'not_sent')='not_sent' then
        perform public.create_sales_partner_agreement_internal(new.id); v_secure_issue:=true;
      end if;
      v_template:=case new.stage
        when 'New Application' then 'recruitment_application_received'
        when 'Video Pending' then 'recruitment_video_pending'
        when 'Video Review' then 'recruitment_video_received'
        when 'Initial Screening' then 'recruitment_initial_screening'
        when 'Shortlisted' then 'recruitment_shortlisted'
        when 'Sales Assessment' then 'recruitment_sales_assessment'
        when 'Lead Research Test' then 'recruitment_lead_research'
        when 'CRM Assessment' then 'recruitment_crm_assessment'
        when 'Selected' then 'recruitment_selected'
        when 'Agreement Pending' then case when v_secure_issue then null else 'recruitment_agreement_pending' end
        when 'One-Day Training' then 'recruitment_training'
        when 'Final Approval' then 'recruitment_final_review'
        when 'Ready for System Access' then 'recruitment_final_approved'
        when 'Activated' then 'recruitment_activated'
        else null end;
      if v_template is not null then perform public.queue_recruitment_email(new,v_template,'stage-'||lower(replace(new.stage,' ','-'))||'-'||v_cycle,now()); end if;
      if new.stage='Video Pending' then perform public.queue_recruitment_video_pending_followups(new,v_cycle); end if;
    elsif v_role='uiux_designer' then
      v_template:=case new.stage
        when 'Portfolio Review' then 'recruitment_uiux_portfolio_review'
        when 'Initial Screening' then 'recruitment_uiux_assessment'
        when 'Design Assessment' then 'recruitment_uiux_assessment'
        when 'Figma Practical' then 'recruitment_uiux_assessment'
        when 'Design Interview' then 'recruitment_uiux_assessment'
        when 'Selected' then 'recruitment_uiux_selected'
        when 'Design Academy' then 'recruitment_uiux_design_academy'
        when 'Final Approval' then 'recruitment_uiux_final_review'
        when 'Activated' then 'recruitment_uiux_activated'
        else null end;
      if v_template is not null then perform public.queue_recruitment_email(new,v_template,
        'stage-'||lower(regexp_replace(new.stage,'[^a-zA-Z0-9]+','-','g'))||'-'||v_cycle,now()); end if;
    end if;
  end if;
  return new;
end;
$$;

-- Keep public/Admin stable API grants intact after replacements.
revoke all on function public.public_get_sales_partner_agreement(uuid) from public;
grant execute on function public.public_get_sales_partner_agreement(uuid) to anon,authenticated;
revoke all on function public.admin_list_sales_partner_agreements() from public,anon;
grant execute on function public.admin_list_sales_partner_agreements() to authenticated;
revoke all on function public.admin_resend_sales_partner_agreement(uuid) from public,anon;
grant execute on function public.admin_resend_sales_partner_agreement(uuid) to authenticated;
revoke all on function public.admin_verify_sales_partner_agreement(uuid,text,text,text) from public,anon;
grant execute on function public.admin_verify_sales_partner_agreement(uuid,text,text,text) to authenticated;
revoke all on function public.queue_recruitment_stage_notifications() from public,anon,authenticated;

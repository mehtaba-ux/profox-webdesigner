-- Developer agreement setup on the shared candidate agreement engine.
insert into public.sales_agreement_templates(
  template_key,version,version_label,status,title,subtitle,introduction,sections,acknowledgements,agreement_type,target_role,published_at,updated_at
)
select
  'web_developer_contractor',1,'v1.0','Published','ProFox Web Developer Services Agreement',
  'Development Delivery · Security · Confidentiality · Intellectual Property',
  'This agreement defines the controlled working relationship for an approved ProFox Web Developer. Project scope, client information, approved design, code/repository access and delivery instructions remain governed by the ProFox platform, assigned project records and Development Delivery controls.',
  jsonb_build_array(
    jsonb_build_object('heading','Role & authorized work','body','The Developer performs only work assigned through ProFox and follows approved scope, requirements, design handoff and authorized delivery instructions.'),
    jsonb_build_object('heading','Confidentiality & client data','body','Client information, credentials, source code, repositories, content, designs, data and integrations are confidential and limited to approved work.'),
    jsonb_build_object('heading','Source code & intellectual property','body','Assigned project source, configuration, scripts, documentation and delivery artifacts remain in approved ProFox/client repositories and workflows. Unauthorized reuse or distribution is prohibited.'),
    jsonb_build_object('heading','Engineering quality & review','body','Production work must satisfy approved scope/design, self-QA, code review, testing, accessibility, performance, security, independent QA and controlled handover requirements.'),
    jsonb_build_object('heading','Git, deployment & access','body','Use approved repositories, feature branches, pull requests and deployment environments. Do not bypass required checks, review or access controls, and never commit secrets.'),
    jsonb_build_object('heading','Tools, security & AI','body','Use approved tools and do not upload confidential source, credentials or sensitive client data to unapproved services. AI assistance does not replace human review and testing.'),
    jsonb_build_object('heading','Communication, records & handover','body','Keep assigned work, blockers, pull requests, test/build/staging evidence and documentation current. Client handover requires assigned Project Manager or authorized Management approval.'),
    jsonb_build_object('heading','End of access','body','ProFox may suspend or remove system, repository and client access when the engagement ends or controlled security/quality requirements are not met.')
  ),
  jsonb_build_array(
    jsonb_build_object('key','scope','label','I will work only within approved ProFox assignments, scope and authority.'),
    jsonb_build_object('key','confidentiality','label','I accept the confidentiality, source-code, credential and client-data requirements.'),
    jsonb_build_object('key','quality','label','I will follow controlled development, review, testing, QA and release gates.'),
    jsonb_build_object('key','git','label','I will use approved repositories/branches and will not bypass protected review or deployment controls.'),
    jsonb_build_object('key','handover','label','I understand that final client handover requires Management approval.'),
    jsonb_build_object('key','security','label','I will follow ProFox security and approved AI/tool requirements.')
  ),
  'web_developer','developer',now(),now()
where not exists(
  select 1 from public.sales_agreement_templates where template_key='web_developer_contractor' and version=1
);

insert into public.notification_templates(template_key,name,subject_template,body_template,description,active,updated_at) values
('recruitment_developer_agreement_ready','Recruitment — Developer agreement ready','Your ProFox Web Developer agreement is ready','Hi {{fullName}},\n\nYour Web Developer agreement is ready. Review and sign the current agreement using this secure link: {{agreementUrl}}\n\nAgreement: {{agreementNumber}}','Developer agreement signing notification.',true,now()),
('recruitment_developer_account_invite','Recruitment — Developer Academy account invite','Set up your ProFox Developer Academy account','Hi {{fullName}},\n\nYour verified agreement is complete. Set up your ProFox Developer Academy account using the newest secure link: {{accountInviteUrl}}','Developer Academy account setup notification.',true,now()),
('recruitment_developer_agreement_verified','Recruitment — Developer agreement verified','Your ProFox Web Developer agreement is verified','Hi {{fullName}},\n\nYour Web Developer agreement has been verified. Your next controlled step is Developer Academy account setup.','Developer agreement verification notification.',true,now())
on conflict(template_key) do update set
  name=excluded.name,subject_template=excluded.subject_template,body_template=excluded.body_template,
  description=excluded.description,active=true,updated_at=now();

create or replace function public.create_web_developer_agreement_internal(p_applicant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  a public.applicants%rowtype;
  j public.career_jobs%rowtype;
  t public.sales_agreement_templates%rowtype;
  ctx jsonb;
  token uuid:=gen_random_uuid();
  token_hash text;
  number text;
  agreement_id uuid;
  base text;
  sign_url text;
  doc_hash text;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into a from public.applicants where id=p_applicant_id for update;
  if not found then raise exception 'Candidate not found.'; end if;
  select * into j from public.career_jobs where id=a.career_job_id;
  if coalesce(j.role_details->>'systemRole','')<>'developer' then raise exception 'Candidate is not in the Web Developer workflow.'; end if;
  if coalesce(trim(a.refusal_reason),'')<>'' then raise exception 'A closed candidate cannot receive an agreement.'; end if;
  if a.stage not in('Selected','Agreement Pending') then raise exception 'Candidate must be Selected before the Web Developer agreement is issued.'; end if;
  if exists(select 1 from public.sales_partner_agreements x where x.applicant_id=a.id and x.status in('Partner Signed','Verified') and x.agreement_type='web_developer') then
    raise exception 'A signed Web Developer agreement already exists.';
  end if;

  select * into t from public.sales_agreement_templates
  where template_key='web_developer_contractor' and status='Published'
  order by version desc limit 1;
  if not found then raise exception 'Published Web Developer agreement template is unavailable.'; end if;

  ctx:=public.build_candidate_agreement_snapshot(a.id);
  number:='PF-DEV-AGR-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  token_hash:=encode(extensions.digest(token::text,'sha256'),'hex');
  doc_hash:=encode(extensions.digest((jsonb_build_object(
    'agreementNumber',number,'templateVersion',t.version,'partner',ctx->'partner','company',ctx->'company',
    'commercial',ctx->'commercial','training',ctx->'training','hiring',ctx->'hiring',
    'template',jsonb_build_object('title',t.title,'subtitle',t.subtitle,'introduction',t.introduction,'sections',t.sections,'acknowledgements',t.acknowledgements)
  ))::text,'sha256'),'hex');

  update public.sales_partner_agreements
  set status='Superseded',superseded_at=now(),updated_at=now()
  where applicant_id=a.id and status in('Sent','Viewed') and agreement_type='web_developer';

  insert into public.sales_partner_agreements(
    agreement_number,applicant_id,template_id,template_version,status,token_hash,token_expires_at,
    partner_snapshot,company_snapshot,commercial_snapshot,training_snapshot,hiring_snapshot,template_snapshot,
    document_hash,agreement_type,career_job_id,target_role,target_department
  ) values(
    number,a.id,t.id,t.version,'Sent',token_hash,now()+interval '14 days',
    ctx->'partner',ctx->'company',ctx->'commercial',ctx->'training',ctx->'hiring',
    jsonb_build_object('title',t.title,'subtitle',t.subtitle,'introduction',t.introduction,'sections',t.sections,'acknowledgements',t.acknowledgements,'versionLabel',t.version_label),
    doc_hash,'web_developer',j.id,'developer','Development'
  ) returning id into agreement_id;

  insert into public.sales_agreement_events(agreement_id,event_type,actor_type,actor_user_id,actor_email,metadata)
  values(agreement_id,'Issued','Admin',auth.uid(),coalesce((select email from public.user_profiles where id=auth.uid()),''),jsonb_build_object('templateVersion',t.version,'documentHash',doc_hash,'agreementType','web_developer'));

  select coalesce(config_value->>'publicBaseUrl','https://www.profoxwebdesigner.com') into base
  from public.system_configuration where config_key='notification_settings';
  sign_url:=rtrim(coalesce(nullif(base,''),'https://www.profoxwebdesigner.com'),'/')||'/agreement/sign/'||token::text;
  perform public.enqueue_notification('developer-agreement:'||agreement_id::text||':issued','recruitment_developer_agreement_ready',a.email,null,public.recruitment_notification_payload(a)||jsonb_build_object('agreementUrl',sign_url,'agreementNumber',number,'agreementId',agreement_id),now());
  perform set_config('profox.agreement_issue_stage','1',true);
  perform set_config('profox.agreement_workflow_rpc','1',true);
  update public.applicants set stage='Agreement Pending',agreement_status='sent',updated_at=now() where id=a.id;
  return jsonb_build_object('agreementId',agreement_id,'agreementNumber',number,'signingUrl',sign_url,'documentHash',doc_hash,'agreementType','web_developer');
end;$$;

revoke all on function public.create_web_developer_agreement_internal(uuid) from public,anon,authenticated;
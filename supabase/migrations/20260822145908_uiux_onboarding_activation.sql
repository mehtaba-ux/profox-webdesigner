-- PF UI/UX Designer Team — Agreement, Design Academy and controlled activation
-- Reuses the existing agreement signing records/audit trail and training tables.
-- Adds role/track context so Sales Academy and Design Academy remain isolated without duplicate LMS/signing engines.

-- AGREEMENT CONTEXT -----------------------------------------------------------
alter table public.sales_agreement_templates
  add column if not exists agreement_type text not null default 'sales_partner',
  add column if not exists target_role text not null default 'sales';

alter table public.sales_partner_agreements
  add column if not exists agreement_type text not null default 'sales_partner',
  add column if not exists career_job_id uuid references public.career_jobs(id) on delete set null,
  add column if not exists target_role text not null default 'sales',
  add column if not exists target_department text not null default 'Sales';

update public.sales_agreement_templates set agreement_type='sales_partner',target_role='sales' where template_key='independent_sales_partner';
update public.sales_partner_agreements set agreement_type=coalesce(nullif(agreement_type,''),'sales_partner'),target_role=coalesce(nullif(target_role,''),'sales'),target_department=coalesce(nullif(target_department,''),'Sales');

insert into public.sales_agreement_templates(
  template_key,version,version_label,status,title,subtitle,introduction,sections,acknowledgements,agreement_type,target_role,published_at,updated_at
)
select
  'uiux_designer_contractor',1,'v1.0','Published','ProFox UI/UX Designer Services Agreement','UI/UX Design Delivery · Confidentiality · Intellectual Property',
  'This agreement defines the controlled working relationship for an approved ProFox UI/UX Designer. Project scope, client information and delivery instructions remain governed by the ProFox platform, assigned project records and PF-SOP-08.',
  jsonb_build_array(
    jsonb_build_object('heading','Role & authorized work','body','The Designer performs only work assigned through ProFox and follows the approved project scope, package, requirements, PF-SOP-08 and authorized delivery instructions. The Designer may not promise prices, scope, delivery dates or contractual terms to clients.'),
    jsonb_build_object('heading','Confidentiality & client data','body','Client information, credentials, research, content, brand assets, designs and business information are confidential. Access must be limited to approved tools and assigned work, and must not be shared outside authorized ProFox collaboration.'),
    jsonb_build_object('heading','Design files & intellectual property','body','Work created for assigned ProFox client projects, including source design files, components, prototypes and related delivery artifacts, must remain in the approved ProFox/client workflow and may not be reused or distributed outside authorized purposes. Applicable ownership follows the client/ProFox commercial arrangement.'),
    jsonb_build_object('heading','Quality & review','body','Production work must follow PF-SOP-08, required accessibility intent, responsive states, governed design-system standards, independent review, client approval and development-ready handoff requirements. Review feedback must be resolved through the controlled task workflow.'),
    jsonb_build_object('heading','Tools, security & AI','body','Use only approved accounts, storage and collaboration tools. Do not upload client-confidential or sensitive material to unapproved AI or third-party services. AI may assist research, drafting or QA but does not replace required human quality, accessibility, client or handoff approvals.'),
    jsonb_build_object('heading','Availability, communication & records','body','Keep assigned work, status, blockers, evidence and handoff references current in ProFox. Project communication and approvals must remain traceable in the approved systems rather than private or unrecorded channels.'),
    jsonb_build_object('heading','End of access','body','ProFox may suspend or remove system/client access when the engagement ends, security requires it, or controlled onboarding/quality requirements are not met. Confidentiality obligations continue after access ends.')
  ),
  jsonb_build_array(
    jsonb_build_object('key','scope','label','I will work only within approved ProFox assignments, scope and authority.'),
    jsonb_build_object('key','confidentiality','label','I accept the confidentiality, client-data and approved-tool requirements.'),
    jsonb_build_object('key','ip','label','I accept the design-file and intellectual-property handling requirements.'),
    jsonb_build_object('key','quality','label','I will follow PF-SOP-08, controlled review and developer-handoff requirements.'),
    jsonb_build_object('key','security','label','I will follow ProFox security and approved-AI/tool requirements.')
  ),
  'uiux_designer','uiux_designer',now(),now()
where not exists(select 1 from public.sales_agreement_templates where template_key='uiux_designer_contractor' and version=1);

create or replace function public.build_candidate_agreement_snapshot(p_applicant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare a public.applicants%rowtype; j public.career_jobs%rowtype; v_company jsonb:='{}'::jsonb; v_sales jsonb;
begin
  select * into a from public.applicants where id=p_applicant_id; if not found then raise exception 'Candidate not found.'; end if;
  select * into j from public.career_jobs where id=a.career_job_id;
  begin v_sales:=public.build_sales_agreement_dynamic_snapshot(p_applicant_id); v_company:=coalesce(v_sales->'company','{}'::jsonb); exception when others then v_company:='{}'::jsonb; end;
  return jsonb_build_object(
    'partner',jsonb_build_object('fullName',a.full_name,'email',a.email,'phone',a.phone,'country',a.country,'timezone',a.timezone,'applicationReference',a.application_reference,'portfolioUrl',a.portfolio_url),
    'company',v_company,
    'commercial',jsonb_build_object('engagementType',coalesce(j.engagement_type,'Contract'),'compensation',coalesce(j.compensation,'[]'::jsonb),'note','Commercial/project terms are controlled by the approved ProFox agreement/job/project records.'),
    'training',jsonb_build_object('track',coalesce(j.role_details->>'trainingTrack','general'),'required',true,'productionAccess','Locked until final approval and activation'),
    'hiring',jsonb_build_object('jobId',j.id,'jobTitle',coalesce(j.title,a.position),'systemRole',coalesce(j.role_details->>'systemRole','pending'),'department',coalesce(j.role_details->>'department',j.department),'applicationReference',a.application_reference,'selectedStage',a.stage)
  );
end;
$$;

create or replace function public.create_uiux_designer_agreement_internal(p_applicant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  a public.applicants%rowtype; j public.career_jobs%rowtype; t public.sales_agreement_templates%rowtype; ctx jsonb;
  token uuid:=gen_random_uuid(); token_hash text; number text; agreement_id uuid; base text; sign_url text; doc_hash text;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into a from public.applicants where id=p_applicant_id for update; if not found then raise exception 'Candidate not found.'; end if;
  select * into j from public.career_jobs where id=a.career_job_id;
  if coalesce(j.role_details->>'systemRole','')<>'uiux_designer' then raise exception 'Candidate is not in the UI/UX Designer workflow.'; end if;
  if coalesce(trim(a.refusal_reason),'')<>'' then raise exception 'A closed candidate cannot receive an agreement.'; end if;
  if a.stage not in('Selected','Agreement Pending') then raise exception 'Candidate must be Selected before the UI/UX Designer agreement is issued.'; end if;
  if exists(select 1 from public.sales_partner_agreements x where x.applicant_id=a.id and x.status in('Partner Signed','Verified') and x.agreement_type='uiux_designer') then raise exception 'A signed UI/UX Designer agreement already exists.'; end if;

  select * into t from public.sales_agreement_templates where template_key='uiux_designer_contractor' and status='Published' order by version desc limit 1;
  if not found then raise exception 'Published UI/UX Designer agreement template is unavailable.'; end if;
  ctx:=public.build_candidate_agreement_snapshot(a.id);
  number:='PF-UIUX-AGR-'||to_char(clock_timestamp(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  token_hash:=encode(extensions.digest(token::text,'sha256'),'hex');
  doc_hash:=encode(extensions.digest((jsonb_build_object('agreementNumber',number,'templateVersion',t.version,'partner',ctx->'partner','company',ctx->'company','commercial',ctx->'commercial','training',ctx->'training','hiring',ctx->'hiring','template',jsonb_build_object('title',t.title,'subtitle',t.subtitle,'introduction',t.introduction,'sections',t.sections,'acknowledgements',t.acknowledgements)))::text,'sha256'),'hex');

  update public.sales_partner_agreements set status='Superseded',superseded_at=now(),updated_at=now()
  where applicant_id=a.id and status in('Sent','Viewed') and agreement_type='uiux_designer';

  insert into public.sales_partner_agreements(
    agreement_number,applicant_id,template_id,template_version,status,token_hash,token_expires_at,partner_snapshot,company_snapshot,
    commercial_snapshot,training_snapshot,hiring_snapshot,template_snapshot,document_hash,agreement_type,career_job_id,target_role,target_department
  ) values(
    number,a.id,t.id,t.version,'Sent',token_hash,now()+interval '14 days',ctx->'partner',ctx->'company',ctx->'commercial',ctx->'training',ctx->'hiring',
    jsonb_build_object('title',t.title,'subtitle',t.subtitle,'introduction',t.introduction,'sections',t.sections,'acknowledgements',t.acknowledgements,'versionLabel',t.version_label),
    doc_hash,'uiux_designer',j.id,'uiux_designer','UI/UX Design'
  ) returning id into agreement_id;

  insert into public.sales_agreement_events(agreement_id,event_type,actor_type,actor_user_id,actor_email,metadata)
  values(agreement_id,'Issued','Admin',auth.uid(),coalesce((select email from public.user_profiles where id=auth.uid()),''),jsonb_build_object('templateVersion',t.version,'documentHash',doc_hash,'agreementType','uiux_designer'));

  select coalesce(config_value->>'publicBaseUrl','https://www.profoxwebdesigner.com') into base from public.system_configuration where config_key='notification_settings';
  sign_url:=rtrim(coalesce(nullif(base,''),'https://www.profoxwebdesigner.com'),'/')||'/agreement/sign/'||token::text;
  perform public.enqueue_notification('uiux-agreement:'||agreement_id::text||':issued','recruitment_uiux_agreement_ready',a.email,null,public.recruitment_notification_payload(a)||jsonb_build_object('agreementUrl',sign_url,'agreementNumber',number,'agreementId',agreement_id),now());
  perform set_config('profox.agreement_issue_stage','1',true);
  perform set_config('profox.agreement_workflow_rpc','1',true);
  update public.applicants set stage='Agreement Pending',agreement_status='sent',updated_at=now() where id=a.id;
  return jsonb_build_object('agreementId',agreement_id,'agreementNumber',number,'signingUrl',sign_url,'documentHash',doc_hash,'agreementType','uiux_designer');
end;
$$;

create or replace function public.admin_issue_candidate_agreement(p_applicant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare a public.applicants%rowtype; v_role text;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into a from public.applicants where id=p_applicant_id; if not found then raise exception 'Candidate not found.'; end if;
  v_role:=coalesce(public.career_job_system_role(a.career_job_id),'sales');
  if v_role='uiux_designer' then return public.create_uiux_designer_agreement_internal(a.id); end if;
  if v_role='sales' then return public.admin_issue_sales_partner_agreement(a.id); end if;
  raise exception 'No approved agreement workflow is configured for this role.';
end;
$$;

insert into public.notification_templates(template_key,channel,subject,body_text,body_html,variables,active,updated_at) values
('recruitment_uiux_agreement_ready','email','Your ProFox UI/UX Designer agreement is ready','Hi {{fullName}},\n\nYour UI/UX Designer agreement is ready. Review and sign the current agreement using this secure link: {{agreementUrl}}\n\nAgreement: {{agreementNumber}}','<p>Hi {{fullName}},</p><p>Your UI/UX Designer agreement is ready. Review and sign the current agreement using the secure link below.</p><p><a href="{{agreementUrl}}">Review & sign agreement</a></p><p>Agreement: {{agreementNumber}}</p>',array['fullName','agreementUrl','agreementNumber'],true,now()),
('recruitment_uiux_account_invite','email','Set up your ProFox Design Academy account','Hi {{fullName}},\n\nYour verified agreement is complete. Set up your ProFox Design Academy account using the newest secure link: {{accountInviteUrl}}','<p>Hi {{fullName}},</p><p>Your verified agreement is complete. Set up your ProFox Design Academy account using the newest secure link:</p><p><a href="{{accountInviteUrl}}">Set up Design Academy account</a></p>',array['fullName','accountInviteUrl'],true,now())
on conflict(template_key) do update set subject=excluded.subject,body_text=excluded.body_text,body_html=excluded.body_html,variables=excluded.variables,active=true,updated_at=now();

-- Make the existing signing functions agreement-type aware while keeping their API stable for the current signing page/Edge Function.
create or replace function public.service_sign_sales_partner_agreement(p_token uuid,p_signer_name text,p_signature_svg text,p_acknowledgements jsonb,p_ip text default '',p_user_agent text default '')
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_row public.sales_partner_agreements%rowtype; a public.applicants%rowtype; v_missing int; v_sig_hash text; v_admin record; v_label text;
begin
  select * into v_row from public.sales_partner_agreements where token_hash=encode(extensions.digest(p_token::text,'sha256'),'hex') and status in('Sent','Viewed') and token_expires_at>now() for update;
  if not found then raise exception 'Agreement link is invalid, expired, already signed or no longer active.'; end if;
  if lower(trim(coalesce(p_signer_name,'')))<>lower(trim(coalesce(v_row.partner_snapshot->>'fullName',''))) then raise exception 'Typed legal name must match the name on the Agreement Record.'; end if;
  if coalesce(length(p_signature_svg),0)<100 or length(p_signature_svg)>500000 or left(ltrim(p_signature_svg),4)<>'<svg' then raise exception 'A valid drawn signature is required.'; end if;
  select count(*) into v_missing from jsonb_array_elements(v_row.template_snapshot->'acknowledgements') x where coalesce(p_acknowledgements->>(x->>'key'),'false')<>'true';
  if v_missing>0 then raise exception 'All required acknowledgements must be accepted before signing.'; end if;
  v_sig_hash:=encode(extensions.digest(p_signature_svg,'sha256'),'hex');
  update public.sales_partner_agreements set status='Partner Signed',partner_signer_name=trim(p_signer_name),partner_signature_svg=p_signature_svg,partner_signature_hash=v_sig_hash,partner_acknowledgements=p_acknowledgements,partner_signed_at=now(),partner_ip=left(coalesce(p_ip,''),200),partner_user_agent=left(coalesce(p_user_agent,''),1000),updated_at=now() where id=v_row.id;
  insert into public.sales_agreement_events(agreement_id,event_type,actor_type,actor_email,ip_address,user_agent,metadata) values(v_row.id,'Partner Signed','Partner',coalesce(v_row.partner_snapshot->>'email',''),left(coalesce(p_ip,''),200),left(coalesce(p_user_agent,''),1000),jsonb_build_object('signatureHash',v_sig_hash,'documentHash',v_row.document_hash,'agreementType',v_row.agreement_type));
  select * into a from public.applicants where id=v_row.applicant_id;
  v_label:=case when v_row.agreement_type='uiux_designer' then 'UI/UX Designer Agreement' else 'Sales Partner Agreement' end;
  perform public.enqueue_notification((case when v_row.agreement_type='uiux_designer' then 'uiux-agreement:' else 'sales-agreement:' end)||v_row.id::text||':partner-signed','recruitment_agreement_signature_received',a.email,null,public.recruitment_notification_payload(a)||jsonb_build_object('agreementNumber',v_row.agreement_number),now());
  for v_admin in select id from public.user_profiles where role='admin' and status='active' loop
    perform public.enqueue_in_app_notification(v_admin.id,'Recruitment','Agreement signature received',a.full_name||' signed the '||v_label||'. Review and countersign it.','/admin/agreements',(case when v_row.agreement_type='uiux_designer' then 'uiux-agreement:' else 'sales-agreement:' end)||'partner-signed:'||v_row.id::text||':'||v_admin.id::text);
  end loop;
  return jsonb_build_object('success',true,'agreementId',v_row.id,'agreementNumber',v_row.agreement_number,'status','Partner Signed','agreementType',v_row.agreement_type);
end;
$$;

create or replace function public.admin_verify_sales_partner_agreement(p_agreement_id uuid,p_signer_name text,p_signer_title text,p_signature_svg text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_row public.sales_partner_agreements%rowtype; a public.applicants%rowtype; v_sig_hash text; v_exec_hash text; v_template text;
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;
  select * into v_row from public.sales_partner_agreements where id=p_agreement_id for update;
  if not found or v_row.status<>'Partner Signed' then raise exception 'Candidate signature is required before company verification.'; end if;
  if coalesce(trim(p_signer_name),'')='' or coalesce(trim(p_signer_title),'')='' then raise exception 'Company signer name and title are required.'; end if;
  if coalesce(length(p_signature_svg),0)<100 or length(p_signature_svg)>500000 or left(ltrim(p_signature_svg),4)<>'<svg' then raise exception 'A valid company signature is required.'; end if;
  v_sig_hash:=encode(extensions.digest(p_signature_svg,'sha256'),'hex');
  v_exec_hash:=encode(extensions.digest(v_row.document_hash||'|'||coalesce(v_row.partner_signature_hash,'')||'|'||v_sig_hash||'|'||v_row.partner_signed_at::text||'|'||now()::text,'sha256'),'hex');
  update public.sales_partner_agreements set status='Verified',company_signer_name=trim(p_signer_name),company_signer_title=trim(p_signer_title),company_signature_svg=p_signature_svg,company_signature_hash=v_sig_hash,company_signed_at=now(),company_signer_user_id=auth.uid(),verified_at=now(),verified_by=auth.uid(),execution_hash=v_exec_hash,updated_at=now() where id=p_agreement_id;
  insert into public.sales_agreement_events(agreement_id,event_type,actor_type,actor_user_id,actor_email,metadata) values(p_agreement_id,'Verified','Admin',auth.uid(),coalesce((select email from public.user_profiles where id=auth.uid()),''),jsonb_build_object('companySignatureHash',v_sig_hash,'executionHash',v_exec_hash,'agreementType',v_row.agreement_type));
  select * into a from public.applicants where id=v_row.applicant_id;
  perform set_config('profox.agreement_workflow_rpc','1',true);
  update public.applicants set agreement_status='signed',updated_at=now() where id=v_row.applicant_id;
  v_template:=case when v_row.agreement_type='uiux_designer' then 'recruitment_uiux_selected' else 'recruitment_agreement_verified' end;
  perform public.enqueue_notification((case when v_row.agreement_type='uiux_designer' then 'uiux-agreement:' else 'sales-agreement:' end)||p_agreement_id::text||':verified',v_template,a.email,null,public.recruitment_notification_payload(a)||jsonb_build_object('agreementNumber',v_row.agreement_number),now());
  return jsonb_build_object('success',true,'agreementId',p_agreement_id,'status','Verified','executionHash',v_exec_hash,'agreementType',v_row.agreement_type);
end;
$$;

-- TRAINING TRACKS ------------------------------------------------------------
create table if not exists public.training_tracks(
  track_key text primary key,
  name text not null,
  target_role text not null,
  department text not null,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_track_modules(
  track_key text not null references public.training_tracks(track_key) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  sort_order integer not null,
  required boolean not null default true,
  passing_score_override integer,
  requires_review_override boolean,
  primary key(track_key,module_id),
  unique(track_key,sort_order)
);

alter table public.training_tracks enable row level security;
alter table public.training_track_modules enable row level security;

drop policy if exists training_tracks_admin_all on public.training_tracks;
create policy training_tracks_admin_all on public.training_tracks for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists training_track_modules_admin_all on public.training_track_modules;
create policy training_track_modules_admin_all on public.training_track_modules for all to authenticated using(public.is_admin()) with check(public.is_admin());

insert into public.training_tracks(track_key,name,target_role,department,description) values
('sales','ProFox Sales Academy','sales','Sales','Existing protected Sales Academy training track.'),
('uiux_design','ProFox Design Academy','uiux_designer','UI/UX Design','PF-SOP-08 onboarding and production-readiness track for UI/UX Designers.')
on conflict(track_key) do update set name=excluded.name,target_role=excluded.target_role,department=excluded.department,description=excluded.description,active=true,updated_at=now();

-- Existing Sales modules are explicitly scoped to Sales before adding Design modules.
insert into public.training_track_modules(track_key,module_id,sort_order,required,passing_score_override,requires_review_override)
select 'sales',m.id,m.sort_order,coalesce(m.required,true),m.passing_score,coalesce(m.requires_admin_review,false)
from public.training_modules m where m.active=true
on conflict(track_key,module_id) do update set sort_order=excluded.sort_order,required=excluded.required,passing_score_override=excluded.passing_score_override,requires_review_override=excluded.requires_review_override;

-- Design-specific modules use the same training_modules/training_lessons/progress/assignment/review infrastructure.
with modules(slug,title,description,module_type,required,passing_score,requires_admin_review,sort_order) as (
 values
 ('uiux-delivery-model','ProFox UI/UX Delivery Model','Understand the designer role, project boundaries, package depth, canonical project records and the designer-to-developer responsibility boundary.','lesson',true,null::integer,false,2),
 ('uiux-pf-sop-08','PF-SOP-08 Design Quality Standard','Learn the controlled Definition of Ready, six quality gates, Design Quality Score, independent review, client approval and development-ready handoff.','lesson',true,90,false,3),
 ('uiux-brief-readiness','Brief, Scope & Readiness','Read the live project scope, exclusions, requirements, approved content/assets and blockers without rebuilding or inventing a parallel brief.','lesson',true,90,false,4),
 ('uiux-ux-structure','UX Structure, IA & User Flows','Translate user/business goals into information architecture, critical journeys, flows and wireframes at the depth required by the purchased package.','lesson',true,85,false,5),
 ('uiux-conversion','Conversion-Focused Experience Design','Use message hierarchy, trust, friction reduction, CTA clarity and evidence-led decisions without dark patterns or unsupported claims.','lesson',true,85,false,6),
 ('uiux-responsive-ui','Responsive UI & Interaction States','Design coherent desktop/mobile behavior, states, forms, empty/error/loading conditions and interaction intent before handoff.','lesson',true,90,false,7),
 ('uiux-design-systems','Design Systems, Components & Tokens','Reuse governed Figma components, variants, variables/tokens and naming conventions; document justified exceptions instead of creating arbitrary one-off values.','lesson',true,90,false,8),
 ('uiux-accessibility','Accessibility by Design','Apply WCAG 2.2-oriented design intent for contrast, focus, target size, form/error patterns, keyboard intent, motion and responsive/reflow considerations.','lesson',true,90,false,9),
 ('uiux-figma-standard','ProFox Figma Working Standard','Organize project files, pages, sections, frames, components, states, prototypes, annotations and approved versions for efficient review and developer inspection.','lesson',true,90,false,10),
 ('uiux-review-client-feedback','Review, Client Feedback & Change Control','Complete self-QA, respond to independent findings, structure client feedback and protect approved scope/revision limits.','lesson',true,90,false,11),
 ('uiux-developer-handoff','Development-Ready Handoff','Prepare the approved Figma/version, responsive states, components/tokens, prototype, content/assets, accessibility intent and technical notes required to unlock Development.','lesson',true,90,false,12),
 ('uiux-final-certification','UI/UX Final Certification','Submit a complete evidence-based design exercise demonstrating PF-SOP-08 readiness. Management review is required before production activation.','assignment',true,90,true,14)
)
insert into public.training_modules(title,slug,description,module_type,sort_order,required,active,passing_score,requires_admin_review,updated_at)
select title,slug,description,module_type,100+sort_order,true,true,passing_score,requires_admin_review,now() from modules
on conflict(slug) do update set title=excluded.title,description=excluded.description,module_type=excluded.module_type,active=true,passing_score=excluded.passing_score,requires_admin_review=excluded.requires_admin_review,updated_at=now();

-- Reuse existing Welcome + Confidentiality modules; do not clone shared learning.
insert into public.training_track_modules(track_key,module_id,sort_order,required,passing_score_override,requires_review_override)
select 'uiux_design',m.id,x.sort_order,true,x.score,x.review
from (values('welcome',1,null::integer,false),('confidentiality-data-protection',13,90,false)) x(slug,sort_order,score,review)
join public.training_modules m on m.slug=x.slug
on conflict(track_key,module_id) do update set sort_order=excluded.sort_order,required=excluded.required,passing_score_override=excluded.passing_score_override,requires_review_override=excluded.requires_review_override;

insert into public.training_track_modules(track_key,module_id,sort_order,required,passing_score_override,requires_review_override)
select 'uiux_design',m.id,
  case m.slug
    when 'uiux-delivery-model' then 2 when 'uiux-pf-sop-08' then 3 when 'uiux-brief-readiness' then 4 when 'uiux-ux-structure' then 5
    when 'uiux-conversion' then 6 when 'uiux-responsive-ui' then 7 when 'uiux-design-systems' then 8 when 'uiux-accessibility' then 9
    when 'uiux-figma-standard' then 10 when 'uiux-review-client-feedback' then 11 when 'uiux-developer-handoff' then 12 when 'uiux-final-certification' then 14 end,
  true,m.passing_score,m.requires_admin_review
from public.training_modules m where m.slug like 'uiux-%'
on conflict(track_key,module_id) do update set sort_order=excluded.sort_order,required=true,passing_score_override=excluded.passing_score_override,requires_review_override=excluded.requires_review_override;

-- One substantial lesson per design module. The master PF-SOP-08 remains authoritative; these are executable onboarding summaries.
insert into public.training_lessons(module_id,title,content,sort_order,active,updated_at)
select m.id,m.title,
case m.slug
 when 'uiux-delivery-model' then '## Your operating boundary\nYou own approved UI/UX work from a Ready design assignment through development-ready handoff. ProFox projects, tasks, team assignments, package/scope, approvals and notifications are the source of truth. Do not create private duplicate trackers or promise changes outside your authority.\n\n### Daily rule\nOpen **My Work**, follow **Focus Now**, surface blockers immediately and keep evidence/handoff references current.'
 when 'uiux-pf-sop-08' then '## PF-SOP-08 is the quality authority\nUse the stage-specific playbook shown in Design Delivery. Work may not silently bypass readiness, self-QA, independent Design QA, accessibility/technical review, client approval or development-ready handoff. A numeric score never overrides a critical UX/accessibility issue.\n\nThe creator is not the sole independent reviewer.'
 when 'uiux-brief-readiness' then '## Design only from a Ready brief\nConfirm purchased package/process depth, scope, exclusions, requirements, business goal, target users, primary conversion, approved content/brand assets and deadline. Missing required inputs must remain **BLOCKED — INPUT REQUIRED** rather than being guessed.\n\nUse canonical project records; do not rewrite the brief in personal notes.'
 when 'uiux-ux-structure' then '## Structure before decoration\nDefine the user objective, information hierarchy, navigation/IA, critical task flows and wireframes needed to validate structure. Scale research and wireframe depth to the purchased package and project risk. Document meaningful assumptions and decisions.'
 when 'uiux-conversion' then '## Conversion without manipulation\nMake the next action clear, reduce avoidable friction, surface proof/trust appropriately and align content hierarchy to user intent. Do not invent statistics, scarcity or claims. Every conversion decision must also preserve usability and accessibility.'
 when 'uiux-responsive-ui' then '## Design behavior, not screenshots\nDefine meaningful breakpoints/responsive adaptation plus default, hover/focus where relevant, active, disabled, loading, success, error and empty states for critical interactions. Avoid handing development ambiguous desktop-only frames.'
 when 'uiux-design-systems' then '## Reuse governed design decisions\nUse approved components, variants, type, spacing, color and variable/token values wherever available. A new pattern or arbitrary value requires a real need and should be proposed as a controlled system contribution rather than silently duplicated.'
 when 'uiux-accessibility' then '## Accessibility begins in design\nProvide accessible color contrast intent, visible focus treatment, sufficiently large interaction targets, understandable labels/errors, keyboard-operable interaction intent, reduced-motion consideration and responsive/reflow-safe layouts. Design review does not claim implementation conformance; Development/QA must verify the built product.'
 when 'uiux-figma-standard' then '## Development-friendly Figma\nUse clear file/page/section/frame/component naming, Auto Layout, reusable components/variants, governed variables, responsive frames, state coverage, prototype links where useful and a clearly identified approved/Ready-for-Development version. Archive obsolete exploration rather than leaving developers to guess.'
 when 'uiux-review-client-feedback' then '## Review is structured work\nFinish self-QA before submission. Resolve independent findings in the same canonical task. Client feedback must be captured against the approved design/version; distinguish correction, allowed revision and potential scope change. Never accept unlimited untracked revisions.'
 when 'uiux-developer-handoff' then '## Definition of Development Ready\nThe handoff must point to the approved design version and include applicable responsive views, components/tokens, interaction/state intent, prototype, approved content/assets, accessibility intent and technical notes. The Developer should not have to reconstruct design decisions from chat history.'
 when 'uiux-final-certification' then '## Final certification evidence\nSubmit one controlled design exercise using the supplied brief. Include a Figma URL, responsive solution, component/system evidence, key states, accessibility considerations, design rationale and a concise developer-handoff note. Management must independently review and pass the evidence at the configured standard.'
 else m.description end,
1,true,now()
from public.training_modules m
where m.slug like 'uiux-%'
on conflict do nothing;

create or replace function public.training_track_for_user(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_track text; v_role text;
begin
  select public.career_job_training_track(a.career_job_id) into v_track from public.applicants a where a.linked_user_id=p_user_id order by a.created_at desc limit 1;
  if v_track is not null and v_track<>'general' then return v_track; end if;
  select role into v_role from public.user_profiles where id=p_user_id;
  return case when v_role in('sales','sales_rep','sales_team') then 'sales' when v_role='uiux_designer' then 'uiux_design' else null end;
end;
$$;

create or replace function public.training_user_has_module(p_module_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select public.is_admin() or exists(
    select 1 from public.training_track_modules tm
    where tm.track_key=public.training_track_for_user(auth.uid()) and tm.module_id=p_module_id
  )
$$;

-- Restrict learning catalog/lessons to the caller's assigned track, while Admin remains full access.
drop policy if exists training_modules_select on public.training_modules;
create policy training_modules_select on public.training_modules for select to authenticated using(public.training_user_has_module(id));
drop policy if exists training_lessons_select on public.training_lessons;
create policy training_lessons_select on public.training_lessons for select to authenticated using(public.training_user_has_module(module_id));

grant execute on function public.training_user_has_module(uuid) to authenticated;
grant execute on function public.training_track_for_user(uuid) to authenticated;

create or replace function public.get_my_training_modules()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_track text; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_track:=public.training_track_for_user(auth.uid()); if v_track is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object(
    'sort_order',tm.sort_order,
    'required',tm.required,
    'passing_score',coalesce(tm.passing_score_override,m.passing_score),
    'requires_admin_review',coalesce(tm.requires_review_override,m.requires_admin_review),
    'training_track',v_track
  ) order by tm.sort_order),'[]'::jsonb)
  into v_result
  from public.training_track_modules tm join public.training_modules m on m.id=tm.module_id
  where tm.track_key=v_track and m.active=true;
  return v_result;
end;
$$;

grant execute on function public.get_my_training_modules() to authenticated;

create or replace function public.uiux_training_ready(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_missing int;
begin
  select count(*) into v_missing
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id and m.active=true
  where tm.track_key='uiux_design' and tm.required
    and not exists(
      select 1 from public.user_training_progress p
      where p.user_id=p_user_id and p.module_id=m.id and p.status in('Passed','Completed')
        and (coalesce(tm.passing_score_override,m.passing_score) is null or coalesce(p.score,100)>=coalesce(tm.passing_score_override,m.passing_score))
        and (coalesce(tm.requires_review_override,m.requires_admin_review,false)=false or exists(select 1 from public.training_reviews r where r.progress_id=p.id and r.status='Passed' and r.reviewer_id is not null order by r.created_at desc limit 1))
    );
  return v_missing=0;
end;
$$;

create or replace function public.request_uiux_final_approval()
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare a public.applicants%rowtype; m public.training_modules%rowtype; p public.user_training_progress%rowtype; r public.training_reviews%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into a from public.applicants where linked_user_id=auth.uid() order by created_at desc limit 1 for update;
  if not found or coalesce(public.career_job_system_role(a.career_job_id),'')<>'uiux_designer' then raise exception 'Linked UI/UX Designer candidate record not found.'; end if;
  if a.stage='Final Approval' then return; end if;
  if a.stage<>'Design Academy' then raise exception 'Candidate must be in Design Academy before requesting Final Approval.'; end if;
  if lower(coalesce(a.agreement_status,''))<>'signed' then raise exception 'Verified UI/UX Designer agreement is required.'; end if;
  if not public.uiux_training_ready(auth.uid()) then raise exception 'Complete and pass every required Design Academy module before requesting Final Approval.'; end if;
  select * into m from public.training_modules where slug='uiux-final-certification' and active=true;
  select * into p from public.user_training_progress where user_id=auth.uid() and module_id=m.id;
  if not found or p.status<>'Passed' or coalesce(p.score,0)<coalesce(m.passing_score,90) then raise exception 'UI/UX Final Certification must be passed before Final Approval.'; end if;
  select * into r from public.training_reviews where progress_id=p.id order by created_at desc,id desc limit 1;
  if not found or r.status<>'Passed' or r.reviewer_id is null then raise exception 'UI/UX Final Certification requires independent Management review.'; end if;
  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants set stage='Final Approval',onboarding_status='in_progress',onboarding_progress=100,updated_at=now() where id=a.id;
end;
$$;

create or replace function public.approve_uiux_candidate_final(p_applicant_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare a public.applicants%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an active Admin may grant Final Approval.'; end if;
  select * into a from public.applicants where id=p_applicant_id for update; if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(public.career_job_system_role(a.career_job_id),'')<>'uiux_designer' then raise exception 'Candidate is not in the UI/UX Designer workflow.'; end if;
  if a.linked_user_id is null then raise exception 'Candidate account must be linked first.'; end if;
  if a.stage not in('Final Approval','Ready for System Access') then raise exception 'Candidate must request Final Approval first.'; end if;
  if lower(coalesce(a.agreement_status,''))<>'signed' or not public.uiux_training_ready(a.linked_user_id) then raise exception 'Verified agreement and all required Design Academy gates are required.'; end if;
  perform set_config('profox.final_approval_rpc','1',true);
  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants set final_approval=true,stage='Ready for System Access',onboarding_status='in_progress',onboarding_progress=100,updated_at=now() where id=a.id;
  update public.user_profiles set onboarding_progress=100,onboarding_status='in_progress',status='onboarding',updated_at=now() where id=a.linked_user_id;
end;
$$;

create or replace function public.activate_uiux_designer(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare a public.applicants%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an active Admin may activate a UI/UX Designer.'; end if;
  select * into a from public.applicants where linked_user_id=p_user_id and coalesce(public.career_job_system_role(career_job_id),'')='uiux_designer' order by created_at desc limit 1 for update;
  if not found then raise exception 'UI/UX Designer candidate record not found.'; end if;
  if a.stage='Activated' and exists(select 1 from public.user_profiles where id=p_user_id and role='uiux_designer' and status='active') then return; end if;
  if a.stage<>'Ready for System Access' or a.final_approval is not true then raise exception 'Final Approval is required before activation.'; end if;
  if lower(coalesce(a.agreement_status,''))<>'signed' or not public.uiux_training_ready(p_user_id) then raise exception 'Verified agreement and Design Academy certification are required before activation.'; end if;
  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.user_profiles set role='uiux_designer',department='UI/UX Design',status='active',onboarding_status='completed',onboarding_progress=100,updated_at=now() where id=p_user_id;
  if not found then raise exception 'Linked user profile not found.'; end if;
  update public.applicants set stage='Activated',onboarding_status='completed',onboarding_progress=100,updated_at=now() where id=a.id;
end;
$$;

-- Service-role account linking for the existing recruitment-account-invite Edge Function.
create or replace function public.service_link_invited_uiux_candidate(p_applicant_id uuid,p_target_user_id uuid,p_account_invite_url text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare a public.applicants%rowtype; p public.user_profiles%rowtype; v_outbox uuid;
begin
  if current_user not in('postgres','service_role') and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Service role required.'; end if;
  select * into a from public.applicants where id=p_applicant_id for update; if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(public.career_job_system_role(a.career_job_id),'')<>'uiux_designer' then raise exception 'Candidate is not in the UI/UX Designer workflow.'; end if;
  if coalesce(trim(a.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot receive onboarding access.'; end if;
  if a.stage not in('Selected','Agreement Pending','Design Academy') then raise exception 'Candidate is not in an account-invitation stage.'; end if;
  if lower(coalesce(a.agreement_status,''))<>'signed' then raise exception 'Verified UI/UX Designer Agreement is required before account access.'; end if;
  if length(trim(coalesce(p_account_invite_url,'')))<20 or p_account_invite_url !~* '^https?://' then raise exception 'A valid secure account setup URL is required.'; end if;
  select * into p from public.user_profiles where id=p_target_user_id for update; if not found then raise exception 'Invited user profile not found.'; end if;
  if lower(trim(coalesce(p.email,'')))<>lower(trim(coalesce(a.email,''))) then raise exception 'Invited account email must exactly match the candidate application.'; end if;
  if p.role='admin' then raise exception 'An Admin account cannot be linked as a UI/UX trainee.'; end if;
  if p.status='active' and p.role='uiux_designer' then raise exception 'This account is already an active UI/UX Designer.'; end if;
  if exists(select 1 from public.applicants x where x.linked_user_id=p_target_user_id and x.id<>p_applicant_id and x.stage<>'Activated' and coalesce(trim(x.refusal_reason),'')='') then raise exception 'This account is already linked to another active candidate.'; end if;
  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants set linked_user_id=p_target_user_id,stage='Design Academy',onboarding_status='in_progress',onboarding_invite_sent_at=coalesce(onboarding_invite_sent_at,now()),onboarding_invite_last_sent_at=now(),onboarding_invite_count=onboarding_invite_count+1,updated_at=now() where id=p_applicant_id;
  update public.user_profiles set full_name=coalesce(nullif(trim(a.full_name),''),full_name),phone=coalesce(nullif(trim(a.phone),''),phone),country=coalesce(nullif(trim(a.country),''),country),timezone=coalesce(nullif(trim(a.timezone),''),timezone),role='uiux_designer',department='UI/UX Design',status='onboarding',onboarding_status='in_progress',onboarding_progress=least(coalesce(onboarding_progress,0),99),updated_at=now() where id=p_target_user_id;
  v_outbox:=public.enqueue_notification('recruitment:'||p_applicant_id::text||':uiux-account-invite:'||(a.onboarding_invite_count+1)::text,'recruitment_uiux_account_invite',lower(trim(a.email)),p_target_user_id,public.recruitment_notification_payload(a)||jsonb_build_object('accountInviteUrl',p_account_invite_url,'applicationReference',a.application_reference),now());
  perform public.log_applicant_event(p_applicant_id,'account','design_academy_account_invited','Design Academy account invitation sent','The UI/UX Designer account was securely linked in onboarding mode.',p.status,'onboarding','system',null,'user_profiles',p_target_user_id,jsonb_build_object('inviteNumber',a.onboarding_invite_count+1,'outboxId',v_outbox));
  return jsonb_build_object('success',true,'linkedUserId',p_target_user_id,'stage','Design Academy','status','onboarding','inviteNumber',a.onboarding_invite_count+1,'trainingTrack','uiux_design');
end;
$$;

revoke all on function public.build_candidate_agreement_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.create_uiux_designer_agreement_internal(uuid) from public,anon,authenticated;
revoke all on function public.service_link_invited_uiux_candidate(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.uiux_training_ready(uuid) from public,anon;
grant execute on function public.admin_issue_candidate_agreement(uuid) to authenticated;
grant execute on function public.request_uiux_final_approval() to authenticated;
grant execute on function public.approve_uiux_candidate_final(uuid) to authenticated;
grant execute on function public.activate_uiux_designer(uuid) to authenticated;

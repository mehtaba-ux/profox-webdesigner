-- Content Writer workforce workflow.
-- Reuses career_jobs, applicants, recruitment_stage_policies, recruitment_assessments,
-- recruitment_interviews, user_profiles, notification infrastructure and the existing
-- recruitment account-invite Edge Function. No parallel applicant or hiring system.

alter table public.applicants
  add column if not exists application_answers jsonb not null default '{}'::jsonb;

alter table public.career_jobs drop constraint if exists career_jobs_application_type_check;
alter table public.career_jobs
  add constraint career_jobs_application_type_check
  check (application_type = any (array['sales_representative'::text,'content_writer'::text,'general'::text,'external_link'::text]));

insert into public.career_jobs(
  slug,title,short_summary,description,department,category,location,workplace_type,
  engagement_type,experience,responsibilities,requirements,selection_process,compensation,
  role_details,application_type,application_cta,requires_intro_video,featured,display_order,status,published_at,
  seo_title,seo_description
)
values(
  'content-writer',
  'Content Writer',
  'Research, structure and create evidence-based website content that is clear, persuasive and implementation-ready.',
  'Join the ProFox Content team and produce client content through PF-SOP-07. The role combines research, content strategy, conversion copywriting, factual verification, SEO awareness and disciplined handoff to UI/UX.',
  'Content','Content & Copywriting','Remote','Remote','Remote · Role terms confirmed during selection','Professional writing experience required',
  array[
    'Research client businesses, audiences, offers, competitors and customer language before writing.',
    'Create clear, conversion-focused website content from a structured brief and approved evidence.',
    'Maintain claim/source records and never invent business facts, proof, statistics or credentials.',
    'Complete Writer Self-QA and respond to independent 2i, SME, SEO/conversion and client feedback.',
    'Prepare implementation-ready content packages for the UI/UX team.'
  ],
  array[
    'Strong written English and clear information structuring.',
    'Demonstrable website, conversion, UX or commercial writing samples.',
    'Research discipline and ability to separate evidence from assumptions.',
    'Comfort working inside SOPs, review gates and version-controlled feedback.',
    'Laptop, reliable internet and availability for remote project work.'
  ],
  '[
    {"title":"Apply","text":"Submit your experience, portfolio/writing samples and role-fit answers."},
    {"title":"Qualification review","text":"We check communication, availability and minimum role fit."},
    {"title":"Portfolio review","text":"A reviewer evaluates real writing samples for clarity, structure, originality and commercial quality."},
    {"title":"Content assessment","text":"Complete a structured writing assessment against the ProFox quality rubric."},
    {"title":"Research & evidence test","text":"Demonstrate research judgment, source quality and claim verification."},
    {"title":"Interview","text":"Discuss thinking process, feedback discipline, client truth and delivery expectations."},
    {"title":"Content Academy","text":"Complete PF-SOP-07 and the required Content Delivery onboarding modules."},
    {"title":"Practical certification","text":"Pass an independently reviewed practical before production access is activated."}
  ]'::jsonb,
  '[]'::jsonb,
  '{
    "targetRole":"content_writer",
    "targetDepartment":"Content",
    "academyKey":"content_writer",
    "applicationForm":{
      "minimumWeeklyHours":20,
      "portfolioRequired":true,
      "cvRequired":true
    }
  }'::jsonb,
  'content_writer','Apply for Content Writer',false,true,20,'Published',now(),
  'Content Writer Careers | ProFox',
  'Apply to join the ProFox Content team and work through a structured research, writing, quality and UI/UX handoff process.'
)
on conflict (slug) do update set
  title=excluded.title,short_summary=excluded.short_summary,description=excluded.description,
  department=excluded.department,category=excluded.category,location=excluded.location,
  workplace_type=excluded.workplace_type,engagement_type=excluded.engagement_type,experience=excluded.experience,
  responsibilities=excluded.responsibilities,requirements=excluded.requirements,selection_process=excluded.selection_process,
  role_details=excluded.role_details,application_type=excluded.application_type,application_cta=excluded.application_cta,
  requires_intro_video=excluded.requires_intro_video,featured=excluded.featured,display_order=excluded.display_order,
  seo_title=excluded.seo_title,seo_description=excluded.seo_description,updated_at=now();

with job as (select id from public.career_jobs where slug='content-writer')
insert into public.recruitment_stage_policies(job_id,stage,sort_order,active,assessment_required,passing_score,sla_hours,interview_required,rubric)
select job.id,v.stage,v.sort_order,true,v.assessment_required,v.passing_score,v.sla_hours,v.interview_required,v.rubric
from job
cross join (values
  ('New Application',1,false,null::integer,24,false,'[]'::jsonb),
  ('Qualification Review',2,true,75,24,false,'[{"key":"written_communication","label":"Written communication","maxPoints":25},{"key":"relevant_experience","label":"Relevant writing experience","maxPoints":25},{"key":"availability_reliability","label":"Availability and reliability","maxPoints":20},{"key":"professional_judgment","label":"Professional judgment","maxPoints":30}]'::jsonb),
  ('Portfolio Review',3,true,80,48,false,'[{"key":"clarity_structure","label":"Clarity and information structure","maxPoints":25},{"key":"commercial_quality","label":"Commercial / conversion quality","maxPoints":25},{"key":"originality_voice","label":"Originality and voice control","maxPoints":20},{"key":"accuracy_trust","label":"Accuracy and trust discipline","maxPoints":20},{"key":"presentation","label":"Professional presentation","maxPoints":10}]'::jsonb),
  ('Content Assessment',4,true,85,72,false,'[{"key":"user_need","label":"User-need alignment","maxPoints":20},{"key":"message_hierarchy","label":"Message hierarchy","maxPoints":20},{"key":"conversion","label":"Conversion thinking","maxPoints":20},{"key":"clarity","label":"Clarity and scannability","maxPoints":20},{"key":"brand_originality","label":"Brand fit and originality","maxPoints":20}]'::jsonb),
  ('Research & Evidence Test',5,true,85,72,false,'[{"key":"source_quality","label":"Source quality judgment","maxPoints":25},{"key":"claim_verification","label":"Claim verification","maxPoints":25},{"key":"competitor_research","label":"Competitor research without copying","maxPoints":20},{"key":"customer_language","label":"Customer language extraction","maxPoints":15},{"key":"research_synthesis","label":"Research synthesis","maxPoints":15}]'::jsonb),
  ('Interview',6,true,80,48,true,'[{"key":"thinking_process","label":"Thinking process","maxPoints":25},{"key":"feedback_discipline","label":"Feedback and revision discipline","maxPoints":20},{"key":"client_truth","label":"Client truth / no-invention standard","maxPoints":25},{"key":"collaboration","label":"Cross-team collaboration","maxPoints":15},{"key":"ownership","label":"Ownership and reliability","maxPoints":15}]'::jsonb),
  ('Selected',7,false,null::integer,12,false,'[]'::jsonb),
  ('Content Academy',8,false,null::integer,72,false,'[]'::jsonb),
  ('Practical Certification',9,false,null::integer,48,false,'[]'::jsonb),
  ('Activated',10,false,null::integer,0,false,'[]'::jsonb)
) as v(stage,sort_order,assessment_required,passing_score,sla_hours,interview_required,rubric)
on conflict (job_id,stage) do update set
  sort_order=excluded.sort_order,active=excluded.active,assessment_required=excluded.assessment_required,
  passing_score=excluded.passing_score,sla_hours=excluded.sla_hours,interview_required=excluded.interview_required,
  rubric=excluded.rubric,updated_at=now();

insert into public.notification_templates(template_key,name,subject_template,body_template,active,description)
values
('content_recruitment_application_received','Content Writer application received','Application received: ProFox Content Writer','Hi {{fullName}},\n\nThank you for applying for the ProFox Content Writer role. We received your application and will review your experience, portfolio and role-fit evidence.\n\nIf you progress, each next step will be communicated through the same recruitment record. Applying does not create production workspace access.\n\nProFox',true,'Content Writer application confirmation.'),
('content_recruitment_stage','Content Writer recruitment update','Your ProFox Content Writer application has moved forward','Hi {{fullName}},\n\nYour Content Writer application has progressed to {{stage}}. Follow any instructions sent by the recruitment team and keep your submitted evidence current.\n\nProFox',true,'Generic Content Writer recruitment stage update.'),
('content_recruitment_selected','Content Writer selected for onboarding','You have been selected for ProFox Content onboarding','Hi {{fullName}},\n\nYou have passed the Content Writer selection workflow. ProFox will prepare secure Content Academy access for the next stage.\n\nProduction project access remains locked until the required Academy and practical certification are complete.\n\nProFox',true,'Content Writer selected notification.'),
('content_recruitment_account_invite','Content Academy account access','Set up your ProFox Content Academy access','Hi {{fullName}},\n\nYour ProFox Content Academy access is ready. Set up your account using the secure link below.\n\nSet up your account: {{accountInviteUrl}}\n\nYour account remains in onboarding mode until PF-SOP-07 training and practical certification are complete.\n\nProFox',true,'Secure onboarding account invitation for Content Writer candidates.'),
('content_recruitment_activated','Content Writer activated','Welcome to the ProFox Content team','Hi {{fullName}},\n\nYour Content Writer certification is complete and your production access is active. Assigned client work will now appear in Content Delivery with the required brief, SOP and quality gates.\n\nProFox',true,'Content Writer activation notification.'),
('content_recruitment_not_selected','Content Writer application closed','Update on your ProFox Content Writer application','Hi {{fullName}},\n\nThank you for the time you invested in the ProFox Content Writer selection process. We will not be progressing this application further at this time.\n\nProFox',true,'Content Writer candidate closure notification.'),
('content_recruitment_practical_review','Content practical review required','Content Writer practical certification requires review','{{fullName}} has submitted the Content Writer practical certification. Review the evidence against PF-SOP-07 before production access is activated.\n\nProFox',true,'Internal alert for Content Writer practical review.')
on conflict (template_key) do update set
  name=excluded.name,subject_template=excluded.subject_template,body_template=excluded.body_template,
  active=excluded.active,description=excluded.description,updated_at=now();

create or replace function public.content_recruitment_manager()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.is_admin() or exists(
    select 1 from public.user_profiles u
    where u.id=auth.uid() and u.status='active' and u.role in ('editor','site_manager')
  );
$$;

create or replace function public.can_manage_content_applicant(p_applicant_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.is_admin() or exists(
    select 1
    from public.applicants a
    join public.career_jobs j on j.id=a.career_job_id
    join public.user_profiles u on u.id=auth.uid()
    where a.id=p_applicant_id and j.application_type='content_writer'
      and u.status='active' and u.role in ('editor','site_manager')
  );
$$;

create or replace function public.recruitment_job_for_applicant(p_applicant_id uuid)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(a.career_job_id,(
    select id from public.career_jobs where application_type='sales_representative'
    order by (status='Published') desc,featured desc,published_at desc nulls last,created_at desc limit 1
  )) from public.applicants a where a.id=p_applicant_id;
$$;

create or replace function public.recruitment_next_stage_for_applicant(p_applicant_id uuid)
returns text language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_job uuid;v_stage text;v_sort integer;v_next text;
begin
  select career_job_id,stage into v_job,v_stage from public.applicants where id=p_applicant_id;
  if v_stage is null then return null; end if;
  if v_job is null then return public.recruitment_next_stage(v_stage); end if;
  select sort_order into v_sort from public.recruitment_stage_policies where job_id=v_job and stage=v_stage and active=true;
  if v_sort is null then return null; end if;
  select stage into v_next from public.recruitment_stage_policies where job_id=v_job and active=true and sort_order>v_sort order by sort_order limit 1;
  return v_next;
end; $$;

create or replace function public.submit_public_content_writer_application(p_application jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_job public.career_jobs%rowtype; v_email text; v_name text; v_id uuid; v_reference text; v_existing uuid;
  v_answers jsonb:=coalesce(p_application,'{}'::jsonb); v_hours integer;
begin
  select * into v_job from public.career_jobs where slug='content-writer' and application_type='content_writer' and status='Published' and (closes_at is null or closes_at>now()) limit 1;
  if not found then return jsonb_build_object('success',false,'error','The Content Writer role is not currently accepting applications.'); end if;
  v_name:=btrim(coalesce(v_answers->>'fullName',''));
  v_email:=lower(btrim(coalesce(v_answers->>'email','')));
  if length(v_name)<2 then return jsonb_build_object('success',false,'field','fullName','error','Please provide your full name.'); end if;
  if v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return jsonb_build_object('success',false,'field','email','error','Please provide a valid email address.'); end if;
  begin v_hours:=greatest(0,coalesce((v_answers->>'availableHoursPerWeek')::integer,0)); exception when others then v_hours:=0; end;
  if v_hours<1 or v_hours>80 then return jsonb_build_object('success',false,'field','availableHoursPerWeek','error','Please provide valid weekly availability.'); end if;
  if coalesce(v_answers->>'portfolioUrl','')='' and jsonb_array_length(coalesce(v_answers->'writingSamples','[]'::jsonb))=0 then
    return jsonb_build_object('success',false,'field','portfolioUrl','error','Provide a portfolio or at least one writing sample.');
  end if;
  if coalesce((v_answers->>'consentAccurate')::boolean,false) is not true or coalesce((v_answers->>'consentPrivacy')::boolean,false) is not true then
    return jsonb_build_object('success',false,'field','consent','error','Accuracy and privacy confirmations are required.');
  end if;
  select a.id into v_existing from public.applicants a where a.career_job_id=v_job.id and lower(btrim(a.email))=v_email and coalesce(btrim(a.refusal_reason),'')='' order by a.created_at desc limit 1;
  if v_existing is not null then return jsonb_build_object('success',true,'duplicate',true,'applicant_id',v_existing,'message','An active Content Writer application already exists for this email.'); end if;
  v_reference:='PF-CW-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.applicants(
    full_name,email,phone,country,timezone,position,linkedin_url,cv_url,skills,source,stage,rating,notes,
    onboarding_status,onboarding_progress,final_approval,application_reference,application_version,
    application_policy_version,application_submitted_at,current_job_title,weekly_availability,
    available_hours_per_week,earliest_start_date,motivation,has_laptop_internet,accuracy_confirmed_at,
    privacy_consent_at,cv_storage_path,career_job_id,application_policy_snapshot,application_answers
  ) values(
    v_name,v_email,btrim(coalesce(v_answers->>'phone','')),btrim(coalesce(v_answers->>'country','')),
    coalesce(nullif(btrim(v_answers->>'timezone'),''),'UTC'),'Content Writer',nullif(btrim(v_answers->>'linkedinUrl'),''),
    nullif(btrim(v_answers->>'cvUrl'),''),left(coalesce(v_answers->>'skills',''),5000),'ProFox Website','New Application',0,
    nullif(left(btrim(coalesce(v_answers->>'message','')),10000),''),'not_started',0,false,v_reference,'content_writer_v1',
    'content_writer_v1',now(),nullif(btrim(v_answers->>'currentRole'),''),nullif(btrim(v_answers->>'weeklyAvailability'),''),
    v_hours,nullif((v_answers->>'earliestStartDate')::date,null),nullif(left(btrim(coalesce(v_answers->>'motivation','')),10000),''),
    coalesce((v_answers->>'hasLaptopInternet')::boolean,false),now(),now(),nullif(btrim(v_answers->>'cvStoragePath'),''),v_job.id,
    jsonb_build_object('jobId',v_job.id,'jobSlug',v_job.slug,'jobUpdatedAt',v_job.updated_at,'roleDetails',v_job.role_details),
    v_answers-'fullName'-'email'
  ) returning id into v_id;
  return jsonb_build_object('success',true,'applicant_id',v_id,'reference',v_reference,'stage','New Application');
exception when others then
  raise warning 'Content Writer application failed: %',sqlerrm;
  return jsonb_build_object('success',false,'error','We could not submit your application right now. Please try again.');
end; $$;

grant execute on function public.submit_public_content_writer_application(jsonb) to anon,authenticated;

create policy applicants_content_manager_select on public.applicants
for select to authenticated using (
  public.is_admin() or exists(
    select 1 from public.career_jobs j join public.user_profiles u on u.id=auth.uid()
    where j.id=applicants.career_job_id and j.application_type='content_writer'
      and u.status='active' and u.role in ('editor','site_manager')
  )
);

create or replace function public.admin_get_recruitment_stage_policies(p_job_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job uuid;v_result jsonb;v_type text;
begin
  v_job:=p_job_id;
  if v_job is null then select id into v_job from public.career_jobs where application_type='sales_representative' order by (status='Published') desc,featured desc,published_at desc nulls last,created_at desc limit 1; end if;
  select application_type into v_type from public.career_jobs where id=v_job;
  if not public.is_admin() and not (v_type='content_writer' and public.content_recruitment_manager()) then raise exception 'Recruitment management access required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'jobId',job_id,'stage',stage,'sortOrder',sort_order,'active',active,'assessmentRequired',assessment_required,'passingScore',passing_score,'slaHours',sla_hours,'interviewRequired',interview_required,'rubric',rubric,'updatedAt',updated_at) order by sort_order),'[]'::jsonb)
  into v_result from public.recruitment_stage_policies where job_id=v_job;
  return v_result;
end; $$;

create or replace function public.admin_advance_applicant_stage(p_applicant_id uuid,p_target_stage text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_app public.applicants%rowtype;v_job public.career_jobs%rowtype;v_target text;v_expected text;v_policy public.recruitment_stage_policies%rowtype;
begin
  select * into v_app from public.applicants where id=p_applicant_id for update; if not found then raise exception 'Candidate not found.'; end if;
  select * into v_job from public.career_jobs where id=coalesce(v_app.career_job_id,public.recruitment_job_for_applicant(v_app.id));
  if not public.is_admin() and not (v_job.application_type='content_writer' and public.can_manage_content_applicant(v_app.id)) then raise exception 'Recruitment management access required.'; end if;
  if coalesce(btrim(v_app.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot progress.'; end if;
  v_expected:=public.recruitment_next_stage_for_applicant(v_app.id);
  v_target:=coalesce(p_target_stage,v_expected);
  if v_target is null then raise exception 'No next stage is available.'; end if;
  if v_target is distinct from v_expected then raise exception 'Recruitment stages must progress sequentially. Use a documented override for exceptional corrections.'; end if;
  select * into v_policy from public.recruitment_stage_policies where job_id=v_job.id and stage=v_app.stage and active=true;
  if found and v_policy.assessment_required and not public.recruitment_latest_assessment_passed(v_app.id,v_app.stage) then raise exception 'A passed structured assessment for % is required before progression.',v_app.stage; end if;
  if found and v_policy.interview_required and not exists(
    select 1 from public.recruitment_interviews ri join public.sales_meetings m on m.id=ri.meeting_id
    where ri.applicant_id=v_app.id and ri.stage=v_app.stage and m.status='Completed'
  ) then raise exception 'Complete the required % interview before progression.',v_app.stage; end if;
  if v_job.application_type='sales_representative' then
    if v_app.stage='New Application' and v_target='Video Pending' and (coalesce(v_app.video_url,'')<>'' or coalesce(v_app.video_storage_path,'')<>'') then v_target:='Video Review'; end if;
    if v_app.stage='Video Pending' and v_target='Video Review' and coalesce(v_app.video_url,'')='' and coalesce(v_app.video_storage_path,'')='' then raise exception 'Introduction video is required before Video Review.'; end if;
    if v_app.stage='Selected' then raise exception 'Issue the Sales Partner Agreement to move a Selected candidate into Agreement Pending.'; end if;
    if v_app.stage='Agreement Pending' then raise exception 'Signed agreement and protected account linking are required to enter Sales Academy.'; end if;
    if v_app.stage='One-Day Training' then raise exception 'The candidate must request Final Approval through the protected Sales Academy workflow.'; end if;
    if v_app.stage='Final Approval' then raise exception 'Use the protected Final Approval action.'; end if;
    if v_app.stage='Ready for System Access' then raise exception 'Use protected Sales activation.'; end if;
  elsif v_job.application_type='content_writer' then
    if v_app.stage='Selected' then raise exception 'Content Academy access is provisioned through the protected recruitment account invitation flow.'; end if;
    if v_target='Activated' then raise exception 'Content Writer activation is controlled by the practical certification gate.'; end if;
  end if;
  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants set stage=v_target,updated_at=now() where id=v_app.id;
  return jsonb_build_object('success',true,'fromStage',v_app.stage,'toStage',v_target);
end; $$;

create or replace function public.service_link_invited_candidate(p_applicant_id uuid,p_target_user_id uuid,p_account_invite_url text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_app public.applicants%rowtype;v_job public.career_jobs%rowtype;v_profile public.user_profiles%rowtype;v_outbox uuid;
begin
  if current_user not in('postgres','service_role') and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Service role required.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id for update; if not found then raise exception 'Candidate not found.'; end if;
  select * into v_job from public.career_jobs where id=coalesce(v_app.career_job_id,public.recruitment_job_for_applicant(v_app.id));
  if v_job.application_type='sales_representative' then return public.service_link_invited_sales_candidate(p_applicant_id,p_target_user_id,p_account_invite_url); end if;
  if v_job.application_type<>'content_writer' then raise exception 'This account invitation workflow does not support the candidate job type.'; end if;
  if coalesce(btrim(v_app.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot receive onboarding access.'; end if;
  if v_app.stage not in('Selected','Content Academy') then raise exception 'Content Writer candidate is not in an account-invitation stage.'; end if;
  if length(btrim(coalesce(p_account_invite_url,'')))<20 or p_account_invite_url!~*'^https?://' then raise exception 'A valid secure account setup URL is required.'; end if;
  select * into v_profile from public.user_profiles where id=p_target_user_id for update; if not found then raise exception 'Invited user profile not found.'; end if;
  if lower(btrim(coalesce(v_profile.email,'')))<>lower(btrim(coalesce(v_app.email,''))) then raise exception 'Invited account email must exactly match the candidate application.'; end if;
  if v_profile.role in('admin','customer') then raise exception 'This account cannot be linked as a Content Writer trainee.'; end if;
  if exists(select 1 from public.applicants x where x.linked_user_id=p_target_user_id and x.id<>p_applicant_id and x.stage<>'Activated' and coalesce(btrim(x.refusal_reason),'')='') then raise exception 'This account is already linked to another active candidate.'; end if;
  perform set_config('profox.recruitment_stage_rpc','1',true);
  perform set_config('profox.content_writer_invite_rpc','1',true);
  update public.applicants set linked_user_id=p_target_user_id,stage='Content Academy',onboarding_status='in_progress',onboarding_progress=0,onboarding_invite_sent_at=coalesce(onboarding_invite_sent_at,now()),onboarding_invite_last_sent_at=now(),onboarding_invite_count=onboarding_invite_count+1,updated_at=now() where id=p_applicant_id;
  update public.user_profiles set full_name=coalesce(nullif(btrim(v_app.full_name),''),full_name),phone=coalesce(nullif(btrim(v_app.phone),''),phone),country=coalesce(nullif(btrim(v_app.country),''),country),timezone=coalesce(nullif(btrim(v_app.timezone),''),timezone),role='content_writer',department='Content',status='onboarding',onboarding_status='in_progress',onboarding_progress=0,updated_at=now() where id=p_target_user_id;
  v_outbox:=public.enqueue_notification('recruitment:'||p_applicant_id::text||':content-account-invite:'||(v_app.onboarding_invite_count+1)::text,'content_recruitment_account_invite',lower(btrim(v_app.email)),p_target_user_id,public.recruitment_notification_payload(v_app)||jsonb_build_object('accountInviteUrl',p_account_invite_url,'applicationReference',v_app.application_reference),now());
  perform public.log_applicant_event(p_applicant_id,'account','content_academy_account_invited','Content Academy account invitation sent','The candidate account was securely linked in Content onboarding mode.',v_profile.status,'onboarding','system',null,'user_profiles',p_target_user_id,jsonb_build_object('inviteNumber',v_app.onboarding_invite_count+1,'outboxId',v_outbox));
  return jsonb_build_object('success',true,'linkedUserId',p_target_user_id,'stage','Content Academy','status','onboarding','inviteNumber',v_app.onboarding_invite_count+1,'applicationType','content_writer');
end; $$;

create or replace function public.service_get_content_writer_invite_candidates()
returns table(applicant_id uuid,email text,full_name text,linked_user_id uuid,invite_count integer)
language sql security definer set search_path=public,pg_temp as $$
  select a.id,lower(btrim(a.email)),a.full_name,a.linked_user_id,a.onboarding_invite_count
  from public.applicants a join public.career_jobs j on j.id=a.career_job_id
  where j.application_type='content_writer' and a.stage='Selected' and coalesce(btrim(a.refusal_reason),'')=''
    and (a.onboarding_invite_last_sent_at is null or a.onboarding_invite_last_sent_at<now()-interval '10 minutes')
  order by a.stage_entered_at nulls first,a.created_at
  limit 10;
$$;
revoke all on function public.service_get_content_writer_invite_candidates() from public,anon,authenticated;
grant execute on function public.service_get_content_writer_invite_candidates() to service_role;
revoke all on function public.service_link_invited_candidate(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.service_link_invited_candidate(uuid,uuid,text) to service_role;

create or replace function public.admin_get_applicant_review_snapshot(p_applicant_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.applicants%rowtype;j public.career_jobs%rowtype;cfg jsonb;checks jsonb;passed int;total int;min_months int;min_hours int;answers jsonb;
begin
  select * into a from public.applicants where id=p_applicant_id; if not found then return null; end if;
  select * into j from public.career_jobs where id=coalesce(a.career_job_id,public.recruitment_job_for_applicant(a.id));
  if not public.is_admin() and not (j.application_type='content_writer' and public.can_manage_content_applicant(a.id)) then raise exception 'Recruitment management access required.'; end if;
  cfg:=coalesce(j.role_details->'applicationForm','{}'::jsonb); answers:=coalesce(a.application_answers,'{}'::jsonb);
  if j.application_type='content_writer' then
    begin min_hours:=greatest(1,coalesce((cfg->>'minimumWeeklyHours')::int,20)); exception when others then min_hours:=20; end;
    checks:=jsonb_build_array(
      jsonb_build_object('key','contact','label','Contact details complete','passed',coalesce(a.email,'')<>'' and coalesce(a.country,'')<>'' and coalesce(a.timezone,'')<>''),
      jsonb_build_object('key','portfolio','label','Portfolio / writing sample supplied','passed',coalesce(answers->>'portfolioUrl','')<>'' or jsonb_array_length(coalesce(answers->'writingSamples','[]'::jsonb))>0),
      jsonb_build_object('key','experience','label','Relevant experience described','passed',char_length(coalesce(answers->>'contentExperience',''))>=30),
      jsonb_build_object('key','research','label','Research process described','passed',char_length(coalesce(answers->>'researchApproach',''))>=30),
      jsonb_build_object('key','quality','label','Quality / self-review process described','passed',char_length(coalesce(answers->>'qualityProcess',''))>=30),
      jsonb_build_object('key','availability','label','Minimum weekly availability','passed',coalesce(a.available_hours_per_week,0)>=min_hours,'detail',coalesce(a.available_hours_per_week,0)||' / '||min_hours||' hours'),
      jsonb_build_object('key','cv','label','CV or resume available','passed',coalesce(a.cv_storage_path,'')<>'' or coalesce(a.cv_url,'')<>''),
      jsonb_build_object('key','equipment','label','Laptop and reliable internet confirmed','passed',a.has_laptop_internet is true),
      jsonb_build_object('key','consent','label','Accuracy and privacy consent recorded','passed',a.accuracy_confirmed_at is not null and a.privacy_consent_at is not null)
    );
    select count(*),count(*) filter(where (x->>'passed')::boolean) into total,passed from jsonb_array_elements(checks)x;
    return jsonb_build_object('reference',a.application_reference,'applicationVersion',a.application_version,'policyVersion',a.application_policy_version,'submittedAt',coalesce(a.application_submitted_at,a.created_at),'currentStage',a.stage,'checks',checks,'passedChecks',passed,'totalChecks',total,'completenessPercent',case when total=0 then 0 else round((passed::numeric/total::numeric)*100) end,'readyForReview',passed=total,'currentPolicy',jsonb_build_object('minimumWeeklyHours',min_hours,'jobUpdatedAt',j.updated_at,'applicationType','content_writer'));
  end if;
  begin min_months:=greatest(0,coalesce((cfg->>'minimumSalesExperienceMonths')::int,6)); exception when others then min_months:=6; end;
  begin min_hours:=greatest(1,coalesce((cfg->>'minimumWeeklyHours')::int,35)); exception when others then min_hours:=35; end;
  checks:=jsonb_build_array(
    jsonb_build_object('key','contact','label','Contact details complete','passed',coalesce(a.phone,'')<>'' and coalesce(a.country,'')<>'' and coalesce(a.timezone,'')<>''),
    jsonb_build_object('key','linkedin','label','LinkedIn profile provided','passed',coalesce(a.linkedin_url,'')<>''),
    jsonb_build_object('key','experience','label','Minimum sales experience','passed',coalesce(a.sales_experience_months,0)>=min_months,'detail',coalesce(a.sales_experience_months,0)||' / '||min_months||' months'),
    jsonb_build_object('key','availability','label','Minimum weekly availability','passed',coalesce(a.available_hours_per_week,0)>=min_hours,'detail',coalesce(a.available_hours_per_week,0)||' / '||min_hours||' hours'),
    jsonb_build_object('key','prospecting','label','Prospecting experience selected','passed',cardinality(coalesce(a.prospecting_channels,'{}'))>0),
    jsonb_build_object('key','result','label','Previous sales result provided','passed',char_length(coalesce(a.previous_sales_results,''))>=20),
    jsonb_build_object('key','outreach','label','Sample outreach provided','passed',char_length(coalesce(a.sample_outreach_message,''))>=20),
    jsonb_build_object('key','cv','label','CV or resume available','passed',coalesce(a.cv_storage_path,'')<>'' or coalesce(a.cv_url,'')<>''),
    jsonb_build_object('key','video','label','Introduction video available','passed',coalesce(a.video_storage_path,'')<>'' or coalesce(a.video_url,'')<>''),
    jsonb_build_object('key','confirmations','label','Required applicant confirmations recorded','passed',a.has_laptop_internet is true and a.comfortable_commission is true and a.comfortable_sourcing is true and a.comfortable_english_calls is true and a.video_commitment is true),
    jsonb_build_object('key','consent','label','Accuracy and privacy consent recorded','passed',a.accuracy_confirmed_at is not null and a.privacy_consent_at is not null)
  );
  select count(*),count(*) filter(where (x->>'passed')::boolean) into total,passed from jsonb_array_elements(checks)x;
  return jsonb_build_object('reference',a.application_reference,'applicationVersion',a.application_version,'policyVersion',a.application_policy_version,'submittedAt',coalesce(a.application_submitted_at,a.created_at),'currentStage',a.stage,'checks',checks,'passedChecks',passed,'totalChecks',total,'completenessPercent',case when total=0 then 0 else round((passed::numeric/total::numeric)*100) end,'readyForReview',passed=total,'currentPolicy',jsonb_build_object('minimumSalesExperienceMonths',min_months,'minimumWeeklyHours',min_hours,'jobUpdatedAt',j.updated_at,'applicationType','sales_representative'));
end; $$;

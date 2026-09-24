-- PF UI/UX Designer Team — People Operations foundation
-- Scope: job post -> application -> structured recruitment -> selection.
-- Reuses career_jobs, applicants, recruitment_stage_policies, recruitment_assessments,
-- recruitment_interviews, applicant_events, notification outbox and existing protected stage trigger.
-- Sales remains backward-compatible; no parallel recruitment system is introduced.

alter table public.applicants
  add column if not exists portfolio_url text,
  add column if not exists application_answers jsonb not null default '{}'::jsonb;

comment on column public.applicants.portfolio_url is 'Primary portfolio/case-study URL for design and other portfolio-based roles.';
comment on column public.applicants.application_answers is 'Job-specific application answers. Shared identity/contact fields remain canonical applicant columns.';

create or replace function public.career_job_system_role(p_job_id uuid)
returns text
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select coalesce(nullif(j.role_details->>'systemRole',''),
    case when j.application_type='sales_representative' then 'sales' else 'pending' end)
  from public.career_jobs j where j.id=p_job_id
$$;

create or replace function public.career_job_training_track(p_job_id uuid)
returns text
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select coalesce(nullif(j.role_details->>'trainingTrack',''),
    case when j.application_type='sales_representative' then 'sales' else 'general' end)
  from public.career_jobs j where j.id=p_job_id
$$;

create or replace function public.recruitment_stage_rank_for_job(p_job_id uuid,p_stage text)
returns integer
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_rank integer;
begin
  if p_job_id is not null then
    select p.sort_order into v_rank
    from public.recruitment_stage_policies p
    where p.job_id=p_job_id and p.stage=p_stage and p.active=true
    limit 1;
    if v_rank is not null then return v_rank; end if;
  end if;
  return public.recruitment_stage_rank(p_stage);
end;
$$;

create or replace function public.recruitment_next_stage_for_job(p_job_id uuid,p_stage text)
returns text
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_current integer; v_next text;
begin
  if p_job_id is not null then
    select p.sort_order into v_current
    from public.recruitment_stage_policies p
    where p.job_id=p_job_id and p.stage=p_stage and p.active=true
    limit 1;
    if v_current is not null then
      select p.stage into v_next
      from public.recruitment_stage_policies p
      where p.job_id=p_job_id and p.active=true and p.sort_order>v_current
      order by p.sort_order
      limit 1;
      return v_next;
    end if;
  end if;
  return public.recruitment_next_stage(p_stage);
end;
$$;

-- One canonical UI/UX Designer job. Admin can edit/publish/close it through existing Job Posts.
insert into public.career_jobs(
  slug,title,short_summary,description,department,category,location,workplace_type,engagement_type,experience,
  responsibilities,requirements,selection_process,compensation,application_type,application_url,application_cta,
  requires_intro_video,featured,display_order,status,published_at,seo_title,seo_description,role_details
)
values(
  'ui-ux-designer',
  'UI/UX Designer',
  'Design clear, conversion-aware and accessible digital experiences from structured ProFox briefs through development-ready handoff.',
  'Join the ProFox UI/UX Design team to turn approved business requirements, content and customer goals into high-quality website and application experiences. The role follows PF-SOP-08, works in Figma, uses governed design systems, documents decisions and prepares complete development-ready handoffs.',
  'UI/UX Design','Design','Remote','Remote','Contract','2+ years relevant UI/UX or web design experience preferred',
  array[
    'Translate approved project briefs, scope, content and business goals into clear UX and responsive UI.',
    'Create information architecture, flows, wireframes, conversion hierarchy and production-ready interface designs at the depth required by the purchased package.',
    'Use and contribute to governed components, variables/tokens and reusable design-system patterns instead of recreating solved UI.',
    'Design responsive states, forms, errors, empty states, interactions and accessibility intent before development.',
    'Complete PF-SOP-08 self-QA, respond to independent review and present approved design work clearly.',
    'Prepare complete Figma, prototype, design-system and handoff references for the Developer team.'
  ],
  array[
    'Strong portfolio demonstrating real UI/UX problem solving and your individual contribution.',
    'Professional Figma workflow including components, variants, Auto Layout and reusable design-system thinking.',
    'Strong responsive web/interface design, hierarchy, typography, spacing and interaction-state skills.',
    'Ability to explain design decisions using user, business, conversion and accessibility reasoning.',
    'Working understanding of WCAG/accessibility intent and developer handoff.',
    'Reliable communication, organized remote working habits and willingness to follow controlled quality gates.'
  ],
  jsonb_build_array(
    jsonb_build_object('title','Apply','text','Submit your CV, portfolio, experience and structured design application.'),
    jsonb_build_object('title','Portfolio review','text','We score evidence of UX reasoning, UI craft, responsive design, systems thinking and contribution.'),
    jsonb_build_object('title','Design assessment','text','Shortlisted applicants complete structured design and Figma/practical evaluation.'),
    jsonb_build_object('title','Design interview','text','A consistent role-related interview evaluates judgment, collaboration and delivery readiness.'),
    jsonb_build_object('title','Agreement & onboarding','text','Selected designers complete the approved agreement and receive controlled Design Academy access.'),
    jsonb_build_object('title','Certification & activation','text','Production access is activated only after required PF-SOP-08 training and final approval.')
  ),
  '[]'::jsonb,'general',null,'Apply for UI/UX Designer',false,true,20,'Published',now(),
  'UI/UX Designer Careers | ProFox Web Designer',
  'Apply to join the ProFox UI/UX Design team. Structured portfolio review, practical assessment, PF-SOP-08 onboarding and controlled production activation.',
  jsonb_build_object(
    'systemRole','uiux_designer',
    'department','UI/UX Design',
    'trainingTrack','uiux_design',
    'agreementTemplateKey','uiux_designer_contractor',
    'workflowKey','uiux_designer_v1',
    'applicationForm',jsonb_build_object(
      'minimumWeeklyHours',20,
      'portfolioRequired',true,
      'cvRequired',true,
      'sourceOptions',jsonb_build_array('LinkedIn','Google Search','Social media','Job board','Referral','ProFox website','Other'),
      'fields',jsonb_build_array(
        'portfolioUrl','linkedinUrl','cv','yearsExperience','figmaExperience','responsiveExperience','designSystemsExperience',
        'accessibilityExperience','strongestCaseStudy','caseStudyContribution','developerHandoffExperience','availability','motivation'
      )
    )
  )
)
on conflict(slug) do update set
  title=excluded.title,
  short_summary=excluded.short_summary,
  description=excluded.description,
  department=excluded.department,
  category=excluded.category,
  location=excluded.location,
  workplace_type=excluded.workplace_type,
  engagement_type=excluded.engagement_type,
  experience=excluded.experience,
  responsibilities=excluded.responsibilities,
  requirements=excluded.requirements,
  selection_process=excluded.selection_process,
  application_type=excluded.application_type,
  application_cta=excluded.application_cta,
  requires_intro_video=false,
  role_details=excluded.role_details,
  seo_title=excluded.seo_title,
  seo_description=excluded.seo_description,
  updated_at=now();

-- Job-aware UI/UX recruitment policy. Rubrics are evidence-oriented and consistent across candidates.
with j as (select id from public.career_jobs where slug='ui-ux-designer' limit 1), p(stage,sort_order,assessment_required,passing_score,sla_hours,interview_required,rubric) as (
  values
  ('New Application',1,false,null::integer,24,false,'[]'::jsonb),
  ('Portfolio Review',2,true,75,48,false,'[
    {"key":"problemSolving","label":"UX problem framing and reasoning","maxPoints":20},
    {"key":"uiCraft","label":"Visual hierarchy and UI craft","maxPoints":20},
    {"key":"responsive","label":"Responsive/interface-state evidence","maxPoints":15},
    {"key":"systems","label":"Design-system/component thinking","maxPoints":15},
    {"key":"conversion","label":"Business/conversion judgment","maxPoints":10},
    {"key":"accessibility","label":"Accessibility intent","maxPoints":10},
    {"key":"contribution","label":"Clear personal contribution and evidence","maxPoints":10}
  ]'::jsonb),
  ('Initial Screening',3,true,75,48,false,'[
    {"key":"communication","label":"Clear professional communication","maxPoints":20},
    {"key":"experience","label":"Relevant UI/UX delivery experience","maxPoints":20},
    {"key":"figma","label":"Figma workflow readiness","maxPoints":20},
    {"key":"delivery","label":"Remote delivery discipline and availability","maxPoints":15},
    {"key":"handoff","label":"Developer collaboration/handoff understanding","maxPoints":15},
    {"key":"fit","label":"PF-SOP-08 quality mindset","maxPoints":10}
  ]'::jsonb),
  ('Design Assessment',4,true,80,72,false,'[
    {"key":"ux","label":"UX structure and task clarity","maxPoints":20},
    {"key":"hierarchy","label":"Content/conversion hierarchy","maxPoints":20},
    {"key":"interaction","label":"Interaction and state reasoning","maxPoints":15},
    {"key":"responsive","label":"Responsive adaptation","maxPoints":15},
    {"key":"accessibility","label":"Accessible design decisions","maxPoints":15},
    {"key":"rationale","label":"Evidence-based rationale","maxPoints":15}
  ]'::jsonb),
  ('Figma Practical',5,true,80,72,false,'[
    {"key":"structure","label":"File/page/frame organization","maxPoints":15},
    {"key":"autoLayout","label":"Auto Layout and responsive construction","maxPoints":20},
    {"key":"components","label":"Components/variants/reuse","maxPoints":20},
    {"key":"tokens","label":"Variables/tokens/system consistency","maxPoints":15},
    {"key":"states","label":"States/prototype/handoff completeness","maxPoints":15},
    {"key":"quality","label":"Final UI quality and precision","maxPoints":15}
  ]'::jsonb),
  ('Design Interview',6,true,80,48,true,'[
    {"key":"decisionMaking","label":"Design judgment and trade-offs","maxPoints":20},
    {"key":"userBusiness","label":"Balances user and business outcomes","maxPoints":20},
    {"key":"feedback","label":"Handles critique/client feedback professionally","maxPoints":15},
    {"key":"collaboration","label":"Content/developer collaboration","maxPoints":15},
    {"key":"quality","label":"Quality, accessibility and scope discipline","maxPoints":15},
    {"key":"communication","label":"Communication and ownership","maxPoints":15}
  ]'::jsonb),
  ('Selected',7,false,null::integer,24,false,'[]'::jsonb),
  ('Agreement Pending',8,false,null::integer,72,false,'[]'::jsonb),
  ('Design Academy',9,false,null::integer,168,false,'[]'::jsonb),
  ('Final Approval',10,false,null::integer,24,false,'[]'::jsonb),
  ('Ready for System Access',11,false,null::integer,24,false,'[]'::jsonb),
  ('Activated',12,false,null::integer,0,false,'[]'::jsonb)
)
insert into public.recruitment_stage_policies(job_id,stage,sort_order,active,assessment_required,passing_score,sla_hours,interview_required,rubric,updated_at)
select j.id,p.stage,p.sort_order,true,p.assessment_required,p.passing_score,p.sla_hours,p.interview_required,p.rubric,now() from j cross join p
on conflict(job_id,stage) do update set
  sort_order=excluded.sort_order,active=true,assessment_required=excluded.assessment_required,passing_score=excluded.passing_score,
  sla_hours=excluded.sla_hours,interview_required=excluded.interview_required,rubric=excluded.rubric,updated_at=now();

-- Generic payload now resolves the actual career role instead of claiming every candidate is Sales.
create or replace function public.recruitment_notification_payload(p_applicant public.applicants)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
select jsonb_build_object(
  'applicantId',p_applicant.id,
  'fullName',p_applicant.full_name,
  'email',p_applicant.email,
  'country',p_applicant.country,
  'timezone',p_applicant.timezone,
  'roleTitle',coalesce((select j.title from public.career_jobs j where j.id=p_applicant.career_job_id),p_applicant.position),
  'systemRole',coalesce(public.career_job_system_role(p_applicant.career_job_id),'pending'),
  'stage',p_applicant.stage,
  'applicationReference',p_applicant.application_reference,
  'applicationUrl','https://www.profoxwebdesigner.com/careers'
)
$$;

create sequence if not exists public.uiux_application_reference_seq start 1;

create or replace function public.next_uiux_application_reference()
returns text
language sql
set search_path=public,pg_temp
as $$
  select 'PF-UIUX-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.uiux_application_reference_seq')::text,6,'0')
$$;

-- Secure public UI/UX application. Role-specific answers live in JSON; shared identity/evidence remains canonical.
create or replace function public.submit_public_uiux_application(p_job_slug text,p_application jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_job public.career_jobs%rowtype;
  v_id uuid;
  v_email text:=lower(trim(coalesce(p_application->>'email','')));
  v_name text:=trim(coalesce(p_application->>'fullName',''));
  v_portfolio text:=trim(coalesce(p_application->>'portfolioUrl',''));
  v_cv_path text:=trim(coalesce(p_application->>'cvStoragePath',''));
  v_hours integer;
  v_reference text;
  v_answers jsonb;
begin
  select * into v_job from public.career_jobs
  where slug=p_job_slug and status='Published' and coalesce(role_details->>'systemRole','')='uiux_designer'
    and (closes_at is null or closes_at>now())
  limit 1;
  if not found then raise exception 'This UI/UX Designer role is not accepting applications.'; end if;
  if length(v_name)<2 then raise exception 'A valid full name is required.'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'A valid email address is required.'; end if;
  if v_portfolio !~* '^https?://' then raise exception 'A valid portfolio URL is required.'; end if;
  if coalesce(v_cv_path,'')='' and trim(coalesce(p_application->>'cvUrl',''))='' then raise exception 'CV or resume is required.'; end if;
  if coalesce((p_application->>'consentAccurate')::boolean,false) is not true or coalesce((p_application->>'consentPrivacy')::boolean,false) is not true then
    raise exception 'Accuracy confirmation and privacy consent are required.';
  end if;
  begin v_hours:=greatest(0,least(80,coalesce((p_application->>'availableHoursPerWeek')::integer,0))); exception when others then v_hours:=0; end;
  if v_hours<coalesce((v_job.role_details->'applicationForm'->>'minimumWeeklyHours')::integer,1) then
    raise exception 'Weekly availability is below the current role requirement.';
  end if;
  if exists(select 1 from public.applicants a where lower(a.email)=v_email and a.career_job_id=v_job.id and coalesce(trim(a.refusal_reason),'')='' and a.stage<>'Activated') then
    return jsonb_build_object('success',true,'duplicate',true,'message','An active application for this role already exists.');
  end if;

  v_reference:=public.next_uiux_application_reference();
  v_answers:=coalesce(p_application->'answers','{}'::jsonb)||jsonb_build_object(
    'yearsExperience',p_application->>'yearsExperience',
    'figmaExperience',p_application->>'figmaExperience',
    'responsiveExperience',p_application->>'responsiveExperience',
    'designSystemsExperience',p_application->>'designSystemsExperience',
    'accessibilityExperience',p_application->>'accessibilityExperience',
    'strongestCaseStudy',p_application->>'strongestCaseStudy',
    'caseStudyContribution',p_application->>'caseStudyContribution',
    'developerHandoffExperience',p_application->>'developerHandoffExperience',
    'motivation',p_application->>'motivation'
  );

  insert into public.applicants(
    full_name,email,phone,country,timezone,position,linkedin_url,cv_url,skills,source,stage,agreement_status,onboarding_status,
    application_reference,application_version,current_job_title,available_hours_per_week,preferred_work_window,earliest_start_date,
    heard_about_source,heard_about_detail,motivation,has_laptop_internet,accuracy_confirmed_at,privacy_consent_at,
    application_policy_version,application_submitted_at,cv_storage_path,application_policy_snapshot,career_job_id,
    utm_source,utm_medium,utm_campaign,utm_content,utm_term,landing_page,referrer_url,portfolio_url,application_answers
  ) values (
    v_name,v_email,trim(coalesce(p_application->>'phone','')),trim(coalesce(p_application->>'country','')),coalesce(nullif(trim(p_application->>'timezone'),''),'UTC'),
    v_job.title,trim(coalesce(p_application->>'linkedinUrl','')),trim(coalesce(p_application->>'cvUrl','')),trim(coalesce(p_application->>'skills','')),
    coalesce(nullif(trim(p_application->>'source'),''),'ProFox Website'),'New Application','not_sent','not_started',
    v_reference,'uiux_role_v1',trim(coalesce(p_application->>'currentRole','')),v_hours,trim(coalesce(p_application->>'preferredWorkWindow','')),
    nullif(p_application->>'earliestStartDate','')::date,trim(coalesce(p_application->>'heardAboutSource','')),trim(coalesce(p_application->>'heardAboutDetail','')),
    trim(coalesce(p_application->>'motivation','')),coalesce((p_application->>'hasLaptopInternet')::boolean,false),now(),now(),
    coalesce(v_job.role_details->>'workflowKey','uiux_designer_v1'),now(),nullif(v_cv_path,''),
    jsonb_build_object('jobId',v_job.id,'jobTitle',v_job.title,'workflowKey',v_job.role_details->>'workflowKey','applicationForm',v_job.role_details->'applicationForm','capturedAt',now()),
    v_job.id,nullif(p_application->>'utmSource',''),nullif(p_application->>'utmMedium',''),nullif(p_application->>'utmCampaign',''),
    nullif(p_application->>'utmContent',''),nullif(p_application->>'utmTerm',''),nullif(p_application->>'landingPage',''),nullif(p_application->>'referrerUrl',''),
    v_portfolio,v_answers
  ) returning id into v_id;

  return jsonb_build_object('success',true,'applicantId',v_id,'reference',v_reference,'stage','New Application');
end;
$$;

revoke all on function public.submit_public_uiux_application(text,jsonb) from public;
grant execute on function public.submit_public_uiux_application(text,jsonb) to anon,authenticated;

-- Role-aware application completeness. Existing Sales checks remain intact; UI/UX uses portfolio/design evidence.
create or replace function public.admin_get_applicant_review_snapshot(p_applicant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  a public.applicants%rowtype; j public.career_jobs%rowtype; cfg jsonb; checks jsonb; passed int; total int;
  min_months int; min_hours int; v_role text;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into a from public.applicants where id=p_applicant_id; if not found then return null; end if;
  select * into j from public.career_jobs where id=a.career_job_id;
  if not found then select * into j from public.career_jobs where application_type='sales_representative' order by (status='Published') desc,featured desc,published_at desc nulls last limit 1; end if;
  cfg:=coalesce(j.role_details->'applicationForm','{}'::jsonb);
  v_role:=coalesce(j.role_details->>'systemRole',case when j.application_type='sales_representative' then 'sales' else 'pending' end);
  min_hours:=greatest(1,coalesce((cfg->>'minimumWeeklyHours')::int,20));

  if v_role='uiux_designer' then
    checks:=jsonb_build_array(
      jsonb_build_object('key','contact','label','Contact details complete','passed',coalesce(a.email,'')<>'' and coalesce(a.country,'')<>'' and coalesce(a.timezone,'')<>''),
      jsonb_build_object('key','portfolio','label','Portfolio URL available','passed',coalesce(a.portfolio_url,'')~*'^https?://'),
      jsonb_build_object('key','cv','label','CV or resume available','passed',coalesce(a.cv_storage_path,'')<>'' or coalesce(a.cv_url,'')<>''),
      jsonb_build_object('key','availability','label','Weekly availability meets role requirement','passed',coalesce(a.available_hours_per_week,0)>=min_hours,'detail',coalesce(a.available_hours_per_week,0)||' / '||min_hours||' hours'),
      jsonb_build_object('key','figma','label','Figma experience answered','passed',length(trim(coalesce(a.application_answers->>'figmaExperience','')))>5),
      jsonb_build_object('key','responsive','label','Responsive design experience answered','passed',length(trim(coalesce(a.application_answers->>'responsiveExperience','')))>5),
      jsonb_build_object('key','systems','label','Design-system experience answered','passed',length(trim(coalesce(a.application_answers->>'designSystemsExperience','')))>5),
      jsonb_build_object('key','caseStudy','label','Case-study evidence answered','passed',length(trim(coalesce(a.application_answers->>'strongestCaseStudy','')))>10 and length(trim(coalesce(a.application_answers->>'caseStudyContribution','')))>10),
      jsonb_build_object('key','handoff','label','Developer handoff experience answered','passed',length(trim(coalesce(a.application_answers->>'developerHandoffExperience','')))>5),
      jsonb_build_object('key','workSetup','label','Laptop and internet confirmed','passed',a.has_laptop_internet is true),
      jsonb_build_object('key','consent','label','Accuracy and privacy consent recorded','passed',a.accuracy_confirmed_at is not null and a.privacy_consent_at is not null)
    );
  else
    min_months:=greatest(0,coalesce((cfg->>'minimumSalesExperienceMonths')::int,6));
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
  end if;

  select count(*),count(*) filter(where(x->>'passed')::boolean) into total,passed from jsonb_array_elements(checks)x;
  return jsonb_build_object('reference',a.application_reference,'applicationVersion',a.application_version,'policyVersion',a.application_policy_version,
    'submittedAt',coalesce(a.application_submitted_at,a.created_at),'currentStage',a.stage,'jobId',j.id,'jobTitle',j.title,'systemRole',v_role,
    'portfolioUrl',a.portfolio_url,'answers',a.application_answers,'checks',checks,'passedChecks',passed,'totalChecks',total,
    'completenessPercent',case when total=0 then 0 else round((passed::numeric/total::numeric)*100) end,'readyForReview',passed=total,
    'currentPolicy',jsonb_build_object('minimumWeeklyHours',min_hours,'jobUpdatedAt',j.updated_at));
end;
$$;

-- Protected progression now reads the candidate's job policy. Sales-only special gates remain Sales-only.
create or replace function public.admin_advance_applicant_stage(p_applicant_id uuid,p_target_stage text default null)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype; v_target text; v_policy public.recruitment_stage_policies%rowtype;
  v_from_rank int; v_to_rank int; v_role text;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id for update; if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(trim(v_app.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot progress.'; end if;
  v_role:=coalesce(public.career_job_system_role(v_app.career_job_id),'sales');
  v_target:=coalesce(p_target_stage,public.recruitment_next_stage_for_job(v_app.career_job_id,v_app.stage));
  if v_target is null then raise exception 'No next stage is available.'; end if;
  v_from_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_app.stage);
  v_to_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_target);
  if v_from_rank is null or v_to_rank is null or v_to_rank<>v_from_rank+1 then
    raise exception 'Recruitment stages must progress sequentially through the selected job workflow.';
  end if;

  if v_role='sales' and v_app.stage='New Application' and v_target='Video Pending' and (coalesce(v_app.video_url,'')<>'' or coalesce(v_app.video_storage_path,'')<>'') then v_target:='Video Review'; end if;
  if v_role='sales' and v_app.stage='Video Pending' and v_target='Video Review' and coalesce(v_app.video_url,'')='' and coalesce(v_app.video_storage_path,'')='' then raise exception 'Introduction video is required before Video Review.'; end if;

  select * into v_policy from public.recruitment_stage_policies where job_id=v_app.career_job_id and stage=v_app.stage and active=true;
  if found and v_policy.assessment_required and not public.recruitment_latest_assessment_passed(v_app.id,v_app.stage) then
    raise exception 'A passed structured assessment for % is required before progression.',v_app.stage;
  end if;
  if found and v_policy.interview_required and not exists(select 1 from public.recruitment_interviews i where i.applicant_id=v_app.id and i.stage=v_app.stage and i.status='Completed') then
    raise exception 'A completed structured interview for % is required before progression.',v_app.stage;
  end if;

  if v_app.stage='Selected' then raise exception 'Issue the approved candidate agreement to move a Selected candidate into Agreement Pending.'; end if;
  if v_app.stage='Agreement Pending' then raise exception 'A verified agreement and protected account invitation are required before onboarding training.'; end if;
  if v_app.stage in ('One-Day Training','Design Academy') then raise exception 'The candidate must complete the assigned Academy and request Final Approval through the protected workflow.'; end if;
  if v_app.stage='Final Approval' then raise exception 'Use the protected Final Approval action.'; end if;
  if v_app.stage='Ready for System Access' then raise exception 'Use protected workforce activation.'; end if;

  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants set stage=v_target,updated_at=now() where id=v_app.id;
  return jsonb_build_object('success',true,'fromStage',v_app.stage,'toStage',v_target,'systemRole',v_role);
end;
$$;

create or replace function public.admin_override_applicant_stage(p_applicant_id uuid,p_target_stage text,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_app public.applicants%rowtype; v_from_rank int; v_to_rank int; v_agreement_rank int;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if length(trim(coalesce(p_reason,'')))<12 then raise exception 'A specific override reason of at least 12 characters is required.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id for update; if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(trim(v_app.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot be moved.'; end if;
  v_from_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_app.stage);
  v_to_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,p_target_stage);
  v_agreement_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,'Agreement Pending');
  if v_to_rank is null then raise exception 'Invalid target stage for this job.'; end if;
  if v_agreement_rank is not null and (v_from_rank>=v_agreement_rank or v_to_rank>=v_agreement_rank) then
    raise exception 'Admin Override cannot bypass Agreement, Academy, Final Approval or activation gates.';
  end if;
  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants set stage=p_target_stage,updated_at=now() where id=p_applicant_id;
  perform public.log_applicant_event(p_applicant_id,'recruitment','stage_override','Recruitment stage overridden',left(trim(p_reason),2000),v_app.stage,p_target_stage,'admin',auth.uid(),'applicants',p_applicant_id,jsonb_build_object('reason',left(trim(p_reason),2000)));
  return jsonb_build_object('success',true,'fromStage',v_app.stage,'toStage',p_target_stage,'override',true);
end;
$$;

-- Existing stage-policy editor can now update job-specific non-Sales stages without a global enum.
create or replace function public.admin_save_recruitment_stage_policy(
  p_job_id uuid,p_stage text,p_assessment_required boolean,p_passing_score integer,p_sla_hours integer,p_interview_required boolean,p_rubric jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_rank integer; v_row public.recruitment_stage_policies%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if not exists(select 1 from public.career_jobs where id=p_job_id) then raise exception 'Job Post not found.'; end if;
  select sort_order into v_rank from public.recruitment_stage_policies where job_id=p_job_id and stage=p_stage;
  if v_rank is null then v_rank:=coalesce(public.recruitment_stage_rank(p_stage),(select coalesce(max(sort_order),0)+1 from public.recruitment_stage_policies where job_id=p_job_id)); end if;
  if p_assessment_required and (p_passing_score is null or p_passing_score<0 or p_passing_score>100) then raise exception 'Assessment stages require a passing score from 0 to 100.'; end if;
  if p_sla_hours<0 or p_sla_hours>720 then raise exception 'SLA hours must be between 0 and 720.'; end if;
  if jsonb_typeof(coalesce(p_rubric,'[]'::jsonb))<>'array' then raise exception 'Rubric must be an array.'; end if;
  insert into public.recruitment_stage_policies(job_id,stage,sort_order,active,assessment_required,passing_score,sla_hours,interview_required,rubric,updated_by,updated_at)
  values(p_job_id,p_stage,v_rank,true,coalesce(p_assessment_required,false),case when p_assessment_required then p_passing_score else null end,p_sla_hours,coalesce(p_interview_required,false),coalesce(p_rubric,'[]'::jsonb),auth.uid(),now())
  on conflict(job_id,stage) do update set sort_order=excluded.sort_order,active=true,assessment_required=excluded.assessment_required,passing_score=excluded.passing_score,sla_hours=excluded.sla_hours,interview_required=excluded.interview_required,rubric=excluded.rubric,updated_by=auth.uid(),updated_at=now()
  returning * into v_row;
  return jsonb_build_object('success',true,'stage',v_row.stage,'sortOrder',v_row.sort_order,'assessmentRequired',v_row.assessment_required,'passingScore',v_row.passing_score,'slaHours',v_row.sla_hours,'interviewRequired',v_row.interview_required,'rubric',v_row.rubric,'updatedAt',v_row.updated_at);
end;
$$;

-- Designer recruitment email templates use the existing notification outbox/template engine.
insert into public.notification_templates(template_key,channel,subject,body_text,body_html,variables,active,updated_at) values
('recruitment_uiux_application_received','email','We received your ProFox UI/UX Designer application','Hi {{fullName}},\n\nThank you for applying for {{roleTitle}}. Your application reference is {{applicationReference}}. We will review your portfolio and application evidence through our structured hiring process.\n\nProFox Recruitment','<p>Hi {{fullName}},</p><p>Thank you for applying for <strong>{{roleTitle}}</strong>. Your application reference is <strong>{{applicationReference}}</strong>.</p><p>We will review your portfolio and application evidence through our structured hiring process.</p><p>ProFox Recruitment</p>',array['fullName','roleTitle','applicationReference'],true,now()),
('recruitment_uiux_portfolio_review','email','Your ProFox UI/UX application is in portfolio review','Hi {{fullName}},\n\nYour {{roleTitle}} application has moved to Portfolio Review. No action is required unless our team contacts you for clarification.','<p>Hi {{fullName}},</p><p>Your <strong>{{roleTitle}}</strong> application has moved to <strong>Portfolio Review</strong>. No action is required unless our team contacts you for clarification.</p>',array['fullName','roleTitle'],true,now()),
('recruitment_uiux_assessment','email','Next step in your ProFox UI/UX Designer application','Hi {{fullName}},\n\nYour application has progressed to {{stage}}. Follow the instructions provided by the ProFox recruitment team and submit only the requested evidence.','<p>Hi {{fullName}},</p><p>Your application has progressed to <strong>{{stage}}</strong>. Follow the instructions provided by the ProFox recruitment team and submit only the requested evidence.</p>',array['fullName','stage'],true,now()),
('recruitment_uiux_selected','email','You have been selected for ProFox UI/UX Designer onboarding','Hi {{fullName}},\n\nYou have passed the required UI/UX recruitment evaluations. The next controlled step is your ProFox designer agreement and onboarding.','<p>Hi {{fullName}},</p><p>You have passed the required UI/UX recruitment evaluations. The next controlled step is your ProFox designer agreement and onboarding.</p>',array['fullName'],true,now()),
('recruitment_uiux_design_academy','email','Your ProFox Design Academy onboarding is ready','Hi {{fullName}},\n\nYour agreement has been verified and your UI/UX Design onboarding account is ready. Use the newest secure account invitation and complete the required Design Academy before production activation.','<p>Hi {{fullName}},</p><p>Your agreement has been verified and your UI/UX Design onboarding account is ready. Use the newest secure account invitation and complete the required Design Academy before production activation.</p>',array['fullName'],true,now()),
('recruitment_uiux_final_review','email','Your ProFox UI/UX onboarding is in final review','Hi {{fullName}},\n\nYour required Design Academy work has been submitted for Final Approval. Production access remains locked until Management approval.','<p>Hi {{fullName}},</p><p>Your required Design Academy work has been submitted for <strong>Final Approval</strong>. Production access remains locked until Management approval.</p>',array['fullName'],true,now()),
('recruitment_uiux_activated','email','Welcome to the active ProFox UI/UX Design team','Hi {{fullName}},\n\nYour UI/UX Designer account is now active. Sign in to ProFox and use My Work / Design Delivery as the source of truth for assigned client work.','<p>Hi {{fullName}},</p><p>Your UI/UX Designer account is now active. Sign in to ProFox and use <strong>My Work / Design Delivery</strong> as the source of truth for assigned client work.</p>',array['fullName'],true,now())
on conflict(template_key) do update set subject=excluded.subject,body_text=excluded.body_text,body_html=excluded.body_html,variables=excluded.variables,active=true,updated_at=now();

-- Role-aware notification routing. Sales logic remains unchanged; UI/UX gets its own messages.
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
begin
  if tg_op='INSERT' then
    if v_role='sales' then
      if new.stage='Video Pending' then perform public.queue_recruitment_email(new,'recruitment_video_pending','video-pending-'||v_cycle,now()); perform public.queue_recruitment_video_pending_followups(new,v_cycle);
      else perform public.queue_recruitment_email(new,'recruitment_application_received','application-received',now()); end if;
    elsif v_role='uiux_designer' then
      perform public.queue_recruitment_email(new,'recruitment_uiux_application_received','application-received',now());
    end if;
    for v_admin in select id from public.user_profiles where role='admin' and status='active' loop
      perform public.enqueue_in_app_notification(v_admin.id,'Recruitment','New '||coalesce((select title from public.career_jobs where id=new.career_job_id),new.position)||' application',new.full_name||' submitted application '||coalesce(new.application_reference,'' )||'.','/admin/app/recruitment?tab=recruitment','recruitment:new-applicant:'||new.id::text||':'||v_admin.id::text);
    end loop;
    return new;
  end if;

  if new.refusal_reason is distinct from old.refusal_reason and coalesce(trim(new.refusal_reason),'')<>'' then
    if v_role='sales' then perform public.cancel_recruitment_video_pending_followups(new.id,'Candidate application was closed.'); end if;
    perform public.queue_recruitment_email(new,'recruitment_not_selected','not-selected',now()); return new;
  end if;

  if new.stage is distinct from old.stage then
    if v_role='sales' then
      if old.stage='Video Pending' and new.stage<>'Video Pending' then perform public.cancel_recruitment_video_pending_followups(new.id,'Candidate progressed beyond Video Pending.'); end if;
      if new.stage='Agreement Pending' and old.stage='Selected' and coalesce(new.agreement_status,'not_sent')='not_sent' then perform public.create_sales_partner_agreement_internal(new.id); v_secure_issue:=true; end if;
      v_template:=case new.stage
        when 'New Application' then 'recruitment_application_received' when 'Video Pending' then 'recruitment_video_pending' when 'Video Review' then 'recruitment_video_received'
        when 'Initial Screening' then 'recruitment_initial_screening' when 'Shortlisted' then 'recruitment_shortlisted' when 'Sales Assessment' then 'recruitment_sales_assessment'
        when 'Lead Research Test' then 'recruitment_lead_research' when 'CRM Assessment' then 'recruitment_crm_assessment' when 'Selected' then 'recruitment_selected'
        when 'Agreement Pending' then case when v_secure_issue then null else 'recruitment_agreement_pending' end when 'One-Day Training' then 'recruitment_training'
        when 'Final Approval' then 'recruitment_final_review' when 'Ready for System Access' then 'recruitment_final_approved' when 'Activated' then 'recruitment_activated' else null end;
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
      if v_template is not null then perform public.queue_recruitment_email(new,v_template,'stage-'||lower(regexp_replace(new.stage,'[^a-zA-Z0-9]+','-','g'))||'-'||v_cycle,now()); end if;
    end if;
  end if;
  return new;
end;
$$;

-- Generic stage metadata for the existing Recruitment UI.
create or replace function public.admin_get_applicant_workflow_meta(p_applicant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare a public.applicants%rowtype; j public.career_jobs%rowtype; v_stages jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into a from public.applicants where id=p_applicant_id; if not found then raise exception 'Candidate not found.'; end if;
  select * into j from public.career_jobs where id=a.career_job_id;
  select coalesce(jsonb_agg(jsonb_build_object('stage',p.stage,'sortOrder',p.sort_order) order by p.sort_order),'[]'::jsonb) into v_stages
  from public.recruitment_stage_policies p where p.job_id=a.career_job_id and p.active=true;
  return jsonb_build_object(
    'stageEnteredAt',a.stage_entered_at,'closedAt',a.closed_at,'careerJobId',a.career_job_id,'jobTitle',coalesce(j.title,a.position),
    'systemRole',coalesce(j.role_details->>'systemRole',case when j.application_type='sales_representative' then 'sales' else 'pending' end),
    'trainingTrack',coalesce(j.role_details->>'trainingTrack',case when j.application_type='sales_representative' then 'sales' else 'general' end),
    'stages',v_stages,'utmSource',a.utm_source,'utmMedium',a.utm_medium,'utmCampaign',a.utm_campaign,'utmContent',a.utm_content,'utmTerm',a.utm_term,
    'onboardingInviteSentAt',a.onboarding_invite_sent_at,'onboardingInviteLastSentAt',a.onboarding_invite_last_sent_at,'onboardingInviteCount',a.onboarding_invite_count
  );
end;
$$;

revoke all on function public.admin_get_applicant_workflow_meta(uuid) from public,anon;
grant execute on function public.admin_get_applicant_workflow_meta(uuid) to authenticated;

-- Preserve helper privacy except intentionally callable Admin/public surfaces.
revoke all on function public.career_job_system_role(uuid) from public,anon;
revoke all on function public.career_job_training_track(uuid) from public,anon;
revoke all on function public.recruitment_stage_rank_for_job(uuid,text) from public,anon;
revoke all on function public.recruitment_next_stage_for_job(uuid,text) from public,anon;

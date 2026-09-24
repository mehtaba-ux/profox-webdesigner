-- Canonical Web Developer people-operations seed.
-- Reuses career_jobs, applicants, recruitment_stage_policies and notification_templates.
insert into public.career_jobs(
  slug,title,short_summary,description,department,category,location,workplace_type,engagement_type,experience,
  responsibilities,requirements,selection_process,compensation,application_type,application_url,application_cta,
  requires_intro_video,featured,display_order,status,published_at,seo_title,seo_description,role_details
) values(
  'web-developer','Web Developer',
  'Build approved ProFox website and web-application experiences into secure, accessible, performant production-ready releases.',
  'Join the ProFox Development team to implement approved client scope and design through a controlled engineering workflow using the canonical ProFox project, task, design-handoff, review and release controls.',
  'Development','Engineering','Remote','Remote','Contract','2+ years relevant web-development experience preferred',
  array[
    'Implement approved responsive websites and web applications from canonical scope, requirements, content and design handoff.',
    'Reuse approved components, services and patterns instead of recreating solved functionality.',
    'Use controlled Git/GitHub branches and pull requests and keep build, test and staging evidence linked to the ProFox task.',
    'Complete developer self-QA before independent review and QA handoff.',
    'Resolve structured QA and UI/UX implementation findings in the same project workflow.',
    'Prepare technical documentation and handover evidence for Management review before client release.'
  ],
  array[
    'Strong shipped-work evidence showing your own contribution to production websites or web applications.',
    'Professional Git/GitHub workflow including feature branches, pull requests and review feedback.',
    'Strong HTML, CSS, JavaScript and responsive implementation fundamentals.',
    'Working knowledge of accessibility, web performance, application security and testing.',
    'Ability to implement approved Figma/design-system handoff accurately.',
    'Reliable communication, documentation and remote-working discipline.'
  ],
  jsonb_build_array(
    jsonb_build_object('title','Apply','text','Submit your CV, GitHub/profile links, shipped-work evidence and structured development application.'),
    jsonb_build_object('title','Code & portfolio review','text','Evidence-based review of implementation quality and contribution.'),
    jsonb_build_object('title','Technical assessment','text','Structured practical web-delivery evaluation.'),
    jsonb_build_object('title','Development practical','text','Controlled mini-project covering implementation, Git, testing and quality.'),
    jsonb_build_object('title','Technical interview','text','Role-related interview covering engineering judgment and delivery ownership.'),
    jsonb_build_object('title','Agreement & Developer Academy','text','Selected Developers complete the approved agreement and Developer Academy.'),
    jsonb_build_object('title','Certification & activation','text','Production access is activated only after required certification and Management approval.')
  ),
  '[]'::jsonb,'general','/careers/web-developer/apply','Apply for Web Developer',false,true,30,'Published',now(),
  'Web Developer Careers | ProFox Web Designer',
  'Apply to join the ProFox Development team through structured technical assessment, Developer Academy and controlled activation.',
  jsonb_build_object(
    'systemRole','developer','department','Development','trainingTrack','web_development',
    'agreementTemplateKey','web_developer_contractor','workflowKey','web_developer_v1',
    'applicationForm',jsonb_build_object(
      'minimumWeeklyHours',20,'githubRequired',true,'workEvidenceRequired',true,'cvRequired',true,
      'sourceOptions',jsonb_build_array('LinkedIn','Google Search','Social media','Job board','Referral','ProFox website','Other'),
      'fields',jsonb_build_array('githubUrl','portfolioUrl','linkedinUrl','cv','yearsExperience','primaryStack','frontendExperience','backendExperience','wordpressExperience','gitWorkflowExperience','testingExperience','accessibilityExperience','performanceExperience','securityExperience','designHandoffExperience','strongestProject','projectContribution','availability','motivation')
    )
  )
)
on conflict(slug) do update set
  title=excluded.title,short_summary=excluded.short_summary,description=excluded.description,department=excluded.department,
  category=excluded.category,location=excluded.location,workplace_type=excluded.workplace_type,engagement_type=excluded.engagement_type,
  experience=excluded.experience,responsibilities=excluded.responsibilities,requirements=excluded.requirements,
  selection_process=excluded.selection_process,application_type=excluded.application_type,application_url=excluded.application_url,
  application_cta=excluded.application_cta,requires_intro_video=false,role_details=excluded.role_details,
  seo_title=excluded.seo_title,seo_description=excluded.seo_description,updated_at=now();

with j as (select id from public.career_jobs where slug='web-developer' limit 1),
p(stage,sort_order,assessment_required,passing_score,sla_hours,interview_required,rubric) as (
  values
  ('New Application',1,false,null::integer,24,false,'[]'::jsonb),
  ('Code & Portfolio Review',2,true,75,48,false,'[{"key":"shippedWork","label":"Shipped production work and clear contribution","maxPoints":20},{"key":"codeQuality","label":"Code quality, structure and maintainability evidence","maxPoints":20},{"key":"responsive","label":"Responsive implementation quality","maxPoints":15},{"key":"git","label":"Git/GitHub collaboration evidence","maxPoints":15},{"key":"testing","label":"Testing and defect-prevention evidence","maxPoints":10},{"key":"quality","label":"Accessibility/performance/security awareness","maxPoints":10},{"key":"ownership","label":"Clear delivery ownership","maxPoints":10}]'::jsonb),
  ('Initial Screening',3,true,75,48,false,'[]'::jsonb),
  ('Technical Assessment',4,true,80,72,false,'[]'::jsonb),
  ('Development Practical',5,true,80,96,false,'[]'::jsonb),
  ('Technical Interview',6,true,80,48,true,'[]'::jsonb),
  ('Selected',7,false,null::integer,24,false,'[]'::jsonb),
  ('Agreement Pending',8,false,null::integer,72,false,'[]'::jsonb),
  ('Developer Academy',9,false,null::integer,168,false,'[]'::jsonb),
  ('Final Approval',10,false,null::integer,24,false,'[]'::jsonb),
  ('Ready for System Access',11,false,null::integer,24,false,'[]'::jsonb),
  ('Activated',12,false,null::integer,0,false,'[]'::jsonb)
)
insert into public.recruitment_stage_policies(job_id,stage,sort_order,active,assessment_required,passing_score,sla_hours,interview_required,rubric,updated_at)
select j.id,p.stage,p.sort_order,true,p.assessment_required,p.passing_score,p.sla_hours,p.interview_required,p.rubric,now()
from j cross join p
on conflict(job_id,stage) do update set
  sort_order=excluded.sort_order,active=true,assessment_required=excluded.assessment_required,
  passing_score=excluded.passing_score,sla_hours=excluded.sla_hours,interview_required=excluded.interview_required,
  rubric=excluded.rubric,updated_at=now();

create sequence if not exists public.developer_application_reference_seq start 1;
create or replace function public.next_developer_application_reference()
returns text language sql set search_path=public,pg_temp as $$
  select 'PF-DEV-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.developer_application_reference_seq')::text,6,'0')
$$;

create or replace function public.submit_public_developer_application(p_job_slug text,p_application jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_job public.career_jobs%rowtype; v_id uuid; v_email text:=lower(trim(coalesce(p_application->>'email','')));
  v_name text:=trim(coalesce(p_application->>'fullName','')); v_github text:=trim(coalesce(p_application->>'githubUrl',''));
  v_portfolio text:=trim(coalesce(p_application->>'portfolioUrl','')); v_cv_path text:=trim(coalesce(p_application->>'cvStoragePath',''));
  v_cv_url text:=trim(coalesce(p_application->>'cvUrl','')); v_hours integer; v_reference text; v_answers jsonb;
begin
  select * into v_job from public.career_jobs
  where slug=p_job_slug and status='Published' and coalesce(role_details->>'systemRole','')='developer'
    and(closes_at is null or closes_at>now()) limit 1;
  if not found then raise exception 'This Web Developer role is not accepting applications.'; end if;
  if length(v_name)<2 then raise exception 'A valid full name is required.'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'A valid email address is required.'; end if;
  if v_github !~* '^https?://' then raise exception 'A valid GitHub/profile URL is required.'; end if;
  if coalesce(v_cv_path,'')='' and coalesce(v_cv_url,'')='' then raise exception 'CV or resume is required.'; end if;
  if coalesce((p_application->>'consentAccurate')::boolean,false) is not true
     or coalesce((p_application->>'consentPrivacy')::boolean,false) is not true then
    raise exception 'Accuracy confirmation and privacy consent are required.';
  end if;
  begin v_hours:=greatest(0,least(80,coalesce((p_application->>'availableHoursPerWeek')::integer,0))); exception when others then v_hours:=0; end;
  if v_hours<coalesce((v_job.role_details->'applicationForm'->>'minimumWeeklyHours')::integer,1) then raise exception 'Weekly availability is below the current role requirement.'; end if;
  if exists(select 1 from public.applicants a where lower(a.email)=v_email and a.career_job_id=v_job.id and coalesce(trim(a.refusal_reason),'')='' and a.stage<>'Activated') then
    return jsonb_build_object('success',true,'duplicate',true,'message','An active application for this role already exists.');
  end if;
  v_reference:=public.next_developer_application_reference();
  v_answers:=coalesce(p_application->'answers','{}'::jsonb)||jsonb_build_object(
    'githubUrl',v_github,'yearsExperience',p_application->>'yearsExperience','primaryStack',p_application->>'primaryStack',
    'frontendExperience',p_application->>'frontendExperience','backendExperience',p_application->>'backendExperience',
    'wordpressExperience',p_application->>'wordpressExperience','gitWorkflowExperience',p_application->>'gitWorkflowExperience',
    'testingExperience',p_application->>'testingExperience','accessibilityExperience',p_application->>'accessibilityExperience',
    'performanceExperience',p_application->>'performanceExperience','securityExperience',p_application->>'securityExperience',
    'designHandoffExperience',p_application->>'designHandoffExperience','strongestProject',p_application->>'strongestProject',
    'projectContribution',p_application->>'projectContribution','motivation',p_application->>'motivation');
  insert into public.applicants(
    full_name,email,phone,country,timezone,position,linkedin_url,cv_url,skills,source,stage,agreement_status,onboarding_status,
    application_reference,application_version,current_job_title,available_hours_per_week,preferred_work_window,earliest_start_date,
    heard_about_source,heard_about_detail,motivation,has_laptop_internet,accuracy_confirmed_at,privacy_consent_at,
    application_policy_version,application_submitted_at,cv_storage_path,application_policy_snapshot,career_job_id,
    utm_source,utm_medium,utm_campaign,utm_content,utm_term,landing_page,referrer_url,portfolio_url,application_answers
  ) values(
    v_name,v_email,trim(coalesce(p_application->>'phone','')),trim(coalesce(p_application->>'country','')),
    coalesce(nullif(trim(p_application->>'timezone'),''),'UTC'),v_job.title,trim(coalesce(p_application->>'linkedinUrl','')),v_cv_url,
    trim(coalesce(p_application->>'skills','')),coalesce(nullif(trim(p_application->>'source'),''),'ProFox Website'),
    'New Application','not_sent','not_started',v_reference,'developer_role_v1',trim(coalesce(p_application->>'currentRole','')),v_hours,
    trim(coalesce(p_application->>'preferredWorkWindow','')),nullif(p_application->>'earliestStartDate','')::date,
    trim(coalesce(p_application->>'heardAboutSource','')),trim(coalesce(p_application->>'heardAboutDetail','')),
    trim(coalesce(p_application->>'motivation','')),coalesce((p_application->>'hasLaptopInternet')::boolean,false),now(),now(),
    coalesce(v_job.role_details->>'workflowKey','web_developer_v1'),now(),nullif(v_cv_path,''),
    jsonb_build_object('jobId',v_job.id,'jobTitle',v_job.title,'workflowKey',v_job.role_details->>'workflowKey','applicationForm',v_job.role_details->'applicationForm','capturedAt',now()),
    v_job.id,nullif(p_application->>'utmSource',''),nullif(p_application->>'utmMedium',''),nullif(p_application->>'utmCampaign',''),
    nullif(p_application->>'utmContent',''),nullif(p_application->>'utmTerm',''),nullif(p_application->>'landingPage',''),
    nullif(p_application->>'referrerUrl',''),nullif(v_portfolio,''),v_answers
  ) returning id into v_id;
  return jsonb_build_object('success',true,'applicantId',v_id,'reference',v_reference,'stage','New Application');
end;$$;

revoke all on function public.submit_public_developer_application(text,jsonb) from public;
grant execute on function public.submit_public_developer_application(text,jsonb) to anon,authenticated;
revoke all on function public.next_developer_application_reference() from public,anon,authenticated;

insert into public.notification_templates(template_key,name,subject_template,body_template,description,active,updated_at) values
('recruitment_developer_application_received','Recruitment — Developer application received','We received your ProFox Web Developer application','Hi {{fullName}},\n\nThank you for applying for {{roleTitle}}. Your application reference is {{applicationReference}}. We will review your shipped-work and engineering evidence through our structured hiring process.\n\nProFox Recruitment','Web Developer application receipt.',true,now()),
('recruitment_developer_review','Recruitment — Developer application review','Your ProFox Web Developer application is in review','Hi {{fullName}},\n\nYour {{roleTitle}} application has moved to {{stage}}. Follow only the instructions sent by the ProFox recruitment team and submit the requested evidence.','Developer stage review notification.',true,now()),
('recruitment_developer_selected','Recruitment — Developer selected','You have been selected for ProFox Web Developer onboarding','Hi {{fullName}},\n\nYou have passed the required Development recruitment evaluations. The next controlled step is your ProFox Web Developer agreement and onboarding.','Developer selected notification.',true,now()),
('recruitment_developer_academy','Recruitment — Developer Academy','Your ProFox Developer Academy onboarding is ready','Hi {{fullName}},\n\nYour agreement has been verified and your Development onboarding account is ready. Use the newest secure account invitation and complete the required Developer Academy before production activation.','Developer Academy notification.',true,now()),
('recruitment_developer_final_review','Recruitment — Developer final review','Your ProFox Developer onboarding is in final review','Hi {{fullName}},\n\nYour required Developer Academy work has been submitted for Final Approval. Production/client-project access remains locked until Management approval.','Developer final review notification.',true,now()),
('recruitment_developer_activated','Recruitment — Developer activated','Welcome to the active ProFox Development team','Hi {{fullName}},\n\nYour Web Developer account is now active. Sign in to ProFox and use My Work / Development Delivery as the source of truth for assigned client work.','Developer activation notification.',true,now())
on conflict(template_key) do update set
  name=excluded.name,subject_template=excluded.subject_template,body_template=excluded.body_template,
  description=excluded.description,active=true,updated_at=now();
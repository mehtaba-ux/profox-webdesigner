-- Dynamic, Admin-editable Content Writer application form.
-- Keeps legacy applicant columns for recruitment compatibility while preserving
-- the exact schema and answers used for every submitted application.

alter table public.applicants
  add column if not exists application_form_schema_version integer,
  add column if not exists application_form_schema_snapshot jsonb,
  add column if not exists application_form_responses jsonb not null default '{}'::jsonb;

comment on column public.applicants.application_form_schema_version is 'Version of the candidate-facing application form schema used at submission time.';
comment on column public.applicants.application_form_schema_snapshot is 'Immutable candidate-facing form schema snapshot captured when the application was submitted.';
comment on column public.applicants.application_form_responses is 'Responses captured against the immutable application form schema snapshot.';

update public.career_jobs
set role_details = jsonb_set(
  coalesce(role_details,'{}'::jsonb),
  '{applicationForm}',
  $form$
  {
    "schemaVersion":3,
    "title":"Show Us How You Think—Not Just Where You’ve Worked.",
    "description":"A short, five-step application. Your full three-case-study portfolio is collected later only if you pass the initial review.",
    "minimumWeeklyHours":20,
    "portfolioDeferred":true,
    "portfolioRequired":false,
    "cvRequired":true,
    "steps":[
      {"id":"about","title":"About You","description":"Start with the basics so we know who we are speaking with.","active":true},
      {"id":"experience","title":"Your Experience","description":"Tell us what you have worked on and where your writing experience comes from.","active":true},
      {"id":"thinking","title":"How You Think","description":"We care about research, judgment and accuracy—not just polished sentences.","active":true},
      {"id":"availability","title":"Availability","description":"Help us understand the project load you can responsibly support.","active":true},
      {"id":"confirm","title":"Application & Confirmation","description":"Upload your required material and confirm the working terms before submitting.","active":true}
    ],
    "fields":[
      {"key":"fullName","stepId":"about","label":"Full name","type":"text","required":true,"active":true,"system":true,"locked":true,"help":"Use the name you want us to use throughout recruitment.","minLength":2},
      {"key":"email","stepId":"about","label":"Email address","type":"email","required":true,"active":true,"system":true,"locked":true,"help":"Use an email address you check regularly. Recruitment updates are sent here."},
      {"key":"phone","stepId":"about","label":"Phone","type":"tel","required":false,"active":true,"system":true,"help":"Include your country code if possible."},
      {"key":"country","stepId":"about","label":"Country","type":"text","required":true,"active":true,"system":true,"help":"Your current country of residence."},
      {"key":"currentRole","stepId":"about","label":"Current role","type":"text","required":false,"active":true,"system":true,"help":"Your current job title, freelance role or main professional focus."},
      {"key":"linkedinUrl","stepId":"about","label":"LinkedIn profile","type":"url","required":false,"active":true,"system":true,"help":"Optional. Add a public LinkedIn profile if you have one.","placeholder":"https://linkedin.com/in/..."},
      {"key":"yearsExperience","stepId":"experience","label":"Professional website/commercial writing experience","type":"select","required":true,"active":true,"help":"Count paid or professional work involving website, landing-page, UX, SEO or commercial copy.","options":["Less than 1 year","1–2 years","3–5 years","6+ years"]},
      {"key":"contentTypes","stepId":"experience","label":"What types of content have you worked on professionally?","type":"multiselect","required":true,"active":true,"help":"Select every type you have delivered professionally.","options":["Website Copy","Landing Pages","Service Pages","SEO Content","UX Copy","Email Copy","Other"]},
      {"key":"realBusinessExperience","stepId":"experience","label":"Have you written website or conversion content for real businesses or paying clients?","type":"select","required":true,"active":true,"help":"Practice projects are useful, but this helps us understand your real delivery experience.","options":["Yes","No"]},
      {"key":"contentExperience","stepId":"experience","label":"Describe your relevant website or commercial content-writing experience","type":"textarea","required":true,"active":true,"system":true,"help":"Focus on the work you personally did, the type of businesses or projects, and your responsibility. 3–6 thoughtful sentences is enough.","minLength":30},
      {"key":"researchApproach","stepId":"thinking","label":"How do you research a business, its customers and its market before writing?","type":"textarea","required":true,"active":true,"system":true,"help":"Explain your actual process. We want to understand how you find reliable information before writing.","minLength":30},
      {"key":"claimVerification","stepId":"thinking","label":"A client says, “We have helped 500+ customers,” but no evidence has been provided. What would you do before using that claim?","type":"textarea","required":true,"active":true,"help":"This tests how you handle unsupported business claims. Tell us what you would actually do.","minLength":30},
      {"key":"qualityProcess","stepId":"thinking","label":"How do you check accuracy, clarity, structure and quality before submitting content?","type":"textarea","required":true,"active":true,"system":true,"help":"Walk us through your own QA process before another reviewer sees the work.","minLength":30},
      {"key":"skills","stepId":"thinking","label":"Which writing, research, SEO, AI, collaboration or productivity tools do you use?","type":"text","required":false,"active":true,"system":true,"help":"List the tools you regularly use. Tool names alone do not determine selection."},
      {"key":"aiJudgment","stepId":"thinking","label":"If you use AI, how do you use it without replacing your research, judgment or fact-checking?","type":"textarea","required":true,"active":true,"help":"Explain where AI may assist and how you verify the final output before submitting it.","minLength":30},
      {"key":"availableHoursPerWeek","stepId":"availability","label":"Available project capacity per week","type":"number","required":true,"active":true,"system":true,"locked":true,"help":"This is capacity while actively accepting projects—not guaranteed paid hours. Payment is agreed per project.","min":20,"max":80},
      {"key":"currentWorkload","stepId":"availability","label":"How many active client or writing projects are you currently managing?","type":"select","required":true,"active":true,"help":"This helps us compare your stated capacity with your current workload.","options":["0","1–2","3–4","5+"]},
      {"key":"earliestStartDate","stepId":"availability","label":"Earliest available start date","type":"date","required":false,"active":true,"system":true,"help":"The earliest date you could realistically begin an accepted project."},
      {"key":"weeklyAvailability","stepId":"availability","label":"Typical weekly availability","type":"textarea","required":false,"active":true,"system":true,"help":"Mention the days or working windows when you are normally available."},
      {"key":"deadlineScenario","stepId":"availability","label":"If you realize an accepted project may miss its deadline, what would you do?","type":"textarea","required":true,"active":true,"help":"We are looking for ownership, early communication and a practical recovery plan.","minLength":20},
      {"key":"motivation","stepId":"availability","label":"Why do you want to work with the ProFox Content team?","type":"textarea","required":false,"active":true,"system":true,"help":"Keep this specific. Tell us what fits your goals and working style."},
      {"key":"cv","stepId":"confirm","label":"CV / Resume","type":"file","required":true,"active":true,"system":true,"locked":true,"help":"Upload PDF, DOC or DOCX. Your portfolio is not required at this stage.","accept":".pdf,.doc,.docx"},
      {"key":"video","stepId":"confirm","label":"Short introduction video","type":"video","required":true,"active":true,"system":true,"locked":true,"help":"Briefly introduce yourself, your relevant experience, how you research and how you protect quality before submission.","accept":"video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"},
      {"key":"hasLaptopInternet","stepId":"confirm","label":"I have access to a reliable laptop and internet connection.","type":"checkbox","required":true,"active":true,"system":true,"locked":true,"help":"Reliable equipment and connectivity are required for remote project delivery."},
      {"key":"consentAccurate","stepId":"confirm","label":"The information and materials I submit accurately represent my experience and work.","type":"checkbox","required":true,"active":true,"system":true,"locked":true},
      {"key":"contractorAck","stepId":"confirm","label":"I understand that I am initially applying for project-based independent contractor work rather than an immediate salaried position.","type":"checkbox","required":true,"active":true,"system":true,"locked":true},
      {"key":"projectPaymentAck","stepId":"confirm","label":"I understand that payment during the project-based stage is agreed per project.","type":"checkbox","required":true,"active":true,"system":true,"locked":true},
      {"key":"earningPotentialAck","stepId":"confirm","label":"I understand that $1,000–$1,500+ per month is a potential earning opportunity and not guaranteed income.","type":"checkbox","required":true,"active":true,"system":true,"locked":true},
      {"key":"earningVariablesAck","stepId":"confirm","label":"I understand that actual earnings depend on available projects, project fees, my capacity, performance and successful delivery.","type":"checkbox","required":true,"active":true,"system":true,"locked":true},
      {"key":"salaryPathAck","stepId":"confirm","label":"I understand that strong performance for at least six months can create an opportunity to transition into a salaried ProFox role, with salary and applicable terms discussed at that time.","type":"checkbox","required":true,"active":true,"system":true,"locked":true},
      {"key":"consentPrivacy","stepId":"confirm","label":"I agree that ProFox may process this information for recruitment and assessment purposes.","type":"checkbox","required":true,"active":true,"system":true,"locked":true}
    ]
  }
  $form$::jsonb,
  true
), updated_at=now()
where slug='content-writer' and application_type='content_writer';

create or replace function public.submit_public_content_writer_application(p_application jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_job public.career_jobs%rowtype;
  v_answers jsonb:=coalesce(p_application,'{}'::jsonb);
  v_responses jsonb:=coalesce(p_application->'responses',p_application,'{}'::jsonb);
  v_clean_responses jsonb:='{}'::jsonb;
  v_form jsonb;
  v_fields jsonb;
  v_field jsonb;
  v_response jsonb;
  v_key text;
  v_type text;
  v_text text;
  v_label text;
  v_required boolean;
  v_min_length integer;
  v_min numeric;
  v_max numeric;
  v_number numeric;
  v_min_hours integer;
  v_schema_version integer;
  v_email text;
  v_name text;
  v_country text;
  v_id uuid;
  v_reference text;
  v_existing uuid;
  v_hours integer;
  v_start date;
  v_cv text;
  v_video text;
begin
  select * into v_job
  from public.career_jobs
  where slug='content-writer'
    and application_type='content_writer'
    and status='Published'
    and (closes_at is null or closes_at>now())
  limit 1;

  if not found then
    return jsonb_build_object('success',false,'error','The Content Writer role is not currently accepting applications.');
  end if;

  v_form:=coalesce(v_job.role_details->'applicationForm','{}'::jsonb);
  v_fields:=coalesce(v_form->'fields','[]'::jsonb);
  begin v_schema_version:=greatest(1,coalesce((v_form->>'schemaVersion')::integer,1)); exception when others then v_schema_version:=1; end;
  begin v_min_hours:=greatest(1,least(80,coalesce((v_form->>'minimumWeeklyHours')::integer,20))); exception when others then v_min_hours:=20; end;

  if jsonb_typeof(v_fields)<>'array' or jsonb_array_length(v_fields)=0 then
    return jsonb_build_object('success',false,'error','The application form is temporarily unavailable. Please try again later.');
  end if;

  -- Validate every active field against the currently published schema and keep
  -- only schema-declared answers. File paths are handled separately below.
  for v_field in select value from jsonb_array_elements(v_fields)
  loop
    if lower(coalesce(v_field->>'active','true'))='false' then continue; end if;
    v_key:=btrim(coalesce(v_field->>'key',''));
    if v_key='' then continue; end if;
    v_type:=lower(btrim(coalesce(v_field->>'type','text')));
    v_label:=coalesce(nullif(btrim(v_field->>'label'),''),v_key);
    v_required:=lower(coalesce(v_field->>'required','false'))='true';
    v_response:=v_responses->v_key;

    if v_type not in ('file','video') and v_response is not null then
      v_clean_responses:=v_clean_responses||jsonb_build_object(v_key,v_response);
    end if;

    if v_type='file' then
      if v_required and btrim(coalesce(v_answers->>'cvStoragePath',''))='' then return jsonb_build_object('success',false,'field',v_key,'error',v_label||' is required.'); end if;
      continue;
    elsif v_type='video' then
      if v_required and btrim(coalesce(v_answers->>'videoStoragePath',''))='' then return jsonb_build_object('success',false,'field',v_key,'error',v_label||' is required.'); end if;
      continue;
    elsif v_type='checkbox' then
      if v_required and lower(coalesce(v_response#>>'{}','false')) not in ('true','1') then return jsonb_build_object('success',false,'field',v_key,'error','Please confirm: '||v_label); end if;
      continue;
    elsif v_type='multiselect' then
      if v_required and (v_response is null or jsonb_typeof(v_response)<>'array' or jsonb_array_length(v_response)=0) then return jsonb_build_object('success',false,'field',v_key,'error','Please select at least one option for '||v_label||'.'); end if;
      if v_response is not null and jsonb_typeof(v_response)='array' and jsonb_typeof(v_field->'options')='array' and exists(
        select 1 from jsonb_array_elements_text(v_response) r(value)
        where not exists(select 1 from jsonb_array_elements_text(v_field->'options') o(value) where o.value=r.value)
      ) then return jsonb_build_object('success',false,'field',v_key,'error','Please choose only available options for '||v_label||'.'); end if;
      continue;
    end if;

    v_text:=btrim(coalesce(v_response#>>'{}',''));
    if v_required and v_text='' then return jsonb_build_object('success',false,'field',v_key,'error',v_label||' is required.'); end if;
    begin v_min_length:=nullif(v_field->>'minLength','')::integer; exception when others then v_min_length:=null; end;
    if v_text<>'' and v_min_length is not null and char_length(v_text)<v_min_length then return jsonb_build_object('success',false,'field',v_key,'error','Please provide a little more detail for '||v_label||'.'); end if;

    if v_type='select' and v_text<>'' and jsonb_typeof(v_field->'options')='array' and not exists(select 1 from jsonb_array_elements_text(v_field->'options') o(value) where o.value=v_text) then
      return jsonb_build_object('success',false,'field',v_key,'error','Please choose one of the available options for '||v_label||'.');
    end if;

    if v_type='number' and v_text<>'' then
      begin v_number:=v_text::numeric; exception when others then return jsonb_build_object('success',false,'field',v_key,'error','Please provide a valid number for '||v_label||'.'); end;
      begin v_min:=nullif(v_field->>'min','')::numeric; exception when others then v_min:=null; end;
      begin v_max:=nullif(v_field->>'max','')::numeric; exception when others then v_max:=null; end;
      if v_min is not null and v_number<v_min then return jsonb_build_object('success',false,'field',v_key,'error',v_label||' must be at least '||v_min::text||'.'); end if;
      if v_max is not null and v_number>v_max then return jsonb_build_object('success',false,'field',v_key,'error',v_label||' must be no more than '||v_max::text||'.'); end if;
    end if;
  end loop;

  -- Non-removable server-side controls. Admin UI also locks these fields, but
  -- submission never trusts client configuration alone.
  v_name:=btrim(coalesce(v_responses->>'fullName',''));
  v_email:=lower(btrim(coalesce(v_responses->>'email','')));
  v_country:=btrim(coalesce(v_responses->>'country',''));
  if length(v_name)<2 then return jsonb_build_object('success',false,'field','fullName','error','Please provide your full name.'); end if;
  if v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return jsonb_build_object('success',false,'field','email','error','Please provide a valid email address.'); end if;
  if v_country='' then return jsonb_build_object('success',false,'field','country','error','Please provide your country.'); end if;

  v_cv:=btrim(coalesce(v_answers->>'cvStoragePath',''));
  v_video:=btrim(coalesce(v_answers->>'videoStoragePath',''));
  if v_cv='' or v_cv not like 'applications/%' then return jsonb_build_object('success',false,'field','cv','error','A securely uploaded CV or resume is required.'); end if;
  if v_video='' or v_video not like 'applications/%' then return jsonb_build_object('success',false,'field','video','error','A securely uploaded introduction video is required.'); end if;

  begin v_hours:=greatest(0,coalesce((v_responses->>'availableHoursPerWeek')::integer,0)); exception when others then v_hours:=0; end;
  if v_hours<v_min_hours or v_hours>80 then return jsonb_build_object('success',false,'field','availableHoursPerWeek','error','This role currently requires at least '||v_min_hours::text||' hours of available project capacity per week.'); end if;

  foreach v_key in array array['hasLaptopInternet','consentAccurate','contractorAck','projectPaymentAck','earningPotentialAck','earningVariablesAck','salaryPathAck','consentPrivacy']
  loop
    if lower(coalesce(v_responses->>v_key,'false')) not in ('true','1') then return jsonb_build_object('success',false,'field',v_key,'error','Please complete all required confirmations before submitting.'); end if;
  end loop;

  begin v_start:=nullif(btrim(coalesce(v_responses->>'earliestStartDate','')),'')::date; exception when others then return jsonb_build_object('success',false,'field','earliestStartDate','error','Please provide a valid earliest start date.'); end;

  select a.id into v_existing
  from public.applicants a
  where a.career_job_id=v_job.id and lower(btrim(a.email))=v_email and coalesce(btrim(a.refusal_reason),'')=''
  order by a.created_at desc limit 1;
  if v_existing is not null then
    return jsonb_build_object('success',true,'duplicate',true,'applicant_id',v_existing,'message','An active Content Writer application already exists for this email.');
  end if;

  v_reference:='PF-CW-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.applicants(
    full_name,email,phone,country,timezone,position,linkedin_url,skills,source,stage,rating,notes,onboarding_status,onboarding_progress,final_approval,
    application_reference,application_version,application_policy_version,application_submitted_at,current_job_title,weekly_availability,available_hours_per_week,earliest_start_date,motivation,
    has_laptop_internet,accuracy_confirmed_at,privacy_consent_at,cv_storage_path,video_storage_path,career_job_id,application_policy_snapshot,application_answers,
    application_form_schema_version,application_form_schema_snapshot,application_form_responses,
    utm_source,utm_medium,utm_campaign,utm_content,utm_term,landing_page,referrer_url
  ) values (
    v_name,v_email,btrim(coalesce(v_responses->>'phone','')),v_country,coalesce(nullif(btrim(v_answers->>'timezone'),''),'UTC'),v_job.title,
    nullif(btrim(v_responses->>'linkedinUrl'),''),left(coalesce(v_responses->>'skills',''),5000),'ProFox Website','New Application',0,null,'not_started',0,false,
    v_reference,'content_writer_dynamic_v3','content_writer_dynamic_v3',now(),nullif(btrim(v_responses->>'currentRole'),''),nullif(btrim(v_responses->>'weeklyAvailability'),''),v_hours,v_start,
    nullif(left(btrim(coalesce(v_responses->>'motivation','')),10000),''),true,now(),now(),v_cv,v_video,v_job.id,
    jsonb_build_object('jobId',v_job.id,'jobSlug',v_job.slug,'jobUpdatedAt',v_job.updated_at,'roleDetails',v_job.role_details,'formSchemaVersion',v_schema_version),
    v_clean_responses||jsonb_build_object('portfolioDeferred',true,'portfolioMinimumCaseStudies',coalesce((v_job.role_details->>'portfolioMinimumCaseStudies')::integer,3)),
    v_schema_version,v_form,v_clean_responses,
    nullif(btrim(v_answers->>'utmSource'),''),nullif(btrim(v_answers->>'utmMedium'),''),nullif(btrim(v_answers->>'utmCampaign'),''),nullif(btrim(v_answers->>'utmContent'),''),nullif(btrim(v_answers->>'utmTerm'),''),
    nullif(btrim(v_answers->>'landingPage'),''),nullif(btrim(v_answers->>'referrerUrl'),'')
  ) returning id into v_id;

  return jsonb_build_object('success',true,'applicant_id',v_id,'reference',v_reference,'stage','New Application','formSchemaVersion',v_schema_version);
exception when others then
  raise warning 'Content Writer dynamic application failed: %',sqlerrm;
  return jsonb_build_object('success',false,'error','We could not submit your application right now. Please try again.');
end;
$function$;

revoke all on function public.submit_public_content_writer_application(jsonb) from public;
grant execute on function public.submit_public_content_writer_application(jsonb) to anon, authenticated, service_role;

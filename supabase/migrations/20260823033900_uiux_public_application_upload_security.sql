-- PF UI/UX Designer Team — public application upload/privacy hardening.
-- Reuses the existing recruitment upload-intent + Storage verification model already used by Sales.

create or replace function public.submit_public_uiux_application(p_job_slug text,p_application jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,storage,pg_temp
as $$
declare
  v_job public.career_jobs%rowtype;
  v_id uuid;
  v_email text:=lower(trim(coalesce(p_application->>'email','')));
  v_name text:=trim(coalesce(p_application->>'fullName',''));
  v_country text:=trim(coalesce(p_application->>'country',''));
  v_timezone text:=trim(coalesce(p_application->>'timezone',''));
  v_portfolio text:=trim(coalesce(p_application->>'portfolioUrl',''));
  v_cv_path text:=trim(coalesce(p_application->>'cvStoragePath',''));
  v_cv_url text:=trim(coalesce(p_application->>'cvUrl',''));
  v_source text:=trim(coalesce(p_application->>'heardAboutSource',''));
  v_source_options text[]:=array[]::text[];
  v_hours integer;
  v_start date;
  v_reference text;
  v_answers jsonb;
  v_now timestamptz:=clock_timestamp();
begin
  if jsonb_typeof(coalesce(p_application,'{}'::jsonb))<>'object' then
    return jsonb_build_object('success',false,'error','Invalid application payload.');
  end if;

  select * into v_job
  from public.career_jobs
  where slug=p_job_slug
    and status='Published'
    and coalesce(role_details->>'systemRole','')='uiux_designer'
    and (closes_at is null or closes_at>now())
  limit 1;
  if not found then return jsonb_build_object('success',false,'error','This UI/UX Designer role is not accepting applications.'); end if;

  if length(v_name)<2 then return jsonb_build_object('success',false,'field','fullName','error','A valid full name is required.'); end if;
  if v_email!~*'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return jsonb_build_object('success',false,'field','email','error','A valid email address is required.'); end if;
  if v_country='' then return jsonb_build_object('success',false,'field','country','error','Country is required.'); end if;
  if v_timezone='' or not exists(select 1 from pg_timezone_names where name=v_timezone) then return jsonb_build_object('success',false,'field','timezone','error','Select a valid time zone.'); end if;
  if v_portfolio!~*'^https?://' then return jsonb_build_object('success',false,'field','portfolioUrl','error','A valid portfolio URL is required.'); end if;
  if v_cv_path='' and v_cv_url='' then return jsonb_build_object('success',false,'field','cv','error','CV or resume is required.'); end if;
  if v_cv_url<>'' and v_cv_url!~*'^https?://' then return jsonb_build_object('success',false,'field','cvUrl','error','CV link must begin with http:// or https://.'); end if;
  if lower(coalesce(p_application->>'consentAccurate','false'))<>'true' or lower(coalesce(p_application->>'consentPrivacy','false'))<>'true' then
    return jsonb_build_object('success',false,'error','Accuracy confirmation and privacy consent are required.');
  end if;
  if lower(coalesce(p_application->>'hasLaptopInternet','false'))<>'true' then
    return jsonb_build_object('success',false,'error','Confirm that you have the required computer and reliable internet.');
  end if;

  begin v_hours:=(p_application->>'availableHoursPerWeek')::integer;
  exception when others then return jsonb_build_object('success',false,'field','availableHoursPerWeek','error','Provide valid weekly availability.'); end;
  if v_hours<coalesce((v_job.role_details->'applicationForm'->>'minimumWeeklyHours')::integer,1) or v_hours>80 then
    return jsonb_build_object('success',false,'field','availableHoursPerWeek','error','Weekly availability is below the current role requirement or outside the allowed range.');
  end if;

  begin v_start:=nullif(trim(coalesce(p_application->>'earliestStartDate','')),'')::date;
  exception when others then return jsonb_build_object('success',false,'field','earliestStartDate','error','Select a valid earliest start date.'); end;
  if v_start is not null and v_start<current_date then
    return jsonb_build_object('success',false,'field','earliestStartDate','error','Earliest start date cannot be in the past.');
  end if;

  if jsonb_typeof(coalesce(v_job.role_details->'applicationForm'->'sourceOptions','[]'::jsonb))='array' then
    v_source_options:=array(select jsonb_array_elements_text(coalesce(v_job.role_details->'applicationForm'->'sourceOptions','[]'::jsonb)));
    if cardinality(v_source_options)>0 and (v_source='' or not (v_source=any(v_source_options))) then
      return jsonb_build_object('success',false,'field','heardAboutSource','error','Select a valid application source.');
    end if;
  end if;

  -- Verify the CV against the same one-time upload-intent model used by Sales.
  if v_cv_path<>'' and not exists(
    select 1
    from public.recruitment_upload_intents i
    join storage.objects o on o.bucket_id='recruitment-applications' and o.name=i.storage_path
    where i.storage_path=v_cv_path
      and i.email_normalized=v_email
      and i.kind='cv'
      and i.used_at is null
      and i.expires_at>now()
      and coalesce((o.metadata->>'size')::bigint,0)<=i.max_bytes
      and lower(coalesce(o.metadata->>'mimetype',''))=lower(i.content_type)
  ) then
    return jsonb_build_object('success',false,'field','cv','error','The uploaded CV could not be verified. Please upload it again.');
  end if;

  if exists(
    select 1 from public.user_profiles
    where lower(trim(email))=v_email and role='uiux_designer' and status='active'
  ) then
    return jsonb_build_object('success',false,'duplicate',true,'message','This email is already associated with an active ProFox UI/UX Designer account.');
  end if;

  if exists(
    select 1 from public.applicants a
    where lower(trim(a.email))=v_email
      and a.career_job_id=v_job.id
      and coalesce(trim(a.refusal_reason),'')=''
      and a.stage<>'Activated'
  ) then
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
    v_name,v_email,trim(coalesce(p_application->>'phone','')),v_country,v_timezone,
    v_job.title,trim(coalesce(p_application->>'linkedinUrl','')),nullif(v_cv_url,''),trim(coalesce(p_application->>'skills','')),
    coalesce(nullif(trim(p_application->>'source'),''),'ProFox Website'),'New Application','not_sent','not_started',
    v_reference,'uiux_role_v1',trim(coalesce(p_application->>'currentRole','')),v_hours,trim(coalesce(p_application->>'preferredWorkWindow','')),v_start,
    v_source,trim(coalesce(p_application->>'heardAboutDetail','')),trim(coalesce(p_application->>'motivation','')),true,v_now,v_now,
    coalesce(v_job.role_details->>'workflowKey','uiux_designer_v1'),v_now,nullif(v_cv_path,''),
    jsonb_build_object('jobId',v_job.id,'jobTitle',v_job.title,'workflowKey',v_job.role_details->>'workflowKey','applicationForm',v_job.role_details->'applicationForm','capturedAt',v_now),
    v_job.id,left(nullif(p_application->>'utmSource',''),200),left(nullif(p_application->>'utmMedium',''),200),left(nullif(p_application->>'utmCampaign',''),300),
    left(nullif(p_application->>'utmContent',''),300),left(nullif(p_application->>'utmTerm',''),300),left(nullif(p_application->>'landingPage',''),1000),left(nullif(p_application->>'referrerUrl',''),1000),
    v_portfolio,v_answers
  ) returning id into v_id;

  if v_cv_path<>'' then
    update public.recruitment_upload_intents
    set used_at=v_now
    where storage_path=v_cv_path and email_normalized=v_email and kind='cv' and used_at is null;
  end if;

  return jsonb_build_object('success',true,'applicantId',v_id,'reference',v_reference,'stage','New Application');
exception
  when unique_violation then
    return jsonb_build_object('success',true,'duplicate',true,'message','An active application for this role already exists.');
end;
$$;

revoke all on function public.submit_public_uiux_application(text,jsonb) from public;
grant execute on function public.submit_public_uiux_application(text,jsonb) to anon,authenticated;

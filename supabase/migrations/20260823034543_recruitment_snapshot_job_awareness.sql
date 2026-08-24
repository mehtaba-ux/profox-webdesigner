-- Reconcile the shared applicant review snapshot across Sales, Content and UI/UX.
-- One canonical RPC dispatches the correct checklist by the candidate's actual career job.

create or replace function public.admin_get_applicant_review_snapshot(p_applicant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  a public.applicants%rowtype;
  j public.career_jobs%rowtype;
  cfg jsonb;
  answers jsonb;
  checks jsonb;
  passed integer;
  total integer;
  min_months integer;
  min_hours integer;
  v_role text;
  v_is_content boolean:=false;
begin
  select * into a from public.applicants where id=p_applicant_id;
  if not found then return null; end if;

  select * into j from public.career_jobs where id=a.career_job_id;
  if not found then
    select * into j
    from public.career_jobs
    where application_type='sales_representative'
    order by (status='Published') desc,featured desc,published_at desc nulls last
    limit 1;
  end if;

  v_is_content:=coalesce(j.application_type,'')='content_writer';
  if not public.is_admin() and not (v_is_content and public.can_manage_content_applicant(a.id)) then
    raise exception 'Recruitment management access required.';
  end if;

  cfg:=coalesce(j.role_details->'applicationForm','{}'::jsonb);
  answers:=coalesce(a.application_answers,'{}'::jsonb);
  v_role:=coalesce(j.role_details->>'systemRole',case when j.application_type='sales_representative' then 'sales' else 'pending' end);
  begin min_hours:=greatest(1,coalesce((cfg->>'minimumWeeklyHours')::integer,20)); exception when others then min_hours:=20; end;

  if v_is_content then
    checks:=jsonb_build_array(
      jsonb_build_object('key','contact','label','Contact details complete','passed',coalesce(a.email,'')<>'' and coalesce(a.country,'')<>'' and coalesce(a.timezone,'')<>''),
      jsonb_build_object('key','portfolio','label','Portfolio / writing sample supplied','passed',coalesce(answers->>'portfolioUrl','')<>'' or (jsonb_typeof(answers->'writingSamples')='array' and jsonb_array_length(answers->'writingSamples')>0)),
      jsonb_build_object('key','experience','label','Relevant content experience described','passed',char_length(coalesce(answers->>'contentExperience',''))>=30),
      jsonb_build_object('key','research','label','Research process described','passed',char_length(coalesce(answers->>'researchApproach',''))>=30),
      jsonb_build_object('key','quality','label','Quality / self-review process described','passed',char_length(coalesce(answers->>'qualityProcess',''))>=30),
      jsonb_build_object('key','availability','label','Minimum weekly availability','passed',coalesce(a.available_hours_per_week,0)>=min_hours,'detail',coalesce(a.available_hours_per_week,0)||' / '||min_hours||' hours'),
      jsonb_build_object('key','cv','label','CV or resume available','passed',coalesce(a.cv_storage_path,'')<>'' or coalesce(a.cv_url,'')<>''),
      jsonb_build_object('key','equipment','label','Laptop and reliable internet confirmed','passed',a.has_laptop_internet is true),
      jsonb_build_object('key','consent','label','Accuracy and privacy consent recorded','passed',a.accuracy_confirmed_at is not null and a.privacy_consent_at is not null)
    );
  elsif v_role='uiux_designer' then
    checks:=jsonb_build_array(
      jsonb_build_object('key','contact','label','Contact details complete','passed',coalesce(a.email,'')<>'' and coalesce(a.country,'')<>'' and coalesce(a.timezone,'')<>''),
      jsonb_build_object('key','portfolio','label','Portfolio URL available','passed',coalesce(a.portfolio_url,'')~*'^https?://'),
      jsonb_build_object('key','cv','label','CV or resume available','passed',coalesce(a.cv_storage_path,'')<>'' or coalesce(a.cv_url,'')<>''),
      jsonb_build_object('key','availability','label','Weekly availability meets role requirement','passed',coalesce(a.available_hours_per_week,0)>=min_hours,'detail',coalesce(a.available_hours_per_week,0)||' / '||min_hours||' hours'),
      jsonb_build_object('key','figma','label','Figma experience answered','passed',length(trim(coalesce(answers->>'figmaExperience','')))>5),
      jsonb_build_object('key','responsive','label','Responsive design experience answered','passed',length(trim(coalesce(answers->>'responsiveExperience','')))>5),
      jsonb_build_object('key','systems','label','Design-system experience answered','passed',length(trim(coalesce(answers->>'designSystemsExperience','')))>5),
      jsonb_build_object('key','caseStudy','label','Case-study evidence answered','passed',length(trim(coalesce(answers->>'strongestCaseStudy','')))>10 and length(trim(coalesce(answers->>'caseStudyContribution','')))>10),
      jsonb_build_object('key','handoff','label','Developer handoff experience answered','passed',length(trim(coalesce(answers->>'developerHandoffExperience','')))>5),
      jsonb_build_object('key','workSetup','label','Laptop and internet confirmed','passed',a.has_laptop_internet is true),
      jsonb_build_object('key','consent','label','Accuracy and privacy consent recorded','passed',a.accuracy_confirmed_at is not null and a.privacy_consent_at is not null)
    );
  else
    begin min_months:=greatest(0,coalesce((cfg->>'minimumSalesExperienceMonths')::integer,6)); exception when others then min_months:=6; end;
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

  select count(*),count(*) filter(where (x->>'passed')::boolean)
  into total,passed from jsonb_array_elements(checks) x;

  return jsonb_build_object(
    'reference',a.application_reference,
    'applicationVersion',a.application_version,
    'policyVersion',a.application_policy_version,
    'submittedAt',coalesce(a.application_submitted_at,a.created_at),
    'currentStage',a.stage,
    'jobId',j.id,
    'jobTitle',j.title,
    'systemRole',v_role,
    'portfolioUrl',coalesce(a.portfolio_url,answers->>'portfolioUrl'),
    'answers',answers,
    'checks',checks,
    'passedChecks',passed,
    'totalChecks',total,
    'completenessPercent',case when total=0 then 0 else round((passed::numeric/total::numeric)*100) end,
    'readyForReview',passed=total,
    'currentPolicy',jsonb_build_object('minimumWeeklyHours',min_hours,'jobUpdatedAt',j.updated_at,'applicationType',j.application_type)
  );
end;
$$;

revoke all on function public.admin_get_applicant_review_snapshot(uuid) from public,anon;
grant execute on function public.admin_get_applicant_review_snapshot(uuid) to authenticated;

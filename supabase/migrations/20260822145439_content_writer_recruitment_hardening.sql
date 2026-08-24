-- Content Writer recruitment hardening.
-- Sales recruitment remains Admin-controlled. Editor/Site Manager receive scoped access only
-- to Content Writer candidates and the existing evidence/interview records for those candidates.

create or replace function public.recruitment_notification_payload(p_applicant public.applicants)
returns jsonb language sql stable set search_path=public,pg_temp as $$
select jsonb_build_object(
  'applicantId',p_applicant.id,'fullName',p_applicant.full_name,'email',p_applicant.email,
  'country',p_applicant.country,'timezone',p_applicant.timezone,
  'roleTitle',coalesce((select j.title from public.career_jobs j where j.id=p_applicant.career_job_id),'Independent Commission-Based Sales Representative'),
  'stage',p_applicant.stage,'applicationReference',p_applicant.application_reference,
  'applicationUrl','https://www.profoxwebdesigner.com/careers'
);
$$;

create or replace function public.submit_public_content_writer_application(p_application jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_job public.career_jobs%rowtype;v_email text;v_name text;v_id uuid;v_reference text;v_existing uuid;
  v_answers jsonb:=coalesce(p_application,'{}'::jsonb);v_hours integer;v_start date;v_samples jsonb;
begin
  select * into v_job from public.career_jobs where slug='content-writer' and application_type='content_writer' and status='Published' and (closes_at is null or closes_at>now()) limit 1;
  if not found then return jsonb_build_object('success',false,'error','The Content Writer role is not currently accepting applications.'); end if;
  v_name:=btrim(coalesce(v_answers->>'fullName',''));v_email:=lower(btrim(coalesce(v_answers->>'email','')));
  if length(v_name)<2 then return jsonb_build_object('success',false,'field','fullName','error','Please provide your full name.'); end if;
  if v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return jsonb_build_object('success',false,'field','email','error','Please provide a valid email address.'); end if;
  begin v_hours:=greatest(0,coalesce((v_answers->>'availableHoursPerWeek')::integer,0)); exception when others then v_hours:=0; end;
  if v_hours<1 or v_hours>80 then return jsonb_build_object('success',false,'field','availableHoursPerWeek','error','Please provide valid weekly availability.'); end if;
  v_samples:=case when jsonb_typeof(v_answers->'writingSamples')='array' then v_answers->'writingSamples' else '[]'::jsonb end;
  if btrim(coalesce(v_answers->>'portfolioUrl',''))='' and jsonb_array_length(v_samples)=0 then return jsonb_build_object('success',false,'field','portfolioUrl','error','Provide a portfolio or at least one writing sample.'); end if;
  if char_length(btrim(coalesce(v_answers->>'contentExperience','')))<30 then return jsonb_build_object('success',false,'field','contentExperience','error','Please describe your relevant content-writing experience.'); end if;
  if char_length(btrim(coalesce(v_answers->>'researchApproach','')))<30 then return jsonb_build_object('success',false,'field','researchApproach','error','Please describe how you research before writing.'); end if;
  if char_length(btrim(coalesce(v_answers->>'qualityProcess','')))<30 then return jsonb_build_object('success',false,'field','qualityProcess','error','Please describe how you check quality and accuracy.'); end if;
  if lower(coalesce(v_answers->>'hasLaptopInternet','false')) not in('true','1') then return jsonb_build_object('success',false,'field','hasLaptopInternet','error','A reliable laptop and internet connection are required.'); end if;
  if lower(coalesce(v_answers->>'consentAccurate','false')) not in('true','1') or lower(coalesce(v_answers->>'consentPrivacy','false')) not in('true','1') then return jsonb_build_object('success',false,'field','consent','error','Accuracy and privacy confirmations are required.'); end if;
  begin v_start:=nullif(btrim(coalesce(v_answers->>'earliestStartDate','')),'')::date; exception when others then return jsonb_build_object('success',false,'field','earliestStartDate','error','Please provide a valid earliest start date.'); end;
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
    nullif(left(btrim(coalesce(v_answers->>'message','')),10000),''),'not_started',0,false,v_reference,'content_writer_v1','content_writer_v1',now(),
    nullif(btrim(v_answers->>'currentRole'),''),nullif(btrim(v_answers->>'weeklyAvailability'),''),v_hours,v_start,
    nullif(left(btrim(coalesce(v_answers->>'motivation','')),10000),''),true,now(),now(),nullif(btrim(v_answers->>'cvStoragePath'),''),v_job.id,
    jsonb_build_object('jobId',v_job.id,'jobSlug',v_job.slug,'jobUpdatedAt',v_job.updated_at,'roleDetails',v_job.role_details),
    (v_answers-'fullName'-'email')||jsonb_build_object('writingSamples',v_samples)
  ) returning id into v_id;
  return jsonb_build_object('success',true,'applicant_id',v_id,'reference',v_reference,'stage','New Application');
exception when others then
  raise warning 'Content Writer application failed: %',sqlerrm;
  return jsonb_build_object('success',false,'error','We could not submit your application right now. Please try again.');
end; $$;

create or replace function public.admin_get_recruitment_assessments(p_applicant_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then raise exception 'Recruitment management access required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'applicantId',a.applicant_id,'jobId',a.job_id,'stage',a.stage,'attemptNo',a.attempt_no,'status',a.status,'score',a.score,'passingScore',a.passing_score_snapshot,'rubric',a.rubric_snapshot,'rubricScores',a.rubric_scores,'criticalFailures',a.critical_failures,'evidence',a.evidence,'evidenceUrl',a.evidence_url,'evaluatorNotes',a.evaluator_notes,'evaluatorId',a.evaluator_id,'evaluatorName',u.full_name,'evaluatedAt',a.evaluated_at,'createdAt',a.created_at,'updatedAt',a.updated_at) order by a.created_at desc),'[]'::jsonb)
  into v_result from public.recruitment_assessments a left join public.user_profiles u on u.id=a.evaluator_id where a.applicant_id=p_applicant_id;
  return v_result;
end; $$;

create or replace function public.admin_get_recruitment_interviews(p_applicant_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then raise exception 'Recruitment management access required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',ri.id,'applicantId',ri.applicant_id,'stage',ri.stage,'meetingId',m.id,'interviewerId',ri.interviewer_id,'interviewerName',u.full_name,'interviewType',ri.interview_type,'startAt',m.start_at,'endAt',m.end_at,'timezone',m.timezone,'meetingUrl',m.meeting_url,'status',m.status,'outcomeNotes',ri.outcome_notes,'createdAt',ri.created_at,'updatedAt',ri.updated_at) order by m.start_at desc),'[]'::jsonb) into v_result
  from public.recruitment_interviews ri join public.sales_meetings m on m.id=ri.meeting_id left join public.user_profiles u on u.id=ri.interviewer_id where ri.applicant_id=p_applicant_id;
  return v_result;
end; $$;

create or replace function public.admin_record_recruitment_assessment(p_applicant_id uuid,p_stage text,p_status text,p_score integer,p_rubric_scores jsonb default '{}'::jsonb,p_critical_failures jsonb default '[]'::jsonb,p_evidence text default '',p_evidence_url text default '',p_notes text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_app public.applicants%rowtype;v_policy public.recruitment_stage_policies%rowtype;v_attempt integer;v_id uuid;
begin
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then raise exception 'Recruitment management access required.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id for update; if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(btrim(v_app.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot receive new assessments.'; end if;
  if v_app.stage<>p_stage then raise exception 'Assessment must be recorded for the candidate current stage: %.',v_app.stage; end if;
  select * into v_policy from public.recruitment_stage_policies where job_id=public.recruitment_job_for_applicant(v_app.id) and stage=p_stage and active=true;
  if not found or not v_policy.assessment_required then raise exception 'This stage is not configured as a structured assessment stage.'; end if;
  if p_status not in('Passed','Failed','Retry Required') then raise exception 'Assessment status must be Passed, Failed or Retry Required.'; end if;
  if p_score is null or p_score<0 or p_score>100 then raise exception 'Assessment score must be between 0 and 100.'; end if;
  if p_status='Passed' and p_score<coalesce(v_policy.passing_score,0) then raise exception 'Passed assessment score must meet the configured passing score of %.',v_policy.passing_score; end if;
  if p_status='Passed' and jsonb_array_length(coalesce(p_critical_failures,'[]'::jsonb))>0 then raise exception 'An assessment with critical failures cannot be passed.'; end if;
  if p_status='Passed' and v_policy.interview_required and not exists(select 1 from public.recruitment_interviews ri join public.sales_meetings m on m.id=ri.meeting_id where ri.applicant_id=p_applicant_id and ri.stage=p_stage and m.status='Completed') then raise exception 'Complete the required % interview before marking this assessment Passed.',p_stage; end if;
  if jsonb_typeof(coalesce(p_rubric_scores,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_critical_failures,'[]'::jsonb))<>'array' then raise exception 'Invalid assessment evidence format.'; end if;
  select coalesce(max(attempt_no),0)+1 into v_attempt from public.recruitment_assessments where applicant_id=p_applicant_id and stage=p_stage;
  insert into public.recruitment_assessments(applicant_id,job_id,stage,attempt_no,status,score,passing_score_snapshot,rubric_snapshot,rubric_scores,critical_failures,evidence,evidence_url,evaluator_notes,evaluator_id,evaluated_at)
  values(p_applicant_id,v_app.career_job_id,p_stage,v_attempt,p_status,p_score,v_policy.passing_score,v_policy.rubric,coalesce(p_rubric_scores,'{}'::jsonb),coalesce(p_critical_failures,'[]'::jsonb),left(coalesce(p_evidence,''),10000),left(coalesce(p_evidence_url,''),2000),left(coalesce(p_notes,''),10000),auth.uid(),now()) returning id into v_id;
  perform public.log_applicant_event(p_applicant_id,'assessment','assessment_recorded',p_stage||' assessment recorded',coalesce(nullif(btrim(p_notes),''),'Structured recruitment assessment recorded.'),null,p_status,case when public.is_admin() then 'admin' else 'content_manager' end,auth.uid(),'recruitment_assessments',v_id,jsonb_build_object('stage',p_stage,'attemptNo',v_attempt,'score',p_score,'passingScore',v_policy.passing_score,'criticalFailures',coalesce(p_critical_failures,'[]'::jsonb)));
  return jsonb_build_object('success',true,'id',v_id,'attemptNo',v_attempt,'status',p_status,'score',p_score,'passingScore',v_policy.passing_score);
end; $$;

create or replace function public.admin_schedule_recruitment_interview(p_applicant_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_timezone text,p_meeting_url text default '',p_interviewer_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_app public.applicants%rowtype;v_policy public.recruitment_stage_policies%rowtype;v_interviewer uuid:=coalesce(p_interviewer_id,auth.uid());v_meeting uuid;v_interview uuid;v_local text;v_content boolean;
begin
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then raise exception 'Recruitment management access required.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id for update; if not found then raise exception 'Candidate not found.'; end if;
  v_content:=public.can_manage_content_applicant(p_applicant_id) and exists(select 1 from public.career_jobs j where j.id=v_app.career_job_id and j.application_type='content_writer');
  select * into v_policy from public.recruitment_stage_policies where job_id=public.recruitment_job_for_applicant(v_app.id) and stage=v_app.stage and active=true;
  if not found or v_policy.interview_required is not true then raise exception 'The current stage is not configured to require a recruitment interview.'; end if;
  if v_content then
    if not exists(select 1 from public.user_profiles where id=v_interviewer and status='active' and role in('admin','editor','site_manager')) then raise exception 'Content interviewer must be an active Content Manager, Editor, Site Manager or Admin.'; end if;
  elsif not exists(select 1 from public.user_profiles where id=v_interviewer and role='admin' and status='active') then raise exception 'Interviewer must be an active Admin.'; end if;
  if p_start_at is null or p_end_at is null or p_end_at<=p_start_at or p_start_at<=now() then raise exception 'Interview must be scheduled for a valid future time.'; end if;
  if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid IANA timezone.'; end if;
  if coalesce(btrim(p_meeting_url),'')<>'' and p_meeting_url!~*'^https?://' then raise exception 'Meeting link must begin with http:// or https://.'; end if;
  insert into public.sales_meetings(request_key,salesperson_id,meeting_type,title,description,start_at,end_at,timezone,provider,meeting_url,attendee_name,attendee_email,status,created_by)
  values(gen_random_uuid(),v_interviewer,'Recruitment Interview','Recruitment: '||v_app.full_name||' - '||v_app.stage,'ProFox recruitment interview for application '||coalesce(v_app.application_reference,v_app.id::text),p_start_at,p_end_at,p_timezone,'Manual',coalesce(btrim(p_meeting_url),''),v_app.full_name,lower(btrim(v_app.email)),'Scheduled',auth.uid()) returning id into v_meeting;
  insert into public.recruitment_interviews(applicant_id,stage,meeting_id,interviewer_id,created_by) values(p_applicant_id,v_app.stage,v_meeting,v_interviewer,auth.uid()) returning id into v_interview;
  v_local:=to_char(p_start_at at time zone p_timezone,'FMDay, FMMonth DD, YYYY at HH12:MI AM');
  perform public.enqueue_notification('recruitment:'||p_applicant_id::text||':interview:'||v_interview::text,'recruitment_interview_scheduled',lower(btrim(v_app.email)),null,public.recruitment_notification_payload(v_app)||jsonb_build_object('interviewStage',v_app.stage,'interviewDateTime',v_local,'interviewTimezone',p_timezone,'meetingUrl',coalesce(btrim(p_meeting_url),'')),now());
  perform public.log_applicant_event(p_applicant_id,'interview','interview_scheduled',v_app.stage||' interview scheduled',v_local||' ('||p_timezone||')',null,'Scheduled',case when public.is_admin() then 'admin' else 'content_manager' end,auth.uid(),'recruitment_interviews',v_interview,jsonb_build_object('meetingId',v_meeting,'interviewerId',v_interviewer,'startAt',p_start_at,'endAt',p_end_at,'timezone',p_timezone,'meetingUrl',coalesce(btrim(p_meeting_url),'')));
  return jsonb_build_object('success',true,'id',v_interview,'meetingId',v_meeting,'stage',v_app.stage,'status','Scheduled','startAt',p_start_at,'endAt',p_end_at,'timezone',p_timezone);
end; $$;

create or replace function public.admin_update_recruitment_interview(p_interview_id uuid,p_status text,p_outcome_notes text default '',p_meeting_url text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.recruitment_interviews%rowtype;v_meeting public.sales_meetings%rowtype;v_app public.applicants%rowtype;v_payload jsonb;
begin
  select * into v_row from public.recruitment_interviews where id=p_interview_id for update; if not found then raise exception 'Recruitment interview not found.'; end if;
  if not public.can_manage_content_applicant(v_row.applicant_id) and not public.is_admin() then raise exception 'Recruitment management access required.'; end if;
  if p_status not in('Scheduled','Completed','Cancelled','No Show','Rescheduled') then raise exception 'Invalid interview status.'; end if;
  select * into v_meeting from public.sales_meetings where id=v_row.meeting_id for update; if not found then raise exception 'Linked meeting not found.'; end if;
  select * into v_app from public.applicants where id=v_row.applicant_id;
  if p_meeting_url is not null and btrim(p_meeting_url)<>'' and p_meeting_url!~*'^https?://' then raise exception 'Meeting link must begin with http:// or https://.'; end if;
  update public.sales_meetings set status=p_status,meeting_url=case when p_meeting_url is null then meeting_url else btrim(p_meeting_url) end,outcome=case when p_status in('Completed','No Show') then left(coalesce(p_outcome_notes,''),5000) else outcome end,completed_at=case when p_status='Completed' then now() else completed_at end,cancelled_at=case when p_status='Cancelled' then now() else cancelled_at end,rescheduled_at=case when p_status='Rescheduled' then now() else rescheduled_at end,updated_at=now() where id=v_meeting.id;
  update public.recruitment_interviews set outcome_notes=left(coalesce(p_outcome_notes,''),10000),updated_at=now() where id=p_interview_id;
  v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object('interviewStage',v_row.stage,'interviewStatus',p_status,'interviewOutcome',case when btrim(coalesce(p_outcome_notes,''))='' then 'The recruitment team will contact you if any further action is required.' else left(btrim(p_outcome_notes),1500) end);
  if p_status in('Cancelled','Rescheduled') then perform public.enqueue_notification('recruitment:'||v_app.id::text||':interview-update:'||v_row.id::text||':'||lower(replace(p_status,' ','-')),'recruitment_interview_updated',lower(btrim(v_app.email)),null,v_payload,now()); end if;
  perform public.log_applicant_event(v_app.id,'interview','interview_status_updated',v_row.stage||' interview updated',left(coalesce(p_outcome_notes,''),2000),v_meeting.status,p_status,case when public.is_admin() then 'admin' else 'content_manager' end,auth.uid(),'recruitment_interviews',v_row.id,jsonb_build_object('meetingId',v_meeting.id,'status',p_status));
  return jsonb_build_object('success',true,'id',v_row.id,'meetingId',v_meeting.id,'status',p_status);
end; $$;

create or replace function public.admin_close_applicant(p_applicant_id uuid,p_reason text,p_notes text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_app public.applicants%rowtype;v_profile public.user_profiles%rowtype;v_cancelled int:=0;v_is_content boolean;
begin
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then raise exception 'Recruitment management access required.'; end if;
  if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Closure reason is required.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id for update; if not found then raise exception 'Candidate not found.'; end if;
  v_is_content:=exists(select 1 from public.career_jobs j where j.id=v_app.career_job_id and j.application_type='content_writer');
  if v_app.stage='Activated' then raise exception 'Activated staff must be deactivated through Team & Users, not recruitment closure.'; end if;
  if coalesce(btrim(v_app.refusal_reason),'')<>'' then return jsonb_build_object('success',true,'alreadyClosed',true,'reason',v_app.refusal_reason); end if;
  perform set_config('profox.recruitment_close_rpc','1',true);
  if v_is_content then perform set_config('profox.content_writer_activation_rpc','1',true); end if;
  update public.applicants set refusal_reason=btrim(p_reason),closed_at=now(),closed_by=auth.uid(),onboarding_status=case when linked_user_id is null then onboarding_status else 'failed' end,updated_at=now() where id=p_applicant_id;
  if v_app.linked_user_id is not null then
    select * into v_profile from public.user_profiles where id=v_app.linked_user_id for update;
    if found and v_profile.status in('pending','onboarding') then
      update public.user_profiles set status='inactive',onboarding_status='failed',updated_at=now() where id=v_profile.id;
      perform public.log_applicant_event(p_applicant_id,'account','onboarding_access_revoked','Onboarding access revoked',coalesce(nullif(btrim(p_notes),''),'Candidate was closed before activation.'),v_profile.status,'inactive',case when public.is_admin() then 'admin' else 'content_manager' end,auth.uid(),'user_profiles',v_profile.id,jsonb_build_object('reason',btrim(p_reason)));
    end if;
  end if;
  update public.notification_outbox set status='Cancelled',last_error='Candidate recruitment workflow was closed.',updated_at=now() where payload->>'applicantId'=p_applicant_id::text and status in('Pending','Retry') and template_key not in('recruitment_not_selected','content_recruitment_not_selected');
  get diagnostics v_cancelled=row_count;
  return jsonb_build_object('success',true,'reason',btrim(p_reason),'accessRevoked',v_app.linked_user_id is not null,'notificationsCancelled',v_cancelled);
end; $$;

create or replace function public.admin_get_applicant_timeline(p_applicant_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid;result jsonb;
begin
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then raise exception 'Recruitment management access required.'; end if;
  select linked_user_id into v_user from public.applicants where id=p_applicant_id; if not found then return '[]'::jsonb; end if;
  with timeline as(
    select e.id::text id,e.category,e.event_type type,e.title,e.detail,e.to_value status,e.occurred_at,coalesce(up.full_name,case when e.actor_type='applicant' then 'Applicant' else initcap(replace(e.actor_type,'_',' ')) end) actor,jsonb_strip_nulls(e.metadata||jsonb_build_object('from',e.from_value,'to',e.to_value,'source',e.source_table)) metadata from public.applicant_events e left join public.user_profiles up on up.id=e.actor_user_id where e.applicant_id=p_applicant_id
    union all select ra.id::text,'assessment','assessment_recorded',ra.stage||' assessment',nullif(ra.evaluator_notes,''),ra.status,coalesce(ra.evaluated_at,ra.created_at),coalesce(up.full_name,'Reviewer'),jsonb_strip_nulls(jsonb_build_object('attemptNo',ra.attempt_no,'score',ra.score,'passingScore',ra.passing_score_snapshot,'criticalFailures',ra.critical_failures,'evidenceUrl',nullif(ra.evidence_url,''))) from public.recruitment_assessments ra left join public.user_profiles up on up.id=ra.evaluator_id where ra.applicant_id=p_applicant_id
    union all select n.id::text||':queued','communication','email_queued','Email queued',n.template_key,n.status,n.created_at,'System',jsonb_strip_nulls(jsonb_build_object('templateKey',n.template_key,'recipient',n.recipient_email,'scheduledFor',n.scheduled_for,'attempts',n.attempts)) from public.notification_outbox n where n.payload->>'applicantId'=p_applicant_id::text
    union all select p.id::text||':started','training','training_module_started','Training module started',m.title,p.status,p.created_at,case when m.academy_key='content_writer' then 'Content Academy' else 'Sales Academy' end,jsonb_build_object('moduleId',m.id,'moduleTitle',m.title,'progress',p.progress_percent,'score',p.score) from public.user_training_progress p join public.training_modules m on m.id=p.module_id where v_user is not null and p.user_id=v_user
    union all select p.id::text||':completed','training','training_module_completed','Training module completed',m.title,p.status,p.completed_at,case when m.academy_key='content_writer' then 'Content Academy' else 'Sales Academy' end,jsonb_build_object('moduleId',m.id,'moduleTitle',m.title,'score',p.score,'attempts',p.attempts) from public.user_training_progress p join public.training_modules m on m.id=p.module_id where v_user is not null and p.user_id=v_user and p.completed_at is not null
    union all select p.id::text||':review','training','training_review','Training review recorded',m.title,p.review_status,p.reviewed_at,coalesce(up.full_name,'Reviewer'),jsonb_build_object('moduleId',m.id,'moduleTitle',m.title,'score',p.score,'feedback',p.feedback) from public.user_training_progress p join public.training_modules m on m.id=p.module_id left join public.user_profiles up on up.id=p.reviewed_by where v_user is not null and p.user_id=v_user and p.reviewed_at is not null
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'type',type,'title',title,'detail',detail,'status',status,'occurredAt',occurred_at,'actor',actor,'metadata',metadata) order by occurred_at desc),'[]'::jsonb) into result from timeline;
  return result;
end; $$;

create or replace function public.queue_recruitment_stage_notifications()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_admin record;v_template text;v_cycle text:=md5(clock_timestamp()::text||random()::text||new.id::text);v_secure_issue boolean:=coalesce(current_setting('profox.agreement_issue_stage',true),'')='1';v_type text;v_manager_count integer:=0;
begin
  select application_type into v_type from public.career_jobs where id=new.career_job_id;
  v_type:=coalesce(v_type,'sales_representative');
  if v_type='content_writer' then
    if tg_op='INSERT' then
      perform public.enqueue_notification('recruitment:'||new.id::text||':content-application-received','content_recruitment_application_received',lower(btrim(new.email)),null,public.recruitment_notification_payload(new),now());
      for v_admin in select id from public.user_profiles where status='active' and role in('editor','site_manager') loop
        perform public.enqueue_in_app_notification(v_admin.id,'Recruitment','New Content Writer application',new.full_name||' submitted a Content Writer application.','/admin/app/recruitment?tab=recruitment','content-recruitment:new:'||new.id::text||':'||v_admin.id::text);v_manager_count:=v_manager_count+1;
      end loop;
      if v_manager_count=0 then for v_admin in select id from public.user_profiles where status='active' and role='admin' loop perform public.enqueue_in_app_notification(v_admin.id,'Recruitment','Content recruitment needs an owner',new.full_name||' submitted a Content Writer application and no active Content Manager is available.','/admin/app/recruitment?tab=recruitment','content-recruitment:unowned:'||new.id::text||':'||v_admin.id::text); end loop; end if;
      return new;
    end if;
    if new.refusal_reason is distinct from old.refusal_reason and coalesce(btrim(new.refusal_reason),'')<>'' then
      perform public.enqueue_notification('recruitment:'||new.id::text||':content-not-selected','content_recruitment_not_selected',lower(btrim(new.email)),null,public.recruitment_notification_payload(new),now());return new;
    end if;
    if new.stage is distinct from old.stage then
      v_template:=case new.stage when 'Selected' then 'content_recruitment_selected' when 'Activated' then 'content_recruitment_activated' when 'Content Academy' then null when 'Practical Certification' then null else 'content_recruitment_stage' end;
      if v_template is not null then perform public.enqueue_notification('recruitment:'||new.id::text||':content-stage:'||lower(regexp_replace(new.stage,'[^a-zA-Z0-9]+','-','g'))||':'||v_cycle,v_template,lower(btrim(new.email)),new.linked_user_id,public.recruitment_notification_payload(new),now()); end if;
    end if;
    return new;
  end if;

  if tg_op='INSERT' then
    if new.stage='Video Pending' then perform public.queue_recruitment_email(new,'recruitment_video_pending','video-pending-'||v_cycle,now());perform public.queue_recruitment_video_pending_followups(new,v_cycle);else perform public.queue_recruitment_email(new,'recruitment_application_received','application-received',now());end if;
    for v_admin in select id from public.user_profiles where role='admin' and status='active' loop perform public.enqueue_in_app_notification(v_admin.id,'Recruitment','New sales application',new.full_name||' submitted an application for the Independent Sales Representative role.','/admin/app/recruitment','recruitment:new-applicant:'||new.id::text||':'||v_admin.id::text);end loop;return new;
  end if;
  if new.refusal_reason is distinct from old.refusal_reason and coalesce(btrim(new.refusal_reason),'')<>'' then perform public.cancel_recruitment_video_pending_followups(new.id,'Candidate application was closed.');perform public.queue_recruitment_email(new,'recruitment_not_selected','not-selected',now());return new;end if;
  if new.stage is distinct from old.stage then
    if old.stage='Video Pending' and new.stage<>'Video Pending' then perform public.cancel_recruitment_video_pending_followups(new.id,'Candidate progressed beyond Video Pending.');end if;
    if new.stage='Agreement Pending' and old.stage='Selected' and coalesce(new.agreement_status,'not_sent')='not_sent' then perform public.create_sales_partner_agreement_internal(new.id);v_secure_issue:=true;end if;
    v_template:=case new.stage when 'New Application' then 'recruitment_application_received' when 'Video Pending' then 'recruitment_video_pending' when 'Video Review' then 'recruitment_video_received' when 'Initial Screening' then 'recruitment_initial_screening' when 'Shortlisted' then 'recruitment_shortlisted' when 'Sales Assessment' then 'recruitment_sales_assessment' when 'Lead Research Test' then 'recruitment_lead_research' when 'CRM Assessment' then 'recruitment_crm_assessment' when 'Selected' then 'recruitment_selected' when 'Agreement Pending' then case when v_secure_issue then null else 'recruitment_agreement_pending' end when 'One-Day Training' then 'recruitment_training' when 'Final Approval' then 'recruitment_final_review' when 'Ready for System Access' then 'recruitment_final_approved' when 'Activated' then 'recruitment_activated' else null end;
    if v_template is not null then perform public.queue_recruitment_email(new,v_template,'stage-'||lower(replace(new.stage,' ','-'))||'-'||v_cycle,now());end if;
    if new.stage='Video Pending' then perform public.queue_recruitment_video_pending_followups(new,v_cycle);end if;
  end if;return new;
end; $$;

-- The final queue_due_recruitment_stage_sla implementation is installed in the next
-- closure migration. It is intentionally not redefined here so this migration remains
-- replay-safe on a fresh database without passing an anonymous record to an applicants-typed function.

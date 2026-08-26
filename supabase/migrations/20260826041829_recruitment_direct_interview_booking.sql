create table if not exists public.recruitment_interview_skips (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  stage text not null,
  reason text not null,
  skipped_by uuid not null references public.user_profiles(id),
  skipped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(applicant_id, stage)
);

alter table public.recruitment_interview_skips enable row level security;
revoke all on public.recruitment_interview_skips from anon, authenticated;

drop policy if exists recruitment_interview_skips_admin_select on public.recruitment_interview_skips;
create policy recruitment_interview_skips_admin_select on public.recruitment_interview_skips
for select using (public.is_admin() or public.can_manage_content_applicant(applicant_id));

grant select on public.recruitment_interview_skips to authenticated;

create or replace function public.recruitment_interview_requirement_satisfied(p_applicant_id uuid, p_stage text)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
select exists(
  select 1
  from public.recruitment_interviews ri
  join public.sales_meetings m on m.id=ri.meeting_id
  where ri.applicant_id=p_applicant_id and ri.stage=p_stage and m.status='Completed'
) or exists(
  select 1
  from public.recruitment_interview_skips s
  where s.applicant_id=p_applicant_id and s.stage=p_stage
);
$$;

revoke all on function public.recruitment_interview_requirement_satisfied(uuid,text) from public, anon, authenticated;
grant execute on function public.recruitment_interview_requirement_satisfied(uuid,text) to service_role;

create or replace function public.admin_record_recruitment_assessment(
  p_applicant_id uuid,
  p_stage text,
  p_status text,
  p_score integer,
  p_rubric_scores jsonb default '{}'::jsonb,
  p_critical_failures jsonb default '[]'::jsonb,
  p_evidence text default ''::text,
  p_evidence_url text default ''::text,
  p_notes text default ''::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
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
  if p_status='Passed' and v_policy.interview_required and not public.recruitment_interview_requirement_satisfied(p_applicant_id,p_stage) then raise exception 'Complete or administratively skip the required % interview before marking this assessment Passed.',p_stage; end if;
  if jsonb_typeof(coalesce(p_rubric_scores,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_critical_failures,'[]'::jsonb))<>'array' then raise exception 'Invalid assessment evidence format.'; end if;
  select coalesce(max(attempt_no),0)+1 into v_attempt from public.recruitment_assessments where applicant_id=p_applicant_id and stage=p_stage;
  insert into public.recruitment_assessments(applicant_id,job_id,stage,attempt_no,status,score,passing_score_snapshot,rubric_snapshot,rubric_scores,critical_failures,evidence,evidence_url,evaluator_notes,evaluator_id,evaluated_at)
  values(p_applicant_id,v_app.career_job_id,p_stage,v_attempt,p_status,p_score,v_policy.passing_score,v_policy.rubric,coalesce(p_rubric_scores,'{}'::jsonb),coalesce(p_critical_failures,'[]'::jsonb),left(coalesce(p_evidence,''),10000),left(coalesce(p_evidence_url,''),2000),left(coalesce(p_notes,''),10000),auth.uid(),now()) returning id into v_id;
  perform public.log_applicant_event(p_applicant_id,'assessment','assessment_recorded',p_stage||' assessment recorded',coalesce(nullif(btrim(p_notes),''),'Structured recruitment assessment recorded.'),null,p_status,case when public.is_admin() then 'admin' else 'content_manager' end,auth.uid(),'recruitment_assessments',v_id,jsonb_build_object('stage',p_stage,'attemptNo',v_attempt,'score',p_score,'passingScore',v_policy.passing_score,'criticalFailures',coalesce(p_critical_failures,'[]'::jsonb)));
  return jsonb_build_object('success',true,'id',v_id,'attemptNo',v_attempt,'status',p_status,'score',p_score,'passingScore',v_policy.passing_score);
end;
$$;

create or replace function public.admin_advance_applicant_stage(p_applicant_id uuid, p_target_stage text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_app public.applicants%rowtype;v_job public.career_jobs%rowtype;v_target text;v_policy public.recruitment_stage_policies%rowtype;v_from_rank integer;v_to_rank integer;v_role text;
begin
 select * into v_app from public.applicants where id=p_applicant_id for update;if not found then raise exception 'Candidate not found.';end if;
 select * into v_job from public.career_jobs where id=v_app.career_job_id;if not found then raise exception 'Candidate career job is missing.';end if;
 if not public.is_admin() and not(v_job.application_type='content_writer' and public.can_manage_content_applicant(v_app.id)) then raise exception 'Recruitment management access required.';end if;
 if coalesce(trim(v_app.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot progress.';end if;
 v_role:=coalesce(public.career_job_system_role(v_app.career_job_id),case when v_job.application_type='sales_representative' then 'sales' else 'pending' end);
 v_target:=coalesce(p_target_stage,public.recruitment_next_stage_for_job(v_app.career_job_id,v_app.stage));if v_target is null then raise exception 'No next stage is available.';end if;
 v_from_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_app.stage);v_to_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_target);
 if v_from_rank is null or v_to_rank is null or v_to_rank<>v_from_rank+1 then raise exception 'Recruitment stages must progress sequentially through the selected job workflow.';end if;
 if v_job.application_type='sales_representative' or v_role='sales' then
  if v_app.stage='New Application' and v_target='Video Pending' and(coalesce(v_app.video_url,'')<>'' or coalesce(v_app.video_storage_path,'')<>'') then v_target:='Video Review';end if;
  if v_app.stage='Video Pending' and v_target='Video Review' and coalesce(v_app.video_url,'')='' and coalesce(v_app.video_storage_path,'')='' then raise exception 'Introduction video is required before Video Review.';end if;
 end if;
 select * into v_policy from public.recruitment_stage_policies where job_id=v_app.career_job_id and stage=v_app.stage and active=true;
 if found and v_policy.assessment_required and not public.recruitment_latest_assessment_passed(v_app.id,v_app.stage) then raise exception 'A passed structured assessment for % is required before progression.',v_app.stage;end if;
 if found and v_policy.interview_required and not public.recruitment_interview_requirement_satisfied(v_app.id,v_app.stage) then raise exception 'A completed or administratively skipped structured interview for % is required before progression.',v_app.stage;end if;
 if v_job.application_type='content_writer' then
  if v_app.stage='Selected' then raise exception 'Content Academy access is provisioned through the protected recruitment account invitation flow.';end if;
  if v_app.stage='Content Academy' then raise exception 'Content Academy completion and practical submission control the next stage.';end if;
  if v_app.stage='Practical Certification' or v_target='Activated' then raise exception 'Content Writer activation is controlled by the protected practical certification gate.';end if;
 else
  if v_app.stage='Selected' then raise exception 'Issue the approved candidate agreement to move a Selected candidate into Agreement Pending.';end if;
  if v_app.stage='Agreement Pending' then raise exception 'A verified agreement and protected account invitation are required before onboarding training.';end if;
  if v_app.stage in('One-Day Training','Design Academy','Developer Academy') then raise exception 'The candidate must complete the assigned Academy and request Final Approval through the protected workflow.';end if;
  if v_app.stage='Final Approval' then raise exception 'Use the protected Final Approval action.';end if;if v_app.stage='Ready for System Access' then raise exception 'Use protected workforce activation.';end if;
 end if;
 perform set_config('profox.recruitment_stage_rpc','1',true);update public.applicants set stage=v_target,updated_at=now() where id=v_app.id;
 return jsonb_build_object('success',true,'fromStage',v_app.stage,'toStage',v_target,'systemRole',v_role,'applicationType',v_job.application_type);
end;
$$;

create or replace function public.admin_get_recruitment_interview_booking_context(p_applicant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_app public.applicants%rowtype;
  v_policy public.recruitment_stage_policies%rowtype;
  v_user public.user_profiles%rowtype;
  v_cal public.user_calendar_settings%rowtype;
  v_conn public.google_calendar_connections%rowtype;
  v_skip public.recruitment_interview_skips%rowtype;
  v_settings jsonb := '{}'::jsonb;
  v_duration integer := 30;
  v_timezone text := 'UTC';
  v_calendar_ready boolean := false;
  v_setup_message text := '';
  v_interview_required boolean := false;
  v_completed boolean := false;
begin
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then raise exception 'Recruitment management access required.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id; if not found then raise exception 'Candidate not found.'; end if;
  select * into v_user from public.user_profiles where id=auth.uid() and status='active'; if not found then raise exception 'Active staff profile required.'; end if;
  select * into v_policy from public.recruitment_stage_policies where job_id=v_app.career_job_id and stage=v_app.stage and active=true;
  v_interview_required := found and v_policy.interview_required;
  select coalesce(config_value,'{}'::jsonb) into v_settings from public.system_configuration where config_key='meeting_settings';
  v_settings:=coalesce(v_settings,'{}'::jsonb);
  select * into v_cal from public.user_calendar_settings where user_id=v_user.id;
  if found then
    v_timezone:=coalesce(nullif(v_cal.timezone,''),nullif(v_user.timezone,''),nullif(v_settings->>'defaultTimezone',''),'UTC');
    v_duration:=coalesce(v_cal.default_duration_minutes,(v_settings->>'defaultDurationMinutes')::integer,30);
  else
    v_timezone:=coalesce(nullif(v_user.timezone,''),nullif(v_settings->>'defaultTimezone',''),'UTC');
    v_duration:=coalesce((v_settings->>'defaultDurationMinutes')::integer,30);
  end if;
  if not exists(select 1 from pg_timezone_names where name=v_timezone) then v_timezone:='UTC'; end if;
  if not exists(select 1 from jsonb_array_elements_text(coalesce(v_settings->'allowedDurations','[15,30,45,60]'::jsonb)) x where x::integer=v_duration) then
    v_duration:=coalesce((v_settings->>'defaultDurationMinutes')::integer,30);
  end if;
  select * into v_conn from public.google_calendar_connections where user_id=v_user.id;
  select * into v_skip from public.recruitment_interview_skips where applicant_id=v_app.id and stage=v_app.stage;
  v_completed:=exists(select 1 from public.recruitment_interviews ri join public.sales_meetings m on m.id=ri.meeting_id where ri.applicant_id=v_app.id and ri.stage=v_app.stage and m.status='Completed');
  v_calendar_ready:=coalesce((v_settings->>'active')::boolean,true)
    and v_cal.user_id is not null and v_cal.active is true
    and v_conn.user_id is not null and v_conn.status='connected' and v_conn.sync_enabled is true and v_conn.create_meet is true;
  if not coalesce((v_settings->>'active')::boolean,true) then v_setup_message:='Meeting scheduling is disabled in company settings.';
  elsif v_cal.user_id is null or v_cal.active is not true then v_setup_message:='Configure your meeting availability before booking candidate interviews.';
  elsif v_conn.user_id is null or v_conn.status<>'connected' then v_setup_message:='Connect Google Calendar before booking candidate interviews.';
  elsif v_conn.sync_enabled is not true then v_setup_message:='Enable Google Calendar synchronization before booking candidate interviews.';
  elsif v_conn.create_meet is not true then v_setup_message:='Enable automatic Google Meet creation before booking candidate interviews.';
  end if;
  return jsonb_build_object(
    'interviewRequired',v_interview_required,
    'interviewerId',v_user.id,
    'interviewerName',v_user.full_name,
    'timezone',v_timezone,
    'durationMinutes',v_duration,
    'meetingType','Recruitment Interview',
    'providerLabel','Google Meet',
    'calendarReady',v_calendar_ready,
    'setupRequired',not v_calendar_ready,
    'setupMessage',v_setup_message,
    'setupUrl','/admin/meetings?tab=availability',
    'canBook',v_interview_required and v_calendar_ready and v_skip.id is null and not v_completed,
    'canSkip',public.is_admin() and v_interview_required and v_skip.id is null and not v_completed,
    'interviewCompleted',v_completed,
    'interviewSkipped',v_skip.id is not null,
    'skipReason',coalesce(v_skip.reason,''),
    'skippedAt',v_skip.skipped_at,
    'skippedByName',coalesce((select full_name from public.user_profiles where id=v_skip.skipped_by),'')
  );
end;
$$;

create or replace function public.admin_get_recruitment_interview_slots(
  p_applicant_id uuid,
  p_from_date date default null,
  p_days integer default 14
)
returns table(start_at timestamptz,end_at timestamptz,timezone text,duration_minutes integer)
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_context jsonb;
  v_user uuid:=auth.uid();
  v_cal public.user_calendar_settings%rowtype;
  v_settings jsonb:='{}'::jsonb;
  v_public jsonb:='{}'::jsonb;
  v_timezone text;
  v_duration integer;
  v_interval integer;
  v_max_advance integer;
  v_min_notice integer;
  v_days integer;
  v_today date;
  v_start_date date;
  v_end_date date;
begin
  v_context:=public.admin_get_recruitment_interview_booking_context(p_applicant_id);
  if coalesce((v_context->>'interviewRequired')::boolean,false) is not true then raise exception 'The current stage does not require a recruitment interview.'; end if;
  if coalesce((v_context->>'calendarReady')::boolean,false) is not true then raise exception '%',coalesce(v_context->>'setupMessage','Meeting setup is required.'); end if;
  if coalesce((v_context->>'interviewSkipped')::boolean,false) is true then raise exception 'This interview requirement has already been skipped by an Administrator.'; end if;
  select * into v_cal from public.user_calendar_settings where user_id=v_user and active=true; if not found then raise exception 'Meeting availability is not configured.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_settings from public.system_configuration where config_key='meeting_settings';
  select coalesce(config_value,'{}'::jsonb) into v_public from public.system_configuration where config_key='public_booking_settings';
  v_timezone:=coalesce(v_context->>'timezone','UTC');
  v_duration:=coalesce((v_context->>'durationMinutes')::integer,30);
  v_interval:=least(greatest(coalesce((v_public->>'slotIntervalMinutes')::integer,15),5),120);
  v_max_advance:=least(greatest(coalesce((v_public->>'maxAdvanceDays')::integer,60),1),365);
  v_min_notice:=greatest(coalesce((v_settings->>'minimumBookingNoticeMinutes')::integer,0),0);
  v_days:=least(greatest(coalesce(p_days,14),1),31);
  v_today:=(now() at time zone v_timezone)::date;
  v_start_date:=greatest(coalesce(p_from_date,v_today),v_today);
  v_end_date:=least(v_start_date+(v_days-1),v_today+v_max_advance);
  if v_start_date>v_end_date then return; end if;
  return query
  with dates as (
    select gs::date d from generate_series(v_start_date::timestamp,v_end_date::timestamp,interval '1 day') gs
    where extract(dow from gs)::integer=any(v_cal.working_days)
  ), slots as (
    select
      ((d.d+v_cal.work_start)+(n*make_interval(mins=>v_interval))) at time zone v_timezone slot_start,
      (((d.d+v_cal.work_start)+(n*make_interval(mins=>v_interval))) at time zone v_timezone)+make_interval(mins=>v_duration) slot_end
    from dates d
    cross join lateral generate_series(0,floor(greatest(extract(epoch from ((d.d+v_cal.work_end)-(d.d+v_cal.work_start)-make_interval(mins=>v_duration)))/60.0,-1)/v_interval)::integer) n
  )
  select s.slot_start,s.slot_end,v_timezone,v_duration
  from slots s
  where s.slot_start>=now()+make_interval(mins=>v_min_notice)
    and not exists(select 1 from public.booking_availability_blocks b where b.user_id=v_user and b.start_at<s.slot_end and b.end_at>s.slot_start)
    and not exists(select 1 from public.sales_meetings m where m.salesperson_id=v_user and m.status in('Scheduled','Rescheduled') and m.start_at<s.slot_end+make_interval(mins=>greatest(coalesce(v_cal.buffer_after_minutes,0),0)) and m.end_at>s.slot_start-make_interval(mins=>greatest(coalesce(v_cal.buffer_before_minutes,0),0)))
    and not public.has_google_calendar_conflict(v_user,s.slot_start,s.slot_end,null)
  order by s.slot_start
  limit 300;
end;
$$;

create or replace function public.admin_book_recruitment_interview(p_applicant_id uuid,p_start_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_app public.applicants%rowtype;
  v_policy public.recruitment_stage_policies%rowtype;
  v_context jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_timezone text;
  v_duration integer;
  v_meeting uuid;
  v_interview uuid;
begin
  if p_start_at is null then raise exception 'Choose an available interview time.'; end if;
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then raise exception 'Recruitment management access required.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id for update; if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(btrim(v_app.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot receive interviews.'; end if;
  select * into v_policy from public.recruitment_stage_policies where job_id=v_app.career_job_id and stage=v_app.stage and active=true;
  if not found or v_policy.interview_required is not true then raise exception 'The current stage is not configured to require a recruitment interview.'; end if;
  if exists(select 1 from public.recruitment_interview_skips where applicant_id=v_app.id and stage=v_app.stage) then raise exception 'This interview requirement was skipped by an Administrator.'; end if;
  if exists(select 1 from public.recruitment_interviews ri join public.sales_meetings m on m.id=ri.meeting_id where ri.applicant_id=v_app.id and ri.stage=v_app.stage and m.status in('Scheduled','Rescheduled')) then raise exception 'An active interview is already scheduled for this stage. Update or reschedule that interview instead of creating a duplicate.'; end if;
  v_context:=public.admin_get_recruitment_interview_booking_context(v_app.id);
  if coalesce((v_context->>'calendarReady')::boolean,false) is not true then raise exception '%',coalesce(v_context->>'setupMessage','Meeting setup is required.'); end if;
  v_timezone:=coalesce(v_context->>'timezone','UTC');
  v_duration:=coalesce((v_context->>'durationMinutes')::integer,30);
  select s.start_at,s.end_at into v_start,v_end
  from public.admin_get_recruitment_interview_slots(v_app.id,(p_start_at at time zone v_timezone)::date,1) s
  where s.start_at=p_start_at
  limit 1;
  if v_start is null then raise exception 'That interview time is no longer available. Choose another available slot.'; end if;
  insert into public.sales_meetings(request_key,salesperson_id,meeting_type,title,description,start_at,end_at,timezone,provider,meeting_url,attendee_name,attendee_email,status,created_by)
  values(gen_random_uuid(),auth.uid(),'Recruitment Interview','Recruitment: '||v_app.full_name||' - '||v_app.stage,'ProFox recruitment interview for application '||coalesce(v_app.application_reference,v_app.id::text),v_start,v_end,v_timezone,'Manual','',v_app.full_name,lower(btrim(v_app.email)),'Scheduled',auth.uid())
  returning id into v_meeting;
  insert into public.recruitment_interviews(applicant_id,stage,meeting_id,interviewer_id,interview_type,created_by)
  values(v_app.id,v_app.stage,v_meeting,auth.uid(),'Recruitment Interview',auth.uid()) returning id into v_interview;
  perform public.log_applicant_event(v_app.id,'interview','interview_booked',v_app.stage||' interview booked','Interview booked from protected staff availability. Google Meet creation and candidate notification are automatic.',null,'Scheduled',case when public.is_admin() then 'admin' else 'content_manager' end,auth.uid(),'recruitment_interviews',v_interview,jsonb_build_object('meetingId',v_meeting,'interviewerId',auth.uid(),'startAt',v_start,'endAt',v_end,'timezone',v_timezone,'durationMinutes',v_duration,'provider','Google Meet'));
  return jsonb_build_object('success',true,'id',v_interview,'meetingId',v_meeting,'stage',v_app.stage,'status','Scheduled','startAt',v_start,'endAt',v_end,'timezone',v_timezone,'durationMinutes',v_duration,'provider','Google Meet','notificationState','waiting_for_meeting_link');
end;
$$;

create or replace function public.admin_skip_recruitment_interview(p_applicant_id uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_app public.applicants%rowtype;
  v_policy public.recruitment_stage_policies%rowtype;
  v_skip uuid;
  v_progression jsonb:=null;
  v_cancelled_interview uuid;
  v_payload jsonb;
begin
  if not public.is_admin() then raise exception 'Only an active Administrator may skip a required recruitment interview.'; end if;
  if length(btrim(coalesce(p_reason,'')))<12 then raise exception 'Provide a specific skip reason of at least 12 characters.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id for update; if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(btrim(v_app.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot be changed.'; end if;
  select * into v_policy from public.recruitment_stage_policies where job_id=v_app.career_job_id and stage=v_app.stage and active=true;
  if not found or v_policy.interview_required is not true then raise exception 'The current stage does not require an interview.'; end if;
  if exists(select 1 from public.recruitment_interview_skips where applicant_id=v_app.id and stage=v_app.stage) then raise exception 'This interview requirement has already been skipped.'; end if;
  if exists(select 1 from public.recruitment_interviews ri join public.sales_meetings m on m.id=ri.meeting_id where ri.applicant_id=v_app.id and ri.stage=v_app.stage and m.status='Completed') then raise exception 'A completed interview cannot be skipped.'; end if;
  select ri.id into v_cancelled_interview
  from public.recruitment_interviews ri join public.sales_meetings m on m.id=ri.meeting_id
  where ri.applicant_id=v_app.id and ri.stage=v_app.stage and m.status in('Scheduled','Rescheduled')
  order by m.start_at desc limit 1;
  update public.sales_meetings m
  set status='Cancelled',cancelled_at=now(),outcome='Interview requirement skipped by Administrator: '||left(btrim(p_reason),1500),updated_at=now()
  where m.id in(select ri.meeting_id from public.recruitment_interviews ri where ri.applicant_id=v_app.id and ri.stage=v_app.stage)
    and m.status in('Scheduled','Rescheduled');
  insert into public.recruitment_interview_skips(applicant_id,stage,reason,skipped_by)
  values(v_app.id,v_app.stage,left(btrim(p_reason),2000),auth.uid()) returning id into v_skip;
  perform public.log_applicant_event(v_app.id,'interview','interview_skipped',v_app.stage||' interview skipped',left(btrim(p_reason),2000),null,'Skipped','admin',auth.uid(),'recruitment_interview_skips',v_skip,jsonb_build_object('stage',v_app.stage,'reason',left(btrim(p_reason),2000),'cancelledInterviewId',v_cancelled_interview));
  if v_cancelled_interview is not null then
    v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object('interviewStage',v_app.stage,'interviewStatus','Cancelled','interviewOutcome','The recruitment interview is no longer required. The Recruitment Team will contact you if another action is needed.');
    perform public.enqueue_notification('recruitment:'||v_app.id::text||':interview-update:'||v_cancelled_interview::text||':cancelled-skip','recruitment_interview_updated',lower(btrim(v_app.email)),null,v_payload,now());
  end if;
  if not v_policy.assessment_required or public.recruitment_latest_assessment_passed(v_app.id,v_app.stage) then
    v_progression:=public.admin_advance_applicant_stage(v_app.id,null);
  end if;
  return jsonb_build_object('success',true,'skipId',v_skip,'stage',v_app.stage,'advanced',v_progression is not null,'progression',v_progression,'assessmentStillRequired',v_policy.assessment_required and not public.recruitment_latest_assessment_passed(v_app.id,v_app.stage));
end;
$$;

create or replace function public.queue_recruitment_interview_confirmation_on_meeting_link()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_ri public.recruitment_interviews%rowtype;
  v_app public.applicants%rowtype;
  v_interviewer text;
  v_local text;
  v_candidate_local text;
  v_candidate_timezone text;
  v_duration integer;
begin
  if new.status not in('Scheduled','Rescheduled') or coalesce(btrim(new.meeting_url),'')='' then return new; end if;
  if new.meeting_url is not distinct from old.meeting_url then return new; end if;
  select * into v_ri from public.recruitment_interviews where meeting_id=new.id; if not found then return new; end if;
  select * into v_app from public.applicants where id=v_ri.applicant_id; if not found then return new; end if;
  select full_name into v_interviewer from public.user_profiles where id=v_ri.interviewer_id;
  v_duration:=greatest(1,round(extract(epoch from (new.end_at-new.start_at))/60.0)::integer);
  v_local:=to_char(new.start_at at time zone new.timezone,'FMDay, FMMonth DD, YYYY at HH12:MI AM');
  v_candidate_timezone:=case when exists(select 1 from pg_timezone_names where name=v_app.timezone) then v_app.timezone else new.timezone end;
  v_candidate_local:=to_char(new.start_at at time zone v_candidate_timezone,'FMDay, FMMonth DD, YYYY at HH12:MI AM');
  perform public.enqueue_notification(
    'recruitment:'||v_app.id::text||':interview:'||v_ri.id::text,
    'recruitment_interview_scheduled',
    lower(btrim(v_app.email)),
    null,
    public.recruitment_notification_payload(v_app)||jsonb_build_object(
      'interviewStage',v_ri.stage,
      'interviewDateTime',v_local,
      'interviewTimezone',new.timezone,
      'candidateDateTime',v_candidate_local,
      'candidateTimezone',v_candidate_timezone,
      'interviewerName',coalesce(v_interviewer,'ProFox Recruitment Team'),
      'interviewDuration',v_duration||' minutes',
      'meetingUrl',btrim(new.meeting_url)
    ),
    now()
  );
  return new;
end;
$$;

drop trigger if exists trg_recruitment_interview_confirmation_on_meeting_link on public.sales_meetings;
create trigger trg_recruitment_interview_confirmation_on_meeting_link
after update of meeting_url on public.sales_meetings
for each row execute function public.queue_recruitment_interview_confirmation_on_meeting_link();

update public.notification_templates
set subject_template='Your ProFox recruitment interview is scheduled',
    body_template='Hi {{fullName}},\n\nYour {{interviewStage}} interview with ProFox has been scheduled.\n\nDate and time: {{candidateDateTime}}\nTime zone: {{candidateTimezone}}\nInterviewer: {{interviewerName}}\nDuration: {{interviewDuration}}\nMeeting link: {{meetingUrl}}\n\nPlease join from a quiet environment with reliable internet and be ready a few minutes before the scheduled time.\n\nIf you have a genuine scheduling issue, contact the Recruitment Team before the interview rather than missing the meeting without notice.\n\nProFox Recruitment Team\nProFox Web Designer\nhttps://www.profoxwebdesigner.com/',
    html_template='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your ProFox recruitment interview is confirmed. Review the time and join link.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f5fb;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;"><tr><td style="height:4px;background:#000080;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="padding:24px 28px 18px;border-bottom:1px solid #eef2f7;"><div style="font-size:19px;line-height:26px;font-weight:700;color:#000080;">ProFox Web Designer</div><div style="margin-top:4px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.2px;color:#64748b;">RECRUITMENT</div></td></tr><tr><td style="padding:28px;"><h1 style="margin:0 0 16px;font-size:24px;line-height:32px;font-weight:700;color:#0f172a;">Your recruitment interview is scheduled</h1><p style="margin:0 0 18px;font-size:15px;line-height:24px;color:#334155;">Hi {{fullName}},<br><br>Your <strong>{{interviewStage}}</strong> interview with ProFox has been scheduled.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;"><tr><td style="padding:16px;font-size:14px;line-height:23px;color:#334155;"><strong>Date and time:</strong> {{candidateDateTime}}<br><strong>Time zone:</strong> {{candidateTimezone}}<br><strong>Interviewer:</strong> {{interviewerName}}<br><strong>Duration:</strong> {{interviewDuration}}</td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#000080" style="border-radius:9px;"><a href="{{meetingUrl}}" style="display:inline-block;padding:13px 20px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Join Meeting</a></td></tr></table><p style="margin:22px 0 0;font-size:13px;line-height:21px;color:#64748b;">Please join from a quiet environment with reliable internet and be ready a few minutes before the scheduled time. If you have a genuine scheduling issue, contact the Recruitment Team before the interview.</p></td></tr><tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #eef2f7;font-size:12px;line-height:19px;color:#64748b;">ProFox Recruitment Team<br>ProFox Web Designer<br><a href="https://www.profoxwebdesigner.com/" style="color:#000080;text-decoration:none;">www.profoxwebdesigner.com</a></td></tr></table></td></tr></table></body></html>',
    updated_at=now()
where template_key='recruitment_interview_scheduled';

revoke all on function public.admin_get_recruitment_interview_booking_context(uuid) from public, anon;
revoke all on function public.admin_get_recruitment_interview_slots(uuid,date,integer) from public, anon;
revoke all on function public.admin_book_recruitment_interview(uuid,timestamptz) from public, anon;
revoke all on function public.admin_skip_recruitment_interview(uuid,text) from public, anon;
grant execute on function public.admin_get_recruitment_interview_booking_context(uuid) to authenticated;
grant execute on function public.admin_get_recruitment_interview_slots(uuid,date,integer) to authenticated;
grant execute on function public.admin_book_recruitment_interview(uuid,timestamptz) to authenticated;
grant execute on function public.admin_skip_recruitment_interview(uuid,text) to authenticated;

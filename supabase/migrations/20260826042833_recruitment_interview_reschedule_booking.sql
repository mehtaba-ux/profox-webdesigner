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
  v_rescheduling boolean:=false;
begin
  if p_start_at is null then raise exception 'Choose an available interview time.'; end if;
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then raise exception 'Recruitment management access required.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id for update; if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(btrim(v_app.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot receive interviews.'; end if;
  select * into v_policy from public.recruitment_stage_policies where job_id=v_app.career_job_id and stage=v_app.stage and active=true;
  if not found or v_policy.interview_required is not true then raise exception 'The current stage is not configured to require a recruitment interview.'; end if;
  if exists(select 1 from public.recruitment_interview_skips where applicant_id=v_app.id and stage=v_app.stage) then raise exception 'This interview requirement was skipped by an Administrator.'; end if;

  select ri.id,m.id into v_interview,v_meeting
  from public.recruitment_interviews ri
  join public.sales_meetings m on m.id=ri.meeting_id
  where ri.applicant_id=v_app.id and ri.stage=v_app.stage and m.status='Rescheduled'
  order by m.updated_at desc
  limit 1;
  v_rescheduling:=v_meeting is not null;

  if not v_rescheduling and exists(
    select 1 from public.recruitment_interviews ri
    join public.sales_meetings m on m.id=ri.meeting_id
    where ri.applicant_id=v_app.id and ri.stage=v_app.stage and m.status='Scheduled'
  ) then raise exception 'An active interview is already scheduled for this stage. Update or reschedule that interview instead of creating a duplicate.'; end if;

  v_context:=public.admin_get_recruitment_interview_booking_context(v_app.id);
  if coalesce((v_context->>'calendarReady')::boolean,false) is not true then raise exception '%',coalesce(v_context->>'setupMessage','Meeting setup is required.'); end if;
  v_timezone:=coalesce(v_context->>'timezone','UTC');
  v_duration:=coalesce((v_context->>'durationMinutes')::integer,30);
  select s.start_at,s.end_at into v_start,v_end
  from public.admin_get_recruitment_interview_slots(v_app.id,(p_start_at at time zone v_timezone)::date,1) s
  where s.start_at=p_start_at
  limit 1;
  if v_start is null then raise exception 'That interview time is no longer available. Choose another available slot.'; end if;

  if v_rescheduling then
    update public.sales_meetings
    set start_at=v_start,
        end_at=v_end,
        timezone=v_timezone,
        status='Scheduled',
        meeting_url='',
        rescheduled_at=now(),
        updated_at=now()
    where id=v_meeting;
    update public.recruitment_interviews set updated_at=now() where id=v_interview;
    perform public.log_applicant_event(v_app.id,'interview','interview_rescheduled',v_app.stage||' interview rescheduled','New time booked from protected staff availability. The existing calendar event and Google Meet link are being refreshed automatically.','Rescheduled','Scheduled',case when public.is_admin() then 'admin' else 'content_manager' end,auth.uid(),'recruitment_interviews',v_interview,jsonb_build_object('meetingId',v_meeting,'interviewerId',auth.uid(),'startAt',v_start,'endAt',v_end,'timezone',v_timezone,'durationMinutes',v_duration,'provider','Google Meet'));
    return jsonb_build_object('success',true,'id',v_interview,'meetingId',v_meeting,'stage',v_app.stage,'status','Scheduled','startAt',v_start,'endAt',v_end,'timezone',v_timezone,'durationMinutes',v_duration,'provider','Google Meet','rescheduled',true,'notificationState','waiting_for_meeting_link');
  end if;

  insert into public.sales_meetings(request_key,salesperson_id,meeting_type,title,description,start_at,end_at,timezone,provider,meeting_url,attendee_name,attendee_email,status,created_by)
  values(gen_random_uuid(),auth.uid(),'Recruitment Interview','Recruitment: '||v_app.full_name||' - '||v_app.stage,'ProFox recruitment interview for application '||coalesce(v_app.application_reference,v_app.id::text),v_start,v_end,v_timezone,'Manual','',v_app.full_name,lower(btrim(v_app.email)),'Scheduled',auth.uid())
  returning id into v_meeting;
  insert into public.recruitment_interviews(applicant_id,stage,meeting_id,interviewer_id,interview_type,created_by)
  values(v_app.id,v_app.stage,v_meeting,auth.uid(),'Recruitment Interview',auth.uid()) returning id into v_interview;
  perform public.log_applicant_event(v_app.id,'interview','interview_booked',v_app.stage||' interview booked','Interview booked from protected staff availability. Google Meet creation and candidate notification are automatic.',null,'Scheduled',case when public.is_admin() then 'admin' else 'content_manager' end,auth.uid(),'recruitment_interviews',v_interview,jsonb_build_object('meetingId',v_meeting,'interviewerId',auth.uid(),'startAt',v_start,'endAt',v_end,'timezone',v_timezone,'durationMinutes',v_duration,'provider','Google Meet'));
  return jsonb_build_object('success',true,'id',v_interview,'meetingId',v_meeting,'stage',v_app.stage,'status','Scheduled','startAt',v_start,'endAt',v_end,'timezone',v_timezone,'durationMinutes',v_duration,'provider','Google Meet','rescheduled',false,'notificationState','waiting_for_meeting_link');
end;
$$;

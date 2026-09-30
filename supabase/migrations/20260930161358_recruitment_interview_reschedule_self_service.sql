-- Candidate/staff recruitment interview rescheduling without creating duplicate meetings.
-- Staff may reschedule an ended Scheduled interview. Candidates may reschedule once,
-- only to a later available slot and never more than 24 hours after the original start.

create table if not exists public.recruitment_interview_candidate_reschedules (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null unique references public.recruitment_interviews(id) on delete cascade,
  token_id uuid references public.recruitment_interview_join_tokens(id) on delete set null,
  original_start_at timestamptz not null,
  original_end_at timestamptz not null,
  new_start_at timestamptz not null,
  new_end_at timestamptz not null,
  rescheduled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint recruitment_interview_candidate_reschedule_time_check
    check (new_start_at > original_start_at and new_start_at <= original_start_at + interval '1 day' and new_end_at > new_start_at)
);

alter table public.recruitment_interview_candidate_reschedules enable row level security;
revoke all on table public.recruitment_interview_candidate_reschedules from public,anon,authenticated;

update public.recruitment_interview_join_tokens t
set expires_at=greatest(t.expires_at,m.start_at+interval '1 day')
from public.recruitment_interviews ri
join public.sales_meetings m on m.id=ri.meeting_id
where t.interview_id=ri.id
  and t.revoked_at is null
  and m.status in('Scheduled','Rescheduled');

create or replace function public.service_prepare_recruitment_interview_join_delivery(p_interview_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_interview public.recruitment_interviews%rowtype;
  v_meeting public.sales_meetings%rowtype;
  v_join_url text;
  v_token text;
  v_expires timestamptz;
begin
  select * into v_interview from public.recruitment_interviews where id=p_interview_id;
  if not found then raise exception 'Recruitment interview not found.'; end if;

  select * into v_meeting from public.sales_meetings where id=v_interview.meeting_id;
  if not found or v_meeting.status not in('Scheduled','Rescheduled') then
    raise exception 'Recruitment interview is not active.';
  end if;
  if v_meeting.end_at<=now()-interval '15 minutes' then
    raise exception 'Recruitment interview has already ended.';
  end if;

  select coalesce(nullif(btrim(mpl.join_url),''),nullif(btrim(v_meeting.meeting_url),''))
  into v_join_url
  from (select 1) seed
  left join public.meeting_provider_private_links mpl
    on mpl.meeting_id=v_meeting.id and mpl.provider='zoho_meeting';

  if coalesce(v_join_url,'')!~*'^https://' then
    raise exception 'Recruitment interview join link is not ready.';
  end if;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_expires:=greatest(v_meeting.end_at+interval '2 hours',v_meeting.start_at+interval '1 day');

  insert into public.recruitment_interview_join_tokens(interview_id,token_hash,expires_at,source)
  values(v_interview.id,public.recruitment_task_token_hash(v_token),v_expires,'notification_delivery');

  return jsonb_build_object(
    'interviewJoinUrl','https://www.profoxwebdesigner.com/recruitment/interview/'||v_token
  );
end;
$$;

revoke all on function public.service_prepare_recruitment_interview_join_delivery(uuid)
  from public,anon,authenticated;
grant execute on function public.service_prepare_recruitment_interview_join_delivery(uuid)
  to service_role;

create or replace function public.public_open_recruitment_interview_join(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_token public.recruitment_interview_join_tokens%rowtype;
  v_interview public.recruitment_interviews%rowtype;
  v_meeting public.sales_meetings%rowtype;
  v_app public.applicants%rowtype;
  v_interviewer text;
  v_join_url text;
  v_candidate_rescheduled boolean:=false;
  v_reschedule_deadline timestamptz;
  v_meeting_ended boolean:=false;
  v_can_reschedule boolean:=false;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then
    raise exception 'This interview link is invalid or no longer active.';
  end if;

  select * into v_token
  from public.recruitment_interview_join_tokens
  where token_hash=public.recruitment_task_token_hash(p_token)
    and revoked_at is null
    and expires_at>now()
  for update;

  if not found then raise exception 'This interview link is invalid or no longer active.'; end if;

  select * into v_interview from public.recruitment_interviews where id=v_token.interview_id;
  if not found then raise exception 'Recruitment interview not found.'; end if;

  select * into v_meeting from public.sales_meetings where id=v_interview.meeting_id;
  if not found or v_meeting.status not in('Scheduled','Rescheduled') then
    raise exception 'This interview is no longer active.';
  end if;

  select * into v_app from public.applicants where id=v_interview.applicant_id;
  if not found or v_app.closed_at is not null then raise exception 'This interview is no longer active.'; end if;

  select exists(
    select 1 from public.recruitment_interview_candidate_reschedules r where r.interview_id=v_interview.id
  ) into v_candidate_rescheduled;

  v_reschedule_deadline:=v_meeting.start_at+interval '1 day';
  if v_candidate_rescheduled then
    select r.original_start_at+interval '1 day'
    into v_reschedule_deadline
    from public.recruitment_interview_candidate_reschedules r
    where r.interview_id=v_interview.id;
  end if;

  v_meeting_ended:=v_meeting.end_at<=now();
  v_can_reschedule:=
    not v_candidate_rescheduled
    and v_app.stage=v_interview.stage
    and v_meeting.status in('Scheduled','Rescheduled')
    and now()<v_reschedule_deadline;

  select coalesce(nullif(btrim(mpl.join_url),''),nullif(btrim(v_meeting.meeting_url),''))
  into v_join_url
  from (select 1) seed
  left join public.meeting_provider_private_links mpl
    on mpl.meeting_id=v_meeting.id and mpl.provider='zoho_meeting';

  if not v_meeting_ended and coalesce(v_join_url,'')!~*'^https://' then
    raise exception 'The interview join link is not ready yet.';
  end if;

  select full_name into v_interviewer from public.user_profiles where id=v_interview.interviewer_id;

  if v_token.opened_at is null then
    update public.recruitment_interview_join_tokens set opened_at=now() where id=v_token.id;
    insert into public.applicant_events(
      applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata
    )
    values(
      v_app.id,'Recruitment','Interview Join Link Opened',
      v_interview.stage||' interview access opened',
      case when v_meeting_ended
        then 'Candidate opened the secure ProFox interview page after the scheduled interview ended.'
        else 'Candidate opened the secure ProFox interview access page.'
      end,
      'Candidate','recruitment_interviews',v_interview.id,
      jsonb_build_object('meetingId',v_meeting.id,'stage',v_interview.stage,'meetingEnded',v_meeting_ended)
    );
  end if;

  return jsonb_build_object(
    'candidateName',v_app.full_name,
    'interviewStage',v_interview.stage,
    'interviewerName',coalesce(v_interviewer,'ProFox Recruitment Team'),
    'startAt',v_meeting.start_at,
    'endAt',v_meeting.end_at,
    'timezone',v_meeting.timezone,
    'providerLabel','Zoho Meeting',
    'joinUrl',case when v_meeting_ended then '' else coalesce(v_join_url,'') end,
    'status',v_meeting.status,
    'meetingEnded',v_meeting_ended,
    'canReschedule',v_can_reschedule,
    'candidateRescheduled',v_candidate_rescheduled,
    'rescheduleDeadline',v_reschedule_deadline
  );
end;
$$;

revoke all on function public.public_open_recruitment_interview_join(text)
  from public,anon,authenticated;
grant execute on function public.public_open_recruitment_interview_join(text)
  to anon,authenticated,service_role;

create or replace function public.public_get_recruitment_interview_reschedule_slots(p_token text)
returns table(
  start_at timestamptz,
  end_at timestamptz,
  timezone text,
  duration_minutes integer,
  reschedule_deadline timestamptz
)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_token public.recruitment_interview_join_tokens%rowtype;
  v_interview public.recruitment_interviews%rowtype;
  v_meeting public.sales_meetings%rowtype;
  v_app public.applicants%rowtype;
  v_cal public.user_calendar_settings%rowtype;
  v_settings jsonb:='{}'::jsonb;
  v_public jsonb:='{}'::jsonb;
  v_timezone text;
  v_duration integer;
  v_interval integer;
  v_min_notice integer;
  v_original_start timestamptz;
  v_deadline timestamptz;
  v_start_date date;
  v_end_date date;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then return; end if;

  select * into v_token
  from public.recruitment_interview_join_tokens
  where token_hash=public.recruitment_task_token_hash(p_token)
    and revoked_at is null
    and expires_at>now();

  if not found then return; end if;

  select * into v_interview from public.recruitment_interviews where id=v_token.interview_id;
  if not found then return; end if;

  select * into v_meeting from public.sales_meetings where id=v_interview.meeting_id;
  if not found or v_meeting.status not in('Scheduled','Rescheduled') then return; end if;

  select * into v_app from public.applicants where id=v_interview.applicant_id;
  if not found or v_app.closed_at is not null or v_app.stage<>v_interview.stage then return; end if;

  if exists(select 1 from public.recruitment_interview_candidate_reschedules r where r.interview_id=v_interview.id) then return; end if;

  v_original_start:=v_meeting.start_at;
  v_deadline:=v_original_start+interval '1 day';
  if now()>=v_deadline then return; end if;

  select * into v_cal
  from public.user_calendar_settings
  where user_id=v_interview.interviewer_id and active=true;
  if not found then return; end if;

  select coalesce(config_value,'{}'::jsonb) into v_settings
  from public.system_configuration where config_key='meeting_settings';
  select coalesce(config_value,'{}'::jsonb) into v_public
  from public.system_configuration where config_key='public_booking_settings';

  v_timezone:=coalesce(nullif(v_cal.timezone,''),nullif(v_meeting.timezone,''),'UTC');
  if not exists(select 1 from pg_timezone_names where name=v_timezone) then v_timezone:='UTC'; end if;

  v_duration:=greatest(1,round(extract(epoch from(v_meeting.end_at-v_meeting.start_at))/60.0)::integer);
  v_interval:=least(greatest(coalesce((v_public->>'slotIntervalMinutes')::integer,15),5),120);
  v_min_notice:=greatest(coalesce((v_settings->>'minimumBookingNoticeMinutes')::integer,0),0);
  v_start_date:=(v_original_start at time zone v_timezone)::date;
  v_end_date:=(v_deadline at time zone v_timezone)::date;

  return query
  with dates as (
    select gs::date d
    from generate_series(v_start_date::timestamp,v_end_date::timestamp,interval '1 day') gs
    where extract(dow from gs)::integer=any(v_cal.working_days)
  ), slots as (
    select
      ((d.d+v_cal.work_start)+(n*make_interval(mins=>v_interval))) at time zone v_timezone slot_start,
      (((d.d+v_cal.work_start)+(n*make_interval(mins=>v_interval))) at time zone v_timezone)+make_interval(mins=>v_duration) slot_end
    from dates d
    cross join lateral generate_series(
      0,
      floor(greatest(extract(epoch from ((d.d+v_cal.work_end)-(d.d+v_cal.work_start)-make_interval(mins=>v_duration)))/60.0,-1)/v_interval)::integer
    ) n
  )
  select s.slot_start,s.slot_end,v_timezone,v_duration,v_deadline
  from slots s
  where s.slot_start>v_original_start
    and s.slot_start<=v_deadline
    and s.slot_start>=now()+make_interval(mins=>v_min_notice)
    and not exists(
      select 1 from public.booking_availability_blocks b
      where b.user_id=v_interview.interviewer_id and b.start_at<s.slot_end and b.end_at>s.slot_start
    )
    and not exists(
      select 1 from public.sales_meetings m
      where m.salesperson_id=v_interview.interviewer_id
        and m.id<>v_meeting.id
        and m.status in('Scheduled','Rescheduled')
        and m.start_at<s.slot_end+make_interval(mins=>greatest(coalesce(v_cal.buffer_after_minutes,0),0))
        and m.end_at>s.slot_start-make_interval(mins=>greatest(coalesce(v_cal.buffer_before_minutes,0),0))
    )
    and not public.service_has_effective_calendar_conflict(
      v_interview.interviewer_id,s.slot_start,s.slot_end,v_meeting.id
    )
  order by s.slot_start
  limit 48;
end;
$$;

revoke all on function public.public_get_recruitment_interview_reschedule_slots(text)
  from public,anon,authenticated;
grant execute on function public.public_get_recruitment_interview_reschedule_slots(text)
  to anon,authenticated,service_role;

create or replace function public.public_reschedule_recruitment_interview(p_token text,p_start_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_token public.recruitment_interview_join_tokens%rowtype;
  v_interview public.recruitment_interviews%rowtype;
  v_meeting public.sales_meetings%rowtype;
  v_app public.applicants%rowtype;
  v_slot record;
  v_original_start timestamptz;
  v_original_end timestamptz;
  v_deadline timestamptz;
begin
  if p_start_at is null then raise exception 'Choose an available interview time.'; end if;
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then
    raise exception 'This interview link is invalid or no longer active.';
  end if;

  select * into v_token
  from public.recruitment_interview_join_tokens
  where token_hash=public.recruitment_task_token_hash(p_token)
    and revoked_at is null
    and expires_at>now()
  for update;
  if not found then raise exception 'This interview link is invalid or no longer active.'; end if;

  select * into v_interview
  from public.recruitment_interviews
  where id=v_token.interview_id
  for update;
  if not found then raise exception 'Recruitment interview not found.'; end if;

  select * into v_meeting
  from public.sales_meetings
  where id=v_interview.meeting_id
  for update;
  if not found or v_meeting.status not in('Scheduled','Rescheduled') then
    raise exception 'This interview can no longer be rescheduled.';
  end if;

  select * into v_app from public.applicants where id=v_interview.applicant_id;
  if not found or v_app.closed_at is not null or v_app.stage<>v_interview.stage then
    raise exception 'This interview can no longer be rescheduled.';
  end if;

  if exists(select 1 from public.recruitment_interview_candidate_reschedules r where r.interview_id=v_interview.id) then
    raise exception 'You have already used the one-time interview reschedule.';
  end if;

  v_original_start:=v_meeting.start_at;
  v_original_end:=v_meeting.end_at;
  v_deadline:=v_original_start+interval '1 day';
  if now()>=v_deadline then
    raise exception 'The one-day interview reschedule window has closed.';
  end if;

  select s.start_at,s.end_at,s.timezone,s.duration_minutes
  into v_slot
  from public.public_get_recruitment_interview_reschedule_slots(p_token) s
  where s.start_at=p_start_at
  limit 1;

  if v_slot.start_at is null then
    raise exception 'That interview time is no longer available. Choose another available time within the one-day limit.';
  end if;

  insert into public.recruitment_interview_candidate_reschedules(
    interview_id,token_id,original_start_at,original_end_at,new_start_at,new_end_at
  )
  values(v_interview.id,v_token.id,v_original_start,v_original_end,v_slot.start_at,v_slot.end_at);

  update public.recruitment_interview_join_tokens
  set revoked_at=now()
  where interview_id=v_interview.id and revoked_at is null;

  update public.sales_meetings
  set start_at=v_slot.start_at,
      end_at=v_slot.end_at,
      timezone=v_slot.timezone,
      status='Scheduled',
      meeting_url='',
      rescheduled_at=now(),
      updated_at=now()
  where id=v_meeting.id;

  update public.recruitment_interviews set updated_at=now() where id=v_interview.id;

  insert into public.applicant_events(
    applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata
  )
  values(
    v_app.id,'Recruitment','Interview Rescheduled by Candidate',
    v_interview.stage||' interview rescheduled by candidate',
    'Candidate used the one-time self-service option. The existing Zoho meeting and calendar event will be updated; no duplicate interview was created.',
    'Candidate','recruitment_interviews',v_interview.id,
    jsonb_build_object(
      'meetingId',v_meeting.id,
      'originalStartAt',v_original_start,
      'newStartAt',v_slot.start_at,
      'newEndAt',v_slot.end_at,
      'rescheduleDeadline',v_deadline,
      'limitHours',24
    )
  );

  return jsonb_build_object(
    'success',true,
    'interviewId',v_interview.id,
    'meetingId',v_meeting.id,
    'startAt',v_slot.start_at,
    'endAt',v_slot.end_at,
    'timezone',v_slot.timezone,
    'candidateRescheduled',true,
    'emailPending',true,
    'message','Your interview has been rescheduled. A fresh interview email will be sent after the Zoho Meeting link is refreshed.'
  );
end;
$$;

revoke all on function public.public_reschedule_recruitment_interview(text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.public_reschedule_recruitment_interview(text,timestamptz)
  to anon,authenticated,service_role;

create or replace function public.admin_book_recruitment_interview(p_applicant_id uuid,p_start_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_app public.applicants%rowtype; v_policy public.recruitment_stage_policies%rowtype;
  v_context jsonb; v_start timestamptz; v_end timestamptz; v_timezone text;
  v_duration integer; v_provider_label text; v_meeting uuid; v_interview uuid; v_rescheduling boolean:=false;
begin
  if p_start_at is null then raise exception 'Choose an available interview time.'; end if;
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then raise exception 'Recruitment management access required.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id for update;
  if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(btrim(v_app.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot receive interviews.'; end if;

  select * into v_policy from public.recruitment_stage_policies
  where job_id=v_app.career_job_id and stage=v_app.stage and active=true;
  if not found or v_policy.interview_required is not true then raise exception 'The current stage is not configured to require a recruitment interview.'; end if;
  if exists(select 1 from public.recruitment_interview_skips where applicant_id=v_app.id and stage=v_app.stage) then raise exception 'This interview requirement was skipped by an Administrator.'; end if;

  select ri.id,m.id into v_interview,v_meeting
  from public.recruitment_interviews ri join public.sales_meetings m on m.id=ri.meeting_id
  where ri.applicant_id=v_app.id
    and ri.stage=v_app.stage
    and (m.status='Rescheduled' or (m.status='Scheduled' and m.end_at<=now()))
  order by m.updated_at desc,m.start_at desc
  limit 1;
  v_rescheduling:=v_meeting is not null;

  if not v_rescheduling and exists(
    select 1 from public.recruitment_interviews ri join public.sales_meetings m on m.id=ri.meeting_id
    where ri.applicant_id=v_app.id and ri.stage=v_app.stage and m.status='Scheduled'
  ) then
    raise exception 'An active interview is already scheduled for this stage. Update or reschedule that interview instead of creating a duplicate.';
  end if;

  v_context:=public.admin_get_recruitment_interview_booking_context(v_app.id);
  if coalesce((v_context->>'calendarReady')::boolean,false) is not true then raise exception '%',coalesce(v_context->>'setupMessage','Meeting setup is required.'); end if;
  v_timezone:=coalesce(v_context->>'timezone','UTC');
  v_duration:=coalesce((v_context->>'durationMinutes')::integer,30);
  v_provider_label:=coalesce(v_context->>'providerLabel','Zoho Meeting');

  select s.start_at,s.end_at into v_start,v_end
  from public.admin_get_recruitment_interview_slots(v_app.id,(p_start_at at time zone v_timezone)::date,1) s
  where s.start_at=p_start_at limit 1;
  if v_start is null then raise exception 'That interview time is no longer available. Choose another available slot.'; end if;

  if v_rescheduling then
    update public.recruitment_interview_join_tokens
    set revoked_at=now()
    where interview_id=v_interview and revoked_at is null;

    update public.sales_meetings
    set start_at=v_start,end_at=v_end,timezone=v_timezone,status='Scheduled',meeting_url='',rescheduled_at=now(),updated_at=now()
    where id=v_meeting;
    update public.recruitment_interviews set updated_at=now() where id=v_interview;
    perform public.log_applicant_event(
      v_app.id,'interview','interview_rescheduled',v_app.stage||' interview rescheduled',
      'New time booked from protected staff availability. The existing calendar event and '||v_provider_label||' link are being refreshed automatically.',
      'Rescheduled','Scheduled',case when public.is_admin() then 'admin' else 'content_manager' end,auth.uid(),
      'recruitment_interviews',v_interview,
      jsonb_build_object('meetingId',v_meeting,'interviewerId',auth.uid(),'startAt',v_start,'endAt',v_end,'timezone',v_timezone,'durationMinutes',v_duration,'provider',v_provider_label)
    );
    return jsonb_build_object('success',true,'id',v_interview,'meetingId',v_meeting,'stage',v_app.stage,'status','Scheduled','startAt',v_start,'endAt',v_end,'timezone',v_timezone,'durationMinutes',v_duration,'provider',v_provider_label,'rescheduled',true,'notificationState','waiting_for_meeting_link');
  end if;

  insert into public.sales_meetings(
    request_key,salesperson_id,meeting_type,title,description,start_at,end_at,timezone,provider,meeting_url,attendee_name,attendee_email,status,created_by
  )
  values(
    gen_random_uuid(),auth.uid(),'Recruitment Interview','Recruitment: '||v_app.full_name||' - '||v_app.stage,
    'ProFox recruitment interview for application '||coalesce(v_app.application_reference,v_app.id::text),
    v_start,v_end,v_timezone,'Manual','',v_app.full_name,lower(btrim(v_app.email)),'Scheduled',auth.uid()
  )
  returning id into v_meeting;

  insert into public.recruitment_interviews(applicant_id,stage,meeting_id,interviewer_id,interview_type,created_by)
  values(v_app.id,v_app.stage,v_meeting,auth.uid(),'Recruitment Interview',auth.uid())
  returning id into v_interview;

  perform public.log_applicant_event(
    v_app.id,'interview','interview_booked',v_app.stage||' interview booked',
    'Interview booked from protected staff availability. '||v_provider_label||' creation and candidate notification are automatic.',
    null,'Scheduled',case when public.is_admin() then 'admin' else 'content_manager' end,auth.uid(),
    'recruitment_interviews',v_interview,
    jsonb_build_object('meetingId',v_meeting,'interviewerId',auth.uid(),'startAt',v_start,'endAt',v_end,'timezone',v_timezone,'durationMinutes',v_duration,'provider',v_provider_label)
  );

  return jsonb_build_object('success',true,'id',v_interview,'meetingId',v_meeting,'stage',v_app.stage,'status','Scheduled','startAt',v_start,'endAt',v_end,'timezone',v_timezone,'durationMinutes',v_duration,'provider',v_provider_label,'rescheduled',false,'notificationState','waiting_for_meeting_link');
end;
$$;

create or replace function public.queue_recruitment_interview_confirmation_on_meeting_link()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_ri public.recruitment_interviews%rowtype;
  v_app public.applicants%rowtype;
  v_interviewer text;
  v_local text;
  v_candidate_local text;
  v_candidate_timezone text;
  v_duration integer;
  v_template_key text;
  v_schedule_key text;
begin
  if new.status not in('Scheduled','Rescheduled') or coalesce(btrim(new.meeting_url),'')='' then return new; end if;
  if new.meeting_url is not distinct from old.meeting_url then return new; end if;

  select * into v_ri from public.recruitment_interviews where meeting_id=new.id;
  if not found then return new; end if;
  select * into v_app from public.applicants where id=v_ri.applicant_id;
  if not found then return new; end if;
  select full_name into v_interviewer from public.user_profiles where id=v_ri.interviewer_id;

  v_template_key:=case
    when public.career_job_system_role(v_app.career_job_id)='sales'
      then 'recruitment_sales_interview_scheduled'
    else 'recruitment_interview_scheduled'
  end;

  v_duration:=greatest(1,round(extract(epoch from (new.end_at-new.start_at))/60.0)::integer);
  v_local:=to_char(new.start_at at time zone new.timezone,'FMDay, FMMonth DD, YYYY at HH12:MI AM');
  v_candidate_timezone:=case when exists(select 1 from pg_timezone_names where name=v_app.timezone) then v_app.timezone else new.timezone end;
  v_candidate_local:=to_char(new.start_at at time zone v_candidate_timezone,'FMDay, FMMonth DD, YYYY at HH12:MI AM');
  v_schedule_key:=to_char(new.start_at at time zone 'UTC','YYYYMMDDHH24MISS');

  perform public.enqueue_notification(
    'recruitment:'||v_app.id::text||':interview:'||v_ri.id::text||':schedule:'||v_schedule_key,
    v_template_key,
    lower(btrim(v_app.email)),
    null,
    public.recruitment_notification_payload(v_app)||jsonb_build_object(
      'interviewId',v_ri.id,
      'interviewStage',v_ri.stage,
      'interviewDateTime',v_local,
      'interviewTimezone',new.timezone,
      'candidateDateTime',v_candidate_local,
      'candidateTimezone',v_candidate_timezone,
      'interviewerName',coalesce(v_interviewer,'ProFox Recruitment Team'),
      'interviewDuration',v_duration||' minutes'
    ),
    now()
  );

  return new;
end;
$$;

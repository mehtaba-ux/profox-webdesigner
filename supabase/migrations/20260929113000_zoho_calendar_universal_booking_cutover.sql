-- Make Zoho Calendar and Zoho Meeting the canonical external booking provider.
-- Existing provider-linked meetings stay locked to their original external event.
-- New and unlinked meetings follow the effective Zoho company provider.

update public.system_configuration
set config_value =
  coalesce(config_value,'{}'::jsonb)
  || jsonb_build_object(
    'zohoEnabled', true,
    'zohoCalendarEnabled', true,
    'zohoMeetingEnabled', true,
    'defaultCalendarProvider', 'zoho',
    'defaultMeetingProvider', 'zoho_meeting',
    'calendarProviderGeneration',
      case
        when coalesce(config_value->>'defaultCalendarProvider','')='zoho'
          then greatest(coalesce((config_value->>'calendarProviderGeneration')::integer,1),1)
        else greatest(coalesce((config_value->>'calendarProviderGeneration')::integer,1),1)+1
      end
  ),
    updated_at=now()
where config_key='professional_integrations';

update public.staff_professional_accounts
set calendar_provider='zoho',
    meeting_provider='zoho_meeting',
    calendar_provider_generation=case
      when calendar_provider='zoho' and meeting_provider='zoho_meeting'
        then calendar_provider_generation
      else calendar_provider_generation+1
    end,
    updated_at=now()
where calendar_provider is distinct from 'zoho'
   or meeting_provider is distinct from 'zoho_meeting';

create or replace function public.service_calendar_provider_status(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg jsonb:='{}'::jsonb;
  v_calendar_provider text;
  v_meeting_provider text;
  v_ready boolean:=false;
  v_status text:='disconnected';
  v_last_error text:='';
  v_label text:='Zoho Meeting';
  v_setup_kind text:='zoho_connection';
  v_setup_title text:='Zoho Calendar connection required';
  v_setup_message text:='Connect Zoho Calendar and Zoho Meeting before booking meetings.';
  v_setup_action_label text:='Open Zoho Calendar';
  v_setup_url text:='/admin/calendar?section=zoho';
  v_zoho public.zoho_connections%rowtype;
  v_central public.zoho_service_calendar_connection%rowtype;
  v_google public.google_calendar_connections%rowtype;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'calendarProvider','zoho',
      'meetingProvider','zoho_meeting',
      'providerLabel','Zoho Meeting',
      'ready',false,
      'status','disconnected',
      'lastError','Meeting owner is required.',
      'setupKind','availability',
      'setupTitle','Meeting owner required',
      'setupMessage','Assign a responsible meeting owner before booking.',
      'setupActionLabel','Open Booking Setup',
      'setupUrl','/admin/booking-setup'
    );
  end if;

  select coalesce(config_value,'{}'::jsonb)
  into v_cfg
  from public.system_configuration
  where config_key='professional_integrations';

  v_calendar_provider:=public.service_effective_calendar_provider(p_user_id);
  v_meeting_provider:=public.service_effective_meeting_provider(p_user_id);

  if v_calendar_provider='zoho' then
    v_label:='Zoho Meeting';
    v_setup_kind:='zoho_connection';
    v_setup_title:='Zoho Calendar connection required';
    v_setup_message:='Connect the configured Zoho Calendar and Zoho Meeting service before booking meetings.';
    v_setup_action_label:='Open Zoho Calendar';
    v_setup_url:='/admin/calendar?section=zoho';

    if public.service_central_zoho_managed() then
      select * into v_central
      from public.zoho_service_calendar_connection
      where singleton_key='primary';

      v_status:=coalesce(v_central.status,'disconnected');
      v_last_error:=coalesce(v_central.last_error,'');
      v_ready:=
        public.service_central_zoho_ready()
        and v_meeting_provider='zoho_meeting'
        and coalesce((v_cfg->>'zohoCalendarEnabled')::boolean,false)
        and coalesce((v_cfg->>'zohoMeetingEnabled')::boolean,false);
    else
      select * into v_zoho
      from public.zoho_connections
      where user_id=p_user_id;

      v_status:=coalesce(v_zoho.status,'disconnected');
      v_last_error:=coalesce(v_zoho.last_error,'');
      v_ready:=
        v_zoho.user_id is not null
        and v_zoho.status='connected'
        and v_zoho.meeting_ready is true
        and v_zoho.refresh_secret_id is not null
        and nullif(v_zoho.calendar_id,'') is not null
        and v_meeting_provider='zoho_meeting'
        and coalesce((v_cfg->>'zohoCalendarEnabled')::boolean,false)
        and coalesce((v_cfg->>'zohoMeetingEnabled')::boolean,false);
    end if;

    if not v_ready and v_status in('error','reconnect_required') then
      v_setup_title:='Zoho Calendar needs attention';
      v_setup_message:=case
        when nullif(v_last_error,'') is not null
          then 'Reconnect or repair the Zoho Calendar/Meeting service before booking. '||v_last_error
        else 'Reconnect or repair the Zoho Calendar/Meeting service before booking.'
      end;
      v_setup_action_label:='Repair Zoho Connection';
    end if;
  elsif v_calendar_provider='google' then
    v_label:='Google Meet';
    v_setup_kind:='google_connection';
    v_setup_title:='Google Calendar connection required';
    v_setup_message:='Connect Google Calendar and enable Google Meet creation before booking meetings.';
    v_setup_action_label:='Open Google Calendar';
    v_setup_url:='/admin/calendar?section=google';

    select * into v_google
    from public.google_calendar_connections
    where user_id=p_user_id;

    v_status:=coalesce(v_google.status,'disconnected');
    v_last_error:=coalesce(v_google.last_error,'');
    v_ready:=
      v_google.user_id is not null
      and v_google.status='connected'
      and v_google.sync_enabled is true
      and v_google.create_meet is true
      and v_meeting_provider='google_meet';
  else
    v_label:='Meeting provider';
    v_setup_kind:='company_settings';
    v_setup_title:='External calendar provider required';
    v_setup_message:='Choose and configure the company calendar and meeting provider before booking.';
    v_setup_action_label:='Open Meeting Settings';
    v_setup_url:='/admin/meeting-settings';
    v_status:='disconnected';
    v_ready:=false;
  end if;

  return jsonb_build_object(
    'calendarProvider',v_calendar_provider,
    'meetingProvider',v_meeting_provider,
    'providerLabel',v_label,
    'ready',v_ready,
    'status',v_status,
    'lastError',v_last_error,
    'setupKind',v_setup_kind,
    'setupTitle',v_setup_title,
    'setupMessage',v_setup_message,
    'setupActionLabel',v_setup_action_label,
    'setupUrl',v_setup_url
  );
end;
$$;

revoke all on function public.service_calendar_provider_status(uuid) from public,anon,authenticated;

create or replace function public.service_has_effective_calendar_conflict(
  p_user_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_ignore_meeting_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_provider text;
begin
  if p_user_id is null or p_start_at is null or p_end_at is null or p_end_at<=p_start_at then return true; end if;
  v_provider:=public.service_effective_calendar_provider(p_user_id);
  if v_provider='zoho' then
    return public.has_zoho_calendar_conflict(p_user_id,p_start_at,p_end_at,p_ignore_meeting_id);
  elsif v_provider='google' then
    return public.has_google_calendar_conflict(p_user_id,p_start_at,p_end_at,p_ignore_meeting_id);
  end if;
  return false;
end;
$$;

revoke all on function public.service_has_effective_calendar_conflict(uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;

create or replace function public.service_meeting_external_provider(p_meeting_id uuid)
returns text
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_owner uuid; v_provider text;
begin
  select salesperson_id into v_owner from public.sales_meetings where id=p_meeting_id;
  if not found then return null; end if;
  if exists(select 1 from public.google_calendar_event_links where meeting_id=p_meeting_id) then return 'google'; end if;
  if exists(select 1 from public.zoho_calendar_event_links where meeting_id=p_meeting_id) then return 'zoho'; end if;
  v_provider:=public.service_effective_calendar_provider(v_owner);
  return case when v_provider in('google','zoho') then v_provider else null end;
end;
$$;

create or replace function public.get_public_booking_slots(
  p_salesperson_id uuid,p_from_date date default null,p_days integer default 14
)
returns table(start_at timestamptz,end_at timestamptz,timezone text,duration_minutes integer)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select s.start_at,s.end_at,s.timezone,s.duration_minutes
  from public.get_public_booking_slots_native_base(p_salesperson_id,p_from_date,p_days) s
  where coalesce((public.service_calendar_provider_status(p_salesperson_id)->>'ready')::boolean,false)
    and not public.service_has_effective_calendar_conflict(p_salesperson_id,s.start_at,s.end_at,null)
  order by s.start_at;
$$;

create or replace function public.is_public_reschedule_slot_available(
  p_salesperson_id uuid,p_start_at timestamptz,p_duration_minutes integer,p_ignore_meeting_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select public.is_public_reschedule_slot_available_native_base(
      p_salesperson_id,p_start_at,p_duration_minutes,p_ignore_meeting_id
    )
    and coalesce((public.service_calendar_provider_status(p_salesperson_id)->>'ready')::boolean,false)
    and not public.service_has_effective_calendar_conflict(
      p_salesperson_id,p_start_at,p_start_at+make_interval(mins=>p_duration_minutes),p_ignore_meeting_id
    );
$$;

create or replace function public.guard_google_busy_sales_meeting()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.status not in('Scheduled','Rescheduled') then return new; end if;
  if tg_op='UPDATE' and new.start_at=old.start_at and new.end_at=old.end_at and new.salesperson_id=old.salesperson_id then return new; end if;
  if public.service_has_effective_calendar_conflict(
    new.salesperson_id,new.start_at,new.end_at,case when tg_op='UPDATE' then old.id else null end
  ) then
    raise exception 'This time conflicts with the active external calendar.' using errcode='P0001';
  end if;
  return new;
end;
$$;

create or replace function public.admin_get_recruitment_interview_booking_context(p_applicant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_policy public.recruitment_stage_policies%rowtype;
  v_user public.user_profiles%rowtype;
  v_cal public.user_calendar_settings%rowtype;
  v_skip public.recruitment_interview_skips%rowtype;
  v_settings jsonb:='{}'::jsonb;
  v_provider jsonb:='{}'::jsonb;
  v_duration integer:=30;
  v_timezone text:='UTC';
  v_calendar_ready boolean:=false;
  v_setup_message text:='';
  v_setup_title text:='';
  v_setup_action_label text:='';
  v_setup_kind text:='';
  v_setup_url text:='';
  v_interview_required boolean:=false;
  v_completed boolean:=false;
begin
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then raise exception 'Recruitment management access required.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id;
  if not found then raise exception 'Candidate not found.'; end if;
  select * into v_user from public.user_profiles where id=auth.uid() and status='active';
  if not found then raise exception 'Active staff profile required.'; end if;

  select * into v_policy from public.recruitment_stage_policies
  where job_id=v_app.career_job_id and stage=v_app.stage and active=true;
  v_interview_required:=found and v_policy.interview_required;

  select coalesce(config_value,'{}'::jsonb) into v_settings
  from public.system_configuration where config_key='meeting_settings';

  select * into v_cal from public.user_calendar_settings where user_id=v_user.id;
  if found then
    v_timezone:=coalesce(nullif(v_cal.timezone,''),nullif(v_user.timezone,''),nullif(v_settings->>'defaultTimezone',''),'UTC');
    v_duration:=coalesce(v_cal.default_duration_minutes,(v_settings->>'defaultDurationMinutes')::integer,30);
  else
    v_timezone:=coalesce(nullif(v_user.timezone,''),nullif(v_settings->>'defaultTimezone',''),'UTC');
    v_duration:=coalesce((v_settings->>'defaultDurationMinutes')::integer,30);
  end if;

  if not exists(select 1 from pg_timezone_names where name=v_timezone) then v_timezone:='UTC'; end if;
  if not exists(
    select 1 from jsonb_array_elements_text(coalesce(v_settings->'allowedDurations','[15,30,45,60]'::jsonb)) x
    where x::integer=v_duration
  ) then
    v_duration:=coalesce((v_settings->>'defaultDurationMinutes')::integer,30);
  end if;

  v_provider:=public.service_calendar_provider_status(v_user.id);
  select * into v_skip from public.recruitment_interview_skips where applicant_id=v_app.id and stage=v_app.stage;
  v_completed:=exists(
    select 1 from public.recruitment_interviews ri
    join public.sales_meetings m on m.id=ri.meeting_id
    where ri.applicant_id=v_app.id and ri.stage=v_app.stage and m.status='Completed'
  );

  v_calendar_ready:=coalesce((v_settings->>'active')::boolean,true)
    and v_cal.user_id is not null and v_cal.active is true
    and coalesce((v_provider->>'ready')::boolean,false);

  if not coalesce((v_settings->>'active')::boolean,true) then
    v_setup_kind:='company_settings';
    v_setup_title:='Meeting scheduling is disabled';
    v_setup_message:='Enable company meeting scheduling before booking candidate interviews.';
    v_setup_action_label:='Open Meeting Settings';
    v_setup_url:='/admin/meeting-settings?source=recruitment';
  elsif v_cal.user_id is null or v_cal.active is not true then
    v_setup_kind:='availability';
    v_setup_title:='Meeting availability required';
    v_setup_message:='Set your working days, hours, time zone and interview availability before booking candidate interviews.';
    v_setup_action_label:='Set Up Availability';
    v_setup_url:=format('/admin/booking-setup?userId=%s&source=recruitment',v_user.id);
  elsif coalesce((v_provider->>'ready')::boolean,false) is not true then
    v_setup_kind:=coalesce(v_provider->>'setupKind','zoho_connection');
    v_setup_title:=coalesce(v_provider->>'setupTitle','Zoho Calendar connection required');
    v_setup_message:=coalesce(v_provider->>'setupMessage','Connect Zoho Calendar and Zoho Meeting before booking candidate interviews.');
    v_setup_action_label:=coalesce(v_provider->>'setupActionLabel','Open Zoho Calendar');
    v_setup_url:=coalesce(v_provider->>'setupUrl','/admin/calendar?section=zoho')||'&source=recruitment';
  end if;

  return jsonb_build_object(
    'interviewRequired',v_interview_required,
    'interviewerId',v_user.id,
    'interviewerName',v_user.full_name,
    'timezone',v_timezone,
    'durationMinutes',v_duration,
    'meetingType','Recruitment Interview',
    'providerLabel',coalesce(v_provider->>'providerLabel','Zoho Meeting'),
    'calendarProvider',coalesce(v_provider->>'calendarProvider','zoho'),
    'meetingProvider',coalesce(v_provider->>'meetingProvider','zoho_meeting'),
    'calendarReady',v_calendar_ready,
    'setupRequired',not v_calendar_ready,
    'setupKind',v_setup_kind,
    'setupTitle',v_setup_title,
    'setupMessage',v_setup_message,
    'setupActionLabel',v_setup_action_label,
    'setupUrl',v_setup_url,
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
  p_applicant_id uuid,p_from_date date default null,p_days integer default 14
)
returns table(start_at timestamptz,end_at timestamptz,timezone text,duration_minutes integer)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_context jsonb; v_user uuid:=auth.uid(); v_cal public.user_calendar_settings%rowtype;
  v_settings jsonb:='{}'::jsonb; v_public jsonb:='{}'::jsonb; v_timezone text;
  v_duration integer; v_interval integer; v_max_advance integer; v_min_notice integer;
  v_days integer; v_today date; v_start_date date; v_end_date date;
begin
  v_context:=public.admin_get_recruitment_interview_booking_context(p_applicant_id);
  if coalesce((v_context->>'interviewRequired')::boolean,false) is not true then raise exception 'The current stage does not require a recruitment interview.'; end if;
  if coalesce((v_context->>'calendarReady')::boolean,false) is not true then raise exception '%',coalesce(v_context->>'setupMessage','Meeting setup is required.'); end if;
  if coalesce((v_context->>'interviewSkipped')::boolean,false) is true then raise exception 'This interview requirement has already been skipped by an Administrator.'; end if;

  select * into v_cal from public.user_calendar_settings where user_id=v_user and active=true;
  if not found then raise exception 'Meeting availability is not configured.'; end if;
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
    cross join lateral generate_series(
      0,
      floor(greatest(extract(epoch from ((d.d+v_cal.work_end)-(d.d+v_cal.work_start)-make_interval(mins=>v_duration)))/60.0,-1)/v_interval)::integer
    ) n
  )
  select s.slot_start,s.slot_end,v_timezone,v_duration
  from slots s
  where s.slot_start>=now()+make_interval(mins=>v_min_notice)
    and not exists(select 1 from public.booking_availability_blocks b where b.user_id=v_user and b.start_at<s.slot_end and b.end_at>s.slot_start)
    and not exists(select 1 from public.sales_meetings m where m.salesperson_id=v_user and m.status in('Scheduled','Rescheduled') and m.start_at<s.slot_end+make_interval(mins=>greatest(coalesce(v_cal.buffer_after_minutes,0),0)) and m.end_at>s.slot_start-make_interval(mins=>greatest(coalesce(v_cal.buffer_before_minutes,0),0)))
    and not public.service_has_effective_calendar_conflict(v_user,s.slot_start,s.slot_end,null)
  order by s.slot_start
  limit 300;
end;
$$;

create or replace function public.admin_book_recruitment_interview(
  p_applicant_id uuid,p_start_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
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
  where ri.applicant_id=v_app.id and ri.stage=v_app.stage and m.status='Rescheduled'
  order by m.updated_at desc limit 1;
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

create or replace function public.service_upsert_zoho_event_link(
  p_meeting_id uuid,p_user_id uuid,p_calendar_id text,p_event_id text,p_etag text,p_meeting_url text,p_operation text
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not exists(select 1 from public.sales_meetings where id=p_meeting_id and salesperson_id=p_user_id) then
    raise exception 'Meeting does not belong to this Zoho service.';
  end if;
  if exists(select 1 from public.google_calendar_event_links where meeting_id=p_meeting_id) then
    raise exception 'Meeting is already locked to Google. Duplicate external calendar events are not allowed.';
  end if;

  insert into public.zoho_calendar_event_links(
    meeting_id,user_id,calendar_id,external_event_id,etag,meeting_url,last_operation,last_synced_at,updated_at
  )
  values(
    p_meeting_id,p_user_id,coalesce(nullif(p_calendar_id,''),'primary'),p_event_id,coalesce(p_etag,''),
    coalesce(p_meeting_url,''),p_operation,now(),now()
  )
  on conflict(meeting_id) do update set
    calendar_id=excluded.calendar_id,
    external_event_id=excluded.external_event_id,
    etag=excluded.etag,
    meeting_url=excluded.meeting_url,
    last_operation=excluded.last_operation,
    last_synced_at=now(),
    updated_at=now();

  update public.sales_meetings
  set external_calendar_id=coalesce(nullif(p_calendar_id,''),'primary'),
      external_event_id=p_event_id,
      provider='Zoho Calendar',
      meeting_url=case when trim(coalesce(p_meeting_url,''))<>'' then p_meeting_url else meeting_url end,
      sync_status='Synced',
      sync_error=null,
      updated_at=now()
  where id=p_meeting_id and salesperson_id=p_user_id;

  update public.crm_opportunities o
  set meeting_url=m.meeting_url,updated_at=now()
  from public.sales_meetings m
  where m.id=p_meeting_id and o.id=m.opportunity_id and trim(coalesce(m.meeting_url,''))<>'';
end;
$$;

update public.google_calendar_sync_jobs
set status='skipped',
    last_error='Skipped because Zoho Calendar is the active company meeting provider.',
    locked_at=null,
    completed_at=now(),
    updated_at=now()
where status in('pending','retry','processing')
  and public.service_effective_calendar_provider(user_id)<>'google';

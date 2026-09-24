create or replace function public.admin_get_recruitment_interview_booking_context(p_applicant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  v_setup_title text := '';
  v_setup_action_label text := '';
  v_setup_kind text := '';
  v_setup_url text := '';
  v_interview_required boolean := false;
  v_completed boolean := false;
begin
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then
    raise exception 'Recruitment management access required.';
  end if;

  select * into v_app from public.applicants where id=p_applicant_id;
  if not found then raise exception 'Candidate not found.'; end if;

  select * into v_user from public.user_profiles where id=auth.uid() and status='active';
  if not found then raise exception 'Active staff profile required.'; end if;

  select * into v_policy
  from public.recruitment_stage_policies
  where job_id=v_app.career_job_id and stage=v_app.stage and active=true;
  v_interview_required := found and v_policy.interview_required;

  select coalesce(config_value,'{}'::jsonb)
  into v_settings
  from public.system_configuration
  where config_key='meeting_settings';
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
  if not exists(
    select 1
    from jsonb_array_elements_text(coalesce(v_settings->'allowedDurations','[15,30,45,60]'::jsonb)) x
    where x::integer=v_duration
  ) then
    v_duration:=coalesce((v_settings->>'defaultDurationMinutes')::integer,30);
  end if;

  select * into v_conn from public.google_calendar_connections where user_id=v_user.id;
  select * into v_skip from public.recruitment_interview_skips where applicant_id=v_app.id and stage=v_app.stage;

  v_completed:=exists(
    select 1
    from public.recruitment_interviews ri
    join public.sales_meetings m on m.id=ri.meeting_id
    where ri.applicant_id=v_app.id and ri.stage=v_app.stage and m.status='Completed'
  );

  v_calendar_ready:=coalesce((v_settings->>'active')::boolean,true)
    and v_cal.user_id is not null and v_cal.active is true
    and v_conn.user_id is not null and v_conn.status='connected'
    and v_conn.sync_enabled is true and v_conn.create_meet is true;

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
  elsif v_conn.user_id is null or v_conn.status<>'connected' then
    v_setup_kind:='google_connection';
    v_setup_title:='Google Calendar connection required';
    v_setup_message:='Connect your Google Calendar before booking candidate interviews so ProFox can create the calendar event and Google Meet link.';
    v_setup_action_label:='Connect Google Calendar';
    v_setup_url:='/admin/calendar?section=google&source=recruitment';
  elsif v_conn.sync_enabled is not true then
    v_setup_kind:='google_sync';
    v_setup_title:='Google Calendar synchronization required';
    v_setup_message:='Enable Google Calendar synchronization before booking candidate interviews.';
    v_setup_action_label:='Enable Calendar Sync';
    v_setup_url:='/admin/calendar?section=google&source=recruitment';
  elsif v_conn.create_meet is not true then
    v_setup_kind:='google_meet';
    v_setup_title:='Google Meet creation required';
    v_setup_message:='Enable automatic Google Meet creation before booking candidate interviews.';
    v_setup_action_label:='Enable Google Meet';
    v_setup_url:='/admin/calendar?section=google&source=recruitment';
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
$function$;

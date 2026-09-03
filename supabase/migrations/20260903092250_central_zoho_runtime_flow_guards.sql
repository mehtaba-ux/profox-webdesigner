create or replace function public.get_my_meeting_launch_url(p_meeting_id uuid)
returns text
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_meeting public.sales_meetings%rowtype;
  v_url text;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_meeting
  from public.sales_meetings
  where id = p_meeting_id;
  if not found then
    raise exception 'Meeting not found.';
  end if;

  if not public.is_admin() and (v_meeting.salesperson_id <> v_user or not public.has_active_role(array['sales']::text[])) then
    raise exception 'Unauthorized meeting access.';
  end if;

  if v_meeting.status not in ('Scheduled','Rescheduled') then
    return null;
  end if;

  select p.host_url into v_url
  from public.meeting_provider_private_links p
  where p.meeting_id = p_meeting_id
    and p.provider = 'zoho_meeting';

  if nullif(trim(coalesce(v_url,'')), '') is not null then
    if v_url !~* '^https://' then
      raise exception 'Stored meeting host URL is invalid.';
    end if;
    return v_url;
  end if;

  select g.meet_url into v_url
  from public.google_calendar_event_links g
  where g.meeting_id = p_meeting_id;

  if nullif(trim(coalesce(v_url,'')), '') is not null then
    if v_url !~* '^https://' then
      raise exception 'Stored Google Meet URL is invalid.';
    end if;
    return v_url;
  end if;

  if not exists (
    select 1 from public.zoho_calendar_event_links z where z.meeting_id = p_meeting_id
  ) and nullif(trim(coalesce(v_meeting.meeting_url,'')), '') is not null then
    if v_meeting.meeting_url ~* '^https://' then
      return v_meeting.meeting_url;
    end if;
  end if;

  return null;
end;
$function$;

revoke all on function public.get_my_meeting_launch_url(uuid) from public, anon;
grant execute on function public.get_my_meeting_launch_url(uuid) to authenticated;

create or replace function public.guard_professional_integrations_central_zoho_default()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_verified boolean := false;
  v_default_calendar text;
  v_default_meeting text;
begin
  if new.config_key <> 'professional_integrations' then
    return new;
  end if;

  v_default_calendar := lower(coalesce(new.config_value->>'defaultCalendarProvider','google'));
  v_default_meeting := lower(coalesce(new.config_value->>'defaultMeetingProvider','google_meet'));

  if v_default_calendar <> 'zoho' and v_default_meeting <> 'zoho_meeting' then
    return new;
  end if;

  select exists(
    select 1
    from public.zoho_service_calendar_connection c
    where c.singleton_key = 'primary'
      and c.status = 'connected'
      and c.meeting_ready = true
      and nullif(trim(coalesce(c.calendar_id,'')), '') is not null
      and nullif(trim(coalesce(c.meeting_org_id,'')), '') is not null
      and nullif(trim(coalesce(c.presenter_zuid,'')), '') is not null
      and c.refresh_secret_id is not null
  ) into v_verified;

  if not v_verified then
    raise exception 'Zoho cannot be selected as the live Calendar/Meeting default until the central Admin Zoho connection is verified.';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_professional_integrations_central_zoho_default() from public, anon, authenticated;

drop trigger if exists professional_integrations_central_zoho_default_guard on public.system_configuration;
create trigger professional_integrations_central_zoho_default_guard
before insert or update of config_value on public.system_configuration
for each row
when (new.config_key = 'professional_integrations')
execute function public.guard_professional_integrations_central_zoho_default();

create or replace function public.reschedule_sales_meeting(
  p_meeting_id uuid,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_timezone text,
  p_meeting_url text default null::text
)
returns public.sales_meetings
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_meeting public.sales_meetings%rowtype;
  v_settings jsonb;
  v_duration_minutes integer;
  v_allowed_duration boolean;
  v_provider_managed boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_meeting from public.sales_meetings where id=p_meeting_id for update;
  if not found then raise exception 'Meeting not found.'; end if;
  if not public.is_admin() and (v_meeting.salesperson_id<>auth.uid() or not public.has_active_role(array['sales']::text[])) then
    raise exception 'Unauthorized meeting update.';
  end if;
  if p_end_at<=p_start_at then raise exception 'Meeting end must be after start.'; end if;
  if v_meeting.status in ('Completed','Cancelled','No Show') then raise exception 'This meeting can no longer be rescheduled.'; end if;

  select config_value into v_settings from public.system_configuration where config_key='meeting_settings';
  v_settings := coalesce(v_settings,'{}'::jsonb);
  v_duration_minutes := round(extract(epoch from (p_end_at-p_start_at))/60.0)::integer;
  select exists(
    select 1 from jsonb_array_elements_text(coalesce(v_settings->'allowedDurations','[15,30,45,60]'::jsonb)) x
    where x::integer=v_duration_minutes
  ) into v_allowed_duration;
  if not v_allowed_duration then raise exception 'Meeting duration is not allowed by Admin configuration.'; end if;

  if exists (
    select 1 from public.sales_meetings m
    where m.salesperson_id=v_meeting.salesperson_id and m.id<>v_meeting.id
      and m.status in ('Scheduled','Rescheduled') and m.start_at<p_end_at and m.end_at>p_start_at
  ) then raise exception 'This time conflicts with an existing meeting.'; end if;

  select exists(select 1 from public.google_calendar_event_links g where g.meeting_id=p_meeting_id)
      or exists(select 1 from public.zoho_calendar_event_links z where z.meeting_id=p_meeting_id)
      or exists(select 1 from public.meeting_provider_private_links p where p.meeting_id=p_meeting_id)
  into v_provider_managed;

  update public.sales_meetings
  set start_at=p_start_at,
      end_at=p_end_at,
      timezone=coalesce(nullif(trim(p_timezone),''),timezone),
      meeting_url=case when v_provider_managed then meeting_url else coalesce(p_meeting_url,meeting_url) end,
      status='Rescheduled',
      rescheduled_at=now(),
      sync_status='Not Connected',
      updated_at=now()
  where id=p_meeting_id returning * into v_meeting;

  if v_meeting.activity_id is not null then
    update public.crm_activities set due_at=p_start_at,status='Scheduled',updated_at=now() where id=v_meeting.activity_id;
  end if;
  if v_meeting.opportunity_id is not null then
    update public.crm_opportunities set meeting_at=p_start_at,meeting_url=v_meeting.meeting_url,updated_at=now() where id=v_meeting.opportunity_id;
  end if;
  return v_meeting;
end;
$function$;
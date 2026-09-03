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
  v_seller_allowed boolean := false;
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

  select exists(
    select 1 from public.user_profiles p
    where p.id = v_user
      and p.status = 'active'
      and p.role in ('sales','sales_rep','sales_team')
  ) into v_seller_allowed;

  if not public.is_admin() and (v_meeting.salesperson_id <> v_user or not v_seller_allowed) then
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
grant execute on function public.get_my_meeting_launch_url(uuid) to authenticated, service_role;

create or replace function public.get_my_meeting_launch_urls()
returns table(meeting_id uuid, launch_url text)
language plpgsql
stable
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_admin boolean := false;
  v_seller boolean := false;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  v_admin := public.is_admin();
  select exists(
    select 1 from public.user_profiles p
    where p.id = v_user
      and p.status = 'active'
      and p.role in ('sales','sales_rep','sales_team')
  ) into v_seller;

  if not v_admin and not v_seller then
    raise exception 'Meeting host access denied.';
  end if;

  return query
  select m.id,
         case
           when m.status not in ('Scheduled','Rescheduled') then null::text
           when nullif(trim(coalesce(priv.host_url,'')), '') is not null then priv.host_url
           when nullif(trim(coalesce(g.meet_url,'')), '') is not null then g.meet_url
           when z.meeting_id is null and m.meeting_url ~* '^https://' then m.meeting_url
           else null::text
         end as launch_url
  from public.sales_meetings m
  left join public.meeting_provider_private_links priv
    on priv.meeting_id = m.id and priv.provider = 'zoho_meeting'
  left join public.google_calendar_event_links g on g.meeting_id = m.id
  left join public.zoho_calendar_event_links z on z.meeting_id = m.id
  where v_admin or m.salesperson_id = v_user;
end;
$function$;

revoke all on function public.get_my_meeting_launch_urls() from public, anon;
grant execute on function public.get_my_meeting_launch_urls() to authenticated, service_role;

create or replace function public.get_zoho_service_calendar_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_role text := '';
  v_row public.zoho_service_calendar_connection%rowtype;
  v_cfg jsonb := '{}'::jsonb;
  v_provider jsonb := '{}'::jsonb;
  v_ready boolean := false;
  v_default_calendar text := 'google';
  v_default_meeting text := 'google_meet';
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select coalesce(p.role,'') into v_role
  from public.user_profiles p
  where p.id=v_user and p.status='active';
  if v_role not in ('admin','site_manager','project_manager','sales','sales_rep','sales_team') then
    raise exception 'Staff access required.';
  end if;

  if v_role <> 'admin' then
    return jsonb_build_object(
      'connected',false,'status','disconnected','accountEmail','','calendarId','','calendarTimezone','',
      'meetingReady',false,'lastAuthAt',null,'lastSuccessfulSyncAt',null,'lastError',null,
      'calendarEnabled',false,'meetingEnabled',false,
      'defaultCalendarProvider','google','defaultMeetingProvider','google_meet',
      'effectiveCalendarProvider','google','effectiveMeetingProvider','google_meet',
      'providerConfigured',false,'managedByProFox',true,'sellerAuthorizationRequired',false
    );
  end if;

  select * into v_row from public.zoho_service_calendar_connection where singleton_key='primary';
  select coalesce(config_value,'{}'::jsonb) into v_cfg
  from public.system_configuration where config_key='professional_integrations';
  begin
    v_provider := coalesce(public.admin_get_professional_integrations(),'{}'::jsonb);
  exception when others then
    v_provider := '{}'::jsonb;
  end;

  v_ready := public.service_central_zoho_ready();
  v_default_calendar := coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google');
  v_default_meeting := coalesce(nullif(v_cfg->>'defaultMeetingProvider',''),'google_meet');

  return jsonb_build_object(
    'connected',found and v_row.status='connected','status',coalesce(v_row.status,'disconnected'),
    'accountEmail',coalesce(v_row.account_email,''),'calendarId',coalesce(v_row.calendar_id,''),
    'calendarTimezone',coalesce(v_row.calendar_timezone,''),'meetingReady',coalesce(v_row.meeting_ready,false),
    'lastAuthAt',v_row.last_auth_at,'lastSuccessfulSyncAt',v_row.last_successful_sync_at,'lastError',v_row.last_error,
    'calendarEnabled',coalesce((v_cfg->>'zohoCalendarEnabled')::boolean,false),
    'meetingEnabled',coalesce((v_cfg->>'zohoMeetingEnabled')::boolean,false),
    'defaultCalendarProvider',v_default_calendar,'defaultMeetingProvider',v_default_meeting,
    'effectiveCalendarProvider',case when v_default_calendar='zoho' and v_ready then 'zoho' else 'google' end,
    'effectiveMeetingProvider',case when v_default_meeting='zoho_meeting' and v_ready then 'zoho_meeting' else 'google_meet' end,
    'providerConfigured',coalesce((v_provider->>'zohoProviderConfigured')::boolean,false),
    'managedByProFox',true,'sellerAuthorizationRequired',false
  );
end;
$function$;

revoke all on function public.get_zoho_service_calendar_status() from public, anon;
grant execute on function public.get_zoho_service_calendar_status() to authenticated, service_role;
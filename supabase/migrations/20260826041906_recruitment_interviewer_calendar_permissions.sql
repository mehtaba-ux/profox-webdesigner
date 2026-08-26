drop policy if exists user_calendar_settings_insert on public.user_calendar_settings;
create policy user_calendar_settings_insert on public.user_calendar_settings
for insert with check (
  public.is_admin() or (
    user_id=(select auth.uid()) and provider='Manual' and connection_status='Not Connected'
    and exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.status='active' and p.role=any(array['sales','sales_rep','sales_team','editor','site_manager']::text[]))
  )
);

drop policy if exists user_calendar_settings_select on public.user_calendar_settings;
create policy user_calendar_settings_select on public.user_calendar_settings
for select using (
  public.is_admin() or (
    user_id=(select auth.uid())
    and exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.status='active' and p.role=any(array['sales','sales_rep','sales_team','editor','site_manager']::text[]))
  )
);

drop policy if exists user_calendar_settings_update on public.user_calendar_settings;
create policy user_calendar_settings_update on public.user_calendar_settings
for update using (
  public.is_admin() or (
    user_id=(select auth.uid())
    and exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.status='active' and p.role=any(array['sales','sales_rep','sales_team','editor','site_manager']::text[]))
  )
) with check (
  public.is_admin() or (
    user_id=(select auth.uid()) and provider='Manual' and connection_status='Not Connected'
    and exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.status='active' and p.role=any(array['sales','sales_rep','sales_team','editor','site_manager']::text[]))
  )
);

create or replace function public.get_google_calendar_connection_status()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $$
declare v_user uuid:=auth.uid(); v_row public.google_calendar_connections%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not public.is_admin() and not public.has_active_role(array['sales','editor','site_manager']::text[]) then
    raise exception 'Calendar integration is available only to authorized active staff and Administrators.';
  end if;
  select * into v_row from public.google_calendar_connections where user_id=v_user;
  if not found then
    return jsonb_build_object('provider','google','status','disconnected','connected',false,'syncEnabled',true,'createMeet',true,'accountEmail','','calendarId','primary','calendarTimezone','','lastSuccessfulSyncAt',null,'lastAttemptAt',null,'lastError',null);
  end if;
  return jsonb_build_object('provider','google','status',v_row.status,'connected',v_row.status='connected','syncEnabled',v_row.sync_enabled,'createMeet',v_row.create_meet,'accountEmail',v_row.account_email,'calendarId',v_row.calendar_id,'calendarTimezone',v_row.calendar_timezone,'lastSuccessfulSyncAt',v_row.last_successful_sync_at,'lastAttemptAt',v_row.last_attempt_at,'lastError',case when v_row.status in('error','reconnect_required') then v_row.last_error else null end);
end;
$$;

create or replace function public.set_google_calendar_preferences(p_sync_enabled boolean,p_create_meet boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_user uuid:=auth.uid(); v_sync_enabled boolean:=coalesce(p_sync_enabled,true);
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not public.is_admin() and not public.has_active_role(array['sales','editor','site_manager']::text[]) then
    raise exception 'Calendar integration is available only to authorized active staff and Administrators.';
  end if;
  if not exists(select 1 from public.google_calendar_connections where user_id=v_user and status<>'disconnected') then raise exception 'Connect Google Calendar before changing synchronization preferences.'; end if;
  update public.google_calendar_connections set sync_enabled=v_sync_enabled,create_meet=coalesce(p_create_meet,true),last_error=case when v_sync_enabled then last_error else null end,updated_at=now() where user_id=v_user;
  if not v_sync_enabled then
    update public.google_calendar_sync_jobs set status='failed',last_error='Google Calendar synchronization was disabled by the user.',locked_at=null,completed_at=now(),updated_at=now() where user_id=v_user and status in('pending','processing','retry');
    update public.sales_meetings set sync_status='Not Connected',sync_error=null,updated_at=now() where salesperson_id=v_user and sync_status='Pending';
  else
    perform public.queue_google_calendar_sync(v_user,'refresh_busy',null,true);
  end if;
  return public.get_google_calendar_connection_status();
end;
$$;

create or replace function public.request_google_calendar_sync_now()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_user uuid:=auth.uid(); v_busy bigint; v_event_count integer:=0; v_m record;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not public.is_admin() and not public.has_active_role(array['sales','editor','site_manager']::text[]) then
    raise exception 'Calendar integration is available only to authorized active staff and Administrators.';
  end if;
  if not exists(select 1 from public.google_calendar_connections c where c.user_id=v_user and c.status='connected' and c.sync_enabled) then raise exception 'Google Calendar is not connected and enabled.'; end if;
  v_busy:=public.queue_google_calendar_sync(v_user,'refresh_busy',null,true);
  for v_m in select id from public.sales_meetings where salesperson_id=v_user and status in('Scheduled','Rescheduled') and end_at>=now() order by start_at limit 200 loop
    perform public.queue_google_calendar_sync(v_user,'reconcile_event',v_m.id,true); v_event_count:=v_event_count+1;
  end loop;
  return jsonb_build_object('busyJobId',v_busy,'meetingJobs',v_event_count);
end;
$$;

create or replace function public.enforce_sales_meeting_integrity()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_settings jsonb;v_relation_owner uuid;v_opportunity_status text;v_duration integer;v_allowed_duration boolean;v_allowed_type boolean;v_min_notice integer;v_timezone text;v_working_days integer[];v_work_start time;v_work_end time;v_user_active boolean;v_buffer_before integer;v_buffer_after integer;v_local_start timestamp;v_local_end timestamp;v_local_dow integer;v_schedule_changed boolean;
begin
  if new.end_at<=new.start_at then raise exception 'Meeting end must be after meeting start.';end if;
  if tg_op='INSERT' then
    if lower(trim(coalesce(new.provider,'Manual')))<>'manual' then raise exception 'Meetings must be created in ProFox before optional external synchronization.';end if;
    new.provider:='Manual';new.sync_status:='Not Connected';new.sync_error:=null;
  else new.provider:=old.provider;end if;
  v_schedule_changed:=tg_op='INSERT' or new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at or new.meeting_type is distinct from old.meeting_type or new.salesperson_id is distinct from old.salesperson_id or new.lead_id is distinct from old.lead_id or new.opportunity_id is distinct from old.opportunity_id or new.client_id is distinct from old.client_id;
  if new.status in('Scheduled','Rescheduled') and v_schedule_changed and not exists(
    select 1 from public.user_profiles p where p.id=new.salesperson_id and p.status='active' and (
      p.role in('sales','admin') or (new.meeting_type='Recruitment Interview' and p.role in('editor','site_manager'))
    )
  ) then raise exception 'Meeting owner must be an active Sales Representative, Administrator, or authorized Recruitment Manager.';end if;
  if num_nonnulls(new.lead_id,new.opportunity_id,new.client_id)>1 then raise exception 'A meeting may link to only one primary CRM record.';end if;
  if new.lead_id is not null then select salesperson_id into v_relation_owner from public.crm_leads where id=new.lead_id;if not found then raise exception 'Lead not found.';end if;
  elsif new.opportunity_id is not null then select salesperson_id,status into v_relation_owner,v_opportunity_status from public.crm_opportunities where id=new.opportunity_id;if not found then raise exception 'Opportunity not found.';end if;if new.status in('Scheduled','Rescheduled') and v_schedule_changed and v_opportunity_status<>'Open' then raise exception 'New or rescheduled meetings may only target an open opportunity.';end if;
  elsif new.client_id is not null then select salesperson_id into v_relation_owner from public.clients where id=new.client_id;if not found then raise exception 'Client not found.';end if;end if;
  if(new.lead_id is not null or new.opportunity_id is not null or new.client_id is not null) and v_schedule_changed then
    if v_relation_owner is null and not public.is_admin() then raise exception 'The related CRM record must be assigned before a Sales Representative can schedule a meeting.';end if;
    if v_relation_owner is not null and v_relation_owner<>new.salesperson_id then raise exception 'Meeting owner must match the salesperson assigned to the related CRM record.';end if;
  elsif new.lead_id is null and new.opportunity_id is null and new.client_id is null and nullif(trim(coalesce(new.attendee_email,'')),'') is null then raise exception 'External meetings require an attendee email.';end if;
  if nullif(trim(coalesce(new.meeting_url,'')),'') is not null and new.meeting_url !~* '^https?://' then raise exception 'Meeting link must begin with http:// or https://.';end if;
  if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'Invalid IANA timezone: %',new.timezone;end if;
  if new.status in('Scheduled','Rescheduled') and v_schedule_changed then
    select config_value into v_settings from public.system_configuration where config_key='meeting_settings';v_settings:=coalesce(v_settings,'{}'::jsonb);
    if tg_op='INSERT' and coalesce((v_settings->>'active')::boolean,true) is not true then raise exception 'New Sales meetings are disabled by Admin configuration.';end if;
    v_duration:=round(extract(epoch from(new.end_at-new.start_at))/60.0)::integer;
    select exists(select 1 from jsonb_array_elements_text(coalesce(v_settings->'allowedDurations','[15,30,45,60]'::jsonb)) x where x::integer=v_duration) into v_allowed_duration;
    if not v_allowed_duration then raise exception 'Meeting duration is not allowed by Admin configuration.';end if;
    select exists(select 1 from jsonb_array_elements_text(coalesce(v_settings->'meetingTypes','["Discovery Meeting"]'::jsonb)) x where x=new.meeting_type) into v_allowed_type;
    if not v_allowed_type then raise exception 'Meeting type is not enabled by Admin configuration.';end if;
    v_min_notice:=greatest(coalesce((v_settings->>'minimumBookingNoticeMinutes')::integer,0),0);
    if new.start_at<now()+make_interval(mins=>v_min_notice) then raise exception 'Meeting does not satisfy the configured minimum booking notice.';end if;
    select timezone,working_days,work_start,work_end,active,buffer_before_minutes,buffer_after_minutes into v_timezone,v_working_days,v_work_start,v_work_end,v_user_active,v_buffer_before,v_buffer_after from public.user_calendar_settings where user_id=new.salesperson_id;
    if found then
      if v_user_active is not true then raise exception 'This salesperson is not accepting new meetings.';end if;
      v_local_start:=new.start_at at time zone v_timezone;v_local_end:=new.end_at at time zone v_timezone;v_local_dow:=extract(dow from v_local_start)::integer;
      if not(v_local_dow=any(v_working_days)) then raise exception 'Meeting falls outside the salesperson working days.';end if;
      if v_local_start::date<>v_local_end::date or v_local_start::time<v_work_start or v_local_end::time>v_work_end then raise exception 'Meeting falls outside the salesperson working hours.';end if;
    else v_buffer_before:=greatest(coalesce((v_settings->>'bufferBeforeMinutes')::integer,0),0);v_buffer_after:=greatest(coalesce((v_settings->>'bufferAfterMinutes')::integer,0),0);end if;
    v_buffer_before:=greatest(coalesce(v_buffer_before,0),0);v_buffer_after:=greatest(coalesce(v_buffer_after,0),0);
    if exists(select 1 from public.sales_meetings m where m.salesperson_id=new.salesperson_id and m.id<>new.id and m.status in('Scheduled','Rescheduled') and m.start_at<new.end_at+make_interval(mins=>v_buffer_after) and m.end_at>new.start_at-make_interval(mins=>v_buffer_before)) then raise exception 'This time conflicts with an existing meeting or configured meeting buffer.';end if;
  end if;
  new.attendee_email:=lower(trim(coalesce(new.attendee_email,'')));new.title:=trim(new.title);if new.title='' then raise exception 'Meeting title is required.';end if;new.updated_at:=now();return new;
end;
$$;

create table if not exists public.sales_account_setup_state (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  crm_tour_step integer not null default 0 check (crm_tour_step between 0 and 6),
  crm_tour_completed_at timestamptz,
  completed_at timestamptz,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sales_account_setup_state enable row level security;
revoke all on table public.sales_account_setup_state from anon, authenticated;

insert into public.sales_account_setup_state(user_id)
select p.id
from public.user_profiles p
where p.status='active' and p.role in ('sales','sales_rep','sales_team')
on conflict (user_id) do nothing;

create or replace function public.get_my_sales_account_setup_status()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_profile public.user_profiles%rowtype;
  v_state public.sales_account_setup_state%rowtype;
  v_google public.google_calendar_connections%rowtype;
  v_calendar public.user_calendar_settings%rowtype;
  v_photo boolean:=false;
  v_timezone boolean:=false;
  v_google_connected boolean:=false;
  v_meet boolean:=false;
  v_availability boolean:=false;
  v_crm boolean:=false;
  v_ready boolean:=false;
  v_progress integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_profile from public.user_profiles where id=v_uid;
  if not found or v_profile.status<>'active' or v_profile.role not in ('sales','sales_rep','sales_team') then
    raise exception 'Active Sales Representative access required.';
  end if;

  insert into public.sales_account_setup_state(user_id) values(v_uid)
  on conflict(user_id) do nothing;
  select * into v_state from public.sales_account_setup_state where user_id=v_uid for update;

  select * into v_google from public.google_calendar_connections where user_id=v_uid limit 1;
  select * into v_calendar from public.user_calendar_settings where user_id=v_uid limit 1;

  v_photo:=coalesce(length(btrim(v_profile.avatar_url)),0)>0;
  v_timezone:=coalesce(length(btrim(v_profile.timezone)),0)>0;
  v_google_connected:=coalesce(v_google.status='connected',false);
  v_meet:=v_google_connected and coalesce(v_google.create_meet,false);
  v_availability:=found;
  if v_calendar.user_id is not null then
    v_availability:=coalesce(v_calendar.active,false)
      and coalesce(array_length(v_calendar.working_days,1),0)>0
      and v_calendar.work_start is not null
      and v_calendar.work_end is not null
      and v_calendar.work_end>v_calendar.work_start;
  else
    v_availability:=false;
  end if;
  v_crm:=coalesce(v_state.crm_tour_completed_at is not null or v_state.crm_tour_step>=6,false);
  v_ready:=v_photo and v_timezone and v_google_connected and v_meet and v_availability and v_crm;

  if v_ready and v_state.completed_at is null then
    update public.sales_account_setup_state set completed_at=now(),updated_at=now() where user_id=v_uid returning * into v_state;
  elsif not v_ready and v_state.completed_at is not null then
    update public.sales_account_setup_state set completed_at=null,updated_at=now() where user_id=v_uid returning * into v_state;
  end if;

  v_progress:=least(100,
    (case when v_photo then 15 else 0 end)+
    (case when v_timezone then 10 else 0 end)+
    (case when v_google_connected then 20 else 0 end)+
    (case when v_meet then 15 else 0 end)+
    (case when v_availability then 15 else 0 end)+
    round((least(6,greatest(0,v_state.crm_tour_step))::numeric/6.0)*25)::integer
  );

  return jsonb_build_object(
    'userId',v_uid,
    'profilePhotoReady',v_photo,
    'timezoneReady',v_timezone,
    'googleCalendarConnected',v_google_connected,
    'googleMeetReady',v_meet,
    'googleAccountEmail',coalesce(v_google.account_email,''),
    'googleCalendarTimezone',coalesce(v_google.calendar_timezone,''),
    'availabilityReady',v_availability,
    'workingDays',coalesce(v_calendar.working_days,'{}'::integer[]),
    'workStart',case when v_calendar.work_start is null then null else to_char(v_calendar.work_start,'HH24:MI') end,
    'workEnd',case when v_calendar.work_end is null then null else to_char(v_calendar.work_end,'HH24:MI') end,
    'crmTourStep',v_state.crm_tour_step,
    'crmTourCompleted',v_crm,
    'setupCompleted',v_state.completed_at is not null and v_ready,
    'completedAt',v_state.completed_at,
    'startedAt',v_state.started_at,
    'progressPercent',v_progress
  );
end;
$$;
revoke all on function public.get_my_sales_account_setup_status() from public,anon;
grant execute on function public.get_my_sales_account_setup_status() to authenticated;

create or replace function public.advance_my_sales_crm_setup_tour(p_step integer)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_status jsonb;
  v_state public.sales_account_setup_state%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_step<1 or p_step>6 then raise exception 'CRM tour step must be between 1 and 6.'; end if;
  v_status:=public.get_my_sales_account_setup_status();
  if coalesce((v_status->>'profilePhotoReady')::boolean,false) is not true then raise exception 'Upload your professional profile photo before starting the CRM tour.'; end if;
  if coalesce((v_status->>'timezoneReady')::boolean,false) is not true then raise exception 'Confirm your timezone before starting the CRM tour.'; end if;
  if coalesce((v_status->>'googleCalendarConnected')::boolean,false) is not true then raise exception 'Connect Google Calendar before starting the CRM tour.'; end if;
  if coalesce((v_status->>'googleMeetReady')::boolean,false) is not true then raise exception 'Enable Google Meet before starting the CRM tour.'; end if;
  if coalesce((v_status->>'availabilityReady')::boolean,false) is not true then raise exception 'Configure your working availability before starting the CRM tour.'; end if;

  select * into v_state from public.sales_account_setup_state where user_id=v_uid for update;
  if p_step<=v_state.crm_tour_step then return public.get_my_sales_account_setup_status(); end if;
  if p_step<>v_state.crm_tour_step+1 then raise exception 'Complete the CRM setup tour in order. Your next step is %.',v_state.crm_tour_step+1; end if;

  update public.sales_account_setup_state
  set crm_tour_step=p_step,
      crm_tour_completed_at=case when p_step=6 then coalesce(crm_tour_completed_at,now()) else crm_tour_completed_at end,
      updated_at=now()
  where user_id=v_uid;
  return public.get_my_sales_account_setup_status();
end;
$$;
revoke all on function public.advance_my_sales_crm_setup_tour(integer) from public,anon;
grant execute on function public.advance_my_sales_crm_setup_tour(integer) to authenticated;

create or replace function public.admin_get_sales_account_setup_status(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_profile public.user_profiles%rowtype;
  v_state public.sales_account_setup_state%rowtype;
  v_google public.google_calendar_connections%rowtype;
  v_calendar public.user_calendar_settings%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_profile from public.user_profiles where id=p_user_id;
  if not found then raise exception 'Sales profile not found.'; end if;
  select * into v_state from public.sales_account_setup_state where user_id=p_user_id;
  select * into v_google from public.google_calendar_connections where user_id=p_user_id limit 1;
  select * into v_calendar from public.user_calendar_settings where user_id=p_user_id limit 1;
  return jsonb_build_object(
    'userId',p_user_id,
    'profilePhotoReady',coalesce(length(btrim(v_profile.avatar_url)),0)>0,
    'timezoneReady',coalesce(length(btrim(v_profile.timezone)),0)>0,
    'googleCalendarConnected',coalesce(v_google.status='connected',false),
    'googleMeetReady',coalesce(v_google.status='connected' and v_google.create_meet,false),
    'availabilityReady',coalesce(v_calendar.active,false) and coalesce(array_length(v_calendar.working_days,1),0)>0 and v_calendar.work_start is not null and v_calendar.work_end is not null and v_calendar.work_end>v_calendar.work_start,
    'crmTourStep',coalesce(v_state.crm_tour_step,0),
    'crmTourCompleted',coalesce(v_state.crm_tour_completed_at is not null,false),
    'setupCompleted',coalesce(v_state.completed_at is not null,false),
    'completedAt',v_state.completed_at
  );
end;
$$;
revoke all on function public.admin_get_sales_account_setup_status(uuid) from public,anon;
grant execute on function public.admin_get_sales_account_setup_status(uuid) to authenticated;

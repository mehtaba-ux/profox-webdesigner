-- Connect the shared public booking experience to activated Sales staff.
-- This migration is intentionally backward-compatible with the existing booking/CRM workflow.

create or replace function public.service_ensure_sales_public_booking_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user public.user_profiles%rowtype;
  v_slug text;
begin
  select * into v_user from public.user_profiles where id = p_user_id;
  if not found then return; end if;

  if v_user.status <> 'active'
     or coalesce(v_user.onboarding_status,'') <> 'completed'
     or v_user.role not in ('sales','sales_rep','sales_team') then
    return;
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(coalesce(nullif(trim(v_user.full_name),''),'specialist')), '[^a-z0-9]+', '-', 'g'))
            || '-' || left(v_user.id::text,8);

  insert into public.public_booking_profiles(
    salesperson_id,slug,display_name,headline,bio,country,avatar_url,niches,service_expertise,languages,
    meeting_type,meeting_duration_minutes,is_public,accepting_bookings,sort_order,created_at,updated_at
  ) values (
    v_user.id,v_slug,coalesce(nullif(trim(v_user.full_name),''),'ProFox Specialist'),'ProFox Sales Specialist','',
    coalesce(v_user.country,''),coalesce(v_user.avatar_url,''),array[]::text[],array[]::text[],array['English']::text[],
    'Discovery Meeting',30,true,true,100,now(),now()
  )
  on conflict (salesperson_id) do update
  set display_name = case when trim(coalesce(public.public_booking_profiles.display_name,''))='' then excluded.display_name else public.public_booking_profiles.display_name end,
      country = case when trim(coalesce(public.public_booking_profiles.country,''))='' then excluded.country else public.public_booking_profiles.country end,
      avatar_url = case when trim(coalesce(public.public_booking_profiles.avatar_url,''))='' then excluded.avatar_url else public.public_booking_profiles.avatar_url end,
      headline = case when trim(coalesce(public.public_booking_profiles.headline,''))='' then excluded.headline else public.public_booking_profiles.headline end,
      updated_at = now();

  insert into public.user_calendar_settings(
    user_id,provider,calendar_email,timezone,working_days,work_start,work_end,default_duration_minutes,
    buffer_before_minutes,buffer_after_minutes,booking_url,default_platform,connection_status,active,updated_at
  ) values (
    v_user.id,'Manual','',coalesce(nullif(v_user.timezone,''),'UTC'),array[1,2,3,4,5]::integer[],
    '09:00'::time,'17:00'::time,30,0,15,'https://www.profoxwebdesigner.com/book-a-meeting','ProFox Calendar','Not Connected',true,now()
  )
  on conflict (user_id) do update
  set timezone = case
        when public.user_calendar_settings.provider='Manual'
         and coalesce(public.user_calendar_settings.calendar_email,'')=''
         and public.user_calendar_settings.connection_status='Not Connected'
         and public.user_calendar_settings.timezone='UTC'
         and coalesce(nullif(v_user.timezone,''),'UTC') <> 'UTC'
        then v_user.timezone
        else public.user_calendar_settings.timezone
      end,
      booking_url = case when coalesce(public.user_calendar_settings.booking_url,'')='' then excluded.booking_url else public.user_calendar_settings.booking_url end,
      updated_at = now();
end;
$function$;

revoke all on function public.service_ensure_sales_public_booking_profile(uuid) from public, anon, authenticated;

create or replace function public.trg_ensure_sales_public_booking_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  perform public.service_ensure_sales_public_booking_profile(new.id);
  return new;
end;
$function$;

revoke all on function public.trg_ensure_sales_public_booking_profile() from public, anon, authenticated;

drop trigger if exists trg_ensure_sales_public_booking_profile on public.user_profiles;
create trigger trg_ensure_sales_public_booking_profile
after insert or update of status,onboarding_status,role,full_name,country,timezone,avatar_url
on public.user_profiles
for each row execute function public.trg_ensure_sales_public_booking_profile();

-- Backfill only sellers who are already activated/onboarded. Existing profile publish/pause choices are preserved.
do $backfill$
declare v_id uuid;
begin
  for v_id in
    select id from public.user_profiles
    where status='active'
      and onboarding_status='completed'
      and role in ('sales','sales_rep','sales_team')
  loop
    perform public.service_ensure_sales_public_booking_profile(v_id);
  end loop;
end;
$backfill$;

create or replace function public.list_public_booking_experts()
returns table(
  salesperson_id uuid, slug text, display_name text, headline text, bio text, country text, avatar_url text,
  niches text[], service_expertise text[], languages text[], meeting_type text, meeting_duration_minutes integer,
  timezone text, working_days integer[], work_start time without time zone, work_end time without time zone
)
language sql
stable security definer
set search_path to 'public','pg_temp'
as $function$
  with public_settings as (
    select coalesce((select config_value from public.system_configuration where config_key='public_booking_settings'),'${"active":false}'::jsonb) as cfg
  ), meeting_settings as (
    select coalesce((select config_value from public.system_configuration where config_key='meeting_settings'),'{}'::jsonb) as cfg
  )
  select
    b.salesperson_id,b.slug,coalesce(nullif(b.display_name,''),p.full_name) as display_name,b.headline,b.bio,
    coalesce(nullif(b.country,''),p.country,'') as country,coalesce(nullif(b.avatar_url,''),p.avatar_url,'') as avatar_url,
    b.niches,b.service_expertise,b.languages,b.meeting_type,b.meeting_duration_minutes,
    coalesce(nullif(c.timezone,''),nullif(p.timezone,''),nullif(ms.cfg->>'defaultTimezone',''),'UTC') as timezone,
    coalesce(c.working_days,array[1,2,3,4,5]::integer[]) as working_days,
    coalesce(c.work_start,'09:00'::time) as work_start,coalesce(c.work_end,'17:00'::time) as work_end
  from public.public_booking_profiles b
  join public.user_profiles p on p.id=b.salesperson_id
  left join public.user_calendar_settings c on c.user_id=b.salesperson_id
  cross join public_settings ps
  cross join meeting_settings ms
  where coalesce((ps.cfg->>'active')::boolean,false) is true
    and b.is_public is true
    and b.accepting_bookings is true
    and p.status='active'
    and (p.role='admin' or (p.role in ('sales','sales_rep','sales_team') and p.onboarding_status='completed'))
    and coalesce(c.active,true) is true
  order by b.sort_order,coalesce(nullif(b.display_name,''),p.full_name),b.salesperson_id;
$function$;

-- Preserve the existing native slot algorithm while aligning accepted Sales role aliases.
create or replace function public.get_public_booking_slots_native_base(p_salesperson_id uuid, p_from_date date default null::date, p_days integer default 14)
returns table(start_at timestamptz,end_at timestamptz,timezone text,duration_minutes integer)
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_timezone text; v_working_days integer[]; v_work_start time; v_work_end time; v_calendar_active boolean;
  v_duration integer; v_buffer_before integer; v_buffer_after integer; v_slot_interval integer; v_max_advance integer;
  v_min_notice integer; v_public_active boolean; v_meeting_active boolean; v_today date; v_start_date date; v_end_date date; v_days integer;
begin
  select
    coalesce(nullif(c.timezone,''),nullif(p.timezone,''),nullif(ms.config_value->>'defaultTimezone',''),'UTC'),
    coalesce(c.working_days,array[1,2,3,4,5]::integer[]),coalesce(c.work_start,'09:00'::time),coalesce(c.work_end,'17:00'::time),coalesce(c.active,true),
    b.meeting_duration_minutes,
    coalesce(c.buffer_before_minutes,greatest(coalesce((ms.config_value->>'bufferBeforeMinutes')::integer,0),0)),
    coalesce(c.buffer_after_minutes,greatest(coalesce((ms.config_value->>'bufferAfterMinutes')::integer,0),0)),
    least(greatest(coalesce((pbs.config_value->>'slotIntervalMinutes')::integer,15),5),120),
    least(greatest(coalesce((pbs.config_value->>'maxAdvanceDays')::integer,60),1),365),
    greatest(coalesce((ms.config_value->>'minimumBookingNoticeMinutes')::integer,0),0),
    coalesce((pbs.config_value->>'active')::boolean,false),coalesce((ms.config_value->>'active')::boolean,true)
  into v_timezone,v_working_days,v_work_start,v_work_end,v_calendar_active,v_duration,v_buffer_before,v_buffer_after,
       v_slot_interval,v_max_advance,v_min_notice,v_public_active,v_meeting_active
  from public.public_booking_profiles b
  join public.user_profiles p on p.id=b.salesperson_id
  left join public.user_calendar_settings c on c.user_id=b.salesperson_id
  left join public.system_configuration ms on ms.config_key='meeting_settings'
  left join public.system_configuration pbs on pbs.config_key='public_booking_settings'
  where b.salesperson_id=p_salesperson_id
    and b.is_public is true and b.accepting_bookings is true and p.status='active'
    and (p.role='admin' or (p.role in ('sales','sales_rep','sales_team') and p.onboarding_status='completed'));

  if not found or v_public_active is not true or v_meeting_active is not true or v_calendar_active is not true then return; end if;
  if not exists(select 1 from pg_timezone_names where name=v_timezone) then return; end if;

  v_days := least(greatest(coalesce(p_days,14),1),31);
  v_today := (now() at time zone v_timezone)::date;
  v_start_date := greatest(coalesce(p_from_date,v_today),v_today);
  v_end_date := least(v_start_date+(v_days-1),v_today+v_max_advance);
  if v_start_date>v_end_date then return; end if;

  return query
  with dates as (
    select gs::date as d from generate_series(v_start_date::timestamp,v_end_date::timestamp,interval '1 day') gs
    where extract(dow from gs)::integer=any(v_working_days)
  ), slot_candidates as (
    select
      ((d.d+v_work_start)+(n*make_interval(mins=>v_slot_interval))) at time zone v_timezone as slot_start,
      (((d.d+v_work_start)+(n*make_interval(mins=>v_slot_interval))) at time zone v_timezone)+make_interval(mins=>v_duration) as slot_end
    from dates d
    cross join lateral generate_series(0,floor(greatest(extract(epoch from ((d.d+v_work_end)-(d.d+v_work_start)-make_interval(mins=>v_duration)))/60.0,-1)/v_slot_interval)::integer) n
  )
  select s.slot_start,s.slot_end,v_timezone,v_duration
  from slot_candidates s
  where s.slot_start>=now()+make_interval(mins=>v_min_notice)
    and not exists(select 1 from public.booking_availability_blocks b where b.user_id=p_salesperson_id and b.start_at<s.slot_end and b.end_at>s.slot_start)
    and not exists(
      select 1 from public.sales_meetings m
      where m.salesperson_id=p_salesperson_id and m.status in ('Scheduled','Rescheduled')
        and m.start_at<s.slot_end+make_interval(mins=>greatest(coalesce(v_buffer_after,0),0))
        and m.end_at>s.slot_start-make_interval(mins=>greatest(coalesce(v_buffer_before,0),0))
    )
  order by s.slot_start
  limit 500;
end;
$function$;

-- External busy-time checks are provider aware. Each helper safely no-ops when its provider is not effective.
create or replace function public.get_public_booking_slots(p_salesperson_id uuid,p_from_date date default null::date,p_days integer default 14)
returns table(start_at timestamptz,end_at timestamptz,timezone text,duration_minutes integer)
language sql
stable security definer
set search_path to 'public','pg_temp'
as $function$
  select s.start_at,s.end_at,s.timezone,s.duration_minutes
  from public.get_public_booking_slots_native_base(p_salesperson_id,p_from_date,p_days) s
  where not public.has_google_calendar_conflict(p_salesperson_id,s.start_at,s.end_at,null)
    and not public.has_zoho_calendar_conflict(p_salesperson_id,s.start_at,s.end_at,null)
  order by s.start_at;
$function$;

-- The existing atomic booking RPC contains the same legacy Sales-role predicate. Patch only that predicate,
-- preserving all CRM, idempotency, activity, meeting and notification behavior already implemented there.
do $patch_booking_role$
declare
  v_oid oid;
  v_sql text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='book_public_sales_meeting'
    and pg_get_function_identity_arguments(p.oid)='p_request_key uuid, p_salesperson_id uuid, p_start_at timestamp with time zone, p_visitor_timezone text, p_contact_name text, p_email text, p_phone text, p_company_name text, p_website text, p_country text, p_industry text, p_service_interest text, p_qualification_answers jsonb, p_honeypot text';

  if v_oid is null then raise exception 'Expected public booking RPC was not found.'; end if;
  v_sql := pg_get_functiondef(v_oid);
  if position('up.role IN (''sales'',''sales_rep'',''sales_team'',''admin'')' in v_sql)>0 then return; end if;
  if position('up.role IN (''sales'',''admin'')' in v_sql)=0 then raise exception 'Public booking role predicate changed unexpectedly; refusing unsafe patch.'; end if;
  v_sql := replace(v_sql,'up.role IN (''sales'',''admin'')','up.role IN (''sales'',''sales_rep'',''sales_team'',''admin'')');
  execute v_sql;
end;
$patch_booking_role$;

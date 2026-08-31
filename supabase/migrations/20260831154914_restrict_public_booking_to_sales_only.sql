-- Public service-discovery meetings are handled only by eligible Sales staff.
-- Administrators retain internal meeting/recruitment capabilities, but can
-- never be published or booked through the customer-facing booking API.

create or replace function public.trg_pause_ineligible_public_booking_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if new.status <> 'active'
     or new.role not in ('sales','sales_rep','sales_team')
     or coalesce(new.onboarding_status,'') <> 'completed' then
    update public.public_booking_profiles
    set is_public=false,accepting_bookings=false,updated_at=now()
    where salesperson_id=new.id and (is_public or accepting_bookings);
  end if;
  return new;
end;
$function$;

revoke all on function public.trg_pause_ineligible_public_booking_profile() from public,anon,authenticated;

create or replace function public.validate_public_booking_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_meeting_settings jsonb;
  v_duration_allowed boolean;
  v_type_allowed boolean;
begin
  new.slug:=lower(trim(coalesce(new.slug,'')));
  new.slug:=regexp_replace(new.slug,'[^a-z0-9]+','-','g');
  new.slug:=trim(both '-' from new.slug);
  if new.slug='' then new.slug:='expert-'||left(new.salesperson_id::text,8); end if;

  new.display_name:=trim(coalesce(new.display_name,''));
  new.headline:=left(trim(coalesce(new.headline,'')),160);
  new.bio:=left(trim(coalesce(new.bio,'')),2000);
  new.country:=left(trim(coalesce(new.country,'')),120);
  new.avatar_url:=left(trim(coalesce(new.avatar_url,'')),1000);
  new.niches:=array(select distinct trim(x) from unnest(coalesce(new.niches,array[]::text[])) x where trim(x)<>'');
  new.service_expertise:=array(select distinct trim(x) from unnest(coalesce(new.service_expertise,array[]::text[])) x where trim(x)<>'');
  new.languages:=array(select distinct trim(x) from unnest(coalesce(new.languages,array[]::text[])) x where trim(x)<>'');

  if (new.is_public or new.accepting_bookings) and not exists(
    select 1 from public.user_profiles p
    where p.id=new.salesperson_id
      and p.status='active'
      and p.role in ('sales','sales_rep','sales_team')
      and coalesce(p.onboarding_status,'')='completed'
  ) then
    raise exception 'Only an active, onboarding-complete Sales Representative may publish a booking profile.';
  end if;

  if new.accepting_bookings and not exists(
    select 1 from public.user_calendar_settings c
    where c.user_id=new.salesperson_id and c.active is true
      and coalesce(array_length(c.working_days,1),0)>0
      and c.work_start is not null and c.work_end is not null and c.work_end>c.work_start
  ) then
    raise exception 'Save complete, active ProFox working availability before accepting public bookings.';
  end if;

  select config_value into v_meeting_settings
  from public.system_configuration where config_key='meeting_settings';
  v_meeting_settings:=coalesce(v_meeting_settings,'{}'::jsonb);

  select exists(
    select 1 from jsonb_array_elements_text(coalesce(v_meeting_settings->'allowedDurations','[15,30,45,60]'::jsonb)) x
    where x::integer=new.meeting_duration_minutes
  ) into v_duration_allowed;
  if not v_duration_allowed then raise exception 'Public booking duration must be one of the Admin-approved meeting durations.'; end if;

  select exists(
    select 1 from jsonb_array_elements_text(coalesce(v_meeting_settings->'meetingTypes','["Discovery Meeting"]'::jsonb)) x
    where x=new.meeting_type
  ) into v_type_allowed;
  if not v_type_allowed then raise exception 'Public booking meeting type must be enabled in Meeting Settings.'; end if;

  new.updated_at:=now();
  return new;
end;
$function$;

revoke all on function public.validate_public_booking_profile() from public,anon,authenticated;

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
    select coalesce((select config_value from public.system_configuration where config_key='public_booking_settings'),'{"active":false}'::jsonb) as cfg
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
    and p.role in ('sales','sales_rep','sales_team')
    and p.onboarding_status='completed'
    and coalesce(c.active,true) is true
  order by b.sort_order,coalesce(nullif(b.display_name,''),p.full_name),b.salesperson_id;
$function$;

revoke all on function public.list_public_booking_experts() from public;
grant execute on function public.list_public_booking_experts() to anon,authenticated,service_role;

-- Harden the existing native slot and atomic booking engines as well, so a
-- caller cannot bypass the public directory by supplying an Administrator ID.
do $patch_native_role_guards$
declare
  v_oid oid;
  v_sql text;
  v_name text;
  v_current text;
  v_required text;
begin
  foreach v_name in array array['get_public_booking_slots_native_base','service_book_public_sales_meeting_core'] loop
    select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=v_name
    order by p.oid desc limit 1;
    if v_oid is null then raise exception 'Expected booking function % was not found.',v_name; end if;

    v_sql:=pg_get_functiondef(v_oid);
    if v_name='get_public_booking_slots_native_base' then
      v_current:='p.role IN (''sales'',''sales_rep'',''sales_team'',''admin'')';
      v_required:='p.role IN (''sales'',''sales_rep'',''sales_team'')';
    else
      v_current:='up.role IN (''sales'',''sales_rep'',''sales_team'',''admin'')';
      v_required:='up.role IN (''sales'',''sales_rep'',''sales_team'')';
    end if;

    if position(v_required in v_sql)>0 then continue; end if;
    if position(v_current in v_sql)=0 then
      raise exception 'Role predicate for % changed unexpectedly; refusing unsafe patch.',v_name;
    end if;
    execute replace(v_sql,v_current,v_required);
  end loop;
end;
$patch_native_role_guards$;

-- Historical details remain for audit, while every non-Sales public flag is
-- removed immediately. No user account is activated or fabricated here.
update public.public_booking_profiles b
set is_public=false,accepting_bookings=false,updated_at=now()
where (b.is_public or b.accepting_bookings)
  and not exists(
    select 1 from public.user_profiles p
    where p.id=b.salesperson_id
      and p.status='active'
      and p.role in ('sales','sales_rep','sales_team')
      and coalesce(p.onboarding_status,'')='completed'
  );

-- Reuse the established provisioning path for any genuinely eligible seller
-- already present at migration time; existing manual publish choices remain.
do $backfill_eligible_sellers$
declare v_id uuid;
begin
  for v_id in
    select id from public.user_profiles
    where status='active' and onboarding_status='completed'
      and role in ('sales','sales_rep','sales_team')
  loop
    perform public.service_ensure_sales_public_booking_profile(v_id);
  end loop;
end;
$backfill_eligible_sellers$;

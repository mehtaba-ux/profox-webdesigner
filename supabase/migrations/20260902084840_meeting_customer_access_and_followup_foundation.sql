-- Universal customer access and customer-safe follow-up foundation for sales meetings.

alter table public.sales_meetings
  add column if not exists customer_summary text not null default '',
  add column if not exists customer_next_step text not null default '',
  add column if not exists customer_next_step_timing text not null default '';

create table if not exists public.sales_meeting_customer_access (
  meeting_id uuid primary key references public.sales_meetings(id) on delete cascade,
  management_token uuid not null default gen_random_uuid(),
  management_token_expires_at timestamptz not null default (now() + interval '90 days'),
  booking_reference text not null,
  source text not null default 'crm',
  contact_name text not null default '',
  email text not null default '',
  company_name text not null default '',
  service_interest text not null default '',
  visitor_timezone text not null default 'UTC',
  status text not null default 'Confirmed',
  attendance_status text not null default 'Pending',
  attendance_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_meeting_customer_access_token_key unique(management_token),
  constraint sales_meeting_customer_access_source_check check (source in ('crm','public_booking')),
  constraint sales_meeting_customer_access_status_check check (status in ('Confirmed','Cancelled')),
  constraint sales_meeting_customer_access_attendance_check check (attendance_status in ('Pending','Confirmed'))
);

alter table public.sales_meeting_customer_access enable row level security;
revoke all on table public.sales_meeting_customer_access from public, anon, authenticated;

create index if not exists idx_sales_meeting_customer_access_email
  on public.sales_meeting_customer_access(lower(email));
create index if not exists idx_sales_meeting_customer_access_expiry
  on public.sales_meeting_customer_access(management_token_expires_at);

create or replace function public.service_meeting_crm_lead_id(p_meeting_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  select coalesce(m.lead_id,(select o.lead_id from public.crm_opportunities o where o.id=m.opportunity_id))
  from public.sales_meetings m where m.id=p_meeting_id
$function$;
revoke all on function public.service_meeting_crm_lead_id(uuid) from public,anon,authenticated;

create or replace function public.service_ensure_meeting_customer_access(
  p_meeting_id uuid,
  p_source text default null,
  p_preferred_token uuid default null,
  p_visitor_timezone text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_meeting public.sales_meetings%rowtype;
  v_existing public.sales_meeting_customer_access%rowtype;
  v_has_existing boolean:=false;
  v_contact text:=''; v_email text:=''; v_company text:=''; v_service text:='';
  v_timezone text:='UTC'; v_source text:='crm'; v_reference text:='';
  v_token uuid; v_expires timestamptz;
begin
  select * into v_meeting from public.sales_meetings where id=p_meeting_id;
  if not found then return null; end if;
  if v_meeting.meeting_type in ('Recruitment Interview','Mock Sales Call') then return null; end if;
  if v_meeting.lead_id is null and v_meeting.opportunity_id is null and v_meeting.client_id is null then return null; end if;

  v_contact:=trim(coalesce(v_meeting.attendee_name,''));
  v_email:=lower(trim(coalesce(v_meeting.attendee_email,'')));

  if v_meeting.lead_id is not null then
    select coalesce(nullif(v_contact,''),l.contact_name,''),
           coalesce(nullif(v_email,''),lower(trim(coalesce(l.email,''))),''),
           coalesce(l.company_name,''),coalesce(l.service_interest,'')
      into v_contact,v_email,v_company,v_service
    from public.crm_leads l where l.id=v_meeting.lead_id;
  elsif v_meeting.opportunity_id is not null then
    select coalesce(nullif(v_contact,''),o.contact_name,''),
           coalesce(nullif(v_email,''),lower(trim(coalesce(o.email,''))),''),
           coalesce(o.company_name,o.name,''),coalesce(o.service_interest,'')
      into v_contact,v_email,v_company,v_service
    from public.crm_opportunities o where o.id=v_meeting.opportunity_id;
  elsif v_meeting.client_id is not null then
    select coalesce(nullif(v_contact,''),c.primary_contact_name,''),
           coalesce(nullif(v_email,''),lower(trim(coalesce(c.email,''))),''),
           coalesce(c.company_name,''),''
      into v_contact,v_email,v_company,v_service
    from public.clients c where c.id=v_meeting.client_id;
  end if;

  if v_email='' or v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then return null; end if;

  v_source:=case when p_source='public_booking' then 'public_booking' else 'crm' end;
  v_timezone:=coalesce(nullif(trim(p_visitor_timezone),''),
    (select visitor_timezone from public.public_booking_submissions where meeting_id=p_meeting_id limit 1),
    v_meeting.timezone,'UTC');
  if not exists(select 1 from pg_timezone_names where name=v_timezone) then v_timezone:='UTC'; end if;

  select * into v_existing from public.sales_meeting_customer_access where meeting_id=p_meeting_id;
  v_has_existing:=found;
  v_reference:=coalesce(
    (select booking_reference from public.public_booking_submissions where meeting_id=p_meeting_id limit 1),
    case when v_has_existing then v_existing.booking_reference else null end,
    'PFM-'||upper(substr(replace(p_meeting_id::text,'-',''),1,12))
  );
  v_token:=coalesce(p_preferred_token,case when v_has_existing then v_existing.management_token else null end,gen_random_uuid());
  v_expires:=greatest(
    now()+interval '30 days',
    v_meeting.end_at+interval '30 days',
    coalesce((select management_token_expires_at from public.public_booking_submissions where meeting_id=p_meeting_id limit 1),'-infinity'::timestamptz),
    case when v_has_existing then v_existing.management_token_expires_at else '-infinity'::timestamptz end
  );

  insert into public.sales_meeting_customer_access(
    meeting_id,management_token,management_token_expires_at,booking_reference,source,
    contact_name,email,company_name,service_interest,visitor_timezone,status,updated_at
  ) values(
    p_meeting_id,v_token,v_expires,v_reference,v_source,
    left(v_contact,160),left(v_email,320),left(v_company,200),left(v_service,250),v_timezone,
    case when v_meeting.status='Cancelled' then 'Cancelled' else 'Confirmed' end,now()
  ) on conflict(meeting_id) do update set
    management_token=excluded.management_token,
    management_token_expires_at=excluded.management_token_expires_at,
    booking_reference=excluded.booking_reference,
    source=case when excluded.source='public_booking' then 'public_booking' else public.sales_meeting_customer_access.source end,
    contact_name=excluded.contact_name,email=excluded.email,company_name=excluded.company_name,
    service_interest=excluded.service_interest,visitor_timezone=excluded.visitor_timezone,status=excluded.status,updated_at=now();
  return v_token;
end;
$function$;
revoke all on function public.service_ensure_meeting_customer_access(uuid,text,uuid,text) from public,anon,authenticated;

create or replace function public.service_prepare_public_booking_management_expiry()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_end timestamptz;
begin
  select end_at into v_end from public.sales_meetings where id=new.meeting_id;
  if v_end is not null then
    new.management_token_expires_at:=greatest(coalesce(new.management_token_expires_at,now()+interval '30 days'),v_end+interval '30 days');
  end if;
  return new;
end;
$function$;
revoke all on function public.service_prepare_public_booking_management_expiry() from public,anon,authenticated;

drop trigger if exists trg_aaa_prepare_public_booking_management_expiry on public.public_booking_submissions;
create trigger trg_aaa_prepare_public_booking_management_expiry
before insert or update of meeting_id,management_token_expires_at
on public.public_booking_submissions
for each row execute function public.service_prepare_public_booking_management_expiry();

create or replace function public.service_sync_public_booking_meeting_access()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  perform public.service_ensure_meeting_customer_access(new.meeting_id,'public_booking',new.management_token,new.visitor_timezone);
  update public.sales_meeting_customer_access
  set booking_reference=new.booking_reference,contact_name=new.contact_name,email=lower(trim(new.email)),
      company_name=new.company_name,service_interest=new.service_interest,visitor_timezone=new.visitor_timezone,
      status=new.status,management_token=new.management_token,
      management_token_expires_at=greatest(management_token_expires_at,new.management_token_expires_at),
      source='public_booking',updated_at=now()
  where meeting_id=new.meeting_id;
  return new;
end;
$function$;
revoke all on function public.service_sync_public_booking_meeting_access() from public,anon,authenticated;

drop trigger if exists trg_aab_sync_public_booking_meeting_access on public.public_booking_submissions;
create trigger trg_aab_sync_public_booking_meeting_access
after insert or update of contact_name,email,company_name,service_interest,visitor_timezone,status,management_token,management_token_expires_at
on public.public_booking_submissions
for each row execute function public.service_sync_public_booking_meeting_access();

create or replace function public.build_sales_meeting_notification_payload(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_payload jsonb; v_base_url text;
begin
  select coalesce(nullif(config_value->>'publicBaseUrl',''),'https://www.profoxwebdesigner.com') into v_base_url
  from public.system_configuration where config_key='notification_settings';
  v_base_url:=rtrim(coalesce(v_base_url,'https://www.profoxwebdesigner.com'),'/');
  select jsonb_build_object(
    'meetingId',m.id,'crmLeadId',public.service_meeting_crm_lead_id(m.id),'bookingReference',a.booking_reference,
    'contactName',a.contact_name,'email',a.email,'companyName',a.company_name,
    'serviceInterest',coalesce(nullif(a.service_interest,''),m.meeting_type),
    'expertName',coalesce(nullif(bp.display_name,''),up.full_name,'ProFox Specialist'),
    'ownerName',coalesce(nullif(up.full_name,''),'ProFox Specialist'),
    'ownerFirstName',coalesce(nullif(split_part(trim(coalesce(up.full_name,'')),' ',1),''),'ProFox'),
    'sellerEmail',coalesce(up.email,''),'sellerUserId',m.salesperson_id,
    'startAt',m.start_at,'endAt',m.end_at,'sellerTimezone',m.timezone,'visitorTimezone',a.visitor_timezone,
    'meetingType',m.meeting_type,'meetingUrl',m.meeting_url,
    'joinUrl',case when trim(coalesce(m.meeting_url,''))<>'' then m.meeting_url else v_base_url||'/manage-booking/'||a.management_token::text end,
    'manageUrl',v_base_url||'/manage-booking/'||a.management_token::text,
    'bookingPageUrl',v_base_url||'/book-a-meeting','meetingPrepUrl',v_base_url||'/admin/meeting-prep/'||m.id::text,
    'crmUrl',v_base_url||'/admin/app/crm','websiteUrl',v_base_url,'attendanceStatus',a.attendance_status,
    'customerSummary',m.customer_summary,'customerNextStep',m.customer_next_step,'customerNextStepTiming',m.customer_next_step_timing,
    'projectGoal',coalesce(b.qualification_answers->>'project_goal',''),'budgetRange',coalesce(b.qualification_answers->>'budget_range',''),
    'timeline',coalesce(b.qualification_answers->>'timeline',''),'decisionMaker',coalesce(b.qualification_answers->>'decision_maker','')
  ) into v_payload
  from public.sales_meetings m
  join public.sales_meeting_customer_access a on a.meeting_id=m.id
  join public.user_profiles up on up.id=m.salesperson_id
  left join public.public_booking_profiles bp on bp.salesperson_id=m.salesperson_id
  left join public.public_booking_submissions b on b.meeting_id=m.id
  where m.id=p_meeting_id;
  return coalesce(v_payload,'{}'::jsonb);
end;
$function$;
revoke all on function public.build_sales_meeting_notification_payload(uuid) from public,anon,authenticated;

create or replace function public.build_sales_meeting_customer_payload(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_base jsonb; v_owner uuid;
begin
  v_base:=public.build_sales_meeting_notification_payload(p_meeting_id);
  if v_base='{}'::jsonb then return v_base; end if;
  v_owner:=nullif(v_base->>'sellerUserId','')::uuid;
  return public.service_build_customer_communication_payload(v_owner,v_base->>'contactName',v_base->>'companyName',v_base);
end;
$function$;
revoke all on function public.build_sales_meeting_customer_payload(uuid) from public,anon,authenticated;

create or replace function public.get_public_booking_management(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_result jsonb;
begin
  if p_token is null then raise exception 'Booking access token is required.'; end if;
  select jsonb_build_object(
    'bookingReference',a.booking_reference,'status',a.status,'contactName',a.contact_name,'email',a.email,
    'companyName',a.company_name,'serviceInterest',coalesce(nullif(a.service_interest,''),m.meeting_type),
    'visitorTimezone',a.visitor_timezone,'startAt',m.start_at,'endAt',m.end_at,'sellerTimezone',m.timezone,
    'meetingStatus',m.status,'meetingType',m.meeting_type,'meetingUrl',m.meeting_url,'salespersonId',m.salesperson_id,
    'expertName',coalesce(nullif(bp.display_name,''),up.full_name,'ProFox Specialist'),
    'expertHeadline',coalesce(bp.headline,''),'expertCountry',coalesce(nullif(bp.country,''),up.country,''),
    'expertAvatarUrl',coalesce(nullif(bp.avatar_url,''),up.avatar_url,''),'attendanceStatus',a.attendance_status,
    'canReschedule',(a.status='Confirmed' and m.status in ('Scheduled','Rescheduled') and a.management_token_expires_at>now()),
    'canCancel',(a.status='Confirmed' and m.status in ('Scheduled','Rescheduled') and a.management_token_expires_at>now()),
    'tokenExpiresAt',a.management_token_expires_at
  ) into v_result
  from public.sales_meeting_customer_access a join public.sales_meetings m on m.id=a.meeting_id
  join public.user_profiles up on up.id=m.salesperson_id left join public.public_booking_profiles bp on bp.salesperson_id=m.salesperson_id
  where a.management_token=p_token;
  if v_result is null then raise exception 'Booking not found.'; end if;
  return v_result;
end;
$function$;
grant execute on function public.get_public_booking_management(uuid) to anon,authenticated;

create or replace function public.get_public_reschedule_slots(p_token uuid,p_from_date date default null,p_days integer default 14)
returns table(start_at timestamptz,end_at timestamptz,timezone text,duration_minutes integer)
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_access public.sales_meeting_customer_access%rowtype; v_meeting public.sales_meetings%rowtype;
  v_timezone text; v_working_days integer[]; v_work_start time; v_work_end time; v_duration integer;
  v_slot_interval integer; v_max_advance integer; v_today date; v_start_date date; v_end_date date; v_days integer;
begin
  if p_token is null then return; end if;
  select * into v_access from public.sales_meeting_customer_access where management_token=p_token;
  if not found or v_access.management_token_expires_at<=now() or v_access.status<>'Confirmed' then return; end if;
  select * into v_meeting from public.sales_meetings where id=v_access.meeting_id;
  if not found or v_meeting.status not in ('Scheduled','Rescheduled') then return; end if;
  select c.timezone,c.working_days,c.work_start,c.work_end,
         round(extract(epoch from (v_meeting.end_at-v_meeting.start_at))/60.0)::integer,
         least(greatest(coalesce((pbs.config_value->>'slotIntervalMinutes')::integer,15),5),120),
         least(greatest(coalesce((pbs.config_value->>'maxAdvanceDays')::integer,60),1),365)
    into v_timezone,v_working_days,v_work_start,v_work_end,v_duration,v_slot_interval,v_max_advance
  from public.user_calendar_settings c left join public.system_configuration pbs on pbs.config_key='public_booking_settings'
  where c.user_id=v_meeting.salesperson_id and c.active is true;
  if not found then return; end if;
  v_days:=least(greatest(coalesce(p_days,14),1),31); v_today:=(now() at time zone v_timezone)::date;
  v_start_date:=greatest(coalesce(p_from_date,v_today),v_today); v_end_date:=least(v_start_date+(v_days-1),v_today+v_max_advance);
  if v_start_date>v_end_date then return; end if;
  return query with dates as (
    select gs::date d from generate_series(v_start_date::timestamp,v_end_date::timestamp,interval '1 day') gs
    where extract(dow from gs)::integer=any(v_working_days)
  ), candidates as (
    select ((d.d+v_work_start)+(n*make_interval(mins=>v_slot_interval))) at time zone v_timezone slot_start
    from dates d cross join lateral generate_series(0,floor(greatest(extract(epoch from ((d.d+v_work_end)-(d.d+v_work_start)-make_interval(mins=>v_duration)))/60.0,-1)/v_slot_interval)::integer) n
  )
  select c.slot_start,c.slot_start+make_interval(mins=>v_duration),v_timezone,v_duration
  from candidates c where public.is_public_reschedule_slot_available(v_meeting.salesperson_id,c.slot_start,v_duration,v_meeting.id)
  order by c.slot_start limit 500;
end;
$function$;
grant execute on function public.get_public_reschedule_slots(uuid,date,integer) to anon,authenticated;

create or replace function public.confirm_meeting_attendance(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_access public.sales_meeting_customer_access%rowtype; v_owner uuid;
begin
  if p_token is null then raise exception 'Booking access token is required.'; end if;
  select * into v_access from public.sales_meeting_customer_access where management_token=p_token for update;
  if not found or v_access.management_token_expires_at<=now() then raise exception 'Booking management link is invalid or expired.'; end if;
  if v_access.status<>'Confirmed' then raise exception 'This meeting is no longer active.'; end if;
  select salesperson_id into v_owner from public.sales_meetings where id=v_access.meeting_id and status in ('Scheduled','Rescheduled');
  if v_owner is null then raise exception 'This meeting can no longer be confirmed.'; end if;
  update public.sales_meeting_customer_access
  set attendance_status='Confirmed',attendance_confirmed_at=coalesce(attendance_confirmed_at,now()),updated_at=now()
  where meeting_id=v_access.meeting_id;
  perform public.enqueue_in_app_notification(v_owner,'Attendance confirmed',
    'Customer confirmed attendance - '||coalesce(nullif(v_access.company_name,''),v_access.contact_name),
    v_access.contact_name||' confirmed the scheduled meeting.',
    '/admin/meeting-prep/'||v_access.meeting_id::text,'inapp-attendance-confirmed:'||v_access.meeting_id::text);
  return public.get_public_booking_management(p_token);
end;
$function$;
grant execute on function public.confirm_meeting_attendance(uuid) to anon,authenticated;

create or replace function public.reschedule_public_booking(p_token uuid,p_start_at timestamptz,p_visitor_timezone text default 'UTC')
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_access public.sales_meeting_customer_access%rowtype; v_meeting public.sales_meetings%rowtype; v_duration integer; v_end_at timestamptz; v_visitor_timezone text;
begin
  if p_token is null or p_start_at is null then raise exception 'Booking token and new meeting time are required.'; end if;
  select * into v_access from public.sales_meeting_customer_access where management_token=p_token for update;
  if not found or v_access.management_token_expires_at<=now() then raise exception 'Booking management link is invalid or expired.'; end if;
  if v_access.status<>'Confirmed' then raise exception 'This booking can no longer be rescheduled.'; end if;
  select * into v_meeting from public.sales_meetings where id=v_access.meeting_id for update;
  if not found or v_meeting.status not in ('Scheduled','Rescheduled') then raise exception 'This meeting can no longer be rescheduled.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('public-booking:'||v_meeting.salesperson_id::text,0));
  v_duration:=round(extract(epoch from (v_meeting.end_at-v_meeting.start_at))/60.0)::integer;
  if not public.is_public_reschedule_slot_available(v_meeting.salesperson_id,p_start_at,v_duration,v_meeting.id) then raise exception 'That time is no longer available. Please choose another slot.'; end if;
  v_end_at:=p_start_at+make_interval(mins=>v_duration); v_visitor_timezone:=coalesce(nullif(trim(p_visitor_timezone),''),v_access.visitor_timezone,'UTC');
  if not exists(select 1 from pg_timezone_names where name=v_visitor_timezone) then v_visitor_timezone:='UTC'; end if;
  update public.sales_meeting_customer_access set visitor_timezone=v_visitor_timezone,attendance_status='Pending',attendance_confirmed_at=null,
    management_token_expires_at=greatest(management_token_expires_at,v_end_at+interval '30 days'),updated_at=now() where meeting_id=v_meeting.id;
  update public.sales_meetings set start_at=p_start_at,end_at=v_end_at,status='Rescheduled',rescheduled_at=now(),updated_at=now() where id=v_meeting.id;
  if v_meeting.activity_id is not null then update public.crm_activities set due_at=p_start_at,status='Scheduled',updated_at=now() where id=v_meeting.activity_id; end if;
  if v_meeting.opportunity_id is not null then update public.crm_opportunities set meeting_at=p_start_at,updated_at=now() where id=v_meeting.opportunity_id; end if;
  update public.public_booking_submissions set visitor_timezone=v_visitor_timezone,status='Confirmed',management_token_expires_at=greatest(management_token_expires_at,v_end_at+interval '30 days'),updated_at=now() where meeting_id=v_meeting.id;
  return public.get_public_booking_management(p_token);
end;
$function$;
grant execute on function public.reschedule_public_booking(uuid,timestamptz,text) to anon,authenticated;

create or replace function public.cancel_public_booking(p_token uuid,p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_access public.sales_meeting_customer_access%rowtype; v_meeting public.sales_meetings%rowtype;
begin
  if p_token is null then raise exception 'Booking token is required.'; end if;
  select * into v_access from public.sales_meeting_customer_access where management_token=p_token for update;
  if not found or v_access.management_token_expires_at<=now() then raise exception 'Booking management link is invalid or expired.'; end if;
  if v_access.status='Cancelled' then return public.get_public_booking_management(p_token); end if;
  select * into v_meeting from public.sales_meetings where id=v_access.meeting_id for update;
  if not found or v_meeting.status not in ('Scheduled','Rescheduled') then raise exception 'This meeting can no longer be cancelled.'; end if;
  update public.sales_meeting_customer_access set status='Cancelled',updated_at=now() where meeting_id=v_meeting.id;
  update public.sales_meetings set status='Cancelled',cancelled_at=now(),outcome=case when trim(coalesce(p_reason,''))<>'' then left(trim(p_reason),2000) else outcome end,updated_at=now() where id=v_meeting.id;
  if v_meeting.activity_id is not null then update public.crm_activities set status='Cancelled',notes=trim(concat_ws(E'\n',nullif(notes,''),nullif(left(trim(coalesce(p_reason,'')),1000),''))),updated_at=now() where id=v_meeting.activity_id; end if;
  update public.public_booking_submissions set status='Cancelled',updated_at=now() where meeting_id=v_meeting.id;
  return public.get_public_booking_management(p_token);
end;
$function$;
grant execute on function public.cancel_public_booking(uuid,text) to anon,authenticated;

create or replace function public.save_sales_meeting_customer_followup(p_meeting_id uuid,p_customer_summary text default '',p_customer_next_step text default '',p_customer_next_step_timing text default '')
returns public.sales_meetings
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_meeting public.sales_meetings%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_meeting from public.sales_meetings where id=p_meeting_id for update;
  if not found then raise exception 'Meeting not found.'; end if;
  if not public.is_admin() and (v_meeting.salesperson_id<>auth.uid() or not public.has_active_role(array['sales']::text[])) then raise exception 'Unauthorized meeting update.'; end if;
  update public.sales_meetings set customer_summary=left(trim(coalesce(p_customer_summary,'')),4000),customer_next_step=left(trim(coalesce(p_customer_next_step,'')),2000),customer_next_step_timing=left(trim(coalesce(p_customer_next_step_timing,'')),1000),updated_at=now()
  where id=p_meeting_id returning * into v_meeting;
  return v_meeting;
end;
$function$;
grant execute on function public.save_sales_meeting_customer_followup(uuid,text,text,text) to authenticated;

insert into public.sales_meeting_customer_access(meeting_id,management_token,management_token_expires_at,booking_reference,source,contact_name,email,company_name,service_interest,visitor_timezone,status,created_at,updated_at)
select b.meeting_id,b.management_token,greatest(b.management_token_expires_at,m.end_at+interval '30 days'),b.booking_reference,'public_booking',b.contact_name,lower(trim(b.email)),b.company_name,b.service_interest,b.visitor_timezone,b.status,b.created_at,now()
from public.public_booking_submissions b join public.sales_meetings m on m.id=b.meeting_id
on conflict(meeting_id) do update set management_token=excluded.management_token,management_token_expires_at=excluded.management_token_expires_at,booking_reference=excluded.booking_reference,source='public_booking',contact_name=excluded.contact_name,email=excluded.email,company_name=excluded.company_name,service_interest=excluded.service_interest,visitor_timezone=excluded.visitor_timezone,status=excluded.status,updated_at=now();

update public.public_booking_submissions b set management_token_expires_at=greatest(b.management_token_expires_at,m.end_at+interval '30 days'),updated_at=now()
from public.sales_meetings m where m.id=b.meeting_id and b.management_token_expires_at<m.end_at+interval '30 days';

do $block$
declare r record;
begin
  for r in select id from public.sales_meetings where meeting_type not in ('Recruitment Interview','Mock Sales Call') and (lead_id is not null or opportunity_id is not null or client_id is not null)
  loop perform public.service_ensure_meeting_customer_access(r.id,'crm',null,null); end loop;
end
$block$;
-- Stabilize public lead capture and booking without replacing the existing
-- provider-neutral ProFox Calendar, Google, or Zoho integration layers.

-- A profile must immediately stop accepting public bookings when its staff
-- owner is no longer eligible. Historical profile data remains available.
create or replace function public.trg_pause_ineligible_public_booking_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if new.status <> 'active'
     or new.role not in ('admin','sales','sales_rep','sales_team')
     or (new.role in ('sales','sales_rep','sales_team') and coalesce(new.onboarding_status,'') <> 'completed') then
    update public.public_booking_profiles
    set is_public=false,accepting_bookings=false,updated_at=now()
    where salesperson_id=new.id and (is_public or accepting_bookings);
  end if;
  return new;
end;
$function$;

revoke all on function public.trg_pause_ineligible_public_booking_profile() from public,anon,authenticated;

drop trigger if exists trg_pause_ineligible_public_booking_profile on public.user_profiles;
create trigger trg_pause_ineligible_public_booking_profile
after update of status,role,onboarding_status on public.user_profiles
for each row execute function public.trg_pause_ineligible_public_booking_profile();

-- Correct the legacy two-role validator so every supported Sales role can use
-- the already-built public booking profile system.
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
    where p.id=new.salesperson_id and p.status='active'
      and (
        p.role='admin'
        or (p.role in ('sales','sales_rep','sales_team') and coalesce(p.onboarding_status,'')='completed')
      )
  ) then
    raise exception 'Only an active, onboarding-complete Sales Representative or Administrator may publish a booking profile.';
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

-- Public management links remain high-entropy UUIDs but now expire after
-- 30 days. Rate-limit token claims to prevent request-key/email probing.
alter table public.public_booking_submissions
  alter column management_token_expires_at set default (now()+interval '30 days');

update public.public_booking_submissions
set management_token_expires_at=least(management_token_expires_at,now()+interval '30 days')
where management_token_expires_at>now()+interval '30 days';

create table if not exists public.public_booking_management_rate_limits(
  fingerprint text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now()
);
alter table public.public_booking_management_rate_limits enable row level security;
revoke all on table public.public_booking_management_rate_limits from public,anon,authenticated;

alter function public.claim_public_booking_management_token(uuid,text)
  rename to service_claim_public_booking_management_token_core;

revoke all on function public.service_claim_public_booking_management_token_core(uuid,text) from public,anon,authenticated;

create or replace function public.claim_public_booking_management_token(p_request_key uuid,p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_fingerprint text;
  v_limit public.public_booking_management_rate_limits%rowtype;
  v_result jsonb;
begin
  if p_request_key is null or v_email='' then raise exception 'Booking request and email are required.'; end if;
  v_fingerprint:=encode(extensions.digest(p_request_key::text||':'||v_email,'sha256'),'hex');

  delete from public.public_booking_management_rate_limits where last_attempt_at<now()-interval '1 day';

  insert into public.public_booking_management_rate_limits(fingerprint,attempts,window_started_at,last_attempt_at)
  values(v_fingerprint,0,now(),now())
  on conflict(fingerprint) do nothing;

  select * into v_limit from public.public_booking_management_rate_limits
  where fingerprint=v_fingerprint for update;

  if v_limit.window_started_at<now()-interval '15 minutes' then
    update public.public_booking_management_rate_limits
    set attempts=0,window_started_at=now(),last_attempt_at=now()
    where fingerprint=v_fingerprint;
    v_limit.attempts:=0;
  end if;

  if v_limit.attempts>=10 then
    return jsonb_build_object('error','Too many booking access attempts. Please wait before trying again.');
  end if;

  update public.public_booking_management_rate_limits
  set attempts=attempts+1,last_attempt_at=now()
  where fingerprint=v_fingerprint;

  if not exists(
    select 1 from public.public_booking_submissions b
    where b.request_key=p_request_key and lower(b.email)=v_email and b.management_token_expires_at>now()
  ) then
    return jsonb_build_object('error','Booking access could not be verified.');
  end if;

  v_result:=public.service_claim_public_booking_management_token_core(p_request_key,v_email);
  delete from public.public_booking_management_rate_limits where fingerprint=v_fingerprint;
  return v_result;
end;
$function$;

revoke all on function public.claim_public_booking_management_token(uuid,text) from public;
grant execute on function public.claim_public_booking_management_token(uuid,text) to anon,authenticated;

-- Consent enforcement is introduced behind a live-config switch so the
-- database migration can safely precede the matching frontend deployment.
alter function public.submit_public_crm_lead(jsonb)
  rename to service_submit_public_crm_lead_core;
revoke all on function public.service_submit_public_crm_lead_core(jsonb) from public,anon,authenticated;

create or replace function public.submit_public_crm_lead(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_form jsonb:='{}'::jsonb;
begin
  select coalesce(config_value,'{}'::jsonb) into v_form
  from public.system_configuration where config_key='public_contact_form';
  if coalesce((v_form->>'requirePrivacyConsent')::boolean,false)
     and coalesce((p_payload->>'privacyAccepted')::boolean,false) is not true then
    raise exception 'Please accept the privacy notice before submitting your enquiry.';
  end if;
  return public.service_submit_public_crm_lead_core(p_payload);
end;
$function$;

revoke all on function public.submit_public_crm_lead(jsonb) from public;
grant execute on function public.submit_public_crm_lead(jsonb) to anon,authenticated;

alter function public.book_public_sales_meeting(uuid,uuid,timestamptz,text,text,text,text,text,text,text,text,text,jsonb,text)
  rename to service_book_public_sales_meeting_core;
revoke all on function public.service_book_public_sales_meeting_core(uuid,uuid,timestamptz,text,text,text,text,text,text,text,text,text,jsonb,text) from public,anon,authenticated;

create or replace function public.book_public_sales_meeting(
  p_request_key uuid,p_salesperson_id uuid,p_start_at timestamptz,p_visitor_timezone text,
  p_contact_name text,p_email text,p_phone text,p_company_name text,p_website text,p_country text,
  p_industry text,p_service_interest text,p_qualification_answers jsonb default '{}'::jsonb,p_honeypot text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_settings jsonb:='{}'::jsonb;
begin
  select coalesce(config_value,'{}'::jsonb) into v_settings
  from public.system_configuration where config_key='public_booking_settings';
  if coalesce((v_settings->>'requirePrivacyConsent')::boolean,false)
     and coalesce(p_qualification_answers->>'_privacyConsent','')<>'accepted' then
    raise exception 'Please accept the privacy notice before confirming your meeting.';
  end if;
  return public.service_book_public_sales_meeting_core(
    p_request_key,p_salesperson_id,p_start_at,p_visitor_timezone,p_contact_name,p_email,p_phone,
    p_company_name,p_website,p_country,p_industry,p_service_interest,p_qualification_answers,p_honeypot
  );
end;
$function$;

revoke all on function public.book_public_sales_meeting(uuid,uuid,timestamptz,text,text,text,text,text,text,text,text,text,jsonb,text) from public;
grant execute on function public.book_public_sales_meeting(uuid,uuid,timestamptz,text,text,text,text,text,text,text,text,text,jsonb,text) to anon,authenticated;

-- Keep one shared qualification vocabulary across quote and meeting forms.
do $do$
declare v_cfg jsonb; v_index integer;
begin
  select config_value into v_cfg from public.system_configuration where config_key='public_booking_settings' for update;
  if v_cfg is not null then
    select ordinality::integer-1 into v_index
    from jsonb_array_elements(coalesce(v_cfg->'qualificationQuestions','[]'::jsonb)) with ordinality q(value,ordinality)
    where q.value->>'id'='budget_range' limit 1;
    if v_index is not null then
      v_cfg:=jsonb_set(v_cfg,array['qualificationQuestions',v_index::text,'options'],
        '["Under $1,000","$1,000 - $3,000","$3,000 - $6,000","$6,000 - $15,000","$15,000 - $30,000","$30,000+","Not sure - I need guidance"]'::jsonb,true);
    end if;
    v_cfg:=v_cfg||jsonb_build_object(
      'requirePrivacyConsent',false,
      'privacyConsentText','I agree that ProFox may process this meeting request under the'
    );
    update public.system_configuration set config_value=v_cfg,updated_at=now() where config_key='public_booking_settings';
  end if;

  update public.system_configuration
  set config_value=config_value||jsonb_build_object(
    'requirePrivacyConsent',false,
    'privacyConsentText','I agree to the Privacy Policy and Terms so ProFox can process my enquiry.'
  ),updated_at=now()
  where config_key='public_contact_form';
end;
$do$;

-- Retain audit history but remove stale public flags from every ineligible
-- profile, including retired synthetic identities.
update public.public_booking_profiles b
set is_public=false,accepting_bookings=false,updated_at=now()
where (b.is_public or b.accepting_bookings)
  and not exists(
    select 1 from public.user_profiles p
    where p.id=b.salesperson_id and p.status='active'
      and (p.role='admin' or (p.role in ('sales','sales_rep','sales_team') and coalesce(p.onboarding_status,'')='completed'))
  );

-- Keep rate-limit storage bounded.
delete from public.public_booking_management_rate_limits
where last_attempt_at<now()-interval '1 day';

-- ProFox Talent Partner referral, attribution and performance-reward program.
-- This migration deliberately reuses career_jobs, applicants, projects, payments,
-- sales career progression and the existing user_profiles/Auth foundation.

create table if not exists public.talent_partner_program_settings (
  id text primary key default 'default',
  enabled boolean not null default true,
  attribution_window_days integer not null default 30 check (attribution_window_days between 1 and 180),
  payout_hold_days integer not null default 14 check (payout_hold_days between 0 and 180),
  minimum_payout numeric(14,2) not null default 0 check (minimum_payout >= 0),
  default_currency text not null default 'USD',
  require_admin_approval boolean not null default true,
  terms_version text not null default '2026-08-29',
  updated_by uuid references public.user_profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.talent_partner_program_settings(id)
values ('default')
on conflict (id) do nothing;

create table if not exists public.talent_partner_profiles (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  partner_code text not null unique,
  status text not null default 'Pending' check (status in ('Pending','Active','Suspended','Closed')),
  company_name text,
  website_url text,
  promotion_channels text[] not null default '{}'::text[],
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.user_profiles(id),
  suspended_at timestamptz,
  payout_method text,
  payout_email text,
  preferred_currency text not null default 'USD',
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.talent_partner_reward_plans (
  id uuid primary key default gen_random_uuid(),
  career_job_id uuid not null unique references public.career_jobs(id) on delete cascade,
  enabled boolean not null default false,
  reward_model text not null default 'project' check (reward_model in ('sales','project','none')),
  qualifying_event_count integer not null default 3 check (qualifying_event_count between 1 and 10),
  event_rewards jsonb not null default
    '[{"rank":1,"kind":"percent","ratePercent":0,"fixedAmount":0},{"rank":2,"kind":"percent","ratePercent":0,"fixedAmount":0},{"rank":3,"kind":"percent","ratePercent":0,"fixedAmount":0}]'::jsonb
    check (jsonb_typeof(event_rewards)='array'),
  retention_enabled boolean not null default true,
  retention_months integer not null default 6 check (retention_months between 1 and 60),
  retention_reward_kind text not null default 'fixed' check (retention_reward_kind in ('percent','fixed')),
  retention_rate_percent numeric(8,4) not null default 0 check (retention_rate_percent between 0 and 100),
  retention_fixed_amount numeric(14,2) not null default 0 check (retention_fixed_amount >= 0),
  currency text not null default 'USD',
  payout_hold_days integer check (payout_hold_days is null or payout_hold_days between 0 and 180),
  updated_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.talent_partner_visits (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid not null references public.talent_partner_profiles(user_id) on delete cascade,
  career_job_id uuid references public.career_jobs(id) on delete set null,
  referral_code text not null,
  session_id text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  referrer_host text,
  landing_path text,
  device_category text,
  visitor_timezone text,
  visitor_locale text,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_talent_partner_visits_partner_time
  on public.talent_partner_visits(partner_user_id, occurred_at desc);
create index if not exists idx_talent_partner_visits_session_time
  on public.talent_partner_visits(session_id, occurred_at);
create index if not exists idx_talent_partner_visits_job
  on public.talent_partner_visits(career_job_id, occurred_at desc);

create table if not exists public.talent_partner_referrals (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid not null references public.talent_partner_profiles(user_id) on delete restrict,
  applicant_id uuid not null unique references public.applicants(id) on delete restrict,
  career_job_id uuid not null references public.career_jobs(id) on delete restrict,
  first_visit_id uuid references public.talent_partner_visits(id) on delete set null,
  referral_code_snapshot text not null,
  status text not null default 'Applicant' check (status in ('Applicant','Activated','Closed','Retained')),
  attributed_at timestamptz not null default now(),
  attribution_expires_at timestamptz,
  locked boolean not null default true,
  referred_user_id uuid references public.user_profiles(id) on delete set null,
  activated_at timestamptz,
  closed_at timestamptz,
  override_reason text,
  overridden_by uuid references public.user_profiles(id),
  overridden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_talent_partner_referrals_partner
  on public.talent_partner_referrals(partner_user_id, attributed_at desc);
create index if not exists idx_talent_partner_referrals_worker
  on public.talent_partner_referrals(referred_user_id)
  where referred_user_id is not null;

create table if not exists public.talent_partner_qualifying_projects (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.talent_partner_referrals(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  worker_user_id uuid not null references public.user_profiles(id) on delete restrict,
  qualifying_rank integer not null check (qualifying_rank between 1 and 10),
  worker_payment_amount numeric(14,2) not null check (worker_payment_amount > 0),
  currency text not null,
  approved_at timestamptz not null default now(),
  approved_by uuid not null references public.user_profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  unique(referral_id, project_id),
  unique(referral_id, qualifying_rank)
);

create table if not exists public.talent_partner_salary_transitions (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null unique references public.talent_partner_referrals(id) on delete restrict,
  worker_user_id uuid not null references public.user_profiles(id) on delete restrict,
  source_type text not null default 'admin' check (source_type in ('admin','sales_career_progression')),
  source_review_id uuid references public.sales_career_progression_reviews(id) on delete set null,
  effective_date date not null,
  qualifying_date date not null,
  monthly_salary numeric(14,2),
  currency text not null,
  status text not null default 'Scheduled' check (status in ('Scheduled','Qualified','Cancelled')),
  approved_by uuid references public.user_profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.talent_partner_payout_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null unique,
  status text not null default 'Ready' check (status in ('Ready','Partially Paid','Paid','Cancelled')),
  entry_count integer not null default 0,
  total_amount numeric(14,2) not null default 0,
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.talent_partner_payouts (
  id uuid primary key default gen_random_uuid(),
  payout_batch_id uuid not null references public.talent_partner_payout_batches(id) on delete restrict,
  partner_user_id uuid not null references public.talent_partner_profiles(user_id) on delete restrict,
  currency text not null,
  amount numeric(14,2) not null check (amount >= 0),
  entry_count integer not null default 0,
  status text not null default 'Ready' check (status in ('Ready','Paid','Held','Cancelled')),
  payout_method_snapshot text,
  payout_email_snapshot text,
  transaction_id text,
  hold_reason text,
  paid_at timestamptz,
  paid_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  unique(payout_batch_id, partner_user_id, currency)
);

create table if not exists public.talent_partner_reward_entries (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.talent_partner_referrals(id) on delete restrict,
  partner_user_id uuid not null references public.talent_partner_profiles(user_id) on delete restrict,
  career_job_id uuid not null references public.career_jobs(id) on delete restrict,
  event_type text not null check (event_type in ('sale','project','retention')),
  event_rank integer,
  source_payment_id uuid references public.payments(id) on delete set null,
  source_quotation_id uuid references public.quotations(id) on delete set null,
  source_project_id uuid references public.projects(id) on delete set null,
  source_salary_transition_id uuid references public.talent_partner_salary_transitions(id) on delete set null,
  eligible_amount numeric(14,2),
  currency text not null,
  reward_kind text not null check (reward_kind in ('percent','fixed')),
  rate_percent numeric(8,4),
  fixed_amount numeric(14,2),
  reward_amount numeric(14,2) not null check (reward_amount >= 0),
  status text not null default 'Pending' check (status in ('Pending','Approved','Paid','Reversed')),
  available_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.user_profiles(id),
  reversal_reason text,
  reversed_at timestamptz,
  payout_id uuid references public.talent_partner_payouts(id) on delete set null,
  rule_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_talent_partner_reward_sale
  on public.talent_partner_reward_entries(referral_id, source_quotation_id)
  where event_type='sale' and source_quotation_id is not null;
create unique index if not exists uq_talent_partner_reward_project
  on public.talent_partner_reward_entries(referral_id, source_project_id)
  where event_type='project' and source_project_id is not null;
create unique index if not exists uq_talent_partner_reward_retention
  on public.talent_partner_reward_entries(referral_id)
  where event_type='retention';
create index if not exists idx_talent_partner_rewards_partner_status
  on public.talent_partner_reward_entries(partner_user_id, status, available_at);

create table if not exists public.talent_partner_notifications (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid not null references public.talent_partner_profiles(user_id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  action_path text,
  dedupe_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.talent_partner_resources (
  id uuid primary key default gen_random_uuid(),
  career_job_id uuid references public.career_jobs(id) on delete cascade,
  title text not null,
  resource_type text not null default 'copy' check (resource_type in ('copy','guide','creative_link')),
  content text,
  resource_url text,
  enabled boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed one configurable reward plan per existing job without turning financial rewards on automatically.
insert into public.talent_partner_reward_plans(career_job_id,reward_model,enabled)
select j.id,
       case
         when j.application_type='sales_representative' or coalesce(j.role_details->>'systemRole','') in ('sales','sales_rep') then 'sales'
         when coalesce(j.role_details->>'systemRole','') in ('content_writer','uiux_designer','developer','web_developer','developer_designer') or j.application_type in ('content_writer') then 'project'
         else 'none'
       end,
       false
from public.career_jobs j
on conflict (career_job_id) do nothing;

create or replace function public.talent_partner_default_reward_model(p_job public.career_jobs)
returns text
language sql
immutable
as $$
  select case
    when p_job.application_type='sales_representative' or coalesce(p_job.role_details->>'systemRole','') in ('sales','sales_rep') then 'sales'
    when coalesce(p_job.role_details->>'systemRole','') in ('content_writer','uiux_designer','developer','web_developer','developer_designer') or p_job.application_type='content_writer' then 'project'
    else 'none'
  end;
$$;

create or replace function public.talent_partner_seed_job_plan()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.talent_partner_reward_plans(career_job_id,reward_model,enabled)
  values(new.id,public.talent_partner_default_reward_model(new),false)
  on conflict (career_job_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_talent_partner_seed_job_plan on public.career_jobs;
create trigger trg_talent_partner_seed_job_plan
after insert on public.career_jobs
for each row execute function public.talent_partner_seed_job_plan();

create or replace function public.talent_partner_new_code()
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_code text;
begin
  loop
    v_code := 'TP' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    exit when not exists(select 1 from public.talent_partner_profiles where partner_code=v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.talent_partner_notify(
  p_partner_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_action_path text default '/talent-partner',
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  if p_partner_user_id is null then return null; end if;
  insert into public.talent_partner_notifications(partner_user_id,type,title,message,action_path,dedupe_key)
  values(p_partner_user_id,left(coalesce(p_type,'update'),80),left(coalesce(p_title,'Update'),200),left(coalesce(p_message,''),3000),left(coalesce(p_action_path,'/talent-partner'),500),nullif(left(coalesce(p_dedupe_key,''),300),''))
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Extend the existing profile privilege guard with a narrow Talent Partner workflow bypass.
create or replace function public.protect_user_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_sales_invite text:=coalesce(current_setting('profox.sales_candidate_invite_rpc',true),'');
  v_content_invite text:=coalesce(current_setting('profox.content_writer_invite_rpc',true),'');
  v_content_activation text:=coalesce(current_setting('profox.content_writer_activation_rpc',true),'');
  v_customer_portal_claim text:=coalesce(current_setting('profox.customer_portal_claim_rpc',true),'');
  v_training_progress_sync text:=coalesce(current_setting('profox.training_progress_sync',true),'');
  v_talent_partner text:=coalesce(current_setting('profox.talent_partner_profile_rpc',true),'');
begin
  if public.is_admin()
     or v_sales_invite='1'
     or v_content_invite='1'
     or v_content_activation='1'
     or v_customer_portal_claim='1'
     or v_training_progress_sync='1'
     or v_talent_partner='1'
  then
    return new;
  end if;

  if auth.uid() is null or old.id<>auth.uid() then
    raise exception 'Unauthorized profile update.';
  end if;

  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.department is distinct from old.department
     or new.manager is distinct from old.manager
     or new.onboarding_status is distinct from old.onboarding_status
     or new.onboarding_progress is distinct from old.onboarding_progress
     or new.email is distinct from old.email
  then
    raise exception 'Privileged profile fields may only be changed by an authorized workflow.';
  end if;

  return new;
end;
$$;

-- External Talent Partners must never be treated as internal staff for professional-mailbox provisioning.
create or replace function public.service_professional_mailbox_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists(
    select 1 from public.user_profiles p
    where p.id=p_user_id
      and lower(coalesce(p.status,''))='active'
      and lower(coalesce(p.onboarding_status,''))='completed'
      and lower(coalesce(p.role,'')) not in ('','customer','client','pending','talent_partner')
  );
$$;

create or replace function public.request_talent_partner_account(
  p_full_name text,
  p_terms_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_profile public.user_profiles%rowtype;
  v_settings public.talent_partner_program_settings%rowtype;
  v_partner public.talent_partner_profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_settings from public.talent_partner_program_settings where id='default';
  if not found or not v_settings.enabled then raise exception 'The Talent Partner program is not currently accepting registrations.'; end if;

  select * into v_profile from public.user_profiles where id=v_uid for update;
  if not found then raise exception 'User profile not found.'; end if;
  if v_profile.role not in ('pending','talent_partner') then
    raise exception 'This account already belongs to another ProFox workspace.';
  end if;

  insert into public.talent_partner_profiles(user_id,partner_code,status,terms_version,terms_accepted_at,preferred_currency)
  values(v_uid,public.talent_partner_new_code(),'Pending',coalesce(nullif(trim(p_terms_version),''),v_settings.terms_version),now(),v_settings.default_currency)
  on conflict (user_id) do update set updated_at=now()
  returning * into v_partner;

  perform set_config('profox.talent_partner_profile_rpc','1',true);
  update public.user_profiles
  set full_name=coalesce(nullif(trim(p_full_name),''),full_name),
      role='talent_partner',
      department='General',
      status=case when v_partner.status='Active' then 'active' else 'pending' end,
      onboarding_status='completed',
      onboarding_progress=100,
      updated_at=now()
  where id=v_uid;

  return jsonb_build_object(
    'success',true,
    'partnerCode',v_partner.partner_code,
    'status',v_partner.status
  );
end;
$$;

create or replace function public.talent_partner_update_my_profile(
  p_company_name text default null,
  p_website_url text default null,
  p_promotion_channels text[] default null,
  p_payout_method text default null,
  p_payout_email text default null,
  p_preferred_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_row public.talent_partner_profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  update public.talent_partner_profiles
  set company_name=nullif(left(trim(coalesce(p_company_name,'')),200),''),
      website_url=nullif(left(trim(coalesce(p_website_url,'')),1000),''),
      promotion_channels=coalesce(p_promotion_channels,promotion_channels),
      payout_method=nullif(left(trim(coalesce(p_payout_method,'')),80),''),
      payout_email=nullif(left(lower(trim(coalesce(p_payout_email,''))),320),''),
      preferred_currency=coalesce(nullif(upper(left(trim(coalesce(p_preferred_currency,'')),3)),''),preferred_currency),
      updated_at=now()
  where user_id=v_uid
  returning * into v_row;
  if not found then raise exception 'Talent Partner profile not found.'; end if;
  return to_jsonb(v_row)-'internal_notes';
end;
$$;

create or replace function public.public_track_talent_partner_visit(
  p_partner_code text,
  p_job_slug text,
  p_session_id text,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_partner public.talent_partner_profiles%rowtype;
  v_job public.career_jobs%rowtype;
  v_settings public.talent_partner_program_settings%rowtype;
  v_visit_id uuid;
  v_session text:=left(trim(coalesce(p_session_id,'')),120);
begin
  select * into v_settings from public.talent_partner_program_settings where id='default';
  if not found or not v_settings.enabled then return jsonb_build_object('success',false,'reason','disabled'); end if;
  if v_session='' then return jsonb_build_object('success',false,'reason','session_required'); end if;

  select * into v_partner
  from public.talent_partner_profiles
  where upper(partner_code)=upper(trim(coalesce(p_partner_code,''))) and status='Active';
  if not found then return jsonb_build_object('success',false,'reason','invalid_partner'); end if;

  if nullif(trim(coalesce(p_job_slug,'')),'') is not null then
    select * into v_job
    from public.career_jobs
    where slug=trim(p_job_slug)
      and status='Published'
      and (closes_at is null or closes_at>now())
    limit 1;
    if not found then return jsonb_build_object('success',false,'reason','invalid_job'); end if;
  end if;

  select id into v_visit_id
  from public.talent_partner_visits
  where partner_user_id=v_partner.user_id
    and session_id=v_session
    and career_job_id is not distinct from v_job.id
    and occurred_at>now()-interval '20 seconds'
  order by occurred_at desc limit 1;

  if v_visit_id is null then
    insert into public.talent_partner_visits(
      partner_user_id,career_job_id,referral_code,session_id,
      utm_source,utm_medium,utm_campaign,utm_content,referrer_host,landing_path,
      device_category,visitor_timezone,visitor_locale
    ) values(
      v_partner.user_id,v_job.id,v_partner.partner_code,v_session,
      nullif(left(trim(coalesce(p_context->>'utmSource','')),200),''),
      nullif(left(trim(coalesce(p_context->>'utmMedium','')),200),''),
      nullif(left(trim(coalesce(p_context->>'utmCampaign','')),300),''),
      nullif(left(trim(coalesce(p_context->>'utmContent','')),300),''),
      nullif(left(lower(trim(coalesce(p_context->>'referrerHost',''))),255),''),
      nullif(left(trim(coalesce(p_context->>'landingPath','')),1000),''),
      nullif(left(trim(coalesce(p_context->>'deviceCategory','')),40),''),
      nullif(left(trim(coalesce(p_context->>'timezone','')),100),''),
      nullif(left(trim(coalesce(p_context->>'locale','')),40),'')
    ) returning id into v_visit_id;
  end if;

  return jsonb_build_object(
    'success',true,
    'visitId',v_visit_id,
    'partnerCode',v_partner.partner_code,
    'attributionWindowDays',v_settings.attribution_window_days
  );
end;
$$;

create or replace function public.public_claim_talent_partner_application(
  p_application_reference text,
  p_email text,
  p_partner_code text,
  p_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_visit public.talent_partner_visits%rowtype;
  v_settings public.talent_partner_program_settings%rowtype;
  v_partner_email text;
  v_referral_id uuid;
begin
  select * into v_settings from public.talent_partner_program_settings where id='default';
  if not found or not v_settings.enabled then return jsonb_build_object('success',false,'reason','disabled'); end if;

  select * into v_app
  from public.applicants
  where application_reference=trim(coalesce(p_application_reference,''))
    and lower(trim(email))=lower(trim(coalesce(p_email,'')))
  for update;
  if not found then return jsonb_build_object('success',false,'reason','application_not_found'); end if;

  if v_app.created_at < now()-interval '2 hours' then
    return jsonb_build_object('success',false,'reason','claim_window_closed');
  end if;

  select v.* into v_visit
  from public.talent_partner_visits v
  join public.talent_partner_profiles tp on tp.user_id=v.partner_user_id and tp.status='Active'
  where v.session_id=left(trim(coalesce(p_session_id,'')),120)
    and v.career_job_id=v_app.career_job_id
    and v.occurred_at >= now()-(v_settings.attribution_window_days||' days')::interval
  order by v.occurred_at asc
  limit 1;

  if not found then return jsonb_build_object('success',false,'reason','valid_first_touch_not_found'); end if;

  select email into v_partner_email from public.user_profiles where id=v_visit.partner_user_id;
  if lower(trim(coalesce(v_partner_email,'')))=lower(trim(coalesce(v_app.email,''))) then
    return jsonb_build_object('success',false,'reason','self_referral_blocked');
  end if;

  select id into v_referral_id from public.talent_partner_referrals where applicant_id=v_app.id;
  if v_referral_id is not null then
    return jsonb_build_object('success',true,'referralId',v_referral_id,'alreadyAttributed',true);
  end if;

  insert into public.talent_partner_referrals(
    partner_user_id,applicant_id,career_job_id,first_visit_id,referral_code_snapshot,
    attribution_expires_at,referred_user_id,status,activated_at
  ) values(
    v_visit.partner_user_id,v_app.id,v_app.career_job_id,v_visit.id,v_visit.referral_code,
    v_visit.occurred_at+(v_settings.attribution_window_days||' days')::interval,
    v_app.linked_user_id,
    case when v_app.stage='Activated' then 'Activated' else 'Applicant' end,
    case when v_app.stage='Activated' then coalesce(v_app.stage_entered_at,v_app.updated_at,now()) else null end
  ) returning id into v_referral_id;

  insert into public.applicant_events(
    applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata,occurred_at
  ) values(
    v_app.id,'Attribution','talent_partner_referral','Talent Partner referral attributed',
    'First valid Talent Partner referral attribution was locked for this application.',
    'system','talent_partner_referrals',v_referral_id,
    jsonb_build_object('partnerUserId',v_visit.partner_user_id,'careerJobId',v_app.career_job_id,'firstVisitId',v_visit.id),
    now()
  );

  perform public.talent_partner_notify(
    v_visit.partner_user_id,'application','New referred application',
    'A candidate applied through one of your Talent Partner links. Their recruitment progress is now tracked in your dashboard.',
    '/talent-partner','tp-application:'||v_referral_id::text
  );

  return jsonb_build_object('success',true,'referralId',v_referral_id,'alreadyAttributed',false);
end;
$$;

create or replace function public.talent_partner_sync_referral_from_applicant()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_ref public.talent_partner_referrals%rowtype;
begin
  select * into v_ref from public.talent_partner_referrals where applicant_id=new.id for update;
  if not found then return new; end if;

  if new.linked_user_id is not null and v_ref.referred_user_id is distinct from new.linked_user_id then
    update public.talent_partner_referrals
    set referred_user_id=new.linked_user_id,updated_at=now()
    where id=v_ref.id;
  end if;

  if new.stage='Activated' and old.stage is distinct from 'Activated' then
    update public.talent_partner_referrals
    set status='Activated',
        referred_user_id=coalesce(new.linked_user_id,referred_user_id),
        activated_at=coalesce(new.stage_entered_at,now()),
        closed_at=null,
        updated_at=now()
    where id=v_ref.id;
    perform public.talent_partner_notify(
      v_ref.partner_user_id,'activation','Your referral was activated',
      'A referred candidate completed the ProFox recruitment process and has been activated. Performance rewards will follow the configured job reward plan.',
      '/talent-partner','tp-activation:'||v_ref.id::text
    );
  elsif coalesce(trim(new.refusal_reason),'')<>'' and coalesce(trim(old.refusal_reason),'')='' then
    update public.talent_partner_referrals
    set status='Closed',closed_at=now(),updated_at=now()
    where id=v_ref.id and status<>'Retained';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_talent_partner_sync_referral_from_applicant on public.applicants;
create trigger trg_talent_partner_sync_referral_from_applicant
after update of stage,linked_user_id,refusal_reason on public.applicants
for each row execute function public.talent_partner_sync_referral_from_applicant();

create or replace function public.talent_partner_event_rule(
  p_plan public.talent_partner_reward_plans,
  p_rank integer,
  p_eligible_amount numeric
)
returns jsonb
language plpgsql
stable
set search_path=public,pg_temp
as $$
declare v_rule jsonb; v_kind text; v_rate numeric:=0; v_fixed numeric:=0; v_amount numeric:=0;
begin
  select value into v_rule
  from jsonb_array_elements(coalesce(p_plan.event_rewards,'[]'::jsonb)) value
  where coalesce((value->>'rank')::integer,0)=p_rank
  limit 1;
  if v_rule is null then return jsonb_build_object('configured',false,'amount',0); end if;
  v_kind:=case when lower(coalesce(v_rule->>'kind','percent'))='fixed' then 'fixed' else 'percent' end;
  begin v_rate:=greatest(0,least(100,coalesce((v_rule->>'ratePercent')::numeric,0))); exception when others then v_rate:=0; end;
  begin v_fixed:=greatest(0,coalesce((v_rule->>'fixedAmount')::numeric,0)); exception when others then v_fixed:=0; end;
  v_amount:=case when v_kind='fixed' then v_fixed else round(greatest(0,coalesce(p_eligible_amount,0))*v_rate/100.0,2) end;
  return jsonb_build_object('configured',v_amount>0,'kind',v_kind,'ratePercent',v_rate,'fixedAmount',v_fixed,'amount',v_amount,'raw',v_rule);
end;
$$;

create or replace function public.talent_partner_generate_sale_reward(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_pay public.payments%rowtype;
  v_ref public.talent_partner_referrals%rowtype;
  v_plan public.talent_partner_reward_plans%rowtype;
  v_rank integer;
  v_first_payment public.payments%rowtype;
  v_rule jsonb;
  v_amount numeric;
  v_hold integer;
  v_id uuid;
begin
  select * into v_pay from public.payments where id=p_payment_id;
  if not found or v_pay.status<>'Verified' or v_pay.quotation_id is null or v_pay.salesperson_id is null then return null; end if;

  select * into v_ref
  from public.talent_partner_referrals
  where referred_user_id=v_pay.salesperson_id and status in ('Activated','Retained')
  order by activated_at nulls last,attributed_at
  limit 1;
  if not found then return null; end if;

  select * into v_plan from public.talent_partner_reward_plans where career_job_id=v_ref.career_job_id;
  if not found or not v_plan.enabled or v_plan.reward_model<>'sales' then return null; end if;

  with first_verified as (
    select quotation_id,min(coalesce(verified_at,paid_at,created_at)) first_at
    from public.payments
    where salesperson_id=v_pay.salesperson_id and status='Verified' and quotation_id is not null
    group by quotation_id
  ), ranked as (
    select quotation_id,row_number() over(order by first_at,quotation_id)::integer sale_rank
    from first_verified
  )
  select sale_rank into v_rank from ranked where quotation_id=v_pay.quotation_id;

  if v_rank is null or v_rank>v_plan.qualifying_event_count then return null; end if;
  if exists(select 1 from public.talent_partner_reward_entries where referral_id=v_ref.id and event_type='sale' and source_quotation_id=v_pay.quotation_id) then
    select id into v_id from public.talent_partner_reward_entries where referral_id=v_ref.id and event_type='sale' and source_quotation_id=v_pay.quotation_id;
    return v_id;
  end if;

  select * into v_first_payment
  from public.payments
  where salesperson_id=v_pay.salesperson_id and quotation_id=v_pay.quotation_id and status='Verified'
  order by coalesce(verified_at,paid_at,created_at),created_at
  limit 1;

  v_rule:=public.talent_partner_event_rule(v_plan,v_rank,coalesce(nullif(v_first_payment.amount_paid,0),v_first_payment.amount_due));
  if not coalesce((v_rule->>'configured')::boolean,false) then return null; end if;
  v_amount:=(v_rule->>'amount')::numeric;
  select coalesce(v_plan.payout_hold_days,s.payout_hold_days) into v_hold
  from public.talent_partner_program_settings s where s.id='default';

  insert into public.talent_partner_reward_entries(
    referral_id,partner_user_id,career_job_id,event_type,event_rank,
    source_payment_id,source_quotation_id,eligible_amount,currency,reward_kind,rate_percent,fixed_amount,reward_amount,
    status,available_at,rule_snapshot
  ) values(
    v_ref.id,v_ref.partner_user_id,v_ref.career_job_id,'sale',v_rank,
    v_first_payment.id,v_pay.quotation_id,coalesce(nullif(v_first_payment.amount_paid,0),v_first_payment.amount_due),coalesce(v_first_payment.currency,v_plan.currency),
    v_rule->>'kind',(v_rule->>'ratePercent')::numeric,(v_rule->>'fixedAmount')::numeric,v_amount,
    'Pending',now()+make_interval(days=>coalesce(v_hold,0)),
    jsonb_build_object('planId',v_plan.id,'rank',v_rank,'rule',v_rule,'capturedAt',now())
  ) returning id into v_id;

  perform public.talent_partner_notify(
    v_ref.partner_user_id,'reward','Referral reward earned',
    'Your referred seller completed qualifying sale #'||v_rank::text||'. A reward of '||coalesce(v_first_payment.currency,v_plan.currency)||' '||to_char(v_amount,'FM999999990.00')||' is pending the configured payout controls.',
    '/talent-partner','tp-sale-reward:'||v_id::text
  );
  return v_id;
end;
$$;

create or replace function public.talent_partner_payment_reward_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.status='Verified' and (tg_op='INSERT' or old.status is distinct from 'Verified') then
    perform public.talent_partner_generate_sale_reward(new.id);
  elsif tg_op='UPDATE' and old.status='Verified' and new.status is distinct from 'Verified' then
    update public.talent_partner_reward_entries
    set status='Reversed',reversal_reason='Source payment is no longer Verified.',reversed_at=now(),updated_at=now()
    where event_type='sale'
      and source_payment_id=new.id
      and status in ('Pending','Approved');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_talent_partner_payment_reward on public.payments;
create trigger trg_talent_partner_payment_reward
after insert or update of status on public.payments
for each row execute function public.talent_partner_payment_reward_trigger();

create or replace function public.admin_approve_talent_partner_project_reward(
  p_referral_id uuid,
  p_project_id uuid,
  p_worker_payment_amount numeric,
  p_currency text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_ref public.talent_partner_referrals%rowtype;
  v_plan public.talent_partner_reward_plans%rowtype;
  v_project public.projects%rowtype;
  v_rank integer;
  v_rule jsonb;
  v_qid uuid;
  v_reward_id uuid;
  v_hold integer;
  v_currency text:=upper(trim(coalesce(p_currency,'')));
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_worker_payment_amount is null or p_worker_payment_amount<=0 then raise exception 'A positive approved worker payment amount is required.'; end if;
  if v_currency='' then raise exception 'Currency is required.'; end if;

  select * into v_ref from public.talent_partner_referrals where id=p_referral_id for update;
  if not found or v_ref.referred_user_id is null or v_ref.status not in ('Activated','Retained') then
    raise exception 'An activated referred worker is required.';
  end if;

  select * into v_plan from public.talent_partner_reward_plans where career_job_id=v_ref.career_job_id;
  if not found or not v_plan.enabled or v_plan.reward_model<>'project' then raise exception 'The job does not have an active project reward plan.'; end if;

  select * into v_project from public.projects where id=p_project_id;
  if not found or v_project.status<>'Completed' or v_project.stage<>'Completed' or v_project.completed_at is null then
    raise exception 'Only a fully completed project can qualify.';
  end if;
  if not exists(select 1 from public.project_team where project_id=p_project_id and user_id=v_ref.referred_user_id) then
    raise exception 'The referred worker is not assigned to this project.';
  end if;
  if exists(select 1 from public.talent_partner_qualifying_projects where referral_id=v_ref.id and project_id=p_project_id) then
    raise exception 'This project has already been counted for this referral.';
  end if;

  select count(*)+1 into v_rank from public.talent_partner_qualifying_projects where referral_id=v_ref.id;
  if v_rank>v_plan.qualifying_event_count then raise exception 'The configured number of qualifying project rewards has already been reached.'; end if;
  v_rule:=public.talent_partner_event_rule(v_plan,v_rank,p_worker_payment_amount);
  if not coalesce((v_rule->>'configured')::boolean,false) then raise exception 'Reward #'||v_rank::text||' is not configured with a positive amount or percentage.'; end if;

  insert into public.talent_partner_qualifying_projects(
    referral_id,project_id,worker_user_id,qualifying_rank,worker_payment_amount,currency,approved_by,notes
  ) values(
    v_ref.id,p_project_id,v_ref.referred_user_id,v_rank,p_worker_payment_amount,v_currency,auth.uid(),nullif(left(trim(coalesce(p_notes,'')),3000),'')
  ) returning id into v_qid;

  select coalesce(v_plan.payout_hold_days,s.payout_hold_days) into v_hold
  from public.talent_partner_program_settings s where s.id='default';

  insert into public.talent_partner_reward_entries(
    referral_id,partner_user_id,career_job_id,event_type,event_rank,source_project_id,eligible_amount,currency,
    reward_kind,rate_percent,fixed_amount,reward_amount,status,available_at,rule_snapshot
  ) values(
    v_ref.id,v_ref.partner_user_id,v_ref.career_job_id,'project',v_rank,p_project_id,p_worker_payment_amount,v_currency,
    v_rule->>'kind',(v_rule->>'ratePercent')::numeric,(v_rule->>'fixedAmount')::numeric,(v_rule->>'amount')::numeric,
    'Pending',now()+make_interval(days=>coalesce(v_hold,0)),
    jsonb_build_object('planId',v_plan.id,'qualifyingProjectId',v_qid,'rank',v_rank,'rule',v_rule,'capturedAt',now())
  ) returning id into v_reward_id;

  perform public.talent_partner_notify(
    v_ref.partner_user_id,'reward','Project referral reward earned',
    'Your referred team member completed qualifying project #'||v_rank::text||'. The reward is now pending the configured payout controls.',
    '/talent-partner','tp-project-reward:'||v_reward_id::text
  );
  return jsonb_build_object('success',true,'rank',v_rank,'rewardId',v_reward_id);
end;
$$;

create or replace function public.talent_partner_create_retention_reward(p_transition_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_t public.talent_partner_salary_transitions%rowtype;
  v_ref public.talent_partner_referrals%rowtype;
  v_plan public.talent_partner_reward_plans%rowtype;
  v_amount numeric:=0;
  v_hold integer;
  v_id uuid;
begin
  select * into v_t from public.talent_partner_salary_transitions where id=p_transition_id for update;
  if not found or v_t.status='Cancelled' then return null; end if;
  select * into v_ref from public.talent_partner_referrals where id=v_t.referral_id for update;
  select * into v_plan from public.talent_partner_reward_plans where career_job_id=v_ref.career_job_id;
  if not found or not v_plan.enabled or not v_plan.retention_enabled then return null; end if;
  if current_date<v_t.qualifying_date or current_date<v_t.effective_date then return null; end if;
  if not exists(select 1 from public.user_profiles where id=v_t.worker_user_id and status='active') then return null; end if;

  if v_plan.retention_reward_kind='fixed' then
    v_amount:=v_plan.retention_fixed_amount;
  else
    if coalesce(v_t.monthly_salary,0)<=0 then return null; end if;
    v_amount:=round(v_t.monthly_salary*v_plan.retention_rate_percent/100.0,2);
  end if;
  if coalesce(v_amount,0)<=0 then return null; end if;
  if exists(select 1 from public.talent_partner_reward_entries where referral_id=v_ref.id and event_type='retention') then
    select id into v_id from public.talent_partner_reward_entries where referral_id=v_ref.id and event_type='retention';
    return v_id;
  end if;

  select coalesce(v_plan.payout_hold_days,s.payout_hold_days) into v_hold
  from public.talent_partner_program_settings s where s.id='default';

  insert into public.talent_partner_reward_entries(
    referral_id,partner_user_id,career_job_id,event_type,event_rank,source_salary_transition_id,
    eligible_amount,currency,reward_kind,rate_percent,fixed_amount,reward_amount,status,available_at,rule_snapshot
  ) values(
    v_ref.id,v_ref.partner_user_id,v_ref.career_job_id,'retention',null,v_t.id,
    v_t.monthly_salary,v_t.currency,v_plan.retention_reward_kind,v_plan.retention_rate_percent,v_plan.retention_fixed_amount,v_amount,
    'Pending',now()+make_interval(days=>coalesce(v_hold,0)),
    jsonb_build_object('planId',v_plan.id,'retentionMonths',v_plan.retention_months,'qualifyingDate',v_t.qualifying_date,'capturedAt',now())
  ) returning id into v_id;

  update public.talent_partner_salary_transitions set status='Qualified',qualified_at=now(),updated_at=now() where id=v_t.id;
  update public.talent_partner_referrals set status='Retained',updated_at=now() where id=v_ref.id;

  perform public.talent_partner_notify(
    v_ref.partner_user_id,'retention','Final retention reward earned',
    'Your referred team member reached the configured retention milestone and their salary transition is active. Your final Talent Partner reward is now pending payout controls.',
    '/talent-partner','tp-retention-reward:'||v_id::text
  );
  return v_id;
end;
$$;

create or replace function public.talent_partner_record_salary_transition_internal(
  p_referral_id uuid,
  p_effective_date date,
  p_monthly_salary numeric,
  p_currency text,
  p_source_type text,
  p_source_review_id uuid,
  p_approved_by uuid,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_ref public.talent_partner_referrals%rowtype;
  v_plan public.talent_partner_reward_plans%rowtype;
  v_id uuid;
  v_qualifying date;
begin
  select * into v_ref from public.talent_partner_referrals where id=p_referral_id for update;
  if not found or v_ref.referred_user_id is null or v_ref.activated_at is null then return null; end if;
  select * into v_plan from public.talent_partner_reward_plans where career_job_id=v_ref.career_job_id;
  if not found or not v_plan.enabled or not v_plan.retention_enabled then return null; end if;

  v_qualifying:=(v_ref.activated_at + make_interval(months=>v_plan.retention_months))::date;
  insert into public.talent_partner_salary_transitions(
    referral_id,worker_user_id,source_type,source_review_id,effective_date,qualifying_date,monthly_salary,currency,status,approved_by,notes
  ) values(
    v_ref.id,v_ref.referred_user_id,
    case when p_source_type='sales_career_progression' then 'sales_career_progression' else 'admin' end,
    p_source_review_id,coalesce(p_effective_date,current_date),v_qualifying,
    case when p_monthly_salary is null then null else greatest(0,p_monthly_salary) end,
    coalesce(nullif(upper(trim(coalesce(p_currency,''))),''),v_plan.currency),
    'Scheduled',p_approved_by,nullif(left(trim(coalesce(p_notes,'')),3000),'')
  )
  on conflict (referral_id) do update
  set source_type=excluded.source_type,
      source_review_id=coalesce(excluded.source_review_id,public.talent_partner_salary_transitions.source_review_id),
      effective_date=excluded.effective_date,
      monthly_salary=coalesce(excluded.monthly_salary,public.talent_partner_salary_transitions.monthly_salary),
      currency=excluded.currency,
      approved_by=coalesce(excluded.approved_by,public.talent_partner_salary_transitions.approved_by),
      notes=coalesce(excluded.notes,public.talent_partner_salary_transitions.notes),
      status=case when public.talent_partner_salary_transitions.status='Cancelled' then 'Scheduled' else public.talent_partner_salary_transitions.status end,
      updated_at=now()
  returning id into v_id;

  perform public.talent_partner_create_retention_reward(v_id);
  return v_id;
end;
$$;

create or replace function public.admin_record_talent_partner_salary_transition(
  p_referral_id uuid,
  p_effective_date date,
  p_monthly_salary numeric default null,
  p_currency text default 'USD',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  v_id:=public.talent_partner_record_salary_transition_internal(
    p_referral_id,coalesce(p_effective_date,current_date),p_monthly_salary,p_currency,'admin',null,auth.uid(),p_notes
  );
  if v_id is null then raise exception 'This referral is not eligible for a configured retention transition.'; end if;
  return jsonb_build_object('success',true,'transitionId',v_id);
end;
$$;

create or replace function public.talent_partner_sales_progression_retention_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_referral_id uuid;
begin
  if new.status='Accepted' and old.status is distinct from 'Accepted' then
    select id into v_referral_id
    from public.talent_partner_referrals
    where referred_user_id=new.salesperson_id and status in ('Activated','Retained')
    order by activated_at nulls last,attributed_at
    limit 1;
    if v_referral_id is not null then
      perform public.talent_partner_record_salary_transition_internal(
        v_referral_id,current_date,new.proposal_monthly_salary,coalesce(new.proposal_currency,'USD'),
        'sales_career_progression',new.id,new.reviewed_by,new.review_notes
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_talent_partner_sales_progression_retention on public.sales_career_progression_reviews;
create trigger trg_talent_partner_sales_progression_retention
after update of status on public.sales_career_progression_reviews
for each row execute function public.talent_partner_sales_progression_retention_trigger();

create or replace function public.admin_refresh_talent_partner_rewards()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_t record; v_p record; v_retention integer:=0; v_sales integer:=0; v_before integer; v_after integer;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;

  select count(*) into v_before from public.talent_partner_reward_entries where event_type='sale';
  for v_p in
    select distinct on (p.salesperson_id,p.quotation_id) p.id
    from public.payments p
    join public.talent_partner_referrals r on r.referred_user_id=p.salesperson_id and r.status in ('Activated','Retained')
    join public.talent_partner_reward_plans rp on rp.career_job_id=r.career_job_id and rp.enabled and rp.reward_model='sales'
    where p.status='Verified' and p.quotation_id is not null
    order by p.salesperson_id,p.quotation_id,coalesce(p.verified_at,p.paid_at,p.created_at),p.created_at
  loop
    perform public.talent_partner_generate_sale_reward(v_p.id);
  end loop;
  select count(*) into v_after from public.talent_partner_reward_entries where event_type='sale';
  v_sales:=greatest(0,v_after-v_before);

  for v_t in select id from public.talent_partner_salary_transitions where status='Scheduled' and effective_date<=current_date and qualifying_date<=current_date
  loop
    if public.talent_partner_create_retention_reward(v_t.id) is not null then v_retention:=v_retention+1; end if;
  end loop;

  return jsonb_build_object('success',true,'newSaleRewards',v_sales,'retentionProcessed',v_retention);
end;
$$;

create or replace function public.admin_set_talent_partner_status(
  p_partner_user_id uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_status text:=initcap(lower(trim(coalesce(p_status,'')))); v_row public.talent_partner_profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_status not in ('Pending','Active','Suspended','Closed') then raise exception 'Invalid Talent Partner status.'; end if;

  update public.talent_partner_profiles
  set status=v_status,
      approved_at=case when v_status='Active' then coalesce(approved_at,now()) else approved_at end,
      approved_by=case when v_status='Active' then auth.uid() else approved_by end,
      suspended_at=case when v_status='Suspended' then now() else null end,
      internal_notes=coalesce(nullif(left(trim(coalesce(p_notes,'')),5000),''),internal_notes),
      updated_at=now()
  where user_id=p_partner_user_id returning * into v_row;
  if not found then raise exception 'Talent Partner not found.'; end if;

  perform set_config('profox.talent_partner_profile_rpc','1',true);
  update public.user_profiles
  set role='talent_partner',
      status=case when v_status='Active' then 'active' else case when v_status in ('Suspended','Closed') then 'inactive' else 'pending' end end,
      onboarding_status='completed',
      onboarding_progress=100,
      updated_at=now()
  where id=p_partner_user_id;

  perform public.talent_partner_notify(
    p_partner_user_id,'account','Talent Partner account '||lower(v_status),
    case when v_status='Active' then 'Your ProFox Talent Partner account is approved. You can now access job links, referral analytics and reward tracking.'
         when v_status='Suspended' then 'Your Talent Partner account is currently suspended. New referral attribution is disabled until the account is reactivated.'
         when v_status='Closed' then 'Your Talent Partner account has been closed.'
         else 'Your Talent Partner account is pending review.' end,
    '/talent-partner','tp-account-status:'||p_partner_user_id::text||':'||lower(v_status)
  );

  return jsonb_build_object('success',true,'status',v_status);
end;
$$;

create or replace function public.admin_save_talent_partner_program_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_row public.talent_partner_program_settings%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  update public.talent_partner_program_settings
  set enabled=coalesce((p_settings->>'enabled')::boolean,enabled),
      attribution_window_days=greatest(1,least(180,coalesce((p_settings->>'attributionWindowDays')::integer,attribution_window_days))),
      payout_hold_days=greatest(0,least(180,coalesce((p_settings->>'payoutHoldDays')::integer,payout_hold_days))),
      minimum_payout=greatest(0,coalesce((p_settings->>'minimumPayout')::numeric,minimum_payout)),
      default_currency=coalesce(nullif(upper(left(trim(coalesce(p_settings->>'defaultCurrency','')),3)),''),default_currency),
      require_admin_approval=coalesce((p_settings->>'requireAdminApproval')::boolean,require_admin_approval),
      terms_version=coalesce(nullif(left(trim(coalesce(p_settings->>'termsVersion','')),80),''),terms_version),
      updated_by=auth.uid(),updated_at=now()
  where id='default' returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_save_talent_partner_reward_plan(
  p_job_id uuid,
  p_enabled boolean,
  p_reward_model text,
  p_qualifying_event_count integer,
  p_event_rewards jsonb,
  p_retention_enabled boolean,
  p_retention_months integer,
  p_retention_reward_kind text,
  p_retention_rate_percent numeric,
  p_retention_fixed_amount numeric,
  p_currency text,
  p_payout_hold_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_row public.talent_partner_reward_plans%rowtype; v_model text:=lower(trim(coalesce(p_reward_model,''))); v_ret_kind text:=lower(trim(coalesce(p_retention_reward_kind,'')));
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if not exists(select 1 from public.career_jobs where id=p_job_id) then raise exception 'Job not found.'; end if;
  if v_model not in ('sales','project','none') then raise exception 'Invalid reward model.'; end if;
  if v_ret_kind not in ('percent','fixed') then raise exception 'Invalid retention reward type.'; end if;
  if jsonb_typeof(coalesce(p_event_rewards,'[]'::jsonb))<>'array' then raise exception 'Event rewards must be an array.'; end if;

  insert into public.talent_partner_reward_plans(
    career_job_id,enabled,reward_model,qualifying_event_count,event_rewards,retention_enabled,retention_months,
    retention_reward_kind,retention_rate_percent,retention_fixed_amount,currency,payout_hold_days,updated_by,updated_at
  ) values(
    p_job_id,coalesce(p_enabled,false),v_model,greatest(1,least(10,coalesce(p_qualifying_event_count,3))),coalesce(p_event_rewards,'[]'::jsonb),
    coalesce(p_retention_enabled,true),greatest(1,least(60,coalesce(p_retention_months,6))),v_ret_kind,
    greatest(0,least(100,coalesce(p_retention_rate_percent,0))),greatest(0,coalesce(p_retention_fixed_amount,0)),
    coalesce(nullif(upper(left(trim(coalesce(p_currency,'')),3)),''),'USD'),
    case when p_payout_hold_days is null then null else greatest(0,least(180,p_payout_hold_days)) end,auth.uid(),now()
  )
  on conflict (career_job_id) do update set
    enabled=excluded.enabled,reward_model=excluded.reward_model,qualifying_event_count=excluded.qualifying_event_count,
    event_rewards=excluded.event_rewards,retention_enabled=excluded.retention_enabled,retention_months=excluded.retention_months,
    retention_reward_kind=excluded.retention_reward_kind,retention_rate_percent=excluded.retention_rate_percent,
    retention_fixed_amount=excluded.retention_fixed_amount,currency=excluded.currency,payout_hold_days=excluded.payout_hold_days,
    updated_by=auth.uid(),updated_at=now()
  returning * into v_row;

  perform public.admin_refresh_talent_partner_rewards();
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_update_talent_partner_reward_status(
  p_reward_id uuid,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_status text:=initcap(lower(trim(coalesce(p_status,'')))); v_row public.talent_partner_reward_entries%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_status not in ('Approved','Reversed') then raise exception 'Only Approved or Reversed is supported here.'; end if;
  select * into v_row from public.talent_partner_reward_entries where id=p_reward_id for update;
  if not found then raise exception 'Reward not found.'; end if;
  if v_row.status='Paid' then raise exception 'A paid reward cannot be changed by this action.'; end if;
  if v_status='Approved' and v_row.available_at>now() then raise exception 'This reward is still inside the configured payout hold period.'; end if;

  update public.talent_partner_reward_entries
  set status=v_status,
      approved_at=case when v_status='Approved' then now() else approved_at end,
      approved_by=case when v_status='Approved' then auth.uid() else approved_by end,
      reversal_reason=case when v_status='Reversed' then coalesce(nullif(left(trim(coalesce(p_reason,'')),2000),''),'Reversed by administrator.') else null end,
      reversed_at=case when v_status='Reversed' then now() else null end,
      updated_at=now()
  where id=p_reward_id returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_create_talent_partner_payout_batch()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_settings public.talent_partner_program_settings%rowtype;
  v_batch_id uuid;
  v_number text;
  v_group record;
  v_payout_id uuid;
  v_total numeric:=0;
  v_count integer:=0;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_settings from public.talent_partner_program_settings where id='default';
  v_number:='TP-PAY-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));

  insert into public.talent_partner_payout_batches(batch_number,status,created_by)
  values(v_number,'Ready',auth.uid()) returning id into v_batch_id;

  for v_group in
    select e.partner_user_id,e.currency,sum(e.reward_amount)::numeric(14,2) amount,count(*)::integer entry_count,
           max(tp.payout_method) payout_method,max(tp.payout_email) payout_email
    from public.talent_partner_reward_entries e
    join public.talent_partner_profiles tp on tp.user_id=e.partner_user_id and tp.status='Active'
    where e.status='Approved' and e.payout_id is null and e.available_at<=now()
    group by e.partner_user_id,e.currency
    having sum(e.reward_amount)>=v_settings.minimum_payout
  loop
    insert into public.talent_partner_payouts(
      payout_batch_id,partner_user_id,currency,amount,entry_count,status,payout_method_snapshot,payout_email_snapshot
    ) values(
      v_batch_id,v_group.partner_user_id,v_group.currency,v_group.amount,v_group.entry_count,'Ready',v_group.payout_method,v_group.payout_email
    ) returning id into v_payout_id;

    update public.talent_partner_reward_entries
    set payout_id=v_payout_id,updated_at=now()
    where partner_user_id=v_group.partner_user_id and currency=v_group.currency
      and status='Approved' and payout_id is null and available_at<=now();

    v_total:=v_total+v_group.amount; v_count:=v_count+v_group.entry_count;
  end loop;

  if v_count=0 then
    delete from public.talent_partner_payout_batches where id=v_batch_id;
    return jsonb_build_object('success',false,'message','No approved Talent Partner rewards currently meet the payout requirements.');
  end if;

  update public.talent_partner_payout_batches set entry_count=v_count,total_amount=v_total where id=v_batch_id;
  return jsonb_build_object('success',true,'batchId',v_batch_id,'batchNumber',v_number,'entryCount',v_count,'totalAmount',v_total);
end;
$$;

create or replace function public.admin_mark_talent_partner_payout_paid(
  p_payout_id uuid,
  p_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_row public.talent_partner_payouts%rowtype; v_remaining integer;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  update public.talent_partner_payouts
  set status='Paid',transaction_id=nullif(left(trim(coalesce(p_transaction_id,'')),300),''),
      paid_at=now(),paid_by=auth.uid()
  where id=p_payout_id and status='Ready'
  returning * into v_row;
  if not found then raise exception 'Ready payout not found.'; end if;

  update public.talent_partner_reward_entries
  set status='Paid',updated_at=now()
  where payout_id=v_row.id and status='Approved';

  select count(*) into v_remaining from public.talent_partner_payouts where payout_batch_id=v_row.payout_batch_id and status='Ready';
  update public.talent_partner_payout_batches
  set status=case when v_remaining=0 then 'Paid' else 'Partially Paid' end,
      paid_at=case when v_remaining=0 then now() else paid_at end
  where id=v_row.payout_batch_id;

  perform public.talent_partner_notify(
    v_row.partner_user_id,'payout','Talent Partner payout processed',
    'A Talent Partner payout of '||v_row.currency||' '||to_char(v_row.amount,'FM999999990.00')||' has been marked paid.',
    '/talent-partner','tp-payout-paid:'||v_row.id::text
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_override_talent_partner_referral(
  p_applicant_id uuid,
  p_partner_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_app public.applicants%rowtype; v_partner public.talent_partner_profiles%rowtype; v_ref public.talent_partner_referrals%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'A clear override reason is required.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id;
  if not found then raise exception 'Applicant not found.'; end if;
  select * into v_partner from public.talent_partner_profiles where user_id=p_partner_user_id;
  if not found then raise exception 'Talent Partner not found.'; end if;

  select * into v_ref from public.talent_partner_referrals where applicant_id=p_applicant_id for update;
  if found then
    if exists(select 1 from public.talent_partner_reward_entries where referral_id=v_ref.id) then
      raise exception 'Referral ownership cannot be changed after financial reward activity exists.';
    end if;
    update public.talent_partner_referrals
    set partner_user_id=p_partner_user_id,referral_code_snapshot=v_partner.partner_code,
        override_reason=left(trim(p_reason),3000),overridden_by=auth.uid(),overridden_at=now(),updated_at=now()
    where id=v_ref.id returning * into v_ref;
  else
    insert into public.talent_partner_referrals(
      partner_user_id,applicant_id,career_job_id,referral_code_snapshot,status,referred_user_id,activated_at,
      override_reason,overridden_by,overridden_at
    ) values(
      p_partner_user_id,v_app.id,v_app.career_job_id,v_partner.partner_code,
      case when v_app.stage='Activated' then 'Activated' else 'Applicant' end,v_app.linked_user_id,
      case when v_app.stage='Activated' then coalesce(v_app.stage_entered_at,v_app.updated_at) else null end,
      left(trim(p_reason),3000),auth.uid(),now()
    ) returning * into v_ref;
  end if;
  return to_jsonb(v_ref);
end;
$$;

create or replace function public.talent_partner_safe_stage(p_stage text,p_refusal_reason text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(trim(p_refusal_reason),'')<>'' then 'Closed'
    when p_stage='Activated' then 'Activated'
    when p_stage in ('Final Approval','Ready for System Access') then 'Final approval'
    when p_stage in ('One-Day Training','Design Academy','Developer Academy') then 'Training'
    when p_stage in ('Selected','Agreement Pending') then 'Conditional selection'
    when p_stage in ('Shortlisted','Sales Assessment','Technical Assessment','Design Assessment','Lead Research Test','Development Practical','Figma Practical','CRM Assessment','Technical Interview','Design Interview') then 'Assessment'
    when p_stage in ('Initial Screening','Video Review','Video Pending','Code & Portfolio Review','Portfolio Review') then 'Under review'
    else 'Application received'
  end;
$$;

create or replace function public.talent_partner_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_profile jsonb;
  v_stats jsonb;
  v_jobs jsonb;
  v_refs jsonb;
  v_rewards jsonb;
  v_payouts jsonb;
  v_notifications jsonb;
  v_resources jsonb;
  v_sources jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not exists(select 1 from public.talent_partner_profiles where user_id=v_uid) then raise exception 'Talent Partner profile not found.'; end if;

  select jsonb_build_object(
    'userId',tp.user_id,'partnerCode',tp.partner_code,'status',tp.status,'companyName',tp.company_name,'websiteUrl',tp.website_url,
    'promotionChannels',tp.promotion_channels,'payoutMethod',tp.payout_method,'payoutEmail',tp.payout_email,'preferredCurrency',tp.preferred_currency,
    'fullName',u.full_name,'email',u.email,'createdAt',tp.created_at
  ) into v_profile
  from public.talent_partner_profiles tp join public.user_profiles u on u.id=tp.user_id
  where tp.user_id=v_uid;

  select jsonb_build_object(
    'visits',(select count(*) from public.talent_partner_visits where partner_user_id=v_uid),
    'uniqueVisitors',(select count(distinct session_id) from public.talent_partner_visits where partner_user_id=v_uid),
    'applications',(select count(*) from public.talent_partner_referrals where partner_user_id=v_uid),
    'activatedHires',(select count(*) from public.talent_partner_referrals where partner_user_id=v_uid and status in ('Activated','Retained')),
    'retainedHires',(select count(*) from public.talent_partner_referrals where partner_user_id=v_uid and status='Retained'),
    'pendingEarnings',(select coalesce(sum(reward_amount),0) from public.talent_partner_reward_entries where partner_user_id=v_uid and status='Pending'),
    'approvedEarnings',(select coalesce(sum(reward_amount),0) from public.talent_partner_reward_entries where partner_user_id=v_uid and status='Approved'),
    'paidEarnings',(select coalesce(sum(reward_amount),0) from public.talent_partner_reward_entries where partner_user_id=v_uid and status='Paid')
  ) into v_stats;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',j.id,'slug',j.slug,'title',j.title,'shortSummary',j.short_summary,'department',j.department,'location',j.location,'engagementType',j.engagement_type,
    'rewardPlan',case when rp.id is null then null else jsonb_build_object(
      'enabled',rp.enabled,'rewardModel',rp.reward_model,'qualifyingEventCount',rp.qualifying_event_count,'eventRewards',rp.event_rewards,
      'retentionEnabled',rp.retention_enabled,'retentionMonths',rp.retention_months,'retentionRewardKind',rp.retention_reward_kind,
      'retentionRatePercent',rp.retention_rate_percent,'retentionFixedAmount',rp.retention_fixed_amount,'currency',rp.currency
    ) end
  ) order by j.featured desc,j.display_order,j.published_at desc),'[]'::jsonb)
  into v_jobs
  from public.career_jobs j
  left join public.talent_partner_reward_plans rp on rp.career_job_id=j.id
  where j.status='Published' and (j.closes_at is null or j.closes_at>now());

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'applicationReference',a.application_reference,
    'candidateName',case when position(' ' in trim(a.full_name))>0 then split_part(trim(a.full_name),' ',1)||' '||left(split_part(trim(a.full_name),' ',2),1)||'.' else trim(a.full_name) end,
    'jobTitle',j.title,'jobSlug',j.slug,'status',public.talent_partner_safe_stage(a.stage,a.refusal_reason),
    'attributedAt',r.attributed_at,'activatedAt',r.activated_at,'retentionEligibleAt',
      case when r.activated_at is not null and rp.retention_enabled then r.activated_at+make_interval(months=>rp.retention_months) else null end,
    'performanceRewards',(select coalesce(jsonb_agg(jsonb_build_object(
      'type',e.event_type,'rank',e.event_rank,'amount',e.reward_amount,'currency',e.currency,'status',e.status,'createdAt',e.created_at
    ) order by case when e.event_type='retention' then 99 else coalesce(e.event_rank,50) end),'[]'::jsonb)
      from public.talent_partner_reward_entries e where e.referral_id=r.id),
    'salaryTransition',(select jsonb_build_object('status',st.status,'effectiveDate',st.effective_date,'qualifyingDate',st.qualifying_date)
      from public.talent_partner_salary_transitions st where st.referral_id=r.id)
  ) order by r.attributed_at desc),'[]'::jsonb)
  into v_refs
  from public.talent_partner_referrals r
  join public.applicants a on a.id=r.applicant_id
  join public.career_jobs j on j.id=r.career_job_id
  left join public.talent_partner_reward_plans rp on rp.career_job_id=r.career_job_id
  where r.partner_user_id=v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'eventType',e.event_type,'eventRank',e.event_rank,'eligibleAmount',e.eligible_amount,'currency',e.currency,
    'rewardAmount',e.reward_amount,'status',e.status,'availableAt',e.available_at,'createdAt',e.created_at,
    'jobTitle',j.title
  ) order by e.created_at desc),'[]'::jsonb)
  into v_rewards
  from public.talent_partner_reward_entries e join public.career_jobs j on j.id=e.career_job_id
  where e.partner_user_id=v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'batchNumber',b.batch_number,'amount',p.amount,'currency',p.currency,'status',p.status,
    'transactionId',p.transaction_id,'paidAt',p.paid_at,'createdAt',p.created_at
  ) order by p.created_at desc),'[]'::jsonb)
  into v_payouts
  from public.talent_partner_payouts p join public.talent_partner_payout_batches b on b.id=p.payout_batch_id
  where p.partner_user_id=v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',n.id,'type',n.type,'title',n.title,'message',n.message,'actionPath',n.action_path,'readAt',n.read_at,'createdAt',n.created_at
  ) order by n.created_at desc),'[]'::jsonb)
  into v_notifications
  from (select * from public.talent_partner_notifications where partner_user_id=v_uid order by created_at desc limit 50) n;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'jobId',x.career_job_id,'title',x.title,'type',x.resource_type,'content',x.content,'url',x.resource_url
  ) order by x.sort_order,x.created_at),'[]'::jsonb)
  into v_resources
  from public.talent_partner_resources x
  where x.enabled=true;

  select coalesce(jsonb_agg(jsonb_build_object('source',source_key,'visits',visits,'uniqueVisitors',unique_visitors) order by visits desc),'[]'::jsonb)
  into v_sources
  from (
    select coalesce(nullif(utm_source,''),nullif(referrer_host,''),'Direct') source_key,
           count(*) visits,count(distinct session_id) unique_visitors
    from public.talent_partner_visits
    where partner_user_id=v_uid
    group by 1
    order by visits desc
    limit 20
  ) s;

  return jsonb_build_object(
    'profile',v_profile,'stats',v_stats,'jobs',v_jobs,'referrals',v_refs,'rewards',v_rewards,
    'payouts',v_payouts,'notifications',v_notifications,'resources',v_resources,'sourceBreakdown',v_sources
  );
end;
$$;

create or replace function public.talent_partner_mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  update public.talent_partner_notifications set read_at=coalesce(read_at,now())
  where id=p_notification_id and partner_user_id=auth.uid();
end;
$$;

-- Row-level security. Public attribution goes through tightly scoped SECURITY DEFINER functions only.
alter table public.talent_partner_program_settings enable row level security;
alter table public.talent_partner_profiles enable row level security;
alter table public.talent_partner_reward_plans enable row level security;
alter table public.talent_partner_visits enable row level security;
alter table public.talent_partner_referrals enable row level security;
alter table public.talent_partner_qualifying_projects enable row level security;
alter table public.talent_partner_salary_transitions enable row level security;
alter table public.talent_partner_reward_entries enable row level security;
alter table public.talent_partner_payout_batches enable row level security;
alter table public.talent_partner_payouts enable row level security;
alter table public.talent_partner_notifications enable row level security;
alter table public.talent_partner_resources enable row level security;

drop policy if exists talent_partner_profiles_select on public.talent_partner_profiles;
create policy talent_partner_profiles_select on public.talent_partner_profiles
for select to authenticated using (user_id=auth.uid() or public.is_admin());

drop policy if exists talent_partner_profiles_admin_write on public.talent_partner_profiles;
create policy talent_partner_profiles_admin_write on public.talent_partner_profiles
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists talent_partner_settings_admin on public.talent_partner_program_settings;
create policy talent_partner_settings_admin on public.talent_partner_program_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists talent_partner_plans_admin on public.talent_partner_reward_plans;
create policy talent_partner_plans_admin on public.talent_partner_reward_plans
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists talent_partner_visits_admin on public.talent_partner_visits;
create policy talent_partner_visits_admin on public.talent_partner_visits
for select to authenticated using (public.is_admin());

drop policy if exists talent_partner_referrals_admin on public.talent_partner_referrals;
create policy talent_partner_referrals_admin on public.talent_partner_referrals
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists talent_partner_projects_admin on public.talent_partner_qualifying_projects;
create policy talent_partner_projects_admin on public.talent_partner_qualifying_projects
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists talent_partner_salary_admin on public.talent_partner_salary_transitions;
create policy talent_partner_salary_admin on public.talent_partner_salary_transitions
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists talent_partner_rewards_select on public.talent_partner_reward_entries;
create policy talent_partner_rewards_select on public.talent_partner_reward_entries
for select to authenticated using (partner_user_id=auth.uid() or public.is_admin());

drop policy if exists talent_partner_rewards_admin on public.talent_partner_reward_entries;
create policy talent_partner_rewards_admin on public.talent_partner_reward_entries
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists talent_partner_batches_admin on public.talent_partner_payout_batches;
create policy talent_partner_batches_admin on public.talent_partner_payout_batches
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists talent_partner_payouts_select on public.talent_partner_payouts;
create policy talent_partner_payouts_select on public.talent_partner_payouts
for select to authenticated using (partner_user_id=auth.uid() or public.is_admin());

drop policy if exists talent_partner_payouts_admin on public.talent_partner_payouts;
create policy talent_partner_payouts_admin on public.talent_partner_payouts
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists talent_partner_notifications_select on public.talent_partner_notifications;
create policy talent_partner_notifications_select on public.talent_partner_notifications
for select to authenticated using (partner_user_id=auth.uid() or public.is_admin());

drop policy if exists talent_partner_notifications_admin on public.talent_partner_notifications;
create policy talent_partner_notifications_admin on public.talent_partner_notifications
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists talent_partner_resources_admin on public.talent_partner_resources;
create policy talent_partner_resources_admin on public.talent_partner_resources
for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on function public.public_track_talent_partner_visit(text,text,text,jsonb) from public;
revoke all on function public.public_claim_talent_partner_application(text,text,text,text) from public;
grant execute on function public.public_track_talent_partner_visit(text,text,text,jsonb) to anon,authenticated;
grant execute on function public.public_claim_talent_partner_application(text,text,text,text) to anon,authenticated;
grant execute on function public.request_talent_partner_account(text,text) to authenticated;
grant execute on function public.talent_partner_update_my_profile(text,text,text[],text,text,text) to authenticated;
grant execute on function public.talent_partner_get_dashboard() to authenticated;
grant execute on function public.talent_partner_mark_notification_read(uuid) to authenticated;

revoke all on function public.admin_set_talent_partner_status(uuid,text,text) from public;
revoke all on function public.admin_save_talent_partner_program_settings(jsonb) from public;
revoke all on function public.admin_save_talent_partner_reward_plan(uuid,boolean,text,integer,jsonb,boolean,integer,text,numeric,numeric,text,integer) from public;
revoke all on function public.admin_approve_talent_partner_project_reward(uuid,uuid,numeric,text,text) from public;
revoke all on function public.admin_record_talent_partner_salary_transition(uuid,date,numeric,text,text) from public;
revoke all on function public.admin_refresh_talent_partner_rewards() from public;
revoke all on function public.admin_update_talent_partner_reward_status(uuid,text,text) from public;
revoke all on function public.admin_create_talent_partner_payout_batch() from public;
revoke all on function public.admin_mark_talent_partner_payout_paid(uuid,text) from public;
revoke all on function public.admin_override_talent_partner_referral(uuid,uuid,text) from public;
grant execute on function public.admin_set_talent_partner_status(uuid,text,text) to authenticated;
grant execute on function public.admin_save_talent_partner_program_settings(jsonb) to authenticated;
grant execute on function public.admin_save_talent_partner_reward_plan(uuid,boolean,text,integer,jsonb,boolean,integer,text,numeric,numeric,text,integer) to authenticated;
grant execute on function public.admin_approve_talent_partner_project_reward(uuid,uuid,numeric,text,text) to authenticated;
grant execute on function public.admin_record_talent_partner_salary_transition(uuid,date,numeric,text,text) to authenticated;
grant execute on function public.admin_refresh_talent_partner_rewards() to authenticated;
grant execute on function public.admin_update_talent_partner_reward_status(uuid,text,text) to authenticated;
grant execute on function public.admin_create_talent_partner_payout_batch() to authenticated;
grant execute on function public.admin_mark_talent_partner_payout_paid(uuid,text) to authenticated;
grant execute on function public.admin_override_talent_partner_referral(uuid,uuid,text) to authenticated;

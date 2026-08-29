-- ProFox Talent Partner Program: schema and core helpers.
-- Reconciled to the production migration version applied on 2026-08-29.

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
  qualifying_event_count integer not null default 3 check (qualifying_event_count between 1 and 3),
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

create index if not exists idx_talent_partner_visits_partner_time on public.talent_partner_visits(partner_user_id, occurred_at desc);
create index if not exists idx_talent_partner_visits_session_time on public.talent_partner_visits(session_id, occurred_at);
create index if not exists idx_talent_partner_visits_job on public.talent_partner_visits(career_job_id, occurred_at desc);

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

create index if not exists idx_talent_partner_referrals_partner on public.talent_partner_referrals(partner_user_id, attributed_at desc);
create index if not exists idx_talent_partner_referrals_worker on public.talent_partner_referrals(referred_user_id) where referred_user_id is not null;

create table if not exists public.talent_partner_qualifying_projects (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.talent_partner_referrals(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  worker_user_id uuid not null references public.user_profiles(id) on delete restrict,
  qualifying_rank integer not null check (qualifying_rank between 1 and 3),
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
  event_rank integer check (event_rank is null or event_rank between 1 and 3),
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

create unique index if not exists uq_talent_partner_reward_sale on public.talent_partner_reward_entries(referral_id, source_quotation_id) where event_type='sale' and source_quotation_id is not null;
create unique index if not exists uq_talent_partner_reward_project on public.talent_partner_reward_entries(referral_id, source_project_id) where event_type='project' and source_project_id is not null;
create unique index if not exists uq_talent_partner_reward_retention on public.talent_partner_reward_entries(referral_id) where event_type='retention';
create index if not exists idx_talent_partner_rewards_partner_status on public.talent_partner_reward_entries(partner_user_id, status, available_at);

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

create or replace function public.talent_partner_default_reward_model(p_job public.career_jobs)
returns text
language sql
immutable
set search_path=public,pg_temp
as $$
  select case
    when p_job.application_type='sales_representative' or coalesce(p_job.role_details->>'systemRole','') in ('sales','sales_rep') then 'sales'
    when coalesce(p_job.role_details->>'systemRole','') in ('content_writer','uiux_designer','developer','web_developer','developer_designer') or p_job.application_type='content_writer' then 'project'
    else 'none'
  end;
$$;

insert into public.talent_partner_reward_plans(career_job_id,reward_model,enabled)
select j.id, public.talent_partner_default_reward_model(j), false
from public.career_jobs j
on conflict (career_job_id) do nothing;

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
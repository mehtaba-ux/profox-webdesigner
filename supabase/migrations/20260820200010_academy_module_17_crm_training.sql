-- Sales Academy Module 17 — CRM Training
-- Isolated training state and mission definitions. No learner training action writes to live CRM tables.

update public.training_modules
set module_type='lesson',
    passing_score=85,
    requires_admin_review=false,
    required=true,
    active=true,
    description='Learn the ProFox CRM as the operational source of truth, practise the sales lifecycle in an isolated synthetic sandbox, and certify accurate lead, activity, opportunity, meeting, commercial, payment and handoff decisions before production CRM access.',
    updated_at=now()
where slug='crm-training';

create table if not exists public.crm_training_state (
  progress_id uuid primary key references public.user_training_progress(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  lessons_completed integer not null default 0 check (lessons_completed>=0),
  missions_completed integer not null default 0 check (missions_completed>=0),
  sandbox_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_training_state_user_module
  on public.crm_training_state(user_id,module_id);

alter table public.crm_training_state enable row level security;

drop policy if exists crm_training_state_select on public.crm_training_state;
create policy crm_training_state_select
on public.crm_training_state
for select
to authenticated
using (public.is_admin() or user_id=(select auth.uid()));

revoke all on public.crm_training_state from anon;
revoke insert,update,delete on public.crm_training_state from authenticated;
grant select on public.crm_training_state to authenticated;

create table if not exists public.crm_training_missions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.training_modules(id) on delete cascade,
  mission_key text not null,
  title text not null,
  objective text not null default '',
  instructions text not null default '',
  scenario_data jsonb not null default '{}'::jsonb,
  sort_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(module_id,mission_key),
  unique(module_id,sort_order)
);

create index if not exists idx_crm_training_missions_module_order
  on public.crm_training_missions(module_id,sort_order);

alter table public.crm_training_missions enable row level security;

drop policy if exists crm_training_missions_admin_select on public.crm_training_missions;
create policy crm_training_missions_admin_select
on public.crm_training_missions
for select
to authenticated
using (public.is_admin());

drop policy if exists crm_training_missions_admin_insert on public.crm_training_missions;
create policy crm_training_missions_admin_insert
on public.crm_training_missions
for insert
to authenticated
with check (public.is_admin());

drop policy if exists crm_training_missions_admin_update on public.crm_training_missions;
create policy crm_training_missions_admin_update
on public.crm_training_missions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists crm_training_missions_admin_delete on public.crm_training_missions;
create policy crm_training_missions_admin_delete
on public.crm_training_missions
for delete
to authenticated
using (public.is_admin());

revoke all on public.crm_training_missions from anon;
grant select,insert,update,delete on public.crm_training_missions to authenticated;

comment on table public.crm_training_state is 'Module 17 learner-only synthetic CRM state. Never references live customer CRM records.';
comment on table public.crm_training_missions is 'Admin-editable Module 17 synthetic CRM practice mission content. Security-critical mission validation remains server-controlled.';

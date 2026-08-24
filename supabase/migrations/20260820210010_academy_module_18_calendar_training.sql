-- Sales Academy Module 18 — Calendar / Meeting Setup
-- Isolated training state and mission definitions. No learner practice writes to production meetings/calendar settings.

update public.training_modules
set module_type='lesson',
    passing_score=90,
    requires_admin_review=false,
    required=true,
    active=true,
    description='Own your time, protect selling capacity, schedule internationally without friction, prepare properly, run focused meetings, recover no-shows professionally, and turn every legitimate meeting into a clear next action before live customer scheduling access.',
    updated_at=now()
where slug='calendar-setup';

create table if not exists public.calendar_training_state (
  progress_id uuid primary key references public.user_training_progress(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  lessons_completed integer not null default 0 check (lessons_completed>=0),
  missions_completed integer not null default 0 check (missions_completed>=0),
  sandbox_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_calendar_training_state_user_module
  on public.calendar_training_state(user_id,module_id);

alter table public.calendar_training_state enable row level security;

drop policy if exists calendar_training_state_select on public.calendar_training_state;
create policy calendar_training_state_select
on public.calendar_training_state
for select
to authenticated
using (public.is_admin() or user_id=(select auth.uid()));

revoke all on public.calendar_training_state from anon,authenticated;
grant select on public.calendar_training_state to authenticated;

create table if not exists public.calendar_training_missions (
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

create index if not exists idx_calendar_training_missions_module_order
  on public.calendar_training_missions(module_id,sort_order);

alter table public.calendar_training_missions enable row level security;

drop policy if exists calendar_training_missions_admin_select on public.calendar_training_missions;
create policy calendar_training_missions_admin_select
on public.calendar_training_missions
for select
to authenticated
using (public.is_admin());

drop policy if exists calendar_training_missions_admin_insert on public.calendar_training_missions;
create policy calendar_training_missions_admin_insert
on public.calendar_training_missions
for insert
to authenticated
with check (public.is_admin());

drop policy if exists calendar_training_missions_admin_update on public.calendar_training_missions;
create policy calendar_training_missions_admin_update
on public.calendar_training_missions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists calendar_training_missions_admin_delete on public.calendar_training_missions;
create policy calendar_training_missions_admin_delete
on public.calendar_training_missions
for delete
to authenticated
using (public.is_admin());

revoke all on public.calendar_training_missions from anon,authenticated;
grant select,insert,update,delete on public.calendar_training_missions to authenticated;

comment on table public.calendar_training_state is 'Module 18 learner-only calendar/meeting sandbox state. Never references live customer meeting records.';
comment on table public.calendar_training_missions is 'Admin-editable Module 18 synthetic scheduling mission content. Security-critical validation remains server-controlled.';

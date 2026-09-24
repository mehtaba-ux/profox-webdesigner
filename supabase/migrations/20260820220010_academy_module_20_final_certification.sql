-- Sales Academy Module 20 — Final Certification
-- Capstone state, end-to-end missions, live buyer simulation sessions and Admin-managed scoring configuration.

update public.training_modules
set module_type='lesson',
    passing_score=90,
    requires_admin_review=true,
    required=true,
    active=true,
    description='Final capstone certification proving independent ProFox sales execution from research and outreach through discovery, recommendation, closing, commercial control, payment truth, CRM, calendar, confidentiality and protected handoff.',
    updated_at=now()
where slug='final-certification';

create table if not exists public.final_certification_state(
  progress_id uuid primary key references public.user_training_progress(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  briefings_completed integer not null default 0 check(briefings_completed between 0 and 10),
  missions_completed integer not null default 0 check(missions_completed between 0 and 12),
  sandbox_snapshot jsonb not null default '{}'::jsonb,
  judgment_passed boolean not null default false,
  judgment_score integer,
  judgment_critical_misses integer,
  live_session_id uuid,
  self_assessment jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_final_certification_state_user_module on public.final_certification_state(user_id,module_id);
alter table public.final_certification_state enable row level security;
drop policy if exists final_certification_state_select on public.final_certification_state;
create policy final_certification_state_select on public.final_certification_state for select to authenticated using(public.is_admin() or user_id=(select auth.uid()));
revoke all on public.final_certification_state from anon,authenticated;
grant select on public.final_certification_state to authenticated;

create table if not exists public.final_certification_missions(
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
create index if not exists idx_final_certification_missions_module_order on public.final_certification_missions(module_id,sort_order);
alter table public.final_certification_missions enable row level security;
drop policy if exists final_certification_missions_admin_all on public.final_certification_missions;
create policy final_certification_missions_admin_all on public.final_certification_missions for all to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on public.final_certification_missions from anon,authenticated;
grant select,insert,update,delete on public.final_certification_missions to authenticated;

create table if not exists public.final_certification_cases(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text not null,
  market text not null,
  difficulty text not null default 'advanced',
  seller_brief jsonb not null default '{}'::jsonb,
  evaluator_brief jsonb not null default '{}'::jsonb,
  rounds jsonb not null default '[]'::jsonb,
  evaluator_instructions text not null default '',
  version integer not null default 1,
  weight integer not null default 100 check(weight>0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.final_certification_cases enable row level security;
drop policy if exists final_certification_cases_admin_all on public.final_certification_cases;
create policy final_certification_cases_admin_all on public.final_certification_cases for all to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on public.final_certification_cases from anon,authenticated;
grant select,insert,update,delete on public.final_certification_cases to authenticated;

create table if not exists public.final_certification_rubric_items(
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  max_points integer not null check(max_points>0 and max_points<=100),
  sort_order integer not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.final_certification_rubric_items enable row level security;
drop policy if exists final_certification_rubric_admin_all on public.final_certification_rubric_items;
create policy final_certification_rubric_admin_all on public.final_certification_rubric_items for all to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on public.final_certification_rubric_items from anon,authenticated;
grant select,insert,update,delete on public.final_certification_rubric_items to authenticated;

create table if not exists public.final_certification_critical_rules(
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  sort_order integer not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.final_certification_critical_rules enable row level security;
drop policy if exists final_certification_critical_admin_all on public.final_certification_critical_rules;
create policy final_certification_critical_admin_all on public.final_certification_critical_rules for all to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on public.final_certification_critical_rules from anon,authenticated;
grant select,insert,update,delete on public.final_certification_critical_rules to authenticated;

create table if not exists public.final_certification_sessions(
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.user_profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  progress_id uuid not null references public.user_training_progress(id) on delete cascade,
  attempt_no integer not null default 1,
  case_id uuid references public.final_certification_cases(id) on delete set null,
  case_name_snapshot text not null default '',
  case_version_snapshot integer not null default 1,
  seller_brief_snapshot jsonb not null default '{}'::jsonb,
  evaluator_brief_snapshot jsonb not null default '{}'::jsonb,
  rounds_snapshot jsonb not null default '[]'::jsonb,
  evaluator_instructions_snapshot text not null default '',
  rubric_snapshot jsonb not null default '[]'::jsonb,
  critical_rules_snapshot jsonb not null default '[]'::jsonb,
  evaluator_id uuid references public.user_profiles(id) on delete set null,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  meeting_url text not null default '',
  status text not null default 'pending_assignment' check(status in('pending_assignment','assigned','scheduled','awaiting_self_assessment','awaiting_evaluation','passed','retry_required','cancelled')),
  score integer,
  rubric_scores jsonb not null default '{}'::jsonb,
  critical_failures jsonb not null default '[]'::jsonb,
  evaluator_feedback text not null default '',
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(trainee_id,attempt_no)
);
create index if not exists idx_final_certification_sessions_queue on public.final_certification_sessions(status,created_at);
create index if not exists idx_final_certification_sessions_trainee on public.final_certification_sessions(trainee_id,attempt_no desc);
alter table public.final_certification_sessions enable row level security;
drop policy if exists final_certification_sessions_select on public.final_certification_sessions;
create policy final_certification_sessions_select on public.final_certification_sessions for select to authenticated using(public.is_admin() or trainee_id=(select auth.uid()));
revoke all on public.final_certification_sessions from anon,authenticated;
grant select on public.final_certification_sessions to authenticated;

alter table public.final_certification_state drop constraint if exists final_certification_state_live_session_id_fkey;
alter table public.final_certification_state add constraint final_certification_state_live_session_id_fkey foreign key(live_session_id) references public.final_certification_sessions(id) on delete set null;

create table if not exists public.final_certification_events(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.final_certification_sessions(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references public.user_profiles(id) on delete set null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_final_certification_events_session on public.final_certification_events(session_id,created_at);
alter table public.final_certification_events enable row level security;
drop policy if exists final_certification_events_admin_select on public.final_certification_events;
create policy final_certification_events_admin_select on public.final_certification_events for select to authenticated using(public.is_admin());
revoke all on public.final_certification_events from anon,authenticated;
grant select on public.final_certification_events to authenticated;

comment on table public.final_certification_state is 'Module 20 capstone learner state. Synthetic deal practice only.';
comment on table public.final_certification_sessions is 'Module 20 frozen three-round live certification attempts. Final evaluator is Management/Admin.';

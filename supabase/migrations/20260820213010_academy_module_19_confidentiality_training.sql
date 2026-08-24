-- Sales Academy Module 19 — Confidentiality & Data Protection
-- Isolated training state and mission definitions. No learner practice writes to production customer, credential, communication, or incident records.

update public.training_modules
set module_type='lesson',
    passing_score=90,
    requires_admin_review=false,
    required=true,
    active=true,
    description='Protect trust and move fast safely: classify and minimize data, use least-privilege access, verify unusual requests, share only through approved channels, handle AI and customer secrets responsibly, and report incidents immediately.',
    updated_at=now()
where slug='confidentiality-data-protection';

create table if not exists public.confidentiality_training_state (
  progress_id uuid primary key references public.user_training_progress(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  lessons_completed integer not null default 0 check (lessons_completed>=0),
  missions_completed integer not null default 0 check (missions_completed>=0),
  sandbox_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_confidentiality_training_state_user_module on public.confidentiality_training_state(user_id,module_id);
alter table public.confidentiality_training_state enable row level security;
drop policy if exists confidentiality_training_state_select on public.confidentiality_training_state;
create policy confidentiality_training_state_select on public.confidentiality_training_state for select to authenticated using (public.is_admin() or user_id=(select auth.uid()));
revoke all on public.confidentiality_training_state from anon,authenticated;
grant select on public.confidentiality_training_state to authenticated;

create table if not exists public.confidentiality_training_missions (
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
create index if not exists idx_confidentiality_training_missions_module_order on public.confidentiality_training_missions(module_id,sort_order);
alter table public.confidentiality_training_missions enable row level security;
drop policy if exists confidentiality_training_missions_admin_select on public.confidentiality_training_missions;
create policy confidentiality_training_missions_admin_select on public.confidentiality_training_missions for select to authenticated using (public.is_admin());
drop policy if exists confidentiality_training_missions_admin_insert on public.confidentiality_training_missions;
create policy confidentiality_training_missions_admin_insert on public.confidentiality_training_missions for insert to authenticated with check (public.is_admin());
drop policy if exists confidentiality_training_missions_admin_update on public.confidentiality_training_missions;
create policy confidentiality_training_missions_admin_update on public.confidentiality_training_missions for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists confidentiality_training_missions_admin_delete on public.confidentiality_training_missions;
create policy confidentiality_training_missions_admin_delete on public.confidentiality_training_missions for delete to authenticated using (public.is_admin());
revoke all on public.confidentiality_training_missions from anon,authenticated;
grant select,insert,update,delete on public.confidentiality_training_missions to authenticated;
comment on table public.confidentiality_training_state is 'Module 19 learner-only confidentiality/security sandbox state. No real customer data, credentials or incident evidence.';
comment on table public.confidentiality_training_missions is 'Admin-editable Module 19 synthetic security mission content. Correct decisions remain server-controlled.';

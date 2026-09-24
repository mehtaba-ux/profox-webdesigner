-- Sales Academy Module 14 — Closing Training
-- Dedicated learner state + secure closing certification foundation.

update public.training_modules
set module_type='lesson',
    passing_score=85,
    requires_admin_review=false,
    required=true,
    active=true,
    description='Lead qualified buyers to clear decisions without pressure. Verify readiness, ask directly, protect commercial authority, distinguish intent from formal commitment, and move every outcome into the correct ProFox workflow.',
    updated_at=now()
where slug='closing';

create table if not exists public.closing_training_state (
  progress_id uuid primary key references public.user_training_progress(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  lessons_completed integer not null default 0 check (lessons_completed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_closing_training_state_user_module
  on public.closing_training_state(user_id,module_id);

alter table public.closing_training_state enable row level security;

drop policy if exists closing_training_state_select on public.closing_training_state;
create policy closing_training_state_select
on public.closing_training_state
for select
to authenticated
using (public.is_admin() or user_id=(select auth.uid()));

revoke all on public.closing_training_state from anon;
revoke insert,update,delete on public.closing_training_state from authenticated;
grant select on public.closing_training_state to authenticated;

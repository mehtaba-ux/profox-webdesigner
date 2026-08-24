-- Sales Academy Module 13 — Objection Handling
-- Dedicated learner state + secure objection-handling certification foundation.

update public.training_modules
set module_type='lesson',
    passing_score=85,
    requires_admin_review=false,
    required=true,
    active=true,
    description='Handle buyer resistance calmly and ethically. Diagnose the real concern before responding, use truthful evidence instead of pressure, preserve commercial authority and trust, respect genuine rejection, and advance only when the concern is actually resolved.',
    updated_at=now()
where slug='objections';

create table if not exists public.objection_handling_training_state (
  progress_id uuid primary key references public.user_training_progress(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  lessons_completed integer not null default 0 check (lessons_completed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_objection_handling_state_user_module
  on public.objection_handling_training_state(user_id,module_id);

alter table public.objection_handling_training_state enable row level security;

drop policy if exists objection_handling_training_state_select on public.objection_handling_training_state;
create policy objection_handling_training_state_select
on public.objection_handling_training_state
for select
to authenticated
using (public.is_admin() or user_id=(select auth.uid()));

revoke all on public.objection_handling_training_state from anon;
revoke insert,update,delete on public.objection_handling_training_state from authenticated;
grant select on public.objection_handling_training_state to authenticated;

-- Sales Academy Module 15 — Quotation Process
-- Secure learner state + high-integrity quotation certification foundation.

update public.training_modules
set module_type='lesson',
    passing_score=90,
    requires_admin_review=false,
    required=true,
    active=true,
    description='Turn an agreed sales direction into an accurate, approved commercial quotation. Use the live Sales Catalog, let standard packages and approved add-ons flow without manager approval, route custom work and exceptions for approval, preserve version history, and hand accepted quotations into the verified payment workflow.',
    updated_at=now()
where slug='quotation-process';

create table if not exists public.quotation_process_training_state (
  progress_id uuid primary key references public.user_training_progress(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  lessons_completed integer not null default 0 check (lessons_completed>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quotation_process_training_state_user_module
  on public.quotation_process_training_state(user_id,module_id);

alter table public.quotation_process_training_state enable row level security;

drop policy if exists quotation_process_training_state_select on public.quotation_process_training_state;
create policy quotation_process_training_state_select
on public.quotation_process_training_state
for select
to authenticated
using (public.is_admin() or user_id=(select auth.uid()));

revoke all on public.quotation_process_training_state from anon;
revoke insert,update,delete on public.quotation_process_training_state from authenticated;
grant select on public.quotation_process_training_state to authenticated;

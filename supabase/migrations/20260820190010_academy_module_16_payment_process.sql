-- Sales Academy Module 16 — Payment Process

update public.training_modules
set module_type='lesson',
    passing_score=90,
    requires_admin_review=false,
    required=true,
    active=true,
    description='Request payments from accepted commercial truth, use approved ProFox channels, follow up professionally, protect customer credentials, understand payment states, and allow only the protected verification workflow to advance financial and downstream business state.',
    updated_at=now()
where slug='payment-process';

create table if not exists public.payment_process_training_state (
  progress_id uuid primary key references public.user_training_progress(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  lessons_completed integer not null default 0 check (lessons_completed>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_process_training_state_user_module
  on public.payment_process_training_state(user_id,module_id);

alter table public.payment_process_training_state enable row level security;

drop policy if exists payment_process_training_state_select on public.payment_process_training_state;
create policy payment_process_training_state_select
on public.payment_process_training_state
for select
to authenticated
using (public.is_admin() or user_id=(select auth.uid()));

revoke all on public.payment_process_training_state from anon;
revoke insert,update,delete on public.payment_process_training_state from authenticated;
grant select on public.payment_process_training_state to authenticated;

-- Sales Academy Module 12 — Product Presentation
-- Dedicated learner state + secure presentation certification foundation.

update public.training_modules
set module_type='lesson',
    passing_score=85,
    requires_admin_review=false,
    required=true,
    active=true,
    description='Turn verified discovery into a concise, buyer-centered ProFox recommendation. Present the right solution in the buyer''s priority order, translate capabilities into business value, use verified proof, preserve trust, and agree the correct next decision.',
    updated_at=now()
where slug='presentation-skills';

create table if not exists public.product_presentation_training_state (
  progress_id uuid primary key references public.user_training_progress(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  lessons_completed integer not null default 0 check (lessons_completed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_presentation_state_user_module
  on public.product_presentation_training_state(user_id,module_id);

alter table public.product_presentation_training_state enable row level security;

drop policy if exists product_presentation_training_state_select on public.product_presentation_training_state;
create policy product_presentation_training_state_select
on public.product_presentation_training_state
for select
to authenticated
using (public.is_admin() or user_id=(select auth.uid()));

revoke all on public.product_presentation_training_state from anon;
revoke insert,update,delete on public.product_presentation_training_state from authenticated;
grant select on public.product_presentation_training_state to authenticated;

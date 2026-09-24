-- UI/UX Design Academy compatibility with the existing shared training catalog.
-- Production already contains role-specific Content Academy modules that reuse global
-- sort_order values 1-7 alongside Sales Academy. The UI/UX onboarding migration seeds
-- the Sales track from active training_modules, so filter that one legacy seed operation
-- to the canonical Sales Academy slugs without changing any existing module/order.

create table if not exists public.training_tracks(
  track_key text primary key,
  name text not null,
  target_role text not null,
  department text not null,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_track_modules(
  track_key text not null references public.training_tracks(track_key) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  sort_order integer not null,
  required boolean not null default true,
  passing_score_override integer,
  requires_review_override boolean,
  primary key(track_key,module_id),
  unique(track_key,sort_order)
);

alter table public.training_tracks enable row level security;
alter table public.training_track_modules enable row level security;

create or replace function public.uiux_filter_legacy_sales_track_seed()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_slug text;
begin
  if new.track_key <> 'sales' then return new; end if;

  select slug into v_slug from public.training_modules where id=new.module_id;
  if v_slug = any(array[
    'welcome',
    'agreement-rules',
    'product-training',
    'niche-training',
    'lead-research',
    'loom-outreach',
    'outreach-cadence',
    'meeting-booking',
    'discovery-script',
    'call-practice',
    'mock-call-test',
    'presentation-skills',
    'objections',
    'closing',
    'quotation-process',
    'payment-process',
    'crm-training',
    'calendar-setup',
    'confidentiality-data-protection',
    'final-certification'
  ]::text[]) then
    return new;
  end if;

  -- Skip non-Sales modules only during the initial legacy Sales-track seed.
  return null;
end;
$$;

drop trigger if exists aaa_uiux_filter_legacy_sales_track_seed on public.training_track_modules;
create trigger aaa_uiux_filter_legacy_sales_track_seed
before insert on public.training_track_modules
for each row execute function public.uiux_filter_legacy_sales_track_seed();

revoke all on function public.uiux_filter_legacy_sales_track_seed() from public,anon,authenticated;

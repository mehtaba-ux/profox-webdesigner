create table if not exists public.career_jobs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  short_summary text not null default '',
  description text not null default '',
  department text not null default 'General',
  category text not null default 'General',
  location text not null default 'Remote',
  workplace_type text not null default 'Remote',
  engagement_type text not null default 'Contract',
  experience text not null default '',
  responsibilities text[] not null default '{}'::text[],
  requirements text[] not null default '{}'::text[],
  selection_process jsonb not null default '[]'::jsonb,
  compensation jsonb not null default '[]'::jsonb,
  application_type text not null default 'general',
  application_url text,
  application_cta text not null default 'Apply for this role',
  requires_intro_video boolean not null default false,
  featured boolean not null default false,
  display_order integer not null default 0,
  status text not null default 'Draft',
  published_at timestamptz,
  closes_at timestamptz,
  seo_title text,
  seo_description text,
  created_by uuid references public.user_profiles(id) on delete set null,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint career_jobs_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint career_jobs_status_check check (status in ('Draft','Published','Closed')),
  constraint career_jobs_application_type_check check (application_type in ('sales_representative','general','external_link')),
  constraint career_jobs_workplace_type_check check (workplace_type in ('Remote','Hybrid','On-site')),
  constraint career_jobs_selection_process_array check (jsonb_typeof(selection_process) = 'array'),
  constraint career_jobs_compensation_array check (jsonb_typeof(compensation) = 'array')
);

create index if not exists career_jobs_public_listing_idx
  on public.career_jobs (featured desc, display_order asc, published_at desc)
  where status = 'Published';

create index if not exists career_jobs_category_idx
  on public.career_jobs (category, status, published_at desc);

create index if not exists career_jobs_created_by_idx on public.career_jobs(created_by);
create index if not exists career_jobs_updated_by_idx on public.career_jobs(updated_by);

alter table public.career_jobs enable row level security;

revoke all on table public.career_jobs from public;
grant select on table public.career_jobs to anon, authenticated;
grant insert, update, delete on table public.career_jobs to authenticated;

drop policy if exists career_jobs_read on public.career_jobs;
drop policy if exists career_jobs_public_read on public.career_jobs;
create policy career_jobs_public_read
on public.career_jobs
for select
to anon
using (
  status = 'Published'
  and published_at is not null
  and published_at <= now()
  and (closes_at is null or closes_at > now())
);

drop policy if exists career_jobs_authenticated_read on public.career_jobs;
create policy career_jobs_authenticated_read
on public.career_jobs
for select
to authenticated
using (
  (
    status = 'Published'
    and published_at is not null
    and published_at <= now()
    and (closes_at is null or closes_at > now())
  )
  or (select public.is_admin())
);

drop policy if exists career_jobs_admin_insert on public.career_jobs;
create policy career_jobs_admin_insert
on public.career_jobs
for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists career_jobs_admin_update on public.career_jobs;
create policy career_jobs_admin_update
on public.career_jobs
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists career_jobs_admin_delete on public.career_jobs;
create policy career_jobs_admin_delete
on public.career_jobs
for delete
to authenticated
using ((select public.is_admin()));

insert into public.career_jobs (
  slug,
  title,
  short_summary,
  description,
  department,
  category,
  location,
  workplace_type,
  engagement_type,
  experience,
  responsibilities,
  requirements,
  selection_process,
  compensation,
  application_type,
  application_cta,
  requires_intro_video,
  featured,
  display_order,
  status,
  published_at,
  seo_title,
  seo_description
)
values (
  'independent-sales-representative',
  'Independent Sales Representative',
  'Help businesses move from site to system.',
  'Represent ProFox with businesses in the US, UK, Canada and Australia. Find qualified prospects, start useful conversations, run discovery calls and close website, application and automation projects.',
  'Sales',
  'Sales',
  'Remote · Worldwide',
  'Remote',
  'Independent contractor · Commission-only',
  '6+ months sales experience',
  array[
    'Research and qualify businesses that fit ProFox services.',
    'Use thoughtful email, LinkedIn, phone and personalized outreach to start conversations.',
    'Book and conduct discovery meetings by Zoom or Google Meet.',
    'Understand the client’s goals, current website or workflow, decision process and next step.',
    'Present the right ProFox Web, ProFox Apps or ProFox Flow service without overselling.',
    'Keep leads, follow-ups, meetings and quotations accurate in the ProFox CRM.',
    'Close responsibly and hand verified sales into the delivery system.'
  ],
  array[
    'At least 6 months of sales, business development or client-facing experience.',
    'Clear spoken and written English for international client conversations.',
    'Confidence conducting professional video meetings and asking discovery questions.',
    'A reliable laptop, internet connection and a suitable place for client calls.',
    'Comfort with a commission-only independent contractor model.',
    'Ability to research prospects, follow up consistently and work without daily supervision.'
  ],
  '[
    {"title":"Apply","text":"Tell us about your experience and send a 60–120 second introduction video."},
    {"title":"Review & assessment","text":"We review communication, sales judgment, lead research and CRM readiness."},
    {"title":"Agreement","text":"Selected candidates review and sign the ProFox Independent Sales Partner Agreement."},
    {"title":"Sales Academy","text":"Complete the required 20-module training, practical reviews and final certification."},
    {"title":"Final approval","text":"ProFox reviews training evidence and activation readiness."},
    {"title":"Start selling","text":"Approved representatives receive active sales access and begin managing their own pipeline."}
  ]'::jsonb,
  '[
    {"label":"Website Package","price":"$599","rate":"10%","example":"$59.90"},
    {"label":"Business Package","price":"$2,379","rate":"12%","example":"$285.48"},
    {"label":"Premium Package","price":"$5,799+","rate":"15%","example":"$869.85+"},
    {"label":"Custom Web Application","price":"Approved quotation","rate":"10–15%","example":"Set per quotation"}
  ]'::jsonb,
  'sales_representative',
  'Apply for this role',
  true,
  true,
  0,
  'Published',
  now(),
  'Independent Sales Representative | ProFox Careers',
  'Join ProFox as an independent commission-based sales representative and help businesses move from site to system.'
)
on conflict (slug) do nothing;
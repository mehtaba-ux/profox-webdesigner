-- PF-SOP-07 Content Delivery release
-- Reuse-first architecture: existing clients, projects, project_tasks, project_team,
-- Sales Catalog/quotations, project_client_approvals, notification infrastructure,
-- and productivity playbooks remain canonical. This migration adds only content-specific state.

-- -----------------------------------------------------------------------------
-- 1. Content-specific persistence
-- -----------------------------------------------------------------------------
create table if not exists public.content_deliverables (
  id uuid primary key default gen_random_uuid(),
  project_task_id uuid not null unique references public.project_tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  content_type text not null default 'Website Copy',
  lifecycle_stage text not null default 'Requested',
  brief jsonb not null default '{}'::jsonb,
  brief_ready boolean not null default false,
  blocked_from_stage text,
  blocked_reason text,
  current_version_no integer not null default 0,
  revision_round integer not null default 0,
  internal_revision_count integer not null default 0,
  quality_score numeric(5,2),
  quality_status text not null default 'Not Scored',
  critical_defect_count integer not null default 0,
  major_defect_count integer not null default 0,
  published_at timestamptz,
  measured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_deliverables_stage_check check (lifecycle_stage in (
    'Requested','Intake Validated','Research','Strategy / Brief','Ready for Writing','Drafting',
    'Writer Self-QA','SME / Fact Check','2i Editorial Review','SEO / Conversion Review',
    'Ready for Client Review','Client Approved','Ready for Implementation','Implemented',
    'In-Context QA','Approved for Publication','Published','Measured / Maintained',
    'Blocked — Information Required'
  )),
  constraint content_deliverables_quality_status_check check (quality_status in ('Not Scored','Pass','Revision Required','Rework')),
  constraint content_deliverables_revision_nonnegative check (revision_round >= 0),
  constraint content_deliverables_internal_revision_nonnegative check (internal_revision_count >= 0),
  constraint content_deliverables_version_nonnegative check (current_version_no >= 0)
);

create table if not exists public.content_versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.content_deliverables(id) on delete cascade,
  version_no integer not null,
  content text not null,
  change_summary text,
  status text not null default 'Draft',
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  constraint content_versions_unique_version unique (deliverable_id, version_no),
  constraint content_versions_status_check check (status in ('Draft','Submitted','Approved','Superseded')),
  constraint content_versions_positive_version check (version_no > 0)
);

create table if not exists public.content_claims (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.content_deliverables(id) on delete cascade,
  version_id uuid references public.content_versions(id) on delete set null,
  claim_text text not null,
  claim_type text not null default 'Factual',
  material boolean not null default true,
  source_url text,
  source_note text,
  verification_status text not null default 'Pending',
  verification_note text,
  verified_by uuid references public.user_profiles(id),
  verified_at timestamptz,
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_claims_type_check check (claim_type in ('Factual','Statistic','Comparative','Testimonial','Credential','Performance','Other')),
  constraint content_claims_verification_check check (verification_status in ('Pending','Verified','Rejected','Not Required'))
);

create table if not exists public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.content_deliverables(id) on delete cascade,
  version_id uuid references public.content_versions(id) on delete set null,
  review_type text not null,
  reviewer_id uuid not null references public.user_profiles(id),
  decision text not null,
  scores jsonb not null default '{}'::jsonb,
  total_score numeric(5,2),
  defects jsonb not null default '[]'::jsonb,
  feedback text,
  created_at timestamptz not null default now(),
  constraint content_reviews_type_check check (review_type in ('Writer Self-QA','SME Fact Check','2i Editorial Review','SEO / Conversion Review','In-Context QA')),
  constraint content_reviews_decision_check check (decision in ('Passed','Changes Required','Rework','Rejected'))
);

create table if not exists public.content_delivery_events (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.content_deliverables(id) on delete cascade,
  event_type text not null,
  from_stage text,
  to_stage text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references public.user_profiles(id),
  created_at timestamptz not null default now()
);

alter table public.project_client_approvals
  add column if not exists content_deliverable_id uuid references public.content_deliverables(id) on delete cascade;

create index if not exists idx_content_deliverables_project on public.content_deliverables(project_id,lifecycle_stage);
create index if not exists idx_content_versions_deliverable on public.content_versions(deliverable_id,version_no desc);
create index if not exists idx_content_versions_created_by on public.content_versions(created_by);
create index if not exists idx_content_claims_deliverable_status on public.content_claims(deliverable_id,verification_status);
create index if not exists idx_content_claims_version on public.content_claims(version_id) where version_id is not null;
create index if not exists idx_content_claims_verified_by on public.content_claims(verified_by) where verified_by is not null;
create index if not exists idx_content_claims_created_by on public.content_claims(created_by);
create index if not exists idx_content_reviews_deliverable_type on public.content_reviews(deliverable_id,review_type,created_at desc);
create index if not exists idx_content_reviews_version on public.content_reviews(version_id) where version_id is not null;
create index if not exists idx_content_reviews_reviewer on public.content_reviews(reviewer_id);
create index if not exists idx_content_delivery_events_deliverable on public.content_delivery_events(deliverable_id,created_at desc);
create index if not exists idx_content_delivery_events_actor on public.content_delivery_events(actor_id) where actor_id is not null;
create index if not exists idx_project_client_approvals_content_deliverable on public.project_client_approvals(content_deliverable_id,created_at desc) where content_deliverable_id is not null;

alter table public.content_deliverables enable row level security;
alter table public.content_versions enable row level security;
alter table public.content_claims enable row level security;
alter table public.content_reviews enable row level security;
alter table public.content_delivery_events enable row level security;

-- -----------------------------------------------------------------------------
-- 2. Dynamic SOP policy. Commercial price/scope remains canonical elsewhere.
-- -----------------------------------------------------------------------------
insert into public.system_configuration(config_key,config_value,description)
values (
  'content_delivery_sop_v1',
  '{
    "sopCode":"PF-SOP-07",
    "wipLimit":2,
    "reviewSlaHours":24,
    "clientReviewSlaHours":72,
    "qualityPassScore":90,
    "qualityRevisionFloor":80,
    "requiredBriefFields":["target_audience","primary_user_need","business_objective","primary_cta","brand_voice","approved_facts","required_sections"],
    "qualityDimensions":[
      {"key":"user_need_alignment","label":"User-need alignment","weight":15},
      {"key":"business_conversion","label":"Business / conversion","weight":15},
      {"key":"accuracy_evidence","label":"Accuracy / evidence","weight":15},
      {"key":"message_value","label":"Message / value proposition","weight":10},
      {"key":"clarity_scannability","label":"Clarity / scannability","weight":10},
      {"key":"brand_differentiation","label":"Brand differentiation","weight":10},
      {"key":"trust_proof","label":"Trust / proof","weight":10},
      {"key":"seo","label":"SEO","weight":5},
      {"key":"accessibility","label":"Accessibility","weight":5},
      {"key":"implementation_context","label":"Implementation / context","weight":5}
    ],
    "packageProfiles":{
      "PF-WEB-LAUNCH":{"researchDepth":"standard","requiresSeoReview":true,"requires2i":true,"requiresInContextQa":true,"includedRevisionRounds":2},
      "PF-WEB-GROWTH":{"researchDepth":"detailed","requiresSeoReview":true,"requires2i":true,"requiresInContextQa":true,"includedRevisionRounds":3},
      "PF-WEB-SCALE":{"researchDepth":"deep","requiresSeoReview":true,"requires2i":true,"requiresInContextQa":true,"requiresSeniorReview":true,"includedRevisionRounds":null},
      "PF-CUSTOM":{"researchDepth":"project_specific","requiresSeoReview":false,"requires2i":true,"requiresInContextQa":true,"includedRevisionRounds":null}
    },
    "defaultPackageProfile":{"researchDepth":"standard","requiresSeoReview":true,"requires2i":true,"requiresInContextQa":true,"includedRevisionRounds":null}
  }'::jsonb,
  'Dynamic PF-SOP-07 content-delivery policy. Pricing and purchased scope remain canonical in Sales Catalog and quotations.'
)
on conflict (config_key) do nothing;

-- Reuse the existing notification engine for client review invitations.
insert into public.notification_templates(template_key,name,subject_template,body_template,active,description)
values (
  'customer_content_review_ready',
  'Content ready for client review',
  'Your ProFox content is ready for review',
  'Hi {{contactFirstName}},\n\n{{contentTitle}} for {{projectName}} is ready for your review.\n\nPlease open your secure ProFox Client Portal to approve the content or request specific changes.\n\nClient portal: {{clientPortalUrl}}\n\nYour feedback is kept in the project record so the delivery team can act on one clear source of truth.\n\nProFox',
  true,
  'Client notification when an internally approved content deliverable enters Ready for Client Review.'
)
on conflict (template_key) do update set
  name=excluded.name,
  subject_template=excluded.subject_template,
  body_template=excluded.body_template,
  active=excluded.active,
  description=excluded.description,
  updated_at=now();

-- Reuse the existing productivity playbook/checklist engine.
insert into public.productivity_playbooks(playbook_key,name,description,entity_type,stage,roles,checklist,active,sort_order)
values
(
  'content_task_ready_check','Content brief readiness',
  'Confirm the assignment is ready before final content production begins. Missing information must be escalated rather than invented.',
  'project_task','To Do',array['content_writer']::text[],
  '[
    {"key":"scope_package","label":"Review the purchased package, approved scope and exclusions"},
    {"key":"audience_need","label":"Confirm the target audience and the specific user need this content must serve"},
    {"key":"objective_cta","label":"Confirm the business objective and primary conversion action"},
    {"key":"facts_sources","label":"Confirm approved facts, source material and any claims that will require evidence"},
    {"key":"brand_context","label":"Confirm brand direction, existing content and terminology requirements"},
    {"key":"delivery_control","label":"Confirm required sections, deadline, approver and known restrictions"},
    {"key":"missing_inputs","label":"If anything essential is missing, escalate it and do not invent information"}
  ]'::jsonb,true,10
),
(
  'content_task_production','Research, create and self-QA',
  'Follow PF-SOP-07 while producing original, evidence-based, useful and conversion-focused content.',
  'project_task','In Progress',array['content_writer']::text[],
  '[
    {"key":"business_research","label":"Understand the client business, offer, customer and market to the depth required by the purchased package"},
    {"key":"customer_language","label":"Use available customer evidence, questions, objections and vocabulary rather than inventing a persona"},
    {"key":"market_research","label":"Review competitors and search context for gaps and useful differentiation — never copy competitor content"},
    {"key":"architecture","label":"Define user need, message hierarchy and page/content architecture before polishing copy"},
    {"key":"evidence","label":"Trace material factual, quantitative and comparative claims to approved evidence; no evidence means no performance claim"},
    {"key":"draft_quality","label":"Create clear, scannable, brand-consistent content with a clear next action and no manipulative persuasion"},
    {"key":"seo_conversion","label":"Where included, confirm search intent, natural terminology, internal-link opportunities and conversion requirements"},
    {"key":"writer_qa","label":"Complete writer self-QA for user need, business accuracy, evidence, clarity, structure, brand, conversion, SEO and factual details"},
    {"key":"ai_review","label":"If AI assisted the work, independently validate accuracy, originality, brand voice, claims, sources and final wording; never submit raw AI copy"},
    {"key":"handoff_ready","label":"Record research/source/claim notes and prepare the draft for independent internal review"}
  ]'::jsonb,true,10
),
(
  'content_task_revision','Resolve review changes',
  'Resolve consolidated feedback without bypassing evidence, self-QA or independent review controls.',
  'project_task','Changes Required',array['content_writer']::text[],
  '[
    {"key":"review_feedback","label":"Read the consolidated reviewer or client feedback and identify the required changes"},
    {"key":"critical_first","label":"Resolve any critical or major factual, scope, legal, deceptive or unsupported-claim issue first"},
    {"key":"evidence_update","label":"Update evidence, source and claim notes for any changed factual statements"},
    {"key":"consistency","label":"Recheck the whole content item for logic, hierarchy, brand voice, clarity and cross-page consistency"},
    {"key":"self_qa_again","label":"Repeat writer self-QA after revisions rather than checking only the changed sentences"},
    {"key":"resubmit","label":"Resubmit for independent internal review; do not self-approve or send unfinished content to the client"}
  ]'::jsonb,true,10
)
on conflict (playbook_key) do update set
  name=excluded.name,description=excluded.description,entity_type=excluded.entity_type,stage=excluded.stage,
  roles=excluded.roles,checklist=excluded.checklist,active=excluded.active,sort_order=excluded.sort_order,updated_at=now();

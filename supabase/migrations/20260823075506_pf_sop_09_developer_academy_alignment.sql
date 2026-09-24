-- Align the existing ProFox Developer Academy with PF-SOP-09 without duplicate track orders.
-- Reuses training_tracks/training_modules/training_lessons/progress/review infrastructure.

insert into public.training_modules(title,slug,description,module_type,sort_order,required,active,passing_score,requires_admin_review,updated_at)
values(
  'PF-SOP-09 Engineering Operating Standard',
  'dev-pf-sop-09',
  'The mandatory ProFox engineering lifecycle from Engineering Ready through production verification, handover, post-launch assurance and continuous improvement.',
  'lesson',202,true,true,90,false,now()
)
on conflict(slug) do update set
  title=excluded.title,description=excluded.description,module_type=excluded.module_type,required=true,active=true,passing_score=90,requires_admin_review=false,updated_at=now();

insert into public.training_lessons(module_id,title,content,sort_order,active,updated_at)
select m.id,m.title,
'## PF-SOP-09 is the Development operating authority

Your responsibility is not merely to make an approved design render. You are responsible for engineering a dependable product that preserves the approved customer experience while meeting functional, technical, security, accessibility, performance, maintainability and business requirements.

### The operating sequence
**UNDERSTAND → INSPECT → PLAN → ARCHITECT → BUILD → SELF-TEST → REVIEW → INTEGRATE → TEST → VALIDATE → RELEASE → VERIFY → OBSERVE → SUPPORT → IMPROVE.**

No stage is silently skipped. The ProFox Development workspace enforces the required gates server-side.

### Before coding: Engineering Ready
A meaningful Development ticket identifies the requirement/reference, approved design, environment, acceptance criteria, dependencies, security, accessibility, SEO/analytics implications, testing requirements and Technical Definition of Done. If a material requirement is unclear, the correct state is **BLOCKED — TECHNICAL CLARIFICATION REQUIRED**.

### Inspect before building
Before creating code, inspect existing components, utilities, services, APIs, hooks, data models, database tables/functions, authentication, permissions, design tokens, integrations, dependencies, tests and conventions. Record one decision:
- **REUSE** — existing implementation already satisfies the need.
- **EXTEND** — existing implementation can safely support the requirement.
- **REFACTOR** — reuse is desirable but structure must first be improved.
- **BUILD NEW** — no suitable implementation exists or reuse would materially reduce quality. BUILD NEW requires a recorded reason.

Never create duplicate functionality because starting over feels faster.

### Architecture and ADRs
Choose the simplest architecture that reliably satisfies the current business need and reasonably expected growth. For significant Scale/Custom decisions, record an ADR containing the problem, context, options, selected option, reason, trade-offs, security/cost implications and reversal/migration implications.

### Implementation quality
Optimize first for **correctness + understandability + maintainability**, not cleverness. Preserve approved design-system primitives, semantic HTML, supported responsive behavior and interaction states. External input is untrusted. Authorization is enforced at the trusted/server/data layer, not by hiding UI. Secrets never belong in source code, ordinary task notes or evidence.

### Self-test means Ready for Review, not Done
Before review, verify acceptance criteria, happy/error/edge paths, responsive/browser behavior, accessibility basics, console/network failures, forms/links, integrations, SEO/analytics requirements, regression risks, tests and documentation. Then submit for **independent technical review**. The author does not self-approve significant production work.

### Findings and release severity
PF-SOP-09 uses:
- **E0 Critical** — security breach/data exposure/data loss/payment corruption/production unavailable/auth bypass. Release blocked.
- **E1 High** — critical customer/business workflow significantly broken. Release blocked.
- **E2 Medium** — meaningful defect with workaround; resolve before launch when required by scope/risk.
- **E3 Low** — minor/noncritical issue; schedule appropriately.

Findings remain traceable. QA reports defects rather than silently fixing them. A fix must consider regression and root cause.

### Release Readiness
Growth, Scale and Custom major releases use the weighted ProFox Engineering Quality Score. A score of **90–100 is PASS**; **80–89 requires remediation**; below 80 is not release ready. Current E0/E1 findings override the numeric score and block release. Release also requires applicable QA, design fidelity, accessibility, security, performance, SEO/analytics, backup/recovery, UAT and rollback readiness.

### Change control
Do not quietly absorb material changes after approved scope/design. Record effort, cost, timeline, architecture, security, QA/regression, design/content/SEO impact and obtain the required Project Management/client approval before implementation.

### Production
Use an approved controlled build. A successful deployment command is not a successful launch. Perform production smoke tests for the project''s critical functions and record deployment, rollback, monitoring and recovery evidence.

### Incidents and root-cause learning
For production failure: **Detect → Classify → Contain → Restore service → Investigate → Communicate → Resolve → Verify → Root-cause review → Prevent recurrence.** Significant incidents must capture why the failure happened, why it was not prevented, why testing/monitoring did not catch it, and what control changes prevent recurrence.

### Handover and assurance
Technical handover must cover repository/hosting/domain responsibility, access ownership, documentation, integrations, analytics, backups, training, support period and maintenance responsibilities without insecurely transmitting passwords. Development prepares the package; Management performs the final client-release check. Package assurance remains 14 days for Launch, 30 days for Growth and 60 days for Scale, with depth adjusted to scope.

### Non-negotiable mindset
Never compromise customer safety/security to hit an artificial deadline. Never let AI-generated code bypass inspection, verification, tests or review. Never let a client system depend solely on one developer''s laptop. Never close a project without technical handover.

High-quality ProFox engineering is **correct, secure, accessible, fast, reliable, maintainable, tested, observable, recoverable and aligned with the client''s business objective**.',
1,true,now()
from public.training_modules m where m.slug='dev-pf-sop-09'
on conflict do nothing;

-- Temporarily move existing Developer track positions away from the final range so the unique(track_key,sort_order) constraint never collides.
update public.training_track_modules
set sort_order=sort_order+100
where track_key='web_development' and sort_order>=2 and sort_order<100;

insert into public.training_track_modules(track_key,module_id,sort_order,required,passing_score_override,requires_review_override)
select 'web_development',m.id,2,true,90,false
from public.training_modules m where m.slug='dev-pf-sop-09'
on conflict(track_key,module_id) do update set
  sort_order=2,required=true,passing_score_override=90,requires_review_override=false;

update public.training_track_modules tm
set sort_order=case m.slug
  when 'welcome' then 1
  when 'dev-pf-sop-09' then 2
  when 'dev-delivery-model' then 3
  when 'dev-definition-ready' then 4
  when 'dev-design-to-code' then 5
  when 'dev-reuse-architecture' then 6
  when 'dev-git-pr-workflow' then 7
  when 'dev-responsive-states' then 8
  when 'dev-testing-quality' then 9
  when 'dev-accessibility' then 10
  when 'dev-performance' then 11
  when 'dev-security-data' then 12
  when 'dev-staging-release' then 13
  when 'dev-qa-feedback' then 14
  when 'dev-launch-handover' then 15
  when 'confidentiality-data-protection' then 16
  when 'dev-final-certification' then 17
  else tm.sort_order end
from public.training_modules m
where tm.track_key='web_development' and tm.module_id=m.id
and m.slug in('welcome','dev-pf-sop-09','dev-delivery-model','dev-definition-ready','dev-design-to-code','dev-reuse-architecture','dev-git-pr-workflow','dev-responsive-states','dev-testing-quality','dev-accessibility','dev-performance','dev-security-data','dev-staging-release','dev-qa-feedback','dev-launch-handover','confidentiality-data-protection','dev-final-certification');

update public.training_lessons l
set content=l.content||E'\n\n### PF-SOP-09 execution note\nUse the canonical Development task, Engineering Ticket, evidence, finding and review controls in ProFox. A checklist tick without verifiable implementation/evidence does not satisfy the gate.',updated_at=now()
from public.training_modules m
where l.module_id=m.id and m.slug like 'dev-%' and m.slug<>'dev-pf-sop-09'
  and position('PF-SOP-09 execution note' in l.content)=0;
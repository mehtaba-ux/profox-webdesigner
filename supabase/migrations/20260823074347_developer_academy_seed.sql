-- Canonical Developer Academy seed using shared training infrastructure.
insert into public.training_tracks(track_key,name,target_role,department,description)
values('web_development','ProFox Developer Academy','developer','Development','Production-readiness training for Web Developers from approved design handoff through manager-approved client handover.')
on conflict(track_key) do update set
  name=excluded.name,target_role=excluded.target_role,department=excluded.department,
  description=excluded.description,active=true,updated_at=now();

with modules(slug,title,description,module_type,passing_score,requires_admin_review,sort_order) as (
 values
 ('dev-delivery-model','ProFox Development Delivery Model','Understand the developer operating boundary, canonical project/task records, UI/UX handoff, QA/client boundaries and manager-controlled handover.','lesson',90,false,2),
 ('dev-definition-ready','Development Definition of Ready','Start implementation only from approved scope, requirements, client-approved design, content/assets, assigned ownership and known dependencies.','lesson',90,false,3),
 ('dev-design-to-code','Approved Design to Production Code','Translate approved Figma, responsive behavior, components, interaction states and accessibility intent accurately without redesigning in code.','lesson',90,false,4),
 ('dev-reuse-architecture','Reuse, Components & Architecture','Inspect existing systems first, reuse approved components/services/patterns and introduce new abstractions only when justified.','lesson',90,false,5),
 ('dev-git-pr-workflow','Git, Branches, Pull Requests & Code Review','Use controlled feature branches, reviewable commits, pull requests, required checks and reviewer feedback while protecting production branches.','lesson',90,false,6),
 ('dev-responsive-states','Responsive Implementation & UI States','Implement responsive behavior plus loading, empty, error, success, focus, disabled and interaction states required by approved scope/design.','lesson',90,false,7),
 ('dev-testing-quality','Testing & Developer Self-QA','Use appropriate unit/integration/end-to-end/manual checks, acceptance criteria and regression testing before independent QA.','lesson',90,false,8),
 ('dev-accessibility','Web Accessibility Implementation','Implement and verify WCAG 2.2-oriented Level AA requirements applicable to the project.','lesson',90,false,9),
 ('dev-performance','Performance & Core Web Vitals','Build performance-aware experiences and verify relevant Core Web Vitals, asset loading, caching, rendering and third-party impact.','lesson',90,false,10),
 ('dev-security-data','Security, Secrets & Client Data','Apply secure coding/data-handling practices, least privilege, secret management and project-appropriate OWASP/ASVS controls.','lesson',90,false,11),
 ('dev-staging-release','Staging, CI & Release Evidence','Provide working staging, build/test evidence, deployment context, rollback/backup awareness and release notes before QA/launch.','lesson',90,false,12),
 ('dev-qa-feedback','QA, Design Fidelity & Revision Control','Resolve structured QA and UI/UX implementation findings in the canonical task flow, protect scope and re-test changed areas.','lesson',90,false,13),
 ('dev-launch-handover','Launch, Documentation & Manager-Controlled Handover','Prepare production/access/integration/documentation/training evidence. Development prepares the handover; Management must approve it before release to the client.','lesson',95,false,14),
 ('dev-final-certification','Web Developer Final Certification','Complete a controlled mini-project demonstrating implementation, Git/PR discipline, testing, accessibility, performance/security awareness and release/handover evidence. Independent Management review is required.','assignment',90,true,16)
)
insert into public.training_modules(title,slug,description,module_type,sort_order,required,active,passing_score,requires_admin_review,updated_at)
select title,slug,description,module_type,200+sort_order,true,true,passing_score,requires_admin_review,now()
from modules
on conflict(slug) do update set
  title=excluded.title,description=excluded.description,module_type=excluded.module_type,
  active=true,passing_score=excluded.passing_score,requires_admin_review=excluded.requires_admin_review,updated_at=now();

insert into public.training_track_modules(track_key,module_id,sort_order,required,passing_score_override,requires_review_override)
select 'web_development',m.id,x.sort_order,true,x.score,x.review
from(values('welcome',1,null::integer,false),('confidentiality-data-protection',15,90,false))x(slug,sort_order,score,review)
join public.training_modules m on m.slug=x.slug
on conflict(track_key,module_id) do update set
  sort_order=excluded.sort_order,required=true,passing_score_override=excluded.passing_score_override,
  requires_review_override=excluded.requires_review_override;

insert into public.training_track_modules(track_key,module_id,sort_order,required,passing_score_override,requires_review_override)
select 'web_development',m.id,
  case m.slug
    when 'dev-delivery-model' then 2 when 'dev-definition-ready' then 3 when 'dev-design-to-code' then 4
    when 'dev-reuse-architecture' then 5 when 'dev-git-pr-workflow' then 6 when 'dev-responsive-states' then 7
    when 'dev-testing-quality' then 8 when 'dev-accessibility' then 9 when 'dev-performance' then 10
    when 'dev-security-data' then 11 when 'dev-staging-release' then 12 when 'dev-qa-feedback' then 13
    when 'dev-launch-handover' then 14 when 'dev-final-certification' then 16 end,
  true,m.passing_score,m.requires_admin_review
from public.training_modules m where m.slug like 'dev-%'
on conflict(track_key,module_id) do update set
  sort_order=excluded.sort_order,required=true,passing_score_override=excluded.passing_score_override,
  requires_review_override=excluded.requires_review_override;

insert into public.training_lessons(module_id,title,content,sort_order,active,updated_at)
select m.id,m.title,
case m.slug
 when 'dev-delivery-model' then '## Your operating boundary\nYou own assigned Development work from Ready for Development through implementation, self-QA, code review, QA/design corrections and technical handover preparation. ProFox projects/tasks are the work source of truth; GitHub is the code source of truth.'
 when 'dev-definition-ready' then '## Do not code from ambiguity\nVerify approved scope, requirements, package, Design Approval, current handoff references, ownership and dependencies before implementation. Missing critical inputs stay BLOCKED and are escalated.'
 when 'dev-design-to-code' then '## Implement the approved experience\nTreat approved design/handoff as the visual and interaction source. Implement responsive behavior, components, states, content and accessibility intent faithfully.'
 when 'dev-reuse-architecture' then '## Inspect before creating\nSearch existing code, components, services, database functions and patterns before adding anything. Reuse compatible capability and justify new abstractions.'
 when 'dev-git-pr-workflow' then '## GitHub is the code record, not the project manager\nUse scoped branches, reviewable commits and pull requests linked to the ProFox work item. Never bypass required review/checks or commit secrets.'
 when 'dev-responsive-states' then '## Build behavior, not one screenshot\nVerify layouts across relevant widths and loading, success, error, empty, focus, active and disabled states.'
 when 'dev-testing-quality' then '## Self-QA before independent QA\nValidate acceptance criteria and critical user flows with project-appropriate automated/manual testing and regression checks.'
 when 'dev-accessibility' then '## Accessibility is implemented and verified\nUse semantic structure, keyboard-operable controls, visible focus, labels, accessible forms/errors and reflow-safe responsive behavior.'
 when 'dev-performance' then '## Performance is a release quality\nAvoid unnecessary JavaScript, oversized assets, blocking work and uncontrolled third-party cost. Record context when measuring performance.'
 when 'dev-security-data' then '## Security is part of Done\nUse least privilege, server-side authorization, input validation and approved secret stores. Never put credentials in code, task notes or screenshots.'
 when 'dev-staging-release' then '## Evidence before handoff\nProvide repository/branch/PR/commit context, build/test result, staging reference and deployment/migration/rollback dependencies before QA.'
 when 'dev-qa-feedback' then '## Fix the finding, then protect the rest\nResolve structured QA/design feedback, distinguish defects from new scope, fix root cause and re-test impacted areas.'
 when 'dev-launch-handover' then '## Development prepares; Management releases\nAssemble production URLs, source/repository access, CMS/admin instructions, integrations, analytics, backup/recovery, access ownership, release/QA evidence and documentation. Management must approve before client release.'
 when 'dev-final-certification' then '## Certification evidence\nComplete the supplied mini-project with required branch/PR workflow and submit source/PR, preview, tests, responsive/accessibility, performance/security and release/handover evidence for independent Management review.'
 else m.description end,
1,true,now()
from public.training_modules m
where m.slug like 'dev-%'
on conflict do nothing;
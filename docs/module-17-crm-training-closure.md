# Sales Academy Module 17 — CRM Training — Closure Record

Date: 2026-08-20
Module slug: `crm-training`
Academy order: 17
Implementation branch: `academy-module-17-crm-training`
Pull request: #29 — Complete Sales Academy Module 17 — CRM Training

## Closure scope

Module 17 replaces the legacy six-checkbox/Admin-review CRM practical test with a complete secured learner journey:

1. **30 structured CRM lessons**
2. **12 sequential synthetic CRM missions**
3. **25 server-scored CRM judgment scenarios**
4. **12 critical-failure scenarios**
5. **7 required acknowledgements**
6. **85/100 minimum score + zero critical misses**
7. Coaching/retry that retains completed lessons and sandbox missions
8. Admin-editable lesson, mission, scenario, acknowledgement and passing-score controls

Permanent operating framework:

**CAPTURE → VERIFY → ACT → RECORD → ADVANCE → PROTECT → HANDOFF**

Core standard:

**Make the CRM tell the truth. Advance only from evidence and approved workflow events.**

## Learner architecture

### Phase 1 — Learn

- 30 lessons
- sequential completion
- progress range: 0–45%
- covers lead/record discipline, duplicate prevention, source truth, activities, qualification, opportunity stages, meetings, quotation state, payment verification, protected Won, privacy, handoff, reporting and escalation

### Phase 2 — Practise

- 12 sequential server-validated missions
- synthetic prospect only (`Northstar Roofing Co.` / `.test` email/domain)
- progress range: 45–80%
- sandbox data stored only in `crm_training_state.sandbox_snapshot`
- mission evidence stored in Academy `training_assignments`
- no practice mission writes to production customer/sales CRM tables

Mission sequence:

1. `create_lead`
2. `record_research`
3. `log_outreach`
4. `schedule_follow_up`
5. `qualify_convert`
6. `record_discovery`
7. `schedule_meeting` — Proposal Review after discovery
8. `advance_pipeline`
9. `record_objection`
10. `record_quotation`
11. `handle_payment_claim`
12. `verified_handoff`

### Phase 3 — Certify

- 25 scenario questions
- server-side answer key
- 85/100 minimum
- zero critical misses
- all 7 active required acknowledgements required
- failed attempt → `Retry Required`, progress 85%
- passed attempt → `Passed`, progress 100%
- failed learners retain all completed lessons/missions and retry only the assessment

## Critical failure coverage

Automatic retry when any critical judgment is wrong:

1. lead-source falsification
2. unauthorized discount
3. self-verifying a payment claim
4. manually/early forcing Won
5. exposing credentials/secrets
6. unauthorized customer-data export
7. falsifying activity completion
8. inflating commercial value
9. commission/source manipulation
10. unsupported technical guarantee
11. unauthorized payment terms
12. falsified loss reason

## Database implementation

New tables:

- `public.crm_training_state`
- `public.crm_training_missions`

New/updated protected functions:

- `public.get_crm_training_config(uuid)`
- `public.complete_crm_training_lesson(uuid, uuid)`
- `public.submit_crm_training_mission(uuid, uuid, jsonb)`
- `public.submit_crm_training_assessment(uuid, integer[], uuid[])`
- `public.protect_crm_training_progress_write()`
- `public.protect_crm_training_assignment_write()`

Protection triggers:

- `trg_protect_crm_training_progress_write`
- `trg_protect_crm_training_assignment_write`

All six functions are `SECURITY DEFINER` with fixed `search_path=public, pg_temp`.

Authenticated learners receive execute permission only on the four intended learner RPCs. Guard functions remain unavailable to authenticated users.

## Isolation and security verification

Verified in production:

- `crm_training_state` RLS: **enabled**
- `crm_training_missions` RLS: **enabled**
- state policy: authenticated learner may SELECT own state; Admin may SELECT
- state table authenticated privileges: **SELECT only**
- mission policies: Admin-only SELECT/INSERT/UPDATE/DELETE
- mission table authenticated privileges: **SELECT/INSERT/UPDATE/DELETE only**, with Admin-only RLS enforcing writes
- authenticated has **no TRUNCATE / TRIGGER / REFERENCES** privilege on either new table
- direct learner terminal progress/score mutation is blocked by trigger guard
- direct learner Module 17 assignment/evidence writes are blocked by trigger guard
- mission RPC source has no references to live `crm_leads`, `crm_opportunities`, `crm_activities`, `sales_meetings`, quotation tables, payment tables, clients or projects
- mission RPC writes only to Academy training state/evidence/progress
- learner config removes server-only mission validation fields: `expectedDecision`, `expectedStage`, `minimumNoteLength`
- learner config does not expose question `correct_index`, critical flags or pre-submit explanations

### Security issue found and closed during QA

Initial Supabase default table privileges included `TRUNCATE`, `REFERENCES` and `TRIGGER` for `authenticated`. RLS does not protect `TRUNCATE`.

A final hardening migration was added to explicitly revoke all broad privileges and re-grant only the intended allowlist. Production re-audit confirmed the unsafe privileges are removed.

## Production data verification

Final production counts:

- module type: `lesson`
- required: `true`
- active: `true`
- passing score: `85`
- Admin review: `false`
- lessons: **30 / 30 active**
- synthetic missions: **12**
- assessment scenarios: **25**
- critical scenarios: **12**
- acknowledgements: **7**
- learner progress rows: **0**
- Module 17 assignment rows: **0**
- CRM training state rows: **0**

Assessment answer distribution:

- A / index 0: **6**
- B / index 1: **7**
- C / index 2: **6**
- D / index 3: **6**

Academy sequence verified:

- 16 — Payment Process
- 17 — CRM Training
- 18 — Calendar / Meeting Setup

## Production migration ledger

Schema/security migrations recorded by Supabase for Module 17:

- `20260820134512 academy_module_17_module_config`
- `20260820134529 academy_module_17_training_tables`
- `20260820134544 academy_module_17_training_rls`
- `20260820135157 academy_module_17_progress_guard_function`
- `20260820135208 academy_module_17_progress_guard_trigger`
- `20260820135223 academy_module_17_assignment_guard_function`
- `20260820135238 academy_module_17_assignment_guard_trigger`
- `20260820135310 academy_module_17_get_config_rpc`
- `20260820135345 academy_module_17_complete_lesson_function`
- `20260820135358 academy_module_17_complete_lesson_permissions`
- `20260820135457 academy_module_17_submit_mission_function`
- `20260820135508 academy_module_17_submit_mission_permissions`
- `20260820135531 academy_module_17_submit_assessment_function`
- `20260820135546 academy_module_17_submit_assessment_permissions`
- `20260820135841 academy_module_17_table_grant_hardening`

Large curriculum/mission/assessment seed payloads were deployed as insert-only production DML after the migration connector rejected large combined content migrations. The canonical reproducible seed migrations remain versioned in this repository.

## UI implementation

Learner:

- `src/components/onboarding/CrmTraining.tsx`
- `src/lib/crmTrainingService.ts`
- legacy `CrmPracticalTestWidget.tsx` retained as compatibility entry point and now renders the new secure Module 17 experience

Admin:

- `src/components/admin/CrmTrainingAdmin.tsx`
- route: `/admin/crm-training-controls`
- lesson bodies remain editable through the existing Curriculum & Module Editor
- dedicated controls support mission content/scenario facts, assessment scenarios/answers/critical flags, acknowledgements and passing score

Security-critical validation semantics stay server-controlled.

## CI verification

Before this closure-document commit, exact hardened implementation head `573fcc6c6b58e7f16149653554f27a5e57144f21` passed **ProFox CRM CI run #300**:

- dependency install: passed
- TypeScript check: passed
- production Vite build: passed

A final exact-head CI run is required after this documentation commit before PR #29 may merge.

## Closure decision

Module 17 implementation is production-deployed and has passed database, RLS, privilege, trigger, RPC-isolation, assessment-leakage and sequence verification. PR #29 may be merged only after the post-documentation exact-head CI run is green.

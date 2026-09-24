# Sales Academy Module 18 — Calendar / Meeting Setup — Closure Record

Status: **Production-deployed and QA-verified; merge only after exact-head CI is green.**

## Canonical module
- Title: Calendar / Meeting Setup
- Slug: `calendar-setup`
- Sort order: 18
- Type: lesson + practical certification
- Required: yes
- Active: yes
- Passing score: 90/100
- Admin review: no
- Critical misses allowed: 0
- Framework: `PROTECT → OFFER → CONFIRM → PREPARE → MEET → CAPTURE → ADVANCE`
- Principle: **Your calendar should create selling time, not consume it.**

## Production curriculum
- 20 sequential lessons
- 10 sequential synthetic calendar/meeting missions
- 20 server-scored judgment scenarios
- 8 critical-failure scenarios
- 7 required acknowledgements
- Answer distribution: A=5, B=5, C=5, D=5

## Learner experience
The legacy nine-checkbox calendar checklist is replaced by a secured three-stage Academy experience while preserving the existing `MyTraining` route contract:
1. Learn the Calendar / Meeting Operating System
2. Complete 10 synthetic scheduling missions
3. Pass the Meeting Judgment Certification

After server certification, the existing Academy wrapper may record its legacy `calendar_setup` completion evidence and normalize `Passed → Completed`. That compatibility path is accepted only after the secure server result already exists.

## Training isolation
Module 18 practice writes only to:
- `calendar_training_state`
- Module 18 `training_assignments` evidence
- Module 18 `user_training_progress`

Static production inspection confirms `submit_calendar_training_mission` contains no references to:
- `sales_meetings`
- `user_calendar_settings`
- `crm_leads`
- `crm_opportunities`

The learner configuration does not expose:
- `correct_index`
- critical flags
- pre-submit explanations
- server-only `expectedDecision`
- server-only `expectedAction`

## Security controls
### Tables
`calendar_training_state`
- RLS enabled
- authenticated: SELECT own state only (Admin can read all)
- no learner INSERT/UPDATE/DELETE/TRUNCATE grants

`calendar_training_missions`
- RLS enabled
- Admin-only SELECT/INSERT/UPDATE/DELETE policies
- explicit authenticated table privilege allowlist: SELECT/INSERT/UPDATE/DELETE only
- no TRUNCATE/TRIGGER/REFERENCES privilege

### Protected writes
- `trg_protect_calendar_training_progress_write`
- `trg_protect_calendar_training_assignment_write`

Learners cannot directly fabricate terminal status, score, completion time, mission history or assessment history.

### Authenticated learner RPCs
- `get_calendar_training_config(uuid)`
- `complete_calendar_training_lesson(uuid,uuid)`
- `submit_calendar_training_mission(uuid,uuid,jsonb)`
- `submit_calendar_training_assessment(uuid,integer[],uuid[])`

All four are `SECURITY DEFINER` with fixed `search_path=public, pg_temp`, denied to anon/public, and granted to authenticated users. Guard functions themselves are not executable by authenticated users.

## Production lifecycle QA
A disposable user was created for Module 18 QA, given Modules 1–17 as completed only during controlled setup, then tested as an ordinary active Sales user.

Verified failures:
- lesson 2 before lesson 1 → blocked
- mission before all lessons → blocked
- assessment before lessons/missions → blocked
- direct force `Passed`/score/completion → blocked
- fake assessment-history insert → blocked
- mission 2 before mission 1 → blocked

Verified valid path:
- 20/20 lessons completed sequentially
- lesson phase reached 45%
- 10/10 synthetic missions completed sequentially
- mission phase reached 80%
- 10 mission evidence rows created in training only
- 10 sandbox sections created

Certification integrity:
- 95/100 with one critical miss → `Retry Required`
- direct force-Passed after retry → blocked
- clean retry 100/100 with zero critical misses → `Passed`
- post-pass assessment resubmission → blocked
- legacy Academy `calendar_setup` completion evidence after secure Pass → allowed
- `Passed → Completed` shell normalization after secure Pass → allowed

Live-system isolation during QA:
- live `user_calendar_settings` rows for QA user: 0
- live `sales_meetings` rows for QA user: 0

Final QA cleanup:
- auth user: 0
- user profile: 0
- training progress: 0
- training assignments: 0
- calendar training state: 0
- live calendar settings: 0
- live sales meetings: 0
- mock-call evaluator profile/exclusion residue: 0

An existing Module 11 evaluator cleanup trigger required the temporary evaluator-profile row to be removed before deleting the QA auth profile; the cleanup was performed without modifying or weakening Module 11.

## Admin editability
- 20 lesson bodies remain editable in the existing Curriculum / Module Editor.
- Dedicated `/admin/calendar-training-controls` manages:
  - passing score
  - synthetic mission titles/objectives/instructions/scenario facts/active state
  - certification scenario text/options/answer keys/explanations/critical flags
  - acknowledgements

## Closure rule
Do not start Module 19 until this branch has passed exact-head TypeScript + production-build CI, PR #30 is merged using that tested head, `main` is verified, and the final production readback remains clean.

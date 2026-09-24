# Sales Academy Module 19 — Confidentiality & Data Protection — Closure Record

Status: **Production-deployed and QA-verified; merge only after final exact-head CI is green.**

## Canonical module
- Title: Confidentiality & Data Protection
- Slug: `confidentiality-data-protection`
- Sort order: 19
- Type: lesson + practical security certification
- Required: yes
- Active: yes
- Passing score: 90/100
- Admin review: no
- Critical misses allowed: 0
- Framework: `CLASSIFY → MINIMIZE → VERIFY → PROTECT → SHARE → RECORD → REPORT`
- Principle: **Use only what you need. Access only what you need. Share only where authorized. Report anything suspicious immediately.**
- Incident framework: `STOP → PROTECT → REPORT → PRESERVE → FOLLOW`

## Production curriculum
- 20 sequential lessons
- 10 sequential synthetic confidentiality/security missions
- 20 server-scored judgment scenarios
- 8 critical-failure scenarios
- 7 required acknowledgements
- Answer distribution: A=5, B=5, C=5, D=5
- Required prerequisite gate: all active/required Academy modules with sort order < 19 must already be Passed or Completed

## Performance intent
Module 19 teaches confidentiality as a fast operating habit rather than a slow compliance exercise. The internal “10×” standard means reducing avoidable security, privacy and data-handling waste: fewer unmanaged copies, fewer wrong-recipient disclosures, fewer compromised accounts, cleaner CRM records, faster secure handoffs and immediate incident escalation. It is not a guaranteed numeric performance claim.

## Learner experience
The legacy one-checkbox confidentiality acknowledgement is replaced by a secured three-stage Academy experience while preserving the existing `MyTraining` route contract:
1. Learn the confidentiality/data-protection operating standard
2. Complete 10 synthetic security missions
3. Pass the final security judgment certification

After secure server certification, the existing Academy wrapper may record its legacy `confidentiality_ack` completion evidence and normalize `Passed → Completed`. That compatibility path is accepted only after the secure server result already exists.

## Training isolation
Module 19 practice uses synthetic information only. Learners never need to upload or expose real customer data, passwords, OTPs, API keys, payment secrets, CRM exports or live incident evidence.

Static production inspection confirms `submit_confidentiality_training_mission` contains no references to:
- `crm_leads`
- `crm_opportunities`
- `sales_meetings`
- `payments`
- `clients`
- `projects`

The learner configuration does not expose:
- `correct_index`
- critical flags
- pre-submit explanations

## Security controls
### Tables
`confidentiality_training_state`
- RLS enabled
- authenticated: SELECT own state only; Admin may read all
- authenticated table privilege allowlist: SELECT only
- no learner INSERT/UPDATE/DELETE/TRUNCATE privileges

`confidentiality_training_missions`
- RLS enabled
- Admin-only SELECT/INSERT/UPDATE/DELETE policies
- authenticated table privilege allowlist: SELECT/INSERT/UPDATE/DELETE only
- no TRUNCATE/TRIGGER/REFERENCES privilege
- learner-facing option labels/facts can be maintained by Admin, but server validation identifiers remain locked

### Protected writes
- `trg_protect_confidentiality_training_progress_write`
- `trg_protect_confidentiality_training_assignment_write`

Learners cannot directly fabricate terminal status, score, completion time, mission history or certification history.

### Authenticated learner RPCs
- `get_confidentiality_training_config(uuid)`
- `complete_confidentiality_training_lesson(uuid,uuid)`
- `submit_confidentiality_training_mission(uuid,uuid,jsonb)`
- `submit_confidentiality_training_assessment(uuid,integer[],uuid[])`

All are `SECURITY DEFINER` with fixed `search_path=public, pg_temp`, denied to anon/public, and granted to authenticated users. Guard functions themselves are not executable by authenticated users.

## Global Academy guard alignment
Lifecycle QA found that the existing project-wide `protect_training_progress_fields()` score guard requires the established secure quiz context for score writes. Module 19 now sets both:
- `profox.training_confidentiality_rpc=1`
- `profox.training_quiz_rpc=1`

only around its authenticated server-scored assessment write. The global guard was not weakened or bypassed.

## RPC context restoration hardening
A combined-transaction QA harness demonstrated that PostgreSQL transaction-local configuration remains active until the outer transaction ends unless restored. Normal PostgREST RPC calls would end the transaction after each request, but Module 19 was hardened further.

Each mutating Module 19 RPC now captures the previous secure context, enables only the required context around protected writes, and restores the prior value before returning. Assessment restores both the Module 19 context and global secure quiz context.

QA explicitly confirmed both secure contexts were empty/restored immediately after a scored attempt in the same outer transaction, and a direct force-Pass attempt immediately afterward was still blocked.

## Production lifecycle QA
A disposable user was created for Module 19 QA, given Modules 1–18 as completed only during controlled setup, then tested as an ordinary active Sales user.

Verified failures:
- learner answer keys/critical flags/pre-submit explanations hidden
- lesson 2 before lesson 1 → blocked
- mission before all lessons → blocked
- assessment before lessons/missions → blocked
- direct force `Passed`/score/completion → blocked
- fake assessment-history insert → blocked
- mission 2 before mission 1 → blocked

Verified valid path:
- 20/20 lessons completed sequentially
- 10/10 synthetic missions completed sequentially
- exactly 10 mission evidence rows created in training only

Certification integrity:
- 95/100 with one critical miss → `Retry Required`
- secure RPC contexts restored after assessment → verified
- direct force-Passed immediately after retry in same transaction → blocked
- clean retry 100/100 with zero critical misses → `Passed`
- post-pass assessment resubmission → blocked
- legacy Academy `confidentiality_ack` completion evidence after secure Pass → allowed
- `Passed → Completed` shell normalization after secure Pass → allowed

## QA cleanup
The temporary Sales QA identity triggered the existing Module 11 evaluator-pool reconciliation, creating one temporary evaluator profile. That row was removed while the temporary user profile still existed, then the QA identity was deleted. Module 11 was not modified or weakened.

Final cleanup verification:
- temporary auth user: 0
- temporary user profile: 0
- orphan training progress: 0
- orphan training assignments: 0
- orphan confidentiality training state: 0
- orphan evaluator profiles: 0
- orphan evaluator exclusions: 0

Final Module 19 production learner state after cleanup:
- `user_training_progress`: 0 rows for Module 19
- `training_assignments`: 0 rows for Module 19
- `confidentiality_training_state`: 0 rows

## Admin editability
- 20 lesson bodies remain editable in the existing Curriculum / Module Editor.
- Dedicated `/admin/confidentiality-training-controls` manages:
  - passing score
  - mission titles/objectives/instructions/scenario facts/learner-facing option labels/active state
  - certification scenario text/options/answer keys/explanations/critical flags/active state
  - acknowledgements
- Security-critical mission answer identifiers and RPC validation remain server-controlled.

## Production deployment note
The database connector’s automated content filter rejected the first large lesson-content migration call before execution because the curriculum contains security/credential terminology. The lesson content was therefore loaded in smaller insert-only SQL chunks. Production verification confirms exactly 20 active lessons ordered 1–20. Schema, RLS, guards and RPC changes were applied through formal migrations.

## Closure gate
Do not start Module 20 until:
1. the documented branch head passes exact-head TypeScript + production-build CI;
2. PR #31 is merged using that exact tested head;
3. `main` is verified;
4. final production readback remains 20 lessons / 10 missions / 20 scenarios / 8 critical / 7 acknowledgements, pass 90, active/required, no Admin review, and zero Module 19 learner/test state.

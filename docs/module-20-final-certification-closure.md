# Sales Academy Module 20 — Final Certification — Closure Record

Status: **Production-deployed and full-lifecycle QA verified; merge only after final exact-head CI is green.**

## Canonical module
- Title: Final Certification
- Slug: `final-certification`
- Sort order: 20
- Type: lesson + end-to-end practical + live Management certification
- Required: yes
- Active: yes
- Passing score: 90/100 for both scored gates
- Admin review: yes
- Critical misses/failures allowed: 0
- Framework: `THINK → EXECUTE → VERIFY → ADVANCE → PROTECT → HANDOFF`
- Principle: **A ProFox Sales Representative can execute the full sales process accurately, ethically, independently and consistently under pressure.**

Passing Module 20 creates **Sales Academy Certified** status only. It does not activate a seller. The candidate must separately request Final Approval and then pass the existing protected Admin activation workflow.

## Retention-first capstone architecture
Module 20 deliberately does not add another long lecture. It compresses Modules 1–19 into retrieval anchors and requires the seller to recall, apply, perform and prove the full operating system:

1. 10 sequential Certification Briefings
2. 12 sequential end-to-end synthetic Apex Roofing deal missions
3. 30 server-scored final judgment scenarios
4. 8 final operating commitments
5. 3-round live Management buyer simulation
6. Private learner self-assessment before evaluator results
7. 100-point Management live evaluation

The internal “10×” standard means less wasted motion and more useful verified output per seller hour. It is not a guaranteed numeric performance claim.

## 10 certification briefings
1. Certification Is About Judgment
2. Customer Outcome Before Seller Activity
3. Diagnose Before Prescribing
4. Recommend, Don’t Dump Options
5. Handle Resistance Without Fighting
6. Ask for the Decision Clearly
7. Commercial Truth Cannot Bend
8. CRM and Calendar Must Tell the Truth
9. Trust Is Part of Sales Performance
10. Final Certification Rules

The briefing phase contributes 20% training progress and must be completed sequentially.

## 12 end-to-end deal missions
The synthetic primary account is **Apex Roofing & Exteriors**. Sarah Mitchell is the Marketing Director/champion; Daniel Cole is the Owner/final commercial decision maker.

1. Research the Account
2. Qualify the Prospect
3. Build Personalized Outreach
4. Handle the Reply & Book the Meeting
5. Prepare for Discovery
6. Conduct Discovery
7. Recommend the Right Solution
8. Handle the Competitive Price Objection
9. Close for a Real Decision
10. Build the Commercial Path
11. Protect Payment Truth
12. Final CRM & Handoff Audit

The missions are server-validated in order. Practice writes only to Module 20 training state/evidence. Static production inspection confirms `submit_final_certification_mission` has no references to live:
- `crm_leads`
- `crm_opportunities`
- `sales_meetings`
- quotations
- payments
- clients
- projects

The commercial missions intentionally read the live Admin-managed `sales_products` catalog. Production QA verified the Growth path against the current live `PF-WEB-GROWTH` catalog record and exact standard terms `50% / 30% / 20%` rather than a stale hardcoded price/payment lesson.

If the certification case references an inactive expected product, the mission fails closed and requires Admin case reconfiguration.

## 30-scenario judgment gate
- 30 active scenarios
- 15 critical scenarios
- passing score: 90/100
- critical misses allowed: 0
- 8 required operating commitments
- answer distribution: A=8, B=8, C=7, D=7

Judgment coverage spans qualification, outreach, meetings, discovery, recommendation, objections, closing, commercial authority, quotation state, payment verification, Won protection, CRM truth, next-step discipline and confidentiality/security.

Critical judgment categories include fabricated customer information, lead-source manipulation, ignored no-contact instructions, commission-biased recommendation, invented capability, unauthorized guarantees/discounts, quotation-approval bypass, manual payment verification, premature Won, stage manipulation, fake activity, restricted credential handling, cross-client disclosure and concealed incidents.

A passed judgment gate sets the Module 20 progress to `Submitted` / 80% and creates a frozen live certification session. It does **not** pass the module.

## Live Management certification
### Rotating buyer cases
Production contains 3 active advanced cases:
- Apex Roofing & Exteriors — United States
- MaplePeak HVAC & Plumbing — Canada
- Harbour Legal Group — United Kingdom

Retries prefer a buyer case the trainee has not yet seen.

Each live attempt freezes:
- seller brief
- hidden evaluator brief
- three-round structure
- evaluator instructions
- 100-point rubric
- 15 live critical-failure rules
- case name/version

Later Admin edits therefore do not retroactively change the standard used for an existing attempt.

### Three rounds
1. Discovery — 15 minutes
2. Recommendation, Objection & Close — 15 minutes
3. Rapid Operational Judgment — 10 minutes

### 100-point frozen rubric
- Research & Qualification — 8
- Outreach & Relevance — 7
- Discovery — 15
- Recommendation — 10
- Objection Handling — 10
- Closing & Next Step — 10
- Commercial Integrity — 15
- CRM & Calendar Discipline — 10
- Confidentiality & Security — 5
- Communication & Professionalism — 10

Active rubric total is exactly 100. Session creation fails closed unless there are exactly 10 active rubric items totaling exactly 100 points and exactly 15 active critical rules.

### 15 live critical rules
1. Fabricated Prospect or Customer Information
2. Fabricated Call, Meeting or Buyer Commitment
3. Falsified Lead Source or Commission Attribution
4. Commission-Biased Recommendation
5. Invented Capability or Integration
6. Unauthorized Guarantee
7. Unauthorized Discount or Commercial Term
8. Quotation Approval Bypass
9. Manual Payment Verification
10. Premature Won Transition
11. Prohibited Credential or Payment-Secret Handling
12. Ignored No-Contact Instruction
13. Cross-Client Confidential Disclosure
14. Falsified CRM or Meeting History
15. Concealed Material Incident

The final live evaluator is Management/Admin only. A high numeric score cannot compensate for any critical failure.

## Self-assessment-before-score rule
After Management completes the three live rounds, the session moves to `awaiting_self_assessment`.

The trainee must privately answer five reflection prompts before Management may submit an evaluation:
- What did I do well?
- Where did I lose clarity?
- Which buyer signal did I nearly miss?
- What would I do differently next time?
- What is my single biggest sales-development priority?

Evaluator scoring is blocked until the learner submits that reflection. This preserves self-learning rather than making the rep dependent on seeing the manager score first.

## Learner configuration secrecy
Production learner config exposes:
- 12 missions
- 30 sanitized judgment scenarios/options
- 8 commitments
- current live Sales Catalog
- seller-facing live-case brief/status after judgment pass

It hides:
- judgment answer keys
- judgment critical flags
- pre-submit coaching explanations
- hidden mission expected decisions/products/routes
- live evaluator brief
- live rubric snapshot
- live critical-rule snapshot

## Security controls
### RLS
RLS is enabled on all 7 Module 20 tables:
- `final_certification_state`
- `final_certification_missions`
- `final_certification_cases`
- `final_certification_rubric_items`
- `final_certification_critical_rules`
- `final_certification_sessions`
- `final_certification_events`

### Table privileges
- learner state/session/event tables expose authenticated SELECT only under RLS
- mission/case/rubric/critical configuration exposes SELECT/INSERT/UPDATE/DELETE to authenticated, but RLS permits writes only to Admin
- no `anon` table grants
- no authenticated `TRUNCATE`, `TRIGGER` or `REFERENCES` grants

### Protected writes
- `trg_protect_final_certification_progress_write`
- `trg_protect_final_certification_assignment_write`
- `trg_validate_final_certification_rubric_total`

A trainee cannot directly fabricate terminal progress, score, review fields or certification evidence.

### RPC security
Learner RPCs are authenticated-only, `SECURITY DEFINER`, and use fixed `search_path=public, pg_temp`:
- `get_final_certification_config(uuid)`
- `complete_final_certification_briefing(uuid,uuid)`
- `submit_final_certification_mission(uuid,uuid,jsonb)`
- `submit_final_certification_judgment(uuid,integer[],uuid[])`
- `submit_final_certification_self_assessment(uuid,jsonb)`

Admin live-workflow RPCs are executable only by authenticated identities and independently enforce `public.is_admin()`:
- `admin_get_final_certification_queue()`
- `admin_claim_final_certification_session(uuid)`
- `admin_schedule_final_certification_session(uuid,timestamptz,integer,text)`
- `admin_mark_final_certification_live_complete(uuid)`
- `admin_submit_final_certification_evaluation(uuid,jsonb,uuid[],text)`

Internal/guard functions are not executable by authenticated users:
- `create_final_certification_live_session(uuid,uuid)`
- `protect_final_certification_progress_write()`
- `protect_final_certification_assignment_write()`
- `validate_final_certification_rubric_total()`

All Module 20 functions audited are denied to `anon`.

A real non-Admin trainee was explicitly blocked from `admin_get_final_certification_queue()` during QA.

## Global Academy assignment-guard alignment
Lifecycle QA found that the existing project-wide `validate_training_assignment_submission()` still hardcoded the old Module 20 model as `final_certification_exam` with exactly 15 answers.

Module 20 extends only the `final-certification` branch of that global validator. Modules 1–19 behavior is preserved. The validator now accepts the following new evidence only when the appropriate secure server context is active:
- `final_certification_mission_v1`
- `final_certification_judgment_v1`
- `final_certification_self_assessment_v1`

The retired 15-answer `final_certification_exam` path remains accepted only through the legacy secure quiz context for compatibility with an older client build.

The global guard was not weakened or bypassed.

## Final Approval hardening
`request_sales_final_approval()` now requires:
- applicant is in `One-Day Training`
- signed agreement
- Module 20 status `Passed`
- Module 20 score >= live configured passing score
- latest Module 20 Management review is `Passed`
- a passed live Final Certification session with score >= passing score and zero critical failures
- all prior required Academy modules complete
- all prior Admin-reviewed gates have passing review evidence

On success it moves the applicant only to `Final Approval`.

It does **not**:
- set `final_approval=true`
- change profile role to Sales
- activate the user
- create production CRM access
- bypass the existing secure activation guard

## Production lifecycle QA
A disposable candidate identity was created with:
- profile role: `pending`
- profile status: `pending`
- applicant stage: `One-Day Training`
- signed agreement
- controlled prerequisite Modules 1–19 completion/review records

The actual Module 20 lifecycle ran as that non-Admin candidate. A separate existing Admin identity performed live-evaluator actions.

### Negative-path proof
Verified:
- briefing 2 before briefing 1 → blocked
- mission before all briefings → blocked
- judgment before all missions → blocked
- direct force `Passed` / score / completion → blocked
- fake Final Certification evidence → blocked
- mission 2 before mission 1 → blocked
- trainee access to Management live queue → blocked
- Final Approval request after automated judgment but before live pass → blocked
- direct force-Pass after a failed live attempt → blocked
- live Management evaluation before learner self-assessment → blocked

### Valid learning path
Verified:
- 10/10 briefings completed sequentially → 20%
- 12/12 synthetic deal missions completed sequentially → 55%
- exactly 12 mission evidence rows created
- Growth commercial path validated against live Sales Catalog terms

### Judgment integrity
Attempt 1:
- 29/30 correct = 97/100
- deliberately missed one critical scenario
- result: **Retry Required**
- critical misses: 1

Retry:
- 30/30 correct = 100/100
- critical misses: 0
- result: judgment gate passed
- progress became `Submitted` / 80%
- live Attempt 1 created

### Live Attempt 1 integrity
Case: **Apex Roofing & Exteriors**
- Admin claimed/scheduled/completed the 3-round simulation
- evaluator scoring before self-assessment → blocked
- learner submitted private reflection
- live score: **95/100**
- deliberately recorded 1 live critical failure
- result: **Retry Required**
- judgment pass remained preserved
- a new live attempt was automatically created
- candidate remained `One-Day Training`
- profile remained `pending / pending`

### Fresh-case retry
Live Attempt 2 used a different case: **MaplePeak HVAC & Plumbing**.

Verified:
- Admin claim/schedule/live-complete
- second private self-assessment
- full frozen rubric score: **100/100**
- critical failures: 0
- result: **Passed**
- Module 20 progress: `Passed`, 100%
- Management review: `Passed`

Immediately after Module 20 pass, the candidate was still:
- applicant stage: `One-Day Training`
- profile role: `pending`
- profile status: `pending`

No automatic production activation occurred.

### Final Approval transition proof
The candidate then called the hardened `request_sales_final_approval()`.

Verified result:
- applicant stage → `Final Approval`
- onboarding progress → 100
- `final_approval` remained false
- profile role remained `pending`
- profile status remained `pending`

The QA deliberately stopped before any Admin Final Approval or Sales activation RPC.

## QA cleanup
The disposable identity created no Module 11 evaluator-pool side effect because its profile remained pending.

Final cleanup verification:
- temporary auth user: 0
- temporary profile: 0
- temporary applicant: 0
- training progress: 0
- training assignments: 0
- Final Certification state: 0
- Final Certification sessions: 0
- evaluator profile/exclusion residue: 0

Production Module 20 learner baseline after cleanup:
- `user_training_progress`: 0 rows for Module 20
- `training_assignments`: 0 rows for Module 20
- `final_certification_state`: 0 rows
- `final_certification_sessions`: 0 rows

## Admin editability
Dedicated `/admin/final-certification-controls` is available from the Recruitment workspace.

Admin can maintain without code:
- pass score
- 12 mission copy and scenario/expected-answer configuration
- rotating live buyer cases
- seller brief
- hidden evaluator brief
- three-round structure
- evaluator instructions
- 30 judgment scenarios/options/answer keys/coaching/critical flags
- 8 operating commitments
- 100-point rubric
- 15 live critical rules

The 10 briefing bodies remain editable through the existing Curriculum / Module Editor.

Security and workflow gates remain server-controlled.

## Production final snapshot before merge
- module type: `lesson`
- pass score: 90
- Admin review: true
- required: true
- active: true
- briefings: 10
- missions: 12
- judgment scenarios: 30
- judgment critical scenarios: 15
- commitments: 8
- live cases: 3
- live rubric items: 10
- live rubric points: 100
- live critical rules: 15
- judgment answer distribution: A8 / B8 / C7 / D7
- learner progress rows: 0
- Module 20 assignment rows: 0
- Final Certification state rows: 0
- Final Certification session rows: 0

## GitHub closure gate
PR: **#32 — Complete Sales Academy Module 20 — Final Certification**

Lifecycle-hardened implementation head before this closure document:
`28b7b98222c6698b697b0ab373bf48b5ca63d610`

CI run **#314** passed on that exact head:
- TypeScript check: success
- Production build: success

Do not merge until the new head containing this closure record also receives exact-head green CI. After merge, verify `main` and the final production snapshot one last time.

# CRM Sales-to-Delivery Handoff — Part 13

## Status

Part 13 is **COMPLETE** in production. Trusted PR/main CI, checksum-verified migrations, production deployment, read-only release verification and non-destructive authenticated Seller/Admin QA all pass.

Part 14 has not started.

## Purpose

Part 13 turns the existing Sales Handover project stage into a server-authoritative submit → Delivery review → Accept / Return to Sales → Resubmit lifecycle without introducing a second Project, Requirement, Quotation, Payment, Onboarding, Validation, Promise, Scope Condition or task system.

The existing handoff route remains the single UI: /admin/project-handover/:id

## Canonical source-of-truth map

| Handoff fact | Canonical source |
| --- | --- |
| Customer / project identity | projects, clients, crm_opportunities, crm_leads |
| Structured Sales requirements | crm_requirements |
| Historical purchased scope / commercial agreement | quotations, quotation_items snapshots, Part 10B sales_scope_snapshot |
| Verified commercial activation | payments |
| Client delivery/onboarding facts | client_onboardings |
| Specialist feasibility / constraints | crm_sales_validations |
| Sales commitments | crm_sales_promises |
| Assumptions, exclusions, dependencies, client responsibilities | crm_sales_scope_conditions |
| Existing Sales submit / PM review work items | project_tasks using sales_handover_submission / sales_handover_review |
| Operational notifications | existing notification/outbox helpers |
| Delivery stage authority | existing projects.stage and protect_project_stage_workflow() |

The only new table is project_sales_handover_attempts. It stores append-oriented lifecycle/review/version evidence: attempt number, status, actor/time, structured Return reasons, missing/action items, and source references/fingerprints. It does not duplicate editable Requirements, quote, Payment, Onboarding, Promise, Validation or Scope Condition truth.

## Lifecycle

Server-authoritative lifecycle values: NOT_SUBMITTED, SUBMITTED, RETURNED_TO_SALES, RESUBMITTED, ACCEPTED.

Only the source Seller may submit/resubmit. The assigned Project Manager or an Administrator may Accept/Return. PM assignment is not required for an otherwise-ready Seller submission, but it is required for Delivery acceptance and Content activation.

Return requires one or more controlled reason categories, one or more structured missing/action items, actionable review notes, and server-derived reviewer/time. Each resubmission creates a new attempt. Reviewed attempts are immutable.

## Readiness

project_get_sales_handoff_readiness(uuid) derives READY, WARNING, or BLOCKED.

Hard blockers include Opportunity not Won, no accepted quotation, no qualifying verified Advance/Full Payment, Project not Active/Sales Handover, Client not linked, completed Onboarding missing, confirmed structured Sales Requirements missing, required/stale/rejected Validation issues, active Promise alignment conflict, stale/conflicting Scope Condition, and accepted quotation Part 10B reconciliation blockers.

Warnings remain visible and do not silently become blockers. A missing PM is a warning for Seller submission but remains a hard acceptance/Content prerequisite. No numeric score can override a hard blocker.

## Source version integrity

Every submission captures stable source references and fingerprints for material canonical handoff evidence. Operational Project updates such as assigning the PM are intentionally excluded from the digest so they do not create false staleness.

If canonical evidence changes after submission, Delivery acceptance is rejected until Sales reviews and resubmits. If canonical evidence changes after acceptance, Sales Handover → Content is rejected until the changed handoff is resubmitted and accepted again. Accepted history is not silently rewritten.

## Task and stage integrity

Existing tasks remain canonical: sales_handover_submission and sales_handover_review. Their status can no longer be used as a generic bypass. Protected transaction-local contexts are used only by canonical submit/review RPCs.

Sales Handover → Content now requires assigned PM, completed Onboarding, latest Part 13 attempt = ACCEPTED, no source-digest drift, and all existing required stage tasks complete. Later Delivery stages keep their existing workflow.

## UI

The existing handoff screen renders Customer & Business, why the client bought / business context, confirmed structured Requirements, accepted commercial agreement and immutable quotation items, timeline, specialist Validations, Promise Register, Assumptions / Exclusions / Dependencies, verified Payment, safe completed Onboarding delivery facts, outstanding Delivery dependencies, Seller final notes, full review history, readiness blockers/warnings with source links, Seller submit/resubmit, PM/Admin Accept, and PM/Admin Return to Sales.

Returned handoffs show textual RETURNED TO SALES state, structured reasons, reviewer notes, action items, and direct remediation routes. State is not color-only.

The existing Project Manager workspace links into this same route. The Seller lifecycle queue keeps Submitted/Resubmitted/Returned work visible until acceptance.

Sensitive tokens, credentials, private keys and payment-provider settlement identifiers are not exposed in the handoff UI.

## Migrations

- 20260920181000_crm_sales_delivery_handoff_part_13.sql
- 20260920181100_crm_sales_delivery_handoff_lifecycle_visibility_part_13.sql

Both are additive/forward migrations. They create no fake business record and deliberately do not fabricate a lifecycle attempt for the existing real Sales Handover Project.

## Tests and release gates

- tests/security/crm-sales-delivery-handoff-part-13.test.mjs
- tests/security/crm-sales-delivery-handoff-part-13-matrix.test.mjs — exact 85-case specification matrix
- tests/security/part13-authenticated-production-ui.test.mjs
- npm run test:crm-part13
- npm run production:verify-part13
- npm run production:verify-part13-ui

Part 13 is composed into full npm test, production build, migration verifier syntax checks, canonical production:verify, and the existing Part 11 → Part 12 → Part 13 authenticated production QA chain used by the deployment workflow.

## Production QA safety

Authenticated production UI verification uses trusted one-time sessions for the approved synthetic Seller and an active Admin, but tests the existing real Sales Handover Project read-only.

The QA script refuses to proceed if the real Project has legitimately changed in a way that invalidates the safe baseline. It does not create fake business records, assign a fake PM, submit the real handoff, Accept/Return it, advance the Project, or modify canonical business truth. Before/after snapshots must be exactly equal.

## Production closure

Part 13 is **COMPLETE** in production.

Final implementation and release evidence:

- implementation PR: #130
- exact implementation PR head: 69a00dc33f964d924d528e7853ab3113e69cb801
- trusted final implementation PR CI: ProFox CRM CI #907 / 35514434198 — PASS
- implementation merge SHA: 6e0c96304211e28c98d3f94277abff1dcb83ca47
- trusted merged-main implementation CI: ProFox CRM CI #908 / 35514571045 — PASS
- initial production deploy: Deploy ProFox Production #366 / 35514680043
- initial deploy applied and verified both Part 13 migrations, passed the Part 13 release verifier, production build, Worker deploy and browser smoke, then stopped only because the read-only authenticated QA expected the stale draft heading "Confirmed Structured Requirements" while the approved UI correctly retained "Confirmed Sales Requirements"
- verifier-only correction PR: #131
- exact verifier-fix PR head: 8eef062593d6d831d253126919bcb35cf748ef52
- trusted verifier-fix PR CI: ProFox CRM CI #909 / 35515013368 — PASS
- final runtime/main SHA: b3effbbbce97225bfa5145a1c60538a3037d1d82
- trusted final merged-main CI: ProFox CRM CI #910 / 35515772813 — PASS
- final canonical production deploy: Deploy ProFox Production #367 / 35515862068 — PASS
- Cloudflare Worker version: ceaacc8a-c6b3-4152-a740-14b17f14046f
- core migration: 20260920181000_crm_sales_delivery_handoff_part_13.sql
- core migration SHA-256: fd9427c22e1318c479e45cbc30494004cabe4d7a014736f7ebb1c3672a2abe5e
- lifecycle visibility migration: 20260920181100_crm_sales_delivery_handoff_lifecycle_visibility_part_13.sql
- lifecycle visibility SHA-256: 72f8edcdc0f29394f761caa4d1fdffc21723f0b2d4486e588c8cf028c95ebca0
- production custom migration ledger: 694 rows; latest version 20260920181100
- current migration lineage: APPLIED_EXACT 128, SUPERSEDED_BY_FORWARD_RECONCILIATION 5, PENDING_NEW 0, BLOCKED_UNRESOLVED 0
- Part 10B quotation Send gate: ACTIVE; policyVersion 2; snapshotSchemaVersion 2
- Part 13 focused suite: 122/122 PASS, including the exact 85-case specification matrix and production-QA safety contract
- security suite: 928/928 PASS
- Part 10A regression: 228/228 PASS
- Part 10B regression: 303/303 PASS
- Part 11 regression: 94/94 PASS
- Part 12 regression: 113/113 PASS
- TypeScript, migration integrity, browser launch-readiness, verifier syntax, dependency audit and production build: PASS
- Part 13 release readiness: 0 failure(s)
- authenticated Seller Part 13 QA: PASS — real handoff rendered Not Submitted/BLOCKED, canonical sections rendered, PM remained unassigned, no Accept/Return authority, no mutation, mobile/keyboard PASS
- authenticated Admin Part 13 QA: PASS — authoritative review route rendered truthful unassigned-PM state, no Accept/Return before submission, no Seller impersonation and no mutation
- production handoff immutability: projects 1; Sales Handover projects 1; lifecycle attempts 0; Seller task To Do; PM review task To Do; PM assigned false
- lifecycle integrity: duplicate pending attempts 0; reviewed rows without evidence 0; invalid source evidence 0; review task Done without acceptance 0
- RLS: enabled on project_sales_handover_attempts with one authenticated staff SELECT policy and zero public/anon policies
- duplicate prohibited handoff truth tables: 0
- Part 12 settlement-evidence guard remains preserved for provider_payment_id and paid_at
- business inventory unchanged: payments 5; verified payments 1; Awaiting Advance Payment 1; Won 1; clients 2; projects 1; onboardings 1; commissions 1; CRM activities 13
- no fake Client, Opportunity, Payment, Project, Onboarding or Handoff record was created for QA
- no real handoff was submitted, accepted, returned, assigned a fake PM or advanced solely for QA
- the existing real Sales Handover Project remains Active / Sales Handover, PM unassigned, Seller handoff task To Do, PM review task To Do, sales_handover_notes null and lifecycle attempts 0

General production readiness reports 0 failures and 4 pre-existing broader-environment warnings; those warnings are outside Part 13 scope and were not changed.

**PART 13 — SALES-TO-DELIVERY HANDOFF ACCEPTANCE / RETURN / RESUBMISSION: COMPLETE.**

**Part 14 has not started.**

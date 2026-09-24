# CRM Sales SOP Part 8 — Requirements Confirmed Gate + Proposal Readiness Foundation

## Objective

Part 8 replaces the legacy single-field `requirements_summary` entry check for the existing **Requirements Confirmed** Pipeline stage with a deterministic, structured, server-side readiness assessment. It also introduces a read-only **Proposal Readiness** preview using the same canonical sources without creating a proposal, quotation, Promise Register, Scope Conditions system, payment rule, Won rule, or Sales-to-Delivery handoff rule.

Part 8 stops after this foundation. Final quotation-send readiness remains deferred.

## Reuse audit

Part 8 reuses the Sales architecture already delivered in Parts 1–7:

- existing `crm_leads` / `crm_opportunities` lifecycle
- existing `crm_transition_opportunity(...)` Pipeline transition authority
- existing `crm_pipeline_settings` stage configuration
- existing `crm_requirements` and `crm_requirement_definitions_v1`
- existing six Requirement certainty states
- existing Discovery responses and completed Sales meetings as evidence
- existing Part 6 `crm_get_package_fit_assessment(...)` deterministic Package Fit engine
- existing `sales_products` as current commercial/catalog truth
- existing Part 7 `crm_sales_validations` specialist-review authority
- existing Part 7 current/stale/supersession model and approved constraints
- existing `crm_activities` and Sales meeting follow-up fields for meaningful next action
- existing Seller Guidance renderer `SellerGuidanceHelp`
- existing quotation approval, payment verification, and Won controls.

No existing Parts 1–7 business system is duplicated or replaced.

## Legacy Requirements Confirmed rule found

Before Part 8, production `crm_pipeline_settings` contains the existing stage:

- name: `Requirements Confirmed`
- order: `30`
- default probability: `35`
- allowed previous: `Meeting Scheduled`
- allowed next: `Quotation Sent`
- backward allowed: `true`
- skip allowed: `false`
- approval required: `false`
- legacy required field: `requirementsSummary`.

The existing canonical transition function checked target-stage `requiredFields`; therefore a non-empty opportunity `requirements_summary` could satisfy the legacy Requirements Confirmed prerequisite even when structured Requirements, certainty, Package Fit, specialist validation, evidence, decision authority, or next action were unresolved.

Part 8 removes only `requirementsSummary` from the stage's `requiredFields`. The column itself is retained for narrative/backward compatibility, and the stage's name, order, probability, allowed transitions, active state, approval rule, and classification are preserved.

## Gate/readiness policy

Canonical policy location: `public.system_configuration`.

Policy key: `crm_sales_gate_policy_v1`.

Policy version: `1`.

Current evaluator version after final Part 8 hardening: `2`.

The policy explicitly defines:

- supported gates: `REQUIREMENTS_CONFIRMED`, `PROPOSAL_READINESS`
- all six certainty states
- all four Requirement classes
- Core categories treated as current hard-blocking dimensions vs warning dimensions
- observational Requirement keys
- complex-deal decision keys
- complex Package Fit codes
- Package Fit status behavior
- Part 7 validation severity behavior
- the 18 current Proposal Readiness dimensions
- three future Proposal Readiness dimensions
- meaningful next-action generic subjects that do not count.

A second gate/readiness policy was not created.

## Requirement applicability

Part 8 evaluates canonical active Requirement Definitions rather than maintaining another Requirement catalog.

Applicability rules reuse the existing definition metadata and Part 6 concepts:

- Core: evaluated under the Part 8 gate policy.
- Recommended: missing global Recommended definitions are not made mandatory merely because they exist in the catalog; unresolved captured Recommended context can warn.
- Conditional: only evaluated when its canonical applicability condition is present. Conditionless Conditional definitions activate only when that area has actually been captured for the current deal.
- Complex: activated only for a genuinely complex opportunity, including relevant complex Package Fit / complex decision evidence.
- `ecommerce`, `booking`, `integration`, `custom_app`, and `complex_decision` conditions reuse current CRM Requirement evidence rather than forcing advanced fields onto simple opportunities.
- Archived Requirement rows never satisfy the current gate.
- legitimate `NOT_APPLICABLE` remains a resolved state.

This prevents a simple website opportunity from being forced through irrelevant enterprise qualification while still blocking material applicable gaps.

## Certainty handling

The six existing certainty states are preserved and not flattened:

- `CLIENT_CONFIRMED`: can satisfy a client-fact Requirement.
- `SELLER_OBSERVATION`: may satisfy only configured observational dimensions, and remains a warning rather than client confirmation.
- `SELLER_HYPOTHESIS`: does not satisfy a mandatory client fact.
- `AWAITING_CLIENT`: remains unresolved; material Core/Conditional/Complex items block according to gate policy.
- `NEEDS_SPECIALIST_VALIDATION`: consults Part 7 current review state.
- `NOT_APPLICABLE`: may resolve an item where legitimate.

Part 8 never rewrites a specialist-approved Requirement to `CLIENT_CONFIRMED`. Client truth and specialist feasibility remain separate.

## Package Fit handling

Part 6 remains authoritative. Part 8 calls:

`crm_get_package_fit_assessment(lead_id, opportunity_id)`

and interprets the current result through the Part 8 policy:

- `FIT`: current Package Fit dimension passes.
- `POSSIBLE_FIT`: warning when the remaining uncertainty is non-blocking.
- `REVIEW_REQUIRED`: Part 8 checks the exact current Part 7 review signals and missing/configuration information. It may remain a warning only when current structured review signals are approved and no unresolved information/configuration issue remains.
- `MISMATCH`: blocker until current scope/package mismatch is resolved.

Part 6 `mismatchSignals` are not independently promoted into extra Part 8 blockers. They describe candidate/package mismatches inside the Part 6 classifier.

Catalog facts continue to come from current `sales_products` through Part 6. Part 8 does not duplicate package names, price, scope, duration, or current product truth into a business table.

## Sales Validation handling

Part 7 remains the only specialist-review authority.

Part 8 reads current, unsuperseded review records. A superseded historical `REJECTED` or `STALE` review cannot poison readiness after a valid fresh review supersedes it.

For a Requirement in `NEEDS_SPECIALIST_VALIDATION`:

- no current review: blocker
- `PENDING`: blocker when material
- `IN_REVIEW`: blocker when material
- `NEEDS_INFORMATION`: blocker when material
- current `APPROVED`: may resolve the validation dimension
- `REJECTED`: blocker while the underlying need remains material
- `STALE`: blocker
- `CANCELLED`: does not count as approval.

For unresolved current Part 7 reviews generally, the versioned policy maps severity:

- RED → blocker
- AMBER → blocker
- GREEN → warning

`REJECTED` and `STALE` remain blocking regardless of lower severity because their current material question is unresolved.

## Approved constraints

When a current Part 7 review is `APPROVED` with `approved_constraints`, Part 8 returns and displays the constraints. A green/approved state never hides the conditions under which the specialist approved the request.

Approval resolves the specialist validation question. It does not change client certainty, erase Package Fit complexity, approve final quotation scope, or waive downstream manager/quotation approval.

## Decision-process handling

Core decision authority and approval-process Requirements are evaluated under the gate policy. Complex decision fields such as economic buyer, stakeholder map, procurement, internal champion, and deeper decision criteria activate only for opportunities that are actually complex.

A simple Lead is not forced through enterprise procurement/stakeholder qualification solely because those definitions exist globally.

## Next-action handling

For an open opportunity, Part 8 requires one meaningful current next action with owner and due timing from existing systems:

1. scheduled `crm_activities`, or
2. a completed Sales meeting with meaningful `next_step`, Seller owner, and `follow_up_at`.

Generic placeholders such as `TBD`, `Follow up`, `Follow-up`, `Wait`, or `Waiting` do not satisfy the dimension.

Closed/lost lifecycle is not incorrectly forced through this active-opportunity rule.

## Requirements Confirmed evaluator

Canonical RPC:

`public.crm_get_sales_gate_assessment(p_opportunity_id uuid, p_gate_key text)`

Properties:

- `STABLE`
- `SECURITY DEFINER`
- explicit safe search path
- authenticated execution only
- canonical Lead access check through the opportunity's server-derived `lead_id`
- no caller-supplied Lead identity
- no writes during assessment
- exact blockers and warnings
- whole-number informational score
- current Part 7 approvals/constraints
- current Part 6 Package Fit summary
- meaningful next action
- future dimension state
- `finalQuotationSendGateActive: false`.

### Requirements Confirmed status

`BLOCKED`: one or more current hard blockers exist. The opportunity must not enter Requirements Confirmed.

`WARNING`: no current hard blocker exists, but non-critical uncertainty or a downstream condition remains visible. Current policy allows progression while preserving the warning.

`PASS`: no current Part 8 blocker or warning remains for the gate.

A score never overrides a hard blocker.

## Exact blocker output

Blockers are returned as structured items with:

- stable code
- exact human-readable message
- source type
- source record identity where available
- Requirement key/category/class where relevant
- validation type/severity where relevant
- `hardBlocker: true`
- canonical action target.

Examples of action targets are existing Requirements, Discovery, Package Fit, Sales Validation, and Follow-Ups surfaces.

The Pipeline transition aggregates the first current blocker messages into the server exception so the Seller sees the reason rather than only a percentage.

## `crm_transition_opportunity` integration

Part 8 replaces the body of the existing `crm_transition_opportunity(uuid,text)` function. It does not create `crm_transition_opportunity_v2` or an override bypass.

All existing transition rules remain in the canonical function, including:

- active/open opportunity requirement
- owner/Admin authorization
- configured forward/backward transition rules
- stage approval rule
- existing target `requiredFields`
- scheduled meeting prerequisite
- Quotation Sent prerequisite
- Awaiting Advance Payment prerequisite
- Admin/payment-controlled Won prerequisite
- configured default probability behavior.

When the target is `Requirements Confirmed`, the function performs a fresh `crm_get_sales_gate_assessment(..., 'REQUIREMENTS_CONFIRMED')` at the exact transition point. `BLOCKED` raises and no stage mutation occurs.

This server evaluation is authoritative and prevents stale frontend results or TOCTOU bypass.

## Frontend Pipeline precheck

The existing shared `crmService.transitionOpportunity(...)` path now performs a frontend Requirements Confirmed readiness assessment before calling the existing transition RPC.

If the frontend assessment is `BLOCKED`, the Seller receives the exact blocker summary without attempting the mutation.

If it is PASS/WARNING, the shared service still calls `crm_transition_opportunity(...)`. The server evaluates again. Therefore the frontend precheck is UX only and cannot bypass server authority.

Because the Pipeline board and drawer stage controls already use the shared service, no second Pipeline transition implementation was added.

## Legacy `requirements_summary`

`crm_opportunities.requirements_summary` remains in the schema and remains available as narrative/backward-compatible text.

It is no longer authoritative for Requirements Confirmed. A filled `requirements_summary` alone cannot satisfy structured readiness, credible evidence, Package Fit, specialist validation, decision, or next-action requirements.

The readiness response reports:

- `legacyRequirementsSummaryPresent`
- `legacyRequirementsSummaryAuthoritative: false`.

No destructive column removal occurs.

## Proposal Readiness foundation

`PROPOSAL_READINESS` uses the same read-only evaluator architecture. Its current 18 dimensions are:

1. Business / Context
2. Problem
3. Impact
4. Desired Outcome
5. Audience
6. Scope
7. Package Fit
8. Technical Validation
9. Commercial Validation
10. Timeline Validation
11. Compliance/Risk Validation
12. Decision Process
13. Requirements Completeness
14. Meeting / Discovery Evidence
15. Next Action
16. Current Assumptions
17. Current Exclusions
18. Current Dependencies.

Status values:

- `READY`
- `WARNING`
- `BLOCKED`.

The percentage is whole-number current coverage across these 18 dimensions. It is informational only. Any hard blocker forces `BLOCKED` regardless of score.

## Assumptions, exclusions, dependencies

Current assumptions, exclusions, and client dependencies continue to live in canonical `crm_requirements` keys:

- `assumptions`
- `exclusions`
- `client_dependencies`.

Part 8 surfaces their current status; it does not create a dedicated Scope Conditions table.

## Future Proposal Readiness dimensions

Part 8 explicitly returns the following as `NOT_YET_EVALUATED` / `FUTURE_WORKFLOW`:

- `PROMISE_COVERAGE`
- `FINAL_SCOPE_RECONCILIATION`
- `QUOTATION_SNAPSHOT_COVERAGE`.

This is deliberate disclosure of incomplete future coverage, not a false failure and not a false pass.

### Promise Coverage deferral

No Promise Register exists in Part 8. Promise Coverage cannot truthfully be evaluated until the authoritative promise workflow exists, so it stays explicitly deferred.

### Final quotation-send gate deferral

Part 8 does not modify quotation-send authority. The Proposal Readiness UI states that it is pre-quotation and never means “ready to send.” `finalQuotationSendGateActive` remains `false`.

Existing quotation approval remains untouched.

## UI

Reusable component:

`src/components/admin/crm/CRMSalesReadinessPanel.tsx`

Integrated into:

`src/components/admin/crm/CRMRequirementsWorkspace.tsx`

The Requirements workspace continues to show existing Sales Validation and Package Fit surfaces, then shows:

- Requirements Confirmed status and current coverage
- exact hard blockers
- warnings
- current approved specialist reviews
- approved specialist constraints
- current dimensions
- Proposal Readiness status/current coverage
- explicit future workflow dimensions
- refresh action
- canonical navigation actions.

No unnecessary Lead Drawer readiness tab was added.

Design follows existing CRM standards: navy structure, semantic green/amber/red statuses, Lucide icons, keyboard-focus styles, non-color-only blocker labels, responsive grids, and accessible expand/collapse semantics.

## Seller Guidance

Part 8 reuses the existing `SELLER_GUIDANCE` registry and `SellerGuidanceHelp` renderer. `crmSalesReadinessGuidance.ts` augments that same registry with:

- `section.requirements_confirmed_readiness`
- `section.proposal_readiness`
- `field.readiness_status`
- `field.readiness_score`
- `section.readiness_blockers`
- `section.readiness_warnings`
- `field.hard_blocker`
- `field.future_readiness_dimension`
- `action.resolve_readiness_blocker`
- `status.readiness_ready`
- `status.readiness_warning`
- `status.readiness_blocked`.

No second tooltip component or guidance rendering system was created.

## Security

Readiness RPC execution is revoked from `public` and `anon` and granted only to `authenticated`.

The evaluator derives the Lead from the requested Opportunity and checks canonical `crm_can_access_lead(lead_id)`. There is no caller-supplied Lead override and no browser service-role use.

The evaluator is read-only. It does not insert/update/delete business data.

The canonical transition RPC keeps its existing authenticated/owner/Admin authorization and performs readiness server-side before stage mutation.

## Migrations

Part 8 uses two ordered migrations:

1. `20260909200000_crm_sales_requirements_confirmed_proposal_readiness_part_8.sql`
   - initial policy/evaluator
   - removes only legacy `requirementsSummary` target required-field dependency
   - replaces existing canonical `crm_transition_opportunity`
   - grants/revokes.
2. `20260909201500_crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening.sql`
   - same policy key, no second policy
   - evaluator version 2
   - final Requirement/applicability behavior
   - current unsuperseded Part 7 review handling
   - Package Fit review-resolution hardening
   - 18 current Proposal Readiness dimensions
   - three explicit future dimensions.

The original Part 8 migration was deliberately renamed to sort after Part 7 migrations (`20260909193000` and `20260909194500`), because Part 8 depends on `crm_sales_validations`.

Expected new business tables: **NONE**.

## Acceptance tests

Focused suite:

`tests/security/crm-sales-requirements-confirmed-proposal-readiness-part-8.test.ts`

It contains exactly **121 required acceptance cases** matching the Part 8 specification plus three architecture sanity checks. The normal repository security command also executes Parts 1–7 regression suites.

TypeScript, security, migration-integrity, build, GitHub CI, Cloudflare, and authenticated browser results must be reported truthfully based on what is executable; authenticated browser QA must never be fabricated.

## Production safety / verification

Production validation is read-only except approved migration/config application.

Baseline captured before Part 8 migration:

- `crm_leads`: 6
- `crm_opportunities`: 2
- `crm_requirements`: 0
- `crm_sales_validations`: 0
- `crm_activities`: 13
- `sales_meetings`: 5
- `quotations`: 6
- Part 8 migration rows: 0
- `crm_get_sales_gate_assessment` functions: 0.

No real customer stage is moved for testing. No fake Requirement, review, activity, meeting, quotation, Lead, or Opportunity is created.

After migration, these business row counts and latest-update timestamps must be rechecked to confirm that Part 8 application itself did not mutate customer/business rows.

## Duplication audit

Part 8 architecture is intentionally singular:

- one Sales gate/readiness policy key
- one server readiness evaluator name
- one existing Pipeline transition authority
- one existing Requirements system
- one existing Package Fit engine
- one existing Sales Validation system
- no parallel quotation gate
- no gate-evaluation/history business table.

## Part 9 dependencies / deferred work

Part 8 deliberately does **not** start:

- Promise Register
- dedicated Scope Conditions workflow
- final quotation-send gate
- quotation snapshot integration
- quotation auto-generation
- manager override center
- payment/Won changes
- Sales-to-Delivery Handoff enforcement.

Those remain future workflow work and must reuse the Part 8 readiness foundation rather than creating another readiness architecture.

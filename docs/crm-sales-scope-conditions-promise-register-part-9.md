# CRM Sales SOP Part 9 — Scope Conditions + Promise Register

## Status

Implemented on top of the completed Parts 1–8 Sales SOP architecture. Part 9 is a pre-quotation integrity layer only. It does not write quotation snapshots, activate the final quotation-send gate, change payment/Won logic, or implement Sales-to-Delivery enforcement.

## Objective

Part 9 adds two explicit, auditable pre-quotation domains:

1. **Scope Conditions** — reconciled proposal boundaries such as assumptions, exclusions, dependencies, client responsibilities, and scope boundaries.
2. **Promise Register** — material commitments ProFox actually communicated to a client.

The implementation preserves the existing source-of-truth hierarchy instead of duplicating Requirements, Sales Validation, Sales Catalog, Proposal Readiness, or quotation systems.

## Canonical reuse audit

Before implementation, the existing CRM/Sales architecture was treated as authoritative:

- `crm_requirements` remains the structured discovery/requirements source.
- `crm_sales_validations` remains the specialist-review and approved-constraints authority.
- `sales_products` remains current catalog/commercial truth.
- `crm_get_sales_gate_assessment` remains the canonical Requirements Confirmed / Proposal Readiness evaluator.
- `quotations` and quotation item snapshots remain downstream client-specific commercial records.
- existing CRM lead-event/timeline infrastructure is reused for auditable lifecycle events.

No pre-existing canonical Scope Conditions Register or Promise Register was found, so Part 9 introduces exactly two business tables and no parallel assumption/exclusion/dependency sub-systems.

## Data model

### `crm_sales_scope_conditions`

One canonical pre-quotation register supports:

- condition types: `ASSUMPTION`, `EXCLUSION`, `DEPENDENCY`, `CLIENT_RESPONSIBILITY`, `SCOPE_BOUNDARY`;
- lifecycle states: `DRAFT`, `ACTIVE`, `STALE`, `RESOLVED`, `SUPERSEDED`, `WITHDRAWN`;
- optional source links to Requirement, Sales Validation, or Sales Meeting;
- source summary/provenance;
- validation-alignment state;
- actor/time audit fields;
- history-safe supersession;
- deterministic current-record dedupe.

Active wording is not edited silently. Material changes to Active/Stale conditions require a Draft revision. Activating the revision supersedes the prior current wording while preserving history. Resolve and Withdraw preserve the historical record; hard delete is prohibited by trigger.

### `crm_sales_promises`

One canonical internal Promise Register supports:

- promise types: `SCOPE`, `TECHNICAL`, `TIMELINE`, `COMMERCIAL`, `SUPPORT`, `COMPLIANCE`, `PERFORMANCE_RESULT`, `OTHER`;
- lifecycle states: `DRAFT`, `ACTIVE`, `SUPERSEDED`, `WITHDRAWN`;
- source/evidence types: internal draft, documented client communication, completed Sales Meeting, Requirement context, or Sales Validation context;
- optional Requirement / Sales Validation / Sales Meeting links;
- validation-alignment state;
- server-stamped promised-by / promised-at fields;
- history-safe supersession and withdrawal;
- deterministic current-record dedupe.

A Draft is not a client commitment. An Active Promise requires an explicit seller action confirming that ProFox actually communicated the commitment. `INTERNAL_DRAFT` cannot be activated. A Meeting source must reference a Completed Sales Meeting. Other communication sources require a meaningful source summary.

A real communicated commitment is allowed to be recorded even when specialist approval is missing. The system preserves the truth and surfaces the missing approval as a blocker rather than hiding the commitment.

## Requirement reconciliation

Part 9 adds proposal-reconciliation metadata to the existing `crm_requirements` records. It does not replace or copy Requirements into another requirements system.

For material source Requirements, the seller explicitly chooses one of these paths:

- create/link a Scope Condition; or
- mark the Requirement `NOT_MATERIAL` for proposal reconciliation with a meaningful explanation.

Relevant existing Requirement keys include assumptions, exclusions, and client dependencies. Relevant custom Requirement categories include integrations, custom application, and risks/dependencies.

If a Requirement used by an Active Scope Condition materially changes, the linked condition becomes `STALE`, the prior wording remains preserved, and proposal reconciliation is cleared for human review. An audit event is written.

## Trusted mutation boundary

Frontend code does not directly write the new tables. All mutations use SECURITY DEFINER RPCs with safe `search_path`, server-controlled actor/timestamp fields, canonical Lead access checks, and cross-entity lineage validation.

Condition RPCs:

- `crm_save_sales_scope_condition_draft`
- `crm_reconcile_sales_scope_requirement`
- `crm_revise_sales_scope_condition`
- `crm_transition_sales_scope_condition`

Promise RPCs:

- `crm_save_sales_promise_draft`
- `crm_revise_sales_promise`
- `crm_transition_sales_promise`

Table writes are not granted directly to authenticated users. Authenticated users receive authorized SELECT through RLS plus EXECUTE on the trusted mutation/read RPCs.

## RLS and security

Both Part 9 tables have RLS enabled. Read access is constrained through `crm_can_access_lead(lead_id)`. Anonymous/public execution is revoked from Part 9 RPCs. Cross-Lead Requirement, Validation, Meeting, Opportunity, Scope Condition, and Promise relationships are rejected server-side.

Internal helper functions are not exposed as generic browser mutation surfaces.

## Scope & Commitments assessment

`crm_get_sales_scope_commitment_assessment(opportunity_id)` provides deterministic pre-quotation integrity status without writing business records.

Scope checks include:

- unreconciled material Requirement sources;
- Draft conditions still being reconciled;
- Stale current conditions;
- linked specialist-review freshness;
- alignment with current approved specialist constraints.

Promise checks include:

- source/evidence sufficiency;
- truthful Active commitments lacking required specialist review;
- stale/rejected/cancelled/superseded/mismatched Sales Validation;
- explicit alignment with approved constraints;
- Commercial Promise reminder that quotation-specific pricing/discount/payment-term approval remains in the existing quotation approval workflow.

Zero Active Promises is a legitimate state. The seller is never encouraged to invent a Promise to satisfy a count.

## Workspace read model

`crm_get_sales_scope_commitment_workspace(lead_id, opportunity_id)` returns one authorized payload containing:

- Scope Conditions;
- Promise records;
- relevant canonical Requirements;
- existing Sales Validation records;
- relevant Sales Meetings;
- the current Scope & Commitments assessment.

The read path creates no Scope Condition or Promise records.

## Proposal Readiness integration

Part 9 extends the existing Part 8 policy/evaluator rather than creating a second readiness engine.

The migration fails closed unless it sees the expected completed Part 8 contract (policy version 1, evaluator version 2, the existing 18 Proposal Readiness dimensions, and the three deferred quotation-reconciliation dimensions).

For `PROPOSAL_READINESS` only, the existing evaluator is upgraded to evaluator version 3 and gains two dimensions:

- `SCOPE_CONDITIONS_REGISTER`
- `PROMISE_REGISTER_INTEGRITY`

Part 9 Scope/Promise blockers and warnings are merged into the existing Proposal Readiness result. Requirements Confirmed remains focused on the Part 8 structured-requirements gate and keeps its 18-dimension calculation.

Hard blockers still override the numerical readiness percentage through the existing canonical evaluator behavior.

## Deferred quotation coverage remains explicit

Part 9 does not pretend it compared the registers against a quotation snapshot. The assessment continues to return:

- `PROMISE_COVERAGE` — `NOT_YET_EVALUATED`
- `FINAL_SCOPE_RECONCILIATION` — `NOT_YET_EVALUATED`
- `QUOTATION_SNAPSHOT_COVERAGE` — `NOT_YET_EVALUATED`

It also reports:

- `finalQuotationSendGateActive: false`
- `writesQuotation: false`

Actual quotation-snapshot reconciliation and the final client-facing send gate remain deferred to Part 10.

## Seller UI

Part 9 is integrated inside the existing Sales Readiness experience, keeping the seller in the CRM context.

The UI provides:

- compact Scope & Commitments summary;
- Scope Conditions status, blockers/warnings, Requirement reconciliation, source/validation traceability, active/current vs history views, explicit Draft/Activate/Revise/Resolve/Withdraw actions;
- Promise Register status, source/evidence fields, explicit client-communication confirmation before activation, linked Requirement/Validation/Meeting context, approved-constraint visibility, unapproved-commitment blocker visibility, history-safe revisions and withdrawal;
- navigation from readiness blockers to Scope Conditions, Promise Register, or Sales Validation;
- explicit copy that the workspace is pre-quotation and does not activate the final quotation-send gate.

UI uses the existing CRM visual language, `#000080` primary action color, Lucide icons, responsive cards/grids, and accessible labels/focus treatment.

## Seller Guidance

Contextual Seller Guidance was added for the new sections, lifecycle states, source/evidence fields, reconciliation actions, Promise safety, approval/constraint interpretation, and future quotation coverage. Guidance reinforces that a client request, seller hypothesis, Package Fit recommendation, or internal idea is not automatically a ProFox Promise.

## Audit behavior

Material lifecycle actions reuse the existing CRM lead-event infrastructure, including creation/activation/revision/resolution/withdrawal and Requirement-source change/reconciliation events. No disconnected audit-log business system was introduced.

## Quotation/commercial boundaries

Part 9 does not:

- insert/update/delete `quotations`;
- insert/update/delete `quotation_items`;
- rewrite `scope_summary`, `exclusions`, `client_responsibilities`, `delivery_assumptions`, customer/internal quotation notes, or commercial/payment/duration snapshots;
- change `sales_products` commercial truth;
- create quotation items automatically;
- send a final quotation;
- change payment or Won logic;
- change Sales-to-Delivery handoff enforcement.

## Automated acceptance/security suite

`tests/security/crm-sales-scope-conditions-promise-register-part-9.test.ts` contains the required 137 Part 9 acceptance/security cases. Coverage includes architecture reuse, both register lifecycles, source/lineage enforcement, Requirement reconciliation, Promise truth/evidence behavior, Sales Validation integrity, Proposal Readiness integration, quotation boundaries, RLS/ACL expectations, audit/history behavior, UI/guidance presence, production-safety boundaries, and repository check scripts.

Executable test/build/CI results must be reported truthfully at release time. Authenticated browser QA must not be claimed if an authenticated browser is unavailable.

## Production safety contract

Production migration is schema/function/policy-only. It intentionally seeds no client Scope Conditions and no Promises. Verification must confirm the two new registers remain empty immediately after deployment unless a real authorized seller later creates real data through the product.

Release verification must also confirm existing CRM/quotation/customer records were not mutated as a side effect of applying Part 9.

## Explicit Part 9 boundaries

Part 9 stops at pre-quotation Scope Conditions, Promise integrity, and their additive Proposal Readiness signals.

Deferred to Part 10 or later:

- final quotation-send enforcement;
- actual quotation snapshot comparison/coverage;
- automatic quotation generation/item creation;
- payment/Won changes;
- Sales-to-Delivery enforcement.

## Canonical confirmations

- One canonical Scope Conditions Register is used.
- One canonical Promise Register is used.
- Discovery Requirements remain in `crm_requirements`; Scope Conditions are reconciled proposal boundaries, not a duplicate Requirements system.
- A client request or seller hypothesis does not automatically become a ProFox Promise.
- Real unapproved commitments can be recorded truthfully and are surfaced as blockers instead of being hidden.
- Part 7 Sales Validation remains the specialist-review authority.
- Quotation-specific commercial approval remains in the existing quotation approval workflow.
- Part 9 does not write or rewrite quotation snapshots.
- Promise/Scope/quotation snapshot coverage remains explicitly unevaluated until actual quotation reconciliation.
- The final quotation-send gate remains deferred to Part 10.
- No fake client data belongs in the Part 9 migration or release verification.
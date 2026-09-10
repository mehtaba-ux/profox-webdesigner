# CRM Sales SOP — Part 9: Scope Conditions + Promise Register

## Status

Part 9 extends the existing Parts 1–8 CRM Sales SOP with a **pre-quotation integrity layer**. It does not replace Requirements, Package Fit, Sales Validation, Proposal Readiness, quotation approval, payment verification, or Won-stage authority.

The implementation has two connected registers inside the existing Requirements → Proposal Readiness workflow:

1. **Scope Conditions** — explicit proposal assumptions, exclusions, dependencies, client responsibilities, and scope boundaries.
2. **Promise Register** — material commitments ProFox actually communicated to the client.

No new Lead Drawer tab is introduced.

## Production database lineage

Part 9 backend objects were already deployed to the production Supabase project through native Supabase migration history before this repository UI completion. They are reused in place rather than recreated.

| Version | Native migration | SQL length | MD5 |
| --- | --- | ---: | --- |
| `20260910042939` | `crm_sales_scope_conditions_promise_register_part_9` | 18,018 | `6192fa2247bbff02242fff6e0c5a3f57` |
| `20260910043137` | `crm_sales_scope_commitment_mutations_part_9` | 29,760 | `1ba4e161c6a2cec9c6c3c440d5952605` |
| `20260910043416` | `crm_sales_scope_commitment_workspace_part_9` | 25,806 | `594b237bb2509cab12a7be3d950ba1b9` |
| `20260910043453` | `crm_sales_scope_commitment_readiness_part_9` | 5,507 | `4d9e50f676a428e888f28c7ab93f444c` |

These native migrations are **not copied into the legacy repository migration runner**. `scripts/migrate-production.mjs` uses a separate `profox_migrations.applied_migrations` ledger. Later CRM parts, including Parts 4–8, are deployed outside that older ledger. Adding already-applied native Part 9 SQL to `supabase/migrations` would make the legacy runner treat it as pending and create unnecessary re-execution risk. The authoritative Part 9 database lineage is therefore the native `supabase_migrations.schema_migrations` history above.

## Canonical tables

### `public.crm_sales_scope_conditions`

This is the canonical Part 9 proposal-boundary register. It stores:

- lead/opportunity linkage
- condition type and exact wording
- source Requirement, Sales Validation, Sales meeting, or manual evidence
- validation alignment state
- server-derived created/updated actors and timestamps
- lifecycle state
- supersession lineage
- resolution and withdrawal evidence
- policy version

Supported lifecycle states are:

`DRAFT → ACTIVE → STALE / RESOLVED / SUPERSEDED / WITHDRAWN`

A Draft can be edited in place. A current Active or Stale condition is not silently rewritten; material wording changes create a revision Draft and preserve the prior record. Directly sourced Requirement changes can mark a current condition stale so proposal preparation cannot silently rely on outdated wording.

### `public.crm_sales_promises`

This is the canonical Part 9 commitment register. It stores:

- lead/opportunity linkage
- Promise type and exact wording
- internal context
- source/evidence and meeting linkage
- linked Requirement and Sales Validation
- validation alignment state
- server-derived promised-by/promised-at and recorded-by/recorded-at
- lifecycle state and supersession lineage
- withdrawal evidence
- policy version

Supported lifecycle states are:

`DRAFT → ACTIVE → SUPERSEDED / WITHDRAWN`

A Draft is internal preparation and is **not** a client Promise. Activating a Draft requires the Seller to explicitly confirm:

> Did ProFox actually communicate this commitment to the client?

If the answer is not confirmed, the browser cannot activate the Promise. The server independently enforces the communication/source rules.

## Truth model

Part 9 preserves the following distinctions:

- A **Requirement** describes discovered client/project information. It is not automatically proposal wording.
- A **Scope Condition** is an explicit proposal boundary reconciled from material discovery, validation, meeting evidence, or manual evidence.
- A **Promise Draft** is internal preparation only.
- An **Active Promise** is a material commitment ProFox actually communicated to the client.
- A client request, Seller hypothesis, package recommendation, or internal intention does not become a Promise automatically.
- A real but unapproved commitment remains recorded as truth. It is surfaced as an **UNAPPROVED COMMITMENT** blocker instead of being hidden or rewritten.

## Requirement reconciliation

Material Requirements used by the Part 9 policy must be deliberately reconciled before safe proposal preparation. The Seller has three accountable paths:

1. Create a Scope Condition from the Requirement.
2. Link the Requirement to an existing current Scope Condition.
3. Mark the Requirement **Not Material for Proposal** with a meaningful reason.

The canonical RPC is `crm_reconcile_sales_scope_requirement`. It does not delete or rewrite the Requirement; discovery truth remains intact.

## Sales Validation integration

Part 9 reuses the Part 7 `crm_sales_validations` authority. It does not create a parallel approval table.

Scope Conditions and Promises can link to the current validation decision and expose approved constraints. The Part 9 assessment checks validation currency, supersession, rejection/staleness, required validation type, and explicit `WITHIN_CONSTRAINTS` / `CONFLICT` alignment where constraints exist.

If an actual Promise was communicated before required approval, the Promise remains Active and the assessment blocks proposal readiness until the validation/alignment problem is resolved.

Commercial Promises also preserve the quotation boundary: pre-proposal Commercial validation does not bypass quotation-specific pricing, discount, payment-term, or other quotation approval rules.

## Trusted mutation API

The browser uses only the following trusted RPCs through `src/lib/crmSalesScopeCommitmentService.ts`:

- `crm_get_sales_scope_commitment_workspace`
- `crm_save_sales_scope_condition_draft`
- `crm_revise_sales_scope_condition`
- `crm_transition_sales_scope_condition`
- `crm_reconcile_sales_scope_requirement`
- `crm_save_sales_promise_draft`
- `crm_revise_sales_promise`
- `crm_transition_sales_promise`

The browser does not provide actor identity or authoritative lifecycle timestamps. Database functions resolve `auth.uid()` and write the trusted actor/time fields. Table RLS, restricted grants, guard triggers, and RPC authorization remain the server enforcement boundary. Hard deletion is not the lifecycle mechanism.

## Seller UX

The reusable Part 9 UI is mounted inside the existing `CRMSalesReadinessPanel` below Proposal Readiness:

- `CRMScopeCommitmentsWorkspace`
- `CRMScopeConditionsPanel`
- `CRMPromiseRegisterPanel`
- `CRMConsequentialActionDialog`

### Scope Conditions panel

The panel exposes:

- assessment status and counts
- prominent stale-source state
- unreconciled material Requirements
- Create Scope Condition
- Link existing Scope Condition
- Not Material for Proposal with required reason
- source/evidence visibility
- Requirement / Validation / Meeting linkage
- specialist constraint alignment
- Draft editing
- deliberate activation
- history-safe revision
- resolve / withdraw actions
- collapsed historical records
- creator and timestamp visibility
- navigation back to Sales Validation

### Promise Register panel

The panel exposes:

- a visible warning that internal preparation is not a Promise
- Draft and Active counts
- unapproved/validation issue counts
- exact Promise wording
- source/communication evidence
- linked Requirement / Validation
- promised-by and promised-at information for active commitments
- approved specialist constraints
- deliberate Record Promise confirmation
- prominent UNAPPROVED COMMITMENT blockers
- history-safe revision
- withdrawal with reason
- collapsed historical records
- future quotation coverage shown explicitly as not yet evaluated

## Proposal Readiness integration

Part 9 extends the existing Part 8 Proposal Readiness evaluator. It does not replace it.

Current Part 9 dimensions contribute blockers/warnings for:

- material Requirement reconciliation
- Scope Condition draft/stale/integrity state
- validation conflicts or stale approvals
- Promise source/evidence integrity
- required Promise validation
- Promise/constraint conflicts

The existing Parts 1–8 Requirements, Package Fit, specialist validation, decision process, next-action, and pipeline enforcement remain authoritative.

## Part 10 boundary

Part 9 explicitly leaves the following quotation reconciliation dimensions for future work:

- `PROMISE_COVERAGE` → `NOT_YET_EVALUATED`
- `FINAL_SCOPE_RECONCILIATION` → `NOT_YET_EVALUATED`
- `QUOTATION_SNAPSHOT_COVERAGE` → `NOT_YET_EVALUATED`

The Part 9 assessment returns:

- `finalQuotationSendGateActive: false`
- `writesQuotation: false`

Part 9 does not create, update, approve, send, accept, or otherwise mutate quotation records. Payment verification and Won-stage authority are unchanged.

## Security and integrity verification

Production verification for Part 9 must check:

- both canonical Part 9 tables exist
- RLS is enabled
- direct unsafe writes and hard deletion are not exposed as the normal client path
- trusted lifecycle RPCs exist
- RPCs derive actors from authenticated server context
- Promise activation requires actual client communication confirmation
- stale Requirement/Validation lineage cannot silently produce a safe result
- active-but-unapproved commitments remain visible and block readiness
- Part 8 evaluator calls Part 9 assessment additively
- final quotation-send gate remains inactive
- Part 9 functions contain no quotation mutations
- no fake Part 9 production rows are introduced during implementation verification

## Automated acceptance coverage

`tests/security/crm-sales-scope-conditions-promise-register-part-9.test.ts` provides the Part 9 repository acceptance suite. It is included automatically by the existing `test:security` wildcard and therefore by `npm test` and CI.

The suite covers the Part 9 service contract, lifecycle semantics, truth distinctions, Requirement reconciliation, Sales Validation reuse, source traceability, seller UX, confirmation/withdrawal safeguards, Proposal Readiness placement/integration, Part 10 boundary, no quotation mutation surface, accessibility markers, mobile-safe UI patterns, documentation lineage, and Parts 1–8 non-regression markers.

## Production data rule

No sample Scope Condition or Promise is required to complete Part 9. Verification must not create fake client commitments in production. Empty registers are valid until real sellers record real business truth.

## Rollback / recovery

If the Part 9 UI must be rolled back, remove the frontend integration and service usage while leaving the canonical database records and native migration history intact. Do **not** hard-delete Scope Conditions or Promises to roll back UI code.

If a lifecycle action is wrong, correct it through the supported history-safe transition/revision workflow. If a source Requirement or specialist decision changes, use reconciliation/stale handling rather than rewriting historical records.

This preserves auditability and allows the UI to be re-enabled without losing business truth.

# CRM Sales SOP Part 10B — Immutable Send-Time Sales Snapshot + Universal Quotation Send Gate

## Status

Part 10B-compatible database and frontend foundation is implemented. Production activation is intentionally **blocked** because an authenticated production browser session was not available to independently verify that Seller/Admin users can reach and resolve Part 9 Scope Conditions, Part 9 Promise Register and Part 10A/10B Sales Reconciliation blockers.

**PART 10B ACTIVATION BLOCKED — PRODUCTION RESOLUTION UI NOT VERIFIED.**

The canonical production policy remains `crm_quotation_sales_reconciliation_policy_v1`, policy version `2`, with `finalQuotationSendGateActive=false`.

## Verified base and preservation

- Repository: `mehtaba-ux/profox-webdesigner`
- Audited base/main SHA: `16ef1d5047df2300035b76e21b9719029345be3d`
- Part 10A hardening ancestor: `c14cbfbbe9b58008f119c5d0ae67d592f0041c3b`
- Newer Sales Catalog / quotation-item snapshot work merged after Part 10A was preserved.
- `quotation_items.catalog_snapshot` and `quotation_items.catalog_version_snapshot` remain the canonical item-level Catalog snapshot fields.
- Part 10B does not copy Seller-private `seller_guidance` or internal catalog playbook material into the quotation Sales-scope snapshot.

## Production precondition result

The repository, database schema, canonical quotation editor, approval path, reconciliation panel and Send UI were auditable. Authenticated production browser verification was not available in this execution environment. Per the rollout invariant, production gate activation was not performed.

This avoids a backend dead-end where the database could block Send before a Seller can reach the resolution UI.

## Current Send paths audited

The live database and current frontend confirm these legitimate paths into `Sent`:

1. `send_quotation_professional(...)` — canonical customer-send RPC. It keeps authorization, Approved status requirement, recipient validation, existing CPQ readiness, send metadata and established customer communication behavior.
2. `update_quotation_atomic(...)` — contains an Approved → Sent path and uses the existing `profox.quotation_atomic_rpc` context.
3. Permitted direct `UPDATE` to `quotations.status='Sent'` — protected by `protect_quotation_transition()`.
4. Admin updates — historically returned early from `protect_quotation_transition()`.
5. Direct INSERT already marked Sent — remains rejected for ordinary runtime by `reject_direct_sent_quotation_insert()`; Part 10B does not weaken or replace that protection.

`resend_quotation_professional(...)` is not a new transition to Sent and is intentionally not used to rebuild or overwrite a snapshot.

## Shared universal invariant

Part 10B adds one canonical shared assertion:

`crm_assert_quotation_send_ready(uuid)`

It consumes existing authorities rather than reimplementing them:

- existing CPQ readiness via `get_quotation_cpq_summary(...)` / the established sensitive internal summary;
- canonical Part 10A reconciliation via `crm_get_quotation_sales_reconciliation(...)`;
- Proposal Readiness, Package Fit, Scope/Promise integrity and validations through that canonical reconciliation evaluator;
- existing quotation approval remains independent and authoritative for quote-specific commercial approval.

There is no `force`, `adminBypass`, `skipSalesGate`, `ignoreReconciliation`, score override or manager exception shortcut.

## Admin / atomic bypass closure

`protect_quotation_transition()` now evaluates an `OLD.status <> 'Sent' AND NEW.status='Sent'` transition **before** the established Admin and `profox.quotation_atomic_rpc` early returns.

When the policy is active, the trigger:

1. rejects material quotation content changes in the same statement as Send;
2. invokes the shared assertion;
3. builds the send-time Sales snapshot server-side;
4. writes the snapshot, server timestamp and schema version onto the exact quotation row;
5. only then allows the Sent transition to continue.

Existing Admin/atomic maintenance behavior outside this Sent invariant remains preserved.

## Snapshot storage decision

No new business table was created. The smallest explicit quotation-level storage was used:

- `quotations.sales_scope_snapshot jsonb`
- `quotations.sales_scope_snapshot_at timestamptz`
- `quotations.sales_scope_snapshot_schema_version integer`

Snapshot schema version: **2**.

`commercial_snapshot` was not overloaded because it already has CPQ/commercial semantics.

## Snapshot content

The server-built snapshot contains the necessary send-time evidence, including:

- schema version;
- quotation id and revision;
- Lead/opportunity identity;
- evaluation/send timestamp;
- reconciliation policy key/version;
- Proposal Readiness policy/evaluator reference;
- Package Fit status/reference;
- quoted product/item identifiers;
- quotation-item Catalog snapshot/version references without Seller-private guidance;
- Active Scope Conditions with exact wording/source/version state;
- Active Promises with exact commitment, promised actor/time and source;
- current coverage mappings and target fingerprints/evidence;
- current approved specialist constraints;
- relevant validation references/statuses;
- Promise Coverage result;
- Final Scope Reconciliation result;
- pre-send quotation snapshot coverage state;
- send-time blockers (none on successful capture);
- send-time warnings.

The raw JSON is internal audit/handoff evidence and is not exposed to the customer presentation or rendered by default in the Seller UI.

## Atomicity and side effects

Snapshot authorization/capture is executed from the existing BEFORE UPDATE transition protection. If assertion or snapshot construction fails, the row never becomes Sent. Existing customer notification/outbox behavior occurs after the quotation update, so a blocked transition does not queue/send customer communication or create false Sent evidence.

No payment, Won, onboarding or Sales-to-Delivery handoff behavior was added.

## Snapshot immutability

Normal runtime attempts to set, clear or rewrite `sales_scope_snapshot`, `sales_scope_snapshot_at` or `sales_scope_snapshot_schema_version` are rejected. The correction path remains `create_quotation_revision(...)`.

A historical sent quotation is never fake-backfilled from current CRM state. A legacy quotation without Part 10B capture remains `Legacy / Sales-scope snapshot not captured`.

Resending an existing Sent quotation does not rebuild historical Sales evidence.

## Part 10A evaluator evolution

The canonical `crm_get_quotation_sales_reconciliation(...)` was evolved in place; no v2 evaluator was created.

It now supports both staged (`finalQuotationSendGateActive=false`) and active (`true`) policy states while preserving the existing response contract and adding snapshot metadata. A historical quotation with a real Part 10B snapshot is reported as captured instead of legacy-not-captured.

The canonical `crm_review_quotation_sales_coverage(...)` was also evolved so coverage remediation remains available after activation. Without this change, activating the gate would have prevented Sellers from resolving coverage blockers.

## CPQ integration

`get_quotation_cpq_summary(...)` still starts from the existing sensitive internal CPQ summary.

Additive fields include:

- `salesReconciliation`
- `salesScopeSnapshot`
- `finalSendGateActive`
- `finalSendBlockers`
- readiness metadata for Sales reconciliation.

When the final gate is false, existing `readiness.readyToSend` behavior is preserved. When active, `readyToSend` requires both existing CPQ readiness and current Sales reconciliation readiness, and exact Sales blocker messages are appended to the existing `readiness.missing` list.

The existing Send Quotation modal already disables customer delivery from `readiness.readyToSend`, so the frontend stays UX-only while the database remains authoritative.

## UI

The existing `QuotationSalesReconciliationPanel` was evolved; no second panel or quotation editor was created.

It now shows:

- `FINAL SEND GATE — ACTIVE` or `FINAL SEND GATE — STAGED / NOT ACTIVE`;
- Ready to Send / Blocked / Historical status;
- exact blocker count and blocker messages;
- resolution guidance;
- Snapshot Ready to freeze / Not ready / Captured state;
- quotation approval state;
- Proposal Readiness;
- Scope Reconciliation;
- Promise Coverage;
- Package alignment;
- immutable snapshot captured time/schema/revision for delivered quotations;
- no raw snapshot JSON.

Coverage review still opens/edits only the canonical existing quotation target.

## Seller Guidance

The existing `SellerGuidanceHelp` framework is reused. Part 10B adds guidance for:

- `status.final_send_gate_active`
- `status.final_send_blocked`
- `status.ready_to_snapshot`
- `status.snapshot_captured`
- `field.final_send_blockers`
- `field.sales_scope_snapshot`
- `field.immutable_send_snapshot`
- `action.resolve_send_blocker`
- `action.send_quotation`

No second help framework was created.

## Security

- New/modified trusted functions use a fixed empty `search_path`.
- Anonymous/public execution is denied.
- Snapshot capture authority is not exposed to authenticated browser clients.
- Browser callers cannot submit snapshot JSON, timestamp, schema version, review actor or send-authorized result.
- Existing coverage RLS/table denial remains intact.
- No service-role secret was introduced in frontend code.
- The assertion revalidates quotation ownership/Admin authority and existing CRM lineage checks continue through canonical reconciliation.

## Production data safety verification

Read-only baseline immediately before foundation deployment:

- Scope Conditions: 0
- Promises: 0
- quotation Sales coverage rows: 0
- quotations: 6
- quotation_items: 18

Read-only verification after foundation deployment:

- Scope Conditions: 0
- Promises: 0
- quotation Sales coverage rows: 0
- captured Part 10B Sales snapshots: 0

No real customer quotation was sent, approved, edited, revised or populated with fake reconciliation data for testing.

## Tests

A dedicated `crm-sales-final-quotation-send-gate-part-10b.test.mjs` contract suite is wired into both `npm test` and `npm run build`. It verifies the foundation across storage, policy reuse, evaluator evolution, CPQ integration, one shared assertion, universal transition ordering, snapshot capture/immutability, no bypass parameters, Catalog boundary, UI/guidance and no fake business data.

The Part 10A suites remain in the build. Only their UI boundary expectations were evolved from the intentionally inactive Part 10A label to the Part 10B dynamic ACTIVE/STAGED presentation; Part 10A database/security assertions remain intact.

## Deployment ordering

Completed safely:

1. Production-compatible database foundation deployed with gate false.
2. Feature-branch frontend/server contract changes prepared.

Still required before activation:

3. Merge/deploy the compatible frontend.
4. Verify authenticated canonical production UI and runtime health.
5. Only then apply a separate activation update setting `finalQuotationSendGateActive=true`.
6. Read-only verify policy/functions/permissions.
7. Exercise blocked/pass behavior only with an approved isolated non-customer fixture.

Do not activate the backend gate before step 4.

## Remaining limitation

Authenticated production browser QA is unavailable from this tool environment. Therefore production activation cannot truthfully be marked complete, and no activation migration is included in this branch.

The next SOP phases (negotiation/follow-up expansion, payment/Won, onboarding, Sales-to-Delivery handoff, Manager Exception Center, performance metrics, Academy/certification and AI workflow automation) are intentionally not started.

# CRM Sales Quotation Reconciliation — Part 10A

## Status

Part 10A is the **non-blocking preview phase** that connects Parts 1–9 to the existing quotation system. It adds quotation-context reconciliation and a future send-time snapshot builder, but it does **not** activate a new quotation-send blocker.

Verified starting `main`: `46ccd22a63b71d50a6d2b98b84e50ccf02efb3ca`.

## Mandatory quotation reuse audit

The existing quotation system remains canonical:

- `quotations` is the client-specific quotation master record.
- `quotation_items` is the client-visible line/snapshot record.
- `quotation_customer_decisions` remains customer decision history.
- `sales_products` remains commercial/catalog truth.
- `create_quotation_atomic` and `update_quotation_atomic` remain the write path for quotation drafting/editing.
- `create_quotation_revision` remains the correction/revision path for delivered quotation history.
- `get_quotation_cpq_summary` remains existing CPQ readiness and approval summary authority.
- `send_quotation_professional` remains the professional send path.
- `resend_quotation_professional` remains the resend wrapper/path.
- `protect_quotation_transition`, `protect_quotation_commercial_terms`, `protect_delivered_quotation_items`, `reject_direct_sent_quotation_insert`, `enforce_quotation_crm_integrity`, and `crm_enforce_quotation_qualification` remain existing server invariants.
- `quotation_requires_manager_approval`, `quotation_cpq_approval_reasons`, `review_quotation_approval`, and `admin_approve_quotation_cpq` remain quotation approval authority.
- `snapshot_quotation_payment_schedule_before_send`, duration snapshot functions, and `commercial_snapshot` remain existing CPQ/payment/timeline snapshot architecture.
- `quotation_presentation_payload` remains customer presentation authority and does not expose Seller private reconciliation metadata.

### Existing client-visible quotation fields reused

Part 10A maps current Sales truth to existing customer-visible destinations instead of adding duplicate proposal fields:

- `scope_summary`
- `exclusions`
- `client_responsibilities`
- `delivery_assumptions`
- `handover_support`
- `terms_and_conditions`
- `payment_terms`
- `duration_snapshot_text`
- customer-visible `quotation_items` description/configuration/expectation content

`internal_notes` never satisfies coverage. `customer_notes` is intentionally not a generic coverage escape hatch.

### `commercial_snapshot` decision

`commercial_snapshot` already belongs to existing CPQ/commercial send-time history. Part 10A does **not** overload it with Sales reconciliation state. No new persistent Sales-scope snapshot columns are needed in Part 10A because the required snapshot foundation can be built deterministically and read-only. Part 10B can decide the minimal immutable persistence point after exact frontend deployment and authenticated smoke verification.

## Send-path closure audit

Part 10A identified the paths that can produce or attempt `Sent`:

1. **`send_quotation_professional`** — canonical professional send. It requires an approved quotation/CPQ state, updates the quotation to `Sent`, stamps send metadata, maintains customer decision/stage evidence, and emits the existing customer communication/outbox side effects.
2. **`update_quotation_atomic` with requested status `Sent`** — existing guarded transition path. It only allows the existing Approved → Sent behavior under current approval rules and deliberately does not replace the professional communication workflow.
3. **Direct table UPDATE to `Sent`** — constrained by existing RLS/grants and the shared `protect_quotation_transition` trigger. Seller transitions are ownership/state checked; the existing admin convention is preserved.
4. **Direct INSERT already marked `Sent`** — rejected by `reject_direct_sent_quotation_insert` except the existing explicit service-role/GUC exception.

No other production stored function was found directly assigning `quotations.status = 'Sent'` during the collision audit.

### Part 10B enforcement point

`send_quotation_professional` alone is **not** sufficient for future enforcement because `update_quotation_atomic` and direct UPDATE architecture can also reach the shared transition invariant. The safest Part 10B design is a shared server assertion invoked at every legitimate Sent transition, with `protect_quotation_transition` as the central invariant and the existing admin/service exceptions audited explicitly so they cannot bypass Part 10B accidentally. Part 10A does not activate that assertion.

## Existing Sales authorities reused

- `crm_get_package_fit_assessment` — Part 6 Package Fit.
- `crm_sales_validations` — Part 7 specialist review/approved constraints.
- `crm_get_sales_gate_assessment(..., 'PROPOSAL_READINESS')` — Part 8 proposal readiness.
- `crm_sales_scope_conditions` and `crm_get_sales_scope_commitment_assessment` — Part 9 Scope Conditions.
- `crm_sales_promises` and the same Part 9 assessment — Part 9 Promise integrity.
- existing quotation CPQ approval — price, discount, payment-term, duration and commercial approval.

A reconciliation PASS never approves a quotation and never bypasses existing CPQ approval.

## Coverage storage decision

The collision audit found no existing canonical relation capable of storing:

`quotation ↔ current Scope Condition/Promise version ↔ customer-visible quotation destination`.

Therefore Part 10A is allowed to introduce **one normalized relationship table only**: `quotation_sales_coverage`.

The relation preserves reviewed history, points to exactly one source (Scope Condition **or** Promise), stores a server-derived target fingerprint, and keeps one current mapping per quotation/source version. Reconciliation reads do not create rows.

## Coverage rules

### Scope Conditions

- `ASSUMPTION` → `delivery_assumptions`
- `EXCLUSION` → `exclusions`
- `CLIENT_RESPONSIBILITY` → `client_responsibilities`
- `DEPENDENCY` → `delivery_assumptions`, `client_responsibilities`, `scope_summary`, or `terms_and_conditions`
- `SCOPE_BOUNDARY` → `scope_summary`, a customer-visible quotation item, or `terms_and_conditions`

### Promises

- `SCOPE` → `scope_summary`, customer-visible quotation item, or appropriate terms
- `TECHNICAL` → customer-visible quotation item, `scope_summary`, or appropriate terms
- `TIMELINE` → `duration_snapshot_text` or explicitly appropriate terms
- `COMMERCIAL` → `payment_terms` or appropriate terms; existing quotation approval still remains authoritative
- `SUPPORT` → `handover_support` or appropriate quotation item
- `COMPLIANCE` → appropriate scope/terms location
- `PERFORMANCE_RESULT` → explicit careful review only; coverage never creates or approves a guarantee
- `OTHER` → explicit reviewed scope/item/terms destination only

Coverage is a human-reviewed representation decision. It is not technical approval, commercial approval, client acceptance, or AI authority.

## Staleness model

The server derives a fingerprint from the exact current customer-visible target at review time. A subsequent quotation-field or quotation-item change causes the evaluator to report the mapping `STALE`; it does not silently remain `COVERED`. A removed quotation item also invalidates the current mapping. Part 9 source revisions naturally require fresh coverage because the relation points to the exact versioned source row.

## Historical quotations

Existing Sent/Accepted/Rejected/Expired quotations are not backfilled. Historical quotations without Part 10 coverage are represented as **Legacy / coverage not captured**, not as a fabricated PASS. Part 10A does not alter existing sent or accepted records.

## Security model

Part 10A trusted RPCs require `auth.uid()`, verify quotation → opportunity → Lead lineage, reuse current CRM lead access, deny anonymous execution, use fixed safe `search_path`, and keep the internal coverage table unavailable to customer/public quotation paths. Server controls reviewer identity/time and target fingerprint. Cross-Lead sources and cross-quotation items are rejected.

## UI placement

Part 10A reuses the existing canonical `QuotationWorkspaceBase` editor and adds one reusable **Sales Reconciliation** panel. It does not add a Lead Drawer tab and does not build a second quotation editor.

The panel shows Proposal Readiness, quoted package alignment, active Scope Conditions, active Promises, approved constraints, coverage status/target preview, exact blockers/warnings, snapshot readiness, and an explicit **Final Send Gate: NOT YET ACTIVE** notice.

## Non-blocking release boundary

Authoritative Part 10A result always keeps:

`finalQuotationSendGateActive = false`

Part 10A does not modify `send_quotation_professional`, `update_quotation_atomic` Sent behavior, `protect_quotation_transition`, or `get_quotation_cpq_summary.readiness.readyToSend` to enforce Sales reconciliation.

Part 10B must not begin until the exact production frontend SHA containing Parts 9 + 10A is deployed successfully and authenticated Seller/Admin smoke verification proves the reconciliation UI and existing quotation/approval workflows work without runtime errors.

## Verification record

Part 10A implementation is **COMPLETE as the non-blocking reconciliation foundation**. The following facts were rechecked after merge on September 10, 2026:

- Starting `main`: `46ccd22a63b71d50a6d2b98b84e50ccf02efb3ca`.
- Implementation PR: `#106` — `feat(crm): Part 10A quotation reconciliation foundation`.
- Final feature head: `22c613f90a46207020fcbe13b9c68207c53b87ba`.
- Runtime implementation merge on `main`: `2ee3e78bca39fdcadcc4948aac54ae62804c6e55`.
- Production native migrations: `20260910124932_crm_sales_quotation_reconciliation_part10a` and `20260910125143_crm_sales_quotation_reconciliation_assessment_part10a`.
- Production object count is singular and canonical: one `quotation_sales_coverage` relation, one reconciliation assessment RPC, one coverage-review RPC, and one Sales-scope snapshot-preview RPC.
- Production safety counts remained zero during implementation verification: `crm_sales_scope_conditions = 0`, `crm_sales_promises = 0`, and `quotation_sales_coverage = 0`. No fake client data was created.
- `quotation_sales_coverage` has RLS enabled and no direct `anon` or `authenticated` table privileges. Part 10A RPCs are not anonymously executable. Reviewer identity/time and target fingerprints remain server-controlled.
- The checked-in coverage-review migration was corrected before merge so the authenticated `GRANT EXECUTE` signature exactly matches the production eight-argument RPC: `(uuid,text,uuid,text,text,text,uuid,text)`.
- The reconciliation evaluator and snapshot builder are read-only with respect to quotation rows. Production verification confirmed no quotation-write path was added by either function.
- `finalQuotationSendGateActive = false` remains authoritative in production. Part 10A does not activate the final quotation-send gate.
- The dedicated acceptance/security suite contains exactly **169 checks** and is wired into both `npm test` and the normal production `npm run build` path.
- Cloudflare successfully built/deployed the final feature head and subsequently reported a successful Workers build/deployment for merged `main` runtime SHA `2ee3e78bca39fdcadcc4948aac54ae62804c6e55`.
- GitHub Actions `ProFox CRM CI` did not execute repository steps because the hosted runner failed before step allocation. A single controlled retry behaved the same. This is recorded as an external CI-runner infrastructure failure, **not** as a passing test run and **not** as an application test failure.
- Supabase's security advisor reported no Part 10A-specific missing-RLS-policy or anonymous-SECURITY-DEFINER exposure for the new coverage surface. Existing unrelated project-wide advisor findings remain outside this Part 10A change boundary.
- Authenticated Seller/Admin production-browser acceptance has **not** been fabricated or marked complete. It remains the explicit operational prerequisite before Part 10B can activate final send enforcement.

### Release boundary after verification

Part 10A is complete and production-deployed as a **non-blocking** reconciliation/readiness layer. Part 10B remains intentionally deferred. No Part 10B send blocker, immutable final Sales-scope persistence point, Pipeline/payment/Won behavior, onboarding behavior, or Sales-to-Delivery handoff enforcement is activated by this release.
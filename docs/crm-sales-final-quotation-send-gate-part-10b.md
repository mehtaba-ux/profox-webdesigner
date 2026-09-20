# CRM Sales SOP Part 10B — Immutable Send-Time Sales Snapshot + Universal Quotation Send Gate

## Status

**IMPLEMENTATION COMPLETE / PRODUCTION ACTIVATION COMPLETE / FINAL VERIFICATION COMPLETE.**

The Part 10B database, security, immutable snapshot, universal Sent-transition protection, CPQ integration, Seller UI, guidance and tests were implemented beginning with PR #110. Forward convergence completed in PR #117 and final activation completed in PR #118.

Current production is **ACTIVE** under canonical policy `crm_quotation_sales_reconciliation_policy_v1` with `finalQuotationSendGateActive=true`, policy version `2`, and snapshot schema version `2`.

Authenticated Seller/Admin production remediation QA passed before activation and active-state UI verification passed afterward. Trusted final-main CI run `35450540745` and production deployment run `35450651806` passed for main `d2b6e2a54c7e0edbad11c55127d5e4dd42311041`.

**PART 10B: COMPLETE. PART 11: NOT STARTED.**

## Verified base and preservation

- Repository: `mehtaba-ux/profox-webdesigner`
- Audited base/main SHA: `16ef1d5047df2300035b76e21b9719029345be3d`
- Feature branch: `codex/part-10b-final-send-gate`
- Pull request: `#110`
- Part 10A hardening ancestor: `c14cbfbbe9b58008f119c5d0ae67d592f0041c3b`
- Newer Sales Catalog / quotation-item snapshot work merged after Part 10A was preserved.
- `quotation_items.catalog_snapshot` and `quotation_items.catalog_version_snapshot` remain the canonical item-level Catalog snapshot fields.
- Part 10B does not copy Seller-private `seller_guidance` or internal catalog playbook material into the quotation Sales-scope snapshot.
- An accidental branch-only removal of `@dnd-kit/utilities` was detected during the duplication/regression audit and restored before merge consideration.

## Historical production precondition result — initial Part 10B checkpoint

At the initial Part 10B checkpoint, the repository, live database schema, canonical quotation editor, approval path, reconciliation panel and Send UI were audited, but authenticated production browser verification was not yet available. Per the rollout invariant, production gate activation was correctly deferred at that checkpoint.

That historical blocker was subsequently resolved by compatible deployment and authenticated Seller/Admin production QA before the separate activation migration was applied.

## Current Send paths audited

The live database and current frontend confirm these legitimate paths into `Sent`:

1. `send_quotation_professional(...)` — canonical customer-send RPC. It keeps authorization, Approved status requirement, recipient validation, existing CPQ readiness, send metadata and established customer communication behavior.
2. `update_quotation_atomic(...)` — contains an Approved → Sent path and uses the existing `profox.quotation_atomic_rpc` context.
3. Permitted direct `UPDATE` to `quotations.status='Sent'` — protected by `protect_quotation_transition()`.
4. Admin updates — historically returned early from `protect_quotation_transition()`; Part 10B moves the Sent invariant before that bypass.
5. Direct INSERT already marked Sent — remains rejected by `trg_reject_direct_sent_quotation_insert` / `reject_direct_sent_quotation_insert()`.

`resend_quotation_professional(...)` is not a new transition to Sent. It requires an already-Sent, non-superseded quotation and intentionally does not rebuild or overwrite the immutable Sales snapshot.

## Shared universal invariant

Part 10B adds one canonical shared assertion:

`crm_assert_quotation_send_ready(uuid)`

It consumes existing authorities rather than reimplementing them:

- existing CPQ readiness via `get_quotation_cpq_summary(...)` / the established sensitive internal summary;
- canonical Part 10A reconciliation via `crm_get_quotation_sales_reconciliation(...)`;
- Proposal Readiness, Package Fit, Scope/Promise integrity and validations through that canonical reconciliation evaluator;
- existing quotation approval remains independent and authoritative for quote-specific commercial approval.

There is no `force`, `adminBypass`, `skipSalesGate`, `ignoreReconciliation`, score override or manager exception shortcut.

The assertion is now an internal server primitive: direct execution is revoked from `public`, `anon` and `authenticated`; `service_role` retains execution. Seller/Admin browser clients receive readiness and exact blockers through the existing CPQ/reconciliation contract instead of invoking the invariant directly.

## Admin / atomic bypass closure

`protect_quotation_transition()` now evaluates an `OLD.status <> 'Sent' AND NEW.status='Sent'` transition **before** the established Admin and `profox.quotation_atomic_rpc` early returns.

When the policy is active, the trigger:

1. rejects any caller-authored snapshot mutation;
2. rejects material quotation content changes in the same statement as Send;
3. invokes the shared assertion;
4. builds the send-time Sales snapshot server-side;
5. writes the snapshot, server timestamp and schema version onto the exact quotation row;
6. only then allows the Sent transition to continue.

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

## Snapshot immutability and forge protection

Normal runtime attempts to set, clear or rewrite `sales_scope_snapshot`, `sales_scope_snapshot_at` or `sales_scope_snapshot_schema_version` are rejected before any Sent-transition handling, including Admin and atomic-RPC callers.

The trigger itself may populate those fields only after an active-gate Send has passed the incoming-row tamper check and the shared assertion. The correction path remains `create_quotation_revision(...)`.

A historical Sent quotation is never fake-backfilled from current CRM state. A legacy quotation without Part 10B capture remains `Legacy / Sales-scope snapshot not captured`.

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

## Production migrations applied

Production Supabase has the following additive Part 10B migrations recorded:

- `20260916063249 crm_sales_final_quotation_send_gate_part10b_foundation`
- `20260916070047 crm_sales_final_send_snapshot_forge_hardening`
- `20260916070455 crm_sales_final_send_assertion_privilege_hardening`

Repository migration files are:

- `supabase/migrations/20260916121000_crm_sales_final_quotation_send_gate_part10b_foundation.sql`
- `supabase/migrations/20260916123500_crm_sales_final_send_snapshot_forge_hardening.sql`
- `supabase/migrations/20260916124500_crm_sales_final_send_assertion_privilege_hardening.sql`

## Security

- New/modified trusted Part 10B functions use a fixed empty `search_path`.
- Anonymous/public execution is denied.
- Snapshot capture authority is not exposed to authenticated browser clients.
- The final send assertion is also no longer directly executable by authenticated browser clients.
- Browser callers cannot submit snapshot JSON, timestamp, schema version, review actor or send-authorized result.
- Existing coverage RLS/table denial remains intact.
- No service-role secret was introduced in frontend code.
- The internal assertion still validates the JWT actor (`auth.uid()`), quotation ownership/Admin authority and current quotation state when executed within the protected Send workflow.
- Existing project-wide Supabase advisor findings outside Part 10B remain separate pre-existing backlog; Part 10B did not introduce a public snapshot-capture primitive.

## Production data safety verification

Read-only baseline immediately before foundation deployment:

- Scope Conditions: 0
- Promises: 0
- quotation Sales coverage rows: 0
- quotations: 6
- quotation_items: 18

Read-only verification after all Part 10B migrations:

- Scope Conditions: 0
- Promises: 0
- quotation Sales coverage rows: 0
- captured Part 10B Sales snapshots: 0
- pre-existing legacy Sent quotations without Part 10B snapshot: 2
- authenticated role can execute send assertion: false
- authenticated role can execute snapshot capture: false
- service role can execute send assertion: true
- service role can execute snapshot capture: true

No real customer quotation was sent, approved, edited, revised or populated with fake reconciliation data for testing.

## Tests and build wiring

A dedicated `crm-sales-final-quotation-send-gate-part-10b.test.mjs` contract/security suite is wired into both `npm test` and `npm run build`. It covers storage, policy reuse, evaluator evolution, CPQ integration, one shared assertion, universal transition ordering, snapshot capture/immutability, snapshot-forge rejection, helper privileges, no bypass parameters, Catalog boundary, UI/guidance and no fake business data.

The Part 10A suites remain in the build. Only their UI boundary expectations were evolved from the intentionally inactive Part 10A label to the Part 10B dynamic ACTIVE/STAGED presentation; Part 10A database/security assertions remain intact.

The canonical CI workflow defines checkout, Node 22, `npm ci`, TypeScript, migration integrity, full tests, Playwright launch-readiness, dependency audit and production build. Earlier rollout attempts failed before a runner executed any step (`steps=null`/empty logs); those failures remain historical infrastructure evidence, not application-test failures. Hosted-runner execution was subsequently restored and trusted final-main CI run `35450540745` passed every repository step.

The earlier Cloudflare failure remains historical evidence. Final production deployment run `35450651806` subsequently passed, including the production build, Cloudflare Worker deployment, public health/configuration checks, real-browser smoke tests and final production-readiness verification. Authenticated Seller/Admin production QA is verified.

## Deployment and activation ordering

Completed safely:

1. Audited current main and all known legitimate `Sent` paths.
2. Deployed the production-compatible database foundation with gate false.
3. Applied snapshot-forge hardening.
4. Applied server-assertion privilege hardening.
5. Implemented the compatible frontend/server contract and Seller Guidance on the feature branch.
6. Added Part 10B contract/security tests and build wiring.
7. Opened PR #110 and performed changed-file/duplication review.
8. Re-ran production read-only migration, policy, trigger, ACL and data-safety verification.
9. Merged the reviewed forward-convergence implementation in PR #117 after trusted CI passed.
10. Applied forward convergence through the canonical migration runner and verified zero pending/blocked lineage.
11. Verified authenticated Seller/Admin canonical production remediation paths.
12. Created and CI-verified the narrow activation migration in PR #118.
13. Applied activation through the canonical migration runner.
14. Verified the active policy, canonical functions, privileges and invariant ordering read-only with 0 failures and 0 warnings.
15. Merged PR #118, passed final-main CI and completed the production deployment and real-browser smoke verification.

No real customer quotation was sent and no fake production business fixture was created for this release QA.

## Final closure boundary

Activation migration `20260919142410_activate_part10b_final_quotation_send_gate` with checksum `77712b2f7c2918684e39971c37311f7228c5377b817e9d0df23084edd1bc236c` is recorded in the 689-row custom ledger. Current lineage is 123 `APPLIED_EXACT`, 5 forward supersessions, 0 pending and 0 blocked. The final verifier reports 0 failures and 0 warnings.

Historical Sent quotations were not backfilled. Immutable snapshot capture remains server-side and occurs only on a future legitimate successful Send transition. Existing quotation approval remains separate authority, Part 10A reconciliation remains authoritative, and `create_quotation_revision(...)` remains the correction path.

Part 10B is fully closed. Part 11 — Negotiation / Decision Pending + Next-Action Discipline — has not started and requires a separate implementation instruction.

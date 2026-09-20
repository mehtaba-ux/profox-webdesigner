# CRM Sales Part 10B.5 — Forward-only migration convergence plan

> **Historical design record:** This document records the 2026-09-18 pre-implementation design checkpoint. The proposed forward convergence was subsequently implemented and verified in PR #117, production lineage reached 0 pending/0 blocked, and the final Send gate was activated by PR #118. See the canonical Part 10B final release record for current production status.

Audit date: 2026-09-18

Status: **DESIGN COMPLETE / IMPLEMENTATION NOT STARTED**

This is a design and read-only audit record. It does not authorize a historical SQL replay, `npm run migrations:apply`, a custom-ledger write, a production configuration or Sales-data write, Part 10B activation, PR #117 merge, or Part 11.

## 1. Repository and CI checkpoint

| Item | Verified result |
| --- | --- |
| Current `main` | `0be12a91cc096ecb7c67c1d5e9858bdac18967b4` |
| Current PR #117 head before this document | `e2c7f72ecbaadfebb6ce0f1c59d4957b77dfbab6` |
| Branch | `part10b3-migration-lineage-truth-audit` |
| PR state | open, draft, unmerged |
| Owner confirmed Actions billing fix | **No** |
| Last normal CI run | run number `827`, run ID `35312345457`, head `e2c7f72ecbaadfebb6ce0f1c59d4957b77dfbab6` |
| Runner evidence | `runner_id=0`; runner name unavailable; `steps=[]`; Checkout did not execute |
| CI conclusion | GitHub account/repository Actions restriction remains. Annotation: recent account payments failed or the spending limit must be increased. This is not a repository test result. |
| Cloudflare check on that head | successful; independent of trusted GitHub CI |

No manual rerun was requested because the owner has not confirmed the billing/budget issue is resolved. No workflow, runner label, application code, or build hook was changed. Pushing this documentation may cause the normal PR event to request a new workflow run; it must be inspected once and must not be repeatedly rerun if GitHub again returns `runner_id=0` and `steps=[]`.

The branch is clean of `scripts/.part10b4-native-fixtures.json`, `scripts/part10b4-parser-probe.mjs`, `@libpg-query/parser`, temporary package build hooks, and temporary CI runner labels. `package.json`, the lockfile, and `.github/workflows/ci.yml` have no PR diff.

## 2. Authoritative unresolved set

The five historical files remain `UNRESOLVED_PROVENANCE` / `BLOCK_UNRESOLVED`:

1. `20260909110000_crm_sales_meeting_management_closeout_part_5`
2. `20260909193000_crm_sales_validation_escalation_part_7`
3. `20260909200000_crm_sales_requirements_confirmed_proposal_readiness_part_8`
4. `20260909201500_crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening`
5. `20260915154800_sales_catalog_clarity_repository_reconciliation`

Their repository/native byte mismatch remains unresolved. The live schema is current-state evidence only; it is not evidence that any historical file ran. No parser experiment or new proof type is proposed.

## 3. Read-only production audit method and summary

The audit connected through the configured production database URL, issued `BEGIN READ ONLY`, queried catalogs/configuration/business invariants, and issued `ROLLBACK`. It made no production write.

Current production facts relevant to this design:

- all five same-name native candidates exist and each stores one statement, but their raw SHA-256 differs from the corresponding repository file;
- both meeting close-out RPCs exist once, are `SECURITY DEFINER`, have fixed `search_path=public, pg_temp`, and authenticated-only browser execution;
- `crm_sales_validations` has the expected 39 columns, constraints, 13 operational indexes, three enabled domain triggers, RLS, one hardened authenticated SELECT policy, authenticated SELECT only, and service-role full access;
- current Part 7 reviewer notifications and lifecycle routing point to `/admin?tab=myWork`;
- `crm_sales_validation_policy_v1` is policy version 1;
- the canonical readiness evaluator exists once, is `SECURITY DEFINER`, `STABLE`, has `search_path=""`, includes the Part 9 scope/promise assessment, and is authenticated-only;
- `crm_sales_gate_policy_v1` is policy version 1, evaluator version 3, with 20 current proposal dimensions;
- `crm_transition_opportunity(uuid,text)` exists once, is authenticated-only, and invokes the canonical readiness gate;
- all eight catalog/snapshot columns covered by the catalog reconciliation exist with expected types/defaults;
- the seller-guidance preservation trigger exists once and is enabled;
- the active Catalog has 45 rows and 45 unique active codes, 37 active add-ons, zero public add-ons, and zero incomplete active definitions;
- the canonical `PF-CUSTOM`, Launch, Growth, and Scale assertions all pass;
- production currently has 0 validation rows, 5 meeting rows, 0 quotation-item catalog snapshots, and 0 Part 10B snapshots;
- `crm_quotation_sales_reconciliation_policy_v1` is policy version 2 and `finalQuotationSendGateActive=false`.

## 4. Exact operation inventory — Part 5 meeting close-out

Historical repository SHA-256: `bc4944edf31ce435bc7bf1efc71d12e660fccdb3952bf578150e89f1fe2e13b4`.

| Class | Historical operation | Production state | Desired current state / deterministic assertion | Idempotent establishment | Destructive risk |
| --- | --- | --- | --- | --- | --- |
| Function/RPC | Create/replace `save_sales_meeting_closeout_draft(uuid,text,text,text,text,text,text,text,timestamptz)` | Exists once; `SECURITY DEFINER`; fixed search path; authenticated execute | Exact signature/return type/security/ACL; current-main body hash or reviewed marker contract | `CREATE OR REPLACE FUNCTION` using the current canonical body | Low; definition-only |
| Function/RPC | Replace `finalize_sales_meeting(...)` at the existing ten-argument signature | Exists once with current Completed/No Show close-out logic | Exact signature/security/ACL; Completed-only generic follow-up; canonical No Show automation remains separate | `CREATE OR REPLACE FUNCTION` using the current canonical body | Low; definition-only; behavioral replacement is intentional/current |
| GRANT/REVOKE | Deny `public`/`anon`; allow `authenticated` execute on both RPCs | Matches | `has_function_privilege` assertions for all browser/service roles | Explicit revoke/grant | Low |
| Audit behavior | Finalizer writes canonical meeting/activity/opportunity state; draft save does not emit duplicate business records | Present in function definition | Definition/contract tests assert existing tables and no parallel table | Established by canonical functions | Low; only future RPC calls are affected |
| Notification/automation | Completed meeting may create one keyed `Meeting Follow-Up`; No Show remains owned by existing status automation | Present | Function definition contains Completed-only guard and stable automation key | Established by canonical finalizer | Low; migration itself executes no close-out and creates no activity |

There is no table, policy, trigger, configuration, index, constraint, or historical data update in this file.

## 5. Exact operation inventory — Part 7 Sales validation

Historical repository SHA-256: `f153f00f85c8e7ec6974b220f7ba1072bb9432963f37081282cffeb7add40564`.

| Class | Historical operation inventory | Production state | Desired current state / deterministic assertion | Idempotent establishment | Destructive risk |
| --- | --- | --- | --- | --- | --- |
| Configuration | Insert `crm_sales_validation_policy_v1` with five validation types, severities, teams, roles/departments, categories, and no person IDs | Exists at policy version 1 | Exact reviewed JSON contract and version | Guarded UPSERT only from absent or explicitly allowlisted v1 state; fail on unknown/newer state | Low; current production is already canonical |
| DDL/constraints | Create `crm_sales_validations` with 39 columns, PK, 8 FKs, status/type/severity/source checks, length checks, decision/cancel integrity, defaults, and history links | Exact expected shape present | Catalog assertions for every column/type/null/default and named constraint definition | Create table only if absent; otherwise add only safely missing elements after full preflight; reject incompatible shape/data | Medium if table is absent/partial; transaction and fail-closed preflight required |
| Indexes | Six initial indexes: active dedupe, Lead/requested, opportunity, requirement/status, queue, reviewer; later current main adds seven FK/advisor indexes | All 13 current indexes present | Exact names, keys, predicates, uniqueness | `CREATE [UNIQUE] INDEX IF NOT EXISTS`, followed by definition equality assertion; no concurrent index in this bounded migration | Low locking risk; no row mutation |
| Trigger/function | updated-at function + BEFORE UPDATE trigger | Present once/enabled | Exact function security/search path and one trigger binding | replace function; guarded drop/create trigger | Low |
| Trigger/function | immutable-delete function + BEFORE DELETE trigger | Present once/enabled | Exact one trigger and canonical exception behavior | replace function; guarded drop/create trigger | Low |
| Functions/RPCs | Policy lookup, reviewer eligibility, source-state fingerprint, reviewer notifier, seller notifier, request RPC, lifecycle transition RPC, workspace RPC, reviewer queue RPC, detail RPC | All ten exist once with expected signatures/security; current notifier and transition use hardened My Work routing | Current-main definitions, signatures, volatility, `SECURITY DEFINER`, fixed search paths, and ACLs | `CREATE OR REPLACE FUNCTION` with final current definitions, including later queue-routing hardening | Low/medium; future workflow behavior only |
| Trigger/audit/notification | Requirement-change function and AFTER UPDATE trigger stale decided reviews, mark open reviews changed, write Lead events, and notify Seller/reviewer | Present once/enabled; current reviewer route is My Work | Exact canonical current function, one trigger, stable event/dedupe semantics | replace function; guarded drop/create trigger | Low; migration does not update requirements or fire the trigger |
| RLS/policy | Enable RLS; authenticated SELECT policy based on Lead access, Admin, assigned reviewer, or eligible reviewer | RLS enabled; hardened policy uses scalar `auth.uid()` subqueries | One named SELECT policy with exact roles/command/expression; no write policy | enable RLS; guarded drop/create canonical policy | Low; access may fail closed during transaction only |
| GRANT/REVOKE | Table SELECT only for authenticated; internal helpers denied; five browser RPCs/reviewer eligibility allowed as designed | Matches expected ACLs | `relacl`/`has_function_privilege` assertions | explicit revoke/grant | Low |
| Business data | None inserted into validation table | 0 rows currently | Reconciliation never fabricates reviews | No DML against validation records | None |

The reconciliation must establish the **later current-main Part 7 state**, including `20260909194500` routing hardening and `20260909195500` indexes/policy hardening. Recreating only the obsolete Part 7 foundation would be incorrect.

## 6. Exact operation inventory — Part 8 foundation

Historical repository SHA-256: `d430a06cc0065af0bf2385ee90657a25820c404c66a8594c774455583220ea61`.

| Class | Historical operation | Production state | Desired current state / assertion | Idempotent establishment | Destructive risk |
| --- | --- | --- | --- | --- | --- |
| Configuration | UPSERT `crm_sales_gate_policy_v1` at evaluator 1 | Superseded in production by evaluator 3 / 20 dimensions | Do **not** restore evaluator 1; assert/establish current policy 1/evaluator 3 | Current-state guarded UPSERT only | Low if guarded; high regression risk if old JSON replayed |
| Function/RPC | Define `crm_get_sales_gate_assessment(uuid,text)` evaluator 1 | Superseded by evaluator 2 then Part 9 evaluator 3 | One current Part 9-compatible evaluator, stable/security-definer/search-path/ACL exact | Replace with a reviewed standalone final evaluator 3 definition | Medium behavioral risk; comprehensive contract tests required |
| Configuration | Remove legacy `requirementsSummary` from Requirements Confirmed `requiredFields` and increment pipeline version | Invariant is present | Assert exactly one active stage, no duplicate fields, field absent; preserve unrelated pipeline configuration | Narrow conditional JSON update only if known pre-state; no repeated version bump when already compliant | Low/medium; fail on malformed/unknown configuration |
| Function/RPC | Replace canonical `crm_transition_opportunity(uuid,text)` to enforce fresh Requirements Confirmed assessment plus existing meeting/quotation/payment gates | Exists once and invokes canonical assessment | Current-main canonical signature/body/security/ACL; no v2/override bypass | `CREATE OR REPLACE FUNCTION` using final current definition | Medium behavioral risk; no data mutation during migration |
| GRANT/REVOKE | Authenticated-only execution for assessment and transition | Matches | Role privilege assertions | explicit revoke/grant | Low |

No table, index, trigger, RLS policy, or business-row creation occurs in the Part 8 foundation.

## 7. Exact operation inventory — Part 8 hardening

Historical repository SHA-256: `5917aa1bdefd2387bb654907344e9997bc1eb957bfbd2aff59ce1061741f9068`.

| Class | Historical operation | Production state | Desired current state / assertion | Idempotent establishment | Destructive risk |
| --- | --- | --- | --- | --- | --- |
| Configuration | Replace gate policy with evaluator 2, 18 current dimensions and 3 deferred quotation dimensions | Superseded by Part 9 evaluator 3 with 20 current dimensions | Do not restore evaluator 2; establish exact current evaluator 3 policy including the two Part 9 dimensions and three deferred dimensions | Same guarded current-state UPSERT as the combined Part 8 reconciliation | Low if guarded; high regression risk if replayed |
| Function/RPC | Replace assessment with hardened evaluator 2, fixed empty search path, policy validation, applicability rules, current unsuperseded validation logic, 18-dimension score | Production is the later Part 9-patched evaluator 3 and includes scope/promise assessment | One canonical evaluator 3; 20 dimensions for Proposal Readiness, 18 for Requirements Confirmed, Part 9 integration, exact ACL | One standalone final `CREATE OR REPLACE FUNCTION`; do not repeat fragile runtime text-patching | Medium behavioral risk; tests and exact postconditions required |
| GRANT/REVOKE | Authenticated-only evaluator execution | Matches | privilege assertions | explicit revoke/grant | Low |

Part 8 foundation and hardening should be retired by one forward migration because neither historical intermediate evaluator is the desired current authority. The combined migration must establish the final evaluator 3 state atomically.

## 8. Exact operation inventory — Sales Catalog reconciliation

Historical repository SHA-256: `fb1f50f908653298da2e0a77b56fa1580117739c7dac73a6b3e79e4093ff2c3e`.

| Class | Historical operation | Production state | Desired current state / assertion | Idempotent establishment | Destructive risk |
| --- | --- | --- | --- | --- | --- |
| DDL | Add eight columns to `sales_products` (`seller_guidance`, `catalog_version`, `effective_from`, five delivery/timeline fields); add two snapshot columns to `quotation_items` | All ten historical column additions are present with expected types/defaults/nullability | Exact catalog assertions; preserve IDs and existing quotation rows | `ADD COLUMN IF NOT EXISTS`, followed by strict type/default/nullability checks; incompatible existing columns fail | Low/medium table-lock/default risk; no drop |
| Trigger/function | Define seller-guidance preservation function; replace its BEFORE UPDATE trigger | Function and one enabled trigger present; browser execution denied | Exact definition/search path/ACL and one trigger binding | replace function; guarded drop/create trigger | Low |
| Catalog/business-data reconciliation | Narrow corrections for Launch support/copy, Growth technology/details, and Scale ecommerce boundary | All four canonical product assertions pass | Correct values only for the named codes; preserve IDs, price, visibility, payment schedule, onboarding, and quotation history | In expected production: assertion/no-op. If drift exists, change only explicitly allowlisted legacy values; fail on unknown values | **Medium/high** if blindly replayed; therefore old UPDATE statements must not be replayed |
| Integrity/config-like checks | Assert 45 active unique products, 37 active add-ons, 0 public add-ons, complete descriptions/scope/guidance/timing, PF-CUSTOM pricing, and named package rules | All pass | Same current invariants, plus schema/trigger/ACL checks | Strict `DO` assertions after narrowly bounded setup | None when assertions pass |
| Quotation history | Historical file adds snapshot storage columns but does not backfill quotations | 0 snapshotted items; 0 Part 10B snapshots | No synthetic backfill; future quotation flow owns snapshots | No historical UPDATE | None |

## 9. Proposed smallest forward repair set and order

Four migrations are the smallest safe grouping. Proposed reserved identifiers must be rechecked for collision against latest `main` immediately before implementation:

1. `20260918120000_crm_sales_meeting_closeout_current_state_reconciliation`
2. `20260918121000_crm_sales_validation_current_state_reconciliation`
3. `20260918122000_crm_sales_proposal_readiness_current_state_reconciliation`
4. `20260918123000_sales_catalog_current_state_reconciliation`

Ordering is intentional: Proposal Readiness depends on the Part 7 validation domain; catalog facts feed Package Fit/readiness; catalog is last because it carries the only business-data reconciliation risk. No new business table is proposed.

## 10. Fail-closed preconditions

### Migration 1 — meeting close-out

- `sales_meetings`, `crm_activities`, `crm_opportunities`, and required close-out columns exist with compatible types.
- `service_meeting_crm_lead_id(uuid)`, `is_admin()`, `has_active_role(text[])`, and status automation dependencies exist once.
- no incompatible overload of either close-out RPC exists.
- supported meeting statuses and activity columns match the current contract.

### Migration 2 — Sales validation

- all referenced canonical tables/functions exist (`crm_leads`, opportunities, requirements, meetings, products, profiles, notification enqueue, Lead event writer, Lead access helpers).
- if `crm_sales_validations` exists, every existing column/constraint is compatible; unexpected type, FK, check, duplicate active dedupe data, or duplicate trigger fails before mutation.
- if the table is absent, the migration may create the exact current table; a partially present table may receive only independently safe missing columns/constraints.
- existing validation policy is absent or an explicitly reviewed compatible version 1; unknown/newer policy fails.
- later My Work route is available; the obsolete `sales_validations` tab is not restored.

### Migration 3 — Proposal Readiness

- Part 6 Package Fit, Part 7 validation, Part 9 Scope Conditions/Promise assessment, requirements, discovery, meetings, activities, quotations, payments, and opportunity dependencies exist once.
- gate policy is absent or a reviewed policy 1 state (evaluator 2 or 3); unknown/newer versions fail.
- pipeline settings contain exactly one valid Requirements Confirmed stage; malformed/duplicate stages fail.
- no incompatible overload exists for the assessment or transition RPC.
- Part 9 tables/functions and 20-dimension policy inputs exist before evaluator 3 is installed.

### Migration 4 — Sales Catalog

- `sales_products` and `quotation_items` exist with stable primary keys; no incompatible target column exists.
- active catalog code uniqueness and counts are within the explicitly reviewed 45/37 boundary; duplicate codes, unexpected active/public add-ons, missing target codes, or unknown target values fail before data correction.
- `PF-CUSTOM` identity/price mode/base price/payment schedule satisfy current truth.
- no quotation/product ID, price, visibility, payment, or historical snapshot rewrite is required.

## 11. Machine-verifiable postconditions

Each migration must finish with assertions in the same database transaction.

1. **Meeting:** both exact signatures exist once; return types, volatility, `SECURITY DEFINER`, search paths and role ACLs match; canonical definition digests/contract markers match; no close-out row or activity was created.
2. **Validation:** exact 39-column shape and constraints; all 13 current indexes with exact predicates; exactly three enabled domain triggers; RLS on; one exact authenticated SELECT policy; exact table/function ACL matrix; policy version 1; all final current functions exist once; My Work routing present; validation row count unchanged.
3. **Readiness:** policy 1/evaluator 3; 20 proposal dimensions and 3 deferred dimensions; exactly one stable/security-definer evaluator with empty search path and Part 9 integration; one canonical transition RPC calling fresh Requirements Confirmed assessment; authenticated-only ACLs; pipeline required-field invariant; opportunity/stage counts unchanged.
4. **Catalog:** expected columns/types/defaults; one seller-guidance trigger; exact ACL; 45 active unique codes, 37 active add-ons, 0 public add-ons, 0 incomplete active products; PF-CUSTOM/Launch/Growth/Scale assertions pass; product IDs/prices/visibility/payment schedules and quotation/snapshot row counts unchanged except an explicitly reviewed narrow correction count.

The implementation should assign stable postcondition IDs so both migration SQL and the readiness verifier report the same checks.

## 12. Data-safety strategy

- Never execute the five historical files.
- Define current canonical functions directly; do not recreate obsolete intermediate bodies.
- Use one transaction per forward migration under the existing advisory lock.
- Run all preconditions before the first mutating statement.
- Do not create fake validation, meeting, opportunity, quotation, product, Scope Condition, Promise, payment, or snapshot records.
- Do not backfill historical quotation snapshots from current catalog/CRM state.
- Catalog DML is a no-op on currently verified production. A future mismatch is corrected only when the exact prior value is on a reviewed allowlist; otherwise fail closed for human review.
- Capture before/after hashes/counts for protected catalog fields, product IDs, commercial fields, quotation rows, and validation rows.
- Preserve the final Send gate value; convergence SQL must explicitly assert it remains `false` and must not update it.

## 13. Truthful supersession model

The existing runner should later gain a single reviewed static registry, not a second runner or a database claim about historical execution. Each record must contain:

```text
oldVersion
oldName
oldRepositorySha256
classification = HISTORICAL_PROVENANCE_UNRESOLVED
replacementVersion
replacementName
reason
coveredStateIds[]
postconditionIds[]
approvedDate
approvedCommit
approvedPr
```

Required classifications exposed by audit/status output:

- `APPLIED_EXACT`: exact current repository version/name/SHA exists in `profox_migrations.applied_migrations`.
- `RECONCILED_FROM_NATIVE`: an approved native identity/content mapping is satisfied.
- `SUPERSEDED_BY_FORWARD_RECONCILIATION`: the old provenance remains unknown, but its explicit replacement exists as `APPLIED_EXACT` and all mapped postconditions pass.
- `PENDING_NEW`: a genuinely new migration is not yet recorded.
- `BLOCKED_UNRESOLVED`: neither authoritative provenance nor an applied, verified replacement exists.

Proposed explicit records:

| Old migration | Replacement | Required state covered |
| --- | --- | --- |
| `20260909110000_crm_sales_meeting_management_closeout_part_5` | `20260918120000_crm_sales_meeting_closeout_current_state_reconciliation` | two canonical close-out RPCs, ACLs, Completed/No Show automation boundary |
| `20260909193000_crm_sales_validation_escalation_part_7` | `20260918121000_crm_sales_validation_current_state_reconciliation` | final current Part 7 table/config/functions/triggers/RLS/ACL/index/audit/notification state |
| `20260909200000_crm_sales_requirements_confirmed_proposal_readiness_part_8` | `20260918122000_crm_sales_proposal_readiness_current_state_reconciliation` | current policy/evaluator 3, pipeline invariant, canonical transition and ACLs |
| `20260909201500_crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening` | `20260918122000_crm_sales_proposal_readiness_current_state_reconciliation` | final hardened evaluator 3/security/policy state; separate explicit record and postconditions, not a wildcard |
| `20260915154800_sales_catalog_clarity_repository_reconciliation` | `20260918123000_sales_catalog_current_state_reconciliation` | current schema/trigger/ACL/catalog invariants without historical replay/backfill |

The two Part 8 rows deliberately point to the same atomic current-state replacement, but each old version/name/SHA has its own audited record, reason, covered-state list, and postconditions. No range or “everything before X” rule is allowed.

## 14. Runner changes eventually required

Do not implement these changes in Part 10B.5. After design approval, extend `native-migration-reconciliation.mjs` and the existing production runner as follows:

1. Validate the supersession registry for exact version/name/SHA, unique old keys, known replacement file, later replacement version, nonempty evidence/postconditions, and no cycles/wildcards.
2. During ordinary status, classify an old row as `SUPERSEDED_BY_FORWARD_RECONCILIATION` only when the replacement has an exact custom-ledger record matching current repository SHA and the postcondition verifier passes. Otherwise keep it `BLOCKED_UNRESOLVED`.
3. Add a narrowly scoped convergence plan to the **same runner** that may execute only approved `PENDING_NEW` replacement migrations while their mapped old rows remain blocked. It must not execute unrelated pending SQL or any old SQL.
4. After each replacement transaction records the replacement exact row, re-audit the mapped old record and log old identifier, old classification, replacement identifier, replacement ledger evidence, and postconditions.
5. Normal apply remains blocked until every old row is either authoritative native evidence or a verified applied forward replacement.
6. Never insert any of the five old versions into `profox_migrations.applied_migrations`; only the new reconciliation versions are recorded.

This preserves ledger truth: the ledger says which new SQL actually ran, while the source registry says why an unresolved historical file is no longer executable/release-blocking.

## 15. Why historical truth is not falsified and replay is unnecessary

The design never says an old migration was applied. It retains `HISTORICAL_PROVENANCE_UNRESOLVED` permanently and separately proves that a reviewed later migration established the required **current** state. The custom ledger records only that later migration's exact version/name/SHA.

Historical SQL replay is unnecessary and less safe because:

- Part 7 and Part 8 have later hardening that supersedes intermediate definitions;
- the current Part 8 authority is evaluator 3, not either historical Part 8 body;
- catalog UPDATE replay could overwrite current business decisions;
- current-state reconciliation can be idempotent, preconditioned, and postconditioned without claiming past facts.

## 16. Test plan

Before any production use, add tests for:

- registry schema, exact SHA pinning, duplicates, cycles, wildcard rejection, replacement ordering, missing replacement, replacement checksum drift, and one-to-one audit records;
- all five truth states and explicit status/log output;
- old row stays blocked when replacement is absent, pending, checksum-mismatched, ledger-mismatched, or postcondition-failing;
- convergence mode executes only named replacements and never historical/unrelated SQL;
- transaction rollback prevents a replacement ledger row on SQL/postcondition failure;
- each migration against clean, fully current, partially present compatible, and incompatible fixtures;
- exact function security/search-path/ACL contracts, trigger counts, RLS/policy definitions, indexes/constraints, and config versions;
- Part 5 Completed and No Show behavior without duplicate follow-up;
- Part 7 request/review/stale/audit/notification behavior and cross-Lead/RLS denial;
- Part 8 Requirements Confirmed transition TOCTOU re-evaluation, evaluator 3 dimensions, Part 9 integration, package/validation/next-action gates, quotation/payment/Won boundaries;
- Catalog no-op on canonical data, allowlisted narrow correction, rejection of unknown drift, immutable IDs/commercial fields, and no snapshot backfill;
- existing migration integrity, Part 10A, Part 10B, security, TypeScript, unit, Playwright/E2E, audit, and production build suites.

## 17. Deployment plan

1. Owner fixes GitHub Actions billing/spending restriction and confirms it.
2. Run one normal CI execution on the exact reviewed head; require `runner_id != 0`, Checkout execution, and all real steps green.
3. Review/approve this design while PR #117 remains draft.
4. Refetch latest `main`; re-audit migration identifiers and production read-only state.
5. In a new reviewed implementation phase, add the four SQL files, supersession registry/runner extension, postcondition verifier, and tests. Do not activate Part 10B.
6. Run local/static/focused/full tests and trusted CI. Review generated SQL and business-data diff.
7. Take a production backup/change window; run read-only preflight and record protected hashes/counts.
8. Run the approved forward-convergence-only path. Apply replacements in order, one transaction each; never replay the old files.
9. Re-run lineage/readiness verification. Expected result: five explicit superseded classifications, four exact new ledger rows, zero old ledger rows, zero pending/unresolved release blockers, and Send gate still false.
10. Perform authenticated production regression QA. Merge/activation remains a separate explicit decision; Part 11 remains out of scope.

## 18. Rollback and failure model

PostgreSQL DDL, function, trigger, policy, grant, configuration and bounded catalog operations proposed here are transactional. Each replacement runs in its own `BEGIN`/`COMMIT`; any SQL or postcondition failure rolls back that replacement and its ledger insert together.

If migration 1 succeeds and migration 2 fails, migration 1 remains truthfully applied and its single old record may be superseded; the other four old records remain blocked. No all-or-nothing claim is made across separate migrations. The runner stops immediately and does not apply later replacements.

No `CREATE INDEX CONCURRENTLY` is proposed, so there is no nontransactional operation. If implementation review later requires it, index creation must be separated with an explicit resumable state; no supersession can become effective until the index and all postconditions succeed.

Application rollback should use a new forward corrective migration, not edit/delete applied history. Removing a replacement ledger row or marking an old row applied is forbidden.

## 19. Risks

- A standalone evaluator 3 definition could drift from the Part 9-patched live body; mitigate with definition/behavior fixtures and production read-only digest comparison.
- Table/constraint repair for a truly partial Part 7 state could lock or reject existing data; preflight exact shape/data and stop on incompatibility.
- Function replacement changes future behavior immediately; pin current-main definitions and run authenticated workflow regression tests.
- Catalog correction is the only business-data risk; canonical production is currently a no-op, unknown drift must fail closed, and protected commercial/history fields must be hashed before/after.
- Supersession could become a skip mechanism if loosely implemented; require exact replacement ledger evidence, machine postconditions, explicit logs, and no wildcard/range mappings.
- CI remains unavailable until the external GitHub billing restriction is resolved; no local or Cloudflare result substitutes for it.

## 20. Recommendation

**IMPLEMENT FORWARD CONVERGENCE**, but only in the next separately reviewed implementation phase and only with the four ordered migrations, explicit supersession registry, postcondition verifier, tests, and convergence-only runner path described above.

This recommendation does not make PR #117 merge-ready today. CI runner recovery and the actual forward-convergence implementation must both be completed and independently reviewed first.

## 21. Required final checkpoint

1. Current main SHA: `0be12a91cc096ecb7c67c1d5e9858bdac18967b4`.
2. PR #117 starting head for this phase: `e2c7f72ecbaadfebb6ce0f1c59d4957b77dfbab6`; final documentation head is authoritative in live PR metadata after commit.
3. Billing/account fix confirmed by owner: **No**.
4. CI: run 827 / ID `35312345457` was the last exact-head normal run before this document.
5. Runner ID/name/steps: `0` / unavailable / `[]`.
6. First repository step executed: **No; Checkout did not execute**.
7. Full CI result: **not available because no repository step ran**; account billing/spending restriction, not a code-test failure.
8. Five provenance blockers unchanged: **Yes**.
9. Exact operation inventory: Sections 4–8.
10. Proposed forward reconciliation migration count: **4**.
11. Proposed names/order: Section 9.
12. Destructive-data risk: meeting low; validation low/medium schema-lock/partial-state risk; readiness medium behavioral risk; catalog medium/high if replayed but bounded to no-op/allowlisted narrow correction in this design.
13. Preconditions: Section 10.
14. Postconditions: Section 11.
15. Proposed supersession model: Sections 13–14.
16. Custom ledger truth preserved: **Yes**.
17. Old migrations falsely marked applied: **NO**.
18. SQL replay proposed: **NO**.
19. Production writes in Part 10B.5: **NO**.
20. `finalQuotationSendGateActive`: **false**.
21. PR #117 status: **open draft; do not merge**.
22. Recommendation: **IMPLEMENT FORWARD CONVERGENCE**.
23. Exact next reviewed implementation step: after the owner confirms GitHub billing is fixed and one normal CI run actually executes, refetch latest main and create a separately reviewed implementation commit containing the four proposed forward migrations, exact supersession registry/runner extension, shared postcondition verifier, and tests—without applying production migrations or activating Part 10B.

HISTORICAL PART 10B.5 DESIGN CHECKPOINT: NO HISTORICAL MIGRATION WAS REPLAYED OR FALSELY MARKED APPLIED; THE FINAL SEND GATE REMAINED OFF, PR #117 REMAINED DRAFT, AND PART 11 HAD NOT STARTED AT THAT TIME.

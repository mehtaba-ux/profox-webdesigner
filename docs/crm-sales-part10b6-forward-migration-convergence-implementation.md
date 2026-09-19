# CRM Sales Part 10B.6 — Forward-Migration Convergence Implementation

Date: 2026-09-18  
Repository: `mehtaba-ux/profox-webdesigner`  
PR: #117  
Branch: `part10b3-migration-lineage-truth-audit`  
Starting main: `0be12a91cc096ecb7c67c1d5e9858bdac18967b4`  
Starting Part 10B.6 PR head: `00d3e8abae4303e0ea03cea14d72e94c6e40ecb2`

## Status

**Repository implementation: COMPLETE FOR REVIEW.**

This phase implements forward-only convergence for the five historically unresolved current migrations without replaying or falsely marking any historical migration as applied.

Production convergence was **NOT RUN**. Production `migrations:apply` was **NOT RUN**. The final quotation Send gate remains **false**. PR #117 remains **draft/unmerged**. Part 11 has not started.

The exact final PR head and exact final-head GitHub Actions / Cloudflare results are self-referential repository metadata and are recorded in the PR #117 description after this document commit.

## Four forward-only reconciliation migrations

| Version | Logical name | Repository SHA-256 |
|---|---|---|
| `20260918120000` | `crm_sales_meeting_closeout_current_state_reconciliation` | `dbd984de4d6bd324a2529e523346733798d4bc8817c14dad1abaed5ad5516035` |
| `20260918121000` | `crm_sales_validation_current_state_reconciliation` | `afdaeed9a52e3d59a960dcc4a896c56930bbd15357def57c3f2cb2029a99d13c` |
| `20260918122000` | `crm_sales_proposal_readiness_current_state_reconciliation` | `bd318ef44168c97c1200e71c676570f2bf2e887725e25b285c6b2b88a663a32e` |
| `20260918123000` | `sales_catalog_current_state_reconciliation` | `5c837bf6ab4c38835bec8c195ace7203c68858dc977079c9ecd3ec071f188b58` |

The top-level migration manifest contains 693 migration files, is strictly ordered, and has zero duplicate versions. The four versions above were collision-free at implementation time.

## Historical migrations that remain historically unresolved

These files were not modified, renamed, deleted, executed, replayed, or inserted into `profox_migrations.applied_migrations`:

1. `20260909110000_crm_sales_meeting_management_closeout_part_5`
2. `20260909193000_crm_sales_validation_escalation_part_7`
3. `20260909200000_crm_sales_requirements_confirmed_proposal_readiness_part_8`
4. `20260909201500_crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening`
5. `20260915154800_sales_catalog_clarity_repository_reconciliation`

Historical provenance remains `HISTORICAL_PROVENANCE_UNRESOLVED`. Forward supersession is a current-state release fact only; it never asserts that the old SQL executed.

## Supersession registry

| Historical version/name | Old repository SHA-256 | Replacement | Replacement SHA-256 |
|---|---|---|---|
| `20260909110000_crm_sales_meeting_management_closeout_part_5` | `bc4944edf31ce435bc7bf1efc71d12e660fccdb3952bf578150e89f1fe2e13b4` | `20260918120000_crm_sales_meeting_closeout_current_state_reconciliation` | `dbd984de4d6bd324a2529e523346733798d4bc8817c14dad1abaed5ad5516035` |
| `20260909193000_crm_sales_validation_escalation_part_7` | `f153f00f85c8e7ec6974b220f7ba1072bb9432963f37081282cffeb7add40564` | `20260918121000_crm_sales_validation_current_state_reconciliation` | `afdaeed9a52e3d59a960dcc4a896c56930bbd15357def57c3f2cb2029a99d13c` |
| `20260909200000_crm_sales_requirements_confirmed_proposal_readiness_part_8` | `d430a06cc0065af0bf2385ee90657a25820c404c66a8594c774455583220ea61` | `20260918122000_crm_sales_proposal_readiness_current_state_reconciliation` | `bd318ef44168c97c1200e71c676570f2bf2e887725e25b285c6b2b88a663a32e` |
| `20260909201500_crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening` | `5917aa1bdefd2387bb654907344e9997bc1eb957bfbd2aff59ce1061741f9068` | `20260918122000_crm_sales_proposal_readiness_current_state_reconciliation` | `bd318ef44168c97c1200e71c676570f2bf2e887725e25b285c6b2b88a663a32e` |
| `20260915154800_sales_catalog_clarity_repository_reconciliation` | `fb1f50f908653298da2e0a77b56fa1580117739c7dac73a6b3e79e4093ff2c3e` | `20260918123000_sales_catalog_current_state_reconciliation` | `5c837bf6ab4c38835bec8c195ace7203c68858dc977079c9ecd3ec071f188b58` |

The registry rejects wildcards/ranges, duplicate old versions, cycles, missing replacements, old-file SHA drift, replacement name drift, replacement checksum drift, and replacement versions that are not later than the old version.

## Truthful status model

The current-lineage audit exposes:

- `APPLIED_EXACT`
- `RECONCILED_FROM_NATIVE`
- `SUPERSEDED_BY_FORWARD_RECONCILIATION`
- `PENDING_NEW`
- `BLOCKED_UNRESOLVED`

A historical row can become `SUPERSEDED_BY_FORWARD_RECONCILIATION` only when:

1. its exact approved replacement exists in the repository with the pinned version/name/SHA;
2. the replacement has an exact custom-ledger entry with the same version/name/SHA; and
3. every postcondition mapped to that historical record passes.

Until then it remains `BLOCKED_UNRESOLVED`.

The five historically unresolved versions are evaluated before ordinary custom-ledger exact classification. Even an erroneous old custom-ledger row therefore remains `BLOCKED_UNRESOLVED`; a ledger row alone can never rewrite historical truth.

## Migration 1 — Meeting close-out

### Preconditions before first mutation

- required `sales_meetings`, `crm_activities`, and `crm_opportunities` tables exist;
- required access/helper/status-automation functions exist;
- canonical No Show status trigger exists, is enabled, and matches the current trigger definition;
- required table columns match exact current types/nullability;
- no unexpected overload of either close-out RPC exists;
- `finalQuotationSendGateActive=false`;
- business-row counts are captured before mutation.

### Current state established

- canonical `save_sales_meeting_closeout_draft(...)`;
- canonical `finalize_sales_meeting(...)`;
- SECURITY DEFINER and fixed `search_path=public, pg_temp`;
- browser/service ACL contract;
- Completed follow-up behavior;
- No Show automation boundary remains separate.

### Postconditions

- `P10B6_MEETING_FUNCTIONS_CURRENT`
- `P10B6_MEETING_ACLS_CURRENT`
- `P10B6_MEETING_COMPLETED_NOSHOW_BOUNDARY`
- `P10B6_MEETING_BUSINESS_COUNTS_UNCHANGED`
- `P10B6_SEND_GATE_FALSE`

## Migration 2 — Sales validation

### Preconditions before first mutation

- all required CRM/meeting/product/user tables and access/audit/notification helpers exist;
- existing validation policy is either absent or exactly canonical policy v1;
- any existing validation table has no unknown columns;
- existing columns match exact current type/null/default semantics;
- a required missing NOT NULL/no-default column on a nonempty partial table aborts before mutation;
- no unknown constraints, indexes, triggers, or RLS policies exist;
- any existing matching constraints/indexes/policy definitions must match exactly;
- missing constraints on a nonempty partial table abort before mutation;
- no duplicate active validation dedupe keys exist;
- no unexpected validation function overloads exist;
- Send gate remains false;
- existing validation-row count is captured.

### Current state established

- 39 canonical columns;
- 30 canonical constraints;
- 13 current operational indexes plus primary key;
- 3 enabled domain triggers;
- RLS and one hardened authenticated SELECT policy;
- policy version 1;
- 13 canonical functions/RPCs;
- current ACL matrix;
- current `/admin?tab=myWork` routing;
- zero validation-row creation.

### Postconditions

- `P10B6_VALIDATION_SCHEMA_39_COLUMNS`
- `P10B6_VALIDATION_CONSTRAINTS_CURRENT`
- `P10B6_VALIDATION_INDEXES_13_CURRENT`
- `P10B6_VALIDATION_TRIGGERS_3_ENABLED`
- `P10B6_VALIDATION_RLS_POLICY_CURRENT`
- `P10B6_VALIDATION_FUNCTIONS_CURRENT`
- `P10B6_VALIDATION_ACLS_CURRENT`
- `P10B6_VALIDATION_POLICY_V1`
- `P10B6_VALIDATION_MY_WORK_ROUTING`
- `P10B6_VALIDATION_ROWS_UNCHANGED`
- `P10B6_SEND_GATE_FALSE`

## Migration 3 — Proposal Readiness

### Preconditions before first mutation

- all required current Sales domain tables exist, including Part 7 and Part 9 tables;
- Package Fit, Part 9 scope/commitment and access helpers exist;
- existing Sales gate policy is absent, exact evaluator v3, or the specifically compatible reviewed evaluator v2 predecessor;
- unknown/newer policy state aborts;
- `crm_pipeline_settings` exists and has exactly one active, well-formed Requirements Confirmed stage;
- no unexpected overloads of the canonical assessment/transition RPCs exist;
- Send gate remains false;
- opportunity and Requirements Confirmed stage counts are captured.

### Current state established

- `crm_sales_gate_policy_v1` policy version 1;
- evaluator version 3 only;
- 20 current Proposal Readiness dimensions;
- 3 deferred quotation dimensions;
- Part 9 Scope/Promise integration;
- canonical `crm_get_sales_gate_assessment(uuid,text)`;
- canonical `crm_transition_opportunity(uuid,text)`;
- obsolete duplicate `requirementsSummary` stage requirement removed only when present;
- no evaluator 1/2 restoration and no second readiness engine.

### Postconditions

- `P10B6_READINESS_POLICY_V1_EVALUATOR_V3`
- `P10B6_READINESS_DIMENSIONS_20_PLUS_3`
- `P10B6_READINESS_EVALUATOR_CURRENT`
- `P10B6_READINESS_PART9_SCOPE_PROMISE`
- `P10B6_READINESS_TRANSITION_CURRENT`
- `P10B6_READINESS_PIPELINE_INVARIANT`
- `P10B6_READINESS_ACLS_CURRENT`
- `P10B6_READINESS_BUSINESS_COUNTS_UNCHANGED`
- `P10B6_SEND_GATE_FALSE`

## Migration 4 — Sales Catalog

### Preconditions before first mutation

- canonical `sales_products` and `quotation_items` tables exist;
- existing reviewed catalog/snapshot columns, when present, match exact type/null/default semantics;
- any required catalog/snapshot column missing from a nonempty historical table aborts before mutation rather than risking implicit backfill;
- active catalog is exactly 45 unique active product codes;
- exactly 37 active add-ons and 0 public active add-ons;
- PF-CUSTOM, Launch, Growth and Scale reviewed business values are already canonical;
- unknown product/business drift aborts;
- seller-guidance trigger/function shape is compatible;
- Send gate remains false;
- protected product commercial/identity hash, quotation-item row count and existing catalog/quotation ACLs are captured.

### Current state established

Only schema/function/trigger reconciliation is allowed on canonical data. The migration contains **zero** business-row `INSERT`/`UPDATE`/`DELETE` against `sales_products` or `quotation_items`.

It preserves IDs, pricing, visibility, payment schedules, quotation history, snapshots and private seller guidance. No historical snapshot backfill occurs.

### Postconditions

- `P10B6_CATALOG_SCHEMA_CURRENT`
- `P10B6_CATALOG_SELLER_GUIDANCE_TRIGGER_CURRENT`
- `P10B6_CATALOG_ACL_CURRENT`
- `P10B6_CATALOG_ACTIVE_45_UNIQUE`
- `P10B6_CATALOG_ADDONS_37_PRIVATE`
- `P10B6_CATALOG_DEFINITIONS_COMPLETE`
- `P10B6_CATALOG_PF_CUSTOM_CURRENT`
- `P10B6_CATALOG_LAUNCH_CURRENT`
- `P10B6_CATALOG_GROWTH_CURRENT`
- `P10B6_CATALOG_SCALE_CURRENT`
- `P10B6_CATALOG_PROTECTED_FIELDS_UNCHANGED`
- `P10B6_CATALOG_QUOTATION_HISTORY_UNCHANGED`
- `P10B6_SEND_GATE_FALSE`

## Runner behavior

The existing `scripts/migrate-production.mjs` is extended; no parallel migration runner was created.

Explicit mode:

`npm run migrations:converge-part10b6`

maps to:

`node scripts/migrate-production.mjs --converge-part10b6`

The convergence mode:

1. requires the already-existing authoritative migration baseline;
2. never initializes or repairs migration-control state;
3. validates the reviewed supersession registry;
4. refuses any of the five historical versions in the custom ledger;
5. refuses unrelated pending/future migrations;
6. selects only the four allowlisted replacement versions;
7. executes each replacement in its own database transaction;
8. runs all mapped postconditions before the custom-ledger insert;
9. inserts only the replacement version/name/checksum;
10. commits only after SQL + postconditions + ledger insert succeed;
11. rolls SQL and ledger insert back together on any failure;
12. performs a final truth audit requiring all five historical rows to be verified forward supersessions and no blocked/unrelated-pending rows.

Normal `migrations:apply` continues to fail closed while a historical blocker lacks exact replacement ledger/postcondition evidence.

## Tests and verification

Repository tests added:

- `tests/security/production-migration-forward-convergence.test.mjs`
- `tests/security/part10b6-forward-reconciliation-migrations.test.mjs`

Coverage includes:

- five-entry registry and four replacement identities;
- old SHA drift;
- replacement checksum/name drift;
- duplicates;
- wildcard/range rejection;
- cycle detection;
- missing replacement files;
- blocked historical state before replacement ledger evidence;
- postcondition failure;
- exact SUPERSEDED transition only after ledger + postconditions;
- forbidden old ledger row never becoming APPLIED_EXACT;
- replacement-only planning;
- unrelated pending refusal;
- pending replacement allowed before its repair postconditions can exist;
- already-applied replacement with lost postcondition fails closed;
- SQL failure rollback;
- postcondition failure rollback;
- ledger insert ordering after SQL/postconditions;
- historical SQL exclusion;
- migration source contracts for Meeting, Validation, Readiness and Catalog;
- catalog zero business-row DML;
- stable postcondition IDs and Send-gate preservation.

The new tests are included in `npm run test:migration-reconciliation`.

Latest worker/source verification on the implementation head before this documentation commit:

- changed Part 10B.6 JS/test source syntax: PASS;
- supersession registry validation: 5 records / 4 replacements;
- forward planner from unresolved state: 4 approved replacements only;
- exact replacement ledger + all postconditions: 5 historical rows become `SUPERSEDED_BY_FORWARD_RECONCILIATION`;
- forbidden historical ledger row: remains `BLOCKED_UNRESOLVED`;
- unrelated pending migration: blocked;
- simulated replacement SQL failure: rollback occurred and no ledger insert occurred;
- static migration manifest: 693 unique, strictly ordered versions;
- complete shared production current-state postcondition matrix: every check TRUE in an explicit read-only transaction.

Full final-head `npm ci`, TypeScript, full `npm test`, migration suite and Playwright depend on actual repository CI execution. They are not claimed from source-level checks. Cloudflare's normal build runs the repository build path but is reported separately and does not replace GitHub CI.

## Production read-only baseline

Verified with read-only SQL only:

- authoritative custom-ledger baseline: `20260831103000`;
- custom ledger: 676 total, 110 post-baseline, max `20260908100000`;
- native ledger: 667 total, 102 post-baseline, max `20260916070455`;
- five historical unresolved versions in custom ledger: 0;
- four Part 10B.6 replacements in custom ledger: 0;
- Scope Conditions: 0;
- Promises: 0;
- quotation Sales coverage: 0;
- captured Part 10B snapshots: 0;
- legacy Sent without snapshot: 2;
- Part 10B policy version: 2;
- snapshot schema version: 2;
- `finalQuotationSendGateActive=false`.

No production migration or business-data write was performed.

## CI and Cloudflare truth

GitHub Actions has been externally blocked by hosted-runner billing/spending allocation on preceding PR heads, producing `runner_id=0`, `steps=[]`, and no repository-code execution. No workflow weakening or runner-label workaround is part of Part 10B.6.

A normal final-head CI/Cloudflare recheck is required after this documentation commit. Exact final-head run/check evidence is recorded in PR #117's description so the documentation file does not create an endless self-referential new head.

Cloudflare preview success, when present, is useful build evidence only; it is not trusted GitHub CI and cannot authorize merge or production convergence.

## Remaining risks and release blockers

- trusted GitHub-hosted CI must allocate a real runner, execute Checkout and pass the complete workflow;
- the four forward migrations require human review before production convergence;
- production convergence has not been executed, so the five historical rows correctly remain blocked in current production lineage;
- the Send gate remains off and activation remains a later release step;
- PR #117 must remain draft/unmerged;
- Part 11 must not start.

## Confirmation

**Production convergence was NOT RUN. Production `migrations:apply` was NOT RUN. No old migration was replayed or falsely ledgered. No production business data was written. The final Send gate remains false.**

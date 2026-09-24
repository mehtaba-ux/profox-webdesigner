# Part 15 — Seller Quality + Performance

## Status

PART 15 — SELLER QUALITY + PERFORMANCE: COMPLETE.

Production closure passed trusted PR CI, merge, merged-main CI, checksum-verified production deployment, authenticated Admin/Seller QA, immutable-data verification, post-deploy database integrity, access-boundary verification, and final production readiness.

Part 16 has not started. It is ready only for a separate implementation instruction.

## Architecture

Part 15 extends the existing Performance & Coaching system. Existing persistence remains authoritative: sales_performance_settings and sales_performance_reviews. No duplicate Seller scorecard or performance table is created.

The canonical period calculation is get_sales_performance_period_snapshot(uuid,date,date). It is STABLE, SECURITY DEFINER, fixed-search-path, anonymous-denied, and internally self/Admin authorized. Review periods use deterministic UTC half-open boundaries.

The existing get_sales_performance_snapshot(uuid) remains the compatibility/current-activation wrapper and delegates to the period-aware path.

When an Admin completes a review, admin_update_sales_performance_review(...) freezes the exact period_start → period_end quantitative evidence into the existing immutable metrics_snapshot. A completed review cannot be reopened and a review cannot be completed before its evidence period ends. Legacy snapshots are not backfilled.

## Metric contract

Every metric reports AVAILABLE, INSUFFICIENT_DATA, or NOT_TRACKED_AUTHORITATIVELY, plus sample size, review period, source and limitations where applicable. There is deliberately no overall Seller score, ranking, tier, or automatic management verdict.

### Performance outcomes

- Verified revenue: payments.status=Verified plus verified_at. Currency is kept separate; no invented FX conversion.
- Win rate: canonical Won + Lost closed opportunities. Open opportunities are excluded. Won remains payment-controlled through the existing Part 12 verified-Payment authority; Part 15 does not create a second win authority.
- Won deal value: accepted quotation value by currency, kept distinct from verified cash revenue.

### Process quality

- First-response SLA: canonical first_response_due_at / first_response_at plus required evidence fields and safe current-owner assignment timing. Measured obligations include evidenced on-time, evidenced late, overdue open and response timestamps lacking required evidence. Missing evidence never counts as success.
- Discovery completeness: reuses the Part 8 REQUIREMENTS_CONFIRMED evaluator and canonical Requirement applicability/certainty rules.
- Proposal Readiness: reuses crm_get_sales_gate_assessment(...,'PROPOSAL_READINESS'). Current evaluator evidence is frozen at review completion rather than being presented as historical stage-transition truth.
- Next-action discipline: uses Part 11 opportunity-linked crm_activities. The legacy crm_opportunities.next_follow_up_at field is intentionally not performance truth.

### Delivery quality

- First-pass handoff acceptance: Part 13 reviewed attempt #1 only.
- Missing-information rate: Part 13 structured Return reasons MISSING_REQUIREMENT, UNCLEAR_REQUIREMENT, CLIENT_DEPENDENCY_MISSING and ONBOARDING_INFORMATION_INCOMPLETE only.
- Post-sale Sales-attributed scope changes: NOT_TRACKED_AUTHORITATIVELY because the audited source model has no canonical explicit Sales-responsibility field. Part 15 does not infer blame.

### Policy / commercial quality

- Unauthorized Promise incidents: active, unsuperseded Part 9 Promise records with canonical validation_alignment_status=CONFLICT only.
- Discount frequency: existing quotation discount fields; context only, not misconduct.
- Approval / exception frequency: quotation approval requests, Sales Validation requests and audited overrides remain separate evidence.
- Client expectation disputes: NOT_TRACKED_AUTHORITATIVELY because there is no explicit structured dispute/complaint source. Refunds, quotation changes, handoff Returns, messages and sentiment are not used to manufacture a dispute.

## Human authority boundary

Existing decisions remain Continue, Extend Review, Restrict Scope and Close Engagement. Part 15 does not auto-select decisions/actions, mutate Team & Users access, employment, commissions, certification, Sales Academy permissions, or Part 16 permissions.

## UI

The existing /admin/sales-performance page is extended for both Seller and Admin. It renders Performance Outcomes, Process Quality, Delivery Quality, Policy / Commercial Quality, availability, sample size, period, limitations and separate current operational health. The Admin review form remains human-authored; quantitative evidence is read-only.

## Security

Seller can read only their own evidence. Admin can read team evidence. Anonymous access is denied. The payload excludes provider payment IDs, private tokens, service-role material and other secret fields.

## Migration

- 20260921190000_crm_seller_quality_performance_part_15.sql
- SHA-256: b810ff80cd93e3dfd1f2d288db7060ec02974e583487c715c5c00f1a4457f41b

## Verification

- exact 77-case Part 15 specification matrix
- focused architecture/security tests
- scripts/verify-part15-release-readiness.mjs
- authenticated non-destructive Admin/Seller production QA using the existing trusted session harness
- before/after performance-review/settings immutability check

Pre-release production baseline: migration ledger 695; latest 20260921110000; Part 10B gate ACTIVE at policy/schema 2/2; 16 performance reviews; 0 completed; one settings row; one active Sales user; zero prohibited duplicate performance tables.

Rollback-only production-schema probes compiled and exercised the exact migration without persisting it. Current source data returned all 14 metrics and correctly reported unsupported scope-change attribution and client-dispute evidence as NOT_TRACKED_AUTHORITATIVELY.

## Release closure

Production closure completed against final runtime source `add3066abb9da77e3bf5cf306a0a6106695db7dd`.

Historical release chronology is preserved rather than rewritten:

- Implementation PR #137 merged at `434e03eb334f0c18e7ada9996e4633d7a950a853`. Production migration `20260921190000_crm_seller_quality_performance_part_15.sql` was applied exactly once with SHA-256 `b810ff80cd93e3dfd1f2d288db7060ec02974e583487c715c5c00f1a4457f41b`.
- A verifier-only release-readiness defect was corrected in PR #138, merged at `6e5f227afdfc687c35c5a2e14fc4c49a6734702a`; merged-main CI #929 / run `35614489920` passed.
- Authenticated-QA visibility stabilization PR #139 merged at `8f94d3fa8c5c25a57995e2233bdcf9b96afe5205`; trusted PR CI #930 / run `35616420022` passed.
- Visible-text stabilization PR #140 merged at `2fbe025cd60e2b19cc7b96533508703c25c347d5`; trusted PR CI #932 / run `35617904629` passed. Subsequent current-main production QA still exposed a hidden metric-label selection problem.
- PR #141 stabilized canonical visible metric labels and merged at `f872a1c08885ab9811dc193a8bd004c1c3fbebdd`; PR CI #934 / run `35622336563` and main CI #935 / run `35622668895` passed. Production deploy #376 / run `35622926645` still failed the authenticated Part 15 visible-label gate.
- PR #142 made the shared authenticated QA scroll-aware and merged at `204c9e11a68addba506c5f94af88566ca2531e84`. GitHub-hosted runner provisioning temporarily produced zero-step failures before CI #937 / run `35682240141` attempt 3 executed normally and passed; main CI #938 / run `35683236999` passed. Production deploy #377 / run `35683360091` then proved the label existed but hidden duplicate selection remained.
- PR #143 switched Part 15 Admin QA to deterministic visible metric-card assertions and merged at `c9259dd328f5d87135454e101710f5780c12ca38`; PR CI #939 / run `35683920534` and main CI #940 / run `35684090907` passed. Production deploy #378 / run `35684229668` exposed the same hidden-selection class for availability text.
- PR #144 verified availability inside each visible metric card and merged at `7ff9d45c9d97c60d66e61ab72b392f68cfe7fb53`; PR CI #941 / run `35684675750` and main CI #942 / run `35684820594` passed. Production deploy #379 / run `35684936499` correctly exposed a semantic QA mismatch: the current Seller card was being compared with a historical review-period availability state.
- PR #145 corrected that current-vs-period comparison without changing metric logic and merged at `add3066abb9da77e3bf5cf306a0a6106695db7dd`; trusted PR CI #943 / run `35685388479` passed.
- Final runtime main CI #944 / run `35685557074` passed on `add3066abb9da77e3bf5cf306a0a6106695db7dd`.
- Final current-main production deploy #380 / run `35685672695` passed end-to-end. Cloudflare Worker version: `e048614f-b4d4-4c90-84c4-3918dd8782e1`.
- Part 15 release-readiness verifier: 0 failures. Exact 14-metric contract, approved availability vocabulary, unsupported-attribution fail-closed behavior, Part 11 `crm_activities` authority, Part 13 handoff evidence reuse, legacy `next_follow_up_at` exclusion, Seller self-scope and Seller cross-user denial all passed.
- Authenticated Admin QA passed with the active Seller and 16 real scheduled reviews, visible quality metrics, sample/availability/period evidence, human review form, mobile/keyboard checks, and no automatic management authority.
- Authenticated Seller QA passed with own evidence visible, cross-user period RPC rejected, Admin settings/review authority hidden, Seller Command Center preserved, and mobile/keyboard checks passed.
- Performance truth remained immutable: 16 reviews, 0 Completed, 16 Scheduled, one unchanged settings row, one active Sales user. No real review/settings/access/commission/certification state was changed and no fake performance or CRM/business record was created.
- Final business inventory remained unchanged: leads 6, opportunities 2, activities 13, Sales meetings 5, Sales Validations 0, quotations 6, payments 5, clients 2, projects 1, Client Onboardings 1, handoff attempts 0, Sales Promises 0, Scope Conditions 0, quotation Sales coverage 0, CRM lead events 123.
- Final database integrity: custom migration ledger 696; max migration `20260921190000`; Part 15 migration exact once/checksum exact; `PENDING_NEW=0`; `BLOCKED_UNRESOLVED=0`; Part 10B final quotation Send gate active with `policyVersion=2` and `snapshotSchemaVersion=2`; period/current snapshot functions each exist exactly once; prohibited duplicate performance tables = 0.
- Part 15 browser-facing RPCs deny anonymous execution. Supabase advisor findings attributable to this surface are the existing authenticated `SECURITY DEFINER` warnings; internal Admin/self-scope checks and fixed search paths remain in place. Broader project-wide advisor warnings are pre-existing and outside Part 15 closure scope.

Current Part 15 contract:

- exactly 14 quantitative metrics;
- period-aware review snapshots;
- completed review snapshots immutable;
- `AVAILABLE`, `INSUFFICIENT_DATA`, and `NOT_TRACKED_AUTHORITATIVELY` semantics;
- Part 11 `crm_activities` is next-action authority; legacy opportunity `next_follow_up_at` is not performance authority;
- Part 13 is handoff-quality authority;
- verified Payment is revenue authority and payment-controlled Won is win authority;
- post-sale Sales-attributed scope change fails closed when authoritative attribution is unavailable;
- client expectation dispute fails closed when no canonical structured source exists;
- no overall Seller quality score, automatic employment decision, automatic access restriction, commission mutation, or certification mutation;
- human management review remains authoritative.

PART 15 — SELLER QUALITY + PERFORMANCE: COMPLETE.

PART 16: READY FOR SEPARATE IMPLEMENTATION INSTRUCTION. NOT STARTED.

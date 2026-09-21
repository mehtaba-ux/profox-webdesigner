# Part 15 — Seller Quality + Performance

## Status

Implementation release candidate. Production closure is recorded only after trusted PR CI, merge, merged-main CI, production migration/deploy, authenticated Admin/Seller QA, immutable-data verification, and final production readiness all pass.

Part 16 is not implemented by this workstream.

## Architecture

Part 15 extends the existing Performance & Coaching system. Existing persistence remains authoritative: sales_performance_settings and sales_performance_reviews. No duplicate Seller scorecard or performance table is created.

The canonical period calculation is get_sales_performance_period_snapshot(uuid,date,date). It is STABLE, SECURITY DEFINER, fixed-search-path, anonymous-denied, and internally self/Admin authorized. Review periods use deterministic UTC half-open boundaries.

The existing get_sales_performance_snapshot(uuid) remains the compatibility/current-activation wrapper and delegates to the period-aware path.

When an Admin completes a review, admin_update_sales_performance_review(...) freezes the exact period_start → period_end quantitative evidence into the existing immutable metrics_snapshot. A completed review cannot be reopened and a review cannot be completed before its evidence period ends. Legacy snapshots are not backfilled.

## Metric contract

Every metric reports AVAILABLE, INSUFFICIENT_DATA, or NOT_TRACKED_AUTHORITATIVELY, plus sample size, review period, source and limitations where applicable. There is deliberately no overall Seller score, ranking, tier, or automatic management verdict.

### Performance outcomes

- Verified revenue: payments.status=Verified plus verified_at. Currency is kept separate; no invented FX conversion.
- Win rate: canonical Won + Lost closed opportunities. Open opportunities are excluded.
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

This section is updated with exact PR, CI, merged-main, deployment, Worker, ledger, authenticated QA and final integrity evidence only after those gates pass.

PART 15: RELEASE CANDIDATE — PRODUCTION CLOSURE PENDING.

PART 16: NOT STARTED.

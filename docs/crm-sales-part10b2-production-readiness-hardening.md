# CRM Sales SOP Part 10B.2 — Production Readiness Hardening

**Date:** 2026-09-16  
**Starting main:** `e24a6e03660c0d2b35d8f0f930057e24237ee0fa`

## Why this hardening was required

The existing generic production verifier treated the database migration state as healthy when the custom `profox_migrations` ledger was merely newer than an old fixed minimum. That was not strong enough after the Part 10B.2 native/custom-ledger reconciliation work because production readiness must prove that the custom ledger matches the **current repository migration set**, including exact logical names and SHA-256 checksums.

The release recovery also relied on manual read-only checks for the Part 10B policy, snapshot columns, canonical functions, internal ACLs and universal Sent-transition ordering. Those checks are now encoded in the existing production verification chain so future trusted deployments fail closed if they drift.

## Implementation

- Added `scripts/migration-manifest.mjs` as the single reusable source for migration-file discovery, ordering, normalized SHA-256 calculation and applied-ledger integrity auditing.
- Refactored `scripts/migrate-production.mjs` to reuse the shared manifest/audit rules instead of maintaining a second checksum/name/version implementation.
- Added `scripts/verify-part10b-release-readiness.mjs`.
- Wired `production:verify-part10b` into the existing `production:verify` chain. No parallel deployment/release workflow was introduced.
- Production Part 10B verification now checks:
  - every current repository migration is represented in `profox_migrations.applied_migrations` after `migrations:apply`;
  - applied version/name/checksum values match the repository exactly;
  - policy version `2` and snapshot schema version `2`;
  - all three immutable quotation snapshot columns;
  - exactly one canonical assertion, capture, reconciliation and snapshot-builder function by exact `regprocedure` signature;
  - anonymous/authenticated direct assertion/capture denied and `service_role` retained;
  - `protect_quotation_transition()` capture ordering remains before Admin and atomic-RPC early returns;
  - current final Send-gate state is reported explicitly;
  - production Scope Condition, Promise, coverage, captured-snapshot and legacy-Sent inventory is reported read-only.
- Added `tests/security/production-migration-ledger-audit.test.mjs` and wired it into the existing `test:migration-reconciliation` command.

## Focused validation

Independent exact-source validation completed before merge:

- existing native migration reconciliation tests: **8/8 passed**;
- new migration manifest/ledger tests: **10/10 passed**;
- combined focused migration safety suite: **18/18 passed**;
- `node --check scripts/migration-manifest.mjs`: passed;
- `node --check scripts/migrate-production.mjs`: passed;
- `node --check scripts/verify-part10b-release-readiness.mjs`: passed.

The new Part 10B SQL checks were also executed read-only against production. They confirmed:

- `finalQuotationSendGateActive=false`;
- policy version `2`;
- snapshot schema version `2`;
- snapshot columns `3/3`;
- assertion/capture/reconciliation/snapshot-builder exact function counts `1/1/1/1`;
- anonymous assertion/capture `false/false`;
- authenticated assertion/capture `false/false`;
- service-role assertion/capture `true/true`;
- active-gate snapshot capture occurs before both Admin and atomic-RPC early returns.

No production row, migration ledger row, SQL migration, quotation, Scope Condition, Promise or snapshot was changed by these validations.

## Release boundary

This hardening closes a repository-side verification gap; it does **not** satisfy the external Part 10B.2 activation prerequisites by itself.

The production Send gate must remain OFF until all of the following are genuinely proven through a trusted execution/deployment environment:

1. full repository CI/test/build execution succeeds;
2. trusted `migrations:apply` runs and reconciles the custom ledger using real repository checksums;
3. compatible current frontend is successfully deployed to canonical production;
4. exact production health is verified;
5. authenticated Seller/Admin production resolution-path QA succeeds.

No activation migration is created by this hardening.

**PART 10B IMPLEMENTATION IS COMPLETE, BUT PRODUCTION ACTIVATION REMAINS BLOCKED. PART 11 MUST NOT BEGIN.**

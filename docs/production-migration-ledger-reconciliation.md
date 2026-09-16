# Production Migration Ledger Reconciliation

## Status

Release-safety reconciliation was introduced after the Part 10B.1 audit discovered that production has two migration histories:

- `profox_migrations.applied_migrations`, used by `scripts/migrate-production.mjs` and keyed by repository migration version/file name/checksum.
- `supabase_migrations.schema_migrations`, containing migrations recorded by Supabase native migration history.

The custom repository ledger currently ends at `20260908100000_crm_sales_probing_discovery_part_3`.

A 30-entry historical alias map was added for post-baseline repository migrations that were believed to correspond to production changes applied outside the custom runner. The map records repository/local version, logical name, and an expected native Supabase version.

A later read-only production evidence audit on 2026-09-16 corrected an important assumption: **only 3 of the 30 alias entries currently have the exact expected `nativeVersion + logicalName` pair in `supabase_migrations.schema_migrations`.** Those three are the Part 10B migrations. The other 27 expected native-version rows are absent from the current native ledger.

This does not prove that the effects of those 27 repository migrations are absent from production; it means their exact native-ledger provenance is not currently established. Therefore they must not be auto-reconciled and must not be replayed merely because their expected native-history row is absent.

## Current safe resolution

The production migration runner imports the explicit historical alias map from `scripts/native-migration-reconciliation.mjs`.

For an alias-listed historical migration, the runner now permits exactly one safe reconciliation path:

1. The migration is after the authoritative custom-ledger baseline.
2. It is not already recorded in `profox_migrations.applied_migrations`.
3. Its local version and logical name exactly match the audited alias entry.
4. Production native history contains the exact expected `nativeVersion + logicalName` pair.

When all four conditions are satisfied, the runner records the repository migration's current version, logical name, and repository SHA-256 checksum in the custom ledger inside a transaction **without executing the migration SQL again**.

The runner fails closed when any historical alias lacks exact evidence:

- same logical native name at an unexpected native version → fail closed;
- local logical-name drift → fail closed;
- expected native row completely absent → **fail closed and refuse to execute that historical alias SQL**.

Only a future migration that is **not** in the historical alias map remains eligible for the normal transactional SQL apply path.

This distinction prevents the 27 currently unproven historical aliases from being mistaken for genuinely new migrations if GitHub-hosted runners become available.

## Production evidence audit — 2026-09-16

Read-only comparison of the 30 alias entries against `supabase_migrations.schema_migrations` returned:

- alias entries: `30`
- exact expected native version + logical-name matches: `3`
- expected native-version rows absent: `27`
- native version/name mismatches at the expected versions: `0`

The three exact matches are:

1. `20260916121000 crm_sales_final_quotation_send_gate_part10b_foundation` → native `20260916063249 crm_sales_final_quotation_send_gate_part10b_foundation`
2. `20260916123500 crm_sales_final_send_snapshot_forge_hardening` → native `20260916070047 crm_sales_final_send_snapshot_forge_hardening`
3. `20260916124500 crm_sales_final_send_assertion_privilege_hardening` → native `20260916070455 crm_sales_final_send_assertion_privilege_hardening`

The remaining 27 alias entries require authoritative evidence before they may be added to the custom ledger. No manual ledger insert, guessed checksum, or SQL replay is authorized by this audit.

## Additional integrity hardening

The shared migration-manifest audit rejects:

- an applied migration that is missing locally;
- same-version migration renames;
- checksum changes to already-applied migrations;
- duplicate applied versions;
- production-readiness parity when current repository migrations are not represented exactly in the custom ledger.

The migration runner therefore preserves both the original migration name and contents; corrections require a new migration rather than editing applied history.

## Regression coverage

`tests/security/production-migration-native-reconciliation.test.mjs` covers:

1. exactly 30 unique historical aliases;
2. exact Part 10B native migration versions;
3. exact native history reconciles audited wrappers with zero SQL replay scheduled;
4. custom-ledgered migrations are not reconciled twice;
5. an alias-listed historical migration absent from native history fails closed;
6. an unlisted future migration remains on the normal apply path;
7. an unexpected native version for a known logical name fails closed;
8. local logical-name drift fails closed.

`tests/security/production-migration-ledger-audit.test.mjs` separately covers exact repository/custom-ledger parity and checksum/name/version integrity.

The focused missing-evidence fail-closed suite was executed independently from the exact branch source on 2026-09-16: **8/8 passed**, and `node --check scripts/native-migration-reconciliation.mjs` passed.

Full repository CI remains unavailable because GitHub-hosted jobs continue to fail before runner allocation.

## Production safety boundary

This hardening changes migration-runner safety logic, focused tests, and documentation only. It does **not** modify any existing SQL migration file, Sales business table, quotation, Scope Condition, Promise, coverage row, snapshot, policy value, or Send state.

The production custom ledger must not be manually backfilled from chat. Any future reconciliation of the 27 unproven aliases requires authoritative evidence and repository-reviewed logic before rows are recorded.

Part 10B activation remains unchanged:

- `finalQuotationSendGateActive=false` until trusted full verification, safe migration-ledger reconciliation, compatible production deployment, exact health verification, and authenticated Seller/Admin production resolution QA succeed.
- No activation migration is created by this reconciliation safety patch.
- Part 11 remains blocked until the Part 10B activation precondition is satisfied.

`PART 10B ACTIVATION BLOCKED — PRODUCTION RESOLUTION UI AND MIGRATION-LEDGER COMPLETION NOT VERIFIED.`

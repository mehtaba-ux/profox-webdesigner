# Production Migration Ledger Reconciliation

## Status

Release-safety reconciliation implemented after the Part 10B.1 audit discovered that production has two migration histories:

- `profox_migrations.applied_migrations`, used by `scripts/migrate-production.mjs` and keyed by repository migration version/file name/checksum.
- `supabase_migrations.schema_migrations`, containing migrations that were already applied directly through Supabase native migration history.

The custom repository ledger currently ends at `20260908100000_crm_sales_probing_discovery_part_3`, while 30 later top-level repository migrations were already applied to production through the native Supabase ledger under different timestamp versions.

Without reconciliation, a future successful `npm run migrations:apply` could treat those repository wrappers as pending and attempt to replay already-applied SQL.

## Resolution

The production migration runner now imports an explicit audited reconciliation map from `scripts/native-migration-reconciliation.mjs`.

For each of the 30 known post-baseline repository migrations, the map records:

- repository/local migration version;
- exact logical migration name;
- exact production-native Supabase migration version.

The runner reconciles a local migration only when all of the following are true:

1. The migration is after the authoritative custom-ledger baseline.
2. It is not already recorded in `profox_migrations.applied_migrations`.
3. Its local version and logical name exactly match the audited reconciliation entry.
4. Production native history contains the exact expected `nativeVersion + logicalName` pair.

When those conditions are satisfied, the runner records the repository migration's current version, name, and SHA-256 checksum in the custom ledger inside a transaction **without executing the migration SQL again**.

If the logical native migration name exists at an unexpected native version, reconciliation fails closed. If no audited native migration exists, the migration remains on the normal transactional apply path. Future migrations not present in the explicit reconciliation map are never auto-reconciled.

## Additional integrity hardening

The existing custom-ledger verification previously checked an applied migration's checksum but did not separately assert that the stored migration name still matched the local file name for the same version.

The runner now rejects an applied migration rename even if the contents/checksum are unchanged. Applied migration history must therefore retain both its original name and contents; corrections require a new migration.

## Regression coverage

`tests/security/production-migration-native-reconciliation.test.mjs` covers:

1. exactly 30 unique audited aliases;
2. exact Part 10B native migration versions;
3. exact native history reconciles all audited wrappers with zero SQL replay scheduled;
4. custom-ledgered migrations are not reconciled twice;
5. an audited alias absent from native history remains genuinely pending;
6. an unlisted future migration remains on the normal apply path;
7. an unexpected native version for a known logical name fails closed;
8. local logical-name drift fails closed.

The reconciliation test is wired into both `npm run migrations:check` and the full `npm test` chain.

## Production safety boundary

This patch changes the migration runner and tests/documentation only. It does **not** modify any existing SQL migration file, Sales business table, quotation, Scope Condition, Promise, coverage row, snapshot, policy value, or Send state.

The production custom ledger is not manually backfilled from chat with guessed checksums. On the next successful trusted `migrations:apply`, the runner will calculate checksums from the actual repository files, verify the exact audited native history, and self-reconcile those rows transactionally before evaluating genuinely pending migrations.

Part 10B activation is unchanged:

- `finalQuotationSendGateActive=false` until compatible production frontend deployment succeeds and authenticated Seller/Admin production resolution QA is verified.
- No activation migration is created by this reconciliation.
- Part 11 remains blocked until the Part 10B activation precondition is satisfied.

`PART 10B ACTIVATION BLOCKED — PRODUCTION RESOLUTION UI NOT VERIFIED.`

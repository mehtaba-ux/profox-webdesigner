import dotenv from 'dotenv';
import process from 'node:process';
import pg from 'pg';
import { assertAppliedMigrationLedger, loadMigrationManifest } from './migration-manifest.mjs';
import {
  auditCurrentMigrationLineage,
  planForwardMigrationConvergence,
  planNativeMigrationReconciliation,
} from './native-migration-reconciliation.mjs';
import {
  executeApprovedForwardReplacement,
  historicalForwardMigrationSupersessions,
  validateForwardMigrationSupersessionRegistry,
  verifyForwardReconciliationPostconditions,
} from './forward-migration-convergence.mjs';

dotenv.config({ path: '.env.local', quiet: true });

const { Client } = pg;
const apply = process.argv.includes('--apply');
const convergePart10b6 = process.argv.includes('--converge-part10b6');
if (apply && convergePart10b6) {
  throw new Error('Use either --apply or --converge-part10b6, never both.');
}
const baselineVersion = String(process.env.MIGRATION_BASELINE_VERSION || '').trim();
const databaseUrl = String(process.env.SUPABASE_DB_URL || '').trim();

async function ensureControlSchema(client) {
  await client.query(`
    create schema if not exists profox_migrations;
    revoke all on schema profox_migrations from public, anon, authenticated;
    create table if not exists profox_migrations.applied_migrations (
      version text primary key check (version ~ '^[0-9]{14}$'),
      name text not null,
      checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
      baseline boolean not null default false,
      applied_at timestamptz not null default now()
    );
    create table if not exists profox_migrations.state (
      singleton boolean primary key default true check (singleton),
      baseline_version text not null check (baseline_version ~ '^[0-9]{14}$'),
      initialized_at timestamptz not null default now()
    );
    revoke all on all tables in schema profox_migrations from public, anon, authenticated;
  `);
}

async function initializeBaseline(client, migrations) {
  const state = await client.query('select baseline_version from profox_migrations.state where singleton=true');
  if (state.rowCount) return state.rows[0].baseline_version;
  if (!baselineVersion) {
    throw new Error('MIGRATION_BASELINE_VERSION is required for the one-time production migration baseline.');
  }
  if (!migrations.some(migration => migration.version === baselineVersion)) {
    throw new Error(`Baseline migration ${baselineVersion} does not exist locally.`);
  }
  const baseline = migrations.filter(migration => migration.version <= baselineVersion);
  await client.query('begin');
  try {
    await client.query(
      `insert into profox_migrations.applied_migrations(version,name,checksum,baseline)
       select item.version,item.name,item.checksum,true
       from jsonb_to_recordset($1::jsonb) as item(version text,name text,checksum text)`,
      [JSON.stringify(baseline.map(({ version, name, checksum: digest }) => ({ version, name, checksum: digest })))],
    );
    await client.query(
      'insert into profox_migrations.state(singleton,baseline_version) values(true,$1)',
      [baselineVersion],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
  console.log(`Recorded audited production baseline through ${baselineVersion} (${baseline.length} files).`);
  return baselineVersion;
}

async function verifyAndApply(client, migrations, authoritativeBaseline) {
  const result = await client.query(`
    select version,name,checksum,baseline
    from profox_migrations.applied_migrations
    order by version
  `);
  const { appliedByVersion } = assertAppliedMigrationLedger({
    migrations,
    appliedRows: result.rows,
    requireAllApplied: false,
  });

  const untrackedHistorical = migrations.filter(migration =>
    migration.version <= authoritativeBaseline && !appliedByVersion.has(migration.version)
  );
  if (untrackedHistorical.length) {
    throw new Error(`Historical migrations were inserted before the baseline: ${untrackedHistorical.map(item => item.file).join(', ')}`);
  }

  // Some audited production migrations were originally applied through Supabase's
  // native migration ledger before the repository runner existed. Reconcile only
  // current-manifest aliases with exact authoritative identity/content evidence.
  // Known current migrations with unresolved provenance are blocked before any
  // custom-ledger insert or SQL execution occurs.
  const nativeHistory = await client.query(`
    select version,name,statements
    from supabase_migrations.schema_migrations
    order by version
  `);
  validateForwardMigrationSupersessionRegistry({ migrations });
  const postconditionResults = await verifyForwardReconciliationPostconditions(client);
  const { reconciled, pending } = planNativeMigrationReconciliation({
    migrations,
    appliedByVersion,
    authoritativeBaseline,
    nativeRows: nativeHistory.rows,
    postconditionResults,
  });

  if (reconciled.length) {
    await client.query('begin');
    try {
      for (const { migration, alias, classification } of reconciled) {
        await client.query(
          `insert into profox_migrations.applied_migrations(version,name,checksum,baseline)
           values($1,$2,$3,false)`,
          [migration.version, migration.name, migration.checksum],
        );
        console.log(
          `Reconciled ${migration.file} from native Supabase history ${alias.nativeVersion}_${alias.name} via ${classification}; SQL was not replayed.`,
        );
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw new Error(`Native migration history reconciliation failed and was rolled back: ${error.message}`);
    }
  }

  for (const migration of pending) {
    await client.query('begin');
    try {
      await client.query(migration.source);
      await client.query(
        `insert into profox_migrations.applied_migrations(version,name,checksum,baseline)
         values($1,$2,$3,false)`,
        [migration.version, migration.name, migration.checksum],
      );
      await client.query('commit');
      console.log(`Applied ${migration.file}.`);
    } catch (error) {
      await client.query('rollback');
      throw new Error(`Migration ${migration.file} failed and was rolled back: ${error.message}`);
    }
  }
  console.log(
    `Migration verification passed: ${migrations.length} local, ${reconciled.length} reconciled from native history, ${pending.length} newly applied.`,
  );
}

async function loadExistingBaseline(client) {
  const state = await client.query(
    'select baseline_version from profox_migrations.state where singleton=true',
  );
  if (state.rowCount !== 1) {
    throw new Error(
      'Part 10B.6 convergence requires the existing authoritative production migration baseline; it will not initialize or repair migration control state.',
    );
  }
  return String(state.rows[0].baseline_version);
}

async function verifyAndConvergePart10b6(client, migrations, authoritativeBaseline) {
  const result = await client.query(`
    select version,name,checksum,baseline
    from profox_migrations.applied_migrations
    order by version
  `);
  const { appliedByVersion } = assertAppliedMigrationLedger({
    migrations,
    appliedRows: result.rows,
    requireAllApplied: false,
  });

  const untrackedHistorical = migrations.filter(migration =>
    migration.version <= authoritativeBaseline && !appliedByVersion.has(migration.version)
  );
  if (untrackedHistorical.length) {
    throw new Error(
      `Historical migrations were inserted before the baseline: ${untrackedHistorical.map(item => item.file).join(', ')}`,
    );
  }

  validateForwardMigrationSupersessionRegistry({ migrations });
  for (const record of historicalForwardMigrationSupersessions) {
    if (appliedByVersion.has(record.oldVersion)) {
      throw new Error(
        `Historical migration ${record.oldVersion}_${record.oldName} is present in the custom ledger. Part 10B.6 refuses to continue because historical unresolved rows must never be marked applied.`,
      );
    }
  }

  const nativeHistory = await client.query(`
    select version,name,statements
    from supabase_migrations.schema_migrations
    order by version
  `);
  const prePostconditions = await verifyForwardReconciliationPostconditions(client);
  const plan = planForwardMigrationConvergence({
    migrations,
    appliedByVersion,
    authoritativeBaseline,
    nativeRows: nativeHistory.rows,
    postconditionResults: prePostconditions,
  });

  if (!plan.pendingReplacements.length) {
    console.log('Part 10B.6 forward convergence has no approved replacement migration left to execute.');
  }

  for (const migration of plan.pendingReplacements) {
    const records = historicalForwardMigrationSupersessions.filter(
      record => record.replacementVersion === migration.version,
    );
    await executeApprovedForwardReplacement(client, { migration, records });
    appliedByVersion.set(migration.version, {
      version: migration.version,
      name: migration.name,
      checksum: migration.checksum,
      baseline: false,
    });
    console.log(
      `Applied approved Part 10B.6 forward replacement ${migration.file}; mapped historical SQL was not executed.`,
    );
  }

  const finalPostconditions = await verifyForwardReconciliationPostconditions(client);
  const finalRows = auditCurrentMigrationLineage({
    migrations,
    appliedByVersion,
    authoritativeBaseline,
    nativeRows: nativeHistory.rows,
    postconditionResults: finalPostconditions,
  });
  const superseded = finalRows.filter(
    row => row.truthStatus === 'SUPERSEDED_BY_FORWARD_RECONCILIATION',
  );
  const blocked = finalRows.filter(row => row.truthStatus === 'BLOCKED_UNRESOLVED');
  const unrelatedPending = finalRows.filter(
    row => row.truthStatus === 'PENDING_NEW'
      && !plan.registryAudit.replacementVersions.has(row.migration.version),
  );

  if (superseded.length !== historicalForwardMigrationSupersessions.length
      || blocked.length || unrelatedPending.length) {
    throw new Error(
      `Part 10B.6 convergence final audit failed: superseded=${superseded.length}, blocked=${blocked.length}, unrelated pending=${unrelatedPending.length}.`,
    );
  }

  console.log(
    `Part 10B.6 forward convergence verification passed: ${superseded.length} historical migration(s) are truthfully superseded by exact applied replacements; no historical SQL was replayed.`,
  );
}

const migrations = await loadMigrationManifest();
console.log(`Static migration verification passed: ${migrations.length} unique ordered versions.`);
validateForwardMigrationSupersessionRegistry({ migrations });
if (!apply && !convergePart10b6) process.exit(0);
if (!databaseUrl) {
  throw new Error(
    convergePart10b6
      ? 'SUPABASE_DB_URL is required with --converge-part10b6.'
      : 'SUPABASE_DB_URL is required with --apply.',
  );
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
  statement_timeout: 120000,
  application_name: 'profox-production-migration-runner',
});
let lockAcquired = false;

try {
  await client.connect();
  const lock = await client.query("select pg_try_advisory_lock(hashtextextended('profox-production-migrations',0)) as acquired");
  lockAcquired = lock.rows[0]?.acquired === true;
  if (!lockAcquired) throw new Error('Another production migration runner currently holds the deployment lock.');
  if (convergePart10b6) {
    const authoritativeBaseline = await loadExistingBaseline(client);
    await verifyAndConvergePart10b6(client, migrations, authoritativeBaseline);
  } else {
    await ensureControlSchema(client);
    const authoritativeBaseline = await initializeBaseline(client, migrations);
    await verifyAndApply(client, migrations, authoritativeBaseline);
  }
} finally {
  if (lockAcquired) {
    await client.query("select pg_advisory_unlock(hashtextextended('profox-production-migrations',0))").catch(() => {});
  }
  await client.end().catch(() => {});
}

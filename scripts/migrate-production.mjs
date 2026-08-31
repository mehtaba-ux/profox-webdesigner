import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

dotenv.config({ path: '.env.local', quiet: true });

const { Client } = pg;
const migrationsDirectory = path.join(process.cwd(), 'supabase', 'migrations');
const apply = process.argv.includes('--apply');
const baselineVersion = String(process.env.MIGRATION_BASELINE_VERSION || '').trim();
const databaseUrl = String(process.env.SUPABASE_DB_URL || '').trim();
const migrationPattern = /^(\d{14})_(.+)\.sql$/;

function checksum(source) {
  return createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
}

async function loadMigrations() {
  const files = (await readdir(migrationsDirectory))
    .filter(file => migrationPattern.test(file))
    .sort((a, b) => a.localeCompare(b));
  const migrations = await Promise.all(files.map(async file => {
    const [, version, name] = file.match(migrationPattern);
    const source = await readFile(path.join(migrationsDirectory, file), 'utf8');
    return { version, name, file, source, checksum: checksum(source) };
  }));
  const seen = new Set();
  const duplicates = migrations.filter(item => seen.has(item.version) || !seen.add(item.version));
  if (duplicates.length) {
    throw new Error(`Duplicate migration versions: ${[...new Set(duplicates.map(item => item.version))].join(', ')}`);
  }
  for (let index = 1; index < migrations.length; index += 1) {
    if (migrations[index - 1].version >= migrations[index].version) {
      throw new Error(`Migration order is not strictly increasing near ${migrations[index].file}.`);
    }
  }
  return migrations;
}

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
  const appliedByVersion = new Map(result.rows.map(row => [row.version, row]));
  const localByVersion = new Map(migrations.map(migration => [migration.version, migration]));

  for (const row of result.rows) {
    const local = localByVersion.get(row.version);
    if (!local) throw new Error(`Applied migration ${row.version}_${row.name} is missing locally.`);
    if (local.checksum !== row.checksum) {
      throw new Error(`Applied migration was modified: ${local.file}. Add a new migration instead.`);
    }
  }
  const untrackedHistorical = migrations.filter(migration =>
    migration.version <= authoritativeBaseline && !appliedByVersion.has(migration.version)
  );
  if (untrackedHistorical.length) {
    throw new Error(`Historical migrations were inserted before the baseline: ${untrackedHistorical.map(item => item.file).join(', ')}`);
  }

  const pending = migrations.filter(migration =>
    migration.version > authoritativeBaseline && !appliedByVersion.has(migration.version)
  );
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
  console.log(`Migration verification passed: ${migrations.length} local, ${pending.length} newly applied.`);
}

const migrations = await loadMigrations();
console.log(`Static migration verification passed: ${migrations.length} unique ordered versions.`);
if (!apply) process.exit(0);
if (!databaseUrl) throw new Error('SUPABASE_DB_URL is required with --apply.');

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
  await ensureControlSchema(client);
  const authoritativeBaseline = await initializeBaseline(client, migrations);
  await verifyAndApply(client, migrations, authoritativeBaseline);
} finally {
  if (lockAcquired) {
    await client.query("select pg_advisory_unlock(hashtextextended('profox-production-migrations',0))").catch(() => {});
  }
  await client.end().catch(() => {});
}

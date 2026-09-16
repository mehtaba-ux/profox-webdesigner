import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const MIGRATION_FILE_PATTERN = /^(\d{14})_(.+)\.sql$/;

export function migrationChecksum(source) {
  return createHash('sha256').update(String(source).replace(/\r\n/g, '\n')).digest('hex');
}

export async function loadMigrationManifest({
  migrationsDirectory = path.join(process.cwd(), 'supabase', 'migrations'),
} = {}) {
  const files = (await readdir(migrationsDirectory))
    .filter(file => MIGRATION_FILE_PATTERN.test(file))
    .sort((a, b) => a.localeCompare(b));

  const migrations = await Promise.all(files.map(async file => {
    const [, version, name] = file.match(MIGRATION_FILE_PATTERN);
    const source = await readFile(path.join(migrationsDirectory, file), 'utf8');
    return { version, name, file, source, checksum: migrationChecksum(source) };
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

export function auditAppliedMigrationLedger({ migrations, appliedRows, requireAllApplied = false }) {
  const localByVersion = new Map(migrations.map(migration => [migration.version, migration]));
  const appliedByVersion = new Map();
  const issues = [];

  for (const row of appliedRows) {
    const version = String(row.version);
    const name = String(row.name);
    const checksum = String(row.checksum);

    if (appliedByVersion.has(version)) {
      issues.push(`Duplicate applied migration version ${version}.`);
      continue;
    }
    appliedByVersion.set(version, row);

    const local = localByVersion.get(version);
    if (!local) {
      issues.push(`Applied migration ${version}_${name} is missing locally.`);
      continue;
    }
    if (local.name !== name) {
      issues.push(`Applied migration was renamed: expected ${version}_${name}.sql, found ${local.file}. Add a new migration instead.`);
      continue;
    }
    if (local.checksum !== checksum) {
      issues.push(`Applied migration was modified: ${local.file}. Add a new migration instead.`);
    }
  }

  const missing = requireAllApplied
    ? migrations.filter(migration => !appliedByVersion.has(migration.version))
    : [];

  return {
    issues,
    missing,
    appliedByVersion,
    localByVersion,
    latestLocalVersion: migrations.at(-1)?.version || null,
    latestAppliedVersion: [...appliedByVersion.keys()].sort((a, b) => a.localeCompare(b)).at(-1) || null,
  };
}

export function assertAppliedMigrationLedger(options) {
  const audit = auditAppliedMigrationLedger(options);
  if (audit.issues.length) throw new Error(audit.issues[0]);
  if (options.requireAllApplied && audit.missing.length) {
    throw new Error(`Production migration ledger is missing ${audit.missing.length} repository migration(s): ${audit.missing.map(item => item.file).join(', ')}`);
  }
  return audit;
}

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertAppliedMigrationLedger,
  auditAppliedMigrationLedger,
  loadMigrationManifest,
  migrationChecksum,
} from '../../scripts/migration-manifest.mjs';

function migration(version, name, source = `-- ${name}\nselect 1;\n`) {
  return {
    version,
    name,
    file: `${version}_${name}.sql`,
    source,
    checksum: migrationChecksum(source),
  };
}

function applied(row) {
  return {
    version: row.version,
    name: row.name,
    checksum: row.checksum,
    baseline: false,
  };
}

const one = migration('20260916121000', 'crm_sales_final_quotation_send_gate_part10b_foundation');
const two = migration('20260916123500', 'crm_sales_final_send_snapshot_forge_hardening');
const three = migration('20260916124500', 'crm_sales_final_send_assertion_privilege_hardening');

test('exact checksummed repository ledger passes with no missing migrations', () => {
  const audit = auditAppliedMigrationLedger({
    migrations: [one, two, three],
    appliedRows: [applied(one), applied(two), applied(three)],
    requireAllApplied: true,
  });

  assert.deepEqual(audit.issues, []);
  assert.deepEqual(audit.missing, []);
  assert.equal(audit.latestLocalVersion, three.version);
  assert.equal(audit.latestAppliedVersion, three.version);
});

test('applied migration missing from repository fails closed', () => {
  const ghost = { version: '20260916130000', name: 'ghost', checksum: 'a'.repeat(64), baseline: false };
  const audit = auditAppliedMigrationLedger({ migrations: [one], appliedRows: [applied(one), ghost] });
  assert.match(audit.issues[0], /is missing locally/);
});

test('applied same-version rename fails closed', () => {
  const renamed = { ...applied(one), name: 'renamed_foundation' };
  assert.throws(
    () => assertAppliedMigrationLedger({ migrations: [one], appliedRows: [renamed] }),
    /Applied migration was renamed/,
  );
});

test('applied checksum mutation fails closed', () => {
  const mutated = { ...applied(one), checksum: 'b'.repeat(64) };
  assert.throws(
    () => assertAppliedMigrationLedger({ migrations: [one], appliedRows: [mutated] }),
    /Applied migration was modified/,
  );
});

test('production parity reports repository migrations missing from the custom ledger', () => {
  const audit = auditAppliedMigrationLedger({
    migrations: [one, two, three],
    appliedRows: [applied(one)],
    requireAllApplied: true,
  });
  assert.deepEqual(audit.issues, []);
  assert.deepEqual(audit.missing.map(row => row.version), [two.version, three.version]);
});

test('migration runner audit may validate existing rows without requiring pending rows to be applied', () => {
  const audit = auditAppliedMigrationLedger({
    migrations: [one, two, three],
    appliedRows: [applied(one)],
    requireAllApplied: false,
  });
  assert.deepEqual(audit.issues, []);
  assert.deepEqual(audit.missing, []);
});

test('duplicate applied versions fail closed even if rows otherwise look valid', () => {
  const audit = auditAppliedMigrationLedger({
    migrations: [one],
    appliedRows: [applied(one), applied(one)],
  });
  assert.match(audit.issues[0], /Duplicate applied migration version/);
});

test('checksum normalization treats CRLF and LF sources identically', () => {
  assert.equal(migrationChecksum('select 1;\r\n'), migrationChecksum('select 1;\n'));
});

test('manifest loader sorts migrations, ignores unrelated files, and computes exact checksums', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'profox-migrations-'));
  try {
    await writeFile(join(directory, '20260916124500_third.sql'), 'select 3;\r\n');
    await writeFile(join(directory, 'README.md'), 'not a migration');
    await writeFile(join(directory, '20260916121000_first.sql'), 'select 1;\n');
    await writeFile(join(directory, '20260916123500_second.sql'), 'select 2;\n');

    const manifest = await loadMigrationManifest({ migrationsDirectory: directory });
    assert.deepEqual(manifest.map(item => item.version), ['20260916121000', '20260916123500', '20260916124500']);
    assert.equal(manifest[2].checksum, migrationChecksum('select 3;\n'));
    assert.equal(manifest[0].file, '20260916121000_first.sql');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('manifest loader rejects duplicate migration versions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'profox-migrations-'));
  try {
    await writeFile(join(directory, '20260916121000_first.sql'), 'select 1;\n');
    await writeFile(join(directory, '20260916121000_second.sql'), 'select 2;\n');
    await assert.rejects(
      () => loadMigrationManifest({ migrationsDirectory: directory }),
      /Duplicate migration versions: 20260916121000/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

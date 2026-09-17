import assert from 'node:assert/strict';
import test from 'node:test';
import { loadMigrationManifest } from '../../scripts/migration-manifest.mjs';
import {
  auditCurrentMigrationLineage,
  canonicalizeMigrationSourceForContentProof,
  historicalNativeMigrationAliases,
  migrationContentProofChecksum,
  nativeMigrationAliases,
  planNativeMigrationReconciliation,
  unresolvedNativeMigrationProvenance,
  validateNativeMigrationReconciliationConfig,
} from '../../scripts/native-migration-reconciliation.mjs';

function migrationFromAlias(alias, source = '-- audited migration fixture') {
  return {
    version: alias.localVersion,
    name: alias.name,
    file: `${alias.localVersion}_${alias.name}.sql`,
    checksum: 'a'.repeat(64),
    source,
  };
}

test('current executable aliases, historical aliases, and unresolved rows are disjoint and unique', () => {
  assert.equal(nativeMigrationAliases.length, 8);
  assert.equal(historicalNativeMigrationAliases.length, 27);
  assert.equal(unresolvedNativeMigrationProvenance.length, 5);
  assert.equal(new Set(nativeMigrationAliases.map(item => item.localVersion)).size, 8);
  assert.equal(new Set(nativeMigrationAliases.map(item => item.nativeVersion)).size, 8);
  assert.equal(new Set(historicalNativeMigrationAliases.map(item => item.localVersion)).size, 27);
  assert.equal(new Set(unresolvedNativeMigrationProvenance.map(item => item.localVersion)).size, 5);

  const executable = new Set(nativeMigrationAliases.map(item => item.localVersion));
  assert.ok(historicalNativeMigrationAliases.every(item => !executable.has(item.localVersion)));
  assert.ok(unresolvedNativeMigrationProvenance.every(item => !executable.has(item.localVersion)));
});

test('duplicate executable aliases fail configuration validation', () => {
  const alias = nativeMigrationAliases[0];
  assert.throws(
    () => validateNativeMigrationReconciliationConfig({
      activeAliases: [alias, { ...alias }],
      historicalAliases: [],
      unresolvedRows: [],
    }),
    /Duplicate or invalid native migration reconciliation alias/,
  );
});

test('active aliases and unresolved blockers correspond to current repository migrations only', async () => {
  const manifest = await loadMigrationManifest();
  const byVersion = new Map(manifest.map(migration => [migration.version, migration]));

  for (const alias of nativeMigrationAliases) {
    const migration = byVersion.get(alias.localVersion);
    assert.ok(migration, `missing active current migration ${alias.localVersion}_${alias.name}`);
    assert.equal(migration.name, alias.name);
    if (alias.proof === 'NATIVE_CONTENT_EQUIVALENT') {
      assert.equal(migrationContentProofChecksum(migration.source), alias.contentSha256);
    }
  }

  for (const blocked of unresolvedNativeMigrationProvenance) {
    const migration = byVersion.get(blocked.localVersion);
    assert.ok(migration, `missing unresolved current migration ${blocked.localVersion}_${blocked.name}`);
    assert.equal(migration.name, blocked.name);
  }

  for (const historical of historicalNativeMigrationAliases) {
    assert.equal(byVersion.has(historical.localVersion), false, `orphan historical alias became executable again: ${historical.localVersion}`);
  }
});

test('Part 10B aliases use the exact authoritative native migration versions', () => {
  const expected = new Map([
    ['20260916121000', ['crm_sales_final_quotation_send_gate_part10b_foundation', '20260916063249']],
    ['20260916123500', ['crm_sales_final_send_snapshot_forge_hardening', '20260916070047']],
    ['20260916124500', ['crm_sales_final_send_assertion_privilege_hardening', '20260916070455']],
  ]);

  for (const [localVersion, [name, nativeVersion]] of expected) {
    const alias = nativeMigrationAliases.find(item => item.localVersion === localVersion);
    assert.equal(alias?.name, name);
    assert.equal(alias?.nativeVersion, nativeVersion);
    assert.equal(alias?.proof, 'NATIVE_EXACT');
  }
});

test('content proof normalization is conservative and deterministic', () => {
  const canonical = 'select 1;';
  assert.equal(canonicalizeMigrationSourceForContentProof('\uFEFFselect 1;\r\n'), canonical);
  assert.equal(canonicalizeMigrationSourceForContentProof('select 1;\n'), canonical);
  assert.equal(canonicalizeMigrationSourceForContentProof('select 1;'), canonical);
  assert.equal(migrationContentProofChecksum('select 1;\r\n'), migrationContentProofChecksum('select 1;\n'));
  assert.notEqual(migrationContentProofChecksum('select 1;\n\n'), migrationContentProofChecksum('select 1;\n'));
});

test('all exact native aliases reconcile without scheduling SQL replay', () => {
  const aliases = nativeMigrationAliases.filter(alias => alias.proof === 'NATIVE_EXACT');
  const migrations = aliases.map(alias => migrationFromAlias(alias));
  const nativeRows = aliases.map(alias => ({ version: alias.nativeVersion, name: alias.name }));

  const plan = planNativeMigrationReconciliation({
    migrations,
    appliedByVersion: new Map(),
    authoritativeBaseline: '20260908100000',
    nativeRows,
  });

  assert.equal(plan.reconciled.length, 3);
  assert.equal(plan.pending.length, 0);
  assert.ok(plan.reconciled.every(item => item.classification === 'NATIVE_EXACT'));
});

test('audited content-equivalent alias requires both local and native content proof', async () => {
  const manifest = await loadMigrationManifest();
  const alias = nativeMigrationAliases.find(item => item.proof === 'NATIVE_CONTENT_EQUIVALENT');
  const migration = manifest.find(item => item.version === alias.localVersion);
  assert.ok(migration);

  const plan = planNativeMigrationReconciliation({
    migrations: [migration],
    appliedByVersion: new Map(),
    authoritativeBaseline: '20260908100000',
    nativeRows: [{ version: alias.nativeVersion, name: alias.name, statements: [migration.source] }],
  });
  assert.equal(plan.reconciled.length, 1);
  assert.equal(plan.reconciled[0].classification, 'NATIVE_CONTENT_EQUIVALENT');
  assert.equal(plan.pending.length, 0);

  assert.throws(
    () => planNativeMigrationReconciliation({
      migrations: [migration],
      appliedByVersion: new Map(),
      authoritativeBaseline: '20260908100000',
      nativeRows: [{ version: alias.nativeVersion, name: alias.name, statements: [`${migration.source}\nselect 999;`] }],
    }),
    /Native content proof mismatch/,
  );
});

test('content-equivalent reconciliation refuses ambiguous native statement representation', async () => {
  const manifest = await loadMigrationManifest();
  const alias = nativeMigrationAliases.find(item => item.proof === 'NATIVE_CONTENT_EQUIVALENT');
  const migration = manifest.find(item => item.version === alias.localVersion);
  assert.ok(migration);

  assert.throws(
    () => planNativeMigrationReconciliation({
      migrations: [migration],
      appliedByVersion: new Map(),
      authoritativeBaseline: '20260908100000',
      nativeRows: [{ version: alias.nativeVersion, name: alias.name, statements: ['select 1;', 'select 2;'] }],
    }),
    /not deterministically comparable/,
  );
});

test('already custom-ledgered migration is skipped before native reconciliation', () => {
  const alias = nativeMigrationAliases.find(item => item.proof === 'NATIVE_EXACT');
  const migration = migrationFromAlias(alias);
  const plan = planNativeMigrationReconciliation({
    migrations: [migration],
    appliedByVersion: new Map([[alias.localVersion, { version: alias.localVersion }]]),
    authoritativeBaseline: '20260908100000',
    nativeRows: [],
  });
  assert.equal(plan.reconciled.length, 0);
  assert.equal(plan.pending.length, 0);
  assert.equal(plan.rows[0].classification, 'CUSTOM_LEDGER_EXACT');
});

test('an active alias with no authoritative native evidence fails closed', () => {
  const alias = nativeMigrationAliases.find(item => item.proof === 'NATIVE_EXACT');
  assert.throws(
    () => planNativeMigrationReconciliation({
      migrations: [migrationFromAlias(alias)],
      appliedByVersion: new Map(),
      authoritativeBaseline: '20260908100000',
      nativeRows: [],
    }),
    /Audited native migration evidence is missing/,
  );
});

test('same logical native name at an unexpected version fails closed', () => {
  const alias = nativeMigrationAliases.find(item => item.proof === 'NATIVE_EXACT');
  assert.throws(
    () => planNativeMigrationReconciliation({
      migrations: [migrationFromAlias(alias)],
      appliedByVersion: new Map(),
      authoritativeBaseline: '20260908100000',
      nativeRows: [{ version: '19990101000000', name: alias.name }],
    }),
    /Native migration history mismatch/,
  );
});

test('wrong name at the expected native version fails closed', () => {
  const alias = nativeMigrationAliases.find(item => item.proof === 'NATIVE_EXACT');
  assert.throws(
    () => planNativeMigrationReconciliation({
      migrations: [migrationFromAlias(alias)],
      appliedByVersion: new Map(),
      authoritativeBaseline: '20260908100000',
      nativeRows: [{ version: alias.nativeVersion, name: 'wrong_name' }],
    }),
    /Native migration history name mismatch/,
  );
});

test('local name drift on an active alias fails closed', () => {
  const alias = nativeMigrationAliases.find(item => item.proof === 'NATIVE_EXACT');
  const migration = { ...migrationFromAlias(alias), name: `${alias.name}_renamed` };
  assert.throws(
    () => planNativeMigrationReconciliation({
      migrations: [migration],
      appliedByVersion: new Map(),
      authoritativeBaseline: '20260908100000',
      nativeRows: [{ version: alias.nativeVersion, name: alias.name }],
    }),
    /Native migration reconciliation name mismatch/,
  );
});

test('known unresolved current migration can never fall through to SQL execution', () => {
  const blocked = unresolvedNativeMigrationProvenance[0];
  const migration = {
    version: blocked.localVersion,
    name: blocked.name,
    file: `${blocked.localVersion}_${blocked.name}.sql`,
    checksum: 'c'.repeat(64),
    source: 'select 1;',
  };

  const rows = auditCurrentMigrationLineage({
    migrations: [migration],
    appliedByVersion: new Map(),
    authoritativeBaseline: '20260908100000',
    nativeRows: [{
      version: blocked.nativeCandidateVersion,
      name: blocked.nativeCandidateName,
      statements: ['select 1;'],
    }],
  });
  assert.equal(rows[0].classification, 'UNRESOLVED_PROVENANCE');
  assert.equal(rows[0].safeAction, 'BLOCK_UNRESOLVED');

  assert.throws(
    () => planNativeMigrationReconciliation({
      migrations: [migration],
      appliedByVersion: new Map(),
      authoritativeBaseline: '20260908100000',
      nativeRows: [],
    }),
    /Unresolved migration provenance/,
  );
});

test('an unlisted future migration remains on the normal apply path', () => {
  const migration = {
    version: '20260918000000',
    name: 'future_migration',
    file: '20260918000000_future_migration.sql',
    checksum: 'b'.repeat(64),
    source: 'select 1;',
  };
  const plan = planNativeMigrationReconciliation({
    migrations: [migration],
    appliedByVersion: new Map(),
    authoritativeBaseline: '20260908100000',
    nativeRows: [],
  });

  assert.equal(plan.reconciled.length, 0);
  assert.deepEqual(plan.pending, [migration]);
  assert.equal(plan.rows[0].classification, 'GENUINELY_PENDING_NEW');
  assert.equal(plan.rows[0].safeAction, 'SAFE_NEW_APPLY_LATER');
});

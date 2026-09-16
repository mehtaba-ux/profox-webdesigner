import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nativeMigrationAliases,
  planNativeMigrationReconciliation,
} from '../../scripts/native-migration-reconciliation.mjs';

function migrationFromAlias(alias) {
  return {
    version: alias.localVersion,
    name: alias.name,
    file: `${alias.localVersion}_${alias.name}.sql`,
    checksum: 'a'.repeat(64),
    source: '-- audited migration fixture',
  };
}

test('audited native migration alias map is complete and unique', () => {
  assert.equal(nativeMigrationAliases.length, 30);
  assert.equal(new Set(nativeMigrationAliases.map(item => item.localVersion)).size, 30);
  assert.equal(new Set(nativeMigrationAliases.map(item => item.nativeVersion)).size, 30);
  assert.equal(new Set(nativeMigrationAliases.map(item => item.name)).size, 30);
});

test('Part 10B aliases use the exact production native migration versions', () => {
  const expected = new Map([
    ['20260916121000', ['crm_sales_final_quotation_send_gate_part10b_foundation', '20260916063249']],
    ['20260916123500', ['crm_sales_final_send_snapshot_forge_hardening', '20260916070047']],
    ['20260916124500', ['crm_sales_final_send_assertion_privilege_hardening', '20260916070455']],
  ]);

  for (const [localVersion, [name, nativeVersion]] of expected) {
    const alias = nativeMigrationAliases.find(item => item.localVersion === localVersion);
    assert.deepEqual(alias, { localVersion, name, nativeVersion });
  }
});

test('exact audited native history reconciles without scheduling SQL replay', () => {
  const migrations = nativeMigrationAliases.map(migrationFromAlias);
  const nativeRows = nativeMigrationAliases.map(alias => ({
    version: alias.nativeVersion,
    name: alias.name,
  }));

  const plan = planNativeMigrationReconciliation({
    migrations,
    appliedByVersion: new Map(),
    authoritativeBaseline: '20260908100000',
    nativeRows,
  });

  assert.equal(plan.reconciled.length, 30);
  assert.equal(plan.pending.length, 0);
  assert.deepEqual(
    plan.reconciled.map(item => item.migration.version),
    nativeMigrationAliases.map(item => item.localVersion),
  );
});

test('already custom-ledgered migrations are not reconciled twice', () => {
  const first = nativeMigrationAliases[0];
  const migrations = nativeMigrationAliases.map(migrationFromAlias);
  const nativeRows = nativeMigrationAliases.map(alias => ({ version: alias.nativeVersion, name: alias.name }));
  const appliedByVersion = new Map([[first.localVersion, { version: first.localVersion }]]);

  const plan = planNativeMigrationReconciliation({
    migrations,
    appliedByVersion,
    authoritativeBaseline: '20260908100000',
    nativeRows,
  });

  assert.equal(plan.reconciled.length, 29);
  assert.equal(plan.pending.length, 0);
  assert.ok(!plan.reconciled.some(item => item.migration.version === first.localVersion));
});

test('an audited alias with no native history is treated as genuinely pending', () => {
  const alias = nativeMigrationAliases[0];
  const migration = migrationFromAlias(alias);
  const plan = planNativeMigrationReconciliation({
    migrations: [migration],
    appliedByVersion: new Map(),
    authoritativeBaseline: '20260908100000',
    nativeRows: [],
  });

  assert.equal(plan.reconciled.length, 0);
  assert.deepEqual(plan.pending, [migration]);
});

test('an unlisted future migration remains on the normal apply path', () => {
  const migration = {
    version: '20260917000000',
    name: 'future_migration',
    file: '20260917000000_future_migration.sql',
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
});

test('same logical native name at an unexpected version fails closed', () => {
  const alias = nativeMigrationAliases[0];
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

test('local name drift on an audited alias fails closed', () => {
  const alias = nativeMigrationAliases[0];
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

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeApprovedForwardReplacement,
  forwardReconciliationPostconditionIds,
  historicalForwardMigrationSupersessions,
  PART10B6_FORWARD_REPLACEMENT_VERSIONS,
  validateForwardMigrationSupersessionRegistry,
} from '../../scripts/forward-migration-convergence.mjs';
import {
  auditCurrentMigrationLineage,
  planForwardMigrationConvergence,
} from '../../scripts/native-migration-reconciliation.mjs';

const BASELINE = '20260908100000';

function manifestFromRegistry() {
  const byVersion = new Map();
  for (const record of historicalForwardMigrationSupersessions) {
    if (!byVersion.has(record.oldVersion)) {
      byVersion.set(record.oldVersion, {
        version: record.oldVersion,
        name: record.oldName,
        file: `${record.oldVersion}_${record.oldName}.sql`,
        checksum: record.oldRepositorySha256,
        source: `-- historical fixture ${record.oldVersion}\nselect 'historical';\n`,
      });
    }
    if (!byVersion.has(record.replacementVersion)) {
      byVersion.set(record.replacementVersion, {
        version: record.replacementVersion,
        name: record.replacementName,
        file: `${record.replacementVersion}_${record.replacementName}.sql`,
        checksum: record.replacementSha256,
        source: `-- approved replacement fixture ${record.replacementVersion}\nselect 'replacement';\n`,
      });
    }
  }
  return [...byVersion.values()].sort((a, b) => a.version.localeCompare(b.version));
}

function allPostconditions(value = true) {
  return new Map(forwardReconciliationPostconditionIds.map(id => [id, value]));
}

function exactReplacementLedger(manifest) {
  const replacementVersions = new Set(PART10B6_FORWARD_REPLACEMENT_VERSIONS);
  return new Map(
    manifest
      .filter(migration => replacementVersions.has(migration.version))
      .map(migration => [migration.version, {
        version: migration.version,
        name: migration.name,
        checksum: migration.checksum,
        baseline: false,
      }]),
  );
}

test('Part 10B.6 registry has five explicit records and exactly four approved replacements', () => {
  const manifest = manifestFromRegistry();
  const audit = validateForwardMigrationSupersessionRegistry({ migrations: manifest });
  assert.equal(audit.records.length, 5);
  assert.equal(audit.replacementVersions.size, 4);
  assert.deepEqual(
    [...audit.replacementVersions].sort(),
    [...PART10B6_FORWARD_REPLACEMENT_VERSIONS].sort(),
  );
  assert.ok(audit.records.every(record =>
    record.classification === 'HISTORICAL_PROVENANCE_UNRESOLVED'
      && record.coveredStateIds.length > 0
      && record.postconditionIds.length > 0
      && /^[a-f0-9]{64}$/.test(record.oldRepositorySha256)
      && /^[a-f0-9]{64}$/.test(record.replacementSha256)
  ));
});

test('supersession registry rejects old repository SHA drift', () => {
  const manifest = manifestFromRegistry();
  const target = manifest.find(item => item.version === historicalForwardMigrationSupersessions[0].oldVersion);
  target.checksum = '0'.repeat(64);
  assert.throws(
    () => validateForwardMigrationSupersessionRegistry({ migrations: manifest }),
    /old SHA drift/,
  );
});

test('supersession registry rejects replacement checksum drift', () => {
  const manifest = manifestFromRegistry();
  const target = manifest.find(item => item.version === PART10B6_FORWARD_REPLACEMENT_VERSIONS[0]);
  target.checksum = '1'.repeat(64);
  assert.throws(
    () => validateForwardMigrationSupersessionRegistry({ migrations: manifest }),
    /replacement checksum drift/,
  );
});

test('supersession registry rejects duplicate old versions', () => {
  const manifest = manifestFromRegistry();
  const duplicate = {
    ...historicalForwardMigrationSupersessions[0],
    coveredStateIds: [...historicalForwardMigrationSupersessions[0].coveredStateIds],
    postconditionIds: [...historicalForwardMigrationSupersessions[0].postconditionIds],
  };
  assert.throws(
    () => validateForwardMigrationSupersessionRegistry({
      migrations: manifest,
      registry: [...historicalForwardMigrationSupersessions, duplicate],
    }),
    /Duplicate supersession old version/,
  );
});

test('supersession registry rejects wildcard or range mappings', () => {
  const manifest = manifestFromRegistry();
  const mutated = historicalForwardMigrationSupersessions.map((record, index) => index === 0
    ? { ...record, oldName: `${record.oldName}*` }
    : record);
  assert.throws(
    () => validateForwardMigrationSupersessionRegistry({ migrations: manifest, registry: mutated }),
    /Wildcard\/range supersession is forbidden/,
  );
});

test('supersession registry rejects missing replacement files', () => {
  const manifest = manifestFromRegistry().filter(
    item => item.version !== PART10B6_FORWARD_REPLACEMENT_VERSIONS[0],
  );
  assert.throws(
    () => validateForwardMigrationSupersessionRegistry({ migrations: manifest }),
    /replacement migration is missing/,
  );
});

test('supersession registry rejects replacement name mismatch', () => {
  const manifest = manifestFromRegistry();
  const target = manifest.find(item => item.version === PART10B6_FORWARD_REPLACEMENT_VERSIONS[0]);
  target.name = `${target.name}_drift`;
  target.file = `${target.version}_${target.name}.sql`;
  assert.throws(
    () => validateForwardMigrationSupersessionRegistry({ migrations: manifest }),
    /replacement name drift/,
  );
});

test('supersession registry detects cycles explicitly', () => {
  const shaA = 'a'.repeat(64);
  const shaB = 'b'.repeat(64);
  const registry = [
    {
      oldVersion: '20260918120000',
      oldName: 'cycle_a',
      oldRepositorySha256: shaA,
      classification: 'HISTORICAL_PROVENANCE_UNRESOLVED',
      replacementVersion: '20260918121000',
      replacementName: 'cycle_b',
      replacementSha256: shaB,
      reason: 'cycle test A',
      coveredStateIds: ['A'],
      postconditionIds: ['P10B6_SEND_GATE_FALSE'],
    },
    {
      oldVersion: '20260918121000',
      oldName: 'cycle_b',
      oldRepositorySha256: shaB,
      classification: 'HISTORICAL_PROVENANCE_UNRESOLVED',
      replacementVersion: '20260918120000',
      replacementName: 'cycle_a',
      replacementSha256: shaA,
      reason: 'cycle test B',
      coveredStateIds: ['B'],
      postconditionIds: ['P10B6_SEND_GATE_FALSE'],
    },
  ];
  const migrations = [
    { version: '20260918120000', name: 'cycle_a', file: '20260918120000_cycle_a.sql', checksum: shaA, source: 'select 1;' },
    { version: '20260918121000', name: 'cycle_b', file: '20260918121000_cycle_b.sql', checksum: shaB, source: 'select 2;' },
  ];
  assert.throws(
    () => validateForwardMigrationSupersessionRegistry({ migrations, registry }),
    /Supersession cycle detected/,
  );
});

test('historical rows stay BLOCKED_UNRESOLVED while replacements are absent from the ledger', () => {
  const manifest = manifestFromRegistry();
  const rows = auditCurrentMigrationLineage({
    migrations: manifest,
    appliedByVersion: new Map(),
    authoritativeBaseline: BASELINE,
    nativeRows: [],
    postconditionResults: allPostconditions(true),
  });
  const historical = rows.filter(row =>
    historicalForwardMigrationSupersessions.some(record => record.oldVersion === row.migration.version)
  );
  assert.equal(historical.length, 5);
  assert.ok(historical.every(row => row.truthStatus === 'BLOCKED_UNRESOLVED'));
});

test('exact replacement ledger evidence is insufficient when a mapped postcondition fails', () => {
  const manifest = manifestFromRegistry();
  const appliedByVersion = exactReplacementLedger(manifest);
  const results = allPostconditions(true);
  results.set('P10B6_SEND_GATE_FALSE', false);

  const rows = auditCurrentMigrationLineage({
    migrations: manifest,
    appliedByVersion,
    authoritativeBaseline: BASELINE,
    nativeRows: [],
    postconditionResults: results,
  });
  const historical = rows.filter(row =>
    historicalForwardMigrationSupersessions.some(record => record.oldVersion === row.migration.version)
  );
  assert.ok(historical.every(row => row.truthStatus === 'BLOCKED_UNRESOLVED'));
  assert.ok(historical.every(row => /postconditions/.test(row.reason)));
});

test('historical rows become SUPERSEDED only after exact replacement ledger evidence and all mapped postconditions', () => {
  const manifest = manifestFromRegistry();
  const appliedByVersion = exactReplacementLedger(manifest);
  const rows = auditCurrentMigrationLineage({
    migrations: manifest,
    appliedByVersion,
    authoritativeBaseline: BASELINE,
    nativeRows: [],
    postconditionResults: allPostconditions(true),
  });
  const historical = rows.filter(row =>
    historicalForwardMigrationSupersessions.some(record => record.oldVersion === row.migration.version)
  );
  assert.equal(historical.length, 5);
  assert.ok(historical.every(row =>
    row.classification === 'UNRESOLVED_PROVENANCE'
      && row.historicalClassification === 'HISTORICAL_PROVENANCE_UNRESOLVED'
      && row.truthStatus === 'SUPERSEDED_BY_FORWARD_RECONCILIATION'
  ));
});

test('replacement ledger name/checksum mismatch never produces SUPERSEDED state', () => {
  const manifest = manifestFromRegistry();
  const appliedByVersion = exactReplacementLedger(manifest);
  const first = PART10B6_FORWARD_REPLACEMENT_VERSIONS[0];
  appliedByVersion.set(first, {
    ...appliedByVersion.get(first),
    checksum: 'e'.repeat(64),
  });
  const rows = auditCurrentMigrationLineage({
    migrations: manifest,
    appliedByVersion,
    authoritativeBaseline: BASELINE,
    nativeRows: [],
    postconditionResults: allPostconditions(true),
  });
  const affected = rows.find(row => row.migration.version === historicalForwardMigrationSupersessions[0].oldVersion);
  assert.equal(affected.truthStatus, 'BLOCKED_UNRESOLVED');
  assert.match(affected.reason, /exact forward replacement/);
});

test('pending replacements do not require postcondition proof before their repair SQL runs', () => {
  const manifest = manifestFromRegistry();
  const plan = planForwardMigrationConvergence({
    migrations: manifest,
    appliedByVersion: new Map(),
    authoritativeBaseline: BASELINE,
    nativeRows: [],
    postconditionResults: new Map(),
  });
  assert.deepEqual(
    plan.pendingReplacements.map(item => item.version),
    PART10B6_FORWARD_REPLACEMENT_VERSIONS,
  );
});

test('convergence planner returns only the four explicitly approved replacement migrations', () => {
  const manifest = manifestFromRegistry();
  const plan = planForwardMigrationConvergence({
    migrations: manifest,
    appliedByVersion: new Map(),
    authoritativeBaseline: BASELINE,
    nativeRows: [],
    postconditionResults: allPostconditions(true),
  });
  assert.deepEqual(
    plan.pendingReplacements.map(item => item.version),
    PART10B6_FORWARD_REPLACEMENT_VERSIONS,
  );
  const historicalVersions = new Set(historicalForwardMigrationSupersessions.map(record => record.oldVersion));
  assert.ok(plan.pendingReplacements.every(item => !historicalVersions.has(item.version)));
});

test('convergence planner refuses unrelated pending migration SQL', () => {
  const manifest = manifestFromRegistry();
  manifest.push({
    version: '20260918124000',
    name: 'future_unreviewed_migration',
    file: '20260918124000_future_unreviewed_migration.sql',
    checksum: 'f'.repeat(64),
    source: "select 'must never execute';",
  });
  manifest.sort((a, b) => a.version.localeCompare(b.version));
  assert.throws(
    () => planForwardMigrationConvergence({
      migrations: manifest,
      appliedByVersion: new Map(),
      authoritativeBaseline: BASELINE,
      nativeRows: [],
      postconditionResults: allPostconditions(true),
    }),
    /refuses unrelated pending migrations/,
  );
});

test('convergence planner stops if an already-applied replacement loses a mapped postcondition', () => {
  const manifest = manifestFromRegistry();
  const one = manifest.find(item => item.version === PART10B6_FORWARD_REPLACEMENT_VERSIONS[0]);
  const appliedByVersion = new Map([[one.version, {
    version: one.version,
    name: one.name,
    checksum: one.checksum,
  }]]);
  const results = allPostconditions(true);
  results.set('P10B6_MEETING_FUNCTIONS_CURRENT', false);
  assert.throws(
    () => planForwardMigrationConvergence({
      migrations: manifest,
      appliedByVersion,
      authoritativeBaseline: BASELINE,
      nativeRows: [],
      postconditionResults: results,
    }),
    /failing\/unproven postconditions/,
  );
});

function fakeApprovedMigration(index = 0) {
  const version = PART10B6_FORWARD_REPLACEMENT_VERSIONS[index];
  const record = historicalForwardMigrationSupersessions.find(item => item.replacementVersion === version);
  return {
    version,
    name: record.replacementName,
    file: `${version}_${record.replacementName}.sql`,
    checksum: record.replacementSha256,
    source: `select 'approved replacement ${version}';`,
  };
}

test('approved replacement transaction rolls back when replacement SQL fails and never writes the ledger', async () => {
  const migration = fakeApprovedMigration(0);
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === migration.source) throw new Error('fixture SQL failure');
      return { rows: [] };
    },
  };

  await assert.rejects(
    () => executeApprovedForwardReplacement(client, { migration }),
    /rolled back: fixture SQL failure/,
  );
  assert.equal(calls[0].sql, 'begin');
  assert.ok(calls.some(call => call.sql === migration.source));
  assert.ok(calls.some(call => call.sql === 'rollback'));
  assert.equal(calls.some(call => /insert into profox_migrations\.applied_migrations/i.test(call.sql)), false);
  assert.equal(calls.some(call => call.sql === 'commit'), false);
});

test('approved replacement transaction rolls back when a postcondition fails and never writes the ledger', async () => {
  const migration = fakeApprovedMigration(0);
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === 'begin' || sql === migration.source || sql === 'rollback') return { rows: [] };
      if (/^\s*select/i.test(sql)) return { rows: [{ ok: false }] };
      return { rows: [] };
    },
  };

  await assert.rejects(
    () => executeApprovedForwardReplacement(client, { migration }),
    /postcondition failed/,
  );
  assert.ok(calls.some(call => call.sql === 'rollback'));
  assert.equal(calls.some(call => /insert into profox_migrations\.applied_migrations/i.test(call.sql)), false);
  assert.equal(calls.some(call => call.sql === 'commit'), false);
});

test('approved replacement transaction executes only replacement SQL, then postconditions, ledger insert, and commit', async () => {
  const migration = fakeApprovedMigration(0);
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/^\s*select/i.test(sql)) return { rows: [{ ok: true }] };
      return { rows: [] };
    },
  };

  await executeApprovedForwardReplacement(client, { migration });

  assert.equal(calls[0].sql, 'begin');
  assert.equal(calls.filter(call => call.sql === migration.source).length, 1);
  const insertIndex = calls.findIndex(call => /insert into profox_migrations\.applied_migrations/i.test(call.sql));
  const sourceIndex = calls.findIndex(call => call.sql === migration.source);
  const commitIndex = calls.findIndex(call => call.sql === 'commit');
  assert.ok(sourceIndex > 0);
  assert.ok(insertIndex > sourceIndex);
  assert.ok(commitIndex > insertIndex);
  assert.deepEqual(calls[insertIndex].params, [migration.version, migration.name, migration.checksum]);
  assert.equal(
    calls.some(call => historicalForwardMigrationSupersessions.some(record =>
      call.sql === `-- historical fixture ${record.oldVersion}\nselect 'historical';\n`
    )),
    false,
  );
});

test('executor refuses a replacement checksum mismatch before opening a transaction', async () => {
  const migration = { ...fakeApprovedMigration(0), checksum: '9'.repeat(64) };
  let called = false;
  const client = { async query() { called = true; return { rows: [] }; } };
  await assert.rejects(
    () => executeApprovedForwardReplacement(client, { migration }),
    /identity\/checksum mismatch/,
  );
  assert.equal(called, false);
});

import { createHash } from 'node:crypto';
import {
  historicalForwardMigrationSupersessions,
  mappedPostconditionsPass,
  PART10B6_FORWARD_REPLACEMENT_VERSIONS,
  validateForwardMigrationSupersessionRegistry,
} from './forward-migration-convergence.mjs';

const activeAliasRows = [
  ['20260909103000', 'crm_sales_meeting_prep_part_4', '20260909045346', 'NATIVE_CONTENT_EQUIVALENT', 'bb4678491d27b4e1f03a16f77de488d745c55cd84485715148be5747c9d4b897'],
  ['20260909160000', 'crm_sales_package_fit_part_6', '20260909084757', 'NATIVE_CONTENT_EQUIVALENT', '2dad0ccd1bd1dfe04fae054e9c8217f424dcc511e15b800cd3e4ed4a56e31a17'],
  ['20260909162000', 'crm_sales_package_fit_part_6_policy_hardening', '20260909085018', 'NATIVE_CONTENT_EQUIVALENT', 'fc7fe8f4f308b33cfe275f3888e220972d18109cc443167aa75ac1f44210df08'],
  ['20260909194500', 'crm_sales_validation_queue_routing_part_7', '20260909111815', 'NATIVE_CONTENT_EQUIVALENT', '9ef9ce06da4f7168ba1f9d0ae2138ed64009b930182ef1833358177911022ee9'],
  ['20260909195500', 'crm_sales_validation_advisor_hardening_part_7', '20260909111835', 'NATIVE_CONTENT_EQUIVALENT', '24830078bb4a72b200d7473907228dd2b1f23b1450c7fb3afdd60ee579384c86'],
  ['20260916121000', 'crm_sales_final_quotation_send_gate_part10b_foundation', '20260916063249', 'NATIVE_EXACT', null],
  ['20260916123500', 'crm_sales_final_send_snapshot_forge_hardening', '20260916070047', 'NATIVE_EXACT', null],
  ['20260916124500', 'crm_sales_final_send_assertion_privilege_hardening', '20260916070455', 'NATIVE_EXACT', null],
];

const historicalAliasRows = [
  ['20260909130000', 'crm_sales_requirements_resolution_part_4', '20260909123856'],
  ['20260909140000', 'crm_sales_requirements_resolution_part_4_recut', '20260909132143'],
  ['20260910123000', 'crm_sales_package_fit_part_5', '20260910042031'],
  ['20260910124500', 'crm_sales_package_fit_part_5_policy_and_governance_hardening', '20260910051126'],
  ['20260910143000', 'crm_specialist_access_workflow_part_6', '20260910083705'],
  ['20260910151000', 'crm_specialist_access_workflow_part_6_rpc_hardening', '20260910090254'],
  ['20260910152500', 'crm_specialist_access_workflow_part_6_resolution_event_stamper', '20260910091803'],
  ['20260910170000', 'crm_sales_delivery_execution_workspace_part_7', '20260910113831'],
  ['20260911110000', 'crm_sales_delivery_execution_workspace_part_7_ddl_repair', '20260911063713'],
  ['20260911175000', 'crm_sales_conversion_part8', '20260911120834'],
  ['20260912184000', 'crm_sales_conversion_part8_baseline_and_refinement', '20260912135158'],
  ['20260915111500', 'crm_sales_promises_part9', '20260915053730'],
  ['20260915113000', 'crm_sales_promises_part9_hardening', '20260915060057'],
  ['20260915122500', 'crm_sales_promises_part9_rebuild', '20260915065829'],
  ['20260915123000', 'crm_sales_promises_part9_stamping_hardening', '20260915095720'],
  ['20260915125500', 'crm_sales_promises_part9_delete_audit_hardening', '20260915125219'],
  ['20260915191000', 'crm_sales_reconciliation_part10a', '20260915142302'],
  ['20260915195000', 'crm_sales_reconciliation_part10a_review_coverage', '20260915145857'],
  ['20260915214500', 'crm_sales_reconciliation_part10a_review_coverage_forge_hardening', '20260915155758'],
  ['20260915220000', 'crm_sales_reconciliation_part10a_owner_delete_hardening', '20260915181516'],
  ['20260916150000', 'crm_sales_catalog_v1', '20260916093503'],
  ['20260916174500', 'crm_sales_catalog_v1_catalog_id_compatibility', '20260916114854'],
  ['20260916175000', 'crm_sales_catalog_v1_trigger_search_path_repair', '20260916120501'],
  ['20260916175500', 'crm_sales_catalog_v1_quotation_items_column_grants', '20260916123003'],
  ['20260916194500', 'lock_down_anonymous_tracking_and_acquisition_rls', '20260916141139'],
  ['20260916195500', 'require_admin_specialist_invites_and_partner_callbacks', '20260916143101'],
  ['20260916210000', 'security_linter_hardening', '20260916153027'],
];

const unresolvedRows = [
  [
    '20260909110000',
    'crm_sales_meeting_management_closeout_part_5',
    '20260909063552',
    'crm_sales_meeting_management_closeout_part_5',
    'Repository/native raw bytes differ. Additional comments are observed inside the PL/pgSQL close-out body, but no trusted PostgreSQL/PL/pgSQL tokenizer is available to prove that every executable body token is identical.',
  ],
  [
    '20260909193000',
    'crm_sales_validation_escalation_part_7',
    '20260909110302',
    'crm_sales_validation_escalation_part_7',
    'Repository/native raw bytes differ. Additional explanatory comments are observed, but no trusted PostgreSQL/PL/pgSQL tokenizer is available to prove that all executable SQL and function-body tokens are identical.',
  ],
  [
    '20260909200000',
    'crm_sales_requirements_confirmed_proposal_readiness_part_8',
    '20260910024728',
    'crm_sales_requirements_confirmed_proposal_readiness_part_8',
    'Repository/native raw bytes differ. No trusted PostgreSQL/PL/pgSQL tokenizer is available to establish that every difference is limited to comments or non-semantic formatting.',
  ],
  [
    '20260909201500',
    'crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening',
    '20260910024912',
    'crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening',
    'Repository/native raw bytes differ. No trusted PostgreSQL/PL/pgSQL tokenizer is available to establish that every difference is limited to comments or non-semantic formatting.',
  ],
  [
    '20260915154800',
    'sales_catalog_clarity_repository_reconciliation',
    '20260915102211',
    'sales_catalog_clarity_repository_reconciliation',
    'Repository/native raw bytes differ. The repository file contains additional rollout-history comments, but no trusted PostgreSQL/PL/pgSQL tokenizer is available to prove that all executable SQL and function-body tokens are identical.',
  ],
];

export const nativeMigrationAliases = Object.freeze(activeAliasRows.map(([
  localVersion,
  name,
  nativeVersion,
  proof,
  contentSha256,
]) => Object.freeze({ localVersion, name, nativeVersion, proof, contentSha256 })));

export const historicalNativeMigrationAliases = Object.freeze(historicalAliasRows.map(([
  localVersion,
  name,
  nativeVersion,
]) => Object.freeze({ localVersion, name, nativeVersion })));

export const unresolvedNativeMigrationProvenance = Object.freeze(unresolvedRows.map(([
  localVersion,
  name,
  nativeCandidateVersion,
  nativeCandidateName,
  reason,
]) => Object.freeze({
  localVersion,
  name,
  nativeCandidateVersion,
  nativeCandidateName,
  reason,
})));

export function canonicalizeMigrationSourceForContentProof(source) {
  let normalized = String(source);
  if (normalized.startsWith('\uFEFF')) normalized = normalized.slice(1);
  normalized = normalized.replace(/\r\n/g, '\n');
  if (normalized.endsWith('\n')) normalized = normalized.slice(0, -1);
  return normalized;
}

export function migrationContentProofChecksum(source) {
  return createHash('sha256')
    .update(canonicalizeMigrationSourceForContentProof(source))
    .digest('hex');
}

export function validateNativeMigrationReconciliationConfig({
  activeAliases = nativeMigrationAliases,
  historicalAliases = historicalNativeMigrationAliases,
  unresolvedRows: unresolvedItems = unresolvedNativeMigrationProvenance,
} = {}) {
  const activeLocalVersions = new Set();
  const activeNativeVersions = new Set();
  const activeNames = new Set();

  for (const alias of activeAliases) {
    if (!/^\d{14}$/.test(alias.localVersion) || !/^\d{14}$/.test(alias.nativeVersion)) {
      throw new Error(`Invalid native migration reconciliation version for ${alias.name}.`);
    }
    if (!['NATIVE_EXACT', 'NATIVE_CONTENT_EQUIVALENT'].includes(alias.proof)) {
      throw new Error(`Invalid native migration reconciliation proof for ${alias.localVersion}_${alias.name}.`);
    }
    if (alias.proof === 'NATIVE_CONTENT_EQUIVALENT' && !/^[a-f0-9]{64}$/.test(alias.contentSha256 || '')) {
      throw new Error(`Missing deterministic content proof checksum for ${alias.localVersion}_${alias.name}.`);
    }
    if (alias.proof === 'NATIVE_EXACT' && alias.contentSha256 !== null) {
      throw new Error(`Exact native alias must not carry a content proof checksum: ${alias.localVersion}_${alias.name}.`);
    }
    if (!alias.name || activeLocalVersions.has(alias.localVersion)
        || activeNativeVersions.has(alias.nativeVersion) || activeNames.has(alias.name)) {
      throw new Error(`Duplicate or invalid native migration reconciliation alias: ${alias.localVersion}_${alias.name}.`);
    }
    activeLocalVersions.add(alias.localVersion);
    activeNativeVersions.add(alias.nativeVersion);
    activeNames.add(alias.name);
  }

  const historicalLocalVersions = new Set();
  const historicalNativeVersions = new Set();
  for (const alias of historicalAliases) {
    if (!/^\d{14}$/.test(alias.localVersion) || !/^\d{14}$/.test(alias.nativeVersion) || !alias.name) {
      throw new Error(`Invalid historical native migration alias: ${alias.localVersion}_${alias.name}.`);
    }
    if (historicalLocalVersions.has(alias.localVersion) || historicalNativeVersions.has(alias.nativeVersion)) {
      throw new Error(`Duplicate historical native migration alias: ${alias.localVersion}_${alias.name}.`);
    }
    if (activeLocalVersions.has(alias.localVersion)) {
      throw new Error(`Historical native migration alias is still executable: ${alias.localVersion}_${alias.name}.`);
    }
    historicalLocalVersions.add(alias.localVersion);
    historicalNativeVersions.add(alias.nativeVersion);
  }

  const unresolvedLocalVersions = new Set();
  for (const item of unresolvedItems) {
    if (!/^\d{14}$/.test(item.localVersion) || !/^\d{14}$/.test(item.nativeCandidateVersion)
        || !item.name || !item.nativeCandidateName) {
      throw new Error(`Invalid unresolved migration provenance row: ${item.localVersion}_${item.name}.`);
    }
    if (unresolvedLocalVersions.has(item.localVersion) || activeLocalVersions.has(item.localVersion)) {
      throw new Error(`Duplicate or executable unresolved migration provenance row: ${item.localVersion}_${item.name}.`);
    }
    unresolvedLocalVersions.add(item.localVersion);
  }
}

validateNativeMigrationReconciliationConfig();

const aliasByLocalVersion = new Map(nativeMigrationAliases.map(alias => [alias.localVersion, alias]));
const unresolvedByLocalVersion = new Map(
  unresolvedNativeMigrationProvenance.map(item => [item.localVersion, item]),
);
const supersessionByOldVersion = new Map(
  historicalForwardMigrationSupersessions.map(item => [item.oldVersion, item]),
);

function nativeSourceForContentProof(row) {
  if (!Array.isArray(row?.statements) || row.statements.length !== 1 || typeof row.statements[0] !== 'string') {
    return null;
  }
  return row.statements[0];
}

function nativeIndexes(nativeRows) {
  const byKey = new Map();
  const byName = new Map();
  const byVersion = new Map();
  for (const row of nativeRows) {
    const version = String(row.version);
    const name = String(row.name);
    byKey.set(`${version}:${name}`, row);
    const nameRows = byName.get(name) || [];
    nameRows.push(row);
    byName.set(name, nameRows);
    const versionRows = byVersion.get(version) || [];
    versionRows.push(row);
    byVersion.set(version, versionRows);
  }
  return { byKey, byName, byVersion };
}

function unresolvedRow(migration, reason, extra = {}) {
  return {
    migration,
    classification: 'UNRESOLVED_PROVENANCE',
    historicalClassification: 'HISTORICAL_PROVENANCE_UNRESOLVED',
    truthStatus: 'BLOCKED_UNRESOLVED',
    safeAction: 'BLOCK_UNRESOLVED',
    reason,
    ...extra,
  };
}

export function auditCurrentMigrationLineage({
  migrations,
  appliedByVersion,
  authoritativeBaseline,
  nativeRows,
  postconditionResults = new Map(),
}) {
  const indexes = nativeIndexes(nativeRows);
  const migrationByVersion = new Map(migrations.map(migration => [migration.version, migration]));
  const rows = [];

  for (const migration of migrations) {
    if (migration.version <= authoritativeBaseline) continue;

    if (appliedByVersion.has(migration.version)) {
      rows.push({
        migration,
        classification: 'CUSTOM_LEDGER_EXACT',
        truthStatus: 'APPLIED_EXACT',
        safeAction: 'NONE_ALREADY_RECORDED',
      });
      continue;
    }

    const blocked = unresolvedByLocalVersion.get(migration.version);
    if (blocked) {
      const supersession = supersessionByOldVersion.get(migration.version);
      if (migration.name !== blocked.name) {
        rows.push(unresolvedRow(
          migration,
          `Unresolved migration provenance name mismatch for ${migration.file}: expected ${blocked.name}.`,
          { blocked, supersession },
        ));
        continue;
      }
      if (!supersession) {
        rows.push(unresolvedRow(
          migration,
          `Unresolved migration provenance for ${migration.file}: ${blocked.reason} No approved forward supersession record exists. Refusing SQL execution.`,
          { blocked },
        ));
        continue;
      }
      if (migration.checksum !== supersession.oldRepositorySha256) {
        rows.push(unresolvedRow(
          migration,
          `Historical repository SHA drift for ${migration.file}: expected ${supersession.oldRepositorySha256}, found ${migration.checksum}. Refusing supersession and SQL execution.`,
          { blocked, supersession },
        ));
        continue;
      }

      const replacement = migrationByVersion.get(supersession.replacementVersion);
      if (!replacement
          || replacement.name !== supersession.replacementName
          || replacement.checksum !== supersession.replacementSha256) {
        rows.push(unresolvedRow(
          migration,
          `Approved forward replacement is missing or drifted for ${migration.file}: expected ${supersession.replacementVersion}_${supersession.replacementName} SHA-256 ${supersession.replacementSha256}.`,
          { blocked, supersession, replacement },
        ));
        continue;
      }

      const replacementLedgerRow = appliedByVersion.get(supersession.replacementVersion);
      if (!replacementLedgerRow
          || String(replacementLedgerRow.name || '') !== supersession.replacementName
          || String(replacementLedgerRow.checksum || '') !== supersession.replacementSha256) {
        rows.push(unresolvedRow(
          migration,
          `Historical provenance remains blocked until exact forward replacement ${replacement.file} is recorded in the custom ledger.`,
          { blocked, supersession, replacement, replacementLedgerRow },
        ));
        continue;
      }

      if (!mappedPostconditionsPass(supersession, postconditionResults)) {
        const failedPostconditions = supersession.postconditionIds.filter(
          id => postconditionResults?.get(id) !== true,
        );
        rows.push(unresolvedRow(
          migration,
          `Forward replacement ${replacement.file} is ledgered, but mapped postconditions are not all proven: ${failedPostconditions.join(', ')}.`,
          { blocked, supersession, replacement, replacementLedgerRow, failedPostconditions },
        ));
        continue;
      }

      rows.push({
        migration,
        blocked,
        supersession,
        replacement,
        replacementLedgerRow,
        classification: 'UNRESOLVED_PROVENANCE',
        historicalClassification: 'HISTORICAL_PROVENANCE_UNRESOLVED',
        truthStatus: 'SUPERSEDED_BY_FORWARD_RECONCILIATION',
        safeAction: 'NONE_SUPERSEDED_FORWARD_RECONCILIATION',
        reason: `Historical provenance remains unresolved; exact applied replacement ${replacement.file} and all mapped current-state postconditions are verified.`,
      });
      continue;
    }

    const alias = aliasByLocalVersion.get(migration.version);
    if (!alias) {
      rows.push({
        migration,
        classification: 'GENUINELY_PENDING_NEW',
        truthStatus: 'PENDING_NEW',
        safeAction: 'SAFE_NEW_APPLY_LATER',
      });
      continue;
    }

    if (migration.name !== alias.name) {
      rows.push(unresolvedRow(
        migration,
        `Native migration reconciliation name mismatch for ${migration.file}: expected ${alias.name}.`,
        { alias },
      ));
      continue;
    }

    const expectedKey = `${alias.nativeVersion}:${alias.name}`;
    const nativeRow = indexes.byKey.get(expectedKey);
    if (!nativeRow) {
      const atExpectedVersion = indexes.byVersion.get(alias.nativeVersion) || [];
      if (atExpectedVersion.length) {
        rows.push(unresolvedRow(
          migration,
          `Native migration history name mismatch for ${migration.file}: expected ${alias.nativeVersion}_${alias.name}, found ${atExpectedVersion.map(row => `${row.version}_${row.name}`).join(', ')}.`,
          { alias },
        ));
        continue;
      }
      const sameNameRows = indexes.byName.get(alias.name) || [];
      if (sameNameRows.length) {
        rows.push(unresolvedRow(
          migration,
          `Native migration history mismatch for ${migration.file}: expected ${alias.nativeVersion}_${alias.name}, found ${sameNameRows.map(row => `${row.version}_${row.name}`).join(', ')}.`,
          { alias },
        ));
        continue;
      }
      rows.push(unresolvedRow(
        migration,
        `Audited native migration evidence is missing for ${migration.file}: expected ${alias.nativeVersion}_${alias.name}. Refusing SQL execution.`,
        { alias },
      ));
      continue;
    }

    if (alias.proof === 'NATIVE_CONTENT_EQUIVALENT') {
      const localProof = migrationContentProofChecksum(migration.source);
      if (localProof !== alias.contentSha256) {
        rows.push(unresolvedRow(
          migration,
          `Current repository content changed for audited content-proof migration ${migration.file}: expected canonical SHA-256 ${alias.contentSha256}, found ${localProof}.`,
          { alias, nativeRow },
        ));
        continue;
      }
      const nativeSource = nativeSourceForContentProof(nativeRow);
      if (nativeSource === null) {
        rows.push(unresolvedRow(
          migration,
          `Native statement representation is not deterministically comparable for ${migration.file}; expected exactly one stored SQL statement.`,
          { alias, nativeRow },
        ));
        continue;
      }
      const nativeProof = migrationContentProofChecksum(nativeSource);
      if (nativeProof !== alias.contentSha256) {
        rows.push(unresolvedRow(
          migration,
          `Native content proof mismatch for ${migration.file}: expected canonical SHA-256 ${alias.contentSha256}, found ${nativeProof}.`,
          { alias, nativeRow },
        ));
        continue;
      }
    }

    rows.push({
      migration,
      alias,
      nativeRow,
      classification: alias.proof,
      truthStatus: 'RECONCILED_FROM_NATIVE',
      safeAction: alias.proof === 'NATIVE_EXACT'
        ? 'RECONCILE_FROM_NATIVE_EXACT'
        : 'RECONCILE_FROM_NATIVE_CONTENT_PROOF',
    });
  }

  return rows;
}

export function planNativeMigrationReconciliation(options) {
  const rows = auditCurrentMigrationLineage(options);
  const blocked = rows.filter(row => row.safeAction === 'BLOCK_UNRESOLVED');
  if (blocked.length) {
    throw new Error(blocked.map(row => row.reason).join(' | '));
  }
  return {
    reconciled: rows
      .filter(row => row.safeAction === 'RECONCILE_FROM_NATIVE_EXACT'
        || row.safeAction === 'RECONCILE_FROM_NATIVE_CONTENT_PROOF')
      .map(row => ({
        migration: row.migration,
        alias: row.alias,
        classification: row.classification,
        truthStatus: row.truthStatus,
      })),
    superseded: rows
      .filter(row => row.truthStatus === 'SUPERSEDED_BY_FORWARD_RECONCILIATION'),
    pending: rows
      .filter(row => row.safeAction === 'SAFE_NEW_APPLY_LATER')
      .map(row => row.migration),
    rows,
  };
}

export function planForwardMigrationConvergence(options) {
  const {
    migrations,
    appliedByVersion,
    authoritativeBaseline,
    nativeRows,
    postconditionResults = new Map(),
  } = options;

  const registryAudit = validateForwardMigrationSupersessionRegistry({ migrations });
  const rows = auditCurrentMigrationLineage({
    migrations,
    appliedByVersion,
    authoritativeBaseline,
    nativeRows,
    postconditionResults,
  });
  const allowedReplacementVersions = new Set(PART10B6_FORWARD_REPLACEMENT_VERSIONS);

  const unrelatedPending = rows.filter(
    row => row.truthStatus === 'PENDING_NEW'
      && !allowedReplacementVersions.has(row.migration.version),
  );
  if (unrelatedPending.length) {
    throw new Error(
      `Forward convergence refuses unrelated pending migrations: ${unrelatedPending.map(row => row.migration.file).join(', ')}.`,
    );
  }

  const unapprovedBlocked = rows.filter(
    row => row.truthStatus === 'BLOCKED_UNRESOLVED' && !row.supersession,
  );
  if (unapprovedBlocked.length) {
    throw new Error(
      `Forward convergence found unresolved migration(s) without an approved supersession: ${unapprovedBlocked.map(row => row.migration.file).join(', ')}.`,
    );
  }

  for (const record of registryAudit.records) {
    const replacementLedgerRow = appliedByVersion.get(record.replacementVersion);
    if (replacementLedgerRow && !mappedPostconditionsPass(record, postconditionResults)) {
      const failed = record.postconditionIds.filter(id => postconditionResults.get(id) !== true);
      throw new Error(
        `Applied forward replacement ${record.replacementVersion}_${record.replacementName} has failing/unproven postconditions: ${failed.join(', ')}.`,
      );
    }
  }

  const migrationByVersion = new Map(migrations.map(migration => [migration.version, migration]));
  const pendingReplacements = [];
  for (const version of PART10B6_FORWARD_REPLACEMENT_VERSIONS) {
    const migration = migrationByVersion.get(version);
    if (!migration) throw new Error(`Approved forward replacement ${version} is missing.`);
    if (!appliedByVersion.has(version)) {
      const row = rows.find(item => item.migration.version === version);
      if (!row || row.truthStatus !== 'PENDING_NEW') {
        throw new Error(
          `Approved forward replacement ${migration.file} is not a clean PENDING_NEW migration.`,
        );
      }
      pendingReplacements.push(migration);
    }
  }

  return {
    pendingReplacements,
    rows,
    registryAudit,
  };
}


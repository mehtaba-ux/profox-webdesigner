const aliasRows = [
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
  ['20260916121000', 'crm_sales_final_quotation_send_gate_part10b_foundation', '20260916063249'],
  ['20260916123500', 'crm_sales_final_send_snapshot_forge_hardening', '20260916070047'],
  ['20260916124500', 'crm_sales_final_send_assertion_privilege_hardening', '20260916070455'],
  ['20260916150000', 'crm_sales_catalog_v1', '20260916093503'],
  ['20260916174500', 'crm_sales_catalog_v1_catalog_id_compatibility', '20260916114854'],
  ['20260916175000', 'crm_sales_catalog_v1_trigger_search_path_repair', '20260916120501'],
  ['20260916175500', 'crm_sales_catalog_v1_quotation_items_column_grants', '20260916123003'],
  ['20260916194500', 'lock_down_anonymous_tracking_and_acquisition_rls', '20260916141139'],
  ['20260916195500', 'require_admin_specialist_invites_and_partner_callbacks', '20260916143101'],
  ['20260916210000', 'security_linter_hardening', '20260916153027'],
];

export const nativeMigrationAliases = Object.freeze(aliasRows.map(([localVersion, name, nativeVersion]) => Object.freeze({
  localVersion,
  name,
  nativeVersion,
})));

function validateAliases() {
  const localVersions = new Set();
  const nativeVersions = new Set();
  const names = new Set();
  for (const alias of nativeMigrationAliases) {
    if (!/^\d{14}$/.test(alias.localVersion) || !/^\d{14}$/.test(alias.nativeVersion)) {
      throw new Error(`Invalid native migration reconciliation version for ${alias.name}.`);
    }
    if (!alias.name || localVersions.has(alias.localVersion) || nativeVersions.has(alias.nativeVersion) || names.has(alias.name)) {
      throw new Error(`Duplicate or invalid native migration reconciliation alias: ${alias.localVersion}_${alias.name}.`);
    }
    localVersions.add(alias.localVersion);
    nativeVersions.add(alias.nativeVersion);
    names.add(alias.name);
  }
}

validateAliases();

const aliasByLocalVersion = new Map(nativeMigrationAliases.map(alias => [alias.localVersion, alias]));

export function planNativeMigrationReconciliation({ migrations, appliedByVersion, authoritativeBaseline, nativeRows }) {
  const nativeKeys = new Set(nativeRows.map(row => `${String(row.version)}:${String(row.name)}`));
  const nativeVersionsByName = new Map();
  for (const row of nativeRows) {
    const name = String(row.name);
    const versions = nativeVersionsByName.get(name) || [];
    versions.push(String(row.version));
    nativeVersionsByName.set(name, versions);
  }

  const reconciled = [];
  const pending = [];

  for (const migration of migrations) {
    if (migration.version <= authoritativeBaseline || appliedByVersion.has(migration.version)) continue;

    const alias = aliasByLocalVersion.get(migration.version);
    if (!alias) {
      pending.push(migration);
      continue;
    }
    if (migration.name !== alias.name) {
      throw new Error(
        `Native migration reconciliation name mismatch for ${migration.file}: expected ${alias.name}.`,
      );
    }

    const expectedKey = `${alias.nativeVersion}:${alias.name}`;
    if (nativeKeys.has(expectedKey)) {
      reconciled.push({ migration, alias });
      continue;
    }

    const sameNameVersions = nativeVersionsByName.get(alias.name) || [];
    if (sameNameVersions.length) {
      throw new Error(
        `Native migration history mismatch for ${migration.file}: expected ${alias.nativeVersion}_${alias.name}, found ${sameNameVersions.join(', ')}.`,
      );
    }

    // No native migration with this audited logical name exists. This is a genuinely
    // pending migration for this database, so the normal transactional apply path remains authoritative.
    pending.push(migration);
  }

  return { reconciled, pending };
}

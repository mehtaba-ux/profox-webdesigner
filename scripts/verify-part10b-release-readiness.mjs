import dotenv from 'dotenv';
import pg from 'pg';
import { auditAppliedMigrationLedger, loadMigrationManifest } from './migration-manifest.mjs';
import { auditCurrentMigrationLineage } from './native-migration-reconciliation.mjs';

dotenv.config({ path: '.env.local', quiet: true });

const connectionString = String(process.env.SUPABASE_DB_URL || '').trim();
if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  throw new Error('SUPABASE_DB_URL is required for Part 10B production release verification.');
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  application_name: 'profox-part10b-release-readiness-verifier',
});

const failures = [];
const warnings = [];
const pass = (label, detail) => console.log(`PASS  ${label}: ${detail}`);
const fail = (label, detail) => { failures.push(`${label}: ${detail}`); console.error(`FAIL  ${label}: ${detail}`); };
const warn = (label, detail) => { warnings.push(`${label}: ${detail}`); console.warn(`WARN  ${label}: ${detail}`); };

try {
  const migrations = await loadMigrationManifest();

  await client.connect();
  await client.query('begin read only');

  const stateRows = (await client.query(`
    select baseline_version
    from profox_migrations.state
    where singleton=true
  `)).rows;
  if (stateRows.length !== 1) {
    fail('Production migration baseline', `expected exactly one authoritative state row, found ${stateRows.length}`);
  }
  const authoritativeBaseline = String(stateRows[0]?.baseline_version || '');

  const appliedRows = (await client.query(`
    select version,name,checksum,baseline
    from profox_migrations.applied_migrations
    order by version
  `)).rows;
  const ledgerAudit = auditAppliedMigrationLedger({
    migrations,
    appliedRows,
    requireAllApplied: false,
  });

  if (ledgerAudit.issues.length) {
    fail('Production migration ledger integrity', ledgerAudit.issues.join(' | '));
  } else {
    pass(
      'Production migration ledger integrity',
      `${appliedRows.length} recorded migration row(s) match current repository version, logical name and SHA-256`,
    );
  }

  const untrackedHistorical = authoritativeBaseline
    ? migrations.filter(migration => migration.version <= authoritativeBaseline
      && !ledgerAudit.appliedByVersion.has(migration.version))
    : [];
  if (untrackedHistorical.length) {
    fail(
      'Production migration baseline coverage',
      `${untrackedHistorical.length} current historical migration(s) through baseline ${authoritativeBaseline} are untracked: ${untrackedHistorical.map(item => item.file).join(', ')}`,
    );
  } else if (authoritativeBaseline) {
    pass('Production migration baseline coverage', `current repository history is tracked through ${authoritativeBaseline}`);
  }

  const nativeRows = (await client.query(`
    select version,name,statements
    from supabase_migrations.schema_migrations
    order by version
  `)).rows;
  const lineageRows = authoritativeBaseline
    ? auditCurrentMigrationLineage({
      migrations,
      appliedByVersion: ledgerAudit.appliedByVersion,
      authoritativeBaseline,
      nativeRows,
    })
    : [];

  const customExact = lineageRows.filter(row => row.classification === 'CUSTOM_LEDGER_EXACT');
  const nativeExact = lineageRows.filter(row => row.classification === 'NATIVE_EXACT');
  const nativeContent = lineageRows.filter(row => row.classification === 'NATIVE_CONTENT_EQUIVALENT');
  const pending = lineageRows.filter(row => row.classification === 'GENUINELY_PENDING_NEW');
  const unresolved = lineageRows.filter(row => row.classification === 'UNRESOLVED_PROVENANCE');

  if (unresolved.length) {
    fail(
      'Current repository migration lineage',
      `${unresolved.length} current post-baseline migration(s) have unresolved provenance and are blocked from execution: ${unresolved.map(row => `${row.migration.file} (${row.reason})`).join(' | ')}`,
    );
  } else if (pending.length) {
    fail(
      'Current repository migration lineage',
      `${pending.length} genuinely new current migration(s) remain unapplied: ${pending.map(row => row.migration.file).join(', ')}`,
    );
  } else {
    pass(
      'Current repository migration lineage',
      `${lineageRows.length} post-baseline current migration(s): custom exact ${customExact.length}, native exact ${nativeExact.length}, native content-equivalent ${nativeContent.length}, unresolved 0, pending 0`,
    );
  }

  const foundation = (await client.query(`
    with policy as (
      select config_value
      from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
    )
    select
      coalesce((select (config_value->>'finalQuotationSendGateActive')::boolean from policy),false) as gate_active,
      coalesce((select (config_value->>'policyVersion')::int from policy),0) as policy_version,
      coalesce((select (config_value->>'snapshotSchemaVersion')::int from policy),0) as snapshot_schema_version,
      (select count(*)::int from information_schema.columns
       where table_schema='public' and table_name='quotations'
         and column_name in ('sales_scope_snapshot','sales_scope_snapshot_at','sales_scope_snapshot_schema_version')) as snapshot_columns,
      (select count(*)::int from pg_proc where oid=to_regprocedure('public.crm_assert_quotation_send_ready(uuid)')) as assert_count,
      (select count(*)::int from pg_proc where oid=to_regprocedure('public.crm_capture_quotation_sales_scope_snapshot(uuid)')) as capture_count,
      (select count(*)::int from pg_proc where oid=to_regprocedure('public.crm_get_quotation_sales_reconciliation(uuid)')) as reconciliation_count,
      (select count(*)::int from pg_proc where oid=to_regprocedure('public.crm_build_quotation_sales_scope_snapshot(uuid)')) as snapshot_builder_count,
      coalesce(has_function_privilege('anon',to_regprocedure('public.crm_assert_quotation_send_ready(uuid)'),'EXECUTE'),false) as anon_can_assert,
      coalesce(has_function_privilege('anon',to_regprocedure('public.crm_capture_quotation_sales_scope_snapshot(uuid)'),'EXECUTE'),false) as anon_can_capture,
      coalesce(has_function_privilege('authenticated',to_regprocedure('public.crm_assert_quotation_send_ready(uuid)'),'EXECUTE'),false) as authenticated_can_assert,
      coalesce(has_function_privilege('authenticated',to_regprocedure('public.crm_capture_quotation_sales_scope_snapshot(uuid)'),'EXECUTE'),false) as authenticated_can_capture,
      coalesce(has_function_privilege('service_role',to_regprocedure('public.crm_assert_quotation_send_ready(uuid)'),'EXECUTE'),false) as service_role_can_assert,
      coalesce(has_function_privilege('service_role',to_regprocedure('public.crm_capture_quotation_sales_scope_snapshot(uuid)'),'EXECUTE'),false) as service_role_can_capture,
      coalesce(pg_get_functiondef(to_regprocedure('public.protect_quotation_transition()')),'') as transition_definition
  `)).rows[0];

  if (foundation.policy_version === 2 && foundation.snapshot_schema_version === 2) {
    pass('Part 10B policy contract', 'policy version 2 and snapshot schema version 2 are installed');
  } else {
    fail('Part 10B policy contract', `policy version ${foundation.policy_version}, snapshot schema version ${foundation.snapshot_schema_version}`);
  }

  if (foundation.snapshot_columns === 3) {
    pass('Part 10B snapshot columns', 'all three immutable Send-time snapshot columns are present');
  } else {
    fail('Part 10B snapshot columns', `${foundation.snapshot_columns}/3 required quotation snapshot columns are present`);
  }

  const functionCounts = [
    ['assertion', foundation.assert_count],
    ['capture', foundation.capture_count],
    ['reconciliation', foundation.reconciliation_count],
    ['snapshot builder', foundation.snapshot_builder_count],
  ];
  const invalidFunctionCounts = functionCounts.filter(([, count]) => count !== 1);
  if (invalidFunctionCounts.length === 0) {
    pass('Part 10B canonical functions', 'assertion, capture, reconciliation and snapshot builder each exist exactly once');
  } else {
    fail('Part 10B canonical functions', invalidFunctionCounts.map(([name, count]) => `${name}=${count}`).join(', '));
  }

  if (!foundation.anon_can_assert && !foundation.anon_can_capture
      && !foundation.authenticated_can_assert && !foundation.authenticated_can_capture
      && foundation.service_role_can_assert && foundation.service_role_can_capture) {
    pass('Part 10B internal function ACLs', 'browser roles cannot assert/capture; service_role retains internal execution');
  } else {
    fail(
      'Part 10B internal function ACLs',
      `anon assert/capture=${foundation.anon_can_assert}/${foundation.anon_can_capture}; authenticated assert/capture=${foundation.authenticated_can_assert}/${foundation.authenticated_can_capture}; service_role assert/capture=${foundation.service_role_can_assert}/${foundation.service_role_can_capture}`,
    );
  }

  const definition = String(foundation.transition_definition || '').toLowerCase();
  const captureAt = definition.indexOf('crm_capture_quotation_sales_scope_snapshot');
  const adminAt = definition.indexOf('if public.is_admin()');
  const atomicAt = definition.indexOf("if v_atomic='1'");
  if (captureAt >= 0 && adminAt > captureAt && atomicAt > captureAt) {
    pass('Part 10B universal Sent transition ordering', 'active-gate capture occurs before Admin and atomic-RPC early returns');
  } else {
    fail('Part 10B universal Sent transition ordering', 'protect_quotation_transition() no longer proves capture before Admin/atomic early returns');
  }

  if (foundation.gate_active === true) {
    pass('Part 10B final Send gate', 'ACTIVE; server-side foundation is structurally ready');
  } else {
    warn('Part 10B final Send gate', 'STAGED / NOT ACTIVE; keep activation blocked until compatible production deployment and authenticated Seller/Admin resolution QA are proven');
  }

  const counts = (await client.query(`
    select
      (select count(*)::int from public.crm_sales_scope_conditions) as scope_conditions,
      (select count(*)::int from public.crm_sales_promises) as promises,
      (select count(*)::int from public.quotation_sales_coverage) as sales_coverage,
      (select count(*)::int from public.quotations where sales_scope_snapshot is not null) as captured_sales_snapshots,
      (select count(*)::int from public.quotations where status='Sent' and sales_scope_snapshot is null) as legacy_sent_without_snapshot
  `)).rows[0];
  pass(
    'Part 10B production data inventory',
    `Scope Conditions ${counts.scope_conditions}; Promises ${counts.promises}; Coverage ${counts.sales_coverage}; captured snapshots ${counts.captured_sales_snapshots}; legacy Sent without snapshot ${counts.legacy_sent_without_snapshot}`,
  );

  await client.query('rollback');
} catch (error) {
  try { await client.query('rollback'); } catch {}
  throw error;
} finally {
  await client.end();
}

console.log(`\nPart 10B release readiness: ${failures.length} failure(s), ${warnings.length} warning(s).`);
if (failures.length > 0) process.exitCode = 1;

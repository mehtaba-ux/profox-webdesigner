import dotenv from 'dotenv';
import pg from 'pg';
import { auditAppliedMigrationLedger, loadMigrationManifest } from './migration-manifest.mjs';

dotenv.config({ path: '.env.local', quiet: true });

const VERSION = '20260921110000';
const NAME = 'crm_manager_exception_workspace_part_14';
const connectionString = String(process.env.SUPABASE_DB_URL || '').trim();
if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  throw new Error('SUPABASE_DB_URL is required for Part 14 production release verification.');
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  application_name: 'profox-part14-release-readiness-verifier',
});

const failures = [];
const pass = (label, detail) => console.log(`PASS  ${label}: ${detail}`);
const fail = (label, detail) => {
  failures.push(`${label}: ${detail}`);
  console.error(`FAIL  ${label}: ${detail}`);
};

try {
  const migrations = await loadMigrationManifest();
  const migration = migrations.find(item => item.version === VERSION && item.name === NAME);
  if (!migration) throw new Error(`Repository migration ${VERSION}_${NAME} is missing.`);

  await client.connect();
  await client.query('begin read only');

  const appliedRows = (await client.query(`
    select version,name,checksum,baseline
    from profox_migrations.applied_migrations
    order by version
  `)).rows;
  const audit = auditAppliedMigrationLedger({ migrations, appliedRows, requireAllApplied: false });
  if (audit.issues.length) fail('Production migration ledger integrity', audit.issues.join(' | '));
  else pass('Production migration ledger integrity', `${appliedRows.length} exact custom-ledger row(s)`);

  const rows = appliedRows.filter(row => String(row.version) === VERSION);
  if (rows.length === 1 && rows[0].name === NAME && rows[0].checksum === migration.checksum && rows[0].baseline === false) {
    pass('Part 14 migration identity', `${VERSION}_${NAME} · ${migration.checksum}`);
  } else {
    fail('Part 14 migration identity', `expected one exact non-baseline row; found ${JSON.stringify(rows)}`);
  }

  const state = (await client.query(`
    with policy as (
      select config_value
      from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
    ),
    funcs as (
      select
        count(*) filter(where p.proname='crm_get_manager_exception_workspace')::int part14_count,
        count(*) filter(where p.proname='crm_get_pipeline_command_center')::int pipeline_count,
        count(*) filter(where p.proname='crm_get_sales_work_queue')::int work_queue_count,
        count(*) filter(where p.proname='crm_get_sales_gate_assessment')::int readiness_count,
        count(*) filter(where p.proname='crm_get_sales_validation_queue')::int validation_queue_count,
        count(*) filter(where p.proname='get_quotation_approval_requests')::int approval_queue_count,
        count(*) filter(where p.proname='crm_record_negotiation_decision_state')::int part11_count,
        count(*) filter(where p.proname='verify_payment_atomic')::int part12_count,
        count(*) filter(where p.proname='project_get_sales_handoff_brief')::int part13_brief_count,
        count(*) filter(where p.proname='accept_sales_project_handover')::int part13_accept_count,
        count(*) filter(where p.proname='return_sales_project_handover')::int part13_return_count
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
    )
    select
      (select (config_value->>'finalQuotationSendGateActive')::boolean from policy) gate_active,
      (select (config_value->>'policyVersion')::int from policy) policy_version,
      (select (config_value->>'snapshotSchemaVersion')::int from policy) snapshot_schema_version,
      funcs.*,
      (select count(*)::int from information_schema.tables
       where table_schema='public'
       and table_name in ('crm_manager_exceptions','sales_exception_records','manager_approval_items','exception_statuses','manager_tasks_v2')) forbidden_table_count,
      (select count(*)::int from public.crm_sales_validations) validation_count,
      (select count(*)::int from public.project_sales_handover_attempts where status='RETURNED_TO_SALES') returned_handoff_count,
      (select count(*)::int from public.quotations
       where approval_requested_at is not null
         and ((status='Ready for Approval' and approval_decision='pending') or approval_decision='changes_requested')) approval_attention_count,
      (select count(*)::int from public.crm_sales_promises where record_state='ACTIVE' and source_type<>'INTERNAL_DRAFT') active_material_promise_count,
      (select count(*)::int from public.crm_opportunities o
       where o.archived_at is null and o.status='Open'
         and not exists (
           select 1 from public.crm_activities a
           where a.opportunity_id=o.id and a.status='Scheduled'
         )) open_opportunities_missing_scheduled_action,
      (select count(*)::int from public.projects where stage='Sales Handover') sales_handover_projects,
      (select count(*)::int from public.project_sales_handover_attempts) handoff_attempt_count
    from funcs;
  `)).rows[0];

  if (state.gate_active === true && Number(state.policy_version) === 2 && Number(state.snapshot_schema_version) === 2) {
    pass('Part 10B preservation', 'finalQuotationSendGateActive=true · policyVersion=2 · snapshotSchemaVersion=2');
  } else fail('Part 10B preservation', JSON.stringify(state));

  const requiredFunctions = {
    part14: state.part14_count,
    pipeline: state.pipeline_count,
    workQueue: state.work_queue_count,
    readiness: state.readiness_count,
    validationQueue: state.validation_queue_count,
    approvalQueue: state.approval_queue_count,
    part11: state.part11_count,
    part12: state.part12_count,
    part13Brief: state.part13_brief_count,
    part13Accept: state.part13_accept_count,
    part13Return: state.part13_return_count,
  };
  const missingFunctions = Object.entries(requiredFunctions).filter(([,value]) => Number(value) !== 1);
  if (missingFunctions.length) fail('Canonical Part 11–14 functions', JSON.stringify(missingFunctions));
  else pass('Canonical Part 11–14 functions', 'all expected canonical functions exist exactly once');

  if (Number(state.forbidden_table_count) === 0) pass('No duplicate exception truth table', '0 prohibited Part 14 business tables');
  else fail('No duplicate exception truth table', `${state.forbidden_table_count} prohibited table(s) found`);

  const functionRow = (await client.query(`
    select p.oid,p.prosecdef,p.provolatile,p.proconfig,
           has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
           has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec,
           pg_get_functiondef(p.oid) definition
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='crm_get_manager_exception_workspace'
  `)).rows[0];

  if (
    functionRow
    && functionRow.prosecdef === true
    && functionRow.provolatile === 's'
    && functionRow.anon_exec === false
    && functionRow.auth_exec === true
    && Array.isArray(functionRow.proconfig)
    && functionRow.proconfig.some(value => String(value).startsWith('search_path='))
  ) pass('Part 14 RPC security contract', 'STABLE SECURITY DEFINER; fixed search_path; anon denied; authenticated entry with internal Admin authorization');
  else fail('Part 14 RPC security contract', JSON.stringify(functionRow));

  const def = String(functionRow?.definition || '');
  for (const [label,pattern,expected] of [
    ['Admin-only authorization', /Manager Exception Workspace access denied/i, true],
    ['Canonical Pipeline reuse', /crm_get_pipeline_command_center\(\)/i, true],
    ['Canonical Sales work queue reuse', /crm_get_sales_work_queue\('team','all',500\)/i, true],
    ['Proposal Readiness reuse', /crm_get_sales_gate_assessment/i, true],
    ['Validation source authorization', /crm_sales_validation_reviewer_eligible/i, true],
    ['Quotation approval authorization', /quotation_approval_reviewer_authorized/i, true],
    ['Part 13 returned handoff source', /RETURNED_TO_SALES/i, true],
    ['Generic BI feed not embedded', /get_business_intelligence_exceptions/i, false],
    ['No source INSERT', /\binsert\s+into\b/i, false],
    ['No source UPDATE', /\bupdate\s+public\./i, false],
    ['No source DELETE', /\bdelete\s+from\b/i, false],
  ]) {
    const found = pattern.test(def);
    if (found === expected) pass(label, expected ? 'present' : 'absent as required');
    else fail(label, expected ? 'expected source contract is missing' : 'forbidden behavior found');
  }

  const adminRow = (await client.query(`
    select id
    from public.user_profiles
    where role='admin' and status='active'
    order by created_at
    limit 1
  `)).rows[0];
  if (!adminRow?.id) throw new Error('No active Admin is available for read-only Part 14 verification.');

  await client.query(
    `select set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated')::text,true)`,
    [adminRow.id],
  );

  const workspace = (await client.query(`
    select public.crm_get_manager_exception_workspace('all','',null,100,0) result
  `)).rows[0]?.result;
  if (!workspace || !Array.isArray(workspace.items)) fail('Part 14 workspace response', 'RPC did not return an item array');
  else {
    pass('Part 14 workspace response', `${workspace.total} current source-derived exception(s)`);
    if (workspace.authority === 'ADMIN_ONLY' && workspace.resolutionPolicy === 'SOURCE_DERIVED') {
      pass('Part 14 authority/resolution policy', 'ADMIN_ONLY · SOURCE_DERIVED');
    } else fail('Part 14 authority/resolution policy', JSON.stringify({ authority: workspace.authority, resolutionPolicy: workspace.resolutionPolicy }));

    const keys = workspace.items.map(item => item.exceptionKey);
    const duplicates = keys.filter((key,index) => keys.indexOf(key) !== index);
    if (duplicates.length === 0) pass('Stable-key deduplication', 'no duplicate exceptionKey values');
    else fail('Stable-key deduplication', JSON.stringify(duplicates));

    const invalidActions = workspace.items.filter(item => !String(item.actionUrl || '').startsWith('/admin/') || !String(item.actionLabel || '').startsWith('Open '));
    if (invalidActions.length === 0) pass('Canonical remediation routing', 'all visible items use Open … actions under /admin/');
    else fail('Canonical remediation routing', JSON.stringify(invalidActions.map(item => item.exceptionKey)));

    const serialized = JSON.stringify(workspace).toLowerCase();
    const forbiddenSecrets = ['provider_payment_id','customer_view_token_hash','access_token','refresh_token','private_key','api_secret','service_role'];
    const exposed = forbiddenSecrets.filter(value => serialized.includes(value));
    if (exposed.length === 0) pass('Safe aggregate metadata', 'no forbidden secret/provider field names exposed');
    else fail('Safe aggregate metadata', exposed.join(', '));

    const typeCount = type => workspace.items.filter(item => item.exceptionType === type).length;
    if (Number(state.validation_count) === 0 && typeCount('SALES_VALIDATION_PENDING') + typeCount('SALES_VALIDATION_STALE') !== 0) {
      fail('Zero-state Sales Validation semantics', 'validation exception rendered with 0 canonical validations');
    } else pass('Zero-state Sales Validation semantics', `source=${state.validation_count}; workspace=${typeCount('SALES_VALIDATION_PENDING') + typeCount('SALES_VALIDATION_STALE')}`);

    if (Number(state.returned_handoff_count) === 0 && typeCount('HANDOFF_RETURNED_TO_SALES') !== 0) {
      fail('Part 13 returned-handoff semantics', 'returned exception rendered with 0 canonical returned handoffs');
    } else pass('Part 13 returned-handoff semantics', `source=${state.returned_handoff_count}; workspace=${typeCount('HANDOFF_RETURNED_TO_SALES')}`);

    if (Number(state.approval_attention_count) === 0 && typeCount('QUOTATION_APPROVAL_PENDING') + typeCount('QUOTATION_CHANGES_REQUESTED') !== 0) {
      fail('Quotation approval zero-state semantics', 'approval exception rendered without canonical approval attention state');
    } else pass('Quotation approval zero-state semantics', `source=${state.approval_attention_count}; workspace=${typeCount('QUOTATION_APPROVAL_PENDING') + typeCount('QUOTATION_CHANGES_REQUESTED')}`);

    if (Number(state.open_opportunities_missing_scheduled_action) === 0 && typeCount('NEXT_ACTION_MISSING') !== 0) {
      fail('Part 11 missing-next-action semantics', 'missing-next-action exception rendered while all open opportunities have Scheduled opportunity activity');
    } else pass('Part 11 missing-next-action semantics', `sourceMissing=${state.open_opportunities_missing_scheduled_action}; workspace=${typeCount('NEXT_ACTION_MISSING')}`);
  }

  const part12Guard = (await client.query(`
    select pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='protect_payment_verification_fields'
  `)).rows[0]?.definition || '';
  if (/provider_payment_id/i.test(part12Guard) && /paid_at/i.test(part12Guard)) {
    pass('Part 12 settlement evidence preservation', 'provider_payment_id and paid_at remain protected');
  } else fail('Part 12 settlement evidence preservation', 'settlement evidence guard missing');

  const part13Guard = (await client.query(`
    select pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='protect_project_stage_workflow'
  `)).rows[0]?.definition || '';
  if (/Delivery must accept the Sales handoff before Content can begin/i.test(part13Guard)) {
    pass('Part 13 Content gate preservation', 'accepted Sales handoff still required before Content');
  } else fail('Part 13 Content gate preservation', 'accepted handoff gate missing');

  pass('Part 14 production source inventory', `validations ${state.validation_count}; returned handoffs ${state.returned_handoff_count}; approval attention ${state.approval_attention_count}; active material promises ${state.active_material_promise_count}; Sales Handover projects ${state.sales_handover_projects}; handoff attempts ${state.handoff_attempt_count}`);

  await client.query('rollback');
} catch (error) {
  try { await client.query('rollback'); } catch {}
  throw error;
} finally {
  await client.end();
}

console.log(`\nPart 14 release readiness: ${failures.length} failure(s).`);
if (failures.length > 0) process.exitCode = 1;

import dotenv from 'dotenv';
import pg from 'pg';
import { auditAppliedMigrationLedger, loadMigrationManifest } from './migration-manifest.mjs';

dotenv.config({ path: '.env.local', quiet: true });

const CORE_VERSION = '20260920181000';
const CORE_NAME = 'crm_sales_delivery_handoff_part_13';
const VISIBILITY_VERSION = '20260920181100';
const VISIBILITY_NAME = 'crm_sales_delivery_handoff_lifecycle_visibility_part_13';

const connectionString = String(process.env.SUPABASE_DB_URL || '').trim();
if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  throw new Error('SUPABASE_DB_URL is required for Part 13 production release verification.');
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  application_name: 'profox-part13-release-readiness-verifier',
});

const failures = [];
const pass = (label, detail) => console.log(`PASS  ${label}: ${detail}`);
const fail = (label, detail) => {
  failures.push(`${label}: ${detail}`);
  console.error(`FAIL  ${label}: ${detail}`);
};

try {
  const migrations = await loadMigrationManifest();
  const coreMigration = migrations.find(item => item.version === CORE_VERSION && item.name === CORE_NAME);
  const visibilityMigration = migrations.find(item => item.version === VISIBILITY_VERSION && item.name === VISIBILITY_NAME);
  if (!coreMigration) throw new Error(`Repository migration ${CORE_VERSION}_${CORE_NAME} is missing.`);
  if (!visibilityMigration) throw new Error(`Repository migration ${VISIBILITY_VERSION}_${VISIBILITY_NAME} is missing.`);

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

  for (const [version,name,migration,label] of [
    [CORE_VERSION,CORE_NAME,coreMigration,'Part 13 core migration identity'],
    [VISIBILITY_VERSION,VISIBILITY_NAME,visibilityMigration,'Part 13 lifecycle visibility migration identity'],
  ]) {
    const rows = appliedRows.filter(row => String(row.version) === version);
    if (rows.length === 1 && rows[0].name === name && rows[0].checksum === migration.checksum && rows[0].baseline === false) {
      pass(label, `${version}_${name} · ${migration.checksum}`);
    } else {
      fail(label, `expected one exact non-baseline row; found ${JSON.stringify(rows)}`);
    }
  }

  const state = (await client.query(`
    with policy as (
      select config_value
      from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
    ),
    funcs as (
      select
        count(*) filter (where proname='project_get_sales_handoff_brief')::int as brief_count,
        count(*) filter (where proname='project_get_sales_handoff_readiness')::int as readiness_count,
        count(*) filter (where proname='submit_sales_project_handover')::int as submit_count,
        count(*) filter (where proname='accept_sales_project_handover')::int as accept_count,
        count(*) filter (where proname='return_sales_project_handover')::int as return_count,
        count(*) filter (where proname='protect_project_task_integrity')::int as task_guard_count,
        count(*) filter (where proname='protect_project_stage_workflow')::int as stage_guard_count,
        count(*) filter (where proname='crm_record_negotiation_decision_state')::int as part11_count,
        count(*) filter (where proname='verify_payment_atomic')::int as part12_count
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
    )
    select
      (select (config_value->>'finalQuotationSendGateActive')::boolean from policy) gate_active,
      (select (config_value->>'policyVersion')::int from policy) policy_version,
      (select (config_value->>'snapshotSchemaVersion')::int from policy) snapshot_schema_version,
      funcs.*,
      (select count(*)::int from information_schema.tables where table_schema='public' and table_name='project_sales_handover_attempts') lifecycle_table_count,
      (select relrowsecurity from pg_class where oid='public.project_sales_handover_attempts'::regclass) lifecycle_rls,
      (select count(*)::int from pg_policies where schemaname='public' and tablename='project_sales_handover_attempts') lifecycle_policy_count,
      (select count(*)::int from pg_policies where schemaname='public' and tablename='project_sales_handover_attempts' and ('anon'=any(roles) or 'public'=any(roles))) public_policy_count,
      (select count(*)::int from public.project_sales_handover_attempts) handoff_attempt_count,
      (select count(*)::int from public.projects) project_count,
      (select count(*)::int from public.projects where stage='Sales Handover') sales_handover_project_count,
      (select count(*)::int from information_schema.tables where table_schema='public' and table_name in ('sales_handoff_v2','handoff_payments','handoff_quotations','handoff_requirements','handoff_onboarding')) duplicate_handoff_table_count
    from funcs;
  `)).rows[0];

  if (state.gate_active === true && Number(state.policy_version) === 2 && Number(state.snapshot_schema_version) === 2) {
    pass('Part 10B preservation', 'finalQuotationSendGateActive=true · policyVersion=2 · snapshotSchemaVersion=2');
  } else fail('Part 10B preservation', JSON.stringify(state));

  const functionFailures = Object.entries({
    brief: state.brief_count,
    readiness: state.readiness_count,
    submit: state.submit_count,
    accept: state.accept_count,
    return: state.return_count,
    taskGuard: state.task_guard_count,
    stageGuard: state.stage_guard_count,
    part11: state.part11_count,
    part12: state.part12_count,
  }).filter(([,value]) => Number(value) !== 1);
  if (functionFailures.length) fail('Canonical Part 11/12/13 functions', JSON.stringify(functionFailures));
  else pass('Canonical Part 11/12/13 functions', 'all expected canonical functions exist exactly once');

  if (Number(state.lifecycle_table_count) === 1 && state.lifecycle_rls === true && Number(state.lifecycle_policy_count) === 1 && Number(state.public_policy_count) === 0) {
    pass('Part 13 lifecycle RLS', 'enabled with one authenticated staff SELECT policy and no public/anon policy');
  } else fail('Part 13 lifecycle RLS', JSON.stringify(state));

  if (Number(state.duplicate_handoff_table_count) === 0) pass('Duplicate handoff/commercial persistence audit', 'no prohibited duplicate handoff truth tables');
  else fail('Duplicate handoff/commercial persistence audit', `${state.duplicate_handoff_table_count} prohibited table(s) found`);

  const grants = (await client.query(`
    select
      p.proname,
      has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
      has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec,
      p.prosecdef,
      p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'project_get_sales_handoff_brief','project_get_sales_handoff_readiness',
        'submit_sales_project_handover','accept_sales_project_handover','return_sales_project_handover'
      )
    order by p.proname
  `)).rows;
  const badGrant = grants.filter(row =>
    row.anon_exec === true
    || row.auth_exec !== true
    || row.prosecdef !== true
    || !Array.isArray(row.proconfig)
    || !row.proconfig.some(value => String(value).startsWith('search_path='))
  );
  if (badGrant.length) fail('Part 13 RPC security grants', JSON.stringify(badGrant));
  else pass('Part 13 RPC security grants', 'anon denied; authenticated allowed; SECURITY DEFINER functions use fixed search_path');

  const guards = (await client.query(`
    select p.proname,pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('protect_project_task_integrity','protect_project_stage_workflow','protect_project_sales_handover_attempt')
  `)).rows;
  const guardText = guards.map(row => row.definition).join('\n');
  for (const [label,pattern] of [
    ['protected Seller submission task', /sales_handover_submission[\s\S]*protected Part 13 submission\/review workflow/i],
    ['protected PM review task', /sales_handover_review[\s\S]*controlled by Accept \/ Return to Sales/i],
    ['accepted Content stage gate', /Delivery must accept the Sales handoff before Content can begin/i],
    ['accepted source-drift gate', /Sales must resubmit the changed handoff for review before Content can begin/i],
    ['immutable reviewed history', /A reviewed Sales handoff attempt is immutable/i],
  ]) {
    if (pattern.test(guardText)) pass(label, 'present');
    else fail(label, 'expected guard text is missing');
  }

  const integrity = (await client.query(`
    select
      (select count(*)::int from (
        select project_id
        from public.project_sales_handover_attempts
        where status in ('SUBMITTED','RESUBMITTED')
        group by project_id
        having count(*)>1
      ) x) as duplicate_pending_attempts,
      (select count(*)::int
       from public.project_sales_handover_attempts
       where status in ('ACCEPTED','RETURNED_TO_SALES')
         and (reviewed_by is null or reviewed_at is null or decision is null)) as reviewed_without_evidence,
      (select count(*)::int
       from public.project_sales_handover_attempts
       where jsonb_typeof(source_refs)<>'object' or char_length(source_digest)<>32) as invalid_source_evidence,
      (select count(*)::int
       from public.projects p
       join public.project_tasks t on t.project_id=p.id and t.workflow_key='sales_handover_review' and t.status='Done'
       where p.stage='Sales Handover'
         and not exists (
           select 1 from public.project_sales_handover_attempts a
           where a.project_id=p.id
             and a.attempt_number=(select max(a2.attempt_number) from public.project_sales_handover_attempts a2 where a2.project_id=p.id)
             and a.status='ACCEPTED'
         )) as review_task_done_without_acceptance;
  `)).rows[0];
  const integrityFailures = Object.entries(integrity).filter(([,value]) => Number(value) !== 0);
  if (integrityFailures.length) fail('Part 13 lifecycle integrity', JSON.stringify(integrity));
  else pass('Part 13 lifecycle integrity', 'no duplicate pending attempt, incomplete review evidence, invalid version evidence, or task/acceptance contradiction');

  const part12Guard = (await client.query(`
    select pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='protect_payment_verification_fields'
  `)).rows[0]?.definition || '';
  if (/provider_payment_id/i.test(part12Guard) && /paid_at/i.test(part12Guard)) {
    pass('Part 12 settlement evidence preservation', 'provider_payment_id and paid_at remain protected');
  } else fail('Part 12 settlement evidence preservation', 'Part 12 settlement guard no longer contains required evidence fields');

  pass('Part 13 production inventory', `projects ${state.project_count}; Sales Handover projects ${state.sales_handover_project_count}; lifecycle attempts ${state.handoff_attempt_count}`);

  await client.query('rollback');
} catch (error) {
  try { await client.query('rollback'); } catch {}
  throw error;
} finally {
  await client.end();
}

console.log(`\nPart 13 release readiness: ${failures.length} failure(s).`);
if (failures.length > 0) process.exitCode = 1;

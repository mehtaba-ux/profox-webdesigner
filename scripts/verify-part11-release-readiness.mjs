import dotenv from 'dotenv';
import pg from 'pg';
import { auditAppliedMigrationLedger, loadMigrationManifest } from './migration-manifest.mjs';
import { auditCurrentMigrationLineage } from './native-migration-reconciliation.mjs';
import {
  historicalForwardMigrationSupersessions,
  validateForwardMigrationSupersessionRegistry,
  verifyForwardReconciliationPostconditions,
} from './forward-migration-convergence.mjs';

dotenv.config({ path: '.env.local', quiet: true });

const PART11_VERSION = '20260920123000';
const PART11_NAME = 'crm_sales_negotiation_next_action_part_11';
const connectionString = String(process.env.SUPABASE_DB_URL || '').trim();
if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  throw new Error('SUPABASE_DB_URL is required for Part 11 production release verification.');
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  application_name: 'profox-part11-release-readiness-verifier',
});

const failures = [];
const pass = (label, detail) => console.log(`PASS  ${label}: ${detail}`);
const fail = (label, detail) => { failures.push(`${label}: ${detail}`); console.error(`FAIL  ${label}: ${detail}`); };

try {
  const migrations = await loadMigrationManifest();
  const part11Migration = migrations.find(item => item.version === PART11_VERSION && item.name === PART11_NAME);
  if (!part11Migration) throw new Error(`Repository migration ${PART11_VERSION}_${PART11_NAME} is missing.`);

  await client.connect();
  await client.query('begin read only');

  const stateRows = (await client.query(`
    select baseline_version
    from profox_migrations.state
    where singleton=true
  `)).rows;
  const authoritativeBaseline = String(stateRows[0]?.baseline_version || '');
  if (stateRows.length !== 1 || !authoritativeBaseline) {
    fail('Production migration baseline', `expected one authoritative baseline row, found ${stateRows.length}`);
  } else {
    pass('Production migration baseline', authoritativeBaseline);
  }

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
    pass('Production migration ledger integrity', `${appliedRows.length} exact custom-ledger row(s)`);
  }

  const part11Ledger = appliedRows.filter(row => String(row.version) === PART11_VERSION);
  if (
    part11Ledger.length === 1
    && part11Ledger[0].name === PART11_NAME
    && part11Ledger[0].checksum === part11Migration.checksum
    && part11Ledger[0].baseline === false
  ) {
    pass('Part 11 migration identity', `${PART11_VERSION}_${PART11_NAME} · ${part11Migration.checksum}`);
  } else {
    fail('Part 11 migration identity', `expected one exact non-baseline ledger row; found ${JSON.stringify(part11Ledger)}`);
  }

  validateForwardMigrationSupersessionRegistry({ migrations });
  for (const record of historicalForwardMigrationSupersessions) {
    if (ledgerAudit.appliedByVersion.has(record.oldVersion)) {
      fail('Historical migration safety', `forbidden superseded version present in custom ledger: ${record.oldVersion}_${record.oldName}`);
    }
  }

  const nativeRows = (await client.query(`
    select version,name,statements
    from supabase_migrations.schema_migrations
    order by version
  `)).rows;
  const postconditionResults = await verifyForwardReconciliationPostconditions(client);
  const lineageRows = authoritativeBaseline
    ? auditCurrentMigrationLineage({
      migrations,
      appliedByVersion: ledgerAudit.appliedByVersion,
      authoritativeBaseline,
      nativeRows,
      postconditionResults,
    })
    : [];
  const pending = lineageRows.filter(row => row.truthStatus === 'PENDING_NEW');
  const blocked = lineageRows.filter(row => row.truthStatus === 'BLOCKED_UNRESOLVED');
  if (pending.length || blocked.length) {
    fail(
      'Current repository migration lineage',
      `pending=${pending.length} [${pending.map(row => row.migration.file).join(', ')}]; blocked=${blocked.length} [${blocked.map(row => row.migration.file).join(', ')}]`,
    );
  } else {
    pass('Current repository migration lineage', 'PENDING_NEW 0; BLOCKED_UNRESOLVED 0');
  }

  const state = (await client.query(`
    with policy as (
      select config_value
      from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
    ),
    columns as (
      select
        count(*) filter (where column_name in (
          'decision_status','primary_objection_category','waiting_on',
          'decision_expected_at','decision_recorded_at','decision_recorded_by'
        ))::int as part11_columns,
        count(*) filter (
          where column_name in ('decision_status','primary_objection_category','waiting_on','decision_expected_at')
            and is_nullable='YES'
        )::int as nullable_current_state_columns
      from information_schema.columns
      where table_schema='public' and table_name='crm_opportunities'
    ),
    functions as (
      select
        count(*) filter (where proname='crm_record_negotiation_decision_state')::int as record_decision_count,
        count(*) filter (where proname='crm_schedule_opportunity_next_action')::int as schedule_next_count,
        count(*) filter (where proname='crm_get_last_meaningful_customer_interaction')::int as last_interaction_count,
        count(*) filter (where proname='crm_transition_opportunity')::int as transition_count,
        count(*) filter (where proname='crm_get_pipeline_command_center')::int as command_center_count,
        count(*) filter (where proname='crm_reschedule_activity')::int as reschedule_count,
        count(*) filter (where proname='crm_cancel_activity')::int as cancel_count,
        count(*) filter (where proname='crm_guard_activity_opportunity_link')::int as activity_guard_count,
        count(*) filter (where proname='crm_protect_part11_negotiation_fields')::int as negotiation_guard_count
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
    )
    select
      coalesce((select (config_value->>'finalQuotationSendGateActive')::boolean from policy),false) as gate_active,
      coalesce((select (config_value->>'policyVersion')::int from policy),0) as policy_version,
      coalesce((select (config_value->>'snapshotSchemaVersion')::int from policy),0) as snapshot_schema_version,
      columns.*,
      functions.*,
      coalesce((select relrowsecurity from pg_class where oid='public.crm_opportunities'::regclass),false) as opportunity_rls,
      coalesce((select relrowsecurity from pg_class where oid='public.crm_activities'::regclass),false) as activity_rls,
      (select count(*)::int from pg_policies where schemaname='public' and tablename='crm_opportunities' and ('anon'=any(roles) or 'public'=any(roles))) as opportunity_anon_policies,
      (select count(*)::int from pg_policies where schemaname='public' and tablename='crm_activities' and ('anon'=any(roles) or 'public'=any(roles))) as activity_anon_policies,
      (select count(*)::int from information_schema.tables where table_schema='public' and table_name in ('crm_negotiations','crm_negotiation_approvals','negotiation_discount_approvals')) as duplicate_table_count,
      (select count(*)::int from public.crm_opportunities) as opportunity_count,
      (select count(*)::int from public.crm_activities) as activity_count,
      (select count(*)::int from public.crm_opportunities where stage='Negotiation / Decision Pending') as negotiation_count,
      (select count(*)::int from public.crm_opportunities where decision_status is not null) as decision_state_count,
      (select count(*)::int from public.crm_activities where automation_source='part11_negotiation_next_action') as part11_activity_count
    from columns,functions
  `)).rows[0];

  if (state.gate_active === true && state.policy_version === 2 && state.snapshot_schema_version === 2) {
    pass('Part 10B invariant after Part 11', 'Send gate ACTIVE; policyVersion 2; snapshotSchemaVersion 2');
  } else {
    fail('Part 10B invariant after Part 11', `gate=${state.gate_active}; policy=${state.policy_version}; snapshot=${state.snapshot_schema_version}`);
  }

  if (state.part11_columns === 6 && state.nullable_current_state_columns === 4) {
    pass('Part 11 opportunity schema', 'six Part 11 fields present; four business current-state fields remain nullable/backward-compatible');
  } else {
    fail('Part 11 opportunity schema', `columns=${state.part11_columns}/6; nullable current-state=${state.nullable_current_state_columns}/4`);
  }

  const expectedFunctions = {
    record_decision_count: 1,
    schedule_next_count: 1,
    last_interaction_count: 1,
    transition_count: 1,
    command_center_count: 1,
    reschedule_count: 1,
    cancel_count: 1,
    activity_guard_count: 1,
    negotiation_guard_count: 1,
  };
  const badFunctions = Object.entries(expectedFunctions)
    .filter(([key, expected]) => Number(state[key]) !== expected)
    .map(([key, expected]) => `${key}=${state[key]} expected ${expected}`);
  if (badFunctions.length) fail('Part 11 canonical functions', badFunctions.join('; '));
  else pass('Part 11 canonical functions', 'decision, next-action, interaction, transition, command-center and activity guards exist exactly once');

  if (state.opportunity_rls && state.activity_rls && state.opportunity_anon_policies === 0 && state.activity_anon_policies === 0) {
    pass('Part 11 RLS boundary', 'opportunity/activity RLS enabled with no anon/public policies');
  } else {
    fail('Part 11 RLS boundary', `opportunity RLS=${state.opportunity_rls}, activity RLS=${state.activity_rls}, anon policies=${state.opportunity_anon_policies}/${state.activity_anon_policies}`);
  }

  if (state.duplicate_table_count === 0) pass('Duplicate-system audit', 'no negotiation/negotiation-approval duplicate tables');
  else fail('Duplicate-system audit', `${state.duplicate_table_count} forbidden duplicate table(s) found`);

  const acl = (await client.query(`
    select
      coalesce(has_function_privilege('anon','public.crm_record_negotiation_decision_state(uuid,text,text,text,timestamp with time zone)','EXECUTE'),false) as anon_record,
      coalesce(has_function_privilege('authenticated','public.crm_record_negotiation_decision_state(uuid,text,text,text,timestamp with time zone)','EXECUTE'),false) as auth_record,
      coalesce(has_function_privilege('anon','public.crm_schedule_opportunity_next_action(uuid,timestamp with time zone,text,text,text)','EXECUTE'),false) as anon_schedule,
      coalesce(has_function_privilege('authenticated','public.crm_schedule_opportunity_next_action(uuid,timestamp with time zone,text,text,text)','EXECUTE'),false) as auth_schedule,
      coalesce(has_function_privilege('anon','public.crm_reschedule_activity(uuid,timestamp with time zone,text,boolean)','EXECUTE'),false) as anon_reschedule,
      coalesce(has_function_privilege('authenticated','public.crm_reschedule_activity(uuid,timestamp with time zone,text,boolean)','EXECUTE'),false) as auth_reschedule,
      coalesce(has_function_privilege('anon','public.crm_cancel_activity(uuid,text)','EXECUTE'),false) as anon_cancel,
      coalesce(has_function_privilege('authenticated','public.crm_cancel_activity(uuid,text)','EXECUTE'),false) as auth_cancel,
      coalesce(has_function_privilege('anon','public.crm_get_last_meaningful_customer_interaction(uuid)','EXECUTE'),false) as anon_last_interaction,
      coalesce(has_function_privilege('authenticated','public.crm_get_last_meaningful_customer_interaction(uuid)','EXECUTE'),false) as auth_last_interaction,
      coalesce(has_function_privilege('service_role','public.crm_get_last_meaningful_customer_interaction(uuid)','EXECUTE'),false) as service_last_interaction
  `)).rows[0];

  if (!acl.anon_record && acl.auth_record
      && !acl.anon_schedule && acl.auth_schedule
      && !acl.anon_reschedule && acl.auth_reschedule
      && !acl.anon_cancel && acl.auth_cancel
      && !acl.anon_last_interaction && !acl.auth_last_interaction && acl.service_last_interaction) {
    pass('Part 11 function ACLs', 'browser mutations require authenticated role; internal interaction helper remains service-only');
  } else {
    fail('Part 11 function ACLs', JSON.stringify(acl));
  }

  pass(
    'Part 11 production data inventory',
    `opportunities ${state.opportunity_count}; activities ${state.activity_count}; Negotiation ${state.negotiation_count}; decision-state rows ${state.decision_state_count}; Part11-created activities ${state.part11_activity_count}`,
  );

  await client.query('rollback');
} catch (error) {
  try { await client.query('rollback'); } catch {}
  throw error;
} finally {
  await client.end();
}

console.log(`\nPart 11 release readiness: ${failures.length} failure(s).`);
if (failures.length > 0) process.exitCode = 1;

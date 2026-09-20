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

const PART12_VERSION = '20260920150000';
const PART12_NAME = 'crm_sales_payment_won_activation_part_12';
const connectionString = String(process.env.SUPABASE_DB_URL || '').trim();
if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  throw new Error('SUPABASE_DB_URL is required for Part 12 production release verification.');
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  application_name: 'profox-part12-release-readiness-verifier',
});

const failures = [];
const pass = (label, detail) => console.log(`PASS  ${label}: ${detail}`);
const fail = (label, detail) => {
  failures.push(`${label}: ${detail}`);
  console.error(`FAIL  ${label}: ${detail}`);
};

try {
  const migrations = await loadMigrationManifest();
  const part12Migration = migrations.find(item => item.version === PART12_VERSION && item.name === PART12_NAME);
  if (!part12Migration) throw new Error(`Repository migration ${PART12_VERSION}_${PART12_NAME} is missing.`);

  await client.connect();
  await client.query('begin read only');

  const stateRows = (await client.query(`
    select baseline_version
    from profox_migrations.state
    where singleton=true
  `)).rows;
  const authoritativeBaseline = String(stateRows[0]?.baseline_version || '');
  if (stateRows.length !== 1 || !authoritativeBaseline) fail('Production migration baseline', `expected one authoritative baseline row, found ${stateRows.length}`);
  else pass('Production migration baseline', authoritativeBaseline);

  const appliedRows = (await client.query(`
    select version,name,checksum,baseline
    from profox_migrations.applied_migrations
    order by version
  `)).rows;
  const ledgerAudit = auditAppliedMigrationLedger({ migrations, appliedRows, requireAllApplied: false });
  if (ledgerAudit.issues.length) fail('Production migration ledger integrity', ledgerAudit.issues.join(' | '));
  else pass('Production migration ledger integrity', `${appliedRows.length} exact custom-ledger row(s)`);

  const ledger = appliedRows.filter(row => String(row.version) === PART12_VERSION);
  if (ledger.length === 1
      && ledger[0].name === PART12_NAME
      && ledger[0].checksum === part12Migration.checksum
      && ledger[0].baseline === false) {
    pass('Part 12 migration identity', `${PART12_VERSION}_${PART12_NAME} · ${part12Migration.checksum}`);
  } else {
    fail('Part 12 migration identity', `expected one exact non-baseline ledger row; found ${JSON.stringify(ledger)}`);
  }

  validateForwardMigrationSupersessionRegistry({ migrations });
  for (const record of historicalForwardMigrationSupersessions) {
    if (ledgerAudit.appliedByVersion.has(record.oldVersion)) {
      fail('Historical Part 10B migration safety', `forbidden superseded version present: ${record.oldVersion}_${record.oldName}`);
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
    fail('Current repository migration lineage', `pending=${pending.length}; blocked=${blocked.length}`);
  } else {
    pass('Current repository migration lineage', 'PENDING_NEW 0; BLOCKED_UNRESOLVED 0');
  }

  const state = (await client.query(`
    with policy as (
      select config_value
      from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
    ),
    funcs as (
      select
        count(*) filter (where proname='verify_payment_atomic')::int as verify_count,
        count(*) filter (where proname='protect_payment_verification_fields')::int as payment_guard_count,
        count(*) filter (where proname='protect_opportunity_won_transition')::int as won_guard_count,
        count(*) filter (where proname='crm_get_sale_activation_state')::int as state_rpc_count,
        count(*) filter (where proname='crm_get_sale_activation_queue')::int as queue_rpc_count,
        count(*) filter (where proname='create_project_from_sale')::int as project_fn_count,
        count(*) filter (where proname='ensure_client_onboarding_for_project')::int as onboarding_fn_count,
        count(*) filter (where proname='generate_commission_for_verified_payment')::int as commission_fn_count,
        count(*) filter (where proname='crm_transition_opportunity')::int as transition_count,
        count(*) filter (where proname='crm_record_negotiation_decision_state')::int as part11_decision_count
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
    )
    select
      coalesce((select (config_value->>'finalQuotationSendGateActive')::boolean from policy),false) as gate_active,
      coalesce((select (config_value->>'policyVersion')::int from policy),0) as policy_version,
      coalesce((select (config_value->>'snapshotSchemaVersion')::int from policy),0) as snapshot_schema_version,
      funcs.*,
      coalesce((select relrowsecurity from pg_class where oid='public.payments'::regclass),false) as payments_rls,
      coalesce((select relrowsecurity from pg_class where oid='public.clients'::regclass),false) as clients_rls,
      coalesce((select relrowsecurity from pg_class where oid='public.projects'::regclass),false) as projects_rls,
      coalesce((select relrowsecurity from pg_class where oid='public.client_onboardings'::regclass),false) as onboarding_rls,
      coalesce((select relrowsecurity from pg_class where oid='public.crm_opportunities'::regclass),false) as opportunity_rls,
      (select count(*)::int from pg_policies where schemaname='public' and tablename in ('payments','clients','projects','client_onboardings','crm_opportunities') and ('anon'=any(roles) or 'public'=any(roles))) as public_policy_count,
      (select count(*)::int from information_schema.tables where table_schema='public' and table_name in (
        'sale_activation','sale_activations','payment_tasks','payment_followups','collection_reminders_v2',
        'won_clients','sales_clients_v2','project_customers'
      )) as duplicate_table_count,
      (select count(*)::int from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
        where n.nspname='public' and t.relname='projects' and c.contype='u' and pg_get_constraintdef(c.oid) ilike '%source_opportunity_id%') as project_unique_count,
      (select count(*)::int from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
        where n.nspname='public' and t.relname='client_onboardings' and c.contype='u' and pg_get_constraintdef(c.oid) ilike '%project_id%') as onboarding_unique_count,
      (select count(*)::int from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
        where n.nspname='public' and t.relname='commission_entries' and c.contype='u' and pg_get_constraintdef(c.oid) ilike '%payment_id%') as commission_unique_count,
      (select count(*)::int from public.payments) as payment_count,
      (select count(*)::int from public.payments where status='Verified') as verified_payment_count,
      (select count(*)::int from public.crm_opportunities where stage='Awaiting Advance Payment') as awaiting_count,
      (select count(*)::int from public.crm_opportunities where status='Won' or stage='Won') as won_count,
      (select count(*)::int from public.clients) as client_count,
      (select count(*)::int from public.projects) as project_count,
      (select count(*)::int from public.client_onboardings) as onboarding_count,
      (select count(*)::int from public.commission_entries) as commission_count
    from funcs
  `)).rows[0];

  if (state.gate_active === true && state.policy_version === 2 && state.snapshot_schema_version === 2) {
    pass('Part 10B invariant after Part 12', 'Send gate ACTIVE; policyVersion 2; snapshotSchemaVersion 2');
  } else {
    fail('Part 10B invariant after Part 12', JSON.stringify({ gate: state.gate_active, policy: state.policy_version, snapshot: state.snapshot_schema_version }));
  }

  const functionExpected = {
    verify_count: 1,
    payment_guard_count: 1,
    won_guard_count: 1,
    state_rpc_count: 1,
    queue_rpc_count: 1,
    project_fn_count: 1,
    onboarding_fn_count: 1,
    commission_fn_count: 1,
    transition_count: 1,
    part11_decision_count: 1,
  };
  const badFunctions = Object.entries(functionExpected)
    .filter(([key, expected]) => Number(state[key]) !== expected)
    .map(([key, expected]) => `${key}=${state[key]} expected ${expected}`);
  if (badFunctions.length) fail('Part 12 canonical functions', badFunctions.join('; '));
  else pass('Part 12 canonical functions', 'verification, guards, read model and canonical activation functions exist exactly once');

  if (state.payments_rls && state.clients_rls && state.projects_rls && state.onboarding_rls && state.opportunity_rls && Number(state.public_policy_count) === 0) {
    pass('Part 12 RLS boundary', 'payments/clients/projects/onboarding/opportunities protected; no anon/public table policies');
  } else {
    fail('Part 12 RLS boundary', JSON.stringify(state));
  }

  if (Number(state.duplicate_table_count) === 0) pass('Duplicate-system audit', 'no Part 12 duplicate business tables');
  else fail('Duplicate-system audit', `${state.duplicate_table_count} forbidden duplicate table(s)`);

  if (Number(state.project_unique_count) >= 1 && Number(state.onboarding_unique_count) >= 1 && Number(state.commission_unique_count) >= 1) {
    pass('Activation idempotency constraints', 'Project/opportunity, onboarding/project and commission/payment uniqueness present');
  } else {
    fail('Activation idempotency constraints', `project=${state.project_unique_count}; onboarding=${state.onboarding_unique_count}; commission=${state.commission_unique_count}`);
  }

  const triggerState = (await client.query(`
    select
      count(*) filter (where c.relname='payments' and t.tgname='trg_protect_payment_verification_fields'
        and pg_get_triggerdef(t.oid,true) ilike '%BEFORE INSERT OR UPDATE%')::int as payment_guard_trigger,
      count(*) filter (where c.relname='crm_opportunities' and t.tgname='trg_protect_opportunity_won_transition'
        and pg_get_triggerdef(t.oid,true) ilike '%BEFORE INSERT OR UPDATE%')::int as opportunity_guard_trigger
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal
  `)).rows[0];
  if (triggerState.payment_guard_trigger === 1 && triggerState.opportunity_guard_trigger === 1) {
    pass('Part 12 protected direct-write triggers', 'Payment settlement and opportunity lifecycle guards cover INSERT and UPDATE');
  } else {
    fail('Part 12 protected direct-write triggers', JSON.stringify(triggerState));
  }

  const acl = (await client.query(`
    select
      coalesce(has_function_privilege('anon','public.crm_get_sale_activation_state(uuid)','EXECUTE'),false) as anon_state,
      coalesce(has_function_privilege('authenticated','public.crm_get_sale_activation_state(uuid)','EXECUTE'),false) as auth_state,
      coalesce(has_function_privilege('anon','public.crm_get_sale_activation_queue()','EXECUTE'),false) as anon_queue,
      coalesce(has_function_privilege('authenticated','public.crm_get_sale_activation_queue()','EXECUTE'),false) as auth_queue
  `)).rows[0];
  if (!acl.anon_state && acl.auth_state && !acl.anon_queue && acl.auth_queue) {
    pass('Part 12 read-model ACLs', 'authenticated staff only; no anonymous execute');
  } else {
    fail('Part 12 read-model ACLs', JSON.stringify(acl));
  }

  const integrity = (await client.query(`
    select
      (select count(*)::int
       from public.crm_opportunities o
       where o.stage='Awaiting Advance Payment'
         and not exists (
           select 1 from public.quotations q
           where q.opportunity_id=o.id and q.status='Accepted' and q.accepted_at is not null
         )) as awaiting_without_acceptance,
      (select count(*)::int
       from public.crm_opportunities o
       where (o.status='Won' or o.stage='Won')
         and not exists (
           select 1
           from public.payments p
           join public.quotations q on q.id=p.quotation_id
           where p.opportunity_id=o.id
             and p.status='Verified'
             and p.payment_type in ('Advance','Full Payment')
             and q.opportunity_id=o.id
             and q.status='Accepted'
             and q.accepted_at is not null
         )) as won_without_payment,
      (select count(*)::int
       from public.projects p
       join public.crm_opportunities o on o.id=p.source_opportunity_id
       where o.status<>'Won' or o.stage<>'Won') as project_without_won,
      (select count(*)::int
       from public.client_onboardings co
       join public.projects p on p.id=co.project_id
       where not exists (
         select 1 from public.payments pay
         where pay.opportunity_id=p.source_opportunity_id
           and pay.status='Verified'
           and pay.payment_type in ('Advance','Full Payment')
       )) as onboarding_without_payment
  `)).rows[0];

  const integrityFailures = Object.entries(integrity).filter(([,value]) => Number(value) !== 0);
  if (integrityFailures.length === 0) pass('Part 12 production activation integrity', 'no Awaiting/Won/Project/Onboarding authority violations');
  else fail('Part 12 production activation integrity', JSON.stringify(integrity));

  pass(
    'Part 12 production business inventory',
    `payments ${state.payment_count}; verified ${state.verified_payment_count}; Awaiting Advance ${state.awaiting_count}; Won ${state.won_count}; clients ${state.client_count}; projects ${state.project_count}; onboardings ${state.onboarding_count}; commissions ${state.commission_count}`,
  );

  await client.query('rollback');
} catch (error) {
  try { await client.query('rollback'); } catch {}
  throw error;
} finally {
  await client.end();
}

console.log(`\nPart 12 release readiness: ${failures.length} failure(s).`);
if (failures.length > 0) process.exitCode = 1;

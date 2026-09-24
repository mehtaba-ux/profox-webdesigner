import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local', quiet: true });

const connectionString = String(process.env.SUPABASE_DB_URL || '').trim();
if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  throw new Error('SUPABASE_DB_URL is required for project-chat production verification.');
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  application_name: 'profox-project-chat-readiness-verifier'
});

const failures = [];
const pass = (label, detail) => console.log(`PASS  ${label}: ${detail}`);
const fail = (label, detail) => {
  failures.push(`${label}: ${detail}`);
  console.error(`FAIL  ${label}: ${detail}`);
};

try {
  await client.connect();
  await client.query('begin read only');

  const checks = (await client.query(`
    select
      exists(
        select 1 from profox_migrations.applied_migrations
        where version='20260901110000' and name='complete_project_chat_authorization'
      ) as authorization_migration_applied,
      exists(
        select 1 from profox_migrations.applied_migrations
        where version='20260901123000' and name='optimize_secure_project_chat'
      ) as performance_migration_applied,
      to_regclass('public.project_delivery_client_chat_grants') is not null as grant_table_exists,
      to_regclass('public.internal_chat_message_rate_limits') is not null as rate_limit_table_exists,
      exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='internal_chat_threads' and column_name='project_id'
      ) as thread_project_column,
      exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='internal_chat_threads' and column_name='participant_one_unread_count'
      ) and exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='internal_chat_threads' and column_name='participant_two_unread_count'
      ) as unread_counter_columns,
      public.internal_chat_roles_can_connect('sales','developer') as sales_delivery_allowed,
      public.internal_chat_roles_can_connect('content_writer','uiux_designer') as delivery_delivery_allowed,
      public.internal_chat_roles_can_connect('sales','sales') as sales_sales_allowed,
      public.internal_chat_is_delivery_role('qa') as qa_is_delivery,
      not public.internal_chat_roles_can_connect('customer','developer') as generic_customer_delivery_blocked,
      coalesce(has_function_privilege('authenticated',to_regprocedure('public.internal_chat_set_delivery_client_access(uuid,uuid,boolean,timestamptz)'),'EXECUTE'),false) as auth_can_manage_grants_rpc,
      not coalesce(has_function_privilege('anon',to_regprocedure('public.internal_chat_set_delivery_client_access(uuid,uuid,boolean,timestamptz)'),'EXECUTE'),false) as anon_cannot_manage_grants_rpc,
      coalesce(has_function_privilege('authenticated',to_regprocedure('public.internal_chat_get_or_create_thread(uuid,uuid)'),'EXECUTE'),false) as auth_can_open_project_thread,
      not coalesce(has_function_privilege('anon',to_regprocedure('public.internal_chat_get_or_create_thread(uuid,uuid)'),'EXECUTE'),false) as anon_cannot_open_project_thread,
      not has_table_privilege('authenticated','public.project_delivery_client_chat_grants','select') as auth_cannot_read_grant_table_directly,
      not has_table_privilege('authenticated','public.project_delivery_client_chat_grants','insert') as auth_cannot_write_grant_table_directly,
      not has_table_privilege('authenticated','public.internal_chat_threads','insert') as auth_cannot_insert_threads_directly,
      not has_table_privilege('authenticated','public.internal_chat_messages','insert') as auth_cannot_insert_messages_directly,
      not has_table_privilege('authenticated','public.internal_chat_message_rate_limits','select') as auth_cannot_read_rate_limits,
      (select relrowsecurity from pg_class where oid='public.project_delivery_client_chat_grants'::regclass) as grant_table_rls,
      (select relrowsecurity from pg_class where oid='public.internal_chat_message_rate_limits'::regclass) as rate_limit_table_rls,
      exists(
        select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename='internal_chat_messages'
      ) as messages_realtime,
      exists(
        select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename='internal_chat_threads'
      ) as threads_realtime,
      exists(
        select 1 from cron.job
        where jobname='profox-internal-chat-grant-reconcile' and active
      ) as grant_reconcile_cron,
      case
        when to_regprocedure('public.internal_chat_can_access_thread(uuid)') is null then false
        else position('internal_chat_project_pair_allowed' in lower(pg_get_functiondef(to_regprocedure('public.internal_chat_can_access_thread(uuid)')))) > 0
      end as thread_rechecks_project_pair,
      case
        when to_regprocedure('public.internal_chat_can_access_thread(uuid)') is null then false
        else position('project_id is not null' in lower(pg_get_functiondef(to_regprocedure('public.internal_chat_can_access_thread(uuid)')))) > 0
      end as legacy_thread_lock_present,
      case
        when to_regprocedure('public.internal_chat_send_message(uuid,text)') is null then false
        else position('internal_chat_consume_message_rate_limit' in lower(pg_get_functiondef(to_regprocedure('public.internal_chat_send_message(uuid,text)')))) > 0
      end as send_rpc_rate_limited,
      case
        when to_regprocedure('public.internal_chat_list_threads()') is null then false
        else position('participant_one_unread_count' in lower(pg_get_functiondef(to_regprocedure('public.internal_chat_list_threads()')))) > 0
      end as thread_list_uses_unread_counters,
      exists(
        select 1 from pg_constraint c
        where c.conrelid='public.project_delivery_client_chat_grants'::regclass
          and c.conname='project_delivery_client_chat_grants_customer_user_id_fkey'
      ) as customer_user_fk,
      exists(
        select 1 from pg_constraint c
        where c.conrelid='public.project_delivery_client_chat_grants'::regclass
          and c.conname='project_delivery_client_chat_grants_delivery_user_id_fkey'
      ) as delivery_user_fk,
      exists(
        select 1 from pg_constraint c
        where c.conrelid='public.project_delivery_client_chat_grants'::regclass
          and c.conname='project_delivery_client_chat_grants_granted_by_fkey'
      ) as granted_by_fk,
      not has_table_privilege('authenticated','public.internal_chat_access_audit','insert') as auth_cannot_insert_audit,
      not has_table_privilege('authenticated','public.internal_chat_access_audit','update') as auth_cannot_update_audit,
      not has_table_privilege('authenticated','public.internal_chat_access_audit','delete') as auth_cannot_delete_audit,
      not has_table_privilege('service_role','public.internal_chat_access_audit','update') as service_cannot_update_audit,
      not has_table_privilege('service_role','public.internal_chat_access_audit','delete') as service_cannot_delete_audit
  `)).rows[0];

  const expected = [
    ['authorization_migration_applied', 'Chat authorization migration', 'project-scoped authorization migration is installed'],
    ['performance_migration_applied', 'Chat performance migration', 'Realtime/performance/security migration is installed'],
    ['grant_table_exists', 'Client-chat grants', 'revocable project delivery/client grant table exists'],
    ['rate_limit_table_exists', 'Message rate limits', 'per-user bounded rate-limit state exists'],
    ['thread_project_column', 'Project-scoped threads', 'thread records carry project context'],
    ['unread_counter_columns', 'Unread counter optimization', 'thread-level unread counters exist'],
    ['sales_delivery_allowed', 'Sales ↔ Delivery policy', 'same-project Sales and Delivery roles may connect'],
    ['delivery_delivery_allowed', 'Delivery collaboration policy', 'delivery specialists may collaborate within an assigned project'],
    ['sales_sales_allowed', 'Sales collaboration policy', 'Sales peers may collaborate within an assigned project'],
    ['qa_is_delivery', 'QA role coverage', 'Quality Assurance is included in the Delivery chat family'],
    ['generic_customer_delivery_blocked', 'Customer default deny', 'customer-to-delivery access requires an explicit project grant'],
    ['auth_can_manage_grants_rpc', 'Grant management RPC', 'authenticated callers can reach the server-side authorization gate'],
    ['anon_cannot_manage_grants_rpc', 'Anonymous grant boundary', 'anonymous callers cannot manage client-chat grants'],
    ['auth_can_open_project_thread', 'Project thread RPC', 'authenticated callers can open only server-authorized project threads'],
    ['anon_cannot_open_project_thread', 'Anonymous thread boundary', 'anonymous callers cannot open internal project threads'],
    ['auth_cannot_read_grant_table_directly', 'Grant-table read boundary', 'application users cannot bypass grant RPCs with direct reads'],
    ['auth_cannot_write_grant_table_directly', 'Grant-table write boundary', 'application users cannot bypass grant RPCs with direct writes'],
    ['auth_cannot_insert_threads_directly', 'Thread write boundary', 'threads are created only through guarded RPCs'],
    ['auth_cannot_insert_messages_directly', 'Message write boundary', 'messages are inserted only through guarded RPCs'],
    ['auth_cannot_read_rate_limits', 'Rate-limit privacy', 'application users cannot inspect another user’s rate-limit state'],
    ['grant_table_rls', 'Grant-table RLS', 'row-level security is enabled'],
    ['rate_limit_table_rls', 'Rate-limit RLS', 'row-level security is enabled'],
    ['messages_realtime', 'Message Realtime publication', 'RLS-protected message changes are published'],
    ['threads_realtime', 'Thread Realtime publication', 'RLS-protected thread changes are published'],
    ['grant_reconcile_cron', 'Grant lifecycle scheduler', 'expired/stale client grants are reconciled automatically'],
    ['thread_rechecks_project_pair', 'Dynamic project revocation', 'every thread access re-checks the current project pair policy'],
    ['legacy_thread_lock_present', 'Legacy thread lockdown', 'non-project legacy threads stay inaccessible'],
    ['send_rpc_rate_limited', 'Send abuse protection', 'message writes consume the server-side rate limit'],
    ['thread_list_uses_unread_counters', 'Thread list performance', 'unread counts are O(1) maintained counters'],
    ['customer_user_fk', 'Grant customer integrity', 'customer user references are protected by a foreign key'],
    ['delivery_user_fk', 'Grant delivery integrity', 'delivery user references are protected by a foreign key'],
    ['granted_by_fk', 'Grant actor integrity', 'granting user references are protected by a foreign key'],
    ['auth_cannot_insert_audit', 'Audit insert boundary', 'application users cannot forge access-audit events'],
    ['auth_cannot_update_audit', 'Audit update boundary', 'application users cannot rewrite access-audit history'],
    ['auth_cannot_delete_audit', 'Audit delete boundary', 'application users cannot delete access-audit history'],
    ['service_cannot_update_audit', 'Service audit immutability', 'service role cannot rewrite access-audit history'],
    ['service_cannot_delete_audit', 'Service audit retention', 'service role cannot delete access-audit history']
  ];

  for (const [key, label, detail] of expected) {
    if (checks[key] === true) pass(label, detail);
    else fail(label, `expected true, received ${String(checks[key])}`);
  }

  const counts = (await client.query(`
    select
      (select count(*)::int from public.projects) as projects,
      (select count(*)::int from public.project_delivery_client_chat_grants where is_active) as active_grants,
      (select count(*)::int from public.internal_chat_threads where project_id is null) as locked_legacy_threads,
      (select count(*)::int from public.internal_chat_threads where project_id is not null) as project_threads,
      (select count(*)::int from public.internal_chat_message_rate_limits) as rate_limit_rows
  `)).rows[0];

  pass(
    'Chat production state',
    `${counts.projects} project(s), ${counts.active_grants} active client grant(s), ${counts.project_threads} project thread(s), ${counts.locked_legacy_threads} preserved locked legacy thread(s), ${counts.rate_limit_rows} rate-limit row(s)`
  );

  await client.query('rollback');
} catch (error) {
  try { await client.query('rollback'); } catch {}
  throw error;
} finally {
  await client.end();
}

console.log(`\nProject-chat readiness: ${failures.length} failure(s).`);
if (failures.length > 0) process.exitCode = 1;

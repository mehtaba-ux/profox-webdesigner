import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local', quiet: true });

const connectionString = String(process.env.SUPABASE_DB_URL || '').trim();
if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  throw new Error('SUPABASE_DB_URL is required for production readiness verification.');
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  application_name: 'profox-production-readiness-verifier'
});

const failures = [];
const warnings = [];
const pass = (label, detail) => console.log(`PASS  ${label}: ${detail}`);
const fail = (label, detail) => { failures.push(`${label}: ${detail}`); console.error(`FAIL  ${label}: ${detail}`); };
const warn = (label, detail) => { warnings.push(`${label}: ${detail}`); console.warn(`WARN  ${label}: ${detail}`); };

try {
  await client.connect();
  await client.query('begin read only');

  const migration = (await client.query(`
    select count(*)::int as count, max(version) as latest
    from profox_migrations.applied_migrations
  `)).rows[0];
  if (migration.latest >= '20260831143949') pass('Database migrations', `${migration.count} checksummed migrations; latest ${migration.latest}`);
  else fail('Database migrations', `latest installed migration is ${migration.latest || 'missing'}`);

  const synthetic = (await client.query(`
    select count(*)::int as count
    from public.user_profiles
    where status not in ('inactive','deactivated')
      and lower(coalesce(email,'')) like '%.test'
  `)).rows[0].count;
  if (synthetic === 0) pass('Synthetic production access', 'no active synthetic profiles');
  else fail('Synthetic production access', `${synthetic} synthetic profiles remain active`);

  const testAccess = (await client.query(`select public.sales_academy_test_activation_allowed(null::uuid) as enabled`)).rows[0].enabled;
  if (testAccess === false) pass('Test-login bypass', 'disabled at the database boundary');
  else fail('Test-login bypass', 'production test access reports enabled');

  const acl = (await client.query(`
    select p.proname,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'admin_revenue_distribution_dashboard',
        'admin_save_revenue_distribution_config',
        'sales_academy_test_activation_allowed',
        'sales_academy_test_bypass_active',
        'admin_test_skip_sales_academy',
        'admin_get_sales_academy_test_bypass_status'
      )
  `)).rows;
  const exposed = acl.filter((row) => row.anon_execute).map((row) => row.proname);
  if (exposed.length === 0) pass('Sensitive RPC permissions', 'anonymous execution revoked');
  else fail('Sensitive RPC permissions', `anonymous execution remains on ${exposed.join(', ')}`);

  const gateway = (await client.query(`select public.payment_gateway_settings_safe() as settings`)).rows[0].settings || {};
  const readyProviders = ['paypal', 'razorpay'].filter((provider) => gateway?.[provider]?.productionReady === true);
  if (readyProviders.length > 0) pass('Customer payment gateway', `${readyProviders.join(', ')} production-ready`);
  else fail('Customer payment gateway', 'no live provider has current credentials, webhook verification and a recent successful test');

  const razorpayx = (await client.query(`select coalesce(config_value,'{}'::jsonb) as settings from public.system_configuration where config_key='razorpayx_payout_settings'`)).rows[0]?.settings || {};
  const razorpayxReady = razorpayx.enabled === true && razorpayx.configured === true && razorpayx.webhookConfigured === true && razorpayx.lastTestSuccess === true && razorpayx.lastTestAt && Date.parse(razorpayx.lastTestAt) >= Date.now() - 30 * 86400_000;
  if (razorpayxReady) pass('Employee bulk payouts', `RazorpayX ${razorpayx.mode} mode is enabled, webhook-protected and connection-tested`);
  else warn('Employee bulk payouts', 'RazorpayX is installed but requires valid credentials, source account, payout webhook secret, connection test and explicit enablement');

  const notifications = (await client.query(`
    select
      count(*) filter (where status in ('Pending','Retry') and scheduled_for < now()-interval '15 minutes')::int as overdue,
      count(*) filter (where status='Failed' and created_at > now()-interval '7 days')::int as recent_failed,
      count(*) filter (where status in ('Pending','Retry') and scheduled_for >= now()-interval '15 minutes')::int as current
    from public.notification_outbox
  `)).rows[0];
  if (notifications.overdue === 0 && notifications.recent_failed === 0) pass('Notification delivery queue', `${notifications.current} current scheduled item(s), no overdue/recent failures`);
  else fail('Notification delivery queue', `${notifications.overdue} overdue and ${notifications.recent_failed} failed in the last 7 days`);

  const calendar = (await client.query(`
    select
      (select count(*)::int from public.google_calendar_connections c join public.user_profiles p on p.id=c.user_id where c.status='connected' and p.status='active' and p.role in ('sales','sales_rep','sales_team')) as connected,
      (select count(*)::int from public.google_calendar_connections c join public.user_profiles p on p.id=c.user_id where c.status in ('error','reconnect_required') and p.status='active' and p.role in ('sales','sales_rep','sales_team')) as unhealthy,
      (select count(*)::int from public.google_calendar_connections c join public.user_profiles p on p.id=c.user_id where c.status in ('error','reconnect_required') and p.status='active' and p.role not in ('sales','sales_rep','sales_team')) as unhealthy_non_sellers,
      (select count(*)::int from public.google_calendar_sync_jobs j join public.google_calendar_connections c on c.user_id=j.user_id join public.user_profiles p on p.id=j.user_id where c.status='connected' and p.status='active' and p.role in ('sales','sales_rep','sales_team') and j.status in ('pending','retry','processing') and j.next_attempt_at < now()-interval '15 minutes') as overdue_jobs,
      (select count(*)::int from public.google_calendar_sync_jobs j join public.google_calendar_connections c on c.user_id=j.user_id join public.user_profiles p on p.id=j.user_id where c.status='connected' and p.status='active' and p.role in ('sales','sales_rep','sales_team') and j.status='failed' and j.updated_at > now()-interval '7 days') as recent_failed_jobs,
      (select count(*)::int from public.google_calendar_sync_jobs j join public.user_profiles p on p.id=j.user_id where p.status <> 'active' and j.status='failed') as historical_inactive_failures
  `)).rows[0];
  if (calendar.unhealthy === 0 && calendar.overdue_jobs === 0 && calendar.recent_failed_jobs === 0) {
    pass('Google Calendar queue', `${calendar.connected} connected account(s), no unhealthy current state`);
  } else {
    fail('Google Calendar queue', `${calendar.unhealthy} unhealthy connection(s), ${calendar.overdue_jobs} overdue and ${calendar.recent_failed_jobs} recently failed job(s)`);
  }
  if (calendar.unhealthy_non_sellers > 0) warn('Admin Calendar connection', `${calendar.unhealthy_non_sellers} active non-sales account(s) must reconnect before using optional Google sync`);
  if (calendar.historical_inactive_failures > 0) warn('Historical Calendar audit', `${calendar.historical_inactive_failures} failed job record(s) belong to inactive users and are retained for audit only`);
  if (calendar.connected === 0) warn('Google Calendar adoption', 'no staff account is connected yet; each salesperson must connect during mandatory onboarding');

  const zoho = (await client.query(`
    select
      count(*) filter (where status='connected')::int as connected,
      count(*) filter (where status in ('error','reconnect_required'))::int as unhealthy
    from public.zoho_connections
  `)).rows[0];
  if (zoho.unhealthy === 0) pass('Zoho connection state', `${zoho.connected} connected account(s), no unhealthy connection`);
  else fail('Zoho connection state', `${zoho.unhealthy} connection(s) require attention`);
  if (zoho.connected === 0) warn('Zoho adoption', 'Zoho is optional and no account is connected');

  const publicAcquisition = (await client.query(`
    select
      coalesce((select (config_value->>'enabled')::boolean from public.system_configuration where config_key='public_contact_form'),false) as contact_enabled,
      coalesce((select (config_value->>'requirePrivacyConsent')::boolean from public.system_configuration where config_key='public_contact_form'),false) as contact_consent_required,
      coalesce((select (config_value->>'notifyManagersOnNewLead')::boolean from public.system_configuration where config_key='crm_lead_assignment'),false) as manager_notifications,
      coalesce((select (config_value->>'active')::boolean from public.system_configuration where config_key='public_booking_settings'),false) as booking_enabled,
      coalesce((select (config_value->>'requirePrivacyConsent')::boolean from public.system_configuration where config_key='public_booking_settings'),false) as booking_consent_required,
      (select count(*)::int from public.list_public_booking_experts()) as public_experts,
      exists(select 1 from cron.job where jobname='crm-lead-first-response-sla' and active) as lead_sla_active,
      exists(select 1 from cron.job where jobname='profox-notification-automation' and active) as notification_worker_active,
      exists(select 1 from cron.job where jobname='profox-google-calendar-sync' and active) as google_worker_active,
      exists(select 1 from cron.job where jobname='profox-zoho-calendar-sync' and active) as zoho_worker_active
  `)).rows[0];
  if (publicAcquisition.contact_enabled && publicAcquisition.manager_notifications && publicAcquisition.lead_sla_active) {
    pass('Website enquiry flow', 'form, manager alerts and first-response SLA scheduler are active');
  } else {
    fail('Website enquiry flow', 'form, manager alerts or first-response SLA scheduler is inactive');
  }
  if (publicAcquisition.booking_enabled && publicAcquisition.public_experts > 0) {
    pass('Public meeting booking', `${publicAcquisition.public_experts} eligible public specialist(s)`);
  } else {
    fail('Public meeting booking', `enabled=${publicAcquisition.booking_enabled}; eligible specialists=${publicAcquisition.public_experts}`);
  }
  if (publicAcquisition.contact_consent_required && publicAcquisition.booking_consent_required) {
    pass('Public form privacy consent', 'mandatory for both quote and meeting submissions');
  } else {
    warn('Public form privacy consent', 'staged off until the matching frontend passes its production smoke test');
  }
  if (publicAcquisition.notification_worker_active && publicAcquisition.google_worker_active && publicAcquisition.zoho_worker_active) {
    pass('Provider-neutral schedulers', 'notifications, Google Calendar and Zoho Calendar workers are active');
  } else {
    fail('Provider-neutral schedulers', 'one or more notification/calendar workers are inactive');
  }

  await client.query('rollback');
} catch (error) {
  try { await client.query('rollback'); } catch {}
  throw error;
} finally {
  await client.end();
}

console.log(`\nProduction readiness: ${failures.length} failure(s), ${warnings.length} warning(s).`);
if (failures.length > 0) process.exitCode = 1;

import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local', quiet: true });

const connectionString = String(process.env.SUPABASE_DB_URL || '').trim();
if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  throw new Error('SUPABASE_DB_URL is required for professional-mailbox production verification.');
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  application_name: 'profox-professional-mailbox-readiness-verifier'
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

  const { rows: [checks] } = await client.query(`
    select
      exists(
        select 1 from profox_migrations.applied_migrations
        where version='20260901130000'
          and name='restrict_professional_mailboxes_to_sales_and_management'
      ) as migration_applied,
      public.service_professional_mailbox_role_eligible('sales') as sales_allowed,
      public.service_professional_mailbox_role_eligible('sales_rep') as sales_rep_allowed,
      public.service_professional_mailbox_role_eligible('sales_team') as sales_team_allowed,
      public.service_professional_mailbox_role_eligible('admin') as admin_allowed,
      public.service_professional_mailbox_role_eligible('project_manager') as project_manager_allowed,
      public.service_professional_mailbox_role_eligible('site_manager') as site_manager_allowed,
      not public.service_professional_mailbox_role_eligible('content_writer') as content_writer_blocked,
      not public.service_professional_mailbox_role_eligible('developer') as developer_blocked,
      not public.service_professional_mailbox_role_eligible('uiux_designer') as uiux_blocked,
      not public.service_professional_mailbox_role_eligible('qa') as qa_blocked,
      not public.service_professional_mailbox_role_eligible('editor') as editor_blocked,
      not public.service_professional_mailbox_role_eligible('talent_partner') as talent_partner_blocked,
      not coalesce(has_function_privilege('authenticated',to_regprocedure('public.service_professional_mailbox_eligible(uuid)'),'EXECUTE'),false) as auth_cannot_call_low_level_eligibility,
      not coalesce(has_function_privilege('anon',to_regprocedure('public.service_professional_mailbox_eligible(uuid)'),'EXECUTE'),false) as anon_cannot_call_low_level_eligibility,
      position('professionalMailboxEligible' in pg_get_functiondef(to_regprocedure('public.get_my_professional_integration_status()'))) > 0 as status_is_role_aware,
      not exists(
        select 1
        from public.user_profiles u
        where public.service_professional_mailbox_eligible(u.id)
          and lower(coalesce(u.role,'')) not in ('sales','sales_rep','sales_team','admin','project_manager','site_manager')
      ) as no_delivery_user_eligible,
      not exists(
        select 1
        from public.professional_mailbox_provisioning_jobs j
        where j.status in ('pending','retry','processing')
          and not public.service_professional_mailbox_eligible(j.user_id)
      ) as no_ineligible_jobs_active,
      not exists(
        select 1
        from public.staff_professional_accounts a
        where a.mailbox_status in ('active','provisioning')
          and not public.service_professional_mailbox_eligible(a.user_id)
      ) as no_ineligible_mailbox_active
  `);

  for (const [label, value] of Object.entries(checks)) {
    if (value === true) pass(label, 'ok');
    else fail(label, String(value));
  }

  const { rows: [cfg] } = await client.query(`
    select
      coalesce((config_value->>'mailProvisioningEnabled')::boolean,false) as provisioning_enabled,
      coalesce((config_value->>'zohoMailEnabled')::boolean,false) as zoho_mail_enabled,
      coalesce(config_value->>'defaultMailProvider','none') as default_mail_provider
    from public.system_configuration
    where config_key='professional_integrations'
  `);
  pass('current_policy', `provisioning=${cfg?.provisioning_enabled} zohoMail=${cfg?.zoho_mail_enabled} default=${cfg?.default_mail_provider}`);

  await client.query('rollback');
} finally {
  await client.end().catch(() => {});
}

if (failures.length) {
  throw new Error(`Professional mailbox readiness failed:\n- ${failures.join('\n- ')}`);
}
console.log('Professional mailbox readiness verification passed.');

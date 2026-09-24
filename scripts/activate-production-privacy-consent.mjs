import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local', quiet: true });

if (process.env.ALLOW_PRODUCTION_ACTIVATION !== 'true') {
  throw new Error('Set ALLOW_PRODUCTION_ACTIVATION=true only after the matching frontend deployment has passed smoke tests.');
}

const connectionString = String(process.env.SUPABASE_DB_URL || '').trim();
if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  throw new Error('SUPABASE_DB_URL is required to activate production privacy consent.');
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  application_name: 'profox-production-privacy-activation'
});

try {
  await client.connect();
  await client.query('begin');

  const result = await client.query(`
    update public.system_configuration
    set config_value = config_value || jsonb_build_object('requirePrivacyConsent', true),
        updated_at = now()
    where config_key in ('public_contact_form', 'public_booking_settings')
    returning config_key, (config_value->>'requirePrivacyConsent')::boolean as consent_required
  `);

  const activated = new Map(result.rows.map(row => [row.config_key, row.consent_required]));
  for (const key of ['public_contact_form', 'public_booking_settings']) {
    if (activated.get(key) !== true) {
      throw new Error(`Privacy consent activation failed for ${key}.`);
    }
  }

  await client.query('commit');
  console.log('Activated mandatory privacy consent for public quote and meeting submissions.');
} catch (error) {
  try { await client.query('rollback'); } catch {}
  throw error;
} finally {
  await client.end();
}

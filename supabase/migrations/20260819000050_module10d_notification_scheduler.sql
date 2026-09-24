-- Module 10D — Database scheduler for sales automation and notification delivery.
-- This migration is intentionally last so the worker and all service RPC dependencies exist first.
-- The cron token is generated inside Supabase Vault and never stored in normal public tables.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='profox_notification_cron_token') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32),'hex'),
      'profox_notification_cron_token',
      'Shared token used only between Supabase Cron and the ProFox notification Edge Function.',
      NULL
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_get_notification_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = vault, public, pg_temp
AS $$
  SELECT COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='profox_notification_cron_token' LIMIT 1),'');
$$;

REVOKE ALL ON FUNCTION public.service_get_notification_cron_secret() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_notification_cron_secret() TO service_role;

DO $$
DECLARE v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname='profox-notification-automation' LIMIT 1;
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
END;
$$;

SELECT cron.schedule(
  'profox-notification-automation',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://calabtayklhltyiriiwo.supabase.co/functions/v1/process-notification-outbox',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-profox-cron-token',COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='profox_notification_cron_token' LIMIT 1),'')
    ),
    body := jsonb_build_object('source','supabase-cron','requestedAt',now()),
    timeout_milliseconds := 15000
  );
  $cron$
);
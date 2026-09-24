-- Module 13E — Google sync reliability, manual health controls and scheduler.
-- Google failures are isolated from ProFox business transactions.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='profox_google_calendar_cron_token') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32),'hex'),
      'profox_google_calendar_cron_token',
      'Shared token used only between Supabase Cron and the ProFox Google Calendar sync Edge Function.',
      NULL
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_get_google_calendar_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path=vault,public,pg_temp
AS $$
  SELECT COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='profox_google_calendar_cron_token' LIMIT 1),'');
$$;
REVOKE ALL ON FUNCTION public.service_get_google_calendar_cron_secret() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_google_calendar_cron_secret() TO service_role;

CREATE OR REPLACE FUNCTION public.service_queue_due_google_busy_refreshes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_minutes integer:=5; v_row record; v_count integer:=0;
BEGIN
  SELECT LEAST(GREATEST(COALESCE((config_value->>'busyRefreshMinutes')::integer,5),2),60)
    INTO v_minutes FROM public.system_configuration WHERE config_key='google_calendar_settings';
  v_minutes:=COALESCE(v_minutes,5);
  FOR v_row IN
    SELECT c.user_id
    FROM public.google_calendar_connections c
    JOIN public.user_profiles p ON p.id=c.user_id
    WHERE c.status='connected' AND c.sync_enabled IS TRUE
      AND p.status='active' AND p.role IN ('sales','admin')
      AND (c.last_successful_sync_at IS NULL OR c.last_successful_sync_at < now()-make_interval(mins=>v_minutes))
  LOOP
    IF public.queue_google_calendar_sync(v_row.user_id,'refresh_busy',NULL,false) IS NOT NULL THEN v_count:=v_count+1; END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.service_queue_due_google_busy_refreshes() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_queue_due_google_busy_refreshes() TO service_role;

CREATE OR REPLACE FUNCTION public.get_google_calendar_sync_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path=public,pg_temp
AS $$
DECLARE v_user uuid:=auth.uid(); v_conn public.google_calendar_connections%ROWTYPE; v_pending integer:=0; v_failed integer:=0; v_last_audit jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.is_admin() AND NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.id=v_user AND p.status='active' AND p.role='sales') THEN
    RAISE EXCEPTION 'Calendar integration is available only to active Sales users and Administrators.';
  END IF;
  SELECT * INTO v_conn FROM public.google_calendar_connections WHERE user_id=v_user;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','disconnected','pendingJobs',0,'failedJobs',0,'lastSuccessfulSyncAt',NULL,'lastAttemptAt',NULL,'lastError',NULL,'lastAudit',NULL); END IF;
  SELECT count(*) FILTER(WHERE status IN('pending','processing','retry')),count(*) FILTER(WHERE status IN('failed','reconnect_required'))
    INTO v_pending,v_failed FROM public.google_calendar_sync_jobs WHERE user_id=v_user;
  SELECT jsonb_build_object('operation',a.operation,'status',a.status,'httpStatus',a.http_status,'detail',a.detail,'createdAt',a.created_at)
    INTO v_last_audit FROM public.google_calendar_sync_audit a WHERE a.user_id=v_user ORDER BY a.created_at DESC LIMIT 1;
  RETURN jsonb_build_object('status',v_conn.status,'pendingJobs',v_pending,'failedJobs',v_failed,'lastSuccessfulSyncAt',v_conn.last_successful_sync_at,
    'lastAttemptAt',v_conn.last_attempt_at,'lastError',v_conn.last_error,'lastAudit',v_last_audit);
END;
$$;
REVOKE ALL ON FUNCTION public.get_google_calendar_sync_health() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_google_calendar_sync_health() TO authenticated;

CREATE OR REPLACE FUNCTION public.request_google_calendar_sync_now()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_user uuid:=auth.uid(); v_busy bigint; v_event_count integer:=0; v_m record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.is_admin() AND NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.id=v_user AND p.status='active' AND p.role='sales') THEN
    RAISE EXCEPTION 'Calendar integration is available only to active Sales users and Administrators.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.google_calendar_connections c WHERE c.user_id=v_user AND c.status='connected' AND c.sync_enabled) THEN
    RAISE EXCEPTION 'Google Calendar is not connected and enabled.';
  END IF;
  v_busy:=public.queue_google_calendar_sync(v_user,'refresh_busy',NULL,true);
  -- Explicit Sync Now also reconciles the user's upcoming live meetings. Historical meetings are never backfilled.
  FOR v_m IN SELECT id FROM public.sales_meetings WHERE salesperson_id=v_user AND status IN('Scheduled','Rescheduled') AND end_at>=now() ORDER BY start_at LIMIT 200 LOOP
    PERFORM public.queue_google_calendar_sync(v_user,'reconcile_event',v_m.id,true); v_event_count:=v_event_count+1;
  END LOOP;
  RETURN jsonb_build_object('busyJobId',v_busy,'meetingJobs',v_event_count);
END;
$$;
REVOKE ALL ON FUNCTION public.request_google_calendar_sync_now() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_google_calendar_sync_now() TO authenticated;

CREATE OR REPLACE FUNCTION public.service_google_sync_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_jobs integer; v_audit integer; v_states integer;
BEGIN
  DELETE FROM public.google_calendar_sync_jobs WHERE status='succeeded' AND completed_at<now()-interval '30 days'; GET DIAGNOSTICS v_jobs=ROW_COUNT;
  DELETE FROM public.google_calendar_sync_audit WHERE created_at<now()-interval '90 days'; GET DIAGNOSTICS v_audit=ROW_COUNT;
  DELETE FROM public.google_calendar_oauth_states WHERE expires_at<now()-interval '1 day' OR consumed_at<now()-interval '1 day'; GET DIAGNOSTICS v_states=ROW_COUNT;
  RETURN jsonb_build_object('jobsDeleted',v_jobs,'auditDeleted',v_audit,'oauthStatesDeleted',v_states);
END;
$$;
REVOKE ALL ON FUNCTION public.service_google_sync_maintenance() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_google_sync_maintenance() TO service_role;

DO $$ DECLARE v_job_id bigint; BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname='profox-google-calendar-sync' LIMIT 1;
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
END $$;

SELECT cron.schedule(
  'profox-google-calendar-sync',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://calabtayklhltyiriiwo.supabase.co/functions/v1/process-google-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-profox-calendar-cron-token',COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='profox_google_calendar_cron_token' LIMIT 1),'')
    ),
    body := jsonb_build_object('source','supabase-cron','requestedAt',now()),
    timeout_milliseconds := 30000
  );
  $cron$
);

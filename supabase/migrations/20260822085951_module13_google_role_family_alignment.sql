-- Module 13 reconciliation: align user-facing Google Calendar RPC authorization
-- with the canonical active Sales role-family helper. ProFox Calendar remains primary.

CREATE OR REPLACE FUNCTION public.get_google_calendar_connection_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.google_calendar_connections%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.is_admin() AND NOT public.has_active_role(ARRAY['sales']::text[]) THEN
    RAISE EXCEPTION 'Calendar integration is available only to active Sales users and Administrators.';
  END IF;

  SELECT * INTO v_row
  FROM public.google_calendar_connections
  WHERE user_id=v_user;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'provider','google','status','disconnected','connected',false,
      'syncEnabled',true,'createMeet',true,'accountEmail','',
      'calendarId','primary','calendarTimezone','',
      'lastSuccessfulSyncAt',NULL,'lastAttemptAt',NULL,'lastError',NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'provider','google','status',v_row.status,'connected',v_row.status='connected',
    'syncEnabled',v_row.sync_enabled,'createMeet',v_row.create_meet,
    'accountEmail',v_row.account_email,'calendarId',v_row.calendar_id,
    'calendarTimezone',v_row.calendar_timezone,
    'lastSuccessfulSyncAt',v_row.last_successful_sync_at,
    'lastAttemptAt',v_row.last_attempt_at,
    'lastError',CASE WHEN v_row.status IN ('error','reconnect_required') THEN v_row.last_error ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_google_calendar_sync_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_conn public.google_calendar_connections%ROWTYPE;
  v_pending integer := 0;
  v_failed integer := 0;
  v_last_audit jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.is_admin() AND NOT public.has_active_role(ARRAY['sales']::text[]) THEN
    RAISE EXCEPTION 'Calendar integration is available only to active Sales users and Administrators.';
  END IF;

  SELECT * INTO v_conn
  FROM public.google_calendar_connections
  WHERE user_id=v_user;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status','disconnected','pendingJobs',0,'failedJobs',0,
      'lastSuccessfulSyncAt',NULL,'lastAttemptAt',NULL,'lastError',NULL,'lastAudit',NULL
    );
  END IF;

  SELECT
    count(*) FILTER(WHERE status IN('pending','processing','retry')),
    count(*) FILTER(WHERE status IN('failed','reconnect_required'))
  INTO v_pending,v_failed
  FROM public.google_calendar_sync_jobs
  WHERE user_id=v_user;

  SELECT jsonb_build_object(
    'operation',a.operation,'status',a.status,'httpStatus',a.http_status,
    'detail',a.detail,'createdAt',a.created_at
  )
  INTO v_last_audit
  FROM public.google_calendar_sync_audit a
  WHERE a.user_id=v_user
  ORDER BY a.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'status',v_conn.status,'pendingJobs',v_pending,'failedJobs',v_failed,
    'lastSuccessfulSyncAt',v_conn.last_successful_sync_at,
    'lastAttemptAt',v_conn.last_attempt_at,'lastError',v_conn.last_error,
    'lastAudit',v_last_audit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_google_calendar_preferences(
  p_sync_enabled boolean,
  p_create_meet boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_sync_enabled boolean := COALESCE(p_sync_enabled,true);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.is_admin() AND NOT public.has_active_role(ARRAY['sales']::text[]) THEN
    RAISE EXCEPTION 'Calendar integration is available only to active Sales users and Administrators.';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.google_calendar_connections
    WHERE user_id=v_user AND status<>'disconnected'
  ) THEN
    RAISE EXCEPTION 'Connect Google Calendar before changing synchronization preferences.';
  END IF;

  UPDATE public.google_calendar_connections
  SET sync_enabled=v_sync_enabled,
      create_meet=COALESCE(p_create_meet,true),
      last_error=CASE WHEN v_sync_enabled THEN last_error ELSE NULL END,
      updated_at=now()
  WHERE user_id=v_user;

  IF NOT v_sync_enabled THEN
    UPDATE public.google_calendar_sync_jobs
    SET status='failed',
        last_error='Google Calendar synchronization was disabled by the user.',
        locked_at=NULL,
        completed_at=now(),
        updated_at=now()
    WHERE user_id=v_user
      AND status IN('pending','processing','retry');

    UPDATE public.sales_meetings
    SET sync_status='Not Connected',sync_error=NULL,updated_at=now()
    WHERE salesperson_id=v_user AND sync_status='Pending';
  ELSE
    PERFORM public.queue_google_calendar_sync(v_user,'refresh_busy',NULL,true);
  END IF;

  RETURN public.get_google_calendar_connection_status();
END;
$$;

CREATE OR REPLACE FUNCTION public.request_google_calendar_sync_now()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_busy bigint;
  v_event_count integer := 0;
  v_m record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.is_admin() AND NOT public.has_active_role(ARRAY['sales']::text[]) THEN
    RAISE EXCEPTION 'Calendar integration is available only to active Sales users and Administrators.';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.google_calendar_connections c
    WHERE c.user_id=v_user AND c.status='connected' AND c.sync_enabled
  ) THEN
    RAISE EXCEPTION 'Google Calendar is not connected and enabled.';
  END IF;

  v_busy := public.queue_google_calendar_sync(v_user,'refresh_busy',NULL,true);

  FOR v_m IN
    SELECT id
    FROM public.sales_meetings
    WHERE salesperson_id=v_user
      AND status IN('Scheduled','Rescheduled')
      AND end_at>=now()
    ORDER BY start_at
    LIMIT 200
  LOOP
    PERFORM public.queue_google_calendar_sync(v_user,'reconcile_event',v_m.id,true);
    v_event_count:=v_event_count+1;
  END LOOP;

  RETURN jsonb_build_object('busyJobId',v_busy,'meetingJobs',v_event_count);
END;
$$;

REVOKE ALL ON FUNCTION public.get_google_calendar_connection_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_google_calendar_sync_health() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_google_calendar_preferences(boolean,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_google_calendar_sync_now() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_google_calendar_connection_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_google_calendar_sync_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_google_calendar_preferences(boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_google_calendar_sync_now() TO authenticated;

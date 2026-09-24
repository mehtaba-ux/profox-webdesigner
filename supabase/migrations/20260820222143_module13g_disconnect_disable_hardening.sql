-- Module 13G lifecycle hardening — disconnect/disable must leave native ProFox scheduling clean.

CREATE OR REPLACE FUNCTION public.set_google_calendar_preferences(
  p_sync_enabled boolean,
  p_create_meet boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_sync_enabled boolean := COALESCE(p_sync_enabled,true);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_profiles p WHERE p.id=v_user AND p.status='active' AND p.role='sales'
  ) THEN
    RAISE EXCEPTION 'Calendar integration is available only to active Sales users and Administrators.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.google_calendar_connections WHERE user_id=v_user AND status<>'disconnected') THEN
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
    WHERE user_id=v_user AND status IN ('pending','processing','retry');

    UPDATE public.sales_meetings
    SET sync_status='Not Connected', sync_error=NULL, updated_at=now()
    WHERE salesperson_id=v_user AND sync_status='Pending';
  ELSE
    PERFORM public.queue_google_calendar_sync(v_user,'refresh_busy',NULL,true);
  END IF;

  RETURN public.get_google_calendar_connection_status();
END;
$$;

CREATE OR REPLACE FUNCTION public.service_disconnect_google_calendar(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE v_secret uuid;
BEGIN
  SELECT refresh_secret_id INTO v_secret
  FROM public.google_calendar_connections
  WHERE user_id=p_user_id
  FOR UPDATE;

  UPDATE public.google_calendar_connections
  SET status='disconnected',
      sync_enabled=false,
      refresh_secret_id=NULL,
      last_error=NULL,
      disconnected_at=now(),
      updated_at=now()
  WHERE user_id=p_user_id;

  DELETE FROM public.google_calendar_busy_blocks WHERE user_id=p_user_id;

  UPDATE public.google_calendar_sync_jobs
  SET status='failed',
      last_error='Google Calendar was disconnected by the user.',
      locked_at=NULL,
      completed_at=now(),
      updated_at=now()
  WHERE user_id=p_user_id AND status IN ('pending','processing','retry');

  UPDATE public.sales_meetings
  SET sync_status='Not Connected', sync_error=NULL, updated_at=now()
  WHERE salesperson_id=p_user_id AND sync_status IN ('Pending','Error');

  IF v_secret IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id=v_secret;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_google_calendar_preferences(boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_google_calendar_preferences(boolean,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.service_disconnect_google_calendar(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_disconnect_google_calendar(uuid) TO service_role;

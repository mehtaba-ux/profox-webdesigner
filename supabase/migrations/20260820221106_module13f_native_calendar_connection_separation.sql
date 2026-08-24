-- Module 13F — Keep native ProFox availability settings independent from optional Google connection state.
-- user_calendar_settings remains the ProFox source of working hours/buffers. google_calendar_connections owns OAuth/sync state.

CREATE OR REPLACE FUNCTION public.service_upsert_google_calendar_connection(
  p_user_id uuid,
  p_google_subject text,
  p_account_email text,
  p_calendar_id text,
  p_calendar_timezone text,
  p_scopes text[],
  p_refresh_secret_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR p_refresh_secret_id IS NULL THEN RAISE EXCEPTION 'User and secure refresh token are required.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.id=p_user_id AND p.status='active' AND p.role IN ('sales','admin')) THEN
    RAISE EXCEPTION 'Google Calendar may only be connected for an active Sales user or Administrator.';
  END IF;
  INSERT INTO public.google_calendar_connections(
    user_id,google_subject,account_email,calendar_id,calendar_timezone,scopes,refresh_secret_id,status,
    sync_enabled,create_meet,last_auth_at,last_error,disconnected_at,updated_at
  ) VALUES(
    p_user_id,COALESCE(p_google_subject,''),lower(COALESCE(p_account_email,'')),COALESCE(NULLIF(p_calendar_id,''),'primary'),
    COALESCE(NULLIF(p_calendar_timezone,''),'UTC'),COALESCE(p_scopes,ARRAY[]::text[]),p_refresh_secret_id,'connected',
    true,true,now(),NULL,NULL,now()
  )
  ON CONFLICT(user_id) DO UPDATE SET
    google_subject=EXCLUDED.google_subject,account_email=EXCLUDED.account_email,
    calendar_id=EXCLUDED.calendar_id,calendar_timezone=EXCLUDED.calendar_timezone,
    scopes=EXCLUDED.scopes,refresh_secret_id=EXCLUDED.refresh_secret_id,status='connected',
    sync_enabled=true,last_auth_at=now(),last_error=NULL,disconnected_at=NULL,updated_at=now();

  -- Initialize native availability only if it does not exist. Never turn this table into OAuth state.
  INSERT INTO public.user_calendar_settings(user_id,provider,calendar_email,timezone,connection_status,active,updated_at)
  VALUES(p_user_id,'Manual','',COALESCE(NULLIF(p_calendar_timezone,''),'UTC'),'Not Connected',true,now())
  ON CONFLICT(user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_mark_google_connection_state(
  p_user_id uuid,p_status text,p_error text DEFAULT NULL,p_success boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('connected','reconnect_required','disconnected','error') THEN RAISE EXCEPTION 'Invalid connection state.'; END IF;
  UPDATE public.google_calendar_connections
  SET status=p_status,last_attempt_at=now(),
      last_successful_sync_at=CASE WHEN COALESCE(p_success,false) THEN now() ELSE last_successful_sync_at END,
      last_error=CASE WHEN p_status='connected' AND COALESCE(p_success,false) THEN NULL ELSE left(COALESCE(p_error,''),2000) END,
      disconnected_at=CASE WHEN p_status='disconnected' THEN now() ELSE disconnected_at END,
      updated_at=now()
  WHERE user_id=p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_disconnect_google_calendar(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,vault,pg_temp
AS $$
DECLARE v_secret uuid;
BEGIN
  SELECT refresh_secret_id INTO v_secret FROM public.google_calendar_connections WHERE user_id=p_user_id FOR UPDATE;
  UPDATE public.google_calendar_connections
  SET status='disconnected',sync_enabled=false,refresh_secret_id=NULL,last_error=NULL,disconnected_at=now(),updated_at=now()
  WHERE user_id=p_user_id;
  DELETE FROM public.google_calendar_busy_blocks WHERE user_id=p_user_id;
  IF v_secret IS NOT NULL THEN DELETE FROM vault.secrets WHERE id=v_secret; END IF;
END;
$$;

-- Repair any rows touched while Module 13 was being introduced. Native availability always stays Manual/Not Connected.
UPDATE public.user_calendar_settings
SET provider='Manual',connection_status='Not Connected',calendar_email='',updated_at=now()
WHERE user_id IN (SELECT user_id FROM public.google_calendar_connections)
  AND (provider<>'Manual' OR connection_status<>'Not Connected' OR calendar_email<>'');

REVOKE ALL ON FUNCTION public.service_upsert_google_calendar_connection(uuid,text,text,text,text,text[],uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_mark_google_connection_state(uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_disconnect_google_calendar(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_upsert_google_calendar_connection(uuid,text,text,text,text,text[],uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_mark_google_connection_state(uuid,text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_disconnect_google_calendar(uuid) TO service_role;

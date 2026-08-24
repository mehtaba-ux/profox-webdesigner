-- Module 13A — Google OAuth & secure Calendar connection foundation.
-- ProFox Calendar remains authoritative. Google credentials are service-only and refresh tokens live in Supabase Vault.

CREATE TABLE IF NOT EXISTS public.google_calendar_connections (
  user_id uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google' CHECK (provider='google'),
  google_subject text NOT NULL DEFAULT '',
  account_email text NOT NULL DEFAULT '',
  calendar_id text NOT NULL DEFAULT 'primary',
  calendar_timezone text NOT NULL DEFAULT 'UTC',
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  refresh_secret_id uuid,
  status text NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected','reconnect_required','disconnected','error')),
  sync_enabled boolean NOT NULL DEFAULT true,
  create_meet boolean NOT NULL DEFAULT true,
  last_auth_at timestamptz,
  last_successful_sync_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.google_calendar_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  return_path text NOT NULL DEFAULT '/admin/meetings?tab=availability',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (char_length(code_verifier) BETWEEN 43 AND 128),
  CHECK (return_path ~ '^/[^/].*' OR return_path='/')
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_oauth_states_expiry
  ON public.google_calendar_oauth_states(expires_at) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_google_calendar_connections_status
  ON public.google_calendar_connections(status) WHERE status <> 'disconnected';

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_oauth_states ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.google_calendar_connections FROM anon;
REVOKE ALL ON TABLE public.google_calendar_oauth_states FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.google_calendar_connections FROM authenticated;
GRANT SELECT ON TABLE public.google_calendar_connections TO authenticated;

DROP POLICY IF EXISTS google_calendar_connections_self_read ON public.google_calendar_connections;
DROP POLICY IF EXISTS google_calendar_connections_admin_read ON public.google_calendar_connections;
CREATE POLICY google_calendar_connections_self_read ON public.google_calendar_connections
  FOR SELECT TO authenticated
  USING (
    user_id=(SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id=(SELECT auth.uid()) AND p.status='active' AND p.role IN ('sales','admin')
    )
  );
CREATE POLICY google_calendar_connections_admin_read ON public.google_calendar_connections
  FOR SELECT TO authenticated USING (public.is_admin());

-- Safe browser-facing status. Never exposes Vault identifiers, OAuth subject, tokens or raw provider payloads.
CREATE OR REPLACE FUNCTION public.get_google_calendar_connection_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_user uuid := auth.uid(); v_row public.google_calendar_connections%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_profiles p WHERE p.id=v_user AND p.status='active' AND p.role='sales'
  ) THEN RAISE EXCEPTION 'Calendar integration is available only to active Sales users and Administrators.'; END IF;

  SELECT * INTO v_row FROM public.google_calendar_connections WHERE user_id=v_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'provider','google','status','disconnected','connected',false,'syncEnabled',true,'createMeet',true,
      'accountEmail','','calendarId','primary','calendarTimezone','',
      'lastSuccessfulSyncAt',NULL,'lastAttemptAt',NULL,'lastError',NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'provider','google','status',v_row.status,'connected',v_row.status='connected',
    'syncEnabled',v_row.sync_enabled,'createMeet',v_row.create_meet,
    'accountEmail',v_row.account_email,'calendarId',v_row.calendar_id,
    'calendarTimezone',v_row.calendar_timezone,
    'lastSuccessfulSyncAt',v_row.last_successful_sync_at,'lastAttemptAt',v_row.last_attempt_at,
    'lastError',CASE WHEN v_row.status IN ('error','reconnect_required') THEN v_row.last_error ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_google_calendar_connection_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_google_calendar_connection_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_google_calendar_preferences(
  p_sync_enabled boolean,
  p_create_meet boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_profiles p WHERE p.id=v_user AND p.status='active' AND p.role='sales'
  ) THEN RAISE EXCEPTION 'Calendar integration is available only to active Sales users and Administrators.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.google_calendar_connections WHERE user_id=v_user AND status<>'disconnected') THEN
    RAISE EXCEPTION 'Connect Google Calendar before changing synchronization preferences.';
  END IF;
  UPDATE public.google_calendar_connections
  SET sync_enabled=COALESCE(p_sync_enabled,true), create_meet=COALESCE(p_create_meet,true), updated_at=now()
  WHERE user_id=v_user;
  RETURN public.get_google_calendar_connection_status();
END;
$$;
REVOKE ALL ON FUNCTION public.set_google_calendar_preferences(boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_google_calendar_preferences(boolean,boolean) TO authenticated;

-- Service-only OAuth state registration/consumption. The browser only ever sees the random state token itself.
CREATE OR REPLACE FUNCTION public.service_create_google_oauth_state(
  p_state_hash text,
  p_user_id uuid,
  p_code_verifier text,
  p_return_path text DEFAULT '/admin/meetings?tab=availability'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_user_id IS NULL OR length(trim(COALESCE(p_state_hash,'')))<32 THEN RAISE EXCEPTION 'Invalid OAuth state.'; END IF;
  IF length(COALESCE(p_code_verifier,'')) NOT BETWEEN 43 AND 128 THEN RAISE EXCEPTION 'Invalid PKCE verifier.'; END IF;
  IF COALESCE(p_return_path,'') !~ '^/' OR COALESCE(p_return_path,'') ~ '^//' THEN
    RAISE EXCEPTION 'Invalid OAuth return path.';
  END IF;
  DELETE FROM public.google_calendar_oauth_states WHERE expires_at < now() OR consumed_at IS NOT NULL;
  INSERT INTO public.google_calendar_oauth_states(state_hash,user_id,code_verifier,return_path,expires_at)
  VALUES(lower(trim(p_state_hash)),p_user_id,p_code_verifier,p_return_path,now()+interval '10 minutes')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_consume_google_oauth_state(p_state_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_row public.google_calendar_oauth_states%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.google_calendar_oauth_states
  WHERE state_hash=lower(trim(COALESCE(p_state_hash,''))) AND consumed_at IS NULL AND expires_at>now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OAuth state is invalid or expired.'; END IF;
  UPDATE public.google_calendar_oauth_states SET consumed_at=now() WHERE id=v_row.id;
  RETURN jsonb_build_object('userId',v_row.user_id,'codeVerifier',v_row.code_verifier,'returnPath',v_row.return_path);
END;
$$;

-- Refresh token storage is isolated in Supabase Vault. The connection row holds only the opaque Vault id.
CREATE OR REPLACE FUNCTION public.service_store_google_refresh_token(p_user_id uuid,p_refresh_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE v_existing uuid; v_secret_id uuid; v_name text;
BEGIN
  IF p_user_id IS NULL OR length(trim(COALESCE(p_refresh_token,'')))<20 THEN RAISE EXCEPTION 'Valid refresh token required.'; END IF;
  v_name := 'google_calendar_refresh_'||replace(p_user_id::text,'-','');
  SELECT refresh_secret_id INTO v_existing FROM public.google_calendar_connections WHERE user_id=p_user_id;
  IF v_existing IS NOT NULL AND EXISTS (SELECT 1 FROM vault.secrets WHERE id=v_existing) THEN
    PERFORM vault.update_secret(v_existing,p_refresh_token,v_name,'Google Calendar refresh token for ProFox server-side synchronization.',NULL);
    v_secret_id:=v_existing;
  ELSE
    SELECT vault.create_secret(p_refresh_token,v_name,'Google Calendar refresh token for ProFox server-side synchronization.',NULL) INTO v_secret_id;
  END IF;
  RETURN v_secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_get_google_refresh_token(p_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, vault, pg_temp
AS $$
  SELECT COALESCE(v.decrypted_secret,'')
  FROM public.google_calendar_connections c
  LEFT JOIN vault.decrypted_secrets v ON v.id=c.refresh_secret_id
  WHERE c.user_id=p_user_id AND c.status IN ('connected','error','reconnect_required')
  LIMIT 1;
$$;

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
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR p_refresh_secret_id IS NULL THEN RAISE EXCEPTION 'User and secure refresh token are required.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id=p_user_id AND p.status='active' AND p.role IN ('sales','admin')) THEN
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
    google_subject=EXCLUDED.google_subject, account_email=EXCLUDED.account_email,
    calendar_id=EXCLUDED.calendar_id, calendar_timezone=EXCLUDED.calendar_timezone,
    scopes=EXCLUDED.scopes, refresh_secret_id=EXCLUDED.refresh_secret_id, status='connected',
    last_auth_at=now(), last_error=NULL, disconnected_at=NULL, updated_at=now();
  INSERT INTO public.user_calendar_settings(user_id,provider,calendar_email,timezone,connection_status,active,updated_at)
  VALUES(p_user_id,'Google',lower(COALESCE(p_account_email,'')),COALESCE(NULLIF(p_calendar_timezone,''),'UTC'),'Connected',true,now())
  ON CONFLICT(user_id) DO UPDATE SET provider='Google',calendar_email=EXCLUDED.calendar_email,
    connection_status='Connected',updated_at=now();
END;
$$;

CREATE OR REPLACE FUNCTION public.service_mark_google_connection_state(
  p_user_id uuid,
  p_status text,
  p_error text DEFAULT NULL,
  p_success boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  UPDATE public.user_calendar_settings
  SET provider=CASE WHEN p_status='disconnected' THEN 'Manual' ELSE 'Google' END,
      connection_status=CASE p_status WHEN 'connected' THEN 'Connected' WHEN 'reconnect_required' THEN 'Needs Reconnect' WHEN 'error' THEN 'Error' ELSE 'Not Connected' END,
      updated_at=now()
  WHERE user_id=p_user_id;
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
  SELECT refresh_secret_id INTO v_secret FROM public.google_calendar_connections WHERE user_id=p_user_id FOR UPDATE;
  UPDATE public.google_calendar_connections
  SET status='disconnected',sync_enabled=false,refresh_secret_id=NULL,last_error=NULL,disconnected_at=now(),updated_at=now()
  WHERE user_id=p_user_id;
  UPDATE public.user_calendar_settings SET provider='Manual',calendar_email='',connection_status='Not Connected',updated_at=now() WHERE user_id=p_user_id;
  IF v_secret IS NOT NULL THEN DELETE FROM vault.secrets WHERE id=v_secret; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.service_create_google_oauth_state(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_consume_google_oauth_state(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_store_google_refresh_token(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_get_google_refresh_token(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_upsert_google_calendar_connection(uuid,text,text,text,text,text[],uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_mark_google_connection_state(uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_disconnect_google_calendar(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_create_google_oauth_state(text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_consume_google_oauth_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_store_google_refresh_token(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_get_google_refresh_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_upsert_google_calendar_connection(uuid,text,text,text,text,text[],uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_mark_google_connection_state(uuid,text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_disconnect_google_calendar(uuid) TO service_role;

INSERT INTO public.system_configuration(config_key,config_value,description,updated_at)
VALUES(
 'google_calendar_settings',
 jsonb_build_object(
   'enabled',true,
   'provider','Google',
   'defaultCreateMeet',true,
   'busyRefreshMinutes',5,
   'busyLookaheadDays',90,
   'maxSyncAttempts',8,
   'baseRetrySeconds',30,
   'sendUpdates','none',
   'returnPath','/admin/meetings?tab=availability'
 ),
 'Admin-managed operational defaults for optional Google Calendar synchronization. OAuth credentials remain server-side environment secrets.',
 now()
)
ON CONFLICT(config_key) DO NOTHING;

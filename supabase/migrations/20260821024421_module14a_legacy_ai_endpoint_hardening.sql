-- Module 14A hardening: keep legacy Copilot RPCs compatible with the new optional AI control plane.

CREATE OR REPLACE FUNCTION public.get_productivity_ai_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT public.get_ai_assistance_status();
$$;

CREATE OR REPLACE FUNCTION public.admin_set_productivity_ai(
  p_enabled boolean,
  p_api_key text DEFAULT '',
  p_model text DEFAULT 'gemini-2.5-flash',
  p_max_output_tokens integer DEFAULT 1800
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_cfg jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='productivity_ai_settings';
  RETURN public.admin_set_ai_assistance_settings(
    p_enabled,
    p_api_key,
    p_model,
    p_max_output_tokens,
    COALESCE(v_cfg->'capabilities','{}'::jsonb),
    COALESCE((v_cfg->>'maxRequestsPerUserHour')::integer,20),
    COALESCE((v_cfg->>'maxInputCharacters')::integer,24000)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.service_log_productivity_ai_run(
  p_user_id uuid,
  p_mode text,
  p_entity_type text,
  p_entity_id uuid,
  p_model text,
  p_status text,
  p_output_preview text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  RETURN public.service_log_ai_assistance_run(
    p_user_id,
    p_mode,
    p_entity_type,
    p_entity_id,
    p_model,
    CASE WHEN p_status='Failed' THEN 'Failed' ELSE 'Completed' END,
    0,
    length(COALESCE(p_output_preview,'')),
    0,
    ''
  );
END;
$$;

REVOKE ALL ON FUNCTION public.service_log_productivity_ai_run(uuid,text,text,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_log_productivity_ai_run(uuid,text,text,uuid,text,text,text) TO service_role;

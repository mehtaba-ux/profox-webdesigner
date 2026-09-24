-- Module 14 hardening: blocked/off requests must not consume future provider request quota.
CREATE OR REPLACE FUNCTION public.service_check_ai_assistance_request(p_user_id uuid,p_mode text,p_input_chars integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','vault','pg_temp'
AS $$
DECLARE
  v_cfg jsonb; v_secret text; v_cap text:=public.ai_capability_from_mode(p_mode); v_enabled boolean; v_cap_enabled boolean;
  v_rate int; v_limit int; v_recent int; v_ext boolean; v_ext_rate int; v_ext_recent int;
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=p_user_id AND status='active' AND role NOT IN ('customer','pending')) THEN
    RETURN jsonb_build_object('allowed',false,'code','USER_NOT_ACTIVE');
  END IF;
  IF v_cap='' THEN RETURN jsonb_build_object('allowed',false,'code','UNSUPPORTED_CAPABILITY'); END IF;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='productivity_ai_settings';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='profox_productivity_gemini_api_key' LIMIT 1;
  v_enabled:=COALESCE((v_cfg->>'enabled')::boolean,false);
  v_cap_enabled:=COALESCE((v_cfg->'capabilities'->>v_cap)::boolean,false);
  v_rate:=LEAST(GREATEST(COALESCE((v_cfg->>'maxRequestsPerUserHour')::int,20),1),200);
  v_limit:=LEAST(GREATEST(COALESCE((v_cfg->>'maxInputCharacters')::int,24000),2000),100000);
  v_ext:=COALESCE((v_cfg->>'externalWebResearchEnabled')::boolean,false) AND v_cap IN ('lead_research','loom_preparation');
  v_ext_rate:=LEAST(GREATEST(COALESCE((v_cfg->>'externalResearchMaxRequestsPerUserHour')::int,8),1),50);
  IF NOT v_enabled THEN RETURN jsonb_build_object('allowed',false,'code','AI_DISABLED','capability',v_cap); END IF;
  IF NOT v_cap_enabled THEN RETURN jsonb_build_object('allowed',false,'code','CAPABILITY_DISABLED','capability',v_cap); END IF;
  IF COALESCE(v_secret,'')='' THEN RETURN jsonb_build_object('allowed',false,'code','PROVIDER_NOT_CONFIGURED','capability',v_cap); END IF;
  IF COALESCE(p_input_chars,0)>v_limit THEN RETURN jsonb_build_object('allowed',false,'code','INPUT_TOO_LARGE','capability',v_cap,'maxInputCharacters',v_limit); END IF;
  SELECT count(*) INTO v_recent
  FROM public.productivity_ai_runs
  WHERE user_id=p_user_id AND status IN ('Completed','Failed') AND created_at>now()-interval '1 hour';
  IF v_recent>=v_rate THEN RETURN jsonb_build_object('allowed',false,'code','RATE_LIMIT','capability',v_cap,'maxRequestsPerUserHour',v_rate); END IF;
  IF v_ext THEN
    SELECT count(*) INTO v_ext_recent
    FROM public.productivity_ai_runs
    WHERE user_id=p_user_id AND status IN ('Completed','Failed') AND external_research_used=true AND created_at>now()-interval '1 hour';
    IF v_ext_recent>=v_ext_rate THEN v_ext:=false; END IF;
  END IF;
  RETURN (v_cfg-'providerConfigured') || jsonb_build_object('allowed',true,'capability',v_cap,'apiKey',v_secret,'externalResearchAllowed',v_ext,'protectedActionsAllowed',false,'coreSystemIndependent',true);
END;
$$;

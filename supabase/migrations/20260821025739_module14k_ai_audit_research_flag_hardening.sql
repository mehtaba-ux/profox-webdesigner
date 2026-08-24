-- Keep external research accounting separate from errors.
ALTER TABLE public.productivity_ai_runs
  ADD COLUMN IF NOT EXISTS external_research_used boolean NOT NULL DEFAULT false;

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
  SELECT count(*) INTO v_recent FROM public.productivity_ai_runs WHERE user_id=p_user_id AND created_at>now()-interval '1 hour';
  IF v_recent>=v_rate THEN RETURN jsonb_build_object('allowed',false,'code','RATE_LIMIT','capability',v_cap,'maxRequestsPerUserHour',v_rate); END IF;
  IF v_ext THEN
    SELECT count(*) INTO v_ext_recent FROM public.productivity_ai_runs WHERE user_id=p_user_id AND external_research_used=true AND created_at>now()-interval '1 hour';
    IF v_ext_recent>=v_ext_rate THEN v_ext:=false; END IF;
  END IF;
  RETURN (v_cfg-'providerConfigured') || jsonb_build_object('allowed',true,'capability',v_cap,'apiKey',v_secret,'externalResearchAllowed',v_ext,'protectedActionsAllowed',false,'coreSystemIndependent',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.service_log_ai_assistance_run_v2(
  p_user_id uuid,p_mode text,p_entity_type text,p_entity_id uuid,p_model text,p_status text,p_input_chars integer DEFAULT 0,
  p_output_chars integer DEFAULT 0,p_latency_ms integer DEFAULT 0,p_error_code text DEFAULT '',p_external_research_used boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_id uuid; v_status text:=CASE WHEN p_status IN ('Completed','Failed','Blocked','Disabled') THEN p_status ELSE 'Failed' END;
BEGIN
  INSERT INTO public.productivity_ai_runs(user_id,mode,capability,entity_type,entity_id,model,status,output_preview,input_chars,output_chars,latency_ms,error_code,external_research_used)
  VALUES(p_user_id,left(trim(COALESCE(p_mode,'')),80),COALESCE(NULLIF(public.ai_capability_from_mode(p_mode),''),'unknown'),left(trim(COALESCE(p_entity_type,'')),80),p_entity_id,
    left(trim(COALESCE(p_model,'')),120),v_status,'',GREATEST(COALESCE(p_input_chars,0),0),GREATEST(COALESCE(p_output_chars,0),0),GREATEST(COALESCE(p_latency_ms,0),0),left(COALESCE(p_error_code,''),120),COALESCE(p_external_research_used,false))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_ai_usage_summary(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_days int:=LEAST(GREATEST(COALESCE(p_days,30),1),365);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  RETURN jsonb_build_object(
    'days',v_days,
    'totalRuns',(SELECT count(*) FROM public.productivity_ai_runs WHERE created_at>=now()-make_interval(days=>v_days)),
    'completed',(SELECT count(*) FROM public.productivity_ai_runs WHERE created_at>=now()-make_interval(days=>v_days) AND status='Completed'),
    'failed',(SELECT count(*) FROM public.productivity_ai_runs WHERE created_at>=now()-make_interval(days=>v_days) AND status='Failed'),
    'blocked',(SELECT count(*) FROM public.productivity_ai_runs WHERE created_at>=now()-make_interval(days=>v_days) AND status IN ('Blocked','Disabled')),
    'externalResearchRuns',(SELECT count(*) FROM public.productivity_ai_runs WHERE created_at>=now()-make_interval(days=>v_days) AND external_research_used=true),
    'averageLatencyMs',(SELECT COALESCE(round(avg(latency_ms)),0) FROM public.productivity_ai_runs WHERE created_at>=now()-make_interval(days=>v_days) AND status='Completed'),
    'inputCharacters',(SELECT COALESCE(sum(input_chars),0) FROM public.productivity_ai_runs WHERE created_at>=now()-make_interval(days=>v_days)),
    'outputCharacters',(SELECT COALESCE(sum(output_chars),0) FROM public.productivity_ai_runs WHERE created_at>=now()-make_interval(days=>v_days)),
    'byCapability',COALESCE((SELECT jsonb_agg(jsonb_build_object('capability',capability,'runs',runs,'completed',completed,'failed',failed,'blocked',blocked,'externalResearch',external_research) ORDER BY runs DESC) FROM (SELECT capability,count(*) runs,count(*) FILTER(WHERE status='Completed') completed,count(*) FILTER(WHERE status='Failed') failed,count(*) FILTER(WHERE status IN ('Blocked','Disabled')) blocked,count(*) FILTER(WHERE external_research_used) external_research FROM public.productivity_ai_runs WHERE created_at>=now()-make_interval(days=>v_days) GROUP BY capability) s),'[]'::jsonb),
    'privacy','Usage metadata only. Full prompts and generated outputs are not stored in this audit summary.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.service_log_ai_assistance_run_v2(uuid,text,text,uuid,text,text,integer,integer,integer,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_log_ai_assistance_run_v2(uuid,text,text,uuid,text,text,integer,integer,integer,text,boolean) TO service_role;

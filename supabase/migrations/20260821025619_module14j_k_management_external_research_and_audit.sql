-- Module 14J/K: Founder intelligence, optional external research, and privacy-safe AI usage controls.

ALTER TABLE public.productivity_ai_runs ALTER COLUMN entity_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.ai_capability_from_mode(p_mode text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public','pg_temp'
AS $$
SELECT CASE lower(trim(COALESCE(p_mode,'')))
  WHEN 'lead_research' THEN 'lead_research'
  WHEN 'follow_up_draft' THEN 'outreach_drafting'
  WHEN 'loom_brief' THEN 'loom_preparation'
  WHEN 'meeting_brief' THEN 'meeting_preparation'
  WHEN 'meeting_summary' THEN 'meeting_summary'
  WHEN 'objection_coaching' THEN 'sales_coaching'
  WHEN 'lost_reason_summary' THEN 'sales_coaching'
  WHEN 'next_action_explanation' THEN 'next_best_action_explanation'
  WHEN 'quotation_draft' THEN 'quotation_assistant'
  WHEN 'project_handover' THEN 'project_handover'
  WHEN 'task_breakdown' THEN 'project_task_breakdown'
  WHEN 'management_brief' THEN 'management_intelligence'
  ELSE '' END;
$$;

UPDATE public.system_configuration
SET config_value = COALESCE(config_value,'{}'::jsonb) || jsonb_build_object(
  'externalWebResearchEnabled',COALESCE((config_value->>'externalWebResearchEnabled')::boolean,false),
  'externalResearchMaxRequestsPerUserHour',COALESCE((config_value->>'externalResearchMaxRequestsPerUserHour')::integer,8)
), updated_at=now()
WHERE config_key='productivity_ai_settings';

CREATE OR REPLACE FUNCTION public.admin_set_ai_assistance_settings_v2(
  p_enabled boolean,
  p_api_key text DEFAULT '',
  p_model text DEFAULT 'gemini-2.5-flash',
  p_max_output_tokens integer DEFAULT 1800,
  p_capabilities jsonb DEFAULT '{}'::jsonb,
  p_max_requests_per_user_hour integer DEFAULT 20,
  p_max_input_characters integer DEFAULT 24000,
  p_external_web_research_enabled boolean DEFAULT false,
  p_external_research_max_requests_per_user_hour integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','vault','pg_temp'
AS $$
DECLARE
  v_secret_id uuid; v_has boolean; v_cfg jsonb; v_model text:=trim(COALESCE(NULLIF(p_model,''),'gemini-2.5-flash'));
  v_max int:=LEAST(GREATEST(COALESCE(p_max_output_tokens,1800),256),8192);
  v_rate int:=LEAST(GREATEST(COALESCE(p_max_requests_per_user_hour,20),1),200);
  v_input int:=LEAST(GREATEST(COALESCE(p_max_input_characters,24000),2000),100000);
  v_ext_rate int:=LEAST(GREATEST(COALESCE(p_external_research_max_requests_per_user_hour,8),1),50);
  v_allowed_keys text[]:=ARRAY['lead_research','outreach_drafting','loom_preparation','meeting_preparation','meeting_summary','sales_coaching','next_best_action_explanation','quotation_assistant','project_handover','project_task_breakdown','management_intelligence'];
  v_caps jsonb:=jsonb_build_object(
    'lead_research',false,'outreach_drafting',false,'loom_preparation',false,'meeting_preparation',false,'meeting_summary',false,
    'sales_coaching',false,'next_best_action_explanation',false,'quotation_assistant',false,'project_handover',false,
    'project_task_breakdown',false,'management_intelligence',false
  );
  k text; v jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  IF v_model !~ '^[a-zA-Z0-9._-]+$' THEN RAISE EXCEPTION 'Invalid Gemini model name.'; END IF;
  IF p_capabilities IS NULL OR jsonb_typeof(p_capabilities)<>'object' THEN RAISE EXCEPTION 'Capabilities must be a JSON object.'; END IF;
  FOR k,v IN SELECT key,value FROM jsonb_each(p_capabilities) LOOP
    IF NOT (k=ANY(v_allowed_keys)) THEN RAISE EXCEPTION 'Unsupported AI capability: %',k; END IF;
    IF jsonb_typeof(v)<>'boolean' THEN RAISE EXCEPTION 'AI capability % must be true or false.',k; END IF;
    v_caps:=jsonb_set(v_caps,ARRAY[k],v,true);
  END LOOP;

  SELECT id INTO v_secret_id FROM vault.secrets WHERE name='profox_productivity_gemini_api_key' LIMIT 1;
  IF trim(COALESCE(p_api_key,''))<>'' THEN
    IF v_secret_id IS NULL THEN
      PERFORM vault.create_secret(trim(p_api_key),'profox_productivity_gemini_api_key','ProFox optional AI provider key',NULL);
    ELSE
      PERFORM vault.update_secret(v_secret_id,trim(p_api_key),'profox_productivity_gemini_api_key','ProFox optional AI provider key',NULL);
    END IF;
  END IF;
  SELECT EXISTS(SELECT 1 FROM vault.secrets WHERE name='profox_productivity_gemini_api_key') INTO v_has;
  IF COALESCE(p_enabled,false) AND NOT v_has THEN RAISE EXCEPTION 'AI provider key is required before enabling AI assistance.'; END IF;
  IF COALESCE(p_external_web_research_enabled,false) AND NOT COALESCE(p_enabled,false) THEN RAISE EXCEPTION 'Enable AI assistance before enabling external web research.'; END IF;

  v_cfg:=jsonb_build_object(
    'enabled',COALESCE(p_enabled,false),'provider','gemini','model',v_model,'providerConfigured',v_has,'maxOutputTokens',v_max,
    'maxRequestsPerUserHour',v_rate,'maxInputCharacters',v_input,'humanReviewRequired',true,'coreSystemIndependent',true,
    'protectedActionsAllowed',false,'capabilities',v_caps,
    'externalWebResearchEnabled',COALESCE(p_external_web_research_enabled,false),
    'externalResearchMaxRequestsPerUserHour',v_ext_rate
  );
  INSERT INTO public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  VALUES('productivity_ai_settings',v_cfg,'Optional ProFox AI assistance. Core system and automations remain fully operational with AI disabled.',auth.uid(),now())
  ON CONFLICT(config_key) DO UPDATE SET config_value=EXCLUDED.config_value,description=EXCLUDED.description,updated_by=auth.uid(),updated_at=now();
  RETURN v_cfg || jsonb_build_object('canConfigure',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_ai_assistance_settings(
  p_enabled boolean,
  p_api_key text DEFAULT '',
  p_model text DEFAULT 'gemini-2.5-flash',
  p_max_output_tokens integer DEFAULT 1800,
  p_capabilities jsonb DEFAULT '{}'::jsonb,
  p_max_requests_per_user_hour integer DEFAULT 20,
  p_max_input_characters integer DEFAULT 24000
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_cfg jsonb;
BEGIN
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='productivity_ai_settings';
  RETURN public.admin_set_ai_assistance_settings_v2(
    p_enabled,p_api_key,p_model,p_max_output_tokens,p_capabilities,p_max_requests_per_user_hour,p_max_input_characters,
    COALESCE((v_cfg->>'externalWebResearchEnabled')::boolean,false),
    COALESCE((v_cfg->>'externalResearchMaxRequestsPerUserHour')::integer,8)
  );
END;
$$;

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
    SELECT count(*) INTO v_ext_recent FROM public.productivity_ai_runs WHERE user_id=p_user_id AND capability IN ('lead_research','loom_preparation') AND created_at>now()-interval '1 hour' AND error_code='EXTERNAL_RESEARCH';
    IF v_ext_recent>=v_ext_rate THEN v_ext:=false; END IF;
  END IF;
  RETURN (v_cfg-'providerConfigured') || jsonb_build_object('allowed',true,'capability',v_cap,'apiKey',v_secret,'externalResearchAllowed',v_ext,'protectedActionsAllowed',false,'coreSystemIndependent',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_management_context(p_period_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_days int:=LEAST(GREATEST(COALESCE(p_period_days,30),7),365); v_dashboard jsonb; v_brief jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  IF NOT public.ai_assistance_is_enabled('management_intelligence') THEN RAISE EXCEPTION 'Management AI intelligence is currently disabled.'; END IF;
  v_dashboard:=public.get_business_intelligence_dashboard(v_days);
  v_brief:=public.get_business_intelligence_brief(v_days);
  RETURN jsonb_build_object(
    'periodDays',v_days,
    'primaryCurrency',v_dashboard->'primaryCurrency',
    'health',v_dashboard->'health',
    'overview',v_dashboard->'overview',
    'sales',v_dashboard->'sales',
    'finance',v_dashboard->'finance',
    'delivery',jsonb_build_object(
      'activeProjects',v_dashboard#>'{delivery,activeProjects}',
      'atRiskProjects',v_dashboard#>'{delivery,atRiskProjects}',
      'overdueTasks',v_dashboard#>'{delivery,overdueTasks}',
      'tasksDueNext7Days',v_dashboard#>'{delivery,tasksDueNext7Days}',
      'unassignedProjects',v_dashboard#>'{delivery,unassignedProjects}'
    ),
    'recruitment',v_dashboard->'recruitment',
    'team',jsonb_build_object(
      'activeStaff',v_dashboard#>'{team,activeStaff}',
      'atCapacity',v_dashboard#>'{team,atCapacity}',
      'dayClosesLast7Days',v_dashboard#>'{team,dayClosesLast7Days}'
    ),
    'exceptions',COALESCE(v_dashboard->'exceptions','[]'::jsonb),
    'deterministicBrief',v_brief,
    'guardrail','Explain and prioritize only. Do not alter targets, money, ownership, permissions or workflow state.'
  );
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
    'averageLatencyMs',(SELECT COALESCE(round(avg(latency_ms)),0) FROM public.productivity_ai_runs WHERE created_at>=now()-make_interval(days=>v_days) AND status='Completed'),
    'inputCharacters',(SELECT COALESCE(sum(input_chars),0) FROM public.productivity_ai_runs WHERE created_at>=now()-make_interval(days=>v_days)),
    'outputCharacters',(SELECT COALESCE(sum(output_chars),0) FROM public.productivity_ai_runs WHERE created_at>=now()-make_interval(days=>v_days)),
    'byCapability',COALESCE((SELECT jsonb_agg(jsonb_build_object('capability',capability,'runs',runs,'completed',completed,'failed',failed,'blocked',blocked) ORDER BY runs DESC) FROM (SELECT capability,count(*) runs,count(*) FILTER(WHERE status='Completed') completed,count(*) FILTER(WHERE status='Failed') failed,count(*) FILTER(WHERE status IN ('Blocked','Disabled')) blocked FROM public.productivity_ai_runs WHERE created_at>=now()-make_interval(days=>v_days) GROUP BY capability) s),'[]'::jsonb),
    'privacy','Usage metadata only. Full prompts and generated outputs are not stored in this audit summary.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_ai_assistance_settings_v2(boolean,text,text,integer,jsonb,integer,integer,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_ai_assistance_settings_v2(boolean,text,text,integer,jsonb,integer,integer,boolean,integer) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_ai_management_context(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_ai_management_context(integer) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_get_ai_usage_summary(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_ai_usage_summary(integer) TO authenticated,service_role;

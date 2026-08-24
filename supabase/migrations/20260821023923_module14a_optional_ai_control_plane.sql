-- Module 14A: Optional AI control plane. Core ProFox operations remain deterministic and independent of AI.

ALTER TABLE public.productivity_ai_runs
  ADD COLUMN IF NOT EXISTS capability text NOT NULL DEFAULT 'legacy_copilot',
  ADD COLUMN IF NOT EXISTS input_chars integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_chars integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latency_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_code text NOT NULL DEFAULT '';

ALTER TABLE public.productivity_ai_runs DROP CONSTRAINT IF EXISTS productivity_ai_runs_status_check;
ALTER TABLE public.productivity_ai_runs ADD CONSTRAINT productivity_ai_runs_status_check
  CHECK (status = ANY (ARRAY['Completed'::text,'Failed'::text,'Blocked'::text,'Disabled'::text]));

UPDATE public.productivity_ai_runs
SET capability = CASE mode
  WHEN 'meeting_brief' THEN 'meeting_preparation'
  WHEN 'follow_up_draft' THEN 'outreach_drafting'
  WHEN 'quotation_draft' THEN 'quotation_assistant'
  WHEN 'project_handover' THEN 'project_handover'
  WHEN 'task_breakdown' THEN 'project_task_breakdown'
  WHEN 'lost_reason_summary' THEN 'management_intelligence'
  ELSE COALESCE(NULLIF(capability,''),'legacy_copilot') END;

CREATE INDEX IF NOT EXISTS idx_productivity_ai_runs_user_created
  ON public.productivity_ai_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_productivity_ai_runs_capability_created
  ON public.productivity_ai_runs(capability, created_at DESC);

INSERT INTO public.system_configuration(config_key,config_value,description,updated_at)
VALUES(
  'productivity_ai_settings',
  jsonb_build_object(
    'enabled',false,
    'provider','gemini',
    'model','gemini-2.5-flash',
    'providerConfigured',false,
    'maxOutputTokens',1800,
    'maxRequestsPerUserHour',20,
    'maxInputCharacters',24000,
    'humanReviewRequired',true,
    'coreSystemIndependent',true,
    'protectedActionsAllowed',false,
    'capabilities',jsonb_build_object(
      'lead_research',false,
      'outreach_drafting',false,
      'loom_preparation',false,
      'meeting_preparation',false,
      'meeting_summary',false,
      'sales_coaching',false,
      'next_best_action_explanation',false,
      'quotation_assistant',false,
      'project_handover',false,
      'project_task_breakdown',false,
      'management_intelligence',false
    )
  ),
  'Optional ProFox AI assistance. Core system and automations remain fully operational with AI disabled.',
  now()
)
ON CONFLICT(config_key) DO UPDATE
SET config_value = COALESCE(public.system_configuration.config_value,'{}'::jsonb)
  || jsonb_build_object(
    'enabled',false,
    'maxRequestsPerUserHour',COALESCE((public.system_configuration.config_value->>'maxRequestsPerUserHour')::int,20),
    'maxInputCharacters',COALESCE((public.system_configuration.config_value->>'maxInputCharacters')::int,24000),
    'humanReviewRequired',true,
    'coreSystemIndependent',true,
    'protectedActionsAllowed',false,
    'capabilities',COALESCE(public.system_configuration.config_value->'capabilities',jsonb_build_object(
      'lead_research',false,
      'outreach_drafting',false,
      'loom_preparation',false,
      'meeting_preparation',false,
      'meeting_summary',false,
      'sales_coaching',false,
      'next_best_action_explanation',false,
      'quotation_assistant',false,
      'project_handover',false,
      'project_task_breakdown',false,
      'management_intelligence',false
    ))
  ),
  description=EXCLUDED.description,
  updated_at=now();

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
  WHEN 'next_action_explanation' THEN 'next_best_action_explanation'
  WHEN 'quotation_draft' THEN 'quotation_assistant'
  WHEN 'project_handover' THEN 'project_handover'
  WHEN 'task_breakdown' THEN 'project_task_breakdown'
  WHEN 'lost_reason_summary' THEN 'management_intelligence'
  WHEN 'management_brief' THEN 'management_intelligence'
  ELSE '' END;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_assistance_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','vault','pg_temp'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_cfg jsonb; v_has boolean; v_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=v_uid AND status='active' AND role NOT IN ('customer','pending')) THEN
    RAISE EXCEPTION 'Active staff access required.';
  END IF;
  v_admin:=public.is_admin();
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='productivity_ai_settings';
  IF v_admin THEN
    SELECT EXISTS(SELECT 1 FROM vault.secrets WHERE name='profox_productivity_gemini_api_key') INTO v_has;
  ELSE
    v_has:=COALESCE((v_cfg->>'providerConfigured')::boolean,false);
  END IF;
  RETURN (COALESCE(v_cfg,'{}'::jsonb)-'apiKey') || jsonb_build_object(
    'providerConfigured',v_has,
    'canConfigure',v_admin,
    'coreSystemIndependent',true,
    'protectedActionsAllowed',false,
    'humanReviewRequired',true
  );
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
SET search_path TO 'public','vault','pg_temp'
AS $$
DECLARE
  v_secret_id uuid; v_has boolean; v_cfg jsonb; v_model text:=trim(COALESCE(NULLIF(p_model,''),'gemini-2.5-flash'));
  v_max int:=LEAST(GREATEST(COALESCE(p_max_output_tokens,1800),256),8192);
  v_rate int:=LEAST(GREATEST(COALESCE(p_max_requests_per_user_hour,20),1),200);
  v_input int:=LEAST(GREATEST(COALESCE(p_max_input_characters,24000),2000),100000);
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

  v_cfg:=jsonb_build_object(
    'enabled',COALESCE(p_enabled,false),'provider','gemini','model',v_model,'providerConfigured',v_has,'maxOutputTokens',v_max,
    'maxRequestsPerUserHour',v_rate,'maxInputCharacters',v_input,'humanReviewRequired',true,'coreSystemIndependent',true,
    'protectedActionsAllowed',false,'capabilities',v_caps
  );
  INSERT INTO public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  VALUES('productivity_ai_settings',v_cfg,'Optional ProFox AI assistance. Core system and automations remain fully operational with AI disabled.',auth.uid(),now())
  ON CONFLICT(config_key) DO UPDATE SET config_value=EXCLUDED.config_value,description=EXCLUDED.description,updated_by=auth.uid(),updated_at=now();
  RETURN v_cfg || jsonb_build_object('canConfigure',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.service_get_productivity_ai_config()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','vault','pg_temp'
AS $$
DECLARE v_cfg jsonb; v_secret text;
BEGIN
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='productivity_ai_settings';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='profox_productivity_gemini_api_key' LIMIT 1;
  RETURN COALESCE(v_cfg,'{}'::jsonb)||jsonb_build_object('apiKey',COALESCE(v_secret,''));
END;
$$;

CREATE OR REPLACE FUNCTION public.service_check_ai_assistance_request(p_user_id uuid,p_mode text,p_input_chars integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','vault','pg_temp'
AS $$
DECLARE
  v_cfg jsonb; v_secret text; v_cap text:=public.ai_capability_from_mode(p_mode); v_enabled boolean; v_cap_enabled boolean;
  v_rate int; v_limit int; v_recent int;
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
  IF NOT v_enabled THEN RETURN jsonb_build_object('allowed',false,'code','AI_DISABLED','capability',v_cap); END IF;
  IF NOT v_cap_enabled THEN RETURN jsonb_build_object('allowed',false,'code','CAPABILITY_DISABLED','capability',v_cap); END IF;
  IF COALESCE(v_secret,'')='' THEN RETURN jsonb_build_object('allowed',false,'code','PROVIDER_NOT_CONFIGURED','capability',v_cap); END IF;
  IF COALESCE(p_input_chars,0)>v_limit THEN RETURN jsonb_build_object('allowed',false,'code','INPUT_TOO_LARGE','capability',v_cap,'maxInputCharacters',v_limit); END IF;
  SELECT count(*) INTO v_recent FROM public.productivity_ai_runs WHERE user_id=p_user_id AND created_at>now()-interval '1 hour';
  IF v_recent>=v_rate THEN RETURN jsonb_build_object('allowed',false,'code','RATE_LIMIT','capability',v_cap,'maxRequestsPerUserHour',v_rate); END IF;
  RETURN (v_cfg-'providerConfigured') || jsonb_build_object('allowed',true,'capability',v_cap,'apiKey',v_secret,'protectedActionsAllowed',false,'coreSystemIndependent',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.service_log_ai_assistance_run(
  p_user_id uuid,p_mode text,p_entity_type text,p_entity_id uuid,p_model text,p_status text,p_input_chars integer DEFAULT 0,
  p_output_chars integer DEFAULT 0,p_latency_ms integer DEFAULT 0,p_error_code text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_id uuid; v_status text:=CASE WHEN p_status IN ('Completed','Failed','Blocked','Disabled') THEN p_status ELSE 'Failed' END;
BEGIN
  INSERT INTO public.productivity_ai_runs(user_id,mode,capability,entity_type,entity_id,model,status,output_preview,input_chars,output_chars,latency_ms,error_code)
  VALUES(p_user_id,left(trim(COALESCE(p_mode,'')),80),COALESCE(NULLIF(public.ai_capability_from_mode(p_mode),''),'unknown'),left(trim(COALESCE(p_entity_type,'')),80),p_entity_id,
    left(trim(COALESCE(p_model,'')),120),v_status,'',GREATEST(COALESCE(p_input_chars,0),0),GREATEST(COALESCE(p_output_chars,0),0),GREATEST(COALESCE(p_latency_ms,0),0),left(COALESCE(p_error_code,''),120))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_assistance_is_enabled(p_capability text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_cfg jsonb; v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=v_uid AND status='active' AND role NOT IN ('customer','pending')) THEN RETURN false; END IF;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='productivity_ai_settings';
  RETURN COALESCE((v_cfg->>'enabled')::boolean,false) AND COALESCE((v_cfg->'capabilities'->>lower(trim(COALESCE(p_capability,''))))::boolean,false);
END;
$$;

REVOKE ALL ON FUNCTION public.service_get_productivity_ai_config() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_check_ai_assistance_request(uuid,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_log_ai_assistance_run(uuid,text,text,uuid,text,text,integer,integer,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_productivity_ai_config() TO service_role;
GRANT EXECUTE ON FUNCTION public.service_check_ai_assistance_request(uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_log_ai_assistance_run(uuid,text,text,uuid,text,text,integer,integer,integer,text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_ai_assistance_settings(boolean,text,text,integer,jsonb,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_ai_assistance_settings(boolean,text,text,integer,jsonb,integer,integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_ai_assistance_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_assistance_status() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ai_assistance_is_enabled(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_assistance_is_enabled(text) TO authenticated, service_role;

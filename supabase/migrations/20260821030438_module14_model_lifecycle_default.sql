-- Move the unconfigured optional AI default away from the retiring Gemini 2.5 Flash model.
UPDATE public.system_configuration
SET config_value=jsonb_set(COALESCE(config_value,'{}'::jsonb),'{model}',to_jsonb('gemini-3.6-flash'::text),true),updated_at=now()
WHERE config_key='productivity_ai_settings'
  AND COALESCE(config_value->>'model','gemini-2.5-flash')='gemini-2.5-flash'
  AND NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='profox_productivity_gemini_api_key');

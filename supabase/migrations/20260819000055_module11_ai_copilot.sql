-- Module 11F — Controlled ProFox AI Copilot.
-- AI is advisory only: it receives authorized context and returns drafts/briefs. It cannot mutate critical business state.

CREATE TABLE IF NOT EXISTS public.productivity_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  mode text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  model text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Completed' CHECK (status IN ('Completed','Failed')),
  output_preview text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_productivity_ai_runs_user_created ON public.productivity_ai_runs(user_id,created_at DESC);
ALTER TABLE public.productivity_ai_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.productivity_ai_runs FROM anon,authenticated;
GRANT SELECT ON TABLE public.productivity_ai_runs TO authenticated;
CREATE POLICY productivity_ai_runs_self_or_admin_select ON public.productivity_ai_runs FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR (SELECT public.is_admin()));

INSERT INTO public.system_configuration(config_key,config_value,description,updated_at)
VALUES('productivity_ai_settings','{"enabled":false,"provider":"gemini","model":"gemini-2.5-flash","providerConfigured":false,"maxOutputTokens":1800}'::jsonb,'Controlled ProFox AI Copilot settings. AI produces drafts only and cannot perform protected business transitions.',now())
ON CONFLICT(config_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_productivity_ai_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,vault,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_cfg jsonb;v_has boolean;v_admin boolean;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=v_uid AND status='active' AND role NOT IN ('customer','pending')) THEN RAISE EXCEPTION 'Active staff access required.'; END IF;
 v_admin:=public.is_admin();SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='productivity_ai_settings';
 IF v_admin THEN SELECT EXISTS(SELECT 1 FROM vault.secrets WHERE name='profox_productivity_gemini_api_key') INTO v_has; ELSE v_has:=COALESCE((v_cfg->>'providerConfigured')::boolean,false); END IF;
 RETURN (v_cfg-'apiKey')||jsonb_build_object('providerConfigured',v_has,'canConfigure',v_admin);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_productivity_ai(p_enabled boolean,p_api_key text DEFAULT '',p_model text DEFAULT 'gemini-2.5-flash',p_max_output_tokens integer DEFAULT 1800)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,vault,pg_temp AS $$
DECLARE v_secret_id uuid;v_has boolean;v_cfg jsonb;v_model text:=trim(COALESCE(NULLIF(p_model,''),'gemini-2.5-flash'));v_max int:=LEAST(GREATEST(COALESCE(p_max_output_tokens,1800),256),8192);
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
 IF v_model !~ '^[a-zA-Z0-9._-]+$' THEN RAISE EXCEPTION 'Invalid Gemini model name.'; END IF;
 SELECT id INTO v_secret_id FROM vault.secrets WHERE name='profox_productivity_gemini_api_key' LIMIT 1;
 IF trim(COALESCE(p_api_key,''))<>'' THEN
   IF v_secret_id IS NULL THEN PERFORM vault.create_secret(trim(p_api_key),'profox_productivity_gemini_api_key','ProFox Productivity Gemini API key',NULL); ELSE PERFORM vault.update_secret(v_secret_id,trim(p_api_key),'profox_productivity_gemini_api_key','ProFox Productivity Gemini API key',NULL); END IF;
 END IF;
 SELECT EXISTS(SELECT 1 FROM vault.secrets WHERE name='profox_productivity_gemini_api_key') INTO v_has;
 IF p_enabled AND NOT v_has THEN RAISE EXCEPTION 'Gemini API key is required before enabling AI Copilot.'; END IF;
 v_cfg:=jsonb_build_object('enabled',COALESCE(p_enabled,false),'provider','gemini','model',v_model,'providerConfigured',v_has,'maxOutputTokens',v_max);
 INSERT INTO public.system_configuration(config_key,config_value,description,updated_by,updated_at) VALUES('productivity_ai_settings',v_cfg,'Controlled ProFox AI Copilot settings. AI produces drafts only and cannot perform protected business transitions.',auth.uid(),now()) ON CONFLICT(config_key) DO UPDATE SET config_value=EXCLUDED.config_value,description=EXCLUDED.description,updated_by=auth.uid(),updated_at=now();
 RETURN v_cfg;
END; $$;

CREATE OR REPLACE FUNCTION public.get_productivity_ai_context(p_entity_type text,p_entity_id uuid,p_mode text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_type text:=lower(trim(COALESCE(p_entity_type,'')));v_mode text:=lower(trim(COALESCE(p_mode,'')));v_context jsonb;v_next jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 IF v_mode NOT IN ('meeting_brief','follow_up_draft','quotation_draft','project_handover','task_breakdown','lost_reason_summary') THEN RAISE EXCEPTION 'Unsupported Copilot mode.'; END IF;
 IF NOT public.productivity_can_access_entity(v_type,p_entity_id) THEN RAISE EXCEPTION 'You do not have access to this record.'; END IF;
 v_next:=public.get_productivity_next_action(v_type,p_entity_id);
 IF v_type='meeting' THEN
   SELECT jsonb_build_object('meeting',jsonb_build_object('title',m.title,'meetingType',m.meeting_type,'startAt',m.start_at,'timezone',m.timezone,'status',m.status,'outcome',m.outcome,'requirements',m.requirements_summary,'problems',m.problems_identified,'decisionMakers',m.decision_makers,'commercialNotes',m.commercial_notes,'timeline',m.timeline_notes,'nextStep',m.next_step),'prospect',jsonb_build_object('name',COALESCE(b.contact_name,o.contact_name,l.contact_name,m.attendee_name),'company',COALESCE(b.company_name,o.company_name,l.company_name),'email',COALESCE(b.email,o.email,l.email,m.attendee_email),'website',COALESCE(b.website,o.website,l.website),'country',COALESCE(b.country,o.country,l.country),'industry',COALESCE(b.industry,o.industry,l.industry),'service',COALESCE(b.service_interest,o.service_interest,l.service_interest)),'qualification',COALESCE(b.qualification_answers,'{}'::jsonb),'nextBestAction',v_next)
   INTO v_context FROM public.sales_meetings m LEFT JOIN public.public_booking_submissions b ON b.meeting_id=m.id LEFT JOIN public.crm_opportunities o ON o.id=m.opportunity_id LEFT JOIN public.crm_leads l ON l.id=m.lead_id WHERE m.id=p_entity_id;
 ELSIF v_type='lead' THEN
   SELECT jsonb_build_object('lead',jsonb_build_object('title',title,'company',company_name,'contact',contact_name,'email',email,'phone',phone,'website',website,'country',country,'industry',industry,'source',source,'service',service_interest,'estimatedValue',estimated_value,'currency',currency,'status',status,'lastContactAt',last_contact_at,'nextFollowUpAt',next_follow_up_at,'notes',notes),'nextBestAction',v_next) INTO v_context FROM public.crm_leads WHERE id=p_entity_id;
 ELSIF v_type='opportunity' THEN
   SELECT jsonb_build_object('opportunity',jsonb_build_object('name',name,'company',company_name,'contact',contact_name,'email',email,'phone',phone,'website',website,'country',country,'industry',industry,'service',service_interest,'expectedValue',expected_value,'currency',currency,'stage',stage,'status',status,'probability',probability,'requirements',requirements_summary,'nextFollowUpAt',next_follow_up_at,'notes',notes,'lostReason',lost_reason),'nextBestAction',v_next) INTO v_context FROM public.crm_opportunities WHERE id=p_entity_id;
 ELSIF v_type='quotation' THEN
   SELECT jsonb_build_object('quotation',jsonb_build_object('number',quotation_number,'customer',customer_name,'contact',contact_name,'email',email,'country',country,'currency',currency,'status',status,'validUntil',valid_until,'paymentTerms',payment_terms,'scope',scope_summary,'exclusions',exclusions,'customerNotes',customer_notes,'subtotal',subtotal,'total',total,'sentAt',sent_at),'nextBestAction',v_next) INTO v_context FROM public.quotations WHERE id=p_entity_id;
 ELSIF v_type='project' THEN
   SELECT jsonb_build_object('project',jsonb_build_object('number',project_number,'name',project_name,'value',project_value,'currency',currency,'stage',stage,'priority',priority,'status',status,'startDate',start_date,'targetDate',target_date,'requirements',requirements_summary,'scope',scope_summary,'exclusions',exclusions,'salesHandover',sales_handover_notes,'internalNotes',internal_notes),'openTasks',COALESCE((SELECT jsonb_agg(jsonb_build_object('title',t.title,'description',t.description,'department',t.department,'priority',t.priority,'status',t.status,'dueDate',t.due_date) ORDER BY t.due_date NULLS LAST) FROM public.project_tasks t WHERE t.project_id=p.id AND t.completed_at IS NULL),'[]'::jsonb),'nextBestAction',v_next) INTO v_context FROM public.projects p WHERE p.id=p_entity_id;
 ELSIF v_type='client' THEN
   SELECT jsonb_build_object('client',jsonb_build_object('company',company_name,'contact',primary_contact_name,'email',email,'phone',phone,'website',website,'country',country,'industry',industry,'salesValue',total_sales_value,'currency',currency,'status',status,'notes',notes),'nextBestAction',v_next) INTO v_context FROM public.clients WHERE id=p_entity_id;
 ELSE
   v_context:=jsonb_build_object('entityType',v_type,'entityId',p_entity_id,'nextBestAction',v_next);
 END IF;
 RETURN jsonb_build_object('mode',v_mode,'entityType',v_type,'entityId',p_entity_id,'context',COALESCE(v_context,'{}'::jsonb),'guardrail','Draft/advisory only. Do not claim actions were executed. Do not invent facts absent from context.');
END; $$;

CREATE OR REPLACE FUNCTION public.service_get_productivity_ai_config()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,vault,pg_temp AS $$
DECLARE v_cfg jsonb;v_secret text;
BEGIN
 SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='productivity_ai_settings';
 SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='profox_productivity_gemini_api_key' LIMIT 1;
 RETURN COALESCE(v_cfg,'{}'::jsonb)||jsonb_build_object('apiKey',COALESCE(v_secret,''));
END; $$;

CREATE OR REPLACE FUNCTION public.service_log_productivity_ai_run(p_user_id uuid,p_mode text,p_entity_type text,p_entity_id uuid,p_model text,p_status text,p_output_preview text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 INSERT INTO public.productivity_ai_runs(user_id,mode,entity_type,entity_id,model,status,output_preview) VALUES(p_user_id,left(trim(COALESCE(p_mode,'')),80),left(trim(COALESCE(p_entity_type,'')),80),p_entity_id,left(trim(COALESCE(p_model,'')),120),CASE WHEN p_status='Failed' THEN 'Failed' ELSE 'Completed' END,left(COALESCE(p_output_preview,''),2000)) RETURNING id INTO v_id;RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.get_productivity_ai_status() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_set_productivity_ai(boolean,text,text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_productivity_ai_context(text,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.service_get_productivity_ai_config() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_log_productivity_ai_run(uuid,text,text,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_productivity_ai_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_productivity_ai(boolean,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_productivity_ai_context(text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_productivity_ai_config() TO service_role;
GRANT EXECUTE ON FUNCTION public.service_log_productivity_ai_run(uuid,text,text,uuid,text,text,text) TO service_role;
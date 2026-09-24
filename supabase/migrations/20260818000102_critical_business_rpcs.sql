-- Mirrors live migration: critical_business_rpcs
-- Critical transitions are server-authorized and transactional.

-- NOTE: canonical definitions are intentionally repeated in this forward migration
-- so a fresh environment reaches the same secure state as production.

CREATE OR REPLACE FUNCTION public.activate_salesperson(target_user_id uuid, admin_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_app public.applicants%ROWTYPE; v_missing_required int; v_missing_reviews int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: only an active Admin may activate a salesperson.'; END IF;
  SELECT * INTO v_app FROM public.applicants WHERE linked_user_id=target_user_id ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate record not found for the linked account.'; END IF;
  IF v_app.stage='Activated' AND EXISTS(SELECT 1 FROM public.user_profiles WHERE id=target_user_id AND role='sales' AND status='active') THEN RETURN; END IF;
  IF lower(COALESCE(v_app.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'Signed sales agreement is required before activation.'; END IF;
  IF COALESCE(v_app.final_approval,false) IS NOT TRUE THEN RAISE EXCEPTION 'Final Admin approval is required before activation.'; END IF;
  SELECT count(*) INTO v_missing_required FROM public.training_modules m WHERE m.active=true AND m.required=true AND NOT EXISTS (
    SELECT 1 FROM public.user_training_progress p WHERE p.user_id=target_user_id AND p.module_id=m.id AND p.status IN ('Passed','Completed') AND (m.passing_score IS NULL OR COALESCE(p.score,m.passing_score)>=m.passing_score)
  );
  IF v_missing_required>0 THEN RAISE EXCEPTION 'All required Sales Academy modules must be completed before activation. Missing: %',v_missing_required; END IF;
  SELECT count(*) INTO v_missing_reviews FROM public.training_modules m WHERE m.active=true AND m.requires_admin_review=true AND NOT EXISTS (
    SELECT 1 FROM public.user_training_progress p WHERE p.user_id=target_user_id AND p.module_id=m.id AND p.review_status='Passed' AND p.reviewed_by IS NOT NULL
  );
  IF v_missing_reviews>0 THEN RAISE EXCEPTION 'All Admin-reviewed training gates must be passed before activation. Missing: %',v_missing_reviews; END IF;
  UPDATE public.user_profiles SET role='sales',department='Sales',status='active',onboarding_status='completed',onboarding_progress=100,updated_at=now() WHERE id=target_user_id;
  UPDATE public.applicants SET stage='Activated',onboarding_status='completed',onboarding_progress=100,updated_at=now() WHERE id=v_app.id;
END; $$;
REVOKE ALL ON FUNCTION public.activate_salesperson(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_salesperson(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.convert_lead_to_opportunity(p_lead_id uuid,p_name text DEFAULT NULL,p_expected_value numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_lead public.crm_leads%ROWTYPE; v_existing uuid; v_new uuid;
BEGIN
 IF NOT public.has_active_role(ARRAY['admin','sales']) THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
 SELECT * INTO v_lead FROM public.crm_leads WHERE id=p_lead_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found.'; END IF;
 IF NOT public.is_admin() AND v_lead.salesperson_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'You may only convert your own lead.'; END IF;
 SELECT id INTO v_existing FROM public.crm_opportunities WHERE lead_id=p_lead_id LIMIT 1;
 IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
 INSERT INTO public.crm_opportunities(lead_id,name,company_name,contact_name,email,phone,website,country,industry,source,self_generated,salesperson_id,service_interest,expected_value,currency,stage,status,created_by)
 VALUES(p_lead_id,COALESCE(NULLIF(trim(p_name),''),v_lead.title),v_lead.company_name,v_lead.contact_name,v_lead.email,v_lead.phone,v_lead.website,v_lead.country,v_lead.industry,v_lead.source,v_lead.self_generated,v_lead.salesperson_id,v_lead.service_interest,COALESCE(p_expected_value,v_lead.estimated_value),v_lead.currency,'Qualified','Open',auth.uid()) RETURNING id INTO v_new;
 UPDATE public.crm_leads SET status='Qualified',converted_opportunity_id=v_new,updated_at=now() WHERE id=p_lead_id;
 RETURN v_new;
END; $$;
REVOKE ALL ON FUNCTION public.convert_lead_to_opportunity(uuid,text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_opportunity(uuid,text,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_project_from_sale(p_opportunity_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_opp public.crm_opportunities%ROWTYPE; v_quote public.quotations%ROWTYPE; v_project uuid; v_package text;
BEGIN
 IF NOT public.has_active_role(ARRAY['admin','project_manager']) THEN RAISE EXCEPTION 'Unauthorized: only Admin or Project Manager may create a project.'; END IF;
 SELECT id INTO v_project FROM public.projects WHERE source_opportunity_id=p_opportunity_id LIMIT 1;
 IF v_project IS NOT NULL THEN RETURN v_project; END IF;
 SELECT * INTO v_opp FROM public.crm_opportunities WHERE id=p_opportunity_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Opportunity not found.'; END IF;
 IF v_opp.status<>'Won' THEN RAISE EXCEPTION 'Opportunity must be Won before project creation.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payments WHERE opportunity_id=p_opportunity_id AND payment_type IN ('Advance','Full Payment') AND status='Verified') THEN RAISE EXCEPTION 'Verified advance/full payment is required.'; END IF;
 SELECT * INTO v_quote FROM public.quotations WHERE opportunity_id=p_opportunity_id AND status='Accepted' ORDER BY accepted_at DESC NULLS LAST,created_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Accepted quotation not found.'; END IF;
 SELECT product_name_snapshot INTO v_package FROM public.quotation_items WHERE quotation_id=v_quote.id AND item_type='package' ORDER BY sort_order LIMIT 1;
 INSERT INTO public.projects(project_name,client_id,source_opportunity_id,quotation_id,package_snapshot,project_value,currency,stage,priority,status,requirements_summary,scope_summary,exclusions,created_by)
 VALUES(COALESCE(v_opp.company_name,v_opp.name)||' Website Delivery',v_opp.client_id,v_opp.id,v_quote.id,COALESCE(v_package,'Custom Package'),v_quote.total,v_quote.currency,'Sales Handover','Normal','Active',v_opp.requirements_summary,v_quote.scope_summary,v_quote.exclusions,auth.uid()) RETURNING id INTO v_project;
 INSERT INTO public.project_tasks(project_id,title,department,priority,status,description,created_by) VALUES
 (v_project,'Sales Handover Meeting','Project Management','High','To Do','Review approved quotation, scope, exclusions and sales notes.',auth.uid()),
 (v_project,'Client Onboarding Call','Project Management','High','To Do','Welcome the client and collect initial assets/access.',auth.uid());
 RETURN v_project;
END; $$;
REVOKE ALL ON FUNCTION public.create_project_from_sale(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_project_from_sale(uuid) TO authenticated;

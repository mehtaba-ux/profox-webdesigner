-- End-to-end Sales -> Client -> Project -> Delivery flow closure.
-- Reuses the canonical CRM, payment, client, project, task, team and approval records.
-- Protected transitions prevent stage skipping while stage tasks create explicit team handoffs.

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS workflow_key text,
  ADD COLUMN IF NOT EXISTS workflow_stage text,
  ADD COLUMN IF NOT EXISTS required_for_stage boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_tasks_workflow_key
  ON public.project_tasks(project_id, workflow_key)
  WHERE workflow_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_tasks_stage_gate
  ON public.project_tasks(project_id, workflow_stage, required_for_stage, status)
  WHERE required_for_stage IS TRUE;

-- Release-specific FK indexes identified by the production advisor.
CREATE INDEX IF NOT EXISTS idx_commission_adjustment_events_adjusted_by
  ON public.commission_adjustment_events(adjusted_by);
CREATE INDEX IF NOT EXISTS idx_commission_entries_adjusted_by
  ON public.commission_entries(adjusted_by);
CREATE INDEX IF NOT EXISTS idx_sales_meetings_prep_reviewed_by
  ON public.sales_meetings(prep_reviewed_by);

CREATE OR REPLACE FUNCTION public.ensure_project_delivery_stage_tasks(
  p_project_id uuid,
  p_stage text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_project public.projects%ROWTYPE;
  v_salesperson uuid;
  v_created_by uuid;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;

  SELECT salesperson_id INTO v_salesperson
  FROM public.crm_opportunities
  WHERE id=v_project.source_opportunity_id;

  v_created_by := COALESCE(v_project.project_manager_id, v_project.created_by, v_salesperson, auth.uid());
  IF v_created_by IS NULL THEN RAISE EXCEPTION 'Project workflow task creator could not be resolved.'; END IF;

  WITH templates(stage_key, workflow_key, title, description, department, priority, assignee_kind, sort_order) AS (
    VALUES
      ('Sales Handover','sales_handover_review','Sales Handover Meeting','Review the accepted quotation, verified payment, requirements, scope, exclusions, promises and commercial context with Sales. Record the final handover notes before progressing.','Project Management','High','pm',10),

      ('Client Onboarding','client_onboarding_call','Client Onboarding Call','Welcome the client, confirm primary contacts, communication path, project goals, decision makers, target dates and expectations.','Project Management','High','pm',10),
      ('Client Onboarding','client_assets_access','Client Assets & Access Checklist','Confirm required content, brand assets, domain/hosting/CMS access, analytics access and client portal or documented communication access.','Project Management','High','pm',20),

      ('Requirements','business_discovery_requirements','Business Discovery & Requirements Lock','Confirm business goals, target audience, functional requirements, conversion goals, integrations, constraints and approved success criteria.','Project Management','High','pm',10),
      ('Requirements','solution_architecture_plan','Solution Architecture & Delivery Plan','Document the approved solution approach, information architecture, technical assumptions, milestones and team handoffs before production work begins.','Project Management','High','pm',20),

      ('Content','content_curation','Content Curation & SEO Inputs','Prepare or collect approved page content, conversion copy, imagery, metadata and other content inputs required by the signed scope.','Content','High','specialist',10),
      ('Content','content_readiness_review','Content Readiness Review','Verify required content is complete enough for design and clearly flag any client dependencies before handoff.','Content','High','specialist',20),

      ('UI/UX Design','ux_research_flows','User Research, UX Flows & Information Architecture','Translate approved requirements into user journeys, information architecture and conversion-focused UX flows.','UI/UX Design','High','specialist',10),
      ('UI/UX Design','wireframe_approval','Wireframes & Wireframe Approval Evidence','Create responsive wireframes and record evidence that the agreed wireframe milestone has been approved before final visual design.','UI/UX Design','High','specialist',20),
      ('UI/UX Design','ui_design_prototype','UI Design, Prototype & Internal Design QA','Produce the responsive UI, interaction prototype and internal quality review ready for formal client design approval.','UI/UX Design','High','specialist',30),

      ('Client Design Approval','client_design_approval','Formal Client Design Approval','Client approval is recorded through the protected client approval workflow before Development can begin.','Project Management','High','pm',10),

      ('Development','technical_architecture','Technical Architecture & Build Setup','Confirm implementation architecture, environments, integrations, data/security considerations and delivery plan.','Development','High','specialist',10),
      ('Development','development_implementation','Development & Integration Implementation','Build the approved responsive experience and required integrations against the accepted scope and design.','Development','High','specialist',20),

      ('QA','functional_responsive_testing','Functional, Responsive & Accessibility Testing','Complete functional, responsive, browser/device and accessibility-oriented QA for the agreed scope.','Quality Assurance','High','specialist',10),
      ('QA','security_performance_review','Security, Performance & Pre-UAT Review','Complete applicable security checks, performance checks and release readiness verification before client staging review.','Quality Assurance','High','specialist',20),

      ('Client Review','client_staging_uat','Client Staging / UAT Approval','Client staging review and acceptance are recorded through the protected client approval workflow before final revisions and launch preparation.','Project Management','High','pm',10),

      ('Final Revisions','final_revision_set','Approved Final Revision Set','Apply the approved final revision set and verify no unapproved scope is introduced.','Development','High','specialist',10),

      ('Launch','production_launch','Production Launch','Deploy the approved release to production only after the protected final-payment launch gate passes.','Development','High','specialist',10),
      ('Launch','launch_tracking_verification','Launch Monitoring & Tracking Verification','Verify production health, analytics, Search Console where applicable and conversion tracking after launch.','Quality Assurance','High','specialist',20),

      ('Handover','documentation_client_training','Documentation & Client Training','Deliver applicable documentation, credentials/access handoff and client training for the completed solution.','Project Management','High','pm',10),
      ('Handover','priority_launch_assurance','60-Day Priority Launch Assurance Kickoff','Confirm the 60-day priority launch assurance path for technical defects, performance review, analytics, Search Console and conversion-tracking verification.','Project Management','High','pm',20)
  )
  INSERT INTO public.project_tasks(
    project_id,title,description,department,assigned_to,created_by,priority,status,
    workflow_key,workflow_stage,required_for_stage
  )
  SELECT
    v_project.id,
    t.title,
    t.description,
    t.department,
    CASE t.assignee_kind WHEN 'pm' THEN v_project.project_manager_id ELSE NULL END,
    v_created_by,
    t.priority,
    'To Do',
    t.workflow_key,
    t.stage_key,
    true
  FROM templates t
  WHERE t.stage_key=p_stage
  ORDER BY t.sort_order
  ON CONFLICT (project_id, workflow_key) WHERE workflow_key IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.ensure_project_delivery_stage_tasks(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_project_manager_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NEW.project_manager_id IS NULL OR NEW.project_manager_id IS NOT DISTINCT FROM OLD.project_manager_id THEN RETURN NEW; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.user_profiles u
    WHERE u.id=NEW.project_manager_id
      AND u.status='active'
      AND u.role IN ('admin','project_manager')
  ) THEN
    RAISE EXCEPTION 'Project Manager must be an active Administrator or Project Manager.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_project_manager_assignment ON public.projects;
CREATE TRIGGER trg_validate_project_manager_assignment
BEFORE UPDATE OF project_manager_id ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.validate_project_manager_assignment();

CREATE OR REPLACE FUNCTION public.sync_project_manager_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NEW.project_manager_id IS NOT DISTINCT FROM OLD.project_manager_id THEN RETURN NEW; END IF;

  IF OLD.project_manager_id IS NOT NULL THEN
    DELETE FROM public.project_team
    WHERE project_id=NEW.id AND user_id=OLD.project_manager_id AND role='Project Manager';
  END IF;

  IF NEW.project_manager_id IS NOT NULL THEN
    INSERT INTO public.project_team(project_id,user_id,role)
    VALUES(NEW.id,NEW.project_manager_id,'Project Manager')
    ON CONFLICT (project_id,user_id) DO UPDATE SET role='Project Manager';

    UPDATE public.project_tasks
    SET assigned_to=NEW.project_manager_id,updated_at=now()
    WHERE project_id=NEW.id
      AND department='Project Management'
      AND status<>'Done'
      AND (assigned_to IS NULL OR assigned_to=OLD.project_manager_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_project_manager_assignment ON public.projects;
CREATE TRIGGER trg_sync_project_manager_assignment
AFTER UPDATE OF project_manager_id ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.sync_project_manager_assignment();

CREATE OR REPLACE FUNCTION public.validate_project_task_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NEW.assigned_to IS NULL OR (TG_OP='UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to) THEN RETURN NEW; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.user_profiles u
    WHERE u.id=NEW.assigned_to
      AND u.status='active'
      AND u.role IN ('admin','project_manager','site_manager','content_writer','uiux_designer','developer','web_developer','developer_designer','qa','sales','sales_rep','sales_team')
  ) THEN
    RAISE EXCEPTION 'Project tasks may only be assigned to an active staff account.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_project_task_assignee ON public.project_tasks;
CREATE TRIGGER trg_validate_project_task_assignee
BEFORE INSERT OR UPDATE OF assigned_to ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.validate_project_task_assignee();

CREATE OR REPLACE FUNCTION public.sync_project_team_from_task_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_role text;
BEGIN
  IF NEW.assigned_to IS NULL OR (TG_OP='UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to) THEN RETURN NEW; END IF;

  SELECT CASE u.role
    WHEN 'project_manager' THEN 'Project Manager'
    WHEN 'content_writer' THEN 'Content Writer'
    WHEN 'uiux_designer' THEN 'UI/UX Designer'
    WHEN 'qa' THEN 'Quality Assurance'
    WHEN 'sales' THEN 'Sales Handover'
    WHEN 'sales_rep' THEN 'Sales Handover'
    WHEN 'sales_team' THEN 'Sales Handover'
    WHEN 'web_developer' THEN 'Developer'
    WHEN 'developer_designer' THEN 'Developer / Designer'
    WHEN 'site_manager' THEN 'Site Manager'
    WHEN 'admin' THEN 'Administrator'
    ELSE 'Developer'
  END INTO v_role
  FROM public.user_profiles u WHERE u.id=NEW.assigned_to;

  INSERT INTO public.project_team(project_id,user_id,role)
  VALUES(NEW.project_id,NEW.assigned_to,COALESCE(v_role,'Delivery Team'))
  ON CONFLICT (project_id,user_id) DO UPDATE SET role=EXCLUDED.role;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_project_team_from_task_assignment ON public.project_tasks;
CREATE TRIGGER trg_sync_project_team_from_task_assignment
AFTER INSERT OR UPDATE OF assigned_to ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_project_team_from_task_assignment();

CREATE OR REPLACE FUNCTION public.protect_project_stage_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_expected text;
  v_incomplete integer := 0;
  v_client_decision boolean := COALESCE(current_setting('profox.project_client_decision_rpc',true),'')='1';
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN RETURN NEW; END IF;

  IF OLD.status<>'Active' THEN
    RAISE EXCEPTION 'Only an active project may change delivery stage.';
  END IF;

  IF v_client_decision THEN
    IF OLD.stage='Client Design Approval' AND NEW.stage IN ('Development','UI/UX Design') THEN RETURN NEW; END IF;
    IF OLD.stage='Client Review' AND NEW.stage='Final Revisions' THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Invalid client-controlled project transition.';
  END IF;

  IF NOT public.is_admin() AND OLD.project_manager_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned Project Manager or Administrator may advance the project.';
  END IF;

  IF OLD.stage IN ('Client Design Approval','Client Review') THEN
    RAISE EXCEPTION 'This stage requires a recorded client decision before delivery can continue.';
  END IF;

  v_expected := CASE OLD.stage
    WHEN 'Sales Handover' THEN 'Client Onboarding'
    WHEN 'Client Onboarding' THEN 'Requirements'
    WHEN 'Requirements' THEN 'Content'
    WHEN 'Content' THEN 'UI/UX Design'
    WHEN 'UI/UX Design' THEN 'Client Design Approval'
    WHEN 'Development' THEN 'QA'
    WHEN 'QA' THEN 'Client Review'
    WHEN 'Final Revisions' THEN 'Launch'
    WHEN 'Launch' THEN 'Handover'
    WHEN 'Handover' THEN 'Completed'
    ELSE NULL
  END;

  IF v_expected IS NULL OR NEW.stage<>v_expected THEN
    RAISE EXCEPTION 'Project stages must follow the approved delivery sequence. Expected next stage: %.',COALESCE(v_expected,'none');
  END IF;

  IF OLD.stage='Sales Handover' THEN
    IF OLD.project_manager_id IS NULL THEN RAISE EXCEPTION 'Assign an active Project Manager before completing Sales Handover.'; END IF;
    IF length(btrim(COALESCE(OLD.sales_handover_notes,'')))<10 THEN RAISE EXCEPTION 'Record the Sales Handover notes before Client Onboarding.'; END IF;
  END IF;

  SELECT count(*) INTO v_incomplete
  FROM public.project_tasks t
  WHERE t.project_id=OLD.id
    AND t.workflow_stage=OLD.stage
    AND t.required_for_stage IS TRUE
    AND t.status<>'Done';

  IF v_incomplete>0 THEN
    RAISE EXCEPTION 'Complete all required % workflow tasks before advancing the project. Remaining: %.',OLD.stage,v_incomplete;
  END IF;

  IF NEW.stage='Completed' THEN
    NEW.status:='Completed';
    NEW.completed_at:=COALESCE(NEW.completed_at,now());
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_project_stage_workflow ON public.projects;
CREATE TRIGGER trg_protect_project_stage_workflow
BEFORE UPDATE OF stage ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.protect_project_stage_workflow();

CREATE OR REPLACE FUNCTION public.protect_project_completion_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NEW.status='Completed' AND OLD.status IS DISTINCT FROM 'Completed' AND NEW.stage<>'Completed' THEN
    RAISE EXCEPTION 'A project can only be marked Completed after the Handover stage is completed.';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_protect_project_completion_status ON public.projects;
CREATE TRIGGER trg_protect_project_completion_status
BEFORE UPDATE OF status ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.protect_project_completion_status();

CREATE OR REPLACE FUNCTION public.seed_project_tasks_after_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    PERFORM public.ensure_project_delivery_stage_tasks(NEW.id,NEW.stage);
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_seed_project_tasks_after_stage_change ON public.projects;
CREATE TRIGGER trg_seed_project_tasks_after_stage_change
AFTER UPDATE OF stage ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.seed_project_tasks_after_stage_change();

CREATE OR REPLACE FUNCTION public.create_project_from_sale(p_opportunity_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_opp public.crm_opportunities%ROWTYPE;
  v_quote public.quotations%ROWTYPE;
  v_project uuid;
  v_package text;
  v_pm_id uuid;
BEGIN
  IF NOT public.has_active_role(ARRAY['admin','project_manager']) THEN
    RAISE EXCEPTION 'Unauthorized: only Admin or Project Manager may create a project.';
  END IF;

  SELECT id INTO v_project FROM public.projects WHERE source_opportunity_id=p_opportunity_id LIMIT 1;
  IF v_project IS NOT NULL THEN RETURN v_project; END IF;

  SELECT * INTO v_opp FROM public.crm_opportunities WHERE id=p_opportunity_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opportunity not found.'; END IF;
  IF v_opp.status<>'Won' THEN RAISE EXCEPTION 'Opportunity must be Won before project creation.'; END IF;
  IF v_opp.client_id IS NULL THEN RAISE EXCEPTION 'Won opportunity must be linked to the verified client before project creation.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.payments WHERE opportunity_id=p_opportunity_id AND payment_type IN ('Advance','Full Payment') AND status='Verified') THEN
    RAISE EXCEPTION 'Verified advance/full payment is required.';
  END IF;

  SELECT * INTO v_quote
  FROM public.quotations
  WHERE opportunity_id=p_opportunity_id AND status='Accepted'
  ORDER BY accepted_at DESC NULLS LAST,created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accepted quotation not found.'; END IF;

  SELECT product_name_snapshot INTO v_package
  FROM public.quotation_items
  WHERE quotation_id=v_quote.id AND item_type='package'
  ORDER BY sort_order LIMIT 1;

  IF NOT public.is_admin() AND public.has_active_role(ARRAY['project_manager']) THEN v_pm_id:=auth.uid(); END IF;

  INSERT INTO public.projects(
    project_name,client_id,source_opportunity_id,quotation_id,package_snapshot,project_value,currency,
    project_manager_id,stage,priority,status,requirements_summary,scope_summary,exclusions,created_by
  ) VALUES(
    COALESCE(NULLIF(v_opp.company_name,''),v_opp.name)||' Website Delivery',
    v_opp.client_id,v_opp.id,v_quote.id,COALESCE(v_package,'Custom Package'),v_quote.total,v_quote.currency,
    v_pm_id,'Sales Handover','Normal','Active',v_opp.requirements_summary,v_quote.scope_summary,v_quote.exclusions,auth.uid()
  ) RETURNING id INTO v_project;

  IF v_opp.salesperson_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.user_profiles u
    WHERE u.id=v_opp.salesperson_id AND u.status='active' AND u.role IN ('sales','sales_rep','sales_team')
  ) THEN
    INSERT INTO public.project_team(project_id,user_id,role)
    VALUES(v_project,v_opp.salesperson_id,'Sales Handover')
    ON CONFLICT (project_id,user_id) DO UPDATE SET role='Sales Handover';
  END IF;

  IF v_pm_id IS NOT NULL THEN
    INSERT INTO public.project_team(project_id,user_id,role)
    VALUES(v_project,v_pm_id,'Project Manager')
    ON CONFLICT (project_id,user_id) DO UPDATE SET role='Project Manager';
  END IF;

  PERFORM public.ensure_project_delivery_stage_tasks(v_project,'Sales Handover');
  RETURN v_project;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_project_from_sale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_project_from_sale(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.client_approve_project_stage(p_project_id uuid,p_notes text DEFAULT ''::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_project public.projects%ROWTYPE; v_client public.clients%ROWTYPE; v_next text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
  SELECT * INTO v_client FROM public.clients WHERE id=v_project.client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client record not found.'; END IF;
  IF v_client.linked_user_id IS NULL OR v_client.linked_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Unauthorized: this project is not linked to your client account.'; END IF;

  v_next:=CASE v_project.stage WHEN 'Client Design Approval' THEN 'Development' WHEN 'Client Review' THEN 'Final Revisions' ELSE NULL END;
  IF v_next IS NULL THEN RAISE EXCEPTION 'This project is not currently awaiting a client approval.'; END IF;

  INSERT INTO public.project_client_approvals(project_id,client_id,client_user_id,from_stage,to_stage,action,notes)
  VALUES(v_project.id,v_project.client_id,auth.uid(),v_project.stage,v_next,'Approved',NULLIF(trim(p_notes),''));

  UPDATE public.project_tasks
  SET status='Done',completed_at=COALESCE(completed_at,now()),notes=concat_ws(E'\n',NULLIF(notes,''),NULLIF(trim(p_notes),'')),updated_at=now()
  WHERE project_id=v_project.id AND workflow_stage=v_project.stage AND required_for_stage IS TRUE;

  PERFORM set_config('profox.project_client_decision_rpc','1',true);
  UPDATE public.projects SET stage=v_next,updated_at=now() WHERE id=v_project.id;
  PERFORM set_config('profox.project_client_decision_rpc','',true);
  RETURN v_next;
END;
$function$;
REVOKE ALL ON FUNCTION public.client_approve_project_stage(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_approve_project_stage(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.client_request_project_changes(p_project_id uuid,p_notes text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_project public.projects%ROWTYPE; v_client public.clients%ROWTYPE; v_next text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF COALESCE(trim(p_notes),'')='' THEN RAISE EXCEPTION 'Please describe the requested changes.'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
  SELECT * INTO v_client FROM public.clients WHERE id=v_project.client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client record not found.'; END IF;
  IF v_client.linked_user_id IS NULL OR v_client.linked_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Unauthorized: this project is not linked to your client account.'; END IF;

  v_next:=CASE v_project.stage WHEN 'Client Design Approval' THEN 'UI/UX Design' WHEN 'Client Review' THEN 'Final Revisions' ELSE NULL END;
  IF v_next IS NULL THEN RAISE EXCEPTION 'This project is not currently awaiting client review.'; END IF;

  INSERT INTO public.project_client_approvals(project_id,client_id,client_user_id,from_stage,to_stage,action,notes)
  VALUES(v_project.id,v_project.client_id,auth.uid(),v_project.stage,v_next,'Changes Requested',trim(p_notes));

  UPDATE public.project_tasks
  SET status='Done',completed_at=COALESCE(completed_at,now()),notes=concat_ws(E'\n',NULLIF(notes,''),'Client requested changes: '||trim(p_notes)),updated_at=now()
  WHERE project_id=v_project.id AND workflow_stage=v_project.stage AND required_for_stage IS TRUE;

  PERFORM set_config('profox.project_client_decision_rpc','1',true);
  UPDATE public.projects SET stage=v_next,updated_at=now() WHERE id=v_project.id;
  PERFORM set_config('profox.project_client_decision_rpc','',true);
  RETURN v_next;
END;
$function$;
REVOKE ALL ON FUNCTION public.client_request_project_changes(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_request_project_changes(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_payment_atomic(
  p_payment_id uuid,
  p_admin_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT ''::text,
  p_amount_received numeric DEFAULT NULL::numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_opp public.crm_opportunities%ROWTYPE;
  v_quote public.quotations%ROWTYPE;
  v_client_id uuid;
  v_identity text;
  v_received numeric;
  v_project_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: only an active Admin may verify payments.'; END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found.'; END IF;

  IF v_payment.status='Verified' THEN
    PERFORM public.generate_commission_for_verified_payment(p_payment_id);
    IF v_payment.payment_type IN ('Advance','Full Payment') AND v_payment.opportunity_id IS NOT NULL THEN
      v_project_id:=public.create_project_from_sale(v_payment.opportunity_id);
    END IF;
    RETURN v_payment.client_id;
  END IF;

  IF v_payment.status IN ('Cancelled','Failed','Refunded') THEN RAISE EXCEPTION 'A cancelled, failed, or refunded payment cannot be verified.'; END IF;
  IF COALESCE(v_payment.amount_due,0)<=0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero.'; END IF;

  v_received:=round(COALESCE(p_amount_received,NULLIF(v_payment.amount_paid,0),v_payment.amount_due)::numeric,2);
  IF v_received<=0 THEN RAISE EXCEPTION 'Confirmed amount received must be greater than zero.'; END IF;
  IF v_received>round(v_payment.amount_due::numeric,2) THEN RAISE EXCEPTION 'Confirmed amount received (%) cannot exceed this payment request amount (%).',v_received,v_payment.amount_due; END IF;

  IF v_payment.quotation_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM public.quotations WHERE id=v_payment.quotation_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Quotation linked to payment was not found.'; END IF;
  END IF;

  IF v_payment.payment_type IN ('Advance','Full Payment') THEN
    IF v_payment.quotation_id IS NULL OR v_quote.status<>'Accepted' THEN RAISE EXCEPTION 'Advance/full payment may only be verified against an accepted quotation.'; END IF;
    IF v_payment.opportunity_id IS NULL OR v_quote.opportunity_id IS DISTINCT FROM v_payment.opportunity_id THEN RAISE EXCEPTION 'Payment opportunity must match the accepted quotation.'; END IF;
  END IF;

  IF v_received<round(v_payment.amount_due::numeric,2) THEN
    UPDATE public.payments SET amount_paid=v_received,status='Partially Paid',paid_at=COALESCE(paid_at,now()),verified_at=NULL,verified_by=NULL,notes=COALESCE(NULLIF(trim(p_notes),''),notes),updated_at=now() WHERE id=p_payment_id;
    RETURN v_payment.client_id;
  END IF;

  UPDATE public.payments
  SET status='Verified',amount_paid=v_received,paid_at=COALESCE(paid_at,now()),verified_at=now(),verified_by=auth.uid(),notes=COALESCE(NULLIF(trim(p_notes),''),notes),updated_at=now()
  WHERE id=p_payment_id RETURNING * INTO v_payment;

  IF v_payment.payment_type IN ('Advance','Full Payment') AND v_payment.opportunity_id IS NOT NULL THEN
    SELECT * INTO v_opp FROM public.crm_opportunities WHERE id=v_payment.opportunity_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Opportunity linked to payment was not found.'; END IF;

    UPDATE public.crm_opportunities SET status='Won',stage='Won',won_at=COALESCE(won_at,now()),updated_at=now() WHERE id=v_opp.id;

    v_client_id:=v_opp.client_id;
    IF v_client_id IS NULL THEN
      IF trim(COALESCE(v_opp.email,''))<>'' AND trim(COALESCE(v_opp.company_name,''))<>'' THEN
        v_identity:=lower(trim(v_opp.email))||'|'||lower(trim(v_opp.company_name));
        PERFORM pg_advisory_xact_lock(hashtextextended(v_identity,0));
      END IF;

      SELECT id INTO v_client_id FROM public.clients
      WHERE lower(trim(COALESCE(email,'')))=lower(trim(COALESCE(v_opp.email,'')))
        AND lower(trim(COALESCE(company_name,'')))=lower(trim(COALESCE(v_opp.company_name,'')))
      ORDER BY created_at LIMIT 1;

      IF v_client_id IS NULL THEN
        INSERT INTO public.clients(company_name,primary_contact_name,email,phone,website,country,industry,salesperson_id,source_opportunity_id,first_quotation_id,total_sales_value,currency,status)
        VALUES(COALESCE(NULLIF(trim(v_opp.company_name),''),v_opp.name),COALESCE(NULLIF(trim(v_opp.contact_name),''),NULLIF(trim(v_opp.company_name),''),v_opp.name),COALESCE(v_opp.email,''),v_opp.phone,v_opp.website,v_opp.country,v_opp.industry,v_opp.salesperson_id,v_opp.id,v_payment.quotation_id,COALESCE(v_quote.total,v_opp.expected_value,0),COALESCE(v_quote.currency,v_opp.currency,'USD'),'Active')
        RETURNING id INTO v_client_id;
      END IF;

      UPDATE public.crm_opportunities SET client_id=v_client_id,updated_at=now() WHERE id=v_opp.id;
      UPDATE public.quotations SET client_id=v_client_id,updated_at=now() WHERE opportunity_id=v_opp.id;
    END IF;

    UPDATE public.payments SET client_id=v_client_id,updated_at=now() WHERE id=p_payment_id RETURNING * INTO v_payment;
  END IF;

  PERFORM public.generate_commission_for_verified_payment(p_payment_id);

  IF v_payment.payment_type IN ('Advance','Full Payment') AND v_payment.opportunity_id IS NOT NULL THEN
    v_project_id:=public.create_project_from_sale(v_payment.opportunity_id);
  END IF;
  RETURN v_client_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.verify_payment_atomic(uuid,uuid,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_payment_atomic(uuid,uuid,text,numeric) TO authenticated;

-- Complete the Sales -> Project Manager handover without granting sellers general project edit access.
-- The canonical project, project_tasks and project_team remain the only delivery sources of truth.

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
      ('Sales Handover','sales_handover_submission','Sales Handover Submission','Sales must record the customer context, agreed expectations, requirements, scope, exclusions, promises, key contacts and any delivery risks before Project Management accepts the handover.','Sales','High','seller',5),
      ('Sales Handover','sales_handover_review','Sales Handover Review','Project Management reviews the accepted quotation, verified payment, requirements, scope, exclusions, promises and commercial context with Sales before progressing.','Project Management','High','pm',10),

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
    CASE t.assignee_kind
      WHEN 'pm' THEN v_project.project_manager_id
      WHEN 'seller' THEN v_salesperson
      ELSE NULL
    END,
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

CREATE OR REPLACE FUNCTION public.submit_sales_project_handover(
  p_project_id uuid,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_salesperson uuid;
  v_notes text := btrim(COALESCE(p_notes,''));
  v_is_source_seller boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF length(v_notes)<10 THEN RAISE EXCEPTION 'Sales handover notes must contain meaningful delivery context.'; END IF;
  IF length(v_notes)>10000 THEN RAISE EXCEPTION 'Sales handover notes are too long.'; END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id=p_project_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
  IF v_project.status<>'Active' OR v_project.stage<>'Sales Handover' THEN
    RAISE EXCEPTION 'Sales handover can only be submitted while the active project is in Sales Handover.';
  END IF;

  SELECT salesperson_id INTO v_salesperson
  FROM public.crm_opportunities
  WHERE id=v_project.source_opportunity_id;

  v_is_source_seller := v_salesperson IS NOT NULL
    AND v_salesperson=v_uid
    AND public.has_active_role(ARRAY['sales']::text[]);

  IF NOT v_is_source_seller
     AND NOT public.is_admin()
     AND v_project.project_manager_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the source salesperson, assigned Project Manager, or Administrator may submit handover notes.';
  END IF;

  UPDATE public.projects
  SET sales_handover_notes=v_notes,updated_at=now()
  WHERE id=v_project.id;

  IF v_is_source_seller THEN
    UPDATE public.project_tasks
    SET status='Done',
        completed_at=COALESCE(completed_at,now()),
        notes=concat_ws(E'\n',NULLIF(notes,''),'Sales handover submitted through protected workflow.'),
        updated_at=now()
    WHERE project_id=v_project.id
      AND workflow_key='sales_handover_submission'
      AND assigned_to=v_uid;
  END IF;

  IF v_is_source_seller AND v_project.project_manager_id IS NOT NULL THEN
    PERFORM public.service_queue_staff_operational_notification(
      v_project.project_manager_id,
      'project-sales-handover-submitted:'||v_project.id::text,
      'project_handover_ready',
      'Project',
      'Sales handover ready - '||v_project.project_name,
      'Sales submitted the project handover. Review the customer context and complete the Project Management handover review before Client Onboarding.',
      '/admin/app/projects?tab=projects',
      jsonb_build_object('projectId',v_project.id,'projectNumber',v_project.project_number,'salespersonId',v_uid),
      now()
    );
  ELSIF v_is_source_seller THEN
    PERFORM public.service_queue_active_admins_operational_notification(
      'project-sales-handover-needs-pm:'||v_project.id::text,
      'project_handover_needs_pm',
      'Project',
      'Assign Project Manager - '||v_project.project_name,
      'Sales submitted the project handover. Assign a Project Manager so the handover can be reviewed and Client Onboarding can begin.',
      '/admin/app/projects?tab=projects',
      jsonb_build_object('projectId',v_project.id,'projectNumber',v_project.project_number,'salespersonId',v_uid),
      now()
    );
  END IF;

  RETURN jsonb_build_object(
    'projectId',v_project.id,
    'submittedBy',v_uid,
    'sourceSellerSubmission',v_is_source_seller,
    'notes',v_notes,
    'submittedAt',now()
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_sales_project_handover(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_sales_project_handover(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_seller_project_handover_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_salesperson uuid;
BEGIN
  IF NEW.stage<>'Sales Handover' OR NEW.source_opportunity_id IS NULL THEN RETURN NEW; END IF;
  SELECT o.salesperson_id INTO v_salesperson
  FROM public.crm_opportunities o
  WHERE o.id=NEW.source_opportunity_id;
  IF v_salesperson IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.user_profiles u
    WHERE u.id=v_salesperson AND u.status='active' AND u.role IN ('sales','sales_rep','sales_team')
  ) THEN RETURN NEW; END IF;

  PERFORM public.service_queue_staff_operational_notification(
    v_salesperson,
    'project-sales-handover-created:'||NEW.id::text,
    'project_handover_required',
    'Project',
    'Complete Sales Handover - '||NEW.project_name,
    'The verified sale created a delivery project. Submit the customer context and handover notes so Project Management can begin Client Onboarding.',
    '/admin/project-handover/'||NEW.id::text,
    jsonb_build_object('projectId',NEW.id,'projectNumber',NEW.project_number,'clientId',NEW.client_id),
    now()
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_seller_project_handover_created ON public.projects;
CREATE TRIGGER trg_notify_seller_project_handover_created
AFTER INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.notify_seller_project_handover_created();

-- Idempotently add the seller submission task to any project already waiting at Sales Handover.
DO $do$
DECLARE v_project_id uuid;
BEGIN
  FOR v_project_id IN SELECT id FROM public.projects WHERE status='Active' AND stage='Sales Handover'
  LOOP
    PERFORM public.ensure_project_delivery_stage_tasks(v_project_id,'Sales Handover');
  END LOOP;
END;
$do$;
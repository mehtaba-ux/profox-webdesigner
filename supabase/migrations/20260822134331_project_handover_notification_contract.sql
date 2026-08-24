-- Align project handover operational notifications with the existing notification helper contract.
-- Template keys and in-app notification types use the same canonical event names.

INSERT INTO public.notification_templates(
  template_key,name,subject_template,body_template,active,description,updated_at
) VALUES
(
  'project_handover_required',
  'Project sales handover required',
  'Complete Sales Handover - {{projectNumber}}',
  'A verified sale created project {{projectNumber}}. Submit the customer and delivery context so Project Management can begin Client Onboarding.\n\nOpen the handover action in ProFox: {{actionUrl}}',
  true,
  'Seller notice when a verified sale creates a project that requires Sales Handover.',
  now()
),
(
  'project_handover_ready',
  'Project handover ready for PM review',
  'Sales handover ready - {{projectNumber}}',
  'Sales submitted the handover for project {{projectNumber}}. Review the customer context and complete the Project Management handover review before Client Onboarding.\n\nOpen the project in ProFox: {{actionUrl}}',
  true,
  'Project Manager notice after the source seller submits Sales Handover.',
  now()
),
(
  'project_handover_needs_pm',
  'Project handover needs Project Manager',
  'Assign Project Manager - {{projectNumber}}',
  'Sales submitted the handover for project {{projectNumber}}, but the project has no Project Manager. Assign one so the handover can be reviewed and Client Onboarding can begin.\n\nOpen Projects in ProFox: {{actionUrl}}',
  true,
  'Administrator notice when Sales Handover is ready but no Project Manager is assigned.',
  now()
)
ON CONFLICT (template_key) DO UPDATE
SET name=EXCLUDED.name,
    subject_template=EXCLUDED.subject_template,
    body_template=EXCLUDED.body_template,
    active=EXCLUDED.active,
    description=EXCLUDED.description,
    updated_at=now();

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
  v_uid uuid:=auth.uid();
  v_project public.projects%ROWTYPE;
  v_salesperson uuid;
  v_notes text:=btrim(COALESCE(p_notes,''));
  v_is_source_seller boolean:=false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF length(v_notes)<10 THEN RAISE EXCEPTION 'Sales handover notes must contain meaningful delivery context.'; END IF;
  IF length(v_notes)>10000 THEN RAISE EXCEPTION 'Sales handover notes are too long.'; END IF;

  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
  IF v_project.status<>'Active' OR v_project.stage<>'Sales Handover' THEN
    RAISE EXCEPTION 'Sales handover can only be submitted while the active project is in Sales Handover.';
  END IF;

  SELECT salesperson_id INTO v_salesperson FROM public.crm_opportunities WHERE id=v_project.source_opportunity_id;
  v_is_source_seller:=v_salesperson IS NOT NULL AND v_salesperson=v_uid AND public.has_active_role(ARRAY['sales']::text[]);

  IF NOT v_is_source_seller AND NOT public.is_admin() AND v_project.project_manager_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the source salesperson, assigned Project Manager, or Administrator may submit handover notes.';
  END IF;

  UPDATE public.projects SET sales_handover_notes=v_notes,updated_at=now() WHERE id=v_project.id;

  IF v_is_source_seller THEN
    UPDATE public.project_tasks
    SET status='Done',completed_at=COALESCE(completed_at,now()),notes=concat_ws(E'\n',NULLIF(notes,''),'Sales handover submitted through protected workflow.'),updated_at=now()
    WHERE project_id=v_project.id AND workflow_key='sales_handover_submission' AND assigned_to=v_uid;
  END IF;

  IF v_is_source_seller AND v_project.project_manager_id IS NOT NULL THEN
    PERFORM public.service_queue_staff_operational_notification(
      v_project.project_manager_id,
      'project-sales-handover-submitted:'||v_project.id::text,
      'project_handover_ready',
      'project_handover_ready',
      'Sales handover ready - '||v_project.project_name,
      'Sales submitted the project handover. Review the customer context and complete the Project Management handover review before Client Onboarding.',
      '/admin/app/projects?tab=projects',
      jsonb_build_object('projectId',v_project.id,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'salespersonId',v_uid),
      now()
    );
  ELSIF v_is_source_seller THEN
    PERFORM public.service_queue_active_admins_operational_notification(
      'project-sales-handover-needs-pm:'||v_project.id::text,
      'project_handover_needs_pm',
      'project_handover_needs_pm',
      'Assign Project Manager - '||v_project.project_name,
      'Sales submitted the project handover. Assign a Project Manager so the handover can be reviewed and Client Onboarding can begin.',
      '/admin/app/projects?tab=projects',
      jsonb_build_object('projectId',v_project.id,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'salespersonId',v_uid),
      now()
    );
  END IF;

  RETURN jsonb_build_object('projectId',v_project.id,'submittedBy',v_uid,'sourceSellerSubmission',v_is_source_seller,'notes',v_notes,'submittedAt',now());
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_sales_project_handover(uuid,text) FROM PUBLIC,anon;
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
  SELECT o.salesperson_id INTO v_salesperson FROM public.crm_opportunities o WHERE o.id=NEW.source_opportunity_id;
  IF v_salesperson IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.user_profiles u
    WHERE u.id=v_salesperson AND u.status='active' AND u.role IN ('sales','sales_rep','sales_team')
  ) THEN RETURN NEW; END IF;

  PERFORM public.service_queue_staff_operational_notification(
    v_salesperson,
    'project-sales-handover-created:'||NEW.id::text,
    'project_handover_required',
    'project_handover_required',
    'Complete Sales Handover - '||NEW.project_name,
    'The verified sale created a delivery project. Submit the customer context and handover notes so Project Management can begin Client Onboarding.',
    '/admin/project-handover/'||NEW.id::text,
    jsonb_build_object('projectId',NEW.id,'projectNumber',NEW.project_number,'projectName',NEW.project_name,'clientId',NEW.client_id),
    now()
  );
  RETURN NEW;
END;
$function$;
-- A client design change request must create/reopen explicit UI/UX work before the project can return for approval.
-- Reuses project_client_approvals and project_tasks; no parallel approval or revision store is introduced.

CREATE OR REPLACE FUNCTION public.client_request_project_changes(
  p_project_id uuid,
  p_notes text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_project public.projects%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_next text;
  v_uiux_assignee uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF COALESCE(trim(p_notes),'')='' THEN RAISE EXCEPTION 'Please describe the requested changes.'; END IF;

  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;
  SELECT * INTO v_client FROM public.clients WHERE id=v_project.client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client record not found.'; END IF;
  IF v_client.linked_user_id IS NULL OR v_client.linked_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: this project is not linked to your client account.';
  END IF;

  v_next:=CASE
    WHEN v_project.stage='Client Design Approval' THEN 'UI/UX Design'
    WHEN v_project.stage='Client Review' THEN 'Final Revisions'
    ELSE NULL
  END;
  IF v_next IS NULL THEN RAISE EXCEPTION 'This project is not currently awaiting client review.'; END IF;

  INSERT INTO public.project_client_approvals(project_id,client_id,client_user_id,from_stage,to_stage,action,notes)
  VALUES(v_project.id,v_project.client_id,auth.uid(),v_project.stage,v_next,'Changes Requested',trim(p_notes));

  UPDATE public.project_tasks
  SET status='Done',
      completed_at=COALESCE(completed_at,now()),
      notes=concat_ws(E'\n',NULLIF(notes,''),'Client requested changes: '||trim(p_notes)),
      updated_at=now()
  WHERE project_id=v_project.id
    AND workflow_stage=v_project.stage
    AND required_for_stage IS TRUE;

  IF v_project.stage='Client Design Approval' THEN
    SELECT assigned_to INTO v_uiux_assignee
    FROM public.project_tasks
    WHERE project_id=v_project.id
      AND workflow_stage='UI/UX Design'
      AND assigned_to IS NOT NULL
    ORDER BY updated_at DESC,created_at DESC
    LIMIT 1;

    INSERT INTO public.project_tasks(
      project_id,title,description,department,assigned_to,created_by,priority,status,
      workflow_key,workflow_stage,required_for_stage,notes,completed_at
    ) VALUES(
      v_project.id,
      'Client Design Change Request',
      'Implement and verify the latest client-requested design changes before returning the project for formal Client Design Approval.',
      'UI/UX Design',
      v_uiux_assignee,
      auth.uid(),
      'High',
      'To Do',
      'client_design_change_request',
      'UI/UX Design',
      true,
      'Client request: '||trim(p_notes),
      NULL
    )
    ON CONFLICT (project_id,workflow_key) WHERE workflow_key IS NOT NULL DO UPDATE
    SET description=EXCLUDED.description,
        assigned_to=COALESCE(EXCLUDED.assigned_to,public.project_tasks.assigned_to),
        status='To Do',
        completed_at=NULL,
        notes=concat_ws(E'\n\n',NULLIF(public.project_tasks.notes,''),EXCLUDED.notes),
        updated_at=now();
  END IF;

  PERFORM set_config('profox.project_client_decision_rpc','1',true);
  UPDATE public.projects SET stage=v_next,updated_at=now() WHERE id=v_project.id;
  PERFORM set_config('profox.project_client_decision_rpc','',true);

  IF v_project.stage='Client Review' THEN
    UPDATE public.project_tasks
    SET notes=concat_ws(E'\n',NULLIF(notes,''),'Client request: '||trim(p_notes)),updated_at=now()
    WHERE project_id=v_project.id AND workflow_key='final_revision_set';
  END IF;

  RETURN v_next;
END;
$function$;

REVOKE ALL ON FUNCTION public.client_request_project_changes(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.client_request_project_changes(uuid,text) TO authenticated;
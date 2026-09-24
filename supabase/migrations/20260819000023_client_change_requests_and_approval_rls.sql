-- Client approvals/change requests use only explicit linked account authorization.
DROP POLICY IF EXISTS project_client_approvals_select ON public.project_client_approvals;
CREATE POLICY project_client_approvals_select ON public.project_client_approvals
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id=project_client_approvals.project_id AND p.project_manager_id=auth.uid())
  OR EXISTS (SELECT 1 FROM public.project_team pt WHERE pt.project_id=project_client_approvals.project_id AND pt.user_id=auth.uid())
  OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id=project_client_approvals.client_id AND c.linked_user_id=auth.uid())
);

CREATE OR REPLACE FUNCTION public.client_request_project_changes(p_project_id uuid, p_notes text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_next text;
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

  v_next:=CASE v_project.stage WHEN 'Client Design Approval' THEN 'UI/UX Design' WHEN 'Client Review' THEN 'Final Revisions' ELSE NULL END;
  IF v_next IS NULL THEN RAISE EXCEPTION 'This project is not currently awaiting client review.'; END IF;

  INSERT INTO public.project_client_approvals(project_id,client_id,client_user_id,from_stage,to_stage,action,notes)
  VALUES(v_project.id,v_project.client_id,auth.uid(),v_project.stage,v_next,'Changes Requested',trim(p_notes));
  UPDATE public.projects SET stage=v_next,updated_at=now() WHERE id=v_project.id;
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.client_request_project_changes(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.client_request_project_changes(uuid,text) TO authenticated;

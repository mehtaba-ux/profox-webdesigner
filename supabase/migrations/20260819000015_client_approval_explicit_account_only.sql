-- Client approvals require an explicit clients.linked_user_id relationship.
-- Also normalize the persisted company website URL.

CREATE OR REPLACE FUNCTION public.client_approve_project_stage(p_project_id uuid, p_notes text DEFAULT '')
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

  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found.'; END IF;

  SELECT * INTO v_client FROM public.clients WHERE id=v_project.client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client record not found.'; END IF;
  IF v_client.linked_user_id IS NULL OR v_client.linked_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: this project is not linked to your client account.';
  END IF;

  v_next := CASE v_project.stage
    WHEN 'Client Design Approval' THEN 'Development'
    WHEN 'Client Review' THEN 'Final Revisions'
    ELSE NULL
  END;
  IF v_next IS NULL THEN RAISE EXCEPTION 'This project is not currently awaiting a client approval.'; END IF;

  INSERT INTO public.project_client_approvals(project_id,client_id,client_user_id,from_stage,to_stage,notes)
  VALUES(v_project.id,v_project.client_id,auth.uid(),v_project.stage,v_next,NULLIF(trim(p_notes),''));

  UPDATE public.projects SET stage=v_next,updated_at=now() WHERE id=v_project.id;
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.client_approve_project_stage(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.client_approve_project_stage(uuid,text) TO authenticated;

UPDATE public.system_configuration
SET config_value=jsonb_set(config_value,'{website}',to_jsonb('https://www.profoxwebdesigners.com'::text),true),
    updated_at=now()
WHERE config_key='company_settings';

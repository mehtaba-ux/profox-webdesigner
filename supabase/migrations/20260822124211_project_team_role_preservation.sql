-- Preserve the explicit project ownership role when an Administrator is acting as Project Manager.
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
  FROM public.user_profiles u
  WHERE u.id=NEW.assigned_to;

  INSERT INTO public.project_team(project_id,user_id,role)
  VALUES(NEW.project_id,NEW.assigned_to,COALESCE(v_role,'Delivery Team'))
  ON CONFLICT (project_id,user_id) DO UPDATE
  SET role=CASE
    WHEN public.project_team.role='Project Manager' THEN 'Project Manager'
    ELSE EXCLUDED.role
  END;

  RETURN NEW;
END;
$function$;
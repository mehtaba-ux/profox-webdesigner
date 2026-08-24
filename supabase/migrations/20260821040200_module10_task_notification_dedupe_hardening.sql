-- Module 10 QA hardening — dedupe project-task material changes by state, not timestamp seconds.
CREATE OR REPLACE FUNCTION public.notify_project_task_operational_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_project public.projects%ROWTYPE; v_material boolean:=false; v_unassigned_high boolean:=false; v_payload jsonb; v_key text; v_state_hash text;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id=NEW.project_id;
  IF TG_OP='INSERT' THEN
    v_material:=NEW.assigned_to IS NOT NULL;
    v_unassigned_high:=NEW.assigned_to IS NULL AND lower(COALESCE(NEW.priority,''))='high';
  ELSE
    v_material:=NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.priority IS DISTINCT FROM OLD.priority;
    v_unassigned_high:=NEW.assigned_to IS NULL AND lower(COALESCE(NEW.priority,''))='high' AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to OR OLD.priority IS DISTINCT FROM NEW.priority);
  END IF;
  v_payload:=jsonb_build_object('projectName',COALESCE(v_project.project_name,'Project'),'taskTitle',NEW.title,'priority',COALESCE(NEW.priority,''),'dueDate',COALESCE(NEW.due_date::text,''));
  v_state_hash:=md5(concat_ws('|',COALESCE(NEW.assigned_to::text,''),COALESCE(NEW.due_date::text,''),COALESCE(NEW.priority,'')));
  IF v_material AND NEW.assigned_to IS NOT NULL AND lower(COALESCE(NEW.status,'')) NOT IN ('completed','done','cancelled') THEN
    v_key:='project-task-assignment:'||NEW.id||':'||v_state_hash;
    PERFORM public.service_queue_staff_operational_notification(NEW.assigned_to,v_key,'project_task_assigned','Project Task','Project task — '||NEW.title,COALESCE(v_project.project_name,'Project')||' · '||COALESCE(NEW.priority,'Normal')||' priority · due '||COALESCE(NEW.due_date::text,'not set'),'/admin/app/projects?tab=myWork',v_payload,now());
  END IF;
  IF v_unassigned_high AND lower(COALESCE(NEW.status,'')) NOT IN ('completed','done','cancelled') THEN
    v_key:='project-task-needs-owner:'||NEW.id||':'||v_state_hash;
    IF v_project.project_manager_id IS NOT NULL THEN
      PERFORM public.service_queue_staff_operational_notification(v_project.project_manager_id,v_key,'project_task_needs_owner','Project Task','High-priority task needs assignment — '||NEW.title,'Assign an accountable owner before this task becomes a delivery risk.','/admin/app/projects?tab=projects',v_payload,now());
    ELSE
      PERFORM public.service_queue_active_admins_operational_notification(v_key,'project_task_needs_owner','Project Task','High-priority task needs assignment — '||NEW.title,'The project has no PM/assignee for this high-priority task.','/admin/app/projects?tab=projects',v_payload,now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_project_task_operational_event() FROM PUBLIC,anon,authenticated;

-- Module 11 smart handoffs.
-- Notify only when responsibility crosses a business boundary; routine work remains in the command center.

CREATE OR REPLACE FUNCTION public.productivity_can_access_entity(p_entity_type text, p_entity_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_type text := lower(trim(COALESCE(p_entity_type,'')));
BEGIN
  IF v_uid IS NULL OR p_entity_id IS NULL THEN RETURN false; END IF;
  IF public.is_admin() THEN RETURN true; END IF;
  CASE v_type
    WHEN 'lead' THEN RETURN EXISTS(SELECT 1 FROM public.crm_leads x WHERE x.id=p_entity_id AND x.salesperson_id=v_uid);
    WHEN 'opportunity' THEN RETURN EXISTS(
      SELECT 1 FROM public.crm_opportunities x
      WHERE x.id=p_entity_id AND (
        x.salesperson_id=v_uid
        OR (
          public.has_active_role(ARRAY['project_manager']::text[])
          AND x.status='Won'
          AND EXISTS(SELECT 1 FROM public.payments p WHERE p.opportunity_id=x.id AND p.status='Verified' AND p.payment_type IN ('Advance','Full Payment'))
        )
      )
    );
    WHEN 'activity' THEN RETURN EXISTS(SELECT 1 FROM public.crm_activities x WHERE x.id=p_entity_id AND x.assigned_to=v_uid);
    WHEN 'meeting' THEN RETURN EXISTS(SELECT 1 FROM public.sales_meetings x WHERE x.id=p_entity_id AND x.salesperson_id=v_uid);
    WHEN 'quotation' THEN RETURN EXISTS(SELECT 1 FROM public.quotations x WHERE x.id=p_entity_id AND x.salesperson_id=v_uid);
    WHEN 'payment' THEN RETURN EXISTS(SELECT 1 FROM public.payments x WHERE x.id=p_entity_id AND x.salesperson_id=v_uid);
    WHEN 'client' THEN RETURN EXISTS(SELECT 1 FROM public.clients x WHERE x.id=p_entity_id AND x.salesperson_id=v_uid);
    WHEN 'project' THEN RETURN EXISTS(SELECT 1 FROM public.projects x WHERE x.id=p_entity_id AND (x.project_manager_id=v_uid OR x.created_by=v_uid OR EXISTS(SELECT 1 FROM public.project_team t WHERE t.project_id=x.id AND t.user_id=v_uid)));
    WHEN 'project_task' THEN RETURN EXISTS(SELECT 1 FROM public.project_tasks t JOIN public.projects p ON p.id=t.project_id WHERE t.id=p_entity_id AND (t.assigned_to=v_uid OR p.project_manager_id=v_uid OR EXISTS(SELECT 1 FROM public.project_team pt WHERE pt.project_id=p.id AND pt.user_id=v_uid)));
    WHEN 'applicant' THEN RETURN false;
    WHEN 'notification' THEN RETURN EXISTS(SELECT 1 FROM public.in_app_notifications x WHERE x.id=p_entity_id AND x.recipient_user_id=v_uid);
    ELSE RETURN false;
  END CASE;
END; $$;

CREATE OR REPLACE FUNCTION public.queue_productivity_delivery_handoff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record;
BEGIN
  IF NEW.status='Won' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) AND NOT EXISTS(SELECT 1 FROM public.projects p WHERE p.source_opportunity_id=NEW.id) THEN
    FOR r IN SELECT id FROM public.user_profiles WHERE status='active' AND role IN ('admin','project_manager') LOOP
      INSERT INTO public.in_app_notifications(recipient_user_id,notification_type,title,message,action_url,dedupe_key)
      VALUES(r.id,'Handoff','Delivery handoff ready',COALESCE(NULLIF(NEW.company_name,''),NEW.name)||' is Won and ready for delivery launch.','/admin/focus/opportunity/'||NEW.id::text,'productivity:delivery-handoff:'||NEW.id::text||':'||r.id::text)
      ON CONFLICT(dedupe_key) DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_queue_productivity_delivery_handoff ON public.crm_opportunities;
CREATE TRIGGER trg_queue_productivity_delivery_handoff AFTER INSERT OR UPDATE OF status ON public.crm_opportunities FOR EACH ROW EXECUTE FUNCTION public.queue_productivity_delivery_handoff();

CREATE OR REPLACE FUNCTION public.queue_productivity_project_assignment_handoff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record;
BEGIN
  IF TG_OP='INSERT' AND NEW.project_manager_id IS NULL THEN
    FOR r IN SELECT id FROM public.user_profiles WHERE status='active' AND role='admin' LOOP
      INSERT INTO public.in_app_notifications(recipient_user_id,notification_type,title,message,action_url,dedupe_key)
      VALUES(r.id,'Handoff','Assign a project manager',NEW.project_name||' has been created from the verified sale and needs a delivery owner.','/admin/focus/project/'||NEW.id::text,'productivity:project-owner:'||NEW.id::text||':'||r.id::text)
      ON CONFLICT(dedupe_key) DO NOTHING;
    END LOOP;
  END IF;
  IF NEW.project_manager_id IS NOT NULL AND (TG_OP='INSERT' OR OLD.project_manager_id IS DISTINCT FROM NEW.project_manager_id) THEN
    INSERT INTO public.in_app_notifications(recipient_user_id,notification_type,title,message,action_url,dedupe_key)
    VALUES(NEW.project_manager_id,'Handoff','Project assigned to you',NEW.project_name||' is now in your delivery ownership. Review the sales handover and current tasks.','/admin/focus/project/'||NEW.id::text,'productivity:project-assigned:'||NEW.id::text||':'||NEW.project_manager_id::text)
    ON CONFLICT(dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_queue_productivity_project_assignment_handoff ON public.projects;
CREATE TRIGGER trg_queue_productivity_project_assignment_handoff AFTER INSERT OR UPDATE OF project_manager_id ON public.projects FOR EACH ROW EXECUTE FUNCTION public.queue_productivity_project_assignment_handoff();

REVOKE ALL ON FUNCTION public.queue_productivity_delivery_handoff() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.queue_productivity_project_assignment_handoff() FROM PUBLIC,anon,authenticated;

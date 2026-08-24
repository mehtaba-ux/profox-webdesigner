-- Module 11 — ProFox Productivity & Action Engine core.
-- Adds a thin orchestration layer over existing business records. It does not create a second CRM/task system.

CREATE TABLE IF NOT EXISTS public.productivity_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  entity_type text NOT NULL,
  stage text NOT NULL DEFAULT '*',
  roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  CHECK (jsonb_typeof(checklist) = 'array')
);

CREATE TABLE IF NOT EXISTS public.productivity_checklist_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id uuid NOT NULL REFERENCES public.productivity_playbooks(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  stage_snapshot text NOT NULL DEFAULT '',
  completed_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(playbook_id, entity_type, entity_id, user_id),
  CHECK (jsonb_typeof(completed_items) = 'array')
);

CREATE TABLE IF NOT EXISTS public.productivity_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  action_key text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'Completed' CHECK (status IN ('Completed','Failed','Cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.productivity_daily_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  review_date date NOT NULL DEFAULT CURRENT_DATE,
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text NOT NULL DEFAULT '',
  tomorrow_focus text NOT NULL DEFAULT '',
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, review_date)
);

CREATE INDEX IF NOT EXISTS idx_productivity_playbooks_entity_stage ON public.productivity_playbooks(entity_type, stage) WHERE active IS TRUE;
CREATE INDEX IF NOT EXISTS idx_productivity_progress_user ON public.productivity_checklist_progress(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_productivity_action_log_user_date ON public.productivity_action_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_productivity_daily_reviews_user_date ON public.productivity_daily_reviews(user_id, review_date DESC);

ALTER TABLE public.productivity_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productivity_checklist_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productivity_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productivity_daily_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.productivity_playbooks FROM anon, authenticated;
REVOKE ALL ON TABLE public.productivity_checklist_progress FROM anon, authenticated;
REVOKE ALL ON TABLE public.productivity_action_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.productivity_daily_reviews FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.productivity_playbooks TO authenticated;
GRANT SELECT ON TABLE public.productivity_checklist_progress TO authenticated;
GRANT SELECT ON TABLE public.productivity_action_log TO authenticated;
GRANT SELECT ON TABLE public.productivity_daily_reviews TO authenticated;

CREATE POLICY productivity_playbooks_active_read ON public.productivity_playbooks
  FOR SELECT TO authenticated
  USING (active IS TRUE OR (SELECT public.is_admin()));
CREATE POLICY productivity_playbooks_admin_insert ON public.productivity_playbooks
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY productivity_playbooks_admin_update ON public.productivity_playbooks
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY productivity_playbooks_admin_delete ON public.productivity_playbooks
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

CREATE POLICY productivity_progress_self_or_admin_read ON public.productivity_checklist_progress
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY productivity_action_log_self_or_admin_read ON public.productivity_action_log
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY productivity_daily_reviews_self_or_admin_read ON public.productivity_daily_reviews
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.touch_productivity_playbook()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_item jsonb; v_seen text[] := ARRAY[]::text[];
BEGIN
  NEW.playbook_key := lower(trim(COALESCE(NEW.playbook_key,'')));
  NEW.playbook_key := regexp_replace(NEW.playbook_key,'[^a-z0-9_]+','_','g');
  NEW.name := left(trim(COALESCE(NEW.name,'')),180);
  NEW.description := left(trim(COALESCE(NEW.description,'')),2000);
  NEW.entity_type := lower(trim(COALESCE(NEW.entity_type,'')));
  NEW.stage := left(trim(COALESCE(NULLIF(NEW.stage,''),'*')),160);
  IF NEW.playbook_key='' OR NEW.name='' OR NEW.entity_type='' THEN RAISE EXCEPTION 'Playbook key, name and entity type are required.'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.checklist,'[]'::jsonb)) LOOP
    IF jsonb_typeof(v_item) <> 'object' OR trim(COALESCE(v_item->>'key',''))='' OR trim(COALESCE(v_item->>'label',''))='' THEN
      RAISE EXCEPTION 'Every checklist item requires key and label.';
    END IF;
    IF (v_item->>'key') = ANY(v_seen) THEN RAISE EXCEPTION 'Checklist item keys must be unique.'; END IF;
    v_seen := array_append(v_seen, v_item->>'key');
  END LOOP;
  NEW.updated_by := COALESCE(auth.uid(),NEW.updated_by);
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_touch_productivity_playbook ON public.productivity_playbooks;
CREATE TRIGGER trg_touch_productivity_playbook BEFORE INSERT OR UPDATE ON public.productivity_playbooks FOR EACH ROW EXECUTE FUNCTION public.touch_productivity_playbook();

CREATE OR REPLACE FUNCTION public.productivity_can_access_entity(p_entity_type text, p_entity_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_type text := lower(trim(COALESCE(p_entity_type,'')));
BEGIN
  IF v_uid IS NULL OR p_entity_id IS NULL THEN RETURN false; END IF;
  IF public.is_admin() THEN RETURN true; END IF;
  CASE v_type
    WHEN 'lead' THEN RETURN EXISTS(SELECT 1 FROM public.crm_leads x WHERE x.id=p_entity_id AND x.salesperson_id=v_uid);
    WHEN 'opportunity' THEN RETURN EXISTS(SELECT 1 FROM public.crm_opportunities x WHERE x.id=p_entity_id AND x.salesperson_id=v_uid);
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

CREATE OR REPLACE FUNCTION public.productivity_entity_stage(p_entity_type text, p_entity_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_stage text; v_type text := lower(trim(COALESCE(p_entity_type,'')));
BEGIN
  IF NOT public.productivity_can_access_entity(v_type,p_entity_id) THEN RAISE EXCEPTION 'You do not have access to this record.'; END IF;
  CASE v_type
    WHEN 'lead' THEN SELECT status INTO v_stage FROM public.crm_leads WHERE id=p_entity_id;
    WHEN 'opportunity' THEN SELECT CASE WHEN status<>'Open' THEN status ELSE stage END INTO v_stage FROM public.crm_opportunities WHERE id=p_entity_id;
    WHEN 'meeting' THEN SELECT status INTO v_stage FROM public.sales_meetings WHERE id=p_entity_id;
    WHEN 'quotation' THEN SELECT status INTO v_stage FROM public.quotations WHERE id=p_entity_id;
    WHEN 'project' THEN SELECT COALESCE(NULLIF(stage,''),status) INTO v_stage FROM public.projects WHERE id=p_entity_id;
    WHEN 'project_task' THEN SELECT status INTO v_stage FROM public.project_tasks WHERE id=p_entity_id;
    WHEN 'applicant' THEN SELECT stage INTO v_stage FROM public.applicants WHERE id=p_entity_id;
    WHEN 'payment' THEN SELECT status INTO v_stage FROM public.payments WHERE id=p_entity_id;
    WHEN 'client' THEN SELECT status INTO v_stage FROM public.clients WHERE id=p_entity_id;
    ELSE v_stage := '*';
  END CASE;
  RETURN COALESCE(v_stage,'*');
END; $$;

CREATE OR REPLACE FUNCTION public.get_productivity_playbook(p_entity_type text, p_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_stage text; v_role text; v_book public.productivity_playbooks%ROWTYPE; v_progress jsonb := '[]'::jsonb; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.productivity_can_access_entity(p_entity_type,p_entity_id) THEN RAISE EXCEPTION 'You do not have access to this record.'; END IF;
  v_stage := public.productivity_entity_stage(p_entity_type,p_entity_id);
  SELECT role INTO v_role FROM public.user_profiles WHERE id=v_uid AND status='active';
  SELECT * INTO v_book FROM public.productivity_playbooks b
  WHERE b.active IS TRUE AND b.entity_type=lower(trim(p_entity_type))
    AND (b.stage=v_stage OR b.stage='*')
    AND (cardinality(b.roles)=0 OR v_role=ANY(b.roles) OR public.is_admin())
  ORDER BY CASE WHEN b.stage=v_stage THEN 0 ELSE 1 END,b.sort_order,b.name LIMIT 1;
  IF v_book.id IS NULL THEN RETURN jsonb_build_object('stage',v_stage,'playbook',NULL,'completedItems','[]'::jsonb); END IF;
  SELECT COALESCE(completed_items,'[]'::jsonb) INTO v_progress FROM public.productivity_checklist_progress
  WHERE playbook_id=v_book.id AND entity_type=lower(trim(p_entity_type)) AND entity_id=p_entity_id AND user_id=v_uid;
  RETURN jsonb_build_object('stage',v_stage,'playbook',jsonb_build_object('id',v_book.id,'key',v_book.playbook_key,'name',v_book.name,'description',v_book.description,'checklist',v_book.checklist),'completedItems',COALESCE(v_progress,'[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.set_productivity_checklist_item(p_playbook_id uuid,p_entity_type text,p_entity_id uuid,p_item_key text,p_completed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_stage text; v_items jsonb; v_completed jsonb; v_all_done boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.productivity_can_access_entity(p_entity_type,p_entity_id) THEN RAISE EXCEPTION 'You do not have access to this record.'; END IF;
  SELECT checklist INTO v_items FROM public.productivity_playbooks WHERE id=p_playbook_id AND active IS TRUE;
  IF v_items IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_items) x WHERE x->>'key'=p_item_key) THEN RAISE EXCEPTION 'Checklist item not found.'; END IF;
  v_stage:=public.productivity_entity_stage(p_entity_type,p_entity_id);
  INSERT INTO public.productivity_checklist_progress(playbook_id,entity_type,entity_id,user_id,stage_snapshot,completed_items)
  VALUES(p_playbook_id,lower(trim(p_entity_type)),p_entity_id,v_uid,v_stage,CASE WHEN p_completed THEN jsonb_build_array(p_item_key) ELSE '[]'::jsonb END)
  ON CONFLICT(playbook_id,entity_type,entity_id,user_id) DO UPDATE SET
    stage_snapshot=EXCLUDED.stage_snapshot,
    completed_items=CASE WHEN p_completed THEN
      CASE WHEN public.productivity_checklist_progress.completed_items ? p_item_key THEN public.productivity_checklist_progress.completed_items ELSE public.productivity_checklist_progress.completed_items || jsonb_build_array(p_item_key) END
    ELSE COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements_text(public.productivity_checklist_progress.completed_items) x WHERE x<>p_item_key),'[]'::jsonb) END,
    updated_at=now();
  SELECT completed_items INTO v_completed FROM public.productivity_checklist_progress WHERE playbook_id=p_playbook_id AND entity_type=lower(trim(p_entity_type)) AND entity_id=p_entity_id AND user_id=v_uid;
  SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_items) i WHERE NOT (v_completed ? (i->>'key'))) INTO v_all_done;
  UPDATE public.productivity_checklist_progress SET completed_at=CASE WHEN v_all_done THEN COALESCE(completed_at,now()) ELSE NULL END,updated_at=now() WHERE playbook_id=p_playbook_id AND entity_type=lower(trim(p_entity_type)) AND entity_id=p_entity_id AND user_id=v_uid;
  RETURN jsonb_build_object('completedItems',v_completed,'allDone',v_all_done);
END; $$;

INSERT INTO public.system_configuration(config_key,config_value,description,updated_at)
VALUES('productivity_settings','{"active":true,"maxFocusItems":12,"dayCloseEnabled":true,"priority":{"meetingWithin60Minutes":100,"overdue":95,"newInboundLead":88,"dueToday":82,"staleQuotation":78,"projectTask":72,"upcoming":55}}'::jsonb,'Admin-configurable ProFox productivity ranking and daily operating settings.',now())
ON CONFLICT(config_key) DO NOTHING;

INSERT INTO public.productivity_playbooks(playbook_key,name,description,entity_type,stage,roles,checklist,sort_order) VALUES
('lead_new','New lead — first response','Make every new lead usable before outreach.','lead','New',ARRAY['sales','admin'],
 '[{"key":"verify_company","label":"Verify company, website and contact details"},{"key":"identify_fit","label":"Identify service fit, niche and likely problem"},{"key":"research_contact","label":"Research the decision maker and useful context"},{"key":"schedule_outreach","label":"Create the first outreach activity"}]'::jsonb,10),
('lead_follow_up','Lead follow-up','Keep the next action explicit and dated.','lead','Follow-Up',ARRAY['sales','admin'],
 '[{"key":"review_history","label":"Review previous contact and notes"},{"key":"prepare_value","label":"Prepare a relevant reason to follow up"},{"key":"contact","label":"Complete the follow-up"},{"key":"record_next","label":"Record outcome and the next dated action"}]'::jsonb,20),
('opportunity_meeting','Meeting preparation','Walk into every sales meeting prepared.','opportunity','Meeting Scheduled',ARRAY['sales','admin'],
 '[{"key":"review_qualification","label":"Review booking/qualification answers"},{"key":"review_website","label":"Review the prospect website and business"},{"key":"identify_problems","label":"Write the likely problems/opportunities"},{"key":"prepare_questions","label":"Prepare probing questions and meeting objective"}]'::jsonb,10),
('opportunity_requirements','Quotation readiness','Confirm commercial inputs before creating a quotation.','opportunity','Requirements Confirmed',ARRAY['sales','admin'],
 '[{"key":"scope","label":"Confirm requirements and scope"},{"key":"package","label":"Select package/add-ons or custom approach"},{"key":"payment","label":"Confirm payment schedule and commercial notes"},{"key":"quote","label":"Create and review the quotation"}]'::jsonb,20),
('quotation_sent','Quotation follow-up','Keep sent quotations moving without random chasing.','quotation','Sent',ARRAY['sales','admin'],
 '[{"key":"confirm_received","label":"Confirm the customer received the quotation"},{"key":"record_objections","label":"Record questions or objections"},{"key":"next_follow_up","label":"Set the next follow-up date"},{"key":"decision","label":"Record the decision when known"}]'::jsonb,10),
('meeting_scheduled','Meeting prep checklist','A short pre-call checklist for every scheduled meeting.','meeting','Scheduled',ARRAY['sales','admin'],
 '[{"key":"context","label":"Review CRM and qualification context"},{"key":"objective","label":"Set the desired meeting outcome"},{"key":"questions","label":"Prepare probing questions"},{"key":"join_ready","label":"Confirm meeting link and be ready five minutes early"}]'::jsonb,10),
('project_default','Project execution','Keep delivery work explicit, owned and client-connected.','project','*',ARRAY['project_manager','site_manager','uiux_designer','content_writer','developer','web_developer','developer_designer','qa','admin'],
 '[{"key":"scope","label":"Review scope, exclusions and handover"},{"key":"tasks","label":"Confirm current tasks, owners and due dates"},{"key":"blockers","label":"Resolve or escalate blockers"},{"key":"client","label":"Capture any client approval or feedback needed"}]'::jsonb,50),
('applicant_video_review','Candidate video review','Make the video decision quickly and consistently.','applicant','Video Review',ARRAY['admin'],
 '[{"key":"watch","label":"Watch the full introduction video"},{"key":"english","label":"Assess English and communication confidence"},{"key":"sales_fit","label":"Assess sales fit and professionalism"},{"key":"decision","label":"Record pass/fail and move the candidate"}]'::jsonb,10)
ON CONFLICT(playbook_key) DO NOTHING;

REVOKE ALL ON FUNCTION public.touch_productivity_playbook() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.productivity_can_access_entity(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.productivity_entity_stage(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_productivity_playbook(text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_productivity_checklist_item(uuid,text,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_productivity_playbook(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_productivity_checklist_item(uuid,text,uuid,text,boolean) TO authenticated;
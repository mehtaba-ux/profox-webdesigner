-- Module 11 final role-family and internal-staff security hardening.

CREATE OR REPLACE FUNCTION public.productivity_can_access_entity(p_entity_type text, p_entity_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_type text := lower(trim(COALESCE(p_entity_type,'')));
  v_role text;
  v_status text;
BEGIN
  IF v_uid IS NULL OR p_entity_id IS NULL THEN RETURN false; END IF;
  SELECT role,status INTO v_role,v_status FROM public.user_profiles WHERE id=v_uid;
  IF v_status IS DISTINCT FROM 'active' OR v_role IS NULL OR v_role IN ('customer','pending') THEN RETURN false; END IF;
  IF v_role='admin' THEN RETURN true; END IF;

  CASE v_type
    WHEN 'lead' THEN RETURN EXISTS(SELECT 1 FROM public.crm_leads x WHERE x.id=p_entity_id AND x.salesperson_id=v_uid);
    WHEN 'opportunity' THEN RETURN EXISTS(
      SELECT 1 FROM public.crm_opportunities x
      WHERE x.id=p_entity_id AND (
        x.salesperson_id=v_uid
        OR (
          v_role='project_manager'
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

CREATE OR REPLACE FUNCTION public.get_productivity_playbook(p_entity_type text, p_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_stage text;
  v_role text;
  v_book public.productivity_playbooks%ROWTYPE;
  v_progress jsonb := '[]'::jsonb;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.productivity_can_access_entity(p_entity_type,p_entity_id) THEN RAISE EXCEPTION 'You do not have access to this record.'; END IF;
  v_stage := public.productivity_entity_stage(p_entity_type,p_entity_id);
  SELECT role INTO v_role FROM public.user_profiles WHERE id=v_uid AND status='active';

  SELECT * INTO v_book
  FROM public.productivity_playbooks b
  WHERE b.active IS TRUE
    AND b.entity_type=lower(trim(p_entity_type))
    AND (b.stage=v_stage OR b.stage='*')
    AND (
      cardinality(b.roles)=0
      OR v_role=ANY(b.roles)
      OR (v_role IN ('sales','sales_rep','sales_team') AND 'sales'=ANY(b.roles))
      OR (v_role='web_developer' AND ('developer'=ANY(b.roles) OR 'web_developer'=ANY(b.roles)))
      OR v_role='admin'
    )
  ORDER BY CASE WHEN b.stage=v_stage THEN 0 ELSE 1 END,b.sort_order,b.name
  LIMIT 1;

  IF v_book.id IS NULL THEN RETURN jsonb_build_object('stage',v_stage,'playbook',NULL,'completedItems','[]'::jsonb); END IF;
  SELECT COALESCE(completed_items,'[]'::jsonb) INTO v_progress
  FROM public.productivity_checklist_progress
  WHERE playbook_id=v_book.id AND entity_type=lower(trim(p_entity_type)) AND entity_id=p_entity_id AND user_id=v_uid;

  RETURN jsonb_build_object(
    'stage',v_stage,
    'playbook',jsonb_build_object('id',v_book.id,'key',v_book.playbook_key,'name',v_book.name,'description',v_book.description,'checklist',v_book.checklist),
    'completedItems',COALESCE(v_progress,'[]'::jsonb)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.search_productivity_workspace(p_query text,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_role text; v_status text;
  v_q text:='%'||lower(trim(COALESCE(p_query,'')))||'%';
  v_limit int:=LEAST(GREATEST(COALESCE(p_limit,20),1),40);
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT role,status INTO v_role,v_status FROM public.user_profiles WHERE id=v_uid;
  IF v_status<>'active' OR v_role IN ('customer','pending') THEN RAISE EXCEPTION 'Active staff access required.'; END IF;
  IF length(trim(COALESCE(p_query,'')))<2 THEN RETURN '[]'::jsonb; END IF;

  WITH results AS (
    SELECT 'lead' entity_type,l.id entity_id,COALESCE(NULLIF(l.company_name,''),l.title) title,COALESCE(NULLIF(l.contact_name,''),l.email,'Lead') subtitle,'/admin/app/crm?tab=crm_leads' url,10 rank
    FROM public.crm_leads l WHERE (v_role='admin' OR l.salesperson_id=v_uid) AND lower(COALESCE(l.company_name,'')||' '||COALESCE(l.title,'')||' '||COALESCE(l.contact_name,'')||' '||COALESCE(l.email,'')) LIKE v_q
    UNION ALL
    SELECT 'opportunity',o.id,COALESCE(NULLIF(o.company_name,''),o.name),o.stage||' · '||COALESCE(o.contact_name,''),'/admin/app/crm?tab=pipeline',20
    FROM public.crm_opportunities o WHERE (v_role='admin' OR o.salesperson_id=v_uid OR (v_role='project_manager' AND public.productivity_can_access_entity('opportunity',o.id))) AND lower(COALESCE(o.company_name,'')||' '||COALESCE(o.name,'')||' '||COALESCE(o.contact_name,'')||' '||COALESCE(o.email,'')) LIKE v_q
    UNION ALL
    SELECT 'client',c.id,c.company_name,COALESCE(NULLIF(c.primary_contact_name,''),c.email,'Client'),'/admin/app/clients?tab=clients',30
    FROM public.clients c WHERE (v_role='admin' OR c.salesperson_id=v_uid) AND lower(COALESCE(c.company_name,'')||' '||COALESCE(c.primary_contact_name,'')||' '||COALESCE(c.email,'')) LIKE v_q
    UNION ALL
    SELECT 'quotation',q.id,COALESCE(NULLIF(q.customer_name,''),q.quotation_number),q.quotation_number||' · '||q.status,'/admin/app/sales?tab=quotations',40
    FROM public.quotations q WHERE (v_role='admin' OR q.salesperson_id=v_uid) AND lower(COALESCE(q.customer_name,'')||' '||COALESCE(q.contact_name,'')||' '||COALESCE(q.email,'')||' '||COALESCE(q.quotation_number,'')) LIKE v_q
    UNION ALL
    SELECT 'project',p.id,p.project_name,p.project_number||' · '||COALESCE(p.stage,p.status,''),'/admin/app/projects?tab=projects',50
    FROM public.projects p WHERE (v_role='admin' OR p.project_manager_id=v_uid OR p.created_by=v_uid OR EXISTS(SELECT 1 FROM public.project_team pt WHERE pt.project_id=p.id AND pt.user_id=v_uid)) AND lower(COALESCE(p.project_name,'')||' '||COALESCE(p.project_number,'')||' '||COALESCE(p.requirements_summary,'')) LIKE v_q
    UNION ALL
    SELECT 'meeting',m.id,COALESCE(NULLIF(m.title,''),'Meeting'),COALESCE(NULLIF(m.attendee_name,''),m.attendee_email,'Meeting'),'/admin/meeting-prep/'||m.id,60
    FROM public.sales_meetings m WHERE (v_role='admin' OR m.salesperson_id=v_uid) AND lower(COALESCE(m.title,'')||' '||COALESCE(m.attendee_name,'')||' '||COALESCE(m.attendee_email,'')) LIKE v_q
    UNION ALL
    SELECT 'applicant',a.id,a.full_name,a.stage||' · '||a.email,'/admin/app/recruitment?tab=recruitment',70
    FROM public.applicants a WHERE v_role='admin' AND lower(COALESCE(a.full_name,'')||' '||COALESCE(a.email,'')||' '||COALESCE(a.position,'')||' '||COALESCE(a.stage,'')) LIKE v_q
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('entityType',entity_type,'entityId',entity_id,'title',title,'subtitle',subtitle,'url',url) ORDER BY rank,title),'[]'::jsonb)
  INTO v_rows FROM (SELECT * FROM results ORDER BY rank,title LIMIT v_limit) x;
  RETURN v_rows;
END; $$;

CREATE OR REPLACE FUNCTION public.get_productivity_metrics(p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_days int:=LEAST(GREATEST(COALESCE(p_days,7),1),90);
  v_role text; v_status text; v_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT role,status INTO v_role,v_status FROM public.user_profiles WHERE id=v_uid;
  IF v_status<>'active' OR v_role IN ('customer','pending') THEN RAISE EXCEPTION 'Active staff access required.'; END IF;
  v_admin:=(v_role='admin');
  RETURN jsonb_build_object(
    'days',v_days,
    'actionsCompleted',(SELECT count(*) FROM public.productivity_action_log WHERE (v_admin OR user_id=v_uid) AND status='Completed' AND created_at>=now()-make_interval(days=>v_days)),
    'activitiesCompleted',(SELECT count(*) FROM public.crm_activities WHERE (v_admin OR assigned_to=v_uid) AND completed_at>=now()-make_interval(days=>v_days)),
    'projectTasksCompleted',(SELECT count(*) FROM public.project_tasks WHERE (v_admin OR assigned_to=v_uid) AND completed_at>=now()-make_interval(days=>v_days)),
    'meetingsCompleted',(SELECT count(*) FROM public.sales_meetings WHERE (v_admin OR salesperson_id=v_uid) AND completed_at>=now()-make_interval(days=>v_days)),
    'dayReviews',(SELECT count(*) FROM public.productivity_daily_reviews WHERE (v_admin OR user_id=v_uid) AND review_date>=CURRENT_DATE-v_days)
  );
END; $$;
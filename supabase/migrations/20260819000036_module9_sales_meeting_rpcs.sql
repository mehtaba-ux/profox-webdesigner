-- Module 9 — Secure, idempotent meeting lifecycle RPCs.
-- Meeting rows are not directly writable by authenticated clients.

CREATE OR REPLACE FUNCTION public.schedule_sales_meeting(
  p_request_key uuid,
  p_salesperson_id uuid,
  p_lead_id uuid DEFAULT NULL,
  p_opportunity_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_meeting_type text DEFAULT 'Discovery Meeting',
  p_title text DEFAULT '',
  p_description text DEFAULT '',
  p_start_at timestamptz DEFAULT NULL,
  p_end_at timestamptz DEFAULT NULL,
  p_timezone text DEFAULT 'UTC',
  p_provider text DEFAULT 'Manual',
  p_meeting_url text DEFAULT '',
  p_attendee_name text DEFAULT '',
  p_attendee_email text DEFAULT ''
)
RETURNS public.sales_meetings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.sales_meetings%ROWTYPE;
  v_meeting public.sales_meetings%ROWTYPE;
  v_activity_id uuid;
  v_relation_owner uuid;
  v_settings jsonb;
  v_duration_minutes integer;
  v_allowed_duration boolean;
  v_meeting_type_allowed boolean;
  v_min_notice integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'Request key is required.'; END IF;

  SELECT * INTO v_existing FROM public.sales_meetings WHERE request_key = p_request_key;
  IF FOUND THEN
    IF public.is_admin() OR v_existing.salesperson_id = auth.uid() THEN RETURN v_existing; END IF;
    RAISE EXCEPTION 'Request key already belongs to another user.';
  END IF;

  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'A valid meeting start and end time is required.';
  END IF;
  IF p_salesperson_id IS NULL THEN RAISE EXCEPTION 'Salesperson is required.'; END IF;
  IF num_nonnulls(p_lead_id,p_opportunity_id,p_client_id) > 1 THEN
    RAISE EXCEPTION 'A meeting may link to only one primary CRM record.';
  END IF;
  IF p_lead_id IS NULL AND p_opportunity_id IS NULL AND p_client_id IS NULL AND NULLIF(trim(p_attendee_email),'') IS NULL THEN
    RAISE EXCEPTION 'Link a CRM record or provide an attendee email.';
  END IF;
  IF lower(COALESCE(trim(p_provider),'manual')) <> 'manual' THEN
    RAISE EXCEPTION 'External calendar providers are not enabled yet. Use Manual for this release.';
  END IF;

  SELECT config_value INTO v_settings
  FROM public.system_configuration WHERE config_key='meeting_settings';
  v_settings := COALESCE(v_settings,'{}'::jsonb);
  IF COALESCE((v_settings->>'active')::boolean,true) IS NOT TRUE THEN
    RAISE EXCEPTION 'New Sales meetings are disabled by Admin configuration.';
  END IF;

  v_duration_minutes := round(extract(epoch from (p_end_at-p_start_at))/60.0)::integer;
  SELECT EXISTS(
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_settings->'allowedDurations','[15,30,45,60]'::jsonb)) x
    WHERE x::integer=v_duration_minutes
  ) INTO v_allowed_duration;
  IF NOT v_allowed_duration THEN RAISE EXCEPTION 'Meeting duration is not allowed by Admin configuration.'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_settings->'meetingTypes','["Discovery Meeting"]'::jsonb)) x
    WHERE x=COALESCE(NULLIF(trim(p_meeting_type),''),'Discovery Meeting')
  ) INTO v_meeting_type_allowed;
  IF NOT v_meeting_type_allowed THEN RAISE EXCEPTION 'Meeting type is not enabled by Admin configuration.'; END IF;

  v_min_notice := GREATEST(COALESCE((v_settings->>'minimumBookingNoticeMinutes')::integer,0),0);
  IF NOT public.is_admin() AND p_start_at < now() + make_interval(mins => v_min_notice) THEN
    RAISE EXCEPTION 'Meeting does not satisfy the configured minimum booking notice.';
  END IF;

  IF NOT public.is_admin() THEN
    IF auth.uid() <> p_salesperson_id OR NOT public.has_active_role(ARRAY['sales']::text[]) THEN
      RAISE EXCEPTION 'Only an active Sales Representative may schedule their own meetings.';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id=p_salesperson_id AND p.status='active' AND p.role IN ('sales','admin')
    ) THEN RAISE EXCEPTION 'Assigned meeting owner must be an active Sales Representative or Admin.'; END IF;
  END IF;

  IF p_lead_id IS NOT NULL THEN
    SELECT salesperson_id INTO v_relation_owner FROM public.crm_leads WHERE id=p_lead_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found.'; END IF;
  ELSIF p_opportunity_id IS NOT NULL THEN
    SELECT salesperson_id INTO v_relation_owner FROM public.crm_opportunities WHERE id=p_opportunity_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Opportunity not found.'; END IF;
  ELSIF p_client_id IS NOT NULL THEN
    SELECT salesperson_id INTO v_relation_owner FROM public.clients WHERE id=p_client_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Client not found.'; END IF;
  END IF;

  IF v_relation_owner IS NOT NULL AND v_relation_owner <> p_salesperson_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'The related CRM record is assigned to another salesperson.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sales_meetings m
    WHERE m.salesperson_id=p_salesperson_id
      AND m.status IN ('Scheduled','Rescheduled')
      AND m.start_at < p_end_at
      AND m.end_at > p_start_at
  ) THEN RAISE EXCEPTION 'This time conflicts with an existing meeting.'; END IF;

  BEGIN
    INSERT INTO public.sales_meetings(
      request_key,lead_id,opportunity_id,client_id,salesperson_id,meeting_type,title,description,
      start_at,end_at,timezone,provider,meeting_url,attendee_name,attendee_email,status,sync_status,created_by
    ) VALUES (
      p_request_key,p_lead_id,p_opportunity_id,p_client_id,p_salesperson_id,
      COALESCE(NULLIF(trim(p_meeting_type),''),'Discovery Meeting'),
      COALESCE(NULLIF(trim(p_title),''),'ProFox Meeting'),COALESCE(p_description,''),
      p_start_at,p_end_at,COALESCE(NULLIF(trim(p_timezone),''),'UTC'),
      'Manual',COALESCE(p_meeting_url,''),COALESCE(p_attendee_name,''),lower(COALESCE(trim(p_attendee_email),'')),
      'Scheduled','Not Connected',auth.uid()
    ) RETURNING * INTO v_meeting;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.sales_meetings WHERE request_key=p_request_key;
    IF FOUND AND (public.is_admin() OR v_existing.salesperson_id=auth.uid()) THEN RETURN v_existing; END IF;
    RAISE;
  END;

  INSERT INTO public.crm_activities(
    lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by
  ) VALUES (
    p_lead_id,p_opportunity_id,p_salesperson_id,'Discovery Meeting',v_meeting.title,p_start_at,
    'Scheduled','Meeting','Meeting ID: '||v_meeting.id::text,auth.uid()
  ) RETURNING id INTO v_activity_id;

  UPDATE public.sales_meetings SET activity_id=v_activity_id WHERE id=v_meeting.id RETURNING * INTO v_meeting;

  IF p_opportunity_id IS NOT NULL THEN
    UPDATE public.crm_opportunities
    SET meeting_at=p_start_at,
        meeting_url=CASE WHEN trim(COALESCE(p_meeting_url,''))<>'' THEN p_meeting_url ELSE meeting_url END,
        stage=CASE WHEN status='Open' AND stage='Qualified' THEN 'Meeting Scheduled' ELSE stage END,
        updated_at=now()
    WHERE id=p_opportunity_id;
  END IF;

  RETURN v_meeting;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_sales_meeting(
  p_meeting_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_timezone text,
  p_meeting_url text DEFAULT NULL
)
RETURNS public.sales_meetings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meeting public.sales_meetings%ROWTYPE;
  v_settings jsonb;
  v_duration_minutes integer;
  v_allowed_duration boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_meeting FROM public.sales_meetings WHERE id=p_meeting_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found.'; END IF;
  IF NOT public.is_admin() AND (v_meeting.salesperson_id<>auth.uid() OR NOT public.has_active_role(ARRAY['sales']::text[])) THEN
    RAISE EXCEPTION 'Unauthorized meeting update.';
  END IF;
  IF p_end_at<=p_start_at THEN RAISE EXCEPTION 'Meeting end must be after start.'; END IF;
  IF v_meeting.status IN ('Completed','Cancelled','No Show') THEN RAISE EXCEPTION 'This meeting can no longer be rescheduled.'; END IF;

  SELECT config_value INTO v_settings FROM public.system_configuration WHERE config_key='meeting_settings';
  v_settings := COALESCE(v_settings,'{}'::jsonb);
  v_duration_minutes := round(extract(epoch from (p_end_at-p_start_at))/60.0)::integer;
  SELECT EXISTS(
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_settings->'allowedDurations','[15,30,45,60]'::jsonb)) x
    WHERE x::integer=v_duration_minutes
  ) INTO v_allowed_duration;
  IF NOT v_allowed_duration THEN RAISE EXCEPTION 'Meeting duration is not allowed by Admin configuration.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.sales_meetings m
    WHERE m.salesperson_id=v_meeting.salesperson_id AND m.id<>v_meeting.id
      AND m.status IN ('Scheduled','Rescheduled') AND m.start_at<p_end_at AND m.end_at>p_start_at
  ) THEN RAISE EXCEPTION 'This time conflicts with an existing meeting.'; END IF;

  UPDATE public.sales_meetings
  SET start_at=p_start_at,end_at=p_end_at,timezone=COALESCE(NULLIF(trim(p_timezone),''),timezone),
      meeting_url=COALESCE(p_meeting_url,meeting_url),status='Rescheduled',rescheduled_at=now(),
      sync_status='Not Connected',updated_at=now()
  WHERE id=p_meeting_id RETURNING * INTO v_meeting;

  IF v_meeting.activity_id IS NOT NULL THEN
    UPDATE public.crm_activities SET due_at=p_start_at,status='Scheduled',updated_at=now() WHERE id=v_meeting.activity_id;
  END IF;
  IF v_meeting.opportunity_id IS NOT NULL THEN
    UPDATE public.crm_opportunities SET meeting_at=p_start_at,meeting_url=v_meeting.meeting_url,updated_at=now() WHERE id=v_meeting.opportunity_id;
  END IF;
  RETURN v_meeting;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_sales_meeting(p_meeting_id uuid,p_reason text DEFAULT '')
RETURNS public.sales_meetings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_meeting public.sales_meetings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_meeting FROM public.sales_meetings WHERE id=p_meeting_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found.'; END IF;
  IF NOT public.is_admin() AND (v_meeting.salesperson_id<>auth.uid() OR NOT public.has_active_role(ARRAY['sales']::text[])) THEN RAISE EXCEPTION 'Unauthorized meeting update.'; END IF;
  IF v_meeting.status IN ('Completed','No Show') THEN RAISE EXCEPTION 'Closed meetings cannot be cancelled.'; END IF;
  IF v_meeting.status='Cancelled' THEN RETURN v_meeting; END IF;

  UPDATE public.sales_meetings
  SET status='Cancelled',cancelled_at=now(),outcome=CASE WHEN trim(COALESCE(p_reason,''))<>'' THEN p_reason ELSE outcome END,
      sync_status='Not Connected',updated_at=now()
  WHERE id=p_meeting_id RETURNING * INTO v_meeting;
  IF v_meeting.activity_id IS NOT NULL THEN
    UPDATE public.crm_activities SET status='Cancelled',notes=trim(concat_ws(E'\n',NULLIF(notes,''),NULLIF(p_reason,''))),updated_at=now() WHERE id=v_meeting.activity_id;
  END IF;
  RETURN v_meeting;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_sales_meeting(
  p_meeting_id uuid,
  p_status text,
  p_outcome text DEFAULT '',
  p_requirements_summary text DEFAULT '',
  p_problems_identified text DEFAULT '',
  p_decision_makers text DEFAULT '',
  p_commercial_notes text DEFAULT '',
  p_timeline_notes text DEFAULT '',
  p_next_step text DEFAULT '',
  p_follow_up_at timestamptz DEFAULT NULL
)
RETURNS public.sales_meetings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_meeting public.sales_meetings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF p_status NOT IN ('Completed','No Show') THEN RAISE EXCEPTION 'Final meeting status must be Completed or No Show.'; END IF;
  SELECT * INTO v_meeting FROM public.sales_meetings WHERE id=p_meeting_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found.'; END IF;
  IF NOT public.is_admin() AND (v_meeting.salesperson_id<>auth.uid() OR NOT public.has_active_role(ARRAY['sales']::text[])) THEN RAISE EXCEPTION 'Unauthorized meeting update.'; END IF;
  IF v_meeting.status='Cancelled' THEN RAISE EXCEPTION 'Cancelled meetings cannot be finalized.'; END IF;
  IF v_meeting.status IN ('Completed','No Show') THEN
    IF v_meeting.status=p_status THEN RETURN v_meeting; END IF;
    RAISE EXCEPTION 'Meeting is already closed.';
  END IF;

  UPDATE public.sales_meetings SET
    status=p_status,
    completed_at=CASE WHEN p_status='Completed' THEN now() ELSE NULL END,
    outcome=COALESCE(p_outcome,''),requirements_summary=COALESCE(p_requirements_summary,''),
    problems_identified=COALESCE(p_problems_identified,''),decision_makers=COALESCE(p_decision_makers,''),
    commercial_notes=COALESCE(p_commercial_notes,''),timeline_notes=COALESCE(p_timeline_notes,''),
    next_step=COALESCE(p_next_step,''),follow_up_at=p_follow_up_at,updated_at=now()
  WHERE id=p_meeting_id RETURNING * INTO v_meeting;

  IF v_meeting.activity_id IS NOT NULL THEN
    UPDATE public.crm_activities
    SET status='Completed',completed_at=now(),notes=trim(concat_ws(E'\n',NULLIF(notes,''),'Meeting result: '||p_status,NULLIF(p_outcome,''))),updated_at=now()
    WHERE id=v_meeting.activity_id;
  END IF;

  IF p_status='Completed' AND v_meeting.opportunity_id IS NOT NULL THEN
    UPDATE public.crm_opportunities
    SET requirements_summary=CASE WHEN trim(COALESCE(p_requirements_summary,''))<>'' THEN p_requirements_summary ELSE requirements_summary END,
        next_follow_up_at=COALESCE(p_follow_up_at,next_follow_up_at),updated_at=now()
    WHERE id=v_meeting.opportunity_id;
  END IF;

  IF p_follow_up_at IS NOT NULL AND trim(COALESCE(p_next_step,''))<>'' THEN
    INSERT INTO public.crm_activities(lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by)
    VALUES(v_meeting.lead_id,v_meeting.opportunity_id,v_meeting.salesperson_id,'Meeting Follow-Up',left(trim(p_next_step),250),
      p_follow_up_at,'Scheduled','Follow-Up','Created from Sales Meeting: '||v_meeting.title,auth.uid());
  END IF;

  RETURN v_meeting;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_sales_meeting(uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.reschedule_sales_meeting(uuid,timestamptz,timestamptz,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_sales_meeting(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.finalize_sales_meeting(uuid,text,text,text,text,text,text,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.schedule_sales_meeting(uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_sales_meeting(uuid,timestamptz,timestamptz,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_sales_meeting(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_sales_meeting(uuid,text,text,text,text,text,text,text,text,timestamptz) TO authenticated;

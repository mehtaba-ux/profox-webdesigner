-- Module 13G hardening — align the original Module 9 integrity guard with optional external sync metadata.
-- Scheduling remains native/Manual. Only service-controlled external ids, sync status and Meet URL may change after creation.

CREATE OR REPLACE FUNCTION public.enforce_sales_meeting_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_settings jsonb;
  v_relation_owner uuid;
  v_opportunity_status text;
  v_duration integer;
  v_allowed_duration boolean;
  v_allowed_type boolean;
  v_min_notice integer;
  v_timezone text;
  v_working_days integer[];
  v_work_start time;
  v_work_end time;
  v_user_active boolean;
  v_buffer_before integer;
  v_buffer_after integer;
  v_local_start timestamp;
  v_local_end timestamp;
  v_local_dow integer;
  v_schedule_changed boolean;
BEGIN
  IF NEW.end_at <= NEW.start_at THEN RAISE EXCEPTION 'Meeting end must be after meeting start.'; END IF;

  -- ProFox remains the scheduling authority. New meetings cannot be created as external-provider records.
  -- On later service-only sync updates, preserve the original provider and do not erase sync metadata.
  IF TG_OP='INSERT' THEN
    IF lower(trim(COALESCE(NEW.provider, 'Manual'))) <> 'manual' THEN
      RAISE EXCEPTION 'Meetings must be created in ProFox before optional external synchronization.';
    END IF;
    NEW.provider := 'Manual';
    NEW.sync_status := 'Not Connected';
    NEW.sync_error := NULL;
  ELSE
    NEW.provider := OLD.provider;
  END IF;

  v_schedule_changed := TG_OP='INSERT'
    OR NEW.start_at IS DISTINCT FROM OLD.start_at
    OR NEW.end_at IS DISTINCT FROM OLD.end_at
    OR NEW.meeting_type IS DISTINCT FROM OLD.meeting_type
    OR NEW.salesperson_id IS DISTINCT FROM OLD.salesperson_id
    OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
    OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
    OR NEW.client_id IS DISTINCT FROM OLD.client_id;

  IF NEW.status IN ('Scheduled','Rescheduled') AND v_schedule_changed AND NOT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = NEW.salesperson_id AND p.status = 'active' AND p.role IN ('sales', 'admin')
  ) THEN
    RAISE EXCEPTION 'Meeting owner must be an active Sales Representative or Administrator.';
  END IF;

  IF num_nonnulls(NEW.lead_id, NEW.opportunity_id, NEW.client_id) > 1 THEN
    RAISE EXCEPTION 'A meeting may link to only one primary CRM record.';
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    SELECT salesperson_id INTO v_relation_owner FROM public.crm_leads WHERE id=NEW.lead_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found.'; END IF;
  ELSIF NEW.opportunity_id IS NOT NULL THEN
    SELECT salesperson_id,status INTO v_relation_owner,v_opportunity_status FROM public.crm_opportunities WHERE id=NEW.opportunity_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Opportunity not found.'; END IF;
    IF NEW.status IN ('Scheduled','Rescheduled') AND v_schedule_changed AND v_opportunity_status <> 'Open' THEN
      RAISE EXCEPTION 'New or rescheduled meetings may only target an open opportunity.';
    END IF;
  ELSIF NEW.client_id IS NOT NULL THEN
    SELECT salesperson_id INTO v_relation_owner FROM public.clients WHERE id=NEW.client_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Client not found.'; END IF;
  END IF;

  IF (NEW.lead_id IS NOT NULL OR NEW.opportunity_id IS NOT NULL OR NEW.client_id IS NOT NULL) AND v_schedule_changed THEN
    IF v_relation_owner IS NULL AND NOT public.is_admin() THEN RAISE EXCEPTION 'The related CRM record must be assigned before a Sales Representative can schedule a meeting.'; END IF;
    IF v_relation_owner IS NOT NULL AND v_relation_owner <> NEW.salesperson_id THEN RAISE EXCEPTION 'Meeting owner must match the salesperson assigned to the related CRM record.'; END IF;
  ELSIF NEW.lead_id IS NULL AND NEW.opportunity_id IS NULL AND NEW.client_id IS NULL
        AND NULLIF(trim(COALESCE(NEW.attendee_email,'')),'') IS NULL THEN
    RAISE EXCEPTION 'External meetings require an attendee email.';
  END IF;

  IF NULLIF(trim(COALESCE(NEW.meeting_url,'')),'') IS NOT NULL AND NEW.meeting_url !~* '^https?://' THEN
    RAISE EXCEPTION 'Meeting link must begin with http:// or https://.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone) THEN
    RAISE EXCEPTION 'Invalid IANA timezone: %', NEW.timezone;
  END IF;

  IF NEW.status IN ('Scheduled','Rescheduled') AND v_schedule_changed THEN
    SELECT config_value INTO v_settings FROM public.system_configuration WHERE config_key='meeting_settings';
    v_settings := COALESCE(v_settings,'{}'::jsonb);

    IF TG_OP='INSERT' AND COALESCE((v_settings->>'active')::boolean,true) IS NOT TRUE THEN
      RAISE EXCEPTION 'New Sales meetings are disabled by Admin configuration.';
    END IF;

    v_duration := round(extract(epoch FROM (NEW.end_at-NEW.start_at))/60.0)::integer;
    SELECT EXISTS(
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_settings->'allowedDurations','[15,30,45,60]'::jsonb)) x
      WHERE x::integer=v_duration
    ) INTO v_allowed_duration;
    IF NOT v_allowed_duration THEN RAISE EXCEPTION 'Meeting duration is not allowed by Admin configuration.'; END IF;

    SELECT EXISTS(
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_settings->'meetingTypes','["Discovery Meeting"]'::jsonb)) x
      WHERE x=NEW.meeting_type
    ) INTO v_allowed_type;
    IF NOT v_allowed_type THEN RAISE EXCEPTION 'Meeting type is not enabled by Admin configuration.'; END IF;

    v_min_notice := GREATEST(COALESCE((v_settings->>'minimumBookingNoticeMinutes')::integer,0),0);
    IF NEW.start_at < now()+make_interval(mins=>v_min_notice) THEN RAISE EXCEPTION 'Meeting does not satisfy the configured minimum booking notice.'; END IF;

    SELECT timezone,working_days,work_start,work_end,active,buffer_before_minutes,buffer_after_minutes
      INTO v_timezone,v_working_days,v_work_start,v_work_end,v_user_active,v_buffer_before,v_buffer_after
    FROM public.user_calendar_settings WHERE user_id=NEW.salesperson_id;

    IF FOUND THEN
      IF v_user_active IS NOT TRUE THEN RAISE EXCEPTION 'This salesperson is not accepting new meetings.'; END IF;
      v_local_start := NEW.start_at AT TIME ZONE v_timezone;
      v_local_end := NEW.end_at AT TIME ZONE v_timezone;
      v_local_dow := extract(dow FROM v_local_start)::integer;
      IF NOT (v_local_dow=ANY(v_working_days)) THEN RAISE EXCEPTION 'Meeting falls outside the salesperson working days.'; END IF;
      IF v_local_start::date<>v_local_end::date OR v_local_start::time<v_work_start OR v_local_end::time>v_work_end THEN
        RAISE EXCEPTION 'Meeting falls outside the salesperson working hours.';
      END IF;
    ELSE
      v_buffer_before := GREATEST(COALESCE((v_settings->>'bufferBeforeMinutes')::integer,0),0);
      v_buffer_after := GREATEST(COALESCE((v_settings->>'bufferAfterMinutes')::integer,0),0);
    END IF;

    v_buffer_before := GREATEST(COALESCE(v_buffer_before,0),0);
    v_buffer_after := GREATEST(COALESCE(v_buffer_after,0),0);
    IF EXISTS (
      SELECT 1 FROM public.sales_meetings m
      WHERE m.salesperson_id=NEW.salesperson_id AND m.id<>NEW.id AND m.status IN ('Scheduled','Rescheduled')
        AND m.start_at < NEW.end_at+make_interval(mins=>v_buffer_after)
        AND m.end_at > NEW.start_at-make_interval(mins=>v_buffer_before)
    ) THEN RAISE EXCEPTION 'This time conflicts with an existing meeting or configured meeting buffer.'; END IF;
  END IF;

  NEW.attendee_email := lower(trim(COALESCE(NEW.attendee_email,'')));
  NEW.title := trim(NEW.title);
  IF NEW.title='' THEN RAISE EXCEPTION 'Meeting title is required.'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Event-link persistence updates external metadata only. provider stays Manual because ProFox remains primary.
CREATE OR REPLACE FUNCTION public.service_upsert_google_event_link(
  p_meeting_id uuid,p_user_id uuid,p_calendar_id text,p_event_id text,p_conference_request_id text,
  p_meet_url text,p_etag text,p_conference_status text,p_operation text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF p_conference_status NOT IN ('none','pending','success','failed') THEN RAISE EXCEPTION 'Invalid conference state.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sales_meetings WHERE id=p_meeting_id AND salesperson_id=p_user_id) THEN
    RAISE EXCEPTION 'Meeting does not belong to this Google connection.';
  END IF;
  INSERT INTO public.google_calendar_event_links(meeting_id,user_id,calendar_id,external_event_id,conference_request_id,meet_url,etag,conference_status,last_operation,last_synced_at,updated_at)
  VALUES(p_meeting_id,p_user_id,COALESCE(NULLIF(p_calendar_id,''),'primary'),p_event_id,p_conference_request_id,COALESCE(p_meet_url,''),COALESCE(p_etag,''),p_conference_status,p_operation,now(),now())
  ON CONFLICT(meeting_id) DO UPDATE SET calendar_id=EXCLUDED.calendar_id,external_event_id=EXCLUDED.external_event_id,
    conference_request_id=EXCLUDED.conference_request_id,meet_url=EXCLUDED.meet_url,etag=EXCLUDED.etag,
    conference_status=EXCLUDED.conference_status,last_operation=EXCLUDED.last_operation,last_synced_at=now(),updated_at=now();

  UPDATE public.sales_meetings
  SET external_calendar_id=COALESCE(NULLIF(p_calendar_id,''),'primary'),external_event_id=p_event_id,
      meeting_url=CASE WHEN trim(COALESCE(p_meet_url,''))<>'' THEN p_meet_url ELSE meeting_url END,
      sync_status='Synced',sync_error=NULL,updated_at=now()
  WHERE id=p_meeting_id AND salesperson_id=p_user_id;

  UPDATE public.crm_opportunities o SET meeting_url=m.meeting_url,updated_at=now()
  FROM public.sales_meetings m
  WHERE m.id=p_meeting_id AND o.id=m.opportunity_id AND trim(COALESCE(m.meeting_url,''))<>'';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_sales_meeting_integrity() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_upsert_google_event_link(uuid,uuid,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_upsert_google_event_link(uuid,uuid,text,text,text,text,text,text,text) TO service_role;

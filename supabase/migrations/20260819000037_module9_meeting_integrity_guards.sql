-- Module 9 — Defense-in-depth guards for meeting ownership, availability, and CRM pointers.
-- External calendar/OAuth remains disabled in this core release.

CREATE OR REPLACE FUNCTION public.validate_user_calendar_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'Invalid IANA timezone: %', NEW.timezone;
  END IF;
  IF lower(trim(COALESCE(NEW.provider, 'Manual'))) <> 'manual' THEN
    RAISE EXCEPTION 'External calendar providers are not enabled yet.';
  END IF;
  IF NEW.connection_status <> 'Not Connected' THEN
    RAISE EXCEPTION 'Calendar connection state cannot be enabled before secure OAuth is deployed.';
  END IF;
  NEW.provider := 'Manual';
  NEW.connection_status := 'Not Connected';
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_user_calendar_settings ON public.user_calendar_settings;
CREATE TRIGGER trg_validate_user_calendar_settings
BEFORE INSERT OR UPDATE ON public.user_calendar_settings
FOR EACH ROW EXECUTE FUNCTION public.validate_user_calendar_settings();

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

  IF lower(trim(COALESCE(NEW.provider, 'Manual'))) <> 'manual' THEN
    RAISE EXCEPTION 'External calendar providers are not enabled yet. Use Manual.';
  END IF;
  NEW.provider := 'Manual';
  NEW.sync_status := 'Not Connected';
  NEW.sync_error := NULL;

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

DROP TRIGGER IF EXISTS trg_enforce_sales_meeting_integrity ON public.sales_meetings;
CREATE TRIGGER trg_enforce_sales_meeting_integrity
BEFORE INSERT OR UPDATE ON public.sales_meetings
FOR EACH ROW EXECUTE FUNCTION public.enforce_sales_meeting_integrity();

CREATE OR REPLACE FUNCTION public.sync_cancelled_sales_meeting_pointer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status='Cancelled' AND OLD.status IS DISTINCT FROM 'Cancelled' AND NEW.opportunity_id IS NOT NULL THEN
    UPDATE public.crm_opportunities SET meeting_at=NULL,meeting_url='',updated_at=now()
    WHERE id=NEW.opportunity_id AND meeting_at=OLD.start_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cancelled_sales_meeting_pointer ON public.sales_meetings;
CREATE TRIGGER trg_sync_cancelled_sales_meeting_pointer
AFTER UPDATE ON public.sales_meetings
FOR EACH ROW EXECUTE FUNCTION public.sync_cancelled_sales_meeting_pointer();

REVOKE ALL ON FUNCTION public.validate_user_calendar_settings() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enforce_sales_meeting_integrity() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_cancelled_sales_meeting_pointer() FROM PUBLIC,anon,authenticated;

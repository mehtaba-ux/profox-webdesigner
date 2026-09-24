-- Module 10B — Booking communication, meeting preparation links and secure self-service management.

ALTER TABLE public.public_booking_submissions
  ADD COLUMN IF NOT EXISTS management_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS management_token_expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days');

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_booking_management_token
  ON public.public_booking_submissions(management_token);

CREATE OR REPLACE FUNCTION public.build_public_booking_notification_payload(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_payload jsonb; v_base_url text;
BEGIN
  SELECT COALESCE(NULLIF(config_value->>'publicBaseUrl',''),'https://www.profoxwebdesigner.com')
  INTO v_base_url
  FROM public.system_configuration WHERE config_key='notification_settings';
  v_base_url := rtrim(COALESCE(v_base_url,'https://www.profoxwebdesigner.com'),'/');

  SELECT jsonb_build_object(
    'bookingId',b.id,
    'bookingReference',b.booking_reference,
    'contactName',b.contact_name,
    'email',b.email,
    'companyName',b.company_name,
    'serviceInterest',b.service_interest,
    'industry',b.industry,
    'country',b.country,
    'expertName',COALESCE(NULLIF(bp.display_name,''),up.full_name,'ProFox Specialist'),
    'sellerEmail',COALESCE(up.email,''),
    'sellerUserId',b.salesperson_id,
    'startAt',m.start_at,
    'endAt',m.end_at,
    'sellerTimezone',m.timezone,
    'visitorTimezone',b.visitor_timezone,
    'meetingType',m.meeting_type,
    'meetingUrl',m.meeting_url,
    'budgetRange',COALESCE(b.qualification_answers->>'budget_range',''),
    'timeline',COALESCE(b.qualification_answers->>'timeline',''),
    'decisionMaker',COALESCE(b.qualification_answers->>'decision_maker',''),
    'projectGoal',COALESCE(b.qualification_answers->>'project_goal',''),
    'manageUrl',v_base_url||'/manage-booking/'||b.management_token::text,
    'bookingPageUrl',v_base_url||'/book-a-meeting',
    'meetingPrepUrl',v_base_url||'/admin/meeting-prep/'||m.id::text
  )
  INTO v_payload
  FROM public.public_booking_submissions b
  JOIN public.sales_meetings m ON m.id=b.meeting_id
  JOIN public.user_profiles up ON up.id=b.salesperson_id
  LEFT JOIN public.public_booking_profiles bp ON bp.salesperson_id=b.salesperson_id
  WHERE b.id=p_submission_id;

  RETURN COALESCE(v_payload,'{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_public_booking_created_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_payload jsonb; v_seller_email text;
BEGIN
  v_payload := public.build_public_booking_notification_payload(NEW.id);
  v_seller_email := COALESCE(v_payload->>'sellerEmail','');

  PERFORM public.enqueue_notification(
    'booking-confirmation:'||NEW.id::text,
    'booking_confirmation',
    NEW.email,
    NULL,
    v_payload,
    now()
  );

  PERFORM public.enqueue_notification(
    'seller-new-booking:'||NEW.id::text,
    'seller_new_booking',
    v_seller_email,
    NEW.salesperson_id,
    v_payload,
    now()
  );

  PERFORM public.enqueue_in_app_notification(
    NEW.salesperson_id,
    'New Booking',
    'New meeting booked — '||NEW.company_name,
    NEW.contact_name||' booked a meeting for '||COALESCE(NULLIF(NEW.service_interest,''),'a ProFox consultation')||'.',
    '/admin/meeting-prep/'||NEW.meeting_id::text,
    'inapp-new-booking:'||NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_public_booking_created_notifications ON public.public_booking_submissions;
CREATE TRIGGER trg_queue_public_booking_created_notifications
AFTER INSERT ON public.public_booking_submissions
FOR EACH ROW EXECUTE FUNCTION public.queue_public_booking_created_notifications();

CREATE OR REPLACE FUNCTION public.claim_public_booking_management_token(
  p_request_key uuid,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_row public.public_booking_submissions%ROWTYPE;
BEGIN
  IF p_request_key IS NULL OR trim(COALESCE(p_email,''))='' THEN RAISE EXCEPTION 'Booking request and email are required.'; END IF;
  SELECT * INTO v_row
  FROM public.public_booking_submissions
  WHERE request_key=p_request_key AND lower(email)=lower(trim(p_email));
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking access could not be verified.'; END IF;
  RETURN jsonb_build_object(
    'token',v_row.management_token,
    'expiresAt',v_row.management_token_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_booking_management(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_result jsonb;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'Booking access token is required.'; END IF;
  SELECT jsonb_build_object(
    'bookingReference',b.booking_reference,
    'status',b.status,
    'contactName',b.contact_name,
    'email',b.email,
    'companyName',b.company_name,
    'serviceInterest',b.service_interest,
    'visitorTimezone',b.visitor_timezone,
    'startAt',m.start_at,
    'endAt',m.end_at,
    'sellerTimezone',m.timezone,
    'meetingStatus',m.status,
    'meetingType',m.meeting_type,
    'meetingUrl',m.meeting_url,
    'salespersonId',b.salesperson_id,
    'expertName',COALESCE(NULLIF(bp.display_name,''),up.full_name,'ProFox Specialist'),
    'expertHeadline',COALESCE(bp.headline,''),
    'expertCountry',COALESCE(NULLIF(bp.country,''),up.country,''),
    'expertAvatarUrl',COALESCE(NULLIF(bp.avatar_url,''),up.avatar_url,''),
    'canReschedule',(b.status='Confirmed' AND m.status IN ('Scheduled','Rescheduled') AND b.management_token_expires_at>now()),
    'canCancel',(b.status='Confirmed' AND m.status IN ('Scheduled','Rescheduled') AND b.management_token_expires_at>now()),
    'tokenExpiresAt',b.management_token_expires_at
  ) INTO v_result
  FROM public.public_booking_submissions b
  JOIN public.sales_meetings m ON m.id=b.meeting_id
  JOIN public.user_profiles up ON up.id=b.salesperson_id
  LEFT JOIN public.public_booking_profiles bp ON bp.salesperson_id=b.salesperson_id
  WHERE b.management_token=p_token;

  IF v_result IS NULL THEN RAISE EXCEPTION 'Booking not found.'; END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_public_reschedule_slot_available(
  p_salesperson_id uuid,
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_ignore_meeting_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_timezone text;
  v_working_days integer[];
  v_work_start time;
  v_work_end time;
  v_calendar_active boolean;
  v_buffer_before integer;
  v_buffer_after integer;
  v_slot_interval integer;
  v_min_notice integer;
  v_local_start timestamp;
  v_local_end timestamp;
  v_day integer;
  v_minutes_from_start integer;
  v_end_at timestamptz;
BEGIN
  SELECT
    COALESCE(NULLIF(c.timezone,''),NULLIF(up.timezone,''),NULLIF(ms.config_value->>'defaultTimezone',''),'UTC'),
    COALESCE(c.working_days,ARRAY[1,2,3,4,5]::integer[]),
    COALESCE(c.work_start,'09:00'::time),
    COALESCE(c.work_end,'17:00'::time),
    COALESCE(c.active,false),
    COALESCE(c.buffer_before_minutes,GREATEST(COALESCE((ms.config_value->>'bufferBeforeMinutes')::integer,0),0)),
    COALESCE(c.buffer_after_minutes,GREATEST(COALESCE((ms.config_value->>'bufferAfterMinutes')::integer,0),0)),
    LEAST(GREATEST(COALESCE((pbs.config_value->>'slotIntervalMinutes')::integer,15),5),120),
    GREATEST(COALESCE((ms.config_value->>'minimumBookingNoticeMinutes')::integer,0),0)
  INTO v_timezone,v_working_days,v_work_start,v_work_end,v_calendar_active,v_buffer_before,v_buffer_after,v_slot_interval,v_min_notice
  FROM public.user_profiles up
  LEFT JOIN public.user_calendar_settings c ON c.user_id=up.id
  LEFT JOIN public.system_configuration ms ON ms.config_key='meeting_settings'
  LEFT JOIN public.system_configuration pbs ON pbs.config_key='public_booking_settings'
  WHERE up.id=p_salesperson_id AND up.status='active' AND up.role IN ('sales','admin');

  IF NOT FOUND OR v_calendar_active IS NOT TRUE OR p_duration_minutes IS NULL OR p_duration_minutes<=0 THEN RETURN false; END IF;
  IF p_start_at < now()+make_interval(mins=>v_min_notice) THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN RETURN false; END IF;

  v_end_at := p_start_at+make_interval(mins=>p_duration_minutes);
  v_local_start := p_start_at AT TIME ZONE v_timezone;
  v_local_end := v_end_at AT TIME ZONE v_timezone;
  v_day := extract(dow FROM v_local_start)::integer;
  IF NOT (v_day=ANY(v_working_days)) THEN RETURN false; END IF;
  IF v_local_start::date<>v_local_end::date OR v_local_start::time<v_work_start OR v_local_end::time>v_work_end THEN RETURN false; END IF;

  v_minutes_from_start := floor(extract(epoch FROM (v_local_start::time-v_work_start))/60)::integer;
  IF v_minutes_from_start<0 OR mod(v_minutes_from_start,v_slot_interval)<>0 THEN RETURN false; END IF;

  IF EXISTS(
    SELECT 1 FROM public.booking_availability_blocks b
    WHERE b.user_id=p_salesperson_id AND b.start_at<v_end_at AND b.end_at>p_start_at
  ) THEN RETURN false; END IF;

  IF EXISTS(
    SELECT 1 FROM public.sales_meetings m
    WHERE m.salesperson_id=p_salesperson_id
      AND m.id IS DISTINCT FROM p_ignore_meeting_id
      AND m.status IN ('Scheduled','Rescheduled')
      AND m.start_at < v_end_at+make_interval(mins=>GREATEST(COALESCE(v_buffer_after,0),0))
      AND m.end_at > p_start_at-make_interval(mins=>GREATEST(COALESCE(v_buffer_before,0),0))
  ) THEN RETURN false; END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_public_booking(
  p_token uuid,
  p_start_at timestamptz,
  p_visitor_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.public_booking_submissions%ROWTYPE;
  v_meeting public.sales_meetings%ROWTYPE;
  v_duration integer;
  v_end_at timestamptz;
  v_visitor_timezone text;
  v_payload jsonb;
BEGIN
  IF p_token IS NULL OR p_start_at IS NULL THEN RAISE EXCEPTION 'Booking token and new meeting time are required.'; END IF;
  SELECT * INTO v_booking FROM public.public_booking_submissions WHERE management_token=p_token FOR UPDATE;
  IF NOT FOUND OR v_booking.management_token_expires_at<=now() THEN RAISE EXCEPTION 'Booking management link is invalid or expired.'; END IF;
  IF v_booking.status<>'Confirmed' THEN RAISE EXCEPTION 'This booking can no longer be rescheduled.'; END IF;

  SELECT * INTO v_meeting FROM public.sales_meetings WHERE id=v_booking.meeting_id FOR UPDATE;
  IF NOT FOUND OR v_meeting.status NOT IN ('Scheduled','Rescheduled') THEN RAISE EXCEPTION 'This meeting can no longer be rescheduled.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('public-booking:'||v_booking.salesperson_id::text,0));
  v_duration := round(extract(epoch FROM (v_meeting.end_at-v_meeting.start_at))/60.0)::integer;
  IF NOT public.is_public_reschedule_slot_available(v_booking.salesperson_id,p_start_at,v_duration,v_meeting.id) THEN
    RAISE EXCEPTION 'That time is no longer available. Please choose another slot.';
  END IF;

  v_end_at := p_start_at+make_interval(mins=>v_duration);
  v_visitor_timezone := COALESCE(NULLIF(trim(p_visitor_timezone),''),v_booking.visitor_timezone,'UTC');
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_visitor_timezone) THEN v_visitor_timezone:='UTC'; END IF;

  UPDATE public.sales_meetings
  SET start_at=p_start_at,end_at=v_end_at,status='Rescheduled',rescheduled_at=now(),updated_at=now()
  WHERE id=v_meeting.id;
  IF v_meeting.activity_id IS NOT NULL THEN
    UPDATE public.crm_activities SET due_at=p_start_at,status='Scheduled',updated_at=now() WHERE id=v_meeting.activity_id;
  END IF;
  IF v_meeting.opportunity_id IS NOT NULL THEN
    UPDATE public.crm_opportunities SET meeting_at=p_start_at,updated_at=now() WHERE id=v_meeting.opportunity_id;
  END IF;
  UPDATE public.public_booking_submissions
  SET visitor_timezone=v_visitor_timezone,status='Confirmed',updated_at=now()
  WHERE id=v_booking.id;

  v_payload := public.build_public_booking_notification_payload(v_booking.id);
  PERFORM public.enqueue_notification(
    'booking-rescheduled:'||v_booking.id::text||':'||extract(epoch FROM p_start_at)::bigint::text,
    'booking_rescheduled',v_booking.email,NULL,v_payload,now()
  );
  PERFORM public.enqueue_notification(
    'seller-booking-rescheduled:'||v_booking.id::text||':'||extract(epoch FROM p_start_at)::bigint::text,
    'seller_meeting_reminder',COALESCE(v_payload->>'sellerEmail',''),v_booking.salesperson_id,
    v_payload||jsonb_build_object('reminderLabel','was rescheduled'),now()
  );
  PERFORM public.enqueue_in_app_notification(
    v_booking.salesperson_id,'Rescheduled','Meeting rescheduled — '||v_booking.company_name,
    v_booking.contact_name||' moved the meeting to a new time.','/admin/meeting-prep/'||v_booking.meeting_id::text,
    'inapp-reschedule:'||v_booking.id::text||':'||extract(epoch FROM p_start_at)::bigint::text
  );

  RETURN public.get_public_booking_management(p_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_public_booking(
  p_token uuid,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_booking public.public_booking_submissions%ROWTYPE; v_meeting public.sales_meetings%ROWTYPE; v_payload jsonb;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'Booking token is required.'; END IF;
  SELECT * INTO v_booking FROM public.public_booking_submissions WHERE management_token=p_token FOR UPDATE;
  IF NOT FOUND OR v_booking.management_token_expires_at<=now() THEN RAISE EXCEPTION 'Booking management link is invalid or expired.'; END IF;
  IF v_booking.status='Cancelled' THEN RETURN public.get_public_booking_management(p_token); END IF;

  SELECT * INTO v_meeting FROM public.sales_meetings WHERE id=v_booking.meeting_id FOR UPDATE;
  IF NOT FOUND OR v_meeting.status NOT IN ('Scheduled','Rescheduled') THEN RAISE EXCEPTION 'This meeting can no longer be cancelled.'; END IF;

  UPDATE public.sales_meetings
  SET status='Cancelled',cancelled_at=now(),outcome=CASE WHEN trim(COALESCE(p_reason,''))<>'' THEN left(trim(p_reason),2000) ELSE outcome END,updated_at=now()
  WHERE id=v_meeting.id;
  IF v_meeting.activity_id IS NOT NULL THEN
    UPDATE public.crm_activities
    SET status='Cancelled',notes=trim(concat_ws(E'\n',NULLIF(notes,''),NULLIF(left(trim(COALESCE(p_reason,'')),1000),''))),updated_at=now()
    WHERE id=v_meeting.activity_id;
  END IF;
  UPDATE public.public_booking_submissions SET status='Cancelled',updated_at=now() WHERE id=v_booking.id;

  v_payload := public.build_public_booking_notification_payload(v_booking.id);
  PERFORM public.enqueue_notification('booking-cancelled:'||v_booking.id::text,'booking_cancelled',v_booking.email,NULL,v_payload,now());
  PERFORM public.enqueue_in_app_notification(
    v_booking.salesperson_id,'Cancelled','Meeting cancelled — '||v_booking.company_name,
    v_booking.contact_name||' cancelled the scheduled meeting.','/admin/meetings',
    'inapp-cancelled:'||v_booking.id::text
  );
  RETURN public.get_public_booking_management(p_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_meeting_status_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.public_booking_submissions%ROWTYPE;
  v_settings jsonb;
  v_hours integer;
  v_payload jsonb;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT * INTO v_booking FROM public.public_booking_submissions WHERE meeting_id=NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_settings FROM public.system_configuration WHERE config_key='notification_settings';
  v_settings := COALESCE(v_settings,'{}'::jsonb);

  IF NEW.status='No Show' THEN
    v_hours := LEAST(GREATEST(COALESCE((v_settings->>'noShowFollowUpHours')::integer,2),0),168);
    IF NOT EXISTS(
      SELECT 1 FROM public.crm_activities a
      WHERE a.assigned_to=NEW.salesperson_id AND a.activity_type='No Show Follow-Up'
        AND a.notes LIKE '%Automation key: no-show:'||NEW.id::text||'%'
    ) THEN
      INSERT INTO public.crm_activities(lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by)
      VALUES(NEW.lead_id,NEW.opportunity_id,NEW.salesperson_id,'No Show Follow-Up','Follow up after missed meeting — '||v_booking.company_name,
        now()+make_interval(hours=>v_hours),'Scheduled','Follow-Up','Automation key: no-show:'||NEW.id::text,NEW.salesperson_id);
    END IF;
    v_payload := public.build_public_booking_notification_payload(v_booking.id);
    PERFORM public.enqueue_notification('no-show-rebook:'||v_booking.id::text,'no_show_rebook',v_booking.email,NULL,
      v_payload||jsonb_build_object('manageUrl',COALESCE(v_payload->>'bookingPageUrl','')),now());
    PERFORM public.enqueue_in_app_notification(
      NEW.salesperson_id,'Follow-Up','No-show follow-up due — '||v_booking.company_name,
      'A follow-up task was created automatically.','/admin/app/crm?tab=activities','inapp-no-show:'||NEW.id::text
    );
  ELSIF NEW.status='Completed' AND NEW.follow_up_at IS NULL AND trim(COALESCE(NEW.next_step,''))='' THEN
    v_hours := LEAST(GREATEST(COALESCE((v_settings->>'completedReviewHours')::integer,2),0),72);
    IF NOT EXISTS(
      SELECT 1 FROM public.crm_activities a
      WHERE a.assigned_to=NEW.salesperson_id AND a.activity_type='Meeting Review'
        AND a.notes LIKE '%Automation key: meeting-review:'||NEW.id::text||'%'
    ) THEN
      INSERT INTO public.crm_activities(lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by)
      VALUES(NEW.lead_id,NEW.opportunity_id,NEW.salesperson_id,'Meeting Review','Set the next sales action — '||v_booking.company_name,
        now()+make_interval(hours=>v_hours),'Scheduled','Follow-Up','Automation key: meeting-review:'||NEW.id::text,NEW.salesperson_id);
    END IF;
    PERFORM public.enqueue_in_app_notification(
      NEW.salesperson_id,'Next Action','Set the next step — '||v_booking.company_name,
      'The meeting is complete but no next action has been scheduled.','/admin/meeting-prep/'||NEW.id::text,
      'inapp-meeting-review:'||NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_meeting_status_automation ON public.sales_meetings;
CREATE TRIGGER trg_queue_meeting_status_automation
AFTER UPDATE OF status ON public.sales_meetings
FOR EACH ROW EXECUTE FUNCTION public.queue_meeting_status_automation();

REVOKE ALL ON FUNCTION public.build_public_booking_notification_payload(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.queue_public_booking_created_notifications() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.is_public_reschedule_slot_available(uuid,timestamptz,integer,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.queue_meeting_status_automation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_public_booking_management_token(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_booking_management(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_public_booking(uuid,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_public_booking(uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_public_booking_management_token(uuid,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_booking_management(uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_public_booking(uuid,timestamptz,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_public_booking(uuid,text) TO anon,authenticated;
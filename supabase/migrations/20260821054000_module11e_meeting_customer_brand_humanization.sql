-- Module 11E - Brand-aligned human customer meeting communication.
-- ProFox native booking remains authoritative. Only visitor email payload/copy is humanized here.

UPDATE public.notification_templates SET
  subject_template='Your ProFox meeting is confirmed: {{bookingReference}}',
  body_template=E'Hi {{contactFirstName}},\n\nYour meeting with {{expertName}} is confirmed for {{meetingTimeVisitor}}.\n\nFocus: {{serviceInterest}}\nBooking reference: {{bookingReference}}\n\nManage your booking: {{manageUrl}}\n\nIf there is anything specific you want us to understand before the meeting, reply to this email. It helps us make the conversation more useful from the start.\n\n{{expertName}}\nProFox\n{{brandLine}}',
  description='Customer meeting confirmation with human specialist context and a clear booking-management action.',
  updated_at=now()
WHERE template_key='booking_confirmation';

UPDATE public.notification_templates SET
  subject_template='Your ProFox meeting has been rescheduled',
  body_template=E'Hi {{contactFirstName}},\n\nYour meeting with {{expertName}} is now scheduled for {{meetingTimeVisitor}}.\n\nManage your booking: {{manageUrl}}\n\nIf the new time changes anything we should know before the conversation, reply to this email.\n\n{{expertName}}\nProFox\n{{brandLine}}',
  description='Customer confirmation after a native ProFox meeting is rescheduled.',
  updated_at=now()
WHERE template_key='booking_rescheduled';

UPDATE public.notification_templates SET
  subject_template='Your ProFox meeting has been cancelled',
  body_template=E'Hi {{contactFirstName}},\n\nYour meeting with {{expertName}} has been cancelled.\n\nIf you would still like to talk through the project, choose another time here: {{bookingPageUrl}}\n\nIf your plans have changed, no action is needed.\n\n{{expertName}}\nProFox\n{{brandLine}}',
  description='Customer cancellation confirmation with a low-pressure rebooking path.',
  updated_at=now()
WHERE template_key='booking_cancelled';

UPDATE public.notification_templates SET
  subject_template='Reminder: your ProFox meeting is {{reminderLabel}}',
  body_template=E'Hi {{contactFirstName}},\n\nA quick reminder that your meeting with {{expertName}} is {{reminderLabel}} at {{meetingTimeVisitor}}.\n\nManage your booking: {{manageUrl}}\n\nIf there is something you want us to review before the meeting, reply to this email.\n\n{{expertName}}\nProFox\n{{brandLine}}',
  description='Customer meeting reminder with the same human specialist and booking context.',
  updated_at=now()
WHERE template_key='meeting_reminder';

UPDATE public.notification_templates SET
  subject_template='Would you like to choose another meeting time?',
  body_template=E'Hi {{contactFirstName}},\n\nWe missed you at the scheduled meeting with {{expertName}}.\n\nIf the project is still relevant, you can choose another time here: {{manageUrl}}\n\nIf now is not the right time, that is fine. You can come back when the timing makes sense.\n\n{{expertName}}\nProFox\n{{brandLine}}',
  description='Low-pressure customer rebooking message after a missed meeting.',
  updated_at=now()
WHERE template_key='no_show_rebook';

CREATE OR REPLACE FUNCTION public.build_public_booking_customer_payload(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_base jsonb;
  v_owner uuid;
BEGIN
  v_base:=public.build_public_booking_notification_payload(p_submission_id);
  IF v_base='{}'::jsonb THEN RETURN v_base; END IF;
  v_owner:=NULLIF(v_base->>'sellerUserId','')::uuid;
  RETURN public.service_build_customer_communication_payload(
    v_owner,
    v_base->>'contactName',
    v_base->>'companyName',
    v_base
  );
END;
$$;
REVOKE ALL ON FUNCTION public.build_public_booking_customer_payload(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.build_public_booking_customer_payload(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.queue_public_booking_created_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_payload jsonb; v_customer_payload jsonb; v_seller_email text;
BEGIN
  v_payload:=public.build_public_booking_notification_payload(NEW.id);
  v_customer_payload:=public.build_public_booking_customer_payload(NEW.id);
  v_seller_email:=COALESCE(v_payload->>'sellerEmail','');
  PERFORM public.enqueue_notification('booking-confirmation:'||NEW.id::text,'booking_confirmation',NEW.email,NULL,v_customer_payload,now());
  PERFORM public.enqueue_notification('seller-new-booking:'||NEW.id::text,'seller_new_booking',v_seller_email,NEW.salesperson_id,v_payload,now());
  PERFORM public.enqueue_in_app_notification(NEW.salesperson_id,'New Booking','New meeting booked - '||NEW.company_name,NEW.contact_name||' booked a meeting for '||COALESCE(NULLIF(NEW.service_interest,''),'a ProFox consultation')||'.','/admin/meeting-prep/'||NEW.meeting_id::text,'inapp-new-booking:'||NEW.id::text);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_public_booking_reminders(p_meeting_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_booking public.public_booking_submissions%ROWTYPE; v_meeting public.sales_meetings%ROWTYPE; v_settings jsonb; v_payload jsonb; v_customer_payload jsonb; v_minutes integer; v_when timestamptz; v_label text; v_schedule_key text;
BEGIN
  SELECT * INTO v_booking FROM public.public_booking_submissions WHERE meeting_id=p_meeting_id; IF NOT FOUND OR v_booking.status<>'Confirmed' THEN RETURN; END IF;
  SELECT * INTO v_meeting FROM public.sales_meetings WHERE id=p_meeting_id; IF NOT FOUND OR v_meeting.status NOT IN ('Scheduled','Rescheduled') THEN RETURN; END IF;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_settings FROM public.system_configuration WHERE config_key='notification_settings';
  v_settings:=COALESCE(v_settings,'{}'::jsonb);
  v_payload:=public.build_public_booking_notification_payload(v_booking.id);
  v_customer_payload:=public.build_public_booking_customer_payload(v_booking.id);
  v_schedule_key:=extract(epoch FROM v_meeting.start_at)::bigint::text;
  FOR v_minutes IN SELECT value::integer FROM jsonb_array_elements_text(COALESCE(v_settings->'reminderMinutes','[1440,60]'::jsonb)) LOOP
    v_minutes:=LEAST(GREATEST(v_minutes,5),10080);
    v_when:=v_meeting.start_at-make_interval(mins=>v_minutes);
    IF v_when<=now() THEN CONTINUE; END IF;
    v_label:=CASE WHEN v_minutes=1440 THEN 'tomorrow' WHEN v_minutes=60 THEN 'in 1 hour' WHEN v_minutes%1440=0 THEN 'in '||(v_minutes/1440)::text||' days' WHEN v_minutes%60=0 THEN 'in '||(v_minutes/60)::text||' hours' ELSE 'in '||v_minutes::text||' minutes' END;
    PERFORM public.enqueue_notification('meeting-reminder:'||p_meeting_id::text||':'||v_schedule_key||':'||v_minutes::text||':visitor','meeting_reminder',v_booking.email,NULL,v_customer_payload||jsonb_build_object('reminderLabel',v_label),v_when);
    PERFORM public.enqueue_notification('meeting-reminder:'||p_meeting_id::text||':'||v_schedule_key||':'||v_minutes::text||':seller','seller_meeting_reminder',COALESCE(v_payload->>'sellerEmail',''),v_booking.salesperson_id,v_payload||jsonb_build_object('reminderLabel',v_label),v_when);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_meeting_status_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_booking public.public_booking_submissions%ROWTYPE; v_settings jsonb; v_hours integer; v_payload jsonb; v_note text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT * INTO v_booking FROM public.public_booking_submissions WHERE meeting_id=NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_settings FROM public.system_configuration WHERE config_key='notification_settings'; v_settings:=COALESCE(v_settings,'{}'::jsonb);
  IF NEW.status='No Show' THEN
    v_hours:=LEAST(GREATEST(COALESCE((v_settings->>'noShowFollowUpHours')::integer,2),0),168);
    IF NOT EXISTS(SELECT 1 FROM public.crm_activities a WHERE a.assigned_to=NEW.salesperson_id AND a.activity_type='No Show Follow-Up' AND a.notes LIKE '%Automation key: no-show:'||NEW.id::text||'%') THEN
      INSERT INTO public.crm_activities(lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by)
      VALUES(NEW.lead_id,NEW.opportunity_id,NEW.salesperson_id,'No Show Follow-Up','Follow up after missed meeting - '||v_booking.company_name,now()+make_interval(hours=>v_hours),'Scheduled','Follow-Up','Automation key: no-show:'||NEW.id::text,NEW.salesperson_id);
    END IF;
    v_payload:=public.build_public_booking_customer_payload(v_booking.id);
    PERFORM public.enqueue_notification('no-show-rebook:'||v_booking.id::text,'no_show_rebook',v_booking.email,NULL,v_payload||jsonb_build_object('manageUrl',COALESCE(v_payload->>'bookingPageUrl','')),now());
    PERFORM public.enqueue_in_app_notification(NEW.salesperson_id,'Follow-Up','No-show follow-up due - '||v_booking.company_name,'A follow-up task was created automatically.','/admin/app/crm?tab=activities','inapp-no-show:'||NEW.id::text);
  ELSIF NEW.status='Completed' AND NEW.follow_up_at IS NULL AND trim(COALESCE(NEW.next_step,''))='' THEN
    v_hours:=LEAST(GREATEST(COALESCE((v_settings->>'completedReviewHours')::integer,2),0),72);
    IF NOT EXISTS(SELECT 1 FROM public.crm_activities a WHERE a.assigned_to=NEW.salesperson_id AND a.activity_type='Meeting Review' AND a.notes LIKE '%Automation key: meeting-review:'||NEW.id::text||'%') THEN
      INSERT INTO public.crm_activities(lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by)
      VALUES(NEW.lead_id,NEW.opportunity_id,NEW.salesperson_id,'Meeting Review','Set the next sales action - '||v_booking.company_name,now()+make_interval(hours=>v_hours),'Scheduled','Follow-Up','Automation key: meeting-review:'||NEW.id::text,NEW.salesperson_id);
    END IF;
    PERFORM public.enqueue_in_app_notification(NEW.salesperson_id,'Next Action','Set the next step - '||v_booking.company_name,'The meeting is complete but no next action has been scheduled.','/admin/meeting-prep/'||NEW.id::text,'inapp-meeting-review:'||NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_public_booking(p_token uuid,p_start_at timestamptz,p_visitor_timezone text DEFAULT 'UTC')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_booking public.public_booking_submissions%ROWTYPE; v_meeting public.sales_meetings%ROWTYPE; v_duration integer; v_end_at timestamptz; v_visitor_timezone text; v_payload jsonb; v_customer_payload jsonb;
BEGIN
  IF p_token IS NULL OR p_start_at IS NULL THEN RAISE EXCEPTION 'Booking token and new meeting time are required.'; END IF;
  SELECT * INTO v_booking FROM public.public_booking_submissions WHERE management_token=p_token FOR UPDATE;
  IF NOT FOUND OR v_booking.management_token_expires_at<=now() THEN RAISE EXCEPTION 'Booking management link is invalid or expired.'; END IF;
  IF v_booking.status<>'Confirmed' THEN RAISE EXCEPTION 'This booking can no longer be rescheduled.'; END IF;
  SELECT * INTO v_meeting FROM public.sales_meetings WHERE id=v_booking.meeting_id FOR UPDATE;
  IF NOT FOUND OR v_meeting.status NOT IN ('Scheduled','Rescheduled') THEN RAISE EXCEPTION 'This meeting can no longer be rescheduled.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('public-booking:'||v_booking.salesperson_id::text,0));
  v_duration:=round(extract(epoch FROM (v_meeting.end_at-v_meeting.start_at))/60.0)::integer;
  IF NOT public.is_public_reschedule_slot_available(v_booking.salesperson_id,p_start_at,v_duration,v_meeting.id) THEN RAISE EXCEPTION 'That time is no longer available. Please choose another slot.'; END IF;
  v_end_at:=p_start_at+make_interval(mins=>v_duration); v_visitor_timezone:=COALESCE(NULLIF(trim(p_visitor_timezone),''),v_booking.visitor_timezone,'UTC');
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_visitor_timezone) THEN v_visitor_timezone:='UTC'; END IF;
  UPDATE public.sales_meetings SET start_at=p_start_at,end_at=v_end_at,status='Rescheduled',rescheduled_at=now(),updated_at=now() WHERE id=v_meeting.id;
  IF v_meeting.activity_id IS NOT NULL THEN UPDATE public.crm_activities SET due_at=p_start_at,status='Scheduled',updated_at=now() WHERE id=v_meeting.activity_id; END IF;
  IF v_meeting.opportunity_id IS NOT NULL THEN UPDATE public.crm_opportunities SET meeting_at=p_start_at,updated_at=now() WHERE id=v_meeting.opportunity_id; END IF;
  UPDATE public.public_booking_submissions SET visitor_timezone=v_visitor_timezone,status='Confirmed',updated_at=now() WHERE id=v_booking.id;
  v_payload:=public.build_public_booking_notification_payload(v_booking.id);
  v_customer_payload:=public.build_public_booking_customer_payload(v_booking.id);
  PERFORM public.enqueue_notification('booking-rescheduled:'||v_booking.id::text||':'||extract(epoch FROM p_start_at)::bigint::text,'booking_rescheduled',v_booking.email,NULL,v_customer_payload,now());
  PERFORM public.enqueue_notification('seller-booking-rescheduled:'||v_booking.id::text||':'||extract(epoch FROM p_start_at)::bigint::text,'seller_meeting_reminder',COALESCE(v_payload->>'sellerEmail',''),v_booking.salesperson_id,v_payload||jsonb_build_object('reminderLabel','was rescheduled'),now());
  PERFORM public.enqueue_in_app_notification(v_booking.salesperson_id,'Rescheduled','Meeting rescheduled - '||v_booking.company_name,v_booking.contact_name||' moved the meeting to a new time.','/admin/meeting-prep/'||v_booking.meeting_id::text,'inapp-reschedule:'||v_booking.id::text||':'||extract(epoch FROM p_start_at)::bigint::text);
  RETURN public.get_public_booking_management(p_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_public_booking(p_token uuid,p_reason text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_booking public.public_booking_submissions%ROWTYPE; v_meeting public.sales_meetings%ROWTYPE; v_payload jsonb;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'Booking token is required.'; END IF;
  SELECT * INTO v_booking FROM public.public_booking_submissions WHERE management_token=p_token FOR UPDATE;
  IF NOT FOUND OR v_booking.management_token_expires_at<=now() THEN RAISE EXCEPTION 'Booking management link is invalid or expired.'; END IF;
  IF v_booking.status='Cancelled' THEN RETURN public.get_public_booking_management(p_token); END IF;
  SELECT * INTO v_meeting FROM public.sales_meetings WHERE id=v_booking.meeting_id FOR UPDATE;
  IF NOT FOUND OR v_meeting.status NOT IN ('Scheduled','Rescheduled') THEN RAISE EXCEPTION 'This meeting can no longer be cancelled.'; END IF;
  UPDATE public.sales_meetings SET status='Cancelled',cancelled_at=now(),outcome=CASE WHEN trim(COALESCE(p_reason,''))<>'' THEN left(trim(p_reason),2000) ELSE outcome END,updated_at=now() WHERE id=v_meeting.id;
  IF v_meeting.activity_id IS NOT NULL THEN UPDATE public.crm_activities SET status='Cancelled',notes=trim(concat_ws(E'\n',NULLIF(notes,''),NULLIF(left(trim(COALESCE(p_reason,'')),1000),''))),updated_at=now() WHERE id=v_meeting.activity_id; END IF;
  UPDATE public.public_booking_submissions SET status='Cancelled',updated_at=now() WHERE id=v_booking.id;
  v_payload:=public.build_public_booking_customer_payload(v_booking.id);
  PERFORM public.enqueue_notification('booking-cancelled:'||v_booking.id::text,'booking_cancelled',v_booking.email,NULL,v_payload,now());
  PERFORM public.enqueue_in_app_notification(v_booking.salesperson_id,'Cancelled','Meeting cancelled - '||v_booking.company_name,v_booking.contact_name||' cancelled the scheduled meeting.','/admin/meetings','inapp-cancelled:'||v_booking.id::text);
  RETURN public.get_public_booking_management(p_token);
END;
$$;

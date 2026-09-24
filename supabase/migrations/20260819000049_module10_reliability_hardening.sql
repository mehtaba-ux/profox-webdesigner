-- Module 10 reliability hardening.
-- 1) Provider switches require a fresh credential.
-- 2) A rescheduled meeting gets a fresh reminder cycle even if an old reminder was already sent.
-- 3) Admin test email fails clearly while delivery is disabled.

CREATE OR REPLACE FUNCTION public.admin_set_notification_provider(
  p_provider text,
  p_api_key text DEFAULT '',
  p_from_email text DEFAULT '',
  p_from_name text DEFAULT 'ProFox',
  p_reply_to text DEFAULT '',
  p_email_enabled boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_provider text := lower(trim(COALESCE(p_provider,'disabled')));
  v_secret_id uuid;
  v_has_key boolean;
  v_config jsonb;
  v_previous_provider text;
  v_provider_changed boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  IF v_provider NOT IN ('disabled','resend','brevo') THEN RAISE EXCEPTION 'Unsupported notification provider.'; END IF;
  IF p_email_enabled AND v_provider='disabled' THEN RAISE EXCEPTION 'Choose an email provider before enabling email delivery.'; END IF;
  IF trim(COALESCE(p_from_email,''))<>'' AND lower(trim(p_from_email)) !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Enter a valid sender email address.';
  END IF;
  IF trim(COALESCE(p_reply_to,''))<>'' AND lower(trim(p_reply_to)) !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Enter a valid reply-to email address.';
  END IF;

  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_config
  FROM public.system_configuration WHERE config_key='notification_settings';
  v_config := COALESCE(v_config,'{}'::jsonb);
  v_previous_provider := lower(COALESCE(v_config->>'emailProvider','disabled'));
  v_provider_changed := v_provider<>v_previous_provider AND v_provider<>'disabled';

  SELECT id INTO v_secret_id FROM vault.secrets WHERE name='profox_notification_provider_api_key' LIMIT 1;
  IF trim(COALESCE(p_api_key,''))<>'' THEN
    IF v_secret_id IS NULL THEN
      PERFORM vault.create_secret(trim(p_api_key),'profox_notification_provider_api_key','ProFox notification provider API key',NULL);
    ELSE
      PERFORM vault.update_secret(v_secret_id,trim(p_api_key),'profox_notification_provider_api_key','ProFox notification provider API key',NULL);
    END IF;
    v_has_key := true;
  ELSE
    v_has_key := v_secret_id IS NOT NULL AND NOT v_provider_changed;
  END IF;

  IF p_email_enabled AND NOT v_has_key THEN
    IF v_provider_changed THEN
      RAISE EXCEPTION 'Enter the API key for the newly selected provider before enabling email delivery.';
    END IF;
    RAISE EXCEPTION 'Provider API key is required before enabling email delivery.';
  END IF;
  IF p_email_enabled AND trim(COALESCE(p_from_email,''))='' THEN RAISE EXCEPTION 'Sender email is required before enabling email delivery.'; END IF;

  v_config := v_config || jsonb_build_object(
    'emailProvider',v_provider,
    'emailEnabled',COALESCE(p_email_enabled,false),
    'fromEmail',lower(trim(COALESCE(p_from_email,''))),
    'fromName',left(trim(COALESCE(NULLIF(p_from_name,''),'ProFox')),160),
    'replyTo',lower(trim(COALESCE(p_reply_to,''))),
    'providerConfigured',v_has_key
  );

  INSERT INTO public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  VALUES('notification_settings',v_config,'ProFox server-side notification delivery, reminders and sales automation settings.',auth.uid(),now())
  ON CONFLICT (config_key) DO UPDATE
    SET config_value=EXCLUDED.config_value,description=EXCLUDED.description,updated_by=auth.uid(),updated_at=now();

  RETURN v_config - 'apiKey';
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_public_booking_reminders(p_meeting_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.public_booking_submissions%ROWTYPE;
  v_meeting public.sales_meetings%ROWTYPE;
  v_settings jsonb;
  v_payload jsonb;
  v_minutes integer;
  v_when timestamptz;
  v_label text;
  v_schedule_key text;
BEGIN
  SELECT * INTO v_booking FROM public.public_booking_submissions WHERE meeting_id=p_meeting_id;
  IF NOT FOUND OR v_booking.status<>'Confirmed' THEN RETURN; END IF;
  SELECT * INTO v_meeting FROM public.sales_meetings WHERE id=p_meeting_id;
  IF NOT FOUND OR v_meeting.status NOT IN ('Scheduled','Rescheduled') THEN RETURN; END IF;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_settings FROM public.system_configuration WHERE config_key='notification_settings';
  v_settings:=COALESCE(v_settings,'{}'::jsonb);
  v_payload:=public.build_public_booking_notification_payload(v_booking.id);
  v_schedule_key:=extract(epoch FROM v_meeting.start_at)::bigint::text;

  FOR v_minutes IN SELECT value::integer FROM jsonb_array_elements_text(COALESCE(v_settings->'reminderMinutes','[1440,60]'::jsonb))
  LOOP
    v_minutes:=LEAST(GREATEST(v_minutes,5),10080);
    v_when:=v_meeting.start_at-make_interval(mins=>v_minutes);
    IF v_when<=now() THEN CONTINUE; END IF;
    v_label:=CASE WHEN v_minutes=1440 THEN 'tomorrow'
      WHEN v_minutes=60 THEN 'in 1 hour'
      WHEN v_minutes%1440=0 THEN 'in '||(v_minutes/1440)::text||' days'
      WHEN v_minutes%60=0 THEN 'in '||(v_minutes/60)::text||' hours'
      ELSE 'in '||v_minutes::text||' minutes' END;

    PERFORM public.enqueue_notification(
      'meeting-reminder:'||p_meeting_id::text||':'||v_schedule_key||':'||v_minutes::text||':visitor',
      'meeting_reminder',v_booking.email,NULL,v_payload||jsonb_build_object('reminderLabel',v_label),v_when
    );
    PERFORM public.enqueue_notification(
      'meeting-reminder:'||p_meeting_id::text||':'||v_schedule_key||':'||v_minutes::text||':seller',
      'seller_meeting_reminder',COALESCE(v_payload->>'sellerEmail',''),v_booking.salesperson_id,
      v_payload||jsonb_build_object('reminderLabel',v_label),v_when
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_refresh_booking_reminders_on_meeting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.start_at IS DISTINCT FROM OLD.start_at AND NEW.status IN ('Scheduled','Rescheduled') THEN
    UPDATE public.notification_outbox
    SET status='Cancelled',last_error='Superseded by a meeting reschedule.',updated_at=now()
    WHERE dedupe_key LIKE ('meeting-reminder:'||NEW.id::text||':%') AND status IN ('Pending','Retry');
    PERFORM public.schedule_public_booking_reminders(NEW.id);
  END IF;
  IF NEW.status IN ('Completed','Cancelled','No Show') AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.notification_outbox
    SET status='Cancelled',last_error='Meeting closed before this reminder was due.',updated_at=now()
    WHERE dedupe_key LIKE ('meeting-reminder:'||NEW.id::text||':%') AND status IN ('Pending','Retry');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_queue_test_notification(p_recipient_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text:=lower(trim(COALESCE(p_recipient_email,'')));
  v_id uuid;
  v_config jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  IF v_email='' OR v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' THEN RAISE EXCEPTION 'Enter a valid test email address.'; END IF;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_config FROM public.system_configuration WHERE config_key='notification_settings';
  IF COALESCE((v_config->>'emailEnabled')::boolean,false) IS NOT TRUE OR lower(COALESCE(v_config->>'emailProvider','disabled'))='disabled' THEN
    RAISE EXCEPTION 'Enable and configure email delivery before sending a test.';
  END IF;
  v_id:=public.enqueue_notification(
    'notification-test:'||auth.uid()::text||':'||extract(epoch FROM clock_timestamp())::bigint::text,
    'notification_test',v_email,auth.uid(),jsonb_build_object('requestedBy',auth.uid()),now()
  );
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_notification_provider(text,text,text,text,text,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.schedule_public_booking_reminders(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.trigger_refresh_booking_reminders_on_meeting() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_queue_test_notification(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_notification_provider(text,text,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_queue_test_notification(text) TO authenticated;
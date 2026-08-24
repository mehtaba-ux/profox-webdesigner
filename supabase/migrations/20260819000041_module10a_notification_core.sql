-- Module 10A — Secure notification core.
-- Email delivery is asynchronous and provider-independent. Secrets live in Supabase Vault.

CREATE TABLE IF NOT EXISTS public.notification_templates (
  template_key text PRIMARY KEY,
  name text NOT NULL,
  subject_template text NOT NULL DEFAULT '',
  body_template text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  template_key text NOT NULL REFERENCES public.notification_templates(template_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  recipient_email text NOT NULL DEFAULT '',
  recipient_user_id uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Processing','Retry','Sent','Failed','Cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_message_id text NOT NULL DEFAULT '',
  last_error text NOT NULL DEFAULT '',
  last_attempt_at timestamptz NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (recipient_email <> '' OR recipient_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_due
  ON public.notification_outbox(status, scheduled_for)
  WHERE status IN ('Pending','Retry');
CREATE INDEX IF NOT EXISTS idx_notification_outbox_recipient_user
  ON public.notification_outbox(recipient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  notification_type text NOT NULL DEFAULT 'Info',
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  action_url text NOT NULL DEFAULT '',
  dedupe_key text NOT NULL UNIQUE,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_unread
  ON public.in_app_notifications(recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notification_templates FROM anon, authenticated;
REVOKE ALL ON TABLE public.notification_outbox FROM anon, authenticated;
REVOKE ALL ON TABLE public.in_app_notifications FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_templates TO authenticated;
GRANT SELECT ON TABLE public.notification_outbox TO authenticated;
GRANT SELECT ON TABLE public.in_app_notifications TO authenticated;
GRANT UPDATE(read_at) ON TABLE public.in_app_notifications TO authenticated;

DROP POLICY IF EXISTS notification_templates_admin_all ON public.notification_templates;
CREATE POLICY notification_templates_admin_all ON public.notification_templates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS notification_outbox_admin_or_recipient_select ON public.notification_outbox;
CREATE POLICY notification_outbox_admin_or_recipient_select ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (public.is_admin() OR recipient_user_id = auth.uid());

DROP POLICY IF EXISTS in_app_notifications_self_select ON public.in_app_notifications;
DROP POLICY IF EXISTS in_app_notifications_self_update ON public.in_app_notifications;
CREATE POLICY in_app_notifications_self_select ON public.in_app_notifications
  FOR SELECT TO authenticated
  USING (public.is_admin() OR recipient_user_id = auth.uid());
CREATE POLICY in_app_notifications_self_update ON public.in_app_notifications
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR recipient_user_id = auth.uid())
  WITH CHECK (public.is_admin() OR recipient_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_notification_template()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.template_key := lower(trim(NEW.template_key));
  IF NEW.template_key = '' OR NEW.template_key !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Template key must contain only lowercase letters, numbers and underscores.';
  END IF;
  NEW.name := left(trim(COALESCE(NEW.name,'')),160);
  NEW.subject_template := left(COALESCE(NEW.subject_template,''),500);
  NEW.body_template := left(COALESCE(NEW.body_template,''),20000);
  NEW.description := left(COALESCE(NEW.description,''),1000);
  IF NEW.name = '' THEN RAISE EXCEPTION 'Template name is required.'; END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_notification_template ON public.notification_templates;
CREATE TRIGGER trg_touch_notification_template
BEFORE INSERT OR UPDATE ON public.notification_templates
FOR EACH ROW EXECUTE FUNCTION public.touch_notification_template();

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_dedupe_key text,
  p_template_key text,
  p_recipient_email text DEFAULT '',
  p_recipient_user_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_scheduled_for timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_email text := lower(trim(COALESCE(p_recipient_email,'')));
BEGIN
  IF trim(COALESCE(p_dedupe_key,'')) = '' THEN RAISE EXCEPTION 'Notification dedupe key is required.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE template_key=p_template_key AND active IS TRUE) THEN
    RETURN NULL;
  END IF;
  IF v_email = '' AND p_recipient_user_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.notification_outbox(
    dedupe_key,template_key,recipient_email,recipient_user_id,payload,scheduled_for,status
  ) VALUES (
    left(trim(p_dedupe_key),500),p_template_key,v_email,p_recipient_user_id,COALESCE(p_payload,'{}'::jsonb),COALESCE(p_scheduled_for,now()),'Pending'
  )
  ON CONFLICT (dedupe_key) DO UPDATE
    SET scheduled_for = CASE
          WHEN public.notification_outbox.status IN ('Pending','Retry') THEN EXCLUDED.scheduled_for
          ELSE public.notification_outbox.scheduled_for
        END,
        payload = CASE
          WHEN public.notification_outbox.status IN ('Pending','Retry') THEN EXCLUDED.payload
          ELSE public.notification_outbox.payload
        END,
        updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_in_app_notification(
  p_recipient_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_action_url text,
  p_dedupe_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_recipient_user_id IS NULL OR trim(COALESCE(p_dedupe_key,''))='' THEN RETURN NULL; END IF;
  INSERT INTO public.in_app_notifications(recipient_user_id,notification_type,title,message,action_url,dedupe_key)
  VALUES(
    p_recipient_user_id,
    left(COALESCE(NULLIF(trim(p_type),''),'Info'),80),
    left(trim(COALESCE(p_title,'')),240),
    left(COALESCE(p_message,''),2000),
    left(COALESCE(p_action_url,''),1000),
    left(trim(p_dedupe_key),500)
  )
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

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
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  IF v_provider NOT IN ('disabled','resend','brevo') THEN RAISE EXCEPTION 'Unsupported notification provider.'; END IF;
  IF p_email_enabled AND v_provider='disabled' THEN RAISE EXCEPTION 'Choose an email provider before enabling email delivery.'; END IF;
  IF trim(COALESCE(p_from_email,''))<>'' AND lower(trim(p_from_email)) !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Enter a valid sender email address.';
  END IF;

  SELECT id INTO v_secret_id FROM vault.secrets WHERE name='profox_notification_provider_api_key' LIMIT 1;
  IF trim(COALESCE(p_api_key,''))<>'' THEN
    IF v_secret_id IS NULL THEN
      PERFORM vault.create_secret(trim(p_api_key),'profox_notification_provider_api_key','ProFox notification provider API key',NULL);
    ELSE
      PERFORM vault.update_secret(v_secret_id,trim(p_api_key),'profox_notification_provider_api_key','ProFox notification provider API key',NULL);
    END IF;
    v_has_key := true;
  ELSE
    v_has_key := v_secret_id IS NOT NULL;
  END IF;

  IF p_email_enabled AND NOT v_has_key THEN RAISE EXCEPTION 'Provider API key is required before enabling email delivery.'; END IF;
  IF p_email_enabled AND trim(COALESCE(p_from_email,''))='' THEN RAISE EXCEPTION 'Sender email is required before enabling email delivery.'; END IF;

  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_config
  FROM public.system_configuration WHERE config_key='notification_settings';
  v_config := COALESCE(v_config,'{}'::jsonb) || jsonb_build_object(
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

CREATE OR REPLACE FUNCTION public.admin_get_notification_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE v_config jsonb; v_has_key boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_config FROM public.system_configuration WHERE config_key='notification_settings';
  SELECT EXISTS(SELECT 1 FROM vault.secrets WHERE name='profox_notification_provider_api_key') INTO v_has_key;
  RETURN COALESCE(v_config,'{}'::jsonb) || jsonb_build_object(
    'providerConfigured',v_has_key,
    'pendingCount',(SELECT count(*) FROM public.notification_outbox WHERE status IN ('Pending','Retry')),
    'failedCount',(SELECT count(*) FROM public.notification_outbox WHERE status='Failed'),
    'sentLast24Hours',(SELECT count(*) FROM public.notification_outbox WHERE status='Sent' AND sent_at>=now()-interval '24 hours')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_retry_failed_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  UPDATE public.notification_outbox
  SET status='Retry',scheduled_for=now(),last_error='',updated_at=now()
  WHERE status='Failed';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_get_notification_delivery_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE v_config jsonb; v_secret text;
BEGIN
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_config FROM public.system_configuration WHERE config_key='notification_settings';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='profox_notification_provider_api_key' LIMIT 1;
  RETURN COALESCE(v_config,'{}'::jsonb) || jsonb_build_object('apiKey',COALESCE(v_secret,''));
END;
$$;

CREATE OR REPLACE FUNCTION public.service_claim_notification_batch(p_limit integer DEFAULT 25)
RETURNS TABLE(
  id uuid,
  template_key text,
  recipient_email text,
  recipient_user_id uuid,
  payload jsonb,
  subject_template text,
  body_template text,
  attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT o.id
    FROM public.notification_outbox o
    WHERE o.status IN ('Pending','Retry') AND o.scheduled_for<=now()
    ORDER BY o.scheduled_for,o.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit,25),1),100)
  ), updated AS (
    UPDATE public.notification_outbox o
    SET status='Processing',attempts=o.attempts+1,last_attempt_at=now(),updated_at=now()
    FROM claimed c
    WHERE o.id=c.id
    RETURNING o.*
  )
  SELECT u.id,u.template_key,u.recipient_email,u.recipient_user_id,u.payload,t.subject_template,t.body_template,u.attempts
  FROM updated u
  JOIN public.notification_templates t ON t.template_key=u.template_key
  WHERE t.active IS TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_complete_notification(
  p_id uuid,
  p_success boolean,
  p_provider_message_id text DEFAULT '',
  p_error text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_max_attempts integer;
BEGIN
  SELECT LEAST(GREATEST(COALESCE((config_value->>'maxAttempts')::integer,5),1),10)
  INTO v_max_attempts FROM public.system_configuration WHERE config_key='notification_settings';
  v_max_attempts := COALESCE(v_max_attempts,5);

  IF p_success THEN
    UPDATE public.notification_outbox
    SET status='Sent',provider_message_id=left(COALESCE(p_provider_message_id,''),500),last_error='',sent_at=now(),updated_at=now()
    WHERE id=p_id AND status='Processing';
  ELSE
    UPDATE public.notification_outbox
    SET status=CASE WHEN attempts>=v_max_attempts THEN 'Failed' ELSE 'Retry' END,
        scheduled_for=CASE WHEN attempts>=v_max_attempts THEN scheduled_for ELSE now()+make_interval(mins=>LEAST(60,GREATEST(2,attempts*5))) END,
        last_error=left(COALESCE(p_error,'Unknown delivery error'),4000),updated_at=now()
    WHERE id=p_id AND status='Processing';
  END IF;
END;
$$;

INSERT INTO public.system_configuration(config_key,config_value,description,updated_at)
VALUES(
  'notification_settings',
  '{
    "emailEnabled": false,
    "emailProvider": "disabled",
    "providerConfigured": false,
    "fromEmail": "",
    "fromName": "ProFox",
    "replyTo": "",
    "publicBaseUrl": "https://www.profoxwebdesigner.com",
    "reminderMinutes": [1440, 60],
    "noShowFollowUpHours": 2,
    "completedReviewHours": 2,
    "quotationFollowUpDays": 2,
    "maxAttempts": 5
  }'::jsonb,
  'ProFox server-side notification delivery, reminders and sales automation settings.',
  now()
)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,description)
VALUES
('booking_confirmation','Booking confirmation','Your ProFox meeting is confirmed — {{bookingReference}}','Hi {{contactName}},\n\nYour meeting with {{expertName}} is confirmed for {{meetingTimeVisitor}}.\n\nService: {{serviceInterest}}\nBooking reference: {{bookingReference}}\n\nManage your booking: {{manageUrl}}\n\nWe look forward to speaking with you.\n\nProFox','Sent to the visitor immediately after a public booking.'),
('seller_new_booking','Seller new-booking alert','New ProFox booking — {{companyName}}','Hi {{expertName}},\n\nA new meeting has been booked with {{contactName}} from {{companyName}}.\n\nWhen: {{meetingTimeSeller}}\nService: {{serviceInterest}}\nBudget: {{budgetRange}}\nTimeline: {{timeline}}\nDecision maker: {{decisionMaker}}\n\nOpen meeting preparation: {{meetingPrepUrl}}','Sent to the assigned seller after a public booking.'),
('meeting_reminder','Meeting reminder — {{companyName}}','Reminder: your ProFox meeting is {{reminderLabel}}','Hi {{contactName}},\n\nThis is a reminder that your ProFox meeting with {{expertName}} is {{reminderLabel}} at {{meetingTimeVisitor}}.\n\nManage your booking: {{manageUrl}}\n\nProFox','Visitor meeting reminder; reminderLabel is generated by the scheduler.'),
('seller_meeting_reminder','Upcoming meeting — {{companyName}}','You have a meeting {{reminderLabel}}','{{expertName}}, your meeting with {{contactName}} from {{companyName}} is {{reminderLabel}} at {{meetingTimeSeller}}.\n\nOpen preparation: {{meetingPrepUrl}}','Seller reminder with direct meeting-prep access.'),
('booking_rescheduled','Booking rescheduled — {{bookingReference}}','Your ProFox meeting has been rescheduled','Hi {{contactName}},\n\nYour meeting with {{expertName}} has been moved to {{meetingTimeVisitor}}.\n\nManage your booking: {{manageUrl}}\n\nProFox','Sent when a public booking is rescheduled.'),
('booking_cancelled','Booking cancelled — {{bookingReference}}','Your ProFox meeting has been cancelled','Hi {{contactName}},\n\nYour meeting with {{expertName}} has been cancelled.\n\nIf you would like to book another time, visit {{bookingPageUrl}}.\n\nProFox','Sent when a public booking is cancelled.'),
('no_show_rebook','Missed meeting follow-up — {{companyName}}','Would you like to choose another meeting time?','Hi {{contactName}},\n\nWe missed you at the scheduled meeting. If you still want to speak with ProFox, you can choose another time here: {{manageUrl}}\n\nProFox','Optional visitor follow-up after a No Show.'),
('quotation_follow_up_task','Quotation follow-up','Quotation follow-up due — {{quotationNumber}}','Quotation {{quotationNumber}} for {{customerName}} needs follow-up. Open the quotation in ProFox: {{quotationUrl}}','Internal seller notification when a sent quotation has not progressed.')
ON CONFLICT (template_key) DO NOTHING;

REVOKE ALL ON FUNCTION public.touch_notification_template() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enqueue_notification(text,text,text,uuid,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enqueue_in_app_notification(uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_set_notification_provider(text,text,text,text,text,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_get_notification_status() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_retry_failed_notifications() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.service_get_notification_delivery_config() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_claim_notification_batch(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.service_complete_notification(uuid,boolean,text,text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.admin_set_notification_provider(text,text,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_notification_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_retry_failed_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_notification_delivery_config() TO service_role;
GRANT EXECUTE ON FUNCTION public.service_claim_notification_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_complete_notification(uuid,boolean,text,text) TO service_role;
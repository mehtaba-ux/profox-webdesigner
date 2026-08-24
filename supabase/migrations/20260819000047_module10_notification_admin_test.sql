-- Module 10A admin usability — safely queue a test email through the same production outbox.

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,description)
VALUES(
  'notification_test',
  'Notification delivery test',
  'ProFox notification system test',
  'This is a test from the ProFox notification system.\n\nIf you received this message, the configured provider, sender identity, secure outbox and delivery worker are operating correctly.',
  'Admin-only test message used to verify provider delivery.'
)
ON CONFLICT(template_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_queue_test_notification(p_recipient_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_email text:=lower(trim(COALESCE(p_recipient_email,''))); v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  IF v_email='' OR v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' THEN RAISE EXCEPTION 'Enter a valid test email address.'; END IF;
  v_id:=public.enqueue_notification(
    'notification-test:'||auth.uid()::text||':'||extract(epoch FROM clock_timestamp())::bigint::text,
    'notification_test',v_email,auth.uid(),jsonb_build_object('requestedBy',auth.uid()),now()
  );
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_queue_test_notification(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_queue_test_notification(text) TO authenticated;
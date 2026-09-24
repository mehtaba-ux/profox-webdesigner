-- Module 10A hardening — Do not accumulate stale emails while provider delivery is disabled.

CREATE OR REPLACE FUNCTION public.service_suppress_due_notifications_when_disabled()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_enabled boolean; v_count integer;
BEGIN
  SELECT COALESCE((config_value->>'emailEnabled')::boolean,false)
  INTO v_enabled FROM public.system_configuration WHERE config_key='notification_settings';
  IF COALESCE(v_enabled,false) IS TRUE THEN RETURN 0; END IF;

  UPDATE public.notification_outbox
  SET status='Cancelled',last_error='Email delivery was disabled when this notification became due.',updated_at=now()
  WHERE status IN ('Pending','Retry') AND scheduled_for<=now();
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.service_suppress_due_notifications_when_disabled() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_suppress_due_notifications_when_disabled() TO service_role;
-- Recurring mock-call automation, Admin-editable policy validation and exception reprocessing.

CREATE OR REPLACE FUNCTION public.process_mock_call_automation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp','cron'
AS $function$
DECLARE
  v_settings jsonb:=public.get_mock_call_automation_settings();
  v_session public.mock_call_sessions%ROWTYPE;
  v_result jsonb;
  v_reassigned integer:=0;
  v_pending integer:=0;
  v_attention integer:=0;
  v_grace integer:=GREATEST(COALESCE((v_settings->>'evaluationGraceHours')::integer,24),1);
  v_max_attempts integer:=GREATEST(COALESCE((v_settings->>'maxAssignmentAttempts')::integer,10),1);
BEGIN
  IF COALESCE((v_settings->>'active')::boolean,true) IS NOT TRUE THEN RETURN jsonb_build_object('active',false,'reassigned',0,'pending',0,'attention',0); END IF;

  IF COALESCE((v_settings->>'adminsEligibleByDefault')::boolean,true) THEN
    INSERT INTO public.mock_call_evaluator_profiles(user_id,enabled,evaluator_class,availability_mode,notes)
    SELECT id,true,'admin','global','Automatically eligible Admin fallback evaluator.' FROM public.user_profiles WHERE role='admin' AND status='active'
    ON CONFLICT(user_id) DO NOTHING;
  END IF;

  -- If a future session loses its evaluator eligibility, release its reservations and reassign it.
  FOR v_session IN
    SELECT s.* FROM public.mock_call_sessions s
    LEFT JOIN public.user_profiles p ON p.id=s.evaluator_id
    LEFT JOIN public.mock_call_evaluator_profiles ep ON ep.user_id=s.evaluator_id
    WHERE s.status='scheduled' AND s.scheduled_start_at>now()
      AND (s.evaluator_id IS NULL OR p.status IS DISTINCT FROM 'active' OR ep.enabled IS DISTINCT FROM true)
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    PERFORM public.release_mock_call_reservations(v_session.id);
    UPDATE public.notification_outbox SET status='Cancelled',updated_at=now() WHERE dedupe_key LIKE 'mock-call:'||v_session.id||':%' AND status IN ('Pending','Retry');
    INSERT INTO public.mock_call_events(session_id,event_type,event_data) VALUES(v_session.id,'evaluator_became_ineligible',jsonb_build_object('evaluatorId',v_session.evaluator_id));
    UPDATE public.mock_call_sessions SET status='pending_assignment',evaluator_id=NULL,scheduled_start_at=NULL,scheduled_end_at=NULL,meeting_url='',evaluator_assigned_at=NULL,updated_at=now() WHERE id=v_session.id;
    v_result:=public.try_schedule_mock_call_session(v_session.id);
    IF v_result->>'status'='scheduled' THEN v_reassigned:=v_reassigned+1; ELSE v_pending:=v_pending+1; END IF;
  END LOOP;

  -- Retry normal pending assignments while they are below the configured exception threshold.
  FOR v_session IN
    SELECT * FROM public.mock_call_sessions
    WHERE status IN ('pending_assignment','evaluator_declined') AND assignment_attempts<v_max_attempts
    ORDER BY created_at FOR UPDATE SKIP LOCKED
  LOOP
    v_result:=public.try_schedule_mock_call_session(v_session.id);
    IF v_result->>'status'='scheduled' THEN v_reassigned:=v_reassigned+1; ELSE v_pending:=v_pending+1; END IF;
  END LOOP;

  -- A completed meeting that remains unscored after the grace window becomes an Admin exception, but the assigned evaluator can still score it.
  FOR v_session IN
    SELECT * FROM public.mock_call_sessions
    WHERE status='scheduled' AND scheduled_end_at IS NOT NULL AND scheduled_end_at<now()-make_interval(hours=>v_grace)
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.mock_call_sessions SET status='needs_admin_attention',updated_at=now() WHERE id=v_session.id;
    INSERT INTO public.mock_call_events(session_id,event_type,event_data) VALUES(v_session.id,'evaluation_overdue',jsonb_build_object('graceHours',v_grace));
    v_attention:=v_attention+1;
  END LOOP;

  SELECT count(*) INTO v_attention FROM public.mock_call_sessions WHERE status='needs_admin_attention';
  RETURN jsonb_build_object('active',true,'reassigned',v_reassigned,'pending',v_pending,'attention',v_attention,'processedAt',now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_mock_call_automation_settings(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp','cron'
AS $function$
DECLARE
  v_current jsonb:=public.get_mock_call_automation_settings();
  v_next jsonb;
  v_minutes integer;
  v_schedule text;
  v_tz text;
  v_start time;
  v_end time;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  IF jsonb_typeof(p_settings)<>'object' THEN RAISE EXCEPTION 'Mock-call automation settings must be an object.'; END IF;
  v_next:=v_current||p_settings;

  IF COALESCE((v_next->>'minSalesTenureMonths')::integer,-1) NOT BETWEEN 0 AND 240 THEN RAISE EXCEPTION 'Sales evaluator tenure must be between 0 and 240 months.'; END IF;
  IF COALESCE((v_next->>'minimumNoticeHours')::integer,-1) NOT BETWEEN 0 AND 336 THEN RAISE EXCEPTION 'Minimum notice must be between 0 and 336 hours.'; END IF;
  IF COALESCE((v_next->>'schedulingHorizonDays')::integer,0) NOT BETWEEN 1 AND 90 THEN RAISE EXCEPTION 'Scheduling horizon must be 1–90 days.'; END IF;
  IF COALESCE((v_next->>'slotIntervalMinutes')::integer,0) NOT BETWEEN 15 AND 120 THEN RAISE EXCEPTION 'Slot interval must be 15–120 minutes.'; END IF;
  IF COALESCE((v_next->>'defaultDurationMinutes')::integer,0) NOT BETWEEN 15 AND 120 THEN RAISE EXCEPTION 'Mock-call duration must be 15–120 minutes.'; END IF;
  IF COALESCE((v_next->>'balanceWindowDays')::integer,0) NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Balance window must be 1–365 days.'; END IF;
  IF COALESCE((v_next->>'defaultMaxActiveSessions')::integer,0) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Default active-session cap must be 1–20.'; END IF;
  IF COALESCE((v_next->>'defaultMaxWeeklySessions')::integer,0) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Default weekly-session cap must be 1–50.'; END IF;
  IF COALESCE((v_next->>'retryDelayHours')::integer,-1) NOT BETWEEN 0 AND 336 THEN RAISE EXCEPTION 'Retry delay must be 0–336 hours.'; END IF;
  IF COALESCE((v_next->>'maxAssignmentAttempts')::integer,0) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Assignment attempts must be 1–50.'; END IF;
  IF COALESCE((v_next->>'fullRehearsalsRequired')::integer,0) NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Required rehearsals must be 1–10.'; END IF;
  IF COALESCE((v_next->>'selfScoreReadinessBenchmark')::integer,-1) NOT BETWEEN 0 AND 20 THEN RAISE EXCEPTION 'Readiness benchmark must be 0–20.'; END IF;
  IF COALESCE((v_next->>'evaluationGraceHours')::integer,0) NOT BETWEEN 1 AND 168 THEN RAISE EXCEPTION 'Evaluation grace must be 1–168 hours.'; END IF;

  v_minutes:=COALESCE((v_next->>'automationCheckMinutes')::integer,30);
  IF v_minutes NOT IN (15,30,60) THEN RAISE EXCEPTION 'Automation check cadence must be 15, 30 or 60 minutes.'; END IF;
  v_tz:=COALESCE(NULLIF(v_next->>'defaultTimezone',''),'UTC');
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=v_tz) THEN RAISE EXCEPTION 'Default timezone is not a valid IANA timezone.'; END IF;
  IF jsonb_typeof(v_next->'fallbackWorkingDays')<>'array' OR jsonb_array_length(v_next->'fallbackWorkingDays')=0 THEN RAISE EXCEPTION 'Fallback working days are required.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_next->'fallbackWorkingDays') x WHERE x::integer<0 OR x::integer>6) THEN RAISE EXCEPTION 'Fallback working days must use day numbers 0–6.'; END IF;
  BEGIN v_start:=(v_next->>'fallbackWorkStart')::time; v_end:=(v_next->>'fallbackWorkEnd')::time; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Fallback working hours are invalid.'; END;
  IF v_end<=v_start THEN RAISE EXCEPTION 'Fallback work end must be after work start.'; END IF;
  IF jsonb_typeof(v_next->'reminderMinutes')<>'array' THEN RAISE EXCEPTION 'Reminder minutes must be an array.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_next->'reminderMinutes') x WHERE x::integer<0 OR x::integer>10080) THEN RAISE EXCEPTION 'Reminder minutes must be between 0 and 10080.'; END IF;

  INSERT INTO public.system_configuration(config_key,config_value,description,updated_at)
  VALUES('mock_call_automation_settings',v_next,'Controls fully automated Module 10 readiness and Module 11 mock-call scheduling/evaluation.',now())
  ON CONFLICT(config_key) DO UPDATE SET config_value=EXCLUDED.config_value,description=EXCLUDED.description,updated_at=now();

  BEGIN
    PERFORM cron.unschedule('profox-mock-call-automation');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  v_schedule:=CASE WHEN v_minutes=60 THEN '0 * * * *' ELSE '*/'||v_minutes||' * * * *' END;
  PERFORM cron.schedule('profox-mock-call-automation',v_schedule,'SELECT public.process_mock_call_automation();');
  RETURN v_next;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reprocess_mock_call_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_session public.mock_call_sessions%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  SELECT * INTO v_session FROM public.mock_call_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.status IN ('passed','completed','cancelled') THEN RAISE EXCEPTION 'This session cannot be reprocessed.'; END IF;
  IF v_session.status='scheduled' AND v_session.scheduled_start_at>now() THEN
    PERFORM public.release_mock_call_reservations(v_session.id);
    UPDATE public.notification_outbox SET status='Cancelled',updated_at=now() WHERE dedupe_key LIKE 'mock-call:'||v_session.id||':%' AND status IN ('Pending','Retry');
  END IF;
  UPDATE public.mock_call_sessions
  SET status='pending_assignment',assignment_attempts=0,evaluator_id=NULL,scheduled_start_at=NULL,scheduled_end_at=NULL,meeting_url='',evaluator_assigned_at=NULL,updated_at=now()
  WHERE id=v_session.id;
  INSERT INTO public.mock_call_events(session_id,event_type,actor_user_id,event_data) VALUES(v_session.id,'admin_reprocess_requested',auth.uid(),'{}'::jsonb);
  RETURN public.try_schedule_mock_call_session(v_session.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.process_mock_call_automation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_update_mock_call_automation_settings(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_reprocess_mock_call_session(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_update_mock_call_automation_settings(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reprocess_mock_call_session(uuid) TO authenticated;

DO $cron$
BEGIN
  BEGIN PERFORM cron.unschedule('profox-mock-call-automation'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('profox-mock-call-automation','*/30 * * * *','SELECT public.process_mock_call_automation();');
END
$cron$;

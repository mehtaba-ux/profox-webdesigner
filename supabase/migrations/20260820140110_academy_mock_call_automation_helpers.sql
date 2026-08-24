-- Module 11 automated evaluator assignment, balanced-random scheduling, calendar reservations and notification helpers.

CREATE OR REPLACE FUNCTION public.get_mock_call_automation_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
  SELECT COALESCE((SELECT config_value FROM public.system_configuration WHERE config_key='mock_call_automation_settings'),'{}'::jsonb);
$function$;

CREATE OR REPLACE FUNCTION public.mock_call_is_user_available(
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_override jsonb DEFAULT NULL,
  p_exclude_session uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_settings jsonb:=public.get_mock_call_automation_settings();
  v_profile_tz text;
  v_tz text;
  v_days integer[];
  v_work_start time;
  v_work_end time;
  v_local_start timestamp;
  v_local_end timestamp;
  v_ep public.mock_call_evaluator_profiles%ROWTYPE;
  v_cal public.user_calendar_settings%ROWTYPE;
  v_has_ep boolean:=false;
  v_has_cal boolean:=false;
  v_source jsonb;
  v_buffer_before integer:=0;
  v_buffer_after integer:=0;
BEGIN
  IF p_user_id IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end<=p_start THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id=p_user_id AND status IN ('active','onboarding')) THEN RETURN false; END IF;
  SELECT timezone INTO v_profile_tz FROM public.user_profiles WHERE id=p_user_id;

  IF p_override IS NOT NULL AND jsonb_typeof(p_override)='object' AND p_override<>'{}'::jsonb THEN
    v_source:=p_override;
    v_tz:=COALESCE(NULLIF(v_source->>'timezone',''),NULLIF(v_profile_tz,''),NULLIF(v_settings->>'defaultTimezone',''),'UTC');
    SELECT COALESCE(array_agg(value::integer),ARRAY[1,2,3,4,5]) INTO v_days
    FROM jsonb_array_elements_text(COALESCE(v_source->'workingDays',v_settings->'fallbackWorkingDays','[1,2,3,4,5]'::jsonb));
    v_work_start:=COALESCE((NULLIF(v_source->>'workStart',''))::time,(NULLIF(v_settings->>'fallbackWorkStart',''))::time,'09:00'::time);
    v_work_end:=COALESCE((NULLIF(v_source->>'workEnd',''))::time,(NULLIF(v_settings->>'fallbackWorkEnd',''))::time,'17:00'::time);
  ELSE
    SELECT * INTO v_ep FROM public.mock_call_evaluator_profiles WHERE user_id=p_user_id;
    v_has_ep:=FOUND;
    SELECT * INTO v_cal FROM public.user_calendar_settings WHERE user_id=p_user_id AND active=true;
    v_has_cal:=FOUND;

    IF v_has_ep AND v_ep.availability_mode='custom' AND v_ep.custom_availability<>'{}'::jsonb THEN
      v_source:=v_ep.custom_availability;
      v_tz:=COALESCE(NULLIF(v_source->>'timezone',''),NULLIF(v_profile_tz,''),NULLIF(v_settings->>'defaultTimezone',''),'UTC');
      SELECT COALESCE(array_agg(value::integer),ARRAY[1,2,3,4,5]) INTO v_days
      FROM jsonb_array_elements_text(COALESCE(v_source->'workingDays',v_settings->'fallbackWorkingDays','[1,2,3,4,5]'::jsonb));
      v_work_start:=COALESCE((NULLIF(v_source->>'workStart',''))::time,(NULLIF(v_settings->>'fallbackWorkStart',''))::time,'09:00'::time);
      v_work_end:=COALESCE((NULLIF(v_source->>'workEnd',''))::time,(NULLIF(v_settings->>'fallbackWorkEnd',''))::time,'17:00'::time);
    ELSIF v_has_ep AND v_ep.availability_mode='calendar' AND v_has_cal THEN
      v_tz:=v_cal.timezone; v_days:=v_cal.working_days; v_work_start:=v_cal.work_start; v_work_end:=v_cal.work_end;
      v_buffer_before:=COALESCE(v_cal.buffer_before_minutes,0); v_buffer_after:=COALESCE(v_cal.buffer_after_minutes,0);
    ELSIF NOT v_has_ep AND v_has_cal THEN
      v_tz:=v_cal.timezone; v_days:=v_cal.working_days; v_work_start:=v_cal.work_start; v_work_end:=v_cal.work_end;
      v_buffer_before:=COALESCE(v_cal.buffer_before_minutes,0); v_buffer_after:=COALESCE(v_cal.buffer_after_minutes,0);
    ELSE
      v_tz:=COALESCE(NULLIF(v_profile_tz,''),NULLIF(v_settings->>'defaultTimezone',''),'UTC');
      SELECT COALESCE(array_agg(value::integer),ARRAY[1,2,3,4,5]) INTO v_days
      FROM jsonb_array_elements_text(COALESCE(v_settings->'fallbackWorkingDays','[1,2,3,4,5]'::jsonb));
      v_work_start:=COALESCE((NULLIF(v_settings->>'fallbackWorkStart',''))::time,'09:00'::time);
      v_work_end:=COALESCE((NULLIF(v_settings->>'fallbackWorkEnd',''))::time,'17:00'::time);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=v_tz) THEN v_tz:='UTC'; END IF;
  v_local_start:=p_start AT TIME ZONE v_tz;
  v_local_end:=p_end AT TIME ZONE v_tz;
  IF extract(dow FROM v_local_start)::integer<>ALL(COALESCE(v_days,ARRAY[1,2,3,4,5])) THEN RETURN false; END IF;
  IF v_local_start::date<>v_local_end::date OR v_local_start::time<v_work_start OR v_local_end::time>v_work_end THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.sales_meetings m
    WHERE m.salesperson_id=p_user_id AND m.status IN ('Scheduled','Rescheduled')
      AND m.start_at < p_end+make_interval(mins=>v_buffer_after)
      AND m.end_at > p_start-make_interval(mins=>v_buffer_before)
  ) THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_availability_blocks b
    WHERE b.user_id=p_user_id AND b.start_at<p_end AND b.end_at>p_start
  ) THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.mock_call_sessions s
    WHERE s.id IS DISTINCT FROM p_exclude_session AND s.status='scheduled'
      AND (s.trainee_id=p_user_id OR s.evaluator_id=p_user_id)
      AND s.scheduled_start_at<p_end AND s.scheduled_end_at>p_start
  ) THEN RETURN false; END IF;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_mock_call_notice(
  p_user_id uuid,
  p_template_key text,
  p_payload jsonb,
  p_dedupe_key text,
  p_scheduled_for timestamptz DEFAULT now(),
  p_action_url text DEFAULT '/admin/app/academy?tab=training'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_email text;
BEGIN
  SELECT lower(COALESCE(email,'')) INTO v_email FROM public.user_profiles WHERE id=p_user_id;
  IF p_scheduled_for<=now()+interval '2 minutes' THEN
    INSERT INTO public.in_app_notifications(recipient_user_id,notification_type,title,message,action_url,dedupe_key)
    VALUES(p_user_id,'mock_call',COALESCE(p_payload->>'title','ProFox Mock Call'),COALESCE(p_payload->>'message','Open ProFox for your mock-call details.'),p_action_url,p_dedupe_key||':inapp')
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  IF v_email<>'' AND EXISTS (SELECT 1 FROM public.notification_templates WHERE template_key=p_template_key AND active=true) THEN
    INSERT INTO public.notification_outbox(dedupe_key,template_key,recipient_email,recipient_user_id,payload,scheduled_for,status)
    VALUES(p_dedupe_key,p_template_key,v_email,p_user_id,COALESCE(p_payload,'{}'::jsonb),GREATEST(p_scheduled_for,now()),'Pending')
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_mock_call_reservations(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_session public.mock_call_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.mock_call_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_session.trainee_block_id IS NOT NULL THEN DELETE FROM public.booking_availability_blocks WHERE id=v_session.trainee_block_id; END IF;
  IF v_session.evaluator_block_id IS NOT NULL THEN DELETE FROM public.booking_availability_blocks WHERE id=v_session.evaluator_block_id; END IF;
  UPDATE public.mock_call_sessions SET trainee_block_id=NULL,evaluator_block_id=NULL,updated_at=now() WHERE id=p_session_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.try_schedule_mock_call_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_session public.mock_call_sessions%ROWTYPE;
  v_settings jsonb:=public.get_mock_call_automation_settings();
  v_availability jsonb:='{}'::jsonb;
  v_eval record;
  v_slot timestamptz;
  v_end timestamptz;
  v_min_start timestamptz;
  v_horizon timestamptz;
  v_interval_seconds integer;
  v_duration integer;
  v_min_notice integer;
  v_max_attempts integer;
  v_min_tenure integer;
  v_require_cert boolean;
  v_require_link boolean;
  v_trainee_block uuid;
  v_evaluator_block uuid;
  v_trainee_name text;
  v_evaluator_name text;
  v_trainee_tz text;
  v_evaluator_tz text;
  v_payload jsonb;
  v_reminder integer;
BEGIN
  SELECT * INTO v_session FROM public.mock_call_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mock call session not found.'; END IF;
  IF v_session.status IN ('passed','completed','cancelled') THEN RETURN jsonb_build_object('status',v_session.status,'sessionId',v_session.id); END IF;
  IF COALESCE((v_settings->>'active')::boolean,true) IS NOT TRUE THEN
    UPDATE public.mock_call_sessions SET status='needs_admin_attention',updated_at=now() WHERE id=v_session.id;
    RETURN jsonb_build_object('status','needs_admin_attention','reason','Mock call automation is disabled by Admin.');
  END IF;

  PERFORM public.release_mock_call_reservations(v_session.id);
  SELECT * INTO v_session FROM public.mock_call_sessions WHERE id=p_session_id FOR UPDATE;
  SELECT assessment_availability INTO v_availability FROM public.call_practice_state WHERE user_id=v_session.trainee_id AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1;
  v_availability:=COALESCE(v_availability,'{}'::jsonb);

  v_interval_seconds:=GREATEST(COALESCE((v_settings->>'slotIntervalMinutes')::integer,30),15)*60;
  v_duration:=GREATEST(COALESCE((v_settings->>'defaultDurationMinutes')::integer,30),15);
  v_min_notice:=GREATEST(COALESCE((v_settings->>'minimumNoticeHours')::integer,24),0);
  v_max_attempts:=GREATEST(COALESCE((v_settings->>'maxAssignmentAttempts')::integer,10),1);
  v_min_tenure:=GREATEST(COALESCE((v_settings->>'minSalesTenureMonths')::integer,24),0);
  v_require_cert:=COALESCE((v_settings->>'requireSalesCertification')::boolean,true);
  v_require_link:=COALESCE((v_settings->>'requireMeetingUrlForAutoAssignment')::boolean,false);

  v_min_start:=GREATEST(now()+make_interval(hours=>v_min_notice),COALESCE(v_session.not_before_at,now()));
  v_min_start:=to_timestamp(ceil(extract(epoch FROM v_min_start)/v_interval_seconds)*v_interval_seconds);
  v_horizon:=v_min_start+make_interval(days=>GREATEST(COALESCE((v_settings->>'schedulingHorizonDays')::integer,14),1));

  IF COALESCE((v_settings->>'adminsEligibleByDefault')::boolean,true) THEN
    INSERT INTO public.mock_call_evaluator_profiles(user_id,enabled,evaluator_class,availability_mode,notes)
    SELECT id,true,'admin','global','Automatically eligible Admin fallback evaluator.' FROM public.user_profiles WHERE role='admin' AND status='active'
    ON CONFLICT(user_id) DO NOTHING;
  END IF;

  FOR v_eval IN
    SELECT ep.user_id,ep.evaluator_class,ep.meeting_url,
           COALESCE(ep.max_active_sessions,(v_settings->>'defaultMaxActiveSessions')::integer,3) max_active,
           COALESCE(ep.max_weekly_sessions,(v_settings->>'defaultMaxWeeklySessions')::integer,5) max_weekly,
           up.full_name,up.timezone,
           (SELECT count(*) FROM public.mock_call_sessions x WHERE x.evaluator_id=ep.user_id AND x.status='scheduled' AND x.scheduled_end_at>now()) active_count,
           (SELECT count(*) FROM public.mock_call_sessions x WHERE x.evaluator_id=ep.user_id AND x.evaluator_assigned_at>=now()-interval '7 days') weekly_count,
           (SELECT count(*) FROM public.mock_call_sessions x WHERE x.evaluator_id=ep.user_id AND x.evaluator_assigned_at>=now()-make_interval(days=>GREATEST(COALESCE((v_settings->>'balanceWindowDays')::integer,30),1))) balance_count
    FROM public.mock_call_evaluator_profiles ep
    JOIN public.user_profiles up ON up.id=ep.user_id
    WHERE ep.enabled=true AND up.status='active' AND ep.user_id<>v_session.trainee_id
      AND (
        (ep.evaluator_class='admin' AND up.role='admin')
        OR ep.evaluator_class='manager'
        OR (
          ep.evaluator_class='sales_agent'
          AND up.role IN ('sales','sales_rep','sales_team')
          AND ep.service_start_date IS NOT NULL
          AND ep.service_start_date <= (current_date-(v_min_tenure||' months')::interval)::date
          AND (NOT v_require_cert OR EXISTS (
            SELECT 1 FROM public.user_training_progress fp JOIN public.training_modules fm ON fm.id=fp.module_id
            WHERE fp.user_id=ep.user_id AND fm.slug='final-certification' AND fp.status IN ('Passed','Completed')
          ))
        )
      )
      AND (NOT v_require_link OR NULLIF(trim(ep.meeting_url),'') IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM public.mock_call_events ev WHERE ev.session_id=v_session.id AND ev.event_type='evaluator_declined'
          AND ev.event_data->>'evaluatorId'=ep.user_id::text
      )
      AND (SELECT count(*) FROM public.mock_call_sessions x WHERE x.evaluator_id=ep.user_id AND x.status='scheduled' AND x.scheduled_end_at>now()) < COALESCE(ep.max_active_sessions,(v_settings->>'defaultMaxActiveSessions')::integer,3)
      AND (SELECT count(*) FROM public.mock_call_sessions x WHERE x.evaluator_id=ep.user_id AND x.evaluator_assigned_at>=now()-interval '7 days') < COALESCE(ep.max_weekly_sessions,(v_settings->>'defaultMaxWeeklySessions')::integer,5)
    ORDER BY balance_count ASC,active_count ASC,weekly_count ASC,random()
  LOOP
    FOR v_slot IN SELECT gs FROM generate_series(v_min_start,v_horizon-make_interval(mins=>v_duration),make_interval(mins=>GREATEST(COALESCE((v_settings->>'slotIntervalMinutes')::integer,30),15))) gs
    LOOP
      v_end:=v_slot+make_interval(mins=>v_duration);
      IF public.mock_call_is_user_available(v_session.trainee_id,v_slot,v_end,v_availability,v_session.id)
         AND public.mock_call_is_user_available(v_eval.user_id,v_slot,v_end,NULL,v_session.id) THEN
        INSERT INTO public.booking_availability_blocks(user_id,start_at,end_at,reason,created_by)
        VALUES(v_session.trainee_id,v_slot,v_end,'Reserved: ProFox Mock Sales Call '||v_session.id::text,v_session.trainee_id)
        RETURNING id INTO v_trainee_block;
        INSERT INTO public.booking_availability_blocks(user_id,start_at,end_at,reason,created_by)
        VALUES(v_eval.user_id,v_slot,v_end,'Reserved: ProFox Mock Sales Call '||v_session.id::text,v_session.trainee_id)
        RETURNING id INTO v_evaluator_block;

        SELECT full_name,COALESCE(NULLIF(timezone,''),v_settings->>'defaultTimezone','UTC') INTO v_trainee_name,v_trainee_tz FROM public.user_profiles WHERE id=v_session.trainee_id;
        v_evaluator_name:=v_eval.full_name; v_evaluator_tz:=COALESCE(NULLIF(v_eval.timezone,''),v_settings->>'defaultTimezone','UTC');

        UPDATE public.mock_call_sessions
        SET evaluator_id=v_eval.user_id,scheduled_start_at=v_slot,scheduled_end_at=v_end,
            timezone=v_trainee_tz,meeting_url=COALESCE(v_eval.meeting_url,''),status='scheduled',
            assignment_attempts=assignment_attempts+1,evaluator_assigned_at=now(),
            trainee_block_id=v_trainee_block,evaluator_block_id=v_evaluator_block,updated_at=now()
        WHERE id=v_session.id RETURNING * INTO v_session;

        INSERT INTO public.mock_call_events(session_id,event_type,actor_user_id,event_data)
        VALUES(v_session.id,'auto_scheduled',NULL,jsonb_build_object('evaluatorId',v_eval.user_id,'startAt',v_slot,'endAt',v_end,'method','balanced_random'));

        v_payload:=jsonb_build_object('title','Mock Sales Call scheduled','message','Your live ProFox mock sales call is scheduled. Open the Academy for the correct private brief.','traineeName',v_trainee_name,'evaluatorName',v_evaluator_name,'meetingUrl',COALESCE(v_eval.meeting_url,''));
        PERFORM public.queue_mock_call_notice(v_session.trainee_id,'mock_call_scheduled_trainee',v_payload||jsonb_build_object('scheduledLocal',to_char(v_slot AT TIME ZONE v_trainee_tz,'Dy, DD Mon YYYY HH12:MI AM')||' '||v_trainee_tz),'mock-call:'||v_session.id||':scheduled:trainee',now(),'/admin/app/academy?tab=training');
        PERFORM public.queue_mock_call_notice(v_eval.user_id,'mock_call_scheduled_evaluator',v_payload||jsonb_build_object('scheduledLocal',to_char(v_slot AT TIME ZONE v_evaluator_tz,'Dy, DD Mon YYYY HH12:MI AM')||' '||v_evaluator_tz),'mock-call:'||v_session.id||':scheduled:evaluator',now(),'/sales/mock-call-evaluator');

        FOR v_reminder IN SELECT value::integer FROM jsonb_array_elements_text(COALESCE(v_settings->'reminderMinutes','[1440,60]'::jsonb))
        LOOP
          IF v_slot-make_interval(mins=>v_reminder)>now() THEN
            PERFORM public.queue_mock_call_notice(v_session.trainee_id,'mock_call_reminder_trainee',v_payload||jsonb_build_object('scheduledLocal',to_char(v_slot AT TIME ZONE v_trainee_tz,'Dy, DD Mon YYYY HH12:MI AM')||' '||v_trainee_tz),'mock-call:'||v_session.id||':reminder:'||v_reminder||':trainee',v_slot-make_interval(mins=>v_reminder),'/admin/app/academy?tab=training');
            PERFORM public.queue_mock_call_notice(v_eval.user_id,'mock_call_reminder_evaluator',v_payload||jsonb_build_object('scheduledLocal',to_char(v_slot AT TIME ZONE v_evaluator_tz,'Dy, DD Mon YYYY HH12:MI AM')||' '||v_evaluator_tz),'mock-call:'||v_session.id||':reminder:'||v_reminder||':evaluator',v_slot-make_interval(mins=>v_reminder),'/sales/mock-call-evaluator');
          END IF;
        END LOOP;

        RETURN jsonb_build_object('status','scheduled','sessionId',v_session.id,'evaluatorId',v_eval.user_id,'scheduledStartAt',v_slot,'scheduledEndAt',v_end,'meetingUrl',v_session.meeting_url);
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.mock_call_sessions
  SET assignment_attempts=assignment_attempts+1,
      status=CASE WHEN assignment_attempts+1>=v_max_attempts THEN 'needs_admin_attention' ELSE 'pending_assignment' END,
      evaluator_id=NULL,scheduled_start_at=NULL,scheduled_end_at=NULL,updated_at=now()
  WHERE id=v_session.id RETURNING * INTO v_session;
  INSERT INTO public.mock_call_events(session_id,event_type,event_data)
  VALUES(v_session.id,'automatic_assignment_pending',jsonb_build_object('attempt',v_session.assignment_attempts,'maxAttempts',v_max_attempts));
  RETURN jsonb_build_object('status',v_session.status,'sessionId',v_session.id,'reason','No eligible mutual slot is currently available. Automation will retry.');
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_mock_call_session(p_trainee_id uuid,p_retry boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_module public.training_modules%ROWTYPE;
  v_progress public.user_training_progress%ROWTYPE;
  v_scenario public.mock_call_scenarios%ROWTYPE;
  v_settings jsonb:=public.get_mock_call_automation_settings();
  v_attempt integer;
  v_rubric jsonb;
  v_critical jsonb;
  v_session public.mock_call_sessions%ROWTYPE;
  v_not_before timestamptz;
BEGIN
  IF p_trainee_id IS NULL THEN RAISE EXCEPTION 'Trainee is required.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE slug='mock-call-test' AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module 11 is unavailable.'; END IF;

  SELECT * INTO v_session FROM public.mock_call_sessions
  WHERE trainee_id=p_trainee_id AND status IN ('pending_assignment','scheduled','needs_admin_attention')
  ORDER BY attempt_no DESC LIMIT 1;
  IF FOUND THEN RETURN public.try_schedule_mock_call_session(v_session.id); END IF;

  SELECT COALESCE(max(attempt_no),0)+1 INTO v_attempt FROM public.mock_call_sessions WHERE trainee_id=p_trainee_id;
  SELECT * INTO v_scenario FROM public.mock_call_scenarios s
  WHERE s.active=true AND NOT EXISTS (SELECT 1 FROM public.mock_call_sessions used WHERE used.trainee_id=p_trainee_id AND used.scenario_id=s.id)
  ORDER BY random()*s.weight DESC LIMIT 1;
  IF NOT FOUND AND COALESCE((v_settings->>'scenarioReuseAfterAllSeen')::boolean,true) THEN
    SELECT * INTO v_scenario FROM public.mock_call_scenarios WHERE active=true ORDER BY random()*weight DESC LIMIT 1;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'No eligible Mock Sales Call scenario is available.'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'maxPoints',max_points,'sortOrder',sort_order) ORDER BY sort_order),'[]'::jsonb)
  INTO v_rubric FROM public.mock_call_rubric_items WHERE active=true;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'sortOrder',sort_order) ORDER BY sort_order),'[]'::jsonb)
  INTO v_critical FROM public.mock_call_critical_rules WHERE active=true;
  IF jsonb_array_length(v_rubric)=0 THEN RAISE EXCEPTION 'Mock call rubric is not configured.'; END IF;

  PERFORM set_config('profox.training_mock_call_rpc','1',true);
  SELECT * INTO v_progress FROM public.user_training_progress WHERE user_id=p_trainee_id AND module_id=v_module.id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_training_progress(user_id,module_id,status,progress_percent,attempts,updated_at)
    VALUES(p_trainee_id,v_module.id,'In Progress',10,v_attempt,now()) RETURNING * INTO v_progress;
  ELSE
    UPDATE public.user_training_progress SET status='In Progress',progress_percent=10,attempts=v_attempt,score=NULL,completed_at=NULL,reviewed_by=NULL,reviewed_at=NULL,review_status=NULL,updated_at=now()
    WHERE id=v_progress.id RETURNING * INTO v_progress;
  END IF;

  v_not_before:=CASE WHEN p_retry THEN now()+make_interval(hours=>GREATEST(COALESCE((v_settings->>'retryDelayHours')::integer,24),0)) ELSE now() END;
  INSERT INTO public.mock_call_sessions(
    trainee_id,module_id,progress_id,attempt_no,scenario_id,scenario_name_snapshot,scenario_version_snapshot,
    seller_brief_snapshot,evaluator_brief_snapshot,evaluator_instructions_snapshot,rubric_snapshot,critical_rules_snapshot,not_before_at,status
  ) VALUES(
    p_trainee_id,v_module.id,v_progress.id,v_attempt,v_scenario.id,v_scenario.name,v_scenario.version,
    v_scenario.seller_brief,v_scenario.evaluator_brief,v_scenario.evaluator_instructions,v_rubric,v_critical,v_not_before,'pending_assignment'
  ) RETURNING * INTO v_session;
  INSERT INTO public.mock_call_events(session_id,event_type,actor_user_id,event_data)
  VALUES(v_session.id,CASE WHEN p_retry THEN 'retry_session_created' ELSE 'session_created' END,auth.uid(),jsonb_build_object('attemptNo',v_attempt,'scenarioId',v_scenario.id,'scenarioVersion',v_scenario.version));
  RETURN public.try_schedule_mock_call_session(v_session.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_mock_call_automation_settings() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mock_call_is_user_available(uuid,timestamptz,timestamptz,jsonb,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.queue_mock_call_notice(uuid,text,jsonb,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.release_mock_call_reservations(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.try_schedule_mock_call_session(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_mock_call_session(uuid,boolean) FROM PUBLIC,anon,authenticated;

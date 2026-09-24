-- Module 10 completion -> Module 11 automated live assessment, trainee-safe views, evaluator workflow and secure scoring.

CREATE OR REPLACE FUNCTION public.complete_call_practice_and_schedule(
  p_progress_id uuid,
  p_availability jsonb,
  p_readiness_acknowledged boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_progress public.user_training_progress%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_state public.call_practice_state%ROWTYPE;
  v_settings jsonb:=public.get_mock_call_automation_settings();
  v_lesson_total integer;
  v_drill_total integer;
  v_rehearsal_count integer;
  v_rehearsal_required integer;
  v_days integer[];
  v_tz text;
  v_start time;
  v_end time;
  v_schedule jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF p_readiness_acknowledged IS NOT TRUE THEN RAISE EXCEPTION 'Confirm that the three full rehearsals are genuine practice before scheduling the live mock call.'; END IF;
  IF jsonb_typeof(p_availability)<>'object' THEN RAISE EXCEPTION 'Assessment availability is required.'; END IF;

  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id FOR UPDATE;
  IF NOT FOUND OR v_progress.user_id<>v_uid THEN RAISE EXCEPTION 'Call Practice progress not found.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND slug='call-practice' AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Call Practice module is unavailable.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.training_modules prior
    WHERE prior.active AND prior.required AND prior.sort_order<v_module.sort_order
      AND NOT EXISTS (SELECT 1 FROM public.user_training_progress pp WHERE pp.user_id=v_uid AND pp.module_id=prior.id AND pp.status IN ('Passed','Completed'))
  ) THEN RAISE EXCEPTION 'Complete every earlier required Academy module first.'; END IF;

  SELECT * INTO v_state FROM public.call_practice_state WHERE progress_id=v_progress.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Complete the Call Practice learning and practice sequence first.'; END IF;
  SELECT count(*) INTO v_lesson_total FROM public.training_lessons WHERE module_id=v_module.id AND active;
  IF cardinality(v_state.completed_lesson_ids)<v_lesson_total THEN RAISE EXCEPTION 'Complete all Module 10 lessons first.'; END IF;
  SELECT count(*) INTO v_drill_total FROM public.call_practice_drills WHERE active AND required;
  IF (SELECT count(*) FROM public.call_practice_drills d WHERE d.active AND d.required AND d.id=ANY(v_state.completed_drill_ids))<v_drill_total THEN RAISE EXCEPTION 'Complete all required Call Practice drills first.'; END IF;
  SELECT count(*) INTO v_rehearsal_count FROM jsonb_array_elements(v_state.rehearsals);
  v_rehearsal_required:=GREATEST(COALESCE((v_settings->>'fullRehearsalsRequired')::integer,3),1);
  IF v_rehearsal_count<v_rehearsal_required THEN RAISE EXCEPTION 'Complete all required full discovery rehearsals first.'; END IF;

  v_tz:=COALESCE(NULLIF(trim(p_availability->>'timezone'),''),NULLIF((SELECT timezone FROM public.user_profiles WHERE id=v_uid),''),NULLIF(v_settings->>'defaultTimezone',''),'UTC');
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=v_tz) THEN RAISE EXCEPTION 'Choose a valid IANA timezone for your assessment availability.'; END IF;
  IF jsonb_typeof(p_availability->'workingDays')<>'array' THEN RAISE EXCEPTION 'Choose at least one assessment day.'; END IF;
  SELECT array_agg(value::integer ORDER BY value::integer) INTO v_days FROM jsonb_array_elements_text(p_availability->'workingDays');
  IF COALESCE(cardinality(v_days),0)=0 OR EXISTS (SELECT 1 FROM unnest(v_days) d WHERE d<0 OR d>6) THEN RAISE EXCEPTION 'Assessment working days must use day numbers 0–6.'; END IF;
  BEGIN
    v_start:=(p_availability->>'workStart')::time;
    v_end:=(p_availability->>'workEnd')::time;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Assessment availability requires valid start and end times.';
  END;
  IF v_start IS NULL OR v_end IS NULL OR v_end<=v_start THEN RAISE EXCEPTION 'Assessment end time must be after start time.'; END IF;

  UPDATE public.call_practice_state
  SET assessment_availability=jsonb_build_object('timezone',v_tz,'workingDays',to_jsonb(v_days),'workStart',to_char(v_start,'HH24:MI'),'workEnd',to_char(v_end,'HH24:MI')),
      readiness_acknowledged=true,completed_at=COALESCE(completed_at,now()),updated_at=now()
  WHERE id=v_state.id;

  PERFORM set_config('profox.training_call_practice_rpc','1',true);
  UPDATE public.user_training_progress
  SET status='Completed',progress_percent=100,completed_at=COALESCE(completed_at,now()),updated_at=now()
  WHERE id=v_progress.id;

  v_schedule:=public.create_mock_call_session(v_uid,false);
  RETURN jsonb_build_object('completed',true,'module10Status','Completed','mockCall',v_schedule);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_mock_call_session(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_module public.training_modules%ROWTYPE;
  v_session public.mock_call_sessions%ROWTYPE;
  v_eval_name text;
  v_history jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE id=p_module_id AND slug='mock-call-test' AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mock Sales Call module is unavailable.'; END IF;

  SELECT * INTO v_session FROM public.mock_call_sessions WHERE trainee_id=v_uid AND module_id=v_module.id ORDER BY attempt_no DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('hasSession',false,'passingScore',COALESCE(v_module.passing_score,75));
  END IF;
  SELECT full_name INTO v_eval_name FROM public.user_profiles WHERE id=v_session.evaluator_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',h.id,'attemptNo',h.attempt_no,'status',h.status,'score',h.score,'feedback',h.evaluator_feedback,
    'scenarioName',h.scenario_name_snapshot,'scheduledStartAt',h.scheduled_start_at,'evaluatedAt',h.evaluated_at
  ) ORDER BY h.attempt_no DESC),'[]'::jsonb)
  INTO v_history FROM public.mock_call_sessions h WHERE h.trainee_id=v_uid AND h.module_id=v_module.id;

  RETURN jsonb_build_object(
    'hasSession',true,'id',v_session.id,'attemptNo',v_session.attempt_no,'status',v_session.status,
    'scenarioName',v_session.scenario_name_snapshot,'sellerBrief',v_session.seller_brief_snapshot,
    'evaluatorName',COALESCE(v_eval_name,''),'scheduledStartAt',v_session.scheduled_start_at,'scheduledEndAt',v_session.scheduled_end_at,
    'timezone',v_session.timezone,'meetingUrl',v_session.meeting_url,'score',v_session.score,'feedback',v_session.evaluator_feedback,
    'passingScore',COALESCE(v_module.passing_score,75),'history',v_history
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_mock_call_evaluator_queue()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.mock_call_evaluator_profiles WHERE user_id=v_uid AND enabled=true) THEN
    RAISE EXCEPTION 'Mock Call Evaluator access is not enabled for this account.';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',s.id,'attemptNo',s.attempt_no,'traineeId',s.trainee_id,'traineeName',p.full_name,
      'scenarioName',s.scenario_name_snapshot,'scheduledStartAt',s.scheduled_start_at,'scheduledEndAt',s.scheduled_end_at,
      'timezone',s.timezone,'meetingUrl',s.meeting_url,'status',s.status
    ) ORDER BY COALESCE(s.scheduled_start_at,s.created_at))
    FROM public.mock_call_sessions s JOIN public.user_profiles p ON p.id=s.trainee_id
    WHERE (public.is_admin() OR s.evaluator_id=v_uid) AND s.status IN ('scheduled','needs_admin_attention')
  ),'[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_mock_call_evaluator_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_session public.mock_call_sessions%ROWTYPE;
  v_trainee_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_session FROM public.mock_call_sessions WHERE id=p_session_id;
  IF NOT FOUND OR (NOT public.is_admin() AND v_session.evaluator_id IS DISTINCT FROM v_uid) THEN RAISE EXCEPTION 'This mock-call scenario is not assigned to you.'; END IF;
  SELECT full_name INTO v_trainee_name FROM public.user_profiles WHERE id=v_session.trainee_id;
  RETURN jsonb_build_object(
    'id',v_session.id,'attemptNo',v_session.attempt_no,'traineeId',v_session.trainee_id,'traineeName',v_trainee_name,
    'scenarioName',v_session.scenario_name_snapshot,'scenarioVersion',v_session.scenario_version_snapshot,
    'sellerBrief',v_session.seller_brief_snapshot,'evaluatorBrief',v_session.evaluator_brief_snapshot,
    'evaluatorInstructions',v_session.evaluator_instructions_snapshot,'rubric',v_session.rubric_snapshot,
    'criticalRules',v_session.critical_rules_snapshot,'scheduledStartAt',v_session.scheduled_start_at,'scheduledEndAt',v_session.scheduled_end_at,
    'timezone',v_session.timezone,'meetingUrl',v_session.meeting_url,'status',v_session.status,'score',v_session.score,'feedback',v_session.evaluator_feedback
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_mock_call_meeting_link(p_session_id uuid,p_meeting_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_session public.mock_call_sessions%ROWTYPE;
  v_url text:=trim(COALESCE(p_meeting_url,''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_session FROM public.mock_call_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR (NOT public.is_admin() AND v_session.evaluator_id IS DISTINCT FROM v_uid) THEN RAISE EXCEPTION 'Mock call assignment not found.'; END IF;
  IF v_url<>'' AND v_url!~* '^https?://' THEN RAISE EXCEPTION 'Meeting link must begin with http:// or https://.'; END IF;
  UPDATE public.mock_call_sessions SET meeting_url=v_url,updated_at=now() WHERE id=v_session.id RETURNING * INTO v_session;
  IF v_session.evaluator_id IS NOT NULL THEN UPDATE public.mock_call_evaluator_profiles SET meeting_url=v_url,updated_at=now() WHERE user_id=v_session.evaluator_id; END IF;
  INSERT INTO public.mock_call_events(session_id,event_type,actor_user_id,event_data) VALUES(v_session.id,'meeting_link_updated',v_uid,jsonb_build_object('hasLink',v_url<>''));
  INSERT INTO public.in_app_notifications(recipient_user_id,notification_type,title,message,action_url,dedupe_key)
  VALUES(v_session.trainee_id,'mock_call','Mock-call meeting link updated','The evaluator updated the meeting link for your scheduled mock sales call.','/admin/app/academy?tab=training','mock-call:'||v_session.id||':link:'||md5(v_url))
  ON CONFLICT(dedupe_key) DO NOTHING;
  RETURN jsonb_build_object('id',v_session.id,'meetingUrl',v_url);
END;
$function$;

CREATE OR REPLACE FUNCTION public.decline_mock_call_assignment(p_session_id uuid,p_reason text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_session public.mock_call_sessions%ROWTYPE;
  v_old_evaluator uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_session FROM public.mock_call_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR (NOT public.is_admin() AND v_session.evaluator_id IS DISTINCT FROM v_uid) THEN RAISE EXCEPTION 'Mock call assignment not found.'; END IF;
  IF v_session.status<>'scheduled' OR COALESCE(v_session.scheduled_start_at,now())<=now() THEN RAISE EXCEPTION 'Only a future scheduled mock call can be declined.'; END IF;
  v_old_evaluator:=v_session.evaluator_id;
  PERFORM public.release_mock_call_reservations(v_session.id);
  UPDATE public.notification_outbox SET status='Cancelled',updated_at=now() WHERE dedupe_key LIKE 'mock-call:'||v_session.id||':%' AND status IN ('Pending','Retry');
  INSERT INTO public.mock_call_events(session_id,event_type,actor_user_id,event_data)
  VALUES(v_session.id,'evaluator_declined',v_uid,jsonb_build_object('evaluatorId',v_old_evaluator,'reason',left(COALESCE(p_reason,''),2000)));
  UPDATE public.mock_call_sessions
  SET status='evaluator_declined',evaluator_id=NULL,scheduled_start_at=NULL,scheduled_end_at=NULL,meeting_url='',evaluator_assigned_at=NULL,updated_at=now()
  WHERE id=v_session.id;
  v_result:=public.try_schedule_mock_call_session(v_session.id);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_mock_call_evaluation(
  p_session_id uuid,
  p_rubric_scores jsonb,
  p_critical_rule_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_feedback text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_session public.mock_call_sessions%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_item jsonb;
  v_expected integer;
  v_supplied integer;
  v_points integer;
  v_max integer:=0;
  v_earned integer:=0;
  v_score integer;
  v_failures jsonb:='[]'::jsonb;
  v_failure_count integer;
  v_pass boolean;
  v_progress_status text;
  v_retry jsonb;
  v_retry_session public.mock_call_sessions%ROWTYPE;
  v_trainee_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_session FROM public.mock_call_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR (NOT public.is_admin() AND v_session.evaluator_id IS DISTINCT FROM v_uid) THEN RAISE EXCEPTION 'This mock call is not assigned to you.'; END IF;
  IF v_session.status NOT IN ('scheduled','needs_admin_attention') THEN RAISE EXCEPTION 'This mock call is not awaiting evaluation.'; END IF;
  IF v_session.scheduled_start_at IS NULL OR now()<v_session.scheduled_start_at THEN RAISE EXCEPTION 'The live mock call must begin before an evaluation can be submitted.'; END IF;
  IF trim(COALESCE(p_feedback,''))='' THEN RAISE EXCEPTION 'Evaluator coaching feedback is required.'; END IF;
  IF jsonb_typeof(p_rubric_scores)<>'object' THEN RAISE EXCEPTION 'Complete every scoring-rubric item.'; END IF;
  v_expected:=jsonb_array_length(v_session.rubric_snapshot);
  SELECT count(*) INTO v_supplied FROM jsonb_each(p_rubric_scores);
  IF v_expected=0 OR v_supplied<>v_expected THEN RAISE EXCEPTION 'Complete every scoring-rubric item.'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_session.rubric_snapshot)
  LOOP
    IF NOT (p_rubric_scores ? (v_item->>'id')) OR (p_rubric_scores->>(v_item->>'id'))!~'^\d+$' THEN RAISE EXCEPTION 'Each rubric item requires a whole-number score.'; END IF;
    v_points:=(p_rubric_scores->>(v_item->>'id'))::integer;
    IF v_points<0 OR v_points>(v_item->>'maxPoints')::integer THEN RAISE EXCEPTION 'Rubric score for % is outside its allowed range.',v_item->>'title'; END IF;
    v_earned:=v_earned+v_points;
    v_max:=v_max+(v_item->>'maxPoints')::integer;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_rubric_scores) k WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_session.rubric_snapshot) r WHERE r->>'id'=k)) THEN RAISE EXCEPTION 'Unexpected rubric item supplied.'; END IF;

  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_critical_rule_ids,ARRAY[]::uuid[])) supplied(id) WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_session.critical_rules_snapshot) r WHERE r->>'id'=supplied.id::text)) THEN RAISE EXCEPTION 'Unknown critical-failure rule supplied.'; END IF;
  SELECT COALESCE(jsonb_agg(r),'[]'::jsonb) INTO v_failures FROM jsonb_array_elements(v_session.critical_rules_snapshot) r WHERE (r->>'id')::uuid=ANY(COALESCE(p_critical_rule_ids,ARRAY[]::uuid[]));
  v_failure_count:=jsonb_array_length(v_failures);
  v_score:=CASE WHEN v_max>0 THEN round((v_earned::numeric*100)/v_max)::integer ELSE 0 END;
  SELECT * INTO v_module FROM public.training_modules WHERE id=v_session.module_id AND slug='mock-call-test';
  IF NOT FOUND THEN RAISE EXCEPTION 'Mock Sales Call module is unavailable.'; END IF;
  v_pass:=v_score>=COALESCE(v_module.passing_score,75) AND v_failure_count=0;
  v_progress_status:=CASE WHEN v_pass THEN 'Passed' ELSE 'Retry Required' END;

  UPDATE public.mock_call_sessions
  SET status=CASE WHEN v_pass THEN 'passed' ELSE 'retry_required' END,score=v_score,rubric_scores=p_rubric_scores,
      critical_failures=v_failures,evaluator_feedback=left(trim(p_feedback),8000),evaluated_at=now(),updated_at=now()
  WHERE id=v_session.id RETURNING * INTO v_session;

  PERFORM set_config('profox.training_mock_call_rpc','1',true);
  UPDATE public.user_training_progress
  SET status=v_progress_status,progress_percent=100,score=v_score,completed_at=CASE WHEN v_pass THEN now() ELSE NULL END,
      reviewed_by=v_uid,reviewed_at=now(),review_status=v_progress_status,feedback=left(trim(p_feedback),8000),updated_at=now()
  WHERE id=v_session.progress_id;

  INSERT INTO public.training_reviews(progress_id,reviewer_id,status,feedback,score)
  VALUES(v_session.progress_id,v_uid,v_progress_status,left(trim(p_feedback),8000),v_score);
  INSERT INTO public.training_assignments(user_id,module_id,progress_id,submission_data)
  VALUES(v_session.trainee_id,v_session.module_id,v_session.progress_id,jsonb_build_object(
    'type','mock_sales_call_evaluation_v2','sessionId',v_session.id,'attemptNo',v_session.attempt_no,'score',v_score,
    'passed',v_pass,'rubricScores',p_rubric_scores,'criticalFailures',v_failures,'feedback',left(trim(p_feedback),8000),'reviewerId',v_uid,'evaluatedAt',now()
  ));
  INSERT INTO public.mock_call_events(session_id,event_type,actor_user_id,event_data)
  VALUES(v_session.id,CASE WHEN v_pass THEN 'evaluation_passed' ELSE 'evaluation_retry_required' END,v_uid,jsonb_build_object('score',v_score,'criticalFailureCount',v_failure_count));
  PERFORM public.release_mock_call_reservations(v_session.id);
  SELECT full_name INTO v_trainee_name FROM public.user_profiles WHERE id=v_session.trainee_id;

  IF v_pass THEN
    PERFORM public.queue_mock_call_notice(v_session.trainee_id,'mock_call_passed',jsonb_build_object('title','Mock Sales Call passed','message','You passed the live ProFox mock sales call and may continue to the next Academy module.','traineeName',v_trainee_name,'score',v_score),'mock-call:'||v_session.id||':passed',now(),'/admin/app/academy?tab=training');
    RETURN jsonb_build_object('passed',true,'score',v_score,'criticalFailures',0,'status','Passed');
  END IF;

  v_retry:=public.create_mock_call_session(v_session.trainee_id,true);
  IF v_retry->>'status'='scheduled' THEN
    SELECT * INTO v_retry_session FROM public.mock_call_sessions WHERE id=(v_retry->>'sessionId')::uuid;
    UPDATE public.notification_outbox SET status='Cancelled',updated_at=now() WHERE dedupe_key='mock-call:'||v_retry_session.id||':scheduled:trainee' AND status IN ('Pending','Retry');
    PERFORM public.queue_mock_call_notice(v_session.trainee_id,'mock_call_retry_trainee',jsonb_build_object(
      'title','Mock Sales Call retry scheduled','message','Review your evaluator coaching. A fresh scenario and live retry have been scheduled automatically.','traineeName',v_trainee_name,
      'scheduledLocal',to_char(v_retry_session.scheduled_start_at AT TIME ZONE v_retry_session.timezone,'Dy, DD Mon YYYY HH12:MI AM')||' '||v_retry_session.timezone,
      'meetingUrl',v_retry_session.meeting_url
    ),'mock-call:'||v_retry_session.id||':retry:trainee',now(),'/admin/app/academy?tab=training');
  END IF;
  RETURN jsonb_build_object('passed',false,'score',v_score,'criticalFailures',v_failure_count,'status','Retry Required','nextMockCall',v_retry);
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_call_practice_and_schedule(uuid,jsonb,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_my_mock_call_session(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_my_mock_call_evaluator_queue() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_mock_call_evaluator_session(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_mock_call_meeting_link(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.decline_mock_call_assignment(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_mock_call_evaluation(uuid,jsonb,uuid[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_call_practice_and_schedule(uuid,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_mock_call_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_mock_call_evaluator_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mock_call_evaluator_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_mock_call_meeting_link(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_mock_call_assignment(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_mock_call_evaluation(uuid,jsonb,uuid[],text) TO authenticated;

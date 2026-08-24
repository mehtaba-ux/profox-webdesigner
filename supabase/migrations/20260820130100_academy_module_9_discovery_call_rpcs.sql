-- Sales Academy Module 9 — secure learner workflow.

CREATE OR REPLACE FUNCTION public.get_discovery_call_training_config(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_user uuid:=auth.uid();
  v_module public.training_modules%ROWTYPE;
  v_progress public.user_training_progress%ROWTYPE;
  v_state public.discovery_call_training_state%ROWTYPE;
  v_lesson_count integer:=0;
  v_questions jsonb:='[]'::jsonb;
  v_acknowledgements jsonb:='[]'::jsonb;
  v_latest jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;

  SELECT * INTO v_module FROM public.training_modules
  WHERE id=p_module_id AND slug='discovery-script' AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Discovery / Call Script module not found.'; END IF;
  IF NOT public.can_access_sales_academy_module(p_module_id) THEN RAISE EXCEPTION 'Training module access denied.'; END IF;

  SELECT * INTO v_progress FROM public.user_training_progress
  WHERE user_id=v_user AND module_id=p_module_id;

  IF FOUND THEN
    SELECT * INTO v_state FROM public.discovery_call_training_state WHERE progress_id=v_progress.id;
    SELECT submission_data INTO v_latest
    FROM public.training_assignments
    WHERE user_id=v_user AND module_id=p_module_id AND progress_id=v_progress.id
      AND submission_data->>'type'='discovery_call_assessment_v1'
    ORDER BY created_at DESC,id DESC LIMIT 1;
  END IF;

  SELECT count(*)::int INTO v_lesson_count FROM public.training_lessons
  WHERE module_id=p_module_id AND active=true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',q.id,'prompt',q.prompt,'options',q.options,'sortOrder',q.sort_order,
    'section',q.assessment_section,'caseKey',q.case_key
  ) ORDER BY q.sort_order),'[]'::jsonb)
  INTO v_questions
  FROM public.training_assessment_questions q
  WHERE q.module_id=p_module_id AND q.active=true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',a.id,'statement',a.statement,'sortOrder',a.sort_order,'required',a.required
  ) ORDER BY a.sort_order),'[]'::jsonb)
  INTO v_acknowledgements
  FROM public.training_acknowledgements a
  WHERE a.module_id=p_module_id AND a.active=true;

  RETURN jsonb_build_object(
    'framework','CURRENT → GAP → IMPACT → OUTCOME → WHY NOW → DECISION → FIT → NEXT STEP',
    'passingScore',COALESCE(v_module.passing_score,85),
    'approvalScope','onboarding_only',
    'futureApprovalRequired',false,
    'lessonCount',v_lesson_count,
    'lessonsCompleted',COALESCE(v_state.lessons_completed,0),
    'questions',v_questions,
    'acknowledgements',v_acknowledgements,
    'latestAttempt',v_latest,
    'coachingBenchmarks',jsonb_build_object(
      'targetedQuestions','11–14 reference',
      'problemFocus','3–4 meaningful',
      'talkListen','≈46% / 54%',
      'note','Coaching references only; never automatic pass/fail quotas.'
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_discovery_call_lesson(p_progress_id uuid,p_lesson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_progress public.user_training_progress%ROWTYPE;
  v_state public.discovery_call_training_state%ROWTYPE;
  v_next uuid;
  v_count integer;
  v_done integer;
  v_percent integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_progress FROM public.user_training_progress
  WHERE id=p_progress_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training progress not found.'; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=v_progress.module_id AND slug='discovery-script' AND active=true)
     OR NOT public.can_access_sales_academy_module(v_progress.module_id) THEN
    RAISE EXCEPTION 'Discovery training access denied.';
  END IF;

  IF v_progress.status IN ('Passed','Completed') THEN RETURN jsonb_build_object('complete',true,'certified',true); END IF;

  INSERT INTO public.discovery_call_training_state(progress_id,user_id,module_id)
  VALUES(v_progress.id,auth.uid(),v_progress.module_id)
  ON CONFLICT(progress_id) DO NOTHING;

  SELECT * INTO v_state FROM public.discovery_call_training_state WHERE progress_id=v_progress.id FOR UPDATE;
  SELECT count(*)::int INTO v_count FROM public.training_lessons WHERE module_id=v_progress.module_id AND active=true;
  IF v_count=0 THEN RAISE EXCEPTION 'Discovery lessons are missing.'; END IF;

  SELECT id INTO v_next FROM public.training_lessons
  WHERE module_id=v_progress.module_id AND active=true
  ORDER BY sort_order,id OFFSET v_state.lessons_completed LIMIT 1;

  IF v_next IS NULL THEN RETURN jsonb_build_object('lessonsCompleted',v_state.lessons_completed,'lessonCount',v_count,'complete',true); END IF;
  IF v_next<>p_lesson_id THEN RAISE EXCEPTION 'Complete Discovery lessons in order.'; END IF;

  v_done:=LEAST(v_state.lessons_completed+1,v_count);
  v_percent:=LEAST(70,round((v_done::numeric/GREATEST(v_count,1))*70)::int);

  UPDATE public.discovery_call_training_state SET lessons_completed=v_done,updated_at=now() WHERE progress_id=v_progress.id;
  UPDATE public.user_training_progress
  SET status='In Progress',progress_percent=GREATEST(COALESCE(progress_percent,0),v_percent),updated_at=now()
  WHERE id=v_progress.id;

  RETURN jsonb_build_object('lessonsCompleted',v_done,'lessonCount',v_count,'complete',v_done>=v_count,'progressPercent',v_percent);
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_discovery_call_assessment(
  p_progress_id uuid,
  p_answers integer[],
  p_acknowledgement_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_progress public.user_training_progress%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_state public.discovery_call_training_state%ROWTYPE;
  v_question public.training_assessment_questions%ROWTYPE;
  v_question_count integer:=0;
  v_lesson_count integer:=0;
  v_required_ack_count integer:=0;
  v_confirmed_ack_count integer:=0;
  v_missing_prior integer:=0;
  v_index integer:=0;
  v_correct integer:=0;
  v_critical_misses integer:=0;
  v_score integer:=0;
  v_passed boolean:=false;
  v_status text;
  v_feedback jsonb:='[]'::jsonb;
  v_event_time timestamptz:=clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;

  SELECT * INTO v_progress FROM public.user_training_progress
  WHERE id=p_progress_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training progress not found.'; END IF;

  SELECT * INTO v_module FROM public.training_modules
  WHERE id=v_progress.module_id AND slug='discovery-script' AND active=true;
  IF NOT FOUND OR NOT public.can_access_sales_academy_module(v_progress.module_id) THEN
    RAISE EXCEPTION 'Discovery training access denied.';
  END IF;
  IF v_module.requires_admin_review THEN RAISE EXCEPTION 'Module 9 uses server scoring; live performance review belongs to Module 11.'; END IF;
  IF v_progress.status IN ('Passed','Completed') THEN RAISE EXCEPTION 'Module 9 is already certified.'; END IF;

  SELECT count(*) INTO v_missing_prior
  FROM public.training_modules m
  WHERE m.active=true AND m.required=true AND m.sort_order<v_module.sort_order
    AND NOT EXISTS(
      SELECT 1 FROM public.user_training_progress p
      WHERE p.user_id=auth.uid() AND p.module_id=m.id AND p.status IN ('Passed','Completed')
    );
  IF v_missing_prior>0 THEN RAISE EXCEPTION 'Complete all previous required Academy modules before submitting Module 9.'; END IF;

  SELECT * INTO v_state FROM public.discovery_call_training_state WHERE progress_id=v_progress.id FOR UPDATE;
  SELECT count(*)::int INTO v_lesson_count FROM public.training_lessons WHERE module_id=v_module.id AND active=true;
  IF v_lesson_count=0 OR COALESCE(v_state.lessons_completed,0)<v_lesson_count THEN
    RAISE EXCEPTION 'Complete all Module 9 lessons before the discovery assessment.';
  END IF;

  SELECT count(*)::int INTO v_question_count FROM public.training_assessment_questions
  WHERE module_id=v_module.id AND active=true;
  IF v_question_count=0 THEN RAISE EXCEPTION 'No active Module 9 assessment questions are configured.'; END IF;
  IF COALESCE(array_length(p_answers,1),0)<>v_question_count THEN RAISE EXCEPTION 'Exactly % assessment answers are required.',v_question_count; END IF;

  SELECT count(*)::int INTO v_required_ack_count FROM public.training_acknowledgements
  WHERE module_id=v_module.id AND active=true AND required=true;
  SELECT count(DISTINCT a.id)::int INTO v_confirmed_ack_count
  FROM public.training_acknowledgements a
  JOIN unnest(COALESCE(p_acknowledgement_ids,ARRAY[]::uuid[])) supplied(id) ON supplied.id=a.id
  WHERE a.module_id=v_module.id AND a.active=true AND a.required=true;
  IF v_confirmed_ack_count<>v_required_ack_count THEN RAISE EXCEPTION 'Confirm every required Discovery acknowledgement before submitting.'; END IF;

  FOR v_question IN
    SELECT * FROM public.training_assessment_questions
    WHERE module_id=v_module.id AND active=true ORDER BY sort_order,id
  LOOP
    v_index:=v_index+1;
    IF p_answers[v_index]=v_question.correct_index THEN
      v_correct:=v_correct+1;
    ELSIF COALESCE(v_question.critical,false) THEN
      v_critical_misses:=v_critical_misses+1;
    END IF;
    v_feedback:=v_feedback || jsonb_build_array(jsonb_build_object(
      'questionId',v_question.id,'sortOrder',v_question.sort_order,
      'correct',p_answers[v_index]=v_question.correct_index,
      'criticalMiss',COALESCE(v_question.critical,false) AND p_answers[v_index]<>v_question.correct_index,
      'explanation',v_question.explanation
    ));
  END LOOP;

  v_score:=round((v_correct::numeric*100)/v_question_count)::integer;
  v_passed:=v_score>=COALESCE(v_module.passing_score,85) AND v_critical_misses=0;
  v_status:=CASE WHEN v_passed THEN 'Passed' ELSE 'Retry Required' END;

  PERFORM set_config('profox.training_quiz_rpc','1',true);
  PERFORM set_config('profox.training_discovery_call_rpc','1',true);

  INSERT INTO public.training_assignments(user_id,module_id,progress_id,submission_data,created_at,updated_at)
  VALUES(auth.uid(),v_module.id,v_progress.id,jsonb_build_object(
    'type','discovery_call_assessment_v1','answers',to_jsonb(p_answers),
    'acknowledgementIds',to_jsonb(COALESCE(p_acknowledgement_ids,ARRAY[]::uuid[])),
    'score',v_score,'passed',v_passed,'criticalMisses',v_critical_misses,
    'feedback',v_feedback,'submittedAt',v_event_time,
    'approvalScope','onboarding_only','futureApprovalRequired',false
  ),v_event_time,v_event_time);

  UPDATE public.user_training_progress
  SET status=v_status,score=v_score,progress_percent=CASE WHEN v_passed THEN 100 ELSE 75 END,
      completed_at=CASE WHEN v_passed THEN v_event_time ELSE NULL END,updated_at=v_event_time
  WHERE id=v_progress.id;

  PERFORM set_config('profox.training_discovery_call_rpc','',true);
  PERFORM set_config('profox.training_quiz_rpc','',true);

  RETURN jsonb_build_object('score',v_score,'passed',v_passed,'status',v_status,
    'passingScore',COALESCE(v_module.passing_score,85),'criticalMisses',v_critical_misses,
    'feedback',v_feedback,'approvalScope','onboarding_only','futureApprovalRequired',false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('profox.training_discovery_call_rpc','',true);
  PERFORM set_config('profox.training_quiz_rpc','',true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_discovery_call_training_config(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.complete_discovery_call_lesson(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_discovery_call_assessment(uuid,integer[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_discovery_call_training_config(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_discovery_call_lesson(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_discovery_call_assessment(uuid,integer[],uuid[]) TO authenticated;

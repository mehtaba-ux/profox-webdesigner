-- Module 10 secure lesson, drill and rehearsal workflow.

CREATE OR REPLACE FUNCTION public.complete_call_practice_lesson(p_progress_id uuid,p_lesson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_progress public.user_training_progress%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_lesson_order integer;
  v_next_order integer;
  v_state public.call_practice_state%ROWTYPE;
  v_total integer;
  v_done integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id FOR UPDATE;
  IF NOT FOUND OR v_progress.user_id<>v_uid THEN RAISE EXCEPTION 'Invalid Call Practice progress.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND slug='call-practice' AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid Call Practice module.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.training_modules prior
    WHERE prior.active AND prior.required AND prior.sort_order<v_module.sort_order
      AND NOT EXISTS (SELECT 1 FROM public.user_training_progress pp WHERE pp.user_id=v_uid AND pp.module_id=prior.id AND pp.status IN ('Passed','Completed'))
  ) THEN RAISE EXCEPTION 'Complete all required earlier Academy modules first.'; END IF;
  SELECT sort_order INTO v_lesson_order FROM public.training_lessons WHERE id=p_lesson_id AND module_id=v_module.id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson not found.'; END IF;
  INSERT INTO public.call_practice_state(user_id,progress_id,module_id) VALUES(v_uid,v_progress.id,v_module.id)
  ON CONFLICT (progress_id) DO NOTHING;
  SELECT * INTO v_state FROM public.call_practice_state WHERE progress_id=v_progress.id FOR UPDATE;
  IF p_lesson_id=ANY(v_state.completed_lesson_ids) THEN RETURN jsonb_build_object('lessonsCompleted',cardinality(v_state.completed_lesson_ids)); END IF;
  SELECT min(l.sort_order) INTO v_next_order FROM public.training_lessons l WHERE l.module_id=v_module.id AND l.active AND NOT (l.id=ANY(v_state.completed_lesson_ids));
  IF v_lesson_order IS DISTINCT FROM v_next_order THEN RAISE EXCEPTION 'Complete Call Practice lessons in sequence.'; END IF;
  UPDATE public.call_practice_state SET completed_lesson_ids=array_append(completed_lesson_ids,p_lesson_id),updated_at=now() WHERE id=v_state.id RETURNING * INTO v_state;
  SELECT count(*) INTO v_total FROM public.training_lessons WHERE module_id=v_module.id AND active;
  v_done:=cardinality(v_state.completed_lesson_ids);
  PERFORM set_config('profox.training_call_practice_rpc','1',true);
  UPDATE public.user_training_progress SET status='In Progress',progress_percent=LEAST(50,round((v_done::numeric/GREATEST(v_total,1))*50)::integer),updated_at=now() WHERE id=v_progress.id;
  RETURN jsonb_build_object('lessonsCompleted',v_done,'lessonCount',v_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_call_practice_drill(p_progress_id uuid,p_drill_id uuid,p_reflection text DEFAULT '')
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
  v_lesson_total integer;
  v_drill_total integer;
  v_drill_done integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id FOR UPDATE;
  IF NOT FOUND OR v_progress.user_id<>v_uid THEN RAISE EXCEPTION 'Invalid Call Practice progress.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND slug='call-practice' AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid Call Practice module.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.call_practice_drills WHERE id=p_drill_id AND active) THEN RAISE EXCEPTION 'Practice drill not found.'; END IF;
  INSERT INTO public.call_practice_state(user_id,progress_id,module_id) VALUES(v_uid,v_progress.id,v_module.id) ON CONFLICT(progress_id) DO NOTHING;
  SELECT * INTO v_state FROM public.call_practice_state WHERE progress_id=v_progress.id FOR UPDATE;
  SELECT count(*) INTO v_lesson_total FROM public.training_lessons WHERE module_id=v_module.id AND active;
  IF cardinality(v_state.completed_lesson_ids)<v_lesson_total THEN RAISE EXCEPTION 'Complete all Call Practice lessons before recording required drills.'; END IF;
  UPDATE public.call_practice_state
  SET completed_drill_ids=CASE WHEN p_drill_id=ANY(completed_drill_ids) THEN completed_drill_ids ELSE array_append(completed_drill_ids,p_drill_id) END,
      drill_reflections=jsonb_set(drill_reflections,ARRAY[p_drill_id::text],to_jsonb(left(COALESCE(p_reflection,''),2000)),true),updated_at=now()
  WHERE id=v_state.id RETURNING * INTO v_state;
  SELECT count(*) INTO v_drill_total FROM public.call_practice_drills WHERE active AND required;
  SELECT count(*) INTO v_drill_done FROM public.call_practice_drills d WHERE d.active AND d.required AND d.id=ANY(v_state.completed_drill_ids);
  PERFORM set_config('profox.training_call_practice_rpc','1',true);
  UPDATE public.user_training_progress SET progress_percent=LEAST(75,50+round((v_drill_done::numeric/GREATEST(v_drill_total,1))*25)::integer),updated_at=now() WHERE id=v_progress.id;
  RETURN jsonb_build_object('drillsCompleted',v_drill_done,'requiredDrills',v_drill_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_call_practice_rehearsal(p_progress_id uuid,p_rehearsal_no integer,p_scores jsonb,p_reflection text DEFAULT '')
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
  v_settings jsonb;
  v_required integer;
  v_score integer:=0;
  v_clean jsonb;
  v_rehearsals jsonb;
  v_count integer;
  v_score_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id FOR UPDATE;
  IF NOT FOUND OR v_progress.user_id<>v_uid THEN RAISE EXCEPTION 'Invalid Call Practice progress.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND slug='call-practice' AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid Call Practice module.'; END IF;
  SELECT * INTO v_state FROM public.call_practice_state WHERE progress_id=v_progress.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Complete the Call Practice lessons and drills first.'; END IF;
  IF EXISTS (SELECT 1 FROM public.training_lessons l WHERE l.module_id=v_module.id AND l.active AND NOT (l.id=ANY(v_state.completed_lesson_ids))) THEN RAISE EXCEPTION 'Complete all Call Practice lessons first.'; END IF;
  IF EXISTS (SELECT 1 FROM public.call_practice_drills d WHERE d.active AND d.required AND NOT (d.id=ANY(v_state.completed_drill_ids))) THEN RAISE EXCEPTION 'Complete all required practice drills first.'; END IF;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_settings FROM public.system_configuration WHERE config_key='mock_call_automation_settings';
  v_required:=COALESCE((v_settings->>'fullRehearsalsRequired')::integer,3);
  IF p_rehearsal_no<1 OR p_rehearsal_no>v_required THEN RAISE EXCEPTION 'Invalid rehearsal number.'; END IF;
  IF jsonb_typeof(p_scores)<>'object' THEN RAISE EXCEPTION 'Self-score all 10 coaching areas.'; END IF;
  SELECT count(*) INTO v_score_count FROM jsonb_each(p_scores);
  IF v_score_count<>10 THEN RAISE EXCEPTION 'Self-score all 10 coaching areas.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(p_scores) e WHERE e.value !~ '^[0-2]$') THEN RAISE EXCEPTION 'Each self-score must be 0, 1 or 2.'; END IF;
  SELECT COALESCE(sum(value::integer),0) INTO v_score FROM jsonb_each_text(p_scores);
  v_clean:=jsonb_build_object('rehearsalNo',p_rehearsal_no,'score',v_score,'scores',p_scores,'reflection',left(COALESCE(p_reflection,''),3000),'submittedAt',now());
  SELECT COALESCE(jsonb_agg(value ORDER BY (value->>'rehearsalNo')::integer),'[]'::jsonb) INTO v_rehearsals FROM jsonb_array_elements(v_state.rehearsals) WHERE COALESCE((value->>'rehearsalNo')::integer,0)<>p_rehearsal_no;
  v_rehearsals:=v_rehearsals||jsonb_build_array(v_clean);
  UPDATE public.call_practice_state SET rehearsals=v_rehearsals,updated_at=now() WHERE id=v_state.id RETURNING * INTO v_state;
  SELECT count(*) INTO v_count FROM jsonb_array_elements(v_rehearsals);
  PERFORM set_config('profox.training_call_practice_rpc','1',true);
  UPDATE public.user_training_progress SET progress_percent=LEAST(95,75+round((v_count::numeric/GREATEST(v_required,1))*20)::integer),updated_at=now() WHERE id=v_progress.id;
  RETURN jsonb_build_object('rehearsalsCompleted',v_count,'rehearsalsRequired',v_required,'selfScore',v_score,'readinessBenchmark',COALESCE((v_settings->>'selfScoreReadinessBenchmark')::integer,16));
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_call_practice_lesson(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.complete_call_practice_drill(uuid,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_call_practice_rehearsal(uuid,integer,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_call_practice_lesson(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_call_practice_drill(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_call_practice_rehearsal(uuid,integer,jsonb,text) TO authenticated;

-- Sales Academy Module 6 — secure learner progression, one-time Loom certification and Admin rubric review.

CREATE OR REPLACE FUNCTION public.get_loom_outreach_training_config(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE
  v_user uuid:=auth.uid();
  v_cfg public.loom_outreach_training_config%ROWTYPE;
  v_progress public.user_training_progress%ROWTYPE;
  v_state public.loom_outreach_training_state%ROWTYPE;
  v_lesson_count integer:=0;
  v_latest jsonb;
  v_review jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.can_access_sales_academy_module(p_module_id) THEN RAISE EXCEPTION 'Training module access denied.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=p_module_id AND slug='loom-outreach' AND active=true) THEN
    RAISE EXCEPTION 'Personalized Loom Outreach module not found.';
  END IF;

  SELECT * INTO v_cfg FROM public.loom_outreach_training_config WHERE module_id=p_module_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Personalized Loom Outreach configuration is missing.'; END IF;

  SELECT * INTO v_progress FROM public.user_training_progress WHERE user_id=v_user AND module_id=p_module_id;
  IF FOUND THEN
    SELECT * INTO v_state FROM public.loom_outreach_training_state WHERE progress_id=v_progress.id;
    SELECT submission_data INTO v_latest
    FROM public.training_assignments
    WHERE user_id=v_user AND module_id=p_module_id AND progress_id=v_progress.id
    ORDER BY created_at DESC,id DESC LIMIT 1;

    SELECT jsonb_build_object(
      'totalScore',r.total_score,
      'criticalFailures',r.critical_failures,
      'status',r.status,
      'feedback',r.feedback,
      'createdAt',r.created_at
    ) INTO v_review
    FROM public.loom_outreach_review_details r
    WHERE r.progress_id=v_progress.id
    ORDER BY r.created_at DESC,r.id DESC LIMIT 1;
  END IF;

  SELECT count(*)::int INTO v_lesson_count FROM public.training_lessons WHERE module_id=p_module_id AND active=true;

  RETURN jsonb_build_object(
    'minDurationSeconds',v_cfg.min_duration_seconds,
    'targetDurationMin',v_cfg.target_duration_min,
    'targetDurationMax',v_cfg.target_duration_max,
    'maxDurationSeconds',v_cfg.max_duration_seconds,
    'approvalScope',v_cfg.approval_scope,
    'profoxFitOptions',v_cfg.profox_fit_options,
    'rubric',v_cfg.rubric,
    'criticalFailures',v_cfg.critical_failures,
    'lessonCount',v_lesson_count,
    'lessonsCompleted',COALESCE(v_state.lessons_completed,0),
    'draftData',COALESCE(v_state.draft_data,'{}'::jsonb),
    'latestSubmission',v_latest,
    'latestReview',v_review
  );
END; $$;

CREATE OR REPLACE FUNCTION public.complete_loom_outreach_lesson(p_progress_id uuid,p_lesson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE
  v_progress public.user_training_progress%ROWTYPE;
  v_state public.loom_outreach_training_state%ROWTYPE;
  v_next_lesson uuid;
  v_count integer;
  v_completed integer;
  v_percent integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training progress not found.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=v_progress.module_id AND slug='loom-outreach' AND active=true)
     OR NOT public.can_access_sales_academy_module(v_progress.module_id) THEN
    RAISE EXCEPTION 'Personalized Loom Outreach access denied.';
  END IF;
  IF v_progress.status IN ('Passed','Completed') THEN
    RETURN jsonb_build_object('complete',true,'certified',true);
  END IF;

  INSERT INTO public.loom_outreach_training_state(progress_id,user_id,module_id)
  VALUES(v_progress.id,auth.uid(),v_progress.module_id)
  ON CONFLICT(progress_id) DO NOTHING;

  SELECT * INTO v_state FROM public.loom_outreach_training_state WHERE progress_id=v_progress.id FOR UPDATE;
  SELECT count(*)::int INTO v_count FROM public.training_lessons WHERE module_id=v_progress.module_id AND active=true;
  IF v_count=0 THEN RAISE EXCEPTION 'Personalized Loom Outreach lessons are missing.'; END IF;

  SELECT id INTO v_next_lesson
  FROM public.training_lessons
  WHERE module_id=v_progress.module_id AND active=true
  ORDER BY sort_order,id OFFSET v_state.lessons_completed LIMIT 1;

  IF v_next_lesson IS NULL THEN
    RETURN jsonb_build_object('lessonsCompleted',v_state.lessons_completed,'lessonCount',v_count,'complete',true);
  END IF;
  IF v_next_lesson<>p_lesson_id THEN RAISE EXCEPTION 'Complete Personalized Loom Outreach lessons in order.'; END IF;

  v_completed:=LEAST(v_state.lessons_completed+1,v_count);
  UPDATE public.loom_outreach_training_state SET lessons_completed=v_completed,updated_at=now() WHERE progress_id=v_progress.id;
  v_percent:=LEAST(70,round((v_completed::numeric/GREATEST(v_count,1))*70)::int);
  UPDATE public.user_training_progress
  SET status='In Progress',progress_percent=GREATEST(COALESCE(progress_percent,0),v_percent),updated_at=now()
  WHERE id=v_progress.id;

  RETURN jsonb_build_object('lessonsCompleted',v_completed,'lessonCount',v_count,'complete',v_completed>=v_count,'progressPercent',v_percent);
END; $$;

CREATE OR REPLACE FUNCTION public.save_loom_outreach_draft(p_progress_id uuid,p_draft jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_progress public.user_training_progress%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF jsonb_typeof(p_draft)<>'object' THEN RAISE EXCEPTION 'Draft must be a JSON object.'; END IF;
  IF octet_length(p_draft::text)>200000 THEN RAISE EXCEPTION 'Draft is too large.'; END IF;

  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id AND user_id=auth.uid();
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=v_progress.module_id AND slug='loom-outreach' AND active=true)
     OR NOT public.can_access_sales_academy_module(v_progress.module_id) THEN
    RAISE EXCEPTION 'Personalized Loom Outreach access denied.';
  END IF;
  IF v_progress.status='Submitted' THEN RAISE EXCEPTION 'This certification is already under Admin review.'; END IF;
  IF v_progress.status IN ('Passed','Completed') THEN RAISE EXCEPTION 'Module 6 is already certified. Future outreach Looms do not require Admin approval.'; END IF;

  INSERT INTO public.loom_outreach_training_state(progress_id,user_id,module_id,draft_data,updated_at)
  VALUES(v_progress.id,auth.uid(),v_progress.module_id,p_draft,now())
  ON CONFLICT(progress_id) DO UPDATE SET draft_data=EXCLUDED.draft_data,updated_at=now();
  RETURN jsonb_build_object('saved',true,'savedAt',now());
END; $$;

CREATE OR REPLACE FUNCTION public.submit_loom_outreach_assignment(p_progress_id uuid,p_submission jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE
  v_progress public.user_training_progress%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_cfg public.loom_outreach_training_config%ROWTYPE;
  v_state public.loom_outreach_training_state%ROWTYPE;
  v_lesson_count integer;
  v_prior_missing integer;
  v_duration integer;
  v_assignment_id uuid;
  v_now timestamptz:=clock_timestamp();
  v_fit text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF jsonb_typeof(p_submission)<>'object' THEN RAISE EXCEPTION 'Personalized Loom submission must be an object.'; END IF;
  IF octet_length(p_submission::text)>250000 THEN RAISE EXCEPTION 'Personalized Loom submission is too large.'; END IF;

  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training progress not found.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND slug='loom-outreach' AND active=true;
  IF NOT FOUND OR NOT public.can_access_sales_academy_module(v_progress.module_id) THEN RAISE EXCEPTION 'Personalized Loom Outreach access denied.'; END IF;
  SELECT * INTO v_cfg FROM public.loom_outreach_training_config WHERE module_id=v_module.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Personalized Loom Outreach configuration is missing.'; END IF;

  IF v_progress.status='Submitted' THEN RAISE EXCEPTION 'Your certification Loom is already under Admin review.'; END IF;
  IF v_progress.status IN ('Passed','Completed') THEN
    RAISE EXCEPTION 'Module 6 is already certified. Do not submit future prospecting Looms for per-video Admin approval.';
  END IF;

  SELECT count(*) INTO v_prior_missing
  FROM public.training_modules m
  WHERE m.active=true AND m.required=true AND m.sort_order<v_module.sort_order
    AND NOT EXISTS(
      SELECT 1 FROM public.user_training_progress p
      WHERE p.user_id=auth.uid() AND p.module_id=m.id AND p.status IN ('Passed','Completed')
    );
  IF v_prior_missing>0 THEN RAISE EXCEPTION 'Complete all previous required Academy modules before submitting Module 6.'; END IF;

  SELECT * INTO v_state FROM public.loom_outreach_training_state WHERE progress_id=v_progress.id FOR UPDATE;
  SELECT count(*)::int INTO v_lesson_count FROM public.training_lessons WHERE module_id=v_module.id AND active=true;
  IF COALESCE(v_state.lessons_completed,0)<v_lesson_count THEN RAISE EXCEPTION 'Complete all Personalized Loom Outreach lessons before the certification video.'; END IF;

  IF COALESCE(p_submission->>'type','')<>'loom_outreach_v2' THEN RAISE EXCEPTION 'Invalid Personalized Loom submission type.'; END IF;
  IF length(COALESCE(btrim(p_submission->>'companyName'),''))<2 THEN RAISE EXCEPTION 'Prospect company name is required.'; END IF;
  IF COALESCE(p_submission->>'prospectUrl','') !~* '^https?://' THEN RAISE EXCEPTION 'A valid prospect website or primary public URL is required.'; END IF;
  IF length(COALESCE(btrim(p_submission->>'targetContact'),''))<2 THEN RAISE EXCEPTION 'Target contact / stakeholder is required.'; END IF;
  IF length(COALESCE(btrim(p_submission->>'targetRole'),''))<2 THEN RAISE EXCEPTION 'Target role is required.'; END IF;
  IF length(COALESCE(btrim(p_submission->>'prospectSourceReference'),''))<3 THEN RAISE EXCEPTION 'Module 5 / CRM / source reference is required.'; END IF;
  IF COALESCE(p_submission->>'evidenceUrl','') !~* '^https?://' THEN RAISE EXCEPTION 'A valid evidence URL is required.'; END IF;
  IF length(COALESCE(btrim(p_submission->>'observation'),''))<30 THEN RAISE EXCEPTION 'Explain the verified observation in at least 30 characters.'; END IF;
  IF length(COALESCE(btrim(p_submission->>'whyItMatters'),''))<30 THEN RAISE EXCEPTION 'Explain why the observation may matter in at least 30 characters.'; END IF;
  IF length(COALESCE(btrim(p_submission->>'idea'),''))<30 THEN RAISE EXCEPTION 'Explain the useful idea / direction in at least 30 characters.'; END IF;
  IF length(COALESCE(btrim(p_submission->>'cta'),''))<8 THEN RAISE EXCEPTION 'A low-pressure CTA is required.'; END IF;

  v_fit:=COALESCE(p_submission->>'profoxFit','');
  IF NOT (v_cfg.profox_fit_options ? v_fit) THEN RAISE EXCEPTION 'Choose an approved ProFox fit.'; END IF;

  IF COALESCE(p_submission->>'loomUrl','') !~* '^https?://([a-z0-9-]+\.)?loom\.com/(share|v)/[A-Za-z0-9_-]+' THEN
    RAISE EXCEPTION 'A valid Loom share URL is required.';
  END IF;
  BEGIN v_duration:=(p_submission->>'durationSeconds')::integer; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Video duration must be entered in seconds.'; END;
  IF v_duration<v_cfg.min_duration_seconds OR v_duration>v_cfg.max_duration_seconds THEN
    RAISE EXCEPTION 'Certification Loom must be between % and % seconds.',v_cfg.min_duration_seconds,v_cfg.max_duration_seconds;
  END IF;
  IF length(COALESCE(btrim(p_submission->>'companionMessage'),''))<20 OR length(COALESCE(p_submission->>'companionMessage',''))>800 THEN
    RAISE EXCEPTION 'Companion message must be between 20 and 800 characters.';
  END IF;

  IF jsonb_typeof(p_submission->'videoChecklist')<>'object'
    OR COALESCE((p_submission->'videoChecklist'->>'faceVisible')::boolean,false) IS NOT TRUE
    OR COALESCE((p_submission->'videoChecklist'->>'prospectContextShown')::boolean,false) IS NOT TRUE
    OR COALESCE((p_submission->'videoChecklist'->>'audioClear')::boolean,false) IS NOT TRUE
    OR COALESCE((p_submission->'videoChecklist'->>'cleanScreen')::boolean,false) IS NOT TRUE
    OR COALESCE((p_submission->'videoChecklist'->>'naturalDelivery')::boolean,false) IS NOT TRUE
  THEN RAISE EXCEPTION 'Complete every recording-quality checklist item.'; END IF;

  IF jsonb_typeof(p_submission->'integrity')<>'object'
    OR COALESCE((p_submission->'integrity'->>'qualifiedProspect')::boolean,false) IS NOT TRUE
    OR COALESCE((p_submission->'integrity'->>'verifiedObservation')::boolean,false) IS NOT TRUE
    OR COALESCE((p_submission->'integrity'->>'factHypothesisDiscipline')::boolean,false) IS NOT TRUE
    OR COALESCE((p_submission->'integrity'->>'noFabrication')::boolean,false) IS NOT TRUE
    OR COALESCE((p_submission->'integrity'->>'noGuarantees')::boolean,false) IS NOT TRUE
    OR COALESCE((p_submission->'integrity'->>'noUnauthorizedCommitment')::boolean,false) IS NOT TRUE
    OR COALESCE((p_submission->'integrity'->>'notSentBeforeApproval')::boolean,false) IS NOT TRUE
    OR COALESCE((p_submission->'integrity'->>'privacyProtected')::boolean,false) IS NOT TRUE
    OR COALESCE((p_submission->'integrity'->>'oneIdeaOnly')::boolean,false) IS NOT TRUE
  THEN RAISE EXCEPTION 'Complete every Module 6 integrity acknowledgement.'; END IF;

  PERFORM set_config('profox.training_loom_rpc','1',true);
  INSERT INTO public.training_assignments(user_id,module_id,progress_id,submission_data,created_at,updated_at)
  VALUES(auth.uid(),v_module.id,v_progress.id,p_submission||jsonb_build_object('submittedAt',v_now,'approvalScope','onboarding_only'),v_now,v_now)
  RETURNING id INTO v_assignment_id;

  UPDATE public.user_training_progress
  SET status='Submitted',progress_percent=100,score=NULL,completed_at=NULL,review_status=NULL,
      reviewed_by=NULL,reviewed_at=NULL,feedback=NULL,updated_at=v_now
  WHERE id=v_progress.id;
  UPDATE public.loom_outreach_training_state SET draft_data='{}'::jsonb,updated_at=v_now WHERE progress_id=v_progress.id;
  PERFORM set_config('profox.training_loom_rpc','',true);

  RETURN jsonb_build_object('submitted',true,'assignmentId',v_assignment_id,'status','Submitted','approvalScope','onboarding_only');
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('profox.training_loom_rpc','',true);
  RAISE;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_loom_outreach_submissions()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_module_id uuid; v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  SELECT id INTO v_module_id FROM public.training_modules WHERE slug='loom-outreach' LIMIT 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'progressId',p.id,'userId',p.user_id,'status',p.status,'score',p.score,'feedback',p.feedback,
    'reviewedAt',p.reviewed_at,'updatedAt',p.updated_at,
    'candidateName',COALESCE(pr.full_name,pr.email,p.user_id::text),'candidateEmail',pr.email,
    'assignmentId',a.id,'submittedAt',a.created_at,'submission',a.submission_data,
    'reviewDetail',(
      SELECT jsonb_build_object('rubricScores',r.rubric_scores,'totalScore',r.total_score,
        'criticalFailures',r.critical_failures,'status',r.status,'feedback',r.feedback,'createdAt',r.created_at)
      FROM public.loom_outreach_review_details r WHERE r.progress_id=p.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1
    )
  ) ORDER BY CASE WHEN p.status='Submitted' THEN 0 WHEN p.status='Retry Required' THEN 1 ELSE 2 END,p.updated_at DESC),'[]'::jsonb)
  INTO v_result
  FROM public.user_training_progress p
  LEFT JOIN public.user_profiles pr ON pr.id=p.user_id
  LEFT JOIN LATERAL (
    SELECT ta.id,ta.created_at,ta.submission_data FROM public.training_assignments ta
    WHERE ta.progress_id=p.id AND ta.user_id=p.user_id AND ta.module_id=p.module_id
    ORDER BY ta.created_at DESC,ta.id DESC LIMIT 1
  ) a ON true
  WHERE p.module_id=v_module_id;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_review_loom_outreach_assignment(
  p_progress_id uuid,p_rubric_scores jsonb,p_critical_failures jsonb DEFAULT '[]'::jsonb,p_feedback text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE
  v_progress public.user_training_progress%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_cfg public.loom_outreach_training_config%ROWTYPE;
  v_assignment public.training_assignments%ROWTYPE;
  v_total integer:=0;
  v_bad integer:=0;
  v_critical_count integer:=0;
  v_status text;
  v_now timestamptz:=clock_timestamp();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  IF jsonb_typeof(p_rubric_scores)<>'object' THEN RAISE EXCEPTION 'Rubric scores must be an object.'; END IF;
  IF jsonb_typeof(p_critical_failures)<>'array' THEN RAISE EXCEPTION 'Critical failures must be an array.'; END IF;

  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training progress not found.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND slug='loom-outreach' AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module 6 progress is invalid.'; END IF;
  IF v_progress.status<>'Submitted' THEN RAISE EXCEPTION 'The trainee must submit a new certification Loom before review.'; END IF;
  SELECT * INTO v_cfg FROM public.loom_outreach_training_config WHERE module_id=v_module.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module 6 configuration is missing.'; END IF;
  SELECT * INTO v_assignment FROM public.training_assignments
  WHERE progress_id=v_progress.id AND user_id=v_progress.user_id AND module_id=v_progress.module_id
  ORDER BY created_at DESC,id DESC LIMIT 1;
  IF NOT FOUND OR COALESCE(v_assignment.submission_data->>'type','')<>'loom_outreach_v2' THEN RAISE EXCEPTION 'A valid Module 6 certification submission is required.'; END IF;

  SELECT count(*) INTO v_bad
  FROM jsonb_array_elements(v_cfg.rubric) r
  WHERE NOT (p_rubric_scores ? (r->>'key'))
     OR COALESCE((p_rubric_scores->>(r->>'key'))::int,-1)<0
     OR COALESCE((p_rubric_scores->>(r->>'key'))::int,-1)>COALESCE((r->>'max')::int,0);
  IF v_bad>0 THEN RAISE EXCEPTION 'Every rubric item must have a score within its allowed range.'; END IF;

  SELECT COALESCE(sum((p_rubric_scores->>(r->>'key'))::int),0)::int INTO v_total
  FROM jsonb_array_elements(v_cfg.rubric) r;

  SELECT count(*) INTO v_bad
  FROM jsonb_array_elements_text(p_critical_failures) c
  WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_cfg.critical_failures) x WHERE x->>'key'=c);
  IF v_bad>0 THEN RAISE EXCEPTION 'Unknown critical-failure key supplied.'; END IF;
  SELECT jsonb_array_length(p_critical_failures) INTO v_critical_count;

  v_status:=CASE WHEN v_total>=COALESCE(v_module.passing_score,80) AND v_critical_count=0 THEN 'Passed' ELSE 'Retry Required' END;

  PERFORM set_config('profox.training_loom_review_rpc','1',true);
  INSERT INTO public.loom_outreach_review_details(
    progress_id,assignment_id,reviewer_id,rubric_scores,total_score,critical_failures,status,feedback,created_at
  ) VALUES(
    v_progress.id,v_assignment.id,auth.uid(),p_rubric_scores,v_total,p_critical_failures,v_status,COALESCE(p_feedback,''),v_now
  );
  INSERT INTO public.training_reviews(progress_id,reviewer_id,status,feedback,score,created_at)
  VALUES(v_progress.id,auth.uid(),v_status,COALESCE(p_feedback,''),v_total,v_now);

  UPDATE public.user_training_progress
  SET status=v_status,review_status=v_status,reviewed_by=auth.uid(),reviewed_at=v_now,feedback=COALESCE(p_feedback,''),
      score=v_total,progress_percent=CASE WHEN v_status='Passed' THEN 100 ELSE 70 END,
      completed_at=CASE WHEN v_status='Passed' THEN v_now ELSE NULL END,updated_at=v_now
  WHERE id=v_progress.id;
  PERFORM set_config('profox.training_loom_review_rpc','',true);

  RETURN jsonb_build_object(
    'status',v_status,'score',v_total,'criticalFailureCount',v_critical_count,
    'certified',v_status='Passed','approvalScope','onboarding_only',
    'futureApprovalRequired',false
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('profox.training_loom_review_rpc','',true);
  RAISE;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_loom_outreach_config(p_module_id uuid,p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE
  v_min integer; v_target_min integer; v_target_max integer; v_max integer; v_pass integer;
  v_fit jsonb; v_rubric jsonb; v_critical jsonb; v_total integer; v_bad integer; v_cfg public.loom_outreach_training_config%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  IF jsonb_typeof(p_config)<>'object' THEN RAISE EXCEPTION 'Configuration must be an object.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=p_module_id AND slug='loom-outreach') THEN RAISE EXCEPTION 'Module 6 not found.'; END IF;

  BEGIN
    v_min:=(p_config->>'minDurationSeconds')::int;
    v_target_min:=(p_config->>'targetDurationMin')::int;
    v_target_max:=(p_config->>'targetDurationMax')::int;
    v_max:=(p_config->>'maxDurationSeconds')::int;
    v_pass:=(p_config->>'passingScore')::int;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Duration and passing-score values must be integers.'; END;

  IF v_min<15 OR v_max>120 OR v_min>v_target_min OR v_target_min>v_target_max OR v_target_max>v_max THEN
    RAISE EXCEPTION 'Duration settings must follow min <= target min <= target max <= max.';
  END IF;
  IF v_pass NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Passing score must be between 1 and 100.'; END IF;

  v_fit:=p_config->'profoxFitOptions'; v_rubric:=p_config->'rubric'; v_critical:=p_config->'criticalFailures';
  IF jsonb_typeof(v_fit)<>'array' OR jsonb_array_length(v_fit)<1 THEN RAISE EXCEPTION 'At least one ProFox fit option is required.'; END IF;
  IF jsonb_typeof(v_rubric)<>'array' OR jsonb_array_length(v_rubric)<1 THEN RAISE EXCEPTION 'Rubric is required.'; END IF;
  IF jsonb_typeof(v_critical)<>'array' OR jsonb_array_length(v_critical)<1 THEN RAISE EXCEPTION 'Critical-failure rules are required.'; END IF;

  SELECT count(*) INTO v_bad FROM jsonb_array_elements(v_rubric) r
  WHERE COALESCE(btrim(r->>'key'),'')='' OR COALESCE(btrim(r->>'label'),'')='' OR COALESCE((r->>'max')::int,0)<=0;
  IF v_bad>0 THEN RAISE EXCEPTION 'Every rubric item requires key, label and positive max score.'; END IF;
  SELECT COALESCE(sum((r->>'max')::int),0)::int INTO v_total FROM jsonb_array_elements(v_rubric) r;
  IF v_total<>100 THEN RAISE EXCEPTION 'Rubric maximums must total exactly 100.'; END IF;
  SELECT count(*) INTO v_bad FROM (SELECT r->>'key' key,count(*) c FROM jsonb_array_elements(v_rubric) r GROUP BY r->>'key' HAVING count(*)>1) d;
  IF v_bad>0 THEN RAISE EXCEPTION 'Rubric keys must be unique.'; END IF;
  SELECT count(*) INTO v_bad FROM jsonb_array_elements(v_critical) r WHERE COALESCE(btrim(r->>'key'),'')='' OR COALESCE(btrim(r->>'label'),'')='';
  IF v_bad>0 THEN RAISE EXCEPTION 'Every critical-failure rule requires key and label.'; END IF;

  UPDATE public.loom_outreach_training_config
  SET min_duration_seconds=v_min,target_duration_min=v_target_min,target_duration_max=v_target_max,max_duration_seconds=v_max,
      approval_scope='onboarding_only',profox_fit_options=v_fit,rubric=v_rubric,critical_failures=v_critical,
      updated_by=auth.uid(),updated_at=now()
  WHERE module_id=p_module_id RETURNING * INTO v_cfg;
  UPDATE public.training_modules SET passing_score=v_pass,updated_at=now() WHERE id=p_module_id;

  RETURN jsonb_build_object('saved',true,'approvalScope','onboarding_only','passingScore',v_pass,
    'minDurationSeconds',v_cfg.min_duration_seconds,'targetDurationMin',v_cfg.target_duration_min,
    'targetDurationMax',v_cfg.target_duration_max,'maxDurationSeconds',v_cfg.max_duration_seconds);
END; $$;

-- Block direct learner assignment writes for Module 6. Only submit_loom_outreach_assignment may create them.
CREATE OR REPLACE FUNCTION public.protect_loom_outreach_assignment_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_slug text; v_rpc text:=COALESCE(current_setting('profox.training_loom_rpc',true),'');
BEGIN
  SELECT slug INTO v_slug FROM public.training_modules WHERE id=NEW.module_id;
  IF v_slug='loom-outreach' AND NOT public.is_admin() AND v_rpc<>'1' THEN
    RAISE EXCEPTION 'Personalized Loom certification must be submitted through the secure Module 6 workflow.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_loom_outreach_assignment_write ON public.training_assignments;
CREATE TRIGGER trg_protect_loom_outreach_assignment_write
BEFORE INSERT OR UPDATE ON public.training_assignments
FOR EACH ROW EXECUTE FUNCTION public.protect_loom_outreach_assignment_write();

-- Block direct learner status/review manipulation for the reviewed Module 6 workflow.
CREATE OR REPLACE FUNCTION public.protect_loom_outreach_progress_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_slug text; v_rpc text:=COALESCE(current_setting('profox.training_loom_rpc',true),'');
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  SELECT slug INTO v_slug FROM public.training_modules WHERE id=NEW.module_id;
  IF v_slug<>'loom-outreach' THEN RETURN NEW; END IF;
  IF v_rpc='1' THEN RETURN NEW; END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.status IN ('Submitted','Retry Required','Passed','Completed') OR NEW.score IS NOT NULL
       OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_status IS NOT NULL THEN
      RAISE EXCEPTION 'Module 6 certification status is controlled by the secure submission and Admin review workflow.';
    END IF;
  ELSE
    IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Submitted','Retry Required','Passed','Completed'))
       OR NEW.score IS DISTINCT FROM OLD.score OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_status IS DISTINCT FROM OLD.review_status OR NEW.feedback IS DISTINCT FROM OLD.feedback THEN
      RAISE EXCEPTION 'Module 6 certification status and review fields are controlled by the secure workflow.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_loom_outreach_progress_write ON public.user_training_progress;
CREATE TRIGGER trg_protect_loom_outreach_progress_write
BEFORE INSERT OR UPDATE ON public.user_training_progress
FOR EACH ROW EXECUTE FUNCTION public.protect_loom_outreach_progress_write();

-- Generic Admin review must not bypass the dedicated Module 6 rubric.
CREATE OR REPLACE FUNCTION public.protect_loom_outreach_training_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_slug text; v_rpc text:=COALESCE(current_setting('profox.training_loom_review_rpc',true),'');
BEGIN
  SELECT m.slug INTO v_slug
  FROM public.user_training_progress p JOIN public.training_modules m ON m.id=p.module_id
  WHERE p.id=NEW.progress_id;
  IF v_slug='loom-outreach' AND v_rpc<>'1' THEN
    RAISE EXCEPTION 'Use the dedicated Personalized Loom Outreach rubric review workflow for Module 6.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_loom_outreach_training_review ON public.training_reviews;
CREATE TRIGGER trg_protect_loom_outreach_training_review
BEFORE INSERT OR UPDATE ON public.training_reviews
FOR EACH ROW EXECUTE FUNCTION public.protect_loom_outreach_training_review();

-- Preserve all existing assignment validation while routing Module 6 through its dedicated secure RPC.
CREATE OR REPLACE FUNCTION public.validate_training_assignment_submission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_module_slug text;
  v_progress public.user_training_progress%ROWTYPE;
  v_quiz_rpc text := COALESCE(current_setting('profox.training_quiz_rpc',true),'');
  v_lead_research_rpc text := COALESCE(current_setting('profox.training_lead_research_rpc',true),'');
  v_loom_rpc text := COALESCE(current_setting('profox.training_loom_rpc',true),'');
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Training submissions may only be created for the signed-in trainee.';
  END IF;

  SELECT slug INTO v_module_slug FROM public.training_modules WHERE id=NEW.module_id AND active=true;
  IF v_module_slug IS NULL THEN RAISE EXCEPTION 'Training module is missing or inactive.'; END IF;
  IF NEW.progress_id IS NULL THEN RAISE EXCEPTION 'Training progress reference is required.'; END IF;
  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=NEW.progress_id;
  IF NOT FOUND OR v_progress.user_id IS DISTINCT FROM NEW.user_id OR v_progress.module_id IS DISTINCT FROM NEW.module_id THEN
    RAISE EXCEPTION 'Training submission does not match the trainee progress record.';
  END IF;

  IF v_module_slug='lead-research' THEN
    IF NEW.submission_data->>'type' <> 'lead_research_v2' OR v_lead_research_rpc<>'1' THEN
      RAISE EXCEPTION 'Lead Research must be submitted through the secure research qualification workflow.';
    END IF;
  ELSIF v_module_slug='loom-outreach' THEN
    IF NEW.submission_data->>'type' <> 'loom_outreach_v2' OR v_loom_rpc<>'1' THEN
      RAISE EXCEPTION 'Personalized Loom Outreach must be submitted through the secure Module 6 certification workflow.';
    END IF;
    IF COALESCE(NEW.submission_data->>'loomUrl','') !~* '^https?://([a-z0-9-]+\.)?loom\.com/(share|v)/' THEN
      RAISE EXCEPTION 'A valid Loom share URL is required.';
    END IF;
  ELSIF v_module_slug='mock-call-test' THEN
    IF NEW.submission_data->>'type' <> 'mock_sales_call' THEN RAISE EXCEPTION 'Invalid mock sales call submission type.'; END IF;
  ELSIF v_module_slug='crm-training' THEN
    IF NEW.submission_data->>'type' <> 'crm_practical' THEN RAISE EXCEPTION 'Invalid CRM practical submission type.'; END IF;
  ELSIF v_module_slug='final-certification' THEN
    IF NEW.submission_data->>'type' <> 'final_certification_exam' OR v_quiz_rpc<>'1' THEN
      RAISE EXCEPTION 'Final Certification must be submitted through the secure server-scored exam workflow.';
    END IF;
    IF jsonb_typeof(NEW.submission_data->'answers') <> 'array' OR jsonb_array_length(NEW.submission_data->'answers') <> 15 THEN
      RAISE EXCEPTION 'Final Certification requires exactly 15 server-scored answers.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.get_loom_outreach_training_config(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.complete_loom_outreach_lesson(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_loom_outreach_draft(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_loom_outreach_assignment(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_list_loom_outreach_submissions() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_review_loom_outreach_assignment(uuid,jsonb,jsonb,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_update_loom_outreach_config(uuid,jsonb) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.get_loom_outreach_training_config(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_loom_outreach_lesson(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_loom_outreach_draft(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_loom_outreach_assignment(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_loom_outreach_submissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_loom_outreach_assignment(uuid,jsonb,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_loom_outreach_config(uuid,jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.protect_loom_outreach_assignment_write() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.protect_loom_outreach_progress_write() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.protect_loom_outreach_training_review() FROM PUBLIC,anon,authenticated;
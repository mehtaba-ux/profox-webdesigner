-- Module 7 secure workflow. Live database uses these exact public function names and contracts.

CREATE OR REPLACE FUNCTION public.get_outreach_messaging_training_config(p_module_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_user uuid:=auth.uid(); v_cfg public.outreach_messaging_training_config%ROWTYPE; v_progress public.user_training_progress%ROWTYPE; v_state public.outreach_messaging_training_state%ROWTYPE; v_lesson_count int:=0; v_latest jsonb; v_review jsonb; v_playbooks jsonb; v_compliance jsonb;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 IF NOT public.can_access_sales_academy_module(p_module_id) THEN RAISE EXCEPTION 'Training module access denied.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=p_module_id AND slug='outreach-cadence' AND active=true) THEN RAISE EXCEPTION 'Outreach Messages & Follow-Up module not found.'; END IF;
 SELECT * INTO v_cfg FROM public.outreach_messaging_training_config WHERE module_id=p_module_id; IF NOT FOUND THEN RAISE EXCEPTION 'Outreach messaging configuration is missing.'; END IF;
 SELECT * INTO v_progress FROM public.user_training_progress WHERE user_id=v_user AND module_id=p_module_id;
 IF FOUND THEN
  SELECT * INTO v_state FROM public.outreach_messaging_training_state WHERE progress_id=v_progress.id;
  SELECT submission_data INTO v_latest FROM public.training_assignments WHERE user_id=v_user AND module_id=p_module_id AND progress_id=v_progress.id ORDER BY created_at DESC,id DESC LIMIT 1;
  SELECT jsonb_build_object('totalScore',r.total_score,'criticalFailures',r.critical_failures,'status',r.status,'feedback',r.feedback,'createdAt',r.created_at) INTO v_review FROM public.outreach_messaging_review_details r WHERE r.progress_id=v_progress.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1;
 END IF;
 SELECT count(*)::int INTO v_lesson_count FROM public.training_lessons WHERE module_id=p_module_id AND active=true;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'title',p.title,'category',p.category,'channel',p.channel,'nicheSlug',p.niche_slug,'marketCode',p.market_code,'subjectTemplate',p.subject_template,'bodyTemplate',p.body_template,'coachingNote',p.coaching_note,'variables',p.variables,'sortOrder',p.sort_order) ORDER BY p.sort_order,p.title),'[]'::jsonb) INTO v_playbooks FROM public.outreach_message_playbooks p WHERE p.module_id=p_module_id AND p.active=true;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'marketCode',c.market_code,'marketLabel',c.market_label,'channel',c.channel,'status',c.status,'summary',c.summary,'rules',c.rules,'referenceUrls',c.reference_urls,'sortOrder',c.sort_order) ORDER BY c.sort_order,c.market_code,c.channel),'[]'::jsonb) INTO v_compliance FROM public.outreach_compliance_presets c WHERE c.module_id=p_module_id AND c.active=true;
 RETURN jsonb_build_object('acceptedMessageMinWords',v_cfg.accepted_message_min_words,'targetMessageMinWords',v_cfg.target_message_min_words,'targetMessageMaxWords',v_cfg.target_message_max_words,'acceptedMessageMaxWords',v_cfg.accepted_message_max_words,'subjectMinWords',v_cfg.subject_min_words,'subjectMaxWords',v_cfg.subject_max_words,'approvalScope',v_cfg.approval_scope,'channelOptions',v_cfg.channel_options,'defaultCadence',v_cfg.default_cadence,'requiredReplyScenarios',v_cfg.required_reply_scenarios,'rubric',v_cfg.rubric,'criticalFailures',v_cfg.critical_failures,'lessonCount',v_lesson_count,'lessonsCompleted',COALESCE(v_state.lessons_completed,0),'draftData',COALESCE(v_state.draft_data,'{}'::jsonb),'latestSubmission',v_latest,'latestReview',v_review,'playbooks',v_playbooks,'compliancePresets',v_compliance);
END; $function$;

CREATE OR REPLACE FUNCTION public.complete_outreach_messaging_lesson(p_progress_id uuid,p_lesson_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_progress public.user_training_progress%ROWTYPE; v_state public.outreach_messaging_training_state%ROWTYPE; v_next uuid; v_count int; v_done int; v_percent int;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id AND user_id=auth.uid() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Training progress not found.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=v_progress.module_id AND slug='outreach-cadence' AND active=true) OR NOT public.can_access_sales_academy_module(v_progress.module_id) THEN RAISE EXCEPTION 'Outreach messaging access denied.'; END IF;
 IF v_progress.status IN ('Passed','Completed') THEN RETURN jsonb_build_object('complete',true,'certified',true); END IF;
 INSERT INTO public.outreach_messaging_training_state(progress_id,user_id,module_id) VALUES(v_progress.id,auth.uid(),v_progress.module_id) ON CONFLICT(progress_id) DO NOTHING;
 SELECT * INTO v_state FROM public.outreach_messaging_training_state WHERE progress_id=v_progress.id FOR UPDATE;
 SELECT count(*)::int INTO v_count FROM public.training_lessons WHERE module_id=v_progress.module_id AND active=true; IF v_count=0 THEN RAISE EXCEPTION 'Outreach messaging lessons are missing.'; END IF;
 SELECT id INTO v_next FROM public.training_lessons WHERE module_id=v_progress.module_id AND active=true ORDER BY sort_order,id OFFSET v_state.lessons_completed LIMIT 1;
 IF v_next IS NULL THEN RETURN jsonb_build_object('lessonsCompleted',v_state.lessons_completed,'lessonCount',v_count,'complete',true); END IF;
 IF v_next<>p_lesson_id THEN RAISE EXCEPTION 'Complete Outreach Messages & Follow-Up lessons in order.'; END IF;
 v_done:=LEAST(v_state.lessons_completed+1,v_count); UPDATE public.outreach_messaging_training_state SET lessons_completed=v_done,updated_at=now() WHERE progress_id=v_progress.id; v_percent:=LEAST(70,round((v_done::numeric/GREATEST(v_count,1))*70)::int);
 PERFORM set_config('profox.training_outreach_rpc','1',true); UPDATE public.user_training_progress SET status='In Progress',progress_percent=GREATEST(COALESCE(progress_percent,0),v_percent),updated_at=now() WHERE id=v_progress.id; PERFORM set_config('profox.training_outreach_rpc','',true);
 RETURN jsonb_build_object('lessonsCompleted',v_done,'lessonCount',v_count,'complete',v_done>=v_count,'progressPercent',v_percent);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('profox.training_outreach_rpc','',true); RAISE; END; $function$;

CREATE OR REPLACE FUNCTION public.save_outreach_messaging_draft(p_progress_id uuid,p_draft jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_progress public.user_training_progress%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 IF jsonb_typeof(p_draft)<>'object' OR octet_length(p_draft::text)>300000 THEN RAISE EXCEPTION 'Draft must be a valid JSON object within the allowed size.'; END IF;
 SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id AND user_id=auth.uid();
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=v_progress.module_id AND slug='outreach-cadence' AND active=true) OR NOT public.can_access_sales_academy_module(v_progress.module_id) THEN RAISE EXCEPTION 'Outreach messaging access denied.'; END IF;
 IF v_progress.status='Submitted' THEN RAISE EXCEPTION 'This certification is already under Admin review.'; END IF;
 IF v_progress.status IN ('Passed','Completed') THEN RAISE EXCEPTION 'Module 7 is already certified. Normal outreach does not require per-message Admin approval.'; END IF;
 INSERT INTO public.outreach_messaging_training_state(progress_id,user_id,module_id,draft_data,updated_at) VALUES(v_progress.id,auth.uid(),v_progress.module_id,p_draft,now()) ON CONFLICT(progress_id) DO UPDATE SET draft_data=EXCLUDED.draft_data,updated_at=now();
 RETURN jsonb_build_object('saved',true,'savedAt',now());
END; $function$;

CREATE OR REPLACE FUNCTION public.submit_outreach_messaging_assignment(p_progress_id uuid,p_submission jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_progress public.user_training_progress%ROWTYPE; v_module public.training_modules%ROWTYPE; v_cfg public.outreach_messaging_training_config%ROWTYPE; v_state public.outreach_messaging_training_state%ROWTYPE; v_count int; v_prior int; v_word_count int; v_subject_words int; v_assignment uuid; v_now timestamptz:=clock_timestamp(); v_required jsonb; v_key text; v_preset public.outreach_compliance_presets%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 IF jsonb_typeof(p_submission)<>'object' OR octet_length(p_submission::text)>400000 THEN RAISE EXCEPTION 'Messaging submission must be a valid object within the allowed size.'; END IF;
 SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id AND user_id=auth.uid() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Training progress not found.'; END IF;
 SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND slug='outreach-cadence' AND active=true; IF NOT FOUND OR NOT public.can_access_sales_academy_module(v_progress.module_id) THEN RAISE EXCEPTION 'Outreach messaging access denied.'; END IF;
 SELECT * INTO v_cfg FROM public.outreach_messaging_training_config WHERE module_id=v_module.id; IF NOT FOUND THEN RAISE EXCEPTION 'Outreach messaging configuration is missing.'; END IF;
 IF v_progress.status='Submitted' THEN RAISE EXCEPTION 'Your messaging certification is already under Admin review.'; END IF;
 IF v_progress.status IN ('Passed','Completed') THEN RAISE EXCEPTION 'Module 7 is already certified. Do not submit normal future outreach for per-message approval.'; END IF;
 SELECT count(*) INTO v_prior FROM public.training_modules m WHERE m.active=true AND m.required=true AND m.sort_order<v_module.sort_order AND NOT EXISTS(SELECT 1 FROM public.user_training_progress p WHERE p.user_id=auth.uid() AND p.module_id=m.id AND p.status IN ('Passed','Completed')); IF v_prior>0 THEN RAISE EXCEPTION 'Complete all previous required Academy modules before submitting Module 7.'; END IF;
 SELECT * INTO v_state FROM public.outreach_messaging_training_state WHERE progress_id=v_progress.id FOR UPDATE; SELECT count(*)::int INTO v_count FROM public.training_lessons WHERE module_id=v_module.id AND active=true; IF COALESCE(v_state.lessons_completed,0)<v_count THEN RAISE EXCEPTION 'Complete all Module 7 lessons before certification.'; END IF;
 IF COALESCE(p_submission->>'type','')<>'outreach_messaging_v1' THEN RAISE EXCEPTION 'Invalid Module 7 submission type.'; END IF;
 IF length(btrim(COALESCE(p_submission->>'companyName','')))<2 OR COALESCE(p_submission->>'prospectUrl','') !~* '^https?://' THEN RAISE EXCEPTION 'Valid prospect company and public URL are required.'; END IF;
 IF length(btrim(COALESCE(p_submission->>'targetContact','')))<2 OR length(btrim(COALESCE(p_submission->>'targetRole','')))<2 THEN RAISE EXCEPTION 'Target contact and role are required.'; END IF;
 IF length(btrim(COALESCE(p_submission->>'marketCode','')))<2 OR length(btrim(COALESCE(p_submission->>'researchReference','')))<3 OR COALESCE(p_submission->>'evidenceUrl','') !~* '^https?://' THEN RAISE EXCEPTION 'Market, research reference, and evidence URL are required.'; END IF;
 FOREACH v_key IN ARRAY ARRAY['businessSignal','verifiedObservation','carefulRelevance','valueOffer','subject','firstEmail','linkedinConnection','linkedinFollowup','loomCompanion'] LOOP IF length(btrim(COALESCE(p_submission->>v_key,'')))<3 THEN RAISE EXCEPTION 'Required messaging field % is missing.',v_key; END IF; END LOOP;
 v_word_count:=array_length(regexp_split_to_array(btrim(p_submission->>'firstEmail'),'\s+'),1); v_subject_words:=array_length(regexp_split_to_array(btrim(p_submission->>'subject'),'\s+'),1);
 IF v_word_count<v_cfg.accepted_message_min_words OR v_word_count>v_cfg.accepted_message_max_words THEN RAISE EXCEPTION 'First email must be between % and % words.',v_cfg.accepted_message_min_words,v_cfg.accepted_message_max_words; END IF;
 IF v_subject_words<v_cfg.subject_min_words OR v_subject_words>v_cfg.subject_max_words THEN RAISE EXCEPTION 'Subject must be between % and % words.',v_cfg.subject_min_words,v_cfg.subject_max_words; END IF;
 IF jsonb_typeof(p_submission->'followups')<>'object' THEN RAISE EXCEPTION 'Follow-up sequence is required.'; END IF;
 FOREACH v_key IN ARRAY ARRAY['bump','newObservation','value','alternate','proofOrValue','closeLoop'] LOOP IF length(btrim(COALESCE(p_submission->'followups'->>v_key,'')))<3 THEN RAISE EXCEPTION 'Follow-up % is required.',v_key; END IF; END LOOP;
 IF jsonb_typeof(p_submission->'cadence')<>'array' OR jsonb_array_length(p_submission->'cadence')<jsonb_array_length(v_cfg.default_cadence) THEN RAISE EXCEPTION 'Complete the full outreach cadence plan.'; END IF;
 IF jsonb_typeof(p_submission->'replyHandling')<>'object' THEN RAISE EXCEPTION 'Reply-handling responses are required.'; END IF;
 FOR v_required IN SELECT value FROM jsonb_array_elements(v_cfg.required_reply_scenarios) LOOP v_key:=v_required->>'key'; IF length(btrim(COALESCE(p_submission->'replyHandling'->>v_key,'')))<2 THEN RAISE EXCEPTION 'Reply-handling scenario % is required.',v_key; END IF; END LOOP;
 IF jsonb_typeof(p_submission->'selfChecks')<>'object' THEN RAISE EXCEPTION 'Complete the message quality and integrity checklist.'; END IF;
 FOREACH v_key IN ARRAY ARRAY['individualized','buyerFirst','oneIdea','oneCta','evidenceBacked','noFabrication','noGuarantees','noUnauthorizedCommitment','complianceChecked','crmPlanReady','certificationNotSentBeforeApproval'] LOOP IF COALESCE((p_submission->'selfChecks'->>v_key)::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Complete every Module 7 quality and integrity check.'; END IF; END LOOP;
 SELECT * INTO v_preset FROM public.outreach_compliance_presets WHERE module_id=v_module.id AND active=true AND channel='Email' AND market_code=upper(p_submission->>'marketCode') ORDER BY sort_order LIMIT 1; IF NOT FOUND THEN SELECT * INTO v_preset FROM public.outreach_compliance_presets WHERE module_id=v_module.id AND active=true AND channel='Email' AND market_code='GLOBAL' ORDER BY sort_order LIMIT 1; END IF;
 IF FOUND AND v_preset.status='do_not_send' THEN RAISE EXCEPTION 'The selected market/channel is currently marked Do Not Send by Admin.'; END IF;
 PERFORM set_config('profox.training_outreach_rpc','1',true);
 INSERT INTO public.training_assignments(user_id,module_id,progress_id,submission_data,created_at,updated_at) VALUES(auth.uid(),v_module.id,v_progress.id,p_submission||jsonb_build_object('submittedAt',v_now,'approvalScope','onboarding_only','compliancePresetStatus',COALESCE(v_preset.status,'allowed_with_rules')),v_now,v_now) RETURNING id INTO v_assignment;
 UPDATE public.user_training_progress SET status='Submitted',progress_percent=100,score=NULL,completed_at=NULL,review_status=NULL,reviewed_by=NULL,reviewed_at=NULL,feedback=NULL,updated_at=v_now WHERE id=v_progress.id;
 UPDATE public.outreach_messaging_training_state SET draft_data='{}'::jsonb,updated_at=v_now WHERE progress_id=v_progress.id;
 PERFORM set_config('profox.training_outreach_rpc','',true);
 RETURN jsonb_build_object('submitted',true,'assignmentId',v_assignment,'status','Submitted','approvalScope','onboarding_only','futureApprovalRequired',false);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('profox.training_outreach_rpc','',true); RAISE; END; $function$;

CREATE OR REPLACE FUNCTION public.admin_list_outreach_messaging_submissions()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_module_id uuid; v_result jsonb;
BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF; SELECT id INTO v_module_id FROM public.training_modules WHERE slug='outreach-cadence' LIMIT 1;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('progressId',p.id,'userId',p.user_id,'status',p.status,'score',p.score,'feedback',p.feedback,'reviewedAt',p.reviewed_at,'updatedAt',p.updated_at,'candidateName',COALESCE(pr.full_name,pr.email,p.user_id::text),'candidateEmail',pr.email,'assignmentId',a.id,'submittedAt',a.created_at,'submission',a.submission_data,'reviewDetail',(SELECT jsonb_build_object('rubricScores',r.rubric_scores,'totalScore',r.total_score,'criticalFailures',r.critical_failures,'status',r.status,'feedback',r.feedback,'createdAt',r.created_at) FROM public.outreach_messaging_review_details r WHERE r.progress_id=p.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1)) ORDER BY CASE WHEN p.status='Submitted' THEN 0 WHEN p.status='Retry Required' THEN 1 ELSE 2 END,p.updated_at DESC),'[]'::jsonb) INTO v_result FROM public.user_training_progress p LEFT JOIN public.user_profiles pr ON pr.id=p.user_id LEFT JOIN LATERAL(SELECT ta.id,ta.created_at,ta.submission_data FROM public.training_assignments ta WHERE ta.progress_id=p.id AND ta.user_id=p.user_id AND ta.module_id=p.module_id ORDER BY ta.created_at DESC,ta.id DESC LIMIT 1)a ON true WHERE p.module_id=v_module_id; RETURN v_result; END; $function$;

CREATE OR REPLACE FUNCTION public.admin_review_outreach_messaging_assignment(p_progress_id uuid,p_rubric_scores jsonb,p_critical_failures jsonb DEFAULT '[]'::jsonb,p_feedback text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_progress public.user_training_progress%ROWTYPE; v_module public.training_modules%ROWTYPE; v_cfg public.outreach_messaging_training_config%ROWTYPE; v_assignment public.training_assignments%ROWTYPE; v_total int:=0; v_bad int:=0; v_critical int:=0; v_status text; v_now timestamptz:=clock_timestamp();
BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF; IF jsonb_typeof(p_rubric_scores)<>'object' OR jsonb_typeof(p_critical_failures)<>'array' THEN RAISE EXCEPTION 'Invalid review payload.'; END IF;
 SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Training progress not found.'; END IF; SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND slug='outreach-cadence' AND active=true; IF NOT FOUND THEN RAISE EXCEPTION 'Module 7 progress is invalid.'; END IF; IF v_progress.status<>'Submitted' THEN RAISE EXCEPTION 'The trainee must submit a new messaging certification before review.'; END IF;
 SELECT * INTO v_cfg FROM public.outreach_messaging_training_config WHERE module_id=v_module.id; SELECT * INTO v_assignment FROM public.training_assignments WHERE progress_id=v_progress.id AND user_id=v_progress.user_id AND module_id=v_progress.module_id ORDER BY created_at DESC,id DESC LIMIT 1; IF NOT FOUND OR COALESCE(v_assignment.submission_data->>'type','')<>'outreach_messaging_v1' THEN RAISE EXCEPTION 'A valid Module 7 submission is required.'; END IF;
 SELECT count(*) INTO v_bad FROM jsonb_array_elements(v_cfg.rubric) r WHERE NOT(p_rubric_scores?(r->>'key')) OR COALESCE((p_rubric_scores->>(r->>'key'))::int,-1)<0 OR COALESCE((p_rubric_scores->>(r->>'key'))::int,-1)>COALESCE((r->>'max')::int,0); IF v_bad>0 THEN RAISE EXCEPTION 'Every rubric item must have a score within its allowed range.'; END IF; SELECT COALESCE(sum((p_rubric_scores->>(r->>'key'))::int),0)::int INTO v_total FROM jsonb_array_elements(v_cfg.rubric)r;
 SELECT count(*) INTO v_bad FROM jsonb_array_elements_text(p_critical_failures)c WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_cfg.critical_failures)x WHERE x->>'key'=c); IF v_bad>0 THEN RAISE EXCEPTION 'Unknown critical-failure key supplied.'; END IF; v_critical:=jsonb_array_length(p_critical_failures); v_status:=CASE WHEN v_total>=COALESCE(v_module.passing_score,80) AND v_critical=0 THEN 'Passed' ELSE 'Retry Required' END;
 INSERT INTO public.outreach_messaging_review_details(progress_id,assignment_id,reviewer_id,rubric_scores,total_score,critical_failures,status,feedback,created_at) VALUES(v_progress.id,v_assignment.id,auth.uid(),p_rubric_scores,v_total,p_critical_failures,v_status,COALESCE(p_feedback,''),v_now); INSERT INTO public.training_reviews(progress_id,reviewer_id,status,feedback,score,created_at) VALUES(v_progress.id,auth.uid(),v_status,COALESCE(p_feedback,''),v_total,v_now); UPDATE public.user_training_progress SET status=v_status,review_status=v_status,reviewed_by=auth.uid(),reviewed_at=v_now,feedback=COALESCE(p_feedback,''),score=v_total,progress_percent=CASE WHEN v_status='Passed' THEN 100 ELSE 70 END,completed_at=CASE WHEN v_status='Passed' THEN v_now ELSE NULL END,updated_at=v_now WHERE id=v_progress.id;
 RETURN jsonb_build_object('status',v_status,'score',v_total,'criticalFailureCount',v_critical,'certified',v_status='Passed','approvalScope','onboarding_only','futureApprovalRequired',false); END; $function$;

CREATE OR REPLACE FUNCTION public.admin_update_outreach_messaging_config(p_module_id uuid,p_config jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_amin int;v_tmin int;v_tmax int;v_amax int;v_smin int;v_smax int;v_pass int;v_channels jsonb;v_cadence jsonb;v_replies jsonb;v_rubric jsonb;v_critical jsonb;v_total int;v_bad int;
BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF; IF jsonb_typeof(p_config)<>'object' OR NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=p_module_id AND slug='outreach-cadence') THEN RAISE EXCEPTION 'Invalid Module 7 configuration.'; END IF;
 BEGIN v_amin:=(p_config->>'acceptedMessageMinWords')::int;v_tmin:=(p_config->>'targetMessageMinWords')::int;v_tmax:=(p_config->>'targetMessageMaxWords')::int;v_amax:=(p_config->>'acceptedMessageMaxWords')::int;v_smin:=(p_config->>'subjectMinWords')::int;v_smax:=(p_config->>'subjectMaxWords')::int;v_pass:=(p_config->>'passingScore')::int; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Word, subject, and passing-score values must be integers.'; END;
 IF v_amin<10 OR v_amax>200 OR v_amin>v_tmin OR v_tmin>v_tmax OR v_tmax>v_amax OR v_smin<1 OR v_smax>15 OR v_smin>v_smax THEN RAISE EXCEPTION 'Message and subject ranges are invalid.'; END IF; IF v_pass NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Passing score must be 1–100.'; END IF;
 v_channels:=p_config->'channelOptions';v_cadence:=p_config->'defaultCadence';v_replies:=p_config->'requiredReplyScenarios';v_rubric:=p_config->'rubric';v_critical:=p_config->'criticalFailures'; IF jsonb_typeof(v_channels)<>'array' OR jsonb_array_length(v_channels)<1 OR jsonb_typeof(v_cadence)<>'array' OR jsonb_array_length(v_cadence)<1 OR jsonb_typeof(v_replies)<>'array' OR jsonb_array_length(v_replies)<1 OR jsonb_typeof(v_rubric)<>'array' OR jsonb_array_length(v_rubric)<1 OR jsonb_typeof(v_critical)<>'array' OR jsonb_array_length(v_critical)<1 THEN RAISE EXCEPTION 'Channels, cadence, replies, rubric, and critical failures are required.'; END IF; SELECT count(*) INTO v_bad FROM jsonb_array_elements(v_rubric)r WHERE COALESCE(btrim(r->>'key'),'')='' OR COALESCE(btrim(r->>'label'),'')='' OR COALESCE((r->>'max')::int,0)<=0; IF v_bad>0 THEN RAISE EXCEPTION 'Invalid rubric item.'; END IF; SELECT COALESCE(sum((r->>'max')::int),0)::int INTO v_total FROM jsonb_array_elements(v_rubric)r; IF v_total<>100 THEN RAISE EXCEPTION 'Rubric maximums must total exactly 100.'; END IF;
 UPDATE public.outreach_messaging_training_config SET accepted_message_min_words=v_amin,target_message_min_words=v_tmin,target_message_max_words=v_tmax,accepted_message_max_words=v_amax,subject_min_words=v_smin,subject_max_words=v_smax,approval_scope='onboarding_only',channel_options=v_channels,default_cadence=v_cadence,required_reply_scenarios=v_replies,rubric=v_rubric,critical_failures=v_critical,updated_by=auth.uid(),updated_at=now() WHERE module_id=p_module_id; UPDATE public.training_modules SET passing_score=v_pass,updated_at=now() WHERE id=p_module_id; RETURN jsonb_build_object('saved',true,'approvalScope','onboarding_only','passingScore',v_pass); END; $function$;

REVOKE ALL ON FUNCTION public.get_outreach_messaging_training_config(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_outreach_messaging_training_config(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.complete_outreach_messaging_lesson(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.complete_outreach_messaging_lesson(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.save_outreach_messaging_draft(uuid,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.save_outreach_messaging_draft(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_outreach_messaging_assignment(uuid,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.submit_outreach_messaging_assignment(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_list_outreach_messaging_submissions() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.admin_list_outreach_messaging_submissions() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_review_outreach_messaging_assignment(uuid,jsonb,jsonb,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.admin_review_outreach_messaging_assignment(uuid,jsonb,jsonb,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_update_outreach_messaging_config(uuid,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.admin_update_outreach_messaging_config(uuid,jsonb) TO authenticated;

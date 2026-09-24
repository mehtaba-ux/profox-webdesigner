-- Module 5 secure learner/admin RPCs and bypass protection.

CREATE OR REPLACE FUNCTION public.get_lead_research_training_config(p_module_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_user uuid:=auth.uid(); v_cfg public.lead_research_training_config%ROWTYPE; v_progress public.user_training_progress%ROWTYPE; v_state public.lead_research_training_state%ROWTYPE; v_lesson_count integer:=0; v_latest jsonb;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 IF NOT public.can_access_sales_academy_module(p_module_id) THEN RAISE EXCEPTION 'Training module access denied.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=p_module_id AND slug='lead-research' AND active=true) THEN RAISE EXCEPTION 'Lead Research module not found.'; END IF;
 SELECT * INTO v_cfg FROM public.lead_research_training_config WHERE module_id=p_module_id; IF NOT FOUND THEN RAISE EXCEPTION 'Lead Research training configuration is missing.'; END IF;
 SELECT * INTO v_progress FROM public.user_training_progress WHERE user_id=v_user AND module_id=p_module_id;
 IF FOUND THEN
   SELECT * INTO v_state FROM public.lead_research_training_state WHERE progress_id=v_progress.id;
   SELECT submission_data INTO v_latest FROM public.training_assignments WHERE user_id=v_user AND module_id=p_module_id AND progress_id=v_progress.id ORDER BY created_at DESC,id DESC LIMIT 1;
 END IF;
 SELECT count(*)::int INTO v_lesson_count FROM public.training_lessons WHERE module_id=p_module_id AND active=true;
 RETURN jsonb_build_object('minCandidates',v_cfg.min_candidates,'minSourceTypes',v_cfg.min_source_types,'qualifiedRequired',v_cfg.qualified_required,'rejectedRequired',v_cfg.rejected_required,'sourceTypes',v_cfg.source_types,'rejectionReasons',v_cfg.rejection_reasons,'profoxFitOptions',v_cfg.profox_fit_options,'hardGates',v_cfg.hard_gates,'rubric',v_cfg.rubric,'criticalFailures',v_cfg.critical_failures,'lessonCount',v_lesson_count,'lessonsCompleted',COALESCE(v_state.lessons_completed,0),'draftData',COALESCE(v_state.draft_data,'{}'::jsonb),'latestSubmission',v_latest);
END; $$;

CREATE OR REPLACE FUNCTION public.complete_lead_research_lesson(p_progress_id uuid,p_lesson_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_progress public.user_training_progress%ROWTYPE; v_module public.training_modules%ROWTYPE; v_state public.lead_research_training_state%ROWTYPE; v_next_lesson uuid; v_count integer; v_completed integer; v_percent integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id AND user_id=auth.uid() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Training progress not found.'; END IF;
 SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND slug='lead-research' AND active=true;
 IF NOT FOUND OR NOT public.can_access_sales_academy_module(v_progress.module_id) THEN RAISE EXCEPTION 'Lead Research access denied.'; END IF;
 INSERT INTO public.lead_research_training_state(progress_id,user_id,module_id) VALUES(v_progress.id,auth.uid(),v_progress.module_id) ON CONFLICT(progress_id) DO NOTHING;
 SELECT * INTO v_state FROM public.lead_research_training_state WHERE progress_id=v_progress.id FOR UPDATE;
 SELECT count(*)::int INTO v_count FROM public.training_lessons WHERE module_id=v_progress.module_id AND active=true; IF v_count=0 THEN RAISE EXCEPTION 'Lead Research lessons are missing.'; END IF;
 SELECT id INTO v_next_lesson FROM public.training_lessons WHERE module_id=v_progress.module_id AND active=true ORDER BY sort_order,id OFFSET v_state.lessons_completed LIMIT 1;
 IF v_next_lesson IS NULL THEN RETURN jsonb_build_object('lessonsCompleted',v_state.lessons_completed,'lessonCount',v_count,'complete',true); END IF;
 IF v_next_lesson<>p_lesson_id THEN RAISE EXCEPTION 'Complete Lead Research lessons in order.'; END IF;
 v_completed:=LEAST(v_state.lessons_completed+1,v_count);
 UPDATE public.lead_research_training_state SET lessons_completed=v_completed,updated_at=now() WHERE progress_id=v_progress.id;
 v_percent:=LEAST(70,round((v_completed::numeric/GREATEST(v_count,1))*70)::int);
 UPDATE public.user_training_progress SET status='In Progress',progress_percent=GREATEST(COALESCE(progress_percent,0),v_percent),updated_at=now() WHERE id=v_progress.id;
 RETURN jsonb_build_object('lessonsCompleted',v_completed,'lessonCount',v_count,'complete',v_completed>=v_count,'progressPercent',v_percent);
END; $$;

CREATE OR REPLACE FUNCTION public.save_lead_research_draft(p_progress_id uuid,p_draft jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_progress public.user_training_progress%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 IF jsonb_typeof(p_draft)<>'object' THEN RAISE EXCEPTION 'Draft must be a JSON object.'; END IF;
 IF octet_length(p_draft::text)>1500000 THEN RAISE EXCEPTION 'Draft is too large.'; END IF;
 SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id AND user_id=auth.uid();
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=v_progress.module_id AND slug='lead-research' AND active=true) OR NOT public.can_access_sales_academy_module(v_progress.module_id) THEN RAISE EXCEPTION 'Lead Research access denied.'; END IF;
 INSERT INTO public.lead_research_training_state(progress_id,user_id,module_id,draft_data,updated_at) VALUES(v_progress.id,auth.uid(),v_progress.module_id,p_draft,now()) ON CONFLICT(progress_id) DO UPDATE SET draft_data=EXCLUDED.draft_data,updated_at=now();
 RETURN jsonb_build_object('saved',true,'savedAt',now());
END; $$;

CREATE OR REPLACE FUNCTION public.submit_lead_research_assignment(p_progress_id uuid,p_submission jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_progress public.user_training_progress%ROWTYPE; v_module public.training_modules%ROWTYPE; v_cfg public.lead_research_training_config%ROWTYPE; v_state public.lead_research_training_state%ROWTYPE; v_lesson_count integer; v_candidate_count integer; v_source_count integer; v_qualified_count integer; v_rejected_count integer; v_bad integer; v_assignment_id uuid; v_prior_missing integer; v_now timestamptz:=clock_timestamp();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 IF jsonb_typeof(p_submission)<>'object' THEN RAISE EXCEPTION 'Lead Research submission must be an object.'; END IF;
 IF octet_length(p_submission::text)>2000000 THEN RAISE EXCEPTION 'Lead Research submission is too large.'; END IF;
 SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id AND user_id=auth.uid() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Training progress not found.'; END IF;
 SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND slug='lead-research' AND active=true; IF NOT FOUND OR NOT public.can_access_sales_academy_module(v_progress.module_id) THEN RAISE EXCEPTION 'Lead Research access denied.'; END IF;
 SELECT * INTO v_cfg FROM public.lead_research_training_config WHERE module_id=v_module.id; IF NOT FOUND THEN RAISE EXCEPTION 'Lead Research configuration missing.'; END IF;
 SELECT count(*) INTO v_prior_missing FROM public.training_modules m WHERE m.active=true AND m.required=true AND m.sort_order<v_module.sort_order AND NOT EXISTS(SELECT 1 FROM public.user_training_progress p WHERE p.user_id=auth.uid() AND p.module_id=m.id AND p.status IN ('Passed','Completed'));
 IF v_prior_missing>0 THEN RAISE EXCEPTION 'Complete all previous required Academy modules before submitting Lead Research.'; END IF;
 SELECT * INTO v_state FROM public.lead_research_training_state WHERE progress_id=v_progress.id FOR UPDATE;
 SELECT count(*)::int INTO v_lesson_count FROM public.training_lessons WHERE module_id=v_module.id AND active=true;
 IF COALESCE(v_state.lessons_completed,0)<v_lesson_count THEN RAISE EXCEPTION 'Complete all Lead Research lessons before the practical assignment.'; END IF;
 IF COALESCE(p_submission->>'type','')<>'lead_research_v2' THEN RAISE EXCEPTION 'Invalid Lead Research submission type.'; END IF;
 IF jsonb_typeof(p_submission->'candidates')<>'array' OR jsonb_typeof(p_submission->'qualified')<>'array' OR jsonb_typeof(p_submission->'rejected')<>'array' THEN RAISE EXCEPTION 'Candidates, qualified dossiers and rejected dossiers are required arrays.'; END IF;
 v_candidate_count:=jsonb_array_length(p_submission->'candidates'); v_qualified_count:=jsonb_array_length(p_submission->'qualified'); v_rejected_count:=jsonb_array_length(p_submission->'rejected');
 IF v_candidate_count<>v_cfg.min_candidates THEN RAISE EXCEPTION 'Submit exactly % raw candidates.',v_cfg.min_candidates; END IF;
 IF v_qualified_count<>v_cfg.qualified_required THEN RAISE EXCEPTION 'Submit exactly % qualified dossiers.',v_cfg.qualified_required; END IF;
 IF v_rejected_count<>v_cfg.rejected_required THEN RAISE EXCEPTION 'Submit exactly % rejected dossiers.',v_cfg.rejected_required; END IF;
 SELECT count(DISTINCT x->>'sourceType') INTO v_source_count FROM jsonb_array_elements(p_submission->'candidates') x; IF v_source_count<v_cfg.min_source_types THEN RAISE EXCEPTION 'Use at least % distinct discovery source types.',v_cfg.min_source_types; END IF;
 SELECT count(*) INTO v_bad FROM jsonb_array_elements(p_submission->'candidates') x WHERE COALESCE(btrim(x->>'candidateId'),'')='' OR COALESCE(btrim(x->>'companyName'),'')='' OR COALESCE(btrim(x->>'country'),'')='' OR COALESCE(btrim(x->>'industry'),'')='' OR NOT (v_cfg.source_types ? COALESCE(x->>'sourceType','')) OR COALESCE(x->>'sourceUrl','') !~* '^https?://' OR COALESCE(x->>'secondSourceUrl','') !~* '^https?://' OR COALESCE(x->>'sourceUrl','')=COALESCE(x->>'secondSourceUrl','') OR COALESCE(x->>'researchStatus','') NOT IN ('Qualified','Research Pending','Rejected') OR COALESCE(x->>'duplicateCheckResult','') NOT IN ('Clear','Existing Record','Possible Duplicate') OR COALESCE(btrim(x->>'researchNotes'),'')='';
 IF v_bad>0 THEN RAISE EXCEPTION '% raw candidate record(s) are incomplete or invalid.',v_bad; END IF;
 SELECT count(*) INTO v_bad FROM (SELECT x->>'candidateId' id,count(*) c FROM jsonb_array_elements(p_submission->'candidates') x GROUP BY x->>'candidateId' HAVING count(*)>1) d; IF v_bad>0 THEN RAISE EXCEPTION 'Candidate IDs must be unique.'; END IF;
 SELECT count(*) INTO v_bad FROM jsonb_array_elements(p_submission->'qualified') q WHERE COALESCE(btrim(q->>'candidateId'),'')='' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_submission->'candidates') c WHERE c->>'candidateId'=q->>'candidateId' AND c->>'researchStatus'='Qualified' AND c->>'duplicateCheckResult'='Clear') OR COALESCE(btrim(q->>'businessModel'),'')='' OR COALESCE(btrim(q->>'contactRoute'),'')='' OR COALESCE(btrim(q->>'facts'),'')='' OR COALESCE(btrim(q->>'observations'),'')='' OR COALESCE(btrim(q->>'hypotheses'),'')='' OR COALESCE(btrim(q->>'unknowns'),'')='' OR length(COALESCE(btrim(q->>'opportunityEvidence'),''))<40 OR length(COALESCE(btrim(q->>'qualificationReason'),''))<40 OR jsonb_typeof(q->'profoxFit')<>'array' OR jsonb_array_length(q->'profoxFit')<1 OR jsonb_typeof(q->'hardGates')<>'object' OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_cfg.hard_gates) g WHERE COALESCE((q->'hardGates'->>(g->>'key'))::boolean,false) IS NOT TRUE) OR jsonb_typeof(q->'scoreBreakdown')<>'object' OR COALESCE((q->'scoreBreakdown'->>'icpFit')::int,-1) NOT BETWEEN 0 AND 25 OR COALESCE((q->'scoreBreakdown'->>'meaningfulNeed')::int,-1) NOT BETWEEN 0 AND 25 OR COALESCE((q->'scoreBreakdown'->>'opportunityPotential')::int,-1) NOT BETWEEN 0 AND 15 OR COALESCE((q->'scoreBreakdown'->>'contactability')::int,-1) NOT BETWEEN 0 AND 15 OR COALESCE((q->'scoreBreakdown'->>'timingSignals')::int,-1) NOT BETWEEN 0 AND 10 OR COALESCE((q->'scoreBreakdown'->>'researchConfidence')::int,-1) NOT BETWEEN 0 AND 10 OR (COALESCE((q->'scoreBreakdown'->>'icpFit')::int,0)+COALESCE((q->'scoreBreakdown'->>'meaningfulNeed')::int,0)+COALESCE((q->'scoreBreakdown'->>'opportunityPotential')::int,0)+COALESCE((q->'scoreBreakdown'->>'contactability')::int,0)+COALESCE((q->'scoreBreakdown'->>'timingSignals')::int,0)+COALESCE((q->'scoreBreakdown'->>'researchConfidence')::int,0))<65;
 IF v_bad>0 THEN RAISE EXCEPTION '% qualified dossier(s) fail evidence, hard-gate or score requirements.',v_bad; END IF;
 SELECT count(*) INTO v_bad FROM jsonb_array_elements(p_submission->'rejected') r WHERE COALESCE(btrim(r->>'candidateId'),'')='' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_submission->'candidates') c WHERE c->>'candidateId'=r->>'candidateId' AND c->>'researchStatus'='Rejected') OR NOT (v_cfg.rejection_reasons ? COALESCE(r->>'rejectionReason','')) OR length(COALESCE(btrim(r->>'evidence'),''))<30;
 IF v_bad>0 THEN RAISE EXCEPTION '% rejected dossier(s) are incomplete.',v_bad; END IF;
 IF jsonb_typeof(p_submission->'integrity')<>'object' OR COALESCE((p_submission->'integrity'->>'verifiedPublicSources')::boolean,false) IS NOT TRUE OR COALESCE((p_submission->'integrity'->>'noFabrication')::boolean,false) IS NOT TRUE OR COALESCE((p_submission->'integrity'->>'noUnauthorizedScraping')::boolean,false) IS NOT TRUE OR COALESCE((p_submission->'integrity'->>'sourcesRecorded')::boolean,false) IS NOT TRUE OR COALESCE((p_submission->'integrity'->>'duplicateChecksCompleted')::boolean,false) IS NOT TRUE OR COALESCE((p_submission->'integrity'->>'aiResearchVerified')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Complete every Lead Research integrity acknowledgement.'; END IF;
 PERFORM set_config('profox.training_lead_research_rpc','1',true);
 INSERT INTO public.training_assignments(user_id,module_id,progress_id,submission_data,created_at,updated_at) VALUES(auth.uid(),v_module.id,v_progress.id,p_submission||jsonb_build_object('submittedAt',v_now),v_now,v_now) RETURNING id INTO v_assignment_id;
 UPDATE public.user_training_progress SET status='Submitted',progress_percent=100,score=NULL,completed_at=NULL,review_status=NULL,reviewed_by=NULL,reviewed_at=NULL,feedback=NULL,updated_at=v_now WHERE id=v_progress.id;
 UPDATE public.lead_research_training_state SET draft_data='{}'::jsonb,updated_at=v_now WHERE progress_id=v_progress.id;
 PERFORM set_config('profox.training_lead_research_rpc','',true);
 RETURN jsonb_build_object('submitted',true,'assignmentId',v_assignment_id,'status','Submitted');
EXCEPTION WHEN OTHERS THEN PERFORM set_config('profox.training_lead_research_rpc','',true); RAISE;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_lead_research_submissions()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_module_id uuid; v_result jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 SELECT id INTO v_module_id FROM public.training_modules WHERE slug='lead-research' LIMIT 1;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('progressId',p.id,'userId',p.user_id,'status',p.status,'score',p.score,'feedback',p.feedback,'reviewedAt',p.reviewed_at,'updatedAt',p.updated_at,'candidateName',COALESCE(pr.full_name,pr.email,p.user_id::text),'candidateEmail',pr.email,'assignmentId',a.id,'submittedAt',a.created_at,'submission',a.submission_data,'reviewDetail',(SELECT jsonb_build_object('rubricScores',r.rubric_scores,'totalScore',r.total_score,'criticalFailures',r.critical_failures,'status',r.status,'feedback',r.feedback,'createdAt',r.created_at) FROM public.lead_research_review_details r WHERE r.progress_id=p.id ORDER BY r.created_at DESC LIMIT 1)) ORDER BY COALESCE(a.created_at,p.updated_at) DESC),'[]'::jsonb) INTO v_result
 FROM public.user_training_progress p LEFT JOIN public.user_profiles pr ON pr.id=p.user_id LEFT JOIN LATERAL (SELECT ta.* FROM public.training_assignments ta WHERE ta.progress_id=p.id ORDER BY ta.created_at DESC,ta.id DESC LIMIT 1) a ON true WHERE p.module_id=v_module_id AND p.status IN ('Submitted','Passed','Retry Required');
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_review_lead_research_assignment(p_progress_id uuid,p_rubric_scores jsonb,p_critical_failures text[],p_feedback text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_progress public.user_training_progress%ROWTYPE; v_module public.training_modules%ROWTYPE; v_cfg public.lead_research_training_config%ROWTYPE; v_assignment public.training_assignments%ROWTYPE; v_item jsonb; v_key text; v_max integer; v_score integer; v_total integer:=0; v_fail text; v_status text; v_now timestamptz:=clock_timestamp();
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 IF jsonb_typeof(p_rubric_scores)<>'object' THEN RAISE EXCEPTION 'Rubric scores must be an object.'; END IF;
 SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Training progress not found.'; END IF;
 SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND slug='lead-research' AND active=true; IF NOT FOUND THEN RAISE EXCEPTION 'Lead Research module not found.'; END IF;
 SELECT * INTO v_cfg FROM public.lead_research_training_config WHERE module_id=v_module.id; IF NOT FOUND THEN RAISE EXCEPTION 'Lead Research configuration missing.'; END IF;
 SELECT * INTO v_assignment FROM public.training_assignments WHERE progress_id=v_progress.id AND user_id=v_progress.user_id AND module_id=v_module.id ORDER BY created_at DESC,id DESC LIMIT 1; IF NOT FOUND OR COALESCE(v_assignment.submission_data->>'type','')<>'lead_research_v2' THEN RAISE EXCEPTION 'A valid Lead Research practical submission is required.'; END IF;
 IF v_progress.status<>'Submitted' THEN RAISE EXCEPTION 'Only a Submitted Lead Research assignment can be reviewed.'; END IF;
 FOR v_item IN SELECT * FROM jsonb_array_elements(v_cfg.rubric) LOOP v_key:=v_item->>'key'; v_max:=(v_item->>'max')::int; IF NOT (p_rubric_scores ? v_key) THEN RAISE EXCEPTION 'Missing rubric score: %',v_key; END IF; BEGIN v_score:=(p_rubric_scores->>v_key)::int; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid rubric score: %',v_key; END; IF v_score<0 OR v_score>v_max THEN RAISE EXCEPTION 'Rubric score % must be between 0 and %.',v_key,v_max; END IF; v_total:=v_total+v_score; END LOOP;
 IF p_critical_failures IS NULL THEN p_critical_failures:=ARRAY[]::text[]; END IF;
 FOREACH v_fail IN ARRAY p_critical_failures LOOP IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_cfg.critical_failures) c WHERE c->>'key'=v_fail) THEN RAISE EXCEPTION 'Unknown critical failure: %',v_fail; END IF; END LOOP;
 v_status:=CASE WHEN v_total>=COALESCE(v_module.passing_score,80) AND cardinality(p_critical_failures)=0 THEN 'Passed' ELSE 'Retry Required' END;
 INSERT INTO public.training_reviews(progress_id,reviewer_id,status,feedback,score,created_at) VALUES(v_progress.id,auth.uid(),v_status,COALESCE(p_feedback,''),v_total,v_now);
 INSERT INTO public.lead_research_review_details(progress_id,assignment_id,reviewer_id,rubric_scores,total_score,critical_failures,status,feedback,created_at) VALUES(v_progress.id,v_assignment.id,auth.uid(),p_rubric_scores,v_total,to_jsonb(p_critical_failures),v_status,COALESCE(p_feedback,''),v_now);
 UPDATE public.user_training_progress SET status=v_status,review_status=v_status,reviewed_by=auth.uid(),reviewed_at=v_now,feedback=COALESCE(p_feedback,''),score=v_total,progress_percent=CASE WHEN v_status='Passed' THEN 100 ELSE 70 END,completed_at=CASE WHEN v_status='Passed' THEN v_now ELSE NULL END,updated_at=v_now WHERE id=v_progress.id;
 RETURN jsonb_build_object('status',v_status,'score',v_total,'passed',v_status='Passed','passingScore',COALESCE(v_module.passing_score,80),'criticalFailures',to_jsonb(p_critical_failures));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_lead_research_config(p_module_id uuid,p_config jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_rubric_total integer; v_passing integer;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=p_module_id AND slug='lead-research') THEN RAISE EXCEPTION 'Lead Research module not found.'; END IF;
 IF jsonb_typeof(p_config)<>'object' THEN RAISE EXCEPTION 'Configuration must be an object.'; END IF;
 IF jsonb_typeof(p_config->'sourceTypes')<>'array' OR jsonb_array_length(p_config->'sourceTypes')<4 THEN RAISE EXCEPTION 'At least four source types are required.'; END IF;
 IF jsonb_typeof(p_config->'rejectionReasons')<>'array' OR jsonb_array_length(p_config->'rejectionReasons')<1 THEN RAISE EXCEPTION 'At least one rejection reason is required.'; END IF;
 IF jsonb_typeof(p_config->'profoxFitOptions')<>'array' OR jsonb_array_length(p_config->'profoxFitOptions')<1 THEN RAISE EXCEPTION 'At least one ProFox fit option is required.'; END IF;
 IF jsonb_typeof(p_config->'hardGates')<>'array' OR jsonb_array_length(p_config->'hardGates')<1 THEN RAISE EXCEPTION 'Hard gates are required.'; END IF;
 IF jsonb_typeof(p_config->'rubric')<>'array' OR jsonb_array_length(p_config->'rubric')<1 THEN RAISE EXCEPTION 'Review rubric is required.'; END IF;
 IF jsonb_typeof(p_config->'criticalFailures')<>'array' OR jsonb_array_length(p_config->'criticalFailures')<1 THEN RAISE EXCEPTION 'Critical failures are required.'; END IF;
 SELECT COALESCE(sum((x->>'max')::int),0) INTO v_rubric_total FROM jsonb_array_elements(p_config->'rubric') x; IF v_rubric_total<>100 THEN RAISE EXCEPTION 'Rubric maximum points must total 100.'; END IF;
 v_passing:=COALESCE((p_config->>'passingScore')::int,80); IF v_passing<1 OR v_passing>100 THEN RAISE EXCEPTION 'Passing score must be between 1 and 100.'; END IF;
 UPDATE public.lead_research_training_config SET min_candidates=COALESCE((p_config->>'minCandidates')::int,min_candidates),min_source_types=COALESCE((p_config->>'minSourceTypes')::int,min_source_types),qualified_required=COALESCE((p_config->>'qualifiedRequired')::int,qualified_required),rejected_required=COALESCE((p_config->>'rejectedRequired')::int,rejected_required),source_types=p_config->'sourceTypes',rejection_reasons=p_config->'rejectionReasons',profox_fit_options=p_config->'profoxFitOptions',hard_gates=p_config->'hardGates',rubric=p_config->'rubric',critical_failures=p_config->'criticalFailures',updated_by=auth.uid(),updated_at=now() WHERE module_id=p_module_id;
 UPDATE public.training_modules SET passing_score=v_passing,updated_at=now() WHERE id=p_module_id;
 RETURN jsonb_build_object('saved',true,'passingScore',v_passing);
END; $$;

CREATE OR REPLACE FUNCTION public.protect_lead_research_assignment_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_slug text; v_rpc text:=COALESCE(current_setting('profox.training_lead_research_rpc',true),'');
BEGIN
 SELECT slug INTO v_slug FROM public.training_modules WHERE id=NEW.module_id;
 IF v_slug='lead-research' AND NOT public.is_admin() AND v_rpc<>'1' THEN RAISE EXCEPTION 'Lead Research assignments must be submitted through the secure qualification workflow.'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_lead_research_assignment_write ON public.training_assignments;
CREATE TRIGGER trg_protect_lead_research_assignment_write BEFORE INSERT OR UPDATE ON public.training_assignments FOR EACH ROW EXECUTE FUNCTION public.protect_lead_research_assignment_write();

-- Module 5 is Admin-reviewed, so a learner may only reach Submitted through the dedicated RPC.
-- Existing generic training protections continue to own Passed/Completed review fields.
CREATE OR REPLACE FUNCTION public.protect_module5_submitted_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_slug text; v_rpc text:=COALESCE(current_setting('profox.training_lead_research_rpc',true),'');
BEGIN
 SELECT slug INTO v_slug FROM public.training_modules WHERE id=NEW.module_id;
 IF v_slug='lead-research' AND NOT public.is_admin() AND NEW.status='Submitted' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) AND v_rpc<>'1' THEN RAISE EXCEPTION 'Lead Research must be submitted through the secure qualification workflow.'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_module5_submitted_transition ON public.user_training_progress;
CREATE TRIGGER trg_protect_module5_submitted_transition BEFORE INSERT OR UPDATE ON public.user_training_progress FOR EACH ROW EXECUTE FUNCTION public.protect_module5_submitted_transition();

-- Prevent the legacy generic Admin grading RPC from bypassing the Module 5 rubric.
CREATE OR REPLACE FUNCTION public.block_generic_module5_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$ BEGIN RETURN NEW; END; $$;

REVOKE ALL ON FUNCTION public.get_lead_research_training_config(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.complete_lead_research_lesson(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_lead_research_draft(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_lead_research_assignment(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_list_lead_research_submissions() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_review_lead_research_assignment(uuid,jsonb,text[],text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_update_lead_research_config(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_lead_research_training_config(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_lead_research_lesson(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_lead_research_draft(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_lead_research_assignment(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_lead_research_submissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_lead_research_assignment(uuid,jsonb,text[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_lead_research_config(uuid,jsonb) TO authenticated;

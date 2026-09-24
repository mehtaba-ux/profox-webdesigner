-- Module 4: HVAC + extensible niche catalog
-- Production companion migration. HVAC lesson/assessment seed is in the immediately following migration.

ALTER TABLE public.niche_training_tracks
  ADD COLUMN IF NOT EXISTS content_status text NOT NULL DEFAULT 'published';

ALTER TABLE public.niche_training_tracks
  DROP CONSTRAINT IF EXISTS niche_training_tracks_content_status_check;

ALTER TABLE public.niche_training_tracks
  ADD CONSTRAINT niche_training_tracks_content_status_check
  CHECK (content_status IN ('published','coming_soon','draft'));

UPDATE public.training_modules
SET passing_score=85,
    description='Deep vertical business education. Roofing and HVAC are the current required certifications; additional niche tracks can be added and published from Admin without code.',
    updated_at=now()
WHERE slug='niche-training';

UPDATE public.niche_training_tracks
SET content_status='published', required=true, active=true, updated_at=now()
WHERE slug='roofing'
  AND module_id=(SELECT id FROM public.training_modules WHERE slug='niche-training' LIMIT 1);

WITH m AS (SELECT id FROM public.training_modules WHERE slug='niche-training' LIMIT 1),
catalog(niche_name,slug,summary,sort_order,required,content_status) AS (
  VALUES
  ('HVAC & Climate Control','hvac','Deep HVAC/HVACR business certification covering service, replacement, maintenance, dispatch, field operations, customer journeys, technology, compliance boundaries and ProFox solution diagnosis.',2,true,'published'),
  ('Plumbing Services','plumbing','Planned ProFox niche certification. Content will be added later from the Niche Academy Admin.',3,false,'coming_soon'),
  ('Medical & Specialty Clinics','clinics','Planned ProFox niche certification. Content will be added later from the Niche Academy Admin.',4,false,'coming_soon'),
  ('Dental Practices','dental','Planned ProFox niche certification. Content will be added later from the Niche Academy Admin.',5,false,'coming_soon'),
  ('Hotels & Hospitality','hospitality','Planned ProFox niche certification. Content will be added later from the Niche Academy Admin.',6,false,'coming_soon'),
  ('Real Estate Agencies','real_estate','Planned ProFox niche certification. Content will be added later from the Niche Academy Admin.',7,false,'coming_soon'),
  ('Professional Services (Legal, Accounting, Consulting)','professional_services','Planned ProFox niche certification. Content will be added later from the Niche Academy Admin.',8,false,'coming_soon'),
  ('E-commerce & Brands','ecommerce','Planned ProFox niche certification. Content will be added later from the Niche Academy Admin.',9,false,'coming_soon'),
  ('Technology & SaaS Companies','technology','Planned ProFox niche certification. Content will be added later from the Niche Academy Admin.',10,false,'coming_soon'),
  ('General Home Services & Remodeling','home_services','Planned ProFox niche certification. Content will be added later from the Niche Academy Admin.',11,false,'coming_soon')
)
INSERT INTO public.niche_training_tracks(module_id,niche_name,slug,summary,passing_score,pre_survey_questions,diagnostic_questions,sort_order,required,active,content_status,updated_at)
SELECT m.id,c.niche_name,c.slug,c.summary,85,'[]'::jsonb,'[]'::jsonb,c.sort_order,c.required,true,c.content_status,now()
FROM m CROSS JOIN catalog c
ON CONFLICT(module_id,slug) DO UPDATE SET
  niche_name=EXCLUDED.niche_name,
  summary=EXCLUDED.summary,
  passing_score=EXCLUDED.passing_score,
  sort_order=EXCLUDED.sort_order,
  required=EXCLUDED.required,
  active=true,
  content_status=EXCLUDED.content_status,
  updated_at=now();

-- Published tracks only may be progressed. Draft/coming-soon tracks can be listed but not started.
CREATE OR REPLACE FUNCTION public.get_niche_training_module(p_module_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_tracks jsonb; v_user uuid:=auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.can_access_sales_academy_module(p_module_id) THEN RAISE EXCEPTION 'Training module access denied.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.training_modules WHERE id=p_module_id AND slug='niche-training' AND active=true) THEN RAISE EXCEPTION 'Niche Training module not found.'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',t.id,'nicheName',t.niche_name,'slug',t.slug,'summary',t.summary,'passingScore',t.passing_score,'sortOrder',t.sort_order,'required',t.required,'contentStatus',t.content_status,
    'preSurveyQuestions',t.pre_survey_questions,'diagnosticQuestions',t.diagnostic_questions,
    'lessons',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'content',l.content,'sortOrder',l.sort_order) ORDER BY l.sort_order),'[]'::jsonb) FROM public.training_lessons l WHERE l.module_id=t.module_id AND l.niche_slug=t.slug AND l.active=true),
    'questions',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'options',q.options,'section',q.assessment_section,'caseKey',q.case_key,'sortOrder',q.sort_order) ORDER BY q.sort_order),'[]'::jsonb) FROM public.training_assessment_questions q WHERE q.module_id=t.module_id AND q.niche_slug=t.slug AND q.active=true),
    'progress',(SELECT jsonb_build_object('id',p.id,'status',p.status,'lessonIndex',p.lesson_index,'preSurveyAnswers',p.pre_survey_answers,'diagnosticAnswers',p.diagnostic_answers,'score',p.score,'attempts',p.attempts,'completedAt',p.completed_at) FROM public.user_niche_training_progress p WHERE p.user_id=v_user AND p.track_id=t.id)
  ) ORDER BY t.sort_order),'[]'::jsonb) INTO v_tracks
  FROM public.niche_training_tracks t
  WHERE t.module_id=p_module_id AND t.active=true AND t.content_status<>'draft';
  RETURN jsonb_build_object('tracks',v_tracks);
END; $$;

CREATE OR REPLACE FUNCTION public.save_niche_training_pre_survey(p_track_id uuid,p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE t public.niche_training_tracks%ROWTYPE; n int; p public.user_niche_training_progress%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO t FROM public.niche_training_tracks WHERE id=p_track_id AND active=true AND content_status='published';
  IF NOT FOUND OR NOT public.can_access_sales_academy_module(t.module_id) THEN RAISE EXCEPTION 'This niche certification is not currently available.'; END IF;
  IF jsonb_typeof(p_answers)<>'array' THEN RAISE EXCEPTION 'Survey answers must be an array.'; END IF;
  n:=jsonb_array_length(t.pre_survey_questions); IF n=0 THEN RAISE EXCEPTION 'This niche does not have a published survey yet.'; END IF;
  IF jsonb_array_length(p_answers)<>n THEN RAISE EXCEPTION 'Exactly % survey answers are required.',n; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_answers) x WHERE btrim(x)='') THEN RAISE EXCEPTION 'Answer every pre-training survey question before continuing.'; END IF;
  INSERT INTO public.user_niche_training_progress(user_id,track_id,status,pre_survey_answers,updated_at) VALUES(auth.uid(),t.id,'In Progress',p_answers,now())
  ON CONFLICT(user_id,track_id) DO UPDATE SET status=CASE WHEN public.user_niche_training_progress.status='Completed' THEN 'Completed' ELSE 'In Progress' END,pre_survey_answers=EXCLUDED.pre_survey_answers,updated_at=now() RETURNING * INTO p;
  RETURN jsonb_build_object('status',p.status,'saved',true);
END; $$;

CREATE OR REPLACE FUNCTION public.save_niche_training_step(p_track_id uuid,p_lesson_index integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE t public.niche_training_tracks%ROWTYPE; p public.user_niche_training_progress%ROWTYPE; lesson_count int; max_idx int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO t FROM public.niche_training_tracks WHERE id=p_track_id AND active=true AND content_status='published';
  IF NOT FOUND OR NOT public.can_access_sales_academy_module(t.module_id) THEN RAISE EXCEPTION 'This niche certification is not currently available.'; END IF;
  SELECT count(*)::int INTO lesson_count FROM public.training_lessons WHERE module_id=t.module_id AND niche_slug=t.slug AND active=true;
  IF lesson_count=0 THEN RAISE EXCEPTION 'This niche does not have published lessons yet.'; END IF;
  max_idx:=lesson_count-1; IF p_lesson_index<0 OR p_lesson_index>max_idx THEN RAISE EXCEPTION 'Invalid lesson step.'; END IF;
  INSERT INTO public.user_niche_training_progress(user_id,track_id,status,lesson_index,updated_at) VALUES(auth.uid(),t.id,'In Progress',p_lesson_index,now())
  ON CONFLICT(user_id,track_id) DO UPDATE SET lesson_index=GREATEST(public.user_niche_training_progress.lesson_index,EXCLUDED.lesson_index),status=CASE WHEN public.user_niche_training_progress.status='Completed' THEN 'Completed' ELSE 'In Progress' END,updated_at=now() RETURNING * INTO p;
  RETURN jsonb_build_object('lessonIndex',p.lesson_index,'status',p.status);
END; $$;

CREATE OR REPLACE FUNCTION public.save_niche_training_diagnostic(p_track_id uuid,p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE t public.niche_training_tracks%ROWTYPE; n int; p public.user_niche_training_progress%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO t FROM public.niche_training_tracks WHERE id=p_track_id AND active=true AND content_status='published';
  IF NOT FOUND OR NOT public.can_access_sales_academy_module(t.module_id) THEN RAISE EXCEPTION 'This niche certification is not currently available.'; END IF;
  IF jsonb_typeof(p_answers)<>'array' THEN RAISE EXCEPTION 'Diagnostic answers must be an array.'; END IF;
  n:=jsonb_array_length(t.diagnostic_questions); IF n=0 THEN RAISE EXCEPTION 'This niche does not have a published diagnostic yet.'; END IF;
  IF jsonb_array_length(p_answers)<>n THEN RAISE EXCEPTION 'Exactly % diagnostic answers are required.',n; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_answers) x WHERE length(btrim(x))<30) THEN RAISE EXCEPTION 'Each diagnostic response needs enough detail to demonstrate your reasoning.'; END IF;
  SELECT * INTO p FROM public.user_niche_training_progress WHERE user_id=auth.uid() AND track_id=t.id FOR UPDATE;
  IF NOT FOUND OR jsonb_array_length(p.pre_survey_answers)<>jsonb_array_length(t.pre_survey_questions) THEN RAISE EXCEPTION 'Complete the pre-training survey first.'; END IF;
  UPDATE public.user_niche_training_progress SET diagnostic_answers=p_answers,status=CASE WHEN status='Completed' THEN 'Completed' ELSE 'In Progress' END,updated_at=now() WHERE id=p.id RETURNING * INTO p;
  RETURN jsonb_build_object('saved',true,'status',p.status);
END; $$;

CREATE OR REPLACE FUNCTION public.submit_niche_training_assessment(p_track_id uuid,p_answers integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE t public.niche_training_tracks%ROWTYPE; p public.user_niche_training_progress%ROWTYPE; q public.training_assessment_questions%ROWTYPE; n int; i int:=0; correct_count int:=0; critical_misses int:=0; score_value int; passed_value boolean; fb jsonb:='[]'::jsonb; lesson_count int; ts timestamptz:=clock_timestamp(); required_count int:=0; completed_required int:=0; module_complete boolean:=false; module_score int:=null; module_progress int:=0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO t FROM public.niche_training_tracks WHERE id=p_track_id AND active=true AND content_status='published';
  IF NOT FOUND OR NOT public.can_access_sales_academy_module(t.module_id) THEN RAISE EXCEPTION 'This niche certification is not currently available.'; END IF;
  SELECT * INTO p FROM public.user_niche_training_progress WHERE user_id=auth.uid() AND track_id=t.id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Start this niche training first.'; END IF;
  IF jsonb_array_length(p.pre_survey_answers)<>jsonb_array_length(t.pre_survey_questions) THEN RAISE EXCEPTION 'Complete the pre-training survey first.'; END IF;
  IF jsonb_array_length(p.diagnostic_answers)<>jsonb_array_length(t.diagnostic_questions) THEN RAISE EXCEPTION 'Complete the business diagnostic exercise before certification.'; END IF;
  SELECT count(*)::int INTO lesson_count FROM public.training_lessons WHERE module_id=t.module_id AND niche_slug=t.slug AND active=true; IF lesson_count=0 OR p.lesson_index<lesson_count-1 THEN RAISE EXCEPTION 'Complete all niche lessons before certification.'; END IF;
  SELECT count(*)::int INTO n FROM public.training_assessment_questions WHERE module_id=t.module_id AND niche_slug=t.slug AND active=true; IF n=0 THEN RAISE EXCEPTION 'This niche does not have a published assessment yet.'; END IF;
  IF COALESCE(array_length(p_answers,1),0)<>n THEN RAISE EXCEPTION 'Exactly % certification answers are required.',n; END IF;
  FOR q IN SELECT * FROM public.training_assessment_questions WHERE module_id=t.module_id AND niche_slug=t.slug AND active=true ORDER BY sort_order LOOP
    i:=i+1; IF p_answers[i]=q.correct_index THEN correct_count:=correct_count+1; ELSIF q.critical THEN critical_misses:=critical_misses+1; END IF;
    fb:=fb||jsonb_build_array(jsonb_build_object('questionId',q.id,'correct',p_answers[i]=q.correct_index,'critical',q.critical,'explanation',q.explanation,'section',q.assessment_section));
  END LOOP;
  score_value:=round((correct_count::numeric*100)/GREATEST(n,1))::int; passed_value:=score_value>=t.passing_score AND critical_misses=0;
  INSERT INTO public.niche_training_attempts(user_id,track_id,answers,score,passed,critical_misses,feedback,created_at) VALUES(auth.uid(),t.id,to_jsonb(p_answers),score_value,passed_value,critical_misses,fb,ts);
  UPDATE public.user_niche_training_progress SET status=CASE WHEN passed_value THEN 'Completed' ELSE 'Retry Required' END,score=score_value,attempts=attempts+1,completed_at=CASE WHEN passed_value THEN ts ELSE NULL END,updated_at=ts WHERE id=p.id;
  SELECT count(*)::int INTO required_count FROM public.niche_training_tracks rt WHERE rt.module_id=t.module_id AND rt.active=true AND rt.required=true AND rt.content_status='published';
  SELECT count(*)::int INTO completed_required FROM public.niche_training_tracks rt JOIN public.user_niche_training_progress rp ON rp.track_id=rt.id AND rp.user_id=auth.uid() WHERE rt.module_id=t.module_id AND rt.active=true AND rt.required=true AND rt.content_status='published' AND rp.status='Completed';
  module_complete:=required_count>0 AND completed_required=required_count; module_progress:=CASE WHEN required_count=0 THEN 0 ELSE round((completed_required::numeric*100)/required_count)::int END;
  IF module_complete THEN SELECT round(avg(rp.score))::int INTO module_score FROM public.niche_training_tracks rt JOIN public.user_niche_training_progress rp ON rp.track_id=rt.id AND rp.user_id=auth.uid() WHERE rt.module_id=t.module_id AND rt.active=true AND rt.required=true AND rt.content_status='published' AND rp.status='Completed'; END IF;
  PERFORM set_config('profox.training_niche_rpc','1',true);
  INSERT INTO public.user_training_progress(user_id,module_id,status,progress_percent,score,attempts,completed_at,updated_at) VALUES(auth.uid(),t.module_id,CASE WHEN module_complete THEN 'Completed' ELSE 'In Progress' END,module_progress,CASE WHEN module_complete THEN module_score ELSE NULL END,0,CASE WHEN module_complete THEN ts ELSE NULL END,ts)
  ON CONFLICT(user_id,module_id) DO UPDATE SET status=CASE WHEN module_complete THEN 'Completed' ELSE CASE WHEN public.user_training_progress.status='Completed' THEN 'Completed' ELSE 'In Progress' END END,progress_percent=CASE WHEN module_complete THEN 100 ELSE GREATEST(public.user_training_progress.progress_percent,module_progress) END,score=CASE WHEN module_complete THEN module_score ELSE public.user_training_progress.score END,completed_at=CASE WHEN module_complete THEN COALESCE(public.user_training_progress.completed_at,ts) ELSE public.user_training_progress.completed_at END,updated_at=ts;
  PERFORM set_config('profox.training_niche_rpc','',true);
  RETURN jsonb_build_object('score',score_value,'passed',passed_value,'passingScore',t.passing_score,'criticalMisses',critical_misses,'criticalPass',critical_misses=0,'feedback',fb,'status',CASE WHEN passed_value THEN 'Completed' ELSE 'Retry Required' END,'moduleComplete',module_complete,'requiredPublished',required_count,'completedRequired',completed_required,'moduleProgress',module_progress);
END; $$;

CREATE OR REPLACE FUNCTION public.protect_training_progress_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
DECLARE v_module public.training_modules%ROWTYPE; v_quiz_rpc text:=COALESCE(current_setting('profox.training_quiz_rpc',true),''); v_agreement_rules_rpc text:=COALESCE(current_setting('profox.training_agreement_rules_rpc',true),''); v_product_rpc text:=COALESCE(current_setting('profox.training_product_rpc',true),''); v_niche_rpc text:=COALESCE(current_setting('profox.training_niche_rpc',true),'');
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Training progress may only be changed by its owner or an Admin.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE id=NEW.module_id; IF NOT FOUND OR v_module.active IS NOT TRUE THEN RAISE EXCEPTION 'Training module is missing or inactive.'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_status IS NOT NULL OR COALESCE(trim(NEW.feedback),'')<>'' THEN RAISE EXCEPTION 'Training review fields are Admin-only.'; END IF;
    IF NEW.score IS NOT NULL AND v_quiz_rpc<>'1' AND v_product_rpc<>'1' AND v_niche_rpc<>'1' THEN RAISE EXCEPTION 'Training scores must be recorded through the secure quiz/review workflow.'; END IF;
    IF v_module.slug='niche-training' AND NEW.status IN ('Passed','Completed') AND v_niche_rpc<>'1' THEN RAISE EXCEPTION 'Niche Training completion must be recorded through the secure niche certification workflow.'; END IF;
    IF v_module.requires_admin_review AND NEW.status IN ('Passed','Completed','Retry Required') THEN RAISE EXCEPTION 'This module requires Admin review before it can be passed.'; END IF;
  ELSE
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.module_id IS DISTINCT FROM OLD.module_id THEN RAISE EXCEPTION 'Training progress ownership and module are immutable.'; END IF;
    IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.review_status IS DISTINCT FROM OLD.review_status OR NEW.feedback IS DISTINCT FROM OLD.feedback THEN RAISE EXCEPTION 'Training review fields are Admin-only.'; END IF;
    IF NEW.score IS DISTINCT FROM OLD.score AND v_quiz_rpc<>'1' AND v_product_rpc<>'1' AND v_niche_rpc<>'1' THEN RAISE EXCEPTION 'Training scores must be recorded through the secure quiz/review workflow.'; END IF;
    IF v_module.requires_admin_review AND NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status THEN RAISE EXCEPTION 'This module requires Admin review before it can be passed.'; END IF;
    IF v_module.slug IN ('product-training','product-package-training','product-packages') AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.score IS DISTINCT FROM OLD.score) AND NEW.status IN ('Passed','Retry Required','Completed') AND v_quiz_rpc<>'1' AND v_product_rpc<>'1' THEN RAISE EXCEPTION 'Product training results must be recorded through the secure product assessment workflow.'; END IF;
    IF v_module.slug='agreement-rules' THEN
      IF NEW.score IS DISTINCT FROM OLD.score AND v_quiz_rpc<>'1' THEN RAISE EXCEPTION 'Agreement & Sales Rules assessment scores must be recorded through the secure assessment workflow.'; END IF;
      IF NEW.status='Retry Required' AND OLD.status IS DISTINCT FROM NEW.status AND v_quiz_rpc<>'1' THEN RAISE EXCEPTION 'Agreement & Sales Rules retry status must come from the secure assessment workflow.'; END IF;
      IF NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status AND v_agreement_rules_rpc<>'1' THEN RAISE EXCEPTION 'Agreement & Sales Rules can only be completed after the secure knowledge check and acknowledgement.'; END IF;
    END IF;
    IF v_module.slug='niche-training' AND ((NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status) OR NEW.score IS DISTINCT FROM OLD.score OR NEW.completed_at IS DISTINCT FROM OLD.completed_at) AND v_niche_rpc<>'1' THEN RAISE EXCEPTION 'Niche Training completion must be recorded through the secure niche certification workflow.'; END IF;
  END IF;
  IF v_module.requires_admin_review AND NEW.status NOT IN ('Not Started','In Progress','Submitted','Retry Required') THEN RAISE EXCEPTION 'Reviewed modules may only be submitted by trainees; pass/fail is Admin-controlled.'; END IF;
  IF NOT v_module.requires_admin_review AND NEW.status IN ('Passed','Completed') AND v_module.passing_score IS NOT NULL AND COALESCE(NEW.score,0)<v_module.passing_score THEN RAISE EXCEPTION 'Passing score of % is required for this module.',v_module.passing_score; END IF;
  NEW.progress_percent:=GREATEST(0,LEAST(COALESCE(NEW.progress_percent,0),100)); NEW.attempts:=GREATEST(COALESCE(NEW.attempts,0),0); RETURN NEW;
END; $function$;

REVOKE ALL ON FUNCTION public.get_niche_training_module(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_niche_training_pre_survey(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_niche_training_step(uuid,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_niche_training_diagnostic(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_niche_training_assessment(uuid,integer[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_niche_training_module(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_niche_training_pre_survey(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_niche_training_step(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_niche_training_diagnostic(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_niche_training_assessment(uuid,integer[]) TO authenticated;

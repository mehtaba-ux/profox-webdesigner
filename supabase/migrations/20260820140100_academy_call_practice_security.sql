-- Secure Module 10/11 progress guards and learner-safe Module 10 configuration.

CREATE OR REPLACE FUNCTION public.protect_training_progress_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_module public.training_modules%ROWTYPE;
  v_quiz_rpc text:=COALESCE(current_setting('profox.training_quiz_rpc',true),'');
  v_agreement_rules_rpc text:=COALESCE(current_setting('profox.training_agreement_rules_rpc',true),'');
  v_product_rpc text:=COALESCE(current_setting('profox.training_product_rpc',true),'');
  v_niche_rpc text:=COALESCE(current_setting('profox.training_niche_rpc',true),'');
  v_lead_research_rpc text:=COALESCE(current_setting('profox.training_lead_research_rpc',true),'');
  v_loom_rpc text:=COALESCE(current_setting('profox.training_loom_rpc',true),'');
  v_outreach_rpc text:=COALESCE(current_setting('profox.training_outreach_rpc',true),'');
  v_mock_call_rpc text:=COALESCE(current_setting('profox.training_mock_call_rpc',true),'');
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  SELECT * INTO v_module FROM public.training_modules WHERE id=NEW.module_id;
  IF NOT FOUND OR v_module.active IS NOT TRUE THEN RAISE EXCEPTION 'Training module is missing or inactive.'; END IF;

  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    IF NOT (v_module.slug='mock-call-test' AND v_mock_call_rpc='1') THEN
      RAISE EXCEPTION 'Training progress may only be changed by its owner or an Admin.';
    END IF;
  END IF;

  IF TG_OP='INSERT' THEN
    IF (NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_status IS NOT NULL OR COALESCE(trim(NEW.feedback),'')<>'')
       AND NOT (v_module.slug='lead-research' AND v_lead_research_rpc='1')
       AND NOT (v_module.slug='loom-outreach' AND v_loom_rpc='1')
       AND NOT (v_module.slug='outreach-cadence' AND v_outreach_rpc='1')
       AND NOT (v_module.slug='mock-call-test' AND v_mock_call_rpc='1') THEN
      RAISE EXCEPTION 'Training review fields are Admin-only.';
    END IF;
    IF NEW.score IS NOT NULL AND v_quiz_rpc<>'1' AND v_product_rpc<>'1' AND v_niche_rpc<>'1' AND v_lead_research_rpc<>'1' AND v_loom_rpc<>'1' AND v_outreach_rpc<>'1' AND v_mock_call_rpc<>'1' THEN
      RAISE EXCEPTION 'Training scores must be recorded through the secure quiz/review workflow.';
    END IF;
    IF v_module.slug='niche-training' AND NEW.status IN ('Passed','Completed') AND v_niche_rpc<>'1' THEN RAISE EXCEPTION 'Niche Training completion must be recorded through the secure niche certification workflow.'; END IF;
    IF v_module.slug='lead-research' AND NEW.status='Submitted' AND v_lead_research_rpc<>'1' THEN RAISE EXCEPTION 'Lead Research must be submitted through the secure qualification workflow.'; END IF;
    IF v_module.slug='loom-outreach' AND NEW.status='Submitted' AND v_loom_rpc<>'1' THEN RAISE EXCEPTION 'Personalized Loom Outreach must be submitted through the secure Module 6 workflow.'; END IF;
    IF v_module.slug='outreach-cadence' AND NEW.status='Submitted' AND v_outreach_rpc<>'1' THEN RAISE EXCEPTION 'Outreach Messages & Follow-Up must be submitted through the secure Module 7 workflow.'; END IF;
    IF v_module.requires_admin_review AND NEW.status IN ('Passed','Completed','Retry Required')
       AND NOT (v_module.slug='mock-call-test' AND v_mock_call_rpc='1') THEN
      RAISE EXCEPTION 'This module requires Admin review before it can be passed.';
    END IF;
  ELSE
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.module_id IS DISTINCT FROM OLD.module_id THEN RAISE EXCEPTION 'Training progress ownership and module are immutable.'; END IF;
    IF (NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.review_status IS DISTINCT FROM OLD.review_status OR NEW.feedback IS DISTINCT FROM OLD.feedback)
       AND NOT (v_module.slug='lead-research' AND v_lead_research_rpc='1')
       AND NOT (v_module.slug='loom-outreach' AND v_loom_rpc='1')
       AND NOT (v_module.slug='outreach-cadence' AND v_outreach_rpc='1')
       AND NOT (v_module.slug='mock-call-test' AND v_mock_call_rpc='1') THEN
      RAISE EXCEPTION 'Training review fields are Admin-only.';
    END IF;
    IF NEW.score IS DISTINCT FROM OLD.score AND v_quiz_rpc<>'1' AND v_product_rpc<>'1' AND v_niche_rpc<>'1' AND v_lead_research_rpc<>'1' AND v_loom_rpc<>'1' AND v_outreach_rpc<>'1' AND v_mock_call_rpc<>'1' THEN
      RAISE EXCEPTION 'Training scores must be recorded through the secure quiz/review workflow.';
    END IF;
    IF v_module.requires_admin_review AND NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status
       AND NOT (v_module.slug='mock-call-test' AND v_mock_call_rpc='1') THEN
      RAISE EXCEPTION 'This module requires Admin review before it can be passed.';
    END IF;
    IF v_module.slug IN ('product-training','product-package-training','product-packages') AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.score IS DISTINCT FROM OLD.score) AND NEW.status IN ('Passed','Retry Required','Completed') AND v_quiz_rpc<>'1' AND v_product_rpc<>'1' THEN RAISE EXCEPTION 'Product training results must be recorded through the secure product assessment workflow.'; END IF;
    IF v_module.slug='agreement-rules' THEN
      IF NEW.score IS DISTINCT FROM OLD.score AND v_quiz_rpc<>'1' THEN RAISE EXCEPTION 'Agreement & Sales Rules assessment scores must be recorded through the secure assessment workflow.'; END IF;
      IF NEW.status='Retry Required' AND OLD.status IS DISTINCT FROM NEW.status AND v_quiz_rpc<>'1' THEN RAISE EXCEPTION 'Agreement & Sales Rules retry status must come from the secure assessment workflow.'; END IF;
      IF NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status AND v_agreement_rules_rpc<>'1' THEN RAISE EXCEPTION 'Agreement & Sales Rules can only be completed after the secure knowledge check and acknowledgement.'; END IF;
    END IF;
    IF v_module.slug='niche-training' AND (((NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status) OR NEW.score IS DISTINCT FROM OLD.score OR NEW.completed_at IS DISTINCT FROM OLD.completed_at)) AND v_niche_rpc<>'1' THEN RAISE EXCEPTION 'Niche Training completion must be recorded through the secure niche certification workflow.'; END IF;
    IF v_module.slug='lead-research' AND NEW.status='Submitted' AND OLD.status IS DISTINCT FROM NEW.status AND v_lead_research_rpc<>'1' THEN RAISE EXCEPTION 'Lead Research must be submitted through the secure qualification workflow.'; END IF;
    IF v_module.slug='loom-outreach' AND NEW.status='Submitted' AND OLD.status IS DISTINCT FROM NEW.status AND v_loom_rpc<>'1' THEN RAISE EXCEPTION 'Personalized Loom Outreach must be submitted through the secure Module 6 workflow.'; END IF;
    IF v_module.slug='outreach-cadence' AND NEW.status='Submitted' AND OLD.status IS DISTINCT FROM NEW.status AND v_outreach_rpc<>'1' THEN RAISE EXCEPTION 'Outreach Messages & Follow-Up must be submitted through the secure Module 7 workflow.'; END IF;
  END IF;

  IF v_module.requires_admin_review AND NEW.status NOT IN ('Not Started','In Progress','Submitted','Retry Required')
     AND NOT (v_module.slug='mock-call-test' AND v_mock_call_rpc='1') THEN
    RAISE EXCEPTION 'Reviewed modules may only be submitted by trainees; pass/fail is Admin-controlled.';
  END IF;
  IF NOT v_module.requires_admin_review AND NEW.status IN ('Passed','Completed') AND v_module.passing_score IS NOT NULL AND COALESCE(NEW.score,0)<v_module.passing_score THEN RAISE EXCEPTION 'Passing score of % is required for this module.',v_module.passing_score; END IF;
  NEW.progress_percent:=GREATEST(0,LEAST(COALESCE(NEW.progress_percent,0),100));
  NEW.attempts:=GREATEST(COALESCE(NEW.attempts,0),0);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_call_practice_mock_progress_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_slug text;
  v_practice_rpc text:=COALESCE(current_setting('profox.training_call_practice_rpc',true),'');
  v_mock_rpc text:=COALESCE(current_setting('profox.training_mock_call_rpc',true),'');
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  SELECT slug INTO v_slug FROM public.training_modules WHERE id=NEW.module_id;
  IF v_slug='call-practice' AND v_practice_rpc<>'1' THEN
    IF TG_OP='INSERT' THEN
      IF NEW.status IN ('Passed','Completed','Retry Required','Submitted') OR NEW.score IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Module 10 completion is controlled by the secure Call Practice workflow.';
      END IF;
    ELSE
      IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Passed','Completed','Retry Required','Submitted'))
         OR NEW.score IS DISTINCT FROM OLD.score OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
        RAISE EXCEPTION 'Module 10 completion is controlled by the secure Call Practice workflow.';
      END IF;
    END IF;
  ELSIF v_slug='mock-call-test' AND v_mock_rpc<>'1' THEN
    IF TG_OP='INSERT' THEN
      IF NEW.status IN ('Passed','Completed','Retry Required','Submitted') OR NEW.score IS NOT NULL OR NEW.completed_at IS NOT NULL OR NEW.reviewed_by IS NOT NULL THEN
        RAISE EXCEPTION 'Module 11 result is controlled by the secure live mock-call evaluation workflow.';
      END IF;
    ELSE
      IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Passed','Completed','Retry Required','Submitted'))
         OR NEW.score IS DISTINCT FROM OLD.score OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
         OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
         OR NEW.review_status IS DISTINCT FROM OLD.review_status OR NEW.feedback IS DISTINCT FROM OLD.feedback THEN
        RAISE EXCEPTION 'Module 11 result is controlled by the secure live mock-call evaluation workflow.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_call_practice_mock_progress_write ON public.user_training_progress;
CREATE TRIGGER trg_protect_call_practice_mock_progress_write
BEFORE INSERT OR UPDATE ON public.user_training_progress
FOR EACH ROW EXECUTE FUNCTION public.protect_call_practice_mock_progress_write();

CREATE OR REPLACE FUNCTION public.get_call_practice_training_config(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_progress public.user_training_progress%ROWTYPE;
  v_state public.call_practice_state%ROWTYPE;
  v_settings jsonb;
  v_lesson_count integer;
  v_required_drills integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.training_modules WHERE id=p_module_id AND slug='call-practice' AND active) THEN RAISE EXCEPTION 'Call Practice module is unavailable.'; END IF;
  SELECT * INTO v_progress FROM public.user_training_progress WHERE user_id=v_uid AND module_id=p_module_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Start Module 10 before loading its practice workspace.'; END IF;
  SELECT * INTO v_state FROM public.call_practice_state WHERE progress_id=v_progress.id;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_settings FROM public.system_configuration WHERE config_key='mock_call_automation_settings';
  SELECT count(*) INTO v_lesson_count FROM public.training_lessons WHERE module_id=p_module_id AND active;
  SELECT count(*) INTO v_required_drills FROM public.call_practice_drills WHERE active AND required;
  RETURN jsonb_build_object(
    'framework','MICRO DRILLS → CONVERSATION DRILLS → FULL REHEARSALS → SELF-COACHING',
    'lessonCount',v_lesson_count,
    'lessonsCompleted',COALESCE(cardinality(v_state.completed_lesson_ids),0),
    'drillsCompleted',COALESCE(cardinality(v_state.completed_drill_ids),0),
    'requiredDrills',v_required_drills,
    'rehearsals',COALESCE(v_state.rehearsals,'[]'::jsonb),
    'rehearsalsRequired',COALESCE((v_settings->>'fullRehearsalsRequired')::integer,3),
    'readinessBenchmark',COALESCE((v_settings->>'selfScoreReadinessBenchmark')::integer,16),
    'availability',COALESCE(v_state.assessment_availability,'{}'::jsonb),
    'readinessAcknowledged',COALESCE(v_state.readiness_acknowledged,false),
    'completed',v_progress.status='Completed',
    'drills',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'category',d.category,'instructions',d.instructions,'completionPrompt',d.completion_prompt,'required',d.required,'sortOrder',d.sort_order,'completed',d.id=ANY(COALESCE(v_state.completed_drill_ids,'{}'::uuid[])),'reflection',COALESCE(v_state.drill_reflections->>d.id::text,'')) ORDER BY d.sort_order) FROM public.call_practice_drills d WHERE d.active),'[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_call_practice_training_config(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_call_practice_training_config(uuid) TO authenticated;

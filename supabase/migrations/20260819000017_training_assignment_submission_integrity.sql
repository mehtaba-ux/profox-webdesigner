-- Practical training submission integrity and immutable trainee submissions.

DROP POLICY IF EXISTS training_assignments_update ON public.training_assignments;
CREATE POLICY training_assignments_update ON public.training_assignments
FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.validate_training_assignment_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_module_slug text; v_progress public.user_training_progress%ROWTYPE; v_count integer; v_item jsonb;
BEGIN
 IF public.is_admin() THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Training submissions may only be created for the signed-in trainee.'; END IF;
 SELECT slug INTO v_module_slug FROM public.training_modules WHERE id=NEW.module_id AND active=true;
 IF v_module_slug IS NULL THEN RAISE EXCEPTION 'Training module is missing or inactive.'; END IF;
 IF NEW.progress_id IS NULL THEN RAISE EXCEPTION 'Training progress reference is required.'; END IF;
 SELECT * INTO v_progress FROM public.user_training_progress WHERE id=NEW.progress_id;
 IF NOT FOUND OR v_progress.user_id IS DISTINCT FROM NEW.user_id OR v_progress.module_id IS DISTINCT FROM NEW.module_id THEN RAISE EXCEPTION 'Training submission does not match the trainee progress record.'; END IF;

 IF v_module_slug='lead-research' THEN
   IF NEW.submission_data->>'type'<>'lead_research' THEN RAISE EXCEPTION 'Invalid lead research submission type.'; END IF;
   IF jsonb_typeof(NEW.submission_data->'prospects')<>'array' OR jsonb_array_length(NEW.submission_data->'prospects')<>5 THEN RAISE EXCEPTION 'Lead Research requires exactly 5 qualified prospects.'; END IF;
   FOR v_item IN SELECT value FROM jsonb_array_elements(NEW.submission_data->'prospects') LOOP
     IF COALESCE(trim(v_item->>'companyName'),'')='' OR COALESCE(trim(v_item->>'websiteUrl'),'')='' OR COALESCE(trim(v_item->>'country'),'')='' OR COALESCE(trim(v_item->>'industry'),'')='' OR COALESCE(trim(v_item->>'decisionMaker'),'')='' OR COALESCE(trim(v_item->>'contactInfo'),'')='' OR COALESCE(trim(v_item->>'websiteProblem'),'')='' OR COALESCE(trim(v_item->>'recommendedService'),'')='' OR COALESCE(trim(v_item->>'reasonQualified'),'')='' THEN RAISE EXCEPTION 'Each qualified prospect must include company, website, country, industry, decision maker, contact, problem, recommended service, and qualification reason.'; END IF;
   END LOOP;
 ELSIF v_module_slug='loom-outreach' THEN
   IF NEW.submission_data->>'type'<>'loom_outreach' THEN RAISE EXCEPTION 'Invalid Loom submission type.'; END IF;
   IF COALESCE(trim(NEW.submission_data->>'loomUrl'),'')='' THEN RAISE EXCEPTION 'Loom URL is required.'; END IF;
   SELECT count(*) INTO v_count FROM public.training_assignments WHERE user_id=NEW.user_id AND module_id=NEW.module_id;
   IF v_count>=3 THEN RAISE EXCEPTION 'Maximum 3 Loom practice submissions are allowed.'; END IF;
 ELSIF v_module_slug='mock-call-test' THEN
   IF NEW.submission_data->>'type'<>'mock_sales_call' THEN RAISE EXCEPTION 'Invalid mock sales call submission type.'; END IF;
 ELSIF v_module_slug='crm-training' THEN
   IF NEW.submission_data->>'type'<>'crm_practical' THEN RAISE EXCEPTION 'Invalid CRM practical submission type.'; END IF;
 ELSIF v_module_slug='final-certification' THEN
   IF NEW.submission_data->>'type'<>'final_certification_request' THEN RAISE EXCEPTION 'Invalid final certification submission type.'; END IF;
 END IF;
 RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_training_assignment_submission ON public.training_assignments;
CREATE TRIGGER trg_validate_training_assignment_submission BEFORE INSERT ON public.training_assignments FOR EACH ROW EXECUTE FUNCTION public.validate_training_assignment_submission();
REVOKE ALL ON FUNCTION public.validate_training_assignment_submission() FROM PUBLIC,anon,authenticated;

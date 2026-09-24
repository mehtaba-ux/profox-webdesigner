-- Align the live Module 3 slug with the existing Academy product-training route.
UPDATE public.training_modules
SET slug='product-training', updated_at=now()
WHERE slug='product-packages' AND sort_order=3;

CREATE OR REPLACE FUNCTION public.get_product_package_training(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_products jsonb; v_questions jsonb; v_passing integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.can_access_sales_academy_module(p_module_id) THEN RAISE EXCEPTION 'Training module access denied.'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.training_modules
    WHERE id=p_module_id AND slug IN ('product-training','product-package-training','product-packages') AND active=true
  ) THEN RAISE EXCEPTION 'Product & Package Training module not found.'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',p.id,'code',p.code,'name',p.name,'category',p.category,'productType',p.product_type,
    'priceMode',p.price_mode,'basePrice',p.base_price,'currency',p.currency,'billingPeriod',p.billing_period,
    'shortDescription',p.short_description,'scope',p.scope,'technology',p.technology,
    'managerApprovalRequired',p.manager_approval_required,'sortOrder',p.sort_order
  ) ORDER BY p.sort_order),'[]'::jsonb)
  INTO v_products FROM public.sales_products p WHERE p.active=true;

  SELECT COALESCE(passing_score,80) INTO v_passing FROM public.training_modules WHERE id=p_module_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',q.id,'prompt',q.prompt,'options',q.options,'sortOrder',q.sort_order,
    'section',q.assessment_section,'caseKey',q.case_key
  ) ORDER BY q.sort_order),'[]'::jsonb)
  INTO v_questions FROM public.training_assessment_questions q
  WHERE q.module_id=p_module_id AND q.active=true;
  RETURN jsonb_build_object('passingScore',v_passing,'products',v_products,'questions',v_questions);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_product_package_assessment(p_progress_id uuid,p_answers integer[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_progress public.user_training_progress%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_question public.training_assessment_questions%ROWTYPE;
  v_count integer; v_index integer:=0; v_correct integer:=0; v_score integer; v_critical_misses integer:=0;
  v_passed boolean; v_feedback jsonb:='[]'::jsonb; v_event_time timestamptz:=clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training progress record not found.'; END IF;
  IF v_progress.user_id<>auth.uid() THEN RAISE EXCEPTION 'You may only submit your own product assessment.'; END IF;

  SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND active=true;
  IF NOT FOUND OR v_module.slug NOT IN ('product-training','product-package-training','product-packages') THEN
    RAISE EXCEPTION 'This progress record is not Product & Package Training.';
  END IF;

  SELECT count(*) INTO v_count FROM public.training_assessment_questions q WHERE q.module_id=v_module.id AND q.active=true;
  IF v_count=0 THEN RAISE EXCEPTION 'No active product assessment questions are configured.'; END IF;
  IF COALESCE(array_length(p_answers,1),0)<>v_count THEN RAISE EXCEPTION 'Exactly % assessment answers are required.',v_count; END IF;

  FOR v_question IN SELECT * FROM public.training_assessment_questions q WHERE q.module_id=v_module.id AND q.active=true ORDER BY q.sort_order LOOP
    v_index:=v_index+1;
    IF p_answers[v_index]=v_question.correct_index THEN v_correct:=v_correct+1;
    ELSIF v_question.critical THEN v_critical_misses:=v_critical_misses+1;
    END IF;
    v_feedback:=v_feedback||jsonb_build_array(jsonb_build_object(
      'questionId',v_question.id,'correct',p_answers[v_index]=v_question.correct_index,
      'critical',v_question.critical,'explanation',v_question.explanation,'section',v_question.assessment_section,'caseKey',v_question.case_key
    ));
  END LOOP;

  v_score:=round((v_correct::numeric*100)/v_count)::integer;
  v_passed:=v_score>=COALESCE(v_module.passing_score,80) AND v_critical_misses=0;

  PERFORM set_config('profox.training_product_rpc','1',true);
  INSERT INTO public.training_assignments(user_id,module_id,progress_id,submission_data,created_at,updated_at)
  VALUES(v_progress.user_id,v_module.id,v_progress.id,jsonb_build_object(
    'type','product_package_assessment','answers',to_jsonb(p_answers),'score',v_score,'passed',v_passed,
    'criticalMisses',v_critical_misses,'submittedAt',v_event_time
  ),v_event_time,v_event_time);

  UPDATE public.user_training_progress
  SET status=CASE WHEN v_passed THEN 'Completed' ELSE 'Retry Required' END,
      score=v_score,progress_percent=CASE WHEN v_passed THEN 100 ELSE 75 END,
      completed_at=CASE WHEN v_passed THEN v_event_time ELSE NULL END,updated_at=v_event_time
  WHERE id=v_progress.id;

  RETURN jsonb_build_object('score',v_score,'passed',v_passed,'passingScore',COALESCE(v_module.passing_score,80),
    'criticalMisses',v_critical_misses,'criticalPass',v_critical_misses=0,'feedback',v_feedback,
    'status',CASE WHEN v_passed THEN 'Completed' ELSE 'Retry Required' END);
END;
$$;

REVOKE ALL ON FUNCTION public.get_product_package_training(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_product_package_assessment(uuid,integer[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_product_package_training(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_product_package_assessment(uuid,integer[]) TO authenticated;

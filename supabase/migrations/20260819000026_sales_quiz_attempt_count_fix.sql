-- startModule owns attempt counting. Quiz submission must not increment it again.
CREATE OR REPLACE FUNCTION public.submit_sales_academy_quiz(
  p_progress_id uuid,
  p_answers integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_progress public.user_training_progress%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_expected integer[];
  v_required_count integer;
  v_correct integer := 0;
  v_score integer;
  v_index integer;
  v_missing_prior integer;
  v_passed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;

  SELECT * INTO v_progress
  FROM public.user_training_progress
  WHERE id=p_progress_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training progress record not found.'; END IF;
  IF v_progress.user_id<>auth.uid() THEN RAISE EXCEPTION 'You may only submit your own training quiz.'; END IF;

  SELECT * INTO v_module
  FROM public.training_modules
  WHERE id=v_progress.module_id AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training module is missing or inactive.'; END IF;

  IF v_module.slug='product-training' THEN
    v_expected := ARRAY[1,2,2,1,1];
    v_required_count := 5;
  ELSIF v_module.slug='final-certification' THEN
    v_expected := ARRAY[0,1,1,2,2,0,0,0,1,2,1,2,2,0,1];
    v_required_count := 15;
  ELSE
    RAISE EXCEPTION 'This module does not use the secure Sales Academy quiz workflow.';
  END IF;

  IF COALESCE(array_length(p_answers,1),0)<>v_required_count THEN
    RAISE EXCEPTION 'Exactly % quiz answers are required.',v_required_count;
  END IF;

  FOR v_index IN 1..v_required_count LOOP
    IF p_answers[v_index]=v_expected[v_index] THEN v_correct:=v_correct+1; END IF;
  END LOOP;
  v_score := round((v_correct::numeric * 100) / v_required_count)::integer;
  v_passed := v_score >= COALESCE(v_module.passing_score,80);

  IF v_module.slug='final-certification' AND v_passed THEN
    SELECT count(*) INTO v_missing_prior
    FROM public.training_modules m
    WHERE m.active=true AND m.required=true AND m.sort_order<v_module.sort_order
      AND NOT EXISTS (
        SELECT 1 FROM public.user_training_progress p
        WHERE p.user_id=v_progress.user_id AND p.module_id=m.id
          AND p.status IN ('Passed','Completed')
          AND (m.passing_score IS NULL OR COALESCE(p.score,0)>=m.passing_score)
      );
    IF v_missing_prior>0 THEN
      RAISE EXCEPTION 'Final Certification cannot be submitted until all previous required modules are complete. Missing: %',v_missing_prior;
    END IF;
  END IF;

  PERFORM set_config('profox.training_quiz_rpc','1',true);

  INSERT INTO public.training_assignments(user_id,module_id,progress_id,submission_data)
  VALUES(
    v_progress.user_id,
    v_progress.module_id,
    v_progress.id,
    jsonb_build_object(
      'type', CASE WHEN v_module.slug='final-certification' THEN 'final_certification_exam' ELSE 'product_quiz' END,
      'answers', to_jsonb(p_answers),
      'score', v_score,
      'passed', v_passed,
      'submittedAt', now()
    )
  );

  UPDATE public.user_training_progress
  SET status = CASE
        WHEN v_module.requires_admin_review AND v_passed THEN 'Submitted'
        WHEN v_passed THEN 'Passed'
        ELSE 'Retry Required'
      END,
      score=v_score,
      progress_percent=CASE WHEN v_passed THEN 100 ELSE 50 END,
      completed_at=CASE WHEN NOT v_module.requires_admin_review AND v_passed THEN now() ELSE NULL END,
      updated_at=now()
  WHERE id=v_progress.id;

  RETURN jsonb_build_object(
    'score',v_score,
    'passed',v_passed,
    'status',CASE
      WHEN v_module.requires_admin_review AND v_passed THEN 'Submitted'
      WHEN v_passed THEN 'Passed'
      ELSE 'Retry Required'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_sales_academy_quiz(uuid,integer[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_sales_academy_quiz(uuid,integer[]) TO authenticated;

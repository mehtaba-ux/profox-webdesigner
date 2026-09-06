CREATE OR REPLACE FUNCTION public.admin_record_recruitment_assessment(
  p_applicant_id uuid,
  p_stage text,
  p_status text,
  p_score integer,
  p_rubric_scores jsonb DEFAULT '{}'::jsonb,
  p_critical_failures jsonb DEFAULT '[]'::jsonb,
  p_evidence text DEFAULT ''::text,
  p_evidence_url text DEFAULT ''::text,
  p_notes text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_app public.applicants%rowtype;
  v_policy public.recruitment_stage_policies%rowtype;
  v_attempt integer;
  v_id uuid;
  v_item jsonb;
  v_key text;
  v_max numeric;
  v_value numeric;
  v_total numeric := 0;
  v_earned numeric := 0;
  v_score integer := 0;
BEGIN
  IF NOT public.can_manage_content_applicant(p_applicant_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Recruitment management access required.';
  END IF;

  SELECT * INTO v_app
  FROM public.applicants
  WHERE id = p_applicant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;

  IF coalesce(btrim(v_app.refusal_reason), '') <> '' THEN
    RAISE EXCEPTION 'Closed candidates cannot receive new assessments.';
  END IF;

  IF v_app.stage <> p_stage THEN
    RAISE EXCEPTION 'Assessment must be recorded for the candidate current stage: %.', v_app.stage;
  END IF;

  SELECT * INTO v_policy
  FROM public.recruitment_stage_policies
  WHERE job_id = public.recruitment_job_for_applicant(v_app.id)
    AND stage = p_stage
    AND active = true;

  IF NOT FOUND OR NOT v_policy.assessment_required THEN
    RAISE EXCEPTION 'This stage is not configured as a structured assessment stage.';
  END IF;

  IF p_status NOT IN ('Passed', 'Failed', 'Retry Required') THEN
    RAISE EXCEPTION 'Assessment status must be Passed, Failed or Retry Required.';
  END IF;

  IF jsonb_typeof(coalesce(p_rubric_scores, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(coalesce(p_critical_failures, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invalid assessment evidence format.';
  END IF;

  IF v_policy.rubric IS NULL
     OR jsonb_typeof(v_policy.rubric) <> 'array'
     OR jsonb_array_length(v_policy.rubric) = 0 THEN
    RAISE EXCEPTION 'The configured assessment rubric is invalid or empty.';
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(v_policy.rubric)
  LOOP
    v_key := nullif(btrim(v_item ->> 'key'), '');

    IF v_key IS NULL
       OR jsonb_typeof(v_item -> 'maxPoints') <> 'number' THEN
      RAISE EXCEPTION 'The configured assessment rubric contains an invalid criterion.';
    END IF;

    v_max := (v_item ->> 'maxPoints')::numeric;
    IF v_max <= 0 THEN
      RAISE EXCEPTION 'The configured assessment rubric contains an invalid maximum score for criterion %.', v_key;
    END IF;

    IF NOT (p_rubric_scores ? v_key) THEN
      RAISE EXCEPTION 'Every rubric criterion must be scored. Missing criterion: %.', v_key;
    END IF;

    IF jsonb_typeof(p_rubric_scores -> v_key) <> 'number' THEN
      RAISE EXCEPTION 'Rubric score for criterion % must be numeric.', v_key;
    END IF;

    v_value := (p_rubric_scores ->> v_key)::numeric;
    IF v_value < 0 OR v_value > v_max THEN
      RAISE EXCEPTION 'Rubric score for criterion % must be between 0 and %.', v_key, v_max;
    END IF;

    v_earned := v_earned + v_value;
    v_total := v_total + v_max;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_rubric_scores) AS supplied(key)
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_policy.rubric) AS configured(item)
      WHERE configured.item ->> 'key' = supplied.key
    )
  ) THEN
    RAISE EXCEPTION 'Rubric scores contain an unknown criterion.';
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'The configured assessment rubric total must be greater than zero.';
  END IF;

  v_score := round((v_earned * 100.0) / v_total)::integer;

  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'Assessment score must be between 0 and 100.';
  END IF;

  IF p_score <> v_score THEN
    RAISE EXCEPTION 'Assessment score does not match the rubric-derived score of %.', v_score;
  END IF;

  IF p_status = 'Passed' AND v_score < coalesce(v_policy.passing_score, 0) THEN
    RAISE EXCEPTION 'Passed assessment score must meet the configured passing score of %.', v_policy.passing_score;
  END IF;

  IF p_status = 'Passed'
     AND jsonb_array_length(coalesce(p_critical_failures, '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'An assessment with critical failures cannot be passed.';
  END IF;

  IF p_status = 'Passed'
     AND v_policy.interview_required
     AND NOT public.recruitment_interview_requirement_satisfied(p_applicant_id, p_stage) THEN
    RAISE EXCEPTION 'Complete or administratively skip the required % interview before marking this assessment Passed.', p_stage;
  END IF;

  SELECT coalesce(max(attempt_no), 0) + 1
  INTO v_attempt
  FROM public.recruitment_assessments
  WHERE applicant_id = p_applicant_id
    AND stage = p_stage;

  INSERT INTO public.recruitment_assessments(
    applicant_id, job_id, stage, attempt_no, status, score,
    passing_score_snapshot, rubric_snapshot, rubric_scores,
    critical_failures, evidence, evidence_url, evaluator_notes,
    evaluator_id, evaluated_at
  )
  VALUES (
    p_applicant_id, v_app.career_job_id, p_stage, v_attempt, p_status, v_score,
    v_policy.passing_score, v_policy.rubric, p_rubric_scores,
    coalesce(p_critical_failures, '[]'::jsonb), left(coalesce(p_evidence, ''), 10000),
    left(coalesce(p_evidence_url, ''), 2000), left(coalesce(p_notes, ''), 10000),
    auth.uid(), now()
  )
  RETURNING id INTO v_id;

  PERFORM public.log_applicant_event(
    p_applicant_id,
    'assessment',
    'assessment_recorded',
    p_stage || ' assessment recorded',
    coalesce(nullif(btrim(p_notes), ''), 'Structured recruitment assessment recorded.'),
    null,
    p_status,
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'content_manager' END,
    auth.uid(),
    'recruitment_assessments',
    v_id,
    jsonb_build_object(
      'stage', p_stage,
      'attemptNo', v_attempt,
      'score', v_score,
      'passingScore', v_policy.passing_score,
      'criticalFailures', coalesce(p_critical_failures, '[]'::jsonb)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'attemptNo', v_attempt,
    'status', p_status,
    'score', v_score,
    'passingScore', v_policy.passing_score
  );
END;
$function$;

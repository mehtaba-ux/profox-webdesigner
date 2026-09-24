ALTER FUNCTION public.submit_public_sales_application_v3(jsonb) RENAME TO submit_public_sales_application_v3_core;
REVOKE ALL ON FUNCTION public.submit_public_sales_application_v3_core(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.submit_public_sales_application_v3(p_application jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_job public.career_jobs%ROWTYPE;
  v_cfg jsonb;
  v_source_options text[]:=ARRAY[]::text[];
  v_source text:=trim(COALESCE(p_application->>'heardAboutSource',''));
  v_start date;
  v_days text[]:=ARRAY[]::text[];
BEGIN
  IF jsonb_typeof(COALESCE(p_application,'{}'::jsonb)) <> 'object' THEN
    RETURN jsonb_build_object('success',false,'error','Invalid application payload.');
  END IF;
  IF jsonb_typeof(COALESCE(p_application->'targetMarkets','[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_application->'targetMarkets','[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object('success',false,'field','targetMarkets','error','Select at least one target market that describes your experience.');
  END IF;
  IF jsonb_typeof(COALESCE(p_application->'availableDays','[]'::jsonb)) <> 'array' THEN
    RETURN jsonb_build_object('success',false,'field','availableDays','error','Available days must be a list.');
  END IF;
  v_days:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_application->'availableDays','[]'::jsonb)));
  IF cardinality(v_days)=0 OR NOT (v_days <@ ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::text[]) THEN
    RETURN jsonb_build_object('success',false,'field','availableDays','error','Select valid available working days.');
  END IF;
  BEGIN
    v_start:=NULLIF(trim(COALESCE(p_application->>'earliestStartDate','')),'')::date;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('success',false,'field','earliestStartDate','error','Select a valid earliest start date.');
  END;
  IF v_start IS NULL OR v_start < current_date THEN
    RETURN jsonb_build_object('success',false,'field','earliestStartDate','error','Earliest start date must be today or a future date.');
  END IF;
  IF v_source='' THEN
    RETURN jsonb_build_object('success',false,'field','heardAboutSource','error','Tell us how you heard about ProFox.');
  END IF;
  SELECT * INTO v_job FROM public.career_jobs
   WHERE application_type='sales_representative' AND status='Published'
   ORDER BY featured DESC,published_at DESC NULLS LAST,created_at DESC LIMIT 1;
  IF FOUND THEN
    v_cfg:=COALESCE(v_job.role_details->'applicationForm','{}'::jsonb);
    IF jsonb_typeof(COALESCE(v_cfg->'sourceOptions','[]'::jsonb))='array' THEN
      v_source_options:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_cfg->'sourceOptions','[]'::jsonb)));
      IF cardinality(v_source_options)>0 AND NOT (v_source=ANY(v_source_options)) THEN
        RETURN jsonb_build_object('success',false,'field','heardAboutSource','error','Select a valid application source.');
      END IF;
    END IF;
  END IF;
  RETURN public.submit_public_sales_application_v3_core(p_application);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_public_sales_application_v3(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_sales_application_v3(jsonb) TO anon,authenticated;
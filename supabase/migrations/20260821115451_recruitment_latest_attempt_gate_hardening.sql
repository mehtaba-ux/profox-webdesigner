-- Recruitment Closure follow-up: only the newest structured assessment attempt may satisfy progression.
CREATE OR REPLACE FUNCTION public.recruitment_latest_assessment_passed(p_applicant_id uuid,p_stage text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $$
SELECT coalesce((
  SELECT a.status='Passed'
  FROM public.recruitment_assessments a
  WHERE a.applicant_id=p_applicant_id
    AND a.stage=p_stage
  ORDER BY a.attempt_no DESC,a.created_at DESC,a.id DESC
  LIMIT 1
),false);
$$;

REVOKE ALL ON FUNCTION public.recruitment_latest_assessment_passed(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_latest_assessment_passed(uuid,text) TO service_role;
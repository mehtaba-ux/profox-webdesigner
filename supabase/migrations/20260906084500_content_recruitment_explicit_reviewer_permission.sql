-- Restrict Content Writer recruitment/review access to explicitly qualified reviewers.
-- Admin remains an unconditional owner/emergency path.

CREATE OR REPLACE FUNCTION public.content_recruitment_reviewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1
    FROM public.user_profiles u
    JOIN public.workforce_capability_profiles w ON w.user_id = u.id
    WHERE u.id = auth.uid()
      AND u.status = 'active'
      AND w.reviewer_eligible = true
      AND 'content_recruitment_review' = ANY(coalesce(w.reviewer_qualifications, '{}'::text[]))
  );
$function$;

COMMENT ON FUNCTION public.content_recruitment_reviewer() IS
  'True for active users explicitly marked reviewer_eligible with reviewer qualification content_recruitment_review, or Admin.';

-- Keep the legacy helper name because existing RLS/training policies reference it,
-- but remove the old editor/site_manager role shortcut.
CREATE OR REPLACE FUNCTION public.content_recruitment_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.content_recruitment_reviewer();
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_content_applicant(p_applicant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_admin() OR (
    public.content_recruitment_reviewer()
    AND EXISTS (
      SELECT 1
      FROM public.applicants a
      JOIN public.career_jobs j ON j.id = a.career_job_id
      WHERE a.id = p_applicant_id
        AND j.application_type = 'content_writer'
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.content_recruitment_reviewer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.content_recruitment_reviewer() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.content_recruitment_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.content_recruitment_manager() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_manage_content_applicant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_content_applicant(uuid) TO authenticated, service_role;

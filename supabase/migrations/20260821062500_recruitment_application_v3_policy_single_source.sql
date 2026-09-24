ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS application_policy_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.sync_sales_job_application_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public,pg_temp
AS $$
DECLARE
  v_details jsonb:=COALESCE(NEW.role_details,'{}'::jsonb);
  v_form jsonb:=COALESCE(v_details->'applicationForm','{}'::jsonb);
  v_work jsonb:=COALESCE(v_details->'workingArrangement','{}'::jsonb);
  v_hours integer;
  v_months integer;
BEGIN
  IF NEW.application_type <> 'sales_representative' THEN RETURN NEW; END IF;
  v_hours:=GREATEST(1,LEAST(80,COALESCE((v_work->>'expectedHoursPerWeek')::integer,35)));
  v_months:=GREATEST(0,LEAST(600,COALESCE((v_form->>'minimumSalesExperienceMonths')::integer,6)));
  v_work:=jsonb_set(v_work,'{expectedHoursPerWeek}',to_jsonb(v_hours),true);
  v_form:=jsonb_set(v_form,'{minimumSalesExperienceMonths}',to_jsonb(v_months),true);
  v_form:=jsonb_set(v_form,'{minimumWeeklyHours}',to_jsonb(v_hours),true);
  v_details:=jsonb_set(v_details,'{workingArrangement}',v_work,true);
  v_details:=jsonb_set(v_details,'{applicationForm}',v_form,true);
  NEW.role_details:=v_details;
  NEW.experience:=CASE WHEN v_months=0 THEN 'Sales experience considered on merit' WHEN v_months=1 THEN '1+ month sales experience' ELSE v_months::text||'+ months sales experience' END;
  RETURN NEW;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'Sales application policy contains invalid experience or weekly-hours values.';
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sales_job_application_policy ON public.career_jobs;
CREATE TRIGGER trg_sync_sales_job_application_policy
BEFORE INSERT OR UPDATE OF role_details,application_type ON public.career_jobs
FOR EACH ROW EXECUTE FUNCTION public.sync_sales_job_application_policy();

UPDATE public.career_jobs SET role_details=role_details WHERE application_type='sales_representative';

CREATE OR REPLACE FUNCTION public.preserve_applicant_application_policy_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_job public.career_jobs%ROWTYPE;
  v_details jsonb;
BEGIN
  IF TG_OP='UPDATE' AND OLD.application_policy_snapshot IS NOT NULL THEN
    NEW.application_policy_snapshot:=OLD.application_policy_snapshot;
    RETURN NEW;
  END IF;
  IF NEW.application_version <> 'sales_role_v3' OR NEW.application_policy_snapshot IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_job FROM public.career_jobs
   WHERE application_type='sales_representative' AND status='Published'
   ORDER BY featured DESC,published_at DESC NULLS LAST,created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_details:=COALESCE(v_job.role_details,'{}'::jsonb);
  NEW.application_policy_snapshot:=jsonb_strip_nulls(jsonb_build_object(
    'jobId',v_job.id,'jobTitle',v_job.title,'jobUpdatedAt',v_job.updated_at,
    'minimumSalesExperienceMonths',COALESCE((v_details->'applicationForm'->>'minimumSalesExperienceMonths')::integer,6),
    'minimumWeeklyHours',COALESCE((v_details->'workingArrangement'->>'expectedHoursPerWeek')::integer,35),
    'sourceOptions',COALESCE(v_details->'applicationForm'->'sourceOptions','[]'::jsonb),
    'focusMarkets',COALESCE(v_details->'focusMarkets','[]'::jsonb),
    'prospectingChannels',COALESCE(v_details->'prospectingChannels','[]'::jsonb),
    'requiresIntroVideo',v_job.requires_intro_video,
    'videoMinimumSeconds',v_details->'video'->'minimumSeconds',
    'videoRecommendedMaximumSeconds',v_details->'video'->'recommendedMaximumSeconds'
  ));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.preserve_applicant_application_policy_snapshot() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_preserve_applicant_application_policy_snapshot ON public.applicants;
CREATE TRIGGER trg_preserve_applicant_application_policy_snapshot
BEFORE INSERT OR UPDATE OF application_policy_snapshot,application_version ON public.applicants
FOR EACH ROW EXECUTE FUNCTION public.preserve_applicant_application_policy_snapshot();
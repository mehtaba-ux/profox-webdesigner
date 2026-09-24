-- Preserve the test-bypass audit row, but return incomplete test activations to
-- Academy and remove live Sales access through the controlled repair gate.
DO $reconcile$
DECLARE v_target record;
BEGIN
 PERFORM set_config('profox.recruitment_stage_rpc','1',true);
 PERFORM set_config('profox.test_activation_reconciliation','1',true);
 PERFORM set_config('profox.sales_candidate_invite_rpc','1',true);
 FOR v_target IN
  SELECT DISTINCT a.id,a.linked_user_id FROM public.applicants a
  JOIN public.career_jobs j ON j.id=a.career_job_id AND j.application_type='sales_representative'
  JOIN public.sales_academy_test_bypasses b ON b.applicant_id=a.id AND b.test_activated_at IS NOT NULL
  WHERE a.stage='Activated' AND (NOT public.sales_academy_training_ready(a.linked_user_id) OR a.academy_started_at IS NULL OR a.academy_completed_at IS NULL)
 LOOP
  UPDATE public.applicants SET stage='Sales Academy Training',final_approval=false,onboarding_status='in_progress',
   onboarding_progress=LEAST(COALESCE(onboarding_progress,0),99),academy_completed_at=NULL,
   academy_review_wait_started_at=NULL,updated_at=now() WHERE id=v_target.id;
  UPDATE public.user_profiles SET role='sales',department='Sales',status='onboarding',onboarding_status='in_progress',
   onboarding_progress=LEAST(COALESCE(onboarding_progress,0),99),updated_at=now() WHERE id=v_target.linked_user_id;
 END LOOP;
END;
$reconcile$;

-- Backfill valid legacy Academy completion evidence only for fully ready,
-- non-test Activated candidates.
UPDATE public.applicants a SET academy_completed_at=COALESCE(a.updated_at,now()),updated_at=now()
FROM public.career_jobs j
WHERE j.id=a.career_job_id AND j.application_type='sales_representative' AND a.stage='Activated'
 AND a.linked_user_id IS NOT NULL AND a.academy_completed_at IS NULL
 AND public.sales_academy_training_ready(a.linked_user_id)
 AND NOT EXISTS (SELECT 1 FROM public.sales_academy_test_bypasses b WHERE b.applicant_id=a.id AND b.test_activated_at IS NOT NULL);

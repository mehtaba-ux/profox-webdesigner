-- Keep Activated immutable in normal operation while allowing this migration's
-- narrowly scoped, unauthenticated database repair of an incomplete test-only
-- activation. Authenticated API callers cannot satisfy this exception.
CREATE OR REPLACE FUNCTION public.protect_sales_candidate_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
 v_final_rpc text:=coalesce(current_setting('profox.final_approval_rpc',true),'');
 v_sales_activation text:=coalesce(current_setting('profox.sales_activation_rpc',true),'');
 v_content_activation text:=coalesce(current_setting('profox.content_writer_activation_rpc',true),'');
 v_recruitment_rpc text:=coalesce(current_setting('profox.recruitment_stage_rpc',true),'');
 v_reconciliation text:=coalesce(current_setting('profox.test_activation_reconciliation',true),'');
 v_application_type text;v_role text;v_test_repair boolean:=false;
BEGIN
 SELECT application_type INTO v_application_type FROM public.career_jobs WHERE id=coalesce(new.career_job_id,old.career_job_id);
 v_role:=coalesce(public.career_job_system_role(coalesce(new.career_job_id,old.career_job_id)),case when v_application_type='sales_representative' then 'sales' else 'pending' end);
 v_test_repair:=old.stage='Activated' AND new.stage='Sales Academy Training' AND v_reconciliation='1' AND auth.uid() IS NULL
  AND EXISTS(SELECT 1 FROM public.sales_academy_test_bypasses b WHERE b.applicant_id=old.id AND b.test_activated_at IS NOT NULL)
  AND (old.linked_user_id IS NULL OR NOT public.sales_academy_training_ready(old.linked_user_id) OR old.academy_started_at IS NULL OR old.academy_completed_at IS NULL);
 IF old.stage='Activated' AND new.stage IS DISTINCT FROM old.stage AND NOT v_test_repair THEN RAISE EXCEPTION 'Activated candidate stage is immutable through direct updates.';END IF;
 IF v_application_type='content_writer' OR v_role='content_writer' THEN
  IF ((new.final_approval IS true AND old.final_approval IS DISTINCT FROM true) OR (new.stage='Activated' AND old.stage IS DISTINCT FROM new.stage)) AND v_content_activation<>'1' THEN RAISE EXCEPTION 'Content Writer approval and activation must use the protected practical certification workflow.';END IF;
  IF new.stage='Ready for System Access' AND old.stage IS DISTINCT FROM new.stage THEN RAISE EXCEPTION 'Content Writer activation does not use the Sales system-access stage.';END IF;RETURN new;
 END IF;
 IF v_role='uiux_designer' THEN
  IF ((new.final_approval IS true AND old.final_approval IS DISTINCT FROM true) OR (new.stage='Ready for System Access' AND old.stage IS DISTINCT FROM new.stage)) AND v_final_rpc<>'1' THEN RAISE EXCEPTION 'UI/UX Final Approval must use the protected final-approval workflow.';END IF;
  IF new.stage='Activated' AND old.stage IS DISTINCT FROM new.stage AND v_recruitment_rpc<>'1' THEN RAISE EXCEPTION 'UI/UX Designer activation must use the protected workforce activation workflow.';END IF;RETURN new;
 END IF;
 IF (new.final_approval IS true AND old.final_approval IS DISTINCT FROM true) OR (new.stage='Ready for System Access' AND old.stage IS DISTINCT FROM new.stage) THEN
  IF v_final_rpc<>'1' AND v_sales_activation<>'1' THEN RAISE EXCEPTION 'Final approval must use the secure final-approval workflow.';END IF;
 END IF;
 IF new.stage='Activated' AND old.stage IS DISTINCT FROM new.stage AND v_sales_activation<>'1' THEN RAISE EXCEPTION 'Candidate activation must use the secure activation workflow.';END IF;
 RETURN new;
END;
$function$;

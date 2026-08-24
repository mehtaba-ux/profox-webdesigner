-- Allow the dedicated Module 5 RPC to clear a prior review and resubmit after Retry Required,
-- while preserving the Admin-only protection for direct learner writes.
CREATE OR REPLACE FUNCTION public.protect_training_progress_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_module public.training_modules%ROWTYPE;
  v_quiz_rpc text:=COALESCE(current_setting('profox.training_quiz_rpc',true),'');
  v_agreement_rules_rpc text:=COALESCE(current_setting('profox.training_agreement_rules_rpc',true),'');
  v_product_rpc text:=COALESCE(current_setting('profox.training_product_rpc',true),'');
  v_niche_rpc text:=COALESCE(current_setting('profox.training_niche_rpc',true),'');
  v_lead_research_rpc text:=COALESCE(current_setting('profox.training_lead_research_rpc',true),'');
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Training progress may only be changed by its owner or an Admin.'; END IF;
  SELECT * INTO v_module FROM public.training_modules WHERE id=NEW.module_id;
  IF NOT FOUND OR v_module.active IS NOT TRUE THEN RAISE EXCEPTION 'Training module is missing or inactive.'; END IF;

  IF TG_OP='INSERT' THEN
    IF (NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_status IS NOT NULL OR COALESCE(trim(NEW.feedback),'')<>'') AND NOT (v_module.slug='lead-research' AND v_lead_research_rpc='1') THEN RAISE EXCEPTION 'Training review fields are Admin-only.'; END IF;
    IF NEW.score IS NOT NULL AND v_quiz_rpc<>'1' AND v_product_rpc<>'1' AND v_niche_rpc<>'1' AND v_lead_research_rpc<>'1' THEN RAISE EXCEPTION 'Training scores must be recorded through the secure quiz/review workflow.'; END IF;
    IF v_module.slug='niche-training' AND NEW.status IN ('Passed','Completed') AND v_niche_rpc<>'1' THEN RAISE EXCEPTION 'Niche Training completion must be recorded through the secure niche certification workflow.'; END IF;
    IF v_module.slug='lead-research' AND NEW.status='Submitted' AND v_lead_research_rpc<>'1' THEN RAISE EXCEPTION 'Lead Research must be submitted through the secure qualification workflow.'; END IF;
    IF v_module.requires_admin_review AND NEW.status IN ('Passed','Completed','Retry Required') THEN RAISE EXCEPTION 'This module requires Admin review before it can be passed.'; END IF;
  ELSE
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.module_id IS DISTINCT FROM OLD.module_id THEN RAISE EXCEPTION 'Training progress ownership and module are immutable.'; END IF;
    IF (NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.review_status IS DISTINCT FROM OLD.review_status OR NEW.feedback IS DISTINCT FROM OLD.feedback) AND NOT (v_module.slug='lead-research' AND v_lead_research_rpc='1') THEN RAISE EXCEPTION 'Training review fields are Admin-only.'; END IF;
    IF NEW.score IS DISTINCT FROM OLD.score AND v_quiz_rpc<>'1' AND v_product_rpc<>'1' AND v_niche_rpc<>'1' AND v_lead_research_rpc<>'1' THEN RAISE EXCEPTION 'Training scores must be recorded through the secure quiz/review workflow.'; END IF;
    IF v_module.requires_admin_review AND NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status THEN RAISE EXCEPTION 'This module requires Admin review before it can be passed.'; END IF;
    IF v_module.slug IN ('product-training','product-package-training','product-packages') AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.score IS DISTINCT FROM OLD.score) AND NEW.status IN ('Passed','Retry Required','Completed') AND v_quiz_rpc<>'1' AND v_product_rpc<>'1' THEN RAISE EXCEPTION 'Product training results must be recorded through the secure product assessment workflow.'; END IF;
    IF v_module.slug='agreement-rules' THEN
      IF NEW.score IS DISTINCT FROM OLD.score AND v_quiz_rpc<>'1' THEN RAISE EXCEPTION 'Agreement & Sales Rules assessment scores must be recorded through the secure assessment workflow.'; END IF;
      IF NEW.status='Retry Required' AND OLD.status IS DISTINCT FROM NEW.status AND v_quiz_rpc<>'1' THEN RAISE EXCEPTION 'Agreement & Sales Rules retry status must come from the secure assessment workflow.'; END IF;
      IF NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status AND v_agreement_rules_rpc<>'1' THEN RAISE EXCEPTION 'Agreement & Sales Rules can only be completed after the secure knowledge check and acknowledgement.'; END IF;
    END IF;
    IF v_module.slug='niche-training' AND (((NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status) OR NEW.score IS DISTINCT FROM OLD.score OR NEW.completed_at IS DISTINCT FROM OLD.completed_at)) AND v_niche_rpc<>'1' THEN RAISE EXCEPTION 'Niche Training completion must be recorded through the secure niche certification workflow.'; END IF;
    IF v_module.slug='lead-research' AND NEW.status='Submitted' AND OLD.status IS DISTINCT FROM NEW.status AND v_lead_research_rpc<>'1' THEN RAISE EXCEPTION 'Lead Research must be submitted through the secure qualification workflow.'; END IF;
  END IF;

  IF v_module.requires_admin_review AND NEW.status NOT IN ('Not Started','In Progress','Submitted','Retry Required') THEN RAISE EXCEPTION 'Reviewed modules may only be submitted by trainees; pass/fail is Admin-controlled.'; END IF;
  IF NOT v_module.requires_admin_review AND NEW.status IN ('Passed','Completed') AND v_module.passing_score IS NOT NULL AND COALESCE(NEW.score,0)<v_module.passing_score THEN RAISE EXCEPTION 'Passing score of % is required for this module.',v_module.passing_score; END IF;
  NEW.progress_percent:=GREATEST(0,LEAST(COALESCE(NEW.progress_percent,0),100));
  NEW.attempts:=GREATEST(COALESCE(NEW.attempts,0),0);
  RETURN NEW;
END;
$function$;

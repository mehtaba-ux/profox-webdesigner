-- Module 10 QA hardening — notify Admin only when a review gate enters Submitted.
CREATE OR REPLACE FUNCTION public.notify_training_admin_review_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_module public.training_modules%ROWTYPE; v_user public.user_profiles%ROWTYPE; v_assignment_id uuid; v_key text; v_payload jsonb; v_should boolean:=false;
BEGIN
  SELECT * INTO v_module FROM public.training_modules WHERE id=NEW.module_id;
  IF NOT FOUND OR v_module.requires_admin_review IS NOT TRUE OR NEW.status<>'Submitted' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN v_should:=true; ELSE v_should:=OLD.status IS DISTINCT FROM NEW.status; END IF;
  IF NOT v_should THEN RETURN NEW; END IF;
  SELECT * INTO v_user FROM public.user_profiles WHERE id=NEW.user_id;
  SELECT id INTO v_assignment_id FROM public.training_assignments WHERE progress_id=NEW.id ORDER BY created_at DESC,id DESC LIMIT 1;
  v_key:='academy-review-required:'||NEW.id||':'||COALESCE(v_assignment_id::text,extract(epoch FROM NEW.updated_at)::bigint::text);
  v_payload:=jsonb_build_object('traineeName',COALESCE(NULLIF(v_user.full_name,''),v_user.email,'Trainee'),'moduleTitle',v_module.title,'submittedAt',NEW.updated_at);
  PERFORM public.service_queue_active_admins_operational_notification(v_key,'admin_training_review_required','Academy Review','Academy review required — '||v_module.title,COALESCE(NULLIF(v_user.full_name,''),v_user.email,'Trainee')||' submitted '||v_module.title||' for Admin review.','/admin/app/academy?tab=training',v_payload,now());
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_training_admin_review_event ON public.user_training_progress;
CREATE TRIGGER trg_notify_training_admin_review_event
AFTER INSERT OR UPDATE OF status ON public.user_training_progress
FOR EACH ROW EXECUTE FUNCTION public.notify_training_admin_review_event();
REVOKE ALL ON FUNCTION public.notify_training_admin_review_event() FROM PUBLIC,anon,authenticated;

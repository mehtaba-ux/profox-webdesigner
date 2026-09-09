-- CRM Sales SOP Part 7 — reviewer notification routing hardening
-- The Sales Validation queue is embedded in the existing My Work operational surface.
-- Keep seller notifications on CRM Leads; route reviewer/team notifications to My Work.

CREATE OR REPLACE FUNCTION public.crm_sales_validation_notify_reviewers(
  p_validation_id uuid,
  p_validation_type text,
  p_reviewer_team text,
  p_requested_by uuid,
  p_event_key text,
  p_title text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN
    SELECT u.id
    FROM public.user_profiles u
    WHERE u.status = 'active'
      AND u.id IS DISTINCT FROM p_requested_by
      AND public.crm_sales_validation_reviewer_eligible(p_validation_type,p_reviewer_team,u.id)
  LOOP
    PERFORM public.enqueue_in_app_notification(
      v_user.id,
      'Sales Validation',
      left(p_title,240),
      left(p_message,2000),
      '/admin?tab=myWork',
      'sales-validation:' || p_validation_id::text || ':' || p_event_key || ':' || v_user.id::text
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_sales_validation_requirement_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v record;
BEGIN
  IF NOT (
    NEW.content IS DISTINCT FROM OLD.content OR
    NEW.structured_value IS DISTINCT FROM OLD.structured_value OR
    NEW.information_certainty IS DISTINCT FROM OLD.information_certainty OR
    NEW.record_state IS DISTINCT FROM OLD.record_state OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.category IS DISTINCT FROM OLD.category
  ) THEN RETURN NEW; END IF;

  FOR v IN
    SELECT id,lead_id,validation_type,severity,status,requested_by,assigned_reviewer_id
    FROM public.crm_sales_validations
    WHERE requirement_id=NEW.id AND status IN ('APPROVED','REJECTED')
    FOR UPDATE
  LOOP
    UPDATE public.crm_sales_validations SET status='STALE',source_changed_at=now() WHERE id=v.id;
    PERFORM public.crm_write_lead_event(
      v.lead_id,'sales_validation_stale','Sales validation became stale',
      v.validation_type||' decision is stale because its source Requirement materially changed.',
      jsonb_build_object('validationId',v.id,'validationType',v.validation_type,'severity',v.severity,'status','STALE','requirementId',NEW.id),
      NULL,NULL,NULL,now(),'sales-validation:'||v.id::text||':stale'
    );
    PERFORM public.crm_sales_validation_notify_seller(
      v.id,v.requested_by,'stale','Sales validation is stale',
      'The source Requirement changed after specialist decision. The previous decision remains historical and a fresh review is required before relying on it.'
    );
  END LOOP;

  UPDATE public.crm_sales_validations
  SET source_changed_at=now()
  WHERE requirement_id=NEW.id AND status IN ('PENDING','IN_REVIEW','NEEDS_INFORMATION');

  FOR v IN
    SELECT id,assigned_reviewer_id
    FROM public.crm_sales_validations
    WHERE requirement_id=NEW.id AND status='IN_REVIEW' AND assigned_reviewer_id IS NOT NULL
  LOOP
    PERFORM public.enqueue_in_app_notification(
      v.assigned_reviewer_id,
      'Sales Validation',
      'Sales validation source changed',
      'A Requirement changed during review. Refresh the current source before deciding.',
      '/admin?tab=myWork',
      'sales-validation:'||v.id::text||':source-changed:'||NEW.updated_at::text||':'||v.assigned_reviewer_id::text
    );
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sales_validation_requirement_changed() FROM PUBLIC, anon, authenticated;

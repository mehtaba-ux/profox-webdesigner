-- Module 11D hardening: repeated review rounds need distinct communication cycles.

CREATE OR REPLACE FUNCTION public.notify_project_customer_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_cycle text;
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.queue_project_customer_message(NEW.id,'customer-project-started:'||NEW.id::text,'customer_project_started');
    RETURN NEW;
  END IF;

  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    v_cycle:=floor(extract(epoch FROM NEW.stage_changed_at)*1000)::bigint::text;
    IF NEW.stage IN ('Client Design Approval','Client Review') THEN
      PERFORM public.queue_project_customer_message(
        NEW.id,
        'customer-project-review:'||NEW.id::text||':'||lower(replace(NEW.stage,' ','-'))||':'||v_cycle,
        'customer_project_review_required'
      );
    ELSIF NEW.stage='Launch' THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-launch:'||NEW.id::text,'customer_project_launch');
    ELSIF NEW.stage='Handover' THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-handover:'||NEW.id::text,'customer_project_handover');
    ELSIF NEW.stage='Completed' THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-completed:'||NEW.id::text,'customer_project_completed');
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status='Paused' THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-paused:'||NEW.id::text||':'||extract(epoch FROM NEW.updated_at)::bigint,'customer_project_paused');
    ELSIF NEW.status='Active' AND OLD.status='Paused' THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-resumed:'||NEW.id::text||':'||extract(epoch FROM NEW.updated_at)::bigint,'customer_project_resumed');
    ELSIF NEW.status='Cancelled' THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-cancelled:'||NEW.id::text,'customer_project_cancelled');
    ELSIF NEW.status='Completed' THEN
      PERFORM public.queue_project_customer_message(NEW.id,'customer-project-completed:'||NEW.id::text,'customer_project_completed');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_project_customer_event() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.queue_due_project_customer_communications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_cfg jsonb:='{}'::jsonb;
  v_days integer[];
  v_project record;
  v_age integer;
  v_milestone integer;
  v_count integer:=0;
  v_cycle text;
BEGIN
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='communication_settings';
  IF COALESCE((v_cfg->>'customerEmailEnabled')::boolean,true) IS NOT TRUE THEN RETURN jsonb_build_object('projectReviewReminders',0); END IF;
  v_days:=public.communication_integer_array(v_cfg,'projectApprovalReminderDays',ARRAY[2,1],1,30);

  FOR v_project IN
    SELECT p.id,p.stage,p.stage_changed_at
    FROM public.projects p
    JOIN public.clients c ON c.id=p.client_id AND lower(trim(COALESCE(c.email,'')))<>''
    WHERE p.status='Active' AND p.stage IN ('Client Design Approval','Client Review')
  LOOP
    v_age:=GREATEST(floor(extract(epoch FROM (now()-v_project.stage_changed_at))/86400)::integer,0);
    SELECT max(x) INTO v_milestone FROM unnest(v_days) x WHERE x<=v_age;
    IF v_milestone IS NOT NULL THEN
      v_cycle:=floor(extract(epoch FROM v_project.stage_changed_at)*1000)::bigint::text;
      PERFORM public.queue_project_customer_message(
        v_project.id,
        'customer-project-review-reminder:'||v_project.id::text||':'||lower(replace(v_project.stage,' ','-'))||':'||v_cycle||':'||v_milestone::text,
        'customer_project_review_reminder',
        jsonb_build_object('daysWaitingForReview',v_age)
      );
      v_count:=v_count+1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('projectReviewReminders',v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.queue_due_project_customer_communications() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_project_customer_communications() TO service_role;

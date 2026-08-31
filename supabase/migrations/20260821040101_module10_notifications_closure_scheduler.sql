-- Module 10 closure — bounded recurring operational reminders.
-- The existing Module 10 quotation-follow-up scheduler is preserved as a base and wrapped.

CREATE OR REPLACE FUNCTION public.service_notification_integer_array(
  p_config jsonb,p_key text,p_default integer[],p_min integer DEFAULT 0,p_max integer DEFAULT 10080
)
RETURNS integer[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_json jsonb; v_text text; v_num integer; v_result integer[]:=ARRAY[]::integer[];
BEGIN
  v_json:=p_config->p_key;
  IF jsonb_typeof(v_json)<>'array' THEN RETURN p_default; END IF;
  FOR v_text IN SELECT jsonb_array_elements_text(v_json) LOOP
    BEGIN
      v_num:=v_text::integer;
      IF v_num BETWEEN p_min AND p_max AND NOT (v_num=ANY(v_result)) THEN v_result:=array_append(v_result,v_num); END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  IF COALESCE(cardinality(v_result),0)=0 THEN RETURN p_default; END IF;
  SELECT array_agg(x ORDER BY x DESC) INTO v_result FROM unnest(v_result) x;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.service_notification_integer_array(jsonb,text,integer[],integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_notification_integer_array(jsonb,text,integer[],integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.queue_due_operational_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_cfg jsonb:='{}'::jsonb;
  v_quote_hours integer[]; v_review_hours integer[]; v_payment_due_days integer[]; v_payment_overdue_days integer[];
  v_payment_verify_hours integer[]; v_task_due_days integer[]; v_task_overdue_days integer[]; v_commission_hours integer[]; v_payout_days integer[];
  v_row record; v_admin record; v_milestone integer; v_age integer; v_days integer; v_payload jsonb; v_project public.projects%ROWTYPE;
  v_quote_count integer:=0; v_review_count integer:=0; v_payment_count integer:=0; v_task_count integer:=0; v_commission_count integer:=0; v_payout_count integer:=0;
BEGIN
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='notification_settings';
  v_cfg:=COALESCE(v_cfg,'{}'::jsonb);
  v_quote_hours:=public.service_notification_integer_array(v_cfg,'quotationApprovalReminderHours',ARRAY[2,8,24],1,168);
  v_review_hours:=public.service_notification_integer_array(v_cfg,'adminReviewReminderHours',ARRAY[4,24,48],1,336);
  v_payment_due_days:=public.service_notification_integer_array(v_cfg,'paymentDueReminderDays',ARRAY[3,1,0],0,30);
  v_payment_overdue_days:=public.service_notification_integer_array(v_cfg,'paymentOverdueReminderDays',ARRAY[1,3,7],1,90);
  v_payment_verify_hours:=public.service_notification_integer_array(v_cfg,'paymentVerificationReminderHours',ARRAY[2,8,24],1,168);
  v_task_due_days:=public.service_notification_integer_array(v_cfg,'projectTaskReminderDays',ARRAY[1,0],0,30);
  v_task_overdue_days:=public.service_notification_integer_array(v_cfg,'projectTaskOverdueReminderDays',ARRAY[1,3,7],1,90);
  v_commission_hours:=public.service_notification_integer_array(v_cfg,'commissionReviewReminderHours',ARRAY[4,24,48],1,336);
  v_payout_days:=public.service_notification_integer_array(v_cfg,'commissionPayoutReminderDays',ARRAY[1,0],0,30);

  -- Manager-routed quotation approvals. Send only the latest reached milestone, so deployment/recovery never floods old milestones.
  FOR v_row IN
    SELECT q.* FROM public.quotations q
    WHERE q.status='Ready for Approval' AND q.approval_required IS TRUE
  LOOP
    v_age:=GREATEST(floor(extract(epoch FROM (now()-COALESCE(v_row.approval_checked_at,v_row.updated_at,v_row.created_at)))/3600)::integer,0);
    SELECT max(x) INTO v_milestone FROM unnest(v_quote_hours) x WHERE x<=v_age;
    IF v_milestone IS NOT NULL THEN
      v_payload:=jsonb_build_object('quotationNumber',v_row.quotation_number,'customerName',v_row.customer_name,'currency',v_row.currency,'total',v_row.total,'approvalReason',COALESCE(v_row.approval_reason,''),'waitingHours',v_age);
      PERFORM public.service_queue_active_admins_operational_notification(
        'quotation-approval-reminder:'||v_row.id||':'||v_milestone,
        'quotation_approval_required','Approval','Quotation approval still waiting — '||v_row.quotation_number,
        'This manager-routed quotation has waited '||v_age||' hour(s) for review.',
        '/admin/app/sales?tab=quotations',v_payload,now());
      v_quote_count:=v_quote_count+1;
    END IF;
  END LOOP;

  -- Academy submissions at true Admin-reviewed gates.
  FOR v_row IN
    SELECT p.id,p.user_id,p.updated_at,m.title,u.full_name,u.email
    FROM public.user_training_progress p
    JOIN public.training_modules m ON m.id=p.module_id AND m.active=true AND m.requires_admin_review=true
    JOIN public.user_profiles u ON u.id=p.user_id
    WHERE p.status='Submitted'
  LOOP
    v_age:=GREATEST(floor(extract(epoch FROM (now()-v_row.updated_at))/3600)::integer,0);
    SELECT max(x) INTO v_milestone FROM unnest(v_review_hours) x WHERE x<=v_age;
    IF v_milestone IS NOT NULL THEN
      v_payload:=jsonb_build_object('traineeName',COALESCE(NULLIF(v_row.full_name,''),v_row.email,'Trainee'),'moduleTitle',v_row.title,'submittedAt',v_row.updated_at,'waitingHours',v_age);
      PERFORM public.service_queue_active_admins_operational_notification(
        'academy-review-reminder:'||v_row.id||':'||v_milestone,
        'admin_training_review_required','Academy Review','Academy review still waiting — '||v_row.title,
        COALESCE(NULLIF(v_row.full_name,''),v_row.email,'Trainee')||' has a submitted Admin-review gate waiting '||v_age||' hour(s).',
        '/admin/app/academy?tab=training',v_payload,now());
      v_review_count:=v_review_count+1;
    END IF;
  END LOOP;

  -- Payment verification reminders for Admin.
  FOR v_row IN
    SELECT * FROM public.payments WHERE status='Verification Pending' AND verified_at IS NULL
  LOOP
    v_age:=GREATEST(floor(extract(epoch FROM (now()-v_row.updated_at))/3600)::integer,0);
    SELECT max(x) INTO v_milestone FROM unnest(v_payment_verify_hours) x WHERE x<=v_age;
    IF v_milestone IS NOT NULL THEN
      v_payload:=jsonb_build_object('paymentReference',v_row.payment_reference,'customerName',v_row.customer_name,'currency',v_row.currency,'amountDue',v_row.amount_due,'amountPaid',v_row.amount_paid,'status',v_row.status,'dueDate',COALESCE(v_row.due_date::text,''),'waitingHours',v_age);
      PERFORM public.service_queue_active_admins_operational_notification(
        'payment-verification-reminder:'||v_row.id||':'||v_milestone,
        'payment_verification_required','Payment','Payment verification still waiting — '||v_row.payment_reference,
        'This payment has waited '||v_age||' hour(s) for protected Admin verification.',
        '/admin/app/sales?tab=payments',v_payload,now());
      v_payment_count:=v_payment_count+1;
    END IF;
  END LOOP;

  -- Payment due and overdue reminders. Internal only; no customer email is generated by Module 10.
  FOR v_row IN
    SELECT * FROM public.payments
    WHERE verified_at IS NULL AND due_date IS NOT NULL
      AND lower(COALESCE(status,'')) NOT IN ('verified','cancelled','failed','refunded','partially refunded')
  LOOP
    v_days:=v_row.due_date-CURRENT_DATE;
    v_payload:=jsonb_build_object('paymentReference',v_row.payment_reference,'customerName',v_row.customer_name,'currency',v_row.currency,'amountDue',v_row.amount_due,'amountPaid',v_row.amount_paid,'outstanding',GREATEST(COALESCE(v_row.amount_due,0)-COALESCE(v_row.amount_paid,0),0),'status',v_row.status,'dueDate',v_row.due_date);
    IF v_days>=0 AND v_days=ANY(v_payment_due_days) THEN
      v_payload:=v_payload||jsonb_build_object('dueLabel',CASE WHEN v_days=0 THEN 'due today' WHEN v_days=1 THEN 'due tomorrow' ELSE 'due in '||v_days||' days' END,'daysUntilDue',v_days);
      IF v_row.salesperson_id IS NOT NULL THEN
        PERFORM public.service_queue_staff_operational_notification(v_row.salesperson_id,'payment-due:'||v_row.id||':'||v_days,'payment_due_internal','Payment','Payment '||(v_payload->>'dueLabel')||' — '||v_row.payment_reference,'Follow up the payment at the appropriate customer touchpoint.','/admin/app/sales?tab=payments',v_payload,now());
      ELSE
        PERFORM public.service_queue_active_admins_operational_notification('payment-due-unowned:'||v_row.id||':'||v_days,'payment_due_internal','Payment','Unowned payment '||(v_payload->>'dueLabel')||' — '||v_row.payment_reference,'This payment has no salesperson owner and needs management attention.','/admin/app/sales?tab=payments',v_payload,now());
      END IF;
      v_payment_count:=v_payment_count+1;
    ELSIF v_days<0 THEN
      v_age:=ABS(v_days);
      SELECT max(x) INTO v_milestone FROM unnest(v_payment_overdue_days) x WHERE x<=v_age;
      IF v_milestone IS NOT NULL THEN
        v_payload:=v_payload||jsonb_build_object('daysOverdue',v_age);
        IF v_row.salesperson_id IS NOT NULL THEN
          PERFORM public.service_queue_staff_operational_notification(v_row.salesperson_id,'payment-overdue:'||v_row.id||':'||v_milestone,'payment_overdue_internal','Payment','Payment overdue — '||v_row.payment_reference,'This customer payment is '||v_age||' day(s) overdue.','/admin/app/sales?tab=payments',v_payload,now());
        END IF;
        IF v_row.salesperson_id IS NULL OR v_milestone>=3 THEN
          PERFORM public.service_queue_active_admins_operational_notification('payment-overdue-admin:'||v_row.id||':'||v_milestone,'payment_overdue_internal','Payment','Overdue payment needs management visibility — '||v_row.payment_reference,'The payment is '||v_age||' day(s) overdue'||CASE WHEN v_row.salesperson_id IS NULL THEN ' and has no salesperson owner.' ELSE '.' END,'/admin/app/sales?tab=payments',v_payload,now());
        END IF;
        v_payment_count:=v_payment_count+1;
      END IF;
    END IF;
  END LOOP;

  -- Project-task due/overdue reminders with escalation only after an overdue milestone.
  FOR v_row IN
    SELECT t.*,p.project_name,p.project_manager_id
    FROM public.project_tasks t JOIN public.projects p ON p.id=t.project_id
    WHERE t.completed_at IS NULL AND lower(COALESCE(t.status,'')) NOT IN ('completed','done','cancelled') AND t.due_date IS NOT NULL
  LOOP
    v_days:=v_row.due_date-CURRENT_DATE;
    v_payload:=jsonb_build_object('projectName',v_row.project_name,'taskTitle',v_row.title,'priority',COALESCE(v_row.priority,''),'dueDate',v_row.due_date);
    IF v_days>=0 AND v_days=ANY(v_task_due_days) THEN
      v_payload:=v_payload||jsonb_build_object('dueLabel',CASE WHEN v_days=0 THEN 'due today' WHEN v_days=1 THEN 'due tomorrow' ELSE 'due in '||v_days||' days' END);
      IF v_row.assigned_to IS NOT NULL THEN
        PERFORM public.service_queue_staff_operational_notification(v_row.assigned_to,'project-task-due:'||v_row.id||':'||v_days,'project_task_due','Project Task','Task '||(v_payload->>'dueLabel')||' — '||v_row.title,'Keep the delivery plan truthful by completing or updating this task.','/admin/app/projects?tab=myWork',v_payload,now());
      ELSIF v_row.project_manager_id IS NOT NULL THEN
        PERFORM public.service_queue_staff_operational_notification(v_row.project_manager_id,'project-task-due-unassigned:'||v_row.id||':'||v_days,'project_task_needs_owner','Project Task','Unassigned task '||(v_payload->>'dueLabel')||' — '||v_row.title,'Assign an owner before this task becomes overdue.','/admin/app/projects?tab=projects',v_payload,now());
      ELSE
        PERFORM public.service_queue_active_admins_operational_notification('project-task-due-unowned:'||v_row.id||':'||v_days,'project_task_needs_owner','Project Task','Unowned project task '||(v_payload->>'dueLabel')||' — '||v_row.title,'This due task has neither assignee nor project manager.','/admin/app/projects?tab=projects',v_payload,now());
      END IF;
      v_task_count:=v_task_count+1;
    ELSIF v_days<0 THEN
      v_age:=ABS(v_days);
      SELECT max(x) INTO v_milestone FROM unnest(v_task_overdue_days) x WHERE x<=v_age;
      IF v_milestone IS NOT NULL THEN
        v_payload:=v_payload||jsonb_build_object('daysOverdue',v_age);
        IF v_row.assigned_to IS NOT NULL THEN
          PERFORM public.service_queue_staff_operational_notification(v_row.assigned_to,'project-task-overdue:'||v_row.id||':'||v_milestone,'project_task_overdue','Project Task','Task overdue — '||v_row.title,'This task is '||v_age||' day(s) overdue.','/admin/app/projects?tab=myWork',v_payload,now());
        END IF;
        IF v_milestone>=3 THEN
          IF v_row.project_manager_id IS NOT NULL AND v_row.project_manager_id IS DISTINCT FROM v_row.assigned_to THEN
            PERFORM public.service_queue_staff_operational_notification(v_row.project_manager_id,'project-task-overdue-pm:'||v_row.id||':'||v_milestone,'project_task_overdue','Project Task','Overdue task needs PM attention — '||v_row.title,'This project task is '||v_age||' day(s) overdue.','/admin/app/projects?tab=projects',v_payload,now());
          ELSIF v_row.project_manager_id IS NULL THEN
            PERFORM public.service_queue_active_admins_operational_notification('project-task-overdue-admin:'||v_row.id||':'||v_milestone,'project_task_overdue','Project Task','Overdue task has no PM — '||v_row.title,'This project task is '||v_age||' day(s) overdue and has no project manager.','/admin/app/projects?tab=projects',v_payload,now());
          END IF;
        END IF;
        v_task_count:=v_task_count+1;
      END IF;
    END IF;
  END LOOP;

  -- Commission management reviews. Seller receives event status; recurring reminders go to the people who can actually resolve it.
  FOR v_row IN
    SELECT e.*,COALESCE(NULLIF(u.full_name,''),u.email,'Seller') seller_name
    FROM public.commission_entries e LEFT JOIN public.user_profiles u ON u.id=e.salesperson_id
    WHERE e.status IN ('Under Review','Disputed')
  LOOP
    v_age:=GREATEST(floor(extract(epoch FROM (now()-v_row.updated_at))/3600)::integer,0);
    SELECT max(x) INTO v_milestone FROM unnest(v_commission_hours) x WHERE x<=v_age;
    IF v_milestone IS NOT NULL THEN
      v_payload:=jsonb_build_object('entryNumber',v_row.entry_number,'sellerName',v_row.seller_name,'productName',v_row.product_name,'currency',v_row.currency,'commissionAmount',v_row.commission_amount,'effectiveRate',v_row.effective_rate_percent,'status',v_row.status,'waitingHours',v_age);
      PERFORM public.service_queue_active_admins_operational_notification('commission-review-reminder:'||v_row.id||':'||v_milestone,'commission_review_required','Commission','Commission review still waiting — '||v_row.entry_number,v_row.seller_name||' has a '||v_row.status||' commission waiting '||v_age||' hour(s).','/admin/app/commissions',v_payload,now());
      v_commission_count:=v_commission_count+1;
    END IF;
  END LOOP;

  -- Payout-day reminders, deduplicated per seller and batch rather than per commission entry.
  FOR v_row IN
    SELECT b.id,b.batch_number,b.scheduled_date,e.salesperson_id
    FROM public.commission_payout_batches b
    JOIN public.commission_entries e ON e.payout_batch_id=b.id AND e.salesperson_id IS NOT NULL AND e.status IN ('Approved','Earned')
    WHERE b.status='Approved' AND b.scheduled_date>=CURRENT_DATE
    GROUP BY b.id,b.batch_number,b.scheduled_date,e.salesperson_id
  LOOP
    v_days:=v_row.scheduled_date-CURRENT_DATE;
    IF v_days=ANY(v_payout_days) THEN
      PERFORM public.service_queue_staff_operational_notification(v_row.salesperson_id,'commission-payout-reminder:'||v_row.id||':'||v_row.salesperson_id||':'||v_days,'commission_payout_scheduled','Commission','Commission payout '||CASE WHEN v_days=0 THEN 'scheduled today' ELSE 'scheduled in '||v_days||' day(s)' END||' — '||v_row.batch_number,'Your commission payout batch is approaching its scheduled date.','/admin/app/commissions',jsonb_build_object('batchNumber',v_row.batch_number,'scheduledDate',v_row.scheduled_date),now());
      v_payout_count:=v_payout_count+1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'quotationApprovalChecks',v_quote_count,
    'adminReviewChecks',v_review_count,
    'paymentChecks',v_payment_count,
    'projectTaskChecks',v_task_count,
    'commissionChecks',v_commission_count,
    'payoutChecks',v_payout_count
  );
END;
$$;
REVOKE ALL ON FUNCTION public.queue_due_operational_notifications() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_operational_notifications() TO service_role;

-- Preserve the mature Module 10 quotation-follow-up implementation and layer complete operational reminders on top.
DO $$
BEGIN
  IF to_regprocedure('public.queue_due_sales_automations_base()') IS NULL THEN
    ALTER FUNCTION public.queue_due_sales_automations() RENAME TO queue_due_sales_automations_base;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_due_sales_automations_base() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_sales_automations_base() TO service_role;

CREATE OR REPLACE FUNCTION public.queue_due_sales_automations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_sales jsonb:='{}'::jsonb; v_operational jsonb:='{}'::jsonb;
BEGIN
  v_sales:=COALESCE(public.queue_due_sales_automations_base(),'{}'::jsonb);
  v_operational:=COALESCE(public.queue_due_operational_notifications(),'{}'::jsonb);
  RETURN v_sales||jsonb_build_object('module10Operational',v_operational);
END;
$$;
REVOKE ALL ON FUNCTION public.queue_due_sales_automations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_sales_automations() TO service_role;

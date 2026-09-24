-- Module 11C hardening: a genuine partial receipt can still leave an outstanding balance.
-- Verification Pending stays suppressed, but Partially Paid remains eligible for due/overdue balance follow-up.

CREATE OR REPLACE FUNCTION public.queue_due_payment_customer_communications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_cfg jsonb := '{}'::jsonb;
  v_due_days integer[];
  v_overdue_days integer[];
  v_p record;
  v_delta integer;
  v_milestone integer;
  v_context jsonb;
  v_contact text;
  v_due_count integer := 0;
  v_overdue_count integer := 0;
BEGIN
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='communication_settings';
  IF COALESCE((v_cfg->>'customerEmailEnabled')::boolean,true) IS NOT TRUE THEN
    RETURN jsonb_build_object('paymentDueReminders',0,'paymentOverdueReminders',0);
  END IF;
  v_due_days := public.communication_integer_array(v_cfg,'paymentDueReminderDays',ARRAY[3,1,0],0,30);
  v_overdue_days := public.communication_integer_array(v_cfg,'paymentOverdueReminderDays',ARRAY[1,3,7],1,90);

  FOR v_p IN
    SELECT p.*
    FROM public.payments p
    WHERE p.status IN ('Sent','Pending','Partially Paid')
      AND p.verified_at IS NULL
      AND p.due_date IS NOT NULL
      AND GREATEST(COALESCE(p.amount_due,0)-COALESCE(p.amount_paid,0),0)>0
      AND lower(trim(COALESCE(p.customer_email,'')))<>''
  LOOP
    v_delta := v_p.due_date-CURRENT_DATE;
    v_context := public.payment_customer_communication_context(v_p.id);
    v_contact := COALESCE(NULLIF(v_context->>'resolvedContactName',''),v_p.customer_name);

    IF v_delta>=0 AND v_delta=ANY(v_due_days) THEN
      v_context := v_context || jsonb_build_object(
        'daysUntilDue',v_delta,
        'dueLabel',CASE WHEN v_delta=0 THEN 'due today' WHEN v_delta=1 THEN 'due tomorrow' ELSE 'due in '||v_delta||' days' END
      );
      PERFORM public.service_queue_customer_communication(
        'customer-payment-due:'||v_p.id::text||':'||v_delta::text||':'||trim(to_char(COALESCE(v_p.amount_paid,0),'FM999999999990.00')),
        'customer_payment_due_reminder',v_p.customer_email,v_p.salesperson_id,v_contact,v_p.customer_name,v_context,now()
      );
      v_due_count := v_due_count+1;
    ELSIF v_delta<0 THEN
      SELECT max(x) INTO v_milestone FROM unnest(v_overdue_days) x WHERE x<=abs(v_delta);
      IF v_milestone IS NOT NULL THEN
        v_context := v_context || jsonb_build_object('daysOverdue',abs(v_delta));
        PERFORM public.service_queue_customer_communication(
          'customer-payment-overdue:'||v_p.id::text||':'||v_milestone::text||':'||trim(to_char(COALESCE(v_p.amount_paid,0),'FM999999999990.00')),
          'customer_payment_overdue_reminder',v_p.customer_email,v_p.salesperson_id,v_contact,v_p.customer_name,v_context,now()
        );
        v_overdue_count := v_overdue_count+1;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('paymentDueReminders',v_due_count,'paymentOverdueReminders',v_overdue_count);
END;
$$;
REVOKE ALL ON FUNCTION public.queue_due_payment_customer_communications() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_payment_customer_communications() TO service_role;

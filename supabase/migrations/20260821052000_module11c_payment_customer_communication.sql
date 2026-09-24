-- Module 11C - Customer payment communication.
-- Payment emails follow canonical protected payment states. They never verify or settle money.

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,active,description)
VALUES
(
 'customer_payment_request',
 'Customer payment request',
 'Payment details for {{paymentReference}}',
 E'Hi {{contactFirstName}},\n\nHere are the payment details for {{milestoneLabel}} on {{serviceLabel}}.\n\nReference: {{paymentReference}}\nAmount: {{currency}} {{amountDueFormatted}}\nDue: {{dueDateHuman}}\n{{paymentActionLine}}\n\nOnce payment is completed, we will confirm it after verification. If you need anything clarified before then, reply to this email.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Customer-facing payment request sent only when the canonical payment record reaches Sent.'
),
(
 'customer_payment_due_reminder',
 'Customer payment due reminder',
 'Payment reminder for {{paymentReference}}',
 E'Hi {{contactFirstName}},\n\nA quick reminder that the {{milestoneLabel}} payment for {{serviceLabel}} is {{dueLabel}}.\n\nReference: {{paymentReference}}\nAmount: {{currency}} {{outstandingFormatted}}\n{{paymentActionLine}}\n\nIf you have already paid, reply with the payment reference and we will check it. If the timing has changed, let us know so we can keep the next step clear.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Calm customer payment due reminder. Suppressed while payment verification is pending.'
),
(
 'customer_payment_overdue_reminder',
 'Customer payment follow-up',
 'Payment follow-up for {{paymentReference}}',
 E'Hi {{contactFirstName}},\n\nOur records still show the {{milestoneLabel}} payment for {{serviceLabel}} as outstanding.\n\nReference: {{paymentReference}}\nOutstanding: {{currency}} {{outstandingFormatted}}\nDue date: {{dueDateHuman}}\n{{paymentActionLine}}\n\nIf payment has already been made, reply with the reference and we will check it. If you need to discuss the timing, reply and {{ownerFirstName}} will help you work through the next step.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Human overdue follow-up without fake urgency or aggressive collection language.'
),
(
 'customer_payment_partial',
 'Customer partial payment recorded',
 'Payment update for {{paymentReference}}',
 E'Hi {{contactFirstName}},\n\nWe have recorded a partial payment for {{paymentReference}}.\n\nReceived: {{currency}} {{amountPaidFormatted}}\nPayment total: {{currency}} {{amountDueFormatted}}\nRemaining: {{currency}} {{outstandingFormatted}}\n\nThe payment is not yet fully verified. We will confirm the completed payment when the full amount has been received and verified.\n\nIf anything in this record needs clarification, reply to this email.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Sent only after the protected payment verification RPC records a genuine partial receipt.'
),
(
 'customer_payment_verified',
 'Customer payment confirmed',
 'Payment confirmed: {{paymentReference}}',
 E'Hi {{contactFirstName}},\n\nWe have verified your payment for {{paymentReference}}. Thank you.\n\nReceived: {{currency}} {{amountPaidFormatted}}\nFor: {{milestoneLabel}} on {{serviceLabel}}\n\n{{nextStepText}}\n\nIf you need a clarification or payment reference, reply to this email.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Customer confirmation only after canonical Admin verification.'
),
(
 'customer_payment_refund_update',
 'Customer refund update',
 'Refund update for {{paymentReference}}',
 E'Hi {{contactFirstName}},\n\nYour ProFox payment record {{paymentReference}} is now {{status}}.\n\nIf you need the payment reference or any clarification about this update, reply to this email and we will help.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Customer notice for protected Refunded or Partially Refunded status changes.'
)
ON CONFLICT(template_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.payment_customer_communication_context(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_p public.payments%ROWTYPE;
  v_contact text := '';
  v_service text := '';
  v_action text := '';
  v_due text := '';
  v_next text := '';
  v_amount_due text := '';
  v_amount_paid text := '';
  v_outstanding text := '';
BEGIN
  SELECT * INTO v_p FROM public.payments WHERE id=p_payment_id;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;

  IF v_p.quotation_id IS NOT NULL THEN
    SELECT q.contact_name INTO v_contact FROM public.quotations q WHERE q.id=v_p.quotation_id;
    SELECT qi.product_name_snapshot INTO v_service
    FROM public.quotation_items qi
    WHERE qi.quotation_id=v_p.quotation_id
    ORDER BY CASE WHEN qi.item_type='package' THEN 0 ELSE 1 END,qi.sort_order,qi.id
    LIMIT 1;
  END IF;
  IF COALESCE(trim(v_contact),'')='' AND v_p.client_id IS NOT NULL THEN
    SELECT c.primary_contact_name INTO v_contact FROM public.clients c WHERE c.id=v_p.client_id;
  END IF;
  v_contact := COALESCE(NULLIF(trim(v_contact),''),NULLIF(trim(v_p.customer_name),''),'');
  v_service := COALESCE(NULLIF(trim(v_service),''),'your ProFox project');

  v_amount_due := trim(to_char(COALESCE(v_p.amount_due,0),'FM999999999990.00'));
  v_amount_paid := trim(to_char(COALESCE(v_p.amount_paid,0),'FM999999999990.00'));
  v_outstanding := trim(to_char(GREATEST(COALESCE(v_p.amount_due,0)-COALESCE(v_p.amount_paid,0),0),'FM999999999990.00'));
  v_due := CASE WHEN v_p.due_date IS NULL THEN 'As agreed' ELSE to_char(v_p.due_date,'FMMonth DD, YYYY') END;

  IF COALESCE(trim(v_p.payment_link),'')<>'' THEN
    v_action := 'Payment link: '||trim(v_p.payment_link);
  ELSIF COALESCE(trim(v_p.payment_method),'')<>'' THEN
    v_action := 'Payment method: '||trim(v_p.payment_method);
  ELSE
    v_action := 'Reply to this email if you need the payment instructions.';
  END IF;

  v_next := CASE v_p.payment_type
    WHEN 'Advance' THEN 'The next step is onboarding and delivery preparation. We will keep you informed as the project moves forward.'
    WHEN 'Full Payment' THEN 'The next step is onboarding and delivery preparation. We will keep you informed as the project moves forward.'
    WHEN 'Final Payment' THEN 'The final payment gate is complete. We can continue with the remaining launch and handover steps.'
    ELSE 'We will keep the next project step clear and let you know when action is needed.'
  END;

  RETURN jsonb_build_object(
    'paymentReference',v_p.payment_reference,
    'paymentType',v_p.payment_type,
    'milestoneLabel',COALESCE(NULLIF(trim(v_p.milestone_label),''),NULLIF(trim(v_p.payment_type),''),'project payment'),
    'serviceLabel',v_service,
    'currency',COALESCE(NULLIF(trim(v_p.currency),''),'USD'),
    'amountDueFormatted',v_amount_due,
    'amountPaidFormatted',v_amount_paid,
    'outstandingFormatted',v_outstanding,
    'dueDate',COALESCE(v_p.due_date::text,''),
    'dueDateHuman',v_due,
    'paymentActionLine',v_action,
    'status',v_p.status,
    'nextStepText',v_next,
    'resolvedContactName',v_contact
  );
END;
$$;
REVOKE ALL ON FUNCTION public.payment_customer_communication_context(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payment_customer_communication_context(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_payment_customer_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_template text;
  v_key text;
  v_context jsonb;
  v_contact text;
BEGIN
  IF lower(trim(COALESCE(NEW.customer_email,'')))='' THEN RETURN NEW; END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.status<>'Sent' THEN RETURN NEW; END IF;
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  END IF;

  IF NEW.status='Sent' THEN
    v_template := 'customer_payment_request';
    v_key := 'customer-payment-request:'||NEW.id::text;
  ELSIF NEW.status='Partially Paid' THEN
    v_template := 'customer_payment_partial';
    v_key := 'customer-payment-partial:'||NEW.id::text||':'||trim(to_char(COALESCE(NEW.amount_paid,0),'FM999999999990.00'));
  ELSIF NEW.status='Verified' THEN
    v_template := 'customer_payment_verified';
    v_key := 'customer-payment-verified:'||NEW.id::text;
  ELSIF NEW.status IN ('Refunded','Partially Refunded') THEN
    v_template := 'customer_payment_refund_update';
    v_key := 'customer-payment-refund:'||NEW.id::text||':'||lower(replace(NEW.status,' ','-'));
  ELSE
    RETURN NEW;
  END IF;

  v_context := public.payment_customer_communication_context(NEW.id);
  v_contact := COALESCE(NULLIF(v_context->>'resolvedContactName',''),NEW.customer_name);
  PERFORM public.service_queue_customer_communication(
    v_key,v_template,NEW.customer_email,NEW.salesperson_id,v_contact,NEW.customer_name,v_context,now()
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_payment_customer_event() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS trg_notify_payment_customer_event ON public.payments;
CREATE TRIGGER trg_notify_payment_customer_event
AFTER INSERT OR UPDATE OF status,amount_paid ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.notify_payment_customer_event();

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
    WHERE p.status IN ('Sent','Pending')
      AND p.verified_at IS NULL
      AND p.due_date IS NOT NULL
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
        'customer-payment-due:'||v_p.id::text||':'||v_delta::text,
        'customer_payment_due_reminder',v_p.customer_email,v_p.salesperson_id,v_contact,v_p.customer_name,v_context,now()
      );
      v_due_count := v_due_count+1;
    ELSIF v_delta<0 THEN
      SELECT max(x) INTO v_milestone FROM unnest(v_overdue_days) x WHERE x<=abs(v_delta);
      IF v_milestone IS NOT NULL THEN
        v_context := v_context || jsonb_build_object('daysOverdue',abs(v_delta));
        PERFORM public.service_queue_customer_communication(
          'customer-payment-overdue:'||v_p.id::text||':'||v_milestone::text,
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

CREATE OR REPLACE FUNCTION public.queue_due_sales_automations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_sales jsonb := '{}'::jsonb;
  v_operational jsonb := '{}'::jsonb;
  v_quote_customer jsonb := '{}'::jsonb;
  v_payment_customer jsonb := '{}'::jsonb;
BEGIN
  v_sales := COALESCE(public.queue_due_sales_automations_base(),'{}'::jsonb);
  v_operational := COALESCE(public.queue_due_operational_notifications(),'{}'::jsonb);
  v_quote_customer := COALESCE(public.queue_due_quotation_customer_communications(),'{}'::jsonb);
  v_payment_customer := COALESCE(public.queue_due_payment_customer_communications(),'{}'::jsonb);
  RETURN v_sales
    || jsonb_build_object('module10Operational',v_operational)
    || jsonb_build_object('module11Customer',v_quote_customer||v_payment_customer);
END;
$$;
REVOKE ALL ON FUNCTION public.queue_due_sales_automations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_sales_automations() TO service_role;

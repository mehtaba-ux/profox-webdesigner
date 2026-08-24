-- Module 11B - Brand-aligned customer quotation communication.
-- Customer communication follows canonical quotation state and never changes quotation approval/acceptance itself.

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,active,description)
VALUES
(
 'customer_quotation_sent',
 'Customer quotation ready',
 'Your ProFox quotation is ready: {{quotationNumber}}',
 E'Hi {{contactFirstName}},\n\nYour ProFox quotation for {{serviceLabel}} is ready.\n\nQuotation: {{quotationNumber}}\nInvestment: {{currency}} {{totalFormatted}}\nValid until: {{validUntilHuman}}\nPayment terms: {{paymentTerms}}\n\nScope\n{{scopeSummary}}\n\nNext step\nReview the details and reply to this email with any questions or confirmation that you would like to proceed. {{ownerFirstName}} will take it from there.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Customer-facing quotation delivery message. Clear commercial summary with a human reply path. No fake urgency.'
),
(
 'customer_quotation_expiry_reminder',
 'Customer quotation validity reminder',
 'A quick note about quotation {{quotationNumber}}',
 E'Hi {{contactFirstName}},\n\nA quick note that your ProFox quotation for {{serviceLabel}} is valid until {{validUntilHuman}}.\n\nIf you are still considering the project, reply with any questions or anything you need clarified before deciding.\n\nIf the timing has changed, just let us know. We would rather keep the conversation clear than send unnecessary follow-ups.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Low-pressure quotation validity reminder. Uses milestone timing and one human reply path.'
),
(
 'customer_quotation_accepted',
 'Customer quotation confirmed',
 'Quotation {{quotationNumber}} confirmed',
 E'Hi {{contactFirstName}},\n\nThank you. We have recorded your confirmation for quotation {{quotationNumber}} for {{serviceLabel}}.\n\nThe next commercial step follows the payment terms agreed in the quotation. We will keep that step clear and send the relevant payment details separately.\n\nIf anything needs clarification before then, reply to this email.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Confirmation after the canonical quotation is marked Accepted.'
),
(
 'customer_quotation_closed',
 'Customer quotation closed',
 'Quotation {{quotationNumber}} has been closed',
 E'Hi {{contactFirstName}},\n\nThank you for letting us know. We have closed quotation {{quotationNumber}} for {{serviceLabel}}.\n\nIf your priorities or timing change later, you can reply to this email and we can pick the conversation up from the right place.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
 true,
 'Respectful acknowledgement after a quotation is marked Rejected. Keeps the relationship open without pressure.'
)
ON CONFLICT(template_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.quotation_customer_communication_context(p_quotation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_q public.quotations%ROWTYPE;
  v_service text;
  v_total text;
  v_valid text;
  v_terms text;
  v_scope text;
BEGIN
  SELECT * INTO v_q FROM public.quotations WHERE id=p_quotation_id;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;

  SELECT product_name_snapshot INTO v_service
  FROM public.quotation_items
  WHERE quotation_id=v_q.id AND item_type='package'
  ORDER BY sort_order,id
  LIMIT 1;
  IF COALESCE(trim(v_service),'')='' THEN
    SELECT product_name_snapshot INTO v_service
    FROM public.quotation_items
    WHERE quotation_id=v_q.id
    ORDER BY sort_order,id
    LIMIT 1;
  END IF;
  v_service := COALESCE(NULLIF(trim(v_service),''),'your project');
  v_total := trim(to_char(COALESCE(v_q.total,0),'FM999999999990.00'));
  v_valid := CASE WHEN v_q.valid_until IS NULL THEN 'the date agreed with your ProFox contact' ELSE to_char(v_q.valid_until,'FMMonth DD, YYYY') END;
  v_terms := COALESCE(NULLIF(trim(v_q.payment_terms),''),'As agreed in the quotation');
  v_scope := COALESCE(NULLIF(trim(v_q.scope_summary),''),'The agreed project scope is included in the quotation.');

  RETURN jsonb_build_object(
    'quotationNumber',v_q.quotation_number,
    'serviceLabel',v_service,
    'currency',COALESCE(NULLIF(trim(v_q.currency),''),'USD'),
    'totalFormatted',v_total,
    'validUntil',COALESCE(v_q.valid_until::text,''),
    'validUntilHuman',v_valid,
    'paymentTerms',v_terms,
    'scopeSummary',v_scope
  );
END;
$$;
REVOKE ALL ON FUNCTION public.quotation_customer_communication_context(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.quotation_customer_communication_context(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_quotation_customer_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_context jsonb;
  v_key text;
  v_template text;
BEGIN
  IF TG_OP<>'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF lower(trim(COALESCE(NEW.email,'')))='' THEN RETURN NEW; END IF;

  IF NEW.status='Sent' THEN
    v_key := 'customer-quotation-sent:'||NEW.id::text;
    v_template := 'customer_quotation_sent';
  ELSIF NEW.status='Accepted' THEN
    v_key := 'customer-quotation-accepted:'||NEW.id::text;
    v_template := 'customer_quotation_accepted';
  ELSIF NEW.status='Rejected' THEN
    v_key := 'customer-quotation-closed:'||NEW.id::text;
    v_template := 'customer_quotation_closed';
  ELSE
    RETURN NEW;
  END IF;

  v_context := public.quotation_customer_communication_context(NEW.id);
  PERFORM public.service_queue_customer_communication(
    v_key,
    v_template,
    NEW.email,
    NEW.salesperson_id,
    NEW.contact_name,
    NEW.customer_name,
    v_context,
    now()
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_quotation_customer_event() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS trg_notify_quotation_customer_event ON public.quotations;
CREATE TRIGGER trg_notify_quotation_customer_event
AFTER UPDATE OF status ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.notify_quotation_customer_event();

CREATE OR REPLACE FUNCTION public.queue_due_quotation_customer_communications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_cfg jsonb := '{}'::jsonb;
  v_days integer[];
  v_q record;
  v_day integer;
  v_context jsonb;
  v_count integer := 0;
BEGIN
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg
  FROM public.system_configuration WHERE config_key='communication_settings';
  IF COALESCE((v_cfg->>'customerEmailEnabled')::boolean,true) IS NOT TRUE THEN
    RETURN jsonb_build_object('quotationCustomerReminders',0);
  END IF;
  v_days := public.communication_integer_array(v_cfg,'quotationExpiryReminderDays',ARRAY[3,1],0,30);

  FOR v_q IN
    SELECT q.*
    FROM public.quotations q
    WHERE q.status='Sent'
      AND q.sent_at IS NOT NULL
      AND q.accepted_at IS NULL
      AND q.rejected_at IS NULL
      AND q.valid_until IS NOT NULL
      AND lower(trim(COALESCE(q.email,'')))<>''
  LOOP
    v_day := v_q.valid_until-CURRENT_DATE;
    IF v_day>=0 AND v_day=ANY(v_days) THEN
      v_context := public.quotation_customer_communication_context(v_q.id);
      PERFORM public.service_queue_customer_communication(
        'customer-quotation-expiry:'||v_q.id::text||':'||v_day::text,
        'customer_quotation_expiry_reminder',
        v_q.email,
        v_q.salesperson_id,
        v_q.contact_name,
        v_q.customer_name,
        v_context || jsonb_build_object('daysUntilExpiry',v_day),
        now()
      );
      v_count := v_count+1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('quotationCustomerReminders',v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.queue_due_quotation_customer_communications() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_quotation_customer_communications() TO service_role;

-- Extend the existing two-minute automation wrapper without replacing Module 10 behavior.
CREATE OR REPLACE FUNCTION public.queue_due_sales_automations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_sales jsonb := '{}'::jsonb;
  v_operational jsonb := '{}'::jsonb;
  v_customer jsonb := '{}'::jsonb;
BEGIN
  v_sales := COALESCE(public.queue_due_sales_automations_base(),'{}'::jsonb);
  v_operational := COALESCE(public.queue_due_operational_notifications(),'{}'::jsonb);
  v_customer := COALESCE(public.queue_due_quotation_customer_communications(),'{}'::jsonb);
  RETURN v_sales
    || jsonb_build_object('module10Operational',v_operational)
    || jsonb_build_object('module11Customer',v_customer);
END;
$$;
REVOKE ALL ON FUNCTION public.queue_due_sales_automations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_sales_automations() TO service_role;

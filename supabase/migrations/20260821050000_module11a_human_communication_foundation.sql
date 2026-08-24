-- Module 11A - Human communication foundation and email brand guardrails.
-- Canonical business records stay authoritative. This layer only prepares safe communication context.

-- 1) Clean legacy email templates so the new global email rule can be enforced safely.
UPDATE public.notification_templates
SET subject_template = replace(replace(subject_template, ' — ', ': '), '—', '-'),
    body_template = replace(replace(body_template, ' — ', ': '), '—', '-'),
    updated_at = now()
WHERE subject_template LIKE '%—%' OR body_template LIKE '%—%';

-- 2) Persistent customer-communication policy. Kept separate from notification provider settings
-- so existing Admin provider/timing saves cannot accidentally erase customer communication rules.
INSERT INTO public.system_configuration(config_key, config_value, description, updated_at)
VALUES (
  'communication_settings',
  jsonb_build_object(
    'customerEmailEnabled', true,
    'humanSenderEnabled', true,
    'defaultReplyTo', 'contact@profoxwebdesigner.com',
    'brandLine', 'From site to system.',
    'websiteUrl', 'https://www.profoxwebdesigner.com',
    'quotationExpiryReminderDays', jsonb_build_array(3, 1),
    'paymentDueReminderDays', jsonb_build_array(3, 1, 0),
    'paymentOverdueReminderDays', jsonb_build_array(1, 3, 7),
    'projectApprovalReminderDays', jsonb_build_array(2, 1)
  ),
  'Customer-facing ProFox communication policy, human sender rules and lifecycle reminder timing.',
  now()
)
ON CONFLICT(config_key) DO UPDATE SET
  config_value = COALESCE(public.system_configuration.config_value, '{}'::jsonb)
    || jsonb_build_object(
      'customerEmailEnabled', COALESCE(public.system_configuration.config_value->'customerEmailEnabled', 'true'::jsonb),
      'humanSenderEnabled', COALESCE(public.system_configuration.config_value->'humanSenderEnabled', 'true'::jsonb),
      'defaultReplyTo', COALESCE(public.system_configuration.config_value->'defaultReplyTo', to_jsonb('contact@profoxwebdesigner.com'::text)),
      'brandLine', COALESCE(public.system_configuration.config_value->'brandLine', to_jsonb('From site to system.'::text)),
      'websiteUrl', COALESCE(public.system_configuration.config_value->'websiteUrl', to_jsonb('https://www.profoxwebdesigner.com'::text)),
      'quotationExpiryReminderDays', COALESCE(public.system_configuration.config_value->'quotationExpiryReminderDays', jsonb_build_array(3,1)),
      'paymentDueReminderDays', COALESCE(public.system_configuration.config_value->'paymentDueReminderDays', jsonb_build_array(3,1,0)),
      'paymentOverdueReminderDays', COALESCE(public.system_configuration.config_value->'paymentOverdueReminderDays', jsonb_build_array(1,3,7)),
      'projectApprovalReminderDays', COALESCE(public.system_configuration.config_value->'projectApprovalReminderDays', jsonb_build_array(2,1))
    ),
  description = 'Customer-facing ProFox communication policy, human sender rules and lifecycle reminder timing.',
  updated_at = now();

-- 3) Global copy guard. Emails may not contain an em dash or emoji/symbol code points commonly used as emoji.
CREATE OR REPLACE FUNCTION public.profox_email_copy_has_disallowed_symbols(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path=public,pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM generate_series(1, char_length(COALESCE(p_text,''))) AS g(i)
    CROSS JOIN LATERAL (SELECT ascii(substr(COALESCE(p_text,''), g.i, 1)) AS cp) AS c
    WHERE c.cp = 8212
       OR c.cp BETWEEN 9728 AND 10175
       OR c.cp BETWEEN 8960 AND 9215
       OR c.cp BETWEEN 126976 AND 129791
       OR c.cp IN (8205, 8419, 65039)
  );
$$;

REVOKE ALL ON FUNCTION public.profox_email_copy_has_disallowed_symbols(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.profox_email_copy_has_disallowed_symbols(text) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_profox_email_copy_standard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF public.profox_email_copy_has_disallowed_symbols(COALESCE(NEW.subject_template,''))
     OR public.profox_email_copy_has_disallowed_symbols(COALESCE(NEW.body_template,'')) THEN
    RAISE EXCEPTION 'ProFox email templates cannot contain emojis or em dashes.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profox_email_copy_standard() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS trg_enforce_profox_email_copy_standard ON public.notification_templates;
CREATE TRIGGER trg_enforce_profox_email_copy_standard
BEFORE INSERT OR UPDATE OF subject_template, body_template ON public.notification_templates
FOR EACH ROW EXECUTE FUNCTION public.enforce_profox_email_copy_standard();

-- 4) Small validated integer-array helper dedicated to communication settings.
CREATE OR REPLACE FUNCTION public.communication_integer_array(
  p_config jsonb,
  p_key text,
  p_default integer[],
  p_min integer DEFAULT 0,
  p_max integer DEFAULT 90
)
RETURNS integer[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_json jsonb;
  v_text text;
  v_num integer;
  v_result integer[] := ARRAY[]::integer[];
BEGIN
  v_json := p_config->p_key;
  IF jsonb_typeof(v_json) <> 'array' THEN RETURN p_default; END IF;
  FOR v_text IN SELECT jsonb_array_elements_text(v_json) LOOP
    BEGIN
      v_num := v_text::integer;
      IF v_num BETWEEN p_min AND p_max AND NOT (v_num = ANY(v_result)) THEN
        v_result := array_append(v_result, v_num);
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  IF COALESCE(cardinality(v_result),0)=0 THEN RETURN p_default; END IF;
  SELECT array_agg(x ORDER BY x DESC) INTO v_result FROM unnest(v_result) x;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.communication_integer_array(jsonb,text,integer[],integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.communication_integer_array(jsonb,text,integer[],integer,integer) TO service_role;

-- 5) Admin-safe get/set RPCs. These are used by the future Customer Communication controls UI.
CREATE OR REPLACE FUNCTION public.admin_get_communication_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_cfg jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg
  FROM public.system_configuration WHERE config_key='communication_settings';
  RETURN COALESCE(v_cfg,'{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_communication_settings() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_communication_settings() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_set_communication_settings(
  p_customer_email_enabled boolean,
  p_human_sender_enabled boolean,
  p_default_reply_to text,
  p_quotation_expiry_days integer[],
  p_payment_due_days integer[],
  p_payment_overdue_days integer[],
  p_project_approval_days integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_cfg jsonb;
  v_notification jsonb;
  v_from_email text;
  v_from_domain text;
  v_reply text := lower(trim(COALESCE(p_default_reply_to,'')));
  v_reply_domain text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='communication_settings';
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_notification FROM public.system_configuration WHERE config_key='notification_settings';
  v_from_email := lower(trim(COALESCE(v_notification->>'fromEmail','')));
  v_from_domain := split_part(v_from_email,'@',2);
  IF v_reply <> '' THEN
    IF v_reply !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Default Reply-To must be a valid email address.'; END IF;
    v_reply_domain := split_part(v_reply,'@',2);
    IF v_from_domain='' OR v_reply_domain IS DISTINCT FROM v_from_domain THEN
      RAISE EXCEPTION 'Default Reply-To must use the same verified domain as the configured ProFox sender.';
    END IF;
  END IF;
  v_cfg := COALESCE(v_cfg,'{}'::jsonb) || jsonb_build_object(
    'customerEmailEnabled', COALESCE(p_customer_email_enabled,true),
    'humanSenderEnabled', COALESCE(p_human_sender_enabled,true),
    'defaultReplyTo', COALESCE(NULLIF(v_reply,''),v_from_email),
    'brandLine', 'From site to system.',
    'websiteUrl', COALESCE(NULLIF(v_notification->>'publicBaseUrl',''),'https://www.profoxwebdesigner.com'),
    'quotationExpiryReminderDays', to_jsonb(public.communication_integer_array(jsonb_build_object('x',to_jsonb(COALESCE(p_quotation_expiry_days,ARRAY[3,1]))),'x',ARRAY[3,1],0,30)),
    'paymentDueReminderDays', to_jsonb(public.communication_integer_array(jsonb_build_object('x',to_jsonb(COALESCE(p_payment_due_days,ARRAY[3,1,0]))),'x',ARRAY[3,1,0],0,30)),
    'paymentOverdueReminderDays', to_jsonb(public.communication_integer_array(jsonb_build_object('x',to_jsonb(COALESCE(p_payment_overdue_days,ARRAY[1,3,7]))),'x',ARRAY[1,3,7],1,90)),
    'projectApprovalReminderDays', to_jsonb(public.communication_integer_array(jsonb_build_object('x',to_jsonb(COALESCE(p_project_approval_days,ARRAY[2,1]))),'x',ARRAY[2,1],0,30))
  );
  INSERT INTO public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  VALUES('communication_settings',v_cfg,'Customer-facing ProFox communication policy, human sender rules and lifecycle reminder timing.',auth.uid(),now())
  ON CONFLICT(config_key) DO UPDATE SET config_value=EXCLUDED.config_value,description=EXCLUDED.description,updated_by=auth.uid(),updated_at=now();
  RETURN v_cfg;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_communication_settings(boolean,boolean,text,integer[],integer[],integer[],integer[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_communication_settings(boolean,boolean,text,integer[],integer[],integer[],integer[]) TO authenticated,service_role;

-- 6) Build one consistent human context for every customer-facing email.
CREATE OR REPLACE FUNCTION public.service_build_customer_communication_payload(
  p_owner_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT '',
  p_company_name text DEFAULT '',
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_comm jsonb := '{}'::jsonb;
  v_notification jsonb := '{}'::jsonb;
  v_owner public.user_profiles%ROWTYPE;
  v_has_owner boolean := false;
  v_owner_name text := '';
  v_owner_first text := '';
  v_owner_email text := '';
  v_from_email text := '';
  v_from_name text := 'ProFox';
  v_from_domain text := '';
  v_reply text := '';
  v_contact text := trim(COALESCE(p_contact_name,''));
  v_contact_first text := '';
  v_company text := trim(COALESCE(p_company_name,''));
  v_human_sender boolean := true;
BEGIN
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_comm FROM public.system_configuration WHERE config_key='communication_settings';
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_notification FROM public.system_configuration WHERE config_key='notification_settings';
  v_from_email := lower(trim(COALESCE(v_notification->>'fromEmail','contact@profoxwebdesigner.com')));
  v_from_name := COALESCE(NULLIF(trim(v_notification->>'fromName'),''),'ProFox');
  v_from_domain := split_part(v_from_email,'@',2);
  v_human_sender := COALESCE((v_comm->>'humanSenderEnabled')::boolean,true);

  IF p_owner_id IS NOT NULL THEN
    SELECT * INTO v_owner FROM public.user_profiles
    WHERE id=p_owner_id AND status='active' AND role NOT IN ('pending','customer')
    LIMIT 1;
    v_has_owner := FOUND;
  END IF;
  IF v_has_owner THEN
    v_owner_name := trim(COALESCE(v_owner.full_name,''));
    IF lower(v_owner_name) IN ('','admin user','administrator','user') THEN v_owner_name := ''; END IF;
    v_owner_email := lower(trim(COALESCE(v_owner.email,'')));
  END IF;
  IF v_owner_name <> '' THEN v_owner_first := split_part(v_owner_name,' ',1); END IF;
  IF v_contact <> '' THEN v_contact_first := split_part(v_contact,' ',1); ELSE v_contact_first := 'there'; END IF;
  IF v_company = '' THEN v_company := 'your business'; END IF;

  v_reply := lower(trim(COALESCE(v_comm->>'defaultReplyTo',v_notification->>'replyTo',v_from_email)));
  IF v_owner_email <> '' AND split_part(v_owner_email,'@',2)=v_from_domain THEN v_reply := v_owner_email; END IF;
  IF v_reply = '' OR split_part(v_reply,'@',2)<>v_from_domain THEN v_reply := v_from_email; END IF;

  RETURN COALESCE(p_context,'{}'::jsonb) || jsonb_build_object(
    'communicationAudience','customer',
    'contactName',COALESCE(NULLIF(v_contact,''),'there'),
    'contactFirstName',v_contact_first,
    'companyName',v_company,
    'ownerName',COALESCE(NULLIF(v_owner_name,''),'ProFox team'),
    'ownerFirstName',COALESCE(NULLIF(v_owner_first,''),'ProFox team'),
    'humanSenderName',CASE WHEN v_human_sender AND v_owner_first<>'' THEN v_owner_first||' at ProFox' ELSE v_from_name END,
    'replyToEmail',v_reply,
    'supportEmail',v_from_email,
    'brandLine',COALESCE(NULLIF(v_comm->>'brandLine',''),'From site to system.'),
    'websiteUrl',COALESCE(NULLIF(v_comm->>'websiteUrl',''),NULLIF(v_notification->>'publicBaseUrl',''),'https://www.profoxwebdesigner.com')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.service_build_customer_communication_payload(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_build_customer_communication_payload(uuid,text,text,jsonb) TO service_role;

-- 7) Central queue helper used by all Module 11 customer lifecycle triggers.
CREATE OR REPLACE FUNCTION public.service_queue_customer_communication(
  p_dedupe_key text,
  p_template_key text,
  p_recipient_email text,
  p_owner_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT '',
  p_company_name text DEFAULT '',
  p_context jsonb DEFAULT '{}'::jsonb,
  p_scheduled_for timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_cfg jsonb := '{}'::jsonb;
  v_email text := lower(trim(COALESCE(p_recipient_email,'')));
  v_payload jsonb;
BEGIN
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_cfg FROM public.system_configuration WHERE config_key='communication_settings';
  IF COALESCE((v_cfg->>'customerEmailEnabled')::boolean,true) IS NOT TRUE THEN RETURN NULL; END IF;
  IF p_template_key NOT LIKE 'customer\_%' ESCAPE '\' THEN RAISE EXCEPTION 'Customer communication helper requires a customer_ template key.'; END IF;
  IF v_email='' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RETURN NULL; END IF;
  v_payload := public.service_build_customer_communication_payload(p_owner_id,p_contact_name,p_company_name,p_context);
  RETURN public.enqueue_notification(p_dedupe_key,p_template_key,v_email,NULL,v_payload,COALESCE(p_scheduled_for,now()));
END;
$$;
REVOKE ALL ON FUNCTION public.service_queue_customer_communication(text,text,text,uuid,text,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_queue_customer_communication(text,text,text,uuid,text,text,jsonb,timestamptz) TO service_role;

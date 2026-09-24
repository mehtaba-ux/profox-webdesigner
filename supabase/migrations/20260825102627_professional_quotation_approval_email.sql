ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS html_template text;

COMMENT ON COLUMN public.notification_templates.html_template IS
  'Optional HTML email body. Plain-text body_template remains the required fallback.';

INSERT INTO public.notification_templates (
  template_key,
  name,
  subject_template,
  body_template,
  html_template,
  active,
  description,
  updated_at
)
VALUES (
  'quotation_approval_required',
  'Quotation Approval Required',
  'Quotation Approval Required: {{quotation_number}} | {{customer_name}}',
  $text$Quotation Approval Required

A quotation has been submitted for your review and approval.

Quotation: {{quotation_number}}
Customer: {{customer_name}}
Prepared by: {{salesperson_name}}
Total Value: {{currency}} {{quotation_total}}
Estimated Delivery: {{project_timeline}}
Valid Until: {{valid_until}}

Approval Required Because
{{approval_reason}}

Please review the complete quotation carefully, including the project scope, pricing, discounts, optional services, payment schedule, delivery timeline, and customer-facing proposal before approving it.

Review & Approve Quotation
{{quotation_approval_url}}

This link will take you directly to the quotation in the ProFox Sales workspace, where you can review the complete commercial details and approve it or return it for changes.

Status: Awaiting Approval

Best regards,
{{salesperson_name}}
Sales Representative
ProFox Web Designer$text$,
  $html$<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f8fafc;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr><td style="height:4px;background:#FF0E0E;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr>
              <td style="padding:30px 32px;">
                <img src="{{logo_url}}" width="150" alt="ProFox Web Designer" style="display:block;width:150px;max-width:100%;height:auto;margin:0 0 24px 0;border:0;">
                <h1 style="margin:0 0 12px 0;font-size:24px;line-height:32px;color:#000080;font-weight:700;">Quotation Approval Required</h1>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#475569;">A quotation has been submitted for your review and approval.</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 24px 0;">
                  <tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;width:42%;">Quotation</td><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">{{quotation_number}}</td></tr>
                  <tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">Customer</td><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">{{customer_name}}</td></tr>
                  <tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">Prepared by</td><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">{{salesperson_name}}</td></tr>
                  <tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">Total Value</td><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">{{currency}} {{quotation_total}}</td></tr>
                  <tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">Estimated Delivery</td><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">{{project_timeline}}</td></tr>
                  <tr><td style="padding:9px 0;font-size:13px;color:#64748b;">Valid Until</td><td style="padding:9px 0;font-size:13px;font-weight:700;color:#0f172a;">{{valid_until}}</td></tr>
                </table>

                <div style="margin:0 0 24px 0;padding:16px 18px;background:#f8fafc;border-left:4px solid #000080;border-radius:6px;">
                  <p style="margin:0 0 7px 0;font-size:12px;line-height:18px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#000080;">Approval Required Because</p>
                  <div style="margin:0;font-size:14px;line-height:22px;color:#334155;white-space:pre-line;">{{approval_reason}}</div>
                </div>

                <p style="margin:0 0 22px 0;font-size:14px;line-height:23px;color:#475569;">Please review the complete quotation carefully, including the project scope, pricing, discounts, optional services, payment schedule, delivery timeline, and customer-facing proposal before approving it.</p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
                  <tr><td style="border-radius:8px;background:#000080;"><a href="{{quotation_approval_url}}" style="display:inline-block;padding:12px 20px;font-size:14px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;">Review &amp; Approve Quotation</a></td></tr>
                </table>

                <p style="margin:0 0 20px 0;font-size:12px;line-height:19px;color:#64748b;">This link will take you directly to the quotation in the ProFox Sales workspace, where you can review the complete commercial details and approve it or return it for changes.</p>

                <p style="margin:0 0 28px 0;"><span style="display:inline-block;padding:5px 9px;background:#fff7ed;border:1px solid #fed7aa;border-radius:999px;font-size:11px;font-weight:700;color:#9a3412;">Awaiting Approval</span></p>

                <p style="margin:0;font-size:14px;line-height:22px;color:#334155;">Best regards,<br><strong>{{salesperson_name}}</strong><br>Sales Representative<br><strong>ProFox Web Designer</strong></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>$html$,
  true,
  'Professional internal operational email sent to active Admins when a quotation requires approval.',
  now()
)
ON CONFLICT (template_key) DO UPDATE
SET name = EXCLUDED.name,
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    html_template = EXCLUDED.html_template,
    active = true,
    description = EXCLUDED.description,
    updated_at = now();

DROP FUNCTION IF EXISTS public.service_claim_notification_batch(integer);

CREATE FUNCTION public.service_claim_notification_batch(p_limit integer DEFAULT 25)
RETURNS TABLE(
  id uuid,
  template_key text,
  recipient_email text,
  recipient_user_id uuid,
  payload jsonb,
  subject_template text,
  body_template text,
  html_template text,
  attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT o.id
    FROM public.notification_outbox o
    WHERE o.status IN ('Pending','Retry')
      AND o.scheduled_for <= now()
    ORDER BY o.scheduled_for, o.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit,25),1),100)
  ), updated AS (
    UPDATE public.notification_outbox o
    SET status='Processing',
        attempts=o.attempts+1,
        last_attempt_at=now(),
        updated_at=now()
    FROM claimed c
    WHERE o.id=c.id
    RETURNING o.*
  )
  SELECT
    u.id,
    u.template_key,
    u.recipient_email,
    u.recipient_user_id,
    u.payload,
    t.subject_template,
    t.body_template,
    t.html_template,
    u.attempts
  FROM updated u
  JOIN public.notification_templates t ON t.template_key=u.template_key
  WHERE t.active IS TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.service_claim_notification_batch(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_claim_notification_batch(integer) FROM anon;
REVOKE ALL ON FUNCTION public.service_claim_notification_batch(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.service_claim_notification_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_claim_notification_batch(integer) TO postgres;

CREATE OR REPLACE FUNCTION public.notify_quotation_operational_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payload jsonb;
  v_request boolean := false;
  v_approved boolean := false;
  v_total_text text;
  v_seller_name text;
  v_project_timeline text;
  v_valid_until text;
  v_approval_reasons text[];
  v_approval_reason text;
  v_website_url text;
  v_approval_url text;
  v_logo_url text;
BEGIN
  IF TG_OP='INSERT' THEN
    v_request := NEW.status='Ready for Approval' AND NEW.approval_required IS TRUE;
  ELSE
    v_request := NEW.status='Ready for Approval' AND NEW.approval_required IS TRUE
      AND (
        OLD.status IS DISTINCT FROM NEW.status
        OR OLD.approval_required IS DISTINCT FROM NEW.approval_required
        OR OLD.approval_checked_at IS DISTINCT FROM NEW.approval_checked_at
      );
    v_approved := NEW.status='Approved' AND OLD.status='Ready for Approval';
  END IF;

  SELECT COALESCE(NULLIF(btrim(up.full_name), ''), 'Sales Representative')
  INTO v_seller_name
  FROM public.user_profiles up
  WHERE up.id = NEW.salesperson_id;
  v_seller_name := COALESCE(v_seller_name, 'Sales Representative');

  v_total_text := trim(to_char(COALESCE(NEW.total, 0), 'FM999999999999990.00'));

  v_project_timeline := NULLIF(btrim(COALESCE(NEW.duration_snapshot_text, '')), '');
  IF v_project_timeline IS NULL THEN
    IF NEW.estimated_duration_min IS NOT NULL AND NEW.estimated_duration_max IS NOT NULL THEN
      IF NEW.estimated_duration_min = NEW.estimated_duration_max THEN
        v_project_timeline := NEW.estimated_duration_min::text || ' business days';
      ELSE
        v_project_timeline := NEW.estimated_duration_min::text || '–' || NEW.estimated_duration_max::text || ' business days';
      END IF;
    ELSE
      v_project_timeline := 'Requires confirmation';
    END IF;
  END IF;

  v_valid_until := CASE
    WHEN NEW.valid_until IS NULL THEN 'Not specified'
    ELSE to_char(NEW.valid_until, 'FMMonth DD, YYYY')
  END;

  IF v_request THEN
    v_approval_reasons := public.quotation_cpq_approval_reasons(NEW.id);
    IF COALESCE(array_length(v_approval_reasons, 1), 0) > 0 THEN
      v_approval_reason := '• ' || array_to_string(v_approval_reasons, E'\n• ');
    ELSE
      v_approval_reason := 'Management review is required under the current quotation approval policy.';
    END IF;
  ELSE
    v_approval_reason := COALESCE(NULLIF(btrim(NEW.approval_reason), ''), 'Management review is required under the current quotation approval policy.');
  END IF;

  SELECT NULLIF(btrim(sc.config_value->>'websiteUrl'), '')
  INTO v_website_url
  FROM public.system_configuration sc
  WHERE sc.config_key='quotation_cpq_settings'
  LIMIT 1;
  v_website_url := COALESCE(v_website_url, 'https://www.profoxwebdesigner.com/');
  v_approval_url := rtrim(v_website_url, '/') || '/admin/quotations/' || NEW.id::text;

  SELECT NULLIF(btrim(c.data->>'logoUrl'), '')
  INTO v_logo_url
  FROM public.content c
  WHERE c.id='theme'
  LIMIT 1;
  v_logo_url := COALESCE(v_logo_url, 'https://iili.io/fc5Rg8G.png');

  v_payload := jsonb_build_object(
    'quotationNumber', NEW.quotation_number,
    'customerName', NEW.customer_name,
    'currency', NEW.currency,
    'total', NEW.total,
    'approvalReason', COALESCE(NEW.approval_reason,''),
    'quotation_number', NEW.quotation_number,
    'customer_name', COALESCE(NULLIF(NEW.customer_name,''), 'Customer'),
    'salesperson_name', v_seller_name,
    'quotation_total', v_total_text,
    'project_timeline', v_project_timeline,
    'valid_until', v_valid_until,
    'approval_reason', v_approval_reason,
    'quotation_approval_url', v_approval_url,
    'logo_url', v_logo_url
  );

  IF v_request THEN
    PERFORM public.service_queue_active_admins_operational_notification(
      'quotation-approval-required:' || NEW.id || ':' || COALESCE(extract(epoch FROM NEW.approval_checked_at)::bigint::text, extract(epoch FROM NEW.updated_at)::bigint::text),
      'quotation_approval_required',
      'Approval',
      'Quotation Approval Required — ' || NEW.quotation_number,
      'Quotation ' || NEW.quotation_number || ' for ' || COALESCE(NULLIF(NEW.customer_name,''),'Customer') || ' is waiting for management review.',
      '/admin/quotations/' || NEW.id::text,
      v_payload,
      now()
    );
  END IF;

  IF v_approved AND NEW.salesperson_id IS NOT NULL THEN
    PERFORM public.service_queue_staff_operational_notification(
      NEW.salesperson_id,
      'quotation-approved:' || NEW.id || ':' || extract(epoch FROM COALESCE(NEW.approved_at,NEW.updated_at))::bigint,
      'quotation_approved_internal',
      'Quotation',
      'Quotation approved — ' || NEW.quotation_number,
      'Management approved this quotation. Continue with the approved sales workflow.',
      '/admin/app/sales?tab=quotations',
      v_payload,
      now()
    );
  END IF;

  RETURN NEW;
END;
$function$;
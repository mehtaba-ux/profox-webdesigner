-- Seller Experience full closure
-- Extends canonical CRM, meetings, quotations, commissions, notifications and Academy sources.
-- No parallel business source of truth is introduced.

ALTER TABLE public.sales_meetings
  ADD COLUMN IF NOT EXISTS prep_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS prep_reviewed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_meetings_seller_prep_start
  ON public.sales_meetings(salesperson_id, start_at)
  WHERE status IN ('Scheduled','Rescheduled');

CREATE OR REPLACE FUNCTION public.mark_sales_meeting_prepared(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_meeting public.sales_meetings%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_meeting FROM public.sales_meetings WHERE id=p_meeting_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found.'; END IF;
  IF NOT public.is_admin() AND v_meeting.salesperson_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'You may only prepare your own meeting.'; END IF;
  IF v_meeting.status NOT IN ('Scheduled','Rescheduled') THEN RAISE EXCEPTION 'Only a scheduled meeting can be marked prepared.'; END IF;
  UPDATE public.sales_meetings SET prep_reviewed_at=now(), prep_reviewed_by=v_uid, updated_at=now() WHERE id=p_meeting_id RETURNING * INTO v_meeting;
  RETURN jsonb_build_object('meetingId',v_meeting.id,'prepReviewedAt',v_meeting.prep_reviewed_at,'prepReviewedBy',v_meeting.prep_reviewed_by,'prepared',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.mark_sales_meeting_prepared(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_sales_meeting_prepared(uuid) TO authenticated;

ALTER TABLE public.commission_entries
  ADD COLUMN IF NOT EXISTS adjustment_reason text,
  ADD COLUMN IF NOT EXISTS adjusted_from_amount numeric,
  ADD COLUMN IF NOT EXISTS adjusted_at timestamptz,
  ADD COLUMN IF NOT EXISTS adjusted_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.commission_adjustment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_entry_id uuid NOT NULL REFERENCES public.commission_entries(id) ON DELETE RESTRICT,
  old_amount numeric NOT NULL CHECK (old_amount >= 0),
  new_amount numeric NOT NULL CHECK (new_amount >= 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  adjusted_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commission_adjustment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commission_adjustment_events FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_commission_adjustment_events_entry_created ON public.commission_adjustment_events(commission_entry_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_adjust_commission(p_entry_id uuid,p_new_amount numeric,p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_entry public.commission_entries%ROWTYPE; v_reason text := btrim(COALESCE(p_reason,''));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
  IF p_entry_id IS NULL THEN RAISE EXCEPTION 'Commission entry is required.'; END IF;
  IF p_new_amount IS NULL OR p_new_amount < 0 THEN RAISE EXCEPTION 'Adjusted commission amount must be zero or greater.'; END IF;
  IF v_reason='' THEN RAISE EXCEPTION 'Adjustment reason is required.'; END IF;
  SELECT * INTO v_entry FROM public.commission_entries WHERE id=p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commission entry not found.'; END IF;
  IF v_entry.status IN ('Paid','Reversed') THEN RAISE EXCEPTION 'Paid or reversed commission cannot be adjusted.'; END IF;
  IF v_entry.payout_batch_id IS NOT NULL THEN RAISE EXCEPTION 'Remove the entry from its payout workflow before adjusting it.'; END IF;
  IF p_new_amount > v_entry.verified_payment_amount THEN RAISE EXCEPTION 'Adjusted commission cannot exceed the verified customer payment.'; END IF;
  IF round(p_new_amount,2)=round(v_entry.commission_amount,2) THEN RAISE EXCEPTION 'Adjusted commission amount must differ from the current amount.'; END IF;
  INSERT INTO public.commission_adjustment_events(commission_entry_id,old_amount,new_amount,reason,adjusted_by) VALUES(v_entry.id,v_entry.commission_amount,round(p_new_amount,2),v_reason,auth.uid());
  UPDATE public.commission_entries SET adjusted_from_amount=v_entry.commission_amount,commission_amount=round(p_new_amount,2),adjustment_reason=v_reason,adjusted_at=now(),adjusted_by=auth.uid(),status='Under Review',admin_review_notes=concat_ws(' | ',NULLIF(admin_review_notes,''),'Adjusted by Administrator: '||v_reason),updated_at=now() WHERE id=v_entry.id;
  PERFORM public.service_queue_staff_operational_notification(v_entry.salesperson_id,'commission-adjusted:'||v_entry.id::text||':'||extract(epoch FROM now())::bigint::text,'commission_adjusted','Commission','Commission adjusted - '||COALESCE(v_entry.entry_number,'Commission'),'The commission amount was adjusted and is waiting for approval. Reason: '||v_reason,'/admin/app/commissions?tab=my_commissions',jsonb_build_object('entryNumber',v_entry.entry_number,'currency',v_entry.currency,'oldAmount',v_entry.commission_amount,'newAmount',round(p_new_amount,2),'adjustmentReason',v_reason),now());
  PERFORM public.service_queue_active_admins_operational_notification('commission-adjusted-review:'||v_entry.id::text||':'||extract(epoch FROM now())::bigint::text,'commission_review_required','Commission','Adjusted commission needs approval - '||COALESCE(v_entry.entry_number,'Commission'),'An adjusted commission is now Under Review and requires management approval.','/admin/app/commissions?tab=admin_commissions',jsonb_build_object('entryNumber',v_entry.entry_number,'adjustmentReason',v_reason),now());
  RETURN jsonb_build_object('entryId',v_entry.id,'oldAmount',v_entry.commission_amount,'newAmount',round(p_new_amount,2),'status','Under Review','displayStatus','Adjusted','reason',v_reason);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_adjust_commission(uuid,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_commission(uuid,numeric,text) TO authenticated;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS customer_view_token_hash text,
  ADD COLUMN IF NOT EXISTS customer_view_token_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0 CHECK (view_count >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS uq_quotations_customer_view_token_hash ON public.quotations(customer_view_token_hash) WHERE customer_view_token_hash IS NOT NULL;
INSERT INTO public.system_configuration(config_key,config_value,description,updated_at)
VALUES('public_app_base_url',jsonb_build_object('url','https://www.profoxwebdesigner.com'),'Canonical public application base URL used for customer-facing links.',now()) ON CONFLICT (config_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.protect_quotation_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_atomic text:=COALESCE(current_setting('profox.quotation_atomic_rpc',true),''); v_view_tracking text:=COALESCE(current_setting('profox.quotation_view_tracking_rpc',true),'');
BEGIN
  IF v_view_tracking='1' THEN RETURN new; END IF;
  IF public.is_admin() THEN RETURN new; END IF;
  IF v_atomic='1' THEN RETURN new; END IF;
  IF old.status IN ('Approved','Sent','Accepted','Rejected','Expired','Cancelled') AND row(new.*) IS DISTINCT FROM row(old.*) THEN RAISE EXCEPTION 'Locked quotation may only be changed through the approved quotation workflow.'; END IF;
  IF new.status NOT IN ('Draft','Ready for Approval') THEN RAISE EXCEPTION 'Sales may only change quotation status through the approved quotation workflow.'; END IF;
  IF new.approved_by IS DISTINCT FROM old.approved_by OR new.approved_at IS DISTINCT FROM old.approved_at OR new.accepted_at IS DISTINCT FROM old.accepted_at OR new.approval_required IS DISTINCT FROM old.approval_required OR new.approval_route IS DISTINCT FROM old.approval_route OR new.approval_reason IS DISTINCT FROM old.approval_reason OR new.approval_checked_at IS DISTINCT FROM old.approval_checked_at THEN RAISE EXCEPTION 'Quotation approval and acceptance fields are privileged.'; END IF;
  IF pg_trigger_depth()=1 AND (new.subtotal IS DISTINCT FROM old.subtotal OR new.total IS DISTINCT FROM old.total) THEN RAISE EXCEPTION 'Quotation totals are calculated from line items and cannot be edited directly.'; END IF;
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_quotation_customer_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp'
AS $function$
DECLARE v_context jsonb; v_key text; v_template text; v_token text; v_base_url text; v_quote_url text;
BEGIN
  IF TG_OP<>'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF lower(trim(COALESCE(NEW.email,'')))='' THEN RETURN NEW; END IF;
  IF NEW.status='Sent' THEN
    v_key := 'customer-quotation-sent:'||NEW.id::text; v_template := 'customer_quotation_sent'; v_token := encode(extensions.gen_random_bytes(32),'hex');
    SELECT NULLIF(btrim(config_value->>'url'),'') INTO v_base_url FROM public.system_configuration WHERE config_key='public_app_base_url';
    v_base_url := rtrim(COALESCE(v_base_url,'https://www.profoxwebdesigner.com'),'/'); v_quote_url := v_base_url||'/quotation/review/'||v_token;
    PERFORM set_config('profox.quotation_view_tracking_rpc','1',true);
    UPDATE public.quotations SET customer_view_token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),customer_view_token_issued_at=now(),first_viewed_at=NULL,last_viewed_at=NULL,view_count=0,updated_at=now() WHERE id=NEW.id;
    PERFORM set_config('profox.quotation_view_tracking_rpc','',true);
  ELSIF NEW.status='Accepted' THEN v_key := 'customer-quotation-accepted:'||NEW.id::text; v_template := 'customer_quotation_accepted';
  ELSIF NEW.status='Rejected' THEN v_key := 'customer-quotation-closed:'||NEW.id::text; v_template := 'customer_quotation_closed';
  ELSE RETURN NEW; END IF;
  v_context := public.quotation_customer_communication_context(NEW.id);
  IF v_quote_url IS NOT NULL THEN v_context := v_context||jsonb_build_object('quotationUrl',v_quote_url); END IF;
  PERFORM public.service_queue_customer_communication(v_key,v_template,NEW.email,NEW.salesperson_id,NEW.contact_name,NEW.customer_name,v_context,now());
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.open_public_quotation(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp'
AS $function$
DECLARE v_hash text; v_quote public.quotations%ROWTYPE; v_first_open boolean := false; v_items jsonb := '[]'::jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token)<40 OR length(p_token)>256 THEN RAISE EXCEPTION 'Quotation link is invalid.'; END IF;
  v_hash := encode(extensions.digest(p_token,'sha256'),'hex');
  SELECT * INTO v_quote FROM public.quotations WHERE customer_view_token_hash=v_hash AND customer_view_token_issued_at IS NOT NULL AND status IN ('Sent','Accepted','Rejected','Expired') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation link is invalid or no longer available.'; END IF;
  v_first_open := v_quote.first_viewed_at IS NULL;
  PERFORM set_config('profox.quotation_view_tracking_rpc','1',true);
  UPDATE public.quotations SET first_viewed_at=COALESCE(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1,updated_at=now() WHERE id=v_quote.id RETURNING * INTO v_quote;
  PERFORM set_config('profox.quotation_view_tracking_rpc','',true);
  IF v_first_open AND v_quote.salesperson_id IS NOT NULL THEN
    PERFORM public.service_queue_staff_operational_notification(v_quote.salesperson_id,'quotation-opened:'||v_quote.id::text,'quotation_opened','Quotation','Quotation opened - '||v_quote.quotation_number,COALESCE(NULLIF(v_quote.customer_name,''),'Customer')||' opened the quotation for the first time.','/admin/focus/quotation/'||v_quote.id::text,jsonb_build_object('quotationNumber',v_quote.quotation_number,'customerName',v_quote.customer_name,'currency',v_quote.currency,'total',v_quote.total,'firstViewedAt',v_quote.first_viewed_at),now());
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',qi.id,'productCode',qi.product_code_snapshot,'productName',qi.product_name_snapshot,'description',qi.description_snapshot,'quantity',qi.quantity,'unitPrice',qi.unit_price,'lineTotal',qi.line_total,'itemType',qi.item_type) ORDER BY qi.sort_order,qi.created_at),'[]'::jsonb) INTO v_items FROM public.quotation_items qi WHERE qi.quotation_id=v_quote.id;
  RETURN jsonb_build_object('id',v_quote.id,'quotationNumber',v_quote.quotation_number,'customerName',v_quote.customer_name,'contactName',v_quote.contact_name,'currency',v_quote.currency,'status',v_quote.status,'validUntil',v_quote.valid_until,'paymentTerms',v_quote.payment_terms,'scopeSummary',v_quote.scope_summary,'exclusions',v_quote.exclusions,'customerNotes',v_quote.customer_notes,'subtotal',v_quote.subtotal,'total',v_quote.total,'sentAt',v_quote.sent_at,'acceptedAt',v_quote.accepted_at,'firstViewedAt',v_quote.first_viewed_at,'items',v_items);
END;
$function$;
REVOKE ALL ON FUNCTION public.open_public_quotation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_public_quotation(text) TO anon, authenticated;

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,active,description,updated_at) VALUES
('commission_adjusted','Commission adjusted','Commission adjusted - {{entryNumber}}','Your commission entry {{entryNumber}} was adjusted from {{currency}} {{oldAmount}} to {{currency}} {{newAmount}}.\n\nReason: {{adjustmentReason}}\n\nThe adjusted entry is waiting for management approval before payout.',true,'Seller notice when an Administrator adjusts a commission amount.',now()),
('quotation_opened','Quotation opened','Quotation opened - {{quotationNumber}}','{{customerName}} opened quotation {{quotationNumber}}. Use the CRM record to decide the next customer action.',true,'Seller notice on the first public customer view of a quotation.',now()),
('lead_no_next_activity','Lead needs a next activity','Lead needs a next activity','A lead you own has no future activity. Open the lead and schedule the next appropriate action so the CRM remains truthful.',true,'Seller reminder when an active lead has no next action.',now()),
('sales_policy_published','Sales policy updated','Sales policy updated - {{policyTitle}}','Approved Sales Academy policy/reference content was updated. Review the current source before your next relevant customer interaction.',true,'Seller alert when canonical Sales policy/reference content changes.',now()),
('sales_career_progression_eligible_seller','Career progression review eligibility reached','Management Review eligibility reached','You reached the configured verified-sales criteria for Management Review eligibility. This is a review milestone only and does not guarantee employment, salary, promotion, or an offer.',true,'Seller notice when configured Career Progression review criteria are reached.',now())
ON CONFLICT (template_key) DO UPDATE SET name=EXCLUDED.name,subject_template=EXCLUDED.subject_template,body_template=EXCLUDED.body_template,active=EXCLUDED.active,description=EXCLUDED.description,updated_at=now();

UPDATE public.notification_templates SET body_template='Hi {{contactFirstName}},\n\nYour ProFox quotation for {{serviceLabel}} is ready.\n\nQuotation: {{quotationNumber}}\nInvestment: {{currency}} {{totalFormatted}}\nValid until: {{validUntilHuman}}\nPayment terms: {{paymentTerms}}\n\nReview quotation\n{{quotationUrl}}\n\nScope\n{{scopeSummary}}\n\nNext step\nReview the details using the secure link above and reply to this email with any questions or confirmation that you would like to proceed. {{ownerFirstName}} will take it from there.\n\n{{ownerName}}\nProFox\n{{brandLine}}',updated_at=now() WHERE template_key='customer_quotation_sent';

CREATE INDEX IF NOT EXISTS idx_crm_leads_no_next_activity ON public.crm_leads(salesperson_id, created_at) WHERE converted_opportunity_id IS NULL AND next_follow_up_at IS NULL;
CREATE OR REPLACE FUNCTION public.queue_due_seller_experience_notifications()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_row record; v_count integer := 0; v_date text := to_char(CURRENT_DATE,'YYYY-MM-DD');
BEGIN
  FOR v_row IN SELECT l.id,l.salesperson_id,l.company_name,l.title,l.created_at FROM public.crm_leads l JOIN public.user_profiles u ON u.id=l.salesperson_id WHERE u.status='active' AND u.role IN ('sales','sales_rep','sales_team') AND l.converted_opportunity_id IS NULL AND l.status<>'Not Qualified' AND l.next_follow_up_at IS NULL AND l.created_at <= now()-interval '4 hours'
  LOOP
    PERFORM public.service_queue_staff_operational_notification(v_row.salesperson_id,'lead-no-next-activity:'||v_row.id::text||':'||v_date,'lead_no_next_activity','CRM','Lead needs a next activity - '||COALESCE(NULLIF(v_row.company_name,''),v_row.title,'Lead'),'This active lead has no future activity scheduled.','/admin/focus/lead/'||v_row.id::text,jsonb_build_object('leadId',v_row.id,'companyName',v_row.company_name,'leadTitle',v_row.title),now()); v_count:=v_count+1;
  END LOOP;
  RETURN jsonb_build_object('leadNoNextActivityChecks',v_count,'processedAt',now());
END;
$function$;
REVOKE ALL ON FUNCTION public.queue_due_seller_experience_notifications() FROM PUBLIC, anon, authenticated;

DO $do$ DECLARE v_job_id bigint; BEGIN SELECT jobid INTO v_job_id FROM cron.job WHERE jobname='profox-seller-experience-notifications' LIMIT 1; IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF; PERFORM cron.schedule('profox-seller-experience-notifications','17 * * * *','SELECT public.queue_due_seller_experience_notifications();'); END; $do$;

CREATE OR REPLACE FUNCTION public.notify_sales_policy_module_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_seller record; v_changed boolean:=false;
BEGIN
  IF NEW.slug NOT IN ('agreement-rules','quotation-process','payment-process','crm-training','calendar-setup','confidentiality-data-protection') THEN RETURN NEW; END IF;
  IF NEW.active IS NOT TRUE THEN RETURN NEW; END IF;
  v_changed := TG_OP='INSERT' OR OLD.active IS DISTINCT FROM NEW.active OR OLD.title IS DISTINCT FROM NEW.title OR OLD.description IS DISTINCT FROM NEW.description;
  IF NOT v_changed THEN RETURN NEW; END IF;
  FOR v_seller IN SELECT id FROM public.user_profiles WHERE status='active' AND role IN ('sales','sales_rep','sales_team') LOOP
    PERFORM public.service_queue_staff_operational_notification(v_seller.id,'sales-policy-module:'||NEW.id::text||':'||extract(epoch FROM NEW.updated_at)::bigint::text,'sales_policy_published','Sales Policy','Sales policy updated - '||NEW.title,'Approved Sales Academy policy/reference content was updated. Review the current source before using it with customers.','/admin/app/academy?tab=training_library',jsonb_build_object('policyTitle',NEW.title,'moduleSlug',NEW.slug),now());
  END LOOP; RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_notify_sales_policy_module_update ON public.training_modules;
CREATE TRIGGER trg_notify_sales_policy_module_update AFTER INSERT OR UPDATE OF title,description,active ON public.training_modules FOR EACH ROW EXECUTE FUNCTION public.notify_sales_policy_module_update();

CREATE OR REPLACE FUNCTION public.notify_sales_policy_lesson_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_module public.training_modules%ROWTYPE; v_seller record; v_changed boolean:=false;
BEGIN
  SELECT * INTO v_module FROM public.training_modules WHERE id=NEW.module_id;
  IF NOT FOUND OR v_module.slug NOT IN ('agreement-rules','quotation-process','payment-process','crm-training','calendar-setup','confidentiality-data-protection') OR v_module.active IS NOT TRUE THEN RETURN NEW; END IF;
  IF NEW.active IS NOT TRUE THEN RETURN NEW; END IF;
  v_changed := TG_OP='INSERT' OR OLD.active IS DISTINCT FROM NEW.active OR OLD.title IS DISTINCT FROM NEW.title OR OLD.content IS DISTINCT FROM NEW.content;
  IF NOT v_changed THEN RETURN NEW; END IF;
  FOR v_seller IN SELECT id FROM public.user_profiles WHERE status='active' AND role IN ('sales','sales_rep','sales_team') LOOP
    PERFORM public.service_queue_staff_operational_notification(v_seller.id,'sales-policy-lesson:'||NEW.id::text||':'||extract(epoch FROM NEW.updated_at)::bigint::text,'sales_policy_published','Sales Policy','Sales policy reference updated - '||v_module.title,'Approved Sales Academy reference content was updated. Review the current source before using it with customers.','/admin/app/academy?tab=training_library',jsonb_build_object('policyTitle',v_module.title,'lessonTitle',NEW.title,'moduleSlug',v_module.slug),now());
  END LOOP; RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_notify_sales_policy_lesson_update ON public.training_lessons;
CREATE TRIGGER trg_notify_sales_policy_lesson_update AFTER INSERT OR UPDATE OF title,content,active ON public.training_lessons FOR EACH ROW EXECUTE FUNCTION public.notify_sales_policy_lesson_update();

CREATE OR REPLACE FUNCTION public.sync_sales_career_progression_review(p_salesperson_id uuid, p_reference_date date DEFAULT CURRENT_DATE)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_progress jsonb; v_review public.sales_career_progression_reviews%ROWTYPE; v_id uuid; v_name text; v_inserted boolean:=false;
BEGIN
  IF p_salesperson_id IS NULL THEN RETURN NULL; END IF;
  v_progress:=public.calculate_sales_career_progression(p_salesperson_id,p_reference_date);
  SELECT * INTO v_review FROM public.sales_career_progression_reviews WHERE salesperson_id=p_salesperson_id AND policy_version=(v_progress->>'policyVersion')::integer AND period_start=(v_progress->>'periodStart')::date AND period_end=(v_progress->>'periodEnd')::date;
  IF COALESCE((v_progress->>'eligible')::boolean,false) THEN
    IF NOT FOUND THEN INSERT INTO public.sales_career_progression_reviews(salesperson_id,policy_version,period_start,period_end,status,metrics_snapshot) VALUES(p_salesperson_id,(v_progress->>'policyVersion')::integer,(v_progress->>'periodStart')::date,(v_progress->>'periodEnd')::date,'Eligible',v_progress) RETURNING id INTO v_id; v_inserted:=true;
    ELSE v_id:=v_review.id; UPDATE public.sales_career_progression_reviews SET metrics_snapshot=v_progress,updated_at=now(),status=CASE WHEN status='No Longer Eligible' THEN 'Eligible' ELSE status END WHERE id=v_id; IF v_review.status='No Longer Eligible' THEN v_inserted:=true; END IF; END IF;
    IF v_inserted THEN
      SELECT COALESCE(NULLIF(trim(full_name),''),'Sales representative') INTO v_name FROM public.user_profiles WHERE id=p_salesperson_id;
      PERFORM public.service_queue_active_admins_operational_notification('career-progression:'||v_id::text,'sales_career_progression_eligible_admin','career_progression_review','Sales career progression review ready',v_name||' reached the configured verified-sales criteria and is ready for management review.','/admin/sales-career-progression',jsonb_build_object('salespersonName',v_name,'periodStart',v_progress->>'periodStart','periodEnd',v_progress->>'periodEnd'),now());
      PERFORM public.service_queue_staff_operational_notification(p_salesperson_id,'career-progression-seller:'||v_id::text,'sales_career_progression_eligible_seller','Career Progression','Management Review eligibility reached','You reached the configured verified-sales criteria for Management Review eligibility. This is a review milestone only, not a guaranteed job, salary, promotion, or offer.','/admin/sales-career-progression',jsonb_build_object('periodStart',v_progress->>'periodStart','periodEnd',v_progress->>'periodEnd'),now());
    END IF;
  ELSE
    IF FOUND AND v_review.status IN ('Eligible','Under Review') THEN UPDATE public.sales_career_progression_reviews SET status='No Longer Eligible',metrics_snapshot=v_progress,updated_at=now() WHERE id=v_review.id; v_id:=v_review.id; END IF;
  END IF; RETURN v_id;
END;
$function$;

ALTER FUNCTION public.get_seller_command_center(uuid,text,date,date) RENAME TO get_seller_command_center_core;
REVOKE ALL ON FUNCTION public.get_seller_command_center_core(uuid,text,date,date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_seller_command_center(p_salesperson_id uuid DEFAULT NULL::uuid,p_period text DEFAULT 'month'::text,p_start_date date DEFAULT NULL::date,p_end_date date DEFAULT NULL::date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_data jsonb; v_target uuid; v_tz text := 'UTC'; v_today date; v_entries jsonb := '[]'::jsonb; v_high jsonb := '[]'::jsonb; v_other jsonb := '[]'::jsonb; v_tomorrow jsonb := '[]'::jsonb; v_adjusted numeric := 0;
BEGIN
  v_data := public.get_seller_command_center_core(p_salesperson_id,p_period,p_start_date,p_end_date);
  IF NULLIF(v_data->>'salespersonId','') IS NOT NULL THEN v_target := (v_data->>'salespersonId')::uuid; END IF;
  v_tz := COALESCE(NULLIF(v_data->>'timezone',''),'UTC'); v_today := COALESCE(NULLIF(v_data#>>'{today,localDate}','')::date,(now() AT TIME ZONE v_tz)::date);
  SELECT COALESCE(jsonb_agg(e || CASE WHEN ce.adjusted_at IS NOT NULL AND ce.status='Under Review' THEN jsonb_build_object('displayStatus','Adjusted','adjustmentReason',ce.adjustment_reason,'adjustedFromAmount',ce.adjusted_from_amount,'adjustedAt',ce.adjusted_at) WHEN ce.adjusted_at IS NOT NULL THEN jsonb_build_object('adjustmentReason',ce.adjustment_reason,'adjustedFromAmount',ce.adjusted_from_amount,'adjustedAt',ce.adjusted_at) ELSE '{}'::jsonb END ORDER BY ord),'[]'::jsonb) INTO v_entries FROM jsonb_array_elements(COALESCE(v_data#>'{commissions,entries}','[]'::jsonb)) WITH ORDINALITY x(e,ord) LEFT JOIN public.commission_entries ce ON ce.id=(e->>'id')::uuid;
  v_data := jsonb_set(v_data,'{commissions,entries}',v_entries,true);
  SELECT COALESCE(sum(ce.commission_amount),0) INTO v_adjusted FROM public.commission_entries ce WHERE (v_target IS NULL OR ce.salesperson_id=v_target) AND ce.adjusted_at IS NOT NULL AND ce.status='Under Review';
  v_data := jsonb_set(v_data,'{commissions,adjusted}',to_jsonb(v_adjusted),true);
  SELECT COALESCE(jsonb_agg(e || jsonb_build_object('actionUrl',CASE e->>'type' WHEN 'overdue_follow_up' THEN '/admin/focus/activity/'||(e->>'entityId') WHEN 'follow_up_today' THEN '/admin/focus/activity/'||(e->>'entityId') WHEN 'payment_verification' THEN '/admin/focus/payment/'||(e->>'entityId') WHEN 'quotation_follow_up' THEN '/admin/focus/quotation/'||(e->>'entityId') WHEN 'lead_needs_action' THEN '/admin/focus/lead/'||(e->>'entityId') WHEN 'opportunity_next_step' THEN '/admin/focus/opportunity/'||(e->>'entityId') ELSE COALESCE(e->>'actionUrl','/admin/today') END) ORDER BY ord),'[]'::jsonb) INTO v_high FROM jsonb_array_elements(COALESCE(v_data->'attention','[]'::jsonb)) WITH ORDINALITY x(e,ord) WHERE e->>'priority'='high';
  SELECT COALESCE(jsonb_agg(e || jsonb_build_object('actionUrl',CASE e->>'type' WHEN 'overdue_follow_up' THEN '/admin/focus/activity/'||(e->>'entityId') WHEN 'follow_up_today' THEN '/admin/focus/activity/'||(e->>'entityId') WHEN 'payment_verification' THEN '/admin/focus/payment/'||(e->>'entityId') WHEN 'quotation_follow_up' THEN '/admin/focus/quotation/'||(e->>'entityId') WHEN 'lead_needs_action' THEN '/admin/focus/lead/'||(e->>'entityId') WHEN 'opportunity_next_step' THEN '/admin/focus/opportunity/'||(e->>'entityId') ELSE COALESCE(e->>'actionUrl','/admin/today') END) ORDER BY ord),'[]'::jsonb) INTO v_other FROM jsonb_array_elements(COALESCE(v_data->'attention','[]'::jsonb)) WITH ORDINALITY x(e,ord) WHERE COALESCE(e->>'priority','')<>'high';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('type','meeting_prep_tomorrow','priority','medium','title',COALESCE(NULLIF(m.title,''),NULLIF(m.attendee_name,''),'Sales meeting'),'detail','Meeting is tomorrow and preparation has not been reviewed yet','actionUrl','/admin/focus/meeting/'||m.id::text,'entityId',m.id) ORDER BY m.start_at),'[]'::jsonb) INTO v_tomorrow FROM public.sales_meetings m WHERE (v_target IS NULL OR m.salesperson_id=v_target) AND m.status IN ('Scheduled','Rescheduled') AND (m.start_at AT TIME ZONE COALESCE(NULLIF(m.timezone,''),v_tz))::date=v_today+1 AND (m.prep_reviewed_at IS NULL OR (m.rescheduled_at IS NOT NULL AND m.prep_reviewed_at<m.rescheduled_at));
  v_data := jsonb_set(v_data,'{attention}',v_high||v_tomorrow||v_other,true); RETURN v_data;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_seller_command_center(uuid,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seller_command_center(uuid,text,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_seller_experience_closure(p_salesperson_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_is_admin boolean := false; v_target uuid; v_scope text; v_tz text := 'UTC'; v_today date; v_quote_days integer := 2; v_settings jsonb := '{}'::jsonb; v_progress jsonb := NULL;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  v_is_admin := public.is_admin(); IF NOT v_is_admin AND NOT public.has_active_role(ARRAY['sales']::text[]) THEN RAISE EXCEPTION 'Active Sales access required.'; END IF;
  IF v_is_admin THEN v_target:=p_salesperson_id; ELSE v_target:=v_uid; END IF;
  IF v_target IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.user_profiles u WHERE u.id=v_target AND u.status='active' AND u.role IN ('sales','sales_rep','sales_team')) THEN RAISE EXCEPTION 'Active Sales profile not found.'; END IF;
    SELECT COALESCE(NULLIF(timezone,''),'UTC') INTO v_tz FROM public.user_profiles WHERE id=v_target;
  ELSE SELECT COALESCE(NULLIF(timezone,''),'UTC') INTO v_tz FROM public.user_profiles WHERE id=v_uid; END IF;
  v_scope:=CASE WHEN v_target IS NULL THEN 'team' ELSE 'individual' END; v_today:=(now() AT TIME ZONE v_tz)::date;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_settings FROM public.system_configuration WHERE config_key='notification_settings'; v_quote_days:=LEAST(GREATEST(COALESCE((v_settings->>'quotationFollowUpDays')::integer,2),1),30); IF v_target IS NOT NULL THEN v_progress:=public.calculate_sales_career_progression(v_target,v_today); END IF;
  RETURN jsonb_build_object(
    'scope',v_scope,'salespersonId',v_target,'timezone',v_tz,'localDate',v_today,
    'funnel',jsonb_build_array(
      jsonb_build_object('key','new','label','New','count',(SELECT count(*) FROM public.crm_leads l WHERE (v_target IS NULL OR l.salesperson_id=v_target) AND l.converted_opportunity_id IS NULL AND l.status IN ('New','Researching'))),
      jsonb_build_object('key','contacted','label','Contacted','count',(SELECT count(*) FROM public.crm_leads l WHERE (v_target IS NULL OR l.salesperson_id=v_target) AND l.converted_opportunity_id IS NULL AND l.status IN ('Contacted','Follow-Up','Interested','Qualified'))),
      jsonb_build_object('key','meeting','label','Meeting Booked','count',(SELECT count(*) FROM public.crm_opportunities o WHERE (v_target IS NULL OR o.salesperson_id=v_target) AND o.status='Open' AND o.stage IN ('Meeting Scheduled','Requirements Confirmed'))),
      jsonb_build_object('key','quotation','label','Proposal / Quotation','count',(SELECT count(*) FROM public.crm_opportunities o WHERE (v_target IS NULL OR o.salesperson_id=v_target) AND o.status='Open' AND o.stage IN ('Quotation Sent','Negotiation / Decision Pending'))),
      jsonb_build_object('key','payment_pending','label','Payment Pending','count',(SELECT count(*) FROM public.crm_opportunities o WHERE (v_target IS NULL OR o.salesperson_id=v_target) AND o.status='Open' AND o.stage='Awaiting Advance Payment')),
      jsonb_build_object('key','won','label','Won','count',(SELECT count(*) FROM public.crm_opportunities o WHERE (v_target IS NULL OR o.salesperson_id=v_target) AND o.status='Won'))),
    'exactAttention',COALESCE((SELECT jsonb_agg(item ORDER BY priority_rank,sort_at) FROM (
      SELECT 1 priority_rank,a.due_at sort_at,jsonb_build_object('type','overdue_activity','priority','high','title',a.subject,'detail','CRM activity is overdue','actionUrl','/admin/focus/activity/'||a.id::text,'entityId',a.id) item FROM public.crm_activities a WHERE (v_target IS NULL OR a.assigned_to=v_target) AND lower(COALESCE(a.status,'')) NOT IN ('completed','cancelled') AND a.due_at<now()
      UNION ALL SELECT 1,COALESCE(p.updated_at,p.created_at),jsonb_build_object('type','payment_verification','priority','high','title',COALESCE(NULLIF(p.customer_name,''),p.payment_reference),'detail','Customer payment is waiting for protected verification','actionUrl','/admin/focus/payment/'||p.id::text,'entityId',p.id) FROM public.payments p WHERE (v_target IS NULL OR p.salesperson_id=v_target) AND p.status='Verification Pending'
      UNION ALL SELECT 2,a.due_at,jsonb_build_object('type','follow_up_today','priority','medium','title',a.subject,'detail','Follow-up is due today','actionUrl','/admin/focus/activity/'||a.id::text,'entityId',a.id) FROM public.crm_activities a WHERE (v_target IS NULL OR a.assigned_to=v_target) AND a.activity_type IN ('Follow-Up','Meeting Follow-Up','Quotation Follow-Up','Payment Follow-Up') AND lower(COALESCE(a.status,'')) NOT IN ('completed','cancelled') AND (a.due_at AT TIME ZONE v_tz)::date=v_today AND a.due_at>=now()
      UNION ALL SELECT 2,COALESCE(q.sent_at,q.updated_at),jsonb_build_object('type','quotation_follow_up','priority','medium','title',COALESCE(NULLIF(q.customer_name,''),q.quotation_number),'detail',q.quotation_number||' is awaiting customer follow-up','actionUrl','/admin/focus/quotation/'||q.id::text,'entityId',q.id) FROM public.quotations q WHERE (v_target IS NULL OR q.salesperson_id=v_target) AND q.status='Sent' AND q.accepted_at IS NULL AND q.rejected_at IS NULL AND q.sent_at IS NOT NULL AND q.sent_at<=now()-make_interval(days=>v_quote_days)
      UNION ALL SELECT 2,COALESCE(l.next_follow_up_at,l.created_at),jsonb_build_object('type','lead_next_action','priority','medium','title',COALESCE(NULLIF(l.company_name,''),l.title),'detail','Lead needs a next action','actionUrl','/admin/focus/lead/'||l.id::text,'entityId',l.id) FROM public.crm_leads l WHERE (v_target IS NULL OR l.salesperson_id=v_target) AND l.converted_opportunity_id IS NULL AND l.status<>'Not Qualified' AND (l.next_follow_up_at IS NULL OR l.next_follow_up_at<=now())
      UNION ALL SELECT 2,COALESCE(o.next_follow_up_at,o.updated_at),jsonb_build_object('type','opportunity_next_action','priority','medium','title',COALESCE(NULLIF(o.company_name,''),o.name),'detail','Open opportunity needs a future next action','actionUrl','/admin/focus/opportunity/'||o.id::text,'entityId',o.id) FROM public.crm_opportunities o WHERE (v_target IS NULL OR o.salesperson_id=v_target) AND o.status='Open' AND (o.next_follow_up_at IS NULL OR o.next_follow_up_at<now())
      UNION ALL SELECT 2,m.start_at,jsonb_build_object('type','meeting_prep_tomorrow','priority','medium','title',COALESCE(NULLIF(m.title,''),NULLIF(m.attendee_name,''),'Sales meeting'),'detail','Meeting is tomorrow and preparation has not been reviewed','actionUrl','/admin/focus/meeting/'||m.id::text,'entityId',m.id) FROM public.sales_meetings m WHERE (v_target IS NULL OR m.salesperson_id=v_target) AND m.status IN ('Scheduled','Rescheduled') AND (m.start_at AT TIME ZONE COALESCE(NULLIF(m.timezone,''),v_tz))::date=v_today+1 AND (m.prep_reviewed_at IS NULL OR (m.rescheduled_at IS NOT NULL AND m.prep_reviewed_at<m.rescheduled_at)) ORDER BY priority_rank,sort_at LIMIT 25) a),'[]'::jsonb),
    'tomorrowMeetings',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'attendeeName',m.attendee_name,'startAt',m.start_at,'timezone',m.timezone,'meetingUrl',m.meeting_url,'leadId',m.lead_id,'opportunityId',m.opportunity_id,'prepReviewedAt',m.prep_reviewed_at,'prepUrl','/admin/meeting-prep/'||m.id::text,'crmFocusUrl',CASE WHEN m.opportunity_id IS NOT NULL THEN '/admin/focus/opportunity/'||m.opportunity_id::text WHEN m.lead_id IS NOT NULL THEN '/admin/focus/lead/'||m.lead_id::text ELSE NULL END,'manageUrl','/admin/meetings?meetingId='||m.id::text) ORDER BY m.start_at) FROM public.sales_meetings m WHERE (v_target IS NULL OR m.salesperson_id=v_target) AND m.status IN ('Scheduled','Rescheduled') AND (m.start_at AT TIME ZONE COALESCE(NULLIF(m.timezone,''),v_tz))::date=v_today+1 AND (m.prep_reviewed_at IS NULL OR (m.rescheduled_at IS NOT NULL AND m.prep_reviewed_at<m.rescheduled_at))),'[]'::jsonb),
    'upcomingMeetings',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'attendeeName',m.attendee_name,'startAt',m.start_at,'timezone',m.timezone,'meetingUrl',m.meeting_url,'leadId',m.lead_id,'opportunityId',m.opportunity_id,'prepReviewedAt',m.prep_reviewed_at,'prepUrl','/admin/meeting-prep/'||m.id::text,'crmFocusUrl',CASE WHEN m.opportunity_id IS NOT NULL THEN '/admin/focus/opportunity/'||m.opportunity_id::text WHEN m.lead_id IS NOT NULL THEN '/admin/focus/lead/'||m.lead_id::text ELSE NULL END,'manageUrl','/admin/meetings?meetingId='||m.id::text) ORDER BY m.start_at) FROM (SELECT * FROM public.sales_meetings m WHERE (v_target IS NULL OR m.salesperson_id=v_target) AND m.status IN ('Scheduled','Rescheduled') AND m.start_at>now() AND m.start_at<now()+interval '7 days' ORDER BY m.start_at LIMIT 12) m),'[]'::jsonb),
    'payoutReadiness',jsonb_build_object('pendingApprovalAmount',COALESCE((SELECT sum(ce.commission_amount) FROM public.commission_entries ce WHERE (v_target IS NULL OR ce.salesperson_id=v_target) AND ce.status IN ('Earned','Under Review','Disputed') AND ce.payout_batch_id IS NULL),0),'pendingPaymentVerificationAmount',COALESCE((SELECT sum(p.amount_paid) FROM public.payments p WHERE (v_target IS NULL OR p.salesperson_id=v_target) AND p.status='Verification Pending'),0),'adjustedCommissionTotal',COALESCE((SELECT sum(ce.commission_amount) FROM public.commission_entries ce WHERE (v_target IS NULL OR ce.salesperson_id=v_target) AND ce.status='Under Review' AND ce.adjusted_at IS NOT NULL),0)),
    'careerProgression',v_progress,
    'adjustedCommissions',COALESCE((SELECT jsonb_agg(obj ORDER BY adjusted_at DESC) FROM (SELECT ce.adjusted_at,jsonb_build_object('id',ce.id,'entryNumber',ce.entry_number,'productName',ce.product_name,'currency',ce.currency,'currentAmount',ce.commission_amount,'adjustedFromAmount',ce.adjusted_from_amount,'reason',ce.adjustment_reason,'adjustedAt',ce.adjusted_at,'canonicalStatus',ce.status,'displayStatus',CASE WHEN ce.status='Under Review' THEN 'Adjusted' ELSE ce.status END) obj FROM public.commission_entries ce WHERE (v_target IS NULL OR ce.salesperson_id=v_target) AND ce.adjusted_at IS NOT NULL ORDER BY ce.adjusted_at DESC LIMIT 10) x),'[]'::jsonb),
    'notifications',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.id,'type',n.notification_type,'title',n.title,'message',n.message,'actionUrl',n.action_url,'createdAt',n.created_at) ORDER BY n.created_at DESC) FROM public.in_app_notifications n WHERE n.read_at IS NULL AND ((v_target IS NOT NULL AND n.recipient_user_id=v_target) OR (v_target IS NULL AND EXISTS(SELECT 1 FROM public.user_profiles u WHERE u.id=n.recipient_user_id AND u.status='active' AND u.role IN ('sales','sales_rep','sales_team'))))),'[]'::jsonb));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_seller_experience_closure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seller_experience_closure(uuid) TO authenticated;
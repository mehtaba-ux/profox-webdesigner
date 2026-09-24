CREATE OR REPLACE FUNCTION public.quotation_presentation_payload(p_quotation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_q public.quotations%rowtype;
  v_items jsonb:='[]'::jsonb;
  v_cfg jsonb:=public.quotation_cpq_settings_safe();
  v_comm jsonb:='{}'::jsonb;
  v_payment jsonb;
  v_owner_name text:='ProFox';
  v_owner_email text;
  v_owner_phone text;
  v_payload jsonb;
BEGIN
  SELECT * INTO v_q FROM public.quotations WHERE id=p_quotation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found.'; END IF;

  SELECT coalesce(config_value,'{}'::jsonb)
  INTO v_comm
  FROM public.system_configuration
  WHERE config_key='communication_settings';

  IF v_q.salesperson_id IS NOT NULL THEN
    SELECT coalesce(nullif(full_name,''),'ProFox'),nullif(email,''),nullif(phone,'')
    INTO v_owner_name,v_owner_email,v_owner_phone
    FROM public.user_profiles WHERE id=v_q.salesperson_id;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',qi.id,
    'salesProductId',qi.sales_product_id,
    'productCode',qi.product_code_snapshot,
    'productName',qi.product_name_snapshot,
    'description',qi.description_snapshot,
    'quantity',qi.quantity,
    'unitPrice',qi.unit_price,
    'grossTotal',round((qi.quantity*qi.unit_price)::numeric,2),
    'discountType',qi.discount_type,
    'discountValue',qi.discount_value,
    'discountAmount',qi.discount_amount,
    'lineTotal',qi.line_total,
    'itemType',qi.item_type,
    'lineType',qi.line_type,
    'optionalForClient',qi.optional_for_client,
    'sectionKey',qi.section_key,
    'configuration',coalesce(qi.configuration_snapshot,'{}'::jsonb)
      - ARRAY['timelineSource','timelineStatus','catalogTimeline']::text[],
    'clientExpectations',coalesce(qi.client_expectations_snapshot,'{}'::jsonb),
    'durationMin',qi.duration_min_snapshot,
    'durationMax',qi.duration_max_snapshot,
    'durationUnit',qi.duration_unit_snapshot,
    'timelineImpact',qi.timeline_impact_snapshot,
    'durationNote',qi.duration_note_snapshot,
    'timelineText',public.format_quotation_line_timeline(
      qi.item_type,qi.duration_min_snapshot,qi.duration_max_snapshot,qi.duration_unit_snapshot,qi.timeline_impact_snapshot
    )
  ) ORDER BY qi.sort_order,qi.created_at),'[]'::jsonb)
  INTO v_items
  FROM public.quotation_items qi
  WHERE qi.quotation_id=v_q.id;

  v_payment:=public.quotation_payment_schedule_preview(v_q.id);

  v_payload:=jsonb_build_object(
    'id',v_q.id,
    'quotationNumber',v_q.quotation_number,
    'revisionNumber',v_q.revision_number,
    'revisionRootId',v_q.revision_root_id,
    'previousRevisionId',v_q.previous_revision_id,
    'supersededById',v_q.superseded_by_id,
    'isSuperseded',v_q.superseded_by_id IS NOT NULL,
    'quotationTemplateKey',v_q.quotation_template_key,
    'proposalTitle',coalesce(nullif(v_q.proposal_title,''),nullif(v_cfg->>'defaultProposalTitle',''),'Digital Project Proposal'),
    'executiveSummary',v_q.executive_summary,
    'coverMessage',coalesce(nullif(v_q.cover_message,''),nullif(v_cfg->>'defaultCoverMessage','')),
    'customerName',v_q.customer_name,
    'contactName',v_q.contact_name,
    'email',v_q.email,
    'phone',v_q.phone,
    'country',v_q.country,
    'currency',v_q.currency,
    'status',v_q.status,
    'preparedAt',v_q.created_at,
    'validUntil',v_q.valid_until,
    'sentAt',v_q.sent_at,
    'acceptedAt',v_q.accepted_at,
    'rejectedAt',v_q.rejected_at,
    'scopeSummary',v_q.scope_summary,
    'paymentTerms',v_q.payment_terms,
    'exclusions',v_q.exclusions,
    'customerNotes',v_q.customer_notes,
    'clientResponsibilities',v_q.client_responsibilities,
    'deliveryAssumptions',v_q.delivery_assumptions,
    'reviewProcess',v_q.review_process,
    'handoverSupport',v_q.handover_support,
    'termsAndConditions',coalesce(nullif(v_q.terms_and_conditions,''),nullif(v_cfg->>'standardTerms','')),
    'acceptanceMethod',v_q.acceptance_method,
    'subtotal',v_q.subtotal,
    'lineDiscountTotal',v_q.line_discount_total,
    'quoteDiscountType',v_q.quote_discount_type,
    'quoteDiscountValue',v_q.quote_discount_value,
    'quoteDiscountTotal',v_q.quote_discount_total,
    'optionalTotal',v_q.optional_total
  );

  v_payload:=v_payload||jsonb_build_object(
    'taxLabel',coalesce(nullif(v_cfg->>'taxLabel',''),'Tax'),
    'taxRate',v_q.tax_rate,
    'taxTotal',v_q.tax_total,
    'total',v_q.total,
    'estimatedDurationMin',v_q.estimated_duration_min,
    'estimatedDurationMax',v_q.estimated_duration_max,
    'durationUnit',v_q.duration_unit,
    'durationSnapshotText',v_q.duration_snapshot_text,
    'durationSource',v_q.duration_source,
    'durationRequiresAssessment',v_q.duration_requires_assessment,
    'paymentPlan',v_payment,
    'firstViewedAt',v_q.first_viewed_at,
    'lastViewedAt',v_q.last_viewed_at,
    'viewCount',v_q.view_count,
    'changeRequestedAt',v_q.change_requested_at,
    'items',v_items,
    'preparedBy',jsonb_build_object(
      'name',coalesce(v_owner_name,'ProFox'),'email',v_owner_email,'phone',v_owner_phone
    ),
    'branding',jsonb_build_object(
      'businessName',coalesce(nullif(v_cfg->>'businessName',''),'ProFox Web Designer'),
      'registeredName',coalesce(nullif(v_cfg->>'registeredName',''),'ProFox Digital Solution'),
      'websiteUrl',coalesce(nullif(v_cfg->>'websiteUrl',''),nullif(v_comm->>'websiteUrl',''),'https://www.profoxwebdesigner.com'),
      'contactEmail',coalesce(nullif(v_cfg->>'contactEmail',''),nullif(v_comm->>'defaultReplyTo',''),'contact@profoxwebdesigner.com'),
      'brandLine',coalesce(nullif(v_cfg->>'brandLine',''),nullif(v_comm->>'brandLine',''),'From site to system.')
    )
  );

  RETURN v_payload;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_quotation_cpq_summary(p_quotation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_q public.quotations%rowtype;
  v_presentation jsonb;
  v_payment jsonb;
  v_reasons text[];
  v_missing text[]:='{}'::text[];
  v_timeline_missing text[]:='{}'::text[];
  v_name text;
  v_has_scope boolean;
  v_email_ok boolean;
  v_expiry_ok boolean;
  v_payment_ok boolean;
  v_timeline_ok boolean;
  v_ready boolean;
BEGIN
  SELECT * INTO v_q FROM public.quotations WHERE id=p_quotation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found.'; END IF;
  IF NOT public.is_admin()
     AND v_q.salesperson_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_active_role(array['project_manager','site_manager']) THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  v_presentation:=public.quotation_presentation_payload(p_quotation_id);
  v_payment:=v_presentation->'paymentPlan';
  v_reasons:=public.quotation_cpq_approval_reasons(p_quotation_id);
  v_timeline_missing:=public.quotation_timeline_missing_items(p_quotation_id);

  SELECT EXISTS(
    SELECT 1 FROM public.quotation_items
    WHERE quotation_id=p_quotation_id AND line_type IN ('product','custom') AND optional_for_client=false
  ) INTO v_has_scope;

  v_email_ok:=coalesce(v_q.email,'')~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
  v_expiry_ok:=v_q.valid_until IS NOT NULL AND v_q.valid_until>=current_date;
  v_payment_ok:=coalesce(v_payment->>'error','')=''
    AND jsonb_typeof(v_payment->'schedule')='array'
    AND jsonb_array_length(v_payment->'schedule')>0;
  v_timeline_ok:=cardinality(v_timeline_missing)=0
    AND nullif(btrim(coalesce(v_q.duration_snapshot_text,'')),'') IS NOT NULL;

  IF v_q.opportunity_id IS NULL THEN v_missing:=array_append(v_missing,'CRM Opportunity linked'); END IF;
  IF NOT v_email_ok THEN v_missing:=array_append(v_missing,'Customer email available'); END IF;
  IF NOT v_has_scope THEN v_missing:=array_append(v_missing,'At least one committed product/service'); END IF;
  IF coalesce(v_q.total,0)<=0 THEN v_missing:=array_append(v_missing,'Pricing valid'); END IF;
  FOREACH v_name IN ARRAY v_timeline_missing LOOP
    v_missing:=array_append(v_missing,'Timeline missing for "'||v_name||'"');
  END LOOP;
  IF NOT v_payment_ok THEN v_missing:=array_append(v_missing,'Payment schedule valid'); END IF;
  IF v_q.status<>'Approved' THEN v_missing:=array_append(v_missing,'Required approval completed'); END IF;
  IF NOT v_expiry_ok THEN v_missing:=array_append(v_missing,'Expiration date valid'); END IF;
  IF v_q.superseded_by_id IS NOT NULL THEN v_missing:=array_append(v_missing,'Current revision'); END IF;

  v_ready:=cardinality(v_missing)=0;

  RETURN jsonb_build_object(
    'presentation',v_presentation,
    'approval',jsonb_build_object(
      'required',cardinality(v_reasons)>0,'reasons',to_jsonb(v_reasons),
      'status',v_q.status,'route',v_q.approval_route,'reason',v_q.approval_reason
    ),
    'readiness',jsonb_build_object(
      'readyToSend',v_ready,'missing',to_jsonb(v_missing),'timelineIssues',to_jsonb(v_timeline_missing),
      'opportunityLinked',v_q.opportunity_id IS NOT NULL,'emailAvailable',v_email_ok,
      'hasProductOrService',v_has_scope,'pricingValid',coalesce(v_q.total,0)>0,
      'timelineConfirmed',v_timeline_ok,'paymentScheduleValid',v_payment_ok,
      'approvalCompleted',v_q.status='Approved','expirationValid',v_expiry_ok,
      'currentRevision',v_q.superseded_by_id IS NULL
    ),
    'views',jsonb_build_object(
      'firstViewedAt',v_q.first_viewed_at,'lastViewedAt',v_q.last_viewed_at,'viewCount',v_q.view_count
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.quotation_presentation_payload(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quotation_presentation_payload(uuid) TO postgres;
REVOKE ALL ON FUNCTION public.get_quotation_cpq_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quotation_cpq_summary(uuid) TO postgres, authenticated, service_role;

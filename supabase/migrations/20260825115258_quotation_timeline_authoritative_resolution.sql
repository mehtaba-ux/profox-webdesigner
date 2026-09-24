CREATE OR REPLACE FUNCTION public.refresh_quotation_delivery_timeline(p_quotation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_q public.quotations%rowtype;
  v_item_count integer:=0;
  v_timed_count integer:=0;
  v_base_min integer:=0;
  v_base_max integer:=0;
  v_add_min integer:=0;
  v_add_max integer:=0;
  v_parallel_min integer:=0;
  v_parallel_max integer:=0;
  v_min integer;
  v_max integer;
  v_missing text[]:='{}'::text[];
  v_assessment text[]:='{}'::text[];
  v_text text;
  v_source text:='catalog';
  v_requires_assessment boolean:=false;
BEGIN
  SELECT * INTO v_q FROM public.quotations WHERE id=p_quotation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found.'; END IF;

  SELECT count(*)::int
  INTO v_item_count
  FROM public.quotation_items
  WHERE quotation_id=p_quotation_id AND line_type IN ('product','custom') AND optional_for_client=false;

  v_missing:=public.quotation_timeline_missing_items(p_quotation_id);

  IF v_q.duration_override_min IS NOT NULL AND v_q.duration_override_max IS NOT NULL THEN
    v_min:=v_q.duration_override_min;
    v_max:=v_q.duration_override_max;
    v_source:='manual_override';
    v_requires_assessment:=false;
    v_text:=public.format_quotation_delivery_duration(v_min,v_max);
    IF nullif(btrim(coalesce(v_q.duration_override_note,'')),'') IS NOT NULL THEN
      v_text:=v_text||' '||btrim(v_q.duration_override_note);
    END IF;
  ELSIF cardinality(v_missing)>0 OR v_item_count=0 THEN
    v_min:=null; v_max:=null; v_source:='unresolved'; v_requires_assessment:=true;
    v_text:='Timeline confirmation required before customer delivery.';
  ELSE
    SELECT coalesce(array_agg(qi.product_name_snapshot ORDER BY qi.sort_order,qi.created_at)
             FILTER (WHERE qi.timeline_impact_snapshot='assessment_required'),'{}'::text[])
    INTO v_assessment
    FROM public.quotation_items qi
    WHERE qi.quotation_id=p_quotation_id
      AND qi.line_type IN ('product','custom')
      AND qi.optional_for_client=false
      AND NOT public.quotation_line_timeline_missing(
        qi.sales_product_id,qi.item_type,qi.duration_min_snapshot,qi.duration_max_snapshot,
        qi.duration_unit_snapshot,qi.timeline_impact_snapshot,qi.configuration_snapshot
      );

    IF cardinality(v_assessment)>0 THEN
      v_min:=null; v_max:=null; v_source:='catalog'; v_requires_assessment:=true;
      v_text:='Final project timeline will be confirmed after assessment of '||array_to_string(v_assessment,', ')||'.';
    ELSE
      SELECT
        count(*) FILTER (
          WHERE duration_min_snapshot IS NOT NULL
            AND duration_max_snapshot IS NOT NULL
            AND NOT (item_type='care_plan' AND timeline_impact_snapshot='parallel')
        )::int,
        coalesce(max(duration_min_snapshot) FILTER (WHERE timeline_impact_snapshot='base'),0)::int,
        coalesce(max(duration_max_snapshot) FILTER (WHERE timeline_impact_snapshot='base'),0)::int,
        coalesce(sum(duration_min_snapshot*greatest(quantity,1)) FILTER (WHERE timeline_impact_snapshot='additive'),0)::int,
        coalesce(sum(duration_max_snapshot*greatest(quantity,1)) FILTER (WHERE timeline_impact_snapshot='additive'),0)::int,
        coalesce(max(duration_min_snapshot) FILTER (WHERE timeline_impact_snapshot='parallel' AND item_type<>'care_plan'),0)::int,
        coalesce(max(duration_max_snapshot) FILTER (WHERE timeline_impact_snapshot='parallel' AND item_type<>'care_plan'),0)::int
      INTO v_timed_count,v_base_min,v_base_max,v_add_min,v_add_max,v_parallel_min,v_parallel_max
      FROM public.quotation_items
      WHERE quotation_id=p_quotation_id AND line_type IN ('product','custom') AND optional_for_client=false;

      IF v_timed_count>0 THEN
        v_min:=greatest(v_base_min+v_add_min,v_parallel_min);
        v_max:=greatest(v_base_max+v_add_max,v_parallel_max);
        v_text:=public.format_quotation_delivery_duration(v_min,v_max);
      ELSE
        v_min:=null; v_max:=null;
        v_text:='Ongoing care plan; it does not extend a project delivery timeline.';
      END IF;
      v_requires_assessment:=false;
    END IF;
  END IF;

  UPDATE public.quotations
  SET estimated_duration_min=v_min,
      estimated_duration_max=v_max,
      duration_unit='business_days',
      duration_snapshot_text=v_text,
      duration_snapshotted_at=now(),
      duration_requires_assessment=v_requires_assessment,
      duration_source=v_source,
      updated_at=now()
  WHERE id=p_quotation_id;

  RETURN jsonb_build_object(
    'estimatedDurationMin',v_min,
    'estimatedDurationMax',v_max,
    'durationUnit','business_days',
    'durationSnapshotText',v_text,
    'requiresAssessment',v_requires_assessment,
    'source',v_source,
    'missingItems',to_jsonb(v_missing),
    'assessmentItems',to_jsonb(v_assessment)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.quotation_cpq_approval_reasons(p_quotation_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_q public.quotations%rowtype;
  v_cfg jsonb:=public.quotation_cpq_settings_safe();
  v_auto numeric:=coalesce((v_cfg->>'autoApprovalDiscountPercent')::numeric,5);
  v_tax numeric:=coalesce((v_cfg->>'taxRate')::numeric,0);
  v_reasons text[]:='{}'::text[];
  v_timeline_missing text[]:='{}'::text[];
  v_name text;
  v_standard text;
  v_effective numeric;
  v_base numeric;
BEGIN
  SELECT * INTO v_q FROM public.quotations WHERE id=p_quotation_id;
  IF NOT FOUND THEN RETURN array['Quotation not found.']; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.quotation_items
    WHERE quotation_id=p_quotation_id AND optional_for_client=false AND line_type IN ('product','custom')
  ) THEN
    v_reasons:=array_append(v_reasons,'At least one committed product or service is required.');
  END IF;

  v_timeline_missing:=public.quotation_timeline_missing_items(p_quotation_id);
  FOREACH v_name IN ARRAY v_timeline_missing LOOP
    v_reasons:=array_append(v_reasons,'Timeline missing for "'||v_name||'".');
  END LOOP;

  IF EXISTS(
    SELECT 1 FROM public.quotation_items
    WHERE quotation_id=p_quotation_id
      AND line_type IN ('product','custom')
      AND coalesce(configuration_snapshot->>'timelineSource','')='admin_override'
  ) THEN
    v_reasons:=array_append(v_reasons,'A Sales Catalog delivery timeline has an Admin quotation-specific override.');
  END IF;

  IF EXISTS(
    SELECT 1
    FROM public.quotation_items qi
    LEFT JOIN public.sales_products sp ON sp.id=qi.sales_product_id
    WHERE qi.quotation_id=p_quotation_id AND qi.line_type IN ('product','custom')
      AND (qi.sales_product_id IS NULL OR sp.id IS NULL OR coalesce(sp.active,false)=false
           OR coalesce(sp.manager_approval_required,false)=true OR sp.price_mode='custom')
  ) THEN
    v_reasons:=array_append(v_reasons,'Custom, inactive, or manager-controlled catalog scope requires review.');
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.quotation_items qi
    JOIN public.sales_products sp ON sp.id=qi.sales_product_id
    WHERE qi.quotation_id=p_quotation_id AND qi.line_type='product'
      AND ((sp.price_mode='fixed' AND qi.unit_price<>sp.base_price)
        OR (sp.price_mode='starting_at' AND qi.unit_price<sp.base_price))
  ) THEN
    v_reasons:=array_append(v_reasons,'Protected catalog pricing differs from the current approved price.');
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.quotation_items qi
    WHERE qi.quotation_id=p_quotation_id AND qi.line_type IN ('product','custom')
      AND CASE
        WHEN qi.discount_type='percent' THEN qi.discount_value
        WHEN qi.discount_type='fixed' AND qi.quantity*qi.unit_price>0
          THEN qi.discount_value/(qi.quantity*qi.unit_price)*100
        ELSE 0 END > v_auto
  ) THEN
    v_reasons:=array_append(v_reasons,'A line discount exceeds the automatic approval threshold.');
  END IF;

  SELECT coalesce(sum(line_total) FILTER (WHERE optional_for_client=false AND line_type IN ('product','custom')),0)
  INTO v_base
  FROM public.quotation_items WHERE quotation_id=p_quotation_id;

  v_effective:=CASE
    WHEN v_q.quote_discount_type='percent' THEN v_q.quote_discount_value
    WHEN v_q.quote_discount_type='fixed' AND v_base>0 THEN v_q.quote_discount_value/v_base*100
    ELSE 0 END;

  IF v_effective>v_auto THEN
    v_reasons:=array_append(v_reasons,'The quotation-level discount exceeds the automatic approval threshold.');
  END IF;
  IF abs(coalesce(v_q.tax_rate,0)-v_tax)>0.0001 THEN
    v_reasons:=array_append(v_reasons,'Tax or fee configuration differs from the current Admin policy.');
  END IF;

  BEGIN
    v_standard:=public.quotation_standard_payment_terms(p_quotation_id);
    IF nullif(btrim(coalesce(v_q.payment_terms,'')),'') IS NOT NULL
       AND (v_standard IS NULL OR lower(regexp_replace(btrim(v_q.payment_terms),'\s+','','g'))
            <>lower(regexp_replace(btrim(v_standard),'\s+','','g'))) THEN
      v_reasons:=array_append(v_reasons,'Payment terms differ from the approved catalog terms.');
    END IF;
    PERFORM public.resolve_quotation_payment_schedule(p_quotation_id);
  EXCEPTION WHEN OTHERS THEN
    v_reasons:=array_append(v_reasons,'Payment schedule requires review: '||sqlerrm);
  END;

  RETURN v_reasons;
END;
$function$;

CREATE OR REPLACE FUNCTION public.snapshot_quotation_payment_schedule_before_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_res jsonb;
  v_items jsonb:='[]'::jsonb;
  v_missing text[]:='{}'::text[];
BEGIN
  IF new.status='Sent' AND old.status IS DISTINCT FROM new.status THEN
    IF coalesce(new.total,0)<=0 THEN
      RAISE EXCEPTION 'Quotation total must be greater than zero before sending.';
    END IF;

    v_missing:=public.quotation_timeline_missing_items(new.id);
    IF cardinality(v_missing)>0 OR nullif(btrim(coalesce(new.duration_snapshot_text,'')),'') IS NULL THEN
      RAISE EXCEPTION 'Confirm the required product timeline information before sending this quotation.';
    END IF;

    IF new.payment_schedule_snapshot IS NULL THEN
      v_res:=public.resolve_quotation_payment_schedule(new.id);
      new.payment_schedule_snapshot:=v_res->'schedule';
      new.payment_schedule_source_code:=v_res->>'sourceCode';
      new.payment_schedule_snapshotted_at:=now();
      new.payment_terms:=coalesce(nullif(btrim(new.payment_terms),''),nullif(btrim(v_res->>'standardPaymentTerms'),''));
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
      'configuration',qi.configuration_snapshot,
      'clientExpectations',qi.client_expectations_snapshot,
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
    WHERE qi.quotation_id=new.id;

    new.commercial_snapshot:=jsonb_build_object(
      'quotationNumber',new.quotation_number,
      'revisionNumber',new.revision_number,
      'proposalTitle',new.proposal_title,
      'customerName',new.customer_name,
      'contactName',new.contact_name,
      'email',new.email,
      'phone',new.phone,
      'country',new.country,
      'currency',new.currency,
      'validUntil',new.valid_until,
      'paymentTerms',new.payment_terms,
      'scopeSummary',new.scope_summary,
      'exclusions',new.exclusions,
      'executiveSummary',new.executive_summary,
      'coverMessage',new.cover_message,
      'clientResponsibilities',new.client_responsibilities,
      'deliveryAssumptions',new.delivery_assumptions,
      'reviewProcess',new.review_process,
      'handoverSupport',new.handover_support,
      'termsAndConditions',new.terms_and_conditions,
      'subtotal',new.subtotal,
      'lineDiscountTotal',new.line_discount_total,
      'quoteDiscountType',new.quote_discount_type,
      'quoteDiscountValue',new.quote_discount_value,
      'quoteDiscountTotal',new.quote_discount_total,
      'optionalTotal',new.optional_total,
      'taxRate',new.tax_rate,
      'taxTotal',new.tax_total,
      'total',new.total,
      'timeline',jsonb_build_object(
        'min',new.estimated_duration_min,'max',new.estimated_duration_max,'unit',new.duration_unit,
        'text',new.duration_snapshot_text,'source',new.duration_source
      ),
      'paymentSchedule',new.payment_schedule_snapshot,
      'items',v_items
    );
    new.commercial_snapshotted_at:=now();
  END IF;
  RETURN new;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_quotation_delivery_timeline(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_quotation_delivery_timeline(uuid) TO postgres, service_role;
REVOKE ALL ON FUNCTION public.quotation_cpq_approval_reasons(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quotation_cpq_approval_reasons(uuid) TO postgres, authenticated, service_role;
REVOKE ALL ON FUNCTION public.snapshot_quotation_payment_schedule_before_send() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_quotation_payment_schedule_before_send() TO postgres, service_role;

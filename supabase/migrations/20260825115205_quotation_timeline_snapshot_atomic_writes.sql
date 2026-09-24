CREATE OR REPLACE FUNCTION public.create_quotation_atomic(p_quotation jsonb, p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_salesperson uuid;
  v_item jsonb;
  v_product_id uuid;
  v_client_expectations jsonb;
  v_timeline jsonb;
  v_is_admin boolean:=public.is_admin();
  v_cfg jsonb:=public.quotation_cpq_settings_safe();
  v_tax numeric;
BEGIN
  IF NOT public.has_active_role(array['admin','sales']) THEN RAISE EXCEPTION 'Unauthorized.'; END IF;
  v_salesperson:=nullif(p_quotation->>'salesperson_id','')::uuid;
  IF NOT v_is_admin AND v_salesperson IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sales representatives may create quotations only for themselves.';
  END IF;
  v_tax:=CASE WHEN v_is_admin AND p_quotation?'tax_rate'
    THEN coalesce((p_quotation->>'tax_rate')::numeric,0)
    ELSE coalesce((v_cfg->>'taxRate')::numeric,0) END;

  PERFORM set_config('profox.quotation_atomic_rpc','1',true);
  INSERT INTO public.quotations(
    opportunity_id,salesperson_id,customer_name,contact_name,email,phone,country,currency,status,valid_until,payment_terms,
    scope_summary,exclusions,customer_notes,internal_notes,subtotal,total,created_by,approval_required,approval_route,
    approval_reason,approval_checked_at,quotation_template_key,proposal_title,executive_summary,cover_message,
    client_responsibilities,delivery_assumptions,review_process,handover_support,terms_and_conditions,acceptance_method,
    quote_discount_type,quote_discount_value,tax_rate
  ) VALUES (
    nullif(p_quotation->>'opportunity_id','')::uuid,v_salesperson,coalesce(nullif(p_quotation->>'customer_name',''),'Customer'),
    nullif(p_quotation->>'contact_name',''),nullif(p_quotation->>'email',''),nullif(p_quotation->>'phone',''),
    nullif(p_quotation->>'country',''),coalesce(nullif(p_quotation->>'currency',''),'USD'),
    CASE WHEN v_is_admin THEN coalesce(nullif(p_quotation->>'status',''),'Draft') ELSE 'Draft' END,
    nullif(p_quotation->>'valid_until','')::date,nullif(p_quotation->>'payment_terms',''),
    nullif(p_quotation->>'scope_summary',''),nullif(p_quotation->>'exclusions',''),nullif(p_quotation->>'customer_notes',''),
    nullif(p_quotation->>'internal_notes',''),0,0,auth.uid(),null,null,null,null,
    nullif(p_quotation->>'quotation_template_key',''),nullif(p_quotation->>'proposal_title',''),
    nullif(p_quotation->>'executive_summary',''),nullif(p_quotation->>'cover_message',''),
    nullif(p_quotation->>'client_responsibilities',''),nullif(p_quotation->>'delivery_assumptions',''),
    nullif(p_quotation->>'review_process',''),nullif(p_quotation->>'handover_support',''),
    nullif(p_quotation->>'terms_and_conditions',''),coalesce(nullif(p_quotation->>'acceptance_method',''),'click_accept'),
    coalesce(nullif(p_quotation->>'quote_discount_type',''),'none'),coalesce((p_quotation->>'quote_discount_value')::numeric,0),v_tax
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) LOOP
    v_product_id:=nullif(v_item->>'sales_product_id','')::uuid;
    v_client_expectations:='{}'::jsonb;
    IF v_product_id IS NOT NULL THEN
      SELECT coalesce(sp.client_expectations,'{}'::jsonb)
      INTO v_client_expectations
      FROM public.sales_products sp
      WHERE sp.id=v_product_id AND sp.active=true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Catalog product not found or inactive.'; END IF;
    END IF;

    IF coalesce(nullif(v_item->>'line_type',''),'product') IN ('product','custom') THEN
      v_timeline:=public.quotation_resolve_line_timeline_snapshot(v_id,v_product_id,null,v_item);
    ELSE
      v_timeline:=jsonb_build_object(
        'min',null,'max',null,'unit','business_days','impact','parallel','note',null,
        'configuration',coalesce(v_item->'configuration_snapshot','{}'::jsonb)
      );
    END IF;

    INSERT INTO public.quotation_items(
      quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,quantity,unit_price,
      line_total,item_type,sort_order,client_expectations_snapshot,duration_min_snapshot,duration_max_snapshot,
      duration_unit_snapshot,timeline_impact_snapshot,duration_note_snapshot,line_type,discount_type,discount_value,
      optional_for_client,section_key,configuration_snapshot
    ) VALUES (
      v_id,v_product_id,coalesce(v_item->>'product_code_snapshot','CUSTOM'),
      coalesce(v_item->>'product_name_snapshot','Custom Item'),nullif(v_item->>'description_snapshot',''),
      coalesce((v_item->>'quantity')::int,1),coalesce((v_item->>'unit_price')::numeric,0),0,
      coalesce(v_item->>'item_type','custom'),coalesce((v_item->>'sort_order')::int,0),v_client_expectations,
      nullif(v_timeline->>'min','')::integer,nullif(v_timeline->>'max','')::integer,
      coalesce(nullif(v_timeline->>'unit',''),'business_days'),coalesce(nullif(v_timeline->>'impact',''),'assessment_required'),
      nullif(v_timeline->>'note',''),coalesce(nullif(v_item->>'line_type',''),'product'),
      coalesce(nullif(v_item->>'discount_type',''),'none'),coalesce((v_item->>'discount_value')::numeric,0),
      coalesce((v_item->>'optional_for_client')::boolean,false),nullif(v_item->>'section_key',''),
      coalesce(v_timeline->'configuration','{}'::jsonb)
    );
  END LOOP;

  PERFORM public.refresh_quotation_delivery_timeline(v_id);
  PERFORM public.assert_quotation_cpq_discount_permissions(v_id);
  PERFORM set_config('profox.quotation_atomic_rpc','',true);
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('profox.quotation_atomic_rpc','',true);
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_quotation_atomic(p_quotation_id uuid, p_updates jsonb, p_items jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_q public.quotations%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_product_id uuid;
  v_existing public.quotation_items%rowtype;
  v_client_expectations jsonb;
  v_timeline jsonb;
  v_seen_ids uuid[]:='{}'::uuid[];
  v_requested_status text;
  v_requires_approval boolean;
  v_standard_terms text;
  v_is_admin boolean:=public.is_admin();
  v_items_locked boolean;
  v_cfg jsonb:=public.quotation_cpq_settings_safe();
  v_reasons text[];
BEGIN
  SELECT * INTO v_q FROM public.quotations WHERE id=p_quotation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found.'; END IF;
  IF NOT v_is_admin AND (NOT public.has_active_role(array['admin','sales']) OR v_q.salesperson_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  v_requested_status:=coalesce(nullif(p_updates->>'status',''),v_q.status);
  v_items_locked:=v_q.sent_at IS NOT NULL OR v_q.first_viewed_at IS NOT NULL OR v_q.status IN ('Accepted','Rejected','Expired');

  IF NOT v_is_admin THEN
    IF v_q.status IN ('Sent','Accepted','Rejected','Expired','Cancelled') THEN RAISE EXCEPTION 'Locked quotation may not be edited by Sales.'; END IF;
    IF v_q.status='Approved' AND v_requested_status<>'Sent' THEN RAISE EXCEPTION 'Approved quotation may only be sent by Sales.'; END IF;
    IF v_q.status<>'Approved' AND v_requested_status NOT IN ('Draft','Ready for Approval') THEN
      RAISE EXCEPTION 'Submit the quotation through the approved routing workflow.';
    END IF;
  END IF;

  PERFORM set_config('profox.quotation_atomic_rpc','1',true);

  IF NOT v_is_admin AND v_q.status='Approved' AND v_requested_status='Sent' THEN
    UPDATE public.quotations SET status='Sent',sent_at=coalesce(sent_at,now()),updated_at=now() WHERE id=p_quotation_id;
    PERFORM set_config('profox.quotation_atomic_rpc','',true);
    RETURN;
  END IF;

  UPDATE public.quotations SET
    opportunity_id=CASE WHEN p_updates?'opportunity_id' THEN nullif(p_updates->>'opportunity_id','')::uuid ELSE opportunity_id END,
    customer_name=coalesce(nullif(p_updates->>'customer_name',''),customer_name),
    contact_name=CASE WHEN p_updates?'contact_name' THEN nullif(p_updates->>'contact_name','') ELSE contact_name END,
    email=CASE WHEN p_updates?'email' THEN nullif(p_updates->>'email','') ELSE email END,
    phone=CASE WHEN p_updates?'phone' THEN nullif(p_updates->>'phone','') ELSE phone END,
    country=CASE WHEN p_updates?'country' THEN nullif(p_updates->>'country','') ELSE country END,
    currency=coalesce(nullif(p_updates->>'currency',''),currency),
    status=CASE WHEN v_is_admin THEN v_requested_status ELSE 'Draft' END,
    valid_until=CASE WHEN p_updates?'valid_until' THEN nullif(p_updates->>'valid_until','')::date ELSE valid_until END,
    payment_terms=CASE WHEN p_updates?'payment_terms' THEN nullif(p_updates->>'payment_terms','') ELSE payment_terms END,
    scope_summary=CASE WHEN p_updates?'scope_summary' THEN nullif(p_updates->>'scope_summary','') ELSE scope_summary END,
    exclusions=CASE WHEN p_updates?'exclusions' THEN nullif(p_updates->>'exclusions','') ELSE exclusions END,
    customer_notes=CASE WHEN p_updates?'customer_notes' THEN nullif(p_updates->>'customer_notes','') ELSE customer_notes END,
    internal_notes=CASE WHEN p_updates?'internal_notes' THEN nullif(p_updates->>'internal_notes','') ELSE internal_notes END,
    quotation_template_key=CASE WHEN p_updates?'quotation_template_key' THEN nullif(p_updates->>'quotation_template_key','') ELSE quotation_template_key END,
    proposal_title=CASE WHEN p_updates?'proposal_title' THEN nullif(p_updates->>'proposal_title','') ELSE proposal_title END,
    executive_summary=CASE WHEN p_updates?'executive_summary' THEN nullif(p_updates->>'executive_summary','') ELSE executive_summary END,
    cover_message=CASE WHEN p_updates?'cover_message' THEN nullif(p_updates->>'cover_message','') ELSE cover_message END,
    client_responsibilities=CASE WHEN p_updates?'client_responsibilities' THEN nullif(p_updates->>'client_responsibilities','') ELSE client_responsibilities END,
    delivery_assumptions=CASE WHEN p_updates?'delivery_assumptions' THEN nullif(p_updates->>'delivery_assumptions','') ELSE delivery_assumptions END,
    review_process=CASE WHEN p_updates?'review_process' THEN nullif(p_updates->>'review_process','') ELSE review_process END,
    handover_support=CASE WHEN p_updates?'handover_support' THEN nullif(p_updates->>'handover_support','') ELSE handover_support END,
    terms_and_conditions=CASE WHEN p_updates?'terms_and_conditions' THEN nullif(p_updates->>'terms_and_conditions','') ELSE terms_and_conditions END,
    acceptance_method=CASE WHEN p_updates?'acceptance_method' THEN coalesce(nullif(p_updates->>'acceptance_method',''),'click_accept') ELSE acceptance_method END,
    quote_discount_type=CASE WHEN p_updates?'quote_discount_type' THEN coalesce(nullif(p_updates->>'quote_discount_type',''),'none') ELSE quote_discount_type END,
    quote_discount_value=CASE WHEN p_updates?'quote_discount_value' THEN coalesce((p_updates->>'quote_discount_value')::numeric,0) ELSE quote_discount_value END,
    tax_rate=CASE WHEN p_updates?'tax_rate' AND v_is_admin THEN coalesce((p_updates->>'tax_rate')::numeric,0)
                  WHEN NOT v_is_admin THEN coalesce((v_cfg->>'taxRate')::numeric,0) ELSE tax_rate END,
    updated_at=now()
  WHERE id=p_quotation_id;

  IF p_items IS NOT NULL AND NOT v_items_locked THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) LOOP
      v_item_id:=nullif(v_item->>'id','')::uuid;
      v_product_id:=nullif(v_item->>'sales_product_id','')::uuid;
      v_client_expectations:='{}'::jsonb;

      IF v_item_id IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.quotation_items
        WHERE id=v_item_id AND quotation_id=p_quotation_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Quotation line no longer exists. Refresh the quotation before saving.'; END IF;
        IF v_existing.sales_product_id IS DISTINCT FROM v_product_id THEN
          RAISE EXCEPTION 'Existing quotation line cannot change its Sales Catalog identity. Remove it and add the intended catalog item.';
        END IF;
      END IF;

      IF v_product_id IS NOT NULL THEN
        IF v_item_id IS NOT NULL THEN
          SELECT coalesce(qi.client_expectations_snapshot,'{}'::jsonb)
          INTO v_client_expectations
          FROM public.quotation_items qi
          WHERE qi.id=v_item_id;
        ELSE
          SELECT coalesce(sp.client_expectations,'{}'::jsonb)
          INTO v_client_expectations
          FROM public.sales_products sp
          WHERE sp.id=v_product_id AND sp.active=true;
          IF NOT FOUND THEN RAISE EXCEPTION 'Catalog product not found or inactive.'; END IF;
        END IF;
      END IF;

      IF coalesce(nullif(v_item->>'line_type',''),'product') IN ('product','custom') THEN
        v_timeline:=public.quotation_resolve_line_timeline_snapshot(p_quotation_id,v_product_id,v_item_id,v_item);
      ELSE
        v_timeline:=jsonb_build_object(
          'min',null,'max',null,'unit','business_days','impact','parallel','note',null,
          'configuration',coalesce(v_item->'configuration_snapshot','{}'::jsonb)
        );
      END IF;

      IF v_item_id IS NULL THEN
        INSERT INTO public.quotation_items(
          quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,quantity,unit_price,
          line_total,item_type,sort_order,client_expectations_snapshot,duration_min_snapshot,duration_max_snapshot,
          duration_unit_snapshot,timeline_impact_snapshot,duration_note_snapshot,line_type,discount_type,discount_value,
          optional_for_client,section_key,configuration_snapshot
        ) VALUES (
          p_quotation_id,v_product_id,coalesce(v_item->>'product_code_snapshot','CUSTOM'),
          coalesce(v_item->>'product_name_snapshot','Custom Item'),nullif(v_item->>'description_snapshot',''),
          coalesce((v_item->>'quantity')::int,1),coalesce((v_item->>'unit_price')::numeric,0),0,
          coalesce(v_item->>'item_type','custom'),coalesce((v_item->>'sort_order')::int,0),v_client_expectations,
          nullif(v_timeline->>'min','')::integer,nullif(v_timeline->>'max','')::integer,
          coalesce(nullif(v_timeline->>'unit',''),'business_days'),coalesce(nullif(v_timeline->>'impact',''),'assessment_required'),
          nullif(v_timeline->>'note',''),coalesce(nullif(v_item->>'line_type',''),'product'),
          coalesce(nullif(v_item->>'discount_type',''),'none'),coalesce((v_item->>'discount_value')::numeric,0),
          coalesce((v_item->>'optional_for_client')::boolean,false),nullif(v_item->>'section_key',''),
          coalesce(v_timeline->'configuration','{}'::jsonb)
        ) RETURNING id INTO v_item_id;
      ELSE
        UPDATE public.quotation_items SET
          product_code_snapshot=coalesce(v_item->>'product_code_snapshot',product_code_snapshot),
          product_name_snapshot=coalesce(v_item->>'product_name_snapshot',product_name_snapshot),
          description_snapshot=nullif(v_item->>'description_snapshot',''),
          quantity=coalesce((v_item->>'quantity')::int,1),
          unit_price=coalesce((v_item->>'unit_price')::numeric,0),
          item_type=coalesce(v_item->>'item_type',item_type),
          sort_order=coalesce((v_item->>'sort_order')::int,0),
          client_expectations_snapshot=v_client_expectations,
          duration_min_snapshot=nullif(v_timeline->>'min','')::integer,
          duration_max_snapshot=nullif(v_timeline->>'max','')::integer,
          duration_unit_snapshot=coalesce(nullif(v_timeline->>'unit',''),'business_days'),
          timeline_impact_snapshot=coalesce(nullif(v_timeline->>'impact',''),'assessment_required'),
          duration_note_snapshot=nullif(v_timeline->>'note',''),
          line_type=coalesce(nullif(v_item->>'line_type',''),'product'),
          discount_type=coalesce(nullif(v_item->>'discount_type',''),'none'),
          discount_value=coalesce((v_item->>'discount_value')::numeric,0),
          optional_for_client=coalesce((v_item->>'optional_for_client')::boolean,false),
          section_key=nullif(v_item->>'section_key',''),
          configuration_snapshot=coalesce(v_timeline->'configuration','{}'::jsonb),
          updated_at=now()
        WHERE id=v_item_id AND quotation_id=p_quotation_id;
      END IF;
      v_seen_ids:=array_append(v_seen_ids,v_item_id);
    END LOOP;

    IF cardinality(v_seen_ids)=0 THEN
      DELETE FROM public.quotation_items WHERE quotation_id=p_quotation_id;
    ELSE
      DELETE FROM public.quotation_items WHERE quotation_id=p_quotation_id AND NOT (id=ANY(v_seen_ids));
    END IF;

    UPDATE public.quotations
    SET duration_override_min=null,duration_override_max=null,duration_override_note=null,duration_override_by=null,duration_override_at=null
    WHERE id=p_quotation_id;
    PERFORM public.refresh_quotation_delivery_timeline(p_quotation_id);
  END IF;

  PERFORM public.assert_quotation_cpq_discount_permissions(p_quotation_id);

  IF NOT v_is_admin AND v_requested_status='Ready for Approval' THEN
    v_standard_terms:=public.quotation_standard_payment_terms(p_quotation_id);
    UPDATE public.quotations
    SET payment_terms=coalesce(nullif(btrim(payment_terms),''),v_standard_terms),updated_at=now()
    WHERE id=p_quotation_id;

    v_reasons:=public.quotation_cpq_approval_reasons(p_quotation_id);
    v_requires_approval:=cardinality(v_reasons)>0;

    IF v_requires_approval THEN
      UPDATE public.quotations
      SET status='Ready for Approval',approval_required=true,approval_route='manager_review',
          approval_reason=array_to_string(v_reasons,' '),approval_checked_at=now(),approved_by=null,approved_at=null,updated_at=now()
      WHERE id=p_quotation_id;
    ELSE
      UPDATE public.quotations
      SET status='Approved',approval_required=false,approval_route='catalog_auto',
          approval_reason='All products, commercial terms, discounts, taxes, payment plan and delivery timeline match Admin-approved configuration.',
          approval_checked_at=now(),approved_by=null,approved_at=now(),updated_at=now()
      WHERE id=p_quotation_id;
    END IF;
  ELSIF NOT v_is_admin THEN
    UPDATE public.quotations
    SET approval_required=null,approval_route=null,approval_reason=null,approval_checked_at=null,approved_by=null,approved_at=null,updated_at=now()
    WHERE id=p_quotation_id;
  END IF;

  PERFORM set_config('profox.quotation_atomic_rpc','',true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('profox.quotation_atomic_rpc','',true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_quotation_atomic(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_quotation_atomic(jsonb,jsonb) TO postgres, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_quotation_atomic(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_quotation_atomic(uuid,jsonb,jsonb) TO postgres, authenticated, service_role;

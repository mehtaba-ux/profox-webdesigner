CREATE OR REPLACE FUNCTION public.format_quotation_line_timeline(
  p_item_type text,
  p_duration_min integer,
  p_duration_max integer,
  p_duration_unit text,
  p_timeline_impact text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_range text;
  v_unit text;
BEGIN
  IF coalesce(p_item_type,'')='care_plan'
     AND coalesce(p_timeline_impact,'')='parallel'
     AND p_duration_min IS NULL AND p_duration_max IS NULL THEN
    RETURN 'Ongoing · no delivery extension';
  END IF;
  IF coalesce(p_timeline_impact,'assessment_required')='assessment_required' THEN
    RETURN 'Timeline requires assessment';
  END IF;
  IF p_duration_min IS NULL OR p_duration_max IS NULL THEN
    RETURN 'Timeline required';
  END IF;
  v_unit := CASE coalesce(p_duration_unit,'business_days')
    WHEN 'business_days' THEN CASE WHEN p_duration_min=1 AND p_duration_max=1 THEN 'business day' ELSE 'business days' END
    ELSE replace(coalesce(p_duration_unit,'business_days'),'_',' ')
  END;
  v_range := CASE WHEN p_duration_min=p_duration_max
    THEN p_duration_min::text||' '||v_unit
    ELSE p_duration_min::text||'–'||p_duration_max::text||' '||v_unit END;
  RETURN CASE coalesce(p_timeline_impact,'base')
    WHEN 'additive' THEN 'Adds approximately '||v_range
    WHEN 'parallel' THEN 'Runs in parallel · '||v_range
    ELSE v_range
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.quotation_line_timeline_missing(
  p_sales_product_id uuid,
  p_item_type text,
  p_duration_min integer,
  p_duration_max integer,
  p_duration_unit text,
  p_timeline_impact text,
  p_configuration jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN coalesce(p_configuration->>'timelineStatus','') = 'missing' THEN true
    WHEN coalesce(p_configuration->>'timelineStatus','') = 'configured' THEN false
    WHEN p_sales_product_id IS NULL AND coalesce(p_timeline_impact,'assessment_required')='assessment_required' THEN true
    WHEN coalesce(p_timeline_impact,'assessment_required')='assessment_required' THEN false
    WHEN coalesce(p_item_type,'')='care_plan'
      AND coalesce(p_timeline_impact,'')='parallel'
      AND p_duration_min IS NULL AND p_duration_max IS NULL THEN false
    WHEN p_duration_min IS NOT NULL AND p_duration_max IS NOT NULL
      AND p_duration_min >= 0 AND p_duration_max >= p_duration_min
      AND coalesce(p_duration_unit,'business_days')='business_days' THEN false
    ELSE true
  END;
$function$;

CREATE OR REPLACE FUNCTION public.quotation_resolve_line_timeline_snapshot(
  p_quotation_id uuid,
  p_sales_product_id uuid,
  p_existing_item_id uuid,
  p_item jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_product public.sales_products%rowtype;
  v_existing public.quotation_items%rowtype;
  v_has_existing boolean:=false;
  v_cfg jsonb:=coalesce(p_item->'configuration_snapshot','{}'::jsonb);
  v_requested_source text:=lower(coalesce(v_cfg->>'timelineSource',''));
  v_source text;
  v_status text;
  v_catalog_status text;
  v_catalog_min integer;
  v_catalog_max integer;
  v_catalog_unit text:='business_days';
  v_catalog_impact text:='assessment_required';
  v_catalog_note text;
  v_catalog jsonb;
  v_min integer;
  v_max integer;
  v_unit text:='business_days';
  v_impact text:='assessment_required';
  v_note text;
  v_req_min integer:=nullif(p_item->>'duration_min_snapshot','')::integer;
  v_req_max integer:=nullif(p_item->>'duration_max_snapshot','')::integer;
  v_req_unit text:=coalesce(nullif(p_item->>'duration_unit_snapshot',''),'business_days');
  v_req_impact text:=coalesce(nullif(p_item->>'timeline_impact_snapshot',''),'assessment_required');
  v_req_note text:=nullif(btrim(coalesce(p_item->>'duration_note_snapshot','')),'');
  v_is_admin boolean:=public.is_admin();
BEGIN
  IF p_existing_item_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.quotation_items
    WHERE id=p_existing_item_id AND quotation_id=p_quotation_id;
    IF FOUND THEN v_has_existing:=true; END IF;
  END IF;

  IF p_sales_product_id IS NULL THEN
    v_source:=CASE WHEN v_requested_source='admin_override' AND v_is_admin THEN 'admin_override' ELSE 'seller_estimate' END;
    v_min:=v_req_min; v_max:=v_req_max; v_unit:=v_req_unit; v_impact:=v_req_impact; v_note:=v_req_note;
    IF v_unit<>'business_days' THEN RAISE EXCEPTION 'Unsupported quotation timeline unit.'; END IF;
    IF v_impact NOT IN ('base','additive','parallel','assessment_required') THEN RAISE EXCEPTION 'Unsupported quotation timeline impact.'; END IF;
    IF v_impact='assessment_required' THEN
      IF coalesce(v_cfg->>'timelineStatus','')='configured' THEN
        v_min:=null; v_max:=null; v_status:='configured';
      ELSE
        v_min:=null; v_max:=null; v_status:='missing';
      END IF;
    ELSIF v_min IS NOT NULL AND v_max IS NOT NULL AND v_min>0 AND v_max>=v_min THEN
      v_status:='configured';
    ELSE
      v_min:=null; v_max:=null; v_status:='missing';
    END IF;
    v_cfg := (v_cfg - 'catalogTimeline')
      || jsonb_build_object('timelineSource',v_source,'timelineStatus',v_status);
    RETURN jsonb_build_object(
      'min',v_min,'max',v_max,'unit',v_unit,'impact',v_impact,'note',v_note,
      'source',v_source,'status',v_status,'configuration',v_cfg
    );
  END IF;

  SELECT * INTO v_product FROM public.sales_products WHERE id=p_sales_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catalog product not found.'; END IF;

  IF v_has_existing AND v_existing.sales_product_id IS DISTINCT FROM p_sales_product_id THEN
    RAISE EXCEPTION 'Existing quotation line cannot change its Sales Catalog identity.';
  END IF;

  IF v_has_existing AND v_existing.sales_product_id=p_sales_product_id THEN
    IF jsonb_typeof(v_existing.configuration_snapshot->'catalogTimeline')='object' THEN
      v_catalog_min:=nullif(v_existing.configuration_snapshot->'catalogTimeline'->>'min','')::integer;
      v_catalog_max:=nullif(v_existing.configuration_snapshot->'catalogTimeline'->>'max','')::integer;
      v_catalog_unit:=coalesce(nullif(v_existing.configuration_snapshot->'catalogTimeline'->>'unit',''),v_existing.duration_unit_snapshot,'business_days');
      v_catalog_impact:=coalesce(nullif(v_existing.configuration_snapshot->'catalogTimeline'->>'impact',''),v_existing.timeline_impact_snapshot,'assessment_required');
      v_catalog_note:=nullif(v_existing.configuration_snapshot->'catalogTimeline'->>'note','');
    ELSE
      v_catalog_min:=v_existing.duration_min_snapshot;
      v_catalog_max:=v_existing.duration_max_snapshot;
      v_catalog_unit:=coalesce(v_existing.duration_unit_snapshot,'business_days');
      v_catalog_impact:=coalesce(v_existing.timeline_impact_snapshot,'assessment_required');
      v_catalog_note:=v_existing.duration_note_snapshot;
    END IF;
  ELSE
    v_catalog_min:=v_product.delivery_duration_min;
    v_catalog_max:=v_product.delivery_duration_max;
    v_catalog_unit:=coalesce(v_product.delivery_duration_unit,'business_days');
    v_catalog_impact:=coalesce(v_product.timeline_impact,'assessment_required');
    v_catalog_note:=v_product.delivery_duration_note;
  END IF;

  v_catalog_status:=CASE
    WHEN v_catalog_impact='assessment_required' THEN 'configured'
    WHEN v_product.product_type='care_plan' AND v_catalog_impact='parallel' AND v_catalog_min IS NULL AND v_catalog_max IS NULL THEN 'configured'
    WHEN v_catalog_min IS NOT NULL AND v_catalog_max IS NOT NULL AND v_catalog_min>=0 AND v_catalog_max>=v_catalog_min THEN 'configured'
    ELSE 'missing'
  END;

  v_catalog:=jsonb_build_object(
    'min',v_catalog_min,'max',v_catalog_max,'unit',v_catalog_unit,
    'impact',v_catalog_impact,'note',v_catalog_note,'status',v_catalog_status
  );

  IF v_requested_source='admin_override' THEN
    IF NOT v_is_admin THEN RAISE EXCEPTION 'Admin access is required to override an approved Catalog timeline.'; END IF;
    v_source:='admin_override'; v_min:=v_req_min; v_max:=v_req_max; v_unit:=v_req_unit; v_impact:=v_req_impact; v_note:=v_req_note;
    IF v_unit<>'business_days' THEN RAISE EXCEPTION 'Unsupported quotation timeline unit.'; END IF;
    IF v_impact NOT IN ('base','additive','parallel','assessment_required') THEN RAISE EXCEPTION 'Unsupported quotation timeline impact.'; END IF;
    IF v_impact='assessment_required' THEN
      v_min:=null; v_max:=null; v_status:='configured';
    ELSIF v_min IS NOT NULL AND v_max IS NOT NULL AND v_min>0 AND v_max>=v_min THEN
      v_status:='configured';
    ELSE
      RAISE EXCEPTION 'Provide a valid minimum and maximum timeline for the Admin override.';
    END IF;
  ELSIF v_requested_source='seller_estimate' THEN
    IF v_catalog_status<>'missing' AND v_catalog_impact<>'assessment_required'
       AND NOT (v_has_existing AND coalesce(v_existing.configuration_snapshot->>'timelineSource','')='seller_estimate') THEN
      RAISE EXCEPTION 'Sales Catalog already has an approved timeline. A salesperson cannot silently override it.';
    END IF;
    v_source:='seller_estimate'; v_min:=v_req_min; v_max:=v_req_max; v_unit:=v_req_unit; v_impact:=v_req_impact; v_note:=v_req_note;
    IF v_unit<>'business_days' THEN RAISE EXCEPTION 'Unsupported quotation timeline unit.'; END IF;
    IF v_impact NOT IN ('base','additive','parallel','assessment_required') THEN RAISE EXCEPTION 'Unsupported quotation timeline impact.'; END IF;
    IF v_impact='assessment_required' THEN
      v_min:=null; v_max:=null;
      v_status:=CASE WHEN coalesce(v_cfg->>'timelineStatus','')='configured' THEN 'configured' ELSE 'missing' END;
    ELSIF v_min IS NOT NULL AND v_max IS NOT NULL AND v_min>0 AND v_max>=v_min THEN
      v_status:='configured';
    ELSE
      v_min:=null; v_max:=null; v_status:='missing';
    END IF;
  ELSE
    v_source:='catalog'; v_status:=v_catalog_status;
    v_min:=v_catalog_min; v_max:=v_catalog_max; v_unit:=v_catalog_unit; v_impact:=v_catalog_impact; v_note:=v_catalog_note;
  END IF;

  v_cfg:=v_cfg || jsonb_build_object(
    'timelineSource',v_source,
    'timelineStatus',v_status,
    'catalogTimeline',v_catalog
  );

  RETURN jsonb_build_object(
    'min',v_min,'max',v_max,'unit',v_unit,'impact',v_impact,'note',v_note,
    'source',v_source,'status',v_status,'configuration',v_cfg
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.quotation_timeline_missing_items(p_quotation_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(array_agg(qi.product_name_snapshot ORDER BY qi.sort_order,qi.created_at),'{}'::text[])
  FROM public.quotation_items qi
  WHERE qi.quotation_id=p_quotation_id
    AND qi.line_type IN ('product','custom')
    AND qi.optional_for_client=false
    AND public.quotation_line_timeline_missing(
      qi.sales_product_id,qi.item_type,qi.duration_min_snapshot,qi.duration_max_snapshot,
      qi.duration_unit_snapshot,qi.timeline_impact_snapshot,qi.configuration_snapshot
    );
$function$;

CREATE OR REPLACE FUNCTION public.add_quotation_catalog_item(
  p_quotation_id uuid,
  p_sales_product_id uuid,
  p_optional boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_q public.quotations%rowtype;
  v_product public.sales_products%rowtype;
  v_item_id uuid;
  v_sort integer;
  v_timeline jsonb;
BEGIN
  SELECT * INTO v_q FROM public.quotations WHERE id=p_quotation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found.'; END IF;
  IF NOT public.is_admin()
     AND (NOT public.has_active_role(array['sales']) OR v_q.salesperson_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;
  IF v_q.status<>'Draft' OR v_q.sent_at IS NOT NULL OR v_q.first_viewed_at IS NOT NULL OR v_q.superseded_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'Catalog items can only be added to the current Draft quotation.';
  END IF;

  SELECT * INTO v_product FROM public.sales_products WHERE id=p_sales_product_id AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales product is missing or inactive.'; END IF;

  IF EXISTS(
    SELECT 1 FROM public.quotation_items
    WHERE quotation_id=p_quotation_id AND sales_product_id=p_sales_product_id
      AND optional_for_client=coalesce(p_optional,false)
  ) THEN
    RAISE EXCEPTION 'This catalog item is already included in the quotation in the same mode.';
  END IF;

  SELECT coalesce(max(sort_order),-10)+10 INTO v_sort
  FROM public.quotation_items WHERE quotation_id=p_quotation_id;

  v_timeline:=public.quotation_resolve_line_timeline_snapshot(
    p_quotation_id,p_sales_product_id,null,
    jsonb_build_object('line_type','product','configuration_snapshot','{}'::jsonb)
  );

  PERFORM set_config('profox.quotation_atomic_rpc','1',true);
  INSERT INTO public.quotation_items(
    quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,
    quantity,unit_price,line_total,item_type,sort_order,client_expectations_snapshot,
    duration_min_snapshot,duration_max_snapshot,duration_unit_snapshot,timeline_impact_snapshot,duration_note_snapshot,
    line_type,discount_type,discount_value,optional_for_client,configuration_snapshot
  ) VALUES (
    p_quotation_id,v_product.id,v_product.code,v_product.name,coalesce(v_product.short_description,v_product.full_description),
    1,v_product.base_price,0,v_product.product_type,v_sort,coalesce(v_product.client_expectations,'{}'::jsonb),
    nullif(v_timeline->>'min','')::integer,nullif(v_timeline->>'max','')::integer,
    coalesce(nullif(v_timeline->>'unit',''),'business_days'),coalesce(nullif(v_timeline->>'impact',''),'assessment_required'),
    nullif(v_timeline->>'note',''),'product','none',0,coalesce(p_optional,false),
    coalesce(v_timeline->'configuration','{}'::jsonb)
  ) RETURNING id INTO v_item_id;

  PERFORM public.refresh_quotation_delivery_timeline(p_quotation_id);
  UPDATE public.quotations
  SET approval_required=null,approval_route=null,approval_reason=null,approval_checked_at=null,
      approved_by=null,approved_at=null,updated_at=now()
  WHERE id=p_quotation_id;
  PERFORM set_config('profox.quotation_atomic_rpc','',true);
  RETURN v_item_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('profox.quotation_atomic_rpc','',true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.quotation_line_timeline_missing(uuid,text,integer,integer,text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.quotation_resolve_line_timeline_snapshot(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.quotation_timeline_missing_items(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quotation_line_timeline_missing(uuid,text,integer,integer,text,text,jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.quotation_resolve_line_timeline_snapshot(uuid,uuid,uuid,jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.quotation_timeline_missing_items(uuid) TO postgres;

REVOKE ALL ON FUNCTION public.format_quotation_line_timeline(text,integer,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.format_quotation_line_timeline(text,integer,integer,text,text) TO postgres, authenticated, service_role;
REVOKE ALL ON FUNCTION public.add_quotation_catalog_item(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_quotation_catalog_item(uuid,uuid,boolean) TO postgres, authenticated, service_role;

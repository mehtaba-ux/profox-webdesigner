create or replace function public.client_onboarding_resolve_fields(p_quotation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_quote public.quotations%rowtype;
  v_cfg jsonb:=public.client_onboarding_config();
  v_base jsonb;
  v_result jsonb:='[]'::jsonb;
  v_seen text[]:=array[]::text[];
  v_field jsonb;
  v_key text;
  v_line record;
  v_snapshot_item jsonb;
  v_fields jsonb;
  v_requirements jsonb;
begin
  select * into v_quote from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found for onboarding.'; end if;
  v_base:=coalesce(v_cfg->'baseFields',v_cfg->'fields','[]'::jsonb);
  if jsonb_typeof(v_base)<>'array' then v_base:='[]'::jsonb; end if;
  for v_field in select value from jsonb_array_elements(v_base) loop
    v_key:=btrim(coalesce(v_field->>'key',''));
    if v_key<>'' and not (v_key=any(v_seen)) then v_result:=v_result||jsonb_build_array(v_field); v_seen:=array_append(v_seen,v_key); end if;
  end loop;
  for v_line in
    select qi.id,qi.sales_product_id,qi.product_code_snapshot,qi.product_name_snapshot,qi.item_type,qi.sort_order,qi.created_at
    from public.quotation_items qi
    where qi.quotation_id=p_quotation_id and coalesce(qi.optional_for_client,false)=false
    order by qi.sort_order,qi.created_at
  loop
    v_snapshot_item:=null;
    if jsonb_typeof(coalesce(v_quote.commercial_snapshot->'items','[]'::jsonb))='array' then
      select value into v_snapshot_item from jsonb_array_elements(coalesce(v_quote.commercial_snapshot->'items','[]'::jsonb)) where value->>'id'=v_line.id::text limit 1;
    end if;
    v_fields:=case when jsonb_typeof(v_snapshot_item->'onboardingFields')='array' then v_snapshot_item->'onboardingFields' else null end;
    if v_fields is null then
      v_requirements:=case when jsonb_typeof(v_snapshot_item->'onboardingRequirements')='object' then v_snapshot_item->'onboardingRequirements' else null end;
      if v_requirements is null and v_line.sales_product_id is not null then select sp.onboarding_requirements into v_requirements from public.sales_products sp where sp.id=v_line.sales_product_id; end if;
      if v_requirements is null then
        v_requirements:=public.client_onboarding_default_requirements(v_line.product_code_snapshot,v_line.product_name_snapshot,'Custom',coalesce(v_line.item_type,'custom'),'[]'::jsonb);
      end if;
      v_fields:=public.client_onboarding_fields_for_requirements(coalesce(v_requirements,'{}'::jsonb));
    end if;
    if jsonb_typeof(coalesce(v_fields,'[]'::jsonb))='array' then
      for v_field in select value from jsonb_array_elements(coalesce(v_fields,'[]'::jsonb)) loop
        v_key:=btrim(coalesce(v_field->>'key',''));
        if v_key<>'' and not (v_key=any(v_seen)) then v_result:=v_result||jsonb_build_array(v_field); v_seen:=array_append(v_seen,v_key); end if;
      end loop;
    end if;
  end loop;
  if jsonb_array_length(v_result)=0 then raise exception 'Client onboarding form resolved to no fields.'; end if;
  return v_result;
end;$function$;

create or replace function public.snapshot_quotation_payment_schedule_before_send()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare v_res jsonb; v_items jsonb:='[]'::jsonb; v_missing text[]:='{}'::text[];
begin
  if new.status='Sent' and old.status is distinct from new.status then
    if coalesce(new.total,0)<=0 then raise exception 'Quotation total must be greater than zero before sending.'; end if;
    v_missing:=public.quotation_timeline_missing_items(new.id);
    if cardinality(v_missing)>0 or nullif(btrim(coalesce(new.duration_snapshot_text,'')),'') is null then raise exception 'Confirm the required product timeline information before sending this quotation.'; end if;
    if new.payment_schedule_snapshot is null then
      v_res:=public.resolve_quotation_payment_schedule(new.id);
      new.payment_schedule_snapshot:=v_res->'schedule'; new.payment_schedule_source_code:=v_res->>'sourceCode'; new.payment_schedule_snapshotted_at:=now(); new.payment_terms:=coalesce(nullif(btrim(new.payment_terms),''),nullif(btrim(v_res->>'standardPaymentTerms'),''));
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',qi.id,'salesProductId',qi.sales_product_id,'productCode',qi.product_code_snapshot,'productName',qi.product_name_snapshot,'description',qi.description_snapshot,'quantity',qi.quantity,'unitPrice',qi.unit_price,'grossTotal',round((qi.quantity*qi.unit_price)::numeric,2),'discountType',qi.discount_type,'discountValue',qi.discount_value,'discountAmount',qi.discount_amount,'lineTotal',qi.line_total,'itemType',qi.item_type,'lineType',qi.line_type,'optionalForClient',qi.optional_for_client,'sectionKey',qi.section_key,'configuration',qi.configuration_snapshot,'clientExpectations',qi.client_expectations_snapshot,'scope',coalesce(sp.scope,'[]'::jsonb),
      'onboardingRequirements',coalesce(sp.onboarding_requirements,public.client_onboarding_default_requirements(qi.product_code_snapshot,qi.product_name_snapshot,coalesce(sp.category,'Custom'),coalesce(sp.product_type,qi.item_type,'custom'),coalesce(sp.scope,'[]'::jsonb))),
      'onboardingFields',public.client_onboarding_fields_for_requirements(coalesce(sp.onboarding_requirements,public.client_onboarding_default_requirements(qi.product_code_snapshot,qi.product_name_snapshot,coalesce(sp.category,'Custom'),coalesce(sp.product_type,qi.item_type,'custom'),coalesce(sp.scope,'[]'::jsonb)))),
      'durationMin',qi.duration_min_snapshot,'durationMax',qi.duration_max_snapshot,'durationUnit',qi.duration_unit_snapshot,'timelineImpact',qi.timeline_impact_snapshot,'durationNote',qi.duration_note_snapshot,'timelineText',public.format_quotation_line_timeline(qi.item_type,qi.duration_min_snapshot,qi.duration_max_snapshot,qi.duration_unit_snapshot,qi.timeline_impact_snapshot)
    ) order by qi.sort_order,qi.created_at),'[]'::jsonb)
    into v_items from public.quotation_items qi left join public.sales_products sp on sp.id=qi.sales_product_id where qi.quotation_id=new.id;
    new.commercial_snapshot:=jsonb_build_object('quotationNumber',new.quotation_number,'revisionNumber',new.revision_number,'proposalTitle',new.proposal_title,'customerName',new.customer_name,'contactName',new.contact_name,'email',new.email,'phone',new.phone,'country',new.country,'currency',new.currency,'validUntil',new.valid_until,'paymentTerms',new.payment_terms,'scopeSummary',new.scope_summary,'exclusions',new.exclusions,'executiveSummary',new.executive_summary,'coverMessage',new.cover_message,'clientResponsibilities',new.client_responsibilities,'deliveryAssumptions',new.delivery_assumptions,'reviewProcess',new.review_process,'handoverSupport',new.handover_support,'termsAndConditions',new.terms_and_conditions,'subtotal',new.subtotal,'lineDiscountTotal',new.line_discount_total,'quoteDiscountType',new.quote_discount_type,'quoteDiscountValue',new.quote_discount_value,'quoteDiscountTotal',new.quote_discount_total,'optionalTotal',new.optional_total,'taxRate',new.tax_rate,'taxTotal',new.tax_total,'total',new.total,'timeline',jsonb_build_object('min',new.estimated_duration_min,'max',new.estimated_duration_max,'unit',new.duration_unit,'text',new.duration_snapshot_text,'source',new.duration_source),'paymentSchedule',new.payment_schedule_snapshot,'items',v_items);
    new.commercial_snapshotted_at:=now();
  end if;
  return new;
end;$function$;

do $backfill$
begin
  perform set_config('profox.quotation_atomic_rpc','1',true);
  update public.quotations q
  set commercial_snapshot=jsonb_set(
    q.commercial_snapshot,
    '{items}',
    coalesce((
      select jsonb_agg(
        case
          when item ? 'onboardingFields' and item ? 'onboardingRequirements' and item ? 'scope' then item
          else item || jsonb_build_object(
            'scope',coalesce(sp.scope,'[]'::jsonb),
            'onboardingRequirements',coalesce(sp.onboarding_requirements,public.client_onboarding_default_requirements(coalesce(item->>'productCode',qi.product_code_snapshot),coalesce(item->>'productName',qi.product_name_snapshot),coalesce(sp.category,'Custom'),coalesce(sp.product_type,qi.item_type,'custom'),coalesce(sp.scope,'[]'::jsonb))),
            'onboardingFields',public.client_onboarding_fields_for_requirements(coalesce(sp.onboarding_requirements,public.client_onboarding_default_requirements(coalesce(item->>'productCode',qi.product_code_snapshot),coalesce(item->>'productName',qi.product_name_snapshot),coalesce(sp.category,'Custom'),coalesce(sp.product_type,qi.item_type,'custom'),coalesce(sp.scope,'[]'::jsonb))))
          )
        end order by ord
      )
      from jsonb_array_elements(coalesce(q.commercial_snapshot->'items','[]'::jsonb)) with ordinality arr(item,ord)
      left join public.quotation_items qi on qi.id::text=item->>'id' and qi.quotation_id=q.id
      left join public.sales_products sp on sp.id=qi.sales_product_id
    ),'[]'::jsonb),true
  ),
  commercial_snapshotted_at=coalesce(q.commercial_snapshotted_at,now()),
  updated_at=q.updated_at
  where q.commercial_snapshot is not null
    and jsonb_typeof(q.commercial_snapshot->'items')='array'
    and exists(select 1 from jsonb_array_elements(q.commercial_snapshot->'items') x where not (x ? 'onboardingFields' and x ? 'onboardingRequirements' and x ? 'scope'));
  perform set_config('profox.quotation_atomic_rpc','',true);
exception when others then
  perform set_config('profox.quotation_atomic_rpc','',true);
  raise;
end;$backfill$;

update public.client_onboardings o
set field_schema=public.client_onboarding_resolve_fields(o.quotation_id),form_version=greatest(form_version,2),updated_at=now()
where o.status<>'Completed' and o.quotation_id is not null;

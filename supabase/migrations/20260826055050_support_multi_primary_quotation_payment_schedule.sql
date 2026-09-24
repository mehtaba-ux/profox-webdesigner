create or replace function public.resolve_quotation_payment_schedule(p_quotation_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_count int;
  v_product record;
  v_schedule jsonb;
  v_total numeric;
  v_first_type text;
  v_cfg jsonb:=public.quotation_cpq_settings_safe();
  v_custom_count int;
  v_primary_total numeric:=0;
  v_all_full boolean:=false;
  v_terms text;
begin
  select count(*), coalesce(sum(qi.line_total),0)
  into v_count, v_primary_total
  from public.quotation_items qi
  join public.sales_products sp on sp.id=qi.sales_product_id
  where qi.quotation_id=p_quotation_id
    and qi.optional_for_client=false
    and qi.line_type='product'
    and sp.product_type in ('package','discovery','custom');

  if v_count=1 then
    select qi.product_code_snapshot,qi.product_name_snapshot,sp.payment_schedule,sp.standard_payment_terms
    into v_product
    from public.quotation_items qi
    join public.sales_products sp on sp.id=qi.sales_product_id
    where qi.quotation_id=p_quotation_id
      and qi.optional_for_client=false
      and qi.line_type='product'
      and sp.product_type in ('package','discovery','custom')
    order by qi.sort_order,qi.created_at
    limit 1;
    v_schedule:=v_product.payment_schedule;

  elsif v_count>1 then
    if v_primary_total<=0 then
      raise exception 'Committed primary offers must have a positive total before payment can be configured.';
    end if;

    for v_product in
      select qi.product_code_snapshot,qi.product_name_snapshot,sp.payment_schedule,sp.standard_payment_terms
      from public.quotation_items qi
      join public.sales_products sp on sp.id=qi.sales_product_id
      where qi.quotation_id=p_quotation_id
        and qi.optional_for_client=false
        and qi.line_type='product'
        and sp.product_type in ('package','discovery','custom')
      order by qi.sort_order,qi.created_at
    loop
      if v_product.payment_schedule is null
         or jsonb_typeof(v_product.payment_schedule)<>'array'
         or jsonb_array_length(v_product.payment_schedule)=0 then
        raise exception 'Committed offer "%" does not have an approved payment schedule.',v_product.product_name_snapshot;
      end if;

      if exists(
        select 1
        from jsonb_array_elements(v_product.payment_schedule) x
        where nullif(btrim(coalesce(x->>'paymentType','')),'') is null
           or nullif(btrim(coalesce(x->>'milestoneNumber','')),'') is null
           or nullif(btrim(coalesce(x->>'percentage','')),'') is null
      ) then
        raise exception 'Committed offer "%" has an incomplete payment schedule.',v_product.product_name_snapshot;
      end if;

      select coalesce(sum((x->>'percentage')::numeric),0)
      into v_total
      from jsonb_array_elements(v_product.payment_schedule) x;
      if round(v_total,4)<>100 then
        raise exception 'The approved payment schedule for "%" must total 100 percent.',v_product.product_name_snapshot;
      end if;

      select x->>'paymentType'
      into v_first_type
      from jsonb_array_elements(v_product.payment_schedule) x
      order by (x->>'milestoneNumber')::int
      limit 1;
      if v_first_type not in ('Advance','Full Payment') then
        raise exception 'The first approved payment milestone for "%" must be Advance or Full Payment.',v_product.product_name_snapshot;
      end if;
    end loop;

    select bool_and(
      jsonb_array_length(sp.payment_schedule)=1
      and (sp.payment_schedule->0->>'paymentType')='Full Payment'
      and round(coalesce((sp.payment_schedule->0->>'percentage')::numeric,0),4)=100
    )
    into v_all_full
    from public.quotation_items qi
    join public.sales_products sp on sp.id=qi.sales_product_id
    where qi.quotation_id=p_quotation_id
      and qi.optional_for_client=false
      and qi.line_type='product'
      and sp.product_type in ('package','discovery','custom');

    if coalesce(v_all_full,false) then
      v_schedule:=jsonb_build_array(jsonb_build_object(
        'milestoneNumber',1,
        'paymentType','Full Payment',
        'label','Full Payment',
        'percentage',100
      ));
    else
      with contributions as (
        select
          case when x->>'paymentType'='Full Payment' then 'Advance' else x->>'paymentType' end as payment_type,
          case when x->>'paymentType'='Full Payment' then 'Initial Payment' else coalesce(nullif(btrim(x->>'label'),''),x->>'paymentType') end as source_label,
          (x->>'milestoneNumber')::int as source_order,
          (qi.line_total * (x->>'percentage')::numeric / 100.0)::numeric as contribution
        from public.quotation_items qi
        join public.sales_products sp on sp.id=qi.sales_product_id
        cross join lateral jsonb_array_elements(sp.payment_schedule) x
        where qi.quotation_id=p_quotation_id
          and qi.optional_for_client=false
          and qi.line_type='product'
          and sp.product_type in ('package','discovery','custom')
      ), grouped as (
        select
          payment_type,
          min(source_order) as source_order,
          case
            when payment_type='Advance' then 'Initial / Advance Payment'
            when count(distinct source_label)=1 then max(source_label)
            else payment_type
          end as label,
          sum(contribution) as contribution
        from contributions
        group by payment_type
      ), ranked as (
        select
          payment_type,
          label,
          source_order,
          contribution,
          row_number() over (
            order by
              case when payment_type='Advance' then 0 when payment_type='Final Payment' then 2 else 1 end,
              case when payment_type='Final Payment' then 999999 else source_order end,
              payment_type
          ) as rn,
          count(*) over () as cnt,
          round((contribution / v_primary_total) * 100.0,6) as pct
        from grouped
        where contribution>0
      ), finalized as (
        select
          rn,
          payment_type,
          label,
          case
            when rn=cnt then round(100.0-coalesce(sum(pct) over (order by rn rows between unbounded preceding and 1 preceding),0),6)
            else pct
          end as percentage
        from ranked
      )
      select jsonb_agg(jsonb_build_object(
        'milestoneNumber',rn,
        'paymentType',payment_type,
        'label',label,
        'percentage',percentage
      ) order by rn)
      into v_schedule
      from finalized;
    end if;

    select case
      when count(distinct nullif(btrim(sp.standard_payment_terms),''))=1 then max(nullif(btrim(sp.standard_payment_terms),''))
      else null
    end
    into v_terms
    from public.quotation_items qi
    join public.sales_products sp on sp.id=qi.sales_product_id
    where qi.quotation_id=p_quotation_id
      and qi.optional_for_client=false
      and qi.line_type='product'
      and sp.product_type in ('package','discovery','custom');

    v_product.product_code_snapshot:='MULTI';
    v_product.product_name_snapshot:='Combined Primary Offers';
    v_product.standard_payment_terms:=v_terms;

  else
    select count(*)
    into v_custom_count
    from public.quotation_items
    where quotation_id=p_quotation_id
      and optional_for_client=false
      and line_type='custom';

    if v_custom_count=0 then
      raise exception 'Quotation must contain one committed primary package or custom offer before payment can be configured.';
    end if;

    v_schedule:=coalesce(v_cfg->'customPaymentSchedule','[]'::jsonb);
    v_product.product_code_snapshot:='CUSTOM';
    v_product.product_name_snapshot:='Custom Proposal';
    v_product.standard_payment_terms:=nullif(btrim(coalesce(v_cfg->>'standardTerms','')),'');
  end if;

  if v_schedule is null or jsonb_typeof(v_schedule)<>'array' or jsonb_array_length(v_schedule)=0 then
    raise exception 'The selected offer does not have an approved payment schedule. Configure it before sending the quotation.';
  end if;

  select coalesce(sum((x->>'percentage')::numeric),0)
  into v_total
  from jsonb_array_elements(v_schedule) x;
  if round(v_total,4)<>100 then
    raise exception 'The approved payment schedule must total 100 percent.';
  end if;

  select x->>'paymentType'
  into v_first_type
  from jsonb_array_elements(v_schedule) x
  order by (x->>'milestoneNumber')::int
  limit 1;
  if v_first_type not in ('Advance','Full Payment') then
    raise exception 'The first approved payment milestone must be Advance or Full Payment so the verified sale can enter delivery.';
  end if;

  return jsonb_build_object(
    'sourceCode',v_product.product_code_snapshot,
    'sourceName',v_product.product_name_snapshot,
    'schedule',v_schedule,
    'standardPaymentTerms',v_product.standard_payment_terms
  );
end;
$function$;

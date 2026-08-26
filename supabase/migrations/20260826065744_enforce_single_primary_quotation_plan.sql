create or replace function public.enforce_single_primary_quotation_plan()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_product_type text;
  v_existing_count integer;
begin
  -- Internal revision/duplicate cloning must be able to preserve historical source data.
  if coalesce(current_setting('profox.revision_clone', true), '') = '1' then
    return new;
  end if;

  if new.sales_product_id is null or new.line_type <> 'product' then
    return new;
  end if;

  select sp.product_type
  into v_product_type
  from public.sales_products sp
  where sp.id = new.sales_product_id;

  -- Packages, discovery offers, and catalog custom offers are primary pricing plans.
  -- Add-ons and care plans are intentionally unrestricted.
  if v_product_type not in ('package', 'discovery', 'custom') then
    return new;
  end if;

  select count(*)
  into v_existing_count
  from public.quotation_items qi
  join public.sales_products sp on sp.id = qi.sales_product_id
  where qi.quotation_id = new.quotation_id
    and qi.line_type = 'product'
    and sp.product_type in ('package', 'discovery', 'custom')
    and qi.id is distinct from new.id;

  if v_existing_count > 0 then
    raise exception 'Only one primary pricing plan may be selected per quotation. Keep one package or discovery offer and add any additional services as add-ons.';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_single_primary_quotation_plan() from public, anon, authenticated;
grant execute on function public.enforce_single_primary_quotation_plan() to postgres, service_role;

drop trigger if exists quotation_single_primary_plan_guard on public.quotation_items;
create trigger quotation_single_primary_plan_guard
before insert or update on public.quotation_items
for each row execute function public.enforce_single_primary_quotation_plan();

comment on function public.enforce_single_primary_quotation_plan() is
'Enforces one catalog primary pricing plan per quotation. Add-ons and care plans remain unlimited. Historical revision/duplicate cloning is exempt so prior commercial evidence is preserved.';

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
begin
  select count(*) into v_count
  from public.quotation_items qi
  join public.sales_products sp on sp.id=qi.sales_product_id
  where qi.quotation_id=p_quotation_id
    and qi.optional_for_client=false
    and qi.line_type='product'
    and sp.product_type in ('package','discovery','custom');

  if v_count>1 then
    raise exception 'Only one primary pricing plan may be selected per quotation. Keep one package or discovery offer and add any additional services as add-ons.';
  end if;

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
  else
    select count(*) into v_custom_count
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
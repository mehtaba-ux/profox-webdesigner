create or replace function public.admin_upsert_sales_product(p_product jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_id uuid;
  v_code text := upper(trim(coalesce(p_product->>'code','')));
  v_name text := trim(coalesce(p_product->>'name',''));
  v_category text := trim(coalesce(p_product->>'category',''));
  v_product_type text := trim(coalesce(p_product->>'product_type',''));
  v_price_mode text := trim(coalesce(p_product->>'price_mode',''));
  v_scope jsonb := coalesce(p_product->'scope','[]'::jsonb);
  v_public_details jsonb := coalesce(p_product->'public_details','{}'::jsonb);
  v_payment_schedule jsonb := case when p_product ? 'payment_schedule' then p_product->'payment_schedule' else null end;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if v_code = '' or v_name = '' or v_category = '' then
    raise exception 'Product code, name and category are required';
  end if;
  if v_product_type not in ('package','addon','care_plan','discovery','custom') then
    raise exception 'Invalid product type';
  end if;
  if v_price_mode not in ('fixed','starting_at','custom') then
    raise exception 'Invalid price mode';
  end if;
  if jsonb_typeof(v_scope) <> 'array' then
    raise exception 'Scope must be an array';
  end if;
  if jsonb_typeof(v_public_details) <> 'object' then
    raise exception 'Public details must be an object';
  end if;
  if v_payment_schedule is not null and jsonb_typeof(v_payment_schedule) <> 'array' then
    raise exception 'Payment schedule must be an array';
  end if;
  if coalesce((p_product->>'base_price')::numeric,0) < 0 then
    raise exception 'Base price cannot be negative';
  end if;

  if nullif(p_product->>'id','') is null then
    insert into public.sales_products (
      code,name,category,product_type,price_mode,base_price,currency,billing_period,
      short_description,full_description,scope,technology,manager_approval_required,
      active,sort_order,standard_payment_terms,payment_schedule,public_visible,public_details,updated_at
    ) values (
      v_code,v_name,v_category,v_product_type,v_price_mode,
      coalesce((p_product->>'base_price')::numeric,0),coalesce(nullif(p_product->>'currency',''),'USD'),
      nullif(p_product->>'billing_period',''),nullif(p_product->>'short_description',''),
      nullif(p_product->>'full_description',''),v_scope,nullif(p_product->>'technology',''),
      coalesce((p_product->>'manager_approval_required')::boolean,false),
      coalesce((p_product->>'active')::boolean,true),coalesce((p_product->>'sort_order')::integer,0),
      nullif(p_product->>'standard_payment_terms',''),v_payment_schedule,
      coalesce((p_product->>'public_visible')::boolean,false),v_public_details,timezone('utc',now())
    ) returning id into v_id;
  else
    v_id := (p_product->>'id')::uuid;
    update public.sales_products
    set code = v_code,
        name = v_name,
        category = v_category,
        product_type = v_product_type,
        price_mode = v_price_mode,
        base_price = coalesce((p_product->>'base_price')::numeric,0),
        currency = coalesce(nullif(p_product->>'currency',''),'USD'),
        billing_period = nullif(p_product->>'billing_period',''),
        short_description = nullif(p_product->>'short_description',''),
        full_description = nullif(p_product->>'full_description',''),
        scope = v_scope,
        technology = nullif(p_product->>'technology',''),
        manager_approval_required = coalesce((p_product->>'manager_approval_required')::boolean,false),
        active = coalesce((p_product->>'active')::boolean,true),
        sort_order = coalesce((p_product->>'sort_order')::integer,0),
        standard_payment_terms = nullif(p_product->>'standard_payment_terms',''),
        payment_schedule = v_payment_schedule,
        public_visible = coalesce((p_product->>'public_visible')::boolean,false),
        public_details = v_public_details,
        updated_at = timezone('utc',now())
    where id = v_id;
    if not found then raise exception 'Sales product not found'; end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.admin_upsert_sales_product(jsonb) from public, anon;
grant execute on function public.admin_upsert_sales_product(jsonb) to authenticated, service_role;

create or replace function public.admin_delete_or_deactivate_sales_product(p_product_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_used boolean;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if not exists (select 1 from public.sales_products where id = p_product_id) then
    raise exception 'Sales product not found';
  end if;

  select exists(select 1 from public.quotation_items where sales_product_id = p_product_id)
  into v_used;

  if v_used then
    update public.sales_products
    set active = false, public_visible = false, updated_at = timezone('utc',now())
    where id = p_product_id;
    return 'deactivated';
  end if;

  delete from public.sales_products where id = p_product_id;
  return 'deleted';
end;
$$;

revoke all on function public.admin_delete_or_deactivate_sales_product(uuid) from public, anon;
grant execute on function public.admin_delete_or_deactivate_sales_product(uuid) to authenticated, service_role;

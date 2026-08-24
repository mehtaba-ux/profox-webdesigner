create or replace function public.admin_delete_or_deactivate_sales_product(p_product_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_code text;
  v_used boolean;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select code into v_code
  from public.sales_products
  where id = p_product_id;

  if v_code is null then
    raise exception 'Sales product not found';
  end if;

  select
    exists(select 1 from public.quotation_items where sales_product_id = p_product_id)
    or exists(select 1 from public.sales_career_progression_thresholds where product_code = v_code)
  into v_used;

  if v_used then
    update public.sales_products
    set active = false,
        public_visible = false,
        updated_at = timezone('utc', now())
    where id = p_product_id;
    return 'deactivated';
  end if;

  delete from public.sales_products where id = p_product_id;
  return 'deleted';
end;
$$;

revoke all on function public.admin_delete_or_deactivate_sales_product(uuid) from public, anon;
grant execute on function public.admin_delete_or_deactivate_sales_product(uuid) to authenticated, service_role;

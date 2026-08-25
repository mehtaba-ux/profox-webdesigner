-- Safe one-click insertion for relationship-based suggested add-ons.
-- The browser provides only quotation/product identifiers; catalog price and timeline snapshots are resolved server-side.
create or replace function public.add_quotation_catalog_item(
  p_quotation_id uuid,
  p_sales_product_id uuid,
  p_optional boolean default false
)
returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_q public.quotations%rowtype;
  v_product public.sales_products%rowtype;
  v_item_id uuid;
  v_sort integer;
begin
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if not public.is_admin() and (not public.has_active_role(array['sales']) or v_q.salesperson_id is distinct from auth.uid()) then
    raise exception 'Unauthorized.';
  end if;
  if v_q.status <> 'Draft' or v_q.sent_at is not null or v_q.first_viewed_at is not null or v_q.superseded_by_id is not null then
    raise exception 'Catalog items can only be added to the current Draft quotation.';
  end if;
  select * into v_product from public.sales_products where id=p_sales_product_id and active=true;
  if not found then raise exception 'Sales product is missing or inactive.'; end if;
  if exists(select 1 from public.quotation_items where quotation_id=p_quotation_id and sales_product_id=p_sales_product_id and optional_for_client=coalesce(p_optional,false)) then
    raise exception 'This catalog item is already included in the quotation in the same mode.';
  end if;
  select coalesce(max(sort_order),-10)+10 into v_sort from public.quotation_items where quotation_id=p_quotation_id;
  perform set_config('profox.quotation_atomic_rpc','1',true);
  insert into public.quotation_items(
    quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,
    quantity,unit_price,line_total,item_type,sort_order,client_expectations_snapshot,
    duration_min_snapshot,duration_max_snapshot,duration_unit_snapshot,timeline_impact_snapshot,duration_note_snapshot,
    line_type,discount_type,discount_value,optional_for_client,configuration_snapshot
  ) values (
    p_quotation_id,v_product.id,v_product.code,v_product.name,coalesce(v_product.short_description,v_product.full_description),
    1,v_product.base_price,0,v_product.product_type,v_sort,coalesce(v_product.client_expectations,'{}'::jsonb),
    v_product.delivery_duration_min,v_product.delivery_duration_max,v_product.delivery_duration_unit,v_product.timeline_impact,v_product.delivery_duration_note,
    'product','none',0,coalesce(p_optional,false),'{}'::jsonb
  ) returning id into v_item_id;
  perform public.refresh_quotation_delivery_timeline(p_quotation_id);
  update public.quotations set approval_required=null,approval_route=null,approval_reason=null,approval_checked_at=null,approved_by=null,approved_at=null,updated_at=now() where id=p_quotation_id;
  perform set_config('profox.quotation_atomic_rpc','',true);
  return v_item_id;
exception when others then
  perform set_config('profox.quotation_atomic_rpc','',true);
  raise;
end;
$$;

revoke all on function public.add_quotation_catalog_item(uuid,uuid,boolean) from public, anon;
grant execute on function public.add_quotation_catalog_item(uuid,uuid,boolean) to authenticated, service_role, postgres;

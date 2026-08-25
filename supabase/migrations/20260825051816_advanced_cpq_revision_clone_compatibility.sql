-- Allow an immutable delivered quotation to be revised even if a referenced catalog product was later archived.
-- Normal quotation creation still requires an active catalog product.
create or replace function public.validate_quotation_item_price()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_product public.sales_products%rowtype;
  v_is_admin boolean:=public.is_admin();
  v_cfg jsonb:=public.quotation_cpq_settings_safe();
  v_max_discount numeric:=coalesce((v_cfg->>'maxSalesDiscountPercent')::numeric,20);
  v_gross numeric;
  v_discount numeric:=0;
  v_clone boolean:=coalesce(current_setting('profox.revision_clone',true),'')='1';
begin
  new.line_type:=coalesce(nullif(new.line_type,''),'product');
  new.discount_type:=coalesce(nullif(new.discount_type,''),'none');
  new.discount_value:=coalesce(new.discount_value,0);
  new.optional_for_client:=coalesce(new.optional_for_client,false);
  new.configuration_snapshot:=coalesce(new.configuration_snapshot,'{}'::jsonb);

  if new.line_type in ('section','note') then
    new.sales_product_id:=null;
    new.item_type:='custom';
    new.quantity:=1;
    new.unit_price:=0;
    new.discount_type:='none';
    new.discount_value:=0;
    new.discount_amount:=0;
    new.line_total:=0;
    new.optional_for_client:=false;
    new.timeline_impact_snapshot:='parallel';
    new.duration_min_snapshot:=null;
    new.duration_max_snapshot:=null;
    return new;
  end if;

  if coalesce(new.quantity,0)<=0 then raise exception 'Quotation item quantity must be greater than zero.'; end if;
  if coalesce(new.unit_price,0)<0 then raise exception 'Quotation item price cannot be negative.'; end if;

  if new.sales_product_id is null then
    new.line_type:='custom';
    new.item_type:='custom';
    if not v_is_admin and coalesce((v_cfg->>'allowSalesCustomLines')::boolean,true) is not true then raise exception 'Custom quotation lines are disabled for Sales.'; end if;
  else
    if v_clone then
      select * into v_product from public.sales_products where id=new.sales_product_id;
    else
      select * into v_product from public.sales_products where id=new.sales_product_id and active=true;
    end if;
    if not found then raise exception 'Sales product is missing or inactive.'; end if;
    new.line_type:='product';
    if not v_clone then
      new.product_code_snapshot:=v_product.code;
      new.product_name_snapshot:=v_product.name;
      new.item_type:=v_product.product_type;
    end if;
    if not v_is_admin and not v_clone then
      if v_product.price_mode='fixed' and new.unit_price<>v_product.base_price then raise exception 'Fixed catalog price cannot be changed.';
      elsif v_product.price_mode='starting_at' and new.unit_price<v_product.base_price then raise exception 'Price cannot be below the approved starting price.';
      end if;
    end if;
  end if;

  v_gross:=round((new.quantity*new.unit_price)::numeric,2);
  if new.discount_type='none' then
    new.discount_value:=0; v_discount:=0;
  elsif new.discount_type='percent' then
    if new.discount_value>100 then raise exception 'Percentage discount cannot exceed 100 percent.'; end if;
    if not v_is_admin and new.discount_value>v_max_discount then raise exception 'Sales discount exceeds the configured maximum. Request manager approval with an allowed discount.'; end if;
    v_discount:=round((v_gross*new.discount_value/100.0)::numeric,2);
  elsif new.discount_type='fixed' then
    if new.discount_value>v_gross then raise exception 'Fixed discount cannot exceed the line value.'; end if;
    if not v_is_admin and v_gross>0 and (new.discount_value/v_gross*100)>v_max_discount then raise exception 'Sales discount exceeds the configured maximum. Request manager approval with an allowed discount.'; end if;
    v_discount:=round(new.discount_value::numeric,2);
  else
    raise exception 'Unsupported discount type.';
  end if;
  new.discount_amount:=v_discount;
  new.line_total:=round((v_gross-v_discount)::numeric,2);
  return new;
end;
$$;

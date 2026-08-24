-- Ensure Sales-created quotations always begin as Draft and cannot inject approval state at creation.

create or replace function public.create_quotation_atomic(p_quotation jsonb,p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
  v_salesperson uuid;
  v_item jsonb;
  v_is_admin boolean:=public.is_admin();
begin
  if not public.has_active_role(array['admin','sales']) then raise exception 'Unauthorized.'; end if;
  v_salesperson:=nullif(p_quotation->>'salesperson_id','')::uuid;
  if not v_is_admin and v_salesperson is distinct from auth.uid() then
    raise exception 'Sales representatives may create quotations only for themselves.';
  end if;

  perform set_config('profox.quotation_atomic_rpc','1',true);

  insert into public.quotations(
    opportunity_id,salesperson_id,customer_name,contact_name,email,phone,country,currency,status,
    valid_until,payment_terms,scope_summary,exclusions,customer_notes,internal_notes,subtotal,total,created_by,
    approval_required,approval_route,approval_reason,approval_checked_at
  ) values (
    nullif(p_quotation->>'opportunity_id','')::uuid,
    v_salesperson,
    coalesce(nullif(p_quotation->>'customer_name',''),'Customer'),
    nullif(p_quotation->>'contact_name',''),nullif(p_quotation->>'email',''),nullif(p_quotation->>'phone',''),nullif(p_quotation->>'country',''),
    coalesce(nullif(p_quotation->>'currency',''),'USD'),
    case when v_is_admin then coalesce(nullif(p_quotation->>'status',''),'Draft') else 'Draft' end,
    nullif(p_quotation->>'valid_until','')::date,
    nullif(p_quotation->>'payment_terms',''),nullif(p_quotation->>'scope_summary',''),nullif(p_quotation->>'exclusions',''),
    nullif(p_quotation->>'customer_notes',''),nullif(p_quotation->>'internal_notes',''),0,0,auth.uid(),
    null,null,null,null
  ) returning id into v_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    insert into public.quotation_items(
      quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,
      quantity,unit_price,line_total,item_type,sort_order
    ) values (
      v_id,
      nullif(v_item->>'sales_product_id','')::uuid,
      coalesce(v_item->>'product_code_snapshot','CUSTOM'),
      coalesce(v_item->>'product_name_snapshot','Custom Item'),
      nullif(v_item->>'description_snapshot',''),
      coalesce((v_item->>'quantity')::int,1),
      coalesce((v_item->>'unit_price')::numeric,0),
      0,
      coalesce(v_item->>'item_type','custom'),
      coalesce((v_item->>'sort_order')::int,0)
    );
  end loop;

  perform set_config('profox.quotation_atomic_rpc','',true);
  return v_id;
exception when others then
  perform set_config('profox.quotation_atomic_rpc','',true);
  raise;
end;
$$;

revoke all on function public.create_quotation_atomic(jsonb,jsonb) from public,anon;
grant execute on function public.create_quotation_atomic(jsonb,jsonb) to authenticated;

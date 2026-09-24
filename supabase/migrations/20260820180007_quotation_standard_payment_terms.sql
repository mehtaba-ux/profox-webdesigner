-- Make standard quotation payment terms Admin-configurable and include them in approval routing.

alter table public.sales_products
  add column if not exists standard_payment_terms text;

-- Initialize the current approved standard package schedules. Admin can edit these later in Sales Catalog.
update public.sales_products
set standard_payment_terms = case code
  when 'PF-WEB-LAUNCH' then '50% / 50%'
  when 'PF-WEB-GROWTH' then '50% / 30% / 20%'
  when 'PF-WEB-SCALE' then '40% / 30% / 20% / 10%'
  else standard_payment_terms
end,
updated_at=now()
where code in ('PF-WEB-LAUNCH','PF-WEB-GROWTH','PF-WEB-SCALE');

create or replace function public.quotation_standard_payment_terms(p_quotation_id uuid)
returns text
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_primary_count integer:=0;
  v_distinct_terms integer:=0;
  v_terms text;
begin
  select
    count(*) filter (where p.product_type in ('package','discovery','care_plan') and p.price_mode<>'custom'),
    count(distinct nullif(btrim(p.standard_payment_terms),'')) filter (where p.product_type in ('package','discovery','care_plan') and p.price_mode<>'custom'),
    min(nullif(btrim(p.standard_payment_terms),'')) filter (where p.product_type in ('package','discovery','care_plan') and p.price_mode<>'custom')
  into v_primary_count,v_distinct_terms,v_terms
  from public.quotation_items qi
  join public.sales_products p on p.id=qi.sales_product_id
  where qi.quotation_id=p_quotation_id and p.active=true;

  if v_primary_count=0 then return null; end if;
  if v_distinct_terms<>1 then return null; end if;
  return v_terms;
end;
$$;

revoke all on function public.quotation_standard_payment_terms(uuid) from public,anon;
grant execute on function public.quotation_standard_payment_terms(uuid) to authenticated;

create or replace function public.quotation_requires_manager_approval(p_quotation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_item_count integer:=0;
  v_requires boolean:=false;
  v_primary_count integer:=0;
  v_primary_with_terms integer:=0;
  v_distinct_terms integer:=0;
  v_standard_terms text;
  v_quote_terms text;
begin
  select count(*)::int into v_item_count from public.quotation_items where quotation_id=p_quotation_id;
  if v_item_count=0 then return true; end if;

  select coalesce(bool_or(
    qi.sales_product_id is null
    or p.id is null
    or coalesce(p.active,false)=false
    or coalesce(p.manager_approval_required,false)=true
    or p.price_mode='custom'
    or qi.item_type='custom'
  ),true)
  into v_requires
  from public.quotation_items qi
  left join public.sales_products p on p.id=qi.sales_product_id
  where qi.quotation_id=p_quotation_id;

  if v_requires then return true; end if;

  select
    count(*) filter (where p.product_type in ('package','discovery','care_plan') and p.price_mode<>'custom'),
    count(*) filter (where p.product_type in ('package','discovery','care_plan') and p.price_mode<>'custom' and nullif(btrim(p.standard_payment_terms),'') is not null),
    count(distinct nullif(btrim(p.standard_payment_terms),'')) filter (where p.product_type in ('package','discovery','care_plan') and p.price_mode<>'custom')
  into v_primary_count,v_primary_with_terms,v_distinct_terms
  from public.quotation_items qi
  join public.sales_products p on p.id=qi.sales_product_id
  where qi.quotation_id=p_quotation_id and p.active=true;

  select nullif(btrim(q.payment_terms),'') into v_quote_terms from public.quotations q where q.id=p_quotation_id;

  if v_primary_count>0 then
    -- A standard primary product needs one unambiguous Admin-configured terms set to qualify for auto-approval.
    if v_primary_with_terms<>v_primary_count or v_distinct_terms<>1 then return true; end if;
    v_standard_terms:=public.quotation_standard_payment_terms(p_quotation_id);
    if v_standard_terms is null then return true; end if;
    if v_quote_terms is not null and lower(regexp_replace(v_quote_terms,'\s+','','g'))<>lower(regexp_replace(v_standard_terms,'\s+','','g')) then
      return true;
    end if;
  elsif v_quote_terms is not null then
    -- Add-on-only quotes have no inherited primary-product terms; any custom terms need review.
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.quotation_requires_manager_approval(uuid) from public,anon;
grant execute on function public.quotation_requires_manager_approval(uuid) to authenticated;

create or replace function public.update_quotation_atomic(
  p_quotation_id uuid,
  p_updates jsonb,
  p_items jsonb default null::jsonb
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_q public.quotations%rowtype;
  v_item jsonb;
  v_requested_status text;
  v_requires_approval boolean;
  v_standard_terms text;
  v_is_admin boolean:=public.is_admin();
begin
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if not v_is_admin and (not public.has_active_role(array['sales']) or v_q.salesperson_id is distinct from auth.uid()) then raise exception 'Unauthorized.'; end if;

  v_requested_status:=coalesce(nullif(p_updates->>'status',''),v_q.status);
  if not v_is_admin then
    if v_q.status in ('Sent','Accepted','Rejected','Expired','Cancelled') then raise exception 'Locked quotation may not be edited by Sales.'; end if;
    if v_q.status='Approved' and v_requested_status<>'Sent' then raise exception 'Approved quotation may only be sent by Sales.'; end if;
    if v_q.status<>'Approved' and v_requested_status not in ('Draft','Ready for Approval') then raise exception 'Submit the quotation through the approved routing workflow.'; end if;
  end if;

  perform set_config('profox.quotation_atomic_rpc','1',true);

  if not v_is_admin and v_q.status='Approved' and v_requested_status='Sent' then
    update public.quotations set status='Sent',sent_at=coalesce(sent_at,now()),updated_at=now() where id=p_quotation_id;
    perform set_config('profox.quotation_atomic_rpc','',true);
    return;
  end if;

  update public.quotations set
    customer_name=coalesce(nullif(p_updates->>'customer_name',''),customer_name),
    contact_name=case when p_updates ? 'contact_name' then nullif(p_updates->>'contact_name','') else contact_name end,
    email=case when p_updates ? 'email' then nullif(p_updates->>'email','') else email end,
    phone=case when p_updates ? 'phone' then nullif(p_updates->>'phone','') else phone end,
    country=case when p_updates ? 'country' then nullif(p_updates->>'country','') else country end,
    currency=coalesce(nullif(p_updates->>'currency',''),currency),
    status=case when v_is_admin then v_requested_status else 'Draft' end,
    valid_until=case when p_updates ? 'valid_until' then nullif(p_updates->>'valid_until','')::date else valid_until end,
    payment_terms=case when p_updates ? 'payment_terms' then nullif(p_updates->>'payment_terms','') else payment_terms end,
    scope_summary=case when p_updates ? 'scope_summary' then nullif(p_updates->>'scope_summary','') else scope_summary end,
    exclusions=case when p_updates ? 'exclusions' then nullif(p_updates->>'exclusions','') else exclusions end,
    customer_notes=case when p_updates ? 'customer_notes' then nullif(p_updates->>'customer_notes','') else customer_notes end,
    internal_notes=case when p_updates ? 'internal_notes' then nullif(p_updates->>'internal_notes','') else internal_notes end,
    updated_at=now()
  where id=p_quotation_id;

  if p_items is not null then
    delete from public.quotation_items where quotation_id=p_quotation_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
      insert into public.quotation_items(quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,quantity,unit_price,line_total,item_type,sort_order)
      values(p_quotation_id,nullif(v_item->>'sales_product_id','')::uuid,coalesce(v_item->>'product_code_snapshot','CUSTOM'),coalesce(v_item->>'product_name_snapshot','Custom Item'),nullif(v_item->>'description_snapshot',''),coalesce((v_item->>'quantity')::int,1),coalesce((v_item->>'unit_price')::numeric,0),0,coalesce(v_item->>'item_type','custom'),coalesce((v_item->>'sort_order')::int,0));
    end loop;
  end if;

  if not v_is_admin and v_requested_status='Ready for Approval' then
    -- Apply the Admin-configured standard terms when the seller did not request an exception.
    v_standard_terms:=public.quotation_standard_payment_terms(p_quotation_id);
    update public.quotations
    set payment_terms=coalesce(nullif(btrim(payment_terms),''),v_standard_terms),updated_at=now()
    where id=p_quotation_id;

    v_requires_approval:=public.quotation_requires_manager_approval(p_quotation_id);
    if v_requires_approval then
      update public.quotations
      set status='Ready for Approval',approval_required=true,approval_route='manager_review',
          approval_reason='Custom/non-catalog scope, approval-required product, or non-standard/missing commercial terms require review.',
          approval_checked_at=now(),approved_by=null,approved_at=null,updated_at=now()
      where id=p_quotation_id;
    else
      update public.quotations
      set status='Approved',approval_required=false,approval_route='catalog_auto',
          approval_reason='All products and commercial terms match active Admin-approved catalog configuration.',
          approval_checked_at=now(),approved_by=null,approved_at=now(),updated_at=now()
      where id=p_quotation_id;
    end if;
  elsif not v_is_admin then
    update public.quotations
    set approval_required=null,approval_route=null,approval_reason=null,approval_checked_at=null,approved_by=null,approved_at=null,updated_at=now()
    where id=p_quotation_id;
  end if;

  perform set_config('profox.quotation_atomic_rpc','',true);
exception when others then
  perform set_config('profox.quotation_atomic_rpc','',true);
  raise;
end;
$$;

revoke all on function public.update_quotation_atomic(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.update_quotation_atomic(uuid,jsonb,jsonb) to authenticated;

-- Sales flow integrity: a deliverable quotation must remain attached to the CRM
-- opportunity that owns the sale, and incomplete catalog offers must not be
-- presented as ready to sell.

update public.sales_products
set timeline_impact = 'assessment_required',
    updated_at = timezone('utc', now())
where product_type <> 'care_plan'
  and (delivery_duration_min is null or delivery_duration_max is null)
  and timeline_impact <> 'assessment_required';

create or replace function public.enforce_sales_product_commercial_readiness()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total numeric;
  v_first_type text;
begin
  if new.product_type in ('package', 'discovery', 'custom')
     and new.active
     and (
       new.payment_schedule is null
       or jsonb_typeof(new.payment_schedule) <> 'array'
       or jsonb_array_length(new.payment_schedule) = 0
     ) then
    raise exception 'Active primary offers require an approved payment schedule before Sales can use them.';
  end if;

  if new.product_type in ('package', 'discovery', 'custom')
     and new.active then
    if exists (
      select 1
      from jsonb_array_elements(new.payment_schedule) milestone
      where nullif(btrim(milestone->>'label'), '') is null
         or nullif(btrim(milestone->>'paymentType'), '') is null
         or coalesce((milestone->>'percentage')::numeric, 0) <= 0
    ) then
      raise exception 'Every payment milestone requires a label, payment type, and positive percentage.';
    end if;

    select coalesce(sum((milestone->>'percentage')::numeric), 0)
    into v_total
    from jsonb_array_elements(new.payment_schedule) milestone;

    if round(v_total, 4) <> 100 then
      raise exception 'The payment schedule must total 100 percent.';
    end if;

    select milestone->>'paymentType'
    into v_first_type
    from jsonb_array_elements(new.payment_schedule) milestone
    order by coalesce((milestone->>'milestoneNumber')::integer, 2147483647)
    limit 1;

    if v_first_type not in ('Advance', 'Full Payment') then
      raise exception 'The first payment milestone must be Advance or Full Payment.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_sales_product_commercial_readiness() from public, anon, authenticated;

drop trigger if exists trg_sales_product_commercial_readiness on public.sales_products;
create trigger trg_sales_product_commercial_readiness
before insert or update of active, product_type, payment_schedule
on public.sales_products
for each row execute function public.enforce_sales_product_commercial_readiness();

-- Existing incomplete offers are kept for Admin configuration, but are no
-- longer public or active in seller selection until an approved schedule exists.
update public.sales_products
set active = false,
    public_visible = false,
    updated_at = timezone('utc', now())
where product_type in ('package', 'discovery', 'custom')
  and active
  and (
    payment_schedule is null
    or jsonb_typeof(payment_schedule) <> 'array'
    or jsonb_array_length(payment_schedule) = 0
  );

create or replace function public.enforce_quotation_crm_integrity()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_opportunity_salesperson uuid;
begin
  if new.status <> 'Draft' and new.opportunity_id is null then
    raise exception 'Link this quotation to its CRM opportunity before approval or customer delivery.';
  end if;

  if new.opportunity_id is not null then
    select opportunity.salesperson_id
    into v_opportunity_salesperson
    from public.crm_opportunities opportunity
    where opportunity.id = new.opportunity_id;

    if not found then
      raise exception 'The linked CRM opportunity does not exist.';
    end if;

    if v_opportunity_salesperson is null then
      raise exception 'Assign the CRM opportunity to a salesperson before creating its quotation.';
    end if;

    if new.salesperson_id is null then
      new.salesperson_id := v_opportunity_salesperson;
    elsif new.salesperson_id is distinct from v_opportunity_salesperson then
      raise exception 'The quotation salesperson must match the CRM opportunity owner.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_quotation_crm_integrity() from public, anon, authenticated;

drop trigger if exists trg_quotation_crm_integrity on public.quotations;
create trigger trg_quotation_crm_integrity
before insert or update of opportunity_id, salesperson_id, status
on public.quotations
for each row execute function public.enforce_quotation_crm_integrity();

create or replace function public.update_quotation_atomic(
  p_quotation_id uuid,
  p_updates jsonb,
  p_items jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_q public.quotations%rowtype; v_item jsonb; v_product_id uuid; v_client_expectations jsonb;
  v_duration_min integer; v_duration_max integer; v_duration_unit text; v_timeline_impact text; v_duration_note text;
  v_requested_status text; v_requires_approval boolean; v_standard_terms text; v_is_admin boolean:=public.is_admin(); v_items_locked boolean;
begin
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if not v_is_admin and (not public.has_active_role(array['admin','sales']) or v_q.salesperson_id is distinct from auth.uid()) then raise exception 'Unauthorized.'; end if;
  v_requested_status:=coalesce(nullif(p_updates->>'status',''),v_q.status);
  v_items_locked:=v_q.sent_at is not null or v_q.first_viewed_at is not null or v_q.status in ('Accepted','Rejected','Expired');
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
    opportunity_id=case when p_updates?'opportunity_id' then nullif(p_updates->>'opportunity_id','')::uuid else opportunity_id end,
    customer_name=coalesce(nullif(p_updates->>'customer_name',''),customer_name),
    contact_name=case when p_updates?'contact_name' then nullif(p_updates->>'contact_name','') else contact_name end,
    email=case when p_updates?'email' then nullif(p_updates->>'email','') else email end,
    phone=case when p_updates?'phone' then nullif(p_updates->>'phone','') else phone end,
    country=case when p_updates?'country' then nullif(p_updates->>'country','') else country end,
    currency=coalesce(nullif(p_updates->>'currency',''),currency),
    status=case when v_is_admin then v_requested_status else 'Draft' end,
    valid_until=case when p_updates?'valid_until' then nullif(p_updates->>'valid_until','')::date else valid_until end,
    payment_terms=case when p_updates?'payment_terms' then nullif(p_updates->>'payment_terms','') else payment_terms end,
    scope_summary=case when p_updates?'scope_summary' then nullif(p_updates->>'scope_summary','') else scope_summary end,
    exclusions=case when p_updates?'exclusions' then nullif(p_updates->>'exclusions','') else exclusions end,
    customer_notes=case when p_updates?'customer_notes' then nullif(p_updates->>'customer_notes','') else customer_notes end,
    internal_notes=case when p_updates?'internal_notes' then nullif(p_updates->>'internal_notes','') else internal_notes end,
    updated_at=now()
  where id=p_quotation_id;

  if p_items is not null and not v_items_locked then
    delete from public.quotation_items where quotation_id=p_quotation_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
      v_product_id:=nullif(v_item->>'sales_product_id','')::uuid;
      v_client_expectations:='{}'::jsonb; v_duration_min:=null; v_duration_max:=null; v_duration_unit:='business_days'; v_timeline_impact:='assessment_required'; v_duration_note:=null;
      if v_product_id is not null then
        select coalesce(sp.client_expectations,'{}'::jsonb),sp.delivery_duration_min,sp.delivery_duration_max,sp.delivery_duration_unit,sp.timeline_impact,sp.delivery_duration_note
        into v_client_expectations,v_duration_min,v_duration_max,v_duration_unit,v_timeline_impact,v_duration_note
        from public.sales_products sp where sp.id=v_product_id;
        if not found then raise exception 'Catalog product not found.'; end if;
      end if;
      insert into public.quotation_items(quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,quantity,unit_price,line_total,item_type,sort_order,client_expectations_snapshot,duration_min_snapshot,duration_max_snapshot,duration_unit_snapshot,timeline_impact_snapshot,duration_note_snapshot)
      values(p_quotation_id,v_product_id,coalesce(v_item->>'product_code_snapshot','CUSTOM'),coalesce(v_item->>'product_name_snapshot','Custom Item'),nullif(v_item->>'description_snapshot',''),coalesce((v_item->>'quantity')::int,1),coalesce((v_item->>'unit_price')::numeric,0),0,coalesce(v_item->>'item_type','custom'),coalesce((v_item->>'sort_order')::int,0),v_client_expectations,v_duration_min,v_duration_max,v_duration_unit,v_timeline_impact,v_duration_note);
    end loop;
    update public.quotations set duration_override_min=null,duration_override_max=null,duration_override_note=null,duration_override_by=null,duration_override_at=null where id=p_quotation_id;
    perform public.refresh_quotation_delivery_timeline(p_quotation_id);
  end if;

  if not v_is_admin and v_requested_status='Ready for Approval' then
    v_standard_terms:=public.quotation_standard_payment_terms(p_quotation_id);
    update public.quotations set payment_terms=coalesce(nullif(btrim(payment_terms),''),v_standard_terms),updated_at=now() where id=p_quotation_id;
    v_requires_approval:=public.quotation_requires_manager_approval(p_quotation_id);
    if v_requires_approval then
      update public.quotations set status='Ready for Approval',approval_required=true,approval_route='manager_review',approval_reason='Custom/non-catalog scope, approval-required product, non-standard commercial terms, or unresolved delivery timeline require review.',approval_checked_at=now(),approved_by=null,approved_at=null,updated_at=now() where id=p_quotation_id;
    else
      update public.quotations set status='Approved',approval_required=false,approval_route='catalog_auto',approval_reason='All products, commercial terms, and delivery timeline match active Admin-approved catalog configuration.',approval_checked_at=now(),approved_by=null,approved_at=now(),updated_at=now() where id=p_quotation_id;
    end if;
  elsif not v_is_admin then
    update public.quotations set approval_required=null,approval_route=null,approval_reason=null,approval_checked_at=null,approved_by=null,approved_at=null,updated_at=now() where id=p_quotation_id;
  end if;
  perform set_config('profox.quotation_atomic_rpc','',true);
exception when others then
  perform set_config('profox.quotation_atomic_rpc','',true);
  raise;
end;
$function$;

revoke all on function public.update_quotation_atomic(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.update_quotation_atomic(uuid,jsonb,jsonb) to authenticated;

-- Module 16 foundation — Admin-managed structured payment schedules.
-- Sales can read active catalog schedules but only Admin can change sales_products through existing RLS.

alter table public.sales_products
  add column if not exists payment_schedule jsonb;

update public.sales_products
set payment_schedule='[
  {"milestoneNumber":1,"paymentType":"Advance","label":"50% Advance Payment","percentage":50},
  {"milestoneNumber":2,"paymentType":"Final Payment","label":"50% Final Payment","percentage":50}
]'::jsonb,
standard_payment_terms=coalesce(standard_payment_terms,'50% / 50%'),
updated_at=now()
where code='PF-WEB-LAUNCH';

update public.sales_products
set payment_schedule='[
  {"milestoneNumber":1,"paymentType":"Advance","label":"50% Advance Payment","percentage":50},
  {"milestoneNumber":2,"paymentType":"Design Milestone","label":"30% Design Milestone","percentage":30},
  {"milestoneNumber":3,"paymentType":"Final Payment","label":"20% Final Payment","percentage":20}
]'::jsonb,
standard_payment_terms=coalesce(standard_payment_terms,'50% / 30% / 20%'),
updated_at=now()
where code='PF-WEB-GROWTH';

update public.sales_products
set payment_schedule='[
  {"milestoneNumber":1,"paymentType":"Advance","label":"40% Advance Payment","percentage":40},
  {"milestoneNumber":2,"paymentType":"Design Milestone","label":"30% Design Milestone","percentage":30},
  {"milestoneNumber":3,"paymentType":"Staging Milestone","label":"20% Staging Milestone","percentage":20},
  {"milestoneNumber":4,"paymentType":"Final Payment","label":"10% Final Payment","percentage":10}
]'::jsonb,
standard_payment_terms=coalesce(standard_payment_terms,'40% / 30% / 20% / 10%'),
updated_at=now()
where code='PF-WEB-SCALE';

update public.sales_products
set payment_schedule='[
  {"milestoneNumber":1,"paymentType":"Full Payment","label":"Full Payment","percentage":100}
]'::jsonb,
updated_at=now()
where code='PF-DISCOVERY';

update public.sales_products
set payment_schedule=null,updated_at=now()
where code='PF-CUSTOM';

create or replace function public.validate_sales_product_payment_schedule()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_total numeric:=0;
  v_item jsonb;
  v_seen text[]:=array[]::text[];
  v_type text;
  v_pct numeric;
begin
  if new.payment_schedule is null then return new; end if;
  if jsonb_typeof(new.payment_schedule)<>'array' then
    raise exception 'Payment schedule must be a JSON array.';
  end if;
  if jsonb_array_length(new.payment_schedule)=0 then
    raise exception 'Payment schedule cannot be empty when configured.';
  end if;

  for v_item in select value from jsonb_array_elements(new.payment_schedule)
  loop
    v_type:=trim(coalesce(v_item->>'paymentType',''));
    if v_type not in ('Advance','Design Milestone','Staging Milestone','Final Payment','Full Payment','Custom Milestone') then
      raise exception 'Unsupported payment type % in product schedule.',v_type;
    end if;
    if v_type=any(v_seen) then raise exception 'Duplicate payment type % in product schedule.',v_type; end if;
    v_seen:=array_append(v_seen,v_type);
    begin v_pct:=(v_item->>'percentage')::numeric; exception when others then raise exception 'Every milestone percentage must be numeric.'; end;
    if v_pct<=0 or v_pct>100 then raise exception 'Milestone percentage must be greater than 0 and at most 100.'; end if;
    if coalesce((v_item->>'milestoneNumber')::integer,0)<=0 then raise exception 'Every milestone must have a positive milestoneNumber.'; end if;
    if trim(coalesce(v_item->>'label',''))='' then raise exception 'Every milestone must have a label.'; end if;
    v_total:=v_total+v_pct;
  end loop;

  if round(v_total,4)<>100 then raise exception 'Standard payment schedule percentages must total 100 percent; configured total is % percent.',v_total; end if;
  return new;
end;
$$;

revoke all on function public.validate_sales_product_payment_schedule() from public,anon,authenticated;

drop trigger if exists trg_validate_sales_product_payment_schedule on public.sales_products;
create trigger trg_validate_sales_product_payment_schedule
before insert or update of payment_schedule on public.sales_products
for each row execute function public.validate_sales_product_payment_schedule();

create or replace function public.validate_payment_request()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_quote public.quotations%rowtype;
  v_product_code text;
  v_schedule jsonb;
  v_milestone jsonb;
  v_pct numeric;
begin
  if coalesce(new.amount_due,0)<0 then raise exception 'Payment amount cannot be negative.'; end if;

  if tg_op='INSERT' then
    if public.is_admin() then
      if coalesce(new.amount_due,0)<=0 then raise exception 'Payment amount must be greater than zero.'; end if;
      return new;
    end if;

    if not public.has_active_role(array['sales']) or new.salesperson_id is distinct from auth.uid() then
      raise exception 'Only the assigned active salesperson or an Admin may create a payment request.';
    end if;
    if new.quotation_id is null then raise exception 'Payment request must be linked to an accepted quotation.'; end if;

    select * into v_quote from public.quotations where id=new.quotation_id;
    if not found or v_quote.status<>'Accepted' then raise exception 'Payment request requires an accepted quotation.'; end if;
    if v_quote.salesperson_id is distinct from auth.uid() then raise exception 'You may create payment requests only for your own accepted quotations.'; end if;

    select qi.product_code_snapshot into v_product_code
    from public.quotation_items qi
    where qi.quotation_id=v_quote.id and qi.item_type='package'
    order by qi.sort_order,qi.created_at limit 1;
    if v_product_code is null then raise exception 'Quotation package was not found.'; end if;

    select sp.payment_schedule into v_schedule
    from public.sales_products sp
    where sp.code=v_product_code and sp.active=true;
    if v_schedule is null then
      raise exception 'Package % does not have a standard Sales-authorized payment schedule; Admin approval is required.',v_product_code;
    end if;
    select value into v_milestone
    from jsonb_array_elements(v_schedule)
    where value->>'paymentType'=new.payment_type
    limit 1;
    if v_milestone is null then raise exception 'Payment type % is not valid for package %.',new.payment_type,v_product_code; end if;
    v_pct:=(v_milestone->>'percentage')::numeric;

    if exists(
      select 1 from public.payments p
      where p.quotation_id=v_quote.id
        and p.payment_type=new.payment_type
        and p.status not in ('Cancelled','Failed','Refunded')
    ) then
      raise exception 'An active or settled % payment request already exists for this quotation.',new.payment_type;
    end if;

    new.opportunity_id:=v_quote.opportunity_id;
    new.salesperson_id:=v_quote.salesperson_id;
    new.client_id:=v_quote.client_id;
    new.customer_name:=v_quote.customer_name;
    new.customer_email:=coalesce(v_quote.email,'');
    new.currency:=v_quote.currency;
    new.amount_due:=round((v_quote.total*v_pct/100.0)::numeric,2);
    new.amount_paid:=0;
    new.milestone_number:=coalesce((v_milestone->>'milestoneNumber')::integer,new.milestone_number);
    new.milestone_label:=coalesce(nullif(trim(v_milestone->>'label'),''),new.milestone_label);
    new.verified_at:=null;
    new.verified_by:=null;
    if new.status not in ('Draft','Ready','Sent','Pending','Verification Pending') then new.status:='Draft'; end if;
    return new;
  end if;

  if public.is_admin() then return new; end if;
  if not public.has_active_role(array['sales']) or old.salesperson_id is distinct from auth.uid() then raise exception 'Unauthorized payment update.'; end if;
  if old.status in ('Verified','Refunded','Partially Refunded','Failed') then raise exception 'Settled or terminal payment records may only be changed by an Admin.'; end if;

  if new.quotation_id is distinct from old.quotation_id
    or new.opportunity_id is distinct from old.opportunity_id
    or new.client_id is distinct from old.client_id
    or new.salesperson_id is distinct from old.salesperson_id
    or new.customer_name is distinct from old.customer_name
    or new.customer_email is distinct from old.customer_email
    or new.payment_type is distinct from old.payment_type
    or new.milestone_number is distinct from old.milestone_number
    or new.milestone_label is distinct from old.milestone_label
    or new.amount_due is distinct from old.amount_due
    or new.amount_paid is distinct from old.amount_paid
    or new.currency is distinct from old.currency
    or new.verified_at is distinct from old.verified_at
    or new.verified_by is distinct from old.verified_by then
    raise exception 'Core payment amount, ownership and verification fields are locked for Sales.';
  end if;

  if new.status not in ('Draft','Ready','Sent','Pending','Verification Pending','Cancelled') then
    raise exception 'Sales cannot set settlement status %.',new.status;
  end if;
  return new;
end;
$$;

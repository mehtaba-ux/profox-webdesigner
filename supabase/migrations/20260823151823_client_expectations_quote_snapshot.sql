-- Client expectation clarity on the existing Sales Catalog -> quotation flow.
-- Reuses canonical sales_products, quotations, quotation_items and public quotation RPCs.

alter table public.sales_products
  add column if not exists client_expectations jsonb not null default '{}'::jsonb;

alter table public.quotation_items
  add column if not exists client_expectations_snapshot jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_products_client_expectations_object_chk'
      and conrelid = 'public.sales_products'::regclass
  ) then
    alter table public.sales_products
      add constraint sales_products_client_expectations_object_chk
      check (jsonb_typeof(client_expectations) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'quotation_items_client_expectations_snapshot_object_chk'
      and conrelid = 'public.quotation_items'::regclass
  ) then
    alter table public.quotation_items
      add constraint quotation_items_client_expectations_snapshot_object_chk
      check (jsonb_typeof(client_expectations_snapshot) = 'object');
  end if;
end $$;

comment on column public.sales_products.client_expectations is
  'Admin-managed client responsibility, delivery assumption, review/approval and handover/support expectations for this canonical Sales Catalog product.';
comment on column public.quotation_items.client_expectations_snapshot is
  'Server-captured immutable copy of the referenced Sales Catalog client expectations used for the customer quotation.';

-- Seed the existing package records only when no expectation content has been configured yet.
-- Admin can edit these later in Sales Catalog; historical quotation snapshots remain independent.
update public.sales_products
set client_expectations = jsonb_build_object(
  'clientResponsibilities', jsonb_build_array(
    'Provide accurate business information, approved brand assets/content, and access credentials or third-party permissions required for the agreed work.',
    'Nominate a primary decision-maker and provide consolidated, timely feedback during scheduled review points.',
    'Review deliverables and raise material concerns during the relevant review stage rather than after final approval.'
  ),
  'deliveryAssumptions', jsonb_build_array(
    'Delivery timing begins after the required payment, onboarding, and essential client inputs/access are received.',
    'Delays in content, access, approvals, or feedback can move dependent milestones and the planned launch date.',
    'Third-party platforms, plugins, hosting, payment providers, DNS, or external approvals can affect timing where they are outside ProFox control.'
  ),
  'reviewAndApproval', jsonb_build_array(
    'Reviews and revisions follow the process stated in the approved quotation and package scope; requests outside that scope are handled through the change-request process.',
    'Feedback should be consolidated for each review round so the team can implement one clear direction efficiently.',
    'Approval of a milestone confirms that stage and allows the next stage to begin; later changes to an approved stage may affect scope, timing, or cost.'
  ),
  'handoverAndSupport', jsonb_build_array(
    'At completion, ProFox provides the agreed launch/handover items and access or documentation applicable to the project.',
    'Post-launch support covers issues within the delivered scope during the support period stated in the agreed package or quotation; new features or expanded scope are separate work.',
    'Ongoing third-party subscriptions, licenses, hosting, domains, or provider fees remain the client responsibility unless the quotation explicitly states otherwise.'
  )
), updated_at = timezone('utc', now())
where product_type = 'package'
  and coalesce(client_expectations, '{}'::jsonb) = '{}'::jsonb;

-- Existing quotations that have not reached the customer may safely take the current catalog snapshot.
-- Delivered/historical quotations are deliberately excluded so this migration cannot rewrite prior customer terms.
update public.quotation_items qi
set client_expectations_snapshot = coalesce(sp.client_expectations, '{}'::jsonb)
from public.quotations q, public.sales_products sp
where qi.quotation_id = q.id
  and qi.sales_product_id = sp.id
  and q.status in ('Draft','Ready for Approval','Approved')
  and q.sent_at is null
  and q.first_viewed_at is null
  and coalesce(qi.client_expectations_snapshot, '{}'::jsonb) = '{}'::jsonb;

create or replace function public.admin_upsert_sales_product(p_product jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_code text := upper(trim(coalesce(p_product->>'code','')));
  v_name text := trim(coalesce(p_product->>'name',''));
  v_category text := trim(coalesce(p_product->>'category',''));
  v_product_type text := trim(coalesce(p_product->>'product_type',''));
  v_price_mode text := trim(coalesce(p_product->>'price_mode',''));
  v_scope jsonb := coalesce(p_product->'scope','[]'::jsonb);
  v_public_details jsonb := coalesce(p_product->'public_details','{}'::jsonb);
  v_client_expectations jsonb := coalesce(p_product->'client_expectations','{}'::jsonb);
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
  if jsonb_typeof(v_client_expectations) <> 'object' then
    raise exception 'Client expectations must be an object';
  end if;
  if exists (
    select 1
    from jsonb_each(v_client_expectations) entry
    where entry.key not in ('clientResponsibilities','deliveryAssumptions','reviewAndApproval','handoverAndSupport')
       or jsonb_typeof(entry.value) <> 'array'
  ) then
    raise exception 'Client expectations contain an unsupported section or non-array value';
  end if;
  if exists (
    select 1
    from jsonb_each(v_client_expectations) entry
    cross join lateral jsonb_array_elements(entry.value) item
    where jsonb_typeof(item) <> 'string'
  ) then
    raise exception 'Each client expectation must be text';
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
      active,sort_order,standard_payment_terms,payment_schedule,public_visible,public_details,
      client_expectations,updated_at
    ) values (
      v_code,v_name,v_category,v_product_type,v_price_mode,
      coalesce((p_product->>'base_price')::numeric,0),coalesce(nullif(p_product->>'currency',''),'USD'),
      nullif(p_product->>'billing_period',''),nullif(p_product->>'short_description',''),
      nullif(p_product->>'full_description',''),v_scope,nullif(p_product->>'technology',''),
      coalesce((p_product->>'manager_approval_required')::boolean,false),
      coalesce((p_product->>'active')::boolean,true),coalesce((p_product->>'sort_order')::integer,0),
      nullif(p_product->>'standard_payment_terms',''),v_payment_schedule,
      coalesce((p_product->>'public_visible')::boolean,false),v_public_details,
      v_client_expectations,timezone('utc',now())
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
        client_expectations = v_client_expectations,
        updated_at = timezone('utc',now())
    where id = v_id;
    if not found then raise exception 'Sales product not found'; end if;
  end if;

  return v_id;
end;
$function$;

create or replace function public.create_quotation_atomic(p_quotation jsonb, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_salesperson uuid;
  v_item jsonb;
  v_product_id uuid;
  v_client_expectations jsonb;
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
    v_product_id := nullif(v_item->>'sales_product_id','')::uuid;
    v_client_expectations := '{}'::jsonb;
    if v_product_id is not null then
      select coalesce(sp.client_expectations,'{}'::jsonb)
      into v_client_expectations
      from public.sales_products sp
      where sp.id = v_product_id;
      if not found then raise exception 'Catalog product not found.'; end if;
    end if;

    insert into public.quotation_items(
      quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,
      quantity,unit_price,line_total,item_type,sort_order,client_expectations_snapshot
    ) values (
      v_id,
      v_product_id,
      coalesce(v_item->>'product_code_snapshot','CUSTOM'),
      coalesce(v_item->>'product_name_snapshot','Custom Item'),
      nullif(v_item->>'description_snapshot',''),
      coalesce((v_item->>'quantity')::int,1),
      coalesce((v_item->>'unit_price')::numeric,0),
      0,
      coalesce(v_item->>'item_type','custom'),
      coalesce((v_item->>'sort_order')::int,0),
      v_client_expectations
    );
  end loop;

  perform set_config('profox.quotation_atomic_rpc','',true);
  return v_id;
exception when others then
  perform set_config('profox.quotation_atomic_rpc','',true);
  raise;
end;
$function$;

create or replace function public.update_quotation_atomic(p_quotation_id uuid, p_updates jsonb, p_items jsonb default null::jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_q public.quotations%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_client_expectations jsonb;
  v_requested_status text;
  v_requires_approval boolean;
  v_standard_terms text;
  v_is_admin boolean:=public.is_admin();
  v_items_locked boolean;
begin
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if not v_is_admin and (not public.has_active_role(array['sales']) or v_q.salesperson_id is distinct from auth.uid()) then raise exception 'Unauthorized.'; end if;
  v_requested_status:=coalesce(nullif(p_updates->>'status',''),v_q.status);
  v_items_locked := v_q.sent_at is not null or v_q.first_viewed_at is not null or v_q.status in ('Accepted','Rejected','Expired');
  if not v_is_admin then
    if v_q.status in ('Sent','Accepted','Rejected','Expired','Cancelled') then raise exception 'Locked quotation may not be edited by Sales.'; end if;
    if v_q.status='Approved' and v_requested_status<>'Sent' then raise exception 'Approved quotation may only be sent by Sales.'; end if;
    if v_q.status<>'Approved' and v_requested_status not in ('Draft','Ready for Approval') then raise exception 'Submit the quotation through the approved routing workflow.'; end if;
  end if;
  perform set_config('profox.quotation_atomic_rpc','1',true);
  if not v_is_admin and v_q.status='Approved' and v_requested_status='Sent' then
    update public.quotations set status='Sent',sent_at=coalesce(sent_at,now()),updated_at=now() where id=p_quotation_id;
    perform set_config('profox.quotation_atomic_rpc','',true); return;
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
    updated_at=now() where id=p_quotation_id;

  if p_items is not null and not v_items_locked then
    delete from public.quotation_items where quotation_id=p_quotation_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
      v_product_id := nullif(v_item->>'sales_product_id','')::uuid;
      v_client_expectations := '{}'::jsonb;
      if v_product_id is not null then
        select coalesce(sp.client_expectations,'{}'::jsonb)
        into v_client_expectations
        from public.sales_products sp
        where sp.id = v_product_id;
        if not found then raise exception 'Catalog product not found.'; end if;
      end if;

      insert into public.quotation_items(
        quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,
        quantity,unit_price,line_total,item_type,sort_order,client_expectations_snapshot
      ) values (
        p_quotation_id,v_product_id,
        coalesce(v_item->>'product_code_snapshot','CUSTOM'),coalesce(v_item->>'product_name_snapshot','Custom Item'),
        nullif(v_item->>'description_snapshot',''),coalesce((v_item->>'quantity')::int,1),
        coalesce((v_item->>'unit_price')::numeric,0),0,coalesce(v_item->>'item_type','custom'),
        coalesce((v_item->>'sort_order')::int,0),v_client_expectations
      );
    end loop;
  end if;

  if not v_is_admin and v_requested_status='Ready for Approval' then
    v_standard_terms:=public.quotation_standard_payment_terms(p_quotation_id);
    update public.quotations set payment_terms=coalesce(nullif(btrim(payment_terms),''),v_standard_terms),updated_at=now() where id=p_quotation_id;
    v_requires_approval:=public.quotation_requires_manager_approval(p_quotation_id);
    if v_requires_approval then
      update public.quotations set status='Ready for Approval',approval_required=true,approval_route='manager_review',approval_reason='Custom/non-catalog scope, approval-required product, or non-standard/missing commercial terms require review.',approval_checked_at=now(),approved_by=null,approved_at=null,updated_at=now() where id=p_quotation_id;
    else
      update public.quotations set status='Approved',approval_required=false,approval_route='catalog_auto',approval_reason='All products and commercial terms match active Admin-approved catalog configuration.',approval_checked_at=now(),approved_by=null,approved_at=now(),updated_at=now() where id=p_quotation_id;
    end if;
  elsif not v_is_admin then
    update public.quotations set approval_required=null,approval_route=null,approval_reason=null,approval_checked_at=null,approved_by=null,approved_at=null,updated_at=now() where id=p_quotation_id;
  end if;
  perform set_config('profox.quotation_atomic_rpc','',true);
exception when others then perform set_config('profox.quotation_atomic_rpc','',true); raise;
end;
$function$;

create or replace function public.protect_delivered_quotation_items()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_quotation_id uuid := case when tg_op = 'DELETE' then old.quotation_id else new.quotation_id end;
  v_locked boolean;
begin
  select (q.sent_at is not null or q.first_viewed_at is not null or q.status in ('Accepted','Rejected','Expired'))
  into v_locked
  from public.quotations q
  where q.id = v_quotation_id;

  if coalesce(v_locked,false) then
    raise exception 'Quotation items are immutable after customer delivery.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_delivered_quotation_items on public.quotation_items;
create trigger protect_delivered_quotation_items
before insert or update or delete on public.quotation_items
for each row execute function public.protect_delivered_quotation_items();

create or replace function public.open_public_quotation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_hash text;
  v_quote public.quotations%rowtype;
  v_first_open boolean := false;
  v_items jsonb := '[]'::jsonb;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Quotation link is invalid.'; end if;
  v_hash := encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_quote from public.quotations where customer_view_token_hash=v_hash and customer_view_token_issued_at is not null and status in ('Sent','Accepted','Rejected','Expired') for update;
  if not found then raise exception 'Quotation link is invalid or no longer available.'; end if;
  v_first_open := v_quote.first_viewed_at is null;
  perform set_config('profox.quotation_view_tracking_rpc','1',true);
  update public.quotations set first_viewed_at=coalesce(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1,updated_at=now() where id=v_quote.id returning * into v_quote;
  perform set_config('profox.quotation_view_tracking_rpc','',true);
  if v_first_open and v_quote.salesperson_id is not null then
    perform public.service_queue_staff_operational_notification(v_quote.salesperson_id,'quotation-opened:'||v_quote.id::text,'quotation_opened','Quotation','Quotation opened - '||v_quote.quotation_number,coalesce(nullif(v_quote.customer_name,''),'Customer')||' opened the quotation for the first time.','/admin/focus/quotation/'||v_quote.id::text,jsonb_build_object('quotationNumber',v_quote.quotation_number,'customerName',v_quote.customer_name,'currency',v_quote.currency,'total',v_quote.total,'firstViewedAt',v_quote.first_viewed_at),now());
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',qi.id,
    'productCode',qi.product_code_snapshot,
    'productName',qi.product_name_snapshot,
    'description',qi.description_snapshot,
    'quantity',qi.quantity,
    'unitPrice',qi.unit_price,
    'lineTotal',qi.line_total,
    'itemType',qi.item_type,
    'clientExpectations',coalesce(qi.client_expectations_snapshot,'{}'::jsonb)
  ) order by qi.sort_order,qi.created_at),'[]'::jsonb)
  into v_items
  from public.quotation_items qi
  where qi.quotation_id=v_quote.id;
  return jsonb_build_object(
    'id',v_quote.id,
    'quotationNumber',v_quote.quotation_number,
    'customerName',v_quote.customer_name,
    'contactName',v_quote.contact_name,
    'currency',v_quote.currency,
    'status',v_quote.status,
    'validUntil',v_quote.valid_until,
    'paymentTerms',v_quote.payment_terms,
    'scopeSummary',v_quote.scope_summary,
    'exclusions',v_quote.exclusions,
    'customerNotes',v_quote.customer_notes,
    'subtotal',v_quote.subtotal,
    'total',v_quote.total,
    'sentAt',v_quote.sent_at,
    'acceptedAt',v_quote.accepted_at,
    'firstViewedAt',v_quote.first_viewed_at,
    'items',v_items
  );
end;
$function$;

revoke execute on function public.protect_delivered_quotation_items() from public, anon, authenticated;

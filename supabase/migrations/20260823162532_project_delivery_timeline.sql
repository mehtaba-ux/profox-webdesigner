-- Canonical project delivery timeline: Sales Catalog -> quotation snapshot -> project target date.
-- Extends existing sales_products, quotation_items, quotations and projects. No parallel timeline module/table.

alter table public.sales_products
  add column if not exists delivery_duration_min integer,
  add column if not exists delivery_duration_max integer,
  add column if not exists delivery_duration_unit text not null default 'business_days',
  add column if not exists timeline_impact text not null default 'assessment_required',
  add column if not exists delivery_duration_note text;

alter table public.quotation_items
  add column if not exists duration_min_snapshot integer,
  add column if not exists duration_max_snapshot integer,
  add column if not exists duration_unit_snapshot text not null default 'business_days',
  add column if not exists timeline_impact_snapshot text not null default 'assessment_required',
  add column if not exists duration_note_snapshot text;

alter table public.quotations
  add column if not exists estimated_duration_min integer,
  add column if not exists estimated_duration_max integer,
  add column if not exists duration_unit text not null default 'business_days',
  add column if not exists duration_snapshot_text text,
  add column if not exists duration_snapshotted_at timestamptz,
  add column if not exists duration_requires_assessment boolean not null default true,
  add column if not exists duration_source text not null default 'unresolved',
  add column if not exists duration_override_min integer,
  add column if not exists duration_override_max integer,
  add column if not exists duration_override_note text,
  add column if not exists duration_override_by uuid references auth.users(id) on delete set null,
  add column if not exists duration_override_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='sales_products_delivery_duration_pair_chk' and conrelid='public.sales_products'::regclass) then
    alter table public.sales_products add constraint sales_products_delivery_duration_pair_chk
      check ((delivery_duration_min is null and delivery_duration_max is null) or (delivery_duration_min is not null and delivery_duration_max is not null and delivery_duration_min >= 0 and delivery_duration_max >= delivery_duration_min));
  end if;
  if not exists (select 1 from pg_constraint where conname='sales_products_delivery_duration_unit_chk' and conrelid='public.sales_products'::regclass) then
    alter table public.sales_products add constraint sales_products_delivery_duration_unit_chk check (delivery_duration_unit='business_days');
  end if;
  if not exists (select 1 from pg_constraint where conname='sales_products_timeline_impact_chk' and conrelid='public.sales_products'::regclass) then
    alter table public.sales_products add constraint sales_products_timeline_impact_chk check (timeline_impact in ('base','additive','parallel','assessment_required'));
  end if;
  if not exists (select 1 from pg_constraint where conname='quotation_items_duration_pair_chk' and conrelid='public.quotation_items'::regclass) then
    alter table public.quotation_items add constraint quotation_items_duration_pair_chk
      check ((duration_min_snapshot is null and duration_max_snapshot is null) or (duration_min_snapshot is not null and duration_max_snapshot is not null and duration_min_snapshot >= 0 and duration_max_snapshot >= duration_min_snapshot));
  end if;
  if not exists (select 1 from pg_constraint where conname='quotation_items_duration_unit_chk' and conrelid='public.quotation_items'::regclass) then
    alter table public.quotation_items add constraint quotation_items_duration_unit_chk check (duration_unit_snapshot='business_days');
  end if;
  if not exists (select 1 from pg_constraint where conname='quotation_items_timeline_impact_chk' and conrelid='public.quotation_items'::regclass) then
    alter table public.quotation_items add constraint quotation_items_timeline_impact_chk check (timeline_impact_snapshot in ('base','additive','parallel','assessment_required'));
  end if;
  if not exists (select 1 from pg_constraint where conname='quotations_duration_pair_chk' and conrelid='public.quotations'::regclass) then
    alter table public.quotations add constraint quotations_duration_pair_chk
      check ((estimated_duration_min is null and estimated_duration_max is null) or (estimated_duration_min is not null and estimated_duration_max is not null and estimated_duration_min >= 0 and estimated_duration_max >= estimated_duration_min));
  end if;
  if not exists (select 1 from pg_constraint where conname='quotations_duration_override_pair_chk' and conrelid='public.quotations'::regclass) then
    alter table public.quotations add constraint quotations_duration_override_pair_chk
      check ((duration_override_min is null and duration_override_max is null) or (duration_override_min is not null and duration_override_max is not null and duration_override_min > 0 and duration_override_max >= duration_override_min));
  end if;
  if not exists (select 1 from pg_constraint where conname='quotations_duration_unit_chk' and conrelid='public.quotations'::regclass) then
    alter table public.quotations add constraint quotations_duration_unit_chk check (duration_unit='business_days');
  end if;
  if not exists (select 1 from pg_constraint where conname='quotations_duration_source_chk' and conrelid='public.quotations'::regclass) then
    alter table public.quotations add constraint quotations_duration_source_chk check (duration_source in ('catalog','manual_override','unresolved'));
  end if;
end $$;

comment on column public.sales_products.delivery_duration_min is 'Admin-managed minimum delivery estimate for the catalog product in business days.';
comment on column public.sales_products.delivery_duration_max is 'Admin-managed maximum delivery estimate for the catalog product in business days.';
comment on column public.sales_products.timeline_impact is 'How this catalog product affects a quotation timeline: base, additive, parallel, or assessment_required.';
comment on column public.quotation_items.duration_min_snapshot is 'Immutable server-captured minimum delivery duration from the catalog product for this quotation item.';
comment on column public.quotations.duration_snapshot_text is 'Customer-facing estimated delivery wording snapshotted for this quotation.';
comment on column public.quotations.duration_override_min is 'Admin-confirmed quotation-specific timeline override for assessed/custom scope.';

-- Seed only structural behavior, never business duration numbers.
update public.sales_products
set timeline_impact = case
  when product_type='care_plan' then 'parallel'
  when price_mode='custom' or product_type='custom' then 'assessment_required'
  when product_type='package' then 'base'
  when product_type in ('addon','discovery') then 'additive'
  else 'assessment_required'
end,
delivery_duration_unit='business_days'
where timeline_impact='assessment_required'
   or timeline_impact is null;

create or replace function public.format_quotation_delivery_duration(p_min integer,p_max integer)
returns text
language plpgsql
immutable
set search_path to 'public','pg_temp'
as $function$
begin
  if p_min is null or p_max is null then return null; end if;
  if p_min=p_max then
    return 'Estimated delivery: '||p_min::text||' business days from confirmed project kickoff and receipt of required project materials.';
  end if;
  return 'Estimated delivery: '||p_min::text||'–'||p_max::text||' business days from confirmed project kickoff and receipt of required project materials.';
end;
$function$;

create or replace function public.refresh_quotation_delivery_timeline(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_q public.quotations%rowtype;
  v_item_count integer:=0;
  v_timed_count integer:=0;
  v_base_min integer:=0;
  v_base_max integer:=0;
  v_add_min integer:=0;
  v_add_max integer:=0;
  v_parallel_min integer:=0;
  v_parallel_max integer:=0;
  v_min integer;
  v_max integer;
  v_unresolved boolean:=false;
  v_text text;
  v_source text:='catalog';
begin
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;

  select count(*)::int into v_item_count from public.quotation_items where quotation_id=p_quotation_id;

  if v_q.duration_override_min is not null and v_q.duration_override_max is not null then
    v_min:=v_q.duration_override_min;
    v_max:=v_q.duration_override_max;
    v_source:='manual_override';
    v_text:=public.format_quotation_delivery_duration(v_min,v_max);
    if nullif(btrim(coalesce(v_q.duration_override_note,'')),'') is not null then
      v_text:=v_text||' '||btrim(v_q.duration_override_note);
    end if;
  else
    if v_item_count=0 then
      v_unresolved:=true;
    else
      select coalesce(bool_or(
        timeline_impact_snapshot='assessment_required'
        or (timeline_impact_snapshot in ('base','additive') and (duration_min_snapshot is null or duration_max_snapshot is null))
        or (timeline_impact_snapshot='parallel' and item_type<>'care_plan' and (duration_min_snapshot is null or duration_max_snapshot is null))
      ),false)
      into v_unresolved
      from public.quotation_items where quotation_id=p_quotation_id;
    end if;

    if not v_unresolved then
      select
        count(*) filter (where duration_min_snapshot is not null and duration_max_snapshot is not null and not (item_type='care_plan' and timeline_impact_snapshot='parallel'))::int,
        coalesce(max(duration_min_snapshot) filter (where timeline_impact_snapshot='base'),0)::int,
        coalesce(max(duration_max_snapshot) filter (where timeline_impact_snapshot='base'),0)::int,
        coalesce(sum(duration_min_snapshot*greatest(quantity,1)) filter (where timeline_impact_snapshot='additive'),0)::int,
        coalesce(sum(duration_max_snapshot*greatest(quantity,1)) filter (where timeline_impact_snapshot='additive'),0)::int,
        coalesce(max(duration_min_snapshot) filter (where timeline_impact_snapshot='parallel' and item_type<>'care_plan'),0)::int,
        coalesce(max(duration_max_snapshot) filter (where timeline_impact_snapshot='parallel' and item_type<>'care_plan'),0)::int
      into v_timed_count,v_base_min,v_base_max,v_add_min,v_add_max,v_parallel_min,v_parallel_max
      from public.quotation_items where quotation_id=p_quotation_id;

      if v_timed_count>0 then
        v_min:=greatest(v_base_min+v_add_min,v_parallel_min);
        v_max:=greatest(v_base_max+v_add_max,v_parallel_max);
        v_text:=public.format_quotation_delivery_duration(v_min,v_max);
      else
        v_min:=null; v_max:=null;
        v_text:='Ongoing care plan; it does not extend a project delivery timeline.';
      end if;
    else
      v_source:='unresolved';
      v_text:='Timeline confirmation required before customer delivery.';
    end if;
  end if;

  update public.quotations
  set estimated_duration_min=case when v_unresolved then null else v_min end,
      estimated_duration_max=case when v_unresolved then null else v_max end,
      duration_unit='business_days',
      duration_snapshot_text=v_text,
      duration_snapshotted_at=now(),
      duration_requires_assessment=v_unresolved,
      duration_source=case when v_unresolved then 'unresolved' else v_source end,
      updated_at=now()
  where id=p_quotation_id;

  return jsonb_build_object(
    'estimatedDurationMin',case when v_unresolved then null else v_min end,
    'estimatedDurationMax',case when v_unresolved then null else v_max end,
    'durationUnit','business_days',
    'durationSnapshotText',v_text,
    'requiresAssessment',v_unresolved,
    'source',case when v_unresolved then 'unresolved' else v_source end
  );
end;
$function$;

revoke all on function public.refresh_quotation_delivery_timeline(uuid) from public,anon,authenticated;

create or replace function public.admin_set_quotation_duration_override(
  p_quotation_id uuid,
  p_min integer default null,
  p_max integer default null,
  p_note text default null,
  p_clear boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_q public.quotations%rowtype;
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if v_q.sent_at is not null or v_q.first_viewed_at is not null or v_q.status in ('Sent','Accepted','Rejected','Expired') then
    raise exception 'Delivered quotation timeline is immutable.';
  end if;

  perform set_config('profox.quotation_atomic_rpc','1',true);
  if p_clear then
    update public.quotations set duration_override_min=null,duration_override_max=null,duration_override_note=null,duration_override_by=null,duration_override_at=null,updated_at=now() where id=p_quotation_id;
  else
    if p_min is null or p_max is null or p_min<=0 or p_max<p_min then raise exception 'Provide a valid minimum and maximum business-day estimate.'; end if;
    update public.quotations set duration_override_min=p_min,duration_override_max=p_max,duration_override_note=nullif(btrim(coalesce(p_note,'')),''),duration_override_by=auth.uid(),duration_override_at=now(),updated_at=now() where id=p_quotation_id;
  end if;
  v_result:=public.refresh_quotation_delivery_timeline(p_quotation_id);
  perform set_config('profox.quotation_atomic_rpc','',true);
  return v_result;
exception when others then
  perform set_config('profox.quotation_atomic_rpc','',true);
  raise;
end;
$function$;
revoke all on function public.admin_set_quotation_duration_override(uuid,integer,integer,text,boolean) from public,anon;
grant execute on function public.admin_set_quotation_duration_override(uuid,integer,integer,text,boolean) to authenticated;

create or replace function public.admin_upsert_sales_product(p_product jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
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
  v_duration_min integer := case when nullif(p_product->>'delivery_duration_min','') is null then null else (p_product->>'delivery_duration_min')::integer end;
  v_duration_max integer := case when nullif(p_product->>'delivery_duration_max','') is null then null else (p_product->>'delivery_duration_max')::integer end;
  v_timeline_impact text := coalesce(nullif(p_product->>'timeline_impact',''),case when v_product_type='care_plan' then 'parallel' when v_price_mode='custom' or v_product_type='custom' then 'assessment_required' when v_product_type='package' then 'base' when v_product_type in ('addon','discovery') then 'additive' else 'assessment_required' end);
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if v_code = '' or v_name = '' or v_category = '' then raise exception 'Product code, name and category are required'; end if;
  if v_product_type not in ('package','addon','care_plan','discovery','custom') then raise exception 'Invalid product type'; end if;
  if v_price_mode not in ('fixed','starting_at','custom') then raise exception 'Invalid price mode'; end if;
  if v_timeline_impact not in ('base','additive','parallel','assessment_required') then raise exception 'Invalid timeline impact'; end if;
  if (v_duration_min is null) <> (v_duration_max is null) or coalesce(v_duration_min,0)<0 or (v_duration_min is not null and v_duration_max<v_duration_min) then raise exception 'Delivery duration must contain a valid minimum and maximum business-day range'; end if;
  if jsonb_typeof(v_scope) <> 'array' then raise exception 'Scope must be an array'; end if;
  if jsonb_typeof(v_public_details) <> 'object' then raise exception 'Public details must be an object'; end if;
  if jsonb_typeof(v_client_expectations) <> 'object' then raise exception 'Client expectations must be an object'; end if;
  if exists (select 1 from jsonb_each(v_client_expectations) entry where entry.key not in ('clientResponsibilities','deliveryAssumptions','reviewAndApproval','handoverAndSupport') or jsonb_typeof(entry.value) <> 'array') then raise exception 'Client expectations contain an unsupported section or non-array value'; end if;
  if exists (select 1 from jsonb_each(v_client_expectations) entry cross join lateral jsonb_array_elements(entry.value) item where jsonb_typeof(item) <> 'string') then raise exception 'Each client expectation must be text'; end if;
  if v_payment_schedule is not null and jsonb_typeof(v_payment_schedule) <> 'array' then raise exception 'Payment schedule must be an array'; end if;
  if coalesce((p_product->>'base_price')::numeric,0) < 0 then raise exception 'Base price cannot be negative'; end if;

  if nullif(p_product->>'id','') is null then
    insert into public.sales_products (
      code,name,category,product_type,price_mode,base_price,currency,billing_period,short_description,full_description,scope,technology,manager_approval_required,active,sort_order,standard_payment_terms,payment_schedule,public_visible,public_details,client_expectations,
      delivery_duration_min,delivery_duration_max,delivery_duration_unit,timeline_impact,delivery_duration_note,updated_at
    ) values (
      v_code,v_name,v_category,v_product_type,v_price_mode,coalesce((p_product->>'base_price')::numeric,0),coalesce(nullif(p_product->>'currency',''),'USD'),nullif(p_product->>'billing_period',''),nullif(p_product->>'short_description',''),nullif(p_product->>'full_description',''),v_scope,nullif(p_product->>'technology',''),coalesce((p_product->>'manager_approval_required')::boolean,false),coalesce((p_product->>'active')::boolean,true),coalesce((p_product->>'sort_order')::integer,0),nullif(p_product->>'standard_payment_terms',''),v_payment_schedule,coalesce((p_product->>'public_visible')::boolean,false),v_public_details,v_client_expectations,
      v_duration_min,v_duration_max,'business_days',v_timeline_impact,nullif(btrim(coalesce(p_product->>'delivery_duration_note','')),''),timezone('utc',now())
    ) returning id into v_id;
  else
    v_id := (p_product->>'id')::uuid;
    update public.sales_products set
      code=v_code,name=v_name,category=v_category,product_type=v_product_type,price_mode=v_price_mode,base_price=coalesce((p_product->>'base_price')::numeric,0),currency=coalesce(nullif(p_product->>'currency',''),'USD'),billing_period=nullif(p_product->>'billing_period',''),short_description=nullif(p_product->>'short_description',''),full_description=nullif(p_product->>'full_description',''),scope=v_scope,technology=nullif(p_product->>'technology',''),manager_approval_required=coalesce((p_product->>'manager_approval_required')::boolean,false),active=coalesce((p_product->>'active')::boolean,true),sort_order=coalesce((p_product->>'sort_order')::integer,0),standard_payment_terms=nullif(p_product->>'standard_payment_terms',''),payment_schedule=v_payment_schedule,public_visible=coalesce((p_product->>'public_visible')::boolean,false),public_details=v_public_details,client_expectations=v_client_expectations,
      delivery_duration_min=v_duration_min,delivery_duration_max=v_duration_max,delivery_duration_unit='business_days',timeline_impact=v_timeline_impact,delivery_duration_note=nullif(btrim(coalesce(p_product->>'delivery_duration_note','')),''),updated_at=timezone('utc',now())
    where id=v_id;
    if not found then raise exception 'Sales product not found'; end if;
  end if;
  return v_id;
end;
$function$;

create or replace function public.create_quotation_atomic(p_quotation jsonb,p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_id uuid; v_salesperson uuid; v_item jsonb; v_product_id uuid; v_client_expectations jsonb;
  v_duration_min integer; v_duration_max integer; v_duration_unit text; v_timeline_impact text; v_duration_note text;
  v_is_admin boolean:=public.is_admin();
begin
  if not public.has_active_role(array['admin','sales']) then raise exception 'Unauthorized.'; end if;
  v_salesperson:=nullif(p_quotation->>'salesperson_id','')::uuid;
  if not v_is_admin and v_salesperson is distinct from auth.uid() then raise exception 'Sales representatives may create quotations only for themselves.'; end if;
  perform set_config('profox.quotation_atomic_rpc','1',true);
  insert into public.quotations(opportunity_id,salesperson_id,customer_name,contact_name,email,phone,country,currency,status,valid_until,payment_terms,scope_summary,exclusions,customer_notes,internal_notes,subtotal,total,created_by,approval_required,approval_route,approval_reason,approval_checked_at)
  values(nullif(p_quotation->>'opportunity_id','')::uuid,v_salesperson,coalesce(nullif(p_quotation->>'customer_name',''),'Customer'),nullif(p_quotation->>'contact_name',''),nullif(p_quotation->>'email',''),nullif(p_quotation->>'phone',''),nullif(p_quotation->>'country',''),coalesce(nullif(p_quotation->>'currency',''),'USD'),case when v_is_admin then coalesce(nullif(p_quotation->>'status',''),'Draft') else 'Draft' end,nullif(p_quotation->>'valid_until','')::date,nullif(p_quotation->>'payment_terms',''),nullif(p_quotation->>'scope_summary',''),nullif(p_quotation->>'exclusions',''),nullif(p_quotation->>'customer_notes',''),nullif(p_quotation->>'internal_notes',''),0,0,auth.uid(),null,null,null,null) returning id into v_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_product_id:=nullif(v_item->>'sales_product_id','')::uuid;
    v_client_expectations:='{}'::jsonb; v_duration_min:=null; v_duration_max:=null; v_duration_unit:='business_days'; v_timeline_impact:='assessment_required'; v_duration_note:=null;
    if v_product_id is not null then
      select coalesce(sp.client_expectations,'{}'::jsonb),sp.delivery_duration_min,sp.delivery_duration_max,sp.delivery_duration_unit,sp.timeline_impact,sp.delivery_duration_note
      into v_client_expectations,v_duration_min,v_duration_max,v_duration_unit,v_timeline_impact,v_duration_note from public.sales_products sp where sp.id=v_product_id;
      if not found then raise exception 'Catalog product not found.'; end if;
    end if;
    insert into public.quotation_items(quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,quantity,unit_price,line_total,item_type,sort_order,client_expectations_snapshot,duration_min_snapshot,duration_max_snapshot,duration_unit_snapshot,timeline_impact_snapshot,duration_note_snapshot)
    values(v_id,v_product_id,coalesce(v_item->>'product_code_snapshot','CUSTOM'),coalesce(v_item->>'product_name_snapshot','Custom Item'),nullif(v_item->>'description_snapshot',''),coalesce((v_item->>'quantity')::int,1),coalesce((v_item->>'unit_price')::numeric,0),0,coalesce(v_item->>'item_type','custom'),coalesce((v_item->>'sort_order')::int,0),v_client_expectations,v_duration_min,v_duration_max,v_duration_unit,v_timeline_impact,v_duration_note);
  end loop;
  perform public.refresh_quotation_delivery_timeline(v_id);
  perform set_config('profox.quotation_atomic_rpc','',true);
  return v_id;
exception when others then perform set_config('profox.quotation_atomic_rpc','',true); raise;
end;
$function$;

create or replace function public.update_quotation_atomic(p_quotation_id uuid,p_updates jsonb,p_items jsonb default null)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_q public.quotations%rowtype; v_item jsonb; v_product_id uuid; v_client_expectations jsonb;
  v_duration_min integer; v_duration_max integer; v_duration_unit text; v_timeline_impact text; v_duration_note text;
  v_requested_status text; v_requires_approval boolean; v_standard_terms text; v_is_admin boolean:=public.is_admin(); v_items_locked boolean;
begin
  select * into v_q from public.quotations where id=p_quotation_id for update; if not found then raise exception 'Quotation not found.'; end if;
  if not v_is_admin and (not public.has_active_role(array['sales']) or v_q.salesperson_id is distinct from auth.uid()) then raise exception 'Unauthorized.'; end if;
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
    perform set_config('profox.quotation_atomic_rpc','',true); return;
  end if;
  update public.quotations set customer_name=coalesce(nullif(p_updates->>'customer_name',''),customer_name),contact_name=case when p_updates?'contact_name' then nullif(p_updates->>'contact_name','') else contact_name end,email=case when p_updates?'email' then nullif(p_updates->>'email','') else email end,phone=case when p_updates?'phone' then nullif(p_updates->>'phone','') else phone end,country=case when p_updates?'country' then nullif(p_updates->>'country','') else country end,currency=coalesce(nullif(p_updates->>'currency',''),currency),status=case when v_is_admin then v_requested_status else 'Draft' end,valid_until=case when p_updates?'valid_until' then nullif(p_updates->>'valid_until','')::date else valid_until end,payment_terms=case when p_updates?'payment_terms' then nullif(p_updates->>'payment_terms','') else payment_terms end,scope_summary=case when p_updates?'scope_summary' then nullif(p_updates->>'scope_summary','') else scope_summary end,exclusions=case when p_updates?'exclusions' then nullif(p_updates->>'exclusions','') else exclusions end,customer_notes=case when p_updates?'customer_notes' then nullif(p_updates->>'customer_notes','') else customer_notes end,internal_notes=case when p_updates?'internal_notes' then nullif(p_updates->>'internal_notes','') else internal_notes end,updated_at=now() where id=p_quotation_id;
  if p_items is not null and not v_items_locked then
    delete from public.quotation_items where quotation_id=p_quotation_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
      v_product_id:=nullif(v_item->>'sales_product_id','')::uuid;
      v_client_expectations:='{}'::jsonb; v_duration_min:=null; v_duration_max:=null; v_duration_unit:='business_days'; v_timeline_impact:='assessment_required'; v_duration_note:=null;
      if v_product_id is not null then
        select coalesce(sp.client_expectations,'{}'::jsonb),sp.delivery_duration_min,sp.delivery_duration_max,sp.delivery_duration_unit,sp.timeline_impact,sp.delivery_duration_note
        into v_client_expectations,v_duration_min,v_duration_max,v_duration_unit,v_timeline_impact,v_duration_note from public.sales_products sp where sp.id=v_product_id;
        if not found then raise exception 'Catalog product not found.'; end if;
      end if;
      insert into public.quotation_items(quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,quantity,unit_price,line_total,item_type,sort_order,client_expectations_snapshot,duration_min_snapshot,duration_max_snapshot,duration_unit_snapshot,timeline_impact_snapshot,duration_note_snapshot)
      values(p_quotation_id,v_product_id,coalesce(v_item->>'product_code_snapshot','CUSTOM'),coalesce(v_item->>'product_name_snapshot','Custom Item'),nullif(v_item->>'description_snapshot',''),coalesce((v_item->>'quantity')::int,1),coalesce((v_item->>'unit_price')::numeric,0),0,coalesce(v_item->>'item_type','custom'),coalesce((v_item->>'sort_order')::int,0),v_client_expectations,v_duration_min,v_duration_max,v_duration_unit,v_timeline_impact,v_duration_note);
    end loop;
    -- Scope replacement invalidates a prior manual duration approval. Admin can reconfirm it immediately after save.
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
exception when others then perform set_config('profox.quotation_atomic_rpc','',true); raise;
end;
$function$;

create or replace function public.quotation_requires_manager_approval(p_quotation_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_item_count integer:=0; v_requires boolean:=false; v_primary_count integer:=0; v_primary_with_terms integer:=0; v_distinct_terms integer:=0; v_standard_terms text; v_quote_terms text; v_timeline_unresolved boolean:=true;
begin
  select count(*)::int into v_item_count from public.quotation_items where quotation_id=p_quotation_id;
  if v_item_count=0 then return true; end if;
  select duration_requires_assessment into v_timeline_unresolved from public.quotations where id=p_quotation_id;
  if coalesce(v_timeline_unresolved,true) then return true; end if;
  select coalesce(bool_or(qi.sales_product_id is null or p.id is null or coalesce(p.active,false)=false or coalesce(p.manager_approval_required,false)=true or p.price_mode='custom' or qi.item_type='custom'),true)
  into v_requires from public.quotation_items qi left join public.sales_products p on p.id=qi.sales_product_id where qi.quotation_id=p_quotation_id;
  if v_requires then return true; end if;
  select count(*) filter (where p.product_type in ('package','discovery','care_plan') and p.price_mode<>'custom'),count(*) filter (where p.product_type in ('package','discovery','care_plan') and p.price_mode<>'custom' and nullif(btrim(p.standard_payment_terms),'') is not null),count(distinct nullif(btrim(p.standard_payment_terms),'')) filter (where p.product_type in ('package','discovery','care_plan') and p.price_mode<>'custom')
  into v_primary_count,v_primary_with_terms,v_distinct_terms from public.quotation_items qi join public.sales_products p on p.id=qi.sales_product_id where qi.quotation_id=p_quotation_id and p.active=true;
  select nullif(btrim(q.payment_terms),'') into v_quote_terms from public.quotations q where q.id=p_quotation_id;
  if v_primary_count>0 then
    if v_primary_with_terms<>v_primary_count or v_distinct_terms<>1 then return true; end if;
    v_standard_terms:=public.quotation_standard_payment_terms(p_quotation_id); if v_standard_terms is null then return true; end if;
    if v_quote_terms is not null and lower(regexp_replace(v_quote_terms,'\s+','','g'))<>lower(regexp_replace(v_standard_terms,'\s+','','g')) then return true; end if;
  elsif v_quote_terms is not null then return true;
  end if;
  return false;
end;
$function$;

create or replace function public.snapshot_quotation_payment_schedule_before_send()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_res jsonb;
begin
  if new.status='Sent' and old.status is distinct from new.status then
    if coalesce(new.total,0)<=0 then raise exception 'Quotation total must be greater than zero before sending.'; end if;
    if coalesce(new.duration_requires_assessment,true) or nullif(btrim(coalesce(new.duration_snapshot_text,'')),'') is null then
      raise exception 'Confirm the estimated project delivery timeline before sending this quotation.';
    end if;
    if new.payment_schedule_snapshot is null then
      v_res:=public.resolve_quotation_payment_schedule(new.id);
      new.payment_schedule_snapshot:=v_res->'schedule'; new.payment_schedule_source_code:=v_res->>'sourceCode'; new.payment_schedule_snapshotted_at:=now();
      new.payment_terms:=coalesce(nullif(btrim(new.payment_terms),''),nullif(btrim(v_res->>'standardPaymentTerms'),''));
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.open_public_quotation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_hash text; v_quote public.quotations%rowtype; v_first_open boolean:=false; v_items jsonb:='[]'::jsonb;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Quotation link is invalid.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_quote from public.quotations where customer_view_token_hash=v_hash and customer_view_token_issued_at is not null and status in ('Sent','Accepted','Rejected','Expired') for update;
  if not found then raise exception 'Quotation link is invalid or no longer available.'; end if;
  v_first_open:=v_quote.first_viewed_at is null;
  perform set_config('profox.quotation_view_tracking_rpc','1',true);
  update public.quotations set first_viewed_at=coalesce(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1,updated_at=now() where id=v_quote.id returning * into v_quote;
  perform set_config('profox.quotation_view_tracking_rpc','',true);
  if v_first_open and v_quote.salesperson_id is not null then perform public.service_queue_staff_operational_notification(v_quote.salesperson_id,'quotation-opened:'||v_quote.id::text,'quotation_opened','Quotation','Quotation opened - '||v_quote.quotation_number,coalesce(nullif(v_quote.customer_name,''),'Customer')||' opened the quotation for the first time.','/admin/focus/quotation/'||v_quote.id::text,jsonb_build_object('quotationNumber',v_quote.quotation_number,'customerName',v_quote.customer_name,'currency',v_quote.currency,'total',v_quote.total,'firstViewedAt',v_quote.first_viewed_at),now()); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',qi.id,'productCode',qi.product_code_snapshot,'productName',qi.product_name_snapshot,'description',qi.description_snapshot,'quantity',qi.quantity,'unitPrice',qi.unit_price,'lineTotal',qi.line_total,'itemType',qi.item_type,'clientExpectations',coalesce(qi.client_expectations_snapshot,'{}'::jsonb),
    'durationMin',qi.duration_min_snapshot,'durationMax',qi.duration_max_snapshot,'durationUnit',qi.duration_unit_snapshot,'timelineImpact',qi.timeline_impact_snapshot,'durationNote',qi.duration_note_snapshot
  ) order by qi.sort_order,qi.created_at),'[]'::jsonb) into v_items from public.quotation_items qi where qi.quotation_id=v_quote.id;
  return jsonb_build_object(
    'id',v_quote.id,'quotationNumber',v_quote.quotation_number,'customerName',v_quote.customer_name,'contactName',v_quote.contact_name,'currency',v_quote.currency,'status',v_quote.status,'validUntil',v_quote.valid_until,'paymentTerms',v_quote.payment_terms,'scopeSummary',v_quote.scope_summary,'exclusions',v_quote.exclusions,'customerNotes',v_quote.customer_notes,'subtotal',v_quote.subtotal,'total',v_quote.total,'sentAt',v_quote.sent_at,'acceptedAt',v_quote.accepted_at,'firstViewedAt',v_quote.first_viewed_at,
    'estimatedDurationMin',v_quote.estimated_duration_min,'estimatedDurationMax',v_quote.estimated_duration_max,'durationUnit',v_quote.duration_unit,'durationSnapshotText',v_quote.duration_snapshot_text,'durationSource',v_quote.duration_source,'items',v_items
  );
end;
$function$;

create or replace function public.add_business_days(p_start date,p_days integer)
returns date
language plpgsql
immutable
set search_path to 'public','pg_temp'
as $function$
declare v_date date:=p_start; v_added integer:=0;
begin
  if p_start is null or p_days is null then return null; end if;
  if p_days<=0 then return p_start; end if;
  while v_added<p_days loop
    v_date:=v_date+1;
    if extract(isodow from v_date)<6 then v_added:=v_added+1; end if;
  end loop;
  return v_date;
end;
$function$;

create or replace function public.set_project_target_from_quotation_timeline()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_days integer; v_unresolved boolean;
begin
  if new.start_date is null or new.target_date is not null or new.quotation_id is null then return new; end if;
  select estimated_duration_max,duration_requires_assessment into v_days,v_unresolved from public.quotations where id=new.quotation_id;
  if coalesce(v_unresolved,true)=false and v_days is not null and v_days>0 then new.target_date:=public.add_business_days(new.start_date,v_days); end if;
  return new;
end;
$function$;

drop trigger if exists trg_project_target_from_quotation_timeline on public.projects;
create trigger trg_project_target_from_quotation_timeline
before insert or update of start_date,quotation_id on public.projects
for each row execute function public.set_project_target_from_quotation_timeline();

revoke all on function public.set_project_target_from_quotation_timeline() from public,anon,authenticated;

-- No quotation/project rows exist at rollout time; this only ensures any future draft rows created during deployment are recalculated safely.
update public.quotation_items qi
set duration_min_snapshot=sp.delivery_duration_min,
    duration_max_snapshot=sp.delivery_duration_max,
    duration_unit_snapshot=sp.delivery_duration_unit,
    timeline_impact_snapshot=sp.timeline_impact,
    duration_note_snapshot=sp.delivery_duration_note
from public.sales_products sp, public.quotations q
where qi.sales_product_id=sp.id and qi.quotation_id=q.id and q.status in ('Draft','Ready for Approval','Approved') and q.sent_at is null and q.first_viewed_at is null;

do $$ declare r record; begin
  for r in select id from public.quotations where status in ('Draft','Ready for Approval','Approved') and sent_at is null and first_viewed_at is null loop
    perform public.refresh_quotation_delivery_timeline(r.id);
  end loop;
end $$;

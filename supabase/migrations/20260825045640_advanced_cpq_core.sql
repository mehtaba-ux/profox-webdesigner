-- Advanced ProFox CPQ core: backward-compatible extensions only.

alter table public.quotations
  add column if not exists revision_number integer not null default 1,
  add column if not exists revision_root_id uuid null references public.quotations(id) on delete set null,
  add column if not exists previous_revision_id uuid null references public.quotations(id) on delete set null,
  add column if not exists superseded_by_id uuid null references public.quotations(id) on delete set null,
  add column if not exists quotation_template_key text,
  add column if not exists proposal_title text,
  add column if not exists executive_summary text,
  add column if not exists cover_message text,
  add column if not exists client_responsibilities text,
  add column if not exists delivery_assumptions text,
  add column if not exists review_process text,
  add column if not exists handover_support text,
  add column if not exists terms_and_conditions text,
  add column if not exists acceptance_method text not null default 'click_accept',
  add column if not exists quote_discount_type text not null default 'none',
  add column if not exists quote_discount_value numeric(12,2) not null default 0,
  add column if not exists line_discount_total numeric(12,2) not null default 0,
  add column if not exists quote_discount_total numeric(12,2) not null default 0,
  add column if not exists optional_total numeric(12,2) not null default 0,
  add column if not exists tax_rate numeric(7,4) not null default 0,
  add column if not exists tax_total numeric(12,2) not null default 0,
  add column if not exists send_cc text[] not null default '{}'::text[],
  add column if not exists send_subject text,
  add column if not exists send_message text,
  add column if not exists change_requested_at timestamptz,
  add column if not exists change_request_note text,
  add column if not exists commercial_snapshot jsonb,
  add column if not exists commercial_snapshotted_at timestamptz;

alter table public.quotation_items
  add column if not exists line_type text not null default 'product',
  add column if not exists discount_type text not null default 'none',
  add column if not exists discount_value numeric(12,2) not null default 0,
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists optional_for_client boolean not null default false,
  add column if not exists section_key text,
  add column if not exists configuration_snapshot jsonb not null default '{}'::jsonb;

create index if not exists idx_quotations_revision_root_id on public.quotations(revision_root_id);
create index if not exists idx_quotations_previous_revision_id on public.quotations(previous_revision_id);
create index if not exists idx_quotations_superseded_by_id on public.quotations(superseded_by_id);
create index if not exists idx_quotation_items_optional_for_client on public.quotation_items(quotation_id, optional_for_client, sort_order);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotations_revision_number_check' AND conrelid='public.quotations'::regclass) THEN
    ALTER TABLE public.quotations ADD CONSTRAINT quotations_revision_number_check CHECK (revision_number > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotations_discount_type_check' AND conrelid='public.quotations'::regclass) THEN
    ALTER TABLE public.quotations ADD CONSTRAINT quotations_discount_type_check CHECK (quote_discount_type in ('none','percent','fixed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotations_discount_value_check' AND conrelid='public.quotations'::regclass) THEN
    ALTER TABLE public.quotations ADD CONSTRAINT quotations_discount_value_check CHECK (quote_discount_value >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotations_tax_rate_check' AND conrelid='public.quotations'::regclass) THEN
    ALTER TABLE public.quotations ADD CONSTRAINT quotations_tax_rate_check CHECK (tax_rate >= 0 and tax_rate <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotation_items_line_type_check' AND conrelid='public.quotation_items'::regclass) THEN
    ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_line_type_check CHECK (line_type in ('product','section','note','custom'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotation_items_discount_type_check' AND conrelid='public.quotation_items'::regclass) THEN
    ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_discount_type_check CHECK (discount_type in ('none','percent','fixed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quotation_items_discount_value_check' AND conrelid='public.quotation_items'::regclass) THEN
    ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_discount_value_check CHECK (discount_value >= 0);
  END IF;
END $$;

insert into public.system_configuration(config_key,config_value,description)
values(
  'quotation_cpq_settings',
  jsonb_build_object(
    'defaultValidityDays',30,
    'autoApprovalDiscountPercent',5,
    'maxSalesDiscountPercent',20,
    'allowSalesCustomLines',true,
    'taxLabel','Tax',
    'taxRate',0,
    'businessName','ProFox Web Designer',
    'registeredName','ProFox Digital Solution',
    'websiteUrl','https://www.profoxwebdesigner.com',
    'contactEmail','contact@profoxwebdesigner.com',
    'brandLine','From site to system.',
    'defaultProposalTitle','Digital Project Proposal',
    'defaultCoverMessage','Thank you for the opportunity to support your business. This proposal summarizes the recommended solution, investment, delivery timeline and payment plan.',
    'standardTerms','',
    'customPaymentSchedule','[]'::jsonb,
    'optionalProductRelationships','{}'::jsonb,
    'templates',jsonb_build_array(
      jsonb_build_object('key','website_project','name','Website Project','proposalTitle','Website Project Proposal','defaultProductCodes','[]'::jsonb,'optionalProductCodes','[]'::jsonb),
      jsonb_build_object('key','ecommerce_project','name','E-commerce Project','proposalTitle','E-commerce Project Proposal','defaultProductCodes','[]'::jsonb,'optionalProductCodes','[]'::jsonb),
      jsonb_build_object('key','web_application','name','Web Application','proposalTitle','Web Application Proposal','defaultProductCodes','[]'::jsonb,'optionalProductCodes','[]'::jsonb),
      jsonb_build_object('key','automation_project','name','Automation Project','proposalTitle','Business Automation Proposal','defaultProductCodes','[]'::jsonb,'optionalProductCodes','[]'::jsonb),
      jsonb_build_object('key','custom_proposal','name','Custom Proposal','proposalTitle','Custom Project Proposal','defaultProductCodes','[]'::jsonb,'optionalProductCodes','[]'::jsonb)
    )
  ),
  'Admin-configurable professional quotation/CPQ policy, templates and branding. No secrets are stored here.'
)
on conflict (config_key) do nothing;

create or replace function public.quotation_cpq_settings_safe()
returns jsonb
language sql
stable
security definer
set search_path='public','pg_temp'
as $$
  select coalesce((select config_value from public.system_configuration where config_key='quotation_cpq_settings'),'{}'::jsonb);
$$;

revoke all on function public.quotation_cpq_settings_safe() from public, anon;
grant execute on function public.quotation_cpq_settings_safe() to authenticated, service_role, postgres;

create or replace function public.get_quotation_cpq_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
begin
  if not public.is_active_staff() and not public.is_admin() then raise exception 'Unauthorized.'; end if;
  return public.quotation_cpq_settings_safe();
end;
$$;
revoke all on function public.get_quotation_cpq_settings() from public, anon;
grant execute on function public.get_quotation_cpq_settings() to authenticated, service_role, postgres;

create or replace function public.admin_save_quotation_cpq_settings(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_default_days integer;
  v_auto numeric;
  v_max numeric;
  v_tax numeric;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_config is null or jsonb_typeof(p_config)<>'object' then raise exception 'CPQ settings must be a JSON object.'; end if;
  v_default_days:=coalesce((p_config->>'defaultValidityDays')::int,30);
  v_auto:=coalesce((p_config->>'autoApprovalDiscountPercent')::numeric,5);
  v_max:=coalesce((p_config->>'maxSalesDiscountPercent')::numeric,20);
  v_tax:=coalesce((p_config->>'taxRate')::numeric,0);
  if v_default_days<1 or v_default_days>365 then raise exception 'Default quotation validity must be between 1 and 365 days.'; end if;
  if v_auto<0 or v_auto>100 or v_max<0 or v_max>100 or v_auto>v_max then raise exception 'Discount thresholds are invalid.'; end if;
  if v_tax<0 or v_tax>100 then raise exception 'Tax rate must be between 0 and 100.'; end if;
  if p_config?'templates' and jsonb_typeof(p_config->'templates')<>'array' then raise exception 'Quotation templates must be an array.'; end if;
  if p_config?'customPaymentSchedule' and jsonb_typeof(p_config->'customPaymentSchedule')<>'array' then raise exception 'Custom payment schedule must be an array.'; end if;
  if p_config?'optionalProductRelationships' and jsonb_typeof(p_config->'optionalProductRelationships')<>'object' then raise exception 'Optional-product relationships must be an object.'; end if;
  insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  values('quotation_cpq_settings',p_config,'Admin-configurable professional quotation/CPQ policy, templates and branding. No secrets are stored here.',auth.uid(),now())
  on conflict(config_key) do update set config_value=excluded.config_value,description=excluded.description,updated_by=excluded.updated_by,updated_at=now();
  return p_config;
end;
$$;
revoke all on function public.admin_save_quotation_cpq_settings(jsonb) from public, anon;
grant execute on function public.admin_save_quotation_cpq_settings(jsonb) to authenticated, service_role, postgres;

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
    select * into v_product from public.sales_products where id=new.sales_product_id and active=true;
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

create or replace function public.recalculate_quotation_totals()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_quotation_id uuid:=coalesce(new.quotation_id,old.quotation_id);
  v_subtotal numeric:=0;
  v_line_discounts numeric:=0;
  v_net_lines numeric:=0;
  v_optional numeric:=0;
  v_qdiscount numeric:=0;
  v_q public.quotations%rowtype;
  v_tax numeric:=0;
begin
  if v_quotation_id is null then return coalesce(new,old); end if;
  select * into v_q from public.quotations where id=v_quotation_id;
  if not found then return coalesce(new,old); end if;

  select
    coalesce(round(sum(quantity*unit_price) filter(where line_type in ('product','custom') and optional_for_client=false)::numeric,2),0),
    coalesce(round(sum(discount_amount) filter(where line_type in ('product','custom') and optional_for_client=false)::numeric,2),0),
    coalesce(round(sum(line_total) filter(where line_type in ('product','custom') and optional_for_client=false)::numeric,2),0),
    coalesce(round(sum(line_total) filter(where line_type in ('product','custom') and optional_for_client=true)::numeric,2),0)
  into v_subtotal,v_line_discounts,v_net_lines,v_optional
  from public.quotation_items where quotation_id=v_quotation_id;

  if v_q.quote_discount_type='percent' then
    v_qdiscount:=round((v_net_lines*least(greatest(v_q.quote_discount_value,0),100)/100.0)::numeric,2);
  elsif v_q.quote_discount_type='fixed' then
    v_qdiscount:=least(round(v_q.quote_discount_value::numeric,2),v_net_lines);
  else
    v_qdiscount:=0;
  end if;
  v_tax:=round((greatest(v_net_lines-v_qdiscount,0)*coalesce(v_q.tax_rate,0)/100.0)::numeric,2);

  update public.quotations set
    subtotal=v_subtotal,
    line_discount_total=v_line_discounts,
    quote_discount_total=v_qdiscount,
    optional_total=v_optional,
    tax_total=v_tax,
    total=round((greatest(v_net_lines-v_qdiscount,0)+v_tax)::numeric,2),
    updated_at=now()
  where id=v_quotation_id;
  return coalesce(new,old);
end;
$$;

create or replace function public.assert_quotation_cpq_discount_permissions(p_quotation_id uuid)
returns void
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_q public.quotations%rowtype;
  v_cfg jsonb:=public.quotation_cpq_settings_safe();
  v_max numeric:=coalesce((v_cfg->>'maxSalesDiscountPercent')::numeric,20);
  v_base numeric;
  v_effective numeric:=0;
begin
  if public.is_admin() then return; end if;
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found.'; end if;
  select coalesce(sum(line_total) filter(where line_type in ('product','custom') and optional_for_client=false),0) into v_base from public.quotation_items where quotation_id=p_quotation_id;
  if v_q.quote_discount_type='percent' then v_effective:=v_q.quote_discount_value;
  elsif v_q.quote_discount_type='fixed' and v_base>0 then v_effective:=v_q.quote_discount_value/v_base*100;
  end if;
  if v_effective>v_max then raise exception 'Quotation-level discount exceeds the configured Sales maximum.'; end if;
end;
$$;
revoke all on function public.assert_quotation_cpq_discount_permissions(uuid) from public, anon, authenticated, service_role;
grant execute on function public.assert_quotation_cpq_discount_permissions(uuid) to postgres;

create or replace function public.refresh_quotation_delivery_timeline(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_q public.quotations%rowtype;
  v_item_count integer:=0; v_timed_count integer:=0;
  v_base_min integer:=0; v_base_max integer:=0; v_add_min integer:=0; v_add_max integer:=0; v_parallel_min integer:=0; v_parallel_max integer:=0;
  v_min integer; v_max integer; v_unresolved boolean:=false; v_text text; v_source text:='catalog';
begin
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  select count(*)::int into v_item_count from public.quotation_items where quotation_id=p_quotation_id and line_type in ('product','custom') and optional_for_client=false;
  if v_q.duration_override_min is not null and v_q.duration_override_max is not null then
    v_min:=v_q.duration_override_min; v_max:=v_q.duration_override_max; v_source:='manual_override';
    v_text:=public.format_quotation_delivery_duration(v_min,v_max);
    if nullif(btrim(coalesce(v_q.duration_override_note,'')),'') is not null then v_text:=v_text||' '||btrim(v_q.duration_override_note); end if;
  else
    if v_item_count=0 then v_unresolved:=true;
    else
      select coalesce(bool_or(
        timeline_impact_snapshot='assessment_required'
        or (timeline_impact_snapshot in ('base','additive') and (duration_min_snapshot is null or duration_max_snapshot is null))
        or (timeline_impact_snapshot='parallel' and item_type<>'care_plan' and (duration_min_snapshot is null or duration_max_snapshot is null))
      ),false) into v_unresolved
      from public.quotation_items where quotation_id=p_quotation_id and line_type in ('product','custom') and optional_for_client=false;
    end if;
    if not v_unresolved then
      select
        count(*) filter(where duration_min_snapshot is not null and duration_max_snapshot is not null and not(item_type='care_plan' and timeline_impact_snapshot='parallel'))::int,
        coalesce(max(duration_min_snapshot) filter(where timeline_impact_snapshot='base'),0)::int,
        coalesce(max(duration_max_snapshot) filter(where timeline_impact_snapshot='base'),0)::int,
        coalesce(sum(duration_min_snapshot*greatest(quantity,1)) filter(where timeline_impact_snapshot='additive'),0)::int,
        coalesce(sum(duration_max_snapshot*greatest(quantity,1)) filter(where timeline_impact_snapshot='additive'),0)::int,
        coalesce(max(duration_min_snapshot) filter(where timeline_impact_snapshot='parallel' and item_type<>'care_plan'),0)::int,
        coalesce(max(duration_max_snapshot) filter(where timeline_impact_snapshot='parallel' and item_type<>'care_plan'),0)::int
      into v_timed_count,v_base_min,v_base_max,v_add_min,v_add_max,v_parallel_min,v_parallel_max
      from public.quotation_items where quotation_id=p_quotation_id and line_type in ('product','custom') and optional_for_client=false;
      if v_timed_count>0 then
        v_min:=greatest(v_base_min+v_add_min,v_parallel_min); v_max:=greatest(v_base_max+v_add_max,v_parallel_max); v_text:=public.format_quotation_delivery_duration(v_min,v_max);
      else
        v_min:=null; v_max:=null; v_text:='Ongoing care plan; it does not extend a project delivery timeline.';
      end if;
    else
      v_source:='unresolved'; v_text:='Timeline confirmation required before customer delivery.';
    end if;
  end if;
  update public.quotations set estimated_duration_min=case when v_unresolved then null else v_min end,estimated_duration_max=case when v_unresolved then null else v_max end,duration_unit='business_days',duration_snapshot_text=v_text,duration_snapshotted_at=now(),duration_requires_assessment=v_unresolved,duration_source=case when v_unresolved then 'unresolved' else v_source end,updated_at=now() where id=p_quotation_id;
  return jsonb_build_object('estimatedDurationMin',case when v_unresolved then null else v_min end,'estimatedDurationMax',case when v_unresolved then null else v_max end,'durationUnit','business_days','durationSnapshotText',v_text,'requiresAssessment',v_unresolved,'source',case when v_unresolved then 'unresolved' else v_source end);
end;
$$;

create or replace function public.resolve_quotation_payment_schedule(p_quotation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare
  v_count int; v_product record; v_schedule jsonb; v_total numeric; v_first_type text; v_cfg jsonb:=public.quotation_cpq_settings_safe(); v_custom_count int;
begin
  select count(*) into v_count
  from public.quotation_items qi join public.sales_products sp on sp.id=qi.sales_product_id
  where qi.quotation_id=p_quotation_id and qi.optional_for_client=false and qi.line_type='product' and sp.product_type in ('package','discovery','custom');
  if v_count>1 then raise exception 'Quotation must contain exactly one committed primary package or custom/discovery offer before payment can be configured.'; end if;
  if v_count=1 then
    select qi.product_code_snapshot,qi.product_name_snapshot,sp.payment_schedule,sp.standard_payment_terms into v_product
    from public.quotation_items qi join public.sales_products sp on sp.id=qi.sales_product_id
    where qi.quotation_id=p_quotation_id and qi.optional_for_client=false and qi.line_type='product' and sp.product_type in ('package','discovery','custom')
    order by qi.sort_order,qi.created_at limit 1;
    v_schedule:=v_product.payment_schedule;
  else
    select count(*) into v_custom_count from public.quotation_items where quotation_id=p_quotation_id and optional_for_client=false and line_type='custom';
    if v_custom_count=0 then raise exception 'Quotation must contain one committed primary package or custom offer before payment can be configured.'; end if;
    v_schedule:=coalesce(v_cfg->'customPaymentSchedule','[]'::jsonb);
    v_product.product_code_snapshot:='CUSTOM'; v_product.product_name_snapshot:='Custom Proposal'; v_product.standard_payment_terms:=nullif(btrim(coalesce(v_cfg->>'standardTerms','')),'');
  end if;
  if v_schedule is null or jsonb_typeof(v_schedule)<>'array' or jsonb_array_length(v_schedule)=0 then raise exception 'The selected offer does not have an approved payment schedule. Configure it before sending the quotation.'; end if;
  select coalesce(sum((x->>'percentage')::numeric),0) into v_total from jsonb_array_elements(v_schedule) x;
  if round(v_total,4)<>100 then raise exception 'The approved payment schedule must total 100 percent.'; end if;
  select x->>'paymentType' into v_first_type from jsonb_array_elements(v_schedule) x order by (x->>'milestoneNumber')::int limit 1;
  if v_first_type not in ('Advance','Full Payment') then raise exception 'The first approved payment milestone must be Advance or Full Payment so the verified sale can enter delivery.'; end if;
  return jsonb_build_object('sourceCode',v_product.product_code_snapshot,'sourceName',v_product.product_name_snapshot,'schedule',v_schedule,'standardPaymentTerms',v_product.standard_payment_terms);
end;
$$;

create or replace function public.quotation_cpq_approval_reasons(p_quotation_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare
  v_q public.quotations%rowtype;
  v_cfg jsonb:=public.quotation_cpq_settings_safe();
  v_auto numeric:=coalesce((v_cfg->>'autoApprovalDiscountPercent')::numeric,5);
  v_tax numeric:=coalesce((v_cfg->>'taxRate')::numeric,0);
  v_reasons text[]:='{}'::text[];
  v_standard text; v_effective numeric; v_base numeric;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then return array['Quotation not found.']; end if;
  if not exists(select 1 from public.quotation_items where quotation_id=p_quotation_id and optional_for_client=false and line_type in ('product','custom')) then v_reasons:=array_append(v_reasons,'At least one committed product or service is required.'); end if;
  if coalesce(v_q.duration_requires_assessment,true) then v_reasons:=array_append(v_reasons,'Project delivery timeline requires confirmation.'); end if;
  if exists(select 1 from public.quotation_items qi left join public.sales_products sp on sp.id=qi.sales_product_id where qi.quotation_id=p_quotation_id and qi.line_type in ('product','custom') and (qi.sales_product_id is null or sp.id is null or coalesce(sp.active,false)=false or coalesce(sp.manager_approval_required,false)=true or sp.price_mode='custom')) then v_reasons:=array_append(v_reasons,'Custom, inactive, or manager-controlled catalog scope requires review.'); end if;
  if exists(select 1 from public.quotation_items qi join public.sales_products sp on sp.id=qi.sales_product_id where qi.quotation_id=p_quotation_id and qi.line_type='product' and ((sp.price_mode='fixed' and qi.unit_price<>sp.base_price) or (sp.price_mode='starting_at' and qi.unit_price<sp.base_price))) then v_reasons:=array_append(v_reasons,'Protected catalog pricing differs from the current approved price.'); end if;
  if exists(select 1 from public.quotation_items qi where qi.quotation_id=p_quotation_id and qi.line_type in ('product','custom') and case when qi.discount_type='percent' then qi.discount_value when qi.discount_type='fixed' and qi.quantity*qi.unit_price>0 then qi.discount_value/(qi.quantity*qi.unit_price)*100 else 0 end > v_auto) then v_reasons:=array_append(v_reasons,'A line discount exceeds the automatic approval threshold.'); end if;
  select coalesce(sum(line_total) filter(where optional_for_client=false and line_type in ('product','custom')),0) into v_base from public.quotation_items where quotation_id=p_quotation_id;
  v_effective:=case when v_q.quote_discount_type='percent' then v_q.quote_discount_value when v_q.quote_discount_type='fixed' and v_base>0 then v_q.quote_discount_value/v_base*100 else 0 end;
  if v_effective>v_auto then v_reasons:=array_append(v_reasons,'The quotation-level discount exceeds the automatic approval threshold.'); end if;
  if abs(coalesce(v_q.tax_rate,0)-v_tax)>0.0001 then v_reasons:=array_append(v_reasons,'Tax or fee configuration differs from the current Admin policy.'); end if;
  begin
    v_standard:=public.quotation_standard_payment_terms(p_quotation_id);
    if nullif(btrim(coalesce(v_q.payment_terms,'')),'') is not null and (v_standard is null or lower(regexp_replace(btrim(v_q.payment_terms),'\s+','','g'))<>lower(regexp_replace(btrim(v_standard),'\s+','','g'))) then v_reasons:=array_append(v_reasons,'Payment terms differ from the approved catalog terms.'); end if;
    perform public.resolve_quotation_payment_schedule(p_quotation_id);
  exception when others then
    v_reasons:=array_append(v_reasons,'Payment schedule requires review: '||sqlerrm);
  end;
  return v_reasons;
end;
$$;
revoke all on function public.quotation_cpq_approval_reasons(uuid) from public, anon;
grant execute on function public.quotation_cpq_approval_reasons(uuid) to authenticated, service_role, postgres;

create or replace function public.quotation_requires_manager_approval(p_quotation_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public','pg_temp'
as $$
  select cardinality(public.quotation_cpq_approval_reasons(p_quotation_id))>0;
$$;

create or replace function public.quotation_standard_payment_terms(p_quotation_id uuid)
returns text
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare v_primary_count integer:=0; v_distinct_terms integer:=0; v_terms text;
begin
  select count(*),count(distinct nullif(btrim(p.standard_payment_terms),'')),min(nullif(btrim(p.standard_payment_terms),''))
  into v_primary_count,v_distinct_terms,v_terms
  from public.quotation_items qi join public.sales_products p on p.id=qi.sales_product_id
  where qi.quotation_id=p_quotation_id and qi.optional_for_client=false and qi.line_type='product' and p.active=true and p.product_type in ('package','discovery','custom') and p.price_mode<>'custom';
  if v_primary_count=0 or v_distinct_terms<>1 then return null; end if;
  return v_terms;
end;
$$;

create or replace function public.create_quotation_atomic(p_quotation jsonb,p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_id uuid; v_salesperson uuid; v_item jsonb; v_product_id uuid; v_client_expectations jsonb;
  v_duration_min integer; v_duration_max integer; v_duration_unit text; v_timeline_impact text; v_duration_note text;
  v_is_admin boolean:=public.is_admin(); v_cfg jsonb:=public.quotation_cpq_settings_safe(); v_tax numeric;
begin
  if not public.has_active_role(array['admin','sales']) then raise exception 'Unauthorized.'; end if;
  v_salesperson:=nullif(p_quotation->>'salesperson_id','')::uuid;
  if not v_is_admin and v_salesperson is distinct from auth.uid() then raise exception 'Sales representatives may create quotations only for themselves.'; end if;
  v_tax:=case when v_is_admin and p_quotation?'tax_rate' then coalesce((p_quotation->>'tax_rate')::numeric,0) else coalesce((v_cfg->>'taxRate')::numeric,0) end;
  perform set_config('profox.quotation_atomic_rpc','1',true);
  insert into public.quotations(
    opportunity_id,salesperson_id,customer_name,contact_name,email,phone,country,currency,status,valid_until,payment_terms,scope_summary,exclusions,customer_notes,internal_notes,subtotal,total,created_by,approval_required,approval_route,approval_reason,approval_checked_at,
    quotation_template_key,proposal_title,executive_summary,cover_message,client_responsibilities,delivery_assumptions,review_process,handover_support,terms_and_conditions,acceptance_method,quote_discount_type,quote_discount_value,tax_rate
  ) values(
    nullif(p_quotation->>'opportunity_id','')::uuid,v_salesperson,coalesce(nullif(p_quotation->>'customer_name',''),'Customer'),nullif(p_quotation->>'contact_name',''),nullif(p_quotation->>'email',''),nullif(p_quotation->>'phone',''),nullif(p_quotation->>'country',''),coalesce(nullif(p_quotation->>'currency',''),'USD'),case when v_is_admin then coalesce(nullif(p_quotation->>'status',''),'Draft') else 'Draft' end,nullif(p_quotation->>'valid_until','')::date,nullif(p_quotation->>'payment_terms',''),nullif(p_quotation->>'scope_summary',''),nullif(p_quotation->>'exclusions',''),nullif(p_quotation->>'customer_notes',''),nullif(p_quotation->>'internal_notes',''),0,0,auth.uid(),null,null,null,null,
    nullif(p_quotation->>'quotation_template_key',''),nullif(p_quotation->>'proposal_title',''),nullif(p_quotation->>'executive_summary',''),nullif(p_quotation->>'cover_message',''),nullif(p_quotation->>'client_responsibilities',''),nullif(p_quotation->>'delivery_assumptions',''),nullif(p_quotation->>'review_process',''),nullif(p_quotation->>'handover_support',''),nullif(p_quotation->>'terms_and_conditions',''),coalesce(nullif(p_quotation->>'acceptance_method',''),'click_accept'),coalesce(nullif(p_quotation->>'quote_discount_type',''),'none'),coalesce((p_quotation->>'quote_discount_value')::numeric,0),v_tax
  ) returning id into v_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_product_id:=nullif(v_item->>'sales_product_id','')::uuid;
    v_client_expectations:='{}'::jsonb; v_duration_min:=null; v_duration_max:=null; v_duration_unit:='business_days'; v_timeline_impact:='assessment_required'; v_duration_note:=null;
    if v_product_id is not null then
      select coalesce(sp.client_expectations,'{}'::jsonb),sp.delivery_duration_min,sp.delivery_duration_max,sp.delivery_duration_unit,sp.timeline_impact,sp.delivery_duration_note into v_client_expectations,v_duration_min,v_duration_max,v_duration_unit,v_timeline_impact,v_duration_note from public.sales_products sp where sp.id=v_product_id;
      if not found then raise exception 'Catalog product not found.'; end if;
    end if;
    insert into public.quotation_items(quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,quantity,unit_price,line_total,item_type,sort_order,client_expectations_snapshot,duration_min_snapshot,duration_max_snapshot,duration_unit_snapshot,timeline_impact_snapshot,duration_note_snapshot,line_type,discount_type,discount_value,optional_for_client,section_key,configuration_snapshot)
    values(v_id,v_product_id,coalesce(v_item->>'product_code_snapshot','CUSTOM'),coalesce(v_item->>'product_name_snapshot','Custom Item'),nullif(v_item->>'description_snapshot',''),coalesce((v_item->>'quantity')::int,1),coalesce((v_item->>'unit_price')::numeric,0),0,coalesce(v_item->>'item_type','custom'),coalesce((v_item->>'sort_order')::int,0),v_client_expectations,v_duration_min,v_duration_max,v_duration_unit,v_timeline_impact,v_duration_note,coalesce(nullif(v_item->>'line_type',''),'product'),coalesce(nullif(v_item->>'discount_type',''),'none'),coalesce((v_item->>'discount_value')::numeric,0),coalesce((v_item->>'optional_for_client')::boolean,false),nullif(v_item->>'section_key',''),coalesce(v_item->'configuration_snapshot','{}'::jsonb));
  end loop;
  perform public.refresh_quotation_delivery_timeline(v_id);
  perform public.assert_quotation_cpq_discount_permissions(v_id);
  perform set_config('profox.quotation_atomic_rpc','',true);
  return v_id;
exception when others then perform set_config('profox.quotation_atomic_rpc','',true); raise;
end;
$$;

create or replace function public.update_quotation_atomic(p_quotation_id uuid,p_updates jsonb,p_items jsonb default null::jsonb)
returns void
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_q public.quotations%rowtype; v_item jsonb; v_product_id uuid; v_client_expectations jsonb;
  v_duration_min integer; v_duration_max integer; v_duration_unit text; v_timeline_impact text; v_duration_note text;
  v_requested_status text; v_requires_approval boolean; v_standard_terms text; v_is_admin boolean:=public.is_admin(); v_items_locked boolean; v_cfg jsonb:=public.quotation_cpq_settings_safe(); v_reasons text[];
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
    perform set_config('profox.quotation_atomic_rpc','',true); return;
  end if;
  update public.quotations set
    opportunity_id=case when p_updates?'opportunity_id' then nullif(p_updates->>'opportunity_id','')::uuid else opportunity_id end,
    customer_name=coalesce(nullif(p_updates->>'customer_name',''),customer_name),contact_name=case when p_updates?'contact_name' then nullif(p_updates->>'contact_name','') else contact_name end,email=case when p_updates?'email' then nullif(p_updates->>'email','') else email end,phone=case when p_updates?'phone' then nullif(p_updates->>'phone','') else phone end,country=case when p_updates?'country' then nullif(p_updates->>'country','') else country end,currency=coalesce(nullif(p_updates->>'currency',''),currency),status=case when v_is_admin then v_requested_status else 'Draft' end,valid_until=case when p_updates?'valid_until' then nullif(p_updates->>'valid_until','')::date else valid_until end,payment_terms=case when p_updates?'payment_terms' then nullif(p_updates->>'payment_terms','') else payment_terms end,scope_summary=case when p_updates?'scope_summary' then nullif(p_updates->>'scope_summary','') else scope_summary end,exclusions=case when p_updates?'exclusions' then nullif(p_updates->>'exclusions','') else exclusions end,customer_notes=case when p_updates?'customer_notes' then nullif(p_updates->>'customer_notes','') else customer_notes end,internal_notes=case when p_updates?'internal_notes' then nullif(p_updates->>'internal_notes','') else internal_notes end,
    quotation_template_key=case when p_updates?'quotation_template_key' then nullif(p_updates->>'quotation_template_key','') else quotation_template_key end,proposal_title=case when p_updates?'proposal_title' then nullif(p_updates->>'proposal_title','') else proposal_title end,executive_summary=case when p_updates?'executive_summary' then nullif(p_updates->>'executive_summary','') else executive_summary end,cover_message=case when p_updates?'cover_message' then nullif(p_updates->>'cover_message','') else cover_message end,client_responsibilities=case when p_updates?'client_responsibilities' then nullif(p_updates->>'client_responsibilities','') else client_responsibilities end,delivery_assumptions=case when p_updates?'delivery_assumptions' then nullif(p_updates->>'delivery_assumptions','') else delivery_assumptions end,review_process=case when p_updates?'review_process' then nullif(p_updates->>'review_process','') else review_process end,handover_support=case when p_updates?'handover_support' then nullif(p_updates->>'handover_support','') else handover_support end,terms_and_conditions=case when p_updates?'terms_and_conditions' then nullif(p_updates->>'terms_and_conditions','') else terms_and_conditions end,acceptance_method=case when p_updates?'acceptance_method' then coalesce(nullif(p_updates->>'acceptance_method',''),'click_accept') else acceptance_method end,quote_discount_type=case when p_updates?'quote_discount_type' then coalesce(nullif(p_updates->>'quote_discount_type',''),'none') else quote_discount_type end,quote_discount_value=case when p_updates?'quote_discount_value' then coalesce((p_updates->>'quote_discount_value')::numeric,0) else quote_discount_value end,tax_rate=case when p_updates?'tax_rate' and v_is_admin then coalesce((p_updates->>'tax_rate')::numeric,0) when not v_is_admin then coalesce((v_cfg->>'taxRate')::numeric,0) else tax_rate end,updated_at=now()
  where id=p_quotation_id;
  if p_items is not null and not v_items_locked then
    delete from public.quotation_items where quotation_id=p_quotation_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
      v_product_id:=nullif(v_item->>'sales_product_id','')::uuid;
      v_client_expectations:='{}'::jsonb; v_duration_min:=null; v_duration_max:=null; v_duration_unit:='business_days'; v_timeline_impact:='assessment_required'; v_duration_note:=null;
      if v_product_id is not null then
        select coalesce(sp.client_expectations,'{}'::jsonb),sp.delivery_duration_min,sp.delivery_duration_max,sp.delivery_duration_unit,sp.timeline_impact,sp.delivery_duration_note into v_client_expectations,v_duration_min,v_duration_max,v_duration_unit,v_timeline_impact,v_duration_note from public.sales_products sp where sp.id=v_product_id;
        if not found then raise exception 'Catalog product not found.'; end if;
      end if;
      insert into public.quotation_items(quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,quantity,unit_price,line_total,item_type,sort_order,client_expectations_snapshot,duration_min_snapshot,duration_max_snapshot,duration_unit_snapshot,timeline_impact_snapshot,duration_note_snapshot,line_type,discount_type,discount_value,optional_for_client,section_key,configuration_snapshot)
      values(p_quotation_id,v_product_id,coalesce(v_item->>'product_code_snapshot','CUSTOM'),coalesce(v_item->>'product_name_snapshot','Custom Item'),nullif(v_item->>'description_snapshot',''),coalesce((v_item->>'quantity')::int,1),coalesce((v_item->>'unit_price')::numeric,0),0,coalesce(v_item->>'item_type','custom'),coalesce((v_item->>'sort_order')::int,0),v_client_expectations,v_duration_min,v_duration_max,v_duration_unit,v_timeline_impact,v_duration_note,coalesce(nullif(v_item->>'line_type',''),'product'),coalesce(nullif(v_item->>'discount_type',''),'none'),coalesce((v_item->>'discount_value')::numeric,0),coalesce((v_item->>'optional_for_client')::boolean,false),nullif(v_item->>'section_key',''),coalesce(v_item->'configuration_snapshot','{}'::jsonb));
    end loop;
    update public.quotations set duration_override_min=null,duration_override_max=null,duration_override_note=null,duration_override_by=null,duration_override_at=null where id=p_quotation_id;
    perform public.refresh_quotation_delivery_timeline(p_quotation_id);
  end if;
  perform public.assert_quotation_cpq_discount_permissions(p_quotation_id);
  if not v_is_admin and v_requested_status='Ready for Approval' then
    v_standard_terms:=public.quotation_standard_payment_terms(p_quotation_id);
    update public.quotations set payment_terms=coalesce(nullif(btrim(payment_terms),''),v_standard_terms),updated_at=now() where id=p_quotation_id;
    v_reasons:=public.quotation_cpq_approval_reasons(p_quotation_id); v_requires_approval:=cardinality(v_reasons)>0;
    if v_requires_approval then
      update public.quotations set status='Ready for Approval',approval_required=true,approval_route='manager_review',approval_reason=array_to_string(v_reasons,' '),approval_checked_at=now(),approved_by=null,approved_at=null,updated_at=now() where id=p_quotation_id;
    else
      update public.quotations set status='Approved',approval_required=false,approval_route='catalog_auto',approval_reason='All products, commercial terms, discounts, taxes, payment plan and delivery timeline match Admin-approved configuration.',approval_checked_at=now(),approved_by=null,approved_at=now(),updated_at=now() where id=p_quotation_id;
    end if;
  elsif not v_is_admin then
    update public.quotations set approval_required=null,approval_route=null,approval_reason=null,approval_checked_at=null,approved_by=null,approved_at=null,updated_at=now() where id=p_quotation_id;
  end if;
  perform set_config('profox.quotation_atomic_rpc','',true);
exception when others then perform set_config('profox.quotation_atomic_rpc','',true); raise;
end;
$$;

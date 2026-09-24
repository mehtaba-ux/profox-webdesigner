-- Complete the central Revenue Distribution Engine with package profiles,
-- quotation-specific effort overrides, minimum-price guidance, and actual-margin reporting.
-- Prices, commissions, Talent Partner rewards, worker earnings, and payouts remain canonical
-- in their existing modules. This migration stores only distribution policy and snapshots.

create table if not exists public.revenue_distribution_product_profiles (
  id uuid primary key default gen_random_uuid(),
  sales_product_id uuid not null unique references public.sales_products(id) on delete cascade,
  delivery_roles jsonb not null,
  active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.revenue_distribution_product_profiles enable row level security;
revoke all on table public.revenue_distribution_product_profiles from anon,authenticated;
grant select on table public.revenue_distribution_product_profiles to authenticated;
drop policy if exists revenue_distribution_product_profiles_admin_select on public.revenue_distribution_product_profiles;
create policy revenue_distribution_product_profiles_admin_select
on public.revenue_distribution_product_profiles for select to authenticated
using(public.is_admin());

alter table public.quotations
  add column if not exists revenue_distribution_override jsonb,
  add column if not exists revenue_distribution_override_reason text,
  add column if not exists revenue_distribution_override_by uuid references public.user_profiles(id) on delete set null,
  add column if not exists revenue_distribution_override_at timestamptz;

-- Validate an effort-weight override against the canonical global role registry.
-- Only weights may change; labels and Talent Partner job mappings remain central and cannot drift.
create or replace function public.validate_revenue_distribution_roles(p_roles jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $function$
declare
  v_global jsonb:=coalesce(public.revenue_distribution_config()->'deliveryRoles','[]'::jsonb);
  v_role jsonb;
  v_input jsonb;
  v_result jsonb:='[]'::jsonb;
  v_key text;
  v_weight numeric;
  v_total numeric:=0;
begin
  if p_roles is null or jsonb_typeof(p_roles)<>'array' then
    raise exception 'Delivery role weights must be an array.';
  end if;
  if jsonb_array_length(p_roles)<>jsonb_array_length(v_global) then
    raise exception 'Every canonical delivery role must be included exactly once.';
  end if;
  for v_role in select value from jsonb_array_elements(v_global) loop
    v_key:=v_role->>'key';
    select value into v_input from jsonb_array_elements(p_roles) where value->>'key'=v_key limit 1;
    if v_input is null then raise exception 'Missing delivery role: %',v_key; end if;
    if (select count(*) from jsonb_array_elements(p_roles) where value->>'key'=v_key)<>1 then
      raise exception 'Delivery role % must appear exactly once.',v_key;
    end if;
    begin v_weight:=(v_input->>'weightPercent')::numeric;
    exception when others then raise exception 'Delivery role % needs a numeric weight.',v_key; end;
    if v_weight<0 or v_weight>100 then raise exception 'Delivery role % weight must be between 0 and 100.',v_key; end if;
    v_total:=v_total+v_weight;
    v_result:=v_result||jsonb_build_array(jsonb_build_object(
      'key',v_key,
      'label',v_role->>'label',
      'weightPercent',round(v_weight,4),
      'talentPartnerJobSlug',v_role->'talentPartnerJobSlug'
    ));
  end loop;
  if abs(v_total-100)>0.0001 then
    raise exception 'Delivery role weights must total exactly 100 percent. Current total: %',v_total;
  end if;
  return v_result;
end;
$function$;

create or replace function public.revenue_distribution_resolved_roles(p_product_code text,p_quotation_id uuid default null)
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $function$
declare
  v_roles jsonb;
  v_source text:='global_default';
  v_profile_id uuid;
begin
  if p_quotation_id is not null then
    select revenue_distribution_override into v_roles from public.quotations where id=p_quotation_id;
    if v_roles is not null then v_source:='quotation_override'; end if;
  end if;
  if v_roles is null then
    select rp.delivery_roles,rp.id into v_roles,v_profile_id
    from public.revenue_distribution_product_profiles rp
    join public.sales_products sp on sp.id=rp.sales_product_id
    where rp.active=true and upper(sp.code)=upper(btrim(coalesce(p_product_code,'')))
    limit 1;
    if v_roles is not null then v_source:='package_profile'; end if;
  end if;
  if v_roles is null then v_roles:=public.revenue_distribution_config()->'deliveryRoles'; end if;
  return jsonb_build_object('source',v_source,'profileId',v_profile_id,'roles',public.validate_revenue_distribution_roles(v_roles));
end;
$function$;

-- The existing calculator remains the one formula. This scoped wrapper supplies resolved
-- weights through a transaction-local setting and always restores the prior value.
create or replace function public.revenue_distribution_calculate_scoped_internal(
  p_revenue numeric,p_currency text,p_product_code text,p_self_generated boolean,
  p_approved_commission_rate numeric,p_roles jsonb
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_previous text:=coalesce(current_setting('profox.revenue_distribution_roles',true),'');
  v_result jsonb;
begin
  perform set_config('profox.revenue_distribution_roles',public.validate_revenue_distribution_roles(p_roles)::text,true);
  v_result:=public.revenue_distribution_calculate_internal(p_revenue,p_currency,p_product_code,p_self_generated,p_approved_commission_rate);
  perform set_config('profox.revenue_distribution_roles',v_previous,true);
  return v_result;
exception when others then
  perform set_config('profox.revenue_distribution_roles',v_previous,true);
  raise;
end;
$function$;

-- Allow the established calculator to consume a scoped role profile without changing
-- any public signature or duplicating the financial formula.
create or replace function public.revenue_distribution_config()
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $function$
declare
  v jsonb;
  v_scoped text:=coalesce(current_setting('profox.revenue_distribution_roles',true),'');
begin
  select config_value into v from public.system_configuration where config_key='revenue_distribution_v1';
  v:=coalesce(v,jsonb_build_object(
    'version',1,'targetMarginPercent',45,'minimumMarginPercent',40,'reservePerformanceBonus',true,
    'selfGeneratedBonusUsesMarginBuffer',true,'salesTalentPartnerJobSlug','independent-sales-representative',
    'deliveryRoles',jsonb_build_array(
      jsonb_build_object('key','content','label','Content / Copywriting','weightPercent',13,'talentPartnerJobSlug','content-writer'),
      jsonb_build_object('key','uiux','label','UI/UX Design','weightPercent',22,'talentPartnerJobSlug','ui-ux-designer'),
      jsonb_build_object('key','development','label','Development','weightPercent',45,'talentPartnerJobSlug','web-developer'),
      jsonb_build_object('key','qa','label','Quality Assurance','weightPercent',8,'talentPartnerJobSlug',null),
      jsonb_build_object('key','project_management','label','Project Management / Client Success','weightPercent',12,'talentPartnerJobSlug',null)
    )
  ));
  if v_scoped<>'' then v:=jsonb_set(v,'{deliveryRoles}',v_scoped::jsonb,true); end if;
  return v;
end;
$function$;

create or replace function public.revenue_distribution_required_price_internal(
  p_current_revenue numeric,p_currency text,p_product_code text,p_self_generated boolean,
  p_approved_commission_rate numeric,p_roles jsonb
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_cfg jsonb:=public.revenue_distribution_config();
  v_min numeric:=coalesce((v_cfg->>'minimumMarginPercent')::numeric,40);
  v_low numeric:=0;
  v_high numeric:=greatest(1,coalesce(p_current_revenue,0));
  v_mid numeric;
  v_calc jsonb;
  v_ok boolean:=false;
  i integer;
begin
  if coalesce(p_current_revenue,0)>0 then
    v_calc:=public.revenue_distribution_calculate_scoped_internal(p_current_revenue,p_currency,p_product_code,p_self_generated,p_approved_commission_rate,p_roles);
    if coalesce((v_calc->'company'->>'marginPercent')::numeric,0)+0.0001>=v_min
       and coalesce((v_calc->'delivery'->>'poolAmount')::numeric,0)>0 then
      return jsonb_build_object(
        'available',true,'alreadySafe',true,'currency',upper(coalesce(nullif(btrim(p_currency),''),'USD')),
        'minimumSellingPrice',round(p_current_revenue,2),'additionalRevenueRequired',0,'minimumMarginPercent',v_min
      );
    end if;
  end if;
  for i in 1..40 loop
    v_calc:=public.revenue_distribution_calculate_scoped_internal(v_high,p_currency,p_product_code,p_self_generated,p_approved_commission_rate,p_roles);
    v_ok:=coalesce((v_calc->'company'->>'marginPercent')::numeric,0)+0.0001>=v_min
      and coalesce((v_calc->'delivery'->>'poolAmount')::numeric,0)>0;
    exit when v_ok;
    v_high:=v_high*2;
  end loop;
  if not v_ok then return jsonb_build_object('available',false,'reason','No safe price found within calculation bounds.'); end if;
  for i in 1..55 loop
    v_mid:=(v_low+v_high)/2;
    v_calc:=public.revenue_distribution_calculate_scoped_internal(v_mid,p_currency,p_product_code,p_self_generated,p_approved_commission_rate,p_roles);
    if coalesce((v_calc->'company'->>'marginPercent')::numeric,0)+0.0001>=v_min
       and coalesce((v_calc->'delivery'->>'poolAmount')::numeric,0)>0 then v_high:=v_mid; else v_low:=v_mid; end if;
  end loop;
  v_high:=ceil(v_high*100)/100;
  return jsonb_build_object(
    'available',true,'currency',upper(coalesce(nullif(btrim(p_currency),''),'USD')),
    'minimumSellingPrice',v_high,
    'additionalRevenueRequired',greatest(0,round(v_high-greatest(0,coalesce(p_current_revenue,0)),2)),
    'minimumMarginPercent',v_min
  );
end;
$function$;

create or replace function public.revenue_distribution_product_internal(p_product_code text,p_price numeric default null,p_self_generated boolean default false)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v public.sales_products%rowtype;
  v_price numeric;
  v_resolved jsonb;
  v_calc jsonb;
begin
  select * into v from public.sales_products where upper(code)=upper(btrim(coalesce(p_product_code,''))) limit 1;
  if not found then raise exception 'Sales Catalog product not found.'; end if;
  v_price:=coalesce(p_price,v.base_price,0);
  v_resolved:=public.revenue_distribution_resolved_roles(v.code,null);
  v_calc:=public.revenue_distribution_calculate_scoped_internal(v_price,v.currency,v.code,p_self_generated,null,v_resolved->'roles');
  v_calc:=v_calc||jsonb_build_object(
    'distributionProfileSource',v_resolved->>'source',
    'distributionProfileId',v_resolved->>'profileId',
    'minimumPriceRecommendation',public.revenue_distribution_required_price_internal(v_price,v.currency,v.code,p_self_generated,null,v_resolved->'roles')
  );
  return jsonb_build_object('productId',v.id,'productCode',v.code,'productName',v.name,'productType',v.product_type,'priceMode',v.price_mode,'price',v_price,'currency',v.currency,'distribution',v_calc);
end;
$function$;

create or replace function public.revenue_distribution_quotation_internal(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_q public.quotations%rowtype;
  v_opp public.crm_opportunities%rowtype;
  v_code text;
  v_one_time_gross numeric:=0;
  v_recurring_gross numeric:=0;
  v_committed_gross numeric:=0;
  v_quote_discount numeric:=0;
  v_one_time_discount numeric:=0;
  v_recurring_discount numeric:=0;
  v_revenue numeric:=0;
  v_recurring numeric:=0;
  v_result jsonb;
  v_resolved jsonb;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found.'; end if;
  if v_q.opportunity_id is not null then select * into v_opp from public.crm_opportunities where id=v_q.opportunity_id; end if;
  select qi.product_code_snapshot into v_code from public.quotation_items qi
  where qi.quotation_id=p_quotation_id and qi.optional_for_client=false and qi.line_type='product'
    and lower(coalesce(qi.item_type,'')) in ('package','discovery','custom')
  order by qi.sort_order,qi.created_at limit 1;
  v_code:=coalesce(nullif(v_code,''),'CUSTOM');
  select
    coalesce(sum(qi.line_total) filter(where lower(coalesce(qi.item_type,''))<>'care_plan'),0),
    coalesce(sum(qi.line_total) filter(where lower(coalesce(qi.item_type,''))='care_plan'),0)
  into v_one_time_gross,v_recurring_gross
  from public.quotation_items qi
  where qi.quotation_id=p_quotation_id and qi.optional_for_client=false and qi.line_type in ('product','custom');
  v_committed_gross:=v_one_time_gross+v_recurring_gross;
  v_quote_discount:=greatest(0,coalesce(v_q.quote_discount_total,0));
  if v_committed_gross>0 and v_quote_discount>0 then
    v_one_time_discount:=round(v_quote_discount*(v_one_time_gross/v_committed_gross),2);
    v_recurring_discount:=greatest(0,v_quote_discount-v_one_time_discount);
  end if;
  v_revenue:=greatest(0,round(v_one_time_gross-v_one_time_discount,2));
  v_recurring:=greatest(0,round(v_recurring_gross-v_recurring_discount,2));
  v_resolved:=public.revenue_distribution_resolved_roles(v_code,p_quotation_id);
  v_result:=public.revenue_distribution_calculate_scoped_internal(v_revenue,v_q.currency,v_code,coalesce(v_opp.self_generated,false),v_q.approved_commission_rate,v_resolved->'roles');
  return v_result||jsonb_build_object(
    'quotationId',v_q.id,'quotationNumber',v_q.quotation_number,'opportunityId',v_q.opportunity_id,
    'selfGeneratedLead',coalesce(v_opp.self_generated,false),'taxExcludedAmount',coalesce(v_q.tax_total,0),
    'oneTimeGrossBeforeQuoteDiscount',round(v_one_time_gross,2),'oneTimeQuoteDiscountAllocated',v_one_time_discount,
    'recurringServiceRevenue',v_recurring,'recurringServiceGrossBeforeQuoteDiscount',round(v_recurring_gross,2),
    'recurringQuoteDiscountAllocated',v_recurring_discount,'recurringServiceTreatment','separate_from_project_distribution',
    'distributionProfileSource',v_resolved->>'source','distributionProfileId',v_resolved->>'profileId',
    'overrideReason',v_q.revenue_distribution_override_reason,
    'minimumPriceRecommendation',public.revenue_distribution_required_price_internal(v_revenue,v_q.currency,v_code,coalesce(v_opp.self_generated,false),v_q.approved_commission_rate,v_resolved->'roles')
  );
end;
$function$;

create or replace function public.admin_save_revenue_distribution_product_profile(p_product_id uuid,p_roles jsonb)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare v_roles jsonb; v_row public.revenue_distribution_product_profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin permission required.'; end if;
  if not exists(select 1 from public.sales_products where id=p_product_id and product_type in ('package','discovery','custom')) then
    raise exception 'An active package, discovery, or custom Sales Catalog product is required.';
  end if;
  v_roles:=public.validate_revenue_distribution_roles(p_roles);
  insert into public.revenue_distribution_product_profiles(sales_product_id,delivery_roles,active,created_by,updated_by)
  values(p_product_id,v_roles,true,auth.uid(),auth.uid())
  on conflict(sales_product_id) do update set delivery_roles=excluded.delivery_roles,active=true,updated_by=auth.uid(),updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.admin_clear_revenue_distribution_product_profile(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
begin
  if not public.is_admin() then raise exception 'Admin permission required.'; end if;
  delete from public.revenue_distribution_product_profiles where sales_product_id=p_product_id;
end;
$function$;

create or replace function public.set_quotation_revenue_distribution_override(p_quotation_id uuid,p_roles jsonb,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare v_q public.quotations%rowtype; v_roles jsonb;
begin
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if not public.is_admin() and (not public.has_active_role(array['sales']) or v_q.salesperson_id is distinct from auth.uid()) then raise exception 'Unauthorized.'; end if;
  if v_q.status<>'Draft' or v_q.sent_at is not null or v_q.first_viewed_at is not null then raise exception 'Only an unlocked draft quotation can change delivery weights.'; end if;
  perform set_config('profox.revenue_distribution_override_rpc','1',true);
  if p_roles is null then
    update public.quotations set revenue_distribution_override=null,revenue_distribution_override_reason=null,revenue_distribution_override_by=null,revenue_distribution_override_at=null,updated_at=now() where id=p_quotation_id;
  else
    if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Explain the project-specific effort change in at least 10 characters.'; end if;
    v_roles:=public.validate_revenue_distribution_roles(p_roles);
    update public.quotations set revenue_distribution_override=v_roles,revenue_distribution_override_reason=left(btrim(p_reason),2000),revenue_distribution_override_by=auth.uid(),revenue_distribution_override_at=now(),updated_at=now() where id=p_quotation_id;
  end if;
  perform set_config('profox.revenue_distribution_override_rpc','',true);
  return public.revenue_distribution_quotation_internal(p_quotation_id);
exception when others then
  perform set_config('profox.revenue_distribution_override_rpc','',true);
  raise;
end;
$function$;

create or replace function public.guard_quotation_revenue_distribution_override()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_source public.quotations%rowtype;
  v_override_changed boolean;
begin
  -- A formal revision inherits the previously approved effort assumption. A separate
  -- Duplicate remains a clean commercial draft and resolves the current package profile.
  if tg_op='INSERT' and new.previous_revision_id is not null and new.revenue_distribution_override is null then
    select * into v_source from public.quotations where id=new.previous_revision_id;
    if found then
      new.revenue_distribution_override:=v_source.revenue_distribution_override;
      new.revenue_distribution_override_reason:=v_source.revenue_distribution_override_reason;
      new.revenue_distribution_override_by:=v_source.revenue_distribution_override_by;
      new.revenue_distribution_override_at:=v_source.revenue_distribution_override_at;
    end if;
  end if;
  if tg_op='UPDATE' then
    v_override_changed :=
      new.revenue_distribution_override is distinct from old.revenue_distribution_override
      or new.revenue_distribution_override_reason is distinct from old.revenue_distribution_override_reason
      or new.revenue_distribution_override_by is distinct from old.revenue_distribution_override_by
      or new.revenue_distribution_override_at is distinct from old.revenue_distribution_override_at;
  else
    v_override_changed :=
      new.revenue_distribution_override is not null
      or new.revenue_distribution_override_reason is not null
      or new.revenue_distribution_override_by is not null
      or new.revenue_distribution_override_at is not null;
  end if;

  if v_override_changed then
    if coalesce(current_setting('profox.revenue_distribution_override_rpc',true),'')<>'1'
       and coalesce(current_setting('profox.revision_clone',true),'')<>'1' then
      raise exception 'Use the protected quotation revenue-distribution workflow.';
    end if;
    if new.revenue_distribution_override is not null then
      new.revenue_distribution_override:=public.validate_revenue_distribution_roles(new.revenue_distribution_override);
      if length(btrim(coalesce(new.revenue_distribution_override_reason,'')))<10 then raise exception 'A clear delivery-weight override reason is required.'; end if;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_quotation_revenue_distribution_override on public.quotations;
drop trigger if exists trg_guard_quotation_revenue_distribution_override_insert on public.quotations;
drop trigger if exists trg_guard_quotation_revenue_distribution_override_update on public.quotations;
create trigger trg_guard_quotation_revenue_distribution_override_insert
before insert on public.quotations
for each row execute function public.guard_quotation_revenue_distribution_override();
create trigger trg_guard_quotation_revenue_distribution_override_update
before update of revenue_distribution_override,revenue_distribution_override_reason,revenue_distribution_override_by,revenue_distribution_override_at on public.quotations
for each row execute function public.guard_quotation_revenue_distribution_override();

-- Extend the existing approval reasons without weakening any established CPQ check.
create or replace function public.quotation_revenue_distribution_approval_reasons(p_quotation_id uuid)
returns text[]
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $function$
declare v_q public.quotations%rowtype; v_dist jsonb; v_reasons text[]:='{}'::text[]; v_required numeric;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then return array['Quotation not found.']; end if;
  if v_q.revenue_distribution_override is not null then
    v_reasons:=array_append(v_reasons,'Project-specific delivery effort weights require Management approval. Reason: '||coalesce(v_q.revenue_distribution_override_reason,'Not supplied.'));
  end if;
  begin
    v_dist:=public.revenue_distribution_quotation_internal(p_quotation_id);
    if coalesce((v_dist->>'requiresApproval')::boolean,false) then
      v_required:=coalesce((v_dist->'minimumPriceRecommendation'->>'minimumSellingPrice')::numeric,0);
      v_reasons:=array_append(v_reasons,'Projected ProFox contribution margin is '||coalesce(v_dist->'company'->>'marginPercent','0')||'%, below or outside the protected minimum policy of '||coalesce(v_dist->>'minimumMarginPercent','0')||'%. '||case when v_required>0 then 'Required minimum one-time selling price: '||coalesce(v_dist->>'currency','USD')||' '||to_char(v_required,'FM999999999990.00')||'.' else 'Review price, scope, commissions or distribution.' end);
    end if;
  exception when others then
    v_reasons:=array_append(v_reasons,'Revenue distribution and margin check requires Admin review: '||sqlerrm);
  end;
  return v_reasons;
end;
$function$;

-- Preserve all established reasons and add the new profile/margin reasons once.
create or replace function public.quotation_cpq_approval_reasons(p_quotation_id uuid)
returns text[]
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $function$
declare
  v_q public.quotations%rowtype; v_cfg jsonb:=public.quotation_cpq_settings_safe(); v_auto numeric:=coalesce((v_cfg->>'autoApprovalDiscountPercent')::numeric,5); v_tax numeric:=coalesce((v_cfg->>'taxRate')::numeric,0);
  v_reasons text[]:='{}'::text[]; v_extra text[]; v_timeline_missing text[]:='{}'::text[]; v_name text; v_standard text; v_effective numeric; v_base numeric;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then return array['Quotation not found.']; end if;
  if not exists(select 1 from public.quotation_items where quotation_id=p_quotation_id and optional_for_client=false and line_type in ('product','custom')) then v_reasons:=array_append(v_reasons,'At least one committed product or service is required.'); end if;
  v_timeline_missing:=public.quotation_timeline_missing_items(p_quotation_id);
  foreach v_name in array v_timeline_missing loop v_reasons:=array_append(v_reasons,'Timeline missing for "'||v_name||'".'); end loop;
  if exists(select 1 from public.quotation_items where quotation_id=p_quotation_id and line_type in ('product','custom') and coalesce(configuration_snapshot->>'timelineSource','')='admin_override') then v_reasons:=array_append(v_reasons,'A Sales Catalog delivery timeline has an Admin quotation-specific override.'); end if;
  if exists(select 1 from public.quotation_items qi left join public.sales_products sp on sp.id=qi.sales_product_id where qi.quotation_id=p_quotation_id and qi.line_type in ('product','custom') and (qi.sales_product_id is null or sp.id is null or coalesce(sp.active,false)=false or coalesce(sp.manager_approval_required,false)=true or sp.price_mode='custom')) then v_reasons:=array_append(v_reasons,'Custom, inactive, or manager-controlled catalog scope requires review.'); end if;
  if exists(select 1 from public.quotation_items qi join public.sales_products sp on sp.id=qi.sales_product_id where qi.quotation_id=p_quotation_id and qi.line_type='product' and ((sp.price_mode='fixed' and qi.unit_price<>sp.base_price) or (sp.price_mode='starting_at' and qi.unit_price<sp.base_price))) then v_reasons:=array_append(v_reasons,'Protected catalog pricing differs from the current approved price.'); end if;
  if exists(select 1 from public.quotation_items qi where qi.quotation_id=p_quotation_id and qi.line_type in ('product','custom') and case when qi.discount_type='percent' then qi.discount_value when qi.discount_type='fixed' and qi.quantity*qi.unit_price>0 then qi.discount_value/(qi.quantity*qi.unit_price)*100 else 0 end>v_auto) then v_reasons:=array_append(v_reasons,'A line discount exceeds the automatic approval threshold.'); end if;
  select coalesce(sum(line_total) filter(where optional_for_client=false and line_type in ('product','custom')),0) into v_base from public.quotation_items where quotation_id=p_quotation_id;
  v_effective:=case when v_q.quote_discount_type='percent' then v_q.quote_discount_value when v_q.quote_discount_type='fixed' and v_base>0 then v_q.quote_discount_value/v_base*100 else 0 end;
  if v_effective>v_auto then v_reasons:=array_append(v_reasons,'The quotation-level discount exceeds the automatic approval threshold.'); end if;
  if abs(coalesce(v_q.tax_rate,0)-v_tax)>0.0001 then v_reasons:=array_append(v_reasons,'Tax or fee configuration differs from the current Admin policy.'); end if;
  begin
    v_standard:=public.quotation_standard_payment_terms(p_quotation_id);
    if nullif(btrim(coalesce(v_q.payment_terms,'')),'') is not null and (v_standard is null or lower(regexp_replace(btrim(v_q.payment_terms),'\s+','','g'))<>lower(regexp_replace(btrim(v_standard),'\s+','','g'))) then v_reasons:=array_append(v_reasons,'Payment terms differ from the approved catalog terms.'); end if;
    perform public.resolve_quotation_payment_schedule(p_quotation_id);
  exception when others then v_reasons:=array_append(v_reasons,'Payment schedule requires review: '||sqlerrm); end;
  v_extra:=public.quotation_revenue_distribution_approval_reasons(p_quotation_id);
  foreach v_name in array v_extra loop v_reasons:=array_append(v_reasons,v_name); end loop;
  return v_reasons;
end;
$function$;

create or replace function public.admin_revenue_distribution_management_snapshot()
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $function$
declare v_profiles jsonb; v_actuals jsonb;
begin
  if not public.is_admin() then raise exception 'Admin permission required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('productId',sp.id,'code',sp.code,'name',sp.name,'profileId',rp.id,'roles',rp.delivery_roles,'active',coalesce(rp.active,false)) order by sp.sort_order,sp.name),'[]'::jsonb)
  into v_profiles from public.sales_products sp left join public.revenue_distribution_product_profiles rp on rp.sales_product_id=sp.id
  where sp.active=true and sp.product_type in ('package','discovery','custom');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_actuals from (
    select b.*,
      round(b.actual_seller_cost+b.actual_talent_partner_cost+b.actual_worker_cost,2) as actual_recognized_cost,
      round(b.paid_seller_cost+b.paid_talent_partner_cost+b.paid_worker_cost,2) as paid_cost,
      round(b.collected_revenue-b.actual_seller_cost-b.actual_talent_partner_cost-b.actual_worker_cost,2) as actual_contribution,
      case when b.collected_revenue>0 then round((b.collected_revenue-b.actual_seller_cost-b.actual_talent_partner_cost-b.actual_worker_cost)/b.collected_revenue*100,4) else null end as actual_margin_percent
    from (
    select r.id,r.project_id,p.project_name,r.quotation_id,q.quotation_number,r.product_code,r.currency,r.created_at,
      r.commissionable_revenue as projected_revenue,r.delivery_pool_amount as projected_delivery_cost,
      (r.seller_reserve_amount+r.sales_talent_partner_reserve_amount+r.delivery_talent_partner_reserve_amount+r.delivery_pool_amount) as projected_people_cost,
      r.company_contribution_amount as projected_contribution,r.projected_margin_percent,
      coalesce((select sum(pay.amount_paid) from public.payments pay where pay.quotation_id=r.quotation_id and (pay.verified_at is not null or lower(coalesce(pay.status,''))='verified')),0) as collected_revenue,
      coalesce((select sum(c.commission_amount) from public.commission_entries c where c.quotation_id=r.quotation_id and c.status<>'Reversed'),0) as actual_seller_cost,
      coalesce((select sum(t.reward_amount) from public.talent_partner_reward_entries t where (t.source_quotation_id=r.quotation_id or t.source_project_id=r.project_id) and t.status<>'Reversed'),0) as actual_talent_partner_cost,
      coalesce((select sum(w.amount) from public.worker_earnings w where w.project_id=r.project_id and w.status not in ('Voided','Reversed')),0) as actual_worker_cost,
      coalesce((select sum(w.amount) from public.worker_earnings w where w.project_id=r.project_id and w.status='Paid'),0) as paid_worker_cost,
      coalesce((select sum(c.commission_amount) from public.commission_entries c where c.quotation_id=r.quotation_id and c.status='Paid'),0) as paid_seller_cost,
      coalesce((select sum(t.reward_amount) from public.talent_partner_reward_entries t where (t.source_quotation_id=r.quotation_id or t.source_project_id=r.project_id) and t.status='Paid'),0) as paid_talent_partner_cost
    from public.revenue_distribution_snapshots r
    left join public.projects p on p.id=r.project_id left join public.quotations q on q.id=r.quotation_id
    order by r.created_at desc limit 100
    ) b
  ) x;
  return jsonb_build_object('productProfiles',v_profiles,'projectActuals',v_actuals);
end;
$function$;

-- These callers use a transaction-local scoped profile while calculating and must not be
-- marked STABLE by older migrations.
alter function public.revenue_distribution_preview_product(text,numeric) volatile;
alter function public.revenue_distribution_preview_quotation(uuid) volatile;
alter function public.quotation_revenue_distribution_approval_reasons(uuid) volatile;
alter function public.quotation_cpq_approval_reasons(uuid) volatile;
alter function public.get_quotation_cpq_summary(uuid) volatile;

-- Keep the established Admin dashboard contract while making package previews profile-aware.
create or replace function public.admin_revenue_distribution_dashboard()
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $function$
declare v_products jsonb; v_snapshots jsonb;
begin
  if not public.is_admin() then raise exception 'Admin permission required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'productId',sp.id,'code',sp.code,'name',sp.name,'productType',sp.product_type,'priceMode',sp.price_mode,'price',sp.base_price,'currency',sp.currency,
    'companyLead',case when coalesce(sp.base_price,0)>0 then public.revenue_distribution_product_internal(sp.code,sp.base_price,false)->'distribution' else null end,
    'selfGeneratedLead',case when coalesce(sp.base_price,0)>0 then public.revenue_distribution_product_internal(sp.code,sp.base_price,true)->'distribution' else null end
  ) order by sp.sort_order,sp.name),'[]'::jsonb) into v_products
  from public.sales_products sp where sp.active=true and sp.product_type in ('package','discovery','custom');
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_snapshots from (
    select r.id,r.project_id,p.project_name,r.quotation_id,q.quotation_number,r.product_code,r.currency,r.commissionable_revenue,r.projected_margin_percent,
      r.delivery_pool_amount,r.company_contribution_amount,r.seller_reserve_amount,r.sales_talent_partner_reserve_amount,r.delivery_talent_partner_reserve_amount,r.role_allocations,r.config_version,r.created_at
    from public.revenue_distribution_snapshots r left join public.projects p on p.id=r.project_id left join public.quotations q on q.id=r.quotation_id
    order by r.created_at desc limit 100
  ) x;
  return jsonb_build_object('config',public.revenue_distribution_config(),'products',v_products,'recentSnapshots',v_snapshots);
end;
$function$;

alter function public.admin_revenue_distribution_dashboard() volatile;

revoke all on function public.validate_revenue_distribution_roles(jsonb) from public,anon,authenticated;
revoke all on function public.revenue_distribution_resolved_roles(text,uuid) from public,anon,authenticated;
revoke all on function public.revenue_distribution_calculate_scoped_internal(numeric,text,text,boolean,numeric,jsonb) from public,anon,authenticated;
revoke all on function public.revenue_distribution_required_price_internal(numeric,text,text,boolean,numeric,jsonb) from public,anon,authenticated;
revoke all on function public.revenue_distribution_product_internal(text,numeric,boolean) from public,anon,authenticated;
revoke all on function public.revenue_distribution_quotation_internal(uuid) from public,anon,authenticated;
revoke all on function public.quotation_revenue_distribution_approval_reasons(uuid) from public,anon,authenticated;
revoke all on function public.guard_quotation_revenue_distribution_override() from public,anon,authenticated;
revoke all on function public.admin_save_revenue_distribution_product_profile(uuid,jsonb) from public,anon;
revoke all on function public.admin_clear_revenue_distribution_product_profile(uuid) from public,anon;
revoke all on function public.set_quotation_revenue_distribution_override(uuid,jsonb,text) from public,anon;
revoke all on function public.admin_revenue_distribution_management_snapshot() from public,anon;
grant execute on function public.admin_save_revenue_distribution_product_profile(uuid,jsonb) to authenticated;
grant execute on function public.admin_clear_revenue_distribution_product_profile(uuid) to authenticated;
grant execute on function public.set_quotation_revenue_distribution_override(uuid,jsonb,text) to authenticated;
grant execute on function public.admin_revenue_distribution_management_snapshot() to authenticated;

-- Validate existing rows only after every dependency is installed.
do $migration$
declare r record;
begin
  for r in select id,delivery_roles from public.revenue_distribution_product_profiles loop
    perform public.validate_revenue_distribution_roles(r.delivery_roles);
  end loop;
end
$migration$;

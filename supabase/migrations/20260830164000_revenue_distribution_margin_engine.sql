-- Central, versioned revenue-distribution and margin planning for ProFox.
-- Existing seller commissions, Talent Partner rewards and worker earnings remain canonical.
-- This layer plans/snapshots project economics and feeds the existing quotation approval flow.

insert into public.system_configuration(config_key,config_value,description,updated_at)
values(
  'revenue_distribution_v1',
  jsonb_build_object(
    'version',1,
    'targetMarginPercent',45,
    'minimumMarginPercent',40,
    'reservePerformanceBonus',true,
    'selfGeneratedBonusUsesMarginBuffer',true,
    'salesTalentPartnerJobSlug','independent-sales-representative',
    'deliveryRoles',jsonb_build_array(
      jsonb_build_object('key','content','label','Content / Copywriting','weightPercent',13,'talentPartnerJobSlug','content-writer'),
      jsonb_build_object('key','uiux','label','UI/UX Design','weightPercent',22,'talentPartnerJobSlug','ui-ux-designer'),
      jsonb_build_object('key','development','label','Development','weightPercent',45,'talentPartnerJobSlug','web-developer'),
      jsonb_build_object('key','qa','label','Quality Assurance','weightPercent',8,'talentPartnerJobSlug',null),
      jsonb_build_object('key','project_management','label','Project Management / Client Success','weightPercent',12,'talentPartnerJobSlug',null)
    )
  ),
  'Versioned company contribution margin and delivery allocation policy. Package prices remain canonical in Sales Catalog; seller commissions, Talent Partner plans and worker earnings remain canonical in their existing modules.',
  now()
)
on conflict(config_key) do nothing;

create or replace function public.revenue_distribution_config()
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $$
declare v jsonb;
begin
  select config_value into v from public.system_configuration where config_key='revenue_distribution_v1';
  return coalesce(v,jsonb_build_object(
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
end;
$$;

create or replace function public.admin_save_revenue_distribution_config(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_current jsonb:=public.revenue_distribution_config();
  v_roles jsonb:=coalesce(p_config->'deliveryRoles','[]'::jsonb);
  v_role jsonb;
  v_target numeric:=coalesce((p_config->>'targetMarginPercent')::numeric,45);
  v_min numeric:=coalesce((p_config->>'minimumMarginPercent')::numeric,40);
  v_weight numeric:=0;
  v_key text;
  v_keys text[]:='{}'::text[];
  v_version integer:=greatest(1,coalesce((v_current->>'version')::integer,1)+1);
  v_saved jsonb;
begin
  if not public.is_admin() then raise exception 'Admin permission required.'; end if;
  if p_config is null or jsonb_typeof(p_config)<>'object' then raise exception 'Revenue distribution configuration must be an object.'; end if;
  if v_target<=0 or v_target>=95 then raise exception 'Target margin must be greater than 0 and below 95 percent.'; end if;
  if v_min<=0 or v_min>v_target then raise exception 'Minimum margin must be greater than 0 and not exceed target margin.'; end if;
  if jsonb_typeof(v_roles)<>'array' or jsonb_array_length(v_roles)=0 or jsonb_array_length(v_roles)>20 then raise exception 'Configure between 1 and 20 delivery roles.'; end if;

  for v_role in select value from jsonb_array_elements(v_roles) loop
    v_key:=lower(btrim(coalesce(v_role->>'key','')));
    if v_key='' or v_key!~'^[a-z0-9_]+$' then raise exception 'Every delivery role needs a stable key.'; end if;
    if v_key=any(v_keys) then raise exception 'Delivery role keys must be unique: %',v_key; end if;
    v_keys:=array_append(v_keys,v_key);
    if nullif(btrim(coalesce(v_role->>'label','')),'') is null then raise exception 'Every delivery role needs a label.'; end if;
    if coalesce((v_role->>'weightPercent')::numeric,0)<=0 or (v_role->>'weightPercent')::numeric>100 then raise exception 'Every delivery role weight must be greater than 0 and no more than 100 percent.'; end if;
    v_weight:=v_weight+(v_role->>'weightPercent')::numeric;
  end loop;
  if abs(v_weight-100)>0.0001 then raise exception 'Delivery role weights must total exactly 100 percent. Current total: %',v_weight; end if;

  v_saved:=jsonb_build_object(
    'version',v_version,
    'targetMarginPercent',round(v_target,4),
    'minimumMarginPercent',round(v_min,4),
    'reservePerformanceBonus',coalesce((p_config->>'reservePerformanceBonus')::boolean,true),
    'selfGeneratedBonusUsesMarginBuffer',coalesce((p_config->>'selfGeneratedBonusUsesMarginBuffer')::boolean,true),
    'salesTalentPartnerJobSlug',coalesce(nullif(btrim(p_config->>'salesTalentPartnerJobSlug'),''),'independent-sales-representative'),
    'deliveryRoles',v_roles
  );

  insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  values('revenue_distribution_v1',v_saved,'Versioned company contribution margin and delivery allocation policy.',auth.uid(),now())
  on conflict(config_key) do update set config_value=excluded.config_value,description=excluded.description,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  return v_saved;
end;
$$;

create or replace function public.revenue_distribution_calculate_internal(
  p_revenue numeric,
  p_currency text,
  p_product_code text,
  p_self_generated boolean default false,
  p_approved_commission_rate numeric default null
)
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $$
declare
  v_cfg jsonb:=public.revenue_distribution_config();
  v_target numeric:=coalesce((v_cfg->>'targetMarginPercent')::numeric,45);
  v_min numeric:=coalesce((v_cfg->>'minimumMarginPercent')::numeric,40);
  v_revenue numeric:=greatest(0,coalesce(p_revenue,0));
  v_currency text:=upper(coalesce(nullif(btrim(p_currency),''),'USD'));
  v_rule public.commission_rules%rowtype;
  v_commission_settings public.commission_settings%rowtype;
  v_base_rate numeric:=0;
  v_perf_rate numeric:=0;
  v_self_rate numeric:=0;
  v_base_amount numeric:=0;
  v_perf_amount numeric:=0;
  v_self_amount numeric:=0;
  v_sales_tp_slug text:=coalesce(nullif(v_cfg->>'salesTalentPartnerJobSlug',''),'independent-sales-representative');
  v_sales_plan public.talent_partner_reward_plans%rowtype;
  v_reward jsonb;
  v_sales_tp_percent numeric:=0;
  v_sales_tp_fixed numeric:=0;
  v_sales_tp_amount numeric:=0;
  v_delivery_roles jsonb:=coalesce(v_cfg->'deliveryRoles','[]'::jsonb);
  v_role jsonb;
  v_role_slug text;
  v_role_key text;
  v_role_label text;
  v_role_weight numeric;
  v_role_plan public.talent_partner_reward_plans%rowtype;
  v_role_tp_percent numeric;
  v_role_tp_fixed numeric;
  v_tp_factor numeric:=0;
  v_delivery_fixed numeric:=0;
  v_available numeric:=0;
  v_delivery_pool numeric:=0;
  v_delivery_tp_percent_amount numeric:=0;
  v_delivery_tp_total numeric:=0;
  v_target_amount numeric:=0;
  v_company_amount numeric:=0;
  v_margin numeric:=0;
  v_role_budget numeric;
  v_roles_out jsonb:='[]'::jsonb;
  v_review jsonb:='[]'::jsonb;
  v_health text;
  v_plan_currency text;
  v_buffer numeric;
begin
  if v_revenue<=0 then
    return jsonb_build_object('success',false,'reason','positive_revenue_required','commissionableRevenue',v_revenue,'currency',v_currency);
  end if;

  select * into v_rule from public.commission_rules where upper(product_code)=upper(coalesce(p_product_code,'')) and enabled=true limit 1;
  if found then
    if coalesce(v_rule.requires_admin_rate,false) then
      if p_approved_commission_rate is not null and p_approved_commission_rate between coalesce(v_rule.min_rate_percent,0) and coalesce(v_rule.max_rate_percent,100) then
        v_base_rate:=p_approved_commission_rate;
      else
        v_base_rate:=greatest(coalesce(v_rule.base_rate_percent,0),coalesce(v_rule.max_rate_percent,0));
      end if;
    else
      v_base_rate:=coalesce(v_rule.base_rate_percent,0);
    end if;
  end if;

  select * into v_commission_settings from public.commission_settings where id='default';
  if found then
    if coalesce((v_cfg->>'reservePerformanceBonus')::boolean,true) then v_perf_rate:=coalesce(v_commission_settings.performance_bonus_percent,0); end if;
    if coalesce(p_self_generated,false) then v_self_rate:=coalesce(v_commission_settings.self_generated_bonus_percent,0); end if;
  end if;
  v_base_amount:=round(v_revenue*v_base_rate/100.0,2);
  v_perf_amount:=round(v_revenue*v_perf_rate/100.0,2);
  v_self_amount:=round(v_revenue*v_self_rate/100.0,2);

  select rp.* into v_sales_plan
  from public.talent_partner_reward_plans rp join public.career_jobs j on j.id=rp.career_job_id
  where rp.enabled=true and rp.reward_model='sales' and j.slug=v_sales_tp_slug
  order by rp.updated_at desc nulls last limit 1;
  if found then
    v_plan_currency:=upper(coalesce(v_sales_plan.currency,v_currency));
    for v_reward in select value from jsonb_array_elements(coalesce(v_sales_plan.event_rewards,'[]'::jsonb)) loop
      if v_reward->>'kind'='percent' then v_sales_tp_percent:=greatest(v_sales_tp_percent,coalesce((v_reward->>'ratePercent')::numeric,0)); end if;
      if v_reward->>'kind'='fixed' then
        if v_plan_currency=v_currency then v_sales_tp_fixed:=greatest(v_sales_tp_fixed,coalesce((v_reward->>'fixedAmount')::numeric,0));
        else v_review:=v_review||jsonb_build_array('Sales Talent Partner fixed reward currency differs from quotation currency and requires Finance review.'); end if;
      end if;
    end loop;
  end if;
  -- Conservative reserve: maximum configured percentage plus maximum configured fixed amount.
  v_sales_tp_amount:=round(v_revenue*v_sales_tp_percent/100.0+v_sales_tp_fixed,2);

  for v_role in select value from jsonb_array_elements(v_delivery_roles) loop
    v_role_weight:=coalesce((v_role->>'weightPercent')::numeric,0);
    v_role_slug:=nullif(btrim(coalesce(v_role->>'talentPartnerJobSlug','')),'');
    v_role_tp_percent:=0; v_role_tp_fixed:=0;
    if v_role_slug is not null then
      select rp.* into v_role_plan
      from public.talent_partner_reward_plans rp join public.career_jobs j on j.id=rp.career_job_id
      where rp.enabled=true and rp.reward_model='project' and j.slug=v_role_slug
      order by rp.updated_at desc nulls last limit 1;
      if found then
        v_plan_currency:=upper(coalesce(v_role_plan.currency,v_currency));
        for v_reward in select value from jsonb_array_elements(coalesce(v_role_plan.event_rewards,'[]'::jsonb)) loop
          if v_reward->>'kind'='percent' then v_role_tp_percent:=greatest(v_role_tp_percent,coalesce((v_reward->>'ratePercent')::numeric,0)); end if;
          if v_reward->>'kind'='fixed' then
            if v_plan_currency=v_currency then v_role_tp_fixed:=greatest(v_role_tp_fixed,coalesce((v_reward->>'fixedAmount')::numeric,0));
            else v_review:=v_review||jsonb_build_array('A delivery Talent Partner fixed reward currency differs from quotation currency and requires Finance review.'); end if;
          end if;
        end loop;
      end if;
    end if;
    v_tp_factor:=v_tp_factor+(v_role_weight/100.0)*(v_role_tp_percent/100.0);
    v_delivery_fixed:=v_delivery_fixed+v_role_tp_fixed;
  end loop;

  v_target_amount:=round(v_revenue*v_target/100.0,2);
  v_available:=v_revenue-v_target_amount-v_base_amount-v_perf_amount-v_sales_tp_amount-v_delivery_fixed;
  if v_available>0 then v_delivery_pool:=round(v_available/(1+v_tp_factor),2); else v_delivery_pool:=0; end if;
  v_delivery_tp_percent_amount:=round(v_delivery_pool*v_tp_factor,2);
  v_delivery_tp_total:=round(v_delivery_fixed+v_delivery_tp_percent_amount,2);

  for v_role in select value from jsonb_array_elements(v_delivery_roles) loop
    v_role_key:=v_role->>'key'; v_role_label:=v_role->>'label'; v_role_weight:=(v_role->>'weightPercent')::numeric;
    v_role_slug:=nullif(btrim(coalesce(v_role->>'talentPartnerJobSlug','')),'');
    v_role_tp_percent:=0; v_role_tp_fixed:=0;
    if v_role_slug is not null then
      select rp.* into v_role_plan from public.talent_partner_reward_plans rp join public.career_jobs j on j.id=rp.career_job_id
      where rp.enabled=true and rp.reward_model='project' and j.slug=v_role_slug order by rp.updated_at desc nulls last limit 1;
      if found then
        for v_reward in select value from jsonb_array_elements(coalesce(v_role_plan.event_rewards,'[]'::jsonb)) loop
          if v_reward->>'kind'='percent' then v_role_tp_percent:=greatest(v_role_tp_percent,coalesce((v_reward->>'ratePercent')::numeric,0)); end if;
          if v_reward->>'kind'='fixed' and upper(coalesce(v_role_plan.currency,v_currency))=v_currency then v_role_tp_fixed:=greatest(v_role_tp_fixed,coalesce((v_reward->>'fixedAmount')::numeric,0)); end if;
        end loop;
      end if;
    end if;
    v_role_budget:=round(v_delivery_pool*v_role_weight/100.0,2);
    v_roles_out:=v_roles_out||jsonb_build_array(jsonb_build_object(
      'key',v_role_key,'label',v_role_label,'weightPercent',v_role_weight,'budgetAmount',v_role_budget,
      'talentPartnerJobSlug',v_role_slug,'talentPartnerMaxPercent',v_role_tp_percent,'talentPartnerFixedReserve',v_role_tp_fixed,
      'talentPartnerReserveAmount',round(v_role_budget*v_role_tp_percent/100.0+v_role_tp_fixed,2)
    ));
  end loop;

  v_company_amount:=round(v_revenue-v_base_amount-v_perf_amount-v_self_amount-v_sales_tp_amount-v_delivery_pool-v_delivery_tp_total,2);
  v_margin:=round(v_company_amount/v_revenue*100.0,4);
  v_buffer:=round(v_margin-v_min,4);
  if v_margin+0.0001>=v_target then v_health:='healthy';
  elsif v_margin+0.0001>=v_min then v_health:='acceptable';
  else v_health:='approval_required'; end if;
  if v_delivery_pool<=0 then v_health:='approval_required'; v_review:=v_review||jsonb_build_array('No positive delivery pool remains after protected margin and reward reserves.'); end if;
  if jsonb_array_length(v_review)>0 then v_health:='approval_required'; end if;

  return jsonb_build_object(
    'success',true,
    'calculationVersion',2,
    'config',v_cfg,
    'configVersion',coalesce((v_cfg->>'version')::integer,1),
    'currency',v_currency,
    'productCode',upper(coalesce(p_product_code,'')),
    'commissionableRevenue',round(v_revenue,2),
    'targetMarginPercent',v_target,'minimumMarginPercent',v_min,
    'seller',jsonb_build_object(
      'baseRatePercent',v_base_rate,'performanceReservePercent',v_perf_rate,'selfGeneratedBonusPercent',v_self_rate,
      'baseAmount',v_base_amount,'performanceReserveAmount',v_perf_amount,'selfGeneratedBonusAmount',v_self_amount,
      'totalReservedAmount',round(v_base_amount+v_perf_amount+v_self_amount,2)
    ),
    'salesTalentPartner',jsonb_build_object('jobSlug',v_sales_tp_slug,'maxPercent',v_sales_tp_percent,'fixedReserve',v_sales_tp_fixed,'reserveAmount',v_sales_tp_amount),
    'delivery',jsonb_build_object('poolAmount',v_delivery_pool,'roles',v_roles_out,'talentPartnerReserveAmount',v_delivery_tp_total,'talentPartnerPercentReserveAmount',v_delivery_tp_percent_amount,'talentPartnerFixedReserveAmount',round(v_delivery_fixed,2)),
    'company',jsonb_build_object('contributionAmount',v_company_amount,'marginPercent',v_margin,'marginBufferAboveMinimumPercent',v_buffer),
    'health',v_health,
    'requiresApproval',v_health='approval_required',
    'manualReviewReasons',v_review,
    'policyNotes',jsonb_build_array(
      'Seller performance bonus is conservatively reserved when enabled in Admin configuration.',
      'Self-generated seller bonus uses the target-to-minimum margin buffer instead of reducing delivery role budgets.',
      'Talent Partner reserves are conservative maxima; actual rewards remain controlled by the existing qualifying reward engine.',
      'Delivery role amounts are project budget allocations. Existing worker assignment, quality approval and earning controls remain authoritative for actual payable earnings.'
    )
  );
end;
$$;

create or replace function public.revenue_distribution_product_internal(p_product_code text,p_price numeric default null,p_self_generated boolean default false)
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $$
declare v public.sales_products%rowtype; v_price numeric;
begin
  select * into v from public.sales_products where upper(code)=upper(btrim(coalesce(p_product_code,''))) limit 1;
  if not found then raise exception 'Sales Catalog product not found.'; end if;
  v_price:=coalesce(p_price,v.base_price,0);
  return jsonb_build_object('productId',v.id,'productCode',v.code,'productName',v.name,'productType',v.product_type,'priceMode',v.price_mode,'price',v_price,'currency',v.currency,
    'distribution',public.revenue_distribution_calculate_internal(v_price,v.currency,v.code,p_self_generated,null));
end;
$$;

create or replace function public.revenue_distribution_preview_product(p_product_code text,p_price numeric default null)
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $$
begin
  if not public.is_admin() and not public.has_active_role(array['sales']) then raise exception 'Admin or active Sales access required.'; end if;
  return jsonb_build_object(
    'companyLead',public.revenue_distribution_product_internal(p_product_code,p_price,false),
    'selfGeneratedLead',public.revenue_distribution_product_internal(p_product_code,p_price,true)
  );
end;
$$;

create or replace function public.revenue_distribution_quotation_internal(p_quotation_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $$
declare
  v_q public.quotations%rowtype; v_opp public.crm_opportunities%rowtype; v_code text; v_revenue numeric; v_result jsonb;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found.'; end if;
  if v_q.opportunity_id is not null then select * into v_opp from public.crm_opportunities where id=v_q.opportunity_id; end if;
  select qi.product_code_snapshot into v_code from public.quotation_items qi
  where qi.quotation_id=p_quotation_id and qi.optional_for_client=false and qi.line_type='product'
    and lower(coalesce(qi.item_type,'')) in ('package','discovery','custom')
  order by qi.sort_order,qi.created_at limit 1;
  v_code:=coalesce(nullif(v_code,''),'CUSTOM');
  v_revenue:=greatest(0,coalesce(v_q.total,0)-coalesce(v_q.tax_total,0));
  v_result:=public.revenue_distribution_calculate_internal(v_revenue,v_q.currency,v_code,coalesce(v_opp.self_generated,false),v_q.approved_commission_rate);
  return v_result||jsonb_build_object('quotationId',v_q.id,'quotationNumber',v_q.quotation_number,'opportunityId',v_q.opportunity_id,'selfGeneratedLead',coalesce(v_opp.self_generated,false),'taxExcludedAmount',coalesce(v_q.tax_total,0));
end;
$$;

create or replace function public.revenue_distribution_preview_quotation(p_quotation_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $$
declare v_q public.quotations%rowtype;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found.'; end if;
  if not public.is_admin() and v_q.salesperson_id is distinct from auth.uid() and not public.has_active_role(array['project_manager']) then raise exception 'Unauthorized.'; end if;
  return public.revenue_distribution_quotation_internal(p_quotation_id);
end;
$$;

create table if not exists public.revenue_distribution_snapshots(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete restrict,
  quotation_id uuid references public.quotations(id) on delete set null,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  product_code text,
  currency text not null,
  commissionable_revenue numeric(14,2) not null,
  target_margin_percent numeric(8,4) not null,
  minimum_margin_percent numeric(8,4) not null,
  projected_margin_percent numeric(8,4) not null,
  seller_reserve_amount numeric(14,2) not null default 0,
  sales_talent_partner_reserve_amount numeric(14,2) not null default 0,
  delivery_talent_partner_reserve_amount numeric(14,2) not null default 0,
  delivery_pool_amount numeric(14,2) not null default 0,
  company_contribution_amount numeric(14,2) not null default 0,
  role_allocations jsonb not null default '[]'::jsonb,
  calculation jsonb not null,
  config_version integer not null,
  calculation_version integer not null default 2,
  created_at timestamptz not null default now()
);
create index if not exists revenue_distribution_snapshots_quotation_idx on public.revenue_distribution_snapshots(quotation_id);
create index if not exists revenue_distribution_snapshots_opportunity_idx on public.revenue_distribution_snapshots(opportunity_id);
alter table public.revenue_distribution_snapshots enable row level security;
drop policy if exists revenue_distribution_snapshots_admin_select on public.revenue_distribution_snapshots;
create policy revenue_distribution_snapshots_admin_select on public.revenue_distribution_snapshots for select to authenticated using(public.is_admin());

create or replace function public.capture_revenue_distribution_snapshot_for_project(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_project public.projects%rowtype; v_q public.quotations%rowtype; v_calc jsonb; v_code text; v_id uuid; v_revenue numeric;
begin
  select id into v_id from public.revenue_distribution_snapshots where project_id=p_project_id;
  if v_id is not null then return v_id; end if;
  select * into v_project from public.projects where id=p_project_id;
  if not found or v_project.quotation_id is null then return null; end if;
  select * into v_q from public.quotations where id=v_project.quotation_id;
  if not found then return null; end if;
  select qi.product_code_snapshot into v_code from public.quotation_items qi
  where qi.quotation_id=v_q.id and qi.optional_for_client=false and qi.line_type='product'
    and lower(coalesce(qi.item_type,'')) in ('package','discovery','custom')
  order by qi.sort_order,qi.created_at limit 1;
  v_code:=coalesce(nullif(v_code,''),'CUSTOM');
  v_revenue:=greatest(0,coalesce(v_q.total,0)-coalesce(v_q.tax_total,0));
  if v_revenue<=0 then return null; end if;
  v_calc:=public.revenue_distribution_quotation_internal(v_q.id);
  insert into public.revenue_distribution_snapshots(
    project_id,quotation_id,opportunity_id,product_code,currency,commissionable_revenue,target_margin_percent,minimum_margin_percent,projected_margin_percent,
    seller_reserve_amount,sales_talent_partner_reserve_amount,delivery_talent_partner_reserve_amount,delivery_pool_amount,company_contribution_amount,
    role_allocations,calculation,config_version,calculation_version
  ) values(
    v_project.id,v_q.id,v_q.opportunity_id,v_code,v_q.currency,v_revenue,
    (v_calc->>'targetMarginPercent')::numeric,(v_calc->>'minimumMarginPercent')::numeric,(v_calc->'company'->>'marginPercent')::numeric,
    (v_calc->'seller'->>'totalReservedAmount')::numeric,(v_calc->'salesTalentPartner'->>'reserveAmount')::numeric,(v_calc->'delivery'->>'talentPartnerReserveAmount')::numeric,
    (v_calc->'delivery'->>'poolAmount')::numeric,(v_calc->'company'->>'contributionAmount')::numeric,
    coalesce(v_calc->'delivery'->'roles','[]'::jsonb),v_calc,coalesce((v_calc->>'configVersion')::integer,1),coalesce((v_calc->>'calculationVersion')::integer,2)
  ) on conflict(project_id) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.revenue_distribution_snapshots where project_id=p_project_id; end if;
  return v_id;
end;
$$;

create or replace function public.capture_revenue_distribution_snapshot_project_trigger()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
begin
  perform public.capture_revenue_distribution_snapshot_for_project(new.id);
  return new;
end;
$$;
drop trigger if exists trg_capture_revenue_distribution_snapshot on public.projects;
create trigger trg_capture_revenue_distribution_snapshot after insert on public.projects for each row execute function public.capture_revenue_distribution_snapshot_project_trigger();

create or replace function public.admin_revenue_distribution_dashboard()
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $$
declare v_products jsonb; v_snapshots jsonb;
begin
  if not public.is_admin() then raise exception 'Admin permission required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'productId',sp.id,'code',sp.code,'name',sp.name,'productType',sp.product_type,'priceMode',sp.price_mode,'price',sp.base_price,'currency',sp.currency,
    'companyLead',case when coalesce(sp.base_price,0)>0 then public.revenue_distribution_calculate_internal(sp.base_price,sp.currency,sp.code,false,null) else null end,
    'selfGeneratedLead',case when coalesce(sp.base_price,0)>0 then public.revenue_distribution_calculate_internal(sp.base_price,sp.currency,sp.code,true,null) else null end
  ) order by sp.sort_order,sp.name),'[]'::jsonb) into v_products
  from public.sales_products sp where sp.active=true and sp.product_type in ('package','discovery','custom');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_snapshots from (
    select r.id,r.project_id,p.project_name,r.quotation_id,q.quotation_number,r.product_code,r.currency,r.commissionable_revenue,r.projected_margin_percent,
      r.delivery_pool_amount,r.company_contribution_amount,r.seller_reserve_amount,r.sales_talent_partner_reserve_amount,r.delivery_talent_partner_reserve_amount,r.role_allocations,r.config_version,r.created_at
    from public.revenue_distribution_snapshots r
    left join public.projects p on p.id=r.project_id left join public.quotations q on q.id=r.quotation_id
    order by r.created_at desc limit 100
  ) x;
  return jsonb_build_object('config',public.revenue_distribution_config(),'products',v_products,'recentSnapshots',v_snapshots);
end;
$$;

-- Feed the central margin guard into the existing quotation approval mechanism.
create or replace function public.quotation_cpq_approval_reasons(p_quotation_id uuid)
returns text[]
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $$
declare
  v_q public.quotations%rowtype;
  v_cfg jsonb:=public.quotation_cpq_settings_safe();
  v_auto numeric:=coalesce((v_cfg->>'autoApprovalDiscountPercent')::numeric,5);
  v_tax numeric:=coalesce((v_cfg->>'taxRate')::numeric,0);
  v_reasons text[]:='{}'::text[];
  v_timeline_missing text[]:='{}'::text[];
  v_name text; v_standard text; v_effective numeric; v_base numeric; v_dist jsonb;
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

  begin
    v_dist:=public.revenue_distribution_quotation_internal(p_quotation_id);
    if coalesce((v_dist->>'requiresApproval')::boolean,false) then
      v_reasons:=array_append(v_reasons,'Projected ProFox contribution margin is '||coalesce(v_dist->'company'->>'marginPercent','0')||'%, below or outside the protected minimum policy of '||coalesce(v_dist->>'minimumMarginPercent','0')||'%. Review price, scope, commissions or distribution before approval.');
    end if;
  exception when others then
    v_reasons:=array_append(v_reasons,'Revenue distribution and margin check requires Admin review: '||sqlerrm);
  end;
  return v_reasons;
end;
$$;

create or replace function public.get_quotation_cpq_summary(p_quotation_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $$
declare
  v_q public.quotations%rowtype; v_presentation jsonb; v_payment jsonb; v_reasons text[]; v_missing text[]:='{}'::text[];
  v_timeline_missing text[]:='{}'::text[]; v_name text; v_has_scope boolean; v_email_ok boolean; v_expiry_ok boolean;
  v_payment_ok boolean; v_timeline_ok boolean; v_ready boolean; v_reviewer_name text; v_distribution jsonb;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found.'; end if;
  if not public.is_admin() and v_q.salesperson_id is distinct from auth.uid() and not public.has_active_role(array['project_manager','site_manager']) and not public.quotation_approval_reviewer_authorized(p_quotation_id,auth.uid()) then raise exception 'Unauthorized.'; end if;
  v_presentation:=public.quotation_presentation_payload(p_quotation_id); v_payment:=v_presentation->'paymentPlan';
  v_reasons:=public.quotation_cpq_approval_reasons(p_quotation_id); v_timeline_missing:=public.quotation_timeline_missing_items(p_quotation_id);
  v_distribution:=public.revenue_distribution_quotation_internal(p_quotation_id);
  select exists(select 1 from public.quotation_items where quotation_id=p_quotation_id and line_type in ('product','custom') and optional_for_client=false) into v_has_scope;
  v_email_ok:=coalesce(v_q.email,'')~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'; v_expiry_ok:=v_q.valid_until is not null and v_q.valid_until>=current_date;
  v_payment_ok:=coalesce(v_payment->>'error','')='' and jsonb_typeof(v_payment->'schedule')='array' and jsonb_array_length(v_payment->'schedule')>0;
  v_timeline_ok:=cardinality(v_timeline_missing)=0 and nullif(btrim(coalesce(v_q.duration_snapshot_text,'')),'') is not null;
  if v_q.opportunity_id is null then v_missing:=array_append(v_missing,'CRM Opportunity linked'); end if;
  if not v_email_ok then v_missing:=array_append(v_missing,'Customer email available'); end if;
  if not v_has_scope then v_missing:=array_append(v_missing,'At least one committed product/service'); end if;
  if coalesce(v_q.total,0)<=0 then v_missing:=array_append(v_missing,'Pricing valid'); end if;
  foreach v_name in array v_timeline_missing loop v_missing:=array_append(v_missing,'Timeline missing for "'||v_name||'"'); end loop;
  if not v_payment_ok then v_missing:=array_append(v_missing,'Payment schedule valid'); end if;
  if v_q.status<>'Approved' then v_missing:=array_append(v_missing,'Required approval completed'); end if;
  if not v_expiry_ok then v_missing:=array_append(v_missing,'Expiration date valid'); end if;
  if v_q.superseded_by_id is not null then v_missing:=array_append(v_missing,'Current revision'); end if;
  v_ready:=cardinality(v_missing)=0;
  select coalesce(nullif(full_name,''),email,'') into v_reviewer_name from public.user_profiles where id=v_q.approval_decided_by;
  return jsonb_build_object(
    'presentation',v_presentation,'revenueDistribution',v_distribution,
    'approval',jsonb_build_object('required',cardinality(v_reasons)>0,'reasons',to_jsonb(v_reasons),'requestedReasons',v_q.approval_reasons_snapshot,'status',v_q.status,'route',v_q.approval_route,'reason',v_q.approval_reason,'requestedAt',v_q.approval_requested_at,'decision',v_q.approval_decision,'decisionNote',v_q.approval_decision_note,'decidedAt',v_q.approval_decided_at,'reviewerName',coalesce(v_reviewer_name,'')),
    'readiness',jsonb_build_object('readyToSend',v_ready,'missing',to_jsonb(v_missing),'timelineIssues',to_jsonb(v_timeline_missing),'opportunityLinked',v_q.opportunity_id is not null,'emailAvailable',v_email_ok,'hasProductOrService',v_has_scope,'pricingValid',coalesce(v_q.total,0)>0,'timelineConfirmed',v_timeline_ok,'paymentScheduleValid',v_payment_ok,'approvalCompleted',v_q.status='Approved','expirationValid',v_expiry_ok,'currentRevision',v_q.superseded_by_id is null),
    'views',jsonb_build_object('firstViewedAt',v_q.first_viewed_at,'lastViewedAt',v_q.last_viewed_at,'viewCount',v_q.view_count)
  );
end;
$$;

-- Backfill immutable project economics for existing projects that already have a quotation.
do $$
declare r record;
begin
  for r in select id from public.projects where quotation_id is not null loop
    begin perform public.capture_revenue_distribution_snapshot_for_project(r.id); exception when others then null; end;
  end loop;
end $$;

revoke all on function public.revenue_distribution_calculate_internal(numeric,text,text,boolean,numeric) from public,anon,authenticated;
revoke all on function public.revenue_distribution_product_internal(text,numeric,boolean) from public,anon,authenticated;
revoke all on function public.revenue_distribution_quotation_internal(uuid) from public,anon,authenticated;
revoke all on function public.capture_revenue_distribution_snapshot_for_project(uuid) from public,anon,authenticated;
revoke all on function public.capture_revenue_distribution_snapshot_project_trigger() from public,anon,authenticated;
grant execute on function public.revenue_distribution_config() to authenticated;
grant execute on function public.admin_save_revenue_distribution_config(jsonb) to authenticated;
grant execute on function public.revenue_distribution_preview_product(text,numeric) to authenticated;
grant execute on function public.revenue_distribution_preview_quotation(uuid) to authenticated;
grant execute on function public.admin_revenue_distribution_dashboard() to authenticated;

-- Hardening for the central revenue-distribution engine.
-- Fixes cent-rounding boundaries, reserves sales retention liability, separates recurring Care Plan revenue,
-- validates configurable Talent Partner role slugs, and makes project role budgets authoritative for worker assignments.

-- Keep configuration extensible but reject broken job references before they can silently disable reserves.
create or replace function public.validate_revenue_distribution_config_row()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_cfg jsonb:=new.config_value;
  v_roles jsonb:=coalesce(v_cfg->'deliveryRoles','[]'::jsonb);
  v_role jsonb;
  v_slug text;
  v_sales_slug text:=coalesce(nullif(btrim(v_cfg->>'salesTalentPartnerJobSlug'),''),'independent-sales-representative');
begin
  if new.config_key<>'revenue_distribution_v1' then return new; end if;

  if not exists(select 1 from public.career_jobs where slug=v_sales_slug) then
    raise exception 'Revenue distribution Sales Talent Partner job slug does not exist: %',v_sales_slug;
  end if;
  if exists(
    select 1 from public.talent_partner_reward_plans rp
    join public.career_jobs j on j.id=rp.career_job_id
    where j.slug=v_sales_slug and rp.enabled and rp.reward_model<>'sales'
  ) then
    raise exception 'The configured Sales Talent Partner job must use a sales reward plan.';
  end if;

  if jsonb_typeof(v_roles)<>'array' then raise exception 'Revenue distribution deliveryRoles must be an array.'; end if;
  for v_role in select value from jsonb_array_elements(v_roles) loop
    v_slug:=nullif(btrim(coalesce(v_role->>'talentPartnerJobSlug','')),'');
    if v_slug is not null then
      if not exists(select 1 from public.career_jobs where slug=v_slug) then
        raise exception 'Revenue distribution Talent Partner job slug does not exist: %',v_slug;
      end if;
      if exists(
        select 1 from public.talent_partner_reward_plans rp
        join public.career_jobs j on j.id=rp.career_job_id
        where j.slug=v_slug and rp.enabled and rp.reward_model<>'project'
      ) then
        raise exception 'Delivery Talent Partner job % must use a project reward plan.',v_slug;
      end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_validate_revenue_distribution_config on public.system_configuration;
create trigger trg_validate_revenue_distribution_config
before insert or update on public.system_configuration
for each row when (new.config_key='revenue_distribution_v1')
execute function public.validate_revenue_distribution_config_row();

-- Recalculate economics with a cent-safe margin boundary and a pro-rata reserve for the one-time sales retention reward.
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
  v_self_uses_buffer boolean:=coalesce((v_cfg->>'selfGeneratedBonusUsesMarginBuffer')::boolean,true);
  v_sales_tp_slug text:=coalesce(nullif(v_cfg->>'salesTalentPartnerJobSlug',''),'independent-sales-representative');
  v_sales_plan public.talent_partner_reward_plans%rowtype;
  v_reward jsonb;
  v_sales_tp_percent numeric:=0;
  v_sales_tp_fixed numeric:=0;
  v_sales_tp_event_amount numeric:=0;
  v_sales_retention_total numeric:=0;
  v_sales_retention_per_sale numeric:=0;
  v_sales_tp_amount numeric:=0;
  v_sales_qualifying_count integer:=1;
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
  v_min_amount numeric:=0;
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

  select * into v_rule
  from public.commission_rules
  where upper(product_code)=upper(coalesce(p_product_code,'')) and enabled=true
  limit 1;
  if found then
    if coalesce(v_rule.requires_admin_rate,false) then
      if p_approved_commission_rate is not null
         and p_approved_commission_rate between coalesce(v_rule.min_rate_percent,0) and coalesce(v_rule.max_rate_percent,100) then
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
    if coalesce((v_cfg->>'reservePerformanceBonus')::boolean,true) then
      v_perf_rate:=coalesce(v_commission_settings.performance_bonus_percent,0);
    end if;
    if coalesce(p_self_generated,false) then
      v_self_rate:=coalesce(v_commission_settings.self_generated_bonus_percent,0);
    end if;
  end if;
  v_base_amount:=round(v_revenue*v_base_rate/100.0,2);
  v_perf_amount:=round(v_revenue*v_perf_rate/100.0,2);
  v_self_amount:=round(v_revenue*v_self_rate/100.0,2);

  select rp.* into v_sales_plan
  from public.talent_partner_reward_plans rp
  join public.career_jobs j on j.id=rp.career_job_id
  where rp.enabled=true and rp.reward_model='sales' and j.slug=v_sales_tp_slug
  order by rp.updated_at desc nulls last
  limit 1;

  if found then
    v_plan_currency:=upper(coalesce(v_sales_plan.currency,v_currency));
    v_sales_qualifying_count:=greatest(1,least(3,coalesce(v_sales_plan.qualifying_event_count,3)));
    for v_reward in select value from jsonb_array_elements(coalesce(v_sales_plan.event_rewards,'[]'::jsonb)) loop
      if lower(coalesce(v_reward->>'kind',''))='percent' then
        v_sales_tp_percent:=greatest(v_sales_tp_percent,coalesce((v_reward->>'ratePercent')::numeric,0));
      elsif lower(coalesce(v_reward->>'kind',''))='fixed' then
        if v_plan_currency=v_currency then
          v_sales_tp_fixed:=greatest(v_sales_tp_fixed,coalesce((v_reward->>'fixedAmount')::numeric,0));
        else
          v_review:=v_review||jsonb_build_array('Sales Talent Partner fixed reward currency differs from quotation currency and requires Finance review.');
        end if;
      end if;
    end loop;

    if coalesce(v_sales_plan.retention_enabled,false) then
      if lower(coalesce(v_sales_plan.retention_reward_kind,''))='fixed' then
        if v_plan_currency=v_currency then
          v_sales_retention_total:=greatest(0,coalesce(v_sales_plan.retention_fixed_amount,0));
          v_sales_retention_per_sale:=round(v_sales_retention_total/v_sales_qualifying_count,2);
        else
          v_review:=v_review||jsonb_build_array('Sales Talent Partner retention reward currency differs from quotation currency and requires Finance review.');
        end if;
      elsif lower(coalesce(v_sales_plan.retention_reward_kind,''))='percent'
            and coalesce(v_sales_plan.retention_rate_percent,0)>0 then
        v_review:=v_review||jsonb_build_array('Sales Talent Partner retention reward is salary-percentage based, so its future liability cannot be priced safely from quotation revenue. Finance review is required.');
      end if;
    end if;
  end if;

  v_sales_tp_event_amount:=round(v_revenue*v_sales_tp_percent/100.0+v_sales_tp_fixed,2);
  v_sales_tp_amount:=round(v_sales_tp_event_amount+v_sales_retention_per_sale,2);

  for v_role in select value from jsonb_array_elements(v_delivery_roles) loop
    v_role_weight:=coalesce((v_role->>'weightPercent')::numeric,0);
    v_role_slug:=nullif(btrim(coalesce(v_role->>'talentPartnerJobSlug','')),'');
    v_role_tp_percent:=0;
    v_role_tp_fixed:=0;
    if v_role_slug is not null then
      select rp.* into v_role_plan
      from public.talent_partner_reward_plans rp
      join public.career_jobs j on j.id=rp.career_job_id
      where rp.enabled=true and rp.reward_model='project' and j.slug=v_role_slug
      order by rp.updated_at desc nulls last
      limit 1;
      if found then
        v_plan_currency:=upper(coalesce(v_role_plan.currency,v_currency));
        for v_reward in select value from jsonb_array_elements(coalesce(v_role_plan.event_rewards,'[]'::jsonb)) loop
          if lower(coalesce(v_reward->>'kind',''))='percent' then
            v_role_tp_percent:=greatest(v_role_tp_percent,coalesce((v_reward->>'ratePercent')::numeric,0));
          elsif lower(coalesce(v_reward->>'kind',''))='fixed' then
            if v_plan_currency=v_currency then
              v_role_tp_fixed:=greatest(v_role_tp_fixed,coalesce((v_reward->>'fixedAmount')::numeric,0));
            else
              v_review:=v_review||jsonb_build_array('A delivery Talent Partner fixed reward currency differs from quotation currency and requires Finance review.');
            end if;
          end if;
        end loop;
      end if;
    end if;
    v_tp_factor:=v_tp_factor+(v_role_weight/100.0)*(v_role_tp_percent/100.0);
    v_delivery_fixed:=v_delivery_fixed+v_role_tp_fixed;
  end loop;

  v_target_amount:=round(v_revenue*v_target/100.0,2);
  v_min_amount:=round(v_revenue*v_min/100.0,2);
  v_available:=v_revenue-v_target_amount-v_base_amount-v_perf_amount-v_sales_tp_amount-v_delivery_fixed;
  if coalesce(p_self_generated,false) and not v_self_uses_buffer then
    v_available:=v_available-v_self_amount;
  end if;
  if v_available>0 then
    v_delivery_pool:=round(v_available/(1+v_tp_factor),2);
  else
    v_delivery_pool:=0;
  end if;
  v_delivery_tp_percent_amount:=round(v_delivery_pool*v_tp_factor,2);
  v_delivery_tp_total:=round(v_delivery_fixed+v_delivery_tp_percent_amount,2);

  for v_role in select value from jsonb_array_elements(v_delivery_roles) loop
    v_role_key:=v_role->>'key';
    v_role_label:=v_role->>'label';
    v_role_weight:=(v_role->>'weightPercent')::numeric;
    v_role_slug:=nullif(btrim(coalesce(v_role->>'talentPartnerJobSlug','')),'');
    v_role_tp_percent:=0;
    v_role_tp_fixed:=0;
    if v_role_slug is not null then
      select rp.* into v_role_plan
      from public.talent_partner_reward_plans rp
      join public.career_jobs j on j.id=rp.career_job_id
      where rp.enabled=true and rp.reward_model='project' and j.slug=v_role_slug
      order by rp.updated_at desc nulls last
      limit 1;
      if found then
        for v_reward in select value from jsonb_array_elements(coalesce(v_role_plan.event_rewards,'[]'::jsonb)) loop
          if lower(coalesce(v_reward->>'kind',''))='percent' then
            v_role_tp_percent:=greatest(v_role_tp_percent,coalesce((v_reward->>'ratePercent')::numeric,0));
          elsif lower(coalesce(v_reward->>'kind',''))='fixed'
                and upper(coalesce(v_role_plan.currency,v_currency))=v_currency then
            v_role_tp_fixed:=greatest(v_role_tp_fixed,coalesce((v_reward->>'fixedAmount')::numeric,0));
          end if;
        end loop;
      end if;
    end if;
    v_role_budget:=round(v_delivery_pool*v_role_weight/100.0,2);
    v_roles_out:=v_roles_out||jsonb_build_array(jsonb_build_object(
      'key',v_role_key,
      'label',v_role_label,
      'weightPercent',v_role_weight,
      'budgetAmount',v_role_budget,
      'talentPartnerJobSlug',v_role_slug,
      'talentPartnerMaxPercent',v_role_tp_percent,
      'talentPartnerFixedReserve',v_role_tp_fixed,
      'talentPartnerReserveAmount',round(v_role_budget*v_role_tp_percent/100.0+v_role_tp_fixed,2)
    ));
  end loop;

  v_company_amount:=round(v_revenue-v_base_amount-v_perf_amount-v_self_amount-v_sales_tp_amount-v_delivery_pool-v_delivery_tp_total,2);
  v_margin:=round(v_company_amount/v_revenue*100.0,4);
  v_buffer:=round(v_margin-v_min,4);

  -- Compare money to money with one-cent tolerance. This prevents 39.9996% from failing an exact 40% policy after cent rounding.
  if v_company_amount+0.01>=v_target_amount then
    v_health:='healthy';
  elsif v_company_amount+0.01>=v_min_amount then
    v_health:='acceptable';
  else
    v_health:='approval_required';
  end if;
  if v_delivery_pool<=0 then
    v_health:='approval_required';
    v_review:=v_review||jsonb_build_array('No positive delivery pool remains after protected margin and reward reserves.');
  end if;
  if jsonb_array_length(v_review)>0 then v_health:='approval_required'; end if;

  return jsonb_build_object(
    'success',true,
    'calculationVersion',3,
    'config',v_cfg,
    'configVersion',coalesce((v_cfg->>'version')::integer,1),
    'currency',v_currency,
    'productCode',upper(coalesce(p_product_code,'')),
    'commissionableRevenue',round(v_revenue,2),
    'targetMarginPercent',v_target,
    'minimumMarginPercent',v_min,
    'seller',jsonb_build_object(
      'baseRatePercent',v_base_rate,
      'performanceReservePercent',v_perf_rate,
      'selfGeneratedBonusPercent',v_self_rate,
      'baseAmount',v_base_amount,
      'performanceReserveAmount',v_perf_amount,
      'selfGeneratedBonusAmount',v_self_amount,
      'selfGeneratedBonusUsesMarginBuffer',v_self_uses_buffer,
      'totalReservedAmount',round(v_base_amount+v_perf_amount+v_self_amount,2)
    ),
    'salesTalentPartner',jsonb_build_object(
      'jobSlug',v_sales_tp_slug,
      'maxPercent',v_sales_tp_percent,
      'fixedReserve',v_sales_tp_fixed,
      'eventReserveAmount',v_sales_tp_event_amount,
      'retentionEnabled',coalesce(v_sales_plan.retention_enabled,false),
      'retentionMonths',case when coalesce(v_sales_plan.retention_enabled,false) then v_sales_plan.retention_months else null end,
      'retentionTotalReserve',v_sales_retention_total,
      'retentionReservePerQualifyingSale',v_sales_retention_per_sale,
      'reserveAmount',v_sales_tp_amount
    ),
    'delivery',jsonb_build_object(
      'poolAmount',v_delivery_pool,
      'roles',v_roles_out,
      'talentPartnerReserveAmount',v_delivery_tp_total,
      'talentPartnerPercentReserveAmount',v_delivery_tp_percent_amount,
      'talentPartnerFixedReserveAmount',round(v_delivery_fixed,2)
    ),
    'company',jsonb_build_object(
      'contributionAmount',v_company_amount,
      'marginPercent',v_margin,
      'marginBufferAboveMinimumPercent',v_buffer
    ),
    'health',v_health,
    'requiresApproval',v_health='approval_required',
    'manualReviewReasons',v_review,
    'policyNotes',jsonb_build_array(
      'Seller performance bonus is conservatively reserved when enabled in Admin configuration.',
      'Self-generated seller bonus uses the target-to-minimum margin buffer only when that policy switch is enabled.',
      'The configured one-time Sales Talent Partner retention reward is amortized across the configured qualifying sales so the liability is funded once, not once per sale.',
      'Talent Partner event reserves are conservative maxima; actual rewards remain controlled by the existing qualifying reward engine.',
      'Delivery role amounts are hard project budget allocations. Existing worker assignment, quality approval and earning controls remain authoritative for actual payable earnings.'
    )
  );
end;
$$;

-- Quotation economics only use one-time committed scope. Monthly Care Plans are reported separately and never inflate a one-time project delivery pool.
create or replace function public.revenue_distribution_quotation_internal(p_quotation_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $$
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
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found.'; end if;
  if v_q.opportunity_id is not null then
    select * into v_opp from public.crm_opportunities where id=v_q.opportunity_id;
  end if;

  select qi.product_code_snapshot into v_code
  from public.quotation_items qi
  where qi.quotation_id=p_quotation_id
    and qi.optional_for_client=false
    and qi.line_type='product'
    and lower(coalesce(qi.item_type,'')) in ('package','discovery','custom')
  order by qi.sort_order,qi.created_at
  limit 1;
  v_code:=coalesce(nullif(v_code,''),'CUSTOM');

  select
    coalesce(sum(qi.line_total) filter(where lower(coalesce(qi.item_type,''))<>'care_plan'),0),
    coalesce(sum(qi.line_total) filter(where lower(coalesce(qi.item_type,''))='care_plan'),0)
  into v_one_time_gross,v_recurring_gross
  from public.quotation_items qi
  where qi.quotation_id=p_quotation_id
    and qi.optional_for_client=false
    and qi.line_type in ('product','custom');

  v_committed_gross:=v_one_time_gross+v_recurring_gross;
  v_quote_discount:=greatest(0,coalesce(v_q.quote_discount_total,0));
  if v_committed_gross>0 and v_quote_discount>0 then
    v_one_time_discount:=round(v_quote_discount*(v_one_time_gross/v_committed_gross),2);
    v_recurring_discount:=greatest(0,v_quote_discount-v_one_time_discount);
  end if;
  v_revenue:=greatest(0,round(v_one_time_gross-v_one_time_discount,2));
  v_recurring:=greatest(0,round(v_recurring_gross-v_recurring_discount,2));

  v_result:=public.revenue_distribution_calculate_internal(
    v_revenue,
    v_q.currency,
    v_code,
    coalesce(v_opp.self_generated,false),
    v_q.approved_commission_rate
  );

  return v_result||jsonb_build_object(
    'quotationId',v_q.id,
    'quotationNumber',v_q.quotation_number,
    'opportunityId',v_q.opportunity_id,
    'selfGeneratedLead',coalesce(v_opp.self_generated,false),
    'taxExcludedAmount',coalesce(v_q.tax_total,0),
    'oneTimeGrossBeforeQuoteDiscount',round(v_one_time_gross,2),
    'oneTimeQuoteDiscountAllocated',v_one_time_discount,
    'recurringServiceRevenue',v_recurring,
    'recurringServiceGrossBeforeQuoteDiscount',round(v_recurring_gross,2),
    'recurringQuoteDiscountAllocated',v_recurring_discount,
    'recurringServiceTreatment','separate_from_project_distribution'
  );
end;
$$;

alter table public.revenue_distribution_snapshots
  add column if not exists sales_talent_partner_retention_reserve_amount numeric(14,2) not null default 0,
  add column if not exists recurring_service_revenue numeric(14,2) not null default 0;

create or replace function public.capture_revenue_distribution_snapshot_for_project(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_project public.projects%rowtype;
  v_q public.quotations%rowtype;
  v_calc jsonb;
  v_code text;
  v_id uuid;
  v_revenue numeric;
begin
  select id into v_id from public.revenue_distribution_snapshots where project_id=p_project_id;
  if v_id is not null then return v_id; end if;

  select * into v_project from public.projects where id=p_project_id;
  if not found or v_project.quotation_id is null then return null; end if;
  select * into v_q from public.quotations where id=v_project.quotation_id;
  if not found then return null; end if;

  v_calc:=public.revenue_distribution_quotation_internal(v_q.id);
  if coalesce((v_calc->>'success')::boolean,false) is not true then return null; end if;
  v_revenue:=greatest(0,coalesce((v_calc->>'commissionableRevenue')::numeric,0));
  if v_revenue<=0 then return null; end if;
  v_code:=coalesce(nullif(v_calc->>'productCode',''),'CUSTOM');

  insert into public.revenue_distribution_snapshots(
    project_id,quotation_id,opportunity_id,product_code,currency,commissionable_revenue,target_margin_percent,minimum_margin_percent,projected_margin_percent,
    seller_reserve_amount,sales_talent_partner_reserve_amount,sales_talent_partner_retention_reserve_amount,delivery_talent_partner_reserve_amount,
    delivery_pool_amount,company_contribution_amount,recurring_service_revenue,role_allocations,calculation,config_version,calculation_version
  ) values(
    v_project.id,v_q.id,v_q.opportunity_id,v_code,v_q.currency,v_revenue,
    (v_calc->>'targetMarginPercent')::numeric,(v_calc->>'minimumMarginPercent')::numeric,(v_calc->'company'->>'marginPercent')::numeric,
    (v_calc->'seller'->>'totalReservedAmount')::numeric,
    (v_calc->'salesTalentPartner'->>'reserveAmount')::numeric,
    coalesce((v_calc->'salesTalentPartner'->>'retentionReservePerQualifyingSale')::numeric,0),
    (v_calc->'delivery'->>'talentPartnerReserveAmount')::numeric,
    (v_calc->'delivery'->>'poolAmount')::numeric,(v_calc->'company'->>'contributionAmount')::numeric,
    coalesce((v_calc->>'recurringServiceRevenue')::numeric,0),
    coalesce(v_calc->'delivery'->'roles','[]'::jsonb),v_calc,
    coalesce((v_calc->>'configVersion')::integer,1),coalesce((v_calc->>'calculationVersion')::integer,3)
  )
  on conflict(project_id) do nothing
  returning id into v_id;

  if v_id is null then select id into v_id from public.revenue_distribution_snapshots where project_id=p_project_id; end if;
  return v_id;
end;
$$;

-- Resolve current project role budget from the immutable sale snapshot.
create or replace function public.revenue_distribution_role_key_for_department(p_department text)
returns text
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $$
declare
  v_norm text:=regexp_replace(lower(coalesce(p_department,'')),'[^a-z0-9]+','','g');
  v_role jsonb;
  v_key text;
begin
  case v_norm
    when 'content' then return 'content';
    when 'contentwriter' then return 'content';
    when 'contentcreator' then return 'content';
    when 'copywriting' then return 'content';
    when 'uiux' then return 'uiux';
    when 'uiuxdesign' then return 'uiux';
    when 'designer' then return 'uiux';
    when 'design' then return 'uiux';
    when 'development' then return 'development';
    when 'developer' then return 'development';
    when 'webdevelopment' then return 'development';
    when 'webdeveloper' then return 'development';
    when 'qa' then return 'qa';
    when 'qualityassurance' then return 'qa';
    when 'projectmanagement' then return 'project_management';
    when 'projectmanager' then return 'project_management';
    when 'clientsuccess' then return 'project_management';
    else null;
  end case;

  for v_role in select value from jsonb_array_elements(coalesce(public.revenue_distribution_config()->'deliveryRoles','[]'::jsonb)) loop
    v_key:=coalesce(v_role->>'key','');
    if regexp_replace(lower(v_key),'[^a-z0-9]+','','g')=v_norm
       or regexp_replace(lower(coalesce(v_role->>'label','')),'[^a-z0-9]+','','g')=v_norm then
      return v_key;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.revenue_distribution_project_role_budget_internal(p_project_id uuid,p_role_key text,p_exclude_assignment_id uuid default null)
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $$
declare
  v_snapshot public.revenue_distribution_snapshots%rowtype;
  v_role jsonb;
  v_budget numeric:=0;
  v_used numeric:=0;
  v_currency text;
begin
  select * into v_snapshot from public.revenue_distribution_snapshots where project_id=p_project_id;
  if not found then return jsonb_build_object('found',false,'projectId',p_project_id,'roleKey',p_role_key); end if;
  v_currency:=v_snapshot.currency;

  select value into v_role
  from jsonb_array_elements(coalesce(v_snapshot.role_allocations,'[]'::jsonb))
  where value->>'key'=p_role_key
  limit 1;
  if v_role is null then return jsonb_build_object('found',false,'projectId',p_project_id,'roleKey',p_role_key,'currency',v_currency); end if;
  v_budget:=greatest(0,coalesce((v_role->>'budgetAmount')::numeric,0));

  select coalesce(sum(a.agreed_fee),0) into v_used
  from public.worker_work_assignments a
  where a.project_id=p_project_id
    and public.revenue_distribution_role_key_for_department(a.department)=p_role_key
    and a.status not in ('Cancelled','Voided','Reversed')
    and (p_exclude_assignment_id is null or a.id<>p_exclude_assignment_id);

  return jsonb_build_object(
    'found',true,
    'projectId',p_project_id,
    'roleKey',p_role_key,
    'currency',v_currency,
    'budgetAmount',round(v_budget,2),
    'committedAmount',round(v_used,2),
    'remainingAmount',round(greatest(0,v_budget-v_used),2)
  );
end;
$$;

create or replace function public.revenue_distribution_worker_assignment_budget_guard()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_role_key text;
  v_budget jsonb;
  v_remaining numeric;
  v_budget_currency text;
  v_consumes boolean;
begin
  v_role_key:=public.revenue_distribution_role_key_for_department(new.department);
  if v_role_key is null then return new; end if;

  v_budget:=public.revenue_distribution_project_role_budget_internal(new.project_id,v_role_key,case when tg_op='UPDATE' then new.id else null end);
  if coalesce((v_budget->>'found')::boolean,false) is not true then return new; end if;

  v_budget_currency:=upper(coalesce(v_budget->>'currency',''));
  if upper(coalesce(new.currency,''))<>v_budget_currency then
    raise exception 'Worker assignment currency % must match the project % budget currency %.',new.currency,v_role_key,v_budget_currency;
  end if;

  v_consumes:=new.status not in ('Cancelled','Voided','Reversed');
  if not v_consumes then return new; end if;
  v_remaining:=greatest(0,coalesce((v_budget->>'remainingAmount')::numeric,0));

  -- When no rate card/suggested amount exists, use the remaining project role budget automatically.
  if coalesce(new.agreed_fee,0)<=0 and coalesce(new.suggested_amount,0)<=0 and v_remaining>0 then
    new.suggested_amount:=v_remaining;
    new.agreed_fee:=v_remaining;
  elsif coalesce(new.agreed_fee,0)<=0 and coalesce(new.suggested_amount,0)>0 then
    new.agreed_fee:=new.suggested_amount;
  end if;

  if coalesce(new.agreed_fee,0)>v_remaining+0.01 then
    raise exception 'The % assignment exceeds its protected project role budget. Remaining % budget is % %; requested amount is % %.',
      v_role_key,v_role_key,v_budget_currency,round(v_remaining,2),v_budget_currency,round(coalesce(new.agreed_fee,0),2);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_z_revenue_distribution_worker_budget on public.worker_work_assignments;
create trigger trg_z_revenue_distribution_worker_budget
before insert or update of project_id,department,status,suggested_amount,agreed_fee,currency
on public.worker_work_assignments
for each row execute function public.revenue_distribution_worker_assignment_budget_guard();

create or replace function public.revenue_distribution_project_budget_status(p_project_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path='public','pg_temp'
as $$
declare
  v_snapshot public.revenue_distribution_snapshots%rowtype;
  v_role jsonb;
  v_roles jsonb:='[]'::jsonb;
  v_status jsonb;
begin
  select * into v_snapshot from public.revenue_distribution_snapshots where project_id=p_project_id;
  if not found then raise exception 'Revenue distribution snapshot not found for project.'; end if;
  if not public.is_admin()
     and not public.worker_compensation_is_manager(p_project_id)
     and not public.worker_compensation_is_finance() then
    raise exception 'Management or Finance permission required.';
  end if;

  for v_role in select value from jsonb_array_elements(coalesce(v_snapshot.role_allocations,'[]'::jsonb)) loop
    v_status:=public.revenue_distribution_project_role_budget_internal(p_project_id,v_role->>'key',null);
    v_roles:=v_roles||jsonb_build_array(v_role||jsonb_build_object(
      'committedAmount',coalesce((v_status->>'committedAmount')::numeric,0),
      'remainingAmount',coalesce((v_status->>'remainingAmount')::numeric,0)
    ));
  end loop;

  return jsonb_build_object(
    'projectId',p_project_id,
    'currency',v_snapshot.currency,
    'commissionableRevenue',v_snapshot.commissionable_revenue,
    'projectedMarginPercent',v_snapshot.projected_margin_percent,
    'deliveryPoolAmount',v_snapshot.delivery_pool_amount,
    'recurringServiceRevenue',v_snapshot.recurring_service_revenue,
    'roles',v_roles,
    'snapshotCreatedAt',v_snapshot.created_at
  );
end;
$$;

-- Internal helpers remain inaccessible directly to browser roles.
revoke all on function public.validate_revenue_distribution_config_row() from public,anon,authenticated;
revoke all on function public.revenue_distribution_calculate_internal(numeric,text,text,boolean,numeric) from public,anon,authenticated;
revoke all on function public.revenue_distribution_quotation_internal(uuid) from public,anon,authenticated;
revoke all on function public.capture_revenue_distribution_snapshot_for_project(uuid) from public,anon,authenticated;
revoke all on function public.revenue_distribution_role_key_for_department(text) from public,anon,authenticated;
revoke all on function public.revenue_distribution_project_role_budget_internal(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.revenue_distribution_worker_assignment_budget_guard() from public,anon,authenticated;
grant execute on function public.revenue_distribution_project_budget_status(uuid) to authenticated;

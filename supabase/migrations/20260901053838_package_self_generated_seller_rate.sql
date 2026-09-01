-- Package rules now own both fixed seller outcomes:
--   1. company/assigned lead rate; and
--   2. total self-generated lead rate before any performance accelerator.
-- Existing commission entries remain immutable snapshots.

alter table public.commission_rules
  add column if not exists self_generated_rate_percent numeric;

update public.commission_rules r
set self_generated_rate_percent=greatest(
  coalesce(r.base_rate_percent,0),
  coalesce(r.max_rate_percent,r.base_rate_percent,0),
  coalesce(r.base_rate_percent,0)+coalesce((
    select s.self_generated_bonus_percent
    from public.commission_settings s
    where s.id='default'
  ),0)
)
where r.self_generated_rate_percent is null;

alter table public.commission_rules
  alter column self_generated_rate_percent set default 15,
  alter column self_generated_rate_percent set not null;

alter table public.commission_rules
  drop constraint if exists commission_rules_self_generated_rate_check;
alter table public.commission_rules
  add constraint commission_rules_self_generated_rate_check
  check (
    self_generated_rate_percent between 0 and 50
    and self_generated_rate_percent>=greatest(base_rate_percent,max_rate_percent)
  );

comment on column public.commission_rules.self_generated_rate_percent is
  'Fixed total seller percentage for a truthfully self-generated lead, before any performance bonus.';

create or replace function public.generate_commission_for_verified_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_pay public.payments%rowtype;
  v_quote public.quotations%rowtype;
  v_opp public.crm_opportunities%rowtype;
  v_rule public.commission_rules%rowtype;
  v_set public.commission_settings%rowtype;
  v_item record;
  v_existing uuid;
  v_first_rank int;
  v_rank int;
  v_base numeric;
  v_self numeric:=0;
  v_self_total numeric:=0;
  v_perf numeric:=0;
  v_rate numeric;
  v_amount numeric;
  v_status text:='Earned';
  v_new uuid;
  v_gateway boolean:=coalesce(current_setting('profox.gateway_settlement',true),'')='1';
begin
  if not public.is_admin() and not v_gateway then
    raise exception 'Unauthorized: commission generation is restricted to protected payment verification.';
  end if;
  select id into v_existing from public.commission_entries where payment_id=p_payment_id;
  if v_existing is not null then return v_existing; end if;
  select * into v_pay from public.payments where id=p_payment_id;
  if not found or v_pay.status<>'Verified' then raise exception 'Verified payment required.'; end if;
  if v_pay.salesperson_id is null or v_pay.quotation_id is null then return null; end if;
  select * into v_quote from public.quotations where id=v_pay.quotation_id;
  select * into v_opp from public.crm_opportunities where id=v_pay.opportunity_id;
  select qi.product_code_snapshot,qi.product_name_snapshot into v_item
  from public.quotation_items qi
  where qi.quotation_id=v_pay.quotation_id and qi.item_type='package'
  order by qi.sort_order,qi.created_at limit 1;
  if v_item.product_code_snapshot is null then return null; end if;
  select * into v_rule from public.commission_rules
  where product_code=v_item.product_code_snapshot and enabled=true;
  if not found then return null; end if;
  select * into v_set from public.commission_settings where id='default';
  v_base:=v_rule.base_rate_percent;
  if v_rule.requires_admin_rate then
    if v_quote.approved_commission_rate is null
       or v_quote.approved_commission_rate<v_rule.min_rate_percent
       or v_quote.approved_commission_rate>v_rule.max_rate_percent then
      v_status:='Under Review';
      v_base:=v_rule.min_rate_percent;
    else
      v_base:=v_quote.approved_commission_rate;
    end if;
  end if;
  if coalesce(v_opp.self_generated,false) then
    v_self_total:=greatest(v_base,coalesce(v_rule.self_generated_rate_percent,v_base+coalesce(v_set.self_generated_bonus_percent,0)));
    v_self:=v_self_total-v_base;
  else
    v_self_total:=v_base;
  end if;
  select min(sale_rank) into v_first_rank
  from public.commission_entries
  where quotation_id=v_pay.quotation_id and salesperson_id=v_pay.salesperson_id and status<>'Reversed';
  if v_first_rank is not null then
    v_rank:=v_first_rank;
  else
    select count(distinct quotation_id)+1 into v_rank
    from public.commission_entries
    where salesperson_id=v_pay.salesperson_id and status<>'Reversed' and quotation_id is not null
      and date_trunc('month',created_at)=date_trunc('month',coalesce(v_pay.verified_at,now()));
  end if;
  if v_rank>v_set.performance_threshold then v_perf:=v_set.performance_bonus_percent; end if;
  v_rate:=v_base+v_self+v_perf;
  v_amount:=round((coalesce(nullif(v_pay.amount_paid,0),v_pay.amount_due)*v_rate/100.0)::numeric,2);
  insert into public.commission_entries(
    payment_id,quotation_id,opportunity_id,client_id,salesperson_id,product_code,product_name,
    verified_payment_amount,currency,base_rate_percent,self_generated_bonus_percent,
    performance_bonus_percent,effective_rate_percent,commission_amount,sale_rank,status,rule_snapshot
  ) values (
    v_pay.id,v_pay.quotation_id,v_pay.opportunity_id,v_pay.client_id,v_pay.salesperson_id,
    v_item.product_code_snapshot,v_item.product_name_snapshot,
    coalesce(nullif(v_pay.amount_paid,0),v_pay.amount_due),v_pay.currency,v_base,v_self,v_perf,v_rate,v_amount,v_rank,v_status,
    jsonb_build_object(
      'baseRate',v_base,'selfGeneratedRate',v_self_total,'selfGeneratedBonus',v_self,
      'performanceBonus',v_perf,'saleRank',v_rank,'productCode',v_item.product_code_snapshot,'capturedAt',now()
    )
  ) returning id into v_new;
  return v_new;
end;
$function$;

-- Patch the current canonical profitability function in place. The migration
-- fails closed if the expected version is not present, preventing silent drift.
do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.revenue_distribution_calculate_internal(numeric,text,text,boolean,numeric)'::regprocedure)
  into v_definition;
  v_updated:=replace(
    v_definition,
    'v_self_rate:=coalesce(v_commission_settings.self_generated_bonus_percent,0);',
    'v_self_rate:=greatest(0,coalesce(v_rule.self_generated_rate_percent,v_base_rate+coalesce(v_commission_settings.self_generated_bonus_percent,0))-v_base_rate);'
  );
  if v_updated=v_definition then
    raise exception 'Expected self-generated profitability calculation was not found.';
  end if;
  v_updated:=replace(v_updated,'''calculationVersion'',3','''calculationVersion'',4');
  v_updated:=replace(
    v_updated,
    '''selfGeneratedBonusPercent'',v_self_rate,',
    '''selfGeneratedBonusPercent'',v_self_rate,''totalRatePercent'',v_base_rate+v_self_rate,'
  );
  execute v_updated;
end;
$migration$;

-- Keep future agreement and public-role snapshots aligned with the package rule.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_updated text;
begin
  foreach v_signature in array array[
    'public.build_sales_agreement_dynamic_snapshot(uuid)'::regprocedure,
    'public.get_public_sales_role_context(text)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_updated:=replace(
      v_definition,
      '''baseRatePercent'',r.base_rate_percent,''minRatePercent''',
      '''baseRatePercent'',r.base_rate_percent,''selfGeneratedRatePercent'',r.self_generated_rate_percent,''minRatePercent'''
    );
    if v_updated=v_definition then
      raise exception 'Expected commission schedule projection was not found in %.',v_signature;
    end if;
    execute v_updated;
  end loop;
end;
$migration$;

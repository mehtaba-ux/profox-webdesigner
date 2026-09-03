-- Automatically resolve safe payment milestones for custom quotations from their final value.
-- This migration intentionally does not alter revenue distribution, profitability, margin, or approval policy.

create or replace function public.auto_custom_quotation_payment_schedule(p_total numeric)
returns jsonb
language plpgsql
immutable
set search_path to 'public','pg_temp'
as $function$
declare
  v_total numeric := greatest(0, coalesce(p_total, 0));
begin
  if v_total <= 0 then
    raise exception 'Custom quotation total must be greater than zero before payment milestones can be generated.';
  end if;

  if v_total <= 500 then
    return jsonb_build_array(
      jsonb_build_object('milestoneNumber',1,'label','Full Payment','paymentType','Full Payment','percentage',100)
    );
  elsif v_total <= 1500 then
    return jsonb_build_array(
      jsonb_build_object('milestoneNumber',1,'label','50% Advance Payment','paymentType','Advance','percentage',50),
      jsonb_build_object('milestoneNumber',2,'label','50% Final Payment','paymentType','Final Payment','percentage',50)
    );
  elsif v_total <= 5000 then
    return jsonb_build_array(
      jsonb_build_object('milestoneNumber',1,'label','50% Advance Payment','paymentType','Advance','percentage',50),
      jsonb_build_object('milestoneNumber',2,'label','30% Design Milestone','paymentType','Design Milestone','percentage',30),
      jsonb_build_object('milestoneNumber',3,'label','20% Final Payment','paymentType','Final Payment','percentage',20)
    );
  else
    return jsonb_build_array(
      jsonb_build_object('milestoneNumber',1,'label','40% Advance Payment','paymentType','Advance','percentage',40),
      jsonb_build_object('milestoneNumber',2,'label','30% Design Milestone','paymentType','Design Milestone','percentage',30),
      jsonb_build_object('milestoneNumber',3,'label','20% Staging Milestone','paymentType','Staging Milestone','percentage',20),
      jsonb_build_object('milestoneNumber',4,'label','10% Final Payment','paymentType','Final Payment','percentage',10)
    );
  end if;
end;
$function$;

revoke all on function public.auto_custom_quotation_payment_schedule(numeric) from public;
grant execute on function public.auto_custom_quotation_payment_schedule(numeric) to authenticated, service_role;

create or replace function public.resolve_quotation_payment_schedule(p_quotation_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_count int;
  v_product record;
  v_schedule jsonb;
  v_total numeric;
  v_first_type text;
  v_cfg jsonb:=public.quotation_cpq_settings_safe();
  v_custom_count int;
  v_quotation_total numeric;
  v_auto_generated boolean:=false;
begin
  select total into v_quotation_total from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found.'; end if;

  select count(*) into v_count
  from public.quotation_items qi
  join public.sales_products sp on sp.id=qi.sales_product_id
  where qi.quotation_id=p_quotation_id
    and qi.optional_for_client=false
    and qi.line_type='product'
    and sp.product_type in ('package','discovery','custom');

  if v_count>1 then
    raise exception 'Only one primary pricing plan may be selected per quotation. Keep one package or discovery offer and add any additional services as add-ons.';
  end if;

  if v_count=1 then
    select qi.product_code_snapshot,qi.product_name_snapshot,sp.payment_schedule,sp.standard_payment_terms
    into v_product
    from public.quotation_items qi
    join public.sales_products sp on sp.id=qi.sales_product_id
    where qi.quotation_id=p_quotation_id
      and qi.optional_for_client=false
      and qi.line_type='product'
      and sp.product_type in ('package','discovery','custom')
    order by qi.sort_order,qi.created_at
    limit 1;
    v_schedule:=v_product.payment_schedule;
  else
    select count(*) into v_custom_count
    from public.quotation_items
    where quotation_id=p_quotation_id
      and optional_for_client=false
      and line_type='custom';

    if v_custom_count=0 then
      raise exception 'Quotation must contain one committed primary package or custom offer before payment can be configured.';
    end if;

    v_schedule:=coalesce(v_cfg->'customPaymentSchedule','[]'::jsonb);
    v_product.product_code_snapshot:='CUSTOM';
    v_product.product_name_snapshot:='Custom Proposal';
    v_product.standard_payment_terms:=nullif(btrim(coalesce(v_cfg->>'standardTerms','')),'');

    if v_schedule is null or jsonb_typeof(v_schedule)<>'array' or jsonb_array_length(v_schedule)=0 then
      v_schedule:=public.auto_custom_quotation_payment_schedule(v_quotation_total);
      v_product.product_code_snapshot:='CUSTOM-AUTO-V1';
      v_auto_generated:=true;
    end if;
  end if;

  if v_schedule is null or jsonb_typeof(v_schedule)<>'array' or jsonb_array_length(v_schedule)=0 then
    raise exception 'The selected offer does not have an approved payment schedule. Configure it before sending the quotation.';
  end if;

  select coalesce(sum((x->>'percentage')::numeric),0)
  into v_total
  from jsonb_array_elements(v_schedule) x;

  if round(v_total,4)<>100 then
    raise exception 'The approved payment schedule must total 100 percent.';
  end if;

  select x->>'paymentType'
  into v_first_type
  from jsonb_array_elements(v_schedule) x
  order by (x->>'milestoneNumber')::int
  limit 1;

  if v_first_type not in ('Advance','Full Payment') then
    raise exception 'The first approved payment milestone must be Advance or Full Payment so the verified sale can enter delivery.';
  end if;

  return jsonb_build_object(
    'sourceCode',v_product.product_code_snapshot,
    'sourceName',v_product.product_name_snapshot,
    'schedule',v_schedule,
    'standardPaymentTerms',v_product.standard_payment_terms,
    'autoGenerated',v_auto_generated
  );
end;
$function$;

-- Regression assertions for the automatic value tiers.
do $regression$
declare
  v jsonb;
  v_sum numeric;
begin
  v:=public.auto_custom_quotation_payment_schedule(50);
  if jsonb_array_length(v)<>1 or (v->0->>'percentage')::numeric<>100 or v->0->>'paymentType'<>'Full Payment' then
    raise exception 'Regression: USD 50 custom schedule is not 100 percent Full Payment.';
  end if;

  v:=public.auto_custom_quotation_payment_schedule(700);
  select sum((x->>'percentage')::numeric) into v_sum from jsonb_array_elements(v) x;
  if jsonb_array_length(v)<>2 or v_sum<>100 or (v->0->>'percentage')::numeric<>50 or (v->1->>'percentage')::numeric<>50 then
    raise exception 'Regression: mid-value custom schedule is invalid.';
  end if;

  v:=public.auto_custom_quotation_payment_schedule(2500);
  select sum((x->>'percentage')::numeric) into v_sum from jsonb_array_elements(v) x;
  if jsonb_array_length(v)<>3 or v_sum<>100 then
    raise exception 'Regression: growth-value custom schedule is invalid.';
  end if;

  v:=public.auto_custom_quotation_payment_schedule(6000);
  select sum((x->>'percentage')::numeric) into v_sum from jsonb_array_elements(v) x;
  if jsonb_array_length(v)<>4 or v_sum<>100 then
    raise exception 'Regression: scale-value custom schedule is invalid.';
  end if;
end;
$regression$;

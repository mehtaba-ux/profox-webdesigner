create or replace function public.admin_upsert_sales_product(p_product jsonb)
returns uuid language plpgsql security definer set search_path='public','pg_temp' as $function$
declare
  v_id uuid; v_code text:=upper(trim(coalesce(p_product->>'code',''))); v_name text:=trim(coalesce(p_product->>'name','')); v_category text:=trim(coalesce(p_product->>'category',''));
  v_product_type text:=trim(coalesce(p_product->>'product_type','')); v_price_mode text:=trim(coalesce(p_product->>'price_mode','')); v_scope jsonb:=coalesce(p_product->'scope','[]'::jsonb);
  v_public_details jsonb:=coalesce(p_product->'public_details','{}'::jsonb); v_client_expectations jsonb:=coalesce(p_product->'client_expectations','{}'::jsonb);
  v_payment_schedule jsonb:=case when p_product ? 'payment_schedule' then p_product->'payment_schedule' else null end;
  v_duration_min integer:=case when nullif(p_product->>'delivery_duration_min','') is null then null else (p_product->>'delivery_duration_min')::integer end;
  v_duration_max integer:=case when nullif(p_product->>'delivery_duration_max','') is null then null else (p_product->>'delivery_duration_max')::integer end;
  v_timeline_impact text:=coalesce(nullif(p_product->>'timeline_impact',''),case when v_product_type='care_plan' then 'parallel' when v_price_mode='custom' or v_product_type='custom' then 'assessment_required' when v_product_type='package' then 'base' when v_product_type in ('addon','discovery') then 'additive' else 'assessment_required' end);
  v_requirements jsonb; v_current_requirements jsonb; v_cfg jsonb:=public.client_onboarding_config(); v_key text;
  v_current_service_family text; v_current_template_key text; v_current_scope jsonb;
  v_service_family text; v_template_key text; v_template jsonb; v_current_source text;
  v_active boolean:=coalesce((p_product->>'active')::boolean,true);
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if v_code='' or v_name='' or v_category='' then raise exception 'Product code, name and category are required'; end if;
  if v_product_type not in ('package','addon','care_plan','discovery','custom') then raise exception 'Invalid product type'; end if;
  if v_price_mode not in ('fixed','starting_at','custom') then raise exception 'Invalid price mode'; end if;
  if v_timeline_impact not in ('base','additive','parallel','assessment_required') then raise exception 'Invalid timeline impact'; end if;
  if (v_duration_min is null)<>(v_duration_max is null) or coalesce(v_duration_min,0)<0 or (v_duration_min is not null and v_duration_max<v_duration_min) then raise exception 'Delivery duration must contain a valid minimum and maximum business-day range'; end if;
  if jsonb_typeof(v_scope)<>'array' then raise exception 'Scope must be an array'; end if;
  if jsonb_typeof(v_public_details)<>'object' then raise exception 'Public details must be an object'; end if;
  if jsonb_typeof(v_client_expectations)<>'object' then raise exception 'Client expectations must be an object'; end if;
  if exists(select 1 from jsonb_each(v_client_expectations) entry where entry.key not in ('clientResponsibilities','deliveryAssumptions','reviewAndApproval','handoverAndSupport') or jsonb_typeof(entry.value)<>'array') then raise exception 'Client expectations contain an unsupported section or non-array value'; end if;
  if exists(select 1 from jsonb_each(v_client_expectations) entry cross join lateral jsonb_array_elements(entry.value) item where jsonb_typeof(item)<>'string') then raise exception 'Each client expectation must be text'; end if;
  if v_payment_schedule is not null and jsonb_typeof(v_payment_schedule)<>'array' then raise exception 'Payment schedule must be an array'; end if;
  if coalesce((p_product->>'base_price')::numeric,0)<0 then raise exception 'Base price cannot be negative'; end if;

  if nullif(p_product->>'id','') is not null then
    select onboarding_requirements,service_family,onboarding_template_key,scope into v_current_requirements,v_current_service_family,v_current_template_key,v_current_scope from public.sales_products where id=(p_product->>'id')::uuid;
    if not found then raise exception 'Sales product not found'; end if;
    v_current_source:=coalesce(v_current_requirements->>'source','');
  end if;

  if nullif(btrim(p_product->>'service_family'),'') is not null then
    v_service_family:=btrim(p_product->>'service_family');
  elsif v_current_source='custom' and v_current_service_family is not null then
    v_service_family:=v_current_service_family;
  else
    v_service_family:=public.client_onboarding_infer_service_family(v_code,v_name,v_category,v_product_type,v_scope);
  end if;

  if nullif(btrim(p_product->>'onboarding_template_key'),'') is not null then
    v_template_key:=btrim(p_product->>'onboarding_template_key');
  elsif v_current_source='custom' and v_current_template_key is not null and v_current_service_family=v_service_family then
    v_template_key:=v_current_template_key;
  else
    v_template_key:=public.client_onboarding_infer_template_key(v_code,v_name,v_category,v_product_type,v_scope,v_service_family);
  end if;

  if not exists(select 1 from jsonb_array_elements(coalesce(v_cfg->'serviceFamilies','[]'::jsonb)) f where f->>'key'=v_service_family) then raise exception 'Unknown onboarding service family: %.',v_service_family; end if;
  select value into v_template from jsonb_array_elements(coalesce(v_cfg->'onboardingTemplates','[]'::jsonb)) where value->>'key'=v_template_key limit 1;
  if v_template is null then raise exception 'Unknown onboarding template: %.',v_template_key; end if;
  if v_template->>'family'<>v_service_family then raise exception 'Onboarding template % is not valid for service family %.',v_template_key,v_service_family; end if;

  if p_product ? 'onboarding_requirements' then
    v_requirements:=p_product->'onboarding_requirements' || jsonb_build_object('serviceFamily',v_service_family,'templateKey',v_template_key,'source','custom');
  elsif v_current_requirements is not null
        and v_current_source='custom'
        and v_current_service_family=v_service_family
        and v_current_template_key=v_template_key then
    v_requirements:=v_current_requirements || jsonb_build_object('serviceFamily',v_service_family,'templateKey',v_template_key,'source','custom');
  elsif v_current_requirements is not null
        and v_current_service_family=v_service_family
        and v_current_template_key=v_template_key
        and v_current_scope is not distinct from v_scope then
    v_requirements:=v_current_requirements || jsonb_build_object('serviceFamily',v_service_family,'templateKey',v_template_key);
  else
    v_requirements:=public.client_onboarding_template_requirements(v_template_key,v_scope,v_service_family);
  end if;

  if jsonb_typeof(v_requirements)<>'object' then raise exception 'Onboarding requirements must be an object.'; end if;
  if jsonb_typeof(coalesce(v_requirements->'fieldKeys','[]'::jsonb))<>'array' then raise exception 'Onboarding fieldKeys must be an array.'; end if;
  if v_requirements ? 'customFields' and jsonb_typeof(v_requirements->'customFields')<>'array' then raise exception 'Onboarding customFields must be an array.'; end if;
  if v_active and jsonb_array_length(coalesce(v_requirements->'fieldKeys','[]'::jsonb))=0 and jsonb_array_length(case when jsonb_typeof(v_requirements->'customFields')='array' then v_requirements->'customFields' else '[]'::jsonb end)=0 then raise exception 'An active catalog product must define at least one onboarding requirement.'; end if;
  for v_key in select value from jsonb_array_elements_text(coalesce(v_requirements->'fieldKeys','[]'::jsonb)) loop if not exists(select 1 from jsonb_array_elements(coalesce(v_cfg->'fieldLibrary','[]'::jsonb)) f where f->>'key'=v_key) then raise exception 'Unknown onboarding field key: %.',v_key; end if; end loop;

  if nullif(p_product->>'id','') is null then
    insert into public.sales_products(code,name,category,product_type,price_mode,base_price,currency,billing_period,short_description,full_description,scope,technology,manager_approval_required,active,sort_order,standard_payment_terms,payment_schedule,public_visible,public_details,client_expectations,delivery_duration_min,delivery_duration_max,delivery_duration_unit,timeline_impact,delivery_duration_note,onboarding_requirements,service_family,onboarding_template_key,updated_at)
    values(v_code,v_name,v_category,v_product_type,v_price_mode,coalesce((p_product->>'base_price')::numeric,0),coalesce(nullif(p_product->>'currency',''),'USD'),nullif(p_product->>'billing_period',''),nullif(p_product->>'short_description',''),nullif(p_product->>'full_description',''),v_scope,nullif(p_product->>'technology',''),coalesce((p_product->>'manager_approval_required')::boolean,false),v_active,coalesce((p_product->>'sort_order')::integer,0),nullif(p_product->>'standard_payment_terms',''),v_payment_schedule,case when v_active then coalesce((p_product->>'public_visible')::boolean,false) else false end,v_public_details,v_client_expectations,v_duration_min,v_duration_max,'business_days',v_timeline_impact,nullif(btrim(coalesce(p_product->>'delivery_duration_note','')),''),v_requirements,v_service_family,v_template_key,timezone('utc',now())) returning id into v_id;
  else
    v_id:=(p_product->>'id')::uuid;
    update public.sales_products set code=v_code,name=v_name,category=v_category,product_type=v_product_type,price_mode=v_price_mode,base_price=coalesce((p_product->>'base_price')::numeric,0),currency=coalesce(nullif(p_product->>'currency',''),'USD'),billing_period=nullif(p_product->>'billing_period',''),short_description=nullif(p_product->>'short_description',''),full_description=nullif(p_product->>'full_description',''),scope=v_scope,technology=nullif(p_product->>'technology',''),manager_approval_required=coalesce((p_product->>'manager_approval_required')::boolean,false),active=v_active,sort_order=coalesce((p_product->>'sort_order')::integer,0),standard_payment_terms=nullif(p_product->>'standard_payment_terms',''),payment_schedule=v_payment_schedule,public_visible=case when v_active then coalesce((p_product->>'public_visible')::boolean,false) else false end,public_details=v_public_details,client_expectations=v_client_expectations,delivery_duration_min=v_duration_min,delivery_duration_max=v_duration_max,delivery_duration_unit='business_days',timeline_impact=v_timeline_impact,delivery_duration_note=nullif(btrim(coalesce(p_product->>'delivery_duration_note','')),''),onboarding_requirements=v_requirements,service_family=v_service_family,onboarding_template_key=v_template_key,updated_at=timezone('utc',now()) where id=v_id;
    if not found then raise exception 'Sales product not found'; end if;
  end if;
  return v_id;
end;$function$;
-- -----------------------------------------------------------------------------
-- 4. Dynamic configuration RPCs with server-side validation
-- -----------------------------------------------------------------------------
create or replace function public.get_content_delivery_config()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_role text; v_cfg jsonb:='{}'::jsonb; v_profiles jsonb:='{}'::jsonb; v_default jsonb:='{}'::jsonb; v_product record; v_profile jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select role into v_role from public.user_profiles where id=auth.uid() and status='active';
  if v_role is null or v_role in ('customer','pending') then raise exception 'Staff access required.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='content_delivery_sop_v1';
  v_profiles:=coalesce(v_cfg->'packageProfiles','{}'::jsonb);
  v_default:=coalesce(v_cfg->'defaultPackageProfile','{}'::jsonb);
  for v_product in
    select id,code,name,base_price,currency,price_mode,scope from public.sales_products
    where active is true and product_type='package' and category='Web Design'
    order by sort_order,name
  loop
    v_profile:=coalesce(v_profiles->v_product.code,v_default,'{}'::jsonb);
    v_profile:=v_profile||jsonb_build_object(
      'catalogId',v_product.id,'catalogName',v_product.name,'catalogBasePrice',v_product.base_price,
      'catalogCurrency',v_product.currency,'catalogPriceMode',v_product.price_mode,'catalogScope',coalesce(v_product.scope,'[]'::jsonb)
    );
    v_profiles:=jsonb_set(v_profiles,array[v_product.code],v_profile,true);
  end loop;
  return jsonb_set(v_cfg,'{packageProfiles}',v_profiles,true);
end; $$;

create or replace function public.save_content_delivery_config(p_config jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_cfg jsonb:=coalesce(p_config,'{}'::jsonb); v_dims jsonb; v_dim jsonb; v_profiles jsonb; v_code text; v_profile jsonb;
  v_wip integer; v_review integer; v_client integer; v_pass numeric; v_floor numeric; v_weight_total numeric:=0; v_dim_count integer:=0; v_unique_count integer:=0;
begin
  if not public.is_admin() then raise exception 'Admin permission required.'; end if;
  if coalesce(jsonb_typeof(v_cfg),'')<>'object' then raise exception 'Content Delivery configuration must be a JSON object.'; end if;
  if v_cfg->>'wipLimit' is null or v_cfg->>'reviewSlaHours' is null or v_cfg->>'clientReviewSlaHours' is null or v_cfg->>'qualityPassScore' is null or v_cfg->>'qualityRevisionFloor' is null then
    raise exception 'WIP, SLA and quality threshold settings are required.';
  end if;
  begin v_wip:=(v_cfg->>'wipLimit')::integer; exception when others then raise exception 'WIP limit must be an integer.'; end;
  begin v_review:=(v_cfg->>'reviewSlaHours')::integer; exception when others then raise exception 'Internal review SLA must be an integer.'; end;
  begin v_client:=(v_cfg->>'clientReviewSlaHours')::integer; exception when others then raise exception 'Client review SLA must be an integer.'; end;
  begin v_pass:=(v_cfg->>'qualityPassScore')::numeric; exception when others then raise exception 'Pass score must be numeric.'; end;
  begin v_floor:=(v_cfg->>'qualityRevisionFloor')::numeric; exception when others then raise exception 'Revision floor must be numeric.'; end;
  if v_wip<1 or v_wip>10 then raise exception 'WIP limit must be between 1 and 10.'; end if;
  if v_review<1 or v_review>168 then raise exception 'Internal review SLA must be between 1 and 168 hours.'; end if;
  if v_client<1 or v_client>336 then raise exception 'Client review SLA must be between 1 and 336 hours.'; end if;
  if v_pass<1 or v_pass>100 then raise exception 'Pass score must be between 1 and 100.'; end if;
  if v_floor<0 or v_floor>=v_pass then raise exception 'Revision floor must be at least 0 and below the pass score.'; end if;
  if coalesce(jsonb_typeof(v_cfg->'requiredBriefFields'),'')<>'array' or coalesce(jsonb_array_length(v_cfg->'requiredBriefFields'),0)=0 then raise exception 'At least one required brief field is required.'; end if;
  if exists(select 1 from jsonb_array_elements(v_cfg->'requiredBriefFields') as x(value) where jsonb_typeof(x.value)<>'string' or btrim(x.value#>>'{}')='') then raise exception 'Required brief fields must be non-empty strings.'; end if;

  v_dims:=coalesce(v_cfg->'qualityDimensions','[]'::jsonb);
  if coalesce(jsonb_typeof(v_dims),'')<>'array' or coalesce(jsonb_array_length(v_dims),0)=0 then raise exception 'Quality dimensions are required.'; end if;
  for v_dim in select value from jsonb_array_elements(v_dims) loop
    if coalesce(btrim(v_dim->>'key'),'')='' or coalesce(btrim(v_dim->>'label'),'')='' then raise exception 'Every quality dimension requires a key and label.'; end if;
    begin v_weight_total:=v_weight_total+(v_dim->>'weight')::numeric; exception when others then raise exception 'Every quality dimension weight must be numeric.'; end;
    if (v_dim->>'weight')::numeric<0 then raise exception 'Quality dimension weights cannot be negative.'; end if;
    v_dim_count:=v_dim_count+1;
  end loop;
  select count(distinct (value->>'key')) into v_unique_count from jsonb_array_elements(v_dims);
  if v_unique_count<>v_dim_count then raise exception 'Quality dimension keys must be unique.'; end if;
  if v_weight_total<>100 then raise exception 'Quality dimension weights must total 100.'; end if;

  v_profiles:=coalesce(v_cfg->'packageProfiles','{}'::jsonb);
  if coalesce(jsonb_typeof(v_profiles),'')<>'object' then raise exception 'Package profiles must be a JSON object.'; end if;
  for v_code,v_profile in select key,value from jsonb_each(v_profiles) loop
    if coalesce(jsonb_typeof(v_profile),'')<>'object' then raise exception 'Each package profile must be a JSON object.'; end if;
    if not exists(select 1 from public.sales_products sp where sp.code=v_code and sp.active is true and sp.product_type='package' and sp.category='Web Design') then
      raise exception 'Package profile % is not an active Web Design package in Sales Catalog.',v_code;
    end if;
    v_profile:=v_profile-'catalogId'-'catalogName'-'catalogBasePrice'-'catalogCurrency'-'catalogPriceMode'-'catalogScope'-'label';
    if coalesce(v_profile->>'researchDepth','standard') not in ('standard','detailed','deep','project_specific') then raise exception 'Unsupported research depth for package %.',v_code; end if;
    if v_profile ? 'includedRevisionRounds' and v_profile->'includedRevisionRounds' <> 'null'::jsonb then
      begin
        if (v_profile->>'includedRevisionRounds')::integer < 0 then raise exception 'Included revision rounds cannot be negative.'; end if;
      exception when invalid_text_representation then
        raise exception 'Included revision rounds for package % must be an integer or null.',v_code;
      end;
    end if;
    if v_profile ? 'requiresSeoReview' and jsonb_typeof(v_profile->'requiresSeoReview')<>'boolean' then raise exception 'requiresSeoReview must be boolean for package %.',v_code; end if;
    v_profile:=jsonb_set(v_profile,'{requires2i}','true'::jsonb,true);
    v_profile:=jsonb_set(v_profile,'{requiresInContextQa}','true'::jsonb,true);
    if v_code='PF-WEB-SCALE' then v_profile:=jsonb_set(v_profile,'{requiresSeniorReview}','true'::jsonb,true); end if;
    v_profiles:=jsonb_set(v_profiles,array[v_code],v_profile,true);
  end loop;

  if coalesce(jsonb_typeof(v_cfg->'defaultPackageProfile'),'object')<>'object' then raise exception 'Default package profile must be a JSON object.'; end if;
  v_cfg:=jsonb_set(v_cfg,'{sopCode}','"PF-SOP-07"'::jsonb,true);
  v_cfg:=jsonb_set(v_cfg,'{packageProfiles}',v_profiles,true);
  v_cfg:=jsonb_set(v_cfg,'{defaultPackageProfile}',jsonb_set(jsonb_set(coalesce(v_cfg->'defaultPackageProfile','{}'::jsonb),'{requires2i}','true'::jsonb,true),'{requiresInContextQa}','true'::jsonb,true),true);

  update public.system_configuration set config_value=v_cfg,updated_at=now(),updated_by=auth.uid() where config_key='content_delivery_sop_v1';
  if not found then
    insert into public.system_configuration(config_key,config_value,description,updated_by)
    values('content_delivery_sop_v1',v_cfg,'Dynamic PF-SOP-07 content-delivery policy.',auth.uid());
  end if;
  return v_cfg;
end; $$;

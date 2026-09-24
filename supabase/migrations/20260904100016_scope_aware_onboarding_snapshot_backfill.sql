create or replace function public.client_onboarding_resolve_fields(p_quotation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_quote public.quotations%rowtype;
  v_cfg jsonb:=public.client_onboarding_config();
  v_base jsonb;
  v_result jsonb:='[]'::jsonb;
  v_seen text[]:=array[]::text[];
  v_field jsonb;
  v_key text;
  v_line record;
  v_snapshot_item jsonb;
  v_fields jsonb;
  v_requirements jsonb;
begin
  select * into v_quote from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found for onboarding.'; end if;

  v_base:=coalesce(v_cfg->'baseFields',v_cfg->'fields','[]'::jsonb);
  if jsonb_typeof(v_base)<>'array' then v_base:='[]'::jsonb; end if;
  for v_field in select value from jsonb_array_elements(v_base) loop
    v_key:=btrim(coalesce(v_field->>'key',''));
    if v_key<>'' and not (v_key=any(v_seen)) then
      v_result:=v_result||jsonb_build_array(v_field);
      v_seen:=array_append(v_seen,v_key);
    end if;
  end loop;

  for v_line in
    select qi.id,qi.sales_product_id,qi.product_code_snapshot,qi.product_name_snapshot,qi.item_type,qi.sort_order,qi.created_at
    from public.quotation_items qi
    where qi.quotation_id=p_quotation_id and coalesce(qi.optional_for_client,false)=false
    order by qi.sort_order,qi.created_at
  loop
    v_snapshot_item:=null;
    if jsonb_typeof(coalesce(v_quote.commercial_snapshot->'items','[]'::jsonb))='array' then
      select value into v_snapshot_item
      from jsonb_array_elements(coalesce(v_quote.commercial_snapshot->'items','[]'::jsonb))
      where value->>'id'=v_line.id::text
      limit 1;
    end if;

    v_fields:=case
      when jsonb_typeof(v_snapshot_item->'onboardingFields')='array'
       and jsonb_array_length(v_snapshot_item->'onboardingFields')>0
      then v_snapshot_item->'onboardingFields'
      else null
    end;

    if v_fields is null then
      v_requirements:=case
        when jsonb_typeof(v_snapshot_item->'onboardingRequirements')='object'
        then v_snapshot_item->'onboardingRequirements'
        else null
      end;
      if v_requirements is null and v_line.sales_product_id is not null then
        select sp.onboarding_requirements into v_requirements
        from public.sales_products sp where sp.id=v_line.sales_product_id;
      end if;
      if v_line.sales_product_id is null and (
        v_requirements is null
        or jsonb_typeof(coalesce(v_requirements->'fieldKeys','[]'::jsonb))<>'array'
        or jsonb_array_length(coalesce(v_requirements->'fieldKeys','[]'::jsonb))=0
      ) then
        v_requirements:=public.client_onboarding_default_requirements(
          v_line.product_code_snapshot,
          v_line.product_name_snapshot,
          'Custom',
          coalesce(v_line.item_type,'custom'),
          '[]'::jsonb
        );
      end if;
      v_fields:=public.client_onboarding_fields_for_requirements(coalesce(v_requirements,'{}'::jsonb));
    end if;

    if jsonb_typeof(coalesce(v_fields,'[]'::jsonb))='array' then
      for v_field in select value from jsonb_array_elements(coalesce(v_fields,'[]'::jsonb)) loop
        v_key:=btrim(coalesce(v_field->>'key',''));
        if v_key<>'' and not (v_key=any(v_seen)) then
          v_result:=v_result||jsonb_build_array(v_field);
          v_seen:=array_append(v_seen,v_key);
        end if;
      end loop;
    end if;
  end loop;

  if jsonb_array_length(v_result)=0 then raise exception 'Client onboarding form resolved to no fields.'; end if;
  return v_result;
end;$function$;

do $backfill$
begin
  perform set_config('profox.quotation_atomic_rpc','1',true);
  update public.quotations q
  set commercial_snapshot=jsonb_set(
    q.commercial_snapshot,
    '{items}',
    coalesce((
      select jsonb_agg(
        case
          when item ? 'onboardingFields' and item ? 'onboardingRequirements' and item ? 'scope' then item
          else item || jsonb_build_object(
            'scope',coalesce(sp.scope,'[]'::jsonb),
            'onboardingRequirements',coalesce(
              sp.onboarding_requirements,
              public.client_onboarding_default_requirements(
                coalesce(item->>'productCode',qi.product_code_snapshot),
                coalesce(item->>'productName',qi.product_name_snapshot),
                coalesce(sp.category,'Custom'),
                coalesce(sp.product_type,qi.item_type,'custom'),
                coalesce(sp.scope,'[]'::jsonb)
              )
            ),
            'onboardingFields',public.client_onboarding_fields_for_requirements(coalesce(
              sp.onboarding_requirements,
              public.client_onboarding_default_requirements(
                coalesce(item->>'productCode',qi.product_code_snapshot),
                coalesce(item->>'productName',qi.product_name_snapshot),
                coalesce(sp.category,'Custom'),
                coalesce(sp.product_type,qi.item_type,'custom'),
                coalesce(sp.scope,'[]'::jsonb)
              )
            ))
          )
        end order by ord
      )
      from jsonb_array_elements(coalesce(q.commercial_snapshot->'items','[]'::jsonb)) with ordinality arr(item,ord)
      left join public.quotation_items qi on qi.id::text=item->>'id' and qi.quotation_id=q.id
      left join public.sales_products sp on sp.id=qi.sales_product_id
    ),'[]'::jsonb),
    true
  ),
  commercial_snapshotted_at=coalesce(q.commercial_snapshotted_at,now()),
  updated_at=q.updated_at
  where q.commercial_snapshot is not null
    and jsonb_typeof(q.commercial_snapshot->'items')='array'
    and exists(
      select 1 from jsonb_array_elements(q.commercial_snapshot->'items') x
      where not (x ? 'onboardingFields' and x ? 'onboardingRequirements' and x ? 'scope')
    );
  perform set_config('profox.quotation_atomic_rpc','',true);
exception when others then
  perform set_config('profox.quotation_atomic_rpc','',true);
  raise;
end;$backfill$;

update public.client_onboardings o
set field_schema=public.client_onboarding_resolve_fields(o.quotation_id),
    form_version=greatest(form_version,2),
    updated_at=now()
where o.status<>'Completed' and o.quotation_id is not null;

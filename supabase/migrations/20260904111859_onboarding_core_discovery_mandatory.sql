do $$
declare
  v_cfg jsonb;
  v_library jsonb := '[]'::jsonb;
  v_base jsonb := '[]'::jsonb;
  v_item jsonb;
  v_key text;
  v_core_key text;
begin
  select config_value
    into v_cfg
  from public.system_configuration
  where config_key = 'client_onboarding_settings'
  for update;

  if v_cfg is null then
    raise exception 'client_onboarding_settings configuration is missing.';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(v_cfg->'fieldLibrary', '[]'::jsonb))
  loop
    v_key := btrim(coalesce(v_item->>'key', ''));

    if v_key = 'competitors' then
      v_item := v_item
        || jsonb_build_object(
          'label', 'Competitors / References',
          'required', true,
          'section', 'Strategy & Research',
          'placeholder', 'Share 2–5 competitors, products or references and what you like or dislike. If none are known, write “None known”.'
        );
    elsif v_key = 'primaryOffer' then
      v_item := v_item
        || jsonb_build_object(
          'placeholder', 'What should this project help you sell, promote, automate, or deliver?'
        );
    end if;

    v_library := v_library || jsonb_build_array(v_item);
  end loop;

  if not exists (
    select 1
    from jsonb_array_elements(v_library) value
    where value->>'key' = 'competitors'
      and coalesce((value->>'required')::boolean, false) = true
  ) then
    raise exception 'Mandatory competitors onboarding field could not be resolved.';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(v_cfg->'baseFields', '[]'::jsonb))
  loop
    v_key := btrim(coalesce(v_item->>'key', ''));
    if v_key <> all(array['projectGoals','targetAudience','primaryOffer','competitors']) then
      v_base := v_base || jsonb_build_array(v_item);
    end if;
  end loop;

  foreach v_core_key in array array['projectGoals','targetAudience','primaryOffer','competitors']
  loop
    select value
      into v_item
    from jsonb_array_elements(v_library) value
    where value->>'key' = v_core_key
    limit 1;

    if v_item is null then
      raise exception 'Required onboarding core field % is missing from fieldLibrary.', v_core_key;
    end if;

    v_item := v_item || jsonb_build_object('required', true);
    v_base := v_base || jsonb_build_array(v_item);
  end loop;

  v_cfg := jsonb_set(v_cfg, '{fieldLibrary}', v_library, true);
  v_cfg := jsonb_set(v_cfg, '{baseFields}', v_base, true);
  v_cfg := jsonb_set(v_cfg, '{version}', to_jsonb('4'::text), true);

  update public.system_configuration
  set config_value = v_cfg,
      description = 'Scope-aware client onboarding settings with mandatory core discovery, explicit service families and purchased-scope templates.',
      updated_at = now()
  where config_key = 'client_onboarding_settings';
end;
$$;

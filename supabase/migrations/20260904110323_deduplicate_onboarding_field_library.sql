with current_config as (
  select config_key, config_value
  from public.system_configuration
  where config_key='client_onboarding_settings'
), deduped as (
  select coalesce(jsonb_agg(item order by first_ordinality),'[]'::jsonb) as field_library
  from (
    select distinct on (entry.item->>'key') entry.item, entry.ordinality as first_ordinality
    from current_config cfg
    cross join lateral jsonb_array_elements(coalesce(cfg.config_value->'fieldLibrary','[]'::jsonb)) with ordinality as entry(item, ordinality)
    where nullif(btrim(entry.item->>'key'),'') is not null
    order by entry.item->>'key', entry.ordinality
  ) unique_fields
)
update public.system_configuration cfg
set config_value=jsonb_set(cfg.config_value,'{fieldLibrary}',deduped.field_library,true),
    updated_at=now()
from deduped
where cfg.config_key='client_onboarding_settings';
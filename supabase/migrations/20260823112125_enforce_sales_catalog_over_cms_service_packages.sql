-- Sales Catalog is the only current source of package/card commercial facts.
-- CMS may store only homepage section presentation for servicePackages.

create or replace function public.sanitize_service_packages_content()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.id = 'servicePackages' then
    new.data := jsonb_build_object(
      'enabled', coalesce((new.data ->> 'enabled')::boolean, false),
      'title', coalesce(nullif(btrim(new.data ->> 'title'), ''), 'Our Services Packages'),
      'subtitle', coalesce(
        nullif(btrim(new.data ->> 'subtitle'), ''),
        'Choose the current ProFox package that best matches the outcome your business needs.'
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sanitize_service_packages_content on public.content;
create trigger trg_sanitize_service_packages_content
before insert or update of data on public.content
for each row
when (new.id = 'servicePackages')
execute function public.sanitize_service_packages_content();

update public.content
set data = jsonb_build_object(
  'enabled', coalesce((data ->> 'enabled')::boolean, false),
  'title', coalesce(nullif(btrim(data ->> 'title'), ''), 'Our Services Packages'),
  'subtitle', coalesce(
    nullif(btrim(data ->> 'subtitle'), ''),
    'Choose the current ProFox package that best matches the outcome your business needs.'
  )
)
where id = 'servicePackages';

-- Ensure common UI/UX worker labels resolve to the canonical uiux budget key.
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
    when 'uiuxdesigner' then return 'uiux';
    when 'uxdesigner' then return 'uiux';
    when 'uidesigner' then return 'uiux';
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

revoke all on function public.revenue_distribution_role_key_for_department(text) from public,anon,authenticated;

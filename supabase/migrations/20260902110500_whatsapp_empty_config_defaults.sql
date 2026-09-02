-- Make the Admin WhatsApp configuration RPC return a stable disabled object even
-- before the first system_configuration row exists.

create or replace function public.admin_get_whatsapp_business_config()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','vault','pg_temp'
as $function$
declare
  v_cfg jsonb:='{}'::jsonb;
  v_access boolean:=false;
  v_verify boolean:=false;
  v_secret boolean:=false;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;

  select coalesce(
    (select config_value from public.system_configuration where config_key='whatsapp_business'),
    '{}'::jsonb
  ) into v_cfg;

  select exists(select 1 from vault.secrets where name='profox_whatsapp_access_token') into v_access;
  select exists(select 1 from vault.secrets where name='profox_whatsapp_verify_token') into v_verify;
  select exists(select 1 from vault.secrets where name='profox_whatsapp_app_secret') into v_secret;

  return v_cfg||jsonb_build_object(
    'accessTokenStored',v_access,
    'verifyTokenStored',v_verify,
    'appSecretStored',v_secret,
    'configured',
      coalesce(v_cfg->>'phoneNumberId','')<>''
      and coalesce(v_cfg->>'businessAccountId','')<>''
      and coalesce(v_cfg->>'businessPhone','')<>''
      and v_access and v_verify and v_secret,
    'enabled',coalesce((v_cfg->>'enabled')::boolean,false),
    'graphApiVersion',coalesce(v_cfg->>'graphApiVersion','v23.0'),
    'defaultTemplateName',coalesce(v_cfg->>'defaultTemplateName',''),
    'defaultTemplateLanguage',coalesce(v_cfg->>'defaultTemplateLanguage','en_US')
  );
end;
$function$;

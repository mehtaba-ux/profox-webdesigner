-- Require a verified organization-level Zoho Mail OAuth connection before any Mail policy can be enabled.
-- Version Mail policy changes so already-queued provisioning work cannot run against stale provider settings.

create or replace function public.admin_set_professional_integrations(
  p_zoho_enabled boolean,
  p_zoho_mail_enabled boolean,
  p_zoho_calendar_enabled boolean,
  p_zoho_meeting_enabled boolean,
  p_mail_provisioning_enabled boolean,
  p_professional_email_required boolean,
  p_default_mail_provider text,
  p_default_calendar_provider text,
  p_default_meeting_provider text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','vault','pg_temp'
as $function$
declare
  v_cfg jsonb:='{}'::jsonb;
  v_status jsonb;
  v_any_zoho boolean;
  v_mail_requested boolean;
  v_mail_verified boolean:=false;
  v_old_calendar text;
  v_calendar_generation integer:=1;
  v_calendar_raw text;
  v_old_mail text;
  v_old_mail_enabled boolean:=false;
  v_old_provisioning boolean:=false;
  v_mail_generation integer:=1;
  v_mail_raw text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_default_mail_provider not in ('none','zoho') then raise exception 'Unsupported mail provider.'; end if;
  if p_default_calendar_provider not in ('google','zoho') then raise exception 'Unsupported calendar provider.'; end if;
  if p_default_meeting_provider not in ('google_meet','zoho_meeting') then raise exception 'Unsupported meeting provider.'; end if;

  v_status:=public.admin_get_professional_integrations();
  v_any_zoho:=coalesce(p_zoho_enabled,false)
    or coalesce(p_zoho_mail_enabled,false)
    or coalesce(p_zoho_calendar_enabled,false)
    or coalesce(p_zoho_meeting_enabled,false)
    or coalesce(p_mail_provisioning_enabled,false)
    or p_default_mail_provider='zoho'
    or p_default_calendar_provider='zoho'
    or p_default_meeting_provider='zoho_meeting';

  if v_any_zoho and coalesce((v_status->>'zohoProviderConfigured')::boolean,false) is not true then
    raise exception 'Configure the Zoho organization and OAuth provider before enabling Zoho services.';
  end if;

  v_mail_requested:=coalesce(p_zoho_mail_enabled,false)
    or coalesce(p_mail_provisioning_enabled,false)
    or coalesce(p_professional_email_required,false)
    or p_default_mail_provider='zoho';
  select exists(
    select 1 from public.zoho_organization_mail_connection
    where singleton_key='primary' and status='connected'
  ) into v_mail_verified;
  if v_mail_requested and not v_mail_verified then
    raise exception 'Connect and verify Zoho Mail organization OAuth before enabling professional Mail, provisioning, or the Zoho default mail provider.';
  end if;

  if coalesce(p_professional_email_required,false) and not coalesce(p_zoho_mail_enabled,false) then
    raise exception 'Professional email cannot be mandatory until Zoho Mail is enabled.';
  end if;
  if coalesce(p_mail_provisioning_enabled,false) and not coalesce(p_zoho_mail_enabled,false) then
    raise exception 'Mailbox provisioning requires Zoho Mail to be enabled.';
  end if;
  if p_default_mail_provider='zoho' and not coalesce(p_zoho_mail_enabled,false) then
    raise exception 'Zoho cannot be the default mail provider until Zoho Mail is enabled.';
  end if;

  select coalesce(config_value,'{}'::jsonb) into v_cfg
  from public.system_configuration where config_key='professional_integrations' for update;

  v_old_calendar:=coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google');
  v_calendar_raw:=coalesce(v_cfg->>'calendarProviderGeneration','');
  if v_calendar_raw ~ '^[1-9][0-9]*$' then v_calendar_generation:=v_calendar_raw::integer; end if;
  if v_old_calendar is distinct from p_default_calendar_provider then v_calendar_generation:=v_calendar_generation+1; end if;

  v_old_mail:=coalesce(nullif(v_cfg->>'defaultMailProvider',''),'none');
  v_old_mail_enabled:=coalesce((v_cfg->>'zohoMailEnabled')::boolean,false);
  v_old_provisioning:=coalesce((v_cfg->>'mailProvisioningEnabled')::boolean,false);
  v_mail_raw:=coalesce(v_cfg->>'mailProviderGeneration','');
  if v_mail_raw ~ '^[1-9][0-9]*$' then v_mail_generation:=v_mail_raw::integer; end if;
  if v_old_mail is distinct from p_default_mail_provider
     or v_old_mail_enabled is distinct from coalesce(p_zoho_mail_enabled,false)
     or v_old_provisioning is distinct from coalesce(p_mail_provisioning_enabled,false)
  then
    v_mail_generation:=v_mail_generation+1;
  end if;

  v_cfg:=v_cfg||jsonb_build_object(
    'zohoEnabled',coalesce(p_zoho_enabled,false),
    'zohoMailEnabled',coalesce(p_zoho_mail_enabled,false),
    'zohoCalendarEnabled',coalesce(p_zoho_calendar_enabled,false),
    'zohoMeetingEnabled',coalesce(p_zoho_meeting_enabled,false),
    'mailProvisioningEnabled',coalesce(p_mail_provisioning_enabled,false),
    'professionalEmailRequired',coalesce(p_professional_email_required,false),
    'defaultMailProvider',p_default_mail_provider,
    'defaultCalendarProvider',p_default_calendar_provider,
    'defaultMeetingProvider',p_default_meeting_provider,
    'calendarProviderGeneration',v_calendar_generation,
    'mailProviderGeneration',v_mail_generation
  );
  update public.system_configuration
  set config_value=v_cfg,updated_by=auth.uid(),updated_at=now()
  where config_key='professional_integrations';
  return public.admin_get_professional_integrations();
end;
$function$;

revoke all on function public.admin_set_professional_integrations(boolean,boolean,boolean,boolean,boolean,boolean,text,text,text) from public,anon;
grant execute on function public.admin_set_professional_integrations(boolean,boolean,boolean,boolean,boolean,boolean,text,text,text) to authenticated,service_role,postgres;

create table if not exists public.zoho_service_calendar_connection (
  singleton_key text primary key default 'primary' check (singleton_key='primary'),
  connected_by uuid null references public.user_profiles(id) on delete set null,
  account_email text not null default '',
  zoho_account_id text not null default '',
  zoho_user_id text not null default '',
  meeting_org_id text not null default '',
  presenter_zuid text not null default '',
  data_center text not null default 'com',
  status text not null default 'disconnected' check (status in ('disconnected','connected','reconnect_required','error')),
  scopes text[] not null default '{}',
  refresh_secret_id uuid null,
  calendar_id text not null default '',
  calendar_timezone text not null default 'UTC',
  meeting_ready boolean not null default false,
  last_auth_at timestamptz null,
  last_successful_sync_at timestamptz null,
  last_attempt_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.zoho_service_calendar_connection enable row level security;
revoke all on public.zoho_service_calendar_connection from public,anon,authenticated;

create table if not exists public.meeting_provider_private_links (
  meeting_id uuid primary key references public.sales_meetings(id) on delete cascade,
  provider text not null check (provider='zoho_meeting'),
  external_meeting_id text not null,
  join_url text not null,
  host_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.meeting_provider_private_links enable row level security;
revoke all on public.meeting_provider_private_links from public,anon,authenticated;

create or replace function public.service_central_zoho_ready()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.zoho_service_calendar_connection c
    join public.system_configuration s on s.config_key='professional_integrations'
    where c.singleton_key='primary' and c.status='connected' and c.meeting_ready
      and nullif(c.calendar_id,'') is not null and nullif(c.meeting_org_id,'') is not null
      and nullif(c.presenter_zuid,'') is not null
      and coalesce((s.config_value->>'zohoCalendarEnabled')::boolean,false)
      and coalesce((s.config_value->>'zohoMeetingEnabled')::boolean,false)
  );
$$;
revoke all on function public.service_central_zoho_ready() from public,anon,authenticated;
grant execute on function public.service_central_zoho_ready() to service_role;

create or replace function public.get_zoho_service_calendar_status()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_row public.zoho_service_calendar_connection%rowtype; v_cfg jsonb:='{}'::jsonb; v_provider jsonb:='{}'::jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not exists(select 1 from public.user_profiles p where p.id=v_user and p.status='active' and p.role in ('admin','site_manager','project_manager','sales','sales_rep','sales_team')) then raise exception 'Staff access required.'; end if;
  select * into v_row from public.zoho_service_calendar_connection where singleton_key='primary';
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  begin v_provider:=coalesce(public.admin_get_professional_integrations(),'{}'::jsonb); exception when others then v_provider:='{}'::jsonb; end;
  return jsonb_build_object(
    'connected',found and v_row.status='connected','status',coalesce(v_row.status,'disconnected'),
    'accountEmail',coalesce(v_row.account_email,''),'calendarId',coalesce(v_row.calendar_id,''),
    'calendarTimezone',coalesce(v_row.calendar_timezone,''),'meetingReady',coalesce(v_row.meeting_ready,false),
    'lastAuthAt',v_row.last_auth_at,'lastSuccessfulSyncAt',v_row.last_successful_sync_at,'lastError',v_row.last_error,
    'calendarEnabled',coalesce((v_cfg->>'zohoCalendarEnabled')::boolean,false),'meetingEnabled',coalesce((v_cfg->>'zohoMeetingEnabled')::boolean,false),
    'defaultCalendarProvider',coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google'),'defaultMeetingProvider',coalesce(nullif(v_cfg->>'defaultMeetingProvider',''),'google_meet'),
    'providerConfigured',coalesce((v_provider->>'zohoProviderConfigured')::boolean,false),'managedByProFox',true,'sellerAuthorizationRequired',false
  );
end;$$;
revoke all on function public.get_zoho_service_calendar_status() from public,anon;
grant execute on function public.get_zoho_service_calendar_status() to authenticated,service_role;

create or replace function public.service_store_zoho_service_calendar_refresh_token(p_refresh_token text)
returns uuid language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare v_existing uuid; v_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.'; end if;
  if nullif(trim(coalesce(p_refresh_token,'')),'') is null then raise exception 'Refresh token is required.'; end if;
  select refresh_secret_id into v_existing from public.zoho_service_calendar_connection where singleton_key='primary';
  if v_existing is not null then
    perform vault.update_secret(v_existing,p_refresh_token,'profox_zoho_service_calendar_refresh','Central ProFox Zoho Calendar and Meeting refresh token'); v_id:=v_existing;
  else
    select vault.create_secret(p_refresh_token,'profox_zoho_service_calendar_refresh','Central ProFox Zoho Calendar and Meeting refresh token') into v_id;
  end if;
  return v_id;
end;$$;

create or replace function public.service_get_zoho_service_calendar_refresh_token()
returns text language plpgsql stable security definer set search_path=public,vault,pg_temp as $$
declare v_secret uuid; v_value text;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.'; end if;
  select refresh_secret_id into v_secret from public.zoho_service_calendar_connection where singleton_key='primary';
  if v_secret is null then return null; end if;
  select decrypted_secret into v_value from vault.decrypted_secrets where id=v_secret; return v_value;
end;$$;

create or replace function public.service_upsert_zoho_service_calendar_connection(
  p_connected_by uuid,p_account_email text,p_zoho_account_id text,p_zoho_user_id text,p_meeting_org_id text,p_presenter_zuid text,
  p_data_center text,p_calendar_id text,p_calendar_timezone text,p_scopes text[],p_refresh_secret_id uuid,p_meeting_ready boolean
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.'; end if;
  if p_connected_by is null or not exists(select 1 from public.user_profiles where id=p_connected_by and status='active' and role='admin') then raise exception 'An active Administrator must authorize the central Zoho service.'; end if;
  if nullif(trim(coalesce(p_account_email,'')),'') is null then raise exception 'Zoho account email is required.'; end if;
  if nullif(trim(coalesce(p_calendar_id,'')),'') is null then raise exception 'Zoho Calendar identifier is required.'; end if;
  if nullif(trim(coalesce(p_meeting_org_id,'')),'') is null or nullif(trim(coalesce(p_presenter_zuid,'')),'') is null or coalesce(p_meeting_ready,false) is not true then raise exception 'Zoho Meeting capability is not ready for centralized use.'; end if;
  insert into public.zoho_service_calendar_connection(singleton_key,connected_by,account_email,zoho_account_id,zoho_user_id,meeting_org_id,presenter_zuid,data_center,status,scopes,refresh_secret_id,calendar_id,calendar_timezone,meeting_ready,last_auth_at,last_attempt_at,last_error,updated_at)
  values('primary',p_connected_by,lower(trim(p_account_email)),coalesce(p_zoho_account_id,''),coalesce(p_zoho_user_id,''),p_meeting_org_id,p_presenter_zuid,lower(coalesce(nullif(p_data_center,''),'com')),'connected',coalesce(p_scopes,'{}'::text[]),p_refresh_secret_id,p_calendar_id,coalesce(nullif(p_calendar_timezone,''),'UTC'),true,now(),now(),null,now())
  on conflict(singleton_key) do update set connected_by=excluded.connected_by,account_email=excluded.account_email,zoho_account_id=excluded.zoho_account_id,zoho_user_id=excluded.zoho_user_id,meeting_org_id=excluded.meeting_org_id,presenter_zuid=excluded.presenter_zuid,data_center=excluded.data_center,status='connected',scopes=excluded.scopes,refresh_secret_id=excluded.refresh_secret_id,calendar_id=excluded.calendar_id,calendar_timezone=excluded.calendar_timezone,meeting_ready=true,last_auth_at=now(),last_attempt_at=now(),last_error=null,updated_at=now();
end;$$;

create or replace function public.service_mark_zoho_service_calendar_state(p_status text,p_error text default null,p_success boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.'; end if;
  if p_status not in('connected','reconnect_required','disconnected','error') then raise exception 'Invalid connection state.'; end if;
  update public.zoho_service_calendar_connection set status=p_status,last_attempt_at=now(),last_successful_sync_at=case when coalesce(p_success,false) then now() else last_successful_sync_at end,last_error=case when p_status='connected' and coalesce(p_success,false) then null else left(coalesce(p_error,''),2000) end,updated_at=now() where singleton_key='primary';
end;$$;

create or replace function public.service_activate_zoho_service_calendar()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_cfg jsonb:='{}'::jsonb; v_generation integer:=1; v_raw text;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.'; end if;
  if not exists(select 1 from public.zoho_service_calendar_connection where singleton_key='primary' and status='connected' and meeting_ready and nullif(calendar_id,'') is not null and nullif(meeting_org_id,'') is not null and nullif(presenter_zuid,'') is not null) then raise exception 'Central Zoho Calendar and Meeting must be verified before activation.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations' for update;
  v_raw:=coalesce(v_cfg->>'calendarProviderGeneration',''); if v_raw ~ '^[1-9][0-9]*$' then v_generation:=v_raw::integer; end if;
  if coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google')<>'zoho' then v_generation:=v_generation+1; end if;
  v_cfg:=v_cfg||jsonb_build_object('zohoEnabled',true,'zohoCalendarEnabled',true,'zohoMeetingEnabled',true,'defaultCalendarProvider','zoho','defaultMeetingProvider','zoho_meeting','calendarProviderGeneration',v_generation);
  update public.system_configuration set config_value=v_cfg,updated_at=now() where config_key='professional_integrations';
end;$$;

create or replace function public.service_disconnect_zoho_service_calendar(p_error text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_cfg jsonb:='{}'::jsonb; v_generation integer:=1; v_raw text;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.'; end if;
  update public.zoho_service_calendar_connection set status='disconnected',meeting_ready=false,last_error=left(coalesce(p_error,''),2000),last_attempt_at=now(),updated_at=now() where singleton_key='primary';
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations' for update;
  v_raw:=coalesce(v_cfg->>'calendarProviderGeneration',''); if v_raw ~ '^[1-9][0-9]*$' then v_generation:=v_raw::integer; end if;
  if coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google')='zoho' then v_generation:=v_generation+1; end if;
  v_cfg:=v_cfg||jsonb_build_object('zohoCalendarEnabled',false,'zohoMeetingEnabled',false,'defaultCalendarProvider','google','defaultMeetingProvider','google_meet','calendarProviderGeneration',v_generation);
  if coalesce((v_cfg->>'zohoMailEnabled')::boolean,false) is not true then v_cfg:=jsonb_set(v_cfg,'{zohoEnabled}','false'::jsonb,true); end if;
  update public.system_configuration set config_value=v_cfg,updated_at=now() where config_key='professional_integrations';
end;$$;

create or replace function public.service_upsert_meeting_provider_private_link(p_meeting_id uuid,p_external_meeting_id text,p_join_url text,p_host_url text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.'; end if;
  if not exists(select 1 from public.sales_meetings where id=p_meeting_id) then raise exception 'Meeting not found.'; end if;
  if nullif(trim(coalesce(p_external_meeting_id,'')),'') is null or coalesce(p_join_url,'') !~* '^https://' or coalesce(p_host_url,'') !~* '^https://' then raise exception 'Valid Zoho Meeting links are required.'; end if;
  insert into public.meeting_provider_private_links(meeting_id,provider,external_meeting_id,join_url,host_url,updated_at) values(p_meeting_id,'zoho_meeting',p_external_meeting_id,p_join_url,p_host_url,now())
  on conflict(meeting_id) do update set provider='zoho_meeting',external_meeting_id=excluded.external_meeting_id,join_url=excluded.join_url,host_url=excluded.host_url,updated_at=now();
  update public.sales_meetings set meeting_url=p_join_url,updated_at=now() where id=p_meeting_id;
end;$$;

create or replace function public.service_delete_meeting_provider_private_link(p_meeting_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin if auth.role()<>'service_role' then raise exception 'Service role required.'; end if; delete from public.meeting_provider_private_links where meeting_id=p_meeting_id; end;$$;

create or replace function public.get_my_meeting_host_link(p_meeting_id uuid)
returns text language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_owner uuid; v_status text; v_host text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select salesperson_id,status into v_owner,v_status from public.sales_meetings where id=p_meeting_id; if not found then raise exception 'Meeting not found.'; end if;
  if not public.is_admin() and v_owner<>v_user then raise exception 'Meeting host access denied.'; end if;
  if v_status not in('Scheduled','Rescheduled') then raise exception 'This meeting is not open for hosting.'; end if;
  select host_url into v_host from public.meeting_provider_private_links where meeting_id=p_meeting_id and provider='zoho_meeting';
  if nullif(trim(coalesce(v_host,'')),'') is null then return null; end if; return v_host;
end;$$;
revoke all on function public.get_my_meeting_host_link(uuid) from public,anon;
grant execute on function public.get_my_meeting_host_link(uuid) to authenticated,service_role;

revoke all on function public.service_store_zoho_service_calendar_refresh_token(text) from public,anon,authenticated;
revoke all on function public.service_get_zoho_service_calendar_refresh_token() from public,anon,authenticated;
revoke all on function public.service_upsert_zoho_service_calendar_connection(uuid,text,text,text,text,text,text,text,text,text[],uuid,boolean) from public,anon,authenticated;
revoke all on function public.service_mark_zoho_service_calendar_state(text,text,boolean) from public,anon,authenticated;
revoke all on function public.service_activate_zoho_service_calendar() from public,anon,authenticated;
revoke all on function public.service_disconnect_zoho_service_calendar(text) from public,anon,authenticated;
revoke all on function public.service_upsert_meeting_provider_private_link(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.service_delete_meeting_provider_private_link(uuid) from public,anon,authenticated;
grant execute on function public.service_store_zoho_service_calendar_refresh_token(text) to service_role;
grant execute on function public.service_get_zoho_service_calendar_refresh_token() to service_role;
grant execute on function public.service_upsert_zoho_service_calendar_connection(uuid,text,text,text,text,text,text,text,text,text[],uuid,boolean) to service_role;
grant execute on function public.service_mark_zoho_service_calendar_state(text,text,boolean) to service_role;
grant execute on function public.service_activate_zoho_service_calendar() to service_role;
grant execute on function public.service_disconnect_zoho_service_calendar(text) to service_role;
grant execute on function public.service_upsert_meeting_provider_private_link(uuid,text,text,text) to service_role;
grant execute on function public.service_delete_meeting_provider_private_link(uuid) to service_role;
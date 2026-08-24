-- Admin-managed Google Calendar OAuth provider credentials.
-- Secrets are stored in Supabase Vault; browser-facing RPCs never return them.

create or replace function public.admin_get_google_calendar_provider_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_client_id text;
  v_has_secret boolean;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;

  select decrypted_secret into v_client_id
  from vault.decrypted_secrets
  where name='profox_google_calendar_client_id'
  limit 1;

  select exists(
    select 1 from vault.secrets where name='profox_google_calendar_client_secret'
  ) into v_has_secret;

  return jsonb_build_object(
    'configured',coalesce(v_client_id,'')<>'' and v_has_secret,
    'clientIdHint',case when coalesce(v_client_id,'')='' then ''
      else left(v_client_id,10)||'...'||right(v_client_id,18) end,
    'secretStored',v_has_secret
  );
end;
$$;

create or replace function public.admin_set_google_calendar_provider(
  p_client_id text,
  p_client_secret text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_client_id text:=btrim(coalesce(p_client_id,''));
  v_client_secret text:=btrim(coalesce(p_client_secret,''));
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if v_client_id='' then
    select decrypted_secret into v_client_id from vault.decrypted_secrets
    where name='profox_google_calendar_client_id' limit 1;
  end if;
  if char_length(v_client_id) not between 20 and 500
     or v_client_id !~ '^[A-Za-z0-9._-]+[.]apps[.]googleusercontent[.]com$' then
    raise exception 'Enter a valid Google OAuth Web application client ID.';
  end if;
  if v_client_secret<>'' and char_length(v_client_secret) not between 8 and 500 then
    raise exception 'Google OAuth client secret is invalid.';
  end if;

  select id into v_id from vault.secrets
  where name='profox_google_calendar_client_id' limit 1;
  if v_id is null then
    perform vault.create_secret(v_client_id,'profox_google_calendar_client_id','Google Calendar OAuth web client ID',null);
  else
    perform vault.update_secret(v_id,v_client_id,'profox_google_calendar_client_id','Google Calendar OAuth web client ID',null);
  end if;

  select id into v_id from vault.secrets
  where name='profox_google_calendar_client_secret' limit 1;
  if v_client_secret<>'' then
    if v_id is null then
      perform vault.create_secret(v_client_secret,'profox_google_calendar_client_secret','Google Calendar OAuth web client secret',null);
    else
      perform vault.update_secret(v_id,v_client_secret,'profox_google_calendar_client_secret','Google Calendar OAuth web client secret',null);
    end if;
  elsif v_id is null then
    raise exception 'Enter the Google OAuth client secret for the first setup.';
  end if;

  return public.admin_get_google_calendar_provider_status();
end;
$$;

create or replace function public.service_get_google_calendar_provider_credentials()
returns jsonb
language sql
stable
security definer
set search_path=public,vault,pg_temp
as $$
  select jsonb_build_object(
    'clientId',coalesce((select decrypted_secret from vault.decrypted_secrets where name='profox_google_calendar_client_id' limit 1),''),
    'clientSecret',coalesce((select decrypted_secret from vault.decrypted_secrets where name='profox_google_calendar_client_secret' limit 1),'')
  );
$$;

revoke all on function public.admin_get_google_calendar_provider_status() from public,anon;
revoke all on function public.admin_set_google_calendar_provider(text,text) from public,anon;
revoke all on function public.service_get_google_calendar_provider_credentials() from public,anon,authenticated;
grant execute on function public.admin_get_google_calendar_provider_status() to authenticated;
grant execute on function public.admin_set_google_calendar_provider(text,text) to authenticated;
grant execute on function public.service_get_google_calendar_provider_credentials() to service_role;

-- Keep direct connection reads aligned with the canonical active Sales role family.
drop policy if exists google_calendar_connections_read on public.google_calendar_connections;
create policy google_calendar_connections_read
on public.google_calendar_connections for select to authenticated
using (
  public.is_admin()
  or (user_id=(select auth.uid()) and public.has_active_role(array['sales']::text[]))
);

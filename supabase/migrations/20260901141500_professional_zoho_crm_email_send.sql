-- Professional Zoho Mail send authorization + CRM delivery pipeline.
-- This keeps mailbox provisioning and outbound message permission separate:
-- each eligible employee must authorize only ZohoMail.messages.CREATE before
-- ProFox can send from that employee's active professional mailbox.

create table if not exists public.zoho_user_mail_send_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  work_email text not null,
  provider_account_id text not null,
  data_center text not null,
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint zoho_user_mail_send_oauth_states_dc_chk check (data_center in ('com','in','eu','com.au','jp','ca','sa'))
);

create index if not exists zoho_user_mail_send_oauth_states_expiry_idx
  on public.zoho_user_mail_send_oauth_states(expires_at);

alter table public.zoho_user_mail_send_oauth_states enable row level security;
revoke all on public.zoho_user_mail_send_oauth_states from anon, authenticated;
grant select, insert, update, delete on public.zoho_user_mail_send_oauth_states to service_role;

create table if not exists public.zoho_user_mail_send_connections (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  work_email text not null,
  provider_account_id text not null,
  data_center text not null,
  refresh_secret_id uuid not null,
  scopes text[] not null default '{}'::text[],
  status text not null default 'connected',
  connected_at timestamptz not null default now(),
  last_verified_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint zoho_user_mail_send_connections_dc_chk check (data_center in ('com','in','eu','com.au','jp','ca','sa')),
  constraint zoho_user_mail_send_connections_status_chk check (status in ('connected','reconnect_required','error','disconnected'))
);

alter table public.zoho_user_mail_send_connections enable row level security;
revoke all on public.zoho_user_mail_send_connections from anon, authenticated;
grant select, insert, update, delete on public.zoho_user_mail_send_connections to service_role;

create table if not exists public.professional_email_send_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null,
  user_id uuid not null references public.user_profiles(id) on delete restrict,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  provider text not null default 'zoho',
  sender_email text not null,
  recipient_email text not null,
  subject text not null,
  message_body text not null,
  status text not null default 'pending',
  provider_message_id text,
  provider_response_code text,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint professional_email_send_requests_provider_chk check (provider='zoho'),
  constraint professional_email_send_requests_status_chk check (status in ('pending','provider_accepted','failed')),
  constraint professional_email_send_requests_idem_uidx unique(user_id,idempotency_key)
);

create index if not exists professional_email_send_requests_user_created_idx
  on public.professional_email_send_requests(user_id,created_at desc);
create index if not exists professional_email_send_requests_lead_created_idx
  on public.professional_email_send_requests(lead_id,created_at desc);

alter table public.professional_email_send_requests enable row level security;
revoke all on public.professional_email_send_requests from anon, authenticated;
grant select, insert, update on public.professional_email_send_requests to service_role;
revoke delete on public.professional_email_send_requests from service_role;

create or replace function public.get_my_professional_mail_send_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_account public.staff_professional_accounts%rowtype;
  v_connection public.zoho_user_mail_send_connections%rowtype;
  v_eligible boolean:=false;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  v_eligible:=public.service_professional_mailbox_eligible(v_uid);
  select * into v_account from public.staff_professional_accounts where user_id=v_uid;
  select * into v_connection from public.zoho_user_mail_send_connections where user_id=v_uid;

  return jsonb_build_object(
    'userId',v_uid,
    'eligible',v_eligible,
    'workEmail',case when v_account.mailbox_status='active' then coalesce(v_account.work_email,'') else '' end,
    'mailboxStatus',coalesce(v_account.mailbox_status,'not_configured'),
    'mailProvider',coalesce(v_account.mail_provider,'none'),
    'providerAccountReady',coalesce(nullif(btrim(v_account.provider_account_id),''),'')<>'',
    'sendConnectionStatus',coalesce(v_connection.status,'disconnected'),
    'sendConnected',(
      v_eligible
      and v_account.mailbox_status='active'
      and v_account.mail_provider='zoho'
      and coalesce(nullif(btrim(v_account.work_email),''),'')<>''
      and coalesce(nullif(btrim(v_account.provider_account_id),''),'')<>''
      and v_connection.status='connected'
      and lower(btrim(v_connection.work_email))=lower(btrim(v_account.work_email))
      and v_connection.provider_account_id=v_account.provider_account_id
    ),
    'lastVerifiedAt',v_connection.last_verified_at,
    'lastError',v_connection.last_error
  );
end;
$$;

revoke all on function public.get_my_professional_mail_send_status() from public,anon;
grant execute on function public.get_my_professional_mail_send_status() to authenticated,service_role;

create or replace function public.service_store_zoho_user_mail_send_connection(
  p_user_id uuid,
  p_refresh_token text,
  p_work_email text,
  p_provider_account_id text,
  p_data_center text,
  p_scopes text[] default array['ZohoMail.messages.CREATE']::text[]
)
returns jsonb
language plpgsql
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_refresh text:=btrim(coalesce(p_refresh_token,''));
  v_work_email text:=lower(btrim(coalesce(p_work_email,'')));
  v_account_id text:=btrim(coalesce(p_provider_account_id,''));
  v_dc text:=lower(btrim(coalesce(p_data_center,'')));
  v_account public.staff_professional_accounts%rowtype;
  v_secret_id uuid;
  v_secret_name text;
begin
  if p_user_id is null or not public.service_professional_mailbox_eligible(p_user_id) then
    raise exception 'Eligible Sales or Management account required.';
  end if;
  if v_refresh='' then raise exception 'Zoho refresh token is required.'; end if;
  if v_dc not in ('com','in','eu','com.au','jp','ca','sa') then raise exception 'Unsupported Zoho data center.'; end if;

  select * into v_account
  from public.staff_professional_accounts
  where user_id=p_user_id
    and mailbox_status='active'
    and mail_provider='zoho';

  if v_account.user_id is null
     or lower(btrim(coalesce(v_account.work_email,'')))<>v_work_email
     or btrim(coalesce(v_account.provider_account_id,''))<>v_account_id then
    raise exception 'Active professional mailbox identity does not match this authorization.';
  end if;

  v_secret_name:='profox_zoho_user_mail_send_refresh_'||p_user_id::text;
  select id into v_secret_id from vault.secrets where name=v_secret_name limit 1;
  if v_secret_id is null then
    v_secret_id:=vault.create_secret(v_refresh,v_secret_name,'Zoho Mail send-only OAuth refresh token for an active professional mailbox.',null);
  else
    perform vault.update_secret(v_secret_id,v_refresh,v_secret_name,'Zoho Mail send-only OAuth refresh token for an active professional mailbox.',null);
  end if;

  insert into public.zoho_user_mail_send_connections(
    user_id,work_email,provider_account_id,data_center,refresh_secret_id,scopes,status,
    connected_at,last_verified_at,last_attempt_at,last_error,updated_at
  ) values(
    p_user_id,v_work_email,v_account_id,v_dc,v_secret_id,coalesce(p_scopes,'{}'::text[]),'connected',
    now(),now(),now(),null,now()
  )
  on conflict(user_id) do update set
    work_email=excluded.work_email,
    provider_account_id=excluded.provider_account_id,
    data_center=excluded.data_center,
    refresh_secret_id=excluded.refresh_secret_id,
    scopes=excluded.scopes,
    status='connected',
    connected_at=now(),last_verified_at=now(),last_attempt_at=now(),last_error=null,updated_at=now();

  return jsonb_build_object('connected',true,'workEmail',v_work_email,'accountId',v_account_id);
end;
$$;

revoke all on function public.service_store_zoho_user_mail_send_connection(uuid,text,text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.service_store_zoho_user_mail_send_connection(uuid,text,text,text,text,text[]) to service_role;

create or replace function public.service_get_zoho_user_mail_send_credentials(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,vault,pg_temp
as $$
declare
  v_conn public.zoho_user_mail_send_connections%rowtype;
  v_refresh text:='';
  v_provider jsonb:='{}'::jsonb;
  v_account public.staff_professional_accounts%rowtype;
begin
  if p_user_id is null or not public.service_professional_mailbox_eligible(p_user_id) then
    raise exception 'Professional mailbox sender is not eligible.';
  end if;
  select * into v_account from public.staff_professional_accounts where user_id=p_user_id;
  select * into v_conn from public.zoho_user_mail_send_connections where user_id=p_user_id and status='connected';
  if v_conn.user_id is null
     or v_account.mailbox_status<>'active'
     or v_account.mail_provider<>'zoho'
     or lower(btrim(coalesce(v_account.work_email,'')))<>lower(btrim(v_conn.work_email))
     or btrim(coalesce(v_account.provider_account_id,''))<>v_conn.provider_account_id then
    raise exception 'Professional Zoho Mail send authorization is not connected.';
  end if;
  select coalesce(decrypted_secret,'') into v_refresh from vault.decrypted_secrets where id=v_conn.refresh_secret_id limit 1;
  if v_refresh='' then raise exception 'Professional Zoho Mail send authorization is unavailable.'; end if;
  select public.service_get_zoho_provider_credentials() into v_provider;
  if coalesce(v_provider->>'clientId','')='' or coalesce(v_provider->>'clientSecret','')='' then
    raise exception 'Zoho OAuth provider credentials are unavailable.';
  end if;
  return jsonb_build_object(
    'refreshToken',v_refresh,
    'clientId',v_provider->>'clientId',
    'clientSecret',v_provider->>'clientSecret',
    'dataCenter',v_conn.data_center,
    'workEmail',v_conn.work_email,
    'accountId',v_conn.provider_account_id
  );
end;
$$;

revoke all on function public.service_get_zoho_user_mail_send_credentials(uuid) from public,anon,authenticated;
grant execute on function public.service_get_zoho_user_mail_send_credentials(uuid) to service_role;

create or replace function public.crm_prepare_professional_email_send(
  p_lead_id uuid,
  p_subject text,
  p_body text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_lead public.crm_leads%rowtype;
  v_account public.staff_professional_accounts%rowtype;
  v_connection public.zoho_user_mail_send_connections%rowtype;
  v_subject text:=btrim(coalesce(p_subject,''));
  v_body text:=btrim(coalesce(p_body,''));
  v_request public.professional_email_send_requests%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_idempotency_key is null then raise exception 'Email request identifier is required.'; end if;
  if not public.crm_can_access_lead(p_lead_id) then raise exception 'Lead access denied.'; end if;
  if not public.service_professional_mailbox_eligible(v_uid) then raise exception 'Professional email is available only to eligible Sales and Management roles.'; end if;

  select * into v_lead from public.crm_leads where id=p_lead_id;
  if coalesce(nullif(btrim(v_lead.email),''),'')='' then raise exception 'This lead does not have an email address.'; end if;
  if char_length(v_subject) not between 2 and 180 then raise exception 'Email subject must be between 2 and 180 characters.'; end if;
  if char_length(v_body) not between 2 and 4000 then raise exception 'Email message must be between 2 and 4000 characters.'; end if;

  select * into v_account from public.staff_professional_accounts where user_id=v_uid;
  if v_account.user_id is null or v_account.mailbox_status<>'active' or v_account.mail_provider<>'zoho'
     or coalesce(nullif(btrim(v_account.work_email),''),'')=''
     or coalesce(nullif(btrim(v_account.provider_account_id),''),'')='' then
    raise exception 'Your active Zoho professional mailbox is required before sending.';
  end if;

  select * into v_connection from public.zoho_user_mail_send_connections where user_id=v_uid;
  if v_connection.user_id is null or v_connection.status<>'connected'
     or lower(btrim(v_connection.work_email))<>lower(btrim(v_account.work_email))
     or v_connection.provider_account_id<>v_account.provider_account_id then
    raise exception 'Connect your professional Zoho Mail send permission before sending from ProFox.';
  end if;

  select * into v_request
  from public.professional_email_send_requests
  where user_id=v_uid and idempotency_key=p_idempotency_key;
  if v_request.id is not null then
    return jsonb_build_object(
      'requestId',v_request.id,'status',v_request.status,'alreadyExists',true,
      'sender',v_request.sender_email,'recipient',v_request.recipient_email
    );
  end if;

  if (select count(*) from public.professional_email_send_requests where user_id=v_uid and created_at>now()-interval '1 minute')>=10 then
    raise exception 'Professional email send limit reached. Wait a minute before sending again.';
  end if;

  insert into public.professional_email_send_requests(
    idempotency_key,user_id,lead_id,sender_email,recipient_email,subject,message_body,status
  ) values(
    p_idempotency_key,v_uid,p_lead_id,lower(btrim(v_account.work_email)),lower(btrim(v_lead.email)),v_subject,v_body,'pending'
  ) returning * into v_request;

  return jsonb_build_object(
    'requestId',v_request.id,'status','pending','alreadyExists',false,
    'sender',v_request.sender_email,'recipient',v_request.recipient_email,
    'subject',v_request.subject,'body',v_request.message_body
  );
end;
$$;

revoke all on function public.crm_prepare_professional_email_send(uuid,text,text,uuid) from public,anon;
grant execute on function public.crm_prepare_professional_email_send(uuid,text,text,uuid) to authenticated,service_role;

create or replace function public.service_complete_professional_email_send(
  p_request_id uuid,
  p_provider_message_id text,
  p_provider_response_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_request public.professional_email_send_requests%rowtype;
  v_activity_id uuid;
  v_now timestamptz:=now();
begin
  select * into v_request from public.professional_email_send_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'Professional email request not found.'; end if;
  if v_request.status='provider_accepted' then
    return jsonb_build_object('success',true,'alreadyCompleted',true,'requestId',v_request.id,'providerMessageId',v_request.provider_message_id);
  end if;
  if v_request.status<>'pending' then raise exception 'Professional email request is not pending.'; end if;

  update public.professional_email_send_requests
  set status='provider_accepted',provider_message_id=nullif(btrim(coalesce(p_provider_message_id,'')),''),
      provider_response_code=nullif(btrim(coalesce(p_provider_response_code,'')),''),last_error=null,
      completed_at=v_now,updated_at=v_now
  where id=v_request.id;

  insert into public.crm_activities(
    lead_id,assigned_to,activity_type,subject,due_at,completed_at,status,channel,notes,created_by
  ) values(
    v_request.lead_id,v_request.user_id,'Cold Email',v_request.subject,v_now,v_now,'Completed','Email',
    'Sent from ProFox through Zoho Mail. Provider accepted the send request. From: '||v_request.sender_email||
    '. To: '||v_request.recipient_email||'. Message: '||v_request.message_body||
    case when coalesce(nullif(btrim(p_provider_message_id),''),'')<>'' then '. Provider message ID: '||btrim(p_provider_message_id) else '' end,
    v_request.user_id
  ) returning id into v_activity_id;

  update public.crm_leads
  set last_contact_at=v_now,
      initial_outreach_channel=coalesce(nullif(initial_outreach_channel,''),'Email'),
      first_response_at=case when accepted_at is not null and first_response_at is null then v_now else first_response_at end,
      first_response_channel=case when accepted_at is not null and first_response_at is null then 'Email' else first_response_channel end,
      first_response_evidence_type=case when accepted_at is not null and first_response_at is null then 'zoho_provider_accepted' else first_response_evidence_type end,
      first_response_evidence_id=case when accepted_at is not null and first_response_at is null then coalesce(nullif(btrim(p_provider_message_id),''),v_request.id::text) else first_response_evidence_id end,
      updated_at=v_now
  where id=v_request.lead_id;

  update public.zoho_user_mail_send_connections
  set last_attempt_at=v_now,last_verified_at=v_now,last_error=null,updated_at=v_now
  where user_id=v_request.user_id;

  return jsonb_build_object('success',true,'requestId',v_request.id,'activityId',v_activity_id,'providerMessageId',nullif(btrim(coalesce(p_provider_message_id,'')),''));
end;
$$;

revoke all on function public.service_complete_professional_email_send(uuid,text,text) from public,anon,authenticated;
grant execute on function public.service_complete_professional_email_send(uuid,text,text) to service_role;

create or replace function public.service_fail_professional_email_send(
  p_request_id uuid,
  p_error text,
  p_reconnect_required boolean default false,
  p_provider_response_code text default null
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user_id uuid;
  v_error text:=left(coalesce(nullif(btrim(p_error),''),'Zoho Mail send failed.'),500);
begin
  update public.professional_email_send_requests
  set status='failed',last_error=v_error,provider_response_code=nullif(btrim(coalesce(p_provider_response_code,'')),''),completed_at=now(),updated_at=now()
  where id=p_request_id and status='pending'
  returning user_id into v_user_id;

  if v_user_id is not null then
    update public.zoho_user_mail_send_connections
    set status=case when p_reconnect_required then 'reconnect_required' else status end,
        last_attempt_at=now(),last_error=v_error,updated_at=now()
    where user_id=v_user_id;
  end if;
end;
$$;

revoke all on function public.service_fail_professional_email_send(uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.service_fail_professional_email_send(uuid,text,boolean,text) to service_role;

-- Permanent safety posture: these token-bearing/service helpers must never be callable by users.
revoke all on function public.service_store_zoho_user_mail_send_connection(uuid,text,text,text,text,text[]) from public;
revoke all on function public.service_get_zoho_user_mail_send_credentials(uuid) from public;
revoke all on function public.service_complete_professional_email_send(uuid,text,text) from public;
revoke all on function public.service_fail_professional_email_send(uuid,text,boolean,text) from public;

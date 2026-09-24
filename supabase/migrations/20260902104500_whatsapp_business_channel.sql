-- Official WhatsApp Business channel for the unified customer communication center.
-- Credentials remain server-side in Supabase Vault. The public webhook validates
-- the configured verify token and Meta app-secret HMAC before ingesting messages.

create table if not exists public.client_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sales_chat_conversations(id) on delete cascade,
  provider text not null default 'meta_whatsapp_cloud',
  provider_message_id text not null,
  direction text not null check (direction in ('inbound','outbound')),
  employee_user_id uuid references public.user_profiles(id) on delete set null,
  from_phone text not null default '',
  to_phone text not null default '',
  message_type text not null default 'text',
  message_text text not null default '',
  payload_metadata jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'received',
  sent_or_received_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_whatsapp_provider_message_unique unique(provider,provider_message_id),
  constraint client_whatsapp_message_length check (char_length(message_text)<=50000)
);

create index if not exists idx_client_whatsapp_conversation_time
  on public.client_whatsapp_messages(conversation_id,sent_or_received_at desc);
create index if not exists idx_client_whatsapp_employee
  on public.client_whatsapp_messages(employee_user_id,sent_or_received_at desc);

alter table public.client_whatsapp_messages enable row level security;
revoke all on public.client_whatsapp_messages from public,anon,authenticated;
grant select,insert,update,delete on public.client_whatsapp_messages to service_role;

create table if not exists public.whatsapp_send_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  conversation_id uuid not null references public.sales_chat_conversations(id) on delete cascade,
  idempotency_key uuid not null,
  recipient_phone text not null,
  message_body text not null,
  status text not null default 'pending' check (status in ('pending','provider_accepted','failed')),
  provider_message_id text,
  provider_response_code text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint whatsapp_send_request_user_idempotency unique(user_id,idempotency_key),
  constraint whatsapp_send_message_length check (char_length(btrim(message_body)) between 1 and 4000)
);

create index if not exists idx_whatsapp_send_requests_user_created
  on public.whatsapp_send_requests(user_id,created_at desc);
create index if not exists idx_whatsapp_send_requests_conversation
  on public.whatsapp_send_requests(conversation_id,created_at desc);

alter table public.whatsapp_send_requests enable row level security;
revoke all on public.whatsapp_send_requests from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_send_requests to service_role;

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
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required.';
  end if;

  select coalesce(config_value,'{}'::jsonb)
    into v_cfg
  from public.system_configuration
  where config_key='whatsapp_business';

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
    'enabled',coalesce((v_cfg->>'enabled')::boolean,false)
  );
end;
$function$;

create or replace function public.admin_set_whatsapp_business_provider(
  p_phone_number_id text,
  p_business_account_id text,
  p_business_phone text,
  p_graph_api_version text default 'v23.0',
  p_access_token text default '',
  p_verify_token text default '',
  p_app_secret text default '',
  p_enabled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','vault','pg_temp'
as $function$
declare
  v_phone_id text:=btrim(coalesce(p_phone_number_id,''));
  v_business_id text:=btrim(coalesce(p_business_account_id,''));
  v_business_phone text:=regexp_replace(coalesce(p_business_phone,''),'[^0-9]','','g');
  v_version text:=btrim(coalesce(p_graph_api_version,''));
  v_access text:=btrim(coalesce(p_access_token,''));
  v_verify text:=btrim(coalesce(p_verify_token,''));
  v_secret text:=btrim(coalesce(p_app_secret,''));
  v_id uuid;
  v_cfg jsonb;
  v_has_access boolean:=false;
  v_has_verify boolean:=false;
  v_has_secret boolean:=false;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required.';
  end if;

  if v_phone_id !~ '^[0-9]{5,40}$' then raise exception 'Enter a valid WhatsApp Phone Number ID.'; end if;
  if v_business_id !~ '^[0-9]{5,40}$' then raise exception 'Enter a valid WhatsApp Business Account ID.'; end if;
  if char_length(v_business_phone) not between 8 and 15 then raise exception 'Enter the business WhatsApp phone number in international format.'; end if;
  if v_version !~ '^v[0-9]+[.][0-9]+$' then raise exception 'Enter a valid Meta Graph API version such as v23.0.'; end if;
  if v_access<>'' and char_length(v_access) not between 20 and 2000 then raise exception 'WhatsApp access token is invalid.'; end if;
  if v_verify<>'' and char_length(v_verify) not between 12 and 500 then raise exception 'WhatsApp webhook verify token is invalid.'; end if;
  if v_secret<>'' and char_length(v_secret) not between 16 and 500 then raise exception 'Meta app secret is invalid.'; end if;

  select id into v_id from vault.secrets where name='profox_whatsapp_access_token' limit 1;
  if v_access<>'' then
    if v_id is null then perform vault.create_secret(v_access,'profox_whatsapp_access_token','WhatsApp Business permanent/system-user access token',null);
    else perform vault.update_secret(v_id,v_access,'profox_whatsapp_access_token','WhatsApp Business permanent/system-user access token',null); end if;
  elsif v_id is null then
    raise exception 'Enter the WhatsApp access token for the first setup.';
  end if;

  select id into v_id from vault.secrets where name='profox_whatsapp_verify_token' limit 1;
  if v_verify<>'' then
    if v_id is null then perform vault.create_secret(v_verify,'profox_whatsapp_verify_token','WhatsApp webhook verification token',null);
    else perform vault.update_secret(v_id,v_verify,'profox_whatsapp_verify_token','WhatsApp webhook verification token',null); end if;
  elsif v_id is null then
    raise exception 'Enter the webhook verify token for the first setup.';
  end if;

  select id into v_id from vault.secrets where name='profox_whatsapp_app_secret' limit 1;
  if v_secret<>'' then
    if v_id is null then perform vault.create_secret(v_secret,'profox_whatsapp_app_secret','Meta app secret for webhook signature verification',null);
    else perform vault.update_secret(v_id,v_secret,'profox_whatsapp_app_secret','Meta app secret for webhook signature verification',null); end if;
  elsif v_id is null then
    raise exception 'Enter the Meta app secret for the first setup.';
  end if;

  select exists(select 1 from vault.secrets where name='profox_whatsapp_access_token') into v_has_access;
  select exists(select 1 from vault.secrets where name='profox_whatsapp_verify_token') into v_has_verify;
  select exists(select 1 from vault.secrets where name='profox_whatsapp_app_secret') into v_has_secret;

  if coalesce(p_enabled,false) and not (v_has_access and v_has_verify and v_has_secret) then
    raise exception 'WhatsApp cannot be enabled until all provider secrets are stored.';
  end if;

  v_cfg:=jsonb_build_object(
    'phoneNumberId',v_phone_id,
    'businessAccountId',v_business_id,
    'businessPhone',v_business_phone,
    'graphApiVersion',v_version,
    'enabled',coalesce(p_enabled,false)
  );

  insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  values(
    'whatsapp_business',v_cfg,
    'Official Meta WhatsApp Business Cloud API configuration for unified customer communication.',
    auth.uid(),now()
  )
  on conflict(config_key) do update
  set config_value=excluded.config_value,updated_by=auth.uid(),updated_at=now();

  return public.admin_get_whatsapp_business_config();
end;
$function$;

create or replace function public.service_get_whatsapp_business_credentials()
returns jsonb
language sql
stable
security definer
set search_path to 'public','vault','pg_temp'
as $function$
  select coalesce(
    (select config_value from public.system_configuration where config_key='whatsapp_business'),
    '{}'::jsonb
  ) || jsonb_build_object(
    'accessToken',coalesce((select decrypted_secret from vault.decrypted_secrets where name='profox_whatsapp_access_token' limit 1),''),
    'verifyToken',coalesce((select decrypted_secret from vault.decrypted_secrets where name='profox_whatsapp_verify_token' limit 1),''),
    'appSecret',coalesce((select decrypted_secret from vault.decrypted_secrets where name='profox_whatsapp_app_secret' limit 1),'')
  );
$function$;

create or replace function public.service_resolve_client_whatsapp_conversation(p_customer_phone text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_phone text:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
  v_conversation uuid;
  v_lead public.crm_leads%rowtype;
  v_customer_name text;
begin
  if char_length(v_phone) not between 8 and 15 then
    return jsonb_build_object('conversationId',null,'assignmentRequired',true,'reason','invalid_phone');
  end if;

  select c.id
    into v_conversation
  from public.sales_chat_conversations c
  where regexp_replace(coalesce(c.customer_phone,''),'[^0-9]','','g')=v_phone
    and c.current_sales_id is not null
  order by
    case when c.status<>'resolved' then 0 else 1 end,
    case c.conversation_kind when 'website' then 0 when 'quotation' then 1 when 'email' then 2 else 3 end,
    coalesce(c.last_message_time,c.updated_at,c.created_at) desc,
    c.created_at asc,
    c.id asc
  limit 1;

  if v_conversation is not null then
    return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'method','verified_phone_conversation');
  end if;

  select l.*
    into v_lead
  from public.crm_leads l
  join public.user_profiles u on u.id=l.salesperson_id
  where regexp_replace(coalesce(l.phone,''),'[^0-9]','','g')=v_phone
    and l.archived_at is null
    and lower(coalesce(u.status,''))='active'
    and public.internal_chat_is_sales_role(u.role)
  order by coalesce(l.assigned_at,l.updated_at,l.created_at) desc,l.id desc
  limit 1;

  if v_lead.id is null then
    return jsonb_build_object('conversationId',null,'assignmentRequired',true,'reason','no_safe_match');
  end if;

  select c.id
    into v_conversation
  from public.sales_chat_conversations c
  where c.crm_lead_id=v_lead.id
    and c.current_sales_id=v_lead.salesperson_id
  order by
    case c.conversation_kind when 'website' then 0 when 'quotation' then 1 when 'email' then 2 else 3 end,
    coalesce(c.last_message_time,c.updated_at,c.created_at) desc,
    c.created_at asc,c.id asc
  limit 1;

  if v_conversation is null then
    v_customer_name:=coalesce(
      nullif(btrim(coalesce(v_lead.contact_name,'')),''),
      nullif(btrim(coalesce(v_lead.company_name,'')),''),
      'WhatsApp Customer'
    );

    insert into public.sales_chat_conversations(
      public_token_hash,customer_name,customer_email,customer_phone,intent,
      original_sales_id,current_sales_id,crm_lead_id,status,last_message,last_message_time,
      customer_identity_id,conversation_kind
    ) values(
      encode(extensions.digest(gen_random_uuid()::text||clock_timestamp()::text||random()::text,'sha256'),'hex'),
      left(v_customer_name,120),lower(btrim(coalesce(v_lead.email,''))),v_phone,'new_package',
      v_lead.salesperson_id,v_lead.salesperson_id,v_lead.id,'open','',null,
      v_lead.customer_identity_id,'email'
    ) returning id into v_conversation;
  end if;

  return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'method','assigned_crm_phone');
end;
$function$;

create or replace function public.service_upsert_client_whatsapp_message(
  p_conversation_id uuid,
  p_provider_message_id text,
  p_direction text,
  p_employee_user_id uuid,
  p_from_phone text,
  p_to_phone text,
  p_message_type text,
  p_message_text text,
  p_payload_metadata jsonb,
  p_delivery_status text,
  p_sent_or_received_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_id uuid;
  v_at timestamptz:=coalesce(p_sent_or_received_at,now());
  v_preview text;
  v_owner uuid;
begin
  if p_direction not in ('inbound','outbound') then raise exception 'Unsupported WhatsApp direction.'; end if;
  if coalesce(nullif(btrim(p_provider_message_id),''),'')='' then raise exception 'Provider message identifier is required.'; end if;
  if not exists(select 1 from public.sales_chat_conversations where id=p_conversation_id) then raise exception 'Customer conversation not found.'; end if;

  insert into public.client_whatsapp_messages(
    conversation_id,provider,provider_message_id,direction,employee_user_id,
    from_phone,to_phone,message_type,message_text,payload_metadata,delivery_status,
    sent_or_received_at,synced_at,updated_at
  ) values(
    p_conversation_id,'meta_whatsapp_cloud',btrim(p_provider_message_id),p_direction,p_employee_user_id,
    regexp_replace(coalesce(p_from_phone,''),'[^0-9]','','g'),
    regexp_replace(coalesce(p_to_phone,''),'[^0-9]','','g'),
    coalesce(nullif(btrim(p_message_type),''),'text'),left(coalesce(p_message_text,''),50000),
    coalesce(p_payload_metadata,'{}'::jsonb),coalesce(nullif(btrim(p_delivery_status),''),case when p_direction='inbound' then 'received' else 'sent' end),
    v_at,now(),now()
  )
  on conflict(provider,provider_message_id) do update set
    conversation_id=excluded.conversation_id,
    direction=excluded.direction,
    employee_user_id=coalesce(excluded.employee_user_id,public.client_whatsapp_messages.employee_user_id),
    from_phone=excluded.from_phone,
    to_phone=excluded.to_phone,
    message_type=excluded.message_type,
    message_text=excluded.message_text,
    payload_metadata=public.client_whatsapp_messages.payload_metadata||excluded.payload_metadata,
    delivery_status=excluded.delivery_status,
    sent_or_received_at=excluded.sent_or_received_at,
    synced_at=now(),updated_at=now()
  returning id into v_id;

  v_preview:=left(
    case when nullif(btrim(coalesce(p_message_text,'')),'') is not null
      then 'WhatsApp: '||btrim(p_message_text)
      else 'WhatsApp message'
    end,
    500
  );

  update public.sales_chat_conversations
  set last_message=v_preview,
      last_message_time=v_at,
      status=case when p_direction='inbound' and status='resolved' then 'open' else status end,
      updated_at=now()
  where id=p_conversation_id
    and (last_message_time is null or v_at>=last_message_time);

  if p_direction='inbound' then
    select current_sales_id into v_owner from public.sales_chat_conversations where id=p_conversation_id;
    if v_owner is not null then
      perform public.enqueue_in_app_notification(
        v_owner,
        'Customer Message',
        'New WhatsApp message',
        left(coalesce(nullif(btrim(p_message_text),''),'Customer sent a WhatsApp message'),220),
        '/admin/app/crm?tab=inbox&conversation='||p_conversation_id::text,
        'whatsapp-message:'||v_id::text
      );
    end if;
  end if;

  return v_id;
end;
$function$;

create or replace function public.customer_communication_get_capabilities(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','vault','pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_conv public.sales_chat_conversations%rowtype;
  v_cfg jsonb:='{}'::jsonb;
  v_whatsapp_configured boolean:=false;
  v_can_email boolean:=false;
  v_can_status boolean:=false;
  v_phone text:='';
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not public.customer_communication_can_access(p_conversation_id,v_uid) then raise exception 'Conversation access denied.'; end if;

  select * into v_conv from public.sales_chat_conversations where id=p_conversation_id;
  select public.internal_chat_normalize_role(role) into v_role from public.user_profiles where id=v_uid and lower(coalesce(status,''))='active';
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='whatsapp_business';

  v_whatsapp_configured:=
    coalesce((v_cfg->>'enabled')::boolean,false)
    and coalesce(v_cfg->>'phoneNumberId','')<>''
    and coalesce(v_cfg->>'businessPhone','')<>''
    and exists(select 1 from vault.secrets where name='profox_whatsapp_access_token')
    and exists(select 1 from vault.secrets where name='profox_whatsapp_verify_token')
    and exists(select 1 from vault.secrets where name='profox_whatsapp_app_secret');

  v_can_email:=v_role = any(array['admin','sales','sales_rep','sales_team','project_manager','site_manager','manager','management']::text[]);
  v_can_status:=public.customer_communication_can_manage_status(p_conversation_id,v_uid);
  v_phone:=regexp_replace(coalesce(v_conv.customer_phone,''),'[^0-9]','','g');

  return jsonb_build_object(
    'canAccess',true,
    'role',v_role,
    'canSendChat',v_conv.conversation_kind in ('website','quotation'),
    'canViewEmail',v_can_email,
    'canSendEmail',v_can_email,
    'canManageStatus',v_can_status,
    'whatsappConfigured',v_whatsapp_configured,
    'canSendWhatsApp',v_whatsapp_configured and char_length(v_phone) between 8 and 15,
    'customerPhone',v_phone,
    'whatsappBusinessPhone',coalesce(v_cfg->>'businessPhone','')
  );
end;
$function$;

create or replace function public.customer_communication_prepare_whatsapp_send(
  p_conversation_id uuid,
  p_message text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','vault','pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_body text:=btrim(coalesce(p_message,''));
  v_caps jsonb;
  v_phone text;
  v_existing public.whatsapp_send_requests%rowtype;
  v_request public.whatsapp_send_requests%rowtype;
  v_recent integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_idempotency_key is null then raise exception 'Message request identifier is required.'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'WhatsApp message must be between 1 and 4000 characters.'; end if;

  select * into v_existing
  from public.whatsapp_send_requests
  where user_id=v_uid and idempotency_key=p_idempotency_key;

  if found then
    return jsonb_build_object(
      'requestId',v_existing.id,'status',v_existing.status,
      'recipientPhone',v_existing.recipient_phone,'providerMessageId',coalesce(v_existing.provider_message_id,'')
    );
  end if;

  v_caps:=public.customer_communication_get_capabilities(p_conversation_id);
  if not coalesce((v_caps->>'canSendWhatsApp')::boolean,false) then
    raise exception 'WhatsApp is not connected or this customer does not have a valid WhatsApp number.';
  end if;
  v_phone:=v_caps->>'customerPhone';

  select count(*)::integer into v_recent
  from public.whatsapp_send_requests
  where user_id=v_uid and created_at>now()-interval '1 minute';
  if v_recent>=10 then raise exception 'Too many WhatsApp sends. Wait a minute and try again.'; end if;

  insert into public.whatsapp_send_requests(
    user_id,conversation_id,idempotency_key,recipient_phone,message_body,status
  ) values(
    v_uid,p_conversation_id,p_idempotency_key,v_phone,v_body,'pending'
  ) returning * into v_request;

  return jsonb_build_object(
    'requestId',v_request.id,'status',v_request.status,'recipientPhone',v_request.recipient_phone
  );
end;
$function$;

create or replace function public.service_complete_whatsapp_send(
  p_request_id uuid,
  p_provider_message_id text,
  p_provider_response_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_request public.whatsapp_send_requests%rowtype;
  v_cfg jsonb:='{}'::jsonb;
  v_business_phone text:='';
  v_message_id uuid;
  v_now timestamptz:=now();
begin
  select * into v_request from public.whatsapp_send_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'WhatsApp send request not found.'; end if;
  if v_request.status='provider_accepted' then
    return jsonb_build_object('success',true,'alreadyCompleted',true,'requestId',v_request.id,'providerMessageId',v_request.provider_message_id);
  end if;
  if v_request.status<>'pending' then raise exception 'WhatsApp send request is not pending.'; end if;

  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='whatsapp_business';
  v_business_phone:=coalesce(v_cfg->>'businessPhone','');

  update public.whatsapp_send_requests
  set status='provider_accepted',provider_message_id=nullif(btrim(coalesce(p_provider_message_id,'')),''),
      provider_response_code=nullif(btrim(coalesce(p_provider_response_code,'')),''),last_error=null,
      completed_at=v_now,updated_at=v_now
  where id=v_request.id;

  v_message_id:=public.service_upsert_client_whatsapp_message(
    v_request.conversation_id,
    coalesce(nullif(btrim(coalesce(p_provider_message_id,'')),''),'profox-whatsapp-request:'||v_request.id::text),
    'outbound',v_request.user_id,v_business_phone,v_request.recipient_phone,'text',v_request.message_body,
    jsonb_build_object('requestId',v_request.id),'accepted',v_now
  );

  return jsonb_build_object('success',true,'requestId',v_request.id,'messageId',v_message_id,'providerMessageId',nullif(btrim(coalesce(p_provider_message_id,'')),''));
end;
$function$;

create or replace function public.service_fail_whatsapp_send(
  p_request_id uuid,
  p_error text,
  p_provider_response_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  update public.whatsapp_send_requests
  set status='failed',last_error=left(coalesce(p_error,'WhatsApp send failed.'),500),
      provider_response_code=nullif(btrim(coalesce(p_provider_response_code,'')),''),updated_at=now(),completed_at=now()
  where id=p_request_id and status='pending';
  return jsonb_build_object('success',true);
end;
$function$;

create or replace function public.service_update_whatsapp_delivery_status(
  p_provider_message_id text,
  p_status text,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  update public.client_whatsapp_messages
  set delivery_status=left(coalesce(nullif(btrim(p_status),''),'unknown'),80),
      payload_metadata=payload_metadata||jsonb_build_object('lastStatusAt',coalesce(p_at,now())),
      updated_at=now(),synced_at=now()
  where provider='meta_whatsapp_cloud' and provider_message_id=p_provider_message_id;
  return found;
end;
$function$;

create or replace function public.sales_chat_conversation_json(p_conversation public.sales_chat_conversations)
returns jsonb
language sql
stable
set search_path to 'public','pg_temp'
as $function$
 select jsonb_build_object(
  'id',p_conversation.id,'crmLeadId',p_conversation.crm_lead_id,
  'customerName',p_conversation.customer_name,'customerEmail',p_conversation.customer_email,'customerPhone',p_conversation.customer_phone,
  'intent',p_conversation.intent,'originalSalesId',p_conversation.original_sales_id,'currentSalesId',p_conversation.current_sales_id,
  'originalSalesName',(select coalesce(nullif(btrim(u.full_name),''),'ProFox representative') from public.user_profiles u where u.id=p_conversation.original_sales_id),
  'currentSalesName',(select coalesce(nullif(btrim(u.full_name),''),'ProFox representative') from public.user_profiles u where u.id=p_conversation.current_sales_id),
  'currentSalesAvatar',(select coalesce(u.avatar_url,'') from public.user_profiles u where u.id=p_conversation.current_sales_id),
  'currentSalesTitle',(select coalesce(nullif(btrim(cp.job_title),''),'Sales Consultant') from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id where u.id=p_conversation.current_sales_id),
  'currentSalesAvailability',(select case when coalesce(cp.availability_status,'Available')='Available' then 'available' else 'away' end from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id where u.id=p_conversation.current_sales_id),
  'status',p_conversation.status,'ratingGiven',p_conversation.rating_given,'feedbackComment',p_conversation.feedback_comment,
  'lastMessage',p_conversation.last_message,'lastMessageTime',p_conversation.last_message_time,
  'conversationKind',p_conversation.conversation_kind,'quotationId',p_conversation.quotation_id,
  'quotationNumber',(select q.quotation_number from public.quotations q where q.id=p_conversation.quotation_id),
  'customerIdentityId',p_conversation.customer_identity_id,
  'hasWhatsApp',exists(select 1 from public.client_whatsapp_messages w where w.conversation_id=p_conversation.id),
  'customerLastSeenAt',p_conversation.customer_last_seen_at,
  'createdAt',p_conversation.created_at,'updatedAt',p_conversation.updated_at
 );
$function$;

create or replace function public.sales_client_inbox_timeline(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_result jsonb;
  v_role text;
  v_can_view_email boolean:=false;
begin
  if not public.customer_communication_can_access(p_conversation_id,auth.uid()) then
    raise exception 'Conversation access denied.';
  end if;

  select public.internal_chat_normalize_role(role)
    into v_role
  from public.user_profiles
  where id=auth.uid() and lower(coalesce(status,''))='active';

  v_can_view_email:=v_role = any(array[
    'admin','sales','sales_rep','sales_team','project_manager','site_manager','manager','management'
  ]::text[]);

  select coalesce(jsonb_agg(x.item order by x.at,x.tie),'[]'::jsonb)
    into v_result
  from (
    select m.created_at at,m.id::text tie,jsonb_build_object(
      'id',m.id,'channel','chat','direction',case when m.sender_type='customer' then 'inbound' else 'outbound' end,
      'senderType',m.sender_type,'senderName',m.sender_name,'messageText',m.message_text,'subject','',
      'isInternalNote',m.is_internal_note,'createdAt',m.created_at) item
    from public.sales_chat_messages m where m.conversation_id=p_conversation_id

    union all

    select e.sent_or_received_at,e.id::text,jsonb_build_object(
      'id',e.id,'channel','email','provider',e.provider,'direction',e.direction,
      'senderType',case when e.direction='inbound' then 'customer' else 'staff' end,
      'senderName',e.from_email,'fromEmail',e.from_email,'toEmails',e.to_emails,'ccEmails',e.cc_emails,
      'subject',e.subject,'messageText',e.body_text,'bodyHtml','',
      'attachments',e.attachments,'deliveryStatus',e.delivery_status,'providerThreadId',e.provider_thread_id,
      'isInternalNote',false,'createdAt',e.sent_or_received_at,'htmlSuppressed',true) item
    from public.client_email_messages e
    where e.conversation_id=p_conversation_id and v_can_view_email

    union all

    select w.sent_or_received_at,w.id::text,jsonb_build_object(
      'id',w.id,'channel','whatsapp','provider',w.provider,'direction',w.direction,
      'senderType',case when w.direction='inbound' then 'customer' else 'staff' end,
      'senderName',case when w.direction='inbound' then w.from_phone else 'ProFox' end,
      'fromPhone',w.from_phone,'toPhone',w.to_phone,'messageType',w.message_type,
      'messageText',w.message_text,'deliveryStatus',w.delivery_status,
      'isInternalNote',false,'createdAt',w.sent_or_received_at) item
    from public.client_whatsapp_messages w
    where w.conversation_id=p_conversation_id
  ) x;

  return v_result;
end;
$function$;

revoke all on function public.admin_get_whatsapp_business_config() from public,anon,authenticated;
grant execute on function public.admin_get_whatsapp_business_config() to authenticated,service_role;
revoke all on function public.admin_set_whatsapp_business_provider(text,text,text,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_set_whatsapp_business_provider(text,text,text,text,text,text,text,boolean) to authenticated,service_role;

revoke all on function public.service_get_whatsapp_business_credentials() from public,anon,authenticated;
revoke all on function public.service_resolve_client_whatsapp_conversation(text) from public,anon,authenticated;
revoke all on function public.service_upsert_client_whatsapp_message(uuid,text,text,uuid,text,text,text,text,jsonb,text,timestamptz) from public,anon,authenticated;
revoke all on function public.service_complete_whatsapp_send(uuid,text,text) from public,anon,authenticated;
revoke all on function public.service_fail_whatsapp_send(uuid,text,text) from public,anon,authenticated;
revoke all on function public.service_update_whatsapp_delivery_status(text,text,timestamptz) from public,anon,authenticated;

grant execute on function public.service_get_whatsapp_business_credentials() to service_role;
grant execute on function public.service_resolve_client_whatsapp_conversation(text) to service_role;
grant execute on function public.service_upsert_client_whatsapp_message(uuid,text,text,uuid,text,text,text,text,jsonb,text,timestamptz) to service_role;
grant execute on function public.service_complete_whatsapp_send(uuid,text,text) to service_role;
grant execute on function public.service_fail_whatsapp_send(uuid,text,text) to service_role;
grant execute on function public.service_update_whatsapp_delivery_status(text,text,timestamptz) to service_role;

revoke all on function public.customer_communication_get_capabilities(uuid) from public,anon;
grant execute on function public.customer_communication_get_capabilities(uuid) to authenticated,service_role;
revoke all on function public.customer_communication_prepare_whatsapp_send(uuid,text,uuid) from public,anon;
grant execute on function public.customer_communication_prepare_whatsapp_send(uuid,text,uuid) to authenticated,service_role;

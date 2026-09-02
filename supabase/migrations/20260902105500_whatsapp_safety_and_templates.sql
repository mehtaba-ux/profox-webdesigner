-- Safety hardening for WhatsApp customer identity matching and outbound initiation.

create table if not exists public.whatsapp_unmatched_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'meta_whatsapp_cloud',
  provider_message_id text not null,
  from_phone text not null,
  to_phone text not null default '',
  message_type text not null default 'text',
  message_text text not null default '',
  payload_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  resolution_status text not null default 'unmatched' check (resolution_status in ('unmatched','resolved','ignored')),
  resolved_conversation_id uuid references public.sales_chat_conversations(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_unmatched_provider_message_unique unique(provider,provider_message_id)
);

alter table public.whatsapp_unmatched_inbound_messages enable row level security;
revoke all on public.whatsapp_unmatched_inbound_messages from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_unmatched_inbound_messages to service_role;

create or replace function public.service_store_unmatched_whatsapp_message(
  p_provider_message_id text,
  p_from_phone text,
  p_to_phone text,
  p_message_type text,
  p_message_text text,
  p_payload_metadata jsonb,
  p_received_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_id uuid;
begin
  if coalesce(nullif(btrim(p_provider_message_id),''),'')='' then raise exception 'Provider message identifier is required.'; end if;

  insert into public.whatsapp_unmatched_inbound_messages(
    provider,provider_message_id,from_phone,to_phone,message_type,message_text,
    payload_metadata,received_at,updated_at
  ) values(
    'meta_whatsapp_cloud',btrim(p_provider_message_id),
    regexp_replace(coalesce(p_from_phone,''),'[^0-9]','','g'),
    regexp_replace(coalesce(p_to_phone,''),'[^0-9]','','g'),
    coalesce(nullif(btrim(p_message_type),''),'unknown'),left(coalesce(p_message_text,''),50000),
    coalesce(p_payload_metadata,'{}'::jsonb),coalesce(p_received_at,now()),now()
  )
  on conflict(provider,provider_message_id) do update set
    from_phone=excluded.from_phone,to_phone=excluded.to_phone,message_type=excluded.message_type,
    message_text=excluded.message_text,payload_metadata=excluded.payload_metadata,
    received_at=excluded.received_at,updated_at=now()
  returning id into v_id;

  return v_id;
end;
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
  v_identity_count integer:=0;
  v_lead_identity_count integer:=0;
  v_lead public.crm_leads%rowtype;
  v_customer_name text;
begin
  if char_length(v_phone) not between 8 and 15 then
    return jsonb_build_object('conversationId',null,'assignmentRequired',true,'reason','invalid_phone');
  end if;

  select count(distinct (
    coalesce(c.customer_identity_id::text,nullif(lower(btrim(c.customer_email)),''),'conversation:'||c.id::text)
    ||'|seller:'||coalesce(c.current_sales_id::text,'none')
  ))
    into v_identity_count
  from public.sales_chat_conversations c
  join public.user_profiles u on u.id=c.current_sales_id
  where regexp_replace(coalesce(c.customer_phone,''),'[^0-9]','','g')=v_phone
    and lower(coalesce(u.status,''))='active'
    and public.internal_chat_is_sales_role(u.role);

  if v_identity_count>1 then
    return jsonb_build_object('conversationId',null,'assignmentRequired',true,'reason','ambiguous_phone');
  elsif v_identity_count=1 then
    select c.id
      into v_conversation
    from public.sales_chat_conversations c
    join public.user_profiles u on u.id=c.current_sales_id
    where regexp_replace(coalesce(c.customer_phone,''),'[^0-9]','','g')=v_phone
      and lower(coalesce(u.status,''))='active'
      and public.internal_chat_is_sales_role(u.role)
    order by
      case when c.status<>'resolved' then 0 else 1 end,
      case c.conversation_kind when 'website' then 0 when 'quotation' then 1 when 'email' then 2 else 3 end,
      coalesce(c.last_message_time,c.updated_at,c.created_at) desc,
      c.created_at asc,c.id asc
    limit 1;

    return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'method','verified_phone_conversation');
  end if;

  select count(distinct (
    coalesce(l.customer_identity_id::text,nullif(lower(btrim(l.email)),''),'lead:'||l.id::text)
    ||'|seller:'||coalesce(l.salesperson_id::text,'none')
  ))
    into v_lead_identity_count
  from public.crm_leads l
  join public.user_profiles u on u.id=l.salesperson_id
  where regexp_replace(coalesce(l.phone,''),'[^0-9]','','g')=v_phone
    and l.archived_at is null
    and lower(coalesce(u.status,''))='active'
    and public.internal_chat_is_sales_role(u.role);

  if v_lead_identity_count>1 then
    return jsonb_build_object('conversationId',null,'assignmentRequired',true,'reason','ambiguous_crm_phone');
  elsif v_lead_identity_count=0 then
    return jsonb_build_object('conversationId',null,'assignmentRequired',true,'reason','no_safe_match');
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

-- Recreate the Admin setter with optional approved outbound-template settings.
drop function if exists public.admin_set_whatsapp_business_provider(text,text,text,text,text,text,text,boolean);

create function public.admin_set_whatsapp_business_provider(
  p_phone_number_id text,
  p_business_account_id text,
  p_business_phone text,
  p_graph_api_version text default 'v23.0',
  p_access_token text default '',
  p_verify_token text default '',
  p_app_secret text default '',
  p_default_template_name text default '',
  p_default_template_language text default 'en_US',
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
  v_template text:=btrim(coalesce(p_default_template_name,''));
  v_language text:=btrim(coalesce(p_default_template_language,'en_US'));
  v_id uuid;
  v_cfg jsonb;
  v_has_access boolean:=false;
  v_has_verify boolean:=false;
  v_has_secret boolean:=false;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if v_phone_id !~ '^[0-9]{5,40}$' then raise exception 'Enter a valid WhatsApp Phone Number ID.'; end if;
  if v_business_id !~ '^[0-9]{5,40}$' then raise exception 'Enter a valid WhatsApp Business Account ID.'; end if;
  if char_length(v_business_phone) not between 8 and 15 then raise exception 'Enter the business WhatsApp phone number in international format.'; end if;
  if v_version !~ '^v[0-9]+[.][0-9]+$' then raise exception 'Enter a valid Meta Graph API version such as v23.0.'; end if;
  if v_access<>'' and char_length(v_access) not between 20 and 2000 then raise exception 'WhatsApp access token is invalid.'; end if;
  if v_verify<>'' and char_length(v_verify) not between 12 and 500 then raise exception 'WhatsApp webhook verify token is invalid.'; end if;
  if v_secret<>'' and char_length(v_secret) not between 16 and 500 then raise exception 'Meta app secret is invalid.'; end if;
  if v_template<>'' and v_template !~ '^[a-z0-9_]{1,512}$' then raise exception 'WhatsApp template name must use lowercase letters, numbers and underscores.'; end if;
  if v_language !~ '^[A-Za-z]{2,3}([_-][A-Za-z]{2,4})?$' then raise exception 'Enter a valid WhatsApp template language code such as en_US.'; end if;

  select id into v_id from vault.secrets where name='profox_whatsapp_access_token' limit 1;
  if v_access<>'' then
    if v_id is null then perform vault.create_secret(v_access,'profox_whatsapp_access_token','WhatsApp Business permanent/system-user access token',null);
    else perform vault.update_secret(v_id,v_access,'profox_whatsapp_access_token','WhatsApp Business permanent/system-user access token',null); end if;
  elsif v_id is null then raise exception 'Enter the WhatsApp access token for the first setup.'; end if;

  select id into v_id from vault.secrets where name='profox_whatsapp_verify_token' limit 1;
  if v_verify<>'' then
    if v_id is null then perform vault.create_secret(v_verify,'profox_whatsapp_verify_token','WhatsApp webhook verification token',null);
    else perform vault.update_secret(v_id,v_verify,'profox_whatsapp_verify_token','WhatsApp webhook verification token',null); end if;
  elsif v_id is null then raise exception 'Enter the webhook verify token for the first setup.'; end if;

  select id into v_id from vault.secrets where name='profox_whatsapp_app_secret' limit 1;
  if v_secret<>'' then
    if v_id is null then perform vault.create_secret(v_secret,'profox_whatsapp_app_secret','Meta app secret for webhook signature verification',null);
    else perform vault.update_secret(v_id,v_secret,'profox_whatsapp_app_secret','Meta app secret for webhook signature verification',null); end if;
  elsif v_id is null then raise exception 'Enter the Meta app secret for the first setup.'; end if;

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
    'defaultTemplateName',v_template,
    'defaultTemplateLanguage',v_language,
    'enabled',coalesce(p_enabled,false)
  );

  insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  values('whatsapp_business',v_cfg,'Official Meta WhatsApp Business Cloud API configuration for unified customer communication.',auth.uid(),now())
  on conflict(config_key) do update set config_value=excluded.config_value,updated_by=auth.uid(),updated_at=now();

  return public.admin_get_whatsapp_business_config();
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
  v_whatsapp_session_open boolean:=false;
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

  select exists(
    select 1 from public.client_whatsapp_messages w
    where w.conversation_id=p_conversation_id
      and w.direction='inbound'
      and w.sent_or_received_at>now()-interval '24 hours'
  ) into v_whatsapp_session_open;

  v_can_email:=v_role = any(array['admin','sales','sales_rep','sales_team','project_manager','site_manager','manager','management']::text[]);
  v_can_status:=public.customer_communication_can_manage_status(p_conversation_id,v_uid);
  v_phone:=regexp_replace(coalesce(v_conv.customer_phone,''),'[^0-9]','','g');

  return jsonb_build_object(
    'canAccess',true,'role',v_role,
    'canSendChat',v_conv.conversation_kind in ('website','quotation'),
    'canViewEmail',v_can_email,'canSendEmail',v_can_email,'canManageStatus',v_can_status,
    'whatsappConfigured',v_whatsapp_configured,
    'whatsappSessionOpen',v_whatsapp_session_open,
    'whatsappTemplateConfigured',coalesce(v_cfg->>'defaultTemplateName','')<>'',
    'whatsappTemplateName',coalesce(v_cfg->>'defaultTemplateName',''),
    'canSendWhatsApp',v_whatsapp_configured and char_length(v_phone) between 8 and 15
      and (v_whatsapp_session_open or coalesce(v_cfg->>'defaultTemplateName','')<>''),
    'customerPhone',v_phone,
    'whatsappBusinessPhone',coalesce(v_cfg->>'businessPhone','')
  );
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
declare
  v_next text:=lower(btrim(coalesce(p_status,'unknown')));
  v_current text;
  v_current_rank integer;
  v_next_rank integer;
begin
  select lower(delivery_status) into v_current
  from public.client_whatsapp_messages
  where provider='meta_whatsapp_cloud' and provider_message_id=p_provider_message_id
  for update;

  if not found then return false; end if;

  v_current_rank:=case v_current when 'accepted' then 1 when 'sent' then 2 when 'delivered' then 3 when 'read' then 4 when 'failed' then 5 else 0 end;
  v_next_rank:=case v_next when 'accepted' then 1 when 'sent' then 2 when 'delivered' then 3 when 'read' then 4 when 'failed' then 5 else 0 end;

  if v_next='failed' or v_next_rank>=v_current_rank then
    update public.client_whatsapp_messages
    set delivery_status=left(v_next,80),
        payload_metadata=payload_metadata||jsonb_build_object('lastStatusAt',coalesce(p_at,now())),
        updated_at=now(),synced_at=now()
    where provider='meta_whatsapp_cloud' and provider_message_id=p_provider_message_id;
  end if;

  return true;
end;
$function$;

revoke all on function public.service_store_unmatched_whatsapp_message(text,text,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.service_store_unmatched_whatsapp_message(text,text,text,text,text,jsonb,timestamptz) to service_role;
revoke all on function public.admin_set_whatsapp_business_provider(text,text,text,text,text,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_set_whatsapp_business_provider(text,text,text,text,text,text,text,text,text,boolean) to authenticated,service_role;

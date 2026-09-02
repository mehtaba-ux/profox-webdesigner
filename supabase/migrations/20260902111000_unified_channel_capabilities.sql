-- Resolve Email/WhatsApp capability facts across every protected conversation row
-- representing the same seller+customer, rather than only one backing record.

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
  v_can_view_email boolean:=false;
  v_can_send_email boolean:=false;
  v_can_status boolean:=false;
  v_phone text:='';
  v_crm_lead_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not public.customer_communication_can_access(p_conversation_id,v_uid) then raise exception 'Conversation access denied.'; end if;

  select * into v_conv from public.sales_chat_conversations where id=p_conversation_id;
  select public.internal_chat_normalize_role(role) into v_role
  from public.user_profiles where id=v_uid and lower(coalesce(status,''))='active';
  select coalesce((select config_value from public.system_configuration where config_key='whatsapp_business'),'{}'::jsonb) into v_cfg;

  v_whatsapp_configured:=
    coalesce((v_cfg->>'enabled')::boolean,false)
    and coalesce(v_cfg->>'phoneNumberId','')<>''
    and coalesce(v_cfg->>'businessPhone','')<>''
    and exists(select 1 from vault.secrets where name='profox_whatsapp_access_token')
    and exists(select 1 from vault.secrets where name='profox_whatsapp_verify_token')
    and exists(select 1 from vault.secrets where name='profox_whatsapp_app_secret');

  select c.crm_lead_id
    into v_crm_lead_id
  from public.sales_chat_conversations c
  where c.current_sales_id=v_conv.current_sales_id
    and c.crm_lead_id is not null
    and (
      (v_conv.customer_identity_id is not null and c.customer_identity_id=v_conv.customer_identity_id)
      or (
        nullif(lower(btrim(coalesce(v_conv.customer_email,''))),'') is not null
        and lower(btrim(coalesce(c.customer_email,'')))=lower(btrim(v_conv.customer_email))
      )
    )
  order by coalesce(c.last_message_time,c.updated_at,c.created_at) desc,c.id
  limit 1;
  v_crm_lead_id:=coalesce(v_conv.crm_lead_id,v_crm_lead_id);

  select regexp_replace(coalesce(c.customer_phone,''),'[^0-9]','','g')
    into v_phone
  from public.sales_chat_conversations c
  where c.current_sales_id=v_conv.current_sales_id
    and char_length(regexp_replace(coalesce(c.customer_phone,''),'[^0-9]','','g')) between 8 and 15
    and (
      c.id=v_conv.id
      or (v_conv.customer_identity_id is not null and c.customer_identity_id=v_conv.customer_identity_id)
      or (
        nullif(lower(btrim(coalesce(v_conv.customer_email,''))),'') is not null
        and lower(btrim(coalesce(c.customer_email,'')))=lower(btrim(v_conv.customer_email))
      )
    )
  order by case when c.id=v_conv.id then 0 else 1 end,coalesce(c.last_message_time,c.updated_at,c.created_at) desc,c.id
  limit 1;
  v_phone:=coalesce(v_phone,'');

  select exists(
    select 1
    from public.client_whatsapp_messages w
    join public.sales_chat_conversations c on c.id=w.conversation_id
    where w.direction='inbound'
      and w.sent_or_received_at>now()-interval '24 hours'
      and c.current_sales_id=v_conv.current_sales_id
      and (
        c.id=v_conv.id
        or (v_conv.customer_identity_id is not null and c.customer_identity_id=v_conv.customer_identity_id)
        or (
          nullif(lower(btrim(coalesce(v_conv.customer_email,''))),'') is not null
          and lower(btrim(coalesce(c.customer_email,'')))=lower(btrim(v_conv.customer_email))
        )
      )
  ) into v_whatsapp_session_open;

  v_can_view_email:=v_role = any(array[
    'admin','sales','sales_rep','sales_team','project_manager','site_manager','manager','management'
  ]::text[]);
  v_can_send_email:=
    v_can_view_email
    and v_crm_lead_id is not null
    and public.service_professional_mailbox_eligible(v_uid)
    and public.crm_can_access_lead(v_crm_lead_id);
  v_can_status:=public.customer_communication_can_manage_status(p_conversation_id,v_uid);

  return jsonb_build_object(
    'canAccess',true,'role',v_role,
    'canSendChat',exists(
      select 1 from public.sales_chat_conversations c
      where c.current_sales_id=v_conv.current_sales_id
        and c.conversation_kind in ('website','quotation')
        and (
          c.id=v_conv.id
          or (v_conv.customer_identity_id is not null and c.customer_identity_id=v_conv.customer_identity_id)
          or (
            nullif(lower(btrim(coalesce(v_conv.customer_email,''))),'') is not null
            and lower(btrim(coalesce(c.customer_email,'')))=lower(btrim(v_conv.customer_email))
          )
        )
    ),
    'canViewEmail',v_can_view_email,'canSendEmail',v_can_send_email,'canManageStatus',v_can_status,
    'crmLeadId',v_crm_lead_id,
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
  v_use_template boolean:=false;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_idempotency_key is null then raise exception 'Message request identifier is required.'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'WhatsApp message must be between 1 and 4000 characters.'; end if;

  v_caps:=public.customer_communication_get_capabilities(p_conversation_id);
  if not coalesce((v_caps->>'canSendWhatsApp')::boolean,false) then
    raise exception 'WhatsApp is not connected, the customer number is invalid, or an approved outbound template is required.';
  end if;
  v_phone:=v_caps->>'customerPhone';
  v_use_template:=not coalesce((v_caps->>'whatsappSessionOpen')::boolean,false);

  select * into v_existing
  from public.whatsapp_send_requests
  where user_id=v_uid and idempotency_key=p_idempotency_key;

  if found then
    return jsonb_build_object(
      'requestId',v_existing.id,'status',v_existing.status,
      'recipientPhone',v_existing.recipient_phone,'providerMessageId',coalesce(v_existing.provider_message_id,''),
      'useTemplate',v_use_template
    );
  end if;

  select count(*)::integer into v_recent
  from public.whatsapp_send_requests
  where user_id=v_uid and created_at>now()-interval '1 minute';
  if v_recent>=10 then raise exception 'Too many WhatsApp sends. Wait a minute and try again.'; end if;

  insert into public.whatsapp_send_requests(
    user_id,conversation_id,idempotency_key,recipient_phone,message_body,status
  ) values(v_uid,p_conversation_id,p_idempotency_key,v_phone,v_body,'pending')
  returning * into v_request;

  return jsonb_build_object(
    'requestId',v_request.id,'status',v_request.status,'recipientPhone',v_request.recipient_phone,
    'useTemplate',v_use_template
  );
end;
$function$;

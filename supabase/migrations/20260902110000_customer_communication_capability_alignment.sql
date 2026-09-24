-- Keep professional-email visibility aligned with the Sales/Management boundary,
-- while advertising send permission only when the current user also passes the
-- exact CRM-lead and professional-mailbox checks used by the send RPC.

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
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not public.customer_communication_can_access(p_conversation_id,v_uid) then raise exception 'Conversation access denied.'; end if;

  select * into v_conv from public.sales_chat_conversations where id=p_conversation_id;
  select public.internal_chat_normalize_role(role) into v_role
  from public.user_profiles where id=v_uid and lower(coalesce(status,''))='active';
  select coalesce(
    (select config_value from public.system_configuration where config_key='whatsapp_business'),
    '{}'::jsonb
  ) into v_cfg;

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

  v_can_view_email:=v_role = any(array[
    'admin','sales','sales_rep','sales_team','project_manager','site_manager','manager','management'
  ]::text[]);
  v_can_send_email:=
    v_can_view_email
    and v_conv.crm_lead_id is not null
    and public.service_professional_mailbox_eligible(v_uid)
    and public.crm_can_access_lead(v_conv.crm_lead_id);
  v_can_status:=public.customer_communication_can_manage_status(p_conversation_id,v_uid);
  v_phone:=regexp_replace(coalesce(v_conv.customer_phone,''),'[^0-9]','','g');

  return jsonb_build_object(
    'canAccess',true,'role',v_role,
    'canSendChat',v_conv.conversation_kind in ('website','quotation'),
    'canViewEmail',v_can_view_email,'canSendEmail',v_can_send_email,'canManageStatus',v_can_status,
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

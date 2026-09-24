-- Keep inbound WhatsApp identity resolution fail-closed when a CRM lead has a
-- phone number but no usable email identity. sales_chat_conversations requires a
-- real customer_email, so never invent a placeholder or let the webhook hit that
-- constraint. The message remains in whatsapp_unmatched_inbound_messages until an
-- administrator/customer-identity workflow can resolve it safely.

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
  v_email text;
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
    v_email:=lower(btrim(coalesce(v_lead.email,'')));
    if char_length(v_email) < 5 or position('@' in v_email) <= 1 then
      return jsonb_build_object(
        'conversationId',null,
        'assignmentRequired',true,
        'reason','crm_email_required_for_unified_identity',
        'crmLeadId',v_lead.id
      );
    end if;

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
      left(v_customer_name,120),v_email,v_phone,'new_package',
      v_lead.salesperson_id,v_lead.salesperson_id,v_lead.id,'open','',null,
      v_lead.customer_identity_id,'email'
    ) returning id into v_conversation;
  end if;

  return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'method','assigned_crm_phone');
end;
$function$;

revoke all on function public.service_resolve_client_whatsapp_conversation(text) from public,anon,authenticated;
grant execute on function public.service_resolve_client_whatsapp_conversation(text) to service_role;

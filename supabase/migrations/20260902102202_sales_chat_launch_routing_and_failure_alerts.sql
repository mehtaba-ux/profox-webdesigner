create or replace function public.sales_chat_send_message(p_conversation_id uuid,p_message text,p_internal_note boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_name text;
  v_body text:=btrim(coalesce(p_message,''));
  v_message public.sales_chat_messages%rowtype;
  v_conv public.sales_chat_conversations%rowtype;
  v_q public.quotations%rowtype;
  v_url text;
  v_presence text;
  v_context jsonb;
  v_started jsonb;
begin
  if not public.sales_chat_can_manage(p_conversation_id) then raise exception 'Conversation access denied.'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters.'; end if;

  select coalesce(nullif(btrim(full_name),''),'Sales representative') into v_name
  from public.user_profiles where id=v_uid and status='active';

  select * into v_conv from public.sales_chat_conversations where id=p_conversation_id for update;
  if not found then raise exception 'Conversation not found.'; end if;

  -- The unified inbox may use the CRM email record as the launch point before a website
  -- conversation exists. The first Website Chat send is atomically redirected into the
  -- canonical website thread and sends the secure invitation email exactly once.
  if not coalesce(p_internal_note,false)
     and v_conv.conversation_kind='email'
     and v_conv.crm_lead_id is not null then
    v_started:=public.sales_start_customer_chat(v_conv.crm_lead_id,v_body);
    return v_started->'message';
  end if;

  insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,sender_id,message_text,is_internal_note)
  values(p_conversation_id,'sales_rep',v_name,v_uid,v_body,coalesce(p_internal_note,false))
  returning * into v_message;

  if not coalesce(p_internal_note,false) then
    update public.sales_chat_conversations
    set last_message=v_body,last_message_time=v_message.created_at,updated_at=now(),status='open'
    where id=p_conversation_id;

    update public.crm_leads
    set first_response_at=coalesce(first_response_at,v_message.created_at),last_contact_at=now(),updated_at=now()
    where id=v_conv.crm_lead_id;

    if v_conv.conversation_kind='quotation' and v_conv.quotation_id is not null then
      select * into v_q from public.quotations where id=v_conv.quotation_id;
      if found and btrim(coalesce(v_conv.customer_email,''))<>'' then
        v_url:=public.quotation_conversation_resume_url(v_q.id);
        v_presence:=coalesce(floor(extract(epoch from v_conv.customer_last_seen_at))::bigint,0)::text;
        v_context:=jsonb_build_object(
          'conversationId',v_conv.id,'quotationId',v_q.id,'quotationNumber',v_q.quotation_number,
          'sellerName',v_name,'messagePreview',left(v_body,350),'conversationUrl',v_url,
          'sellerMessageCreatedAt',v_message.created_at
        );
        perform public.service_queue_customer_communication(
          'quotation-conversation-offline:'||v_conv.id::text||':'||v_presence,
          'customer_quotation_conversation_reply',v_conv.customer_email,v_uid,v_conv.customer_name,
          v_q.customer_name,v_context,now()+interval '90 seconds'
        );
      end if;
    elsif v_conv.conversation_kind='website' and btrim(coalesce(v_conv.customer_email,''))<>'' then
      v_url:=public.service_sales_chat_customer_link_url(v_conv.id,v_uid);
      v_presence:=coalesce(floor(extract(epoch from v_conv.customer_last_seen_at))::bigint,0)::text;
      v_context:=jsonb_build_object(
        'crmLeadId',v_conv.crm_lead_id,'conversationId',v_conv.id,'sellerName',v_name,
        'messagePreview',left(v_body,600),'conversationUrl',v_url,
        'sellerMessageCreatedAt',v_message.created_at,'source','website_live_chat'
      );
      perform public.service_queue_customer_communication(
        'website-chat-offline:'||v_conv.id::text||':'||v_presence,
        'customer_sales_chat_reply',v_conv.customer_email,v_uid,v_conv.customer_name,
        v_conv.customer_name,v_context,now()+interval '5 minutes'
      );
    end if;
  end if;

  return public.sales_chat_message_json(v_message);
end;
$$;

create or replace function public.crm_audit_chat_notification_outbox()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_lead uuid;
  v_conv uuid;
  v_owner uuid;
  v_event text;
  v_title text;
  v_customer text;
  v_dedupe text;
begin
  if new.template_key not in ('customer_sales_chat_started','customer_sales_chat_reply') then return new; end if;
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;

  v_lead:=nullif(new.payload->>'crmLeadId','')::uuid;
  v_conv:=nullif(new.payload->>'conversationId','')::uuid;
  if v_lead is null then select crm_lead_id into v_lead from public.sales_chat_conversations where id=v_conv; end if;
  if v_lead is null then return new; end if;

  if new.status='Sent' then
    v_event:='chat_email_sent';
    v_title:=case when new.template_key='customer_sales_chat_started' then 'Chat invitation email sent' else 'Unread chat email sent' end;
  elsif new.status='Failed' then
    v_event:='chat_email_failed';
    v_title:='Customer chat email failed';
  elsif new.status='Cancelled' then
    return new;
  else
    return new;
  end if;

  perform public.crm_write_lead_event(
    v_lead,v_event,v_title,left(coalesce(new.last_error,''),500),
    jsonb_build_object('conversationId',v_conv,'notificationId',new.id,'templateKey',new.template_key,'status',new.status),
    null,'ProFox automation','system',coalesce(new.sent_at,new.updated_at,now()),
    'chat-notification:'||new.id::text||':'||lower(new.status)
  );

  if new.status='Failed' then
    select salesperson_id,coalesce(nullif(btrim(contact_name),''),'Customer') into v_owner,v_customer
    from public.crm_leads where id=v_lead;
    if v_owner is not null then
      v_dedupe:='chat-email-failed:'||new.id::text;
      perform public.enqueue_in_app_notification(
        v_owner,'Customer Chat Email Failed','Action required',
        v_customer||'''s chat email could not be delivered. Verify the registered email or contact the customer through another approved channel.',
        '/admin/app/sales?tab=inbox&conversation='||coalesce(v_conv::text,''),v_dedupe
      );
      update public.in_app_notifications
      set category='Action Required',module='Sales',priority='High',
          metadata=jsonb_build_object('conversationId',v_conv,'crmLeadId',v_lead,'notificationId',new.id,'source','customer_chat_email_failure')
      where dedupe_key=v_dedupe;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.crm_audit_chat_notification_outbox() from public,anon,authenticated;

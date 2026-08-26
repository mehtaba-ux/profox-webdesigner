create or replace function public.client_portal_send_conversation_message(p_conversation_id uuid,p_message text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_uid uuid:=auth.uid(); v_identity public.customer_identities%rowtype; v_conv public.sales_chat_conversations%rowtype; v_msg public.sales_chat_messages%rowtype; v_body text:=btrim(coalesce(p_message,'')); v_name text; v_dedupe text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not exists(select 1 from public.user_profiles p where p.id=v_uid and p.role='customer' and p.status='active') then raise exception 'Active customer portal access required.'; end if;
  select * into v_identity from public.customer_identities where linked_user_id=v_uid;
  if not found then raise exception 'No customer relationship is linked to this portal account.'; end if;
  select * into v_conv from public.sales_chat_conversations where id=p_conversation_id and customer_identity_id=v_identity.id for update;
  if not found then raise exception 'Conversation is not available in this portal account.'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters.'; end if;
  select coalesce(nullif(btrim(full_name),''),nullif(v_identity.display_name,''),'Customer') into v_name from public.user_profiles where id=v_uid;
  insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,message_text) values(v_conv.id,'customer',v_name,v_body) returning * into v_msg;
  update public.sales_chat_conversations set last_message=v_body,last_message_time=v_msg.created_at,customer_last_seen_at=now(),status='open',updated_at=now() where id=v_conv.id;
  update public.customer_identities set last_seen_at=greatest(last_seen_at,now()),updated_at=now() where id=v_identity.id;
  if v_conv.current_sales_id is not null then
    v_dedupe:='portal-customer-message:'||v_msg.id::text;
    perform public.enqueue_in_app_notification(v_conv.current_sales_id,'Customer Message',case when v_conv.conversation_kind='quotation' then 'New quotation conversation message' else 'New customer portal message' end,coalesce(nullif(v_name,''),'Customer')||': '||left(v_body,220),'/admin/app/sales?tab=inbox&conversation='||v_conv.id::text,v_dedupe);
    update public.in_app_notifications set category='Action Required',module='Sales',priority='High',metadata=jsonb_build_object('conversationId',v_conv.id,'quotationId',v_conv.quotation_id,'customerIdentityId',v_identity.id,'message',v_body,'source','customer_portal') where dedupe_key=v_dedupe;
  end if;
  return public.sales_chat_message_json(v_msg);
end;$function$;
revoke all on function public.client_portal_send_conversation_message(uuid,text) from public,anon;
grant execute on function public.client_portal_send_conversation_message(uuid,text) to authenticated,service_role,postgres;
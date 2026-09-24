create or replace function public.sales_start_customer_chat(p_lead_id uuid,p_message text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_lead public.crm_leads%rowtype;
  v_identity uuid;
  v_conv public.sales_chat_conversations%rowtype;
  v_msg public.sales_chat_messages%rowtype;
  v_body text:=btrim(coalesce(p_message,''));
  v_seller_name text;
  v_seller_id uuid;
  v_requirement text;
  v_url text;
  v_notification uuid;
  v_notification_status text;
  v_legacy_token uuid:=gen_random_uuid();
begin
  if v_uid is null or not public.sales_chat_is_staff() then raise exception 'Sales chat access required.'; end if;
  if not public.crm_can_access_lead(p_lead_id) then raise exception 'Lead access denied.'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters.'; end if;

  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if not found then raise exception 'Lead not found.'; end if;
  if btrim(coalesce(v_lead.email,''))='' then raise exception 'A registered customer email address is required before starting website chat.'; end if;

  v_identity:=coalesce(v_lead.customer_identity_id,public.customer_identity_resolve(v_lead.email,v_lead.contact_name,v_lead.phone));
  if v_identity is null then raise exception 'A valid registered customer email address is required before starting website chat.'; end if;
  if v_lead.customer_identity_id is distinct from v_identity then
    update public.crm_leads set customer_identity_id=v_identity,updated_at=now() where id=v_lead.id;
  end if;

  v_seller_id:=coalesce(v_lead.salesperson_id,v_uid);
  select coalesce(nullif(btrim(full_name),''),'ProFox representative') into v_seller_name
  from public.user_profiles where id=v_seller_id and status='active';
  if v_seller_name is null then
    v_seller_id:=v_uid;
    select coalesce(nullif(btrim(full_name),''),'ProFox representative') into v_seller_name from public.user_profiles where id=v_uid;
  end if;

  select * into v_conv
  from public.sales_chat_conversations
  where conversation_kind='website' and customer_identity_id=v_identity
  order by case when crm_lead_id=v_lead.id then 0 else 1 end,created_at asc
  limit 1 for update;

  if not found then
    insert into public.sales_chat_conversations(
      public_token_hash,customer_name,customer_email,customer_phone,intent,original_sales_id,current_sales_id,
      crm_lead_id,status,last_message,last_message_time,customer_identity_id,conversation_kind,created_at,updated_at
    ) values(
      encode(extensions.digest(v_legacy_token::text,'sha256'),'hex'),
      coalesce(nullif(btrim(v_lead.contact_name),''),'Customer'),lower(btrim(v_lead.email)),coalesce(v_lead.phone,''),
      'new_package',v_seller_id,v_seller_id,v_lead.id,'open','',null,v_identity,'website',now(),now()
    ) returning * into v_conv;
  else
    update public.sales_chat_conversations
    set customer_name=coalesce(nullif(btrim(v_lead.contact_name),''),customer_name),
        customer_email=lower(btrim(v_lead.email)),
        customer_phone=coalesce(nullif(btrim(v_lead.phone),''),customer_phone),
        crm_lead_id=v_lead.id,current_sales_id=v_seller_id,customer_identity_id=v_identity,status='open',updated_at=now()
    where id=v_conv.id returning * into v_conv;
  end if;

  v_url:=public.service_sales_chat_customer_link_url(v_conv.id,v_uid);

  insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,sender_id,message_text,is_internal_note)
  values(v_conv.id,'sales_rep',v_seller_name,v_uid,v_body,false)
  returning * into v_msg;

  update public.sales_chat_conversations
  set last_message=v_body,last_message_time=v_msg.created_at,status='open',updated_at=now()
  where id=v_conv.id returning * into v_conv;

  v_requirement:=coalesce(nullif(btrim(v_lead.service_interest),''),'Your ProFox enquiry');
  if btrim(coalesce(v_lead.project_details,''))<>'' then
    v_requirement:=v_requirement||E'\n'||left(btrim(v_lead.project_details),600);
  elsif btrim(coalesce(v_lead.business_goal,''))<>'' then
    v_requirement:=v_requirement||E'\n'||left(btrim(v_lead.business_goal),600);
  end if;

  v_notification:=public.service_queue_customer_communication(
    'sales-chat-start:'||v_conv.id::text,
    'customer_sales_chat_started',
    v_conv.customer_email,
    v_seller_id,
    v_conv.customer_name,
    coalesce(nullif(btrim(v_lead.company_name),''),v_conv.customer_name),
    jsonb_build_object(
      'crmLeadId',v_lead.id,'conversationId',v_conv.id,'sellerName',v_seller_name,
      'requirementSummary',v_requirement,'messagePreview',left(v_body,600),'conversationUrl',v_url,
      'sellerMessageCreatedAt',v_msg.created_at,'source','sales_started_website_chat'
    ),
    now()
  );

  if v_notification is null then
    raise exception 'Website Chat cannot be started because the transactional invitation email is unavailable. Verify customer email automation and try again.';
  end if;

  select status into v_notification_status from public.notification_outbox where id=v_notification;
  if v_notification_status='Suppressed' then
    raise exception 'Website Chat cannot be started because this customer email address is currently suppressed. Verify or correct the registered email address first.';
  end if;

  perform public.crm_write_lead_event(
    v_lead.id,'chat_invitation_queued','Secure customer chat started',
    'A seller started the website conversation and queued the secure customer invitation email.',
    jsonb_build_object('conversationId',v_conv.id,'notificationId',v_notification,'customerIdentityId',v_identity),
    v_uid,v_seller_name,null,now(),'chat-invitation-queued:'||v_conv.id::text
  );

  return jsonb_build_object(
    'conversation',public.sales_chat_conversation_json(v_conv),
    'message',public.sales_chat_message_json(v_msg),
    'conversationUrl',v_url,
    'invitationQueued',true,
    'recipientEmail',v_conv.customer_email
  );
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
  elsif new.status='Suppressed' then
    v_event:='chat_email_suppressed';
    v_title:='Customer chat email suppressed';
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

  if new.status in ('Failed','Suppressed') then
    select salesperson_id,coalesce(nullif(btrim(contact_name),''),'Customer') into v_owner,v_customer
    from public.crm_leads where id=v_lead;
    if v_owner is not null then
      v_dedupe:='chat-email-action:'||new.id::text||':'||lower(new.status);
      perform public.enqueue_in_app_notification(
        v_owner,
        case when new.status='Suppressed' then 'Customer Chat Email Suppressed' else 'Customer Chat Email Failed' end,
        'Action required',
        v_customer||'''s chat email could not be delivered. Verify the registered email or contact the customer through another approved channel.',
        '/admin/app/sales?tab=inbox&conversation='||coalesce(v_conv::text,''),
        v_dedupe
      );
      update public.in_app_notifications
      set category='Action Required',module='Sales',priority='High',
          metadata=jsonb_build_object(
            'conversationId',v_conv,'crmLeadId',v_lead,'notificationId',new.id,
            'notificationStatus',new.status,'source','customer_chat_email_delivery_action'
          )
      where dedupe_key=v_dedupe;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_audit_chat_notification_outbox on public.notification_outbox;
create trigger trg_crm_audit_chat_notification_outbox
  after insert or update of status on public.notification_outbox
  for each row execute function public.crm_audit_chat_notification_outbox();

revoke all on function public.crm_audit_chat_notification_outbox() from public,anon,authenticated;

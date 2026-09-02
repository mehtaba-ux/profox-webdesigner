-- Durable read receipts and unread tracking for the canonical customer chat.
-- Historical messages are initialized as read because read state did not exist before this migration.

alter table public.sales_chat_messages
  add column if not exists staff_read_at timestamptz,
  add column if not exists customer_read_at timestamptz;

update public.sales_chat_messages
set staff_read_at = coalesce(staff_read_at, now())
where sender_type = 'customer' and not is_internal_note;

update public.sales_chat_messages
set customer_read_at = coalesce(customer_read_at, now())
where sender_type = 'sales_rep' and not is_internal_note;

create index if not exists sales_chat_messages_staff_unread_idx
  on public.sales_chat_messages(conversation_id, created_at)
  where sender_type='customer' and not is_internal_note and staff_read_at is null;

create index if not exists sales_chat_messages_customer_unread_idx
  on public.sales_chat_messages(conversation_id, created_at)
  where sender_type='sales_rep' and not is_internal_note and customer_read_at is null;

create or replace function public.sales_chat_message_json(p_message public.sales_chat_messages)
returns jsonb
language sql
stable
set search_path='public','pg_temp'
as $$
  select jsonb_build_object(
    'id',p_message.id,
    'conversationId',p_message.conversation_id,
    'senderType',p_message.sender_type,
    'senderName',p_message.sender_name,
    'senderId',p_message.sender_id,
    'messageText',p_message.message_text,
    'isInternalNote',p_message.is_internal_note,
    'staffReadAt',p_message.staff_read_at,
    'customerReadAt',p_message.customer_read_at,
    'createdAt',p_message.created_at
  )
$$;

create or replace function public.sales_chat_conversation_json(p_conversation public.sales_chat_conversations)
returns jsonb
language sql
stable
set search_path='public','pg_temp'
as $$
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
  'unreadCount',(select count(*) from public.sales_chat_messages m where m.conversation_id=p_conversation.id and m.sender_type='customer' and not m.is_internal_note and m.staff_read_at is null),
  'latestUnreadCustomerMessageId',(select m.id from public.sales_chat_messages m where m.conversation_id=p_conversation.id and m.sender_type='customer' and not m.is_internal_note and m.staff_read_at is null order by m.created_at desc,m.id desc limit 1),
  'customerUnreadCount',(select count(*) from public.sales_chat_messages m where m.conversation_id=p_conversation.id and m.sender_type='sales_rep' and not m.is_internal_note and m.customer_read_at is null),
  'customerLastSeenAt',p_conversation.customer_last_seen_at,
  'createdAt',p_conversation.created_at,'updatedAt',p_conversation.updated_at
 );
$$;

create or replace function public.public_sales_chat_get_messages(p_conversation_id uuid, p_access_token uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $$
declare v_result jsonb;
begin
  if not public.sales_chat_public_token_valid(p_conversation_id,p_access_token) then raise exception 'Conversation not found.'; end if;

  update public.sales_chat_conversations set customer_last_seen_at=now()
  where id=p_conversation_id and (customer_last_seen_at is null or customer_last_seen_at<now()-interval '20 seconds');

  update public.sales_chat_messages
  set customer_read_at=coalesce(customer_read_at,now())
  where conversation_id=p_conversation_id
    and sender_type='sales_rep'
    and not is_internal_note
    and customer_read_at is null;

  perform public.service_cancel_pending_sales_chat_offline_notifications(p_conversation_id);

  select coalesce(jsonb_agg(public.sales_chat_message_json(m) order by m.created_at),'[]'::jsonb)
  into v_result
  from public.sales_chat_messages m
  where m.conversation_id=p_conversation_id and not m.is_internal_note;
  return v_result;
end;
$$;

grant execute on function public.public_sales_chat_get_messages(uuid,uuid) to anon, authenticated;

create or replace function public.sales_chat_get_messages(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare v_result jsonb;
begin
  if not public.customer_communication_can_access(p_conversation_id,auth.uid()) then raise exception 'Conversation access denied.'; end if;

  update public.sales_chat_messages
  set staff_read_at=coalesce(staff_read_at,now())
  where conversation_id=p_conversation_id
    and sender_type='customer'
    and not is_internal_note
    and staff_read_at is null;

  select coalesce(jsonb_agg(public.sales_chat_message_json(m) order by m.created_at),'[]'::jsonb) into v_result
  from public.sales_chat_messages m where m.conversation_id=p_conversation_id;
  return v_result;
end;
$$;

grant execute on function public.sales_chat_get_messages(uuid) to authenticated;

create or replace function public.sales_client_inbox_timeline(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_result jsonb;
  v_role text;
  v_can_view_email boolean:=false;
begin
  if not public.customer_communication_can_access(p_conversation_id,auth.uid()) then
    raise exception 'Conversation access denied.';
  end if;

  update public.sales_chat_messages
  set staff_read_at=coalesce(staff_read_at,now())
  where conversation_id=p_conversation_id
    and sender_type='customer'
    and not is_internal_note
    and staff_read_at is null;

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
      'isInternalNote',m.is_internal_note,'staffReadAt',m.staff_read_at,'customerReadAt',m.customer_read_at,'createdAt',m.created_at) item
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
$$;

grant execute on function public.sales_client_inbox_timeline(uuid) to authenticated;

create or replace function public.client_get_relationship_history()
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_identity public.customer_identities%rowtype;
  v_quotations jsonb;
  v_conversations jsonb;
  v_payments jsonb;
  v_projects jsonb;
  v_onboardings jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not exists(select 1 from public.user_profiles p where p.id=v_uid and p.role='customer' and p.status='active') then
    raise exception 'Active customer portal access required.';
  end if;

  select * into v_identity from public.customer_identities where linked_user_id=v_uid;
  if not found then raise exception 'No customer relationship is linked to this portal account.'; end if;

  update public.sales_chat_messages m
  set customer_read_at=coalesce(m.customer_read_at,now())
  from public.sales_chat_conversations c
  where m.conversation_id=c.id
    and c.customer_identity_id=v_identity.id
    and m.sender_type='sales_rep'
    and not m.is_internal_note
    and m.customer_read_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'quotationNumber',q.quotation_number,'status',q.status,'customerName',q.customer_name,
    'total',q.total,'currency',q.currency,'validUntil',q.valid_until,'revisionNumber',q.revision_number,
    'sentAt',q.sent_at,'acceptedAt',q.accepted_at,'rejectedAt',q.rejected_at,
    'isSuperseded',q.superseded_by_id is not null,'createdAt',q.created_at
  ) order by q.created_at desc),'[]'::jsonb)
  into v_quotations
  from public.quotations q
  where q.customer_identity_id=v_identity.id and q.status in ('Sent','Accepted','Rejected','Expired','Cancelled');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,
    'conversationKind',c.conversation_kind,
    'quotationId',c.quotation_id,
    'quotationNumber',q.quotation_number,
    'customerName',c.customer_name,
    'status',c.status,
    'sellerName',coalesce(nullif(btrim(up.full_name),''),'ProFox representative'),
    'lastMessage',c.last_message,
    'lastMessageTime',c.last_message_time,
    'createdAt',c.created_at,
    'updatedAt',c.updated_at,
    'messages',coalesce((
      select jsonb_agg(x.item order by x.at,x.tie)
      from (
        select m.created_at at,m.id::text tie,jsonb_build_object(
          'id',m.id,'channel','chat',
          'direction',case when m.sender_type='customer' then 'inbound' else 'outbound' end,
          'senderType',m.sender_type,'senderName',m.sender_name,'messageText',m.message_text,
          'subject','','isInternalNote',false,'staffReadAt',m.staff_read_at,'customerReadAt',m.customer_read_at,'createdAt',m.created_at
        ) item
        from public.sales_chat_messages m
        where m.conversation_id=c.id and not m.is_internal_note

        union all

        select e.sent_or_received_at,e.id::text,jsonb_build_object(
          'id',e.id,'channel','email','provider',e.provider,'direction',e.direction,
          'senderType',case when e.direction='inbound' then 'customer' else 'staff' end,
          'senderName',case when e.direction='inbound' then e.from_email else coalesce(nullif(btrim(up.full_name),''),'ProFox') end,
          'fromEmail',e.from_email,'toEmails',e.to_emails,'ccEmails',e.cc_emails,
          'subject',e.subject,'messageText',e.body_text,'attachments',e.attachments,
          'deliveryStatus',e.delivery_status,'providerThreadId',e.provider_thread_id,
          'isInternalNote',false,'createdAt',e.sent_or_received_at
        ) item
        from public.client_email_messages e
        where e.conversation_id=c.id

        union all

        select w.sent_or_received_at,w.id::text,jsonb_build_object(
          'id',w.id,'channel','whatsapp','provider',w.provider,'direction',w.direction,
          'senderType',case when w.direction='inbound' then 'customer' else 'staff' end,
          'senderName',case when w.direction='inbound' then w.from_phone else coalesce(nullif(btrim(up.full_name),''),'ProFox') end,
          'fromPhone',w.from_phone,'toPhone',w.to_phone,'messageType',w.message_type,
          'messageText',w.message_text,'deliveryStatus',w.delivery_status,
          'isInternalNote',false,'createdAt',w.sent_or_received_at
        ) item
        from public.client_whatsapp_messages w
        where w.conversation_id=c.id
      ) x
    ),'[]'::jsonb)
  ) order by c.updated_at desc),'[]'::jsonb)
  into v_conversations
  from public.sales_chat_conversations c
  left join public.quotations q on q.id=c.quotation_id
  left join public.user_profiles up on up.id=c.current_sales_id
  where c.customer_identity_id=v_identity.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'paymentReference',p.payment_reference,'quotationId',p.quotation_id,
    'paymentType',p.payment_type,'milestoneLabel',p.milestone_label,'amountDue',p.amount_due,
    'amountPaid',p.amount_paid,'currency',p.currency,'status',p.status,'dueDate',p.due_date,
    'paidAt',p.paid_at,'verifiedAt',p.verified_at,'createdAt',p.created_at
  ) order by p.created_at desc),'[]'::jsonb)
  into v_payments
  from public.payments p where p.customer_identity_id=v_identity.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',pr.id,'projectNumber',pr.project_number,'projectName',pr.project_name,'status',pr.status,
    'stage',pr.stage,'projectValue',pr.project_value,'currency',pr.currency,'startDate',pr.start_date,
    'targetDate',pr.target_date,'createdAt',pr.created_at,'onboardingStatus',coalesce(o.status,'Not Created'),
    'onboardingCompletedAt',o.completed_at
  ) order by pr.created_at desc),'[]'::jsonb)
  into v_projects
  from public.projects pr
  join public.clients cl on cl.id=pr.client_id
  left join public.client_onboardings o on o.project_id=pr.id
  where cl.customer_identity_id=v_identity.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'projectId',o.project_id,'projectNumber',pr.project_number,'projectName',pr.project_name,
    'status',o.status,'formVersion',o.form_version,'responses',o.responses,'fields',o.field_schema,
    'submittedAt',o.submitted_at,'completedAt',o.completed_at,'createdAt',o.created_at
  ) order by o.created_at desc),'[]'::jsonb)
  into v_onboardings
  from public.client_onboardings o
  join public.projects pr on pr.id=o.project_id
  where o.customer_identity_id=v_identity.id;

  return jsonb_build_object(
    'identity',jsonb_build_object(
      'id',v_identity.id,'email',v_identity.email,'displayName',v_identity.display_name,
      'relationshipStatus',v_identity.relationship_status,'firstSeenAt',v_identity.first_seen_at
    ),
    'quotations',v_quotations,
    'conversations',v_conversations,
    'payments',v_payments,
    'projects',v_projects,
    'onboardings',v_onboardings
  );
end;
$$;

grant execute on function public.client_get_relationship_history() to authenticated;

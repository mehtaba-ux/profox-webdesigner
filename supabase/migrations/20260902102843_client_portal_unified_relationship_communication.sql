create or replace function public.client_get_relationship_history()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
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
          'subject','','isInternalNote',false,'createdAt',m.created_at
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

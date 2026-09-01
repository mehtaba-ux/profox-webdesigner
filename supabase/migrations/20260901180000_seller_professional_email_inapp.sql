-- Seller professional email in-app completion.
-- Keeps Supabase Auth account identity separate from the customer-facing mailbox,
-- safely resolves Zoho customer mail into the existing sales conversation timeline,
-- and records provider-accepted outbound professional email in the same timeline.

alter table public.sales_chat_conversations
  drop constraint if exists sales_chat_conversation_kind_check;

alter table public.sales_chat_conversations
  add constraint sales_chat_conversation_kind_check
  check (conversation_kind in ('website','quotation','email'));

create or replace function public.service_resolve_client_email_conversation(
  p_provider_thread_id text,
  p_customer_email text,
  p_employee_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_thread text:=nullif(btrim(coalesce(p_provider_thread_id,'')),'');
  v_email text:=lower(btrim(coalesce(p_customer_email,'')));
  v_conversation uuid;
  v_count integer:=0;
  v_lead public.crm_leads%rowtype;
  v_customer_name text;
begin
  if p_employee_user_id is null then
    return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','missing_employee');
  end if;

  if v_thread is not null then
    select count(distinct conversation_id)
      into v_count
    from public.client_email_messages
    where provider='zoho' and provider_thread_id=v_thread;

    if v_count=1 then
      select conversation_id
        into v_conversation
      from public.client_email_messages
      where provider='zoho' and provider_thread_id=v_thread
      order by sent_or_received_at desc,id desc
      limit 1;

      if exists(
        select 1 from public.sales_chat_conversations
        where id=v_conversation and current_sales_id=p_employee_user_id
      ) then
        return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'confidence',1.0,'method','provider_thread');
      end if;

      return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','thread_owner_mismatch');
    elsif v_count>1 then
      return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','ambiguous_provider_thread');
    end if;
  end if;

  if v_email<>'' then
    select count(*)
      into v_count
    from public.sales_chat_conversations
    where lower(customer_email)=v_email
      and current_sales_id=p_employee_user_id
      and status<>'resolved';

    if v_count=1 then
      select id
        into v_conversation
      from public.sales_chat_conversations
      where lower(customer_email)=v_email
        and current_sales_id=p_employee_user_id
        and status<>'resolved'
      order by created_at desc,id desc
      limit 1;

      return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'confidence',0.95,'method','verified_email_owner');
    elsif v_count>1 then
      return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','multiple_open_conversations');
    end if;

    select count(*)
      into v_count
    from public.crm_leads
    where lower(btrim(coalesce(email,'')))=v_email
      and salesperson_id=p_employee_user_id
      and archived_at is null;

    if v_count>1 then
      return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','multiple_assigned_crm_leads');
    elsif v_count=1 then
      select *
        into v_lead
      from public.crm_leads
      where lower(btrim(coalesce(email,'')))=v_email
        and salesperson_id=p_employee_user_id
        and archived_at is null
      order by created_at desc,id desc
      limit 1;

      select count(*)
        into v_count
      from public.sales_chat_conversations
      where crm_lead_id=v_lead.id
        and current_sales_id=p_employee_user_id;

      if v_count>1 then
        return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','multiple_crm_conversations');
      elsif v_count=1 then
        select id
          into v_conversation
        from public.sales_chat_conversations
        where crm_lead_id=v_lead.id
          and current_sales_id=p_employee_user_id
        order by created_at desc,id desc
        limit 1;

        update public.sales_chat_conversations
        set status=case when status='resolved' then 'open' else status end,
            updated_at=case when status='resolved' then now() else updated_at end
        where id=v_conversation;

        return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'confidence',0.92,'method','assigned_crm_lead_existing');
      end if;

      v_customer_name:=coalesce(
        nullif(btrim(coalesce(v_lead.contact_name,'')),''),
        nullif(btrim(coalesce(v_lead.company_name,'')),''),
        v_email
      );
      if char_length(v_customer_name)<2 then v_customer_name:='Customer'; end if;
      v_customer_name:=left(v_customer_name,120);

      insert into public.sales_chat_conversations(
        public_token_hash,
        customer_name,
        customer_email,
        customer_phone,
        intent,
        original_sales_id,
        current_sales_id,
        crm_lead_id,
        status,
        last_message,
        last_message_time,
        customer_identity_id,
        conversation_kind
      ) values (
        encode(digest(gen_random_uuid()::text||clock_timestamp()::text||random()::text,'sha256'),'hex'),
        v_customer_name,
        v_email,
        left(coalesce(v_lead.phone,''),40),
        'new_package',
        p_employee_user_id,
        p_employee_user_id,
        v_lead.id,
        'open',
        '',
        null,
        v_lead.customer_identity_id,
        'email'
      ) returning id into v_conversation;

      return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'confidence',0.90,'method','assigned_crm_lead_created');
    end if;
  end if;

  return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','no_safe_match');
end;
$function$;

create or replace function public.service_upsert_client_email_message(
  p_conversation_id uuid,
  p_provider text,
  p_provider_message_id text,
  p_provider_thread_id text,
  p_direction text,
  p_employee_user_id uuid,
  p_from_email text,
  p_to_emails text[],
  p_cc_emails text[],
  p_bcc_emails text[],
  p_subject text,
  p_body_text text,
  p_body_html text,
  p_attachments jsonb,
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
begin
  if p_provider<>'zoho' then raise exception 'Unsupported email provider.'; end if;
  if p_direction not in ('inbound','outbound') then raise exception 'Unsupported email direction.'; end if;
  if coalesce(nullif(btrim(p_provider_message_id),''),'')='' then raise exception 'Provider message identifier is required.'; end if;
  if not exists(
    select 1 from public.sales_chat_conversations
    where id=p_conversation_id and (p_employee_user_id is null or current_sales_id=p_employee_user_id)
  ) then raise exception 'Client conversation not found or employee ownership mismatch.'; end if;

  insert into public.client_email_messages(
    conversation_id,provider,provider_message_id,provider_thread_id,direction,employee_user_id,
    from_email,to_emails,cc_emails,bcc_emails,subject,body_text,body_html,attachments,
    delivery_status,sent_or_received_at,updated_at
  ) values (
    p_conversation_id,p_provider,btrim(p_provider_message_id),nullif(btrim(coalesce(p_provider_thread_id,'')),''),
    p_direction,p_employee_user_id,lower(btrim(p_from_email)),coalesce(p_to_emails,'{}'),coalesce(p_cc_emails,'{}'),
    coalesce(p_bcc_emails,'{}'),left(coalesce(p_subject,''),500),left(coalesce(p_body_text,''),50000),
    left(coalesce(p_body_html,''),100000),coalesce(p_attachments,'[]'::jsonb),
    coalesce(nullif(btrim(p_delivery_status),''),case when p_direction='inbound' then 'received' else 'sent' end),
    v_at,now()
  )
  on conflict(provider,provider_message_id) do update set
    conversation_id=excluded.conversation_id,
    provider_thread_id=excluded.provider_thread_id,
    direction=excluded.direction,
    employee_user_id=excluded.employee_user_id,
    from_email=excluded.from_email,
    to_emails=excluded.to_emails,
    cc_emails=excluded.cc_emails,
    bcc_emails=excluded.bcc_emails,
    subject=excluded.subject,
    body_text=excluded.body_text,
    body_html=excluded.body_html,
    attachments=excluded.attachments,
    delivery_status=excluded.delivery_status,
    sent_or_received_at=excluded.sent_or_received_at,
    synced_at=now(),
    updated_at=now()
  returning id into v_id;

  v_preview:=left(
    case
      when nullif(btrim(coalesce(p_subject,'')),'') is not null then 'Email: '||btrim(p_subject)
      when nullif(btrim(coalesce(p_body_text,'')),'') is not null then btrim(p_body_text)
      else 'Email message'
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

  return v_id;
end;
$function$;

create or replace function public.service_complete_professional_email_send(
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
  v_request public.professional_email_send_requests%rowtype;
  v_activity_id uuid;
  v_now timestamptz:=now();
  v_resolution jsonb;
  v_conversation_id uuid;
  v_timeline_message_id text;
begin
  select * into v_request from public.professional_email_send_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'Professional email request not found.'; end if;
  if v_request.status='provider_accepted' then
    return jsonb_build_object('success',true,'alreadyCompleted',true,'requestId',v_request.id,'providerMessageId',v_request.provider_message_id);
  end if;
  if v_request.status<>'pending' then raise exception 'Professional email request is not pending.'; end if;

  update public.professional_email_send_requests
  set status='provider_accepted',provider_message_id=nullif(btrim(coalesce(p_provider_message_id,'')),''),
      provider_response_code=nullif(btrim(coalesce(p_provider_response_code,'')),''),last_error=null,
      completed_at=v_now,updated_at=v_now
  where id=v_request.id;

  insert into public.crm_activities(
    lead_id,assigned_to,activity_type,subject,due_at,completed_at,status,channel,notes,created_by
  ) values(
    v_request.lead_id,v_request.user_id,'Cold Email',v_request.subject,v_now,v_now,'Completed','Email',
    'Sent from ProFox through Zoho Mail. Provider accepted the send request. From: '||v_request.sender_email||
    '. To: '||v_request.recipient_email||'. Message: '||v_request.message_body||
    case when coalesce(nullif(btrim(p_provider_message_id),''),'')<>'' then '. Provider message ID: '||btrim(p_provider_message_id) else '' end,
    v_request.user_id
  ) returning id into v_activity_id;

  update public.crm_leads
  set last_contact_at=v_now,
      initial_outreach_channel=coalesce(nullif(initial_outreach_channel,''),'Email'),
      first_response_at=case when accepted_at is not null and first_response_at is null then v_now else first_response_at end,
      first_response_channel=case when accepted_at is not null and first_response_at is null then 'Email' else first_response_channel end,
      first_response_evidence_type=case when accepted_at is not null and first_response_at is null then 'zoho_provider_accepted' else first_response_evidence_type end,
      first_response_evidence_id=case when accepted_at is not null and first_response_at is null then coalesce(nullif(btrim(p_provider_message_id),''),v_request.id::text) else first_response_evidence_id end,
      updated_at=v_now
  where id=v_request.lead_id;

  update public.zoho_user_mail_send_connections
  set last_attempt_at=v_now,last_verified_at=v_now,last_error=null,updated_at=v_now
  where user_id=v_request.user_id;

  -- The provider send has already succeeded at this point. Keep the audit completion
  -- durable even if the optional unified-inbox bridge encounters unexpected legacy data.
  begin
    v_resolution:=public.service_resolve_client_email_conversation(null,v_request.recipient_email,v_request.user_id);
    if coalesce((v_resolution->>'assignmentRequired')::boolean,true)=false
       and coalesce(v_resolution->>'conversationId','')<>'' then
      v_conversation_id:=(v_resolution->>'conversationId')::uuid;
      v_timeline_message_id:=coalesce(nullif(btrim(coalesce(p_provider_message_id,'')),''),'profox-request:'||v_request.id::text);
      perform public.service_upsert_client_email_message(
        v_conversation_id,'zoho',v_timeline_message_id,null,'outbound',v_request.user_id,
        v_request.sender_email,array[v_request.recipient_email]::text[],'{}'::text[],'{}'::text[],
        v_request.subject,v_request.message_body,'','[]'::jsonb,'provider_accepted',v_now
      );
    end if;
  exception when others then
    null;
  end;

  return jsonb_build_object('success',true,'requestId',v_request.id,'activityId',v_activity_id,'providerMessageId',nullif(btrim(coalesce(p_provider_message_id,'')),''));
end;
$function$;

revoke all on function public.service_resolve_client_email_conversation(text,text,uuid) from public,anon,authenticated;
revoke all on function public.service_upsert_client_email_message(uuid,text,text,text,text,uuid,text,text[],text[],text[],text,text,text,jsonb,text,timestamptz) from public,anon,authenticated;
revoke all on function public.service_complete_professional_email_send(uuid,text,text) from public,anon,authenticated;

grant execute on function public.service_resolve_client_email_conversation(text,text,uuid) to service_role;
grant execute on function public.service_upsert_client_email_message(uuid,text,text,text,text,uuid,text,text[],text[],text[],text,text,text,jsonb,text,timestamptz) to service_role;
grant execute on function public.service_complete_professional_email_send(uuid,text,text) to service_role;

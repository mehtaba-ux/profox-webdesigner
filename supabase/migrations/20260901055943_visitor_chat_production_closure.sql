-- Close the remaining production gaps in public visitor sales chat without weakening RLS/token isolation.

insert into public.notification_templates(
  template_key,name,subject_template,body_template,html_template,active,description,updated_at
) values (
  'customer_sales_chat_reply',
  'Website sales chat reply',
  '{{sellerName}} replied to your ProFox chat',
  'Hi {{contactFirstName}},\n\n{{sellerName}} replied to your ProFox website conversation.\n\nMessage: {{messagePreview}}\n\nReturn to ProFox and open Chat with ProFox to continue securely:\n{{conversationUrl}}\n\nYour conversation history stays connected to your ProFox relationship.',
  '<!doctype html><html><body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5fb"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:24px 28px;border-bottom:1px solid #eef2f7"><div style="font-size:19px;font-weight:700;color:#000080">ProFox Web Designer</div><div style="margin-top:4px;font-size:11px;font-weight:700;letter-spacing:1.2px;color:#64748b">WEBSITE CONVERSATION</div></td></tr><tr><td style="padding:28px"><h1 style="margin:0 0 16px;font-size:22px;line-height:30px">{{sellerName}} replied</h1><p style="margin:0;font-size:15px;line-height:24px;color:#334155">Hi {{contactFirstName}},<br><br>You have a new reply in your ProFox website conversation.<br><br><strong>Latest message</strong><br>{{messagePreview}}</p><p style="margin:24px 0"><a href="{{conversationUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Return to ProFox</a></p><p style="margin:0;font-size:12px;line-height:19px;color:#64748b">Open <strong>Chat with ProFox</strong> to continue. Your previous messages remain securely connected to your relationship history.</p></td></tr></table></td></tr></table></body></html>',
  true,
  'Offline fallback for normal website sales/support chat replies. Delayed and cancelled when the customer is actively viewing the conversation.',
  now()
)
on conflict (template_key) do update set
  name=excluded.name,
  subject_template=excluded.subject_template,
  body_template=excluded.body_template,
  html_template=excluded.html_template,
  active=true,
  description=excluded.description,
  updated_at=now();

create or replace function public.sales_chat_is_staff()
returns boolean
language sql
stable
security definer
set search_path='public','pg_temp'
as $$
  select exists (
    select 1
    from public.user_profiles u
    where u.id=(select auth.uid())
      and u.status='active'
      and u.role in ('admin','sales','sales_rep','sales_team')
  )
$$;

create or replace function public.sales_chat_can_manage(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public','pg_temp'
as $$
  select exists (
    select 1
    from public.sales_chat_conversations c
    join public.user_profiles u on u.id=(select auth.uid())
    where c.id=p_conversation_id
      and u.status='active'
      and (
        u.role='admin'
        or (u.role in ('sales','sales_rep','sales_team') and (select auth.uid()) in (c.original_sales_id,c.current_sales_id))
      )
  )
$$;

create or replace function public.sales_chat_list_conversations()
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_role text;
  v_result jsonb;
begin
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if v_role not in ('admin','sales','sales_rep','sales_team') then
    raise exception 'Sales chat access required.';
  end if;

  select coalesce(jsonb_agg(public.sales_chat_conversation_json(c) order by c.updated_at desc),'[]'::jsonb)
  into v_result
  from public.sales_chat_conversations c
  where v_role='admin' or v_uid in(c.original_sales_id,c.current_sales_id);

  return v_result;
end;
$$;

-- Public polling doubles as a throttled presence heartbeat. This stays token-scoped
-- and avoids a write on every 3.5s poll by updating at most once every 20 seconds.
create or replace function public.public_sales_chat_get_messages(p_conversation_id uuid, p_access_token uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $$
declare
  v_result jsonb;
begin
  if not public.sales_chat_public_token_valid(p_conversation_id,p_access_token) then
    raise exception 'Conversation not found.';
  end if;

  update public.sales_chat_conversations
  set customer_last_seen_at=now()
  where id=p_conversation_id
    and (customer_last_seen_at is null or customer_last_seen_at < now()-interval '20 seconds');

  select coalesce(jsonb_agg(public.sales_chat_message_json(m) order by m.created_at),'[]'::jsonb)
  into v_result
  from public.sales_chat_messages m
  where m.conversation_id=p_conversation_id
    and not m.is_internal_note;

  return v_result;
end;
$$;

grant execute on function public.public_sales_chat_get_messages(uuid,uuid) to anon, authenticated;

create or replace function public.sales_chat_send_message(p_conversation_id uuid, p_message text, p_internal_note boolean default false)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
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
begin
  if not public.sales_chat_can_manage(p_conversation_id) then raise exception 'Conversation access denied.'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters.'; end if;

  select coalesce(nullif(btrim(full_name),''),'Sales representative') into v_name
  from public.user_profiles where id=v_uid and status='active';

  select * into v_conv from public.sales_chat_conversations where id=p_conversation_id for update;

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
          'conversationId',v_conv.id,
          'quotationId',v_q.id,
          'quotationNumber',v_q.quotation_number,
          'sellerName',v_name,
          'messagePreview',left(v_body,350),
          'conversationUrl',v_url,
          'sellerMessageCreatedAt',v_message.created_at
        );
        perform public.service_queue_customer_communication(
          'quotation-conversation-offline:'||v_conv.id::text||':'||v_presence,
          'customer_quotation_conversation_reply',
          v_conv.customer_email,
          v_uid,
          v_conv.customer_name,
          v_q.customer_name,
          v_context,
          now()+interval '90 seconds'
        );
      end if;
    elsif v_conv.conversation_kind='website' and btrim(coalesce(v_conv.customer_email,''))<>'' then
      select nullif(config_value->>'url','') into v_url
      from public.system_configuration
      where config_key='public_app_base_url';
      v_url:=coalesce(v_url,'https://www.profoxwebdesigner.com');
      v_presence:=coalesce(floor(extract(epoch from v_conv.customer_last_seen_at))::bigint,0)::text;
      v_context:=jsonb_build_object(
        'conversationId',v_conv.id,
        'sellerName',v_name,
        'messagePreview',left(v_body,350),
        'conversationUrl',v_url,
        'sellerMessageCreatedAt',v_message.created_at
      );
      perform public.service_queue_customer_communication(
        'website-chat-offline:'||v_conv.id::text||':'||v_presence,
        'customer_sales_chat_reply',
        v_conv.customer_email,
        v_uid,
        v_conv.customer_name,
        v_conv.customer_name,
        v_context,
        now()+interval '90 seconds'
      );
    end if;
  end if;

  return public.sales_chat_message_json(v_message);
end;
$$;

create or replace function public.service_claim_notification_batch(p_limit integer default 25)
returns table(
  id uuid,
  template_key text,
  recipient_email text,
  recipient_user_id uuid,
  payload jsonb,
  subject_template text,
  body_template text,
  html_template text,
  attempts integer
)
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
begin
  update public.notification_outbox o
  set status='Cancelled',
      last_error='Customer returned before offline conversation email was required.',
      updated_at=now()
  from public.sales_chat_conversations c
  where o.template_key in ('customer_quotation_conversation_reply','customer_sales_chat_reply')
    and o.status in ('Pending','Retry')
    and o.payload->>'conversationId'=c.id::text
    and c.customer_last_seen_at is not null
    and nullif(o.payload->>'sellerMessageCreatedAt','') is not null
    and c.customer_last_seen_at >= (o.payload->>'sellerMessageCreatedAt')::timestamptz;

  return query
  with claimed as (
    select o.id
    from public.notification_outbox o
    where o.status in ('Pending','Retry') and o.scheduled_for<=now()
    order by o.scheduled_for,o.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit,25),1),100)
  ), updated as (
    update public.notification_outbox o
    set status='Processing',attempts=o.attempts+1,last_attempt_at=now(),updated_at=now()
    from claimed c
    where o.id=c.id
    returning o.*
  )
  select u.id,u.template_key,u.recipient_email,u.recipient_user_id,u.payload,
         t.subject_template,t.body_template,t.html_template,u.attempts
  from updated u
  join public.notification_templates t on t.template_key=u.template_key
  where t.active is true;
end;
$$;
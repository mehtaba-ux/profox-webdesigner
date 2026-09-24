create table if not exists public.sales_chat_customer_links (
  conversation_id uuid primary key references public.sales_chat_conversations(id) on delete cascade,
  access_token uuid not null unique default gen_random_uuid(),
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.sales_chat_customer_links enable row level security;
revoke all on public.sales_chat_customer_links from anon, authenticated;

create index if not exists sales_chat_customer_links_active_idx
  on public.sales_chat_customer_links(conversation_id) where revoked_at is null;

create or replace function public.service_sales_chat_customer_link_url(
  p_conversation_id uuid,
  p_created_by uuid default null
) returns text
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_token uuid;
  v_base text;
begin
  if not exists(select 1 from public.sales_chat_conversations where id=p_conversation_id) then
    raise exception 'Conversation not found.';
  end if;

  select access_token into v_token
  from public.sales_chat_customer_links
  where conversation_id=p_conversation_id and revoked_at is null;

  if v_token is null then
    insert into public.sales_chat_customer_links(conversation_id,access_token,created_by,created_at,updated_at)
    values(p_conversation_id,gen_random_uuid(),p_created_by,now(),now())
    on conflict(conversation_id) do update
      set access_token=gen_random_uuid(),created_by=coalesce(excluded.created_by,public.sales_chat_customer_links.created_by),
          revoked_at=null,updated_at=now()
    returning access_token into v_token;
  end if;

  select nullif(config_value->>'url','') into v_base
  from public.system_configuration where config_key='public_app_base_url';
  v_base:=rtrim(coalesce(v_base,'https://www.profoxwebdesigner.com'),'/');
  return v_base||'/chat/'||v_token::text;
end;
$$;

revoke all on function public.service_sales_chat_customer_link_url(uuid,uuid) from public, anon, authenticated;

create or replace function public.service_cancel_pending_sales_chat_offline_notifications(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_count integer;
begin
  update public.notification_outbox
  set status='Cancelled',updated_at=now(),last_error=case when last_error='' then 'Customer returned to the conversation before offline notification.' else last_error end
  where template_key='customer_sales_chat_reply'
    and status in ('Pending','Retry')
    and payload->>'conversationId'=p_conversation_id::text;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public.service_cancel_pending_sales_chat_offline_notifications(uuid) from public, anon, authenticated;

insert into public.notification_templates(template_key,name,subject_template,body_template,html_template,active,description,created_at,updated_at)
values(
  'customer_sales_chat_started',
  'Sales started website conversation',
  '{{sellerName}} from ProFox started a conversation with you',
  E'Hi {{contactFirstName}},\n\n{{sellerName}} from ProFox has started a conversation with you about your request.\n\nYour request:\n{{requirementSummary}}\n\nLatest message:\n{{messagePreview}}\n\nContinue the conversation securely:\n{{conversationUrl}}\n\nYou can return through this secure link and continue from the same conversation without starting over. If you become a ProFox client, this same customer-facing conversation history will also stay available in your Client Portal.\n\n{{sellerName}}\nProFox\n{{brandLine}}\n{{websiteUrl}}',
  '<!doctype html><html><body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5fb"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:24px 28px;border-bottom:1px solid #eef2f7"><div style="font-size:20px;font-weight:700;color:#000080">ProFox</div><div style="margin-top:4px;font-size:11px;font-weight:700;letter-spacing:1.2px;color:#64748b">CUSTOMER CONVERSATION</div></td></tr><tr><td style="padding:28px"><h1 style="margin:0 0 16px;font-size:22px;line-height:30px">{{sellerName}} has started a conversation with you</h1><p style="margin:0;font-size:15px;line-height:24px;color:#334155">Hi {{contactFirstName}},<br><br>{{sellerName}} from ProFox has started a conversation about your request.</p><div style="margin:20px 0;padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc"><div style="font-size:11px;font-weight:700;letter-spacing:.8px;color:#64748b;text-transform:uppercase">Your request</div><div style="margin-top:7px;font-size:14px;line-height:22px;color:#0f172a">{{requirementSummary}}</div></div><div style="margin:20px 0;padding:16px;border-left:3px solid #000080;background:#f8fafc;font-size:14px;line-height:22px;color:#334155">{{messagePreview}}</div><p style="margin:24px 0"><a href="{{conversationUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">Continue Conversation</a></p><p style="margin:0;font-size:12px;line-height:19px;color:#64748b">This secure link returns you to the same ProFox conversation. If your relationship becomes an active client project, the customer-facing history also remains available in your Client Portal.</p><div style="margin-top:28px;padding-top:18px;border-top:1px solid #eef2f7;font-size:12px;line-height:20px;color:#64748b"><strong style="color:#0f172a">{{sellerName}}</strong><br>ProFox<br>{{brandLine}}<br><a href="{{websiteUrl}}" style="color:#000080;text-decoration:none">{{websiteUrl}}</a></div></td></tr></table></td></tr></table></body></html>',
  true,
  'Transactional invitation when an authorized seller starts a secure website conversation from CRM.',
  now(),now()
)
on conflict(template_key) do update set
  name=excluded.name,subject_template=excluded.subject_template,body_template=excluded.body_template,
  html_template=excluded.html_template,active=true,description=excluded.description,updated_at=now();

update public.notification_templates
set name='Website sales chat reply',
    subject_template='New message from {{sellerName}} at ProFox',
    body_template=E'Hi {{contactFirstName}},\n\n{{sellerName}} sent you a new message in your ProFox conversation.\n\nLatest message:\n{{messagePreview}}\n\nContinue securely:\n{{conversationUrl}}\n\nYour conversation stays connected to your ProFox relationship and, if you are a client, to your Client Portal.\n\n{{sellerName}}\nProFox\n{{brandLine}}\n{{websiteUrl}}',
    html_template='<!doctype html><html><body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5fb"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:24px 28px;border-bottom:1px solid #eef2f7"><div style="font-size:20px;font-weight:700;color:#000080">ProFox</div><div style="margin-top:4px;font-size:11px;font-weight:700;letter-spacing:1.2px;color:#64748b">NEW MESSAGE</div></td></tr><tr><td style="padding:28px"><h1 style="margin:0 0 16px;font-size:22px;line-height:30px">New message from {{sellerName}}</h1><p style="margin:0;font-size:15px;line-height:24px;color:#334155">Hi {{contactFirstName}},<br><br>You have a new message in your ProFox conversation.</p><div style="margin:20px 0;padding:16px;border-left:3px solid #000080;background:#f8fafc;font-size:14px;line-height:22px;color:#334155">{{messagePreview}}</div><p style="margin:24px 0"><a href="{{conversationUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">View Message</a></p><p style="margin:0;font-size:12px;line-height:19px;color:#64748b">If you are already viewing the conversation, you can simply continue there. Your history stays connected to your ProFox relationship and Client Portal.</p><div style="margin-top:28px;padding-top:18px;border-top:1px solid #eef2f7;font-size:12px;line-height:20px;color:#64748b"><strong style="color:#0f172a">{{sellerName}}</strong><br>ProFox<br>{{brandLine}}<br><a href="{{websiteUrl}}" style="color:#000080;text-decoration:none">{{websiteUrl}}</a></div></td></tr></table></td></tr></table></body></html>',
    active=true,
    description='Delayed transactional notification for an unread seller website-chat reply. Cancelled when the customer returns before send time.',
    updated_at=now()
where template_key='customer_sales_chat_reply';

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
  where conversation_kind='website'
    and customer_identity_id=v_identity
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
        customer_email=lower(btrim(v_lead.email)),customer_phone=coalesce(nullif(btrim(v_lead.phone),''),customer_phone),
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

  perform public.crm_write_lead_event(v_lead.id,'chat_invitation_queued','Secure customer chat started',
    'A seller started the website conversation and queued the secure customer invitation email.',
    jsonb_build_object('conversationId',v_conv.id,'notificationId',v_notification,'customerIdentityId',v_identity),
    v_uid,v_seller_name,null,now(),'chat-invitation-queued:'||v_conv.id::text);

  return jsonb_build_object(
    'conversation',public.sales_chat_conversation_json(v_conv),
    'message',public.sales_chat_message_json(v_msg),
    'conversationUrl',v_url,
    'invitationQueued',v_notification is not null,
    'recipientEmail',v_conv.customer_email
  );
end;
$$;

revoke all on function public.sales_start_customer_chat(uuid,text) from public, anon;
grant execute on function public.sales_start_customer_chat(uuid,text) to authenticated;

create or replace function public.public_sales_chat_redeem_link(p_link_token uuid,p_access_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $$
declare
  v_link public.sales_chat_customer_links%rowtype;
  v_conv public.sales_chat_conversations%rowtype;
  v_hash text:=encode(extensions.digest(p_access_token::text,'sha256'),'hex');
begin
  select * into v_link from public.sales_chat_customer_links
  where access_token=p_link_token and revoked_at is null for update;
  if not found then raise exception 'This secure conversation link is invalid or has been revoked.'; end if;

  select * into v_conv from public.sales_chat_conversations where id=v_link.conversation_id for update;
  if not found then raise exception 'Conversation not found.'; end if;

  insert into public.sales_chat_public_access(conversation_id,customer_identity_id,token_hash,verification_method,verified_at,last_used_at)
  values(v_conv.id,v_conv.customer_identity_id,v_hash,'first_contact',now(),now())
  on conflict(token_hash) do update set last_used_at=now(),revoked_at=null;

  update public.sales_chat_customer_links set last_used_at=now(),updated_at=now() where conversation_id=v_conv.id;
  update public.sales_chat_conversations set customer_last_seen_at=now(),updated_at=now() where id=v_conv.id;
  perform public.service_cancel_pending_sales_chat_offline_notifications(v_conv.id);

  if v_conv.crm_lead_id is not null then
    perform public.crm_write_lead_event(v_conv.crm_lead_id,'chat_customer_joined','Customer opened secure chat',
      'The customer opened the secure ProFox website conversation.',
      jsonb_build_object('conversationId',v_conv.id,'customerIdentityId',v_conv.customer_identity_id),
      null,v_conv.customer_name,'customer',now(),'chat-customer-joined:'||v_conv.id::text);
  end if;

  return public.sales_chat_conversation_json(v_conv);
end;
$$;

revoke all on function public.public_sales_chat_redeem_link(uuid,uuid) from public;
grant execute on function public.public_sales_chat_redeem_link(uuid,uuid) to anon,authenticated;

create or replace function public.client_portal_touch_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_uid uuid:=auth.uid(); v_identity uuid;
begin
  if v_uid is null then return false; end if;
  select id into v_identity from public.customer_identities where linked_user_id=v_uid;
  if v_identity is null then return false; end if;
  if not exists(select 1 from public.sales_chat_conversations where id=p_conversation_id and customer_identity_id=v_identity) then return false; end if;
  update public.sales_chat_conversations set customer_last_seen_at=now() where id=p_conversation_id;
  perform public.service_cancel_pending_sales_chat_offline_notifications(p_conversation_id);
  return true;
end;
$$;
revoke all on function public.client_portal_touch_conversation(uuid) from public,anon;
grant execute on function public.client_portal_touch_conversation(uuid) to authenticated;

create or replace function public.public_sales_chat_get_messages(p_conversation_id uuid,p_access_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $$
declare v_result jsonb;
begin
  if not public.sales_chat_public_token_valid(p_conversation_id,p_access_token) then raise exception 'Conversation not found.'; end if;
  update public.sales_chat_conversations set customer_last_seen_at=now()
  where id=p_conversation_id and (customer_last_seen_at is null or customer_last_seen_at<now()-interval '20 seconds');
  perform public.service_cancel_pending_sales_chat_offline_notifications(p_conversation_id);
  select coalesce(jsonb_agg(public.sales_chat_message_json(m) order by m.created_at),'[]'::jsonb)
  into v_result from public.sales_chat_messages m where m.conversation_id=p_conversation_id and not m.is_internal_note;
  return v_result;
end;
$$;

create or replace function public.sales_chat_send_message(p_conversation_id uuid,p_message text,p_internal_note boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid(); v_name text; v_body text:=btrim(coalesce(p_message,''));
  v_message public.sales_chat_messages%rowtype; v_conv public.sales_chat_conversations%rowtype;
  v_q public.quotations%rowtype; v_url text; v_presence text; v_context jsonb;
begin
  if not public.sales_chat_can_manage(p_conversation_id) then raise exception 'Conversation access denied.'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters.'; end if;
  select coalesce(nullif(btrim(full_name),''),'Sales representative') into v_name from public.user_profiles where id=v_uid and status='active';
  select * into v_conv from public.sales_chat_conversations where id=p_conversation_id for update;
  insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,sender_id,message_text,is_internal_note)
  values(p_conversation_id,'sales_rep',v_name,v_uid,v_body,coalesce(p_internal_note,false)) returning * into v_message;

  if not coalesce(p_internal_note,false) then
    update public.sales_chat_conversations set last_message=v_body,last_message_time=v_message.created_at,updated_at=now(),status='open' where id=p_conversation_id;
    update public.crm_leads set first_response_at=coalesce(first_response_at,v_message.created_at),last_contact_at=now(),updated_at=now() where id=v_conv.crm_lead_id;

    if v_conv.conversation_kind='quotation' and v_conv.quotation_id is not null then
      select * into v_q from public.quotations where id=v_conv.quotation_id;
      if found and btrim(coalesce(v_conv.customer_email,''))<>'' then
        v_url:=public.quotation_conversation_resume_url(v_q.id);
        v_presence:=coalesce(floor(extract(epoch from v_conv.customer_last_seen_at))::bigint,0)::text;
        v_context:=jsonb_build_object('conversationId',v_conv.id,'quotationId',v_q.id,'quotationNumber',v_q.quotation_number,'sellerName',v_name,'messagePreview',left(v_body,350),'conversationUrl',v_url,'sellerMessageCreatedAt',v_message.created_at);
        perform public.service_queue_customer_communication('quotation-conversation-offline:'||v_conv.id::text||':'||v_presence,'customer_quotation_conversation_reply',v_conv.customer_email,v_uid,v_conv.customer_name,v_q.customer_name,v_context,now()+interval '90 seconds');
      end if;
    elsif v_conv.conversation_kind='website' and btrim(coalesce(v_conv.customer_email,''))<>'' then
      v_url:=public.service_sales_chat_customer_link_url(v_conv.id,v_uid);
      v_presence:=coalesce(floor(extract(epoch from v_conv.customer_last_seen_at))::bigint,0)::text;
      v_context:=jsonb_build_object('crmLeadId',v_conv.crm_lead_id,'conversationId',v_conv.id,'sellerName',v_name,'messagePreview',left(v_body,600),'conversationUrl',v_url,'sellerMessageCreatedAt',v_message.created_at,'source','website_live_chat');
      perform public.service_queue_customer_communication('website-chat-offline:'||v_conv.id::text||':'||v_presence,'customer_sales_chat_reply',v_conv.customer_email,v_uid,v_conv.customer_name,v_conv.customer_name,v_context,now()+interval '5 minutes');
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
declare v_lead uuid; v_conv uuid; v_event text; v_title text;
begin
  if new.template_key not in ('customer_sales_chat_started','customer_sales_chat_reply') then return new; end if;
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  v_lead:=nullif(new.payload->>'crmLeadId','')::uuid;
  v_conv:=nullif(new.payload->>'conversationId','')::uuid;
  if v_lead is null then select crm_lead_id into v_lead from public.sales_chat_conversations where id=v_conv; end if;
  if v_lead is null then return new; end if;
  if new.status='Sent' then v_event:='chat_email_sent'; v_title:=case when new.template_key='customer_sales_chat_started' then 'Chat invitation email sent' else 'Unread chat email sent' end;
  elsif new.status='Failed' then v_event:='chat_email_failed'; v_title:='Customer chat email failed';
  elsif new.status='Cancelled' then return new;
  else return new; end if;
  perform public.crm_write_lead_event(v_lead,v_event,v_title,left(coalesce(new.last_error,''),500),jsonb_build_object('conversationId',v_conv,'notificationId',new.id,'templateKey',new.template_key,'status',new.status),null,'ProFox automation','system',coalesce(new.sent_at,new.updated_at,now()),'chat-notification:'||new.id::text||':'||lower(new.status));
  return new;
end;
$$;

drop trigger if exists trg_crm_audit_chat_notification_outbox on public.notification_outbox;
create trigger trg_crm_audit_chat_notification_outbox after update of status on public.notification_outbox
for each row execute function public.crm_audit_chat_notification_outbox();

create or replace function public.crm_audit_chat_email_delivery_event()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_out public.notification_outbox%rowtype; v_lead uuid; v_conv uuid; v_type text; v_title text;
begin
  select * into v_out from public.notification_outbox where id=new.notification_id;
  if not found or v_out.template_key not in ('customer_sales_chat_started','customer_sales_chat_reply') then return new; end if;
  v_lead:=nullif(v_out.payload->>'crmLeadId','')::uuid;
  v_conv:=nullif(v_out.payload->>'conversationId','')::uuid;
  if v_lead is null then select crm_lead_id into v_lead from public.sales_chat_conversations where id=v_conv; end if;
  if v_lead is null then return new; end if;
  v_type:=lower(coalesce(new.event_type,''));
  v_title:=case
    when v_type like '%deliver%' then 'Customer chat email delivered'
    when v_type like '%open%' then 'Customer opened chat email'
    when v_type like '%click%' then 'Customer clicked chat email'
    when v_type like '%bounce%' or v_type in ('blocked','invalid','spam') then 'Customer chat email delivery problem'
    else 'Customer chat email update' end;
  perform public.crm_write_lead_event(v_lead,'chat_email_'||regexp_replace(v_type,'[^a-z0-9]+','_','g'),v_title,left(coalesce(new.reason,''),500),jsonb_build_object('conversationId',v_conv,'notificationId',new.notification_id,'deliveryEventId',new.id,'provider',new.provider,'eventType',new.event_type),null,'ProFox automation','system',coalesce(new.occurred_at,new.created_at,now()),'chat-delivery:'||new.id::text);
  return new;
end;
$$;

drop trigger if exists trg_crm_audit_chat_email_delivery_event on public.email_delivery_events;
create trigger trg_crm_audit_chat_email_delivery_event after insert on public.email_delivery_events
for each row execute function public.crm_audit_chat_email_delivery_event();

revoke all on function public.crm_audit_chat_notification_outbox() from public,anon,authenticated;
revoke all on function public.crm_audit_chat_email_delivery_event() from public,anon,authenticated;

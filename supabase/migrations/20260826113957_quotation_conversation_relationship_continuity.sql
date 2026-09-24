alter table public.sales_chat_conversations add column if not exists conversation_kind text not null default 'website';
alter table public.sales_chat_conversations add column if not exists quotation_id uuid references public.quotations(id) on delete set null;
alter table public.sales_chat_conversations add column if not exists quotation_root_id uuid references public.quotations(id) on delete set null;
alter table public.sales_chat_conversations add column if not exists customer_last_seen_at timestamptz;
alter table public.sales_chat_conversations add column if not exists last_offline_notification_at timestamptz;
do $do$ begin if not exists(select 1 from pg_constraint where conname='sales_chat_conversation_kind_check' and conrelid='public.sales_chat_conversations'::regclass) then alter table public.sales_chat_conversations add constraint sales_chat_conversation_kind_check check (conversation_kind in ('website','quotation')); end if; end;$do$;
create unique index if not exists sales_chat_quotation_root_unique on public.sales_chat_conversations(quotation_root_id) where quotation_root_id is not null;
create index if not exists sales_chat_quotation_id_idx on public.sales_chat_conversations(quotation_id);
create index if not exists sales_chat_customer_last_seen_idx on public.sales_chat_conversations(customer_last_seen_at) where conversation_kind='quotation';

create or replace function public.quotation_conversation_resolve(p_quotation_id uuid) returns uuid
language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $function$
declare v_q public.quotations%rowtype; v_root uuid; v_conv public.sales_chat_conversations%rowtype; v_lead uuid; v_identity uuid;
begin
 select * into v_q from public.quotations where id=p_quotation_id;
 if not found then raise exception 'Quotation not found.'; end if;
 if v_q.salesperson_id is null then raise exception 'Quotation salesperson is required for customer conversation.'; end if;
 if btrim(coalesce(v_q.email,''))='' then raise exception 'Quotation customer email is required for customer conversation.'; end if;
 v_root:=coalesce(v_q.revision_root_id,v_q.id);
 v_identity:=coalesce(v_q.customer_identity_id,public.customer_identity_resolve(v_q.email,coalesce(nullif(v_q.contact_name,''),v_q.customer_name),v_q.phone));
 if v_q.opportunity_id is not null then select lead_id into v_lead from public.crm_opportunities where id=v_q.opportunity_id; end if;
 select * into v_conv from public.sales_chat_conversations where quotation_root_id=v_root for update;
 if found then
   update public.sales_chat_conversations set quotation_id=v_q.id,customer_identity_id=coalesce(v_identity,customer_identity_id),customer_name=coalesce(nullif(v_q.contact_name,''),nullif(v_q.customer_name,''),customer_name),customer_email=lower(btrim(v_q.email)),customer_phone=coalesce(nullif(btrim(coalesce(v_q.phone,'')),''),customer_phone),current_sales_id=v_q.salesperson_id,crm_lead_id=coalesce(crm_lead_id,v_lead),updated_at=now() where id=v_conv.id returning * into v_conv;
   return v_conv.id;
 end if;
 insert into public.sales_chat_conversations(public_token_hash,customer_name,customer_email,customer_phone,intent,original_sales_id,current_sales_id,crm_lead_id,status,last_message,last_message_time,customer_identity_id,conversation_kind,quotation_id,quotation_root_id)
 values(encode(extensions.gen_random_bytes(32),'hex'),coalesce(nullif(v_q.contact_name,''),nullif(v_q.customer_name,''),'Customer'),lower(btrim(v_q.email)),coalesce(v_q.phone,''),'existing_issue',v_q.salesperson_id,v_q.salesperson_id,v_lead,'open','Quotation conversation started',now(),v_identity,'quotation',v_q.id,v_root)
 returning * into v_conv;
 insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,message_text) values(v_conv.id,'system','ProFox','Quotation conversation started. Messages here stay connected to your ProFox relationship history.');
 return v_conv.id;
end;$function$;
revoke all on function public.quotation_conversation_resolve(uuid) from public,anon,authenticated;
grant execute on function public.quotation_conversation_resolve(uuid) to service_role,postgres;

create or replace function public.sales_chat_conversation_json(p_conversation public.sales_chat_conversations) returns jsonb
language sql stable set search_path to 'public','pg_temp' as $function$
 select jsonb_build_object(
  'id',p_conversation.id,'crmLeadId',p_conversation.crm_lead_id,
  'customerName',p_conversation.customer_name,'customerEmail',p_conversation.customer_email,'customerPhone',p_conversation.customer_phone,
  'intent',p_conversation.intent,'originalSalesId',p_conversation.original_sales_id,'currentSalesId',p_conversation.current_sales_id,
  'status',p_conversation.status,'ratingGiven',p_conversation.rating_given,'feedbackComment',p_conversation.feedback_comment,
  'lastMessage',p_conversation.last_message,'lastMessageTime',p_conversation.last_message_time,
  'conversationKind',p_conversation.conversation_kind,'quotationId',p_conversation.quotation_id,
  'quotationNumber',(select q.quotation_number from public.quotations q where q.id=p_conversation.quotation_id),
  'customerIdentityId',p_conversation.customer_identity_id,
  'customerLastSeenAt',p_conversation.customer_last_seen_at,
  'createdAt',p_conversation.created_at,'updatedAt',p_conversation.updated_at
 )
$function$;

create or replace function public.quotation_conversation_add_customer_message(p_quotation_id uuid,p_message text,p_request_change boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_q public.quotations%rowtype; v_conv uuid; v_msg public.sales_chat_messages%rowtype; v_body text:=left(btrim(coalesce(p_message,'')),4000); v_dedupe text;
begin
 if char_length(v_body) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters.'; end if;
 select * into v_q from public.quotations where id=p_quotation_id for update;
 if not found then raise exception 'Quotation not found.'; end if;
 v_conv:=public.quotation_conversation_resolve(v_q.id);
 insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,message_text) values(v_conv,'customer',coalesce(nullif(v_q.contact_name,''),nullif(v_q.customer_name,''),'Customer'),v_body) returning * into v_msg;
 update public.sales_chat_conversations set last_message=v_body,last_message_time=v_msg.created_at,updated_at=now(),status='open',customer_last_seen_at=now() where id=v_conv;
 if v_q.customer_identity_id is not null then update public.customer_identities set last_seen_at=greatest(last_seen_at,now()),updated_at=now() where id=v_q.customer_identity_id; end if;
 if coalesce(p_request_change,false) and v_q.status='Sent' then
   perform set_config('profox.quotation_atomic_rpc','1',true);
   update public.quotations set change_requested_at=v_msg.created_at,change_request_note=v_body,updated_at=now() where id=v_q.id;
   perform set_config('profox.quotation_atomic_rpc','',true);
 end if;
 if v_q.salesperson_id is not null then
   v_dedupe:='quotation-customer-message:'||v_msg.id::text;
   perform public.enqueue_in_app_notification(v_q.salesperson_id,'Quotation','New customer message - '||v_q.quotation_number,coalesce(nullif(v_q.customer_name,''),'Customer')||': '||left(v_body,220),'/admin/app/sales?tab=inbox&conversation='||v_conv::text,v_dedupe);
   update public.in_app_notifications set category='Action Required',module='Sales',priority='High',metadata=jsonb_build_object('quotationId',v_q.id,'quotationNumber',v_q.quotation_number,'conversationId',v_conv,'customerName',v_q.customer_name,'message',v_body,'requestChange',coalesce(p_request_change,false)) where dedupe_key=v_dedupe;
 end if;
 return public.sales_chat_message_json(v_msg)||jsonb_build_object('conversationId',v_conv,'quotationNumber',v_q.quotation_number,'requestChange',coalesce(p_request_change,false));
exception when others then perform set_config('profox.quotation_atomic_rpc','',true); raise;
end;$function$;
revoke all on function public.quotation_conversation_add_customer_message(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.quotation_conversation_add_customer_message(uuid,text,boolean) to service_role,postgres;

create or replace function public.public_quotation_conversation_get(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $function$
declare v_hash text; v_q public.quotations%rowtype; v_conv uuid; v_c public.sales_chat_conversations%rowtype; v_messages jsonb; v_seller text;
begin
 if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Quotation link is invalid.'; end if;
 v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
 select * into v_q from public.quotations where customer_view_token_hash=v_hash;
 if not found then raise exception 'Quotation link is invalid or no longer available.'; end if;
 v_conv:=public.quotation_conversation_resolve(v_q.id);
 select * into v_c from public.sales_chat_conversations where id=v_conv;
 select coalesce(jsonb_agg(public.sales_chat_message_json(m) order by m.created_at),'[]'::jsonb) into v_messages from public.sales_chat_messages m where m.conversation_id=v_conv and not m.is_internal_note;
 select coalesce(nullif(btrim(full_name),''),'ProFox representative') into v_seller from public.user_profiles where id=v_c.current_sales_id;
 return public.sales_chat_conversation_json(v_c)||jsonb_build_object('messages',v_messages,'sellerName',coalesce(v_seller,'ProFox representative'),'quotationNumber',v_q.quotation_number,'quotationStatus',v_q.status);
end;$function$;

create or replace function public.public_quotation_conversation_heartbeat(p_token text) returns boolean
language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $function$
declare v_hash text; v_qid uuid; v_conv uuid;
begin
 if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Quotation link is invalid.'; end if;
 v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
 select id into v_qid from public.quotations where customer_view_token_hash=v_hash;
 if v_qid is null then raise exception 'Quotation link is invalid or no longer available.'; end if;
 v_conv:=public.quotation_conversation_resolve(v_qid);
 update public.sales_chat_conversations set customer_last_seen_at=now(),updated_at=now() where id=v_conv;
 update public.notification_outbox set status='Cancelled',last_error='Customer returned before offline conversation email was required.',updated_at=now() where template_key='customer_quotation_conversation_reply' and status in ('Pending','Retry') and payload->>'conversationId'=v_conv::text;
 return true;
end;$function$;

create or replace function public.public_quotation_conversation_send_message(p_token text,p_message text,p_request_change boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $function$
declare v_hash text; v_q public.quotations%rowtype;
begin
 if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Quotation link is invalid.'; end if;
 v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
 select * into v_q from public.quotations where customer_view_token_hash=v_hash;
 if not found then raise exception 'Quotation link is invalid or no longer available.'; end if;
 return public.quotation_conversation_add_customer_message(v_q.id,p_message,p_request_change);
end;$function$;
revoke all on function public.public_quotation_conversation_get(text) from public;
revoke all on function public.public_quotation_conversation_heartbeat(text) from public;
revoke all on function public.public_quotation_conversation_send_message(text,text,boolean) from public;
grant execute on function public.public_quotation_conversation_get(text) to anon,authenticated,service_role,postgres;
grant execute on function public.public_quotation_conversation_heartbeat(text) to anon,authenticated,service_role,postgres;
grant execute on function public.public_quotation_conversation_send_message(text,text,boolean) to anon,authenticated,service_role,postgres;

create or replace function public.quotation_conversation_resume_url(p_quotation_id uuid) returns text
language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $function$
declare v_q public.quotations%rowtype; v_url text; v_token text; v_base text;
begin
 select * into v_q from public.quotations where id=p_quotation_id for update;
 if not found then return null; end if;
 select o.payload->>'quotationUrl' into v_url from public.notification_outbox o where o.template_key='customer_quotation_sent' and (o.dedupe_key='customer-quotation-sent:'||p_quotation_id::text or o.dedupe_key like 'customer-quotation-resent:'||p_quotation_id::text||':%') and nullif(btrim(coalesce(o.payload->>'quotationUrl','')),'') is not null order by o.created_at desc limit 1;
 if v_url is not null then
   v_token:=substring(v_url from '/quotation/review/([A-Za-z0-9_-]+)');
   if v_token is null or v_q.customer_view_token_hash is null or encode(extensions.digest(v_token,'sha256'),'hex') is distinct from v_q.customer_view_token_hash then v_url:=null; end if;
 end if;
 if v_url is null then
   v_token:=encode(extensions.gen_random_bytes(32),'hex');
   select nullif(btrim(config_value->>'url'),'') into v_base from public.system_configuration where config_key='public_app_base_url';
   v_base:=rtrim(coalesce(v_base,'https://www.profoxwebdesigner.com'),'/');
   v_url:=v_base||'/quotation/review/'||v_token;
   perform set_config('profox.quotation_view_tracking_rpc','1',true);
   update public.quotations set customer_view_token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),customer_view_token_issued_at=now(),updated_at=now() where id=p_quotation_id;
   perform set_config('profox.quotation_view_tracking_rpc','',true);
 end if;
 return v_url||'#conversation';
exception when others then perform set_config('profox.quotation_view_tracking_rpc','',true); raise;
end;$function$;
revoke all on function public.quotation_conversation_resume_url(uuid) from public,anon,authenticated;
grant execute on function public.quotation_conversation_resume_url(uuid) to service_role,postgres;

insert into public.notification_templates(template_key,name,subject_template,body_template,html_template,active,description,updated_at)
values('customer_quotation_conversation_reply','Quotation conversation reply','{{sellerName}} replied about {{quotationNumber}}','Hi {{contactFirstName}},

{{sellerName}} replied to your ProFox quotation conversation.

Quotation: {{quotationNumber}}
Message: {{messagePreview}}

Continue the conversation: {{conversationUrl}}

Your full conversation remains securely available in ProFox.','<!doctype html><html><body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5fb"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:24px 28px;border-bottom:1px solid #eef2f7"><div style="font-size:19px;font-weight:700;color:#000080">ProFox Web Designer</div><div style="margin-top:4px;font-size:11px;font-weight:700;letter-spacing:1.2px;color:#64748b">QUOTATION CONVERSATION</div></td></tr><tr><td style="padding:28px"><h1 style="margin:0 0 16px;font-size:22px;line-height:30px">{{sellerName}} replied</h1><p style="margin:0;font-size:15px;line-height:24px;color:#334155">Hi {{contactFirstName}},<br><br>You have a new reply about quotation <strong>{{quotationNumber}}</strong>.<br><br><strong>Latest message</strong><br>{{messagePreview}}</p><p style="margin:24px 0"><a href="{{conversationUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">View Reply and Continue Conversation</a></p><p style="margin:0;font-size:12px;line-height:19px;color:#64748b">Your complete conversation stays securely connected to your ProFox relationship history.</p></td></tr></table></td></tr></table></body></html>',true,'Offline fallback for quotation conversation replies. Queued only after a seller reply and cancelled when the customer is actively viewing the conversation.',now())
on conflict(template_key) do update set name=excluded.name,subject_template=excluded.subject_template,body_template=excluded.body_template,html_template=excluded.html_template,active=true,description=excluded.description,updated_at=now();

create or replace function public.sales_chat_send_message(p_conversation_id uuid,p_message text,p_internal_note boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_uid uuid:=auth.uid(); v_name text; v_body text:=btrim(coalesce(p_message,'')); v_message public.sales_chat_messages%rowtype; v_conv public.sales_chat_conversations%rowtype; v_q public.quotations%rowtype; v_url text; v_presence text; v_context jsonb;
begin
 if not public.sales_chat_can_manage(p_conversation_id) then raise exception 'Conversation access denied.'; end if;
 if char_length(v_body) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters.'; end if;
 select coalesce(nullif(btrim(full_name),''),'Sales representative') into v_name from public.user_profiles where id=v_uid and status='active';
 select * into v_conv from public.sales_chat_conversations where id=p_conversation_id for update;
 insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,sender_id,message_text,is_internal_note) values(p_conversation_id,'sales_rep',v_name,v_uid,v_body,coalesce(p_internal_note,false)) returning * into v_message;
 if not coalesce(p_internal_note,false) then
   update public.sales_chat_conversations set last_message=v_body,last_message_time=v_message.created_at,updated_at=now(),status='open' where id=p_conversation_id;
   if v_conv.conversation_kind='quotation' and v_conv.quotation_id is not null then
     select * into v_q from public.quotations where id=v_conv.quotation_id;
     if found and btrim(coalesce(v_conv.customer_email,''))<>'' then
       v_url:=public.quotation_conversation_resume_url(v_q.id);
       v_presence:=coalesce(floor(extract(epoch from v_conv.customer_last_seen_at))::bigint,0)::text;
       v_context:=jsonb_build_object('conversationId',v_conv.id,'quotationId',v_q.id,'quotationNumber',v_q.quotation_number,'sellerName',v_name,'messagePreview',left(v_body,350),'conversationUrl',v_url,'sellerMessageCreatedAt',v_message.created_at);
       perform public.service_queue_customer_communication('quotation-conversation-offline:'||v_conv.id::text||':'||v_presence,'customer_quotation_conversation_reply',v_conv.customer_email,v_uid,v_conv.customer_name,v_q.customer_name,v_context,now()+interval '90 seconds');
     end if;
   end if;
 end if;
 return public.sales_chat_message_json(v_message);
end;$function$;

create or replace function public.service_claim_notification_batch(p_limit integer default 25)
returns table(id uuid,template_key text,recipient_email text,recipient_user_id uuid,payload jsonb,subject_template text,body_template text,html_template text,attempts integer)
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
begin
 update public.notification_outbox o set status='Cancelled',last_error='Customer returned before offline conversation email was required.',updated_at=now()
 from public.sales_chat_conversations c
 where o.template_key='customer_quotation_conversation_reply' and o.status in ('Pending','Retry') and o.payload->>'conversationId'=c.id::text and c.customer_last_seen_at is not null and nullif(o.payload->>'sellerMessageCreatedAt','') is not null and c.customer_last_seen_at >= (o.payload->>'sellerMessageCreatedAt')::timestamptz;
 return query with claimed as (
   select o.id from public.notification_outbox o where o.status in ('Pending','Retry') and o.scheduled_for<=now() order by o.scheduled_for,o.created_at for update skip locked limit least(greatest(coalesce(p_limit,25),1),100)
 ), updated as (
   update public.notification_outbox o set status='Processing',attempts=o.attempts+1,last_attempt_at=now(),updated_at=now() from claimed c where o.id=c.id returning o.*
 )
 select u.id,u.template_key,u.recipient_email,u.recipient_user_id,u.payload,t.subject_template,t.body_template,t.html_template,u.attempts from updated u join public.notification_templates t on t.template_key=u.template_key where t.active is true;
end;$function$;

create or replace function public.respond_public_quotation(p_token text,p_response text,p_note text default '') returns jsonb
language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $function$
declare v_hash text; v_quote public.quotations%rowtype; v_response text:=lower(btrim(coalesce(p_response,''))); v_note text:=left(btrim(coalesce(p_note,'')),2000); v_payment jsonb:='{}'::jsonb;
begin
 if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Quotation link is invalid.'; end if;
 if v_response not in ('accept','reject','request_changes') then raise exception 'Choose Accept, Request Changes, or Decline.'; end if;
 v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
 select * into v_quote from public.quotations where customer_view_token_hash=v_hash for update;
 if not found then raise exception 'Quotation link is invalid or no longer available.'; end if;
 if v_quote.superseded_by_id is not null then raise exception 'This quotation has been superseded by a newer revision. Please review the latest proposal from ProFox.'; end if;
 if v_quote.status='Accepted' and v_response='accept' then v_payment:=public.sync_quotation_payment_plan(v_quote.id); return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status','Accepted','acceptedAt',v_quote.accepted_at,'payment',v_payment); end if;
 if v_quote.status='Rejected' and v_response='reject' then return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status','Rejected','rejectedAt',v_quote.rejected_at); end if;
 if v_response='request_changes' then
   if v_quote.status<>'Sent' then raise exception 'This quotation can no longer be changed from this link.'; end if;
   if v_quote.valid_until is not null and v_quote.valid_until<current_date then raise exception 'This quotation has expired. Please contact ProFox for an updated quotation.'; end if;
   if v_note='' then raise exception 'Please describe your question or requested change.'; end if;
   perform public.quotation_conversation_add_customer_message(v_quote.id,v_note,true);
   select * into v_quote from public.quotations where id=v_quote.id;
   return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status',v_quote.status,'changeRequestedAt',v_quote.change_requested_at,'message','Your request has been sent to your ProFox conversation.');
 end if;
 if v_quote.status<>'Sent' then raise exception 'This quotation can no longer be changed from this link.'; end if;
 if v_quote.valid_until is not null and v_quote.valid_until<current_date then raise exception 'This quotation has expired. Please contact ProFox for an updated quotation.'; end if;
 if v_response='accept' and v_quote.payment_schedule_snapshot is null then perform public.snapshot_quotation_payment_schedule(v_quote.id); end if;
 perform set_config('profox.quotation_atomic_rpc','1',true);
 if v_response='accept' then update public.quotations set status='Accepted',accepted_at=coalesce(accepted_at,now()),rejected_at=null,customer_notes=case when v_note='' then customer_notes else concat_ws(E'\n',nullif(customer_notes,''),'Customer response: '||v_note) end,updated_at=now() where id=v_quote.id returning * into v_quote;
 else update public.quotations set status='Rejected',rejected_at=coalesce(rejected_at,now()),customer_notes=case when v_note='' then customer_notes else concat_ws(E'\n',nullif(customer_notes,''),'Customer response: '||v_note) end,updated_at=now() where id=v_quote.id returning * into v_quote; end if;
 perform set_config('profox.quotation_atomic_rpc','',true);
 if v_response='accept' then v_payment:=public.sync_quotation_payment_plan(v_quote.id); end if;
 return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status',v_quote.status,'acceptedAt',v_quote.accepted_at,'rejectedAt',v_quote.rejected_at,'payment',v_payment);
exception when others then perform set_config('profox.quotation_atomic_rpc','',true); raise;
end;$function$;

create or replace function public.client_get_relationship_history() returns jsonb
language plpgsql stable security definer set search_path to 'public','pg_temp' as $function$
declare v_uid uuid:=auth.uid(); v_identity public.customer_identities%rowtype; v_quotations jsonb; v_conversations jsonb; v_payments jsonb; v_projects jsonb;
begin
 if v_uid is null then raise exception 'Authentication required.'; end if;
 if not exists(select 1 from public.user_profiles p where p.id=v_uid and p.role='customer' and p.status='active') then raise exception 'Active customer portal access required.'; end if;
 select * into v_identity from public.customer_identities where linked_user_id=v_uid;
 if not found then raise exception 'No customer relationship is linked to this portal account.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'quotationNumber',q.quotation_number,'status',q.status,'customerName',q.customer_name,'total',q.total,'currency',q.currency,'validUntil',q.valid_until,'revisionNumber',q.revision_number,'sentAt',q.sent_at,'acceptedAt',q.accepted_at,'rejectedAt',q.rejected_at,'isSuperseded',q.superseded_by_id is not null,'createdAt',q.created_at) order by q.created_at desc),'[]'::jsonb) into v_quotations from public.quotations q where q.customer_identity_id=v_identity.id and q.status in ('Sent','Accepted','Rejected','Expired','Cancelled');
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'conversationKind',c.conversation_kind,'quotationId',c.quotation_id,'quotationNumber',q.quotation_number,'customerName',c.customer_name,'status',c.status,'sellerName',coalesce(nullif(btrim(up.full_name),''),'ProFox representative'),'lastMessage',c.last_message,'lastMessageTime',c.last_message_time,'createdAt',c.created_at,'updatedAt',c.updated_at,'messages',coalesce((select jsonb_agg(public.sales_chat_message_json(m) order by m.created_at) from public.sales_chat_messages m where m.conversation_id=c.id and not m.is_internal_note),'[]'::jsonb)) order by c.updated_at desc),'[]'::jsonb) into v_conversations from public.sales_chat_conversations c left join public.quotations q on q.id=c.quotation_id left join public.user_profiles up on up.id=c.current_sales_id where c.customer_identity_id=v_identity.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'paymentReference',p.payment_reference,'quotationId',p.quotation_id,'paymentType',p.payment_type,'milestoneLabel',p.milestone_label,'amountDue',p.amount_due,'amountPaid',p.amount_paid,'currency',p.currency,'status',p.status,'dueDate',p.due_date,'paidAt',p.paid_at,'verifiedAt',p.verified_at,'createdAt',p.created_at) order by p.created_at desc),'[]'::jsonb) into v_payments from public.payments p where p.customer_identity_id=v_identity.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',pr.id,'projectNumber',pr.project_number,'projectName',pr.project_name,'status',pr.status,'stage',pr.stage,'projectValue',pr.project_value,'currency',pr.currency,'startDate',pr.start_date,'targetDate',pr.target_date,'createdAt',pr.created_at) order by pr.created_at desc),'[]'::jsonb) into v_projects from public.projects pr join public.clients cl on cl.id=pr.client_id where cl.customer_identity_id=v_identity.id;
 return jsonb_build_object('identity',jsonb_build_object('id',v_identity.id,'email',v_identity.email,'displayName',v_identity.display_name,'relationshipStatus',v_identity.relationship_status,'firstSeenAt',v_identity.first_seen_at),'quotations',v_quotations,'conversations',v_conversations,'payments',v_payments,'projects',v_projects);
end;$function$;
revoke all on function public.client_get_relationship_history() from public,anon;
grant execute on function public.client_get_relationship_history() to authenticated,service_role,postgres;

do $do$ declare r record; v_conv uuid; begin
 for r in select id,change_request_note,change_requested_at from public.quotations where btrim(coalesce(change_request_note,''))<>'' and change_requested_at is not null order by change_requested_at loop
   v_conv:=public.quotation_conversation_resolve(r.id);
   if not exists(select 1 from public.sales_chat_messages m where m.conversation_id=v_conv and m.sender_type='customer' and m.message_text=r.change_request_note and abs(extract(epoch from (m.created_at-r.change_requested_at)))<1) then
     insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,message_text,created_at)
     select v_conv,'customer',coalesce(nullif(q.contact_name,''),nullif(q.customer_name,''),'Customer'),r.change_request_note,r.change_requested_at from public.quotations q where q.id=r.id;
     update public.sales_chat_conversations set last_message=r.change_request_note,last_message_time=r.change_requested_at,updated_at=greatest(updated_at,r.change_requested_at),status='open' where id=v_conv;
   end if;
 end loop;
end;$do$;
do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='profox_communication_attachment_ingest_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'profox_communication_attachment_ingest_token',
      'Private token used only to bridge Supabase email automation to the Cloudflare R2 attachment worker.',
      null
    );
  end if;
end $$;

create or replace function public.communication_attachment_validate_ingest_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path='public','vault','pg_temp'
as $$
  select coalesce(length(p_token),0) >= 48
    and exists(
      select 1
      from vault.decrypted_secrets s
      where s.name='profox_communication_attachment_ingest_token'
        and s.decrypted_secret=p_token
    )
$$;

revoke all on function public.communication_attachment_validate_ingest_token(text) from public;
grant execute on function public.communication_attachment_validate_ingest_token(text) to anon, authenticated, service_role;

create or replace function public.service_get_communication_attachment_ingest_secret()
returns text
language sql
stable
security definer
set search_path='public','vault','pg_temp'
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='profox_communication_attachment_ingest_token'
  order by created_at desc
  limit 1
$$;

revoke all on function public.service_get_communication_attachment_ingest_secret() from public, anon, authenticated;
grant execute on function public.service_get_communication_attachment_ingest_secret() to service_role;

create or replace function public.client_portal_can_access_sales_conversation(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path='public','pg_temp'
as $$
  select p_user_id is not null and exists(
    select 1
    from public.user_profiles u
    join public.customer_identities ci on ci.linked_user_id=u.id
    join public.sales_chat_conversations c on c.customer_identity_id=ci.id
    where u.id=p_user_id
      and u.role='customer'
      and lower(coalesce(u.status,''))='active'
      and c.id=p_conversation_id
  )
$$;

revoke all on function public.client_portal_can_access_sales_conversation(uuid,uuid) from public;
grant execute on function public.client_portal_can_access_sales_conversation(uuid,uuid) to authenticated, service_role;

create or replace function public.communication_attachment_prepare_client_portal_upload(
  p_conversation_id uuid,
  p_original_name text,
  p_content_type text,
  p_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_name text:=public.communication_attachment_safe_name(p_original_name);
  v_type text:=lower(btrim(coalesce(p_content_type,'')));
  v_id uuid:=gen_random_uuid();
  v_key text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not public.client_portal_can_access_sales_conversation(p_conversation_id,v_uid) then
    raise exception 'Conversation is not available in this portal account.';
  end if;
  if not public.communication_attachment_type_allowed(v_type) then raise exception 'This file type is not allowed.'; end if;
  if coalesce(p_size_bytes,0)<1 or p_size_bytes>52428800 then raise exception 'File size must be between 1 byte and 50 MB.'; end if;

  v_key:='attachments/'||to_char(timezone('utc',now()),'YYYY/MM')||'/'||v_id::text||'-'||v_name;
  insert into public.communication_attachments(
    id,scope,sales_conversation_id,channel,uploader_user_id,
    original_name,content_type,size_bytes,storage_key,customer_visible,state
  ) values (
    v_id,'sales',p_conversation_id,'chat',v_uid,
    v_name,v_type,p_size_bytes,v_key,true,'pending'
  );

  return jsonb_build_object('attachmentId',v_id,'storageKey',v_key,'name',v_name,'contentType',v_type,'sizeBytes',p_size_bytes);
end;
$$;

revoke all on function public.communication_attachment_prepare_client_portal_upload(uuid,text,text,bigint) from public, anon;
grant execute on function public.communication_attachment_prepare_client_portal_upload(uuid,text,text,bigint) to authenticated;

create or replace function public.client_portal_send_conversation_message_with_attachments(
  p_conversation_id uuid,
  p_message text,
  p_attachment_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_identity public.customer_identities%rowtype;
  v_conv public.sales_chat_conversations%rowtype;
  v_msg public.sales_chat_messages%rowtype;
  v_body text:=btrim(coalesce(p_message,''));
  v_name text;
  v_dedupe text;
  v_count integer;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not exists(select 1 from public.user_profiles p where p.id=v_uid and p.role='customer' and p.status='active') then
    raise exception 'Active customer portal access required.';
  end if;
  select * into v_identity from public.customer_identities where linked_user_id=v_uid;
  if not found then raise exception 'No customer relationship is linked to this portal account.'; end if;
  select * into v_conv from public.sales_chat_conversations where id=p_conversation_id and customer_identity_id=v_identity.id for update;
  if not found then raise exception 'Conversation is not available in this portal account.'; end if;
  if coalesce(cardinality(p_attachment_ids),0)>5 then raise exception 'A message can contain at most 5 attachments.'; end if;
  if v_body='' and coalesce(cardinality(p_attachment_ids),0)=0 then raise exception 'Enter a message or attach a file before sending.'; end if;
  if char_length(v_body)>4000 then raise exception 'Message must be 4000 characters or fewer.'; end if;
  if v_body='' then v_body:='Shared an attachment.'; end if;

  select coalesce(nullif(btrim(full_name),''),nullif(v_identity.display_name,''),'Customer') into v_name
  from public.user_profiles where id=v_uid;

  insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,message_text)
  values(v_conv.id,'customer',v_name,v_body)
  returning * into v_msg;

  if coalesce(cardinality(p_attachment_ids),0)>0 then
    update public.communication_attachments a
      set sales_message_id=v_msg.id,state='linked',linked_at=now(),updated_at=now()
    where a.id=any(p_attachment_ids)
      and a.scope='sales'
      and a.sales_conversation_id=v_conv.id
      and a.channel='chat'
      and a.state='ready'
      and a.sales_message_id is null
      and a.email_message_id is null
      and a.internal_message_id is null
      and a.uploader_user_id=v_uid
      and a.customer_visible;
    get diagnostics v_count=row_count;
    if v_count<>cardinality(p_attachment_ids) then
      raise exception 'One or more attachments are invalid, already used, or no longer authorized.';
    end if;
  end if;

  update public.sales_chat_conversations
  set last_message=v_body,last_message_time=v_msg.created_at,customer_last_seen_at=now(),status='open',updated_at=now()
  where id=v_conv.id;
  update public.customer_identities
  set last_seen_at=greatest(last_seen_at,now()),updated_at=now()
  where id=v_identity.id;

  if v_conv.current_sales_id is not null then
    v_dedupe:='portal-customer-message:'||v_msg.id::text;
    perform public.enqueue_in_app_notification(
      v_conv.current_sales_id,'Customer Message',
      case when v_conv.conversation_kind='quotation' then 'New quotation conversation message' else 'New customer portal message' end,
      coalesce(nullif(v_name,''),'Customer')||': '||left(v_body,220),
      '/admin/app/sales?tab=inbox&conversation='||v_conv.id::text,
      v_dedupe
    );
    update public.in_app_notifications
      set category='Action Required',module='Sales',priority='High',
          metadata=jsonb_build_object('conversationId',v_conv.id,'quotationId',v_conv.quotation_id,'customerIdentityId',v_identity.id,'message',v_body,'source','customer_portal')
    where dedupe_key=v_dedupe;
  end if;

  return public.sales_chat_message_json(v_msg);
end;
$$;

revoke all on function public.client_portal_send_conversation_message_with_attachments(uuid,text,uuid[]) from public, anon;
grant execute on function public.client_portal_send_conversation_message_with_attachments(uuid,text,uuid[]) to authenticated;

create or replace function public.communication_attachment_get_download(
  p_attachment_id uuid,
  p_public_access_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare v public.communication_attachments%rowtype;
begin
  select * into v from public.communication_attachments where id=p_attachment_id and state in ('ready','linked');
  if v.id is null then raise exception 'Attachment not found.'; end if;
  if v.scope='sales' then
    if p_public_access_token is not null and public.sales_chat_public_token_valid(v.sales_conversation_id,p_public_access_token) then
      if not v.customer_visible then raise exception 'Attachment access denied.'; end if;
    elsif auth.uid() is not null and public.customer_communication_can_access(v.sales_conversation_id,auth.uid()) then
      null;
    elsif auth.uid() is not null and v.customer_visible and public.client_portal_can_access_sales_conversation(v.sales_conversation_id,auth.uid()) then
      null;
    else
      raise exception 'Attachment access denied.';
    end if;
  elsif v.scope='internal' then
    if auth.uid() is null or not public.internal_chat_can_access_thread(v.internal_thread_id) then raise exception 'Attachment access denied.'; end if;
  else
    raise exception 'Attachment access denied.';
  end if;
  return jsonb_build_object('attachmentId',v.id,'storageKey',v.storage_key,'name',v.original_name,'contentType',v.content_type,'sizeBytes',v.size_bytes);
end;
$$;

create or replace function public.communication_attachment_delete_authorize(
  p_attachment_id uuid,
  p_public_access_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v public.communication_attachments%rowtype;
  v_hash text;
  v_request_status text;
begin
  select * into v from public.communication_attachments where id=p_attachment_id for update;
  if v.id is null or v.state not in ('pending','ready') then raise exception 'Attachment cannot be removed.'; end if;
  if v.sales_message_id is not null or v.internal_message_id is not null or v.email_message_id is not null then raise exception 'A sent attachment cannot be removed.'; end if;
  if v.professional_email_request_id is not null then
    select status into v_request_status from public.professional_email_send_requests where id=v.professional_email_request_id;
    if coalesce(v_request_status,'') <> 'failed' then raise exception 'This email attachment is currently in use.'; end if;
  end if;

  if v.scope='sales' then
    if v.uploader_user_id is null then
      if p_public_access_token is null then raise exception 'Conversation token required.'; end if;
      v_hash:=encode(extensions.digest(p_public_access_token::text,'sha256'),'hex');
      if v_hash<>v.uploader_public_token_hash or not public.sales_chat_public_token_valid(v.sales_conversation_id,p_public_access_token) then raise exception 'Attachment access denied.'; end if;
    else
      if v_uid is null or v_uid<>v.uploader_user_id then raise exception 'Attachment access denied.'; end if;
      if not public.customer_communication_can_access(v.sales_conversation_id,v_uid)
         and not public.client_portal_can_access_sales_conversation(v.sales_conversation_id,v_uid) then
        raise exception 'Attachment access denied.';
      end if;
    end if;
  elsif v.scope='internal' then
    if v_uid is null or v_uid<>v.uploader_user_id or not public.internal_chat_can_access_thread(v.internal_thread_id) then raise exception 'Attachment access denied.'; end if;
  else
    raise exception 'Attachment access denied.';
  end if;

  return jsonb_build_object('attachmentId',v.id,'storageKey',v.storage_key,'name',v.original_name,'contentType',v.content_type,'sizeBytes',v.size_bytes);
end;
$$;

create or replace function public.client_get_relationship_history_v2()
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_history jsonb:=public.client_get_relationship_history();
  v_conversations jsonb:='[]'::jsonb;
  v_messages jsonb;
  v_conv jsonb;
  v_msg jsonb;
  v_mid uuid;
begin
  for v_conv in select value from jsonb_array_elements(coalesce(v_history->'conversations','[]'::jsonb)) loop
    v_messages:='[]'::jsonb;
    for v_msg in select value from jsonb_array_elements(coalesce(v_conv->'messages','[]'::jsonb)) loop
      if coalesce(v_msg->>'channel','')='chat' then
        begin
          v_mid:=(v_msg->>'id')::uuid;
          v_msg:=v_msg || jsonb_build_object(
            'attachments',coalesce((
              select jsonb_agg(public.communication_attachment_json(a) order by a.created_at,a.id)
              from public.communication_attachments a
              where a.sales_message_id=v_mid and a.state='linked' and a.customer_visible
            ),'[]'::jsonb)
          );
        exception when invalid_text_representation then
          v_msg:=v_msg || jsonb_build_object('attachments','[]'::jsonb);
        end;
      elsif not (v_msg ? 'attachments') then
        v_msg:=v_msg || jsonb_build_object('attachments','[]'::jsonb);
      end if;
      v_messages:=v_messages || jsonb_build_array(v_msg);
    end loop;
    v_conv:=jsonb_set(v_conv,'{messages}',v_messages,true);
    v_conversations:=v_conversations || jsonb_build_array(v_conv);
  end loop;
  return jsonb_set(v_history,'{conversations}',v_conversations,true);
end;
$$;

revoke all on function public.client_get_relationship_history_v2() from public, anon;
grant execute on function public.client_get_relationship_history_v2() to authenticated;

create or replace function public.communication_attachment_service_prepare_email_ingest(
  p_token text,
  p_conversation_id uuid,
  p_email_message_id uuid,
  p_provider_attachment_id text,
  p_original_name text,
  p_content_type text,
  p_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_name text:=public.communication_attachment_safe_name(p_original_name);
  v_type text:=lower(btrim(coalesce(p_content_type,'')));
  v_provider_id text:=btrim(coalesce(p_provider_attachment_id,''));
  v_id uuid;
  v_key text;
  v_existing public.communication_attachments%rowtype;
begin
  if not public.communication_attachment_validate_ingest_token(p_token) then raise exception 'Attachment ingest denied.'; end if;
  if v_provider_id='' then raise exception 'Provider attachment identifier is required.'; end if;
  if not public.communication_attachment_type_allowed(v_type) then raise exception 'This file type is not allowed.'; end if;
  if coalesce(p_size_bytes,0)<1 or p_size_bytes>52428800 then raise exception 'File size must be between 1 byte and 50 MB.'; end if;
  if not exists(
    select 1 from public.client_email_messages e
    where e.id=p_email_message_id and e.conversation_id=p_conversation_id and e.provider='zoho' and e.direction='inbound'
  ) then raise exception 'Inbound email attachment target is invalid.'; end if;

  select * into v_existing
  from public.communication_attachments a
  where a.email_message_id=p_email_message_id
    and a.provider_metadata->>'providerAttachmentId'=v_provider_id
    and a.state in ('pending','ready','linked')
  order by a.created_at desc
  limit 1;
  if v_existing.id is not null then
    return jsonb_build_object(
      'existing',true,'attachmentId',v_existing.id,'storageKey',v_existing.storage_key,
      'name',v_existing.original_name,'contentType',v_existing.content_type,'sizeBytes',v_existing.size_bytes,'state',v_existing.state
    );
  end if;

  v_id:=gen_random_uuid();
  v_key:='attachments/'||to_char(timezone('utc',now()),'YYYY/MM')||'/'||v_id::text||'-'||v_name;
  insert into public.communication_attachments(
    id,scope,sales_conversation_id,email_message_id,channel,
    original_name,content_type,size_bytes,storage_key,customer_visible,state,provider_metadata
  ) values (
    v_id,'sales',p_conversation_id,p_email_message_id,'email',
    v_name,v_type,p_size_bytes,v_key,true,'pending',
    jsonb_build_object('provider','zoho','providerAttachmentId',v_provider_id,'source','inbound_email')
  );
  return jsonb_build_object('existing',false,'attachmentId',v_id,'storageKey',v_key,'name',v_name,'contentType',v_type,'sizeBytes',p_size_bytes,'state','pending');
end;
$$;

revoke all on function public.communication_attachment_service_prepare_email_ingest(text,uuid,uuid,text,text,text,bigint) from public;
grant execute on function public.communication_attachment_service_prepare_email_ingest(text,uuid,uuid,text,text,text,bigint) to anon, authenticated, service_role;

create or replace function public.communication_attachment_service_finalize_email_ingest(
  p_token text,
  p_attachment_id uuid,
  p_actual_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare v public.communication_attachments%rowtype;
begin
  if not public.communication_attachment_validate_ingest_token(p_token) then raise exception 'Attachment ingest denied.'; end if;
  select * into v from public.communication_attachments where id=p_attachment_id for update;
  if v.id is null or v.scope<>'sales' or v.channel<>'email' or v.email_message_id is null or v.state<>'pending' then raise exception 'Inbound attachment is not pending.'; end if;
  if p_actual_size_bytes<>v.size_bytes then raise exception 'Uploaded file size does not match the prepared attachment.'; end if;
  update public.communication_attachments set state='linked',ready_at=now(),linked_at=now(),updated_at=now() where id=v.id returning * into v;
  return public.communication_attachment_json(v);
end;
$$;

revoke all on function public.communication_attachment_service_finalize_email_ingest(text,uuid,bigint) from public;
grant execute on function public.communication_attachment_service_finalize_email_ingest(text,uuid,bigint) to anon, authenticated, service_role;

create or replace function public.communication_attachment_service_email_export(
  p_token text,
  p_attachment_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare v public.communication_attachments%rowtype;
begin
  if not public.communication_attachment_validate_ingest_token(p_token) then raise exception 'Attachment export denied.'; end if;
  select * into v
  from public.communication_attachments
  where id=p_attachment_id
    and professional_email_request_id=p_request_id
    and scope='sales' and channel='email' and state='ready'
    and customer_visible;
  if v.id is null then raise exception 'Email attachment export is not authorized.'; end if;
  return jsonb_build_object('attachmentId',v.id,'storageKey',v.storage_key,'name',v.original_name,'contentType',v.content_type,'sizeBytes',v.size_bytes);
end;
$$;

revoke all on function public.communication_attachment_service_email_export(text,uuid,uuid) from public;
grant execute on function public.communication_attachment_service_email_export(text,uuid,uuid) to anon, authenticated, service_role;

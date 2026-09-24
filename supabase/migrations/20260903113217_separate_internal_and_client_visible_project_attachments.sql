drop function if exists public.internal_chat_thread_is_client_visible(uuid);
create function public.internal_chat_thread_is_client_visible(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.internal_chat_threads t
    join public.user_profiles p1 on p1.id=t.participant_one
    join public.user_profiles p2 on p2.id=t.participant_two
    where t.id=p_thread_id
      and (public.internal_chat_is_customer_role(p1.role) or public.internal_chat_is_customer_role(p2.role))
  );
$$;

revoke all on function public.internal_chat_thread_is_client_visible(uuid) from public, anon;
grant execute on function public.internal_chat_thread_is_client_visible(uuid) to authenticated, service_role;

alter table public.communication_attachments drop constraint if exists communication_attachments_channel_scope;
alter table public.communication_attachments drop constraint if exists communication_attachments_channel_check;

update public.communication_attachments a
set customer_visible=public.internal_chat_thread_is_client_visible(a.internal_thread_id),
    channel=case when public.internal_chat_thread_is_client_visible(a.internal_thread_id) then 'client_portal' else 'internal_chat' end,
    updated_at=now()
where a.scope='internal' and a.internal_thread_id is not null;

alter table public.communication_attachments
  add constraint communication_attachments_channel_check
  check (channel = any (array['chat'::text,'email'::text,'note'::text,'client_portal'::text,'internal_chat'::text]));

alter table public.communication_attachments
  add constraint communication_attachments_channel_scope
  check (
    (scope='sales' and channel = any (array['chat'::text,'email'::text,'note'::text]))
    or (scope='internal' and channel = any (array['client_portal'::text,'internal_chat'::text]))
  );

create or replace function public.communication_attachment_prepare_internal_upload(
  p_thread_id uuid,
  p_original_name text,
  p_content_type text,
  p_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_name text:=public.communication_attachment_safe_name(p_original_name);
  v_type text:=lower(btrim(coalesce(p_content_type,'')));
  v_id uuid:=gen_random_uuid();
  v_key text;
  v_customer_visible boolean;
  v_channel text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not public.internal_chat_can_access_thread(p_thread_id) then raise exception 'Conversation access denied.'; end if;
  if not public.communication_attachment_type_allowed(v_type) then raise exception 'This file type is not allowed.'; end if;
  if coalesce(p_size_bytes,0)<1 or p_size_bytes>52428800 then raise exception 'File size must be between 1 byte and 50 MB.'; end if;

  v_customer_visible:=public.internal_chat_thread_is_client_visible(p_thread_id);
  v_channel:=case when v_customer_visible then 'client_portal' else 'internal_chat' end;
  v_key:='attachments/'||to_char(timezone('utc',now()),'YYYY/MM')||'/'||v_id::text||'-'||v_name;

  insert into public.communication_attachments(
    id,scope,internal_thread_id,channel,uploader_user_id,original_name,content_type,size_bytes,storage_key,customer_visible,state
  ) values(
    v_id,'internal',p_thread_id,v_channel,v_uid,v_name,v_type,p_size_bytes,v_key,v_customer_visible,'pending'
  );

  return jsonb_build_object(
    'attachmentId',v_id,
    'storageKey',v_key,
    'name',v_name,
    'contentType',v_type,
    'sizeBytes',p_size_bytes,
    'customerVisible',v_customer_visible,
    'channel',v_channel
  );
end;
$$;

revoke all on function public.communication_attachment_prepare_internal_upload(uuid,text,text,bigint) from public, anon;
grant execute on function public.communication_attachment_prepare_internal_upload(uuid,text,text,bigint) to authenticated;

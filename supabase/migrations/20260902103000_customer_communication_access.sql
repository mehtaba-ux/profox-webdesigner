-- Unified customer communication access.
-- Sales keeps ownership-based access. Managers keep project-scoped access.
-- Delivery specialists gain customer-chat access only through an explicit active
-- project_delivery_client_chat_grant. Professional email remains separately
-- restricted to Sales/Management roles in the timeline and send workflow.

create or replace function public.customer_communication_can_access(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  select exists (
    select 1
    from public.sales_chat_conversations c
    join public.user_profiles u on u.id=p_user_id
    where c.id=p_conversation_id
      and lower(coalesce(u.status,''))='active'
      and (
        public.internal_chat_normalize_role(u.role)='admin'
        or (
          public.internal_chat_is_sales_role(u.role)
          and p_user_id in (c.original_sales_id,c.current_sales_id)
        )
        or (
          public.internal_chat_is_manager_role(u.role)
          and exists (
            select 1
            from public.projects pr
            join public.clients cl on cl.id=pr.client_id
            where (
              (c.customer_identity_id is not null and cl.customer_identity_id=c.customer_identity_id)
              or (
                nullif(lower(btrim(coalesce(c.customer_email,''))),'') is not null
                and lower(btrim(cl.email))=lower(btrim(c.customer_email))
              )
            )
              and public.internal_chat_can_manage_client_chat(pr.id,p_user_id)
          )
        )
        or (
          public.internal_chat_is_delivery_role(u.role)
          and exists (
            select 1
            from public.project_delivery_client_chat_grants g
            join public.clients cl on cl.id=g.client_id
            where g.delivery_user_id=p_user_id
              and g.is_active
              and (g.expires_at is null or g.expires_at>now())
              and (
                (c.customer_identity_id is not null and cl.customer_identity_id=c.customer_identity_id)
                or (
                  nullif(lower(btrim(coalesce(c.customer_email,''))),'') is not null
                  and lower(btrim(cl.email))=lower(btrim(c.customer_email))
                )
              )
              and public.internal_chat_delivery_client_grant_active(
                g.project_id,
                g.customer_user_id,
                g.delivery_user_id
              )
          )
        )
      )
  );
$function$;

create or replace function public.customer_communication_can_manage_status(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  select exists (
    select 1
    from public.sales_chat_conversations c
    join public.user_profiles u on u.id=p_user_id
    where c.id=p_conversation_id
      and lower(coalesce(u.status,''))='active'
      and (
        public.internal_chat_normalize_role(u.role)='admin'
        or (
          public.internal_chat_is_sales_role(u.role)
          and p_user_id in (c.original_sales_id,c.current_sales_id)
        )
        or (
          public.internal_chat_is_manager_role(u.role)
          and exists (
            select 1
            from public.projects pr
            join public.clients cl on cl.id=pr.client_id
            where (
              (c.customer_identity_id is not null and cl.customer_identity_id=c.customer_identity_id)
              or (
                nullif(lower(btrim(coalesce(c.customer_email,''))),'') is not null
                and lower(btrim(cl.email))=lower(btrim(c.customer_email))
              )
            )
              and public.internal_chat_can_manage_client_chat(pr.id,p_user_id)
          )
        )
      )
  );
$function$;

create or replace function public.sales_chat_can_manage(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  select public.customer_communication_can_access(p_conversation_id,auth.uid());
$function$;

create or replace function public.sales_chat_list_conversations()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_active boolean:=false;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;

  select lower(coalesce(status,''))='active'
    into v_active
  from public.user_profiles
  where id=v_uid;

  if not coalesce(v_active,false) then
    raise exception 'Active staff access required.';
  end if;

  select coalesce(
    jsonb_agg(public.sales_chat_conversation_json(c) order by c.updated_at desc),
    '[]'::jsonb
  )
  into v_result
  from public.sales_chat_conversations c
  where public.customer_communication_can_access(c.id,v_uid);

  return v_result;
end;
$function$;

create or replace function public.sales_chat_update_status(
  p_conversation_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if not public.customer_communication_can_manage_status(p_conversation_id,auth.uid()) then
    raise exception 'Conversation status management access denied.';
  end if;
  if p_status not in ('open','pending','resolved') then
    raise exception 'Unsupported conversation status.';
  end if;

  update public.sales_chat_conversations
  set status=p_status,updated_at=now()
  where id=p_conversation_id;

  return jsonb_build_object('success',true,'status',p_status);
end;
$function$;

create or replace function public.sales_client_inbox_timeline(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_result jsonb;
  v_role text;
  v_can_view_email boolean:=false;
begin
  if not public.customer_communication_can_access(p_conversation_id,auth.uid()) then
    raise exception 'Conversation access denied.';
  end if;

  select public.internal_chat_normalize_role(role)
    into v_role
  from public.user_profiles
  where id=auth.uid() and lower(coalesce(status,''))='active';

  -- Professional-email visibility follows the same role boundary as professional
  -- mailbox eligibility. Delivery specialists can participate in granted customer
  -- chat without automatically inheriting Sales email history.
  v_can_view_email:=v_role = any(array[
    'admin','sales','sales_rep','sales_team','project_manager','site_manager','manager','management'
  ]::text[]);

  select coalesce(jsonb_agg(x.item order by x.at,x.tie),'[]'::jsonb)
    into v_result
  from (
    select
      m.created_at at,
      m.id::text tie,
      jsonb_build_object(
        'id',m.id,
        'channel','chat',
        'direction',case when m.sender_type='customer' then 'inbound' else 'outbound' end,
        'senderType',m.sender_type,
        'senderName',m.sender_name,
        'messageText',m.message_text,
        'subject','',
        'isInternalNote',m.is_internal_note,
        'createdAt',m.created_at
      ) item
    from public.sales_chat_messages m
    where m.conversation_id=p_conversation_id

    union all

    select
      e.sent_or_received_at,
      e.id::text,
      jsonb_build_object(
        'id',e.id,
        'channel','email',
        'provider',e.provider,
        'direction',e.direction,
        'senderType',case when e.direction='inbound' then 'customer' else 'staff' end,
        'senderName',e.from_email,
        'fromEmail',e.from_email,
        'toEmails',e.to_emails,
        'ccEmails',e.cc_emails,
        'subject',e.subject,
        'messageText',e.body_text,
        'bodyHtml','',
        'attachments',e.attachments,
        'deliveryStatus',e.delivery_status,
        'providerThreadId',e.provider_thread_id,
        'isInternalNote',false,
        'createdAt',e.sent_or_received_at,
        'htmlSuppressed',true
      ) item
    from public.client_email_messages e
    where e.conversation_id=p_conversation_id
      and v_can_view_email
  ) x;

  return v_result;
end;
$function$;

revoke all on function public.customer_communication_can_access(uuid,uuid) from public,anon,authenticated;
revoke all on function public.customer_communication_can_manage_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.customer_communication_can_access(uuid,uuid) to service_role;
grant execute on function public.customer_communication_can_manage_status(uuid,uuid) to service_role;

-- Existing authenticated RPC entry points remain the only browser-facing surface.
revoke all on function public.sales_chat_list_conversations() from public,anon;
grant execute on function public.sales_chat_list_conversations() to authenticated,service_role;
revoke all on function public.sales_chat_update_status(uuid,text) from public,anon;
grant execute on function public.sales_chat_update_status(uuid,text) to authenticated,service_role;
revoke all on function public.sales_client_inbox_timeline(uuid) from public,anon;
grant execute on function public.sales_client_inbox_timeline(uuid) to authenticated,service_role;

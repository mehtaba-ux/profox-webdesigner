create or replace function public.internal_chat_contacts()
returns table (
  user_id uuid,
  full_name text,
  role text,
  department text,
  avatar_url text,
  communication_scope text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  return query
  select
    p.id,
    coalesce(nullif(p.full_name,''), p.email, 'Team member')::text,
    p.role::text,
    coalesce(p.department, 'General')::text,
    coalesce(p.avatar_url, '')::text,
    case
      when p.role in ('admin','project_manager','site_manager') then 'Manager'
      when p.role in ('content_writer','uiux_designer','developer','web_developer','developer_designer') then 'Delivery Collaboration'
      else 'Internal'
    end::text
  from public.user_profiles p
  where p.id <> v_uid
    and p.status = 'active'
    and p.role not in ('customer','pending')
    and public.internal_chat_pair_allowed(v_uid, p.id)
  order by
    case when p.role in ('admin','project_manager','site_manager') then 0 else 1 end,
    lower(coalesce(nullif(p.full_name,''), p.email, ''));
end;
$$;

create or replace function public.internal_chat_list_threads()
returns table (
  thread_id uuid,
  other_user_id uuid,
  other_full_name text,
  other_role text,
  other_department text,
  other_avatar_url text,
  last_message_preview text,
  last_message_sender_id uuid,
  last_message_at timestamptz,
  unread_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  return query
  select
    t.id,
    other.id,
    coalesce(nullif(other.full_name,''), other.email, 'Team member')::text,
    other.role::text,
    coalesce(other.department, 'General')::text,
    coalesce(other.avatar_url, '')::text,
    coalesce(t.last_message_preview, '')::text,
    t.last_message_sender_id,
    t.last_message_at,
    (
      select count(*)
      from public.internal_chat_messages m
      where m.thread_id = t.id
        and m.sender_id <> v_uid
        and m.created_at > case
          when t.participant_one = v_uid then t.participant_one_last_read_at
          else t.participant_two_last_read_at
        end
    )::bigint
  from public.internal_chat_threads t
  join public.user_profiles other
    on other.id = case when t.participant_one = v_uid then t.participant_two else t.participant_one end
  where v_uid in (t.participant_one, t.participant_two)
    and public.internal_chat_pair_allowed(t.participant_one, t.participant_two)
  order by coalesce(t.last_message_at, t.created_at) desc;
end;
$$;

create or replace function public.internal_chat_get_or_create_thread(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_one uuid;
  v_two uuid;
  v_thread_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;
  if p_other_user_id is null or p_other_user_id = v_uid then
    raise exception 'Choose another team member.';
  end if;
  if not public.internal_chat_pair_allowed(v_uid, p_other_user_id) then
    raise exception 'This conversation is not permitted by the internal communication policy.';
  end if;

  if v_uid::text < p_other_user_id::text then
    v_one := v_uid;
    v_two := p_other_user_id;
  else
    v_one := p_other_user_id;
    v_two := v_uid;
  end if;

  insert into public.internal_chat_threads (
    participant_one, participant_two, created_by,
    participant_one_last_read_at, participant_two_last_read_at
  ) values (v_one, v_two, v_uid, now(), now())
  on conflict (participant_one, participant_two) do nothing;

  select id into v_thread_id
  from public.internal_chat_threads
  where participant_one = v_one and participant_two = v_two;

  if v_thread_id is null then
    raise exception 'Unable to open conversation.';
  end if;

  return v_thread_id;
end;
$$;

create or replace function public.internal_chat_get_messages(
  p_thread_id uuid,
  p_before timestamptz default null,
  p_limit integer default 100
)
returns table (
  message_id uuid,
  thread_id uuid,
  sender_id uuid,
  sender_full_name text,
  sender_role text,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
begin
  if not public.internal_chat_can_access_thread(p_thread_id) then
    raise exception 'Conversation access denied.';
  end if;

  return query
  with recent as (
    select m.*
    from public.internal_chat_messages m
    where m.thread_id = p_thread_id
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit v_limit
  )
  select
    r.id,
    r.thread_id,
    r.sender_id,
    coalesce(nullif(u.full_name,''), u.email, 'Team member')::text,
    u.role::text,
    r.body::text,
    r.created_at
  from recent r
  join public.user_profiles u on u.id = r.sender_id
  order by r.created_at asc;
end;
$$;

create or replace function public.internal_chat_send_message(p_thread_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_message_id uuid;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;
  if not public.internal_chat_can_access_thread(p_thread_id) then
    raise exception 'Conversation access denied.';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception 'Message must be between 1 and 4000 characters.';
  end if;

  insert into public.internal_chat_messages(thread_id, sender_id, body, created_at)
  values (p_thread_id, v_uid, v_body, v_now)
  returning id into v_message_id;

  update public.internal_chat_threads
  set
    last_message_preview = left(v_body, 180),
    last_message_sender_id = v_uid,
    last_message_at = v_now,
    updated_at = v_now,
    participant_one_last_read_at = case when participant_one = v_uid then v_now else participant_one_last_read_at end,
    participant_two_last_read_at = case when participant_two = v_uid then v_now else participant_two_last_read_at end
  where id = p_thread_id;

  return v_message_id;
end;
$$;

create or replace function public.internal_chat_mark_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_uid is null or not public.internal_chat_can_access_thread(p_thread_id) then
    raise exception 'Conversation access denied.';
  end if;

  update public.internal_chat_threads
  set
    participant_one_last_read_at = case when participant_one = v_uid then v_now else participant_one_last_read_at end,
    participant_two_last_read_at = case when participant_two = v_uid then v_now else participant_two_last_read_at end
  where id = p_thread_id;
end;
$$;

revoke all on function public.internal_chat_roles_can_connect(text,text) from public, anon, authenticated;
revoke all on function public.internal_chat_pair_allowed(uuid,uuid) from public, anon, authenticated;
revoke all on function public.internal_chat_can_access_thread(uuid) from public, anon, authenticated;
revoke all on function public.internal_chat_contacts() from public, anon, authenticated;
revoke all on function public.internal_chat_list_threads() from public, anon, authenticated;
revoke all on function public.internal_chat_get_or_create_thread(uuid) from public, anon, authenticated;
revoke all on function public.internal_chat_get_messages(uuid,timestamptz,integer) from public, anon, authenticated;
revoke all on function public.internal_chat_send_message(uuid,text) from public, anon, authenticated;
revoke all on function public.internal_chat_mark_read(uuid) from public, anon, authenticated;

grant execute on function public.internal_chat_contacts() to authenticated;
grant execute on function public.internal_chat_list_threads() to authenticated;
grant execute on function public.internal_chat_get_or_create_thread(uuid) to authenticated;
grant execute on function public.internal_chat_get_messages(uuid,timestamptz,integer) to authenticated;
grant execute on function public.internal_chat_send_message(uuid,text) to authenticated;
grant execute on function public.internal_chat_mark_read(uuid) to authenticated;

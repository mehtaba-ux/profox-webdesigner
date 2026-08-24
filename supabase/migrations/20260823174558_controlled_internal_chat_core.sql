create table public.internal_chat_threads (
  id uuid primary key default gen_random_uuid(),
  participant_one uuid not null references public.user_profiles(id) on delete restrict,
  participant_two uuid not null references public.user_profiles(id) on delete restrict,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  participant_one_last_read_at timestamptz not null default now(),
  participant_two_last_read_at timestamptz not null default now(),
  last_message_preview text,
  last_message_sender_id uuid references public.user_profiles(id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_chat_threads_distinct_participants check (participant_one <> participant_two),
  constraint internal_chat_threads_canonical_pair check (participant_one::text < participant_two::text),
  constraint internal_chat_threads_unique_pair unique (participant_one, participant_two)
);

create table public.internal_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.internal_chat_threads(id) on delete cascade,
  sender_id uuid not null references public.user_profiles(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  constraint internal_chat_messages_body_length check (char_length(btrim(body)) between 1 and 4000)
);

create index idx_internal_chat_threads_participant_one on public.internal_chat_threads(participant_one);
create index idx_internal_chat_threads_participant_two on public.internal_chat_threads(participant_two);
create index idx_internal_chat_threads_last_message on public.internal_chat_threads(last_message_at desc nulls last);
create index idx_internal_chat_messages_thread_created on public.internal_chat_messages(thread_id, created_at desc);
create index idx_internal_chat_messages_sender on public.internal_chat_messages(sender_id);

alter table public.internal_chat_threads enable row level security;
alter table public.internal_chat_messages enable row level security;

create or replace function public.internal_chat_roles_can_connect(p_role_a text, p_role_b text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_role_a is null or p_role_b is null then false
    when p_role_a in ('customer','pending') or p_role_b in ('customer','pending') then false
    when p_role_a in ('admin','project_manager','site_manager')
      or p_role_b in ('admin','project_manager','site_manager') then true
    when p_role_a in ('content_writer','uiux_designer','developer','web_developer','developer_designer')
      and p_role_b in ('content_writer','uiux_designer','developer','web_developer','developer_designer') then true
    else false
  end;
$$;

create or replace function public.internal_chat_pair_allowed(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_profiles a
    join public.user_profiles b on b.id = p_user_b
    where a.id = p_user_a
      and p_user_a is distinct from p_user_b
      and a.status = 'active'
      and b.status = 'active'
      and public.internal_chat_roles_can_connect(a.role, b.role)
  );
$$;

create or replace function public.internal_chat_can_access_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.internal_chat_threads t
    where t.id = p_thread_id
      and auth.uid() in (t.participant_one, t.participant_two)
      and public.internal_chat_pair_allowed(t.participant_one, t.participant_two)
  );
$$;

create policy internal_chat_threads_select
on public.internal_chat_threads
for select to authenticated
using (
  auth.uid() in (participant_one, participant_two)
  and public.internal_chat_pair_allowed(participant_one, participant_two)
);

create policy internal_chat_messages_select
on public.internal_chat_messages
for select to authenticated
using (public.internal_chat_can_access_thread(thread_id));

revoke all on public.internal_chat_threads from anon;
revoke all on public.internal_chat_messages from anon;
revoke insert, update, delete on public.internal_chat_threads from authenticated;
revoke insert, update, delete on public.internal_chat_messages from authenticated;
grant select on public.internal_chat_threads to authenticated;
grant select on public.internal_chat_messages to authenticated;

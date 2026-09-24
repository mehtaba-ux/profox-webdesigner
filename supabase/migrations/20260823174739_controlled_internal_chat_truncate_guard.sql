create or replace function public.block_internal_chat_truncate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'Internal chat history cannot be truncated by application users.';
  end if;
  return null;
end;
$$;

create trigger trg_block_internal_chat_threads_truncate
before truncate on public.internal_chat_threads
for each statement execute function public.block_internal_chat_truncate();

create trigger trg_block_internal_chat_messages_truncate
before truncate on public.internal_chat_messages
for each statement execute function public.block_internal_chat_truncate();

revoke all on function public.block_internal_chat_truncate() from public, anon, authenticated;

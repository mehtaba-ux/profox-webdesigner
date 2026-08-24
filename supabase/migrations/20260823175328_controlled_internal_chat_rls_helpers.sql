create or replace function public.internal_chat_current_user_pair_allowed(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and auth.uid() in (p_user_a, p_user_b)
    and public.internal_chat_pair_allowed(p_user_a, p_user_b);
$$;

drop policy if exists internal_chat_threads_select on public.internal_chat_threads;
create policy internal_chat_threads_select
on public.internal_chat_threads
for select to authenticated
using (public.internal_chat_current_user_pair_allowed(participant_one, participant_two));

revoke all on function public.internal_chat_current_user_pair_allowed(uuid,uuid) from public, anon, authenticated;
grant execute on function public.internal_chat_current_user_pair_allowed(uuid,uuid) to authenticated;
grant execute on function public.internal_chat_can_access_thread(uuid) to authenticated;

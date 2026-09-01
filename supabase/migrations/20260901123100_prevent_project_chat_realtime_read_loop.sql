-- Avoid a Realtime feedback loop: marking an already-read thread must be a no-op.
-- A real unread reset still updates the row and may emit one useful Realtime event.

create or replace function public.internal_chat_mark_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_uid is null or not public.internal_chat_can_access_thread(p_thread_id) then
    raise exception 'Conversation access denied.';
  end if;

  update public.internal_chat_threads
  set
    participant_one_last_read_at=case when participant_one=v_uid then v_now else participant_one_last_read_at end,
    participant_two_last_read_at=case when participant_two=v_uid then v_now else participant_two_last_read_at end,
    participant_one_unread_count=case when participant_one=v_uid then 0 else participant_one_unread_count end,
    participant_two_unread_count=case when participant_two=v_uid then 0 else participant_two_unread_count end,
    updated_at=v_now
  where id=p_thread_id
    and (
      (participant_one=v_uid and participant_one_unread_count>0)
      or (participant_two=v_uid and participant_two_unread_count>0)
    );
end;
$function$;

revoke all on function public.internal_chat_mark_read(uuid) from public, anon;
grant execute on function public.internal_chat_mark_read(uuid) to authenticated, service_role;

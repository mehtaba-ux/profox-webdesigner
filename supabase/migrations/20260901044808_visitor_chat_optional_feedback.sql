-- Allow a visitor to close the active chat session without forcing a rating.
-- The permanent relationship thread and message history remain preserved.

create or replace function public.public_sales_chat_resolve(
  p_conversation_id uuid,
  p_access_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $$
begin
  if not public.sales_chat_public_token_valid(p_conversation_id,p_access_token) then
    raise exception 'Conversation not found.';
  end if;

  update public.sales_chat_conversations
  set status='resolved',updated_at=now()
  where id=p_conversation_id;

  return jsonb_build_object('success',true,'status','resolved');
end;
$$;

grant execute on function public.public_sales_chat_resolve(uuid,uuid) to anon, authenticated;

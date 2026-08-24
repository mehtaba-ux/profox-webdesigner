-- Make the RPC-only access model explicit for advisors and ensure staff RPCs
-- cannot be invoked with the anonymous database role.

create policy sales_chat_conversations_no_direct_access
on public.sales_chat_conversations for all to anon,authenticated
using (false) with check (false);

create policy sales_chat_messages_no_direct_access
on public.sales_chat_messages for all to anon,authenticated
using (false) with check (false);

create policy sales_chat_open_limits_no_direct_access
on public.sales_chat_open_rate_limits for all to anon,authenticated
using (false) with check (false);

create policy sales_chat_message_limits_no_direct_access
on public.sales_chat_message_rate_limits for all to anon,authenticated
using (false) with check (false);

revoke all on function public.sales_chat_list_conversations() from public,anon;
revoke all on function public.sales_chat_get_messages(uuid) from public,anon;
revoke all on function public.sales_chat_send_message(uuid,text,boolean) from public,anon;
revoke all on function public.sales_chat_update_status(uuid,text) from public,anon;

grant execute on function public.sales_chat_list_conversations() to authenticated;
grant execute on function public.sales_chat_get_messages(uuid) to authenticated;
grant execute on function public.sales_chat_send_message(uuid,text,boolean) to authenticated;
grant execute on function public.sales_chat_update_status(uuid,text) to authenticated;

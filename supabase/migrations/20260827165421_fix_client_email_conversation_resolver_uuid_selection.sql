create or replace function public.service_resolve_client_email_conversation(p_provider_thread_id text, p_customer_email text, p_employee_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_thread text:=nullif(btrim(coalesce(p_provider_thread_id,'')),'');
  v_email text:=lower(btrim(coalesce(p_customer_email,'')));
  v_conversation uuid;
  v_count integer:=0;
begin
  if v_thread is not null then
    select count(distinct conversation_id)
      into v_count
    from public.client_email_messages
    where provider='zoho' and provider_thread_id=v_thread;

    if v_count=1 then
      select conversation_id
        into v_conversation
      from public.client_email_messages
      where provider='zoho' and provider_thread_id=v_thread
      order by sent_or_received_at desc, id desc
      limit 1;

      return jsonb_build_object(
        'conversationId',v_conversation,
        'assignmentRequired',false,
        'confidence',1.0,
        'method','provider_thread'
      );
    elsif v_count>1 then
      return jsonb_build_object(
        'conversationId',null,
        'assignmentRequired',true,
        'confidence',0.0,
        'method','manual_review',
        'reason','ambiguous_provider_thread'
      );
    end if;
  end if;

  if v_email<>'' and p_employee_user_id is not null then
    select count(*)
      into v_count
    from public.sales_chat_conversations
    where lower(customer_email)=v_email
      and current_sales_id=p_employee_user_id
      and status<>'resolved';

    if v_count=1 then
      select id
        into v_conversation
      from public.sales_chat_conversations
      where lower(customer_email)=v_email
        and current_sales_id=p_employee_user_id
        and status<>'resolved'
      order by created_at desc, id desc
      limit 1;

      return jsonb_build_object(
        'conversationId',v_conversation,
        'assignmentRequired',false,
        'confidence',0.95,
        'method','verified_email_owner'
      );
    elsif v_count>1 then
      return jsonb_build_object(
        'conversationId',null,
        'assignmentRequired',true,
        'confidence',0.0,
        'method','manual_review',
        'reason','multiple_open_conversations'
      );
    end if;
  end if;

  return jsonb_build_object(
    'conversationId',null,
    'assignmentRequired',true,
    'confidence',0.0,
    'method','manual_review',
    'reason','no_safe_match'
  );
end;
$function$;
revoke all on function public.service_resolve_client_email_conversation(text,text,uuid) from public, anon, authenticated;
grant execute on function public.service_resolve_client_email_conversation(text,text,uuid) to service_role, postgres;

-- Customer-centric unified seller inbox.
-- Preserve individual conversation records for audit/public-token safety, but make
-- professional email resolve into one safe customer thread for the assigned seller.

create or replace function public.service_resolve_client_email_conversation(
  p_provider_thread_id text,
  p_customer_email text,
  p_employee_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_thread text:=nullif(btrim(coalesce(p_provider_thread_id,'')),'');
  v_email text:=lower(btrim(coalesce(p_customer_email,'')));
  v_conversation uuid;
  v_count integer:=0;
  v_lead public.crm_leads%rowtype;
  v_customer_name text;
begin
  if p_employee_user_id is null then
    return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','missing_employee');
  end if;

  -- Provider thread continuity remains the strongest signal, but only when the
  -- thread still belongs to the same currently assigned seller.
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
      order by sent_or_received_at desc,id desc
      limit 1;

      if exists(
        select 1 from public.sales_chat_conversations
        where id=v_conversation and current_sales_id=p_employee_user_id
      ) then
        return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'confidence',1.0,'method','provider_thread');
      end if;

      return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','thread_owner_mismatch');
    elsif v_count>1 then
      return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','ambiguous_provider_thread');
    end if;
  end if;

  if v_email<>'' then
    -- One customer may legitimately have multiple underlying channel records
    -- (website chat, quotation, professional email). They all share the same
    -- assigned seller + verified normalized customer email. Pick one canonical
    -- record deterministically rather than rejecting the email as ambiguous.
    select count(*)
      into v_count
    from public.sales_chat_conversations
    where lower(btrim(customer_email))=v_email
      and current_sales_id=p_employee_user_id
      and status<>'resolved';

    if v_count>0 then
      select id
        into v_conversation
      from public.sales_chat_conversations
      where lower(btrim(customer_email))=v_email
        and current_sales_id=p_employee_user_id
        and status<>'resolved'
      order by
        case conversation_kind when 'website' then 0 when 'quotation' then 1 when 'email' then 2 else 3 end,
        case when crm_lead_id is not null then 0 else 1 end,
        coalesce(last_message_time,updated_at,created_at) desc,
        created_at asc,
        id asc
      limit 1;

      return jsonb_build_object(
        'conversationId',v_conversation,
        'assignmentRequired',false,
        'confidence',0.97,
        'method',case when v_count=1 then 'verified_email_owner' else 'verified_customer_unified_thread' end,
        'groupedConversationCount',v_count
      );
    end if;

    select count(*)
      into v_count
    from public.crm_leads
    where lower(btrim(coalesce(email,'')))=v_email
      and salesperson_id=p_employee_user_id
      and archived_at is null;

    if v_count>0 then
      -- Multiple CRM lead rows can still represent one customer. Prefer the most
      -- recently assigned/updated lead, but never cross seller ownership.
      select *
        into v_lead
      from public.crm_leads
      where lower(btrim(coalesce(email,'')))=v_email
        and salesperson_id=p_employee_user_id
        and archived_at is null
      order by coalesce(assigned_at,updated_at,created_at) desc,id desc
      limit 1;
    end if;

    if v_lead.id is not null then
      select id
        into v_conversation
      from public.sales_chat_conversations
      where crm_lead_id=v_lead.id
        and current_sales_id=p_employee_user_id
      order by
        case conversation_kind when 'website' then 0 when 'quotation' then 1 when 'email' then 2 else 3 end,
        coalesce(last_message_time,updated_at,created_at) desc,
        created_at asc,
        id asc
      limit 1;

      if v_conversation is not null then
        update public.sales_chat_conversations
        set status=case when status='resolved' then 'open' else status end,
            updated_at=case when status='resolved' then now() else updated_at end
        where id=v_conversation;

        return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'confidence',0.94,'method','assigned_crm_lead_existing');
      end if;

      v_customer_name:=coalesce(
        nullif(btrim(coalesce(v_lead.contact_name,'')),''),
        nullif(btrim(coalesce(v_lead.company_name,'')),''),
        v_email
      );
      if char_length(v_customer_name)<2 then v_customer_name:='Customer'; end if;
      v_customer_name:=left(v_customer_name,120);

      insert into public.sales_chat_conversations(
        public_token_hash,
        customer_name,
        customer_email,
        customer_phone,
        intent,
        original_sales_id,
        current_sales_id,
        crm_lead_id,
        status,
        last_message,
        last_message_time,
        customer_identity_id,
        conversation_kind
      ) values (
        encode(extensions.digest(gen_random_uuid()::text||clock_timestamp()::text||random()::text,'sha256'),'hex'),
        v_customer_name,
        v_email,
        left(coalesce(v_lead.phone,''),40),
        'new_package',
        p_employee_user_id,
        p_employee_user_id,
        v_lead.id,
        'open',
        '',
        null,
        v_lead.customer_identity_id,
        'email'
      ) returning id into v_conversation;

      return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'confidence',0.90,'method','assigned_crm_lead_created');
    end if;
  end if;

  return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','no_safe_match');
end;
$function$;

revoke all on function public.service_resolve_client_email_conversation(text,text,uuid) from public,anon,authenticated;
grant execute on function public.service_resolve_client_email_conversation(text,text,uuid) to service_role;

comment on function public.service_resolve_client_email_conversation(text,text,uuid) is
'Resolves Zoho customer email to the assigned seller customer thread. Multiple channel records for the same normalized customer email are treated as one unified customer conversation; provider-thread and seller ownership guards remain enforced.';

-- Keep email and chat communication continuous from Lead -> Opportunity without duplicating audit history.

create or replace function public.service_resolve_lead_email_conversation(
  p_lead_id uuid,
  p_employee_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_lead public.crm_leads%rowtype;
  v_conversation uuid;
  v_customer_name text;
  v_email text;
begin
  if p_lead_id is null or p_employee_user_id is null then
    return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','missing_context');
  end if;

  select * into v_lead
  from public.crm_leads
  where id=p_lead_id and archived_at is null;

  if v_lead.id is null then
    return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','lead_not_found');
  end if;

  if v_lead.salesperson_id is distinct from p_employee_user_id then
    return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','lead_owner_mismatch');
  end if;

  v_email:=lower(btrim(coalesce(v_lead.email,'')));
  if v_email='' then
    return jsonb_build_object('conversationId',null,'assignmentRequired',true,'confidence',0.0,'method','manual_review','reason','lead_email_missing');
  end if;

  select id into v_conversation
  from public.sales_chat_conversations
  where crm_lead_id=p_lead_id
    and current_sales_id=p_employee_user_id
  order by
    case conversation_kind when 'email' then 0 when 'website' then 1 when 'quotation' then 2 else 3 end,
    case when status<>'resolved' then 0 else 1 end,
    coalesce(last_message_time,updated_at,created_at) desc,
    created_at asc,
    id asc
  limit 1;

  if v_conversation is not null then
    update public.sales_chat_conversations
    set status=case when status='resolved' then 'open' else status end,
        customer_email=v_email,
        customer_identity_id=coalesce(customer_identity_id,v_lead.customer_identity_id),
        updated_at=case when status='resolved' or lower(btrim(coalesce(customer_email,'')))<>v_email then now() else updated_at end
    where id=v_conversation;

    return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'confidence',1.0,'method','explicit_crm_lead');
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

  return jsonb_build_object('conversationId',v_conversation,'assignmentRequired',false,'confidence',1.0,'method','explicit_crm_lead_created');
end;
$function$;

revoke all on function public.service_resolve_lead_email_conversation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_resolve_lead_email_conversation(uuid,uuid) to service_role;

comment on function public.service_resolve_lead_email_conversation(uuid,uuid) is
'Resolves or creates the professional-email conversation for one exact CRM lead and its assigned seller. This prevents same-email conversation records from crossing CRM lead boundaries.';

create or replace function public.crm_align_client_email_message_conversation()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_request public.professional_email_send_requests%rowtype;
  v_resolution jsonb;
  v_conversation uuid;
begin
  select * into v_request
  from public.professional_email_send_requests r
  where r.provider=new.provider
    and r.status='provider_accepted'
    and r.provider_message_id is not null
    and (
      r.provider_message_id=new.provider_message_id
      or r.provider_message_id=nullif(btrim(coalesce(new.provider_thread_id,'')),'')
    )
  order by r.completed_at desc nulls last,r.created_at desc,r.id desc
  limit 1;

  if v_request.id is null then
    return new;
  end if;

  v_resolution:=public.service_resolve_lead_email_conversation(v_request.lead_id,v_request.user_id);
  if coalesce((v_resolution->>'assignmentRequired')::boolean,true)=false
     and coalesce(v_resolution->>'conversationId','')<>'' then
    v_conversation:=(v_resolution->>'conversationId')::uuid;
    new.conversation_id:=v_conversation;
    new.employee_user_id:=coalesce(new.employee_user_id,v_request.user_id);
    new.assignment_required:=false;
    new.assignment_confidence:=1.0;
    new.assignment_method:='explicit';
  end if;

  return new;
end;
$function$;

revoke all on function public.crm_align_client_email_message_conversation() from public,anon,authenticated;

drop trigger if exists trigger_crm_align_client_email_message_conversation on public.client_email_messages;
create trigger trigger_crm_align_client_email_message_conversation
before insert or update on public.client_email_messages
for each row execute function public.crm_align_client_email_message_conversation();

create or replace function public.crm_audit_activity_change()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_lead uuid;
  v_type text;
  v_title text;
  v_description text;
  v_key text;
  v_meta jsonb;
  v_is_email boolean;
begin
  v_lead:=coalesce(new.lead_id,(select o.lead_id from public.crm_opportunities o where o.id=new.opportunity_id));
  if v_lead is null then return new; end if;

  v_is_email:=lower(btrim(coalesce(new.channel,'')))='email';
  v_meta:=jsonb_build_object(
    'activityId',new.id,
    'activityType',new.activity_type,
    'status',new.status,
    'assignedTo',new.assigned_to,
    'dueAt',new.due_at,
    'outcome',new.outcome,
    'rescheduleCount',new.reschedule_count,
    'planEnrollmentId',new.plan_enrollment_id,
    'planStepKey',new.plan_step_key,
    'channel',new.channel,
    'subject',new.subject
  );

  if tg_op='INSERT' then
    v_key:='activity-created:'||new.id::text;
    if v_is_email then
      if coalesce(new.notes,'') like 'Prepared in ProFox CRM and opened in the user email application.%' then
        v_type:='email_prepared';
        v_title:='Email prepared';
        v_description:=new.subject||' · opened in the user email application; delivery not verified.';
        v_meta:=v_meta||jsonb_build_object('deliveryRecorded',false,'communicationKind','email');
      elsif coalesce(new.notes,'') like 'Sent from ProFox through Zoho Mail.%Provider accepted the send request.%' then
        v_type:='email_sent';
        v_title:='Email sent';
        v_description:=new.subject||' · Zoho accepted the send request.';
        v_meta:=v_meta||jsonb_build_object('deliveryRecorded',true,'deliveryStatus','provider_accepted','communicationKind','email');
      else
        v_type:='email_activity';
        v_title:=new.activity_type||' recorded';
        v_description:=new.subject||' · due '||new.due_at::text;
        v_meta:=v_meta||jsonb_build_object('communicationKind','email');
      end if;
    else
      v_type:='activity_created';
      v_title:=new.activity_type||' scheduled';
      v_description:=new.subject||' · due '||new.due_at::text;
    end if;
  elsif new.started_at is distinct from old.started_at and old.started_at is null then
    v_type:=case when v_is_email then 'email_started' else 'activity_started' end;
    v_title:=new.activity_type||' started';
    v_description:=new.subject;
    v_key:='activity-started:'||new.id::text;
  elsif new.due_at is distinct from old.due_at then
    v_type:=case
      when v_is_email and new.last_reschedule_kind='snooze' then 'email_snoozed'
      when v_is_email then 'email_rescheduled'
      when new.last_reschedule_kind='snooze' then 'activity_snoozed'
      else 'activity_rescheduled'
    end;
    v_title:=case when new.last_reschedule_kind='snooze' then new.activity_type||' snoozed' else new.activity_type||' rescheduled' end;
    v_description:=new.subject||' · '||old.due_at::text||' → '||new.due_at::text||case when new.last_reschedule_reason<>'' then ' · '||new.last_reschedule_reason else '' end;
    v_key:='activity-reschedule:'||new.id::text||':'||new.reschedule_count::text;
    v_meta:=v_meta||jsonb_build_object('oldDueAt',old.due_at,'newDueAt',new.due_at,'reason',new.last_reschedule_reason,'kind',new.last_reschedule_kind);
  elsif new.status is distinct from old.status then
    v_type:=(case when v_is_email then 'email_' else 'activity_' end)||lower(replace(new.status,' ','_'));
    v_title:=new.activity_type||' '||lower(new.status);
    v_description:=new.subject||case when new.outcome is not null then ' · '||new.outcome else '' end;
    v_key:='activity-'||lower(new.status)||':'||new.id::text;
    if new.status='Cancelled' then v_meta:=v_meta||jsonb_build_object('reason',new.cancellation_reason); end if;
  elsif new.assigned_to is distinct from old.assigned_to then
    v_type:=case when v_is_email then 'email_reassigned' else 'activity_reassigned' end;
    v_title:=new.activity_type||' reassigned';
    v_description:=new.subject;
    v_key:=null;
    v_meta:=v_meta||jsonb_build_object('previousAssignee',old.assigned_to);
  elsif new.outcome is distinct from old.outcome then
    v_type:=case when v_is_email then 'email_outcome' else 'activity_outcome' end;
    v_title:=new.activity_type||' outcome recorded';
    v_description:=coalesce(new.outcome,'');
    v_key:='activity-outcome:'||new.id::text;
  else
    return new;
  end if;

  if v_is_email then
    v_meta:=v_meta||jsonb_build_object('communicationKind','email');
  end if;

  perform public.crm_write_lead_event(
    v_lead,v_type,v_title,v_description,v_meta,
    coalesce((select auth.uid()),new.created_by),null,null,
    coalesce(new.updated_at,new.created_at),v_key
  );
  return new;
end;
$function$;

create or replace function public.crm_audit_client_email_message()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_lead uuid;
  v_customer_name text;
  v_type text;
  v_title text;
  v_description text;
  v_meta jsonb;
  v_key text;
begin
  select c.crm_lead_id,c.customer_name
    into v_lead,v_customer_name
  from public.sales_chat_conversations c
  where c.id=new.conversation_id;

  if v_lead is null then return new; end if;

  -- Professional ProFox outbound sends already create one email event through
  -- the CRM activity audit. Do not duplicate that same provider-accepted send.
  if new.direction='outbound' and exists(
    select 1
    from public.professional_email_send_requests r
    where r.provider=new.provider
      and r.status='provider_accepted'
      and r.provider_message_id=new.provider_message_id
      and r.lead_id=v_lead
  ) then
    return new;
  end if;

  v_type:=case when new.direction='inbound' then 'email_received' else 'email_sent' end;
  v_title:=case when new.direction='inbound' then 'Email received' else 'Email sent' end;
  v_description:=left(
    coalesce(nullif(btrim(coalesce(new.subject,'')),''),'(No subject)')||
    case when nullif(btrim(coalesce(new.body_text,'')),'') is not null then ' · '||btrim(new.body_text) else '' end,
    5000
  );
  v_meta:=jsonb_build_object(
    'communicationKind','email',
    'emailMessageId',new.id,
    'conversationId',new.conversation_id,
    'provider',new.provider,
    'providerMessageId',new.provider_message_id,
    'providerThreadId',new.provider_thread_id,
    'direction',new.direction,
    'fromEmail',new.from_email,
    'toEmails',new.to_emails,
    'deliveryStatus',new.delivery_status
  );
  v_key:='email-provider:'||new.provider||':'||new.provider_message_id;

  perform public.crm_write_lead_event(
    v_lead,v_type,v_title,v_description,v_meta,
    case when new.direction='outbound' then new.employee_user_id else null end,
    case when new.direction='inbound' then coalesce(nullif(btrim(v_customer_name),''),'Customer') else null end,
    case when new.direction='inbound' then 'customer' else null end,
    new.sent_or_received_at,v_key
  );

  return new;
end;
$function$;

revoke all on function public.crm_audit_client_email_message() from public,anon,authenticated;

drop trigger if exists trigger_crm_audit_client_email_message on public.client_email_messages;
create trigger trigger_crm_audit_client_email_message
after insert on public.client_email_messages
for each row execute function public.crm_audit_client_email_message();

-- Reclassify historical email activity audit rows in place. IDs, timestamps,
-- actors, and dedupe keys remain unchanged, so the permanent history is preserved.
update public.crm_lead_events e
set event_type=case
      when e.event_type='activity_created' and coalesce(a.notes,'') like 'Prepared in ProFox CRM and opened in the user email application.%' then 'email_prepared'
      when e.event_type='activity_created' and coalesce(a.notes,'') like 'Sent from ProFox through Zoho Mail.%Provider accepted the send request.%' then 'email_sent'
      when e.event_type like 'activity_%' then 'email_'||substring(e.event_type from char_length('activity_')+1)
      else e.event_type
    end,
    title=case
      when e.event_type='activity_created' and coalesce(a.notes,'') like 'Prepared in ProFox CRM and opened in the user email application.%' then 'Email prepared'
      when e.event_type='activity_created' and coalesce(a.notes,'') like 'Sent from ProFox through Zoho Mail.%Provider accepted the send request.%' then 'Email sent'
      else e.title
    end,
    description=case
      when e.event_type='activity_created' and coalesce(a.notes,'') like 'Prepared in ProFox CRM and opened in the user email application.%' then left(a.subject||' · opened in the user email application; delivery not verified.',5000)
      when e.event_type='activity_created' and coalesce(a.notes,'') like 'Sent from ProFox through Zoho Mail.%Provider accepted the send request.%' then left(a.subject||' · Zoho accepted the send request.',5000)
      else e.description
    end,
    metadata=e.metadata||jsonb_build_object(
      'communicationKind','email',
      'channel','Email',
      'activityType',a.activity_type,
      'subject',a.subject,
      'deliveryRecorded',case
        when coalesce(a.notes,'') like 'Prepared in ProFox CRM and opened in the user email application.%' then false
        when coalesce(a.notes,'') like 'Sent from ProFox through Zoho Mail.%Provider accepted the send request.%' then true
        else false
      end
    )
from public.crm_activities a
where lower(btrim(coalesce(a.channel,'')))='email'
  and e.event_type like 'activity_%'
  and nullif(e.metadata->>'activityId','')=a.id::text;

-- Re-run the new exact-lead alignment on historical provider messages that have
-- a durable professional send request. The BEFORE UPDATE trigger performs the repair.
update public.client_email_messages m
set conversation_id=m.conversation_id
where exists(
  select 1
  from public.professional_email_send_requests r
  where r.provider=m.provider
    and r.status='provider_accepted'
    and r.provider_message_id is not null
    and (r.provider_message_id=m.provider_message_id or r.provider_message_id=nullif(btrim(coalesce(m.provider_thread_id,'')),''))
);

-- Recompute conversation previews after any historical email message moved to its
-- exact CRM-lead conversation, so neither the old nor new thread keeps a stale preview.
with candidates as (
  select conversation_id,created_at as message_at,left(coalesce(message_text,''),500) as preview,id::text as stable_id
  from public.sales_chat_messages
  union all
  select conversation_id,sent_or_received_at as message_at,
         left(case
           when nullif(btrim(coalesce(subject,'')),'') is not null then 'Email: '||btrim(subject)
           when nullif(btrim(coalesce(body_text,'')),'') is not null then btrim(body_text)
           else 'Email message'
         end,500) as preview,
         id::text as stable_id
  from public.client_email_messages
), latest as (
  select distinct on (conversation_id) conversation_id,message_at,preview
  from candidates
  order by conversation_id,message_at desc nulls last,stable_id desc
)
update public.sales_chat_conversations c
set last_message=l.preview,last_message_time=l.message_at
from latest l
where c.id=l.conversation_id;

update public.sales_chat_conversations c
set last_message='',last_message_time=null
where not exists(
  select 1 from public.sales_chat_messages sm where sm.conversation_id=c.id
)
and not exists(
  select 1 from public.client_email_messages em where em.conversation_id=c.id
);

-- Backfill provider email messages that were never represented in the permanent CRM
-- timeline. Professional outbound sends are skipped because their activity event was
-- reclassified above; inbound replies and any non-CRM outbound sync are inserted once.
do $backfill$
declare
  r record;
  v_is_professional_outbound boolean;
begin
  for r in
    select m.*,c.crm_lead_id,c.customer_name
    from public.client_email_messages m
    join public.sales_chat_conversations c on c.id=m.conversation_id
    where c.crm_lead_id is not null
    order by m.sent_or_received_at,m.id
  loop
    v_is_professional_outbound:=r.direction='outbound' and exists(
      select 1 from public.professional_email_send_requests pr
      where pr.provider=r.provider
        and pr.status='provider_accepted'
        and pr.provider_message_id=r.provider_message_id
        and pr.lead_id=r.crm_lead_id
    );

    if not v_is_professional_outbound then
      perform public.crm_write_lead_event(
        r.crm_lead_id,
        case when r.direction='inbound' then 'email_received' else 'email_sent' end,
        case when r.direction='inbound' then 'Email received' else 'Email sent' end,
        left(
          coalesce(nullif(btrim(coalesce(r.subject,'')),''),'(No subject)')||
          case when nullif(btrim(coalesce(r.body_text,'')),'') is not null then ' · '||btrim(r.body_text) else '' end,
          5000
        ),
        jsonb_build_object(
          'communicationKind','email',
          'emailMessageId',r.id,
          'conversationId',r.conversation_id,
          'provider',r.provider,
          'providerMessageId',r.provider_message_id,
          'providerThreadId',r.provider_thread_id,
          'direction',r.direction,
          'fromEmail',r.from_email,
          'toEmails',r.to_emails,
          'deliveryStatus',r.delivery_status
        ),
        case when r.direction='outbound' then r.employee_user_id else null end,
        case when r.direction='inbound' then coalesce(nullif(btrim(r.customer_name),''),'Customer') else null end,
        case when r.direction='inbound' then 'customer' else null end,
        r.sent_or_received_at,
        'email-provider:'||r.provider||':'||r.provider_message_id
      );
    end if;
  end loop;
end;
$backfill$;

comment on function public.crm_audit_client_email_message() is
'Writes provider email communication into the permanent CRM lead timeline. Professional outbound sends are deduplicated against their CRM email activity; inbound replies are always recorded.';

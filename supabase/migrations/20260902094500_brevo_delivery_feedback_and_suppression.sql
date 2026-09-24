-- Track Brevo delivery feedback, protect sender reputation, and surface delivery state in CRM.

alter table public.notification_outbox
  add column if not exists delivery_status text not null default 'Unknown',
  add column if not exists delivered_at timestamptz,
  add column if not exists first_opened_at timestamptz,
  add column if not exists first_clicked_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists last_delivery_event_at timestamptz;

create index if not exists idx_notification_outbox_provider_message_id
  on public.notification_outbox(provider_message_id)
  where provider_message_id<>'';

create table if not exists public.email_delivery_events(
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notification_outbox(id) on delete set null,
  provider text not null default 'brevo',
  provider_message_id text not null,
  event_type text not null,
  recipient_email text not null default '',
  reason text not null default '',
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider_message_id,event_type,occurred_at)
);
create index if not exists idx_email_delivery_events_notification on public.email_delivery_events(notification_id,occurred_at desc);
create index if not exists idx_email_delivery_events_recipient on public.email_delivery_events(recipient_email,occurred_at desc);
alter table public.email_delivery_events enable row level security;
revoke all on public.email_delivery_events from public,anon,authenticated;

create table if not exists public.email_recipient_suppressions(
  email text primary key,
  reason text not null,
  source_event text not null,
  provider text not null default 'brevo',
  active boolean not null default true,
  first_suppressed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.email_recipient_suppressions enable row level security;
revoke all on public.email_recipient_suppressions from public,anon,authenticated;

do $do$
begin
  if not exists(select 1 from vault.secrets where name='profox_brevo_email_webhook_token') then
    perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'profox_brevo_email_webhook_token','Brevo transactional email webhook bearer token');
  end if;
end
$do$;

create or replace function public.service_get_brevo_email_webhook_secret()
returns text
language sql
stable security definer
set search_path to 'public','vault','pg_temp'
as $function$
  select coalesce((select decrypted_secret from vault.decrypted_secrets where name='profox_brevo_email_webhook_token' limit 1),'')
$function$;
revoke all on function public.service_get_brevo_email_webhook_secret() from public,anon,authenticated;
grant execute on function public.service_get_brevo_email_webhook_secret() to service_role;

create or replace function public.service_record_email_delivery_event(
  p_provider_message_id text,
  p_event_type text,
  p_recipient_email text default '',
  p_reason text default '',
  p_occurred_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_id text:=trim(coalesce(p_provider_message_id,''));
  v_event text:=lower(replace(replace(trim(coalesce(p_event_type,'')),'-','_'),' ','_'));
  v_email text:=lower(trim(coalesce(p_recipient_email,'')));
  v_row public.notification_outbox%rowtype;
  v_at timestamptz:=coalesce(p_occurred_at,now());
  v_delivery text:='Unknown';
  v_lead_id uuid;
  v_meeting_id uuid;
  v_crm_event text;
  v_title text;
  v_description text;
begin
  if v_id='' or v_event='' then return jsonb_build_object('recorded',false,'reason','missing_message_or_event'); end if;
  v_event:=case v_event
    when 'hardbounce' then 'hard_bounce'
    when 'softbounce' then 'soft_bounce'
    when 'invalid' then 'invalid_email'
    when 'uniqueopened' then 'unique_opened'
    when 'clicked' then 'click'
    else v_event end;

  select * into v_row
  from public.notification_outbox o
  where (o.provider_message_id=v_id or trim(both '<>' from o.provider_message_id)=trim(both '<>' from v_id))
    and (v_email='' or o.recipient_email='' or lower(o.recipient_email)=v_email)
  order by o.sent_at desc nulls last,o.created_at desc
  limit 1;

  insert into public.email_delivery_events(notification_id,provider,provider_message_id,event_type,recipient_email,reason,occurred_at,metadata)
  values(case when found then v_row.id else null end,'brevo',v_id,left(v_event,80),v_email,left(coalesce(p_reason,''),2000),v_at,
    case when jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))='object' then coalesce(p_metadata,'{}'::jsonb) else '{}'::jsonb end)
  on conflict(provider_message_id,event_type,occurred_at) do nothing;

  v_delivery:=case v_event
    when 'delivered' then 'Delivered'
    when 'opened' then 'Opened'
    when 'unique_opened' then 'Opened'
    when 'click' then 'Clicked'
    when 'soft_bounce' then 'Soft Bounce'
    when 'hard_bounce' then 'Hard Bounce'
    when 'blocked' then 'Blocked'
    when 'spam' then 'Spam Complaint'
    when 'invalid_email' then 'Invalid Email'
    when 'deferred' then 'Deferred'
    when 'unsubscribed' then 'Unsubscribed'
    else initcap(replace(v_event,'_',' ')) end;

  if found then
    update public.notification_outbox
    set delivery_status=v_delivery,
        delivered_at=case when v_event='delivered' then coalesce(delivered_at,v_at) else delivered_at end,
        first_opened_at=case when v_event in ('opened','unique_opened') then coalesce(first_opened_at,v_at) else first_opened_at end,
        first_clicked_at=case when v_event='click' then coalesce(first_clicked_at,v_at) else first_clicked_at end,
        bounced_at=case when v_event in ('soft_bounce','hard_bounce','blocked','invalid_email','spam') then coalesce(bounced_at,v_at) else bounced_at end,
        last_delivery_event_at=greatest(coalesce(last_delivery_event_at,'epoch'::timestamptz),v_at),
        updated_at=now()
    where id=v_row.id;

    if v_event in ('hard_bounce','blocked','spam','invalid_email','unsubscribed') and v_email<>'' then
      insert into public.email_recipient_suppressions(email,reason,source_event,provider,active,first_suppressed_at,updated_at)
      values(v_email,coalesce(nullif(left(trim(p_reason),1000),''),v_delivery),v_event,'brevo',true,now(),now())
      on conflict(email) do update set reason=excluded.reason,source_event=excluded.source_event,provider='brevo',active=true,updated_at=now();
    end if;

    if v_row.payload->>'communicationAudience'='customer' and nullif(v_row.payload->>'leadId','') is not null then
      v_lead_id:=(v_row.payload->>'leadId')::uuid;
      v_meeting_id=nullif(v_row.payload->>'meetingId','')::uuid;
      if v_event='delivered' then v_crm_event:='email_delivered'; v_title:='Automated email delivered'; v_description:='The meeting email was delivered to the customer.';
      elsif v_event in ('opened','unique_opened') then v_crm_event:='email_opened'; v_title:='Automated email opened'; v_description:='The customer opened the meeting email.';
      elsif v_event='click' then v_crm_event:='email_clicked'; v_title:='Automated email link clicked'; v_description:='The customer clicked a link in the meeting email.';
      elsif v_event in ('hard_bounce','blocked','spam','invalid_email','unsubscribed') then v_crm_event:='email_delivery_failed'; v_title:='Customer email delivery blocked'; v_description:='Automated meeting email delivery requires attention.';
      elsif v_event in ('soft_bounce','deferred') then v_crm_event:='email_delivery_delayed'; v_title:='Customer email delivery delayed'; v_description:='The provider reported a temporary meeting email delivery issue.';
      end if;
      if v_crm_event is not null then
        perform public.crm_write_lead_event(v_lead_id,v_crm_event,v_title,v_description,
          jsonb_build_object('notificationId',v_row.id,'templateKey',v_row.template_key,'meetingId',v_meeting_id,'provider','brevo','providerEvent',v_event,'deliveryStatus',v_delivery),
          null,'ProFox Automation','system',v_at,
          'email-delivery:'||v_id||':'||case when v_event in ('opened','unique_opened') then 'opened' else v_event end);
      end if;
    end if;
  end if;
  return jsonb_build_object('recorded',true,'matchedNotification',case when found then v_row.id else null end,'event',v_event);
end;
$function$;
revoke all on function public.service_record_email_delivery_event(text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.service_record_email_delivery_event(text,text,text,text,timestamptz,jsonb) to service_role;

create or replace function public.enqueue_notification(p_dedupe_key text,p_template_key text,p_recipient_email text default '',p_recipient_user_id uuid default null,p_payload jsonb default '{}'::jsonb,p_scheduled_for timestamptz default now())
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_id uuid; v_email text:=lower(trim(coalesce(p_recipient_email,''))); v_suppression text; v_initial_status text:='Pending';
begin
  if trim(coalesce(p_dedupe_key,''))='' then raise exception 'Notification dedupe key is required.'; end if;
  if not exists(select 1 from public.notification_templates where template_key=p_template_key and active is true) then return null; end if;
  if v_email='' and p_recipient_user_id is null then return null; end if;
  if v_email<>'' then
    select reason into v_suppression from public.email_recipient_suppressions where email=v_email and active is true;
    if found then v_initial_status:='Suppressed'; end if;
  end if;
  insert into public.notification_outbox(dedupe_key,template_key,recipient_email,recipient_user_id,payload,scheduled_for,status,last_error,delivery_status)
  values(left(trim(p_dedupe_key),500),p_template_key,v_email,p_recipient_user_id,coalesce(p_payload,'{}'::jsonb),coalesce(p_scheduled_for,now()),v_initial_status,
    case when v_initial_status='Suppressed' then 'Recipient suppressed: '||left(coalesce(v_suppression,'delivery policy'),1000) else '' end,
    case when v_initial_status='Suppressed' then 'Suppressed' else 'Unknown' end)
  on conflict(dedupe_key) do update set
    scheduled_for=case when public.notification_outbox.status in ('Pending','Retry') then excluded.scheduled_for else public.notification_outbox.scheduled_for end,
    payload=case when public.notification_outbox.status in ('Pending','Retry') then excluded.payload else public.notification_outbox.payload end,
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.service_claim_notification_batch(p_limit integer default 25)
returns table(id uuid,template_key text,recipient_email text,recipient_user_id uuid,payload jsonb,subject_template text,body_template text,html_template text,attempts integer)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  update public.notification_outbox o
  set status='Cancelled',last_error='Customer returned before offline conversation email was required.',updated_at=now()
  from public.sales_chat_conversations c
  where o.template_key in ('customer_quotation_conversation_reply','customer_sales_chat_reply')
    and o.status in ('Pending','Retry') and o.payload->>'conversationId'=c.id::text
    and c.customer_last_seen_at is not null and nullif(o.payload->>'sellerMessageCreatedAt','') is not null
    and c.customer_last_seen_at >= (o.payload->>'sellerMessageCreatedAt')::timestamptz;

  update public.notification_outbox o
  set status='Suppressed',last_error='Recipient suppressed: '||left(s.reason,1000),delivery_status='Suppressed',updated_at=now()
  from public.email_recipient_suppressions s
  where s.active is true and o.status in ('Pending','Retry') and o.recipient_email<>'' and lower(o.recipient_email)=s.email;

  return query
  with claimed as (
    select o.id from public.notification_outbox o
    where o.status in ('Pending','Retry') and o.scheduled_for<=now()
    order by o.scheduled_for,o.created_at for update skip locked
    limit least(greatest(coalesce(p_limit,25),1),100)
  ), updated as (
    update public.notification_outbox o
    set status='Processing',attempts=o.attempts+1,last_attempt_at=now(),updated_at=now()
    from claimed c where o.id=c.id returning o.*
  )
  select u.id,u.template_key,u.recipient_email,u.recipient_user_id,u.payload,t.subject_template,t.body_template,t.html_template,u.attempts
  from updated u join public.notification_templates t on t.template_key=u.template_key where t.active is true;
end;
$function$;

create or replace function public.service_complete_notification(p_id uuid,p_success boolean,p_provider_message_id text default '',p_error text default '')
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_max_attempts integer;
begin
  select least(greatest(coalesce((config_value->>'maxAttempts')::integer,5),1),10) into v_max_attempts from public.system_configuration where config_key='notification_settings';
  v_max_attempts:=coalesce(v_max_attempts,5);
  if p_success then
    update public.notification_outbox set status='Sent',provider_message_id=left(coalesce(p_provider_message_id,''),500),last_error='',sent_at=now(),delivery_status='Provider Accepted',updated_at=now() where id=p_id and status='Processing';
  else
    update public.notification_outbox
    set status=case when attempts>=v_max_attempts then 'Failed' else 'Retry' end,
        scheduled_for=case when attempts>=v_max_attempts then scheduled_for else now()+make_interval(mins=>least(60,greatest(2,attempts*5))) end,
        last_error=left(coalesce(p_error,'Unknown delivery error'),4000),
        delivery_status=case when attempts>=v_max_attempts then 'Provider Failed' else 'Retrying' end,updated_at=now()
    where id=p_id and status='Processing';
  end if;
end;
$function$;

create or replace function public.queue_due_meeting_communications()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare r record; v_payload jsonb; v_count integer:=0; v_minutes integer; v_label text; v_suffix text; v_purpose text;
begin
  for r in
    select m.id,m.salesperson_id,m.start_at,a.company_name,a.contact_name
    from public.sales_meetings m join public.sales_meeting_customer_access a on a.meeting_id=m.id and a.status='Confirmed'
    where m.status in ('Scheduled','Rescheduled') and trim(coalesce(m.meeting_url,''))='' and m.start_at>now() and m.start_at<=now()+interval '90 minutes'
  loop
    v_minutes:=floor(extract(epoch from (r.start_at-now()))/60.0)::integer;
    if v_minutes<=30 then v_label:='30-minute critical escalation'; v_suffix:='30';
    elsif v_minutes<=60 then v_label:='60-minute escalation'; v_suffix:='60';
    else v_label:='90-minute check'; v_suffix:='90'; end if;
    v_payload:=public.build_sales_meeting_notification_payload(r.id)||jsonb_build_object('linkAlertLabel',v_label);
    perform public.enqueue_notification('meeting-link-missing:'||r.id::text||':'||v_suffix,'seller_meeting_link_missing',coalesce(v_payload->>'sellerEmail',''),r.salesperson_id,v_payload,now());
    v_count:=v_count+1;
  end loop;

  for r in
    select o.id,o.template_key,o.recipient_email,o.attempts,(o.payload->>'meetingId')::uuid meeting_id,o.status
    from public.notification_outbox o
    where o.status in ('Failed','Suppressed') and o.payload->>'communicationAudience'='customer'
      and nullif(o.payload->>'meetingId','') is not null
      and not exists(select 1 from public.notification_outbox a where a.dedupe_key='meeting-email-failed-alert:'||o.id::text)
  loop
    v_payload:=public.build_sales_meeting_notification_payload(r.meeting_id);
    if v_payload<>'{}'::jsonb then
      v_purpose:=case r.template_key
        when 'meeting_confirmation_customer' then 'meeting confirmation'
        when 'meeting_reconfirmation_24h_customer' then '24-hour attendance confirmation'
        when 'meeting_reminder_1h_customer' then 'one-hour meeting reminder'
        when 'meeting_reminder_15m_customer' then '15-minute meeting reminder'
        when 'meeting_rescheduled_customer' then 'reschedule confirmation'
        when 'meeting_rescheduled_by_profox_customer' then 'meeting time update'
        when 'meeting_cancelled_customer' then 'cancellation confirmation'
        when 'meeting_cancelled_by_profox_customer' then 'cancellation notice'
        when 'meeting_no_show_rebook_customer' then 'missed meeting follow-up'
        when 'meeting_completed_followup_customer' then 'post-meeting next steps'
        when 'meeting_completed_followup_fallback_customer' then 'post-meeting thank you'
        else 'meeting communication' end;
      perform public.enqueue_notification('meeting-email-failed-alert:'||r.id::text,'meeting_customer_email_failed',coalesce(v_payload->>'sellerEmail',''),nullif(v_payload->>'sellerUserId','')::uuid,
        v_payload||jsonb_build_object('emailPurpose',v_purpose,'recipientEmail',r.recipient_email,'attemptCount',r.attempts,'deliveryFailureState',r.status),now());
      v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('meetingCommunicationActionsQueued',v_count);
end;
$function$;

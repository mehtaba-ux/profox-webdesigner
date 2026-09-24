-- Visitor/customer live-chat continuity, secure multi-device recovery, and ownership sync.

create table if not exists public.sales_chat_public_access (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sales_chat_conversations(id) on delete cascade,
  customer_identity_id uuid references public.customer_identities(id) on delete cascade,
  token_hash text not null unique,
  verification_method text not null default 'first_contact' check (verification_method in ('first_contact','legacy','email_code','client_portal')),
  verified_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sales_chat_public_access_conversation_idx
  on public.sales_chat_public_access(conversation_id, revoked_at);
create index if not exists sales_chat_public_access_identity_idx
  on public.sales_chat_public_access(customer_identity_id, created_at desc);

alter table public.sales_chat_public_access enable row level security;
revoke all on public.sales_chat_public_access from anon, authenticated;

create table if not exists public.sales_chat_recovery_challenges (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  customer_identity_id uuid references public.customer_identities(id) on delete cascade,
  conversation_id uuid references public.sales_chat_conversations(id) on delete cascade,
  code_hash text not null,
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  expires_at timestamptz not null,
  requested_at timestamptz not null default now(),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sales_chat_recovery_email_idx
  on public.sales_chat_recovery_challenges(email_hash, requested_at desc);
create index if not exists sales_chat_recovery_expiry_idx
  on public.sales_chat_recovery_challenges(expires_at)
  where consumed_at is null;

alter table public.sales_chat_recovery_challenges enable row level security;
revoke all on public.sales_chat_recovery_challenges from anon, authenticated;

insert into public.sales_chat_public_access(
  conversation_id, customer_identity_id, token_hash, verification_method, verified_at, last_used_at
)
select c.id, c.customer_identity_id, c.public_token_hash, 'legacy', c.created_at, greatest(c.updated_at,c.created_at)
from public.sales_chat_conversations c
where nullif(c.public_token_hash,'') is not null
on conflict(token_hash) do nothing;

create unique index if not exists sales_chat_one_website_thread_per_identity
  on public.sales_chat_conversations(customer_identity_id)
  where conversation_kind='website' and customer_identity_id is not null;

insert into public.notification_templates(
  template_key,name,subject_template,body_template,active,description,updated_at
)
values(
  'customer_sales_chat_recovery_code',
  'Customer sales chat recovery code',
  'Your ProFox chat verification code',
  E'Hi {{contactFirstName}},\n\nUse this verification code to securely continue your existing ProFox conversation on this device:\n\n{{chatRecoveryCode}}\n\nThis code expires in {{chatRecoveryMinutes}} minutes. Do not share it with anyone.\n\nIf you did not request this code, you can ignore this email.\n\nProFox Web Designer',
  true,
  'Privacy-safe verification for continuing the permanent website sales/support conversation on a new browser or device.',
  now()
)
on conflict(template_key) do update set
  name=excluded.name,
  subject_template=excluded.subject_template,
  body_template=excluded.body_template,
  active=true,
  description=excluded.description,
  updated_at=now();

create or replace function public.sales_chat_public_token_valid(p_conversation_id uuid, p_access_token uuid)
returns boolean
language sql
stable
security definer
set search_path='public','extensions','pg_temp'
as $$
  select p_access_token is not null and exists (
    select 1
    from public.sales_chat_conversations c
    where c.id=p_conversation_id
      and (
        c.public_token_hash=encode(extensions.digest(p_access_token::text,'sha256'),'hex')
        or exists (
          select 1
          from public.sales_chat_public_access a
          where a.conversation_id=c.id
            and a.token_hash=encode(extensions.digest(p_access_token::text,'sha256'),'hex')
            and a.revoked_at is null
        )
      )
  )
$$;

revoke all on function public.sales_chat_public_token_valid(uuid,uuid) from public;

create or replace function public.sales_chat_conversation_json(p_conversation public.sales_chat_conversations)
returns jsonb
language sql
stable
set search_path='public','pg_temp'
as $$
 select jsonb_build_object(
  'id',p_conversation.id,'crmLeadId',p_conversation.crm_lead_id,
  'customerName',p_conversation.customer_name,'customerEmail',p_conversation.customer_email,'customerPhone',p_conversation.customer_phone,
  'intent',p_conversation.intent,'originalSalesId',p_conversation.original_sales_id,'currentSalesId',p_conversation.current_sales_id,
  'originalSalesName',(select coalesce(nullif(btrim(u.full_name),''),'ProFox representative') from public.user_profiles u where u.id=p_conversation.original_sales_id),
  'currentSalesName',(select coalesce(nullif(btrim(u.full_name),''),'ProFox representative') from public.user_profiles u where u.id=p_conversation.current_sales_id),
  'currentSalesAvatar',(select coalesce(u.avatar_url,'') from public.user_profiles u where u.id=p_conversation.current_sales_id),
  'currentSalesTitle',(select coalesce(nullif(btrim(cp.job_title),''),'Sales Consultant') from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id where u.id=p_conversation.current_sales_id),
  'currentSalesAvailability',(select case when coalesce(cp.availability_status,'Available')='Available' then 'available' else 'away' end from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id where u.id=p_conversation.current_sales_id),
  'status',p_conversation.status,'ratingGiven',p_conversation.rating_given,'feedbackComment',p_conversation.feedback_comment,
  'lastMessage',p_conversation.last_message,'lastMessageTime',p_conversation.last_message_time,
  'conversationKind',p_conversation.conversation_kind,'quotationId',p_conversation.quotation_id,
  'quotationNumber',(select q.quotation_number from public.quotations q where q.id=p_conversation.quotation_id),
  'customerIdentityId',p_conversation.customer_identity_id,
  'customerLastSeenAt',p_conversation.customer_last_seen_at,
  'createdAt',p_conversation.created_at,'updatedAt',p_conversation.updated_at
 )
$$;

create or replace function public.public_sales_chat_request_recovery(p_email text)
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $$
declare
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_email_hash text;
  v_identity_id uuid;
  v_conversation public.sales_chat_conversations%rowtype;
  v_code text;
  v_code_hash text;
  v_challenge_id uuid;
  v_recent_id uuid;
  v_recent_expiry timestamptz;
begin
  if char_length(v_email) not between 5 and 320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  v_email_hash:=encode(extensions.digest(v_email,'sha256'),'hex');

  select id,expires_at into v_recent_id,v_recent_expiry
  from public.sales_chat_recovery_challenges
  where email_hash=v_email_hash and consumed_at is null and requested_at>now()-interval '60 seconds'
  order by requested_at desc limit 1;

  if v_recent_id is not null then
    return jsonb_build_object('success',true,'challengeId',v_recent_id,'expiresAt',v_recent_expiry,'delivery','email');
  end if;

  select ci.id into v_identity_id
  from public.customer_identities ci
  where ci.email=v_email
  limit 1;

  if v_identity_id is not null then
    select * into v_conversation
    from public.sales_chat_conversations c
    where c.customer_identity_id=v_identity_id and c.conversation_kind='website'
    order by c.created_at asc limit 1;
  end if;

  v_code:=upper(encode(extensions.gen_random_bytes(4),'hex'));
  v_code_hash:=encode(extensions.digest(v_code,'sha256'),'hex');

  insert into public.sales_chat_recovery_challenges(
    email_hash,customer_identity_id,conversation_id,code_hash,expires_at
  ) values(
    v_email_hash,v_identity_id,v_conversation.id,v_code_hash,now()+interval '10 minutes'
  ) returning id into v_challenge_id;

  if v_conversation.id is not null then
    perform public.service_queue_customer_communication(
      'chat-recovery:'||v_challenge_id::text,
      'customer_sales_chat_recovery_code',
      v_email,
      v_conversation.current_sales_id,
      v_conversation.customer_name,
      v_conversation.customer_name,
      jsonb_build_object('chatRecoveryCode',v_code,'chatRecoveryMinutes','10'),
      now()
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'challengeId',v_challenge_id,
    'expiresAt',now()+interval '10 minutes',
    'delivery','email'
  );
end;
$$;

grant execute on function public.public_sales_chat_request_recovery(text) to anon, authenticated;

create or replace function public.public_sales_chat_verify_recovery(
  p_challenge_id uuid,
  p_code text,
  p_access_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $$
declare
  v_challenge public.sales_chat_recovery_challenges%rowtype;
  v_conversation public.sales_chat_conversations%rowtype;
  v_code text:=upper(btrim(coalesce(p_code,'')));
  v_token_hash text;
  v_current_owner uuid;
begin
  if p_access_token is null then raise exception 'A device access token is required.'; end if;
  if char_length(v_code) not between 6 and 16 then raise exception 'The verification code is invalid or expired.'; end if;

  select * into v_challenge
  from public.sales_chat_recovery_challenges
  where id=p_challenge_id
  for update;

  if not found or v_challenge.consumed_at is not null or v_challenge.expires_at<now() or v_challenge.attempt_count>=5 then
    raise exception 'The verification code is invalid or expired.';
  end if;

  update public.sales_chat_recovery_challenges
  set attempt_count=attempt_count+1
  where id=v_challenge.id;

  if v_challenge.conversation_id is null
     or v_challenge.code_hash<>encode(extensions.digest(v_code,'sha256'),'hex') then
    raise exception 'The verification code is invalid or expired.';
  end if;

  select * into v_conversation
  from public.sales_chat_conversations
  where id=v_challenge.conversation_id and customer_identity_id=v_challenge.customer_identity_id
  for update;
  if not found then raise exception 'The verification code is invalid or expired.'; end if;

  select l.salesperson_id into v_current_owner
  from public.crm_leads l
  join public.user_profiles u on u.id=l.salesperson_id and u.status='active' and u.role in ('sales','sales_rep','sales_team')
  where l.id=v_conversation.crm_lead_id
  limit 1;

  if v_current_owner is not null then
    v_conversation.current_sales_id:=v_current_owner;
  end if;

  v_token_hash:=encode(extensions.digest(p_access_token::text,'sha256'),'hex');
  insert into public.sales_chat_public_access(
    conversation_id,customer_identity_id,token_hash,verification_method,verified_at,last_used_at
  ) values(
    v_conversation.id,v_conversation.customer_identity_id,v_token_hash,'email_code',now(),now()
  ) on conflict(token_hash) do update set
    conversation_id=excluded.conversation_id,
    customer_identity_id=excluded.customer_identity_id,
    verification_method='email_code',
    verified_at=now(),
    last_used_at=now(),
    revoked_at=null;

  update public.sales_chat_recovery_challenges set consumed_at=now() where id=v_challenge.id;
  update public.sales_chat_conversations
  set current_sales_id=v_conversation.current_sales_id,status='open',customer_last_seen_at=now(),updated_at=now()
  where id=v_conversation.id
  returning * into v_conversation;
  update public.customer_identities set last_seen_at=greatest(last_seen_at,now()),updated_at=now() where id=v_conversation.customer_identity_id;

  return public.sales_chat_conversation_json(v_conversation);
end;
$$;

grant execute on function public.public_sales_chat_verify_recovery(uuid,text,uuid) to anon, authenticated;

create or replace function public.public_sales_chat_get_conversation(p_conversation_id uuid, p_access_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','extensions','pg_temp'
as $$
declare v_row public.sales_chat_conversations%rowtype;
begin
  if not public.sales_chat_public_token_valid(p_conversation_id,p_access_token) then raise exception 'Conversation not found.'; end if;
  select * into v_row from public.sales_chat_conversations where id=p_conversation_id;
  if not found then raise exception 'Conversation not found.'; end if;
  return public.sales_chat_conversation_json(v_row);
end;
$$;

create or replace function public.public_sales_chat_get_messages(p_conversation_id uuid, p_access_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','extensions','pg_temp'
as $$
declare v_result jsonb;
begin
  if not public.sales_chat_public_token_valid(p_conversation_id,p_access_token) then raise exception 'Conversation not found.'; end if;
  select coalesce(jsonb_agg(public.sales_chat_message_json(m) order by m.created_at),'[]'::jsonb) into v_result
  from public.sales_chat_messages m where m.conversation_id=p_conversation_id and not m.is_internal_note;
  return v_result;
end;
$$;

create or replace function public.public_sales_chat_send_message(p_conversation_id uuid, p_access_token uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $$
declare
  v_conversation public.sales_chat_conversations%rowtype;
  v_message public.sales_chat_messages%rowtype;
  v_body text:=btrim(coalesce(p_message,''));
  v_token_hash text:=encode(extensions.digest(p_access_token::text,'sha256'),'hex');
  v_rate public.sales_chat_message_rate_limits%rowtype;
  v_dedupe text;
begin
  if char_length(v_body) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters.'; end if;
  if not public.sales_chat_public_token_valid(p_conversation_id,p_access_token) then raise exception 'Conversation not found.'; end if;
  select * into v_conversation from public.sales_chat_conversations where id=p_conversation_id for update;
  if not found then raise exception 'Conversation not found.'; end if;

  insert into public.sales_chat_message_rate_limits(token_hash,window_started_at,message_count)
  values(v_token_hash,now(),0) on conflict(token_hash) do nothing;
  select * into v_rate from public.sales_chat_message_rate_limits where token_hash=v_token_hash for update;
  if v_rate.window_started_at<=now()-interval '1 minute' then
    update public.sales_chat_message_rate_limits set window_started_at=now(),message_count=1 where token_hash=v_token_hash;
  else
    if v_rate.message_count>=20 then raise exception 'Too many messages. Please wait a moment.'; end if;
    update public.sales_chat_message_rate_limits set message_count=message_count+1 where token_hash=v_token_hash;
  end if;

  insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,message_text)
  values(p_conversation_id,'customer',v_conversation.customer_name,v_body) returning * into v_message;
  update public.sales_chat_conversations set last_message=v_body,last_message_time=now(),customer_last_seen_at=now(),updated_at=now(),status='open' where id=p_conversation_id;
  update public.sales_chat_public_access set last_used_at=now() where conversation_id=p_conversation_id and token_hash=v_token_hash and revoked_at is null;
  update public.customer_identities set last_seen_at=greatest(last_seen_at,now()),updated_at=now() where id=v_conversation.customer_identity_id;
  update public.crm_leads set last_contact_at=now(),updated_at=now() where id=v_conversation.crm_lead_id;

  if v_conversation.current_sales_id is not null then
    v_dedupe:='website-chat-message:'||v_message.id::text;
    perform public.enqueue_in_app_notification(
      v_conversation.current_sales_id,
      'Customer Message',
      'New website chat message',
      coalesce(nullif(v_conversation.customer_name,''),'Website visitor')||': '||left(v_body,220),
      '/admin/app/sales?tab=inbox&conversation='||v_conversation.id::text,
      v_dedupe
    );
    update public.in_app_notifications
    set category='Action Required',module='Sales',priority='High',
        metadata=jsonb_build_object('conversationId',v_conversation.id,'customerIdentityId',v_conversation.customer_identity_id,'messageId',v_message.id,'source','website_live_chat')
    where dedupe_key=v_dedupe;
  end if;

  return public.sales_chat_message_json(v_message);
end;
$$;

create or replace function public.public_sales_chat_submit_rating(p_conversation_id uuid, p_access_token uuid, p_rating integer, p_feedback text default '')
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $$
declare v_feedback text:=btrim(coalesce(p_feedback,''));
begin
  if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5.'; end if;
  if char_length(v_feedback)>2000 then raise exception 'Feedback is too long.'; end if;
  if not public.sales_chat_public_token_valid(p_conversation_id,p_access_token) then raise exception 'Conversation not found.'; end if;
  update public.sales_chat_conversations set rating_given=p_rating,feedback_comment=v_feedback,status='resolved',updated_at=now()
  where id=p_conversation_id;
  return jsonb_build_object('success',true,'status','resolved');
end;
$$;

create or replace function public.public_sales_chat_open(p_payload jsonb, p_access_token uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $$
declare
  v_name text:=btrim(coalesce(p_payload->>'customerName',''));
  v_email text:=lower(btrim(coalesce(p_payload->>'customerEmail','')));
  v_phone text:=btrim(coalesce(p_payload->>'customerPhone',''));
  v_intent text:=coalesce(nullif(p_payload->>'intent',''),'new_package');
  v_selected uuid;
  v_seller uuid;
  v_lead public.crm_leads%rowtype;
  v_identity_id uuid;
  v_token_hash text;
  v_email_hash text;
  v_last_open timestamptz;
  v_conversation public.sales_chat_conversations%rowtype;
  v_welcome text;
  v_recovery jsonb;
begin
  if p_access_token is null then raise exception 'A conversation access token is required.'; end if;
  if char_length(v_name) not between 2 and 120 then raise exception 'Name must be between 2 and 120 characters.'; end if;
  if char_length(v_email) not between 5 and 320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Enter a valid email address.'; end if;
  if char_length(v_phone)>40 then raise exception 'Phone number is too long.'; end if;
  if v_intent not in ('new_package','existing_issue') then raise exception 'Unsupported chat intent.'; end if;

  v_token_hash:=encode(extensions.digest(p_access_token::text,'sha256'),'hex');
  v_identity_id:=public.customer_identity_resolve(v_email,v_name,v_phone);

  select * into v_conversation
  from public.sales_chat_conversations c
  where c.customer_identity_id=v_identity_id and c.conversation_kind='website'
  order by c.created_at asc limit 1
  for update;

  if found then
    select l.* into v_lead from public.crm_leads l where l.id=v_conversation.crm_lead_id limit 1;
    if found and v_lead.salesperson_id is not null and exists(
      select 1 from public.user_profiles u where u.id=v_lead.salesperson_id and u.status='active' and u.role in ('sales','sales_rep','sales_team')
    ) then
      v_seller:=v_lead.salesperson_id;
    else
      v_seller:=v_conversation.current_sales_id;
    end if;

    update public.sales_chat_conversations
    set customer_name=v_name,
        customer_phone=case when v_phone<>'' then v_phone else customer_phone end,
        intent=v_intent,
        current_sales_id=coalesce(v_seller,current_sales_id),
        updated_at=now()
    where id=v_conversation.id
    returning * into v_conversation;

    if public.sales_chat_public_token_valid(v_conversation.id,p_access_token) then
      insert into public.sales_chat_public_access(conversation_id,customer_identity_id,token_hash,verification_method,verified_at,last_used_at)
      values(v_conversation.id,v_conversation.customer_identity_id,v_token_hash,'legacy',now(),now())
      on conflict(token_hash) do update set last_used_at=now(),revoked_at=null;
      update public.sales_chat_conversations set status='open',customer_last_seen_at=now(),updated_at=now() where id=v_conversation.id returning * into v_conversation;
      return public.sales_chat_conversation_json(v_conversation)||jsonb_build_object('verificationRequired',false,'relationshipResumed',true);
    end if;

    v_recovery:=public.public_sales_chat_request_recovery(v_email);
    return jsonb_build_object(
      'verificationRequired',true,
      'challengeId',v_recovery->>'challengeId',
      'expiresAt',v_recovery->>'expiresAt',
      'delivery','email'
    );
  end if;

  begin v_selected:=nullif(p_payload->>'selectedSalesId','')::uuid;
  exception when invalid_text_representation then v_selected:=null;
  end;

  select l.* into v_lead
  from public.crm_leads l
  where l.customer_identity_id=v_identity_id or lower(l.email)=v_email
  order by l.updated_at desc,l.created_at desc limit 1
  for update;

  if found and v_lead.salesperson_id is not null and exists(
    select 1 from public.user_profiles u where u.id=v_lead.salesperson_id and u.status='active' and u.role in ('sales','sales_rep','sales_team')
  ) then
    v_seller:=v_lead.salesperson_id;
  end if;

  if v_seller is null and v_selected is not null and exists(
    select 1 from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id
    where u.id=v_selected and u.status='active' and u.onboarding_status='completed'
      and u.role in ('sales','sales_rep','sales_team')
      and coalesce(cp.availability_status,'Available')<>'Unavailable'
      and lower(coalesce(cp.certification_state,'active')) not in ('revoked','expired','suspended','failed')
  ) then v_seller:=v_selected; end if;

  if v_seller is null then v_seller:=public.crm_pick_next_lead_assignee(false); end if;
  if v_seller is null then
    select u.id into v_seller
    from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id
    where u.status='active' and u.onboarding_status='completed' and u.role in ('sales','sales_rep','sales_team')
      and coalesce(cp.availability_status,'Available')<>'Unavailable'
      and lower(coalesce(cp.certification_state,'active')) not in ('revoked','expired','suspended','failed')
    order by u.created_at,u.id limit 1;
  end if;
  if v_seller is null then raise exception 'No verified sales representative is currently available.'; end if;

  v_email_hash:=encode(extensions.digest(v_email,'sha256'),'hex');
  insert into public.sales_chat_open_rate_limits(email_hash,last_open_at)
  values(v_email_hash,now()-interval '1 minute') on conflict(email_hash) do nothing;
  select last_open_at into v_last_open from public.sales_chat_open_rate_limits where email_hash=v_email_hash for update;
  if v_last_open>now()-interval '15 seconds' then raise exception 'Please wait before opening another conversation.'; end if;
  update public.sales_chat_open_rate_limits set last_open_at=now() where email_hash=v_email_hash;

  if v_lead.id is null then
    insert into public.crm_leads(title,company_name,contact_name,email,phone,country,source,salesperson_id,service_interest,status,notes,self_generated,customer_identity_id)
    values('Website chat — '||v_name,v_name,v_name,v_email,v_phone,'Unknown','Website Live Chat',v_seller,
      case when v_intent='existing_issue' then 'Existing client support' else 'Website or application package' end,
      'New','Created automatically from the secure website sales chat.',false,v_identity_id)
    returning * into v_lead;
  else
    update public.crm_leads
    set salesperson_id=coalesce(salesperson_id,v_seller),
        customer_identity_id=coalesce(customer_identity_id,v_identity_id),
        phone=case when btrim(coalesce(phone,''))='' then v_phone else phone end,
        updated_at=now()
    where id=v_lead.id returning * into v_lead;
    v_seller:=coalesce(v_lead.salesperson_id,v_seller);
  end if;

  v_welcome:=case when v_intent='existing_issue'
    then 'Welcome back, '||v_name||'. Your ProFox representative can continue helping you here.'
    else 'Welcome to ProFox, '||v_name||'. Your assigned representative can help with packages, quotations, and next steps.' end;

  insert into public.sales_chat_conversations(
    public_token_hash,customer_name,customer_email,customer_phone,intent,
    original_sales_id,current_sales_id,crm_lead_id,last_message,last_message_time,
    customer_identity_id,conversation_kind,customer_last_seen_at
  ) values(
    v_token_hash,v_name,v_email,v_phone,v_intent,
    v_seller,v_seller,v_lead.id,v_welcome,now(),
    v_identity_id,'website',now()
  ) returning * into v_conversation;

  insert into public.sales_chat_public_access(
    conversation_id,customer_identity_id,token_hash,verification_method,verified_at,last_used_at
  ) values(v_conversation.id,v_identity_id,v_token_hash,'first_contact',now(),now())
  on conflict(token_hash) do nothing;

  insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,message_text)
  values(v_conversation.id,'system','ProFox',v_welcome);

  return public.sales_chat_conversation_json(v_conversation)||jsonb_build_object('verificationRequired',false,'relationshipResumed',false);
end;
$$;

grant execute on function public.public_sales_chat_open(jsonb,uuid) to anon, authenticated;
grant execute on function public.public_sales_chat_get_conversation(uuid,uuid) to anon, authenticated;
grant execute on function public.public_sales_chat_get_messages(uuid,uuid) to anon, authenticated;
grant execute on function public.public_sales_chat_send_message(uuid,uuid,text) to anon, authenticated;
grant execute on function public.public_sales_chat_submit_rating(uuid,uuid,integer,text) to anon, authenticated;

create or replace function public.sales_chat_sync_lead_owner()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
begin
  if new.salesperson_id is distinct from old.salesperson_id then
    update public.sales_chat_conversations
    set current_sales_id=new.salesperson_id,updated_at=now()
    where crm_lead_id=new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sales_chat_sync_lead_owner on public.crm_leads;
create trigger trg_sales_chat_sync_lead_owner
after update of salesperson_id on public.crm_leads
for each row execute function public.sales_chat_sync_lead_owner();

create or replace function public.sales_chat_get_assignment_history(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare v_lead_id uuid; v_result jsonb;
begin
  if not public.sales_chat_can_manage(p_conversation_id) then raise exception 'Conversation access denied.'; end if;
  select crm_lead_id into v_lead_id from public.sales_chat_conversations where id=p_conversation_id;
  if v_lead_id is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,
    'eventType',e.event_type,
    'title',e.title,
    'description',e.description,
    'actorName',e.actor_name_snapshot,
    'actorRole',e.actor_role_snapshot,
    'metadata',e.metadata,
    'occurredAt',e.occurred_at
  ) order by e.occurred_at),'[]'::jsonb) into v_result
  from public.crm_lead_events e
  where e.lead_id=v_lead_id and e.event_type='assignment_changed';
  return v_result;
end;
$$;

grant execute on function public.sales_chat_get_assignment_history(uuid) to authenticated;

create or replace function public.sales_chat_send_message(p_conversation_id uuid, p_message text, p_internal_note boolean default false)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_name text;
  v_body text:=btrim(coalesce(p_message,''));
  v_message public.sales_chat_messages%rowtype;
  v_conv public.sales_chat_conversations%rowtype;
  v_q public.quotations%rowtype;
  v_url text;
  v_presence text;
  v_context jsonb;
begin
 if not public.sales_chat_can_manage(p_conversation_id) then raise exception 'Conversation access denied.'; end if;
 if char_length(v_body) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters.'; end if;
 select coalesce(nullif(btrim(full_name),''),'Sales representative') into v_name from public.user_profiles where id=v_uid and status='active';
 select * into v_conv from public.sales_chat_conversations where id=p_conversation_id for update;
 insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,sender_id,message_text,is_internal_note)
 values(p_conversation_id,'sales_rep',v_name,v_uid,v_body,coalesce(p_internal_note,false)) returning * into v_message;
 if not coalesce(p_internal_note,false) then
   update public.sales_chat_conversations set last_message=v_body,last_message_time=v_message.created_at,updated_at=now(),status='open' where id=p_conversation_id;
   update public.crm_leads set first_response_at=coalesce(first_response_at,v_message.created_at),last_contact_at=now(),updated_at=now() where id=v_conv.crm_lead_id;
   if v_conv.conversation_kind='quotation' and v_conv.quotation_id is not null then
     select * into v_q from public.quotations where id=v_conv.quotation_id;
     if found and btrim(coalesce(v_conv.customer_email,''))<>'' then
       v_url:=public.quotation_conversation_resume_url(v_q.id);
       v_presence:=coalesce(floor(extract(epoch from v_conv.customer_last_seen_at))::bigint,0)::text;
       v_context:=jsonb_build_object('conversationId',v_conv.id,'quotationId',v_q.id,'quotationNumber',v_q.quotation_number,'sellerName',v_name,'messagePreview',left(v_body,350),'conversationUrl',v_url,'sellerMessageCreatedAt',v_message.created_at);
       perform public.service_queue_customer_communication('quotation-conversation-offline:'||v_conv.id::text||':'||v_presence,'customer_quotation_conversation_reply',v_conv.customer_email,v_uid,v_conv.customer_name,v_q.customer_name,v_context,now()+interval '90 seconds');
     end if;
   end if;
 end if;
 return public.sales_chat_message_json(v_message);
end;
$$;

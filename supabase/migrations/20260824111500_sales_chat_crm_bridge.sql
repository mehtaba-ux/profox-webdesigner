-- Secure website sales chat and CRM intake bridge.
-- The previous browser code referenced tables that never existed and silently
-- kept customer conversations in localStorage. These RPC-only tables make the
-- website chat durable without exposing customer data to anonymous table reads.

create table if not exists public.sales_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  public_token_hash text not null unique,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null default '',
  intent text not null check (intent in ('new_package','existing_issue')),
  original_sales_id uuid not null references public.user_profiles(id) on delete restrict,
  current_sales_id uuid not null references public.user_profiles(id) on delete restrict,
  crm_lead_id uuid references public.crm_leads(id) on delete set null,
  status text not null default 'open' check (status in ('open','pending','resolved')),
  rating_given integer check (rating_given between 1 and 5),
  feedback_comment text not null default '',
  last_message text not null default '',
  last_message_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_chat_customer_name_length check (char_length(btrim(customer_name)) between 2 and 120),
  constraint sales_chat_customer_email_length check (char_length(customer_email) between 5 and 320),
  constraint sales_chat_customer_phone_length check (char_length(customer_phone) <= 40),
  constraint sales_chat_feedback_length check (char_length(feedback_comment) <= 2000)
);

create table if not exists public.sales_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sales_chat_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer','sales_rep','system')),
  sender_name text not null,
  sender_id uuid references public.user_profiles(id) on delete set null,
  message_text text not null,
  is_internal_note boolean not null default false,
  created_at timestamptz not null default now(),
  constraint sales_chat_sender_name_length check (char_length(btrim(sender_name)) between 1 and 120),
  constraint sales_chat_message_length check (char_length(btrim(message_text)) between 1 and 4000),
  constraint sales_chat_internal_note_sender check (not is_internal_note or sender_type='sales_rep')
);

create table if not exists public.sales_chat_open_rate_limits (
  email_hash text primary key,
  last_open_at timestamptz not null default now()
);

create table if not exists public.sales_chat_message_rate_limits (
  token_hash text primary key,
  window_started_at timestamptz not null default now(),
  message_count integer not null default 0 check (message_count >= 0)
);

create index if not exists idx_sales_chat_conversations_current_sales
  on public.sales_chat_conversations(current_sales_id, status, updated_at desc);
create index if not exists idx_sales_chat_conversations_original_sales
  on public.sales_chat_conversations(original_sales_id);
create index if not exists idx_sales_chat_conversations_crm_lead
  on public.sales_chat_conversations(crm_lead_id);
create index if not exists idx_sales_chat_conversations_email
  on public.sales_chat_conversations(lower(customer_email), created_at desc);
create index if not exists idx_sales_chat_messages_conversation_created
  on public.sales_chat_messages(conversation_id, created_at);
create index if not exists idx_sales_chat_messages_sender
  on public.sales_chat_messages(sender_id) where sender_id is not null;

alter table public.sales_chat_conversations enable row level security;
alter table public.sales_chat_messages enable row level security;
alter table public.sales_chat_open_rate_limits enable row level security;
alter table public.sales_chat_message_rate_limits enable row level security;

revoke all on public.sales_chat_conversations from public, anon, authenticated;
revoke all on public.sales_chat_messages from public, anon, authenticated;
revoke all on public.sales_chat_open_rate_limits from public, anon, authenticated;
revoke all on public.sales_chat_message_rate_limits from public, anon, authenticated;

create or replace function public.sales_chat_is_staff()
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists (
    select 1
    from public.user_profiles u
    where u.id=(select auth.uid())
      and u.status='active'
      and u.role in ('admin','site_manager','project_manager','sales','sales_rep','sales_team')
  )
$$;

create or replace function public.sales_chat_can_manage(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists (
    select 1
    from public.sales_chat_conversations c
    join public.user_profiles u on u.id=(select auth.uid())
    where c.id=p_conversation_id
      and u.status='active'
      and (
        u.role in ('admin','site_manager','project_manager')
        or (u.role in ('sales','sales_rep','sales_team') and (select auth.uid()) in (c.original_sales_id,c.current_sales_id))
      )
  )
$$;

create or replace function public.sales_chat_conversation_json(p_conversation public.sales_chat_conversations)
returns jsonb
language sql
stable
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'id',p_conversation.id,
    'customerName',p_conversation.customer_name,
    'customerEmail',p_conversation.customer_email,
    'customerPhone',p_conversation.customer_phone,
    'intent',p_conversation.intent,
    'originalSalesId',p_conversation.original_sales_id,
    'currentSalesId',p_conversation.current_sales_id,
    'status',p_conversation.status,
    'ratingGiven',p_conversation.rating_given,
    'feedbackComment',p_conversation.feedback_comment,
    'lastMessage',p_conversation.last_message,
    'lastMessageTime',p_conversation.last_message_time,
    'createdAt',p_conversation.created_at,
    'updatedAt',p_conversation.updated_at
  )
$$;

create or replace function public.sales_chat_message_json(p_message public.sales_chat_messages)
returns jsonb
language sql
stable
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'id',p_message.id,
    'conversationId',p_message.conversation_id,
    'senderType',p_message.sender_type,
    'senderName',p_message.sender_name,
    'senderId',p_message.sender_id,
    'messageText',p_message.message_text,
    'isInternalNote',p_message.is_internal_note,
    'createdAt',p_message.created_at
  )
$$;

create or replace function public.get_public_sales_reps()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,
    'name',coalesce(nullif(btrim(u.full_name),''),'Sales representative'),
    'avatar',coalesce(u.avatar_url,''),
    'title',coalesce(nullif(btrim(cp.job_title),''),'Sales Consultant'),
    'specialties',coalesce(to_jsonb(cp.specialties),'["Packages & Quotations","Website Consulting"]'::jsonb),
    'rating',5.0,
    'reviewCount',0,
    'isOnline',coalesce(cp.availability_status,'Available')='Available',
    'bio',''
  ) order by (coalesce(cp.availability_status,'Available')='Available') desc,u.full_name),'[]'::jsonb)
  from public.user_profiles u
  left join public.workforce_capability_profiles cp on cp.user_id=u.id
  where u.status='active'
    and u.onboarding_status='completed'
    and u.role in ('sales','sales_rep','sales_team')
    and coalesce(cp.availability_status,'Available')<>'Unavailable'
    and lower(coalesce(cp.certification_state,'active')) not in ('revoked','expired','suspended','failed')
$$;

create or replace function public.public_sales_chat_open(p_payload jsonb,p_access_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_name text:=btrim(coalesce(p_payload->>'customerName',''));
  v_email text:=lower(btrim(coalesce(p_payload->>'customerEmail','')));
  v_phone text:=btrim(coalesce(p_payload->>'customerPhone',''));
  v_intent text:=coalesce(nullif(p_payload->>'intent',''),'new_package');
  v_selected uuid;
  v_original uuid;
  v_seller uuid;
  v_lead uuid;
  v_token_hash text;
  v_email_hash text;
  v_last_open timestamptz;
  v_conversation public.sales_chat_conversations%rowtype;
  v_welcome text;
begin
  if p_access_token is null then raise exception 'A conversation access token is required.'; end if;
  if char_length(v_name) not between 2 and 120 then raise exception 'Name must be between 2 and 120 characters.'; end if;
  if char_length(v_email) not between 5 and 320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Enter a valid email address.'; end if;
  if char_length(v_phone)>40 then raise exception 'Phone number is too long.'; end if;
  if v_intent not in ('new_package','existing_issue') then raise exception 'Unsupported chat intent.'; end if;

  v_token_hash:=encode(extensions.digest(p_access_token::text,'sha256'),'hex');
  select * into v_conversation from public.sales_chat_conversations
  where public_token_hash=v_token_hash and customer_email=v_email limit 1;
  if found then return public.sales_chat_conversation_json(v_conversation); end if;

  begin v_selected:=nullif(p_payload->>'selectedSalesId','')::uuid;
  exception when invalid_text_representation then raise exception 'The selected sales representative is invalid.';
  end;

  select c.original_sales_id into v_original
  from public.sales_chat_conversations c
  join public.user_profiles u on u.id=c.original_sales_id and u.status='active' and u.role in ('sales','sales_rep','sales_team')
  where lower(c.customer_email)=v_email
  order by c.created_at asc limit 1;

  if v_original is null then
    select l.salesperson_id into v_original
    from public.crm_leads l
    join public.user_profiles u on u.id=l.salesperson_id and u.status='active' and u.role in ('sales','sales_rep','sales_team')
    where lower(l.email)=v_email
    order by l.created_at asc limit 1;
  end if;

  if v_original is null and v_selected is not null and exists(
    select 1 from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id
    where u.id=v_selected and u.status='active' and u.onboarding_status='completed'
      and u.role in ('sales','sales_rep','sales_team') and coalesce(cp.availability_status,'Available')<>'Unavailable'
  ) then v_original:=v_selected; end if;

  if v_original is null then
    select u.id into v_original
    from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id
    where u.status='active' and u.onboarding_status='completed' and u.role in ('sales','sales_rep','sales_team')
      and coalesce(cp.availability_status,'Available')<>'Unavailable'
      and lower(coalesce(cp.certification_state,'active')) not in ('revoked','expired','suspended','failed')
    order by (coalesce(cp.availability_status,'Available')='Available') desc,u.created_at,u.id limit 1;
  end if;
  if v_original is null then raise exception 'No verified sales representative is currently available.'; end if;
  v_seller:=v_original;

  v_email_hash:=encode(extensions.digest(v_email,'sha256'),'hex');
  insert into public.sales_chat_open_rate_limits(email_hash,last_open_at)
  values(v_email_hash,now()-interval '1 minute') on conflict(email_hash) do nothing;
  select last_open_at into v_last_open from public.sales_chat_open_rate_limits where email_hash=v_email_hash for update;
  if v_last_open>now()-interval '15 seconds' then raise exception 'Please wait before opening another conversation.'; end if;
  update public.sales_chat_open_rate_limits set last_open_at=now() where email_hash=v_email_hash;

  select l.id into v_lead from public.crm_leads l
  where lower(l.email)=v_email and l.converted_opportunity_id is null
  order by l.created_at desc limit 1 for update;
  if v_lead is null then
    insert into public.crm_leads(title,company_name,contact_name,email,phone,country,source,salesperson_id,service_interest,status,notes,self_generated)
    values('Website chat — '||v_name,v_name,v_name,v_email,v_phone,'Unknown','Website Live Chat',v_seller,
      case when v_intent='existing_issue' then 'Existing client support' else 'Website or application package' end,
      'New','Created automatically from the secure website sales chat.',false)
    returning id into v_lead;
  else
    update public.crm_leads set salesperson_id=coalesce(salesperson_id,v_seller),phone=case when btrim(coalesce(phone,''))='' then v_phone else phone end,updated_at=now()
    where id=v_lead;
  end if;

  v_welcome:=case when v_intent='existing_issue'
    then 'Welcome back, '||v_name||'. You are connected with your assigned ProFox sales representative.'
    else 'Welcome to ProFox, '||v_name||'. A verified sales representative is ready to help with packages and quotations.' end;

  insert into public.sales_chat_conversations(public_token_hash,customer_name,customer_email,customer_phone,intent,original_sales_id,current_sales_id,crm_lead_id,last_message,last_message_time)
  values(v_token_hash,v_name,v_email,v_phone,v_intent,v_original,v_seller,v_lead,v_welcome,now()) returning * into v_conversation;
  insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,message_text)
  values(v_conversation.id,'system','ProFox',v_welcome);
  return public.sales_chat_conversation_json(v_conversation);
end;
$$;

create or replace function public.public_sales_chat_get_conversation(p_conversation_id uuid,p_access_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions,pg_temp
as $$
declare v_row public.sales_chat_conversations%rowtype;
begin
  select * into v_row from public.sales_chat_conversations
  where id=p_conversation_id and public_token_hash=encode(extensions.digest(p_access_token::text,'sha256'),'hex');
  if not found then raise exception 'Conversation not found.'; end if;
  return public.sales_chat_conversation_json(v_row);
end;
$$;

create or replace function public.public_sales_chat_get_messages(p_conversation_id uuid,p_access_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions,pg_temp
as $$
declare v_result jsonb;
begin
  if not exists(select 1 from public.sales_chat_conversations where id=p_conversation_id and public_token_hash=encode(extensions.digest(p_access_token::text,'sha256'),'hex')) then raise exception 'Conversation not found.'; end if;
  select coalesce(jsonb_agg(public.sales_chat_message_json(m) order by m.created_at),'[]'::jsonb) into v_result
  from public.sales_chat_messages m where m.conversation_id=p_conversation_id and not m.is_internal_note;
  return v_result;
end;
$$;

create or replace function public.public_sales_chat_send_message(p_conversation_id uuid,p_access_token uuid,p_message text)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_conversation public.sales_chat_conversations%rowtype;
  v_message public.sales_chat_messages%rowtype;
  v_body text:=btrim(coalesce(p_message,''));
  v_token_hash text:=encode(extensions.digest(p_access_token::text,'sha256'),'hex');
  v_rate public.sales_chat_message_rate_limits%rowtype;
begin
  if char_length(v_body) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters.'; end if;
  select * into v_conversation from public.sales_chat_conversations where id=p_conversation_id and public_token_hash=v_token_hash for update;
  if not found then raise exception 'Conversation not found.'; end if;
  if v_conversation.status='resolved' then raise exception 'This conversation is closed. Start a new chat to continue.'; end if;

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
  update public.sales_chat_conversations set last_message=v_body,last_message_time=now(),updated_at=now(),status='open' where id=p_conversation_id;
  update public.crm_leads set last_contact_at=now(),updated_at=now() where id=v_conversation.crm_lead_id;
  return public.sales_chat_message_json(v_message);
end;
$$;

create or replace function public.public_sales_chat_submit_rating(p_conversation_id uuid,p_access_token uuid,p_rating integer,p_feedback text default '')
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare v_feedback text:=btrim(coalesce(p_feedback,''));
begin
  if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5.'; end if;
  if char_length(v_feedback)>2000 then raise exception 'Feedback is too long.'; end if;
  update public.sales_chat_conversations set rating_given=p_rating,feedback_comment=v_feedback,status='resolved',updated_at=now()
  where id=p_conversation_id and public_token_hash=encode(extensions.digest(p_access_token::text,'sha256'),'hex');
  if not found then raise exception 'Conversation not found.'; end if;
  return jsonb_build_object('success',true,'status','resolved');
end;
$$;

create or replace function public.sales_chat_list_conversations()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_uid uuid:=(select auth.uid()); v_role text; v_result jsonb;
begin
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if v_role not in ('admin','site_manager','project_manager','sales','sales_rep','sales_team') then raise exception 'Sales chat access required.'; end if;
  select coalesce(jsonb_agg(public.sales_chat_conversation_json(c) order by c.updated_at desc),'[]'::jsonb) into v_result
  from public.sales_chat_conversations c
  where v_role in ('admin','site_manager','project_manager') or v_uid in(c.original_sales_id,c.current_sales_id);
  return v_result;
end;
$$;

create or replace function public.sales_chat_get_messages(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_result jsonb;
begin
  if not public.sales_chat_can_manage(p_conversation_id) then raise exception 'Conversation access denied.'; end if;
  select coalesce(jsonb_agg(public.sales_chat_message_json(m) order by m.created_at),'[]'::jsonb) into v_result
  from public.sales_chat_messages m where m.conversation_id=p_conversation_id;
  return v_result;
end;
$$;

create or replace function public.sales_chat_send_message(p_conversation_id uuid,p_message text,p_internal_note boolean default false)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_uid uuid:=(select auth.uid()); v_name text; v_body text:=btrim(coalesce(p_message,'')); v_message public.sales_chat_messages%rowtype;
begin
  if not public.sales_chat_can_manage(p_conversation_id) then raise exception 'Conversation access denied.'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'Message must be between 1 and 4000 characters.'; end if;
  select coalesce(nullif(btrim(full_name),''),'Sales representative') into v_name from public.user_profiles where id=v_uid and status='active';
  insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,sender_id,message_text,is_internal_note)
  values(p_conversation_id,'sales_rep',v_name,v_uid,v_body,coalesce(p_internal_note,false)) returning * into v_message;
  if not coalesce(p_internal_note,false) then
    update public.sales_chat_conversations set last_message=v_body,last_message_time=now(),updated_at=now(),status='open' where id=p_conversation_id;
  end if;
  return public.sales_chat_message_json(v_message);
end;
$$;

create or replace function public.sales_chat_update_status(p_conversation_id uuid,p_status text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.sales_chat_can_manage(p_conversation_id) then raise exception 'Conversation access denied.'; end if;
  if p_status not in ('open','pending','resolved') then raise exception 'Unsupported conversation status.'; end if;
  update public.sales_chat_conversations set status=p_status,updated_at=now() where id=p_conversation_id;
  return jsonb_build_object('success',true,'status',p_status);
end;
$$;

revoke all on function public.sales_chat_is_staff() from public,anon,authenticated;
revoke all on function public.sales_chat_can_manage(uuid) from public,anon,authenticated;
revoke all on function public.sales_chat_conversation_json(public.sales_chat_conversations) from public,anon,authenticated;
revoke all on function public.sales_chat_message_json(public.sales_chat_messages) from public,anon,authenticated;

revoke all on function public.get_public_sales_reps() from public;
revoke all on function public.public_sales_chat_open(jsonb,uuid) from public;
revoke all on function public.public_sales_chat_get_conversation(uuid,uuid) from public;
revoke all on function public.public_sales_chat_get_messages(uuid,uuid) from public;
revoke all on function public.public_sales_chat_send_message(uuid,uuid,text) from public;
revoke all on function public.public_sales_chat_submit_rating(uuid,uuid,integer,text) from public;
revoke all on function public.sales_chat_list_conversations() from public;
revoke all on function public.sales_chat_get_messages(uuid) from public;
revoke all on function public.sales_chat_send_message(uuid,text,boolean) from public;
revoke all on function public.sales_chat_update_status(uuid,text) from public;

grant execute on function public.get_public_sales_reps() to anon,authenticated;
grant execute on function public.public_sales_chat_open(jsonb,uuid) to anon,authenticated;
grant execute on function public.public_sales_chat_get_conversation(uuid,uuid) to anon,authenticated;
grant execute on function public.public_sales_chat_get_messages(uuid,uuid) to anon,authenticated;
grant execute on function public.public_sales_chat_send_message(uuid,uuid,text) to anon,authenticated;
grant execute on function public.public_sales_chat_submit_rating(uuid,uuid,integer,text) to anon,authenticated;
grant execute on function public.sales_chat_list_conversations() to authenticated;
grant execute on function public.sales_chat_get_messages(uuid) to authenticated;
grant execute on function public.sales_chat_send_message(uuid,text,boolean) to authenticated;
grant execute on function public.sales_chat_update_status(uuid,text) to authenticated;

comment on function public.public_sales_chat_open(jsonb,uuid) is 'Creates a token-scoped website sales chat and an assigned CRM lead atomically.';

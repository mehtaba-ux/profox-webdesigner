-- Prevent an unverified browser from mutating an existing customer identity
-- and cap verification-code email requests per address.

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
  v_hourly_requests integer:=0;
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

  select count(*)::integer into v_hourly_requests
  from public.sales_chat_recovery_challenges
  where email_hash=v_email_hash and requested_at>now()-interval '1 hour';

  if v_hourly_requests>=5 then
    raise exception 'Too many verification requests. Please try again later.';
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
  v_identity_preexisting boolean:=false;
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

  select ci.id into v_identity_id
  from public.customer_identities ci
  where ci.email=v_email
  limit 1;

  if v_identity_id is null then
    v_identity_id:=public.customer_identity_resolve(v_email,v_name,v_phone);
  else
    v_identity_preexisting:=true;
  end if;

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

    if public.sales_chat_public_token_valid(v_conversation.id,p_access_token) then
      perform public.customer_identity_resolve(v_email,v_name,v_phone);
      update public.sales_chat_conversations
      set customer_name=v_name,
          customer_phone=case when v_phone<>'' then v_phone else customer_phone end,
          intent=v_intent,
          current_sales_id=coalesce(v_seller,current_sales_id),
          status='open',
          customer_last_seen_at=now(),
          updated_at=now()
      where id=v_conversation.id
      returning * into v_conversation;

      insert into public.sales_chat_public_access(conversation_id,customer_identity_id,token_hash,verification_method,verified_at,last_used_at)
      values(v_conversation.id,v_conversation.customer_identity_id,v_token_hash,'legacy',now(),now())
      on conflict(token_hash) do update set last_used_at=now(),revoked_at=null;

      return public.sales_chat_conversation_json(v_conversation)||jsonb_build_object('verificationRequired',false,'relationshipResumed',true);
    end if;

    update public.sales_chat_conversations
    set current_sales_id=coalesce(v_seller,current_sales_id),updated_at=now()
    where id=v_conversation.id
    returning * into v_conversation;

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
        phone=case when not v_identity_preexisting and btrim(coalesce(phone,''))='' then v_phone else phone end,
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

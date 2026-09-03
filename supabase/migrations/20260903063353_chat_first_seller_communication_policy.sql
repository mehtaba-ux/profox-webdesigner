-- Chat-first seller communication policy.
-- Transactional email remains active. Professional mailbox access is limited to management/admin roles.

alter table public.staff_professional_accounts
  add column if not exists remote_disabled_at timestamptz,
  add column if not exists lifecycle_attempts integer not null default 0,
  add column if not exists lifecycle_next_attempt_at timestamptz not null default now(),
  add column if not exists lifecycle_locked_at timestamptz,
  add column if not exists lifecycle_last_error text,
  add column if not exists deprovision_reason text;

create or replace function public.service_professional_mailbox_role_eligible(p_role text)
returns boolean
language sql
immutable
set search_path='public','pg_temp'
as $$
  select lower(btrim(coalesce(p_role,''))) = any(
    array['admin','project_manager','site_manager']::text[]
  );
$$;

create or replace function public.enforce_professional_mailbox_role_policy()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
begin
  if new.mailbox_status='active' and not public.service_professional_mailbox_eligible(new.user_id) then
    new.mailbox_status:='suspended';
    new.suspended_at:=coalesce(new.suspended_at,now());
    new.remote_disabled_at:=null;
    new.lifecycle_next_attempt_at:=now();
    new.lifecycle_locked_at:=null;
    new.deprovision_reason:='Seller professional email removed. Customer communication uses secure ProFox Chat.';
    new.last_error:='Professional mailbox suspended by role policy. Sellers communicate with customers through secure ProFox Chat.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_professional_mailbox_role_policy() from public,anon,authenticated;
grant execute on function public.enforce_professional_mailbox_role_policy() to service_role;

drop trigger if exists trg_enforce_professional_mailbox_role_policy on public.staff_professional_accounts;
create trigger trg_enforce_professional_mailbox_role_policy
before insert or update of mailbox_status,user_id on public.staff_professional_accounts
for each row execute function public.enforce_professional_mailbox_role_policy();

-- Fail closed for already queued seller provisioning work.
update public.professional_mailbox_provisioning_jobs j
set status='skipped',
    locked_at=null,
    completed_at=now(),
    last_error='Seller professional mailbox provisioning cancelled. Sellers use secure ProFox Chat.',
    updated_at=now()
from public.user_profiles u
where u.id=j.user_id
  and lower(coalesce(u.role,'')) in ('sales','sales_rep','sales_team')
  and j.status in ('pending','retry','processing');

-- Suspend any mailbox that already exists for a seller. The lifecycle worker performs the reversible remote Zoho disable.
update public.staff_professional_accounts a
set mailbox_status='suspended',
    suspended_at=coalesce(a.suspended_at,now()),
    remote_disabled_at=null,
    lifecycle_next_attempt_at=now(),
    lifecycle_locked_at=null,
    lifecycle_last_error=null,
    deprovision_reason='Seller professional email removed. Customer communication uses secure ProFox Chat.',
    last_error='Professional mailbox suspended by role policy. Sellers communicate with customers through secure ProFox Chat.',
    updated_at=now()
from public.user_profiles u
where u.id=a.user_id
  and lower(coalesce(u.role,'')) in ('sales','sales_rep','sales_team')
  and a.work_email is not null
  and a.mail_provider='zoho';

-- Revoke seller-owned Zoho send OAuth credentials immediately. Historical email records remain untouched.
delete from vault.secrets s
using public.zoho_user_mail_send_connections c, public.user_profiles u
where c.user_id=u.id
  and s.id=c.refresh_secret_id
  and lower(coalesce(u.role,'')) in ('sales','sales_rep','sales_team');

delete from public.zoho_user_mail_send_connections c
using public.user_profiles u
where c.user_id=u.id
  and lower(coalesce(u.role,'')) in ('sales','sales_rep','sales_team');

delete from public.zoho_user_mail_send_oauth_states s
using public.user_profiles u
where s.user_id=u.id
  and lower(coalesce(u.role,'')) in ('sales','sales_rep','sales_team');

-- Claim reversible Zoho lifecycle work. Ineligible sellers are disabled remotely.
-- If an employee later becomes an eligible manager/admin, the same account can be re-enabled rather than recreated.
create or replace function public.service_claim_professional_mailbox_lifecycle(p_limit integer default 10)
returns table(
  user_id uuid,
  work_email text,
  provider_user_id text,
  provider_account_id text,
  lifecycle_action text,
  lifecycle_attempts integer
)
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
begin
  update public.staff_professional_accounts
  set lifecycle_locked_at=null,
      lifecycle_next_attempt_at=now(),
      updated_at=now()
  where lifecycle_locked_at is not null
    and lifecycle_locked_at < now()-interval '10 minutes';

  return query
  with candidates as (
    select a.user_id,
           case
             when not public.service_professional_mailbox_eligible(a.user_id)
                  and a.mailbox_status='suspended'
                  and a.remote_disabled_at is null then 'disable'
             when public.service_professional_mailbox_eligible(a.user_id)
                  and a.mailbox_status='provisioning'
                  and a.remote_disabled_at is not null then 'enable'
             else null
           end action
    from public.staff_professional_accounts a
    where a.mail_provider='zoho'
      and nullif(btrim(coalesce(a.work_email,'')),'') is not null
      and nullif(btrim(coalesce(a.provider_user_id,'')),'') is not null
      and nullif(btrim(coalesce(a.provider_account_id,'')),'') is not null
      and a.lifecycle_locked_at is null
      and a.lifecycle_next_attempt_at<=now()
  ), picked as (
    select c.user_id,c.action
    from candidates c
    where c.action is not null
    order by c.user_id
    for update skip locked
    limit least(greatest(coalesce(p_limit,10),1),50)
  ), locked as (
    update public.staff_professional_accounts a
    set lifecycle_locked_at=now(),
        lifecycle_attempts=a.lifecycle_attempts+1,
        updated_at=now()
    from picked p
    where a.user_id=p.user_id
    returning a.user_id,a.work_email,a.provider_user_id,a.provider_account_id,a.lifecycle_attempts,p.action
  )
  select l.user_id,l.work_email,l.provider_user_id,l.provider_account_id,l.action,l.lifecycle_attempts
  from locked l;
end;
$$;

revoke all on function public.service_claim_professional_mailbox_lifecycle(integer) from public,anon,authenticated;
grant execute on function public.service_claim_professional_mailbox_lifecycle(integer) to service_role;

create or replace function public.service_finish_professional_mailbox_lifecycle(
  p_user_id uuid,
  p_action text,
  p_success boolean,
  p_error text default null,
  p_retry_seconds integer default 60
)
returns void
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
begin
  if p_action not in ('disable','enable') then raise exception 'Unsupported mailbox lifecycle action.'; end if;

  if p_success then
    if p_action='disable' then
      update public.staff_professional_accounts
      set mailbox_status='suspended',
          remote_disabled_at=now(),
          suspended_at=coalesce(suspended_at,now()),
          lifecycle_locked_at=null,
          lifecycle_attempts=0,
          lifecycle_next_attempt_at=now(),
          lifecycle_last_error=null,
          last_error='Seller professional mailbox disabled. Customer communication uses secure ProFox Chat.',
          updated_at=now()
      where user_id=p_user_id;
    else
      update public.staff_professional_accounts
      set mailbox_status='active',
          remote_disabled_at=null,
          suspended_at=null,
          lifecycle_locked_at=null,
          lifecycle_attempts=0,
          lifecycle_next_attempt_at=now(),
          lifecycle_last_error=null,
          deprovision_reason=null,
          last_error=null,
          updated_at=now()
      where user_id=p_user_id
        and public.service_professional_mailbox_eligible(p_user_id);
    end if;
  else
    update public.staff_professional_accounts
    set lifecycle_locked_at=null,
        lifecycle_next_attempt_at=now()+make_interval(secs=>least(greatest(coalesce(p_retry_seconds,60),15),21600)),
        lifecycle_last_error=left(coalesce(p_error,'Mailbox lifecycle operation failed.'),1600),
        updated_at=now()
    where user_id=p_user_id;
  end if;
end;
$$;

revoke all on function public.service_finish_professional_mailbox_lifecycle(uuid,text,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.service_finish_professional_mailbox_lifecycle(uuid,text,boolean,text,integer) to service_role;

-- If a previously disabled seller becomes management/admin, reactivate remotely instead of creating another mailbox.
create or replace function public.queue_professional_mailbox_provisioning(
  p_user_id uuid,
  p_reason text default 'staff_activation',
  p_requested_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_cfg jsonb:='{}'::jsonb;
  v_generation integer:=1;
  v_job uuid;
  v_key text;
  v_existing public.staff_professional_accounts%rowtype;
begin
  if not public.service_professional_mailbox_eligible(p_user_id) then return null; end if;
  select * into v_existing from public.staff_professional_accounts where user_id=p_user_id for update;
  if found and v_existing.remote_disabled_at is not null
     and nullif(btrim(coalesce(v_existing.work_email,'')),'') is not null
     and nullif(btrim(coalesce(v_existing.provider_user_id,'')),'') is not null
     and nullif(btrim(coalesce(v_existing.provider_account_id,'')),'') is not null then
    update public.staff_professional_accounts
    set mailbox_status='provisioning',lifecycle_next_attempt_at=now(),lifecycle_locked_at=null,lifecycle_last_error=null,updated_at=now()
    where user_id=p_user_id;
    return null;
  end if;

  select coalesce(config_value,'{}'::jsonb) into v_cfg
  from public.system_configuration where config_key='professional_integrations';
  if coalesce((v_cfg->>'zohoEnabled')::boolean,false) is not true
     or coalesce((v_cfg->>'zohoMailEnabled')::boolean,false) is not true
     or coalesce((v_cfg->>'mailProvisioningEnabled')::boolean,false) is not true
     or coalesce(v_cfg->>'defaultMailProvider','none')<>'zoho'
     or not exists(select 1 from public.zoho_organization_mail_connection where singleton_key='primary' and status='connected')
  then return null; end if;
  if coalesce(v_cfg->>'mailProviderGeneration','') ~ '^[1-9][0-9]*$' then
    v_generation:=(v_cfg->>'mailProviderGeneration')::integer;
  end if;
  if exists(select 1 from public.staff_professional_accounts where user_id=p_user_id and mailbox_status='active' and nullif(btrim(work_email),'') is not null) then return null; end if;

  insert into public.staff_professional_accounts(user_id,mail_provider,mailbox_status,mail_provider_generation,updated_at)
  values(p_user_id,'zoho','provisioning',v_generation,now())
  on conflict(user_id) do update set
    mail_provider='zoho',
    mailbox_status=case when public.staff_professional_accounts.mailbox_status='active' then 'active' else 'provisioning' end,
    mail_provider_generation=v_generation,
    last_error=case when public.staff_professional_accounts.mailbox_status='active' then public.staff_professional_accounts.last_error else null end,
    updated_at=now();

  v_key:='zoho-mail:provision:'||p_user_id::text||':g'||v_generation::text;
  insert into public.professional_mailbox_provisioning_jobs(
    user_id,requested_reason,requested_by,idempotency_key,mail_provider_generation
  ) values(
    p_user_id,left(coalesce(nullif(btrim(p_reason),''),'staff_activation'),120),p_requested_by,v_key,v_generation
  )
  on conflict(idempotency_key) do update set
    status=case when public.professional_mailbox_provisioning_jobs.status in ('dead_letter','skipped') then 'pending' else public.professional_mailbox_provisioning_jobs.status end,
    next_attempt_at=case when public.professional_mailbox_provisioning_jobs.status in ('dead_letter','skipped') then now() else public.professional_mailbox_provisioning_jobs.next_attempt_at end,
    completed_at=case when public.professional_mailbox_provisioning_jobs.status in ('dead_letter','skipped') then null else public.professional_mailbox_provisioning_jobs.completed_at end,
    last_error=case when public.professional_mailbox_provisioning_jobs.status in ('dead_letter','skipped') then null else public.professional_mailbox_provisioning_jobs.last_error end,
    updated_at=now()
  returning id into v_job;
  return v_job;
end;
$$;

-- Canonical secure relationship chat URL used by transactional notifications.
create or replace function public.service_customer_relationship_chat_url(
  p_crm_lead_id uuid,
  p_owner_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text default null
)
returns text
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $$
declare
  v_email text:=lower(btrim(coalesce(p_customer_email,'')));
  v_name text:=coalesce(nullif(btrim(coalesce(p_customer_name,'')),''),'Customer');
  v_identity uuid;
  v_conv public.sales_chat_conversations%rowtype;
  v_owner uuid:=p_owner_id;
  v_seed uuid:=gen_random_uuid();
begin
  if v_email='' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then return null; end if;
  if v_owner is null and p_crm_lead_id is not null then
    select salesperson_id into v_owner from public.crm_leads where id=p_crm_lead_id;
  end if;
  if v_owner is null then return null; end if;
  if not exists(select 1 from public.user_profiles u where u.id=v_owner and lower(coalesce(u.status,''))='active') then return null; end if;

  v_identity:=public.customer_identity_resolve(v_email,v_name,p_customer_phone);
  if v_identity is null then return null; end if;

  select * into v_conv
  from public.sales_chat_conversations c
  where c.customer_identity_id=v_identity and c.conversation_kind='website'
  order by case when c.crm_lead_id=p_crm_lead_id then 0 else 1 end,c.created_at asc
  limit 1 for update;

  if not found then
    insert into public.sales_chat_conversations(
      public_token_hash,customer_name,customer_email,customer_phone,intent,
      original_sales_id,current_sales_id,crm_lead_id,status,last_message,last_message_time,
      customer_identity_id,conversation_kind,created_at,updated_at
    ) values(
      encode(extensions.digest(v_seed::text,'sha256'),'hex'),left(v_name,120),v_email,left(coalesce(p_customer_phone,''),40),'new_package',
      v_owner,v_owner,p_crm_lead_id,'open','Secure ProFox conversation ready',now(),v_identity,'website',now(),now()
    ) returning * into v_conv;
    insert into public.sales_chat_messages(conversation_id,sender_type,sender_name,message_text,is_internal_note)
    values(v_conv.id,'system','ProFox','Your secure ProFox conversation is ready. Messages here stay connected to your relationship history.',false);
  else
    update public.sales_chat_conversations
    set customer_name=left(v_name,120),customer_email=v_email,
        customer_phone=case when btrim(coalesce(p_customer_phone,''))<>'' then left(p_customer_phone,40) else customer_phone end,
        current_sales_id=v_owner,crm_lead_id=coalesce(p_crm_lead_id,crm_lead_id),customer_identity_id=v_identity,
        status=case when status='resolved' then 'open' else status end,updated_at=now()
    where id=v_conv.id returning * into v_conv;
  end if;

  return public.service_sales_chat_customer_link_url(v_conv.id,v_owner);
end;
$$;

revoke all on function public.service_customer_relationship_chat_url(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.service_customer_relationship_chat_url(uuid,uuid,text,text,text) to service_role;

-- Customer meeting transactional email retains email delivery, but the relationship action goes to secure chat.
create or replace function public.build_sales_meeting_customer_payload(p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_base jsonb;
  v_owner uuid;
  v_lead uuid;
  v_chat_url text;
  v_customer jsonb;
begin
  v_base:=public.build_sales_meeting_notification_payload(p_meeting_id);
  if v_base='{}'::jsonb then return v_base; end if;
  v_owner:=nullif(v_base->>'sellerUserId','')::uuid;
  v_lead:=nullif(v_base->>'crmLeadId','')::uuid;
  v_chat_url:=public.service_customer_relationship_chat_url(
    v_lead,v_owner,v_base->>'contactName',v_base->>'email',null
  );
  v_customer:=public.service_build_customer_communication_payload(v_owner,v_base->>'contactName',v_base->>'companyName',v_base);
  return v_customer||jsonb_build_object('conversationUrl',coalesce(v_chat_url,v_base->>'manageUrl'));
end;
$$;

-- Quotation transactional emails retain delivery and include the existing secure quotation chat link.
create or replace function public.quotation_customer_communication_context(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_q public.quotations%rowtype;
  v_service text;
  v_total text;
  v_valid text;
  v_terms text;
  v_scope text;
  v_subject text;
  v_message text;
  v_conversation_url text;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then return '{}'::jsonb; end if;
  select product_name_snapshot into v_service
  from public.quotation_items
  where quotation_id=v_q.id and line_type in ('product','custom') and optional_for_client=false
  order by (item_type='package') desc,sort_order,id limit 1;
  v_service:=coalesce(nullif(trim(v_service),''),'your project');
  v_total:=trim(to_char(coalesce(v_q.total,0),'FM999999999990.00'));
  v_valid:=case when v_q.valid_until is null then 'the date agreed with your ProFox contact' else to_char(v_q.valid_until,'FMMonth DD, YYYY') end;
  v_terms:=coalesce(nullif(trim(v_q.payment_terms),''),'As agreed in the quotation');
  v_scope:=coalesce(nullif(trim(v_q.scope_summary),''),'The agreed project scope is included in the quotation.');
  v_subject:=coalesce(nullif(trim(v_q.send_subject),''),'Your ProFox proposal is ready: '||v_q.quotation_number);
  v_message:=coalesce(nullif(trim(v_q.send_message),''),'Thank you for the opportunity to prepare this proposal. Please review the scope, investment, timeline and payment plan using the secure link below.');
  begin
    v_conversation_url:=public.quotation_conversation_resume_url(v_q.id);
  exception when others then
    v_conversation_url:=null;
  end;
  return jsonb_build_object(
    'quotationNumber',v_q.quotation_number,'revisionNumber',v_q.revision_number,'serviceLabel',v_service,
    'currency',coalesce(nullif(trim(v_q.currency),''),'USD'),'totalFormatted',v_total,
    'validUntil',coalesce(v_q.valid_until::text,''),'validUntilHuman',v_valid,'paymentTerms',v_terms,
    'scopeSummary',v_scope,'emailSubject',v_subject,'personalMessage',v_message,
    'conversationUrl',coalesce(v_conversation_url,'')
  );
end;
$$;

-- Professional Email visibility/send is management/admin only. Sellers retain chat/WhatsApp/note according to existing capability rules.
create or replace function public.customer_communication_get_capabilities(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','vault','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_conv public.sales_chat_conversations%rowtype;
  v_cfg jsonb:='{}'::jsonb;
  v_whatsapp_configured boolean:=false;
  v_whatsapp_session_open boolean:=false;
  v_can_view_email boolean:=false;
  v_can_send_email boolean:=false;
  v_can_status boolean:=false;
  v_phone text:='';
  v_crm_lead_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not public.customer_communication_can_access(p_conversation_id,v_uid) then raise exception 'Conversation access denied.'; end if;
  select * into v_conv from public.sales_chat_conversations where id=p_conversation_id;
  select public.internal_chat_normalize_role(role) into v_role from public.user_profiles where id=v_uid and lower(coalesce(status,''))='active';
  select coalesce((select config_value from public.system_configuration where config_key='whatsapp_business'),'{}'::jsonb) into v_cfg;

  v_whatsapp_configured:=coalesce((v_cfg->>'enabled')::boolean,false)
    and coalesce(v_cfg->>'phoneNumberId','')<>'' and coalesce(v_cfg->>'businessPhone','')<>''
    and exists(select 1 from vault.secrets where name='profox_whatsapp_access_token')
    and exists(select 1 from vault.secrets where name='profox_whatsapp_verify_token')
    and exists(select 1 from vault.secrets where name='profox_whatsapp_app_secret');

  select c.crm_lead_id into v_crm_lead_id
  from public.sales_chat_conversations c
  where c.current_sales_id=v_conv.current_sales_id and c.crm_lead_id is not null
    and ((v_conv.customer_identity_id is not null and c.customer_identity_id=v_conv.customer_identity_id)
      or (nullif(lower(btrim(coalesce(v_conv.customer_email,''))),'') is not null and lower(btrim(coalesce(c.customer_email,'')))=lower(btrim(v_conv.customer_email))))
  order by coalesce(c.last_message_time,c.updated_at,c.created_at) desc,c.id limit 1;
  v_crm_lead_id:=coalesce(v_conv.crm_lead_id,v_crm_lead_id);

  select regexp_replace(coalesce(c.customer_phone,''),'[^0-9]','','g') into v_phone
  from public.sales_chat_conversations c
  where c.current_sales_id=v_conv.current_sales_id
    and char_length(regexp_replace(coalesce(c.customer_phone,''),'[^0-9]','','g')) between 8 and 15
    and (c.id=v_conv.id or (v_conv.customer_identity_id is not null and c.customer_identity_id=v_conv.customer_identity_id)
      or (nullif(lower(btrim(coalesce(v_conv.customer_email,''))),'') is not null and lower(btrim(coalesce(c.customer_email,'')))=lower(btrim(v_conv.customer_email))))
  order by case when c.id=v_conv.id then 0 else 1 end,coalesce(c.last_message_time,c.updated_at,c.created_at) desc,c.id limit 1;
  v_phone:=coalesce(v_phone,'');

  select exists(
    select 1 from public.client_whatsapp_messages w
    join public.sales_chat_conversations c on c.id=w.conversation_id
    where w.direction='inbound' and w.sent_or_received_at>now()-interval '24 hours'
      and c.current_sales_id=v_conv.current_sales_id
      and (c.id=v_conv.id or (v_conv.customer_identity_id is not null and c.customer_identity_id=v_conv.customer_identity_id)
        or (nullif(lower(btrim(coalesce(v_conv.customer_email,''))),'') is not null and lower(btrim(coalesce(c.customer_email,'')))=lower(btrim(v_conv.customer_email))))
  ) into v_whatsapp_session_open;

  v_can_view_email:=public.service_professional_mailbox_role_eligible(v_role);
  v_can_send_email:=v_can_view_email and v_crm_lead_id is not null
    and public.service_professional_mailbox_eligible(v_uid) and public.crm_can_access_lead(v_crm_lead_id);
  v_can_status:=public.customer_communication_can_manage_status(p_conversation_id,v_uid);

  return jsonb_build_object(
    'canAccess',true,'role',v_role,
    'canSendChat',exists(
      select 1 from public.sales_chat_conversations c
      where c.current_sales_id=v_conv.current_sales_id and c.conversation_kind in ('website','quotation')
        and (c.id=v_conv.id or (v_conv.customer_identity_id is not null and c.customer_identity_id=v_conv.customer_identity_id)
          or (nullif(lower(btrim(coalesce(v_conv.customer_email,''))),'') is not null and lower(btrim(coalesce(c.customer_email,'')))=lower(btrim(v_conv.customer_email))))
    ),
    'canViewEmail',v_can_view_email,'canSendEmail',v_can_send_email,'canManageStatus',v_can_status,
    'crmLeadId',v_crm_lead_id,'whatsappConfigured',v_whatsapp_configured,'whatsappSessionOpen',v_whatsapp_session_open,
    'whatsappTemplateConfigured',coalesce(v_cfg->>'defaultTemplateName','')<>'','whatsappTemplateName',coalesce(v_cfg->>'defaultTemplateName',''),
    'canSendWhatsApp',v_whatsapp_configured and char_length(v_phone) between 8 and 15
      and (v_whatsapp_session_open or coalesce(v_cfg->>'defaultTemplateName','')<>''),
    'customerPhone',v_phone,'whatsappBusinessPhone',coalesce(v_cfg->>'businessPhone','')
  );
end;
$$;

-- Update active relationship templates: transactional email stays, customer replies move to secure chat.
update public.notification_templates
set body_template=replace(replace(replace(body_template,
      'reply directly to this email','continue in your secure ProFox conversation: {{conversationUrl}}'),
      'reply to this email','continue in your secure ProFox conversation: {{conversationUrl}}'),
      'reply here','continue in your secure ProFox conversation: {{conversationUrl}}'),
    html_template=replace(replace(replace(html_template,
      'reply directly to this email','<a href="{{conversationUrl}}" style="color:#000080;text-decoration:underline;font-weight:700;">continue in your secure ProFox conversation</a>'),
      'reply to this email','<a href="{{conversationUrl}}" style="color:#000080;text-decoration:underline;font-weight:700;">continue in your secure ProFox conversation</a>'),
      'reply here','<a href="{{conversationUrl}}" style="color:#000080;text-decoration:underline;font-weight:700;">continue in your secure ProFox conversation</a>'),
    updated_at=now()
where template_key in (
  'meeting_cancelled_by_profox_customer','meeting_completed_followup_customer','meeting_completed_followup_fallback_customer',
  'meeting_confirmation_customer','meeting_link_ready_customer','meeting_reconfirmation_24h_customer',
  'customer_quotation_sent','customer_quotation_accepted','customer_quotation_closed'
);

-- On touched customer templates, use the current customer-facing brand name.
update public.notification_templates
set body_template=replace(body_template,'ProFox Web Designer','ProFox'),
    html_template=replace(html_template,'ProFox Web Designer','ProFox'),
    updated_at=now()
where template_key in ('customer_quotation_sent','customer_quotation_accepted','customer_quotation_closed');

-- Run the reversible remote lifecycle worker every two minutes. It uses the same private cron token as provisioning.
do $$
begin
  if exists(select 1 from cron.job where jobname='profox-professional-mailbox-lifecycle') then
    perform cron.unschedule('profox-professional-mailbox-lifecycle');
  end if;
  perform cron.schedule(
    'profox-professional-mailbox-lifecycle','*/2 * * * *',
    $cron$
    select net.http_post(
      url:='https://calabtayklhltyiriiwo.supabase.co/functions/v1/process-professional-mailbox-lifecycle',
      headers:=jsonb_build_object('Content-Type','application/json','x-profox-mailbox-cron-token',coalesce((select decrypted_secret from vault.decrypted_secrets where name='profox_professional_mailbox_cron_token' limit 1),'')),
      body:=jsonb_build_object('source','supabase-cron','requestedAt',now()),
      timeout_milliseconds:=30000
    );
    $cron$
  );
end $$;
-- Global seller professional email control.
-- Keeps managers eligible, gives administrators one switch for all seller mailboxes,
-- preserves existing mailbox identities, and lets the mailbox lifecycle worker
-- safely enable/disable the remote Zoho account.

insert into public.system_configuration(config_key,config_value,description,updated_at)
values(
  'seller_professional_email_control',
  jsonb_build_object('enabled',true),
  'Administrator-controlled global switch for seller professional email access.',
  now()
)
on conflict(config_key) do update
set config_value=coalesce(public.system_configuration.config_value,'{}'::jsonb) || jsonb_build_object('enabled',true),
    description=excluded.description,
    updated_at=now();

-- The professional-mail infrastructure remains enabled even when sellers are
-- later toggled off, because managers may continue to use professional email.
insert into public.system_configuration(config_key,config_value,description,updated_at)
values(
  'professional_integrations',
  jsonb_build_object(
    'zohoEnabled',true,
    'zohoMailEnabled',true,
    'mailProvisioningEnabled',true,
    'defaultMailProvider','zoho',
    'mailProviderGeneration',1
  ),
  'Professional mail/calendar integration provider controls.',
  now()
)
on conflict(config_key) do update
set config_value=coalesce(public.system_configuration.config_value,'{}'::jsonb) || jsonb_build_object(
      'zohoEnabled',true,
      'zohoMailEnabled',true,
      'mailProvisioningEnabled',true,
      'defaultMailProvider','zoho'
    ),
    updated_at=now();

create or replace function public.service_seller_professional_email_role(p_role text)
returns boolean
language sql
immutable
set search_path to 'public','pg_temp'
as $$
  select lower(btrim(coalesce(p_role,''))) = any(
    array['sales','sales_rep','sales_team','seller']::text[]
  );
$$;

create or replace function public.service_seller_professional_email_enabled()
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
  select lower(coalesce((
    select config_value->>'enabled'
    from public.system_configuration
    where config_key='seller_professional_email_control'
  ),'false')) in ('true','1','yes','on');
$$;

create or replace function public.service_professional_mailbox_role_eligible(p_role text)
returns boolean
language sql
immutable
set search_path to 'public','pg_temp'
as $$
  select lower(btrim(coalesce(p_role,''))) = any(
    array['admin','manager','project_manager','site_manager']::text[]
  ) or public.service_seller_professional_email_role(p_role);
$$;

create or replace function public.service_professional_mailbox_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.id=p_user_id
      and lower(coalesce(p.status,''))='active'
      and lower(coalesce(p.onboarding_status,''))='completed'
      and public.service_professional_mailbox_role_eligible(p.role)
      and (
        not public.service_seller_professional_email_role(p.role)
        or public.service_seller_professional_email_enabled()
      )
  );
$$;

create or replace function public.admin_get_seller_professional_email_control()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_enabled boolean:=false;
  v_active_sellers integer:=0;
  v_active_mailboxes integer:=0;
  v_provisioning_mailboxes integer:=0;
  v_suspended_mailboxes integer:=0;
  v_connected_senders integer:=0;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required.';
  end if;

  v_enabled:=public.service_seller_professional_email_enabled();

  select count(*) into v_active_sellers
  from public.user_profiles p
  where lower(coalesce(p.status,''))='active'
    and lower(coalesce(p.onboarding_status,''))='completed'
    and public.service_seller_professional_email_role(p.role);

  select
    count(*) filter(where a.mailbox_status='active'),
    count(*) filter(where a.mailbox_status='provisioning'),
    count(*) filter(where a.mailbox_status='suspended')
  into v_active_mailboxes,v_provisioning_mailboxes,v_suspended_mailboxes
  from public.staff_professional_accounts a
  join public.user_profiles p on p.id=a.user_id
  where public.service_seller_professional_email_role(p.role);

  select count(*) into v_connected_senders
  from public.zoho_user_mail_send_connections c
  join public.user_profiles p on p.id=c.user_id
  where public.service_seller_professional_email_role(p.role)
    and c.status='connected';

  return jsonb_build_object(
    'enabled',v_enabled,
    'activeSellerCount',v_active_sellers,
    'activeMailboxCount',v_active_mailboxes,
    'provisioningMailboxCount',v_provisioning_mailboxes,
    'suspendedMailboxCount',v_suspended_mailboxes,
    'connectedSenderCount',v_connected_senders
  );
end;
$$;

create or replace function public.admin_set_seller_professional_email_control(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  r record;
  v_enabled boolean:=coalesce(p_enabled,false);
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required.';
  end if;

  insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  values(
    'seller_professional_email_control',
    jsonb_build_object('enabled',v_enabled),
    'Administrator-controlled global switch for seller professional email access.',
    auth.uid(),
    now()
  )
  on conflict(config_key) do update
  set config_value=coalesce(public.system_configuration.config_value,'{}'::jsonb) || jsonb_build_object('enabled',v_enabled),
      description=excluded.description,
      updated_by=auth.uid(),
      updated_at=now();

  if v_enabled then
    -- Keep the provider infrastructure ready. Turning seller mail off must not
    -- disable professional mail for eligible management roles.
    insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at)
    values(
      'professional_integrations',
      jsonb_build_object(
        'zohoEnabled',true,
        'zohoMailEnabled',true,
        'mailProvisioningEnabled',true,
        'defaultMailProvider','zoho',
        'mailProviderGeneration',1
      ),
      'Professional mail/calendar integration provider controls.',
      auth.uid(),
      now()
    )
    on conflict(config_key) do update
    set config_value=coalesce(public.system_configuration.config_value,'{}'::jsonb) || jsonb_build_object(
          'zohoEnabled',true,
          'zohoMailEnabled',true,
          'mailProvisioningEnabled',true,
          'defaultMailProvider','zoho'
        ),
        updated_by=auth.uid(),
        updated_at=now();

    for r in
      select p.id
      from public.user_profiles p
      where lower(coalesce(p.status,''))='active'
        and lower(coalesce(p.onboarding_status,''))='completed'
        and public.service_seller_professional_email_role(p.role)
    loop
      perform public.queue_professional_mailbox_provisioning(r.id,'seller_email_global_enabled',auth.uid());
    end loop;
  else
    -- Stop new app sends immediately. Already accepted provider sends cannot be
    -- recalled, but pending requests are failed before a worker can dispatch them.
    update public.professional_email_send_requests e
    set status='failed',
        last_error='Seller professional email disabled by administrator.',
        completed_at=coalesce(e.completed_at,now()),
        updated_at=now()
    where e.status='pending'
      and exists(
        select 1 from public.user_profiles p
        where p.id=e.user_id
          and public.service_seller_professional_email_role(p.role)
      );

    update public.professional_mailbox_provisioning_jobs j
    set status='skipped',
        locked_at=null,
        completed_at=now(),
        last_error='Seller professional email disabled by administrator.',
        updated_at=now()
    where j.status in ('pending','retry')
      and exists(
        select 1 from public.user_profiles p
        where p.id=j.user_id
          and public.service_seller_professional_email_role(p.role)
      );

    -- Preserve the mailbox address and Zoho identifiers. The lifecycle worker
    -- performs the remote disable, so an administrator can safely re-enable the
    -- exact same mailbox later instead of creating a duplicate.
    update public.staff_professional_accounts a
    set mailbox_status=case
          when nullif(btrim(coalesce(a.work_email,'')),'') is null then 'not_configured'
          else 'suspended'
        end,
        suspended_at=case
          when nullif(btrim(coalesce(a.work_email,'')),'') is null then a.suspended_at
          else coalesce(a.suspended_at,now())
        end,
        lifecycle_next_attempt_at=case
          when nullif(btrim(coalesce(a.work_email,'')),'') is not null
           and nullif(btrim(coalesce(a.provider_user_id,'')),'') is not null
           and nullif(btrim(coalesce(a.provider_account_id,'')),'') is not null
          then now()
          else a.lifecycle_next_attempt_at
        end,
        lifecycle_locked_at=null,
        lifecycle_last_error=null,
        deprovision_reason=case
          when nullif(btrim(coalesce(a.work_email,'')),'') is null then a.deprovision_reason
          else 'Seller professional email disabled by administrator.'
        end,
        last_error=case
          when nullif(btrim(coalesce(a.work_email,'')),'') is null then a.last_error
          else 'Seller professional email disabled by administrator.'
        end,
        updated_at=now()
    where exists(
      select 1 from public.user_profiles p
      where p.id=a.user_id
        and public.service_seller_professional_email_role(p.role)
    );
  end if;

  return public.admin_get_seller_professional_email_control();
end;
$$;

-- Email capabilities must hide/deny seller email while the seller-only switch is off.
create or replace function public.customer_communication_get_capabilities(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','vault','pg_temp'
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

  v_can_view_email:=public.service_professional_mailbox_role_eligible(v_role)
    and (not public.service_seller_professional_email_role(v_role) or public.service_seller_professional_email_enabled());
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

revoke all on function public.service_seller_professional_email_role(text) from public,anon,authenticated;
revoke all on function public.service_seller_professional_email_enabled() from public,anon,authenticated;
revoke all on function public.service_professional_mailbox_role_eligible(text) from public,anon,authenticated;
revoke all on function public.service_professional_mailbox_eligible(uuid) from public,anon,authenticated;
revoke all on function public.admin_get_seller_professional_email_control() from public,anon,authenticated;
revoke all on function public.admin_set_seller_professional_email_control(boolean) from public,anon,authenticated;

grant execute on function public.admin_get_seller_professional_email_control() to authenticated;
grant execute on function public.admin_set_seller_professional_email_control(boolean) to authenticated;

-- Reactivate every currently eligible seller through the existing idempotent
-- provisioning/lifecycle path. For the current preserved seller mailbox this
-- queues an enable of the existing Zoho account rather than creating a new one.
do $$
declare r record;
begin
  for r in
    select p.id
    from public.user_profiles p
    where lower(coalesce(p.status,''))='active'
      and lower(coalesce(p.onboarding_status,''))='completed'
      and public.service_seller_professional_email_role(p.role)
  loop
    perform public.queue_professional_mailbox_provisioning(r.id,'seller_email_reactivated_by_migration',null);
  end loop;
end;
$$;

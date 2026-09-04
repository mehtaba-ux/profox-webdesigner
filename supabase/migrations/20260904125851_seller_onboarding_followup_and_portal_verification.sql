-- Seller-owned client onboarding follow-up, canonical link handoff and tracked portal verification.

create table if not exists public.client_onboarding_private_links (
  onboarding_id uuid primary key references public.client_onboardings(id) on delete cascade,
  access_token text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_onboarding_private_links_token_length check (length(access_token) between 40 and 256)
);

alter table public.client_onboarding_private_links enable row level security;
revoke all on public.client_onboarding_private_links from public, anon, authenticated;
grant all on public.client_onboarding_private_links to service_role;

create index if not exists client_onboarding_private_links_expiry_idx
  on public.client_onboarding_private_links(expires_at);

insert into public.notification_templates(template_key,name,subject_template,body_template,active,description)
values
(
  'staff_client_onboarding_reminder',
  'Seller client onboarding reminder',
  'Client onboarding Day {{reminderDay}} follow-up - {{projectNumber}}',
  'Client onboarding for {{projectNumber}} is still {{onboardingStatus}} on Day {{reminderDay}}.\n\nOpen the connected Sales conversation and follow up with the customer:\n{{actionUrl}}\n\nThe reminder stops automatically when onboarding is completed.',
  true,
  'Day 1 through Day 7 reminder for the Sales owner while paid-project client onboarding remains incomplete.'
),
(
  'customer_client_portal_email_verification',
  'Client portal email verification',
  'Verify your ProFox Client Portal email',
  'Hi {{contactName}},\n\nYour ProFox Client Portal account is ready for email verification for {{projectNumber}}.\n\nVerify your email and continue:\n{{verificationUrl}}\n\nThis secure link is intended only for the email registered on your ProFox client relationship. If you did not request this, you can ignore this email.\n\nProFox',
  true,
  'Tracked Client Portal verification email delivered through the existing ProFox notification provider.'
)
on conflict (template_key) do update
set name=excluded.name,
    subject_template=excluded.subject_template,
    body_template=excluded.body_template,
    active=true,
    description=excluded.description,
    updated_at=now();

create or replace function public.service_client_onboarding_current_url(p_onboarding_id uuid)
returns text
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_token text;
  v_base text;
begin
  select l.access_token into v_token
  from public.client_onboarding_private_links l
  join public.client_onboardings o on o.id=l.onboarding_id
  where l.onboarding_id=p_onboarding_id
    and o.status<>'Completed'
    and l.token_hash=o.public_token_hash
    and l.expires_at>now();

  if v_token is null then return null; end if;

  select nullif(btrim(config_value->>'url'),'') into v_base
  from public.system_configuration where config_key='public_app_base_url';
  v_base:=rtrim(coalesce(v_base,'https://www.profoxwebdesigner.com'),'/');
  return v_base||'/client-onboarding/'||v_token;
end;
$function$;

revoke all on function public.service_client_onboarding_current_url(uuid) from public, anon, authenticated;
grant execute on function public.service_client_onboarding_current_url(uuid) to service_role;

create or replace function public.ensure_client_onboarding_for_project(p_project_id uuid, p_send_invite boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_project public.projects%rowtype;
  v_client public.clients%rowtype;
  v_quote public.quotations%rowtype;
  v_onboarding public.client_onboardings%rowtype;
  v_identity uuid;
  v_payment uuid;
  v_cfg jsonb;
  v_fields jsonb;
  v_token text;
  v_hash text;
  v_base text;
  v_url text;
  v_days integer;
  v_queued uuid;
  v_count integer;
begin
  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found.'; end if;
  if v_project.client_id is null or v_project.quotation_id is null then
    raise exception 'Paid project must be linked to a client and accepted quotation before onboarding.';
  end if;

  select * into v_client from public.clients where id=v_project.client_id;
  if not found then raise exception 'Project client not found.'; end if;

  select * into v_quote from public.quotations where id=v_project.quotation_id;
  if not found or v_quote.status<>'Accepted' then
    raise exception 'Accepted quotation is required before client onboarding.';
  end if;

  select p.id into v_payment
  from public.payments p
  where p.quotation_id=v_quote.id
    and p.payment_type in ('Advance','Full Payment')
    and p.status='Verified'
  order by coalesce(p.milestone_number,1),p.verified_at,p.created_at
  limit 1;
  if v_payment is null then raise exception 'Verified first payment is required before client onboarding.'; end if;

  v_identity:=coalesce(
    v_client.customer_identity_id,
    v_quote.customer_identity_id,
    public.customer_identity_resolve(v_client.email,v_client.primary_contact_name,v_client.phone)
  );
  if v_identity is null then raise exception 'Customer identity could not be resolved for onboarding.'; end if;

  v_cfg:=public.client_onboarding_config();
  v_fields:=public.client_onboarding_resolve_fields(v_quote.id);
  v_days:=greatest(1,least(90,coalesce((v_cfg->>'onboardingLinkExpiryDays')::integer,30)));

  select * into v_onboarding from public.client_onboardings where project_id=v_project.id for update;
  if not found then
    insert into public.client_onboardings(
      customer_identity_id,client_id,project_id,quotation_id,triggering_payment_id,status,form_version,field_schema
    )
    values(
      v_identity,v_client.id,v_project.id,v_quote.id,v_payment,'Pending',
      greatest(2,coalesce((v_cfg->>'version')::integer,2)),v_fields
    )
    returning * into v_onboarding;
  else
    update public.client_onboardings
    set customer_identity_id=v_identity,
        client_id=v_client.id,
        quotation_id=v_quote.id,
        triggering_payment_id=coalesce(triggering_payment_id,v_payment),
        form_version=case when status='Completed' then form_version else greatest(2,coalesce((v_cfg->>'version')::integer,2)) end,
        field_schema=case when status='Completed' then field_schema else v_fields end,
        updated_at=now()
    where id=v_onboarding.id
    returning * into v_onboarding;
  end if;

  if p_send_invite and v_onboarding.status<>'Completed' then
    v_token:=encode(extensions.gen_random_bytes(32),'hex');
    v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
    v_count:=least(v_onboarding.onboarding_invite_count+1,100);

    update public.client_onboardings
    set public_token_hash=v_hash,
        public_token_issued_at=now(),
        public_token_expires_at=now()+make_interval(days=>v_days),
        onboarding_invite_count=v_count,
        onboarding_invite_last_sent_at=now(),
        updated_at=now()
    where id=v_onboarding.id
    returning * into v_onboarding;

    insert into public.client_onboarding_private_links(
      onboarding_id,access_token,token_hash,expires_at,created_by,created_at,updated_at
    )
    values(
      v_onboarding.id,v_token,v_hash,v_onboarding.public_token_expires_at,auth.uid(),now(),now()
    )
    on conflict(onboarding_id) do update
    set access_token=excluded.access_token,
        token_hash=excluded.token_hash,
        expires_at=excluded.expires_at,
        created_by=coalesce(excluded.created_by,public.client_onboarding_private_links.created_by),
        updated_at=now();

    select nullif(btrim(config_value->>'url'),'') into v_base
    from public.system_configuration where config_key='public_app_base_url';
    v_base:=rtrim(coalesce(v_base,'https://www.profoxwebdesigner.com'),'/');
    v_url:=v_base||'/client-onboarding/'||v_token;

    v_queued:=public.service_queue_customer_communication(
      'customer-client-onboarding:'||v_onboarding.id::text||':'||v_count::text,
      'customer_client_onboarding_required',
      v_client.email,
      v_client.salesperson_id,
      v_client.primary_contact_name,
      v_client.company_name,
      jsonb_build_object(
        'onboardingId',v_onboarding.id,
        'projectId',v_project.id,
        'projectNumber',v_project.project_number,
        'projectName',v_project.project_name,
        'packageName',coalesce(v_project.package_snapshot,''),
        'onboardingUrl',v_url
      ),
      now()
    );
  end if;

  return jsonb_build_object(
    'onboardingId',v_onboarding.id,
    'projectId',v_project.id,
    'status',v_onboarding.status,
    'inviteQueued',v_queued is not null,
    'inviteCount',v_onboarding.onboarding_invite_count,
    'fieldCount',jsonb_array_length(v_fields)
  );
end;
$function$;

create or replace function public.crm_get_lead_onboarding_handoff(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_o public.client_onboardings%rowtype;
  v_project public.projects%rowtype;
  v_url text;
begin
  if not public.crm_can_access_lead(p_lead_id) then raise exception 'Lead access denied.'; end if;

  select o.* into v_o
  from public.crm_opportunities op
  join public.projects p on p.source_opportunity_id=op.id
  join public.client_onboardings o on o.project_id=p.id
  where op.lead_id=p_lead_id
  order by o.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('exists',false);
  end if;

  select * into v_project from public.projects where id=v_o.project_id;
  if v_o.status<>'Completed' then
    v_url:=public.service_client_onboarding_current_url(v_o.id);
  end if;

  return jsonb_build_object(
    'exists',true,
    'onboardingId',v_o.id,
    'projectId',v_o.project_id,
    'projectNumber',v_project.project_number,
    'projectName',v_project.project_name,
    'status',v_o.status,
    'inviteCount',v_o.onboarding_invite_count,
    'inviteLastSentAt',v_o.onboarding_invite_last_sent_at,
    'completedAt',v_o.completed_at,
    'onboardingUrl',v_url,
    'linkAvailable',v_url is not null,
    'canResend',v_o.status<>'Completed'
  );
end;
$function$;

revoke all on function public.crm_get_lead_onboarding_handoff(uuid) from public, anon;
grant execute on function public.crm_get_lead_onboarding_handoff(uuid) to authenticated, service_role;

create or replace function public.crm_resend_lead_onboarding(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_project_id uuid;
  v_result jsonb;
begin
  if not public.crm_can_access_lead(p_lead_id) then raise exception 'Lead access denied.'; end if;

  select p.id into v_project_id
  from public.crm_opportunities op
  join public.projects p on p.source_opportunity_id=op.id
  join public.client_onboardings o on o.project_id=p.id
  where op.lead_id=p_lead_id and o.status<>'Completed'
  order by o.created_at desc
  limit 1;

  if v_project_id is null then raise exception 'No incomplete client onboarding is available for this lead.'; end if;

  perform public.ensure_client_onboarding_for_project(v_project_id,true);
  v_result:=public.crm_get_lead_onboarding_handoff(p_lead_id);
  return v_result;
end;
$function$;

revoke all on function public.crm_resend_lead_onboarding(uuid) from public, anon;
grant execute on function public.crm_resend_lead_onboarding(uuid) to authenticated, service_role;

create or replace function public.queue_due_client_onboarding_seller_reminders()
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  r record;
  v_day integer;
  v_action text;
  v_count integer:=0;
begin
  for r in
    select
      o.id as onboarding_id,
      o.status as onboarding_status,
      o.created_at as onboarding_created_at,
      p.id as project_id,
      p.project_number,
      p.project_name,
      op.lead_id,
      coalesce(c.salesperson_id,q.salesperson_id,op.salesperson_id,l.salesperson_id) as owner_id
    from public.client_onboardings o
    join public.projects p on p.id=o.project_id
    join public.clients c on c.id=o.client_id
    left join public.quotations q on q.id=o.quotation_id
    left join public.crm_opportunities op on op.id=p.source_opportunity_id
    left join public.crm_leads l on l.id=op.lead_id
    where o.status in ('Pending','In Progress')
      and now()>=o.created_at+interval '1 day'
      and now()<o.created_at+interval '8 days'
  loop
    if r.owner_id is null then continue; end if;
    v_day:=floor(extract(epoch from (now()-r.onboarding_created_at))/86400)::integer;
    if v_day<1 or v_day>7 then continue; end if;

    v_action:=case
      when r.lead_id is not null then '/admin/app/crm?tab=inbox&lead='||r.lead_id::text
      else '/admin/app/crm?tab=leads'
    end;

    perform public.service_queue_staff_operational_notification(
      r.owner_id,
      'client-onboarding-seller-reminder:'||r.onboarding_id::text||':day:'||v_day::text,
      'staff_client_onboarding_reminder',
      case when v_day>=5 then 'Warning' else 'Reminder' end,
      'Client onboarding follow-up: Day '||v_day::text,
      coalesce(r.project_number,'Client project')||' onboarding is still '||r.onboarding_status||'. Follow up in the existing Sales conversation.',
      v_action,
      jsonb_build_object(
        'notificationCategory','Action Required',
        'notificationModule','Sales',
        'notificationPriority',case when v_day>=5 then 'High' else 'Normal' end,
        'onboardingId',r.onboarding_id,
        'projectId',r.project_id,
        'projectNumber',coalesce(r.project_number,''),
        'projectName',coalesce(r.project_name,''),
        'onboardingStatus',r.onboarding_status,
        'reminderDay',v_day,
        'leadId',r.lead_id,
        'actionUrl',v_action
      ),
      now()
    );
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('queuedOrDeduped',v_count);
end;
$function$;

revoke all on function public.queue_due_client_onboarding_seller_reminders() from public, anon, authenticated;
grant execute on function public.queue_due_client_onboarding_seller_reminders() to service_role;

create or replace function public.queue_due_sales_automations()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_sales jsonb:='{}'::jsonb;
  v_operational jsonb:='{}'::jsonb;
  v_quote_customer jsonb:='{}'::jsonb;
  v_payment_customer jsonb:='{}'::jsonb;
  v_project_customer jsonb:='{}'::jsonb;
  v_recruitment jsonb:='{}'::jsonb;
  v_academy jsonb:='{}'::jsonb;
  v_meetings jsonb:='{}'::jsonb;
  v_onboarding jsonb:='{}'::jsonb;
begin
  v_sales:=coalesce(public.queue_due_sales_automations_base(),'{}'::jsonb);
  v_operational:=coalesce(public.queue_due_operational_notifications(),'{}'::jsonb);
  v_quote_customer:=coalesce(public.queue_due_quotation_customer_communications(),'{}'::jsonb);
  v_payment_customer:=coalesce(public.queue_due_payment_customer_communications(),'{}'::jsonb);
  v_project_customer:=coalesce(public.queue_due_project_customer_communications(),'{}'::jsonb);
  v_recruitment:=coalesce(public.queue_due_recruitment_stage_sla(),'{}'::jsonb);
  v_academy:=coalesce(public.queue_due_sales_academy_deadline_notifications(),'{}'::jsonb);
  v_meetings:=coalesce(public.queue_due_meeting_communications(),'{}'::jsonb);
  v_onboarding:=coalesce(public.queue_due_client_onboarding_seller_reminders(),'{}'::jsonb);

  return v_sales
    ||jsonb_build_object('module10Operational',v_operational)
    ||jsonb_build_object('module11Customer',v_quote_customer||v_payment_customer||v_project_customer)
    ||jsonb_build_object('recruitmentOperational',v_recruitment)
    ||jsonb_build_object('salesAcademyDeadline',v_academy)
    ||jsonb_build_object('meetingCommunications',v_meetings)
    ||jsonb_build_object('clientOnboardingSellerReminders',v_onboarding);
end;
$function$;

create or replace function public.service_client_portal_verification_context(p_token text)
returns jsonb
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $function$
declare
  v_hash text;
  v_o public.client_onboardings%rowtype;
  v_identity public.customer_identities%rowtype;
  v_client public.clients%rowtype;
  v_project public.projects%rowtype;
  v_linked boolean:=false;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then
    raise exception 'Portal activation link is invalid.';
  end if;

  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_o
  from public.client_onboardings
  where portal_activation_token_hash=v_hash;

  if not found or v_o.status<>'Completed' then
    raise exception 'Portal activation link is invalid or onboarding is not complete.';
  end if;

  select * into v_identity from public.customer_identities where id=v_o.customer_identity_id;
  select * into v_client from public.clients where id=v_o.client_id;
  select * into v_project from public.projects where id=v_o.project_id;

  v_linked:=v_identity.linked_user_id is not null
    and exists(
      select 1 from public.user_profiles u
      where u.id=v_identity.linked_user_id and u.role='customer' and u.status='active'
    );

  if not v_linked and (v_o.portal_activation_expires_at is null or v_o.portal_activation_expires_at<now()) then
    raise exception 'This portal activation link has expired. Please ask ProFox to resend it.';
  end if;

  return jsonb_build_object(
    'onboardingId',v_o.id,
    'email',v_identity.email,
    'contactName',v_client.primary_contact_name,
    'companyName',v_client.company_name,
    'projectNumber',v_project.project_number,
    'projectName',v_project.project_name,
    'alreadyLinked',v_linked
  );
end;
$function$;

revoke all on function public.service_client_portal_verification_context(text) from public, anon, authenticated;
grant execute on function public.service_client_portal_verification_context(text) to service_role;

create or replace function public.service_queue_client_portal_verification(
  p_token text,
  p_user_id uuid,
  p_verification_url text
)
returns jsonb
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $function$
declare
  v_context jsonb;
  v_onboarding_id uuid;
  v_email text;
  v_user_email text;
  v_role text;
  v_attempt integer;
  v_last timestamptz;
  v_notification_id uuid;
begin
  v_context:=public.service_client_portal_verification_context(p_token);
  if coalesce((v_context->>'alreadyLinked')::boolean,false) then
    raise exception 'This customer already has an active Client Portal.';
  end if;

  v_onboarding_id:=(v_context->>'onboardingId')::uuid;
  v_email:=lower(btrim(v_context->>'email'));

  select lower(btrim(a.email)),p.role
  into v_user_email,v_role
  from auth.users a
  join public.user_profiles p on p.id=a.id
  where a.id=p_user_id;

  if not found or v_user_email<>v_email then
    raise exception 'Portal account email does not match the completed onboarding relationship.';
  end if;
  if v_role not in ('pending','customer') then
    raise exception 'Staff accounts cannot be linked to customer portal history.';
  end if;

  if p_verification_url is null
     or length(p_verification_url)>5000
     or p_verification_url not like 'https://calabtayklhltyiriiwo.supabase.co/auth/v1/verify%' then
    raise exception 'Generated verification URL is invalid.';
  end if;

  select count(*)::integer,max(created_at)
  into v_attempt,v_last
  from public.notification_outbox
  where template_key='customer_client_portal_email_verification'
    and payload->>'onboardingId'=v_onboarding_id::text;

  if v_last is not null and v_last>now()-interval '120 seconds' then
    raise exception 'A verification email was queued recently. Please wait before resending.';
  end if;
  if v_attempt>=20 then
    raise exception 'Client Portal verification email limit reached. Please contact ProFox support.';
  end if;
  v_attempt:=v_attempt+1;

  v_notification_id:=public.service_queue_customer_communication(
    'customer-client-portal-email-verification:'||v_onboarding_id::text||':'||v_attempt::text,
    'customer_client_portal_email_verification',
    v_email,
    null,
    coalesce(v_context->>'contactName',''),
    coalesce(v_context->>'companyName',''),
    jsonb_build_object(
      'onboardingId',v_onboarding_id,
      'projectNumber',coalesce(v_context->>'projectNumber',''),
      'projectName',coalesce(v_context->>'projectName',''),
      'verificationUrl',p_verification_url
    ),
    now()
  );

  if v_notification_id is null then
    raise exception 'Client Portal verification email could not be queued.';
  end if;

  return jsonb_build_object(
    'queued',true,
    'notificationId',v_notification_id,
    'attempt',v_attempt
  );
end;
$function$;

revoke all on function public.service_queue_client_portal_verification(text,uuid,text) from public, anon, authenticated;
grant execute on function public.service_queue_client_portal_verification(text,uuid,text) to service_role;

create or replace function public.service_cancel_client_onboarding_seller_reminders(p_onboarding_id uuid)
returns integer
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_count integer:=0;
  v_outbox integer:=0;
begin
  update public.notification_outbox
  set status='Cancelled',
      updated_at=now(),
      last_error=case when coalesce(last_error,'')='' then 'Client onboarding completed before reminder delivery.' else last_error end
  where template_key='staff_client_onboarding_reminder'
    and status in ('Pending','Retry')
    and payload->>'onboardingId'=p_onboarding_id::text;
  get diagnostics v_outbox=row_count;

  update public.in_app_notifications
  set read_at=coalesce(read_at,now())
  where read_at is null
    and metadata->>'onboardingId'=p_onboarding_id::text;

  v_count:=v_outbox;
  return v_count;
end;
$function$;

revoke all on function public.service_cancel_client_onboarding_seller_reminders(uuid) from public, anon, authenticated;
grant execute on function public.service_cancel_client_onboarding_seller_reminders(uuid) to service_role;

create or replace function public.client_onboarding_completion_cleanup()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
begin
  if new.status='Completed' and old.status is distinct from 'Completed' then
    perform public.service_cancel_client_onboarding_seller_reminders(new.id);
  end if;
  return new;
end;
$function$;

revoke all on function public.client_onboarding_completion_cleanup() from public, anon, authenticated;
grant execute on function public.client_onboarding_completion_cleanup() to service_role;

drop trigger if exists client_onboarding_completion_cleanup_trigger on public.client_onboardings;
create trigger client_onboarding_completion_cleanup_trigger
after update of status on public.client_onboardings
for each row
when (new.status='Completed' and old.status is distinct from new.status)
execute function public.client_onboarding_completion_cleanup();
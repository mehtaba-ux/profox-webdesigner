-- Complete and reconcile the website quote-enquiry response workflow.
-- This intentionally reuses crm_leads, crm_activities, crm_lead_events,
-- notification_templates/outbox, the existing assignment RPCs, and quotations.

alter table public.crm_leads
  add column if not exists accepted_at timestamptz,
  add column if not exists first_response_due_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists first_response_sla_minutes integer;

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_leads'::regclass
      and conname='crm_leads_first_response_sla_minutes_check'
  ) then
    alter table public.crm_leads add constraint crm_leads_first_response_sla_minutes_check
      check(first_response_sla_minutes is null or first_response_sla_minutes between 5 and 1440);
  end if;
end;
$block$;

create index if not exists idx_crm_leads_quote_response_due
  on public.crm_leads(first_response_due_at)
  where source='Website Contact Form'
    and salesperson_id is not null
    and first_response_at is null
    and archived_at is null;

update public.system_configuration
set config_value = coalesce(config_value,'{}'::jsonb) || jsonb_build_object(
  'firstResponseSlaMinutes',
    case when coalesce(config_value->>'firstResponseSlaMinutes','') ~ '^[0-9]+$'
      then greatest(5,least(1440,(config_value->>'firstResponseSlaMinutes')::integer)) else 30 end,
  'notifyManagersOnNewLead',
    case when jsonb_typeof(config_value->'notifyManagersOnNewLead')='boolean'
      then (config_value->>'notifyManagersOnNewLead')::boolean else true end,
  'notifyAssigneeOnAssignment',
    case when jsonb_typeof(config_value->'notifyAssigneeOnAssignment')='boolean'
      then (config_value->>'notifyAssigneeOnAssignment')::boolean else true end,
  'escalateOverdueToManagers',
    case when jsonb_typeof(config_value->'escalateOverdueToManagers')='boolean'
      then (config_value->>'escalateOverdueToManagers')::boolean else true end
), updated_at=now()
where config_key='crm_lead_assignment';

insert into public.notification_templates(
  template_key,name,subject_template,body_template,html_template,active,description,updated_at
) values
('crm_new_quote_request','New website project enquiry','New project enquiry: {{leadName}}',
 'A new website project enquiry needs review.\n\nLead: {{leadName}}\nCompany: {{companyName}}\nService: {{serviceInterest}}\nQuality: {{leadQuality}} ({{leadScore}})\nBudget: {{budgetRange}}\nTimeline: {{timeline}}\n\nOpen the CRM immediately to review and assign the enquiry.',
 '<p>A new website project enquiry needs review.</p><p><strong>Lead:</strong> {{leadName}}<br><strong>Company:</strong> {{companyName}}<br><strong>Service:</strong> {{serviceInterest}}<br><strong>Quality:</strong> {{leadQuality}} ({{leadScore}})<br><strong>Budget:</strong> {{budgetRange}}<br><strong>Timeline:</strong> {{timeline}}</p><p><a href="{{actionUrl}}">Open CRM enquiry</a></p>',
 true,'Immediate Admin/Manager alert for a Website Contact Form enquiry.',now()),
('crm_lead_assigned','Website enquiry assigned to salesperson','New enquiry assigned: {{leadName}}',
 'A website project enquiry has been assigned to you.\n\nLead: {{leadName}}\nCompany: {{companyName}}\nService: {{serviceInterest}}\nQuality: {{leadQuality}} ({{leadScore}})\n\nPlease accept it and make the first customer response within {{slaMinutes}} minutes.',
 '<p>A website project enquiry has been assigned to you.</p><p><strong>Lead:</strong> {{leadName}}<br><strong>Company:</strong> {{companyName}}<br><strong>Service:</strong> {{serviceInterest}}<br><strong>Quality:</strong> {{leadQuality}} ({{leadScore}})</p><p>Please accept it and make the first customer response within <strong>{{slaMinutes}} minutes</strong>.</p><p><a href="{{actionUrl}}">Open assigned enquiry</a></p>',
 true,'Immediate salesperson alert after Website Contact Form lead assignment or reassignment.',now()),
('crm_lead_sla_overdue','Website enquiry first-response SLA overdue','Response overdue: {{leadName}}',
 'The first-response SLA for a website project enquiry is overdue.\n\nLead: {{leadName}}\nCompany: {{companyName}}\nAssigned salesperson: {{salespersonName}}\nResponse target: {{slaMinutes}} minutes\n\nOpen the CRM and respond now.',
 '<p>The first-response SLA for a website project enquiry is <strong>overdue</strong>.</p><p><strong>Lead:</strong> {{leadName}}<br><strong>Company:</strong> {{companyName}}<br><strong>Assigned salesperson:</strong> {{salespersonName}}<br><strong>Response target:</strong> {{slaMinutes}} minutes</p><p><a href="{{actionUrl}}">Open overdue enquiry</a></p>',
 true,'Seller alert and Admin/Manager escalation when first response is overdue.',now())
on conflict(template_key) do update set
  name=excluded.name,subject_template=excluded.subject_template,body_template=excluded.body_template,
  html_template=excluded.html_template,active=true,description=excluded.description,updated_at=now();

create or replace function public.crm_quote_response_settings()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_config jsonb:='{}'::jsonb; v_sla integer:=30;
begin
  select coalesce(config_value,'{}'::jsonb) into v_config
  from public.system_configuration where config_key='crm_lead_assignment';
  if coalesce(v_config->>'firstResponseSlaMinutes','') ~ '^[0-9]+$' then
    v_sla:=greatest(5,least(1440,(v_config->>'firstResponseSlaMinutes')::integer));
  end if;
  return jsonb_build_object(
    'firstResponseSlaMinutes',v_sla,
    'notifyManagersOnNewLead',case when jsonb_typeof(v_config->'notifyManagersOnNewLead')='boolean' then (v_config->>'notifyManagersOnNewLead')::boolean else true end,
    'notifyAssigneeOnAssignment',case when jsonb_typeof(v_config->'notifyAssigneeOnAssignment')='boolean' then (v_config->>'notifyAssigneeOnAssignment')::boolean else true end,
    'escalateOverdueToManagers',case when jsonb_typeof(v_config->'escalateOverdueToManagers')='boolean' then (v_config->>'escalateOverdueToManagers')::boolean else true end,
    'managerUserIds',case when jsonb_typeof(v_config->'managerUserIds')='array' then v_config->'managerUserIds' else '[]'::jsonb end
  );
end;
$function$;

create or replace function public.crm_quote_lead_notification_payload(p_lead_id uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $function$
  select jsonb_build_object(
    'leadId',l.id,'leadName',coalesce(nullif(trim(l.contact_name),''),'Website enquiry'),
    'companyName',coalesce(nullif(trim(l.company_name),''),'Not provided'),
    'serviceInterest',coalesce(nullif(trim(l.service_interest),''),'Not specified'),
    'leadQuality',coalesce(nullif(trim(l.lead_quality),''),'Unscored'),'leadScore',coalesce(l.lead_score,0),
    'budgetRange',coalesce(nullif(trim(l.budget_range),''),'Not specified'),
    'timeline',coalesce(nullif(trim(l.project_timeline),''),'Not specified'),
    'actionUrl','/admin/app/crm?tab=crm_leads','notificationCategory','Sales',
    'notificationModule','CRM','notificationPriority','High'
  ) from public.crm_leads l where l.id=p_lead_id;
$function$;

create or replace function public.crm_queue_quote_management_notification(p_lead_id uuid,p_event_key text default '')
returns void language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_lead public.crm_leads%rowtype; v_settings jsonb; v_payload jsonb; v_manager record; v_prefix text;
begin
  select * into v_lead from public.crm_leads where id=p_lead_id;
  if not found or v_lead.source<>'Website Contact Form' then return; end if;
  v_settings:=public.crm_quote_response_settings();
  if coalesce((v_settings->>'notifyManagersOnNewLead')::boolean,true) is not true then return; end if;
  v_payload:=public.crm_quote_lead_notification_payload(v_lead.id);
  v_prefix:='crm-new-quote:'||v_lead.id::text||':'||coalesce(nullif(trim(p_event_key),''),'initial');
  perform public.service_queue_active_admins_operational_notification(
    v_prefix,'crm_new_quote_request','Lead Alert','New website project enquiry',
    coalesce(nullif(trim(v_lead.contact_name),''),'A visitor')||' submitted a project enquiry. Review and assign it now.',
    '/admin/app/crm?tab=crm_leads',v_payload,now());
  for v_manager in
    select distinct u.id from jsonb_array_elements_text(coalesce(v_settings->'managerUserIds','[]'::jsonb)) manager_id(value)
    join public.user_profiles u on u.id::text=manager_id.value
    where u.status='active' and u.role in ('sales','sales_rep','sales_team')
  loop
    perform public.service_queue_staff_operational_notification(
      v_manager.id,v_prefix||':manager:'||v_manager.id::text,'crm_new_quote_request','Lead Alert',
      'New website project enquiry',coalesce(nullif(trim(v_lead.contact_name),''),'A visitor')||' submitted a project enquiry. Review and assign it now.',
      '/admin/app/crm?tab=crm_leads',v_payload,now());
  end loop;
end;
$function$;

create or replace function public.crm_queue_quote_assignment_notification(p_lead_id uuid,p_event_key text default '')
returns void language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_lead public.crm_leads%rowtype; v_settings jsonb; v_payload jsonb; v_key text;
begin
  select * into v_lead from public.crm_leads where id=p_lead_id;
  if not found or v_lead.source<>'Website Contact Form' or v_lead.salesperson_id is null then return; end if;
  v_settings:=public.crm_quote_response_settings();
  if coalesce((v_settings->>'notifyAssigneeOnAssignment')::boolean,true) is not true then return; end if;
  v_payload:=public.crm_quote_lead_notification_payload(v_lead.id)||jsonb_build_object(
    'slaMinutes',coalesce(v_lead.first_response_sla_minutes,(v_settings->>'firstResponseSlaMinutes')::integer));
  v_key:='crm-quote-assigned:'||v_lead.id::text||':'||v_lead.salesperson_id::text||':'||
    coalesce(nullif(trim(p_event_key),''),coalesce(v_lead.assigned_at::text,now()::text));
  perform public.service_queue_staff_operational_notification(
    v_lead.salesperson_id,v_key,'crm_lead_assigned','Lead Assigned','New project enquiry assigned',
    coalesce(nullif(trim(v_lead.contact_name),''),'A website enquiry')||' has been assigned to you. Accept it and respond within the SLA.',
    '/admin/app/crm?tab=crm_leads',v_payload,now());
end;
$function$;

create or replace function public.crm_prepare_quote_response_sla()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_settings jsonb; v_sla integer;
begin
  if new.source<>'Website Contact Form' then return new; end if;
  if tg_op='INSERT' or new.salesperson_id is distinct from old.salesperson_id then
    if new.salesperson_id is null then
      if new.first_response_at is null then
        new.accepted_at:=null; new.first_response_due_at:=null; new.first_response_sla_minutes:=null;
      end if;
    elsif new.first_response_at is null then
      v_settings:=public.crm_quote_response_settings();
      v_sla:=(v_settings->>'firstResponseSlaMinutes')::integer;
      new.assigned_at:=now(); new.accepted_at:=null;
      new.first_response_sla_minutes:=v_sla;
      new.first_response_due_at:=new.assigned_at+make_interval(mins=>v_sla);
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_crm_prepare_quote_response_sla on public.crm_leads;
create trigger trg_crm_prepare_quote_response_sla
before insert or update on public.crm_leads
for each row execute function public.crm_prepare_quote_response_sla();

create or replace function public.crm_after_quote_lead_insert()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
begin
  if new.source='Website Contact Form' then
    perform public.crm_queue_quote_management_notification(new.id,'created:'||new.id::text);
    if new.salesperson_id is not null then
      perform public.crm_queue_quote_assignment_notification(new.id,'created:'||new.id::text);
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_crm_after_quote_lead_insert on public.crm_leads;
create trigger trg_crm_after_quote_lead_insert after insert on public.crm_leads
for each row execute function public.crm_after_quote_lead_insert();

create or replace function public.crm_after_quote_lead_assignment()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
begin
  if new.source='Website Contact Form' and new.salesperson_id is not null
     and new.salesperson_id is distinct from old.salesperson_id then
    perform public.crm_queue_quote_assignment_notification(new.id,'changed:'||coalesce(new.assigned_at::text,now()::text));
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_crm_after_quote_lead_assignment on public.crm_leads;
create trigger trg_crm_after_quote_lead_assignment after update of salesperson_id on public.crm_leads
for each row execute function public.crm_after_quote_lead_assignment();

-- Keep exactly one automatic first-response activity in the existing CRM activity queue.
create unique index if not exists idx_crm_activities_quote_first_response
  on public.crm_activities(lead_id,automation_source)
  where automation_source='quote_first_response_sla';

create or replace function public.crm_refresh_lead_next_follow_up(p_lead_id uuid)
returns void language sql security definer set search_path=public,pg_temp as $function$
  update public.crm_leads l set next_follow_up_at=(
    select min(a.due_at) from public.crm_activities a
    where a.lead_id=p_lead_id and a.status='Scheduled'
  ),updated_at=now() where l.id=p_lead_id;
$function$;

create or replace function public.crm_sync_quote_response_follow_up()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
begin
  if new.source<>'Website Contact Form' then return new; end if;
  if new.salesperson_id is not null and new.first_response_at is null and new.first_response_due_at is not null then
    insert into public.crm_activities(
      lead_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by,automation_source
    ) values(
      new.id,new.salesperson_id,'Follow-Up','Respond to new website enquiry',new.first_response_due_at,
      'Scheduled',coalesce(nullif(new.initial_outreach_channel,''),'Email'),
      'System-created first-response task. Complete it by recording the first customer-facing response.',
      new.assigned_by,'quote_first_response_sla'
    ) on conflict(lead_id,automation_source) where automation_source='quote_first_response_sla'
      do update set assigned_to=excluded.assigned_to,due_at=excluded.due_at,status='Scheduled',completed_at=null,
        outcome=null,notes=excluded.notes,updated_at=now();
  elsif new.first_response_at is not null then
    update public.crm_activities set status='Completed',completed_at=coalesce(completed_at,new.first_response_at),
      outcome=coalesce(nullif(outcome,''),'First customer-facing response recorded'),updated_at=now()
    where lead_id=new.id and automation_source='quote_first_response_sla' and status='Scheduled';
  else
    update public.crm_activities set status='Cancelled',cancellation_reason='Lead assignment removed',updated_at=now()
    where lead_id=new.id and automation_source='quote_first_response_sla' and status='Scheduled';
  end if;
  perform public.crm_refresh_lead_next_follow_up(new.id);
  return new;
end;
$function$;

drop trigger if exists trg_crm_sync_quote_response_follow_up on public.crm_leads;
create trigger trg_crm_sync_quote_response_follow_up
after insert or update of salesperson_id,first_response_due_at,first_response_at on public.crm_leads
for each row execute function public.crm_sync_quote_response_follow_up();

create or replace function public.crm_audit_quote_first_response()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
begin
  if new.source='Website Contact Form' and old.first_response_at is null and new.first_response_at is not null then
    perform public.crm_write_lead_event(new.id,'first_response','First customer response recorded',
      'The website enquiry received its first customer-facing response.',
      jsonb_build_object('firstResponseAt',new.first_response_at,'firstResponseDueAt',new.first_response_due_at,
        'metSla',case when new.first_response_due_at is null then null else new.first_response_at<=new.first_response_due_at end),
      new.salesperson_id,null,null,new.first_response_at,'quote-first-response:'||new.id::text);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_crm_audit_quote_first_response on public.crm_leads;
create trigger trg_crm_audit_quote_first_response after update of first_response_at on public.crm_leads
for each row execute function public.crm_audit_quote_first_response();

create or replace function public.crm_accept_assigned_lead(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_lead public.crm_leads%rowtype; v_uid uuid:=(select auth.uid()); v_accepted timestamptz;
begin
  if not public.has_active_role(array['admin','sales']) then raise exception 'Active CRM access is required.'; end if;
  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if not found or v_lead.archived_at is not null then raise exception 'Lead not found.'; end if;
  if v_lead.salesperson_id is null then raise exception 'Assign the lead before accepting it.'; end if;
  if not public.is_admin() and v_lead.salesperson_id is distinct from v_uid then
    raise exception 'You may only accept a lead assigned to you.';
  end if;
  if v_lead.accepted_at is null then
    v_accepted:=now();
    update public.crm_leads set accepted_at=v_accepted,updated_at=now() where id=p_lead_id;
    perform public.crm_write_lead_event(p_lead_id,'lead_accepted','Assigned lead accepted',
      'The assigned owner accepted responsibility for this lead.',
      jsonb_build_object('acceptedAt',v_accepted,'firstResponseDueAt',v_lead.first_response_due_at),
      v_uid,null,null,v_accepted,'lead-accepted:'||p_lead_id::text||':'||v_lead.salesperson_id::text);
  else v_accepted:=v_lead.accepted_at;
  end if;
  return jsonb_build_object('success',true,'leadId',p_lead_id,'acceptedAt',v_accepted,
    'firstResponseDueAt',v_lead.first_response_due_at);
end;
$function$;

create or replace function public.crm_record_lead_first_response(p_lead_id uuid,p_channel text default 'Other')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_lead public.crm_leads%rowtype; v_uid uuid:=(select auth.uid()); v_at timestamptz:=now(); v_channel text:=left(btrim(coalesce(p_channel,'Other')),80);
begin
  if not public.has_active_role(array['admin','sales']) then raise exception 'Active CRM access is required.'; end if;
  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if not found or v_lead.archived_at is not null then raise exception 'Lead not found.'; end if;
  if v_lead.salesperson_id is null then raise exception 'Assign the lead before recording a response.'; end if;
  if not public.is_admin() and v_lead.salesperson_id is distinct from v_uid then
    raise exception 'You may only record a response for a lead assigned to you.';
  end if;
  update public.crm_leads set accepted_at=coalesce(accepted_at,v_at),first_response_at=coalesce(first_response_at,v_at),
    last_contact_at=v_at,status=case when status in ('New','Researching') then 'Contacted' else status end,updated_at=now()
  where id=p_lead_id;
  return jsonb_build_object('success',true,'leadId',p_lead_id,'firstResponseAt',coalesce(v_lead.first_response_at,v_at),
    'channel',coalesce(nullif(v_channel,''),'Other'));
end;
$function$;

-- Chat replies are verified outbound messages, so they can satisfy first response.
-- Customer messages and internal notes never satisfy the salesperson SLA.
create or replace function public.crm_audit_sales_chat_message()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_lead uuid;
begin
  select crm_lead_id into v_lead from public.sales_chat_conversations where id=new.conversation_id;
  if v_lead is null then return new; end if;
  perform public.crm_write_lead_event(v_lead,'chat_message',
    case when new.is_internal_note then 'Internal chat note added' when new.sender_type='customer' then 'Customer sent a chat message' else 'Salesperson replied in chat' end,
    left(new.message_text,500),
    jsonb_build_object('conversationId',new.conversation_id,'messageId',new.id,'senderType',new.sender_type,'internalNote',new.is_internal_note),
    new.sender_id,new.sender_name,case when new.sender_type='customer' then 'customer' else null end,new.created_at,
    'chat-message:'||new.id::text);
  if new.sender_type='sales_rep' and not coalesce(new.is_internal_note,false) then
    update public.crm_leads set accepted_at=coalesce(accepted_at,new.created_at),
      first_response_at=coalesce(first_response_at,new.created_at),last_contact_at=new.created_at,
      status=case when status in ('New','Researching') then 'Contacted' else status end,updated_at=now()
    where id=v_lead and salesperson_id=new.sender_id;
  end if;
  return new;
end;
$function$;

-- Opening an external mail client is not proof that an email was sent.
create or replace function public.crm_log_lead_email_opened(p_lead_id uuid,p_subject text,p_body text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_lead public.crm_leads%rowtype; v_activity public.crm_activities%rowtype; v_subject text:=btrim(coalesce(p_subject,'')); v_body text:=btrim(coalesce(p_body,''));
begin
  if not public.crm_can_access_lead(p_lead_id) then raise exception 'Lead access denied.'; end if;
  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if coalesce(nullif(btrim(v_lead.email),''),'')='' then raise exception 'This lead does not have an email address.'; end if;
  if char_length(v_subject) not between 2 and 180 then raise exception 'Email subject must be between 2 and 180 characters.'; end if;
  if char_length(v_body) not between 2 and 4000 then raise exception 'Email message must be between 2 and 4000 characters.'; end if;
  insert into public.crm_activities(lead_id,assigned_to,activity_type,subject,due_at,completed_at,status,channel,notes,created_by)
  values(p_lead_id,v_lead.salesperson_id,'Cold Email',v_subject,now(),now(),'Completed','Email',
    'Prepared in ProFox CRM and opened in the user email application. Delivery is not claimed. Message: '||v_body,(select auth.uid()))
  returning * into v_activity;
  return jsonb_build_object('success',true,'activityId',v_activity.id,'recipient',lower(btrim(v_lead.email)),'deliveryRecorded',false);
end;
$function$;

create or replace function public.crm_queue_due_lead_response_slas(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_settings jsonb; v_lead record; v_manager record; v_payload jsonb; v_key text; v_count integer:=0; v_limit integer:=greatest(1,least(coalesce(p_limit,100),500));
begin
  v_settings:=public.crm_quote_response_settings();
  for v_lead in
    select l.*,coalesce(nullif(trim(u.full_name),''),'Assigned salesperson') salesperson_name
    from public.crm_leads l join public.user_profiles u on u.id=l.salesperson_id
    where l.source='Website Contact Form' and l.salesperson_id is not null and l.first_response_at is null
      and l.first_response_due_at is not null and l.first_response_due_at<=now() and l.archived_at is null
      and l.converted_opportunity_id is null and lower(coalesce(l.status,'')) not in ('lost','converted')
    order by l.first_response_due_at for update of l skip locked limit v_limit
  loop
    v_payload:=public.crm_quote_lead_notification_payload(v_lead.id)||jsonb_build_object(
      'slaMinutes',coalesce(v_lead.first_response_sla_minutes,(v_settings->>'firstResponseSlaMinutes')::integer),
      'salespersonName',v_lead.salesperson_name,'firstResponseDueAt',v_lead.first_response_due_at);
    v_key:='crm-quote-sla-overdue:'||v_lead.id::text||':'||extract(epoch from v_lead.first_response_due_at)::bigint::text;
    perform public.service_queue_staff_operational_notification(v_lead.salesperson_id,v_key||':seller','crm_lead_sla_overdue',
      'Lead SLA Overdue','First response overdue',coalesce(nullif(trim(v_lead.contact_name),''),'A website enquiry')||' is overdue for first response. Please act now.',
      '/admin/app/crm?tab=crm_leads',v_payload,now());
    if coalesce((v_settings->>'escalateOverdueToManagers')::boolean,true) then
      perform public.service_queue_active_admins_operational_notification(v_key||':admin','crm_lead_sla_overdue','Lead SLA Overdue',
        'Website enquiry response overdue',coalesce(nullif(trim(v_lead.contact_name),''),'A website enquiry')||' has missed the first-response SLA.',
        '/admin/app/crm?tab=crm_leads',v_payload,now());
      for v_manager in
        select distinct u.id from jsonb_array_elements_text(coalesce(v_settings->'managerUserIds','[]'::jsonb)) manager_id(value)
        join public.user_profiles u on u.id::text=manager_id.value
        where u.status='active' and u.role in ('sales','sales_rep','sales_team')
      loop
        perform public.service_queue_staff_operational_notification(v_manager.id,v_key||':manager:'||v_manager.id::text,
          'crm_lead_sla_overdue','Lead SLA Overdue','Website enquiry response overdue',
          coalesce(nullif(trim(v_lead.contact_name),''),'A website enquiry')||' has missed the first-response SLA.',
          '/admin/app/crm?tab=crm_leads',v_payload,now());
      end loop;
    end if;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$function$;

-- A salesperson may convert only a lead that has deliberately been qualified.
-- Website enquiries must also have been accepted and genuinely responded to.
create or replace function public.convert_lead_to_opportunity(p_lead_id uuid,p_name text default null,p_expected_value numeric default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_lead public.crm_leads%rowtype; v_existing uuid; v_new uuid;
begin
  if not public.has_active_role(array['admin','sales']) then raise exception 'Unauthorized.'; end if;
  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if not found then raise exception 'Lead not found.'; end if;
  if not public.is_admin() and v_lead.salesperson_id is distinct from (select auth.uid()) then raise exception 'You may only convert your own lead.'; end if;
  select id into v_existing from public.crm_opportunities where lead_id=p_lead_id limit 1;
  if v_existing is not null then return v_existing; end if;
  if v_lead.status<>'Qualified' then raise exception 'Mark the lead Qualified before converting it to an opportunity.'; end if;
  if v_lead.source='Website Contact Form' and (v_lead.accepted_at is null or v_lead.first_response_at is null) then
    raise exception 'Accept the website enquiry and record the first customer response before conversion.';
  end if;
  insert into public.crm_opportunities(lead_id,name,company_name,contact_name,email,phone,website,country,industry,source,self_generated,salesperson_id,service_interest,expected_value,currency,stage,status,created_by)
  values(p_lead_id,coalesce(nullif(trim(p_name),''),v_lead.title),v_lead.company_name,v_lead.contact_name,v_lead.email,v_lead.phone,
    v_lead.website,v_lead.country,v_lead.industry,v_lead.source,v_lead.self_generated,v_lead.salesperson_id,v_lead.service_interest,
    coalesce(p_expected_value,v_lead.estimated_value),v_lead.currency,'Qualified','Open',(select auth.uid())) returning id into v_new;
  update public.crm_leads set converted_opportunity_id=v_new,updated_at=now() where id=p_lead_id;
  return v_new;
end;
$function$;

create or replace function public.crm_enforce_quotation_qualification()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_opp public.crm_opportunities%rowtype; v_lead public.crm_leads%rowtype;
begin
  if public.is_admin() then return new; end if;
  if new.opportunity_id is null then raise exception 'A qualified CRM opportunity is required before a salesperson can create a quotation.'; end if;
  select * into v_opp from public.crm_opportunities where id=new.opportunity_id;
  if not found or v_opp.status<>'Open' or v_opp.stage not in ('Qualified','Meeting Scheduled','Requirements Confirmed','Quotation Sent','Negotiation / Decision Pending','Awaiting Advance Payment') then
    raise exception 'The quotation must belong to an open qualified opportunity.';
  end if;
  if v_opp.salesperson_id is distinct from (select auth.uid()) or new.salesperson_id is distinct from v_opp.salesperson_id then
    raise exception 'You may create quotations only for your own qualified opportunities.';
  end if;
  if v_opp.lead_id is not null then
    select * into v_lead from public.crm_leads where id=v_opp.lead_id;
    if not found or v_lead.status<>'Qualified' then raise exception 'The originating lead must remain Qualified.'; end if;
    if v_lead.source='Website Contact Form' and (v_lead.accepted_at is null or v_lead.first_response_at is null) then
      raise exception 'Accept and respond to the website enquiry before creating a quotation.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_crm_enforce_quotation_qualification on public.quotations;
create trigger trg_crm_enforce_quotation_qualification before insert on public.quotations
for each row execute function public.crm_enforce_quotation_qualification();

revoke all on function public.crm_quote_response_settings() from public,anon,authenticated;
revoke all on function public.crm_quote_lead_notification_payload(uuid) from public,anon,authenticated;
revoke all on function public.crm_queue_quote_management_notification(uuid,text) from public,anon,authenticated;
revoke all on function public.crm_queue_quote_assignment_notification(uuid,text) from public,anon,authenticated;
revoke all on function public.crm_prepare_quote_response_sla() from public,anon,authenticated;
revoke all on function public.crm_after_quote_lead_insert() from public,anon,authenticated;
revoke all on function public.crm_after_quote_lead_assignment() from public,anon,authenticated;
revoke all on function public.crm_refresh_lead_next_follow_up(uuid) from public,anon,authenticated;
revoke all on function public.crm_sync_quote_response_follow_up() from public,anon,authenticated;
revoke all on function public.crm_audit_quote_first_response() from public,anon,authenticated;
revoke all on function public.crm_queue_due_lead_response_slas(integer) from public,anon,authenticated;
revoke all on function public.crm_enforce_quotation_qualification() from public,anon,authenticated;
revoke all on function public.crm_accept_assigned_lead(uuid) from public,anon,authenticated;
revoke all on function public.crm_record_lead_first_response(uuid,text) from public,anon,authenticated;
grant execute on function public.crm_accept_assigned_lead(uuid) to authenticated;
grant execute on function public.crm_record_lead_first_response(uuid,text) to authenticated;

do $block$
begin
  if exists(select 1 from pg_extension where extname='pg_cron')
     and not exists(select 1 from cron.job where jobname='crm-lead-first-response-sla') then
    perform cron.schedule('crm-lead-first-response-sla','*/5 * * * *','select public.crm_queue_due_lead_response_slas(100);');
  end if;
end;
$block$;

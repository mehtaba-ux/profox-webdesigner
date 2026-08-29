-- Fast-response workflow for qualified website quote enquiries.
-- Reuses crm_leads, crm_lead_events, crm_activities and the existing notification pipeline.
-- Meeting bookings and non-website lead sources are intentionally untouched.

alter table public.crm_leads
  add column if not exists accepted_at timestamptz,
  add column if not exists first_response_due_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists first_response_sla_minutes integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_leads_first_response_sla_minutes_check'
      and conrelid = 'public.crm_leads'::regclass
  ) then
    alter table public.crm_leads
      add constraint crm_leads_first_response_sla_minutes_check
      check (first_response_sla_minutes is null or first_response_sla_minutes between 5 and 1440);
  end if;
end $$;

create index if not exists idx_crm_leads_quote_response_due
  on public.crm_leads(first_response_due_at, salesperson_id)
  where source = 'Website Contact Form'
    and first_response_at is null
    and archived_at is null;

-- Preserve the current manual/round-robin policy and seller/manager lists; only add missing response controls.
insert into public.system_configuration(config_key, config_value, description)
values (
  'crm_lead_assignment',
  jsonb_build_object(
    'version', 1,
    'mode', 'manual',
    'managerUserIds', jsonb_build_array(),
    'eligibleSalespersonIds', jsonb_build_array(),
    'firstResponseSlaMinutes', 30,
    'notifyManagersOnNewLead', true,
    'notifyAssigneeOnAssignment', true,
    'escalateOverdueToManagers', true
  ),
  'CRM website lead assignment and fast-response policy.'
)
on conflict (config_key) do update
set config_value = coalesce(public.system_configuration.config_value, '{}'::jsonb)
  || jsonb_build_object(
    'firstResponseSlaMinutes',
      case
        when coalesce(public.system_configuration.config_value->>'firstResponseSlaMinutes','') ~ '^[0-9]+$'
          then greatest(5, least(1440, (public.system_configuration.config_value->>'firstResponseSlaMinutes')::integer))
        else 30
      end,
    'notifyManagersOnNewLead',
      case when jsonb_typeof(public.system_configuration.config_value->'notifyManagersOnNewLead') = 'boolean'
        then (public.system_configuration.config_value->>'notifyManagersOnNewLead')::boolean else true end,
    'notifyAssigneeOnAssignment',
      case when jsonb_typeof(public.system_configuration.config_value->'notifyAssigneeOnAssignment') = 'boolean'
        then (public.system_configuration.config_value->>'notifyAssigneeOnAssignment')::boolean else true end,
    'escalateOverdueToManagers',
      case when jsonb_typeof(public.system_configuration.config_value->'escalateOverdueToManagers') = 'boolean'
        then (public.system_configuration.config_value->>'escalateOverdueToManagers')::boolean else true end
  ),
  description = coalesce(public.system_configuration.description, 'CRM website lead assignment and fast-response policy.'),
  updated_at = now();

insert into public.notification_templates(template_key, name, subject_template, body_template, html_template, active, description)
values
(
  'crm_new_quote_request',
  'New website project enquiry',
  'New project enquiry: {{leadName}}',
  E'A new website project enquiry needs review.\n\nLead: {{leadName}}\nCompany: {{companyName}}\nService: {{serviceInterest}}\nQuality: {{leadQuality}} ({{leadScore}})\nBudget: {{budgetRange}}\nTimeline: {{timeline}}\n\nOpen the CRM immediately to review and assign the enquiry.',
  E'<p>A new website project enquiry needs review.</p><p><strong>Lead:</strong> {{leadName}}<br><strong>Company:</strong> {{companyName}}<br><strong>Service:</strong> {{serviceInterest}}<br><strong>Quality:</strong> {{leadQuality}} ({{leadScore}})<br><strong>Budget:</strong> {{budgetRange}}<br><strong>Timeline:</strong> {{timeline}}</p><p><a href="{{actionUrl}}">Open CRM enquiry</a></p>',
  true,
  'Immediate Admin/Manager alert for a new or repeated Website Contact Form enquiry.'
),
(
  'crm_lead_assigned',
  'Website enquiry assigned to salesperson',
  'New enquiry assigned: {{leadName}}',
  E'A website project enquiry has been assigned to you.\n\nLead: {{leadName}}\nCompany: {{companyName}}\nService: {{serviceInterest}}\nQuality: {{leadQuality}} ({{leadScore}})\n\nPlease accept it and make the first customer response within {{slaMinutes}} minutes.',
  E'<p>A website project enquiry has been assigned to you.</p><p><strong>Lead:</strong> {{leadName}}<br><strong>Company:</strong> {{companyName}}<br><strong>Service:</strong> {{serviceInterest}}<br><strong>Quality:</strong> {{leadQuality}} ({{leadScore}})</p><p>Please accept it and make the first customer response within <strong>{{slaMinutes}} minutes</strong>.</p><p><a href="{{actionUrl}}">Open assigned enquiry</a></p>',
  true,
  'Immediate salesperson alert after Website Contact Form lead assignment or reassignment.'
),
(
  'crm_lead_sla_overdue',
  'Website enquiry first-response SLA overdue',
  'Response overdue: {{leadName}}',
  E'The first-response SLA for a website project enquiry is overdue.\n\nLead: {{leadName}}\nCompany: {{companyName}}\nAssigned salesperson: {{salespersonName}}\nResponse target: {{slaMinutes}} minutes\n\nOpen the CRM and respond now.',
  E'<p>The first-response SLA for a website project enquiry is <strong>overdue</strong>.</p><p><strong>Lead:</strong> {{leadName}}<br><strong>Company:</strong> {{companyName}}<br><strong>Assigned salesperson:</strong> {{salespersonName}}<br><strong>Response target:</strong> {{slaMinutes}} minutes</p><p><a href="{{actionUrl}}">Open overdue enquiry</a></p>',
  true,
  'Seller alert and optional Admin/Manager escalation when first response is overdue.'
)
on conflict (template_key) do nothing;

create or replace function public.crm_quote_response_settings()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_config jsonb := '{}'::jsonb;
  v_sla integer := 30;
begin
  select coalesce(config_value, '{}'::jsonb)
    into v_config
  from public.system_configuration
  where config_key = 'crm_lead_assignment';

  if coalesce(v_config->>'firstResponseSlaMinutes','') ~ '^[0-9]+$' then
    v_sla := greatest(5, least(1440, (v_config->>'firstResponseSlaMinutes')::integer));
  end if;

  return jsonb_build_object(
    'firstResponseSlaMinutes', v_sla,
    'notifyManagersOnNewLead', case when jsonb_typeof(v_config->'notifyManagersOnNewLead') = 'boolean' then (v_config->>'notifyManagersOnNewLead')::boolean else true end,
    'notifyAssigneeOnAssignment', case when jsonb_typeof(v_config->'notifyAssigneeOnAssignment') = 'boolean' then (v_config->>'notifyAssigneeOnAssignment')::boolean else true end,
    'escalateOverdueToManagers', case when jsonb_typeof(v_config->'escalateOverdueToManagers') = 'boolean' then (v_config->>'escalateOverdueToManagers')::boolean else true end,
    'managerUserIds', case when jsonb_typeof(v_config->'managerUserIds') = 'array' then v_config->'managerUserIds' else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.crm_quote_response_settings() from public, anon, authenticated;

create or replace function public.crm_quote_lead_notification_payload(p_lead_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'leadId', l.id,
    'leadName', coalesce(nullif(trim(l.contact_name),''), 'Website enquiry'),
    'companyName', coalesce(nullif(trim(l.company_name),''), 'Not provided'),
    'serviceInterest', coalesce(nullif(trim(l.service_interest),''), 'Not specified'),
    'leadQuality', coalesce(nullif(trim(l.lead_quality),''), 'Unscored'),
    'leadScore', coalesce(l.lead_score, 0),
    'budgetRange', coalesce(nullif(trim(l.budget_range),''), 'Not specified'),
    'timeline', coalesce(nullif(trim(l.project_timeline),''), 'Not specified'),
    'actionUrl', '/admin/app/crm?tab=crm_leads',
    'notificationCategory', 'Sales',
    'notificationModule', 'CRM',
    'notificationPriority', 'High'
  )
  from public.crm_leads l
  where l.id = p_lead_id;
$$;

revoke all on function public.crm_quote_lead_notification_payload(uuid) from public, anon, authenticated;

create or replace function public.crm_queue_quote_assignment_notification(p_lead_id uuid, p_event_key text default '')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.crm_leads%rowtype;
  v_settings jsonb;
  v_payload jsonb;
  v_key text;
begin
  select * into v_lead from public.crm_leads where id = p_lead_id;
  if not found or v_lead.source <> 'Website Contact Form' or v_lead.salesperson_id is null then
    return;
  end if;

  v_settings := public.crm_quote_response_settings();
  if coalesce((v_settings->>'notifyAssigneeOnAssignment')::boolean, true) is not true then
    return;
  end if;

  v_payload := public.crm_quote_lead_notification_payload(v_lead.id)
    || jsonb_build_object('slaMinutes', coalesce(v_lead.first_response_sla_minutes, (v_settings->>'firstResponseSlaMinutes')::integer));
  v_key := 'crm-quote-assigned:' || v_lead.id::text || ':' || v_lead.salesperson_id::text || ':' || coalesce(nullif(trim(p_event_key),''), coalesce(v_lead.assigned_at::text, now()::text));

  perform public.service_queue_staff_operational_notification(
    v_lead.salesperson_id,
    v_key,
    'crm_lead_assigned',
    'Lead Assigned',
    'New project enquiry assigned',
    coalesce(nullif(trim(v_lead.contact_name),''), 'A website enquiry') || ' has been assigned to you. Accept it and respond within the SLA.',
    '/admin/app/crm?tab=crm_leads',
    v_payload,
    now()
  );
end;
$$;

revoke all on function public.crm_queue_quote_assignment_notification(uuid,text) from public, anon, authenticated;

create or replace function public.crm_queue_new_quote_lead_notifications(p_lead_id uuid, p_event_key text default '')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.crm_leads%rowtype;
  v_settings jsonb;
  v_payload jsonb;
  v_manager record;
  v_prefix text;
begin
  select * into v_lead from public.crm_leads where id = p_lead_id;
  if not found or v_lead.source <> 'Website Contact Form' then
    return;
  end if;

  v_settings := public.crm_quote_response_settings();
  v_payload := public.crm_quote_lead_notification_payload(v_lead.id);
  v_prefix := 'crm-new-quote:' || v_lead.id::text || ':' || coalesce(nullif(trim(p_event_key),''), 'initial');

  if coalesce((v_settings->>'notifyManagersOnNewLead')::boolean, true) then
    perform public.service_queue_active_admins_operational_notification(
      v_prefix,
      'crm_new_quote_request',
      'Lead Alert',
      'New website project enquiry',
      coalesce(nullif(trim(v_lead.contact_name),''), 'A visitor') || ' submitted a project enquiry. Review and assign it now.',
      '/admin/app/crm?tab=crm_leads',
      v_payload,
      now()
    );

    for v_manager in
      select distinct u.id
      from jsonb_array_elements_text(coalesce(v_settings->'managerUserIds','[]'::jsonb)) as manager_id(value)
      join public.user_profiles u on u.id::text = manager_id.value
      where u.status = 'active'
        and u.role in ('sales','sales_rep','sales_team')
    loop
      perform public.service_queue_staff_operational_notification(
        v_manager.id,
        v_prefix || ':manager:' || v_manager.id::text,
        'crm_new_quote_request',
        'Lead Alert',
        'New website project enquiry',
        coalesce(nullif(trim(v_lead.contact_name),''), 'A visitor') || ' submitted a project enquiry. Review and assign it now.',
        '/admin/app/crm?tab=crm_leads',
        v_payload,
        now()
      );
    end loop;
  end if;

  -- In round-robin mode the lead may already be assigned during the public insert.
  if v_lead.salesperson_id is not null then
    perform public.crm_queue_quote_assignment_notification(v_lead.id, 'new:' || coalesce(nullif(trim(p_event_key),''), 'initial'));
  end if;
end;
$$;

revoke all on function public.crm_queue_new_quote_lead_notifications(uuid,text) from public, anon, authenticated;

create or replace function public.crm_prepare_quote_response_sla()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings jsonb;
  v_sla integer;
begin
  if new.source <> 'Website Contact Form' then
    return new;
  end if;

  -- Any real customer contact recorded directly on the lead resolves first response.
  if tg_op = 'UPDATE'
     and new.first_response_at is null
     and old.first_response_at is null
     and new.salesperson_id is not null
     and new.last_contact_at is distinct from old.last_contact_at
     and new.last_contact_at is not null then
    new.first_response_at := new.last_contact_at;
    new.accepted_at := coalesce(new.accepted_at, new.last_contact_at);
  end if;

  if tg_op = 'INSERT' or new.salesperson_id is distinct from old.salesperson_id then
    if new.salesperson_id is null then
      if new.first_response_at is null then
        new.accepted_at := null;
        new.first_response_due_at := null;
        new.first_response_sla_minutes := null;
      end if;
    elsif new.first_response_at is null then
      v_settings := public.crm_quote_response_settings();
      v_sla := (v_settings->>'firstResponseSlaMinutes')::integer;
      new.accepted_at := null;
      new.first_response_sla_minutes := v_sla;
      new.first_response_due_at := now() + make_interval(mins => v_sla);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_prepare_quote_response_sla on public.crm_leads;
create trigger trg_crm_prepare_quote_response_sla
before insert or update on public.crm_leads
for each row execute function public.crm_prepare_quote_response_sla();

create or replace function public.crm_after_quote_lead_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.source = 'Website Contact Form' then
    perform public.crm_queue_new_quote_lead_notifications(new.id, 'created:' || new.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_after_quote_lead_insert on public.crm_leads;
create trigger trg_crm_after_quote_lead_insert
after insert on public.crm_leads
for each row execute function public.crm_after_quote_lead_insert();

create or replace function public.crm_after_quote_lead_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.source = 'Website Contact Form'
     and new.salesperson_id is not null
     and new.salesperson_id is distinct from old.salesperson_id then
    perform public.crm_queue_quote_assignment_notification(
      new.id,
      'changed:' || coalesce(new.assigned_at::text, now()::text)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_after_quote_lead_assignment on public.crm_leads;
create trigger trg_crm_after_quote_lead_assignment
after update of salesperson_id on public.crm_leads
for each row
when (new.salesperson_id is distinct from old.salesperson_id)
execute function public.crm_after_quote_lead_assignment();

create or replace function public.crm_after_repeat_quote_enquiry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.event_type = 'website_enquiry' then
    perform public.crm_queue_new_quote_lead_notifications(new.lead_id, 'repeat:' || new.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_after_repeat_quote_enquiry on public.crm_lead_events;
create trigger trg_crm_after_repeat_quote_enquiry
after insert on public.crm_lead_events
for each row
when (new.event_type = 'website_enquiry')
execute function public.crm_after_repeat_quote_enquiry();

create or replace function public.crm_accept_lead(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_lead public.crm_leads%rowtype;
  v_was_accepted boolean;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_lead
  from public.crm_leads
  where id = p_lead_id
  for update;

  if not found or v_lead.source <> 'Website Contact Form' then
    raise exception 'Website enquiry not found.';
  end if;
  if v_lead.salesperson_id is distinct from v_user then
    raise exception 'Only the assigned salesperson can accept this enquiry.';
  end if;
  if v_lead.archived_at is not null or v_lead.converted_opportunity_id is not null or lower(coalesce(v_lead.status,'')) in ('lost','converted') then
    raise exception 'This enquiry is no longer active.';
  end if;

  v_was_accepted := v_lead.accepted_at is not null;

  update public.crm_leads
  set accepted_at = coalesce(accepted_at, now()),
      updated_at = now()
  where id = p_lead_id
  returning * into v_lead;

  if not v_was_accepted then
    insert into public.crm_lead_events(lead_id, owner_user_id, event_type, title, message, metadata)
    values (
      v_lead.id,
      v_user,
      'lead_accepted',
      'Enquiry accepted by salesperson',
      'The assigned salesperson accepted ownership and started working the website enquiry.',
      jsonb_build_object('firstResponseDueAt', v_lead.first_response_due_at, 'slaMinutes', v_lead.first_response_sla_minutes)
    );
  end if;

  return jsonb_build_object(
    'id', v_lead.id,
    'acceptedAt', v_lead.accepted_at,
    'firstResponseDueAt', v_lead.first_response_due_at,
    'firstResponseAt', v_lead.first_response_at
  );
end;
$$;

revoke all on function public.crm_accept_lead(uuid) from public, anon;
grant execute on function public.crm_accept_lead(uuid) to authenticated;

create or replace function public.crm_mark_quote_first_response_from_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contact_types constant text[] := array[
    'Cold Call', 'Cold Email', 'LinkedIn / Social Outreach', 'Loom Outreach',
    'Follow-Up', 'Discovery Meeting', 'Meeting Follow-Up',
    'Quotation Follow-Up', 'Payment Follow-Up'
  ];
begin
  if new.lead_id is null
     or new.completed_at is null
     or lower(coalesce(new.status,'')) <> 'completed'
     or not (new.activity_type = any(v_contact_types)) then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.completed_at is not null then
    return new;
  end if;

  update public.crm_leads l
  set first_response_at = new.completed_at,
      accepted_at = coalesce(l.accepted_at, new.completed_at),
      updated_at = now()
  where l.id = new.lead_id
    and l.source = 'Website Contact Form'
    and l.salesperson_id is not null
    and l.first_response_at is null;

  return new;
end;
$$;

drop trigger if exists trg_crm_mark_quote_first_response_from_activity on public.crm_activities;
create trigger trg_crm_mark_quote_first_response_from_activity
after insert or update of completed_at, status on public.crm_activities
for each row execute function public.crm_mark_quote_first_response_from_activity();

create or replace function public.crm_audit_quote_first_response()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.source = 'Website Contact Form'
     and old.first_response_at is null
     and new.first_response_at is not null then
    insert into public.crm_lead_events(lead_id, owner_user_id, event_type, title, message, metadata)
    values (
      new.id,
      new.salesperson_id,
      'first_response',
      'First customer response recorded',
      'The website enquiry received its first customer-facing response.',
      jsonb_build_object(
        'firstResponseAt', new.first_response_at,
        'firstResponseDueAt', new.first_response_due_at,
        'metSla', case when new.first_response_due_at is null then null else new.first_response_at <= new.first_response_due_at end
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_audit_quote_first_response on public.crm_leads;
create trigger trg_crm_audit_quote_first_response
after update of first_response_at on public.crm_leads
for each row
when (old.first_response_at is null and new.first_response_at is not null)
execute function public.crm_audit_quote_first_response();

create or replace function public.crm_get_my_fast_response_leads()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  select coalesce(jsonb_agg(item order by (item->>'firstResponseDueAt')::timestamptz nulls last, (item->>'createdAt')::timestamptz), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', l.id,
      'name', coalesce(nullif(trim(l.contact_name),''), 'Website enquiry'),
      'company', nullif(trim(l.company_name),''),
      'email', l.email,
      'phone', nullif(trim(l.phone),''),
      'serviceInterest', nullif(trim(l.service_interest),''),
      'leadScore', coalesce(l.lead_score,0),
      'leadQuality', coalesce(nullif(trim(l.lead_quality),''),'Low'),
      'acceptedAt', l.accepted_at,
      'firstResponseDueAt', l.first_response_due_at,
      'firstResponseSlaMinutes', l.first_response_sla_minutes,
      'createdAt', l.created_at
    ) as item
    from public.crm_leads l
    where l.source = 'Website Contact Form'
      and l.salesperson_id = v_user
      and l.first_response_at is null
      and l.archived_at is null
      and l.converted_opportunity_id is null
      and lower(coalesce(l.status,'')) not in ('lost','converted')
    order by l.first_response_due_at nulls last, l.created_at
    limit 100
  ) q;

  return v_result;
end;
$$;

revoke all on function public.crm_get_my_fast_response_leads() from public, anon;
grant execute on function public.crm_get_my_fast_response_leads() to authenticated;

create or replace function public.crm_queue_due_lead_response_slas(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings jsonb;
  v_lead record;
  v_manager record;
  v_payload jsonb;
  v_key text;
  v_count integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit,100),500));
begin
  v_settings := public.crm_quote_response_settings();

  for v_lead in
    select l.*, coalesce(nullif(trim(u.full_name),''), 'Assigned salesperson') as salesperson_name
    from public.crm_leads l
    join public.user_profiles u on u.id = l.salesperson_id
    where l.source = 'Website Contact Form'
      and l.salesperson_id is not null
      and l.first_response_at is null
      and l.first_response_due_at is not null
      and l.first_response_due_at <= now()
      and l.archived_at is null
      and l.converted_opportunity_id is null
      and lower(coalesce(l.status,'')) not in ('lost','converted')
    order by l.first_response_due_at
    for update of l skip locked
    limit v_limit
  loop
    v_payload := public.crm_quote_lead_notification_payload(v_lead.id)
      || jsonb_build_object(
        'slaMinutes', coalesce(v_lead.first_response_sla_minutes,(v_settings->>'firstResponseSlaMinutes')::integer),
        'salespersonName', v_lead.salesperson_name,
        'firstResponseDueAt', v_lead.first_response_due_at
      );
    v_key := 'crm-quote-sla-overdue:' || v_lead.id::text || ':' || extract(epoch from v_lead.first_response_due_at)::bigint::text;

    perform public.service_queue_staff_operational_notification(
      v_lead.salesperson_id,
      v_key || ':seller',
      'crm_lead_sla_overdue',
      'Lead SLA Overdue',
      'First response overdue',
      coalesce(nullif(trim(v_lead.contact_name),''),'A website enquiry') || ' is overdue for first response. Please act now.',
      '/admin/app/crm?tab=crm_leads',
      v_payload,
      now()
    );

    if coalesce((v_settings->>'escalateOverdueToManagers')::boolean,true) then
      perform public.service_queue_active_admins_operational_notification(
        v_key || ':admin',
        'crm_lead_sla_overdue',
        'Lead SLA Overdue',
        'Website enquiry response overdue',
        coalesce(nullif(trim(v_lead.contact_name),''),'A website enquiry') || ' has missed the first-response SLA.',
        '/admin/app/crm?tab=crm_leads',
        v_payload,
        now()
      );

      for v_manager in
        select distinct u.id
        from jsonb_array_elements_text(coalesce(v_settings->'managerUserIds','[]'::jsonb)) as manager_id(value)
        join public.user_profiles u on u.id::text = manager_id.value
        where u.status = 'active'
          and u.role in ('sales','sales_rep','sales_team')
      loop
        perform public.service_queue_staff_operational_notification(
          v_manager.id,
          v_key || ':manager:' || v_manager.id::text,
          'crm_lead_sla_overdue',
          'Lead SLA Overdue',
          'Website enquiry response overdue',
          coalesce(nullif(trim(v_lead.contact_name),''),'A website enquiry') || ' has missed the first-response SLA.',
          '/admin/app/crm?tab=crm_leads',
          v_payload,
          now()
        );
      end loop;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.crm_queue_due_lead_response_slas(integer) from public, anon, authenticated;

-- Queue due response-SLA alerts every five minutes. The worker that already services
-- notification_outbox remains the single delivery mechanism.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'crm-lead-first-response-sla') then
    perform cron.schedule(
      'crm-lead-first-response-sla',
      '*/5 * * * *',
      'select public.crm_queue_due_lead_response_slas(100);'
    );
  end if;
end $$;

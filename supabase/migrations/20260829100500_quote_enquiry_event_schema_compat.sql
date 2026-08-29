-- Canonical CRM compatibility and hardening for the quote-enquiry fast-response workflow.
-- Keeps every audit event, assignment timestamp and first-response signal on the existing CRM primitives.

-- Bulk/equal distribution currently update salesperson_id directly. Stamp assigned_at here so every
-- assignment path has one authoritative SLA start time and the notification dedupe key stays stable.
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

  -- A genuine customer-contact timestamp already recorded by the CRM satisfies first response.
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
      new.assigned_at := now();
      new.accepted_at := null;
      new.first_response_sla_minutes := v_sla;
      new.first_response_due_at := new.assigned_at + make_interval(mins => v_sla);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_prepare_quote_response_sla on public.crm_leads;
create trigger trg_crm_prepare_quote_response_sla
before insert or update on public.crm_leads
for each row execute function public.crm_prepare_quote_response_sla();

-- Support the canonical repeat-enquiry event name as well as the earlier compatibility name.
create or replace function public.crm_after_repeat_quote_enquiry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.event_type in ('repeat_website_enquiry','website_enquiry') then
    perform public.crm_queue_new_quote_lead_notifications(new.lead_id, 'repeat:' || new.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_after_repeat_quote_enquiry on public.crm_lead_events;
create trigger trg_crm_after_repeat_quote_enquiry
after insert on public.crm_lead_events
for each row
when (new.event_type in ('repeat_website_enquiry','website_enquiry'))
execute function public.crm_after_repeat_quote_enquiry();

-- The live CRM uses both simple channel types (Call/Email/Meeting/WhatsApp) and detailed sales
-- activity types. Either kind counts only after the activity is genuinely completed.
create or replace function public.crm_mark_quote_first_response_from_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contact_types constant text[] := array[
    'Call', 'Email', 'Meeting', 'WhatsApp', 'Message', 'SMS', 'Video Call',
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

-- Use the canonical CRM event writer so actor snapshots, descriptions and dedupe behavior stay consistent.
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
  if v_lead.archived_at is not null
     or v_lead.converted_opportunity_id is not null
     or lower(coalesce(v_lead.status,'')) in ('lost','converted') then
    raise exception 'This enquiry is no longer active.';
  end if;

  v_was_accepted := v_lead.accepted_at is not null;

  update public.crm_leads
  set accepted_at = coalesce(accepted_at, now()),
      updated_at = now()
  where id = p_lead_id
  returning * into v_lead;

  if not v_was_accepted then
    perform public.crm_write_lead_event(
      v_lead.id,
      'lead_accepted',
      'Enquiry accepted by salesperson',
      'The assigned salesperson accepted ownership and started working the website enquiry.',
      jsonb_build_object(
        'firstResponseDueAt', v_lead.first_response_due_at,
        'slaMinutes', v_lead.first_response_sla_minutes
      ),
      v_user,
      null,
      null,
      v_lead.accepted_at,
      'quote-lead-accepted:' || v_lead.id::text
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
    perform public.crm_write_lead_event(
      new.id,
      'first_response',
      'First customer response recorded',
      'The website enquiry received its first customer-facing response.',
      jsonb_build_object(
        'firstResponseAt', new.first_response_at,
        'firstResponseDueAt', new.first_response_due_at,
        'metSla', case
          when new.first_response_due_at is null then null
          else new.first_response_at <= new.first_response_due_at
        end
      ),
      new.salesperson_id,
      null,
      null,
      new.first_response_at,
      'quote-first-response:' || new.id::text
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

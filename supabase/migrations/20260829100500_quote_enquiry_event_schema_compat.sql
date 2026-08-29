-- Align the fast-response audit events with the canonical CRM lead-event schema.
-- Reuses crm_write_lead_event so actor snapshots, descriptions and dedupe behavior stay consistent.

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

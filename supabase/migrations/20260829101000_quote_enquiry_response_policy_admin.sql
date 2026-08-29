-- Admin controls for the fast-response policy, stored in the existing crm_lead_assignment configuration.

create or replace function public.crm_admin_get_quote_response_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_config jsonb := '{}'::jsonb;
  v_sla integer := 30;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.';
  end if;

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
    'escalateOverdueToManagers', case when jsonb_typeof(v_config->'escalateOverdueToManagers') = 'boolean' then (v_config->>'escalateOverdueToManagers')::boolean else true end
  );
end;
$$;

revoke all on function public.crm_admin_get_quote_response_policy() from public, anon;
grant execute on function public.crm_admin_get_quote_response_policy() to authenticated;

create or replace function public.crm_admin_save_quote_response_policy(p_policy jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_config jsonb := '{}'::jsonb;
  v_sla integer;
  v_notify_new boolean;
  v_notify_assignee boolean;
  v_escalate boolean;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.';
  end if;

  if jsonb_typeof(coalesce(p_policy, '{}'::jsonb)) <> 'object' then
    raise exception 'Response policy must be an object.';
  end if;

  begin
    v_sla := coalesce((p_policy->>'firstResponseSlaMinutes')::integer, 30);
  exception when others then
    raise exception 'First-response SLA must be a whole number of minutes.';
  end;

  if v_sla not between 5 and 1440 then
    raise exception 'First-response SLA must be between 5 and 1440 minutes.';
  end if;

  v_notify_new := case when jsonb_typeof(p_policy->'notifyManagersOnNewLead') = 'boolean'
    then (p_policy->>'notifyManagersOnNewLead')::boolean else true end;
  v_notify_assignee := case when jsonb_typeof(p_policy->'notifyAssigneeOnAssignment') = 'boolean'
    then (p_policy->>'notifyAssigneeOnAssignment')::boolean else true end;
  v_escalate := case when jsonb_typeof(p_policy->'escalateOverdueToManagers') = 'boolean'
    then (p_policy->>'escalateOverdueToManagers')::boolean else true end;

  select coalesce(config_value, '{}'::jsonb)
    into v_config
  from public.system_configuration
  where config_key = 'crm_lead_assignment'
  for update;

  v_config := v_config || jsonb_build_object(
    'firstResponseSlaMinutes', v_sla,
    'notifyManagersOnNewLead', v_notify_new,
    'notifyAssigneeOnAssignment', v_notify_assignee,
    'escalateOverdueToManagers', v_escalate
  );

  insert into public.system_configuration(config_key, config_value, description, updated_by, updated_at)
  values(
    'crm_lead_assignment',
    v_config,
    'CRM website lead assignment and fast-response policy.',
    auth.uid(),
    now()
  )
  on conflict(config_key) do update
    set config_value = excluded.config_value,
        description = coalesce(nullif(public.system_configuration.description,''), excluded.description),
        updated_by = excluded.updated_by,
        updated_at = now();

  return public.crm_admin_get_quote_response_policy();
end;
$$;

revoke all on function public.crm_admin_save_quote_response_policy(jsonb) from public, anon;
grant execute on function public.crm_admin_save_quote_response_policy(jsonb) to authenticated;

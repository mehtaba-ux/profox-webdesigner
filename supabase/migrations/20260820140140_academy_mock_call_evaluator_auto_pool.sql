-- Module 10/11 evaluator pool hardening
-- Automatically enroll eligible Admins, Managers and 2+ year Sales Agents while
-- preserving Admin overrides and evaluator removals.

create table if not exists public.mock_call_evaluator_exclusions (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  excluded_at timestamptz not null default now(),
  excluded_by uuid null references public.user_profiles(id) on delete set null,
  reason text not null default 'Removed from automatic mock-call evaluator pool.'
);

alter table public.mock_call_evaluator_exclusions enable row level security;

drop policy if exists mock_call_evaluator_exclusions_admin_all on public.mock_call_evaluator_exclusions;
create policy mock_call_evaluator_exclusions_admin_all
on public.mock_call_evaluator_exclusions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.mock_call_evaluator_exclusions from anon;
revoke all on public.mock_call_evaluator_exclusions from authenticated;
grant select, insert, update, delete on public.mock_call_evaluator_exclusions to authenticated;

-- The approved default: two years of ProFox tenure is sufficient for a Sales
-- Agent. Admin may turn certification back on from Mock Call Automation.
update public.system_configuration
set config_value = jsonb_set(
      jsonb_set(coalesce(config_value, '{}'::jsonb), '{minSalesTenureMonths}', '24'::jsonb, true),
      '{requireSalesCertification}', 'false'::jsonb, true
    ),
    updated_at = now()
where config_key = 'mock_call_automation_settings';

create or replace function public.validate_mock_call_evaluator_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  select role into v_role from public.user_profiles where id = new.user_id;
  if v_role is null then
    raise exception 'Evaluator user profile not found.';
  end if;

  if new.evaluator_class = 'admin' and v_role <> 'admin' then
    raise exception 'Admin evaluator class requires an Admin user.';
  elsif new.evaluator_class = 'manager' and v_role not in ('manager','sales_manager') then
    raise exception 'Manager evaluator class requires a Manager user.';
  elsif new.evaluator_class = 'sales_agent' and v_role not in ('sales','sales_rep','sales_team') then
    raise exception 'Sales Agent evaluator class requires a Sales user.';
  elsif new.evaluator_class not in ('admin','manager','sales_agent') then
    raise exception 'Unsupported mock-call evaluator class.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_mock_call_evaluator_profile() from public, anon, authenticated;

drop trigger if exists trg_validate_mock_call_evaluator_profile on public.mock_call_evaluator_profiles;
create trigger trg_validate_mock_call_evaluator_profile
before insert or update of user_id, evaluator_class
on public.mock_call_evaluator_profiles
for each row execute function public.validate_mock_call_evaluator_profile();

create or replace function public.remember_mock_call_evaluator_exclusion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.mock_call_evaluator_exclusions(user_id, excluded_by)
  values(old.user_id, auth.uid())
  on conflict(user_id) do update
    set excluded_at = now(), excluded_by = auth.uid();
  return old;
end;
$$;

revoke all on function public.remember_mock_call_evaluator_exclusion() from public, anon, authenticated;

drop trigger if exists trg_remember_mock_call_evaluator_exclusion on public.mock_call_evaluator_profiles;
create trigger trg_remember_mock_call_evaluator_exclusion
after delete on public.mock_call_evaluator_profiles
for each row execute function public.remember_mock_call_evaluator_exclusion();

create or replace function public.clear_mock_call_evaluator_exclusion_on_manual_add()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Automatic sync never inserts an excluded user, so reaching this trigger for
  -- an excluded user means Admin deliberately re-added them.
  if auth.uid() is not null and public.is_admin() then
    delete from public.mock_call_evaluator_exclusions where user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_mock_call_evaluator_exclusion_on_manual_add() from public, anon, authenticated;

drop trigger if exists trg_clear_mock_call_evaluator_exclusion_on_manual_add on public.mock_call_evaluator_profiles;
create trigger trg_clear_mock_call_evaluator_exclusion_on_manual_add
after insert on public.mock_call_evaluator_profiles
for each row execute function public.clear_mock_call_evaluator_exclusion_on_manual_add();

create or replace function public.sync_mock_call_evaluator_pool()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings jsonb := public.get_mock_call_automation_settings();
  v_min_tenure integer := greatest(coalesce((v_settings->>'minSalesTenureMonths')::integer,24),0);
  v_require_cert boolean := coalesce((v_settings->>'requireSalesCertification')::boolean,false);
  v_admins boolean := coalesce((v_settings->>'adminsEligibleByDefault')::boolean,true);
begin
  -- Keep stale role/status profiles from remaining eligible after a team change.
  update public.mock_call_evaluator_profiles ep
  set enabled = false, updated_at = now()
  from public.user_profiles up
  where up.id = ep.user_id
    and ep.enabled = true
    and (
      up.status is distinct from 'active'
      or (ep.evaluator_class='admin' and up.role <> 'admin')
      or (ep.evaluator_class='manager' and up.role not in ('manager','sales_manager'))
      or (ep.evaluator_class='sales_agent' and up.role not in ('sales','sales_rep','sales_team'))
    );

  if v_admins then
    insert into public.mock_call_evaluator_profiles(user_id,enabled,evaluator_class,service_start_date,availability_mode,meeting_url,notes)
    select up.id,true,'admin',up.created_at::date,'calendar',coalesce(ucs.booking_url,''),'Automatically enrolled Admin evaluator.'
    from public.user_profiles up
    left join public.user_calendar_settings ucs on ucs.user_id=up.id
    where up.role='admin' and up.status='active'
      and not exists(select 1 from public.mock_call_evaluator_exclusions x where x.user_id=up.id)
    on conflict(user_id) do nothing;
  end if;

  insert into public.mock_call_evaluator_profiles(user_id,enabled,evaluator_class,service_start_date,availability_mode,meeting_url,notes)
  select up.id,true,'manager',up.created_at::date,'calendar',coalesce(ucs.booking_url,''),'Automatically enrolled Manager evaluator.'
  from public.user_profiles up
  left join public.user_calendar_settings ucs on ucs.user_id=up.id
  where up.role in ('manager','sales_manager') and up.status='active'
    and not exists(select 1 from public.mock_call_evaluator_exclusions x where x.user_id=up.id)
  on conflict(user_id) do nothing;

  insert into public.mock_call_evaluator_profiles(user_id,enabled,evaluator_class,service_start_date,availability_mode,meeting_url,notes)
  select up.id,true,'sales_agent',up.created_at::date,'calendar',coalesce(ucs.booking_url,''),'Automatically enrolled tenure-qualified Sales evaluator.'
  from public.user_profiles up
  left join public.user_calendar_settings ucs on ucs.user_id=up.id
  where up.role in ('sales','sales_rep','sales_team')
    and up.status='active'
    and up.created_at::date <= (current_date - (v_min_tenure || ' months')::interval)::date
    and (
      not v_require_cert
      or exists(
        select 1
        from public.user_training_progress fp
        join public.training_modules fm on fm.id=fp.module_id
        where fp.user_id=up.id and fm.slug='final-certification' and fp.status in ('Passed','Completed')
      )
    )
    and not exists(select 1 from public.mock_call_evaluator_exclusions x where x.user_id=up.id)
  on conflict(user_id) do nothing;

  return jsonb_build_object(
    'syncedAt', now(),
    'minimumSalesTenureMonths', v_min_tenure,
    'salesCertificationRequired', v_require_cert,
    'enabledEvaluators', (select count(*) from public.mock_call_evaluator_profiles where enabled=true)
  );
end;
$$;

revoke all on function public.sync_mock_call_evaluator_pool() from public, anon, authenticated;

create or replace function public.reconcile_mock_call_evaluator_after_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.sync_mock_call_evaluator_pool();
  return null;
end;
$$;

revoke all on function public.reconcile_mock_call_evaluator_after_profile_change() from public, anon, authenticated;

drop trigger if exists trg_reconcile_mock_call_evaluator_after_profile_change on public.user_profiles;
create trigger trg_reconcile_mock_call_evaluator_after_profile_change
after insert or update of role,status
on public.user_profiles
for each statement execute function public.reconcile_mock_call_evaluator_after_profile_change();

create or replace function public.reconcile_mock_call_evaluator_after_policy_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.config_key='mock_call_automation_settings' then
    perform public.sync_mock_call_evaluator_pool();
  end if;
  return new;
end;
$$;

revoke all on function public.reconcile_mock_call_evaluator_after_policy_change() from public, anon, authenticated;

drop trigger if exists trg_reconcile_mock_call_evaluator_after_policy_change on public.system_configuration;
create trigger trg_reconcile_mock_call_evaluator_after_policy_change
after insert or update of config_value
on public.system_configuration
for each row execute function public.reconcile_mock_call_evaluator_after_policy_change();

-- Make the evaluator pool self-maintaining even when a Sales Agent crosses the
-- tenure threshold without another profile update.
do $$
begin
  begin perform cron.unschedule('profox-mock-call-evaluator-pool-sync'); exception when others then null; end;
  perform cron.schedule('profox-mock-call-evaluator-pool-sync','*/30 * * * *','SELECT public.sync_mock_call_evaluator_pool();');
exception when undefined_table or invalid_schema_name then
  null;
end;
$$;

select public.sync_mock_call_evaluator_pool();

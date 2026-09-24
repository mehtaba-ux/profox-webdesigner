create or replace function public.protect_user_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sales_invite text:=coalesce(current_setting('profox.sales_candidate_invite_rpc',true),'');
  v_content_invite text:=coalesce(current_setting('profox.content_writer_invite_rpc',true),'');
  v_content_activation text:=coalesce(current_setting('profox.content_writer_activation_rpc',true),'');
  v_customer_portal_claim text:=coalesce(current_setting('profox.customer_portal_claim_rpc',true),'');
  v_training_progress_sync text:=coalesce(current_setting('profox.training_progress_sync',true),'');
begin
  if public.is_admin()
     or v_sales_invite='1'
     or v_content_invite='1'
     or v_content_activation='1'
     or v_customer_portal_claim='1'
     or v_training_progress_sync='1'
  then
    return new;
  end if;

  if auth.uid() is null or old.id<>auth.uid() then
    raise exception 'Unauthorized profile update.';
  end if;

  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.department is distinct from old.department
     or new.manager is distinct from old.manager
     or new.onboarding_status is distinct from old.onboarding_status
     or new.onboarding_progress is distinct from old.onboarding_progress
     or new.email is distinct from old.email
  then
    raise exception 'Privileged profile fields may only be changed by an authorized workflow.';
  end if;

  return new;
end;
$$;

create or replace function public.calculate_user_onboarding_progress(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with resolved_track as (
    select public.training_track_for_user(p_user_id) as track_key
  ),
  assigned_modules as (
    select ttm.module_id
    from public.training_track_modules ttm
    join public.training_modules tm on tm.id = ttm.module_id
    join resolved_track rt on rt.track_key = ttm.track_key
    where tm.active = true
  ),
  module_progress as (
    select
      am.module_id,
      coalesce(
        max(
          case
            when utp.status in ('Completed', 'Passed') then 100
            else greatest(0, least(100, coalesce(utp.progress_percent, 0)))
          end
        ),
        0
      )::numeric as progress_percent
    from assigned_modules am
    left join public.user_training_progress utp
      on utp.user_id = p_user_id
     and utp.module_id = am.module_id
    group by am.module_id
  )
  select coalesce(round(avg(progress_percent)), 0)::integer
  from module_progress;
$$;

create or replace function public.sync_user_onboarding_progress(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_track_key text;
  v_progress integer;
begin
  if p_user_id is null then
    return 0;
  end if;

  v_track_key := public.training_track_for_user(p_user_id);
  if v_track_key is null then
    return 0;
  end if;

  v_progress := public.calculate_user_onboarding_progress(p_user_id);

  perform set_config('profox.training_progress_sync','1',true);
  update public.user_profiles
  set onboarding_progress = v_progress,
      updated_at = case
        when onboarding_progress is distinct from v_progress then now()
        else updated_at
      end
  where id = p_user_id
    and onboarding_progress is distinct from v_progress;
  perform set_config('profox.training_progress_sync','',true);

  return v_progress;
exception
  when others then
    perform set_config('profox.training_progress_sync','',true);
    raise;
end;
$$;

create or replace function public.sync_user_onboarding_progress_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_user_onboarding_progress(old.user_id);
    return old;
  end if;

  perform public.sync_user_onboarding_progress(new.user_id);

  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform public.sync_user_onboarding_progress(old.user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_user_onboarding_progress on public.user_training_progress;
create trigger trg_sync_user_onboarding_progress
after insert or update or delete on public.user_training_progress
for each row execute function public.sync_user_onboarding_progress_trigger();

revoke all on function public.calculate_user_onboarding_progress(uuid) from public, anon, authenticated;
revoke all on function public.sync_user_onboarding_progress(uuid) from public, anon, authenticated;
revoke all on function public.sync_user_onboarding_progress_trigger() from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select id
    from public.user_profiles
    where public.training_track_for_user(id) is not null
  loop
    perform public.sync_user_onboarding_progress(r.id);
  end loop;
end;
$$;

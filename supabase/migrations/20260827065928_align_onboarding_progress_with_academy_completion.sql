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
  completion as (
    select
      am.module_id,
      case
        when exists (
          select 1
          from public.user_training_progress utp
          where utp.user_id = p_user_id
            and utp.module_id = am.module_id
            and utp.status in ('Completed', 'Passed')
        ) then 100
        else 0
      end::numeric as completion_percent
    from assigned_modules am
  )
  select coalesce(round(avg(completion_percent)), 0)::integer
  from completion;
$$;

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

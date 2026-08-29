-- Business rule: a referred worker can generate at most three initial performance rewards.
alter table public.talent_partner_reward_plans
  drop constraint if exists talent_partner_reward_plans_qualifying_event_count_check;
alter table public.talent_partner_reward_plans
  add constraint talent_partner_reward_plans_qualifying_event_count_check
  check (qualifying_event_count between 1 and 3);

update public.talent_partner_reward_plans
set qualifying_event_count=least(3,greatest(1,qualifying_event_count))
where qualifying_event_count not between 1 and 3;

create or replace function public.admin_save_talent_partner_reward_plan(
  p_job_id uuid,
  p_enabled boolean,
  p_reward_model text,
  p_qualifying_event_count integer,
  p_event_rewards jsonb,
  p_retention_enabled boolean,
  p_retention_months integer,
  p_retention_reward_kind text,
  p_retention_rate_percent numeric,
  p_retention_fixed_amount numeric,
  p_currency text,
  p_payout_hold_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_row public.talent_partner_reward_plans%rowtype;
  v_model text:=lower(trim(coalesce(p_reward_model,'')));
  v_ret_kind text:=lower(trim(coalesce(p_retention_reward_kind,'')));
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if not exists(select 1 from public.career_jobs where id=p_job_id) then raise exception 'Job not found.'; end if;
  if v_model not in ('sales','project','none') then raise exception 'Invalid reward model.'; end if;
  if v_ret_kind not in ('percent','fixed') then raise exception 'Invalid retention reward type.'; end if;
  if jsonb_typeof(coalesce(p_event_rewards,'[]'::jsonb))<>'array' then raise exception 'Event rewards must be an array.'; end if;

  insert into public.talent_partner_reward_plans(
    career_job_id,enabled,reward_model,qualifying_event_count,event_rewards,retention_enabled,retention_months,
    retention_reward_kind,retention_rate_percent,retention_fixed_amount,currency,payout_hold_days,updated_by,updated_at
  ) values(
    p_job_id,coalesce(p_enabled,false),v_model,greatest(1,least(3,coalesce(p_qualifying_event_count,3))),coalesce(p_event_rewards,'[]'::jsonb),
    coalesce(p_retention_enabled,true),greatest(1,least(60,coalesce(p_retention_months,6))),v_ret_kind,
    greatest(0,least(100,coalesce(p_retention_rate_percent,0))),greatest(0,coalesce(p_retention_fixed_amount,0)),
    coalesce(nullif(upper(left(trim(coalesce(p_currency,'')),3)),''),'USD'),
    case when p_payout_hold_days is null then null else greatest(0,least(180,p_payout_hold_days)) end,auth.uid(),now()
  )
  on conflict (career_job_id) do update set
    enabled=excluded.enabled,reward_model=excluded.reward_model,qualifying_event_count=excluded.qualifying_event_count,
    event_rewards=excluded.event_rewards,retention_enabled=excluded.retention_enabled,retention_months=excluded.retention_months,
    retention_reward_kind=excluded.retention_reward_kind,retention_rate_percent=excluded.retention_rate_percent,
    retention_fixed_amount=excluded.retention_fixed_amount,currency=excluded.currency,payout_hold_days=excluded.payout_hold_days,
    updated_by=auth.uid(),updated_at=now()
  returning * into v_row;

  perform public.admin_refresh_talent_partner_rewards();
  return to_jsonb(v_row);
end;
$$;

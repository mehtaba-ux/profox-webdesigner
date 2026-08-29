-- ProFox Talent Partner Program: post-activation first-three Sales reward engine.

create or replace function public.talent_partner_generate_sale_reward(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_pay public.payments%rowtype;
  v_ref public.talent_partner_referrals%rowtype;
  v_plan public.talent_partner_reward_plans%rowtype;
  v_rank integer;
  v_first_payment public.payments%rowtype;
  v_rule jsonb;
  v_amount numeric;
  v_hold integer;
  v_id uuid;
  v_payment_time timestamptz;
begin
  select * into v_pay from public.payments where id=p_payment_id;
  if not found or v_pay.status<>'Verified' or v_pay.quotation_id is null or v_pay.salesperson_id is null then return null; end if;

  select * into v_ref
  from public.talent_partner_referrals
  where referred_user_id=v_pay.salesperson_id and status in ('Activated','Retained')
  order by activated_at nulls last,attributed_at
  limit 1;
  if not found or v_ref.activated_at is null then return null; end if;

  v_payment_time:=coalesce(v_pay.verified_at,v_pay.paid_at,v_pay.created_at);
  if v_payment_time < v_ref.activated_at then return null; end if;

  select * into v_plan from public.talent_partner_reward_plans where career_job_id=v_ref.career_job_id;
  if not found or not v_plan.enabled or v_plan.reward_model<>'sales' then return null; end if;

  with first_verified as (
    select quotation_id,min(coalesce(verified_at,paid_at,created_at)) first_at
    from public.payments
    where salesperson_id=v_pay.salesperson_id
      and status='Verified'
      and quotation_id is not null
      and coalesce(verified_at,paid_at,created_at)>=v_ref.activated_at
    group by quotation_id
  ), ranked as (
    select quotation_id,row_number() over(order by first_at,quotation_id)::integer sale_rank
    from first_verified
  )
  select sale_rank into v_rank from ranked where quotation_id=v_pay.quotation_id;

  if v_rank is null or v_rank>least(3,v_plan.qualifying_event_count) then return null; end if;
  if exists(
    select 1 from public.talent_partner_reward_entries
    where referral_id=v_ref.id and event_type='sale' and source_quotation_id=v_pay.quotation_id
  ) then
    select id into v_id
    from public.talent_partner_reward_entries
    where referral_id=v_ref.id and event_type='sale' and source_quotation_id=v_pay.quotation_id;
    return v_id;
  end if;

  select * into v_first_payment
  from public.payments
  where salesperson_id=v_pay.salesperson_id
    and quotation_id=v_pay.quotation_id
    and status='Verified'
    and coalesce(verified_at,paid_at,created_at)>=v_ref.activated_at
  order by coalesce(verified_at,paid_at,created_at),created_at
  limit 1;
  if not found then return null; end if;

  v_rule:=public.talent_partner_event_rule(
    v_plan,v_rank,coalesce(nullif(v_first_payment.amount_paid,0),v_first_payment.amount_due)
  );
  if not coalesce((v_rule->>'configured')::boolean,false) then return null; end if;
  v_amount:=(v_rule->>'amount')::numeric;

  select coalesce(v_plan.payout_hold_days,s.payout_hold_days) into v_hold
  from public.talent_partner_program_settings s where s.id='default';

  insert into public.talent_partner_reward_entries(
    referral_id,partner_user_id,career_job_id,event_type,event_rank,
    source_payment_id,source_quotation_id,eligible_amount,currency,reward_kind,rate_percent,fixed_amount,reward_amount,
    status,available_at,rule_snapshot
  ) values(
    v_ref.id,v_ref.partner_user_id,v_ref.career_job_id,'sale',v_rank,
    v_first_payment.id,v_pay.quotation_id,
    coalesce(nullif(v_first_payment.amount_paid,0),v_first_payment.amount_due),
    coalesce(v_first_payment.currency,v_plan.currency),
    v_rule->>'kind',(v_rule->>'ratePercent')::numeric,(v_rule->>'fixedAmount')::numeric,v_amount,
    'Pending',now()+make_interval(days=>coalesce(v_hold,0)),
    jsonb_build_object('planId',v_plan.id,'rank',v_rank,'rule',v_rule,'activationAt',v_ref.activated_at,'capturedAt',now())
  ) returning id into v_id;

  perform public.talent_partner_notify(
    v_ref.partner_user_id,'reward','Referral reward earned',
    'Your referred seller completed qualifying sale #'||v_rank::text||'. A reward of '||coalesce(v_first_payment.currency,v_plan.currency)||' '||to_char(v_amount,'FM999999990.00')||' is pending the configured payout controls.',
    '/talent-partner','tp-sale-reward:'||v_id::text
  );
  return v_id;
end;
$$;

create or replace function public.talent_partner_payment_reward_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.status='Verified' and (tg_op='INSERT' or old.status is distinct from 'Verified') then
    perform public.talent_partner_generate_sale_reward(new.id);
  elsif tg_op='UPDATE' and old.status='Verified' and new.status is distinct from 'Verified' then
    update public.talent_partner_reward_entries
    set status='Reversed',reversal_reason='Source payment is no longer Verified.',reversed_at=now(),updated_at=now()
    where event_type='sale'
      and source_payment_id=new.id
      and status in ('Pending','Approved');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_talent_partner_payment_reward on public.payments;
create trigger trg_talent_partner_payment_reward
after insert or update of status on public.payments
for each row execute function public.talent_partner_payment_reward_trigger();
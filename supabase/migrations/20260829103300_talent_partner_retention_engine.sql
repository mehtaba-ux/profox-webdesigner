-- ProFox Talent Partner Program: six-month retention and salary-conversion reward engine.

create or replace function public.talent_partner_create_retention_reward(p_transition_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_t public.talent_partner_salary_transitions%rowtype;
  v_ref public.talent_partner_referrals%rowtype;
  v_plan public.talent_partner_reward_plans%rowtype;
  v_amount numeric:=0;
  v_hold integer;
  v_id uuid;
begin
  select * into v_t from public.talent_partner_salary_transitions where id=p_transition_id for update;
  if not found or v_t.status='Cancelled' then return null; end if;

  select * into v_ref from public.talent_partner_referrals where id=v_t.referral_id for update;
  select * into v_plan from public.talent_partner_reward_plans where career_job_id=v_ref.career_job_id;
  if not found or not v_plan.enabled or not v_plan.retention_enabled then return null; end if;
  if current_date<v_t.qualifying_date or current_date<v_t.effective_date then return null; end if;
  if not exists(select 1 from public.user_profiles where id=v_t.worker_user_id and status='active') then return null; end if;

  if v_plan.retention_reward_kind='fixed' then
    v_amount:=v_plan.retention_fixed_amount;
  else
    if coalesce(v_t.monthly_salary,0)<=0 then return null; end if;
    v_amount:=round(v_t.monthly_salary*v_plan.retention_rate_percent/100.0,2);
  end if;

  if coalesce(v_amount,0)<=0 then return null; end if;
  if exists(select 1 from public.talent_partner_reward_entries where referral_id=v_ref.id and event_type='retention') then
    select id into v_id from public.talent_partner_reward_entries where referral_id=v_ref.id and event_type='retention';
    return v_id;
  end if;

  select coalesce(v_plan.payout_hold_days,s.payout_hold_days) into v_hold
  from public.talent_partner_program_settings s where s.id='default';

  insert into public.talent_partner_reward_entries(
    referral_id,partner_user_id,career_job_id,event_type,event_rank,source_salary_transition_id,
    eligible_amount,currency,reward_kind,rate_percent,fixed_amount,reward_amount,status,available_at,rule_snapshot
  ) values(
    v_ref.id,v_ref.partner_user_id,v_ref.career_job_id,'retention',null,v_t.id,
    v_t.monthly_salary,v_t.currency,v_plan.retention_reward_kind,v_plan.retention_rate_percent,v_plan.retention_fixed_amount,v_amount,
    'Pending',now()+make_interval(days=>coalesce(v_hold,0)),
    jsonb_build_object('planId',v_plan.id,'retentionMonths',v_plan.retention_months,'qualifyingDate',v_t.qualifying_date,'capturedAt',now())
  ) returning id into v_id;

  update public.talent_partner_salary_transitions
  set status='Qualified',qualified_at=now(),updated_at=now()
  where id=v_t.id;

  update public.talent_partner_referrals
  set status='Retained',updated_at=now()
  where id=v_ref.id;

  perform public.talent_partner_notify(
    v_ref.partner_user_id,'retention','Final retention reward earned',
    'Your referred team member reached the configured retention milestone and their salary transition is active. Your final Talent Partner reward is now pending payout controls.',
    '/talent-partner','tp-retention-reward:'||v_id::text
  );

  return v_id;
end;
$$;

create or replace function public.talent_partner_record_salary_transition_internal(
  p_referral_id uuid,
  p_effective_date date,
  p_monthly_salary numeric,
  p_currency text,
  p_source_type text,
  p_source_review_id uuid,
  p_approved_by uuid,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_ref public.talent_partner_referrals%rowtype;
  v_plan public.talent_partner_reward_plans%rowtype;
  v_id uuid;
  v_qualifying date;
begin
  select * into v_ref from public.talent_partner_referrals where id=p_referral_id for update;
  if not found or v_ref.referred_user_id is null or v_ref.activated_at is null then return null; end if;

  select * into v_plan from public.talent_partner_reward_plans where career_job_id=v_ref.career_job_id;
  if not found or not v_plan.enabled or not v_plan.retention_enabled then return null; end if;

  v_qualifying:=(v_ref.activated_at + make_interval(months=>v_plan.retention_months))::date;

  insert into public.talent_partner_salary_transitions(
    referral_id,worker_user_id,source_type,source_review_id,effective_date,qualifying_date,monthly_salary,currency,status,approved_by,notes
  ) values(
    v_ref.id,v_ref.referred_user_id,
    case when p_source_type='sales_career_progression' then 'sales_career_progression' else 'admin' end,
    p_source_review_id,coalesce(p_effective_date,current_date),v_qualifying,
    case when p_monthly_salary is null then null else greatest(0,p_monthly_salary) end,
    coalesce(nullif(upper(trim(coalesce(p_currency,''))),''),v_plan.currency),
    'Scheduled',p_approved_by,nullif(left(trim(coalesce(p_notes,'')),3000),'')
  )
  on conflict (referral_id) do update
  set source_type=excluded.source_type,
      source_review_id=coalesce(excluded.source_review_id,public.talent_partner_salary_transitions.source_review_id),
      effective_date=excluded.effective_date,
      monthly_salary=coalesce(excluded.monthly_salary,public.talent_partner_salary_transitions.monthly_salary),
      currency=excluded.currency,
      approved_by=coalesce(excluded.approved_by,public.talent_partner_salary_transitions.approved_by),
      notes=coalesce(excluded.notes,public.talent_partner_salary_transitions.notes),
      status=case when public.talent_partner_salary_transitions.status='Cancelled' then 'Scheduled' else public.talent_partner_salary_transitions.status end,
      updated_at=now()
  returning id into v_id;

  perform public.talent_partner_create_retention_reward(v_id);
  return v_id;
end;
$$;

create or replace function public.admin_record_talent_partner_salary_transition(
  p_referral_id uuid,
  p_effective_date date,
  p_monthly_salary numeric default null,
  p_currency text default 'USD',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  v_id:=public.talent_partner_record_salary_transition_internal(
    p_referral_id,coalesce(p_effective_date,current_date),p_monthly_salary,p_currency,'admin',null,auth.uid(),p_notes
  );
  if v_id is null then raise exception 'This referral is not eligible for a configured retention transition.'; end if;
  return jsonb_build_object('success',true,'transitionId',v_id);
end;
$$;

create or replace function public.talent_partner_sales_progression_retention_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_referral_id uuid;
begin
  if new.status='Accepted' and old.status is distinct from 'Accepted' then
    select id into v_referral_id
    from public.talent_partner_referrals
    where referred_user_id=new.salesperson_id and status in ('Activated','Retained')
    order by activated_at nulls last,attributed_at
    limit 1;

    if v_referral_id is not null then
      perform public.talent_partner_record_salary_transition_internal(
        v_referral_id,current_date,new.proposal_monthly_salary,coalesce(new.proposal_currency,'USD'),
        'sales_career_progression',new.id,new.reviewed_by,new.review_notes
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_talent_partner_sales_progression_retention on public.sales_career_progression_reviews;
create trigger trg_talent_partner_sales_progression_retention
after update of status on public.sales_career_progression_reviews
for each row execute function public.talent_partner_sales_progression_retention_trigger();
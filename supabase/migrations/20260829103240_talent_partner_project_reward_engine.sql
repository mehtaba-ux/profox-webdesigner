-- ProFox Talent Partner Program: first-three approved project reward engine.

create or replace function public.admin_approve_talent_partner_project_reward(
  p_referral_id uuid,
  p_project_id uuid,
  p_worker_payment_amount numeric,
  p_currency text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_ref public.talent_partner_referrals%rowtype;
  v_plan public.talent_partner_reward_plans%rowtype;
  v_project public.projects%rowtype;
  v_rank integer;
  v_rule jsonb;
  v_qid uuid;
  v_reward_id uuid;
  v_hold integer;
  v_currency text:=upper(trim(coalesce(p_currency,'')));
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_worker_payment_amount is null or p_worker_payment_amount<=0 then
    raise exception 'A positive approved worker payment amount is required.';
  end if;
  if v_currency='' then raise exception 'Currency is required.'; end if;

  select * into v_ref from public.talent_partner_referrals where id=p_referral_id for update;
  if not found or v_ref.referred_user_id is null or v_ref.status not in ('Activated','Retained') then
    raise exception 'An activated referred worker is required.';
  end if;

  select * into v_plan from public.talent_partner_reward_plans where career_job_id=v_ref.career_job_id;
  if not found or not v_plan.enabled or v_plan.reward_model<>'project' then
    raise exception 'The job does not have an active project reward plan.';
  end if;

  select * into v_project from public.projects where id=p_project_id;
  if not found or v_project.status<>'Completed' or v_project.stage<>'Completed' or v_project.completed_at is null then
    raise exception 'Only a fully completed project can qualify.';
  end if;
  if not exists(select 1 from public.project_team where project_id=p_project_id and user_id=v_ref.referred_user_id) then
    raise exception 'The referred worker is not assigned to this project.';
  end if;
  if exists(select 1 from public.talent_partner_qualifying_projects where referral_id=v_ref.id and project_id=p_project_id) then
    raise exception 'This project has already been counted for this referral.';
  end if;

  select count(*)+1 into v_rank from public.talent_partner_qualifying_projects where referral_id=v_ref.id;
  if v_rank>least(3,v_plan.qualifying_event_count) then
    raise exception 'The configured number of qualifying project rewards has already been reached.';
  end if;

  v_rule:=public.talent_partner_event_rule(v_plan,v_rank,p_worker_payment_amount);
  if not coalesce((v_rule->>'configured')::boolean,false) then
    raise exception 'Reward #% is not configured with a positive amount or percentage.', v_rank;
  end if;

  insert into public.talent_partner_qualifying_projects(
    referral_id,project_id,worker_user_id,qualifying_rank,worker_payment_amount,currency,approved_by,notes
  ) values(
    v_ref.id,p_project_id,v_ref.referred_user_id,v_rank,p_worker_payment_amount,v_currency,auth.uid(),nullif(left(trim(coalesce(p_notes,'')),3000),'')
  ) returning id into v_qid;

  select coalesce(v_plan.payout_hold_days,s.payout_hold_days) into v_hold
  from public.talent_partner_program_settings s where s.id='default';

  insert into public.talent_partner_reward_entries(
    referral_id,partner_user_id,career_job_id,event_type,event_rank,source_project_id,eligible_amount,currency,
    reward_kind,rate_percent,fixed_amount,reward_amount,status,available_at,rule_snapshot
  ) values(
    v_ref.id,v_ref.partner_user_id,v_ref.career_job_id,'project',v_rank,p_project_id,p_worker_payment_amount,v_currency,
    v_rule->>'kind',(v_rule->>'ratePercent')::numeric,(v_rule->>'fixedAmount')::numeric,(v_rule->>'amount')::numeric,
    'Pending',now()+make_interval(days=>coalesce(v_hold,0)),
    jsonb_build_object('planId',v_plan.id,'qualifyingProjectId',v_qid,'rank',v_rank,'rule',v_rule,'capturedAt',now())
  ) returning id into v_reward_id;

  perform public.talent_partner_notify(
    v_ref.partner_user_id,'reward','Project referral reward earned',
    'Your referred team member completed qualifying project #'||v_rank::text||'. The reward is now pending the configured payout controls.',
    '/talent-partner','tp-project-reward:'||v_reward_id::text
  );

  return jsonb_build_object('success',true,'rank',v_rank,'rewardId',v_reward_id);
end;
$$;
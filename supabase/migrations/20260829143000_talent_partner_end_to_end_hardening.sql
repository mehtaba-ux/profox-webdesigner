-- Talent Partner end-to-end hardening
-- Reuses the canonical recruitment, project, notification, reward and payout systems.

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
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row public.talent_partner_reward_plans%rowtype;
  v_model text := lower(trim(coalesce(p_reward_model,'')));
  v_ret_kind text := lower(trim(coalesce(p_retention_reward_kind,'')));
  v_rewards jsonb := coalesce(p_event_rewards,'[]'::jsonb);
  v_required integer := greatest(1,least(3,coalesce(p_qualifying_event_count,3)));
  v_rank integer;
  v_rule jsonb;
  v_kind text;
  v_rate numeric;
  v_fixed numeric;
  v_currency text := upper(trim(coalesce(p_currency,'')));
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if not exists(select 1 from public.career_jobs where id=p_job_id) then raise exception 'Job not found.'; end if;
  if v_model not in ('sales','project','none') then raise exception 'Invalid reward model.'; end if;
  if v_ret_kind not in ('percent','fixed') then raise exception 'Invalid retention reward type.'; end if;
  if jsonb_typeof(v_rewards)<>'array' then raise exception 'Event rewards must be an array.'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a three-letter code.'; end if;

  -- An enabled plan must be financially usable. Do not allow a public/admin state that says
  -- "enabled" while the reward engine later has to reject zero or missing rules.
  if coalesce(p_enabled,false) then
    if v_model='none' then raise exception 'A reward plan with model none cannot be enabled.'; end if;

    for v_rank in 1..v_required loop
      select value into v_rule
      from jsonb_array_elements(v_rewards)
      where coalesce(value->>'rank','') ~ '^[0-9]+$'
        and (value->>'rank')::integer=v_rank
      limit 1;

      if v_rule is null then
        raise exception 'Reward #% must be configured before the plan can be enabled.', v_rank;
      end if;

      v_kind := lower(trim(coalesce(v_rule->>'kind','')));
      if v_kind not in ('percent','fixed') then
        raise exception 'Reward #% has an invalid reward type.', v_rank;
      end if;

      if v_kind='percent' then
        begin v_rate := coalesce((v_rule->>'ratePercent')::numeric,0); exception when others then v_rate:=0; end;
        if v_rate<=0 or v_rate>100 then
          raise exception 'Reward #% needs a percentage greater than 0 and no more than 100.', v_rank;
        end if;
      else
        begin v_fixed := coalesce((v_rule->>'fixedAmount')::numeric,0); exception when others then v_fixed:=0; end;
        if v_fixed<=0 then
          raise exception 'Reward #% needs a positive fixed amount.', v_rank;
        end if;
      end if;
    end loop;

    if coalesce(p_retention_enabled,true) then
      if v_ret_kind='percent' and (coalesce(p_retention_rate_percent,0)<=0 or p_retention_rate_percent>100) then
        raise exception 'An enabled retention percentage reward must be greater than 0 and no more than 100.';
      end if;
      if v_ret_kind='fixed' and coalesce(p_retention_fixed_amount,0)<=0 then
        raise exception 'An enabled fixed retention reward must have a positive amount.';
      end if;
    end if;
  end if;

  insert into public.talent_partner_reward_plans(
    career_job_id,enabled,reward_model,qualifying_event_count,event_rewards,retention_enabled,retention_months,
    retention_reward_kind,retention_rate_percent,retention_fixed_amount,currency,payout_hold_days,updated_by,updated_at
  ) values(
    p_job_id,coalesce(p_enabled,false),v_model,v_required,v_rewards,
    coalesce(p_retention_enabled,true),greatest(1,least(60,coalesce(p_retention_months,6))),v_ret_kind,
    greatest(0,least(100,coalesce(p_retention_rate_percent,0))),greatest(0,coalesce(p_retention_fixed_amount,0)),
    v_currency,
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
$function$;

revoke all on function public.admin_save_talent_partner_reward_plan(uuid,boolean,text,integer,jsonb,boolean,integer,text,numeric,numeric,text,integer) from public, anon;
grant execute on function public.admin_save_talent_partner_reward_plan(uuid,boolean,text,integer,jsonb,boolean,integer,text,numeric,numeric,text,integer) to authenticated;

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
set search_path to 'public', 'pg_temp'
as $function$
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
  if p_worker_payment_amount is null or p_worker_payment_amount<=0 then raise exception 'A positive approved worker payment amount is required.'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a three-letter code.'; end if;

  select * into v_ref from public.talent_partner_referrals where id=p_referral_id for update;
  if not found or v_ref.referred_user_id is null or v_ref.status not in ('Activated','Retained') then
    raise exception 'An activated referred worker is required.';
  end if;

  select * into v_plan from public.talent_partner_reward_plans where career_job_id=v_ref.career_job_id;
  if not found or not v_plan.enabled or v_plan.reward_model<>'project' then raise exception 'The job does not have an active project reward plan.'; end if;

  select * into v_project from public.projects where id=p_project_id;
  if not found or v_project.status<>'Completed' or v_project.stage<>'Completed' or v_project.completed_at is null then
    raise exception 'Only a fully completed project can qualify.';
  end if;
  if v_ref.activated_at is null or v_project.completed_at < v_ref.activated_at then
    raise exception 'Only projects completed after the referred worker was activated can qualify.';
  end if;
  if not exists(
    select 1 from public.project_team
    where project_id=p_project_id
      and user_id=v_ref.referred_user_id
      and coalesce(assigned_at,'-infinity'::timestamptz)<=v_project.completed_at
  ) then
    raise exception 'The referred worker must have been assigned to the project before it was completed.';
  end if;
  if exists(select 1 from public.talent_partner_qualifying_projects where referral_id=v_ref.id and project_id=p_project_id) then
    raise exception 'This project has already been counted for this referral.';
  end if;

  select count(*)+1 into v_rank from public.talent_partner_qualifying_projects where referral_id=v_ref.id;
  if v_rank>least(3,v_plan.qualifying_event_count) then raise exception 'The configured number of qualifying project rewards has already been reached.'; end if;
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
$function$;

revoke all on function public.admin_approve_talent_partner_project_reward(uuid,uuid,numeric,text,text) from public, anon;
grant execute on function public.admin_approve_talent_partner_project_reward(uuid,uuid,numeric,text,text) to authenticated;

create or replace function public.talent_partner_queue_project_reward_reviews(p_project_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_project public.projects%rowtype;
  v_item record;
  v_count integer:=0;
begin
  select * into v_project from public.projects where id=p_project_id;
  if not found or v_project.status<>'Completed' or v_project.stage<>'Completed' or v_project.completed_at is null then
    return 0;
  end if;

  for v_item in
    select distinct r.id referral_id,r.partner_user_id,r.referred_user_id,r.activated_at,r.career_job_id,
           p.project_number,p.project_name,cj.title job_title
    from public.project_team pt
    join public.talent_partner_referrals r on r.referred_user_id=pt.user_id and r.status in ('Activated','Retained')
    join public.talent_partner_reward_plans rp on rp.career_job_id=r.career_job_id and rp.enabled and rp.reward_model='project'
    join public.career_jobs cj on cj.id=r.career_job_id
    join public.projects p on p.id=pt.project_id
    where pt.project_id=p_project_id
      and r.activated_at is not null
      and p.completed_at>=r.activated_at
      and coalesce(pt.assigned_at,'-infinity'::timestamptz)<=p.completed_at
      and not exists(
        select 1 from public.talent_partner_qualifying_projects qp
        where qp.referral_id=r.id and qp.project_id=p.id
      )
      and (
        select count(*) from public.talent_partner_qualifying_projects qp where qp.referral_id=r.id
      ) < least(3,rp.qualifying_event_count)
  loop
    perform public.service_queue_active_admins_operational_notification(
      'talent-partner-project-reward-review:'||v_item.referral_id::text||':'||p_project_id::text,
      'talent_partner_project_reward_review',
      'talent_partner_project_reward_review',
      'Talent Partner project reward review',
      'A referred '||coalesce(v_item.job_title,'project worker')||' completed '||coalesce(v_item.project_number,v_item.project_name,'a project')||'. Verify the worker payable amount before approving the Talent Partner reward.',
      '/admin/talent-partners',
      jsonb_build_object(
        'notificationCategory','Finance',
        'notificationModule','Talent Partners',
        'notificationPriority','high',
        'referralId',v_item.referral_id,
        'projectId',p_project_id,
        'referredUserId',v_item.referred_user_id,
        'careerJobId',v_item.career_job_id
      ),
      now()
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.talent_partner_queue_project_reward_reviews(uuid) from public, anon, authenticated;
grant execute on function public.talent_partner_queue_project_reward_reviews(uuid) to service_role;

create or replace function public.talent_partner_project_completion_review_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status='Completed' and new.stage='Completed' and new.completed_at is not null then
    perform public.talent_partner_queue_project_reward_reviews(new.id);
  end if;
  return new;
end;
$function$;

create or replace function public.talent_partner_project_team_review_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.project_id is not null then
    perform public.talent_partner_queue_project_reward_reviews(new.project_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_talent_partner_project_completed_review on public.projects;
create trigger trg_talent_partner_project_completed_review
after insert or update of status,stage,completed_at on public.projects
for each row execute function public.talent_partner_project_completion_review_trigger();

drop trigger if exists trg_talent_partner_project_team_review on public.project_team;
create trigger trg_talent_partner_project_team_review
after insert or update of project_id,user_id,assigned_at on public.project_team
for each row execute function public.talent_partner_project_team_review_trigger();

-- Publish baseline, non-financial program guidance. These are global resources and can be
-- edited/replaced from the existing Talent Partner Admin resource management UI.
insert into public.talent_partner_resources(title,resource_type,content,enabled,sort_order)
select 'Talent Partner Program Rules','copy',
'Talent Partners promote approved ProFox career opportunities and introduce suitable candidates. ProFox alone controls screening, assessment, agreements, onboarding, activation, compensation decisions and access. Referral ownership follows the first valid server-recorded attribution and cannot be promised or reassigned by a Talent Partner.',true,10
where not exists(select 1 from public.talent_partner_resources where lower(title)=lower('Talent Partner Program Rules'));

insert into public.talent_partner_resources(title,resource_type,content,enabled,sort_order)
select 'Approved Referral Practices','copy',
'Share only the referral links and role information available in your Talent Partner portal. Use accurate role descriptions, target people who genuinely match the published requirements, and never use deceptive ads, spam, impersonation, purchased candidate data or misleading earning/employment claims.',true,20
where not exists(select 1 from public.talent_partner_resources where lower(title)=lower('Approved Referral Practices'));

insert into public.talent_partner_resources(title,resource_type,content,enabled,sort_order)
select 'Candidate Quality Checklist','copy',
'Before sharing a role, confirm the person appears relevant to the published position, has the required professional background or portfolio evidence, can work in the stated engagement model and location/time requirements, and understands they must complete ProFox''s normal recruitment process. Quality referrals matter more than volume.',true,30
where not exists(select 1 from public.talent_partner_resources where lower(title)=lower('Candidate Quality Checklist'));

insert into public.talent_partner_resources(title,resource_type,content,enabled,sort_order)
select 'Candidate Privacy & Data Boundaries','copy',
'Do not collect CVs, identity documents, assessment answers, passwords, private client material or sensitive candidate records for ProFox. Send candidates to the official ProFox application link so their information enters the protected recruitment workflow. Your portal intentionally shows only privacy-safe progress.',true,40
where not exists(select 1 from public.talent_partner_resources where lower(title)=lower('Candidate Privacy & Data Boundaries'));

insert into public.talent_partner_resources(title,resource_type,content,enabled,sort_order)
select 'Reward Qualification Guide','copy',
'A referral alone does not guarantee a reward. A reward is created only when the applicable Admin-configured plan is enabled and the referred worker reaches the required qualifying event. Sales rewards use verified paid sales. Project-role rewards require a completed project, valid worker assignment and an Admin-approved worker payable amount. Duplicate events and events outside the configured limits do not qualify.',true,50
where not exists(select 1 from public.talent_partner_resources where lower(title)=lower('Reward Qualification Guide'));

insert into public.talent_partner_resources(title,resource_type,content,enabled,sort_order)
select 'Payout & Verification Guide','copy',
'Financial account details are not required during registration. After an eligible reward is approved, use Secure Payout Setup to submit your payout method and complete account details. Details are encrypted and must be verified before a payout batch can use them. Changing verified details requires verification again. A payout is marked Paid only after ProFox records the real external transaction/reference.',true,60
where not exists(select 1 from public.talent_partner_resources where lower(title)=lower('Payout & Verification Guide'));

insert into public.talent_partner_resources(title,resource_type,content,enabled,sort_order)
select 'What Talent Partners Must Not Promise','copy',
'Never promise that a candidate will be hired, selected, certified, activated, paid a salary, granted system access or guaranteed any level of earnings. Never quote a Talent Partner reward that is not currently shown by an enabled ProFox reward plan. When unsure, direct the candidate to the official role page or ProFox recruitment team.',true,70
where not exists(select 1 from public.talent_partner_resources where lower(title)=lower('What Talent Partners Must Not Promise'));

create or replace function public.admin_get_talent_partner_readiness()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_resources integer;
  v_plans integer;
  v_enabled_plans integer;
  v_active_partners integer;
  v_pending_reviews integer;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;

  select count(*) into v_resources from public.talent_partner_resources where enabled;
  select count(*) into v_plans from public.talent_partner_reward_plans;
  select count(*) into v_enabled_plans from public.talent_partner_reward_plans where enabled;
  select count(*) into v_active_partners from public.talent_partner_profiles where status='Active';

  select count(*) into v_pending_reviews
  from public.projects p
  join public.project_team pt on pt.project_id=p.id
  join public.talent_partner_referrals r on r.referred_user_id=pt.user_id and r.status in ('Activated','Retained')
  join public.talent_partner_reward_plans rp on rp.career_job_id=r.career_job_id and rp.enabled and rp.reward_model='project'
  where p.status='Completed' and p.stage='Completed' and p.completed_at is not null
    and r.activated_at is not null and p.completed_at>=r.activated_at
    and coalesce(pt.assigned_at,'-infinity'::timestamptz)<=p.completed_at
    and not exists(select 1 from public.talent_partner_qualifying_projects qp where qp.referral_id=r.id and qp.project_id=p.id)
    and (select count(*) from public.talent_partner_qualifying_projects qp where qp.referral_id=r.id)<least(3,rp.qualifying_event_count);

  return jsonb_build_object(
    'resourcesPublished',v_resources,
    'rewardPlans',v_plans,
    'enabledRewardPlans',v_enabled_plans,
    'activePartners',v_active_partners,
    'pendingProjectRewardReviews',v_pending_reviews,
    'verifiedPayoutProfileRequired',true,
    'automaticExternalSettlementConfigured',false,
    'settlementMode','manual_external_with_reference',
    'readyForLiveRewards',(v_resources>0 and v_enabled_plans>0)
  );
end;
$function$;

revoke all on function public.admin_get_talent_partner_readiness() from public, anon;
grant execute on function public.admin_get_talent_partner_readiness() to authenticated;

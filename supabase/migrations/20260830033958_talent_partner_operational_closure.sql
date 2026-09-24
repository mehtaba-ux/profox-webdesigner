-- Talent Partner operational closure
-- Corrects reward configuration, automates retention, hardens tracking and
-- privileged helpers, and adds auditable settlement/recovery controls.

-- A sales career may never silently use the project-completion reward engine.
update public.talent_partner_reward_plans rp
set reward_model='sales',updated_at=now()
from public.career_jobs j
where j.id=rp.career_job_id
  and (j.application_type='sales_representative' or j.slug='independent-sales-representative')
  and rp.reward_model is distinct from 'sales';

create or replace function public.talent_partner_validate_role_reward_model()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare v_application_type text; v_slug text;
begin
  select application_type,slug into v_application_type,v_slug
  from public.career_jobs where id=new.career_job_id;
  if (v_application_type='sales_representative' or v_slug='independent-sales-representative')
     and new.enabled and new.reward_model<>'sales' then
    raise exception 'Sales representative reward plans must use the sales reward model.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_talent_partner_validate_role_reward_model on public.talent_partner_reward_plans;
create trigger trg_talent_partner_validate_role_reward_model
before insert or update of career_job_id,enabled,reward_model on public.talent_partner_reward_plans
for each row execute function public.talent_partner_validate_role_reward_model();

-- Normalize reward currency at the ledger boundary. Fixed rewards always use
-- the plan currency; percentage rewards use the authoritative source currency.
create or replace function public.talent_partner_reward_integrity_guard()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_plan public.talent_partner_reward_plans%rowtype;
  v_amount numeric;
  v_currency text;
  v_currency_count integer;
begin
  select * into v_plan from public.talent_partner_reward_plans where career_job_id=new.career_job_id;
  if not found then raise exception 'Talent Partner reward plan not found.'; end if;

  if new.event_type='project' and new.source_project_id is not null
     and to_regclass('public.worker_earnings') is not null then
    execute $sql$
      select coalesce(sum(amount),0),min(upper(currency)),count(distinct upper(currency))
      from public.worker_earnings
      where project_id=$1 and writer_user_id=(select referred_user_id from public.talent_partner_referrals where id=$2)
        and status in ('On Hold','Payable','Scheduled','Paid') and reversed_at is null
    $sql$ into v_amount,v_currency,v_currency_count using new.source_project_id,new.referral_id;
    if v_amount>0 then
      if v_currency_count<>1 then raise exception 'Authoritative worker earnings for this project span multiple currencies.'; end if;
      new.eligible_amount:=round(v_amount,2);
      if new.reward_kind='percent' then
        new.currency:=v_currency;
        new.reward_amount:=round(v_amount*coalesce(new.rate_percent,0)/100.0,2);
      end if;
      new.rule_snapshot:=coalesce(new.rule_snapshot,'{}'::jsonb)||jsonb_build_object(
        'authoritativeWorkerEarning',true,'authoritativeAmount',round(v_amount,2),'authoritativeCurrency',v_currency
      );
    end if;
  end if;

  if new.reward_kind='fixed' then
    new.currency:=upper(v_plan.currency);
    new.reward_amount:=round(coalesce(new.fixed_amount,0),2);
  else
    new.currency:=upper(new.currency);
    new.reward_amount:=round(new.reward_amount,2);
  end if;
  if new.currency !~ '^[A-Z]{3}$' or new.reward_amount<=0 then
    raise exception 'Reward currency and amount are invalid.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_talent_partner_reward_integrity_guard on public.talent_partner_reward_entries;
create trigger trg_talent_partner_reward_integrity_guard
before insert or update of career_job_id,event_type,source_project_id,eligible_amount,currency,reward_kind,rate_percent,fixed_amount,reward_amount
on public.talent_partner_reward_entries
for each row execute function public.talent_partner_reward_integrity_guard();

create or replace function public.talent_partner_project_payment_basis_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_amount numeric; v_currency text; v_currency_count integer;
begin
  if to_regclass('public.worker_earnings') is not null then
    execute $sql$
      select coalesce(sum(amount),0),min(upper(currency)),count(distinct upper(currency))
      from public.worker_earnings where project_id=$1 and writer_user_id=$2
        and status in ('On Hold','Payable','Scheduled','Paid') and reversed_at is null
    $sql$ into v_amount,v_currency,v_currency_count using new.project_id,new.worker_user_id;
  end if;
  if coalesce(v_amount,0)>0 then
    if v_currency_count<>1 then raise exception 'Authoritative worker earnings for this project span multiple currencies.'; end if;
    new.worker_payment_amount:=round(v_amount,2); new.currency:=v_currency;
    new.notes:=concat_ws(E'\n',nullif(new.notes,''),'Amount linked automatically to the canonical worker earning ledger.');
  elsif length(trim(coalesce(new.notes,'')))<10 then
    raise exception 'A manual project payment basis requires a clear approval or accounting reference in Notes.';
  end if;
  return new;
end; $$;
drop trigger if exists trg_talent_partner_project_payment_basis_guard on public.talent_partner_qualifying_projects;
create trigger trg_talent_partner_project_payment_basis_guard
before insert or update of worker_payment_amount,currency,notes on public.talent_partner_qualifying_projects
for each row execute function public.talent_partner_project_payment_basis_guard();

-- Existing unpaid fixed rewards are safe to normalize; settled history remains immutable.
update public.talent_partner_reward_entries e
set currency=upper(rp.currency),updated_at=now()
from public.talent_partner_reward_plans rp
where rp.career_job_id=e.career_job_id and e.reward_kind='fixed'
  and e.status in ('Pending','Approved') and e.payout_id is null
  and upper(e.currency) is distinct from upper(rp.currency);

-- Exact server-side metrics replace client totals calculated from a 5,000-row sample.
create or replace function public.admin_get_talent_partner_tracking_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  return jsonb_build_object(
    'visits',(select count(*) from public.talent_partner_visits),
    'uniqueVisitors',(select count(distinct session_id) from public.talent_partner_visits),
    'attributedApplications',(select count(*) from public.talent_partner_referrals),
    'activatedHires',(select count(*) from public.talent_partner_referrals where status in ('Activated','Retained')),
    'retainedHires',(select count(*) from public.talent_partner_referrals where status='Retained')
  );
end;
$$;

create index if not exists idx_talent_partner_visits_partner_occurred
on public.talent_partner_visits(partner_user_id,occurred_at desc);

-- One visit per partner/job/session per 30 minutes, plus rolling ceilings that
-- prevent anonymous analytics flooding without collecting visitor IP addresses.
create or replace function public.public_track_talent_partner_visit(
  p_partner_code text,p_job_slug text,p_session_id text,p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_partner public.talent_partner_profiles%rowtype;
  v_job public.career_jobs%rowtype;
  v_settings public.talent_partner_program_settings%rowtype;
  v_visit_id uuid;
  v_session text:=left(trim(coalesce(p_session_id,'')),120);
begin
  select * into v_settings from public.talent_partner_program_settings where id='default';
  if not found or not v_settings.enabled then return jsonb_build_object('success',false,'reason','disabled'); end if;
  if v_session='' or v_session !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$' then
    return jsonb_build_object('success',false,'reason','invalid_session');
  end if;
  select * into v_partner from public.talent_partner_profiles
  where upper(partner_code)=upper(trim(coalesce(p_partner_code,''))) and status='Active';
  if not found then return jsonb_build_object('success',false,'reason','invalid_partner'); end if;
  select * into v_job from public.career_jobs
  where slug=trim(coalesce(p_job_slug,'')) and status='Published' and (closes_at is null or closes_at>now()) limit 1;
  if not found then return jsonb_build_object('success',false,'reason','invalid_job'); end if;

  select id into v_visit_id from public.talent_partner_visits
  where partner_user_id=v_partner.user_id and session_id=v_session and career_job_id=v_job.id
    and occurred_at>now()-interval '30 minutes'
  order by occurred_at desc limit 1;
  if v_visit_id is not null then
    return jsonb_build_object('success',true,'visitId',v_visit_id,'deduplicated',true,
      'partnerCode',v_partner.partner_code,'attributionWindowDays',v_settings.attribution_window_days);
  end if;
  if (select count(*) from public.talent_partner_visits where session_id=v_session and occurred_at>now()-interval '1 hour')>=30
     or (select count(*) from public.talent_partner_visits where partner_user_id=v_partner.user_id and occurred_at>now()-interval '1 minute')>=1000
     or (select count(*) from public.talent_partner_visits where partner_user_id=v_partner.user_id and occurred_at>now()-interval '1 hour')>=10000 then
    return jsonb_build_object('success',false,'reason','rate_limited');
  end if;
  insert into public.talent_partner_visits(
    partner_user_id,career_job_id,referral_code,session_id,utm_source,utm_medium,utm_campaign,utm_content,
    referrer_host,landing_path,device_category,visitor_timezone,visitor_locale
  ) values(
    v_partner.user_id,v_job.id,v_partner.partner_code,v_session,
    nullif(left(trim(coalesce(p_context->>'utmSource','')),200),''),
    nullif(left(trim(coalesce(p_context->>'utmMedium','')),200),''),
    nullif(left(trim(coalesce(p_context->>'utmCampaign','')),300),''),
    nullif(left(trim(coalesce(p_context->>'utmContent','')),300),''),
    nullif(left(lower(trim(coalesce(p_context->>'referrerHost',''))),255),''),
    nullif(left(trim(coalesce(p_context->>'landingPath','')),1000),''),
    nullif(left(trim(coalesce(p_context->>'deviceCategory','')),40),''),
    nullif(left(trim(coalesce(p_context->>'timezone','')),100),''),
    nullif(left(trim(coalesce(p_context->>'locale','')),40),'')
  ) returning id into v_visit_id;
  return jsonb_build_object('success',true,'visitId',v_visit_id,'deduplicated',false,
    'partnerCode',v_partner.partner_code,'attributionWindowDays',v_settings.attribution_window_days);
end;
$$;

-- Internal reward refresh can be called safely by pg_cron; the Admin wrapper remains available.
create or replace function public.service_refresh_talent_partner_rewards()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_t record; v_p record; v_retention integer:=0; v_sales integer:=0; v_before integer; v_after integer;
begin
  select count(*) into v_before from public.talent_partner_reward_entries where event_type='sale';
  for v_p in
    select distinct on (p.salesperson_id,p.quotation_id) p.id
    from public.payments p
    join public.talent_partner_referrals r on r.referred_user_id=p.salesperson_id and r.status in ('Activated','Retained')
    join public.talent_partner_reward_plans rp on rp.career_job_id=r.career_job_id and rp.enabled and rp.reward_model='sales'
    where p.status='Verified' and p.quotation_id is not null
    order by p.salesperson_id,p.quotation_id,coalesce(p.verified_at,p.paid_at,p.created_at),p.created_at
  loop perform public.talent_partner_generate_sale_reward(v_p.id); end loop;
  select count(*) into v_after from public.talent_partner_reward_entries where event_type='sale';
  v_sales:=greatest(0,v_after-v_before);
  for v_t in select id from public.talent_partner_salary_transitions
    where status='Scheduled' and effective_date<=current_date and qualifying_date<=current_date
  loop
    if public.talent_partner_create_retention_reward(v_t.id) is not null then v_retention:=v_retention+1; end if;
  end loop;
  return jsonb_build_object('success',true,'newSaleRewards',v_sales,'retentionProcessed',v_retention);
end;
$$;

create or replace function public.admin_refresh_talent_partner_rewards()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  return public.service_refresh_talent_partner_rewards();
end; $$;

create or replace function public.talent_partner_sales_progression_retention_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_referral_id uuid;
begin
  if new.status='Accepted' and (tg_op='INSERT' or old.status is distinct from 'Accepted') then
    select id into v_referral_id from public.talent_partner_referrals
    where referred_user_id=new.salesperson_id and status in ('Activated','Retained')
    order by activated_at nulls last,attributed_at limit 1;
    if v_referral_id is not null then
      perform public.talent_partner_record_salary_transition_internal(
        v_referral_id,current_date,new.proposal_monthly_salary,coalesce(new.proposal_currency,'USD'),
        'sales_career_progression',new.id,new.reviewed_by,new.review_notes
      );
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_talent_partner_sales_progression_retention on public.sales_career_progression_reviews;
create trigger trg_talent_partner_sales_progression_retention
after insert or update of status on public.sales_career_progression_reviews
for each row execute function public.talent_partner_sales_progression_retention_trigger();

do $$
declare v_job_id bigint;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    select jobid into v_job_id from cron.job where jobname='profox-talent-partner-reward-refresh' limit 1;
    if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
    perform cron.schedule('profox-talent-partner-reward-refresh','17 * * * *','select public.service_refresh_talent_partner_rewards();');
  end if;
end; $$;

-- Audited recovery ledger for a source payment that loses verification after settlement.
create table if not exists public.talent_partner_financial_adjustments (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid not null references public.talent_partner_profiles(user_id) on delete restrict,
  reward_entry_id uuid not null references public.talent_partner_reward_entries(id) on delete restrict,
  source_payment_id uuid references public.payments(id) on delete restrict,
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  amount numeric(14,2) not null check(amount>0),
  status text not null default 'Open' check(status in ('Open','Resolved')),
  reason text not null,
  resolution text,
  resolution_reference text,
  resolved_by uuid references public.user_profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(reward_entry_id,source_payment_id)
);
alter table public.talent_partner_financial_adjustments enable row level security;
revoke all on table public.talent_partner_financial_adjustments from public,anon,authenticated;
grant select on table public.talent_partner_financial_adjustments to authenticated;
drop policy if exists talent_partner_adjustment_self_or_admin on public.talent_partner_financial_adjustments;
create policy talent_partner_adjustment_self_or_admin on public.talent_partner_financial_adjustments
for select to authenticated using(partner_user_id=(select auth.uid()) or public.is_admin());

create or replace function public.talent_partner_paid_reward_adjustment_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_reward record;
begin
  if tg_op='UPDATE' and old.status='Verified' and new.status is distinct from 'Verified' then
    for v_reward in
      select e.id,e.partner_user_id,e.currency,e.reward_amount
      from public.talent_partner_reward_entries e
      where e.event_type='sale' and e.status='Paid'
        and (e.source_payment_id=new.id or e.source_quotation_id=coalesce(new.quotation_id,old.quotation_id))
    loop
      insert into public.talent_partner_financial_adjustments(
        partner_user_id,reward_entry_id,source_payment_id,currency,amount,reason
      ) values(
        v_reward.partner_user_id,v_reward.id,new.id,upper(v_reward.currency),v_reward.reward_amount,
        'A customer payment lost verification after the related Talent Partner reward was paid.'
      ) on conflict(reward_entry_id,source_payment_id) do nothing;
      perform public.talent_partner_notify(v_reward.partner_user_id,'payout','Paid reward requires reconciliation',
        'A previously settled reward is under financial review because its source payment is no longer verified. ProFox will record the outcome without deleting your payout history.',
        '/talent-partner','tp-adjustment:'||v_reward.id::text||':'||new.id::text);
    end loop;
  end if;
  return new;
end; $$;
drop trigger if exists trg_talent_partner_paid_reward_adjustment on public.payments;
create trigger trg_talent_partner_paid_reward_adjustment
after update of status on public.payments
for each row execute function public.talent_partner_paid_reward_adjustment_trigger();

create or replace function public.talent_partner_get_my_adjustments()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',a.id,'rewardEntryId',a.reward_entry_id,'currency',a.currency,'amount',a.amount,
    'status',a.status,'reason',a.reason,'resolution',a.resolution,'resolutionReference',a.resolution_reference,
    'createdAt',a.created_at,'resolvedAt',a.resolved_at
  ) order by a.created_at desc) from public.talent_partner_financial_adjustments a where a.partner_user_id=auth.uid()),'[]'::jsonb);
end; $$;

create or replace function public.talent_partner_get_my_preserved_financials()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_currency text;
begin
  if v_uid is null or not exists(select 1 from public.talent_partner_profiles where user_id=v_uid) then
    raise exception 'Talent Partner profile not found.';
  end if;
  select coalesce(nullif(upper(tp.preferred_currency),''),s.default_currency,'USD') into v_currency
  from public.talent_partner_profiles tp left join public.talent_partner_program_settings s on s.id='default'
  where tp.user_id=v_uid;
  return jsonb_build_object(
    'stats',jsonb_build_object(
      'visits',(select count(*) from public.talent_partner_visits where partner_user_id=v_uid),
      'uniqueVisitors',(select count(distinct session_id) from public.talent_partner_visits where partner_user_id=v_uid),
      'applications',(select count(*) from public.talent_partner_referrals where partner_user_id=v_uid),
      'activatedHires',(select count(*) from public.talent_partner_referrals where partner_user_id=v_uid and status in ('Activated','Retained')),
      'retainedHires',(select count(*) from public.talent_partner_referrals where partner_user_id=v_uid and status='Retained'),
      'pendingEarnings',(select coalesce(sum(reward_amount),0) from public.talent_partner_reward_entries where partner_user_id=v_uid and status='Pending' and upper(currency)=v_currency),
      'approvedEarnings',(select coalesce(sum(reward_amount),0) from public.talent_partner_reward_entries where partner_user_id=v_uid and status='Approved' and upper(currency)=v_currency),
      'paidEarnings',(select coalesce(sum(reward_amount),0) from public.talent_partner_reward_entries where partner_user_id=v_uid and status='Paid' and upper(currency)=v_currency),
      'summaryCurrency',v_currency
    ),
    'rewards',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'eventType',e.event_type,'eventRank',e.event_rank,'eligibleAmount',e.eligible_amount,'currency',e.currency,'rewardAmount',e.reward_amount,'status',e.status,'availableAt',e.available_at,'createdAt',e.created_at,'jobTitle',j.title) order by e.created_at desc) from public.talent_partner_reward_entries e join public.career_jobs j on j.id=e.career_job_id where e.partner_user_id=v_uid),'[]'::jsonb),
    'payouts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'batchNumber',b.batch_number,'amount',p.amount,'currency',p.currency,'status',p.status,'transactionId',p.transaction_id,'paidAt',p.paid_at,'createdAt',p.created_at) order by p.created_at desc) from public.talent_partner_payouts p join public.talent_partner_payout_batches b on b.id=p.payout_batch_id where p.partner_user_id=v_uid),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'type',n.type,'title',n.title,'message',n.message,'actionPath',n.action_path,'readAt',n.read_at,'createdAt',n.created_at) order by n.created_at desc) from (select * from public.talent_partner_notifications where partner_user_id=v_uid order by created_at desc limit 50)n),'[]'::jsonb)
  );
end; $$;

create or replace function public.admin_resolve_talent_partner_adjustment(
  p_adjustment_id uuid,p_resolution text,p_reference text
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.talent_partner_financial_adjustments%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if length(trim(coalesce(p_resolution,'')))<10 or length(trim(coalesce(p_reference,'')))<3 then
    raise exception 'A clear resolution and external/accounting reference are required.';
  end if;
  update public.talent_partner_financial_adjustments set status='Resolved',resolution=left(trim(p_resolution),3000),
    resolution_reference=left(trim(p_reference),300),resolved_by=auth.uid(),resolved_at=now()
  where id=p_adjustment_id and status='Open' returning * into v_row;
  if not found then raise exception 'Open adjustment not found.'; end if;
  return to_jsonb(v_row);
end; $$;

-- A batch maker cannot also confirm the external transfer.
create or replace function public.talent_partner_payout_separation_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_creator uuid;
begin
  if new.status='Paid' and old.status is distinct from 'Paid' then
    select created_by into v_creator from public.talent_partner_payout_batches where id=new.payout_batch_id;
    if new.paid_by is null or new.paid_by=v_creator then
      raise exception 'A different active Admin must confirm this payout (maker-checker control).';
    end if;
    if exists(select 1 from public.talent_partner_financial_adjustments where partner_user_id=new.partner_user_id and status='Open') then
      raise exception 'Resolve the partner financial adjustment before confirming another payout.';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_talent_partner_payout_separation_guard on public.talent_partner_payouts;
create trigger trg_talent_partner_payout_separation_guard
before update of status on public.talent_partner_payouts
for each row execute function public.talent_partner_payout_separation_guard();

-- Final settlement for Suspended/Closed partners, using preserved verified payout details.
create or replace function public.admin_create_talent_partner_final_settlement(p_partner_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_profile public.talent_partner_profiles%rowtype; v_pp public.talent_partner_payout_profiles%rowtype;
  v_currency text; v_amount numeric; v_count integer; v_batch uuid; v_payout uuid; v_number text;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_profile from public.talent_partner_profiles where user_id=p_partner_user_id for update;
  if not found or v_profile.status not in ('Suspended','Closed') then raise exception 'Final settlement is only for Suspended or Closed partners.'; end if;
  if exists(select 1 from public.talent_partner_financial_adjustments where partner_user_id=p_partner_user_id and status='Open') then
    raise exception 'Resolve the open financial adjustment before final settlement.';
  end if;
  select * into v_pp from public.talent_partner_payout_profiles where partner_user_id=p_partner_user_id and status='Verified';
  if not found then raise exception 'A preserved verified payout profile is required.'; end if;
  if (select count(distinct upper(currency)) from public.talent_partner_reward_entries where partner_user_id=p_partner_user_id and status='Approved' and payout_id is null and available_at<=now())<>1 then
    raise exception 'Final settlement requires approved due rewards in exactly one currency.';
  end if;
  select upper(currency),sum(reward_amount),count(*) into v_currency,v_amount,v_count
  from public.talent_partner_reward_entries where partner_user_id=p_partner_user_id and status='Approved' and payout_id is null and available_at<=now()
  group by upper(currency);
  if coalesce(v_count,0)=0 then raise exception 'No approved due rewards are available for final settlement.'; end if;
  v_number:='TP-FINAL-'||v_currency||'-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  insert into public.talent_partner_payout_batches(batch_number,status,entry_count,total_amount,created_by,currency)
  values(v_number,'Ready',v_count,v_amount,auth.uid(),v_currency) returning id into v_batch;
  insert into public.talent_partner_payouts(payout_batch_id,partner_user_id,currency,amount,entry_count,status,
    payout_method_snapshot,payout_email_snapshot,payout_profile_id,payout_profile_version,payout_details_masked_snapshot)
  values(v_batch,p_partner_user_id,v_currency,v_amount,v_count,'Ready',v_pp.payout_method,
    coalesce(v_pp.masked_details->>'paypalEmail',v_pp.masked_details->>'wiseEmail',v_pp.masked_details->>'accountNumber'),
    v_pp.id,v_pp.details_version,v_pp.masked_details) returning id into v_payout;
  update public.talent_partner_reward_entries set payout_id=v_payout,updated_at=now()
  where partner_user_id=p_partner_user_id and status='Approved' and payout_id is null and available_at<=now() and upper(currency)=v_currency;
  return jsonb_build_object('success',true,'batchId',v_batch,'payoutId',v_payout,'batchNumber',v_number,'amount',v_amount,'currency',v_currency);
end; $$;

-- Internal trigger helpers are never public RPC endpoints.
revoke all on function public.talent_partner_validate_role_reward_model() from public,anon,authenticated;
revoke all on function public.talent_partner_reward_integrity_guard() from public,anon,authenticated;
revoke all on function public.talent_partner_project_payment_basis_guard() from public,anon,authenticated;
revoke all on function public.talent_partner_sales_progression_retention_trigger() from public,anon,authenticated;
revoke all on function public.talent_partner_project_completion_review_trigger() from public,anon,authenticated;
revoke all on function public.talent_partner_project_team_review_trigger() from public,anon,authenticated;
revoke all on function public.talent_partner_paid_reward_adjustment_trigger() from public,anon,authenticated;
revoke all on function public.talent_partner_payout_separation_guard() from public,anon,authenticated;
revoke all on function public.service_refresh_talent_partner_rewards() from public,anon,authenticated;
grant execute on function public.talent_partner_validate_role_reward_model() to service_role;
grant execute on function public.talent_partner_reward_integrity_guard() to service_role;
grant execute on function public.talent_partner_project_payment_basis_guard() to service_role;
grant execute on function public.talent_partner_sales_progression_retention_trigger() to service_role;
grant execute on function public.talent_partner_project_completion_review_trigger() to service_role;
grant execute on function public.talent_partner_project_team_review_trigger() to service_role;
grant execute on function public.talent_partner_paid_reward_adjustment_trigger() to service_role;
grant execute on function public.talent_partner_payout_separation_guard() to service_role;
grant execute on function public.service_refresh_talent_partner_rewards() to service_role;

revoke all on function public.admin_get_talent_partner_tracking_metrics() from public,anon,authenticated;
revoke all on function public.admin_resolve_talent_partner_adjustment(uuid,text,text) from public,anon,authenticated;
revoke all on function public.admin_create_talent_partner_final_settlement(uuid) from public,anon,authenticated;
grant execute on function public.admin_get_talent_partner_tracking_metrics() to authenticated;
grant execute on function public.admin_resolve_talent_partner_adjustment(uuid,text,text) to authenticated;
grant execute on function public.admin_create_talent_partner_final_settlement(uuid) to authenticated;

revoke all on function public.talent_partner_get_my_adjustments() from public,anon,authenticated;
grant execute on function public.talent_partner_get_my_adjustments() to authenticated;
revoke all on function public.talent_partner_get_my_preserved_financials() from public,anon,authenticated;
grant execute on function public.talent_partner_get_my_preserved_financials() to authenticated;

-- Keep public visit tracking anonymous by design; the function validates every input.
revoke all on function public.public_track_talent_partner_visit(text,text,text,jsonb) from public;
grant execute on function public.public_track_talent_partner_visit(text,text,text,jsonb) to anon,authenticated;

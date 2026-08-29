-- Talent Partner production hardening
-- Keeps the existing program architecture intact while closing access, accounting,
-- reward-reconciliation and recruitment-terminal-state gaps.

begin;

alter table public.talent_partner_program_settings
  add column if not exists minimum_payout_by_currency jsonb not null default '{}'::jsonb;

alter table public.talent_partner_program_settings
  drop constraint if exists talent_partner_program_settings_minimum_payout_by_currency_check;
alter table public.talent_partner_program_settings
  add constraint talent_partner_program_settings_minimum_payout_by_currency_check
  check (jsonb_typeof(minimum_payout_by_currency) = 'object');

alter table public.talent_partner_payout_batches
  add column if not exists currency text;

-- Safe historical backfill: only infer a batch currency when every child payout agrees.
with batch_currency as (
  select payout_batch_id,
         case when count(distinct upper(currency)) = 1 then min(upper(currency)) else null end currency
  from public.talent_partner_payouts
  group by payout_batch_id
)
update public.talent_partner_payout_batches b
set currency = x.currency
from batch_currency x
where x.payout_batch_id = b.id and b.currency is null;

alter table public.talent_partner_payout_batches
  drop constraint if exists talent_partner_payout_batches_currency_check;
alter table public.talent_partner_payout_batches
  add constraint talent_partner_payout_batches_currency_check
  check (currency is null or currency ~ '^[A-Z]{3}$');

create or replace function public.talent_partner_minimum_payout_for_currency(p_currency text)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(
    0,
    coalesce(
      nullif(s.minimum_payout_by_currency ->> upper(trim(coalesce(p_currency,''))), '')::numeric,
      s.minimum_payout,
      0
    )
  )
  from public.talent_partner_program_settings s
  where s.id = 'default'
$$;

revoke all on function public.talent_partner_minimum_payout_for_currency(text) from public, anon, authenticated;
grant execute on function public.talent_partner_minimum_payout_for_currency(text) to service_role;

create or replace function public.admin_save_talent_partner_program_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.talent_partner_program_settings%rowtype;
  v_thresholds jsonb := p_settings -> 'minimumPayoutsByCurrency';
  v_key text;
  v_value text;
  v_normalized jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;

  if v_thresholds is not null then
    if jsonb_typeof(v_thresholds) <> 'object' then
      raise exception 'Currency payout thresholds must be an object.';
    end if;
    for v_key, v_value in select key, value from jsonb_each_text(v_thresholds)
    loop
      v_key := upper(trim(v_key));
      if v_key !~ '^[A-Z]{3}$' then
        raise exception 'Invalid payout-threshold currency code: %', v_key;
      end if;
      if trim(v_value) !~ '^([0-9]+([.][0-9]+)?|[.][0-9]+)$' then
        raise exception 'Invalid minimum payout for %.', v_key;
      end if;
      if v_value::numeric < 0 then
        raise exception 'Minimum payout cannot be negative for %.', v_key;
      end if;
      v_normalized := v_normalized || jsonb_build_object(v_key, round(v_value::numeric, 2));
    end loop;
  end if;

  update public.talent_partner_program_settings
  set enabled=coalesce((p_settings->>'enabled')::boolean,enabled),
      attribution_window_days=greatest(1,least(180,coalesce((p_settings->>'attributionWindowDays')::integer,attribution_window_days))),
      payout_hold_days=greatest(0,least(180,coalesce((p_settings->>'payoutHoldDays')::integer,payout_hold_days))),
      minimum_payout=greatest(0,coalesce((p_settings->>'minimumPayout')::numeric,minimum_payout)),
      minimum_payout_by_currency=case when v_thresholds is null then minimum_payout_by_currency else v_normalized end,
      default_currency=coalesce(nullif(upper(left(trim(coalesce(p_settings->>'defaultCurrency','')),3)),''),default_currency),
      require_admin_approval=coalesce((p_settings->>'requireAdminApproval')::boolean,require_admin_approval),
      terms_version=coalesce(nullif(left(trim(coalesce(p_settings->>'termsVersion','')),80),''),terms_version),
      updated_by=auth.uid(),updated_at=now()
  where id='default' returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.admin_save_talent_partner_program_settings(jsonb) from public, anon;
grant execute on function public.admin_save_talent_partner_program_settings(jsonb) to authenticated, service_role;

create or replace function public.talent_partner_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_profile jsonb;
  v_status text;
  v_summary_currency text;
  v_stats jsonb;
  v_jobs jsonb;
  v_refs jsonb;
  v_rewards jsonb;
  v_payouts jsonb;
  v_notifications jsonb;
  v_resources jsonb;
  v_sources jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not exists(select 1 from public.talent_partner_profiles where user_id=v_uid) then raise exception 'Talent Partner profile not found.'; end if;

  select jsonb_build_object(
    'userId',tp.user_id,'partnerCode',tp.partner_code,'status',tp.status,'companyName',tp.company_name,'websiteUrl',tp.website_url,
    'promotionChannels',tp.promotion_channels,'payoutMethod',tp.payout_method,'payoutEmail',tp.payout_email,'preferredCurrency',tp.preferred_currency,
    'fullName',u.full_name,'email',u.email,'createdAt',tp.created_at
  ), tp.status, coalesce(nullif(upper(tp.preferred_currency),''),s.default_currency,'USD')
  into v_profile,v_status,v_summary_currency
  from public.talent_partner_profiles tp
  join public.user_profiles u on u.id=tp.user_id
  left join public.talent_partner_program_settings s on s.id='default'
  where tp.user_id=v_uid;

  -- Pending/suspended/closed accounts receive only the minimum status envelope needed
  -- by the existing portal status screen. Operational, referral and financial data stays private.
  if v_status <> 'Active' then
    return jsonb_build_object(
      'profile',v_profile,
      'stats',jsonb_build_object(
        'visits',0,'uniqueVisitors',0,'applications',0,'activatedHires',0,'retainedHires',0,
        'pendingEarnings',0,'approvedEarnings',0,'paidEarnings',0,'summaryCurrency',v_summary_currency
      ),
      'jobs','[]'::jsonb,'referrals','[]'::jsonb,'rewards','[]'::jsonb,'payouts','[]'::jsonb,
      'notifications','[]'::jsonb,'resources','[]'::jsonb,'sourceBreakdown','[]'::jsonb,
      'accessLimited',true
    );
  end if;

  select jsonb_build_object(
    'visits',(select count(*) from public.talent_partner_visits where partner_user_id=v_uid),
    'uniqueVisitors',(select count(distinct session_id) from public.talent_partner_visits where partner_user_id=v_uid),
    'applications',(select count(*) from public.talent_partner_referrals where partner_user_id=v_uid),
    'activatedHires',(select count(*) from public.talent_partner_referrals where partner_user_id=v_uid and status in ('Activated','Retained')),
    'retainedHires',(select count(*) from public.talent_partner_referrals where partner_user_id=v_uid and status='Retained'),
    'pendingEarnings',(select coalesce(sum(reward_amount),0) from public.talent_partner_reward_entries where partner_user_id=v_uid and status='Pending' and upper(currency)=v_summary_currency),
    'approvedEarnings',(select coalesce(sum(reward_amount),0) from public.talent_partner_reward_entries where partner_user_id=v_uid and status='Approved' and upper(currency)=v_summary_currency),
    'paidEarnings',(select coalesce(sum(reward_amount),0) from public.talent_partner_reward_entries where partner_user_id=v_uid and status='Paid' and upper(currency)=v_summary_currency),
    'summaryCurrency',v_summary_currency
  ) into v_stats;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',j.id,'slug',j.slug,'title',j.title,'shortSummary',j.short_summary,'department',j.department,'location',j.location,'engagementType',j.engagement_type,
    'rewardPlan',case when rp.id is null then null else jsonb_build_object(
      'enabled',rp.enabled,'rewardModel',rp.reward_model,'qualifyingEventCount',rp.qualifying_event_count,'eventRewards',rp.event_rewards,
      'retentionEnabled',rp.retention_enabled,'retentionMonths',rp.retention_months,'retentionRewardKind',rp.retention_reward_kind,
      'retentionRatePercent',rp.retention_rate_percent,'retentionFixedAmount',rp.retention_fixed_amount,'currency',rp.currency
    ) end
  ) order by j.featured desc,j.display_order,j.published_at desc),'[]'::jsonb)
  into v_jobs
  from public.career_jobs j left join public.talent_partner_reward_plans rp on rp.career_job_id=j.id
  where j.status='Published' and (j.closes_at is null or j.closes_at>now());

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'applicationReference',a.application_reference,
    'candidateName',case when position(' ' in trim(a.full_name))>0 then split_part(trim(a.full_name),' ',1)||' '||left(split_part(trim(a.full_name),' ',2),1)||'.' else trim(a.full_name) end,
    'jobTitle',j.title,'jobSlug',j.slug,'status',public.talent_partner_safe_stage(a.stage,a.refusal_reason),
    'attributedAt',r.attributed_at,'activatedAt',r.activated_at,'retentionEligibleAt',case when r.activated_at is not null and rp.retention_enabled then r.activated_at+make_interval(months=>rp.retention_months) else null end,
    'performanceRewards',(select coalesce(jsonb_agg(jsonb_build_object('type',e.event_type,'rank',e.event_rank,'amount',e.reward_amount,'currency',e.currency,'status',e.status,'createdAt',e.created_at) order by case when e.event_type='retention' then 99 else coalesce(e.event_rank,50) end),'[]'::jsonb) from public.talent_partner_reward_entries e where e.referral_id=r.id),
    'salaryTransition',(select jsonb_build_object('status',st.status,'effectiveDate',st.effective_date,'qualifyingDate',st.qualifying_date) from public.talent_partner_salary_transitions st where st.referral_id=r.id)
  ) order by r.attributed_at desc),'[]'::jsonb)
  into v_refs
  from public.talent_partner_referrals r
  join public.applicants a on a.id=r.applicant_id
  join public.career_jobs j on j.id=r.career_job_id
  left join public.talent_partner_reward_plans rp on rp.career_job_id=r.career_job_id
  where r.partner_user_id=v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'eventType',e.event_type,'eventRank',e.event_rank,'eligibleAmount',e.eligible_amount,'currency',e.currency,
    'rewardAmount',e.reward_amount,'status',e.status,'availableAt',e.available_at,'createdAt',e.created_at,'jobTitle',j.title
  ) order by e.created_at desc),'[]'::jsonb)
  into v_rewards
  from public.talent_partner_reward_entries e join public.career_jobs j on j.id=e.career_job_id where e.partner_user_id=v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'batchNumber',b.batch_number,'amount',p.amount,'currency',p.currency,'status',p.status,
    'transactionId',p.transaction_id,'paidAt',p.paid_at,'createdAt',p.created_at
  ) order by p.created_at desc),'[]'::jsonb)
  into v_payouts
  from public.talent_partner_payouts p join public.talent_partner_payout_batches b on b.id=p.payout_batch_id where p.partner_user_id=v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',n.id,'type',n.type,'title',n.title,'message',n.message,'actionPath',n.action_path,'readAt',n.read_at,'createdAt',n.created_at
  ) order by n.created_at desc),'[]'::jsonb)
  into v_notifications from (select * from public.talent_partner_notifications where partner_user_id=v_uid order by created_at desc limit 50) n;

  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'jobId',x.career_job_id,'title',x.title,'type',x.resource_type,'content',x.content,'url',x.resource_url) order by x.sort_order,x.created_at),'[]'::jsonb)
  into v_resources from public.talent_partner_resources x where x.enabled=true;

  select coalesce(jsonb_agg(jsonb_build_object('source',source_key,'visits',visits,'uniqueVisitors',unique_visitors) order by visits desc),'[]'::jsonb)
  into v_sources
  from (
    select coalesce(nullif(utm_source,''),nullif(referrer_host,''),'Direct') source_key,count(*) visits,count(distinct session_id) unique_visitors
    from public.talent_partner_visits where partner_user_id=v_uid group by 1 order by visits desc limit 20
  ) s;

  return jsonb_build_object('profile',v_profile,'stats',v_stats,'jobs',v_jobs,'referrals',v_refs,'rewards',v_rewards,'payouts',v_payouts,'notifications',v_notifications,'resources',v_resources,'sourceBreakdown',v_sources,'accessLimited',false);
end;
$$;

revoke all on function public.talent_partner_get_dashboard() from public, anon;
grant execute on function public.talent_partner_get_dashboard() to authenticated, service_role;

create or replace function public.talent_partner_payout_setup_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_profile public.talent_partner_payout_profiles%rowtype;
  v_required boolean;
  v_balances jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not exists(select 1 from public.talent_partner_profiles where user_id=v_uid and status='Active') then
    raise exception 'An active Talent Partner account is required.';
  end if;

  select exists(
    select 1 from public.talent_partner_reward_entries e
    where e.partner_user_id=v_uid and e.status='Approved' and e.payout_id is null
  ) into v_required;

  select * into v_profile from public.talent_partner_payout_profiles where partner_user_id=v_uid;

  select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'amount',amount) order by currency),'[]'::jsonb)
  into v_balances
  from (
    select upper(currency) currency, sum(reward_amount)::numeric(14,2) amount
    from public.talent_partner_reward_entries
    where partner_user_id=v_uid and status='Approved' and payout_id is null
    group by upper(currency)
  ) x;

  return jsonb_build_object(
    'setupRequired',v_required,
    'status',case when v_profile.id is null then case when v_required then 'Setup Required' else 'Not Required' end else v_profile.status end,
    'profileId',v_profile.id,'payoutMethod',v_profile.payout_method,
    'preferredCurrency',coalesce(v_profile.preferred_currency,(select preferred_currency from public.talent_partner_profiles where user_id=v_uid),'USD'),
    'countryCode',v_profile.country_code,'detailsVersion',v_profile.details_version,'maskedDetails',coalesce(v_profile.masked_details,'{}'::jsonb),
    'submittedAt',v_profile.submitted_at,'verifiedAt',v_profile.verified_at,'rejectionReason',v_profile.rejection_reason,
    'verificationMode',coalesce(v_profile.verification_mode,'manual_admin'),'automaticTransferSupported',false,
    'automaticVerificationSupported',false,'settlementMode','manual','approvedBalances',v_balances
  );
end;
$$;

revoke all on function public.talent_partner_payout_setup_state() from public, anon;
grant execute on function public.talent_partner_payout_setup_state() to authenticated, service_role;

create or replace function public.talent_partner_update_my_profile(
  p_company_name text default null,
  p_website_url text default null,
  p_promotion_channels text[] default null,
  p_payout_method text default null,
  p_payout_email text default null,
  p_preferred_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_row public.talent_partner_profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not exists(select 1 from public.talent_partner_profiles where user_id=v_uid and status='Active') then
    raise exception 'An active Talent Partner account is required.';
  end if;
  if nullif(trim(coalesce(p_payout_method,'')),'') is not null or nullif(trim(coalesce(p_payout_email,'')),'') is not null then
    raise exception 'Use the secure payout setup page after a reward is approved. Payout account details are not stored in the general profile.';
  end if;
  update public.talent_partner_profiles
  set company_name=nullif(left(trim(coalesce(p_company_name,'')),200),''),
      website_url=nullif(left(trim(coalesce(p_website_url,'')),1000),''),
      promotion_channels=coalesce(p_promotion_channels,promotion_channels),
      updated_at=now()
  where user_id=v_uid
  returning * into v_row;
  if not found then raise exception 'Talent Partner profile not found.'; end if;
  return to_jsonb(v_row)-'internal_notes';
end;
$$;

revoke all on function public.talent_partner_update_my_profile(text,text,text[],text,text,text) from public, anon;
grant execute on function public.talent_partner_update_my_profile(text,text,text[],text,text,text) to authenticated, service_role;

create or replace function public.talent_partner_generate_sale_reward(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
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
  v_existing public.talent_partner_reward_entries%rowtype;
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
    where salesperson_id=v_pay.salesperson_id and status='Verified' and quotation_id is not null
      and coalesce(verified_at,paid_at,created_at)>=v_ref.activated_at
    group by quotation_id
  ), ranked as (
    select quotation_id,row_number() over(order by first_at,quotation_id)::integer sale_rank from first_verified
  )
  select sale_rank into v_rank from ranked where quotation_id=v_pay.quotation_id;

  if v_rank is null or v_rank>least(3,v_plan.qualifying_event_count) then return null; end if;

  select * into v_first_payment
  from public.payments
  where salesperson_id=v_pay.salesperson_id and quotation_id=v_pay.quotation_id and status='Verified'
    and coalesce(verified_at,paid_at,created_at)>=v_ref.activated_at
  order by coalesce(verified_at,paid_at,created_at),created_at
  limit 1;
  if not found then return null; end if;

  v_rule:=public.talent_partner_event_rule(v_plan,v_rank,coalesce(nullif(v_first_payment.amount_paid,0),v_first_payment.amount_due));
  if not coalesce((v_rule->>'configured')::boolean,false) then return null; end if;
  v_amount:=(v_rule->>'amount')::numeric;
  select coalesce(v_plan.payout_hold_days,s.payout_hold_days) into v_hold
  from public.talent_partner_program_settings s where s.id='default';

  select * into v_existing
  from public.talent_partner_reward_entries
  where referral_id=v_ref.id and event_type='sale' and source_quotation_id=v_pay.quotation_id
  for update;

  if found then
    v_id:=v_existing.id;
    if v_existing.status='Reversed' and v_existing.payout_id is null then
      update public.talent_partner_reward_entries
      set event_rank=v_rank,
          source_payment_id=v_first_payment.id,
          eligible_amount=coalesce(nullif(v_first_payment.amount_paid,0),v_first_payment.amount_due),
          currency=coalesce(v_first_payment.currency,v_plan.currency),
          reward_kind=v_rule->>'kind',
          rate_percent=(v_rule->>'ratePercent')::numeric,
          fixed_amount=(v_rule->>'fixedAmount')::numeric,
          reward_amount=v_amount,
          status='Pending',
          available_at=now()+make_interval(days=>coalesce(v_hold,0)),
          approved_at=null,approved_by=null,reversal_reason=null,reversed_at=null,
          rule_snapshot=coalesce(rule_snapshot,'{}'::jsonb) || jsonb_build_object(
            'reinstatedAt',now(),'reinstatedFromPaymentId',v_first_payment.id,'reinstatedRank',v_rank,
            'rule',v_rule,'planId',v_plan.id
          ),
          updated_at=now()
      where id=v_existing.id;
      perform public.talent_partner_notify(
        v_ref.partner_user_id,'reward','Referral reward restored',
        'A qualifying seller payment was verified again. The related referral reward has been restored to Pending and will follow the normal approval and payout controls.',
        '/talent-partner','tp-sale-reward-restored:'||v_existing.id::text||':'||v_first_payment.id::text
      );
    end if;
    return v_id;
  end if;

  insert into public.talent_partner_reward_entries(
    referral_id,partner_user_id,career_job_id,event_type,event_rank,
    source_payment_id,source_quotation_id,eligible_amount,currency,reward_kind,rate_percent,fixed_amount,reward_amount,
    status,available_at,rule_snapshot
  ) values(
    v_ref.id,v_ref.partner_user_id,v_ref.career_job_id,'sale',v_rank,
    v_first_payment.id,v_pay.quotation_id,coalesce(nullif(v_first_payment.amount_paid,0),v_first_payment.amount_due),
    coalesce(v_first_payment.currency,v_plan.currency),v_rule->>'kind',(v_rule->>'ratePercent')::numeric,
    (v_rule->>'fixedAmount')::numeric,v_amount,'Pending',now()+make_interval(days=>coalesce(v_hold,0)),
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

revoke all on function public.talent_partner_generate_sale_reward(uuid) from public, anon, authenticated;
grant execute on function public.talent_partner_generate_sale_reward(uuid) to service_role;

create or replace function public.talent_partner_sync_referral_from_applicant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ref public.talent_partner_referrals%rowtype;
  v_terminal boolean;
begin
  select * into v_ref from public.talent_partner_referrals where applicant_id=new.id for update;
  if not found then return new; end if;

  if new.linked_user_id is not null and v_ref.referred_user_id is distinct from new.linked_user_id then
    update public.talent_partner_referrals set referred_user_id=new.linked_user_id,updated_at=now() where id=v_ref.id;
  end if;

  v_terminal := new.closed_at is not null
    or coalesce(trim(new.refusal_reason),'')<>''
    or lower(trim(coalesce(new.stage,''))) in ('rejected','withdrawn','closed','disqualified','cancelled','canceled');

  if new.stage='Activated' and not v_terminal and old.stage is distinct from 'Activated' then
    update public.talent_partner_referrals
    set status='Activated',referred_user_id=coalesce(new.linked_user_id,referred_user_id),
        activated_at=coalesce(new.stage_entered_at,now()),closed_at=null,updated_at=now()
    where id=v_ref.id;
    perform public.talent_partner_notify(
      v_ref.partner_user_id,'activation','Your referral was activated',
      'A referred candidate completed the ProFox recruitment process and has been activated. Performance rewards will follow the configured job reward plan.',
      '/talent-partner','tp-activation:'||v_ref.id::text
    );
  elsif v_terminal then
    update public.talent_partner_referrals
    set status='Closed',closed_at=coalesce(new.closed_at,now()),updated_at=now()
    where id=v_ref.id and status<>'Retained';
  elsif v_ref.status='Closed' then
    -- A genuinely reopened application becomes eligible for tracking again, without changing
    -- the immutable original attribution owner.
    update public.talent_partner_referrals
    set status=case when new.stage='Activated' then 'Activated' else 'Applicant' end,
        closed_at=null,updated_at=now()
    where id=v_ref.id;
  end if;

  return new;
end;
$$;

revoke all on function public.talent_partner_sync_referral_from_applicant() from public, anon, authenticated;
grant execute on function public.talent_partner_sync_referral_from_applicant() to service_role;

drop trigger if exists trg_talent_partner_sync_referral_from_applicant on public.applicants;
create trigger trg_talent_partner_sync_referral_from_applicant
after update of stage, linked_user_id, refusal_reason, closed_at on public.applicants
for each row execute function public.talent_partner_sync_referral_from_applicant();

create or replace function public.admin_create_talent_partner_payout_batch()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_number text;
  v_group record;
  v_currency text;
  v_payout_id uuid;
  v_batch_total numeric;
  v_batch_count integer;
  v_total_count integer:=0;
  v_skipped_partners integer:=0;
  v_batches jsonb:='[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;

  select count(distinct e.partner_user_id) into v_skipped_partners
  from public.talent_partner_reward_entries e
  join public.talent_partner_profiles tp on tp.user_id=e.partner_user_id and tp.status='Active'
  left join public.talent_partner_payout_profiles pp on pp.partner_user_id=e.partner_user_id and pp.status='Verified'
  where e.status='Approved' and e.payout_id is null and e.available_at<=now() and pp.id is null;

  for v_group in
    select distinct e.partner_user_id
    from public.talent_partner_reward_entries e
    join public.talent_partner_profiles tp on tp.user_id=e.partner_user_id and tp.status='Active'
    left join public.talent_partner_payout_profiles pp on pp.partner_user_id=e.partner_user_id and pp.status='Verified'
    where e.status='Approved' and e.payout_id is null and e.available_at<=now() and pp.id is null
  loop
    perform public.talent_partner_notify(
      v_group.partner_user_id,'payout','Payout verification required',
      'Your approved reward is ready for payout, but your payout method is not verified yet. Complete Profile & Payout to continue.',
      '/talent-partner','tp-payout-verification-block:'||v_group.partner_user_id::text
    );
  end loop;

  for v_currency in
    select distinct upper(e.currency)
    from public.talent_partner_reward_entries e
    join public.talent_partner_profiles tp on tp.user_id=e.partner_user_id and tp.status='Active'
    join public.talent_partner_payout_profiles pp on pp.partner_user_id=e.partner_user_id and pp.status='Verified'
    where e.status='Approved' and e.payout_id is null and e.available_at<=now()
      and exists (
        select 1
        from public.talent_partner_reward_entries e2
        where e2.partner_user_id=e.partner_user_id and upper(e2.currency)=upper(e.currency)
          and e2.status='Approved' and e2.payout_id is null and e2.available_at<=now()
        group by e2.partner_user_id,upper(e2.currency)
        having sum(e2.reward_amount)>=public.talent_partner_minimum_payout_for_currency(upper(e2.currency))
      )
    order by upper(e.currency)
  loop
    v_batch_total:=0;
    v_batch_count:=0;
    v_number:='TP-PAY-'||v_currency||'-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
    insert into public.talent_partner_payout_batches(batch_number,status,created_by,currency)
    values(v_number,'Ready',auth.uid(),v_currency) returning id into v_batch_id;

    for v_group in
      select e.partner_user_id,upper(e.currency) currency,sum(e.reward_amount)::numeric(14,2) amount,count(*)::integer entry_count,
             pp.id payout_profile_id,pp.details_version,pp.payout_method,pp.masked_details
      from public.talent_partner_reward_entries e
      join public.talent_partner_profiles tp on tp.user_id=e.partner_user_id and tp.status='Active'
      join public.talent_partner_payout_profiles pp on pp.partner_user_id=e.partner_user_id and pp.status='Verified'
      where e.status='Approved' and e.payout_id is null and e.available_at<=now() and upper(e.currency)=v_currency
      group by e.partner_user_id,upper(e.currency),pp.id,pp.details_version,pp.payout_method,pp.masked_details
      having sum(e.reward_amount)>=public.talent_partner_minimum_payout_for_currency(upper(e.currency))
    loop
      insert into public.talent_partner_payouts(
        payout_batch_id,partner_user_id,currency,amount,entry_count,status,payout_method_snapshot,payout_email_snapshot,
        payout_profile_id,payout_profile_version,payout_details_masked_snapshot
      ) values(
        v_batch_id,v_group.partner_user_id,v_group.currency,v_group.amount,v_group.entry_count,'Ready',v_group.payout_method,
        coalesce(v_group.masked_details->>'paypalEmail',v_group.masked_details->>'wiseEmail',v_group.masked_details->>'accountNumber'),
        v_group.payout_profile_id,v_group.details_version,v_group.masked_details
      ) returning id into v_payout_id;

      update public.talent_partner_reward_entries
      set payout_id=v_payout_id,updated_at=now()
      where partner_user_id=v_group.partner_user_id and upper(currency)=v_currency
        and status='Approved' and payout_id is null and available_at<=now();

      v_batch_total:=v_batch_total+v_group.amount;
      v_batch_count:=v_batch_count+v_group.entry_count;
    end loop;

    if v_batch_count=0 then
      delete from public.talent_partner_payout_batches where id=v_batch_id;
    else
      update public.talent_partner_payout_batches
      set entry_count=v_batch_count,total_amount=v_batch_total
      where id=v_batch_id;
      v_total_count:=v_total_count+v_batch_count;
      v_batches:=v_batches || jsonb_build_array(jsonb_build_object(
        'batchId',v_batch_id,'batchNumber',v_number,'currency',v_currency,
        'entryCount',v_batch_count,'totalAmount',v_batch_total
      ));
    end if;
  end loop;

  if v_total_count=0 then
    return jsonb_build_object(
      'success',false,
      'message',case when v_skipped_partners>0 then 'Approved rewards exist, but one or more Talent Partners still need a verified payout profile.' else 'No approved Talent Partner rewards currently meet the currency-specific payout requirements.' end,
      'partnersNeedingSetup',v_skipped_partners,'batches','[]'::jsonb
    );
  end if;

  return jsonb_build_object('success',true,'entryCount',v_total_count,'partnersNeedingSetup',v_skipped_partners,'batches',v_batches);
end;
$$;

revoke all on function public.admin_create_talent_partner_payout_batch() from public, anon;
grant execute on function public.admin_create_talent_partner_payout_batch() to authenticated, service_role;

-- Trigger helpers must never be client-callable directly.
revoke all on function public.talent_partner_payment_reward_trigger() from public, anon, authenticated;
grant execute on function public.talent_partner_payment_reward_trigger() to service_role;

do $$
begin
  if to_regprocedure('public.talent_partner_activate_email_verified_user()') is not null then
    execute 'revoke all on function public.talent_partner_activate_email_verified_user() from public, anon, authenticated';
    execute 'grant execute on function public.talent_partner_activate_email_verified_user() to service_role';
  end if;
end
$$;

commit;

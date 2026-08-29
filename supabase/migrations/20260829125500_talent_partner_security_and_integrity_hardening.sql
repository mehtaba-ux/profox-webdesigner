-- Final Talent Partner security/integrity hardening.
-- Keeps partner-visible data behind sanitized RPCs, honors the approval setting,
-- and makes the three-event cap / payout confirmation server-authoritative.

-- The raw partner profile includes internal_notes and approval metadata.
-- Partners use talent_partner_get_dashboard() / talent_partner_update_my_profile();
-- direct table reads remain Admin-only.
drop policy if exists talent_partner_profiles_select on public.talent_partner_profiles;
create policy talent_partner_profiles_select on public.talent_partner_profiles
for select to authenticated using (public.is_admin());

-- Keep the first-three rule enforced by storage as well as RPC logic.
alter table public.talent_partner_qualifying_projects
  drop constraint if exists talent_partner_qualifying_projects_qualifying_rank_check;
alter table public.talent_partner_qualifying_projects
  add constraint talent_partner_qualifying_projects_qualifying_rank_check
  check (qualifying_rank between 1 and 3);

alter table public.talent_partner_reward_entries
  drop constraint if exists talent_partner_reward_entries_event_rank_check;
alter table public.talent_partner_reward_entries
  add constraint talent_partner_reward_entries_event_rank_check
  check (event_rank is null or event_rank between 1 and 3);

-- Respect require_admin_approval for newly created partner accounts.
-- Existing Suspended/Closed/Pending profiles are never silently reactivated.
create or replace function public.request_talent_partner_account(
  p_full_name text,
  p_terms_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_profile public.user_profiles%rowtype;
  v_settings public.talent_partner_program_settings%rowtype;
  v_partner public.talent_partner_profiles%rowtype;
  v_initial_status text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_settings from public.talent_partner_program_settings where id='default';
  if not found or not v_settings.enabled then
    raise exception 'The Talent Partner program is not currently accepting registrations.';
  end if;

  select * into v_profile from public.user_profiles where id=v_uid for update;
  if not found then raise exception 'User profile not found.'; end if;
  if v_profile.role not in ('pending','talent_partner') then
    raise exception 'This account already belongs to another ProFox workspace.';
  end if;

  v_initial_status:=case when v_settings.require_admin_approval then 'Pending' else 'Active' end;

  insert into public.talent_partner_profiles(
    user_id,partner_code,status,terms_version,terms_accepted_at,preferred_currency,approved_at
  ) values(
    v_uid,public.talent_partner_new_code(),v_initial_status,
    coalesce(nullif(trim(p_terms_version),''),v_settings.terms_version),now(),v_settings.default_currency,
    case when v_initial_status='Active' then now() else null end
  )
  on conflict (user_id) do update set updated_at=now()
  returning * into v_partner;

  perform set_config('profox.talent_partner_profile_rpc','1',true);
  update public.user_profiles
  set full_name=coalesce(nullif(trim(p_full_name),''),full_name),
      role='talent_partner',
      department='General',
      status=case when v_partner.status='Active' then 'active' else case when v_partner.status in ('Suspended','Closed') then 'inactive' else 'pending' end end,
      onboarding_status='completed',
      onboarding_progress=100,
      updated_at=now()
  where id=v_uid;

  return jsonb_build_object(
    'success',true,
    'partnerCode',v_partner.partner_code,
    'status',v_partner.status
  );
end;
$$;

-- Sales performance is only counted after the referred seller was activated.
-- Distinct quotation ranking continues to reuse canonical Verified payments.
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
    select id into v_id from public.talent_partner_reward_entries
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

-- Do not allow a direct RPC call to mark money paid without an external payment reference.
create or replace function public.admin_mark_talent_partner_payout_paid(
  p_payout_id uuid,
  p_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_row public.talent_partner_payouts%rowtype; v_remaining integer; v_transaction text:=left(trim(coalesce(p_transaction_id,'')),300);
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_transaction='' then raise exception 'Payment transaction/reference ID is required.'; end if;

  update public.talent_partner_payouts
  set status='Paid',transaction_id=v_transaction,paid_at=now(),paid_by=auth.uid()
  where id=p_payout_id and status='Ready'
  returning * into v_row;
  if not found then raise exception 'Ready payout not found.'; end if;

  update public.talent_partner_reward_entries
  set status='Paid',updated_at=now()
  where payout_id=v_row.id and status='Approved';

  select count(*) into v_remaining
  from public.talent_partner_payouts
  where payout_batch_id=v_row.payout_batch_id and status='Ready';

  update public.talent_partner_payout_batches
  set status=case when v_remaining=0 then 'Paid' else 'Partially Paid' end,
      paid_at=case when v_remaining=0 then now() else paid_at end
  where id=v_row.payout_batch_id;

  perform public.talent_partner_notify(
    v_row.partner_user_id,'payout','Talent Partner payout processed',
    'A Talent Partner payout of '||v_row.currency||' '||to_char(v_row.amount,'FM999999990.00')||' has been marked paid.',
    '/talent-partner','tp-payout-paid:'||v_row.id::text
  );
  return to_jsonb(v_row);
end;
$$;

-- Preserve the same explicit execution grants after function replacement.
grant execute on function public.request_talent_partner_account(text,text) to authenticated;
revoke all on function public.admin_mark_talent_partner_payout_paid(uuid,text) from public;
grant execute on function public.admin_mark_talent_partner_payout_paid(uuid,text) to authenticated;

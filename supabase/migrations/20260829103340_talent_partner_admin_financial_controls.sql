-- ProFox Talent Partner Program: Admin controls, reward approval and payout operations.

create or replace function public.admin_refresh_talent_partner_rewards()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_t record; v_p record; v_retention integer:=0; v_sales integer:=0; v_before integer; v_after integer;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;

  select count(*) into v_before from public.talent_partner_reward_entries where event_type='sale';
  for v_p in
    select distinct on (p.salesperson_id,p.quotation_id) p.id
    from public.payments p
    join public.talent_partner_referrals r on r.referred_user_id=p.salesperson_id and r.status in ('Activated','Retained')
    join public.talent_partner_reward_plans rp on rp.career_job_id=r.career_job_id and rp.enabled and rp.reward_model='sales'
    where p.status='Verified' and p.quotation_id is not null
    order by p.salesperson_id,p.quotation_id,coalesce(p.verified_at,p.paid_at,p.created_at),p.created_at
  loop
    perform public.talent_partner_generate_sale_reward(v_p.id);
  end loop;
  select count(*) into v_after from public.talent_partner_reward_entries where event_type='sale';
  v_sales:=greatest(0,v_after-v_before);

  for v_t in
    select id
    from public.talent_partner_salary_transitions
    where status='Scheduled' and effective_date<=current_date and qualifying_date<=current_date
  loop
    if public.talent_partner_create_retention_reward(v_t.id) is not null then
      v_retention:=v_retention+1;
    end if;
  end loop;

  return jsonb_build_object('success',true,'newSaleRewards',v_sales,'retentionProcessed',v_retention);
end;
$$;

create or replace function public.admin_set_talent_partner_status(
  p_partner_user_id uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_status text:=initcap(lower(trim(coalesce(p_status,'')))); v_row public.talent_partner_profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_status not in ('Pending','Active','Suspended','Closed') then raise exception 'Invalid Talent Partner status.'; end if;

  update public.talent_partner_profiles
  set status=v_status,
      approved_at=case when v_status='Active' then coalesce(approved_at,now()) else approved_at end,
      approved_by=case when v_status='Active' then auth.uid() else approved_by end,
      suspended_at=case when v_status='Suspended' then now() else null end,
      internal_notes=coalesce(nullif(left(trim(coalesce(p_notes,'')),5000),''),internal_notes),
      updated_at=now()
  where user_id=p_partner_user_id
  returning * into v_row;
  if not found then raise exception 'Talent Partner not found.'; end if;

  perform set_config('profox.talent_partner_profile_rpc','1',true);
  update public.user_profiles
  set role='talent_partner',
      status=case when v_status='Active' then 'active' else case when v_status in ('Suspended','Closed') then 'inactive' else 'pending' end end,
      onboarding_status='completed',
      onboarding_progress=100,
      updated_at=now()
  where id=p_partner_user_id;

  perform public.talent_partner_notify(
    p_partner_user_id,'account','Talent Partner account '||lower(v_status),
    case when v_status='Active' then 'Your ProFox Talent Partner account is approved. You can now access job links, referral analytics and reward tracking.'
         when v_status='Suspended' then 'Your Talent Partner account is currently suspended. New referral attribution is disabled until the account is reactivated.'
         when v_status='Closed' then 'Your Talent Partner account has been closed.'
         else 'Your Talent Partner account is pending review.' end,
    '/talent-partner','tp-account-status:'||p_partner_user_id::text||':'||lower(v_status)
  );

  return jsonb_build_object('success',true,'status',v_status);
end;
$$;

create or replace function public.admin_save_talent_partner_program_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_row public.talent_partner_program_settings%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  update public.talent_partner_program_settings
  set enabled=coalesce((p_settings->>'enabled')::boolean,enabled),
      attribution_window_days=greatest(1,least(180,coalesce((p_settings->>'attributionWindowDays')::integer,attribution_window_days))),
      payout_hold_days=greatest(0,least(180,coalesce((p_settings->>'payoutHoldDays')::integer,payout_hold_days))),
      minimum_payout=greatest(0,coalesce((p_settings->>'minimumPayout')::numeric,minimum_payout)),
      default_currency=coalesce(nullif(upper(left(trim(coalesce(p_settings->>'defaultCurrency','')),3)),''),default_currency),
      require_admin_approval=coalesce((p_settings->>'requireAdminApproval')::boolean,require_admin_approval),
      terms_version=coalesce(nullif(left(trim(coalesce(p_settings->>'termsVersion','')),80),''),terms_version),
      updated_by=auth.uid(),
      updated_at=now()
  where id='default'
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

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
    case when p_payout_hold_days is null then null else greatest(0,least(180,p_payout_hold_days)) end,
    auth.uid(),now()
  )
  on conflict (career_job_id) do update set
    enabled=excluded.enabled,
    reward_model=excluded.reward_model,
    qualifying_event_count=excluded.qualifying_event_count,
    event_rewards=excluded.event_rewards,
    retention_enabled=excluded.retention_enabled,
    retention_months=excluded.retention_months,
    retention_reward_kind=excluded.retention_reward_kind,
    retention_rate_percent=excluded.retention_rate_percent,
    retention_fixed_amount=excluded.retention_fixed_amount,
    currency=excluded.currency,
    payout_hold_days=excluded.payout_hold_days,
    updated_by=auth.uid(),
    updated_at=now()
  returning * into v_row;

  perform public.admin_refresh_talent_partner_rewards();
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_update_talent_partner_reward_status(
  p_reward_id uuid,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_status text:=initcap(lower(trim(coalesce(p_status,'')))); v_row public.talent_partner_reward_entries%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_status not in ('Approved','Reversed') then raise exception 'Only Approved or Reversed is supported here.'; end if;

  select * into v_row from public.talent_partner_reward_entries where id=p_reward_id for update;
  if not found then raise exception 'Reward not found.'; end if;
  if v_row.status='Paid' then raise exception 'A paid reward cannot be changed by this action.'; end if;
  if v_status='Approved' and v_row.available_at>now() then raise exception 'This reward is still inside the configured payout hold period.'; end if;

  update public.talent_partner_reward_entries
  set status=v_status,
      approved_at=case when v_status='Approved' then now() else approved_at end,
      approved_by=case when v_status='Approved' then auth.uid() else approved_by end,
      reversal_reason=case when v_status='Reversed' then coalesce(nullif(left(trim(coalesce(p_reason,'')),2000),''),'Reversed by administrator.') else null end,
      reversed_at=case when v_status='Reversed' then now() else null end,
      updated_at=now()
  where id=p_reward_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_create_talent_partner_payout_batch()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_settings public.talent_partner_program_settings%rowtype;
  v_batch_id uuid;
  v_number text;
  v_group record;
  v_payout_id uuid;
  v_total numeric:=0;
  v_count integer:=0;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_settings from public.talent_partner_program_settings where id='default';
  v_number:='TP-PAY-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));

  insert into public.talent_partner_payout_batches(batch_number,status,created_by)
  values(v_number,'Ready',auth.uid())
  returning id into v_batch_id;

  for v_group in
    select e.partner_user_id,e.currency,sum(e.reward_amount)::numeric(14,2) amount,count(*)::integer entry_count,
           max(tp.payout_method) payout_method,max(tp.payout_email) payout_email
    from public.talent_partner_reward_entries e
    join public.talent_partner_profiles tp on tp.user_id=e.partner_user_id and tp.status='Active'
    where e.status='Approved' and e.payout_id is null and e.available_at<=now()
    group by e.partner_user_id,e.currency
    having sum(e.reward_amount)>=v_settings.minimum_payout
  loop
    insert into public.talent_partner_payouts(
      payout_batch_id,partner_user_id,currency,amount,entry_count,status,payout_method_snapshot,payout_email_snapshot
    ) values(
      v_batch_id,v_group.partner_user_id,v_group.currency,v_group.amount,v_group.entry_count,'Ready',v_group.payout_method,v_group.payout_email
    ) returning id into v_payout_id;

    update public.talent_partner_reward_entries
    set payout_id=v_payout_id,updated_at=now()
    where partner_user_id=v_group.partner_user_id
      and currency=v_group.currency
      and status='Approved'
      and payout_id is null
      and available_at<=now();

    v_total:=v_total+v_group.amount;
    v_count:=v_count+v_group.entry_count;
  end loop;

  if v_count=0 then
    delete from public.talent_partner_payout_batches where id=v_batch_id;
    return jsonb_build_object('success',false,'message','No approved Talent Partner rewards currently meet the payout requirements.');
  end if;

  update public.talent_partner_payout_batches
  set entry_count=v_count,total_amount=v_total
  where id=v_batch_id;

  return jsonb_build_object('success',true,'batchId',v_batch_id,'batchNumber',v_number,'entryCount',v_count,'totalAmount',v_total);
end;
$$;

create or replace function public.admin_mark_talent_partner_payout_paid(
  p_payout_id uuid,
  p_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_row public.talent_partner_payouts%rowtype;
  v_remaining integer;
  v_transaction text:=left(trim(coalesce(p_transaction_id,'')),300);
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

create or replace function public.admin_override_talent_partner_referral(
  p_applicant_id uuid,
  p_partner_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_partner public.talent_partner_profiles%rowtype;
  v_ref public.talent_partner_referrals%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'A clear override reason is required.'; end if;

  select * into v_app from public.applicants where id=p_applicant_id;
  if not found then raise exception 'Applicant not found.'; end if;

  select * into v_partner from public.talent_partner_profiles where user_id=p_partner_user_id;
  if not found then raise exception 'Talent Partner not found.'; end if;

  select * into v_ref from public.talent_partner_referrals where applicant_id=p_applicant_id for update;
  if found then
    if exists(select 1 from public.talent_partner_reward_entries where referral_id=v_ref.id) then
      raise exception 'Referral ownership cannot be changed after financial reward activity exists.';
    end if;
    update public.talent_partner_referrals
    set partner_user_id=p_partner_user_id,
        referral_code_snapshot=v_partner.partner_code,
        override_reason=left(trim(p_reason),3000),
        overridden_by=auth.uid(),
        overridden_at=now(),
        updated_at=now()
    where id=v_ref.id
    returning * into v_ref;
  else
    insert into public.talent_partner_referrals(
      partner_user_id,applicant_id,career_job_id,referral_code_snapshot,status,referred_user_id,activated_at,
      override_reason,overridden_by,overridden_at
    ) values(
      p_partner_user_id,v_app.id,v_app.career_job_id,v_partner.partner_code,
      case when v_app.stage='Activated' then 'Activated' else 'Applicant' end,
      v_app.linked_user_id,
      case when v_app.stage='Activated' then coalesce(v_app.stage_entered_at,v_app.updated_at) else null end,
      left(trim(p_reason),3000),auth.uid(),now()
    ) returning * into v_ref;
  end if;

  return to_jsonb(v_ref);
end;
$$;
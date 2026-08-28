-- Final hardening for independent sales partner PayPal payouts.
-- A payout batch may contain only commissions that were explicitly Approved beforehand.
-- This preserves the enforced lifecycle: Earned -> Approved -> PayPal payout batch -> Paid.

create or replace function public.admin_create_commission_payout_batch(
  p_scheduled_date date,
  p_entry_ids uuid[],
  p_title text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_id uuid;
  v_total numeric;
  v_count int;
  v_people int;
  v_currency_count int;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized.';
  end if;

  if coalesce(array_length(p_entry_ids,1),0)=0 then
    raise exception 'At least one commission entry is required.';
  end if;

  select count(*)
    into v_count
  from public.commission_entries
  where id=any(p_entry_ids);

  if v_count <> cardinality(p_entry_ids) then
    raise exception 'One or more payout entries are invalid or duplicated.';
  end if;

  if exists(
    select 1
    from public.commission_entries
    where id=any(p_entry_ids)
      and status <> 'Approved'
  ) then
    raise exception 'Only already-Approved commissions may be added to a payout batch.';
  end if;

  if exists(
    select 1
    from public.commission_entries
    where id=any(p_entry_ids)
      and payout_batch_id is not null
  ) then
    raise exception 'A commission already assigned to a payout batch cannot be batched again.';
  end if;

  if exists(
    select 1
    from public.commission_entries
    where id=any(p_entry_ids)
      and salesperson_id is null
  ) then
    raise exception 'Every payout entry must have an assigned sales partner.';
  end if;

  select count(distinct upper(currency))
    into v_currency_count
  from public.commission_entries
  where id=any(p_entry_ids);

  if v_currency_count <> 1 then
    raise exception 'Each payout batch must contain one currency only. Create separate batches for different currencies.';
  end if;

  select
    coalesce(sum(commission_amount),0),
    count(*),
    count(distinct salesperson_id)
  into v_total,v_count,v_people
  from public.commission_entries
  where id=any(p_entry_ids);

  insert into public.commission_payout_batches(
    scheduled_date,
    status,
    title,
    total_amount,
    total_entries_count,
    total_salespeople_count,
    notes,
    created_by,
    processed_by
  ) values (
    p_scheduled_date,
    'Approved',
    coalesce(nullif(trim(p_title),''),'Commission Payout'),
    v_total,
    v_count,
    v_people,
    p_notes,
    auth.uid(),
    auth.uid()
  )
  returning id into v_id;

  -- Do not change commission approval state here. Approval must happen before batching.
  update public.commission_entries
  set payout_batch_id=v_id,
      updated_at=now()
  where id=any(p_entry_ids);

  insert into public.commission_partner_payouts(
    payout_batch_id,
    salesperson_id,
    currency,
    amount,
    entry_count,
    status,
    payout_method,
    paypal_email_snapshot,
    preferred_currency_snapshot,
    hold_reason
  )
  select
    v_id,
    g.salesperson_id,
    g.currency,
    g.amount,
    g.entry_count,
    case
      when coalesce((s.state->>'payoutEligible')::boolean,false) is not true then 'On Hold'
      when upper(coalesce(s.state->>'preferredCurrency','USD')) <> upper(g.currency) then 'On Hold'
      else 'Ready'
    end,
    'PayPal',
    nullif(s.state->>'paypalEmail',''),
    nullif(s.state->>'preferredCurrency',''),
    case
      when coalesce((s.state->>'payoutEligible')::boolean,false) is not true
        then coalesce(s.state->>'holdReason','Payout profile is not eligible.')
      when upper(coalesce(s.state->>'preferredCurrency','USD')) <> upper(g.currency)
        then 'Preferred payout currency '||coalesce(s.state->>'preferredCurrency','USD')||' does not match this commission payout currency '||g.currency||'.'
      else null
    end
  from (
    select
      salesperson_id,
      upper(currency) as currency,
      round(sum(commission_amount),2) as amount,
      count(*)::int as entry_count
    from public.commission_entries
    where id=any(p_entry_ids)
    group by salesperson_id,upper(currency)
  ) g
  cross join lateral (
    select public.commission_partner_payout_state(g.salesperson_id) as state
  ) s;

  return v_id;
end;
$$;

revoke all on function public.admin_create_commission_payout_batch(date,uuid[],text,text) from public,anon;
grant execute on function public.admin_create_commission_payout_batch(date,uuid[],text,text) to authenticated;

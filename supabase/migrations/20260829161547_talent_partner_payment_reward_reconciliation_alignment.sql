-- Talent Partner payment reward reconciliation alignment
-- Keeps sale rewards, unpaid payout batches and payment-verification state consistent.

begin;

create or replace function public.talent_partner_recalculate_unpaid_payout(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payout public.talent_partner_payouts%rowtype;
  v_amount numeric:=0;
  v_entry_count integer:=0;
  v_ready integer:=0;
  v_paid integer:=0;
  v_batch_amount numeric:=0;
  v_batch_entries integer:=0;
begin
  select * into v_payout
  from public.talent_partner_payouts
  where id=p_payout_id
  for update;

  if not found or v_payout.status not in ('Ready','Held','Cancelled') then
    return;
  end if;

  select coalesce(sum(reward_amount),0),count(*)::integer
  into v_amount,v_entry_count
  from public.talent_partner_reward_entries
  where payout_id=p_payout_id and status='Approved';

  if v_entry_count=0 then
    update public.talent_partner_payouts
    set status='Cancelled',amount=0,entry_count=0,
        hold_reason='Source reward became ineligible before settlement.'
    where id=p_payout_id and status<>'Paid';
  else
    update public.talent_partner_payouts
    set amount=round(v_amount,2),entry_count=v_entry_count
    where id=p_payout_id and status<>'Paid';
  end if;

  select
    count(*) filter (where status='Ready'),
    count(*) filter (where status='Paid'),
    coalesce(sum(amount) filter (where status in ('Ready','Held','Paid')),0),
    coalesce(sum(entry_count) filter (where status in ('Ready','Held','Paid')),0)::integer
  into v_ready,v_paid,v_batch_amount,v_batch_entries
  from public.talent_partner_payouts
  where payout_batch_id=v_payout.payout_batch_id;

  update public.talent_partner_payout_batches
  set total_amount=round(v_batch_amount,2),
      entry_count=v_batch_entries,
      status=case
        when v_ready>0 and v_paid>0 then 'Partially Paid'
        when v_ready>0 then 'Ready'
        when v_paid>0 then 'Paid'
        else 'Cancelled'
      end,
      paid_at=case when v_ready=0 and v_paid>0 then coalesce(paid_at,now()) else null end
  where id=v_payout.payout_batch_id;
end;
$$;

revoke all on function public.talent_partner_recalculate_unpaid_payout(uuid) from public, anon, authenticated;
grant execute on function public.talent_partner_recalculate_unpaid_payout(uuid) to service_role;

create or replace function public.talent_partner_payment_reward_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quotation_id uuid;
  v_salesperson_id uuid;
  v_replacement_payment_id uuid;
  v_reward record;
  v_payout_status text;
begin
  if new.status='Verified' and (tg_op='INSERT' or old.status is distinct from 'Verified') then
    perform public.talent_partner_generate_sale_reward(new.id);

  elsif tg_op='UPDATE' and old.status='Verified' and new.status is distinct from 'Verified' then
    v_quotation_id:=coalesce(new.quotation_id,old.quotation_id);
    v_salesperson_id:=coalesce(new.salesperson_id,old.salesperson_id);

    if v_quotation_id is null then
      return new;
    end if;

    if v_salesperson_id is not null then
      select p.id into v_replacement_payment_id
      from public.payments p
      where p.id<>new.id
        and p.salesperson_id=v_salesperson_id
        and p.quotation_id=v_quotation_id
        and p.status='Verified'
      order by coalesce(p.verified_at,p.paid_at,p.created_at),p.created_at,p.id
      limit 1;
    end if;

    for v_reward in
      select e.id,e.payout_id
      from public.talent_partner_reward_entries e
      where e.event_type='sale'
        and (e.source_quotation_id=v_quotation_id or (e.source_quotation_id is null and e.source_payment_id=new.id))
        and e.status in ('Pending','Approved')
      for update
    loop
      v_payout_status:=null;
      if v_reward.payout_id is not null then
        select p.status into v_payout_status
        from public.talent_partner_payouts p
        where p.id=v_reward.payout_id
        for update;
      end if;

      -- Paid payouts are immutable. Any post-payment recovery must be handled as a separate
      -- audited financial adjustment rather than silently mutating settled history.
      if v_payout_status='Paid' then
        continue;
      end if;

      update public.talent_partner_reward_entries
      set status='Reversed',
          payout_id=null,
          reversal_reason=case
            when v_replacement_payment_id is null then 'No verified payment remains for the source quotation.'
            else 'Source payment lost verification; reward is being reconciled against another verified payment.'
          end,
          reversed_at=now(),updated_at=now()
      where id=v_reward.id;

      if v_reward.payout_id is not null then
        perform public.talent_partner_recalculate_unpaid_payout(v_reward.payout_id);
      end if;
    end loop;

    if v_replacement_payment_id is not null then
      perform public.talent_partner_generate_sale_reward(v_replacement_payment_id);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.talent_partner_payment_reward_trigger() from public, anon, authenticated;
grant execute on function public.talent_partner_payment_reward_trigger() to service_role;

commit;

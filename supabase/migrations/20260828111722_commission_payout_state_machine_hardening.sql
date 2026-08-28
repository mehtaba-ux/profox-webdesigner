-- Close the remaining commission payout integrity gaps.
--
-- 1. Allow the Processing batch state used while a multi-partner batch is
--    only partly paid.
-- 2. Record explicit approval evidence and enforce legal status transitions.
-- 3. Require payment evidence for Paid records.
-- 4. Remove direct table mutation privileges; all writes go through guarded
--    SECURITY DEFINER RPCs.

alter table public.commission_payout_batches
  drop constraint if exists commission_payout_batches_status_check;

alter table public.commission_payout_batches
  add constraint commission_payout_batches_status_check
  check (status in ('Draft','Approved','Processing','Completed','Cancelled'));

alter table public.commission_entries
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.user_profiles(id) on delete set null;

create index if not exists idx_commission_entries_approved_by
  on public.commission_entries(approved_by)
  where approved_by is not null;
create index if not exists idx_commission_entries_client_id
  on public.commission_entries(client_id)
  where client_id is not null;
create index if not exists idx_commission_entries_opportunity_id
  on public.commission_entries(opportunity_id)
  where opportunity_id is not null;
create index if not exists idx_commission_entries_paid_by
  on public.commission_entries(paid_by)
  where paid_by is not null;
create index if not exists idx_commission_partner_payouts_paid_by
  on public.commission_partner_payouts(paid_by)
  where paid_by is not null;
create index if not exists idx_commission_payout_batches_created_by
  on public.commission_payout_batches(created_by)
  where created_by is not null;
create index if not exists idx_commission_payout_batches_processed_by
  on public.commission_payout_batches(processed_by)
  where processed_by is not null;

create or replace function public.enforce_commission_entry_state_transition()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'Reversed' then
    raise exception 'A reversed commission is final and cannot change status.';
  end if;

  if old.status = 'Paid' and new.status <> 'Reversed' then
    raise exception 'A paid commission may only be reversed through the protected reversal workflow.';
  end if;

  if old.payout_batch_id is not null
     and not (old.status = 'Approved' and new.status in ('Paid','Reversed'))
     and not (old.status = 'Paid' and new.status = 'Reversed') then
    raise exception 'A commission in a payout batch may only become Paid or Reversed.';
  end if;

  if not (
    (old.status = 'Earned' and new.status in ('Under Review','Approved','Disputed','Reversed'))
    or (old.status = 'Under Review' and new.status in ('Earned','Approved','Disputed','Reversed'))
    or (old.status = 'Disputed' and new.status in ('Under Review','Approved','Reversed'))
    or (old.status = 'Approved' and new.status in ('Under Review','Disputed','Paid','Reversed'))
    or (old.status = 'Paid' and new.status = 'Reversed')
  ) then
    raise exception 'Invalid commission status transition from % to %.', old.status, new.status;
  end if;

  if new.status = 'Approved' then
    new.approved_at := now();
    new.approved_by := auth.uid();
    if new.approved_by is null or not public.is_admin() then
      raise exception 'Explicit administrator approval is required.';
    end if;
  end if;

  if new.status = 'Paid' then
    if new.payout_batch_id is null
       or new.paid_at is null
       or new.paid_by is null
       or nullif(btrim(coalesce(new.payout_reference,'')),'') is null then
      raise exception 'Paid commission requires a payout batch, payer, paid timestamp, and transaction reference.';
    end if;
  end if;

  if new.status = 'Reversed'
     and nullif(btrim(coalesce(new.reversal_reason,'')),'') is null then
    raise exception 'Reversal reason is required.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_commission_entry_state_transition()
  from public,anon,authenticated;

drop trigger if exists enforce_commission_entry_state_transition
  on public.commission_entries;
create trigger enforce_commission_entry_state_transition
before update of status on public.commission_entries
for each row
execute function public.enforce_commission_entry_state_transition();

alter table public.commission_entries
  drop constraint if exists commission_entries_paid_evidence_check;
alter table public.commission_entries
  add constraint commission_entries_paid_evidence_check
  check (
    status <> 'Paid'
    or (
      payout_batch_id is not null
      and paid_at is not null
      and paid_by is not null
      and nullif(btrim(coalesce(payout_reference,'')),'') is not null
    )
  ) not valid;
alter table public.commission_entries
  validate constraint commission_entries_paid_evidence_check;

alter table public.commission_partner_payouts
  drop constraint if exists commission_partner_payouts_paid_evidence_check;
alter table public.commission_partner_payouts
  add constraint commission_partner_payouts_paid_evidence_check
  check (
    status <> 'Paid'
    or (
      paid_at is not null
      and paid_by is not null
      and nullif(btrim(coalesce(paypal_transaction_id,'')),'') is not null
    )
  ) not valid;
alter table public.commission_partner_payouts
  validate constraint commission_partner_payouts_paid_evidence_check;

create or replace function public.admin_update_commission_status(
  p_entry_id uuid,
  p_status text,
  p_notes text default '',
  p_payout_reference text default ''
)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_entry public.commission_entries%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized.';
  end if;

  if p_status not in ('Earned','Under Review','Approved','Disputed') then
    raise exception 'Use the dedicated payout or reversal workflow for Paid and Reversed commissions.';
  end if;

  if nullif(btrim(coalesce(p_payout_reference,'')),'') is not null then
    raise exception 'A payout reference may only be recorded through the protected payout confirmation workflow.';
  end if;

  select *
    into v_entry
  from public.commission_entries
  where id=p_entry_id
  for update;

  if not found then
    raise exception 'Commission entry not found.';
  end if;

  if v_entry.payout_batch_id is not null and p_status is distinct from v_entry.status then
    raise exception 'A commission already assigned to a payout batch cannot be manually changed.';
  end if;

  update public.commission_entries
  set status=p_status,
      admin_review_notes=case
        when btrim(coalesce(p_notes,''))='' then admin_review_notes
        else concat_ws(' | ',nullif(admin_review_notes,''),btrim(p_notes))
      end,
      updated_at=now()
  where id=p_entry_id;
end;
$$;

revoke all on function public.admin_update_commission_status(uuid,text,text,text)
  from public,anon;
grant execute on function public.admin_update_commission_status(uuid,text,text,text)
  to authenticated;

create or replace function public.admin_approve_custom_commission_rate(
  p_quotation_id uuid,
  p_rate numeric,
  p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_rule public.commission_rules%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized.';
  end if;

  if p_quotation_id is null then
    raise exception 'Quotation is required.';
  end if;

  select *
    into v_rule
  from public.commission_rules
  where product_code='PF-CUSTOM';

  if not found then
    raise exception 'Custom commission rule is not configured.';
  end if;

  if p_rate is null
     or p_rate < v_rule.min_rate_percent
     or p_rate > v_rule.max_rate_percent then
    raise exception 'Custom commission rate must be between % and %.',
      v_rule.min_rate_percent,
      v_rule.max_rate_percent;
  end if;

  perform 1
  from public.commission_entries
  where quotation_id=p_quotation_id
    and product_code='PF-CUSTOM'
  for update;

  if not found then
    raise exception 'Custom commission entry was not found.';
  end if;

  if exists(
    select 1
    from public.commission_entries
    where quotation_id=p_quotation_id
      and product_code='PF-CUSTOM'
      and status in ('Paid','Reversed')
  ) then
    raise exception 'Paid or reversed commission cannot be changed.';
  end if;

  if exists(
    select 1
    from public.commission_entries
    where quotation_id=p_quotation_id
      and product_code='PF-CUSTOM'
      and payout_batch_id is not null
  ) then
    raise exception 'A commission already assigned to a payout batch cannot be changed.';
  end if;

  update public.quotations
  set approved_commission_rate=p_rate,
      updated_at=now()
  where id=p_quotation_id;

  if not found then
    raise exception 'Quotation not found.';
  end if;

  update public.commission_entries
  set base_rate_percent=p_rate,
      effective_rate_percent=p_rate+self_generated_bonus_percent+performance_bonus_percent,
      commission_amount=round((verified_payment_amount*(p_rate+self_generated_bonus_percent+performance_bonus_percent)/100)::numeric,2),
      status='Approved',
      approved_at=now(),
      approved_by=auth.uid(),
      admin_review_notes=case
        when btrim(coalesce(p_notes,''))='' then admin_review_notes
        else concat_ws(' | ',nullif(admin_review_notes,''),btrim(p_notes))
      end,
      rule_snapshot=rule_snapshot||jsonb_build_object(
        'customApprovedBaseRate',p_rate,
        'customApprovedAt',now(),
        'customApprovedBy',auth.uid()
      ),
      updated_at=now()
  where quotation_id=p_quotation_id
    and product_code='PF-CUSTOM';
end;
$$;

revoke all on function public.admin_approve_custom_commission_rate(uuid,numeric,text)
  from public,anon;
grant execute on function public.admin_approve_custom_commission_rate(uuid,numeric,text)
  to authenticated;

-- Direct reads remain available under RLS. Direct writes, TRUNCATE, REFERENCES,
-- and TRIGGER privileges are removed; guarded RPCs perform all mutations.
revoke all on table public.commission_entries from anon,authenticated;
revoke all on table public.commission_payout_batches from anon,authenticated;
revoke all on table public.commission_partner_payouts from anon,authenticated;
revoke all on table public.sales_partner_payout_profiles from anon,authenticated;
revoke all on table public.commission_adjustment_events from anon,authenticated;

grant select on table public.commission_entries to authenticated;
grant select on table public.commission_payout_batches to authenticated;
grant select on table public.commission_partner_payouts to authenticated;
grant select on table public.sales_partner_payout_profiles to authenticated;
grant select on table public.commission_adjustment_events to authenticated;

drop policy if exists commission_entries_admin on public.commission_entries;
drop policy if exists commission_entries_read on public.commission_entries;
create policy commission_entries_read
  on public.commission_entries
  for select
  to authenticated
  using ((select public.is_admin()) or salesperson_id=(select auth.uid()));

drop policy if exists commission_batches_admin on public.commission_payout_batches;
create policy commission_batches_admin_read
  on public.commission_payout_batches
  for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists commission_partner_payouts_admin on public.commission_partner_payouts;
drop policy if exists commission_partner_payouts_self_read on public.commission_partner_payouts;
create policy commission_partner_payouts_read
  on public.commission_partner_payouts
  for select
  to authenticated
  using ((select public.is_admin()) or salesperson_id=(select auth.uid()));

drop policy if exists sales_partner_payout_profiles_admin on public.sales_partner_payout_profiles;
drop policy if exists sales_partner_payout_profiles_self_read on public.sales_partner_payout_profiles;
create policy sales_partner_payout_profiles_read
  on public.sales_partner_payout_profiles
  for select
  to authenticated
  using ((select public.is_admin()) or salesperson_id=(select auth.uid()));

drop policy if exists commission_adjustment_events_admin_read
  on public.commission_adjustment_events;
create policy commission_adjustment_events_admin_read
  on public.commission_adjustment_events
  for select
  to authenticated
  using ((select public.is_admin()));

-- Consolidate the rule/settings SELECT policies so authorization functions are
-- initialized once per statement and admins do not match duplicate policies.
drop policy if exists commission_rules_read on public.commission_rules;
drop policy if exists commission_rules_admin on public.commission_rules;
create policy commission_rules_read
  on public.commission_rules
  for select
  to authenticated
  using ((select public.is_active_staff()) or (select public.is_admin()));
create policy commission_rules_insert
  on public.commission_rules
  for insert
  to authenticated
  with check ((select public.is_admin()));
create policy commission_rules_update
  on public.commission_rules
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy commission_rules_delete
  on public.commission_rules
  for delete
  to authenticated
  using ((select public.is_admin()));

drop policy if exists commission_settings_read on public.commission_settings;
drop policy if exists commission_settings_admin on public.commission_settings;
create policy commission_settings_read
  on public.commission_settings
  for select
  to authenticated
  using ((select public.is_active_staff()) or (select public.is_admin()));
create policy commission_settings_insert
  on public.commission_settings
  for insert
  to authenticated
  with check ((select public.is_admin()));
create policy commission_settings_update
  on public.commission_settings
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy commission_settings_delete
  on public.commission_settings
  for delete
  to authenticated
  using ((select public.is_admin()));

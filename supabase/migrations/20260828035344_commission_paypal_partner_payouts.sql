-- Commission-only independent sales partner PayPal payout workflow.
-- This intentionally does not introduce payroll, GST, TDS, PF, ESI, or tax calculations.

create table if not exists public.sales_partner_payout_profiles (
  salesperson_id uuid primary key references public.user_profiles(id) on delete cascade,
  payout_method text not null default 'PayPal' check (payout_method = 'PayPal'),
  paypal_email text,
  preferred_currency text not null default 'USD' check (preferred_currency ~ '^[A-Z]{3}$'),
  paypal_confirmed boolean not null default false,
  payout_enabled boolean not null default true,
  confirmed_at timestamptz,
  confirmed_by uuid references public.user_profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.user_profiles(id),
  check (paypal_email is null or length(paypal_email) <= 320)
);

create table if not exists public.commission_partner_payouts (
  id uuid primary key default gen_random_uuid(),
  payout_batch_id uuid not null references public.commission_payout_batches(id) on delete cascade,
  salesperson_id uuid not null references public.user_profiles(id),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric(14,2) not null check (amount >= 0),
  entry_count integer not null check (entry_count >= 0),
  status text not null check (status in ('Ready','On Hold','Paid','Cancelled')),
  payout_method text not null default 'PayPal' check (payout_method = 'PayPal'),
  paypal_email_snapshot text,
  preferred_currency_snapshot text,
  paypal_transaction_id text,
  hold_reason text,
  paid_at timestamptz,
  paid_by uuid references public.user_profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payout_batch_id, salesperson_id, currency),
  check (paypal_transaction_id is null or length(paypal_transaction_id) between 6 and 128)
);

create unique index if not exists commission_partner_payouts_paypal_tx_unique
  on public.commission_partner_payouts(paypal_transaction_id)
  where paypal_transaction_id is not null;
create index if not exists commission_partner_payouts_batch_idx
  on public.commission_partner_payouts(payout_batch_id,status);
create index if not exists commission_partner_payouts_salesperson_idx
  on public.commission_partner_payouts(salesperson_id,created_at desc);

alter table public.sales_partner_payout_profiles enable row level security;
alter table public.commission_partner_payouts enable row level security;

drop policy if exists sales_partner_payout_profiles_admin on public.sales_partner_payout_profiles;
create policy sales_partner_payout_profiles_admin on public.sales_partner_payout_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists sales_partner_payout_profiles_self_read on public.sales_partner_payout_profiles;
create policy sales_partner_payout_profiles_self_read on public.sales_partner_payout_profiles
  for select to authenticated using (salesperson_id = auth.uid());

drop policy if exists commission_partner_payouts_admin on public.commission_partner_payouts;
create policy commission_partner_payouts_admin on public.commission_partner_payouts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists commission_partner_payouts_self_read on public.commission_partner_payouts;
create policy commission_partner_payouts_self_read on public.commission_partner_payouts
  for select to authenticated using (salesperson_id = auth.uid());

grant select,insert,update,delete on public.sales_partner_payout_profiles to authenticated;
grant select,insert,update,delete on public.commission_partner_payouts to authenticated;
revoke all on public.sales_partner_payout_profiles from anon;
revoke all on public.commission_partner_payouts from anon;

create or replace function public.commission_partner_payout_state(p_salesperson_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_profile public.user_profiles%rowtype;
  v_payout public.sales_partner_payout_profiles%rowtype;
  v_applicant public.applicants%rowtype;
  v_agreement public.sales_partner_agreements%rowtype;
  v_eligible boolean := false;
  v_reason text := '';
begin
  select * into v_profile from public.user_profiles where id=p_salesperson_id;
  if not found then
    return jsonb_build_object('salespersonId',p_salesperson_id,'payoutEligible',false,'holdReason','Sales partner profile was not found.');
  end if;

  select * into v_payout from public.sales_partner_payout_profiles where salesperson_id=p_salesperson_id;
  select * into v_applicant from public.applicants where linked_user_id=p_salesperson_id order by updated_at desc limit 1;
  if v_applicant.id is not null then
    select * into v_agreement from public.sales_partner_agreements where applicant_id=v_applicant.id order by created_at desc limit 1;
  end if;

  if coalesce(v_profile.role,'') <> 'sales' then v_reason := 'User is not an active Sales partner.';
  elsif coalesce(v_profile.status,'') <> 'active' then v_reason := 'Sales partner account is not active.';
  elsif v_applicant.id is null or coalesce(v_applicant.stage,'') <> 'Activated' or coalesce(v_applicant.final_approval,false) is not true then v_reason := 'Sales partner activation is not complete.';
  elsif v_agreement.id is null or coalesce(v_agreement.status,'') <> 'Verified' or v_agreement.verified_at is null then v_reason := 'Verified Independent Sales Partner Agreement is required.';
  elsif v_payout.salesperson_id is null then v_reason := 'PayPal payout profile is missing.';
  elsif coalesce(v_payout.payout_enabled,false) is not true then v_reason := 'Commission payouts are disabled for this partner.';
  elsif coalesce(v_payout.paypal_confirmed,false) is not true then v_reason := 'PayPal payout email has not been confirmed.';
  elsif coalesce(trim(v_payout.paypal_email),'') = '' or trim(v_payout.paypal_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then v_reason := 'A valid confirmed PayPal email is required.';
  else v_eligible := true;
  end if;

  return jsonb_build_object(
    'salespersonId',v_profile.id,'fullName',coalesce(v_profile.full_name,''),'email',coalesce(v_profile.email,''),'country',coalesce(v_profile.country,''),
    'profileStatus',coalesce(v_profile.status,''),'activationStage',nullif(v_applicant.stage,''),'finalApproval',v_applicant.final_approval,
    'agreementStatus',nullif(v_agreement.status,''),'agreementNumber',nullif(v_agreement.agreement_number,''),
    'agreementVerified',(v_agreement.id is not null and v_agreement.status='Verified' and v_agreement.verified_at is not null),
    'payoutMethod','PayPal','paypalEmail',nullif(trim(v_payout.paypal_email),''),'preferredCurrency',coalesce(nullif(v_payout.preferred_currency,''),'USD'),
    'paypalConfirmed',coalesce(v_payout.paypal_confirmed,false),'payoutEnabled',coalesce(v_payout.payout_enabled,false),
    'payoutEligible',v_eligible,'holdReason',nullif(v_reason,''),'updatedAt',v_payout.updated_at
  );
end;
$$;
revoke all on function public.commission_partner_payout_state(uuid) from public,anon,authenticated;

create or replace function public.admin_list_sales_partner_payout_profiles()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $$
declare v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;
  select coalesce(jsonb_agg(x.state order by lower(coalesce(x.state->>'fullName',''))),'[]'::jsonb)
    into v_result
  from (select public.commission_partner_payout_state(u.id) as state from public.user_profiles u where u.role='sales') x;
  return v_result;
end;
$$;
revoke all on function public.admin_list_sales_partner_payout_profiles() from public,anon;
grant execute on function public.admin_list_sales_partner_payout_profiles() to authenticated;

create or replace function public.admin_upsert_sales_partner_payout_profile(
  p_salesperson_id uuid,
  p_paypal_email text,
  p_preferred_currency text default 'USD',
  p_paypal_confirmed boolean default false,
  p_payout_enabled boolean default true,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_email text := lower(trim(coalesce(p_paypal_email,'')));
  v_currency text := upper(trim(coalesce(p_preferred_currency,'USD')));
  v_state jsonb;
  v_row public.commission_partner_payouts%rowtype;
  v_status text;
  v_reason text;
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;
  if p_salesperson_id is null then raise exception 'Sales partner is required.'; end if;
  if not exists(select 1 from public.user_profiles where id=p_salesperson_id and role='sales') then raise exception 'Sales partner profile was not found.'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Preferred payout currency must be a three-letter currency code.'; end if;
  if v_email <> '' and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid PayPal email address.'; end if;
  if coalesce(p_paypal_confirmed,false) and v_email='' then raise exception 'A PayPal email is required before it can be confirmed.'; end if;

  insert into public.sales_partner_payout_profiles(
    salesperson_id,payout_method,paypal_email,preferred_currency,paypal_confirmed,payout_enabled,confirmed_at,confirmed_by,notes,updated_at,updated_by
  ) values (
    p_salesperson_id,'PayPal',nullif(v_email,''),v_currency,coalesce(p_paypal_confirmed,false),coalesce(p_payout_enabled,true),
    case when coalesce(p_paypal_confirmed,false) then now() else null end,
    case when coalesce(p_paypal_confirmed,false) then auth.uid() else null end,
    nullif(trim(coalesce(p_notes,'')),''),now(),auth.uid()
  )
  on conflict (salesperson_id) do update set
    paypal_email=excluded.paypal_email,preferred_currency=excluded.preferred_currency,paypal_confirmed=excluded.paypal_confirmed,payout_enabled=excluded.payout_enabled,
    confirmed_at=case
      when excluded.paypal_confirmed and (public.sales_partner_payout_profiles.paypal_confirmed is distinct from true or public.sales_partner_payout_profiles.paypal_email is distinct from excluded.paypal_email) then now()
      when excluded.paypal_confirmed then public.sales_partner_payout_profiles.confirmed_at else null end,
    confirmed_by=case
      when excluded.paypal_confirmed and (public.sales_partner_payout_profiles.paypal_confirmed is distinct from true or public.sales_partner_payout_profiles.paypal_email is distinct from excluded.paypal_email) then auth.uid()
      when excluded.paypal_confirmed then public.sales_partner_payout_profiles.confirmed_by else null end,
    notes=excluded.notes,updated_at=now(),updated_by=auth.uid();

  v_state := public.commission_partner_payout_state(p_salesperson_id);
  for v_row in select * from public.commission_partner_payouts where salesperson_id=p_salesperson_id and status in ('Ready','On Hold') for update
  loop
    if coalesce((v_state->>'payoutEligible')::boolean,false) is not true then
      v_status := 'On Hold'; v_reason := coalesce(v_state->>'holdReason','Payout profile is not eligible.');
    elsif upper(coalesce(v_state->>'preferredCurrency','USD')) <> upper(v_row.currency) then
      v_status := 'On Hold'; v_reason := 'Preferred payout currency '||coalesce(v_state->>'preferredCurrency','USD')||' does not match this commission payout currency '||v_row.currency||'.';
    else v_status := 'Ready'; v_reason := null;
    end if;
    update public.commission_partner_payouts set status=v_status,paypal_email_snapshot=nullif(v_state->>'paypalEmail',''),preferred_currency_snapshot=nullif(v_state->>'preferredCurrency',''),hold_reason=v_reason,updated_at=now() where id=v_row.id;
  end loop;
  return v_state;
end;
$$;
revoke all on function public.admin_upsert_sales_partner_payout_profile(uuid,text,text,boolean,boolean,text) from public,anon;
grant execute on function public.admin_upsert_sales_partner_payout_profile(uuid,text,text,boolean,boolean,text) to authenticated;

create or replace function public.admin_create_commission_payout_batch(p_scheduled_date date,p_entry_ids uuid[],p_title text default null,p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_id uuid; v_total numeric; v_count int; v_people int; v_currency_count int;
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;
  if coalesce(array_length(p_entry_ids,1),0)=0 then raise exception 'At least one commission entry is required.'; end if;
  select count(*) into v_count from public.commission_entries where id=any(p_entry_ids);
  if v_count <> cardinality(p_entry_ids) then raise exception 'One or more payout entries are invalid or duplicated.'; end if;
  if exists(select 1 from public.commission_entries where id=any(p_entry_ids) and status not in ('Earned','Approved')) then raise exception 'Only Earned or Approved commissions may be batched.'; end if;
  if exists(select 1 from public.commission_entries where id=any(p_entry_ids) and payout_batch_id is not null) then raise exception 'A commission already assigned to a payout batch cannot be batched again.'; end if;
  if exists(select 1 from public.commission_entries where id=any(p_entry_ids) and salesperson_id is null) then raise exception 'Every payout entry must have an assigned sales partner.'; end if;
  select count(distinct upper(currency)) into v_currency_count from public.commission_entries where id=any(p_entry_ids);
  if v_currency_count <> 1 then raise exception 'Each payout batch must contain one currency only. Create separate batches for different currencies.'; end if;
  select coalesce(sum(commission_amount),0),count(*),count(distinct salesperson_id) into v_total,v_count,v_people from public.commission_entries where id=any(p_entry_ids);

  insert into public.commission_payout_batches(scheduled_date,status,title,total_amount,total_entries_count,total_salespeople_count,notes,created_by,processed_by)
  values(p_scheduled_date,'Approved',coalesce(nullif(trim(p_title),''),'Commission Payout'),v_total,v_count,v_people,p_notes,auth.uid(),auth.uid()) returning id into v_id;
  update public.commission_entries set payout_batch_id=v_id,status='Approved',updated_at=now() where id=any(p_entry_ids);

  insert into public.commission_partner_payouts(payout_batch_id,salesperson_id,currency,amount,entry_count,status,payout_method,paypal_email_snapshot,preferred_currency_snapshot,hold_reason)
  select v_id,g.salesperson_id,g.currency,g.amount,g.entry_count,
    case when coalesce((s.state->>'payoutEligible')::boolean,false) is not true then 'On Hold'
         when upper(coalesce(s.state->>'preferredCurrency','USD')) <> upper(g.currency) then 'On Hold' else 'Ready' end,
    'PayPal',nullif(s.state->>'paypalEmail',''),nullif(s.state->>'preferredCurrency',''),
    case when coalesce((s.state->>'payoutEligible')::boolean,false) is not true then coalesce(s.state->>'holdReason','Payout profile is not eligible.')
         when upper(coalesce(s.state->>'preferredCurrency','USD')) <> upper(g.currency) then 'Preferred payout currency '||coalesce(s.state->>'preferredCurrency','USD')||' does not match this commission payout currency '||g.currency||'.' else null end
  from (
    select salesperson_id,upper(currency) as currency,round(sum(commission_amount),2) as amount,count(*)::int as entry_count
    from public.commission_entries where id=any(p_entry_ids) group by salesperson_id,upper(currency)
  ) g
  cross join lateral (select public.commission_partner_payout_state(g.salesperson_id) as state) s;
  return v_id;
end;
$$;
revoke all on function public.admin_create_commission_payout_batch(date,uuid[],text,text) from public,anon;
grant execute on function public.admin_create_commission_payout_batch(date,uuid[],text,text) to authenticated;

create or replace function public.admin_get_commission_partner_payouts(p_batch_id uuid default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $$
declare v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'batchId',p.payout_batch_id,'batchNumber',b.batch_number,'batchTitle',b.title,'scheduledDate',b.scheduled_date,'batchStatus',b.status,
    'salespersonId',p.salesperson_id,'salespersonName',coalesce(u.full_name,'Sales Partner'),'salespersonEmail',coalesce(u.email,''),'country',coalesce(u.country,''),
    'currency',p.currency,'amount',p.amount,'entryCount',p.entry_count,'status',p.status,'payoutMethod',p.payout_method,'paypalEmail',p.paypal_email_snapshot,
    'preferredCurrency',p.preferred_currency_snapshot,'paypalTransactionId',p.paypal_transaction_id,'holdReason',p.hold_reason,'paidAt',p.paid_at,'notes',p.notes,
    'createdAt',p.created_at,'updatedAt',p.updated_at
  ) order by b.created_at desc,lower(coalesce(u.full_name,''))),'[]'::jsonb) into v_result
  from public.commission_partner_payouts p
  join public.commission_payout_batches b on b.id=p.payout_batch_id
  join public.user_profiles u on u.id=p.salesperson_id
  where p_batch_id is null or p.payout_batch_id=p_batch_id;
  return v_result;
end;
$$;
revoke all on function public.admin_get_commission_partner_payouts(uuid) from public,anon;
grant execute on function public.admin_get_commission_partner_payouts(uuid) to authenticated;

create or replace function public.admin_refresh_commission_partner_payouts(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_p public.commission_partner_payouts%rowtype; v_state jsonb; v_count int; v_amount numeric; v_status text; v_reason text;
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;
  if not exists(select 1 from public.commission_payout_batches where id=p_batch_id and status <> 'Cancelled') then raise exception 'Payout batch not found or unavailable.'; end if;
  for v_p in select * from public.commission_partner_payouts where payout_batch_id=p_batch_id and status <> 'Paid' for update
  loop
    select count(*)::int,coalesce(round(sum(commission_amount),2),0) into v_count,v_amount
    from public.commission_entries
    where payout_batch_id=p_batch_id and salesperson_id=v_p.salesperson_id and upper(currency)=upper(v_p.currency) and status <> 'Reversed';
    if v_count=0 then
      update public.commission_partner_payouts set status='Cancelled',amount=0,entry_count=0,hold_reason='All commissions in this partner payout were reversed before payment.',updated_at=now() where id=v_p.id;
      continue;
    end if;
    v_state := public.commission_partner_payout_state(v_p.salesperson_id);
    if coalesce((v_state->>'payoutEligible')::boolean,false) is not true then v_status := 'On Hold'; v_reason := coalesce(v_state->>'holdReason','Payout profile is not eligible.');
    elsif upper(coalesce(v_state->>'preferredCurrency','USD')) <> upper(v_p.currency) then v_status := 'On Hold'; v_reason := 'Preferred payout currency '||coalesce(v_state->>'preferredCurrency','USD')||' does not match this commission payout currency '||v_p.currency||'.';
    else v_status := 'Ready'; v_reason := null; end if;
    update public.commission_partner_payouts set amount=v_amount,entry_count=v_count,status=v_status,paypal_email_snapshot=nullif(v_state->>'paypalEmail',''),preferred_currency_snapshot=nullif(v_state->>'preferredCurrency',''),hold_reason=v_reason,updated_at=now() where id=v_p.id;
  end loop;
  if not exists(select 1 from public.commission_partner_payouts where payout_batch_id=p_batch_id and status not in ('Paid','Cancelled')) then
    update public.commission_payout_batches set status='Completed',completed_at=coalesce(completed_at,now()),processed_by=coalesce(processed_by,auth.uid()),updated_at=now() where id=p_batch_id and status<>'Completed';
  end if;
  return public.admin_get_commission_partner_payouts(p_batch_id);
end;
$$;
revoke all on function public.admin_refresh_commission_partner_payouts(uuid) from public,anon;
grant execute on function public.admin_refresh_commission_partner_payouts(uuid) to authenticated;

create or replace function public.admin_confirm_commission_partner_payout(p_partner_payout_id uuid,p_paypal_transaction_id text,p_notes text default '')
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_p public.commission_partner_payouts%rowtype; v_state jsonb; v_tx text := trim(coalesce(p_paypal_transaction_id,'')); v_count int; v_amount numeric; v_batch public.commission_payout_batches%rowtype;
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;
  if length(v_tx)<6 or length(v_tx)>128 then raise exception 'Enter the PayPal transaction/reference ID from the completed payment.'; end if;
  select * into v_p from public.commission_partner_payouts where id=p_partner_payout_id for update;
  if not found then raise exception 'Partner payout was not found.'; end if;
  if v_p.status='Paid' then
    if v_p.paypal_transaction_id=v_tx then return jsonb_build_object('payoutId',v_p.id,'status','Paid','alreadyPaid',true,'transactionId',v_tx); end if;
    raise exception 'This partner payout has already been paid with a different PayPal reference.';
  end if;
  if v_p.status<>'Ready' then raise exception 'Only a Ready partner payout may be confirmed as paid.'; end if;
  if exists(select 1 from public.commission_partner_payouts where paypal_transaction_id=v_tx and id<>v_p.id) then raise exception 'This PayPal transaction/reference ID is already attached to another payout.'; end if;

  v_state := public.commission_partner_payout_state(v_p.salesperson_id);
  if coalesce((v_state->>'payoutEligible')::boolean,false) is not true then raise exception '%',coalesce(v_state->>'holdReason','Partner payout is no longer eligible.'); end if;
  if lower(coalesce(v_state->>'paypalEmail','')) <> lower(coalesce(v_p.paypal_email_snapshot,'')) then raise exception 'PayPal payout details changed after this batch was prepared. Refresh the batch before paying.'; end if;
  if upper(coalesce(v_state->>'preferredCurrency','USD')) <> upper(v_p.currency) then raise exception 'Preferred payout currency no longer matches this commission payout. Refresh the batch before paying.'; end if;

  select count(*)::int,coalesce(round(sum(commission_amount),2),0) into v_count,v_amount
  from public.commission_entries
  where payout_batch_id=v_p.payout_batch_id and salesperson_id=v_p.salesperson_id and upper(currency)=upper(v_p.currency) and status='Approved';
  if v_count<>v_p.entry_count or round(v_amount,2)<>round(v_p.amount,2) then raise exception 'Commission contents changed after this payout was prepared. Refresh and review the payout before paying.'; end if;

  update public.commission_entries set status='Paid',paid_at=coalesce(paid_at,now()),paid_by=auth.uid(),payout_reference=v_tx,
    admin_review_notes=concat_ws(' | ',nullif(admin_review_notes,''),'PayPal partner payout confirmed by Administrator.'),updated_at=now()
  where payout_batch_id=v_p.payout_batch_id and salesperson_id=v_p.salesperson_id and upper(currency)=upper(v_p.currency) and status='Approved';
  update public.commission_partner_payouts set status='Paid',paypal_transaction_id=v_tx,paid_at=now(),paid_by=auth.uid(),notes=case when trim(coalesce(p_notes,''))='' then notes else concat_ws(' | ',notes,trim(p_notes)) end,hold_reason=null,updated_at=now() where id=v_p.id;

  select * into v_batch from public.commission_payout_batches where id=v_p.payout_batch_id for update;
  if not exists(select 1 from public.commission_partner_payouts where payout_batch_id=v_p.payout_batch_id and status not in ('Paid','Cancelled')) then
    update public.commission_payout_batches set status='Completed',completed_at=now(),processed_by=auth.uid(),updated_at=now() where id=v_p.payout_batch_id;
  else
    update public.commission_payout_batches set status='Processing',processed_by=auth.uid(),updated_at=now() where id=v_p.payout_batch_id and status='Approved';
  end if;

  perform public.service_queue_staff_operational_notification(v_p.salesperson_id,'commission-paypal-paid:'||v_p.id::text,'commission_payout_completed','Commission',
    'PayPal commission payout confirmed — '||coalesce(v_batch.batch_number,'Payout'),
    'Your approved commission payout of '||trim(to_char(v_p.amount,'FM999999999990.00'))||' '||v_p.currency||' has been marked paid via PayPal.',
    '/admin/app/commissions',jsonb_build_object('batchNumber',v_batch.batch_number,'currency',v_p.currency,'amount',v_p.amount,'payoutMethod','PayPal','transactionReference',v_tx),now());
  return jsonb_build_object('payoutId',v_p.id,'status','Paid','alreadyPaid',false,'transactionId',v_tx,'batchId',v_p.payout_batch_id);
end;
$$;
revoke all on function public.admin_confirm_commission_partner_payout(uuid,text,text) from public,anon;
grant execute on function public.admin_confirm_commission_partner_payout(uuid,text,text) to authenticated;

create or replace function public.admin_finalize_commission_payout_batch(p_batch_id uuid,p_payout_reference text default '',p_notes text default '')
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_batch public.commission_payout_batches%rowtype;
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;
  select * into v_batch from public.commission_payout_batches where id=p_batch_id for update;
  if not found then raise exception 'Payout batch not found.'; end if;
  if exists(select 1 from public.commission_partner_payouts where payout_batch_id=p_batch_id) then raise exception 'This batch uses per-partner PayPal payouts. Confirm each partner payment separately.'; end if;
  if v_batch.status='Completed' then return; end if;
  if v_batch.status<>'Approved' then raise exception 'Only Approved legacy payout batches may be completed.'; end if;
  update public.commission_entries set status='Paid',paid_at=coalesce(paid_at,now()),paid_by=auth.uid(),payout_reference=coalesce(nullif(trim(p_payout_reference),''),v_batch.batch_number),updated_at=now() where payout_batch_id=p_batch_id and status<>'Reversed';
  update public.commission_payout_batches set status='Completed',completed_at=now(),processed_by=auth.uid(),notes=case when trim(coalesce(p_notes,''))='' then notes else concat_ws(' | ',notes,p_notes) end,updated_at=now() where id=p_batch_id;
end;
$$;
revoke all on function public.admin_finalize_commission_payout_batch(uuid,text,text) from public,anon;
grant execute on function public.admin_finalize_commission_payout_batch(uuid,text,text) to authenticated;

create or replace function public.admin_update_commission_status(p_entry_id uuid,p_status text,p_notes text default '',p_payout_reference text default '')
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;
  if p_status not in ('Earned','Under Review','Approved','Paid','Reversed','Disputed') then raise exception 'Invalid commission status.'; end if;
  if p_status='Paid' then raise exception 'Use the protected PayPal partner payout workflow to mark commission paid.'; end if;
  update public.commission_entries set status=p_status,admin_review_notes=case when trim(coalesce(p_notes,''))='' then admin_review_notes else concat_ws(' | ',admin_review_notes,p_notes) end,updated_at=now() where id=p_entry_id;
  if not found then raise exception 'Commission entry not found.'; end if;
end;
$$;
revoke all on function public.admin_update_commission_status(uuid,text,text,text) from public,anon;
grant execute on function public.admin_update_commission_status(uuid,text,text,text) to authenticated;

create or replace function public.admin_reverse_commission(p_entry_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_entry public.commission_entries%rowtype;
begin
  if not public.is_admin() then raise exception 'Unauthorized.'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Reversal reason is required.'; end if;
  select * into v_entry from public.commission_entries where id=p_entry_id for update;
  if not found then raise exception 'Commission entry not found.'; end if;
  if v_entry.status='Reversed' then return; end if;
  update public.commission_entries set status='Reversed',reversal_reason=p_reason,updated_at=now() where id=p_entry_id;
  if v_entry.payout_batch_id is not null and exists(select 1 from public.commission_partner_payouts where payout_batch_id=v_entry.payout_batch_id) then perform public.admin_refresh_commission_partner_payouts(v_entry.payout_batch_id); end if;
end;
$$;
revoke all on function public.admin_reverse_commission(uuid,text) from public,anon;
grant execute on function public.admin_reverse_commission(uuid,text) to authenticated;

create or replace function public.notify_commission_payout_batch_event()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_seller record;
begin
  if new.status='Completed' and old.status is distinct from new.status then
    if exists(select 1 from public.commission_partner_payouts where payout_batch_id=new.id) then return new; end if;
    for v_seller in select distinct salesperson_id from public.commission_entries where payout_batch_id=new.id and salesperson_id is not null loop
      perform public.service_queue_staff_operational_notification(v_seller.salesperson_id,'commission-payout-completed:'||new.id||':'||v_seller.salesperson_id,'commission_payout_completed','Commission','Commission payout completed — '||new.batch_number,'The payout batch containing your commission has been marked completed.','/admin/app/commissions',jsonb_build_object('batchNumber',new.batch_number,'scheduledDate',new.scheduled_date),now());
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.get_my_seller_profile_context()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_uid uuid := auth.uid(); v_profile public.user_profiles%rowtype; v_applicant public.applicants%rowtype; v_agreement public.sales_partner_agreements%rowtype;
  v_cert public.user_training_progress%rowtype; v_payout_schedule text := ''; v_payout_state jsonb := '{}'::jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not public.is_admin() and not public.has_active_role(array['sales']::text[]) then raise exception 'Active Sales access required.'; end if;
  select * into v_profile from public.user_profiles where id=v_uid;
  if not found then raise exception 'User profile not found.'; end if;
  select * into v_applicant from public.applicants where linked_user_id=v_uid order by updated_at desc limit 1;
  if v_applicant.id is not null then select * into v_agreement from public.sales_partner_agreements where applicant_id=v_applicant.id order by created_at desc limit 1; end if;
  select p.* into v_cert from public.user_training_progress p join public.training_modules m on m.id=p.module_id where p.user_id=v_uid and m.slug='final-certification' order by p.updated_at desc limit 1;
  select coalesce(payout_schedule,'') into v_payout_schedule from public.commission_settings where id='default';
  v_payout_state := public.commission_partner_payout_state(v_uid);
  return jsonb_build_object(
    'profile',jsonb_build_object('id',v_profile.id,'email',coalesce(v_profile.email,''),'fullName',coalesce(v_profile.full_name,''),'phone',coalesce(v_profile.phone,''),'country',coalesce(v_profile.country,''),'timezone',coalesce(v_profile.timezone,'UTC'),'role',coalesce(v_profile.role,''),'status',coalesce(v_profile.status,''),'onboardingStatus',coalesce(v_profile.onboarding_status,''),'onboardingProgress',coalesce(v_profile.onboarding_progress,0),'avatarUrl',coalesce(v_profile.avatar_url,'')),
    'activation',jsonb_build_object('stage',nullif(v_applicant.stage,''),'activatedAt',case when v_applicant.stage='Activated' then v_applicant.stage_entered_at else null end,'finalApproval',v_applicant.final_approval),
    'agreement',jsonb_build_object('status',nullif(v_agreement.status,''),'agreementNumber',nullif(v_agreement.agreement_number,''),'partnerSignedAt',v_agreement.partner_signed_at,'companySignedAt',v_agreement.company_signed_at,'verifiedAt',v_agreement.verified_at,'commissionTermsAcknowledgedThroughAgreement',(v_agreement.verified_at is not null and v_agreement.commercial_snapshot is not null)),
    'academy',jsonb_build_object('finalCertificationStatus',nullif(v_cert.status,''),'finalCertificationScore',v_cert.score,'finalCertificationReviewStatus',nullif(v_cert.review_status,''),'finalCertificationCompletedAt',v_cert.completed_at),
    'commission',jsonb_build_object('payoutSchedule',v_payout_schedule,'payoutMethod','PayPal','paypalEmail',v_payout_state->>'paypalEmail','preferredCurrency',coalesce(v_payout_state->>'preferredCurrency','USD'),'paypalConfirmed',coalesce((v_payout_state->>'paypalConfirmed')::boolean,false),'payoutEnabled',coalesce((v_payout_state->>'payoutEnabled')::boolean,false),'payoutEligible',coalesce((v_payout_state->>'payoutEligible')::boolean,false),'payoutHoldReason',v_payout_state->>'holdReason')
  );
end;
$$;
revoke all on function public.get_my_seller_profile_context() from public,anon;
grant execute on function public.get_my_seller_profile_context() to authenticated;

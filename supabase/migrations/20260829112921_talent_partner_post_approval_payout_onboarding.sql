-- ProFox Talent Partner Program: secure post-approval payout onboarding and manual verification.
-- PayPal Payouts cannot be used by an India-based merchant for standard outbound Payouts API sends,
-- so this migration deliberately does not pretend to automate PayPal transfers. It creates a
-- provider-neutral verified payout profile that can later be connected to a supported payout provider.

-- Generate an environment-local encryption key once and keep it in Supabase Vault.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'profox_talent_partner_payout_encryption_v1'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'profox_talent_partner_payout_encryption_v1',
      'Encryption key for Talent Partner payout profile details. Do not expose to clients.'
    );
  end if;
end $$;

create table if not exists public.talent_partner_payout_profiles (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid not null unique references public.talent_partner_profiles(user_id) on delete restrict,
  payout_method text not null check (payout_method in ('PayPal','Wise','Bank Transfer','Other')),
  preferred_currency text not null default 'USD' check (char_length(preferred_currency)=3),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  status text not null default 'Verification Pending' check (status in ('Verification Pending','Verified','Rejected','Disabled')),
  details_version integer not null default 1 check (details_version >= 1),
  masked_details jsonb not null default '{}'::jsonb,
  encrypted_details bytea not null,
  verification_mode text not null default 'manual_admin' check (verification_mode in ('manual_admin','provider')),
  verification_provider text,
  verification_reference text,
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references public.user_profiles(id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references public.user_profiles(id) on delete set null,
  rejection_reason text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_talent_partner_payout_profiles_status
  on public.talent_partner_payout_profiles(status, submitted_at desc);

create table if not exists public.talent_partner_payout_profile_events (
  id uuid primary key default gen_random_uuid(),
  payout_profile_id uuid not null references public.talent_partner_payout_profiles(id) on delete restrict,
  partner_user_id uuid not null references public.talent_partner_profiles(user_id) on delete restrict,
  event_type text not null check (event_type in ('Submitted','Updated','Verified','Rejected','Revealed','Disabled')),
  actor_user_id uuid references public.user_profiles(id) on delete set null,
  actor_type text not null check (actor_type in ('partner','admin','system')),
  details_version integer not null,
  masked_snapshot jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_talent_partner_payout_profile_events_profile
  on public.talent_partner_payout_profile_events(payout_profile_id, created_at desc);
create index if not exists idx_talent_partner_payout_profile_events_partner
  on public.talent_partner_payout_profile_events(partner_user_id, created_at desc);

alter table public.talent_partner_payouts
  add column if not exists payout_profile_id uuid references public.talent_partner_payout_profiles(id) on delete set null,
  add column if not exists payout_profile_version integer,
  add column if not exists payout_details_masked_snapshot jsonb,
  add column if not exists processing_started_at timestamptz,
  add column if not exists failure_reason text;

create index if not exists idx_talent_partner_payouts_profile
  on public.talent_partner_payouts(payout_profile_id) where payout_profile_id is not null;

alter table public.talent_partner_payout_profiles enable row level security;
alter table public.talent_partner_payout_profile_events enable row level security;

-- Sensitive payout tables are never directly exposed to browser roles. Access is through scoped RPCs.
revoke all on table public.talent_partner_payout_profiles from public, anon, authenticated;
revoke all on table public.talent_partner_payout_profile_events from public, anon, authenticated;

create policy "Talent Partner payout profiles admin" on public.talent_partner_payout_profiles
  for all using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Talent Partner payout profile events admin" on public.talent_partner_payout_profile_events
  for select using ((select public.is_admin()));

create or replace function public.talent_partner_payout_encryption_key()
returns text
language plpgsql
stable
security definer
set search_path=public,extensions,vault,pg_temp
as $$
declare v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name='profox_talent_partner_payout_encryption_v1'
  order by created_at desc
  limit 1;
  if coalesce(v_key,'')='' then
    raise exception 'Talent Partner payout encryption key is unavailable.';
  end if;
  return v_key;
end;
$$;

create or replace function public.talent_partner_mask_value(p_value text, p_keep integer default 4)
returns text
language plpgsql
immutable
set search_path=public,pg_temp
as $$
declare v text:=trim(coalesce(p_value,'')); v_keep integer:=greatest(1,least(8,coalesce(p_keep,4)));
begin
  if v='' then return null; end if;
  if position('@' in v)>1 then
    return left(split_part(v,'@',1),1)||'***@'||split_part(v,'@',2);
  end if;
  if length(v)<=v_keep then return repeat('*',greatest(3,length(v))); end if;
  return repeat('*',greatest(4,length(v)-v_keep))||right(v,v_keep);
end;
$$;

create or replace function public.talent_partner_payout_setup_state()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_profile public.talent_partner_payout_profiles%rowtype;
  v_required boolean;
  v_balances jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not exists(select 1 from public.talent_partner_profiles where user_id=v_uid) then
    raise exception 'Talent Partner profile not found.';
  end if;

  select exists(
    select 1 from public.talent_partner_reward_entries e
    where e.partner_user_id=v_uid and e.status='Approved' and e.payout_id is null
  ) into v_required;

  select * into v_profile
  from public.talent_partner_payout_profiles
  where partner_user_id=v_uid;

  select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'amount',amount) order by currency),'[]'::jsonb)
  into v_balances
  from (
    select currency, sum(reward_amount)::numeric(14,2) amount
    from public.talent_partner_reward_entries
    where partner_user_id=v_uid and status='Approved' and payout_id is null
    group by currency
  ) x;

  return jsonb_build_object(
    'setupRequired',v_required,
    'status',case when v_profile.id is null then case when v_required then 'Setup Required' else 'Not Required' end else v_profile.status end,
    'profileId',v_profile.id,
    'payoutMethod',v_profile.payout_method,
    'preferredCurrency',coalesce(v_profile.preferred_currency,(select preferred_currency from public.talent_partner_profiles where user_id=v_uid),'USD'),
    'countryCode',v_profile.country_code,
    'detailsVersion',v_profile.details_version,
    'maskedDetails',coalesce(v_profile.masked_details,'{}'::jsonb),
    'submittedAt',v_profile.submitted_at,
    'verifiedAt',v_profile.verified_at,
    'rejectionReason',v_profile.rejection_reason,
    'verificationMode',coalesce(v_profile.verification_mode,'manual_admin'),
    'automaticTransferSupported',false,
    'automaticVerificationSupported',false,
    'settlementMode','manual',
    'approvedBalances',v_balances
  );
end;
$$;

create or replace function public.talent_partner_submit_payout_profile(
  p_payout_method text,
  p_preferred_currency text,
  p_country_code text,
  p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,vault,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_method text:=trim(coalesce(p_payout_method,''));
  v_currency text:=upper(trim(coalesce(p_preferred_currency,'USD')));
  v_country text:=upper(trim(coalesce(p_country_code,'')));
  v_details jsonb:=coalesce(p_details,'{}'::jsonb);
  v_masked jsonb:='{}'::jsonb;
  v_encrypted bytea;
  v_existing public.talent_partner_payout_profiles%rowtype;
  v_row public.talent_partner_payout_profiles%rowtype;
  v_version integer;
  v_event text;
  v_identifier text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not exists(select 1 from public.talent_partner_profiles where user_id=v_uid and status='Active') then
    raise exception 'An active Talent Partner account is required.';
  end if;
  if v_method not in ('PayPal','Wise','Bank Transfer','Other') then raise exception 'Unsupported payout method.'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Preferred currency must be a three-letter currency code.'; end if;
  if v_country<>'' and v_country !~ '^[A-Z]{2}$' then raise exception 'Country must use a two-letter ISO code.'; end if;
  if jsonb_typeof(v_details)<>'object' then raise exception 'Payout details must be an object.'; end if;

  select * into v_existing from public.talent_partner_payout_profiles where partner_user_id=v_uid for update;
  if not found and not exists(
    select 1 from public.talent_partner_reward_entries where partner_user_id=v_uid and status='Approved' and payout_id is null
  ) then
    raise exception 'Payout setup becomes available after a reward has been approved.';
  end if;

  if length(trim(coalesce(v_details->>'accountHolderName','')))<2 then
    raise exception 'Account holder name is required.';
  end if;

  if v_method='PayPal' then
    v_identifier:=lower(trim(coalesce(v_details->>'paypalEmail','')));
    if v_identifier !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'A valid PayPal email is required.'; end if;
    v_masked:=jsonb_build_object('accountHolderName',left(trim(v_details->>'accountHolderName'),2)||'***','paypalEmail',public.talent_partner_mask_value(v_identifier,4));
  elsif v_method='Wise' then
    v_identifier:=lower(trim(coalesce(v_details->>'wiseEmail','')));
    if v_identifier !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'A valid Wise email is required.'; end if;
    v_masked:=jsonb_build_object('accountHolderName',left(trim(v_details->>'accountHolderName'),2)||'***','wiseEmail',public.talent_partner_mask_value(v_identifier,4));
  elsif v_method='Bank Transfer' then
    if v_country='' then raise exception 'Bank country is required.'; end if;
    if length(trim(coalesce(v_details->>'bankName','')))<2 then raise exception 'Bank name is required.'; end if;
    if length(trim(coalesce(v_details->>'accountNumber','')))<4 then raise exception 'Bank account number or IBAN is required.'; end if;
    if length(trim(coalesce(v_details->>'routingCode','')))<2 then raise exception 'Routing / IFSC / SWIFT / BIC code is required.'; end if;
    v_identifier:=trim(v_details->>'accountNumber');
    v_masked:=jsonb_build_object(
      'accountHolderName',left(trim(v_details->>'accountHolderName'),2)||'***',
      'bankName',left(trim(v_details->>'bankName'),80),
      'accountNumber',public.talent_partner_mask_value(v_identifier,4),
      'routingType',left(trim(coalesce(v_details->>'routingType','Routing code')),30),
      'routingCode',public.talent_partner_mask_value(trim(v_details->>'routingCode'),4),
      'accountType',left(trim(coalesce(v_details->>'accountType','')),30)
    );
  else
    if length(trim(coalesce(v_details->>'paymentInstructions','')))<5 then raise exception 'Payment instructions are required.'; end if;
    v_masked:=jsonb_build_object('accountHolderName',left(trim(v_details->>'accountHolderName'),2)||'***','paymentInstructions','Provided securely');
  end if;

  -- Bound the payload before encryption to prevent the payout profile from becoming an arbitrary data store.
  if octet_length(v_details::text)>12000 then raise exception 'Payout details are too large.'; end if;

  v_encrypted:=extensions.pgp_sym_encrypt(
    v_details::text,
    public.talent_partner_payout_encryption_key(),
    'cipher-algo=aes256,compress-algo=1'
  );
  v_version:=coalesce(v_existing.details_version,0)+1;
  v_event:=case when v_existing.id is null then 'Submitted' else 'Updated' end;

  insert into public.talent_partner_payout_profiles(
    partner_user_id,payout_method,preferred_currency,country_code,status,details_version,masked_details,encrypted_details,
    verification_mode,submitted_at,verified_at,verified_by,rejected_at,rejected_by,rejection_reason,updated_at
  ) values(
    v_uid,v_method,v_currency,nullif(v_country,''),'Verification Pending',v_version,v_masked,v_encrypted,
    'manual_admin',now(),null,null,null,null,null,now()
  )
  on conflict (partner_user_id) do update set
    payout_method=excluded.payout_method,
    preferred_currency=excluded.preferred_currency,
    country_code=excluded.country_code,
    status='Verification Pending',
    details_version=public.talent_partner_payout_profiles.details_version+1,
    masked_details=excluded.masked_details,
    encrypted_details=excluded.encrypted_details,
    verification_mode='manual_admin',
    verification_provider=null,
    verification_reference=null,
    submitted_at=now(),
    verified_at=null,
    verified_by=null,
    rejected_at=null,
    rejected_by=null,
    rejection_reason=null,
    updated_at=now()
  returning * into v_row;

  insert into public.talent_partner_payout_profile_events(
    payout_profile_id,partner_user_id,event_type,actor_user_id,actor_type,details_version,masked_snapshot,reason
  ) values(v_row.id,v_uid,v_event,v_uid,'partner',v_row.details_version,v_row.masked_details,'Payout details submitted for verification.');

  -- Preserve legacy display fields without storing the raw sensitive account identifier there.
  update public.talent_partner_profiles
  set payout_method=v_method,
      payout_email=case when v_method='PayPal' then v_row.masked_details->>'paypalEmail' when v_method='Wise' then v_row.masked_details->>'wiseEmail' else v_row.masked_details->>'accountNumber' end,
      preferred_currency=v_currency,
      updated_at=now()
  where user_id=v_uid;

  perform public.talent_partner_notify(
    v_uid,'payout','Payout details submitted',
    'Your payout details are encrypted and waiting for ProFox verification. Payouts remain on hold until verification is complete.',
    '/talent-partner','tp-payout-profile-submitted:'||v_row.id::text||':'||v_row.details_version::text
  );

  return public.talent_partner_payout_setup_state();
end;
$$;

create or replace function public.admin_list_talent_partner_payout_profiles()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',pp.id,'partnerUserId',pp.partner_user_id,'partnerCode',tp.partner_code,'partnerName',u.full_name,'partnerEmail',u.email,
      'payoutMethod',pp.payout_method,'preferredCurrency',pp.preferred_currency,'countryCode',pp.country_code,'status',pp.status,
      'detailsVersion',pp.details_version,'maskedDetails',pp.masked_details,'verificationMode',pp.verification_mode,
      'verificationReference',pp.verification_reference,'submittedAt',pp.submitted_at,'verifiedAt',pp.verified_at,
      'rejectedAt',pp.rejected_at,'rejectionReason',pp.rejection_reason,
      'approvedUnpaidRewards',(select count(*) from public.talent_partner_reward_entries e where e.partner_user_id=pp.partner_user_id and e.status='Approved' and e.payout_id is null)
    ) order by case pp.status when 'Verification Pending' then 0 when 'Rejected' then 1 when 'Verified' then 2 else 3 end, pp.submitted_at desc)
    from public.talent_partner_payout_profiles pp
    join public.talent_partner_profiles tp on tp.user_id=pp.partner_user_id
    join public.user_profiles u on u.id=pp.partner_user_id
  ),'[]'::jsonb);
end;
$$;

create or replace function public.admin_reveal_talent_partner_payout_profile(
  p_profile_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,vault,pg_temp
as $$
declare
  v_row public.talent_partner_payout_profiles%rowtype;
  v_reason text:=trim(coalesce(p_reason,''));
  v_details jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if length(v_reason)<10 then raise exception 'A clear access reason of at least 10 characters is required.'; end if;
  select * into v_row from public.talent_partner_payout_profiles where id=p_profile_id;
  if not found then raise exception 'Payout profile not found.'; end if;

  v_details:=extensions.pgp_sym_decrypt(v_row.encrypted_details,public.talent_partner_payout_encryption_key())::jsonb;

  insert into public.talent_partner_payout_profile_events(
    payout_profile_id,partner_user_id,event_type,actor_user_id,actor_type,details_version,masked_snapshot,reason
  ) values(v_row.id,v_row.partner_user_id,'Revealed',auth.uid(),'admin',v_row.details_version,v_row.masked_details,left(v_reason,1000));

  return jsonb_build_object(
    'id',v_row.id,'partnerUserId',v_row.partner_user_id,'payoutMethod',v_row.payout_method,'preferredCurrency',v_row.preferred_currency,
    'countryCode',v_row.country_code,'status',v_row.status,'detailsVersion',v_row.details_version,'details',v_details
  );
end;
$$;

create or replace function public.admin_review_talent_partner_payout_profile(
  p_profile_id uuid,
  p_decision text,
  p_reason text default null,
  p_verification_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_decision text:=initcap(lower(trim(coalesce(p_decision,''))));
  v_reason text:=trim(coalesce(p_reason,''));
  v_row public.talent_partner_payout_profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_decision not in ('Verified','Rejected') then raise exception 'Decision must be Verified or Rejected.'; end if;
  if v_decision='Rejected' and length(v_reason)<5 then raise exception 'A rejection reason is required.'; end if;

  update public.talent_partner_payout_profiles
  set status=v_decision,
      verified_at=case when v_decision='Verified' then now() else null end,
      verified_by=case when v_decision='Verified' then auth.uid() else null end,
      verification_reference=case when v_decision='Verified' then nullif(left(trim(coalesce(p_verification_reference,'')),300),'') else null end,
      rejected_at=case when v_decision='Rejected' then now() else null end,
      rejected_by=case when v_decision='Rejected' then auth.uid() else null end,
      rejection_reason=case when v_decision='Rejected' then left(v_reason,2000) else null end,
      updated_at=now()
  where id=p_profile_id and status in ('Verification Pending','Rejected','Verified')
  returning * into v_row;
  if not found then raise exception 'Reviewable payout profile not found.'; end if;

  insert into public.talent_partner_payout_profile_events(
    payout_profile_id,partner_user_id,event_type,actor_user_id,actor_type,details_version,masked_snapshot,reason
  ) values(v_row.id,v_row.partner_user_id,v_decision,auth.uid(),'admin',v_row.details_version,v_row.masked_details,
           case when v_decision='Verified' then coalesce(nullif(left(trim(coalesce(p_verification_reference,'')),300),''),'Verified manually by administrator.') else left(v_reason,1000) end);

  perform public.talent_partner_notify(
    v_row.partner_user_id,'payout',case when v_decision='Verified' then 'Payout method verified' else 'Payout details need attention' end,
    case when v_decision='Verified' then 'Your payout method is verified. Approved rewards can now be included in the next payout batch.'
         else 'Your payout details could not be verified: '||left(v_reason,1000)||'. Please update and resubmit them.' end,
    '/talent-partner','tp-payout-profile-review:'||v_row.id::text||':'||v_row.details_version::text||':'||lower(v_decision)
  );

  return jsonb_build_object('success',true,'status',v_row.status,'profileId',v_row.id,'detailsVersion',v_row.details_version);
end;
$$;

-- Notify a partner as soon as an approved reward creates a real payout-setup need.
create or replace function public.talent_partner_reward_payout_setup_notification()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.status='Approved' and (tg_op='INSERT' or old.status is distinct from new.status) then
    if not exists(select 1 from public.talent_partner_payout_profiles pp where pp.partner_user_id=new.partner_user_id and pp.status='Verified') then
      perform public.talent_partner_notify(
        new.partner_user_id,'payout','Payout setup required',
        'A reward has been approved. Add or verify your payout details in Profile & Payout before it can be included in a payout batch.',
        '/talent-partner','tp-payout-setup-required:'||new.partner_user_id::text
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_talent_partner_reward_payout_setup on public.talent_partner_reward_entries;
create trigger trg_talent_partner_reward_payout_setup
after insert or update of status on public.talent_partner_reward_entries
for each row execute function public.talent_partner_reward_payout_setup_notification();

-- Payout batches now include only verified payout profiles. Approved rewards remain untouched until
-- a verified profile exists, so there is no accidental payment or loss of financial eligibility.
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
  v_skipped_partners integer:=0;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_settings from public.talent_partner_program_settings where id='default';

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

  v_number:='TP-PAY-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  insert into public.talent_partner_payout_batches(batch_number,status,created_by)
  values(v_number,'Ready',auth.uid()) returning id into v_batch_id;

  for v_group in
    select e.partner_user_id,e.currency,sum(e.reward_amount)::numeric(14,2) amount,count(*)::integer entry_count,
           pp.id payout_profile_id,pp.details_version,pp.payout_method,pp.masked_details
    from public.talent_partner_reward_entries e
    join public.talent_partner_profiles tp on tp.user_id=e.partner_user_id and tp.status='Active'
    join public.talent_partner_payout_profiles pp on pp.partner_user_id=e.partner_user_id and pp.status='Verified'
    where e.status='Approved' and e.payout_id is null and e.available_at<=now()
    group by e.partner_user_id,e.currency,pp.id,pp.details_version,pp.payout_method,pp.masked_details
    having sum(e.reward_amount)>=v_settings.minimum_payout
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
    where partner_user_id=v_group.partner_user_id and currency=v_group.currency and status='Approved' and payout_id is null and available_at<=now();

    v_total:=v_total+v_group.amount; v_count:=v_count+v_group.entry_count;
  end loop;

  if v_count=0 then
    delete from public.talent_partner_payout_batches where id=v_batch_id;
    return jsonb_build_object(
      'success',false,
      'message',case when v_skipped_partners>0 then 'Approved rewards exist, but one or more Talent Partners still need a verified payout profile.' else 'No approved Talent Partner rewards currently meet the payout requirements.' end,
      'partnersNeedingSetup',v_skipped_partners
    );
  end if;

  update public.talent_partner_payout_batches set entry_count=v_count,total_amount=v_total where id=v_batch_id;
  return jsonb_build_object('success',true,'batchId',v_batch_id,'batchNumber',v_number,'entryCount',v_count,'totalAmount',v_total,'partnersNeedingSetup',v_skipped_partners);
end;
$$;

-- Verification is mandatory before a payout can be marked paid. Existing payout rows created before
-- this migration remain payable only if they have a legacy payout snapshot; new rows carry a profile id.
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

  select * into v_row from public.talent_partner_payouts where id=p_payout_id for update;
  if not found or v_row.status<>'Ready' then raise exception 'Ready payout not found.'; end if;
  if v_row.payout_profile_id is not null and not exists(
    select 1 from public.talent_partner_payout_profiles pp
    where pp.id=v_row.payout_profile_id and pp.status='Verified' and pp.details_version=v_row.payout_profile_version
  ) then
    raise exception 'The payout profile used by this payout is no longer verified at the snapshotted version. Review the payout before paying.';
  end if;

  update public.talent_partner_payouts
  set status='Paid',transaction_id=v_transaction,paid_at=now(),paid_by=auth.uid()
  where id=p_payout_id returning * into v_row;

  update public.talent_partner_reward_entries set status='Paid',updated_at=now() where payout_id=v_row.id and status='Approved';
  select count(*) into v_remaining from public.talent_partner_payouts where payout_batch_id=v_row.payout_batch_id and status='Ready';
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

-- Least-privilege execution grants.
revoke all privileges on function public.talent_partner_payout_encryption_key() from public, anon, authenticated;
revoke all privileges on function public.talent_partner_mask_value(text,integer) from public, anon, authenticated;
revoke all privileges on function public.talent_partner_payout_setup_state() from public, anon, authenticated;
revoke all privileges on function public.talent_partner_submit_payout_profile(text,text,text,jsonb) from public, anon, authenticated;
revoke all privileges on function public.admin_list_talent_partner_payout_profiles() from public, anon, authenticated;
revoke all privileges on function public.admin_reveal_talent_partner_payout_profile(uuid,text) from public, anon, authenticated;
revoke all privileges on function public.admin_review_talent_partner_payout_profile(uuid,text,text,text) from public, anon, authenticated;
revoke all privileges on function public.talent_partner_reward_payout_setup_notification() from public, anon, authenticated;

-- Internal cryptographic/masking/trigger helpers are not browser RPCs.
grant execute on function public.talent_partner_payout_setup_state() to authenticated;
grant execute on function public.talent_partner_submit_payout_profile(text,text,text,jsonb) to authenticated;
grant execute on function public.admin_list_talent_partner_payout_profiles() to authenticated;
grant execute on function public.admin_reveal_talent_partner_payout_profile(uuid,text) to authenticated;
grant execute on function public.admin_review_talent_partner_payout_profile(uuid,text,text,text) to authenticated;

-- Existing Admin payout RPCs keep authenticated execute + internal is_admin() checks.
revoke all privileges on function public.admin_create_talent_partner_payout_batch() from public, anon, authenticated;
revoke all privileges on function public.admin_mark_talent_partner_payout_paid(uuid,text) from public, anon, authenticated;
grant execute on function public.admin_create_talent_partner_payout_batch() to authenticated;
grant execute on function public.admin_mark_talent_partner_payout_paid(uuid,text) to authenticated;

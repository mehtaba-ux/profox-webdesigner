-- RazorpayX employee bulk payout integration.
-- Existing worker earnings, payout batches and payout rows remain canonical.
-- Provider attempts/events only transport and reconcile those existing records.

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='profox_worker_payout_encryption_v1') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'profox_worker_payout_encryption_v1',
      'Encryption key for employee payout profile details. Do not expose to clients.'
    );
  end if;
end $$;

create table if not exists public.worker_payout_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.user_profiles(id) on delete restrict,
  payout_method text not null check (payout_method in ('Bank Account','UPI')),
  preferred_currency text not null default 'INR' check (preferred_currency='INR'),
  country_code text not null default 'IN' check (country_code='IN'),
  status text not null default 'Verification Pending' check (status in ('Verification Pending','Verified','Rejected','Disabled')),
  details_version integer not null default 1 check (details_version>0),
  masked_details jsonb not null default '{}'::jsonb check (jsonb_typeof(masked_details)='object'),
  encrypted_details bytea not null,
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references public.user_profiles(id) on delete set null,
  verification_reference text,
  rejected_at timestamptz,
  rejected_by uuid references public.user_profiles(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worker_payout_profile_events (
  id uuid primary key default gen_random_uuid(),
  payout_profile_id uuid not null references public.worker_payout_profiles(id) on delete restrict,
  user_id uuid not null references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in ('Submitted','Updated','Revealed','Verified','Rejected','Disabled')),
  actor_user_id uuid references public.user_profiles(id) on delete set null,
  actor_type text not null check (actor_type in ('worker','admin','system')),
  details_version integer not null,
  masked_snapshot jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_worker_payout_profiles_status on public.worker_payout_profiles(status,submitted_at desc);
create index if not exists idx_worker_payout_profile_events_profile on public.worker_payout_profile_events(payout_profile_id,created_at desc);

alter table public.worker_payouts
  add column if not exists payout_profile_id uuid references public.worker_payout_profiles(id) on delete set null,
  add column if not exists payout_profile_version integer,
  add column if not exists payout_details_masked_snapshot jsonb,
  add column if not exists provider text,
  add column if not exists provider_payout_id text,
  add column if not exists provider_status text,
  add column if not exists provider_utr text,
  add column if not exists provider_fund_account_id text,
  add column if not exists provider_failure_reason text,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb,
  add column if not exists initiated_by uuid references public.user_profiles(id) on delete set null;

create unique index if not exists ux_worker_payout_provider_id
  on public.worker_payouts(provider,provider_payout_id) where provider_payout_id is not null;
create index if not exists idx_worker_payout_profile on public.worker_payouts(payout_profile_id) where payout_profile_id is not null;

alter table public.worker_payouts drop constraint if exists worker_payout_status_check;
alter table public.worker_payouts add constraint worker_payout_status_check
  check (status in ('Scheduled','Processing','On Hold','Paid','Failed','Cancelled','Reversed'));

create table if not exists public.razorpayx_payout_attempts (
  id uuid primary key default gen_random_uuid(),
  worker_payout_id uuid not null references public.worker_payouts(id) on delete restrict,
  attempt_number integer not null check (attempt_number>0),
  idempotency_key uuid not null unique default gen_random_uuid(),
  environment text not null check (environment in ('test','live')),
  status text not null default 'Prepared' check (status in ('Prepared','Submitted','Queued','Pending','Processing','Processed','Failed','Reversed','Cancelled')),
  provider_payout_id text,
  provider_fund_account_id text,
  provider_status text,
  utr text,
  failure_reason text,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object'),
  initiated_by uuid not null references public.user_profiles(id) on delete restrict,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(worker_payout_id,attempt_number)
);

create unique index if not exists ux_razorpayx_attempt_provider_payout
  on public.razorpayx_payout_attempts(provider_payout_id) where provider_payout_id is not null;
create index if not exists idx_razorpayx_attempt_payout on public.razorpayx_payout_attempts(worker_payout_id,attempt_number desc);

create table if not exists public.razorpayx_payout_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  event_type text not null,
  provider_payout_id text,
  attempt_id uuid references public.razorpayx_payout_attempts(id) on delete set null,
  verified boolean not null default true,
  processed boolean not null default false,
  provider_status text,
  error_message text,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object'),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_razorpayx_events_provider_payout on public.razorpayx_payout_events(provider_payout_id,received_at desc);

alter table public.worker_payout_profiles enable row level security;
alter table public.worker_payout_profile_events enable row level security;
alter table public.razorpayx_payout_attempts enable row level security;
alter table public.razorpayx_payout_events enable row level security;

revoke all on table public.worker_payout_profiles,public.worker_payout_profile_events,
  public.razorpayx_payout_attempts,public.razorpayx_payout_events from public,anon,authenticated;
grant select on table public.worker_payout_profiles,public.worker_payout_profile_events,
  public.razorpayx_payout_attempts,public.razorpayx_payout_events to service_role;
grant insert,update on table public.razorpayx_payout_attempts,public.razorpayx_payout_events to service_role;

create or replace function public.worker_payout_encryption_key()
returns text language plpgsql stable security definer
set search_path=public,vault,pg_temp as $$
declare v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets
  where name='profox_worker_payout_encryption_v1' order by created_at desc limit 1;
  if coalesce(v_key,'')='' then raise exception 'Employee payout encryption key is unavailable.'; end if;
  return v_key;
end $$;

create or replace function public.razorpayx_secret_name(p_mode text,p_kind text)
returns text language plpgsql immutable set search_path=public,pg_temp as $$
declare v_mode text:=lower(btrim(coalesce(p_mode,''))); v_kind text:=lower(btrim(coalesce(p_kind,'')));
begin
  if v_mode not in ('test','live') or v_kind not in ('api_secret','account_number','webhook_secret') then
    raise exception 'Unsupported RazorpayX secret selector.';
  end if;
  return 'profox_razorpayx_'||v_mode||'_'||v_kind;
end $$;

insert into public.system_configuration(config_key,config_value,description,updated_at)
values('razorpayx_payout_settings',jsonb_build_object(
  'enabled',false,'mode','test','keyId','','configured',false,'webhookConfigured',false,
  'accountNumberLast4','','defaultBankMode','IMPS','purpose','salary','queueIfLowBalance',true,
  'lastTestSuccess',false,'lastTestAt',null,'lastTestMessage','Not tested'
),'RazorpayX employee bulk payout transport. Secrets and account number are stored only in Supabase Vault.',now())
on conflict(config_key) do nothing;

create or replace function public.razorpayx_payout_ready(p_config jsonb)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((p_config->>'enabled')::boolean,false)
    and coalesce((p_config->>'configured')::boolean,false)
    and coalesce((p_config->>'webhookConfigured')::boolean,false)
    and coalesce((p_config->>'lastTestSuccess')::boolean,false)
    and nullif(p_config->>'lastTestAt','') is not null
    and (p_config->>'lastTestAt')::timestamptz>=now()-interval '30 days'
    and (
      (lower(coalesce(p_config->>'mode',''))='test' and coalesce(p_config->>'keyId','')~'^rzp_test_[A-Za-z0-9]+$')
      or (lower(coalesce(p_config->>'mode',''))='live' and coalesce(p_config->>'keyId','')~'^rzp_live_[A-Za-z0-9]+$')
    );
$$;

create or replace function public.admin_get_razorpayx_payout_status()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v from public.system_configuration where config_key='razorpayx_payout_settings';
  return v||jsonb_build_object(
    'ready',public.razorpayx_payout_ready(v),
    'productionReady',public.razorpayx_payout_ready(v) and lower(coalesce(v->>'mode',''))='live',
    'testReady',public.razorpayx_payout_ready(v) and lower(coalesce(v->>'mode',''))='test',
    'canConfigure',true,
    'webhookUrl',(select coalesce(config_value->>'checkoutBaseUrl','https://www.profoxwebdesigner.com') from public.system_configuration where config_key='payment_gateway_settings')
  );
end $$;

create or replace function public.admin_set_razorpayx_payout_settings(
  p_enabled boolean,p_mode text,p_key_id text,p_api_secret text default '',
  p_account_number text default '',p_webhook_secret text default '',
  p_default_bank_mode text default 'IMPS',p_queue_if_low_balance boolean default true
)
returns jsonb language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare
  v_mode text:=lower(btrim(coalesce(p_mode,''))); v_key text:=btrim(coalesce(p_key_id,''));
  v_account text:=regexp_replace(btrim(coalesce(p_account_number,'')),'[^0-9]','','g');
  v_bank_mode text:=upper(btrim(coalesce(p_default_bank_mode,'IMPS'))); v jsonb; v_old jsonb;
  v_id uuid; v_secret_name text; v_has_secret boolean; v_has_account boolean; v_has_webhook boolean;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if v_mode not in ('test','live') then raise exception 'RazorpayX mode must be Test or Live.'; end if;
  if (v_mode='test' and v_key<>'' and v_key!~'^rzp_test_[A-Za-z0-9]+$') or
     (v_mode='live' and v_key<>'' and v_key!~'^rzp_live_[A-Za-z0-9]+$') then
    raise exception 'RazorpayX Key ID does not match the selected mode.';
  end if;
  if v_bank_mode not in ('IMPS','NEFT','RTGS') then raise exception 'Default bank mode must be IMPS, NEFT or RTGS.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_old from public.system_configuration where config_key='razorpayx_payout_settings';

  v_secret_name:=public.razorpayx_secret_name(v_mode,'api_secret');
  select id into v_id from vault.secrets where name=v_secret_name limit 1;
  if btrim(coalesce(p_api_secret,''))<>'' then
    if v_id is null then perform vault.create_secret(btrim(p_api_secret),v_secret_name,'ProFox RazorpayX '||v_mode||' API secret',null);
    else perform vault.update_secret(v_id,btrim(p_api_secret),v_secret_name,'ProFox RazorpayX '||v_mode||' API secret',null); end if;
  end if;
  select exists(select 1 from vault.secrets where name=v_secret_name) into v_has_secret;

  v_secret_name:=public.razorpayx_secret_name(v_mode,'account_number');
  select id into v_id from vault.secrets where name=v_secret_name limit 1;
  if v_account<>'' then
    if length(v_account)<6 or length(v_account)>30 then raise exception 'Enter the RazorpayX source account number.'; end if;
    if v_id is null then perform vault.create_secret(v_account,v_secret_name,'ProFox RazorpayX source account number',null);
    else perform vault.update_secret(v_id,v_account,v_secret_name,'ProFox RazorpayX source account number',null); end if;
  end if;
  select exists(select 1 from vault.secrets where name=v_secret_name) into v_has_account;

  v_secret_name:=public.razorpayx_secret_name(v_mode,'webhook_secret');
  select id into v_id from vault.secrets where name=v_secret_name limit 1;
  if btrim(coalesce(p_webhook_secret,''))<>'' then
    if v_id is null then perform vault.create_secret(btrim(p_webhook_secret),v_secret_name,'ProFox RazorpayX payout webhook secret',null);
    else perform vault.update_secret(v_id,btrim(p_webhook_secret),v_secret_name,'ProFox RazorpayX payout webhook secret',null); end if;
  end if;
  select exists(select 1 from vault.secrets where name=v_secret_name) into v_has_webhook;

  if coalesce(p_enabled,false) and (v_key='' or not v_has_secret or not v_has_account or not v_has_webhook) then
    raise exception 'RazorpayX cannot be enabled until Key ID, API Secret, source account number and webhook secret are complete.';
  end if;
  v:=coalesce(v_old,'{}'::jsonb)||jsonb_build_object(
    'enabled',coalesce(p_enabled,false),'mode',v_mode,'keyId',v_key,
    'configured',v_key<>'' and v_has_secret and v_has_account,
    'webhookConfigured',v_has_webhook,
    'accountNumberLast4',case when v_account<>'' then right(v_account,4) else coalesce(v_old->>'accountNumberLast4','') end,
    'defaultBankMode',v_bank_mode,'purpose','salary','queueIfLowBalance',coalesce(p_queue_if_low_balance,true),
    'lastTestSuccess',false,'lastTestAt',null,'lastTestMessage','A new connection test is required after saving RazorpayX settings.'
  );
  insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  values('razorpayx_payout_settings',v,'RazorpayX employee bulk payout transport. Secrets and account number are stored only in Supabase Vault.',auth.uid(),now())
  on conflict(config_key) do update set config_value=excluded.config_value,description=excluded.description,updated_by=auth.uid(),updated_at=now();
  return public.admin_get_razorpayx_payout_status();
end $$;

create or replace function public.service_get_razorpayx_payout_config()
returns jsonb language plpgsql stable security definer set search_path=public,vault,pg_temp as $$
declare v jsonb; v_mode text; v_secret text; v_account text; v_webhook text;
begin
  select coalesce(config_value,'{}'::jsonb) into v from public.system_configuration where config_key='razorpayx_payout_settings';
  v_mode:=case when lower(coalesce(v->>'mode','test'))='live' then 'live' else 'test' end;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name=public.razorpayx_secret_name(v_mode,'api_secret') limit 1;
  select decrypted_secret into v_account from vault.decrypted_secrets where name=public.razorpayx_secret_name(v_mode,'account_number') limit 1;
  select decrypted_secret into v_webhook from vault.decrypted_secrets where name=public.razorpayx_secret_name(v_mode,'webhook_secret') limit 1;
  return v||jsonb_build_object('ready',public.razorpayx_payout_ready(v),'apiSecret',coalesce(v_secret,''),'accountNumber',coalesce(v_account,''),'webhookSecret',coalesce(v_webhook,''));
end $$;

create or replace function public.service_record_razorpayx_test(p_success boolean,p_message text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
  select coalesce(config_value,'{}'::jsonb) into v from public.system_configuration where config_key='razorpayx_payout_settings';
  v:=v||jsonb_build_object('lastTestSuccess',coalesce(p_success,false),'lastTestAt',now(),'lastTestMessage',left(coalesce(p_message,''),500));
  update public.system_configuration set config_value=v,updated_at=now() where config_key='razorpayx_payout_settings';
end $$;

create or replace function public.get_my_worker_payout_profile()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v public.worker_payout_profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v from public.worker_payout_profiles where user_id=v_uid;
  return jsonb_build_object(
    'profileId',v.id,'status',coalesce(v.status,'Setup Required'),'payoutMethod',v.payout_method,
    'preferredCurrency',coalesce(v.preferred_currency,'INR'),'countryCode',coalesce(v.country_code,'IN'),
    'detailsVersion',v.details_version,'maskedDetails',coalesce(v.masked_details,'{}'::jsonb),
    'submittedAt',v.submitted_at,'verifiedAt',v.verified_at,'rejectionReason',v.rejection_reason
  );
end $$;

create or replace function public.submit_my_worker_payout_profile(p_payout_method text,p_details jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions,vault,pg_temp as $$
declare
  v_uid uuid:=auth.uid(); v_method text:=btrim(coalesce(p_payout_method,'')); v_details jsonb:=coalesce(p_details,'{}'::jsonb);
  v_masked jsonb; v_encrypted bytea; v_existing public.worker_payout_profiles%rowtype; v_row public.worker_payout_profiles%rowtype;
  v_holder text:=btrim(coalesce(p_details->>'accountHolderName','')); v_event text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not exists(select 1 from public.user_profiles where id=v_uid and status='active' and role not in ('client','talent_partner','applicant')) then
    raise exception 'An active staff account is required.';
  end if;
  if v_method not in ('Bank Account','UPI') then raise exception 'Choose Bank Account or UPI.'; end if;
  if jsonb_typeof(v_details)<>'object' or octet_length(v_details::text)>8000 then raise exception 'Payout details are invalid or too large.'; end if;
  if length(v_holder)<2 then raise exception 'Account holder name is required.'; end if;
  if v_method='Bank Account' then
    if coalesce(p_details->>'accountNumber','')!~'^[0-9]{6,30}$' then raise exception 'Enter a valid bank account number.'; end if;
    if upper(coalesce(p_details->>'ifsc',''))!~'^[A-Z]{4}0[A-Z0-9]{6}$' then raise exception 'Enter a valid IFSC code.'; end if;
    v_details:=v_details||jsonb_build_object('accountHolderName',v_holder,'accountNumber',p_details->>'accountNumber','ifsc',upper(p_details->>'ifsc'));
    v_masked:=jsonb_build_object('accountHolderName',left(v_holder,2)||'***','accountNumber',public.talent_partner_mask_value(p_details->>'accountNumber',4),'ifsc',left(upper(p_details->>'ifsc'),4)||'***'||right(upper(p_details->>'ifsc'),2));
  else
    if lower(coalesce(p_details->>'vpa',''))!~'^[a-z0-9._-]{2,256}@[a-z0-9.-]{2,64}$' then raise exception 'Enter a valid UPI ID.'; end if;
    v_details:=v_details||jsonb_build_object('accountHolderName',v_holder,'vpa',lower(p_details->>'vpa'));
    v_masked:=jsonb_build_object('accountHolderName',left(v_holder,2)||'***','vpa',public.talent_partner_mask_value(lower(p_details->>'vpa'),4));
  end if;
  v_encrypted:=extensions.pgp_sym_encrypt(v_details::text,public.worker_payout_encryption_key(),'cipher-algo=aes256,compress-algo=1');
  select * into v_existing from public.worker_payout_profiles where user_id=v_uid for update;
  v_event:=case when v_existing.id is null then 'Submitted' else 'Updated' end;
  insert into public.worker_payout_profiles(user_id,payout_method,preferred_currency,country_code,status,details_version,masked_details,encrypted_details,submitted_at)
  values(v_uid,v_method,'INR','IN','Verification Pending',1,v_masked,v_encrypted,now())
  on conflict(user_id) do update set payout_method=excluded.payout_method,status='Verification Pending',details_version=public.worker_payout_profiles.details_version+1,
    masked_details=excluded.masked_details,encrypted_details=excluded.encrypted_details,submitted_at=now(),verified_at=null,verified_by=null,
    verification_reference=null,rejected_at=null,rejected_by=null,rejection_reason=null,updated_at=now()
  returning * into v_row;
  insert into public.worker_payout_profile_events(payout_profile_id,user_id,event_type,actor_user_id,actor_type,details_version,masked_snapshot,reason)
  values(v_row.id,v_uid,v_event,v_uid,'worker',v_row.details_version,v_row.masked_details,'Employee payout details submitted for verification.');
  return public.get_my_worker_payout_profile();
end $$;

create or replace function public.admin_list_worker_payout_profiles()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.worker_compensation_is_finance() then raise exception 'Finance permission required.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'userId',p.user_id,'fullName',u.full_name,'email',u.email,'role',u.role,'status',p.status,
    'payoutMethod',p.payout_method,'detailsVersion',p.details_version,'maskedDetails',p.masked_details,
    'submittedAt',p.submitted_at,'verifiedAt',p.verified_at,'rejectionReason',p.rejection_reason,
    'scheduledPayouts',(select count(*) from public.worker_payouts w where w.writer_user_id=p.user_id and w.status in ('Scheduled','Processing','Failed'))
  ) order by case p.status when 'Verification Pending' then 0 when 'Rejected' then 1 else 2 end,p.submitted_at desc)
  from public.worker_payout_profiles p join public.user_profiles u on u.id=p.user_id),'[]'::jsonb);
end $$;

create or replace function public.admin_reveal_worker_payout_profile(p_profile_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,extensions,vault,pg_temp as $$
declare v public.worker_payout_profiles%rowtype; v_reason text:=btrim(coalesce(p_reason,'')); v_details jsonb;
begin
  if not public.worker_compensation_is_finance() then raise exception 'Finance permission required.'; end if;
  if length(v_reason)<10 then raise exception 'Enter a clear access reason of at least 10 characters.'; end if;
  select * into v from public.worker_payout_profiles where id=p_profile_id;
  if not found then raise exception 'Payout profile not found.'; end if;
  v_details:=extensions.pgp_sym_decrypt(v.encrypted_details,public.worker_payout_encryption_key())::jsonb;
  insert into public.worker_payout_profile_events(payout_profile_id,user_id,event_type,actor_user_id,actor_type,details_version,masked_snapshot,reason)
  values(v.id,v.user_id,'Revealed',auth.uid(),'admin',v.details_version,v.masked_details,left(v_reason,1000));
  return jsonb_build_object('id',v.id,'userId',v.user_id,'payoutMethod',v.payout_method,'detailsVersion',v.details_version,'details',v_details);
end $$;

create or replace function public.admin_review_worker_payout_profile(p_profile_id uuid,p_decision text,p_reason text default null,p_verification_reference text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_decision text:=initcap(lower(btrim(coalesce(p_decision,'')))); v_reason text:=btrim(coalesce(p_reason,'')); v public.worker_payout_profiles%rowtype;
begin
  if not public.worker_compensation_is_finance() then raise exception 'Finance permission required.'; end if;
  select * into v from public.worker_payout_profiles where id=p_profile_id for update;
  if not found then raise exception 'Payout profile not found.'; end if;
  if v_decision not in ('Verified','Rejected') then raise exception 'Decision must be Verified or Rejected.'; end if;
  if v_decision='Rejected' and length(v_reason)<5 then raise exception 'A rejection reason is required.'; end if;
  if v_decision='Verified' and not exists(select 1 from public.worker_payout_profile_events e where e.payout_profile_id=v.id and e.event_type='Revealed' and e.actor_user_id=auth.uid() and e.details_version=v.details_version and e.created_at>=now()-interval '30 minutes') then
    raise exception 'Reveal and review the current payout details before verification.';
  end if;
  update public.worker_payout_profiles set status=v_decision,
    verified_at=case when v_decision='Verified' then now() else null end,verified_by=case when v_decision='Verified' then auth.uid() else null end,
    verification_reference=case when v_decision='Verified' then nullif(left(btrim(coalesce(p_verification_reference,'')),300),'') else null end,
    rejected_at=case when v_decision='Rejected' then now() else null end,rejected_by=case when v_decision='Rejected' then auth.uid() else null end,
    rejection_reason=case when v_decision='Rejected' then left(v_reason,2000) else null end,updated_at=now() where id=v.id returning * into v;
  insert into public.worker_payout_profile_events(payout_profile_id,user_id,event_type,actor_user_id,actor_type,details_version,masked_snapshot,reason)
  values(v.id,v.user_id,v_decision,auth.uid(),'admin',v.details_version,v.masked_details,case when v_decision='Verified' then coalesce(nullif(left(btrim(coalesce(p_verification_reference,'')),300),''),'Verified by Finance.') else left(v_reason,1000) end);
  return jsonb_build_object('success',true,'profileId',v.id,'status',v.status,'detailsVersion',v.details_version);
end $$;

-- Require a verified, versioned destination when creating the existing worker payout batch.
create or replace function public.admin_create_worker_payout_batch(p_earning_ids uuid[],p_scheduled_for date,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_currency text; v_total numeric; v_count integer; v_workers integer; v_min numeric; r record; v_payout uuid;
begin
  if not public.worker_compensation_is_finance() then raise exception 'Finance permission required.'; end if;
  perform public.release_due_worker_earning_holds();
  if coalesce(array_length(p_earning_ids,1),0)=0 then raise exception 'Select at least one payable earning.'; end if;
  if (select count(*) from public.worker_earnings where id=any(p_earning_ids))<>cardinality(p_earning_ids) then raise exception 'One or more selected earnings are invalid or duplicated.'; end if;
  if exists(select 1 from public.worker_earnings e where e.id=any(p_earning_ids) and (e.status<>'Payable' or e.eligible_at>now())) then raise exception 'Every selected earning must be payable and outside its hold period.'; end if;
  if (select count(distinct currency) from public.worker_earnings where id=any(p_earning_ids))<>1 then raise exception 'A payout batch must contain one currency.'; end if;
  select min(currency),sum(amount),count(*),count(distinct writer_user_id) into v_currency,v_total,v_count,v_workers from public.worker_earnings where id=any(p_earning_ids);
  if upper(v_currency)<>'INR' then raise exception 'RazorpayX employee payouts currently require an INR batch.'; end if;
  select coalesce((public.worker_compensation_config()->>'minimumPayout')::numeric,0) into v_min;
  if exists(select 1 from public.worker_earnings where id=any(p_earning_ids) group by writer_user_id having sum(amount)<v_min) then raise exception 'A selected worker is below the configured minimum payout.'; end if;
  if exists(select 1 from public.worker_earnings e left join public.worker_payout_profiles p on p.user_id=e.writer_user_id and p.status='Verified' where e.id=any(p_earning_ids) and p.id is null) then
    raise exception 'Every selected worker must have a verified Bank Account or UPI payout profile.';
  end if;
  insert into public.worker_payout_batches(scheduled_for,currency,total_amount,earning_count,worker_count,notes,created_by)
  values(p_scheduled_for,upper(v_currency),round(v_total,2),v_count,v_workers,p_notes,auth.uid()) returning id into v_id;
  for r in select e.writer_user_id,upper(e.currency) currency,round(sum(e.amount),2) amount,p.id profile_id,p.details_version,p.payout_method,p.masked_details
    from public.worker_earnings e join public.worker_payout_profiles p on p.user_id=e.writer_user_id and p.status='Verified'
    where e.id=any(p_earning_ids) group by e.writer_user_id,upper(e.currency),p.id,p.details_version,p.payout_method,p.masked_details
  loop
    insert into public.worker_payouts(payout_batch_id,writer_user_id,currency,amount,payment_method,payout_profile_id,payout_profile_version,payout_details_masked_snapshot,provider)
    values(v_id,r.writer_user_id,r.currency,r.amount,r.payout_method,r.profile_id,r.details_version,r.masked_details,'razorpayx') returning id into v_payout;
    insert into public.worker_payout_items(payout_id,earning_id,amount_snapshot)
    select v_payout,e.id,e.amount from public.worker_earnings e where e.id=any(p_earning_ids) and e.writer_user_id=r.writer_user_id;
  end loop;
  update public.worker_earnings set status='Scheduled',updated_at=now() where id=any(p_earning_ids);
  update public.worker_work_assignments a set status='Scheduled for Payout',payout_status='Scheduled',updated_at=now()
  where exists(select 1 from public.worker_earnings e where e.assignment_id=a.id and e.id=any(p_earning_ids));
  return v_id;
end $$;

create or replace function public.service_prepare_worker_razorpayx_batch(p_batch_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions,vault,pg_temp as $$
declare v_batch public.worker_payout_batches%rowtype; v_config jsonb; v_row record; v_attempt public.razorpayx_payout_attempts%rowtype; v_items jsonb:='[]'::jsonb; v_details jsonb; v_next integer;
begin
  if not exists(select 1 from public.user_profiles where id=p_actor_id and status='active' and role in ('admin','finance','accountant')) then raise exception 'Active Finance access required.'; end if;
  v_config:=public.service_get_razorpayx_payout_config();
  if coalesce((v_config->>'ready')::boolean,false) is not true then raise exception 'RazorpayX payout transport is not configured and successfully tested.'; end if;
  select * into v_batch from public.worker_payout_batches where id=p_batch_id for update;
  if not found or v_batch.status in ('Paid','Cancelled') then raise exception 'Payout batch is not available for processing.'; end if;
  if upper(v_batch.currency)<>'INR' then raise exception 'RazorpayX payouts require INR.'; end if;
  for v_row in
    select p.*,u.full_name,u.email,u.phone,pp.encrypted_details,pp.details_version current_profile_version,pp.status profile_status,pp.payout_method current_method
    from public.worker_payouts p join public.user_profiles u on u.id=p.writer_user_id
    join public.worker_payout_profiles pp on pp.id=p.payout_profile_id
    where p.payout_batch_id=p_batch_id and p.status in ('Scheduled','Failed','Reversed','Cancelled','Processing') order by u.full_name,p.id for update of p
  loop
    if v_row.profile_status<>'Verified' or v_row.current_profile_version<>v_row.payout_profile_version then raise exception 'A payout profile changed after batching. Create a new reviewed batch before payment.'; end if;
    select * into v_attempt from public.razorpayx_payout_attempts where worker_payout_id=v_row.id and status in ('Prepared','Submitted','Queued','Pending','Processing') order by attempt_number desc limit 1;
    if found and v_attempt.status in ('Submitted','Queued','Processing') then continue; end if;
    if not found then
      select coalesce(max(attempt_number),0)+1 into v_next from public.razorpayx_payout_attempts where worker_payout_id=v_row.id;
      insert into public.razorpayx_payout_attempts(worker_payout_id,attempt_number,environment,initiated_by)
      values(v_row.id,v_next,v_config->>'mode',p_actor_id) returning * into v_attempt;
    end if;
    v_details:=extensions.pgp_sym_decrypt(v_row.encrypted_details,public.worker_payout_encryption_key())::jsonb;
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'attemptId',v_attempt.id,'payoutId',v_row.id,'idempotencyKey',v_attempt.idempotency_key,
      'workerUserId',v_row.writer_user_id,'name',v_row.full_name,'email',v_row.email,'phone',v_row.phone,
      'amount',v_row.amount,'currency',v_row.currency,'payoutMethod',v_row.current_method,'details',v_details,
      'referenceId','profox-worker-'||replace(v_row.id::text,'-','')
    ));
    update public.worker_payouts set status='Processing',processing_started_at=coalesce(processing_started_at,now()),initiated_by=p_actor_id,
      provider='razorpayx',provider_failure_reason=null,updated_at=now() where id=v_row.id;
  end loop;
  update public.worker_payout_batches set status='Processing',updated_at=now() where id=p_batch_id and jsonb_array_length(v_items)>0;
  return jsonb_build_object('batchId',p_batch_id,'batchNumber',v_batch.batch_number,'items',v_items,'mode',v_config->>'mode',
    'defaultBankMode',v_config->>'defaultBankMode','purpose',v_config->>'purpose','queueIfLowBalance',coalesce((v_config->>'queueIfLowBalance')::boolean,true));
end $$;

create or replace function public.service_apply_worker_razorpayx_status(
  p_attempt_id uuid,p_provider_payout_id text,p_status text,p_fund_account_id text default null,p_utr text default null,
  p_failure_reason text default null,p_metadata jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_attempt public.razorpayx_payout_attempts%rowtype; v_payout public.worker_payouts%rowtype; v_status text:=lower(btrim(coalesce(p_status,''))); v_remaining integer; v_paid integer;
begin
  if v_status not in ('queued','pending','processing','processed','failed','reversed','cancelled') then raise exception 'Unsupported RazorpayX payout status.'; end if;
  select * into v_attempt from public.razorpayx_payout_attempts where id=p_attempt_id for update;
  if not found then raise exception 'RazorpayX payout attempt not found.'; end if;
  select * into v_payout from public.worker_payouts where id=v_attempt.worker_payout_id for update;
  update public.razorpayx_payout_attempts set status=initcap(v_status),provider_payout_id=coalesce(nullif(p_provider_payout_id,''),provider_payout_id),
    provider_fund_account_id=coalesce(nullif(p_fund_account_id,''),provider_fund_account_id),provider_status=v_status,utr=coalesce(nullif(p_utr,''),utr),
    failure_reason=nullif(left(coalesce(p_failure_reason,''),1000),''),safe_metadata=coalesce(p_metadata,'{}'::jsonb),
    submitted_at=coalesce(submitted_at,now()),completed_at=case when v_status in ('processed','failed','reversed','cancelled') then now() else null end,updated_at=now()
  where id=v_attempt.id;
  if v_status='processed' then
    update public.worker_payouts set status='Paid',provider_payout_id=coalesce(nullif(p_provider_payout_id,''),provider_payout_id),provider_status=v_status,
      provider_utr=coalesce(nullif(p_utr,''),provider_utr),provider_fund_account_id=coalesce(nullif(p_fund_account_id,''),provider_fund_account_id),
      transaction_reference=coalesce(nullif(p_utr,''),nullif(p_provider_payout_id,''),transaction_reference),payment_method='RazorpayX',provider_failure_reason=null,
      provider_metadata=coalesce(p_metadata,'{}'::jsonb),paid_at=coalesce(paid_at,now()),paid_by=v_attempt.initiated_by,updated_at=now() where id=v_payout.id;
    update public.worker_earnings e set status='Paid',updated_at=now() where exists(select 1 from public.worker_payout_items i where i.payout_id=v_payout.id and i.earning_id=e.id);
    update public.worker_work_assignments a set status='Paid',payout_status='Paid',updated_at=now() where exists(select 1 from public.worker_earnings e join public.worker_payout_items i on i.earning_id=e.id where i.payout_id=v_payout.id and e.assignment_id=a.id);
  elsif v_status in ('failed','reversed','cancelled') then
    update public.worker_payouts set status=case when v_status='reversed' then 'Reversed' else 'Failed' end,provider_payout_id=coalesce(nullif(p_provider_payout_id,''),provider_payout_id),
      provider_status=v_status,provider_utr=coalesce(nullif(p_utr,''),provider_utr),provider_failure_reason=nullif(left(coalesce(p_failure_reason,''),1000),''),
      provider_metadata=coalesce(p_metadata,'{}'::jsonb),paid_at=null,paid_by=null,updated_at=now() where id=v_payout.id;
    update public.worker_earnings e set status='Scheduled',updated_at=now() where exists(select 1 from public.worker_payout_items i where i.payout_id=v_payout.id and i.earning_id=e.id) and e.status in ('Paid','Scheduled');
    update public.worker_work_assignments a set status='Scheduled for Payout',payout_status='Scheduled',updated_at=now() where exists(select 1 from public.worker_earnings e join public.worker_payout_items i on i.earning_id=e.id where i.payout_id=v_payout.id and e.assignment_id=a.id) and a.payout_status in ('Paid','Scheduled');
  else
    update public.worker_payouts set status='Processing',provider_payout_id=coalesce(nullif(p_provider_payout_id,''),provider_payout_id),provider_status=v_status,
      provider_fund_account_id=coalesce(nullif(p_fund_account_id,''),provider_fund_account_id),provider_metadata=coalesce(p_metadata,'{}'::jsonb),updated_at=now() where id=v_payout.id;
  end if;
  select count(*) filter(where status not in ('Paid','Cancelled'))::int,count(*) filter(where status='Paid')::int into v_remaining,v_paid from public.worker_payouts where payout_batch_id=v_payout.payout_batch_id;
  update public.worker_payout_batches set status=case when v_remaining=0 then 'Paid' when v_paid>0 then 'Partially Paid' when exists(select 1 from public.worker_payouts where payout_batch_id=v_payout.payout_batch_id and status='Processing') then 'Processing' else 'Scheduled' end,
    completed_at=case when v_remaining=0 then now() else null end,updated_at=now() where id=v_payout.payout_batch_id;
  insert into public.worker_compensation_events(payout_id,event_type,reason,new_value,source,actor_id)
  values(v_payout.id,'RazorpayX Status',nullif(left(coalesce(p_failure_reason,''),1000),''),jsonb_build_object('status',v_status,'providerPayoutId',p_provider_payout_id,'utr',p_utr),'RazorpayX',v_attempt.initiated_by);
  return jsonb_build_object('payoutId',v_payout.id,'status',v_status,'batchId',v_payout.payout_batch_id);
end $$;

create or replace function public.service_record_worker_razorpayx_dispatch(
  p_attempt_id uuid,p_provider_payout_id text,p_status text,p_fund_account_id text default null,p_utr text default null,
  p_failure_reason text default null,p_metadata jsonb default '{}'::jsonb
)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select public.service_apply_worker_razorpayx_status(p_attempt_id,p_provider_payout_id,p_status,p_fund_account_id,p_utr,p_failure_reason,p_metadata);
$$;

create or replace function public.service_apply_razorpayx_webhook_event(
  p_provider_event_id text,p_event_type text,p_provider_payout_id text,p_status text,p_fund_account_id text default null,
  p_utr text default null,p_failure_reason text default null,p_metadata jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_attempt public.razorpayx_payout_attempts%rowtype; v_event uuid; v_result jsonb;
begin
  if coalesce(btrim(p_provider_event_id),'')='' then raise exception 'Razorpay event ID is required.'; end if;
  insert into public.razorpayx_payout_events(provider_event_id,event_type,provider_payout_id,provider_status,safe_metadata)
  values(left(btrim(p_provider_event_id),255),left(coalesce(p_event_type,''),150),nullif(left(coalesce(p_provider_payout_id,''),150),''),left(coalesce(p_status,''),60),coalesce(p_metadata,'{}'::jsonb))
  on conflict(provider_event_id) do nothing returning id into v_event;
  if v_event is null then return jsonb_build_object('duplicate',true); end if;
  select * into v_attempt from public.razorpayx_payout_attempts where provider_payout_id=p_provider_payout_id order by created_at desc limit 1;
  if not found then
    update public.razorpayx_payout_events set error_message='No matching ProFox payout attempt.',processed_at=now() where id=v_event;
    return jsonb_build_object('matched',false);
  end if;
  v_result:=public.service_apply_worker_razorpayx_status(v_attempt.id,p_provider_payout_id,p_status,p_fund_account_id,p_utr,p_failure_reason,p_metadata);
  update public.razorpayx_payout_events set attempt_id=v_attempt.id,processed=true,processed_at=now() where id=v_event;
  return v_result||jsonb_build_object('matched',true,'duplicate',false);
end $$;

create or replace function public.admin_get_worker_razorpayx_payout_state()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.worker_compensation_is_finance() then raise exception 'Finance permission required.'; end if;
  return jsonb_build_object(
    'profiles',public.admin_list_worker_payout_profiles(),
    'payouts',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'batchId',p.payout_batch_id,'batchNumber',b.batch_number,'workerId',p.writer_user_id,'workerName',u.full_name,
      'amount',p.amount,'currency',p.currency,'status',p.status,'profileId',p.payout_profile_id,'profileVersion',p.payout_profile_version,
      'payoutMethod',p.payment_method,'maskedDetails',p.payout_details_masked_snapshot,'provider',p.provider,'providerStatus',p.provider_status,
      'providerPayoutId',p.provider_payout_id,'utr',p.provider_utr,'failureReason',p.provider_failure_reason,'scheduledFor',b.scheduled_for
    ) order by b.created_at desc,u.full_name) from public.worker_payouts p join public.worker_payout_batches b on b.id=p.payout_batch_id join public.user_profiles u on u.id=p.writer_user_id),'[]'::jsonb),
    'batches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'batchNumber',b.batch_number,'status',b.status,'scheduledFor',b.scheduled_for,'currency',b.currency,'totalAmount',b.total_amount,'workerCount',b.worker_count) order by b.created_at desc) from public.worker_payout_batches b),'[]'::jsonb)
  );
end $$;

revoke all on function public.worker_payout_encryption_key() from public,anon,authenticated;
revoke all on function public.razorpayx_secret_name(text,text) from public,anon,authenticated;
revoke all on function public.razorpayx_payout_ready(jsonb) from public,anon,authenticated;
revoke all on function public.admin_get_razorpayx_payout_status() from public,anon;
revoke all on function public.admin_set_razorpayx_payout_settings(boolean,text,text,text,text,text,text,boolean) from public,anon;
revoke all on function public.service_get_razorpayx_payout_config() from public,anon,authenticated;
revoke all on function public.service_record_razorpayx_test(boolean,text) from public,anon,authenticated;
revoke all on function public.get_my_worker_payout_profile() from public,anon;
revoke all on function public.submit_my_worker_payout_profile(text,jsonb) from public,anon;
revoke all on function public.admin_list_worker_payout_profiles() from public,anon;
revoke all on function public.admin_reveal_worker_payout_profile(uuid,text) from public,anon;
revoke all on function public.admin_review_worker_payout_profile(uuid,text,text,text) from public,anon;
revoke all on function public.service_prepare_worker_razorpayx_batch(uuid,uuid) from public,anon,authenticated;
revoke all on function public.service_apply_worker_razorpayx_status(uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.service_record_worker_razorpayx_dispatch(uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.service_apply_razorpayx_webhook_event(text,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.admin_get_worker_razorpayx_payout_state() from public,anon;

grant execute on function public.admin_get_razorpayx_payout_status() to authenticated,service_role;
grant execute on function public.admin_set_razorpayx_payout_settings(boolean,text,text,text,text,text,text,boolean) to authenticated,service_role;
grant execute on function public.get_my_worker_payout_profile(),public.submit_my_worker_payout_profile(text,jsonb),
  public.admin_list_worker_payout_profiles(),public.admin_reveal_worker_payout_profile(uuid,text),
  public.admin_review_worker_payout_profile(uuid,text,text,text),public.admin_get_worker_razorpayx_payout_state() to authenticated;
grant execute on function public.service_get_razorpayx_payout_config(),public.service_record_razorpayx_test(boolean,text),
  public.service_prepare_worker_razorpayx_batch(uuid,uuid),
  public.service_apply_worker_razorpayx_status(uuid,text,text,text,text,text,jsonb),
  public.service_record_worker_razorpayx_dispatch(uuid,text,text,text,text,text,jsonb),
  public.service_apply_razorpayx_webhook_event(text,text,text,text,text,text,text,jsonb) to service_role;

-- The older manual payment confirmation remains available only as a fallback.
-- It may not overwrite a provider-controlled payout after RazorpayX processing begins.
create or replace function public.admin_mark_worker_payout_paid(p_payout_id uuid,p_transaction_reference text,p_payment_method text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.worker_payouts%rowtype; v_remaining integer;
begin
  if not public.worker_compensation_is_finance() then raise exception 'Finance permission required.'; end if;
  if coalesce(btrim(p_transaction_reference),'')='' then raise exception 'Transaction reference is required.'; end if;
  select * into v from public.worker_payouts where id=p_payout_id for update;
  if not found then raise exception 'Payout not found.'; end if;
  if v.provider='razorpayx' and (v.provider_payout_id is not null or v.status='Processing') then raise exception 'RazorpayX-controlled payouts must be reconciled by the verified provider webhook.'; end if;
  if v.status='Paid' then return; end if;
  if v.status not in ('Scheduled','Failed') then raise exception 'Only a scheduled or failed manual payout can be marked paid.'; end if;
  update public.worker_payouts set status='Paid',transaction_reference=btrim(p_transaction_reference),payment_method=coalesce(nullif(btrim(p_payment_method),''),'Manual'),paid_at=now(),paid_by=auth.uid(),updated_at=now() where id=v.id;
  update public.worker_earnings e set status='Paid',updated_at=now() where exists(select 1 from public.worker_payout_items i where i.payout_id=v.id and i.earning_id=e.id);
  update public.worker_work_assignments a set status='Paid',payout_status='Paid',updated_at=now() where exists(select 1 from public.worker_earnings e join public.worker_payout_items i on i.earning_id=e.id where i.payout_id=v.id and e.assignment_id=a.id);
  select count(*) into v_remaining from public.worker_payouts p where p.payout_batch_id=v.payout_batch_id and p.status<>'Paid';
  update public.worker_payout_batches set status=case when v_remaining=0 then 'Paid' else 'Partially Paid' end,completed_at=case when v_remaining=0 then now() else null end,updated_at=now() where id=v.payout_batch_id;
end $$;

revoke all on function public.admin_mark_worker_payout_paid(uuid,text,text) from public,anon;
grant execute on function public.admin_mark_worker_payout_paid(uuid,text,text) to authenticated;

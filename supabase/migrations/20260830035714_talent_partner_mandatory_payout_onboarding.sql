-- Talent Partner mandatory payout onboarding
-- Payout details must be submitted before referral work is enabled.
-- Verification may remain pending while the partner works; actual payouts still require verification.

begin;

create or replace function public.talent_partner_payout_onboarding_complete(p_partner_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.talent_partner_payout_profiles pp
    where pp.partner_user_id = p_partner_user_id
      and pp.status in ('Verification Pending','Verified')
  )
$$;

revoke all on function public.talent_partner_payout_onboarding_complete(uuid) from public, anon, authenticated;
grant execute on function public.talent_partner_payout_onboarding_complete(uuid) to service_role;

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
  v_partner_status text;
  v_required boolean;
  v_complete boolean;
  v_balances jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;

  select status into v_partner_status
  from public.talent_partner_profiles
  where user_id=v_uid;
  if not found then raise exception 'Talent Partner profile not found.'; end if;
  if v_partner_status in ('Suspended','Closed') then
    raise exception 'Payout setup is unavailable while the Talent Partner account is %.', lower(v_partner_status);
  end if;

  select * into v_profile
  from public.talent_partner_payout_profiles
  where partner_user_id=v_uid;

  v_complete := v_profile.id is not null and v_profile.status in ('Verification Pending','Verified');
  v_required := not v_complete;

  select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'amount',amount) order by currency),'[]'::jsonb)
  into v_balances
  from (
    select upper(currency) currency,sum(reward_amount)::numeric(14,2) amount
    from public.talent_partner_reward_entries
    where partner_user_id=v_uid and status='Approved' and payout_id is null
    group by upper(currency)
  ) x;

  return jsonb_build_object(
    'setupRequired',v_required,
    'setupComplete',v_complete,
    'workAccessGranted',v_partner_status='Active' and v_complete,
    'accountStatus',v_partner_status,
    'status',case when v_profile.id is null then 'Setup Required' else v_profile.status end,
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

revoke all on function public.talent_partner_payout_setup_state() from public, anon;
grant execute on function public.talent_partner_payout_setup_state() to authenticated, service_role;

create or replace function public.talent_partner_submit_payout_profile(
  p_payout_method text,
  p_preferred_currency text,
  p_country_code text,
  p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
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
  v_partner_status text;
  v_version integer;
  v_event text;
  v_identifier text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;

  select status into v_partner_status
  from public.talent_partner_profiles
  where user_id=v_uid
  for update;
  if not found then raise exception 'Talent Partner profile not found.'; end if;
  if v_partner_status not in ('Pending','Active') then
    raise exception 'Payout details can only be submitted while the Talent Partner account is pending approval or active.';
  end if;

  if v_method not in ('PayPal','Wise','Bank Transfer','Other') then raise exception 'Unsupported payout method.'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Preferred currency must be a three-letter currency code.'; end if;
  if v_country<>'' and v_country !~ '^[A-Z]{2}$' then raise exception 'Country must use a two-letter ISO code.'; end if;
  if jsonb_typeof(v_details)<>'object' then raise exception 'Payout details must be an object.'; end if;

  select * into v_existing
  from public.talent_partner_payout_profiles
  where partner_user_id=v_uid
  for update;

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
  ) values(
    v_row.id,v_uid,v_event,v_uid,'partner',v_row.details_version,v_row.masked_details,
    case when v_partner_status='Active'
      then 'Mandatory payout details submitted. Referral work access is enabled while payout verification remains pending.'
      else 'Mandatory payout details submitted during Talent Partner onboarding.'
    end
  );

  update public.talent_partner_profiles
  set payout_method=v_method,
      payout_email=case when v_method='PayPal' then v_row.masked_details->>'paypalEmail' when v_method='Wise' then v_row.masked_details->>'wiseEmail' else v_row.masked_details->>'accountNumber' end,
      preferred_currency=v_currency,
      updated_at=now()
  where user_id=v_uid;

  perform public.talent_partner_notify(
    v_uid,'payout','Payout details submitted',
    case when v_partner_status='Active'
      then 'Your payout details are encrypted and waiting for ProFox verification. Your Talent Partner work access is now enabled; actual payouts remain blocked until verification is complete.'
      else 'Your payout details are encrypted and waiting for ProFox verification. Once your Talent Partner account is approved, you can start using referral links. Actual payouts remain blocked until verification is complete.'
    end,
    '/talent-partner','tp-payout-profile-submitted:'||v_row.id::text||':'||v_row.details_version::text
  );

  return public.talent_partner_payout_setup_state();
end;
$$;

revoke all on function public.talent_partner_submit_payout_profile(text,text,text,jsonb) from public, anon;
grant execute on function public.talent_partner_submit_payout_profile(text,text,text,jsonb) to authenticated, service_role;

do $$
begin
  if to_regprocedure('public.talent_partner_get_dashboard_internal_pre_payout_gate()') is null then
    alter function public.talent_partner_get_dashboard() rename to talent_partner_get_dashboard_internal_pre_payout_gate;
  end if;
end
$$;

revoke all on function public.talent_partner_get_dashboard_internal_pre_payout_gate() from public, anon, authenticated;
grant execute on function public.talent_partner_get_dashboard_internal_pre_payout_gate() to service_role;

create or replace function public.talent_partner_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_status text;
  v_payout_status text;
  v_complete boolean:=false;
  v_base jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select status into v_status from public.talent_partner_profiles where user_id=v_uid;
  if not found then raise exception 'Talent Partner profile not found.'; end if;

  select status into v_payout_status
  from public.talent_partner_payout_profiles
  where partner_user_id=v_uid;
  v_complete := coalesce(v_payout_status in ('Verification Pending','Verified'),false);

  v_base:=public.talent_partner_get_dashboard_internal_pre_payout_gate();

  if v_status='Active' and not v_complete then
    v_base:=v_base || jsonb_build_object(
      'jobs','[]'::jsonb,
      'referrals','[]'::jsonb,
      'resources','[]'::jsonb,
      'sourceBreakdown','[]'::jsonb,
      'accessLimited',true
    );
  end if;

  return v_base || jsonb_build_object(
    'accessReason',case when v_status<>'Active' then 'account_status' when not v_complete then 'payout_setup_required' else null end,
    'payoutSetupStatus',coalesce(v_payout_status,'Setup Required'),
    'payoutSetupComplete',v_complete,
    'workAccessGranted',v_status='Active' and v_complete
  );
end;
$$;

revoke all on function public.talent_partner_get_dashboard() from public, anon;
grant execute on function public.talent_partner_get_dashboard() to authenticated, service_role;

do $$
begin
  if to_regprocedure('public.public_track_talent_partner_visit_internal_pre_payout_gate(text,text,text,jsonb)') is null then
    alter function public.public_track_talent_partner_visit(text,text,text,jsonb) rename to public_track_talent_partner_visit_internal_pre_payout_gate;
  end if;
end
$$;

revoke all on function public.public_track_talent_partner_visit_internal_pre_payout_gate(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.public_track_talent_partner_visit_internal_pre_payout_gate(text,text,text,jsonb) to service_role;

create or replace function public.public_track_talent_partner_visit(
  p_partner_code text,
  p_job_slug text,
  p_session_id text,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_partner_user_id uuid;
begin
  select user_id into v_partner_user_id
  from public.talent_partner_profiles
  where upper(partner_code)=upper(trim(coalesce(p_partner_code,'')))
    and status='Active';

  if v_partner_user_id is null then
    return jsonb_build_object('success',false,'reason','invalid_partner');
  end if;

  if not public.talent_partner_payout_onboarding_complete(v_partner_user_id) then
    return jsonb_build_object('success',false,'reason','partner_not_ready');
  end if;

  return public.public_track_talent_partner_visit_internal_pre_payout_gate(
    p_partner_code,p_job_slug,p_session_id,coalesce(p_context,'{}'::jsonb)
  );
end;
$$;

revoke all on function public.public_track_talent_partner_visit(text,text,text,jsonb) from public;
grant execute on function public.public_track_talent_partner_visit(text,text,text,jsonb) to anon, authenticated, service_role;

create or replace function public.admin_set_talent_partner_status(
  p_partner_user_id uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text:=initcap(lower(trim(coalesce(p_status,''))));
  v_row public.talent_partner_profiles%rowtype;
  v_payout_ready boolean:=false;
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

  v_payout_ready:=public.talent_partner_payout_onboarding_complete(p_partner_user_id);

  perform set_config('profox.talent_partner_profile_rpc','1',true);
  update public.user_profiles
  set role='talent_partner',
      status=case when v_status='Active' then 'active' else case when v_status in ('Suspended','Closed') then 'inactive' else 'pending' end end,
      onboarding_status='completed',onboarding_progress=100,updated_at=now()
  where id=p_partner_user_id;

  perform public.talent_partner_notify(
    p_partner_user_id,'account','Talent Partner account '||lower(v_status),
    case
      when v_status='Active' and v_payout_ready then 'Your ProFox Talent Partner account is approved and your payout setup is complete. You can now access job links, referral analytics and reward tracking.'
      when v_status='Active' then 'Your ProFox Talent Partner account is approved. Before referral links and tracking become active, complete the mandatory secure payout setup.'
      when v_status='Suspended' then 'Your Talent Partner account is currently suspended. New referral attribution is disabled until the account is reactivated.'
      when v_status='Closed' then 'Your Talent Partner account has been closed.'
      else 'Your Talent Partner account is pending review. You can complete the secure payout setup now so you are ready to start immediately after approval.'
    end,
    case when v_status in ('Active','Pending') and not v_payout_ready then '/talent-partner/payout-setup' else '/talent-partner' end,
    'tp-account-status:'||p_partner_user_id::text||':'||lower(v_status)
  );

  return jsonb_build_object('success',true,'status',v_status,'payoutSetupComplete',v_payout_ready,'workAccessGranted',v_status='Active' and v_payout_ready);
end;
$$;

revoke all on function public.admin_set_talent_partner_status(uuid,text,text) from public, anon;
grant execute on function public.admin_set_talent_partner_status(uuid,text,text) to authenticated, service_role;

commit;

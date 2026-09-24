-- Talent Partner payout onboarding integrity: prevent mid-payout profile mutation and stop legacy plaintext payout entry.

create or replace function public.talent_partner_payout_profile_change_guard()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if old.status='Verified' and (
    new.payout_method is distinct from old.payout_method or
    new.preferred_currency is distinct from old.preferred_currency or
    new.country_code is distinct from old.country_code or
    new.encrypted_details is distinct from old.encrypted_details
  ) and exists (
    select 1 from public.talent_partner_payouts p
    where p.payout_profile_id=old.id
      and p.payout_profile_version=old.details_version
      and p.status='Ready'
  ) then
    raise exception 'Payout details cannot be changed while a payout using this verified profile is ready for payment.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_talent_partner_payout_profile_change_guard on public.talent_partner_payout_profiles;
create trigger trg_talent_partner_payout_profile_change_guard
before update of payout_method,preferred_currency,country_code,encrypted_details
on public.talent_partner_payout_profiles
for each row execute function public.talent_partner_payout_profile_change_guard();

-- Keep the existing RPC signature for frontend/backward compatibility, but payout details are now
-- exclusively managed by talent_partner_submit_payout_profile() so they are encrypted and verified.
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
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_row public.talent_partner_profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;

  update public.talent_partner_profiles
  set company_name=nullif(left(trim(coalesce(p_company_name,'')),200),''),
      website_url=nullif(left(trim(coalesce(p_website_url,'')),1000),''),
      promotion_channels=coalesce(p_promotion_channels,promotion_channels),
      -- Deliberately ignore p_payout_method / p_payout_email / p_preferred_currency here.
      -- Raw payout details must pass through the encrypted payout-profile workflow.
      updated_at=now()
  where user_id=v_uid
  returning * into v_row;

  if not found then raise exception 'Talent Partner profile not found.'; end if;
  return to_jsonb(v_row)-'internal_notes';
end;
$$;

revoke all privileges on function public.talent_partner_payout_profile_change_guard() from public, anon, authenticated;
revoke all privileges on function public.talent_partner_update_my_profile(text,text,text[],text,text,text) from public, anon, authenticated;
grant execute on function public.talent_partner_update_my_profile(text,text,text[],text,text,text) to authenticated;

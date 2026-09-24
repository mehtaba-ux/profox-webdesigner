-- Cover Talent Partner payout onboarding foreign keys used by Admin verification/audit lookups.
create index if not exists idx_talent_partner_payout_profiles_verified_by
  on public.talent_partner_payout_profiles(verified_by)
  where verified_by is not null;

create index if not exists idx_talent_partner_payout_profiles_rejected_by
  on public.talent_partner_payout_profiles(rejected_by)
  where rejected_by is not null;

create index if not exists idx_talent_partner_payout_profile_events_actor
  on public.talent_partner_payout_profile_events(actor_user_id)
  where actor_user_id is not null;

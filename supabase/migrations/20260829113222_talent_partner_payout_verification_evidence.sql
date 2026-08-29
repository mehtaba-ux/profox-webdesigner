-- Require evidence before payout-profile verification and route payout notifications to the secure setup surface.

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
  if nullif(trim(coalesce(p_payout_method,'')),'') is not null or nullif(trim(coalesce(p_payout_email,'')),'') is not null then
    raise exception 'Use the secure payout setup page after a reward is approved. Payout account details are not stored in the general profile.';
  end if;

  update public.talent_partner_profiles
  set company_name=nullif(left(trim(coalesce(p_company_name,'')),200),''),
      website_url=nullif(left(trim(coalesce(p_website_url,'')),1000),''),
      promotion_channels=coalesce(p_promotion_channels,promotion_channels),
      updated_at=now()
  where user_id=v_uid
  returning * into v_row;

  if not found then raise exception 'Talent Partner profile not found.'; end if;
  return to_jsonb(v_row)-'internal_notes';
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
  v_reference text:=trim(coalesce(p_verification_reference,''));
  v_current public.talent_partner_payout_profiles%rowtype;
  v_row public.talent_partner_payout_profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if v_decision not in ('Verified','Rejected') then raise exception 'Decision must be Verified or Rejected.'; end if;
  select * into v_current from public.talent_partner_payout_profiles where id=p_profile_id for update;
  if not found then raise exception 'Payout profile not found.'; end if;

  if v_decision='Verified' then
    if length(v_reference)<5 then raise exception 'A verification reference or review note is required.'; end if;
    if not exists(
      select 1 from public.talent_partner_payout_profile_events e
      where e.payout_profile_id=v_current.id
        and e.event_type='Revealed'
        and e.actor_user_id=auth.uid()
        and e.details_version=v_current.details_version
        and e.created_at>=now()-interval '30 minutes'
    ) then
      raise exception 'Reveal and review the current payout details before verifying them.';
    end if;
  elsif length(v_reason)<5 then
    raise exception 'A rejection reason is required.';
  end if;

  update public.talent_partner_payout_profiles
  set status=v_decision,
      verified_at=case when v_decision='Verified' then now() else null end,
      verified_by=case when v_decision='Verified' then auth.uid() else null end,
      verification_reference=case when v_decision='Verified' then left(v_reference,300) else null end,
      rejected_at=case when v_decision='Rejected' then now() else null end,
      rejected_by=case when v_decision='Rejected' then auth.uid() else null end,
      rejection_reason=case when v_decision='Rejected' then left(v_reason,2000) else null end,
      updated_at=now()
  where id=p_profile_id
  returning * into v_row;

  insert into public.talent_partner_payout_profile_events(
    payout_profile_id,partner_user_id,event_type,actor_user_id,actor_type,details_version,masked_snapshot,reason
  ) values(
    v_row.id,v_row.partner_user_id,v_decision,auth.uid(),'admin',v_row.details_version,v_row.masked_details,
    case when v_decision='Verified' then left(v_reference,1000) else left(v_reason,1000) end
  );

  perform public.talent_partner_notify(
    v_row.partner_user_id,'payout',case when v_decision='Verified' then 'Payout method verified' else 'Payout details need attention' end,
    case when v_decision='Verified' then 'Your payout method is verified. Approved rewards can now be included in the next payout batch.'
         else 'Your payout details could not be verified: '||left(v_reason,1000)||'. Please update and resubmit them.' end,
    '/talent-partner/payout-setup','tp-payout-profile-review:'||v_row.id::text||':'||v_row.details_version::text||':'||lower(v_decision)
  );

  return jsonb_build_object('success',true,'status',v_row.status,'profileId',v_row.id,'detailsVersion',v_row.details_version);
end;
$$;

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
        'A reward has been approved. Add or verify your payout details before it can be included in a payout batch.',
        '/talent-partner/payout-setup','tp-payout-setup-required:'||new.partner_user_id::text
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all privileges on function public.talent_partner_update_my_profile(text,text,text[],text,text,text) from public, anon, authenticated;
revoke all privileges on function public.admin_review_talent_partner_payout_profile(uuid,text,text,text) from public, anon, authenticated;
revoke all privileges on function public.talent_partner_reward_payout_setup_notification() from public, anon, authenticated;
grant execute on function public.talent_partner_update_my_profile(text,text,text[],text,text,text) to authenticated;
grant execute on function public.admin_review_talent_partner_payout_profile(uuid,text,text,text) to authenticated;

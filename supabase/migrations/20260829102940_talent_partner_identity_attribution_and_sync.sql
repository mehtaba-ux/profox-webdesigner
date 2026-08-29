-- ProFox Talent Partner Program: identity, attribution and applicant synchronization.

create or replace function public.protect_user_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_sales_invite text:=coalesce(current_setting('profox.sales_candidate_invite_rpc',true),'');
  v_content_invite text:=coalesce(current_setting('profox.content_writer_invite_rpc',true),'');
  v_content_activation text:=coalesce(current_setting('profox.content_writer_activation_rpc',true),'');
  v_customer_portal_claim text:=coalesce(current_setting('profox.customer_portal_claim_rpc',true),'');
  v_training_progress_sync text:=coalesce(current_setting('profox.training_progress_sync',true),'');
  v_talent_partner text:=coalesce(current_setting('profox.talent_partner_profile_rpc',true),'');
begin
  if public.is_admin()
     or v_sales_invite='1'
     or v_content_invite='1'
     or v_content_activation='1'
     or v_customer_portal_claim='1'
     or v_training_progress_sync='1'
     or v_talent_partner='1'
  then
    return new;
  end if;
  if auth.uid() is null or old.id<>auth.uid() then
    raise exception 'Unauthorized profile update.';
  end if;
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.department is distinct from old.department
     or new.manager is distinct from old.manager
     or new.onboarding_status is distinct from old.onboarding_status
     or new.onboarding_progress is distinct from old.onboarding_progress
     or new.email is distinct from old.email
  then
    raise exception 'Privileged profile fields may only be changed by an authorized workflow.';
  end if;
  return new;
end;
$$;

create or replace function public.service_professional_mailbox_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists(
    select 1
    from public.user_profiles p
    where p.id=p_user_id
      and lower(coalesce(p.status,''))='active'
      and lower(coalesce(p.onboarding_status,''))='completed'
      and lower(coalesce(p.role,'')) not in ('','customer','client','pending','talent_partner')
  );
$$;

create or replace function public.request_talent_partner_account(
  p_full_name text,
  p_terms_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_profile public.user_profiles%rowtype;
  v_settings public.talent_partner_program_settings%rowtype;
  v_partner public.talent_partner_profiles%rowtype;
  v_initial_status text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_settings from public.talent_partner_program_settings where id='default';
  if not found or not v_settings.enabled then
    raise exception 'The Talent Partner program is not currently accepting registrations.';
  end if;
  select * into v_profile from public.user_profiles where id=v_uid for update;
  if not found then raise exception 'User profile not found.'; end if;
  if v_profile.role not in ('pending','talent_partner') then
    raise exception 'This account already belongs to another ProFox workspace.';
  end if;

  v_initial_status:=case when v_settings.require_admin_approval then 'Pending' else 'Active' end;

  insert into public.talent_partner_profiles(
    user_id,partner_code,status,terms_version,terms_accepted_at,preferred_currency,approved_at
  ) values(
    v_uid,public.talent_partner_new_code(),v_initial_status,
    coalesce(nullif(trim(p_terms_version),''),v_settings.terms_version),now(),v_settings.default_currency,
    case when v_initial_status='Active' then now() else null end
  )
  on conflict (user_id) do update set updated_at=now()
  returning * into v_partner;

  perform set_config('profox.talent_partner_profile_rpc','1',true);
  update public.user_profiles
  set full_name=coalesce(nullif(trim(p_full_name),''),full_name),
      role='talent_partner',
      department='General',
      status=case when v_partner.status='Active' then 'active' else case when v_partner.status in ('Suspended','Closed') then 'inactive' else 'pending' end end,
      onboarding_status='completed',
      onboarding_progress=100,
      updated_at=now()
  where id=v_uid;

  return jsonb_build_object('success',true,'partnerCode',v_partner.partner_code,'status',v_partner.status);
end;
$$;

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
declare v_uid uuid:=auth.uid(); v_row public.talent_partner_profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  update public.talent_partner_profiles
  set company_name=nullif(left(trim(coalesce(p_company_name,'')),200),''),
      website_url=nullif(left(trim(coalesce(p_website_url,'')),1000),''),
      promotion_channels=coalesce(p_promotion_channels,promotion_channels),
      payout_method=nullif(left(trim(coalesce(p_payout_method,'')),80),''),
      payout_email=nullif(left(lower(trim(coalesce(p_payout_email,''))),320),''),
      preferred_currency=coalesce(nullif(upper(left(trim(coalesce(p_preferred_currency,'')),3)),''),preferred_currency),
      updated_at=now()
  where user_id=v_uid
  returning * into v_row;
  if not found then raise exception 'Talent Partner profile not found.'; end if;
  return to_jsonb(v_row)-'internal_notes';
end;
$$;

create or replace function public.public_track_talent_partner_visit(
  p_partner_code text,
  p_job_slug text,
  p_session_id text,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_partner public.talent_partner_profiles%rowtype;
  v_job public.career_jobs%rowtype;
  v_settings public.talent_partner_program_settings%rowtype;
  v_visit_id uuid;
  v_session text:=left(trim(coalesce(p_session_id,'')),120);
begin
  select * into v_settings from public.talent_partner_program_settings where id='default';
  if not found or not v_settings.enabled then return jsonb_build_object('success',false,'reason','disabled'); end if;
  if v_session='' then return jsonb_build_object('success',false,'reason','session_required'); end if;

  select * into v_partner
  from public.talent_partner_profiles
  where upper(partner_code)=upper(trim(coalesce(p_partner_code,''))) and status='Active';
  if not found then return jsonb_build_object('success',false,'reason','invalid_partner'); end if;

  if nullif(trim(coalesce(p_job_slug,'')),'') is not null then
    select * into v_job
    from public.career_jobs
    where slug=trim(p_job_slug)
      and status='Published'
      and (closes_at is null or closes_at>now())
    limit 1;
    if not found then return jsonb_build_object('success',false,'reason','invalid_job'); end if;
  end if;

  select id into v_visit_id
  from public.talent_partner_visits
  where partner_user_id=v_partner.user_id
    and session_id=v_session
    and career_job_id is not distinct from v_job.id
    and occurred_at>now()-interval '20 seconds'
  order by occurred_at desc
  limit 1;

  if v_visit_id is null then
    insert into public.talent_partner_visits(
      partner_user_id,career_job_id,referral_code,session_id,
      utm_source,utm_medium,utm_campaign,utm_content,referrer_host,landing_path,
      device_category,visitor_timezone,visitor_locale
    ) values(
      v_partner.user_id,v_job.id,v_partner.partner_code,v_session,
      nullif(left(trim(coalesce(p_context->>'utmSource','')),200),''),
      nullif(left(trim(coalesce(p_context->>'utmMedium','')),200),''),
      nullif(left(trim(coalesce(p_context->>'utmCampaign','')),300),''),
      nullif(left(trim(coalesce(p_context->>'utmContent','')),300),''),
      nullif(left(lower(trim(coalesce(p_context->>'referrerHost',''))),255),''),
      nullif(left(trim(coalesce(p_context->>'landingPath','')),1000),''),
      nullif(left(trim(coalesce(p_context->>'deviceCategory','')),40),''),
      nullif(left(trim(coalesce(p_context->>'timezone','')),100),''),
      nullif(left(trim(coalesce(p_context->>'locale','')),40),'')
    ) returning id into v_visit_id;
  end if;

  return jsonb_build_object(
    'success',true,
    'visitId',v_visit_id,
    'partnerCode',v_partner.partner_code,
    'attributionWindowDays',v_settings.attribution_window_days
  );
end;
$$;

create or replace function public.public_claim_talent_partner_application(
  p_application_reference text,
  p_email text,
  p_partner_code text,
  p_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_visit public.talent_partner_visits%rowtype;
  v_settings public.talent_partner_program_settings%rowtype;
  v_partner_email text;
  v_referral_id uuid;
begin
  select * into v_settings from public.talent_partner_program_settings where id='default';
  if not found or not v_settings.enabled then return jsonb_build_object('success',false,'reason','disabled'); end if;

  select * into v_app
  from public.applicants
  where application_reference=trim(coalesce(p_application_reference,''))
    and lower(trim(email))=lower(trim(coalesce(p_email,'')))
  for update;
  if not found then return jsonb_build_object('success',false,'reason','application_not_found'); end if;
  if v_app.created_at < now()-interval '2 hours' then return jsonb_build_object('success',false,'reason','claim_window_closed'); end if;

  select v.* into v_visit
  from public.talent_partner_visits v
  join public.talent_partner_profiles tp on tp.user_id=v.partner_user_id and tp.status='Active'
  where v.session_id=left(trim(coalesce(p_session_id,'')),120)
    and v.career_job_id=v_app.career_job_id
    and v.occurred_at >= now()-(v_settings.attribution_window_days||' days')::interval
  order by v.occurred_at asc
  limit 1;
  if not found then return jsonb_build_object('success',false,'reason','valid_first_touch_not_found'); end if;

  select email into v_partner_email from public.user_profiles where id=v_visit.partner_user_id;
  if lower(trim(coalesce(v_partner_email,'')))=lower(trim(coalesce(v_app.email,''))) then
    return jsonb_build_object('success',false,'reason','self_referral_blocked');
  end if;

  select id into v_referral_id from public.talent_partner_referrals where applicant_id=v_app.id;
  if v_referral_id is not null then
    return jsonb_build_object('success',true,'referralId',v_referral_id,'alreadyAttributed',true);
  end if;

  insert into public.talent_partner_referrals(
    partner_user_id,applicant_id,career_job_id,first_visit_id,referral_code_snapshot,
    attribution_expires_at,referred_user_id,status,activated_at
  ) values(
    v_visit.partner_user_id,v_app.id,v_app.career_job_id,v_visit.id,v_visit.referral_code,
    v_visit.occurred_at+(v_settings.attribution_window_days||' days')::interval,
    v_app.linked_user_id,
    case when v_app.stage='Activated' then 'Activated' else 'Applicant' end,
    case when v_app.stage='Activated' then coalesce(v_app.stage_entered_at,v_app.updated_at,now()) else null end
  ) returning id into v_referral_id;

  insert into public.applicant_events(
    applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata,occurred_at
  ) values(
    v_app.id,'Attribution','talent_partner_referral','Talent Partner referral attributed',
    'First valid Talent Partner referral attribution was locked for this application.',
    'system','talent_partner_referrals',v_referral_id,
    jsonb_build_object('partnerUserId',v_visit.partner_user_id,'careerJobId',v_app.career_job_id,'firstVisitId',v_visit.id),now()
  );

  perform public.talent_partner_notify(
    v_visit.partner_user_id,'application','New referred application',
    'A candidate applied through one of your Talent Partner links. Their recruitment progress is now tracked in your dashboard.',
    '/talent-partner','tp-application:'||v_referral_id::text
  );

  return jsonb_build_object('success',true,'referralId',v_referral_id,'alreadyAttributed',false);
end;
$$;

create or replace function public.talent_partner_sync_referral_from_applicant()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_ref public.talent_partner_referrals%rowtype;
begin
  select * into v_ref from public.talent_partner_referrals where applicant_id=new.id for update;
  if not found then return new; end if;

  if new.linked_user_id is not null and v_ref.referred_user_id is distinct from new.linked_user_id then
    update public.talent_partner_referrals set referred_user_id=new.linked_user_id,updated_at=now() where id=v_ref.id;
  end if;

  if new.stage='Activated' and old.stage is distinct from 'Activated' then
    update public.talent_partner_referrals
    set status='Activated',referred_user_id=coalesce(new.linked_user_id,referred_user_id),activated_at=coalesce(new.stage_entered_at,now()),closed_at=null,updated_at=now()
    where id=v_ref.id;
    perform public.talent_partner_notify(
      v_ref.partner_user_id,'activation','Your referral was activated',
      'A referred candidate completed the ProFox recruitment process and has been activated. Performance rewards will follow the configured job reward plan.',
      '/talent-partner','tp-activation:'||v_ref.id::text
    );
  elsif coalesce(trim(new.refusal_reason),'')<>'' and coalesce(trim(old.refusal_reason),'')='' then
    update public.talent_partner_referrals set status='Closed',closed_at=now(),updated_at=now() where id=v_ref.id and status<>'Retained';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_talent_partner_sync_referral_from_applicant on public.applicants;
create trigger trg_talent_partner_sync_referral_from_applicant
after update of stage,linked_user_id,refusal_reason on public.applicants
for each row execute function public.talent_partner_sync_referral_from_applicant();

create or replace function public.talent_partner_event_rule(
  p_plan public.talent_partner_reward_plans,
  p_rank integer,
  p_eligible_amount numeric
)
returns jsonb
language plpgsql
stable
set search_path=public,pg_temp
as $$
declare v_rule jsonb; v_kind text; v_rate numeric:=0; v_fixed numeric:=0; v_amount numeric:=0;
begin
  select value into v_rule
  from jsonb_array_elements(coalesce(p_plan.event_rewards,'[]'::jsonb)) value
  where coalesce((value->>'rank')::integer,0)=p_rank
  limit 1;
  if v_rule is null then return jsonb_build_object('configured',false,'amount',0); end if;
  v_kind:=case when lower(coalesce(v_rule->>'kind','percent'))='fixed' then 'fixed' else 'percent' end;
  begin v_rate:=greatest(0,least(100,coalesce((v_rule->>'ratePercent')::numeric,0))); exception when others then v_rate:=0; end;
  begin v_fixed:=greatest(0,coalesce((v_rule->>'fixedAmount')::numeric,0)); exception when others then v_fixed:=0; end;
  v_amount:=case when v_kind='fixed' then v_fixed else round(greatest(0,coalesce(p_eligible_amount,0))*v_rate/100.0,2) end;
  return jsonb_build_object('configured',v_amount>0,'kind',v_kind,'ratePercent',v_rate,'fixedAmount',v_fixed,'amount',v_amount,'raw',v_rule);
end;
$$;
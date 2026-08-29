-- ProFox Talent Partner Program: portal dashboard, privacy-safe recruitment status, RLS and integrity.

alter table public.talent_partner_program_settings enable row level security;
alter table public.talent_partner_profiles enable row level security;
alter table public.talent_partner_reward_plans enable row level security;
alter table public.talent_partner_visits enable row level security;
alter table public.talent_partner_referrals enable row level security;
alter table public.talent_partner_qualifying_projects enable row level security;
alter table public.talent_partner_salary_transitions enable row level security;
alter table public.talent_partner_payout_batches enable row level security;
alter table public.talent_partner_payouts enable row level security;
alter table public.talent_partner_reward_entries enable row level security;
alter table public.talent_partner_notifications enable row level security;
alter table public.talent_partner_resources enable row level security;

-- Keep the performance model globally capped at three qualifying events.
alter table public.talent_partner_reward_plans drop constraint if exists talent_partner_reward_plans_qualifying_event_count_check;
alter table public.talent_partner_reward_plans add constraint talent_partner_reward_plans_qualifying_event_count_check check (qualifying_event_count between 1 and 3);
alter table public.talent_partner_qualifying_projects drop constraint if exists talent_partner_qualifying_projects_qualifying_rank_check;
alter table public.talent_partner_qualifying_projects add constraint talent_partner_qualifying_projects_qualifying_rank_check check (qualifying_rank between 1 and 3);
alter table public.talent_partner_reward_entries drop constraint if exists talent_partner_reward_entries_event_rank_check;
alter table public.talent_partner_reward_entries add constraint talent_partner_reward_entries_event_rank_check check (event_rank is null or event_rank between 1 and 3);

create or replace function public.talent_partner_safe_stage(p_stage text, p_refusal_reason text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(trim(p_refusal_reason),'')<>'' then 'Closed'
    when p_stage='Activated' then 'Activated'
    when p_stage in ('Final Approval','Ready for System Access') then 'Final approval'
    when p_stage in ('One-Day Training','Design Academy','Developer Academy') then 'Training'
    when p_stage in ('Selected','Agreement Pending') then 'Conditional selection'
    when p_stage in ('Shortlisted','Sales Assessment','Technical Assessment','Design Assessment','Lead Research Test','Development Practical','Figma Practical','CRM Assessment','Technical Interview','Design Interview') then 'Assessment'
    when p_stage in ('Initial Screening','Video Review','Video Pending','Code & Portfolio Review','Portfolio Review') then 'Under review'
    else 'Application received'
  end;
$$;

create or replace function public.talent_partner_get_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid(); v_profile jsonb; v_stats jsonb; v_jobs jsonb; v_refs jsonb; v_rewards jsonb; v_payouts jsonb; v_notifications jsonb; v_resources jsonb; v_sources jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not exists(select 1 from public.talent_partner_profiles where user_id=v_uid) then raise exception 'Talent Partner profile not found.'; end if;

  select jsonb_build_object(
    'userId',tp.user_id,'partnerCode',tp.partner_code,'status',tp.status,'companyName',tp.company_name,'websiteUrl',tp.website_url,
    'promotionChannels',tp.promotion_channels,'payoutMethod',tp.payout_method,'payoutEmail',tp.payout_email,'preferredCurrency',tp.preferred_currency,
    'fullName',u.full_name,'email',u.email,'createdAt',tp.created_at
  ) into v_profile
  from public.talent_partner_profiles tp join public.user_profiles u on u.id=tp.user_id where tp.user_id=v_uid;

  select jsonb_build_object(
    'visits',(select count(*) from public.talent_partner_visits where partner_user_id=v_uid),
    'uniqueVisitors',(select count(distinct session_id) from public.talent_partner_visits where partner_user_id=v_uid),
    'applications',(select count(*) from public.talent_partner_referrals where partner_user_id=v_uid),
    'activatedHires',(select count(*) from public.talent_partner_referrals where partner_user_id=v_uid and status in ('Activated','Retained')),
    'retainedHires',(select count(*) from public.talent_partner_referrals where partner_user_id=v_uid and status='Retained'),
    'pendingEarnings',(select coalesce(sum(reward_amount),0) from public.talent_partner_reward_entries where partner_user_id=v_uid and status='Pending'),
    'approvedEarnings',(select coalesce(sum(reward_amount),0) from public.talent_partner_reward_entries where partner_user_id=v_uid and status='Approved'),
    'paidEarnings',(select coalesce(sum(reward_amount),0) from public.talent_partner_reward_entries where partner_user_id=v_uid and status='Paid')
  ) into v_stats;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',j.id,'slug',j.slug,'title',j.title,'shortSummary',j.short_summary,'department',j.department,'location',j.location,'engagementType',j.engagement_type,
    'rewardPlan',case when rp.id is null then null else jsonb_build_object(
      'enabled',rp.enabled,'rewardModel',rp.reward_model,'qualifyingEventCount',rp.qualifying_event_count,'eventRewards',rp.event_rewards,
      'retentionEnabled',rp.retention_enabled,'retentionMonths',rp.retention_months,'retentionRewardKind',rp.retention_reward_kind,
      'retentionRatePercent',rp.retention_rate_percent,'retentionFixedAmount',rp.retention_fixed_amount,'currency',rp.currency
    ) end
  ) order by j.featured desc,j.display_order,j.published_at desc),'[]'::jsonb)
  into v_jobs
  from public.career_jobs j left join public.talent_partner_reward_plans rp on rp.career_job_id=j.id
  where j.status='Published' and (j.closes_at is null or j.closes_at>now());

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'applicationReference',a.application_reference,
    'candidateName',case when position(' ' in trim(a.full_name))>0 then split_part(trim(a.full_name),' ',1)||' '||left(split_part(trim(a.full_name),' ',2),1)||'.' else trim(a.full_name) end,
    'jobTitle',j.title,'jobSlug',j.slug,'status',public.talent_partner_safe_stage(a.stage,a.refusal_reason),
    'attributedAt',r.attributed_at,'activatedAt',r.activated_at,'retentionEligibleAt',case when r.activated_at is not null and rp.retention_enabled then r.activated_at+make_interval(months=>rp.retention_months) else null end,
    'performanceRewards',(select coalesce(jsonb_agg(jsonb_build_object('type',e.event_type,'rank',e.event_rank,'amount',e.reward_amount,'currency',e.currency,'status',e.status,'createdAt',e.created_at) order by case when e.event_type='retention' then 99 else coalesce(e.event_rank,50) end),'[]'::jsonb) from public.talent_partner_reward_entries e where e.referral_id=r.id),
    'salaryTransition',(select jsonb_build_object('status',st.status,'effectiveDate',st.effective_date,'qualifyingDate',st.qualifying_date) from public.talent_partner_salary_transitions st where st.referral_id=r.id)
  ) order by r.attributed_at desc),'[]'::jsonb)
  into v_refs
  from public.talent_partner_referrals r
  join public.applicants a on a.id=r.applicant_id
  join public.career_jobs j on j.id=r.career_job_id
  left join public.talent_partner_reward_plans rp on rp.career_job_id=r.career_job_id
  where r.partner_user_id=v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'eventType',e.event_type,'eventRank',e.event_rank,'eligibleAmount',e.eligible_amount,'currency',e.currency,
    'rewardAmount',e.reward_amount,'status',e.status,'availableAt',e.available_at,'createdAt',e.created_at,'jobTitle',j.title
  ) order by e.created_at desc),'[]'::jsonb)
  into v_rewards
  from public.talent_partner_reward_entries e join public.career_jobs j on j.id=e.career_job_id where e.partner_user_id=v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'batchNumber',b.batch_number,'amount',p.amount,'currency',p.currency,'status',p.status,
    'transactionId',p.transaction_id,'paidAt',p.paid_at,'createdAt',p.created_at
  ) order by p.created_at desc),'[]'::jsonb)
  into v_payouts
  from public.talent_partner_payouts p join public.talent_partner_payout_batches b on b.id=p.payout_batch_id where p.partner_user_id=v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',n.id,'type',n.type,'title',n.title,'message',n.message,'actionPath',n.action_path,'readAt',n.read_at,'createdAt',n.created_at
  ) order by n.created_at desc),'[]'::jsonb)
  into v_notifications from (select * from public.talent_partner_notifications where partner_user_id=v_uid order by created_at desc limit 50) n;

  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'jobId',x.career_job_id,'title',x.title,'type',x.resource_type,'content',x.content,'url',x.resource_url) order by x.sort_order,x.created_at),'[]'::jsonb)
  into v_resources from public.talent_partner_resources x where x.enabled=true;

  select coalesce(jsonb_agg(jsonb_build_object('source',source_key,'visits',visits,'uniqueVisitors',unique_visitors) order by visits desc),'[]'::jsonb)
  into v_sources
  from (
    select coalesce(nullif(utm_source,''),nullif(referrer_host,''),'Direct') source_key,count(*) visits,count(distinct session_id) unique_visitors
    from public.talent_partner_visits where partner_user_id=v_uid group by 1 order by visits desc limit 20
  ) s;

  return jsonb_build_object('profile',v_profile,'stats',v_stats,'jobs',v_jobs,'referrals',v_refs,'rewards',v_rewards,'payouts',v_payouts,'notifications',v_notifications,'resources',v_resources,'sourceBreakdown',v_sources);
end;
$$;

create or replace function public.talent_partner_mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  update public.talent_partner_notifications set read_at=coalesce(read_at,now()) where id=p_notification_id and partner_user_id=auth.uid();
end;
$$;

-- Drop and recreate policies to make the migration reproducible.
do $$
declare r record;
begin
  for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename like 'talent_partner_%'
  loop execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename); end loop;
end $$;

create policy "Talent Partner settings admin" on public.talent_partner_program_settings for all using (public.is_admin()) with check (public.is_admin());
create policy "Talent Partner profiles admin read" on public.talent_partner_profiles for select using (public.is_admin());
create policy "Talent Partner profiles admin write" on public.talent_partner_profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "Talent Partner reward plans admin" on public.talent_partner_reward_plans for all using (public.is_admin()) with check (public.is_admin());
create policy "Talent Partner visits admin" on public.talent_partner_visits for all using (public.is_admin()) with check (public.is_admin());
create policy "Talent Partner referrals admin" on public.talent_partner_referrals for all using (public.is_admin()) with check (public.is_admin());
create policy "Talent Partner qualifying projects admin" on public.talent_partner_qualifying_projects for all using (public.is_admin()) with check (public.is_admin());
create policy "Talent Partner salary transitions admin" on public.talent_partner_salary_transitions for all using (public.is_admin()) with check (public.is_admin());
create policy "Talent Partner payout batches admin" on public.talent_partner_payout_batches for all using (public.is_admin()) with check (public.is_admin());
create policy "Talent Partner payouts admin" on public.talent_partner_payouts for all using (public.is_admin()) with check (public.is_admin());
create policy "Talent Partner read payouts" on public.talent_partner_payouts for select using (partner_user_id=auth.uid());
create policy "Talent Partner rewards admin" on public.talent_partner_reward_entries for all using (public.is_admin()) with check (public.is_admin());
create policy "Talent Partner read rewards" on public.talent_partner_reward_entries for select using (partner_user_id=auth.uid());
create policy "Talent Partner notifications admin read" on public.talent_partner_notifications for select using (public.is_admin());
create policy "Talent Partner notifications admin write" on public.talent_partner_notifications for all using (public.is_admin()) with check (public.is_admin());
create policy "Talent Partner read notifications" on public.talent_partner_notifications for select using (partner_user_id=auth.uid());
create policy "Talent Partner resources admin" on public.talent_partner_resources for all using (public.is_admin()) with check (public.is_admin());
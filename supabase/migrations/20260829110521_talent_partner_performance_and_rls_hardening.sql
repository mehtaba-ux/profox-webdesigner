-- Talent Partner feature-specific performance hardening.
-- Add covering indexes for new foreign keys and remove duplicate permissive SELECT policy evaluation.

create index if not exists talent_partner_notifications_partner_idx on public.talent_partner_notifications(partner_user_id);
create index if not exists talent_partner_payout_batches_created_by_idx on public.talent_partner_payout_batches(created_by);
create index if not exists talent_partner_payouts_partner_idx on public.talent_partner_payouts(partner_user_id);
create index if not exists talent_partner_payouts_paid_by_idx on public.talent_partner_payouts(paid_by) where paid_by is not null;
create index if not exists talent_partner_profiles_approved_by_idx on public.talent_partner_profiles(approved_by) where approved_by is not null;
create index if not exists talent_partner_settings_updated_by_idx on public.talent_partner_program_settings(updated_by) where updated_by is not null;
create index if not exists talent_partner_projects_project_idx on public.talent_partner_qualifying_projects(project_id);
create index if not exists talent_partner_projects_worker_idx on public.talent_partner_qualifying_projects(worker_user_id);
create index if not exists talent_partner_projects_approved_by_idx on public.talent_partner_qualifying_projects(approved_by);
create index if not exists talent_partner_referrals_job_idx on public.talent_partner_referrals(career_job_id);
create index if not exists talent_partner_referrals_first_visit_idx on public.talent_partner_referrals(first_visit_id) where first_visit_id is not null;
create index if not exists talent_partner_referrals_overridden_by_idx on public.talent_partner_referrals(overridden_by) where overridden_by is not null;
create index if not exists talent_partner_resources_job_idx on public.talent_partner_resources(career_job_id) where career_job_id is not null;
create index if not exists talent_partner_resources_created_by_idx on public.talent_partner_resources(created_by) where created_by is not null;
create index if not exists talent_partner_rewards_job_idx on public.talent_partner_reward_entries(career_job_id);
create index if not exists talent_partner_rewards_approved_by_idx on public.talent_partner_reward_entries(approved_by) where approved_by is not null;
create index if not exists talent_partner_rewards_payout_idx on public.talent_partner_reward_entries(payout_id) where payout_id is not null;
create index if not exists talent_partner_rewards_source_payment_idx on public.talent_partner_reward_entries(source_payment_id) where source_payment_id is not null;
create index if not exists talent_partner_rewards_source_project_idx on public.talent_partner_reward_entries(source_project_id) where source_project_id is not null;
create index if not exists talent_partner_rewards_source_quotation_idx on public.talent_partner_reward_entries(source_quotation_id) where source_quotation_id is not null;
create index if not exists talent_partner_rewards_source_salary_idx on public.talent_partner_reward_entries(source_salary_transition_id) where source_salary_transition_id is not null;
create index if not exists talent_partner_plans_updated_by_idx on public.talent_partner_reward_plans(updated_by) where updated_by is not null;
create index if not exists talent_partner_salary_approved_by_idx on public.talent_partner_salary_transitions(approved_by) where approved_by is not null;
create index if not exists talent_partner_salary_source_review_idx on public.talent_partner_salary_transitions(source_review_id) where source_review_id is not null;
create index if not exists talent_partner_salary_worker_idx on public.talent_partner_salary_transitions(worker_user_id);

do $$
declare r record;
begin
  for r in
    select schemaname,tablename,policyname
    from pg_policies
    where schemaname='public' and tablename like 'talent_partner_%'
  loop
    execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop;
end $$;

create policy talent_partner_settings_admin on public.talent_partner_program_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy talent_partner_profiles_select on public.talent_partner_profiles
  for select to authenticated using (public.is_admin());
create policy talent_partner_profiles_admin_insert on public.talent_partner_profiles
  for insert to authenticated with check (public.is_admin());
create policy talent_partner_profiles_admin_update on public.talent_partner_profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy talent_partner_profiles_admin_delete on public.talent_partner_profiles
  for delete to authenticated using (public.is_admin());

create policy talent_partner_plans_admin on public.talent_partner_reward_plans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy talent_partner_visits_admin on public.talent_partner_visits
  for select to authenticated using (public.is_admin());
create policy talent_partner_referrals_admin on public.talent_partner_referrals
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy talent_partner_projects_admin on public.talent_partner_qualifying_projects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy talent_partner_salary_admin on public.talent_partner_salary_transitions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy talent_partner_batches_admin on public.talent_partner_payout_batches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy talent_partner_payouts_select on public.talent_partner_payouts
  for select to authenticated using (partner_user_id=(select auth.uid()) or public.is_admin());
create policy talent_partner_payouts_admin_insert on public.talent_partner_payouts
  for insert to authenticated with check (public.is_admin());
create policy talent_partner_payouts_admin_update on public.talent_partner_payouts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy talent_partner_payouts_admin_delete on public.talent_partner_payouts
  for delete to authenticated using (public.is_admin());

create policy talent_partner_rewards_select on public.talent_partner_reward_entries
  for select to authenticated using (partner_user_id=(select auth.uid()) or public.is_admin());
create policy talent_partner_rewards_admin_insert on public.talent_partner_reward_entries
  for insert to authenticated with check (public.is_admin());
create policy talent_partner_rewards_admin_update on public.talent_partner_reward_entries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy talent_partner_rewards_admin_delete on public.talent_partner_reward_entries
  for delete to authenticated using (public.is_admin());

create policy talent_partner_notifications_select on public.talent_partner_notifications
  for select to authenticated using (partner_user_id=(select auth.uid()) or public.is_admin());
create policy talent_partner_notifications_admin_insert on public.talent_partner_notifications
  for insert to authenticated with check (public.is_admin());
create policy talent_partner_notifications_admin_update on public.talent_partner_notifications
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy talent_partner_notifications_admin_delete on public.talent_partner_notifications
  for delete to authenticated using (public.is_admin());

create policy talent_partner_resources_admin on public.talent_partner_resources
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
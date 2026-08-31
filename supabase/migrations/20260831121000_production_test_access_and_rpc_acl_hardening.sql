-- Remove launch-time test access while preserving historical audit records.

create or replace function public.sales_academy_test_activation_allowed(p_applicant_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public','pg_temp'
as $$
  select false;
$$;

revoke all on function public.sales_academy_test_activation_allowed(uuid) from public,anon,authenticated,service_role;
revoke all on function public.sales_academy_test_bypass_active(uuid) from public,anon,authenticated,service_role;
revoke all on function public.admin_test_skip_sales_academy(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.admin_get_sales_academy_test_bypass_status(uuid) from public,anon,authenticated,service_role;

-- These functions already enforce is_admin() internally. Explicit ACLs also
-- keep them out of the anonymous PostgREST execution surface.
revoke all on function public.admin_revenue_distribution_dashboard() from public,anon;
revoke all on function public.admin_save_revenue_distribution_config(jsonb) from public,anon;
grant execute on function public.admin_revenue_distribution_dashboard() to authenticated;
grant execute on function public.admin_save_revenue_distribution_config(jsonb) to authenticated;

-- Synthetic accounts are retained for audit/history but cannot use staff RLS,
-- the Worker upload API, or role workspaces in production after launch.
select set_config('profox.sales_candidate_invite_rpc','1',true);
update public.user_profiles
set status='inactive',updated_at=now()
where lower(coalesce(email,'')) like '%@profoxwebdesigner.test'
  and status='active';
select set_config('profox.sales_candidate_invite_rpc','',true);

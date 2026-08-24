-- Break the user_profiles <-> applicants RLS recursion without widening recruitment access.
-- Cross-table profile visibility is evaluated in a narrowly-scoped SECURITY DEFINER helper
-- owned by postgres so the helper does not recursively invoke either table's RLS policies.

create or replace function public.content_recruitment_can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select public.content_recruitment_manager()
    and exists (
      select 1
      from public.applicants a
      join public.career_jobs j on j.id=a.career_job_id
      where a.linked_user_id=p_profile_id
        and j.application_type='content_writer'
    );
$$;

revoke all on function public.content_recruitment_can_view_profile(uuid) from public,anon;
grant execute on function public.content_recruitment_can_view_profile(uuid) to authenticated,service_role;

drop policy if exists user_profiles_content_recruitment_select on public.user_profiles;
create policy user_profiles_content_recruitment_select
on public.user_profiles
for select
to authenticated
using (public.content_recruitment_can_view_profile(id));

-- Keep applicant access job-scoped, but remove the direct user_profiles join from the policy.
-- content_recruitment_manager() is already SECURITY DEFINER and checks the caller's active role.
drop policy if exists applicants_content_manager_select on public.applicants;
create policy applicants_content_manager_select
on public.applicants
for select
to authenticated
using (
  public.is_admin()
  or (
    public.content_recruitment_manager()
    and exists (
      select 1
      from public.career_jobs j
      where j.id=applicants.career_job_id
        and j.application_type='content_writer'
    )
  )
);

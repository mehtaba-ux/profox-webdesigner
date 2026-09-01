-- Keep CRM authorization tied to Sales approval/onboarding and CRM-tour completion.
-- Professional mailbox activation / OAuth connection is enforced by the professional-mail
-- subsystem and must not revoke a previously approved seller's CRM access.

create or replace function public.crm_salesperson_access_ready(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select p_user_id is not null and exists (
    select 1
    from public.user_profiles p
    join public.sales_account_setup_state s on s.user_id=p.id
    where p.id=p_user_id
      and p.status='active'
      and p.role in ('sales','sales_rep','sales_team')
      and p.onboarding_status='completed'
      and coalesce(p.onboarding_progress,0)=100
      and s.crm_tour_completed_at is not null
      and coalesce(s.crm_tour_step,0)>=6
  );
$function$;

revoke all on function public.crm_salesperson_access_ready(uuid) from public,anon;
grant execute on function public.crm_salesperson_access_ready(uuid) to authenticated,service_role,postgres;

comment on function public.crm_salesperson_access_ready(uuid) is
'Returns true for an active, fully onboarded Sales user who completed the CRM tour. Professional-mail setup is enforced separately and does not gate CRM access.';

create or replace function public.sales_crm_access_ready()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.crm_salesperson_access_ready((select auth.uid()));
$function$;

revoke all on function public.sales_crm_access_ready() from public,anon;
grant execute on function public.sales_crm_access_ready() to authenticated,service_role,postgres;

comment on function public.sales_crm_access_ready() is
'Current-user CRM access check. Requires active Sales status, completed onboarding, and completed CRM tour; professional-mail setup is intentionally separate.';

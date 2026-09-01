create or replace function public.admin_list_professional_mailbox_canary_candidates()
returns table(
  user_id uuid,
  display_name text,
  email text,
  role text,
  department text,
  eligible boolean,
  mailbox_status text,
  work_email text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null or not exists(
    select 1
    from public.user_profiles p
    where p.id = v_admin
      and lower(coalesce(p.role, '')) = 'admin'
      and lower(coalesce(p.status, '')) = 'active'
  ) then
    raise exception 'Active Admin account required.';
  end if;

  return query
  select
    u.id,
    coalesce(nullif(btrim(u.full_name), ''), nullif(btrim(u.email), ''), 'Team member')::text,
    coalesce(u.email, '')::text,
    coalesce(u.role, '')::text,
    coalesce(u.department, '')::text,
    public.service_professional_mailbox_eligible(u.id),
    coalesce(a.mailbox_status, 'not_configured')::text,
    coalesce(a.work_email, '')::text
  from public.user_profiles u
  left join public.staff_professional_accounts a on a.user_id = u.id
  where lower(coalesce(u.status, '')) = 'active'
    and public.service_professional_mailbox_eligible(u.id)
  order by coalesce(nullif(btrim(u.full_name), ''), u.email), u.id;
end;
$function$;

-- Preserve existing quotation visibility rules without recursively invoking projects/project_team RLS.
-- All quotation writes remain RPC-controlled; this only replaces the existing authenticated SELECT predicates.

create or replace function public.can_view_quotation(p_quotation_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public','pg_temp'
as $$
  select exists (
    select 1
    from public.quotations q
    where q.id = p_quotation_id
      and (
        public.is_admin()
        or q.salesperson_id = auth.uid()
        or public.has_active_role(array['project_manager','site_manager'])
        or exists (
          select 1
          from public.projects p
          join public.project_team pt on pt.project_id = p.id
          where p.quotation_id = q.id
            and pt.user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.can_view_quotation(uuid) from public, anon;
grant execute on function public.can_view_quotation(uuid) to authenticated, service_role, postgres;

drop policy if exists quotations_select on public.quotations;
create policy quotations_select
on public.quotations
for select
to authenticated
using (public.can_view_quotation(id));

drop policy if exists quotation_items_select on public.quotation_items;
create policy quotation_items_select
on public.quotation_items
for select
to authenticated
using (public.can_view_quotation(quotation_id));

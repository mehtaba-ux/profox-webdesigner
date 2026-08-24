-- Cache the caller identity once per statement in the named sale-to-delivery
-- policies. Role predicates and row ownership semantics remain unchanged.
alter policy crm_leads_select on public.crm_leads
using (public.is_admin() or salesperson_id = (select auth.uid()));

alter policy crm_leads_insert on public.crm_leads
with check (public.is_admin() or (public.has_active_role(array['sales']::text[]) and salesperson_id = (select auth.uid())));

alter policy crm_leads_update on public.crm_leads
using (public.is_admin() or salesperson_id = (select auth.uid()))
with check (public.is_admin() or salesperson_id = (select auth.uid()));

alter policy crm_opportunities_select on public.crm_opportunities
using (public.is_admin() or salesperson_id = (select auth.uid()) or public.has_active_role(array['project_manager']::text[]));

alter policy crm_opportunities_insert on public.crm_opportunities
with check (public.is_admin() or (public.has_active_role(array['sales']::text[]) and salesperson_id = (select auth.uid())));

alter policy crm_opportunities_update on public.crm_opportunities
using (public.is_admin() or salesperson_id = (select auth.uid()))
with check (public.is_admin() or salesperson_id = (select auth.uid()));

alter policy crm_activities_select on public.crm_activities
using (public.is_admin() or assigned_to = (select auth.uid()) or created_by = (select auth.uid()));

alter policy crm_activities_insert on public.crm_activities
with check (
  public.is_admin()
  or (public.has_active_role(array['sales']::text[]) and (assigned_to = (select auth.uid()) or assigned_to is null))
);

alter policy crm_activities_update on public.crm_activities
using (public.is_admin() or assigned_to = (select auth.uid()) or created_by = (select auth.uid()))
with check (public.is_admin() or assigned_to = (select auth.uid()) or created_by = (select auth.uid()));

alter policy design_delivery_reviews_select on public.design_delivery_reviews
using (
  reviewer_user_id = (select auth.uid())
  or public.productivity_can_access_entity('project_task', project_task_id)
);

alter policy development_handover_staff_select on public.development_handover_packages
using (
  exists (
    select 1 from public.user_profiles u
    where u.id = (select auth.uid()) and u.status = 'active' and u.role <> 'customer'
  )
  and public.productivity_can_access_entity('project', project_id)
);

-- The previous ALL policy also participated in SELECT and duplicated the
-- dedicated read policy. Keep the same editor authority per write command.
drop policy if exists content_editor_write on public.content;
drop policy if exists content_editor_insert on public.content;
drop policy if exists content_editor_update on public.content;
drop policy if exists content_editor_delete on public.content;

create policy content_editor_insert
on public.content for insert to authenticated
with check (public.has_active_role(array['admin','site_manager','editor']::text[]));

create policy content_editor_update
on public.content for update to authenticated
using (public.has_active_role(array['admin','site_manager','editor']::text[]))
with check (public.has_active_role(array['admin','site_manager','editor']::text[]));

create policy content_editor_delete
on public.content for delete to authenticated
using (public.has_active_role(array['admin','site_manager','editor']::text[]));

-- Foreign-key-side indexes used by the sale-to-delivery joins and integrity
-- checks. These are deliberately narrow single-column indexes.
create index if not exists projects_created_by_idx on public.projects(created_by);
create index if not exists project_tasks_created_by_idx on public.project_tasks(created_by);
create index if not exists payments_created_by_idx on public.payments(created_by);
create index if not exists payments_verified_by_idx on public.payments(verified_by);
create index if not exists quotations_created_by_idx on public.quotations(created_by);
create index if not exists quotations_approved_by_idx on public.quotations(approved_by);
create index if not exists design_delivery_reviews_created_by_idx on public.design_delivery_reviews(created_by);
create index if not exists development_handover_packages_prepared_by_idx on public.development_handover_packages(prepared_by);
create index if not exists development_handover_packages_manager_reviewer_idx on public.development_handover_packages(manager_reviewer_id);

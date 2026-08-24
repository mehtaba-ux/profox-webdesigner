-- Optimize delivery RLS evaluation, remove overlapping permissive policies, add
-- workload-relevant indexes, and require atomic RPCs for projects/quotations.

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using(
  public.is_admin() or public.has_active_role(array['site_manager']) or project_manager_id=(select auth.uid()) or exists(select 1 from public.project_team pt where pt.project_id=projects.id and pt.user_id=(select auth.uid()))
);
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated using(
  public.is_admin() or public.has_active_role(array['site_manager']) or project_manager_id=(select auth.uid())
) with check(
  public.is_admin() or public.has_active_role(array['site_manager']) or project_manager_id=(select auth.uid())
);
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated with check(false);
revoke insert,delete on public.projects from authenticated;

drop policy if exists project_tasks_select on public.project_tasks;
create policy project_tasks_select on public.project_tasks for select to authenticated using(
  public.is_admin() or public.has_active_role(array['site_manager']) or assigned_to=(select auth.uid()) or exists(select 1 from public.projects p where p.id=project_tasks.project_id and p.project_manager_id=(select auth.uid())) or exists(select 1 from public.project_team pt where pt.project_id=project_tasks.project_id and pt.user_id=(select auth.uid()))
);
drop policy if exists project_tasks_insert on public.project_tasks;
create policy project_tasks_insert on public.project_tasks for insert to authenticated with check(
  public.is_admin() or public.has_active_role(array['site_manager']) or exists(select 1 from public.projects p where p.id=project_tasks.project_id and p.project_manager_id=(select auth.uid()))
);
drop policy if exists project_tasks_update on public.project_tasks;
create policy project_tasks_update on public.project_tasks for update to authenticated using(
  public.is_admin() or public.has_active_role(array['site_manager']) or assigned_to=(select auth.uid()) or exists(select 1 from public.projects p where p.id=project_tasks.project_id and p.project_manager_id=(select auth.uid()))
) with check(
  public.is_admin() or public.has_active_role(array['site_manager']) or assigned_to=(select auth.uid()) or exists(select 1 from public.projects p where p.id=project_tasks.project_id and p.project_manager_id=(select auth.uid()))
);
drop policy if exists project_tasks_delete on public.project_tasks;
create policy project_tasks_delete on public.project_tasks for delete to authenticated using(
  public.is_admin() or public.has_active_role(array['site_manager']) or exists(select 1 from public.projects p where p.id=project_tasks.project_id and p.project_manager_id=(select auth.uid()))
);

drop policy if exists project_team_all on public.project_team;
drop policy if exists project_team_select on public.project_team;
drop policy if exists project_team_insert on public.project_team;
drop policy if exists project_team_update on public.project_team;
drop policy if exists project_team_delete on public.project_team;
create policy project_team_select on public.project_team for select to authenticated using(
  public.is_admin() or public.has_active_role(array['site_manager']) or user_id=(select auth.uid()) or exists(select 1 from public.projects p where p.id=project_team.project_id and p.project_manager_id=(select auth.uid()))
);
create policy project_team_insert on public.project_team for insert to authenticated with check(
  public.is_admin() or public.has_active_role(array['site_manager']) or exists(select 1 from public.projects p where p.id=project_team.project_id and p.project_manager_id=(select auth.uid()))
);
create policy project_team_update on public.project_team for update to authenticated using(
  public.is_admin() or public.has_active_role(array['site_manager']) or exists(select 1 from public.projects p where p.id=project_team.project_id and p.project_manager_id=(select auth.uid()))
) with check(
  public.is_admin() or public.has_active_role(array['site_manager']) or exists(select 1 from public.projects p where p.id=project_team.project_id and p.project_manager_id=(select auth.uid()))
);
create policy project_team_delete on public.project_team for delete to authenticated using(
  public.is_admin() or public.has_active_role(array['site_manager']) or exists(select 1 from public.projects p where p.id=project_team.project_id and p.project_manager_id=(select auth.uid()))
);

drop policy if exists clients_admin_all on public.clients;
drop policy if exists clients_admin_insert on public.clients;
drop policy if exists clients_admin_update on public.clients;
drop policy if exists clients_admin_delete on public.clients;
create policy clients_admin_insert on public.clients for insert to authenticated with check(public.is_admin());
create policy clients_admin_update on public.clients for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy clients_admin_delete on public.clients for delete to authenticated using(public.is_admin());
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated using(
  public.is_admin() or salesperson_id=(select auth.uid()) or public.has_active_role(array['project_manager','site_manager']) or exists(select 1 from public.projects p join public.project_team pt on pt.project_id=p.id where p.client_id=clients.id and pt.user_id=(select auth.uid()))
);

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated using(
  public.is_admin() or salesperson_id=(select auth.uid()) or public.has_active_role(array['project_manager','site_manager']) or exists(select 1 from public.projects p join public.project_team pt on pt.project_id=p.id where (p.quotation_id=payments.quotation_id or p.source_opportunity_id=payments.opportunity_id) and pt.user_id=(select auth.uid()))
);
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated with check(
  public.is_admin() or (public.has_active_role(array['sales']) and salesperson_id=(select auth.uid()))
);
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update to authenticated using(
  public.is_admin() or salesperson_id=(select auth.uid())
) with check(
  public.is_admin() or salesperson_id=(select auth.uid())
);

drop policy if exists quotations_select on public.quotations;
create policy quotations_select on public.quotations for select to authenticated using(
  public.is_admin() or salesperson_id=(select auth.uid()) or public.has_active_role(array['project_manager','site_manager']) or exists(select 1 from public.projects p join public.project_team pt on pt.project_id=p.id where p.quotation_id=quotations.id and pt.user_id=(select auth.uid()))
);
revoke insert,update,delete on public.quotations from authenticated;

drop policy if exists quotation_items_select on public.quotation_items;
create policy quotation_items_select on public.quotation_items for select to authenticated using(
  exists(select 1 from public.quotations q where q.id=quotation_items.quotation_id and (public.is_admin() or q.salesperson_id=(select auth.uid()) or public.has_active_role(array['project_manager','site_manager']) or exists(select 1 from public.projects p join public.project_team pt on pt.project_id=p.id where p.quotation_id=q.id and pt.user_id=(select auth.uid()))))
);
revoke insert,update,delete on public.quotation_items from authenticated;

drop policy if exists project_client_approvals_select on public.project_client_approvals;
create policy project_client_approvals_select on public.project_client_approvals for select to authenticated using(
  public.is_admin() or exists(select 1 from public.projects p where p.id=project_client_approvals.project_id and p.project_manager_id=(select auth.uid())) or exists(select 1 from public.project_team pt where pt.project_id=project_client_approvals.project_id and pt.user_id=(select auth.uid())) or exists(select 1 from public.clients c where c.id=project_client_approvals.client_id and c.linked_user_id=(select auth.uid()))
);

drop policy if exists development_delivery_reviews_select on public.development_delivery_reviews;
create policy development_delivery_reviews_select on public.development_delivery_reviews for select to authenticated using(
  reviewer_user_id=(select auth.uid()) or public.development_delivery_can_access_task(project_task_id)
);

create index if not exists development_change_requests_project_task_requested_idx on public.development_change_requests(project_id,project_task_id,requested_at desc);
create index if not exists development_incidents_project_detected_idx on public.development_incidents(project_id,detected_at desc);
create index if not exists development_delivery_reviews_project_requested_idx on public.development_delivery_reviews(project_id,requested_at desc);
create index if not exists development_handover_packages_task_idx on public.development_handover_packages(project_task_id);
create index if not exists project_client_approvals_client_user_idx on public.project_client_approvals(client_user_id,created_at desc);

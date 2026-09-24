-- Client portal and delivery-team isolation hardening.
-- Access is tied to explicit client account links and project membership.
-- Email matching is intentionally not an authorization mechanism.

DROP POLICY IF EXISTS clients_select ON public.clients;
CREATE POLICY clients_select ON public.clients
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR salesperson_id = auth.uid()
  OR public.has_active_role(ARRAY['project_manager'])
  OR linked_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.project_team pt ON pt.project_id = p.id
    WHERE p.client_id = clients.id
      AND pt.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR project_manager_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.project_team pt
    WHERE pt.project_id = projects.id
      AND pt.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = projects.client_id
      AND c.linked_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS project_tasks_select ON public.project_tasks;
CREATE POLICY project_tasks_select ON public.project_tasks
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR assigned_to = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_tasks.project_id
      AND p.project_manager_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.project_team pt
    WHERE pt.project_id = project_tasks.project_id
      AND pt.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.clients c ON c.id = p.client_id
    WHERE p.id = project_tasks.project_id
      AND c.linked_user_id = auth.uid()
  )
);

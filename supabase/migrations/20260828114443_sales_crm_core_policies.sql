-- Require completed Sales account setup for Opportunities and Activities too.
DROP POLICY IF EXISTS crm_opportunities_select ON public.crm_opportunities;
CREATE POLICY crm_opportunities_select ON public.crm_opportunities FOR SELECT TO authenticated
USING ((SELECT public.is_admin()) OR (SELECT public.has_active_role(ARRAY['project_manager'])) OR ((SELECT public.sales_crm_access_ready()) AND salesperson_id=(SELECT auth.uid())));

DROP POLICY IF EXISTS crm_opportunities_insert ON public.crm_opportunities;
CREATE POLICY crm_opportunities_insert ON public.crm_opportunities FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_admin()) OR ((SELECT public.sales_crm_access_ready()) AND salesperson_id=(SELECT auth.uid())));

DROP POLICY IF EXISTS crm_opportunities_update ON public.crm_opportunities;
CREATE POLICY crm_opportunities_update ON public.crm_opportunities FOR UPDATE TO authenticated
USING ((SELECT public.is_admin()) OR ((SELECT public.sales_crm_access_ready()) AND salesperson_id=(SELECT auth.uid())))
WITH CHECK ((SELECT public.is_admin()) OR ((SELECT public.sales_crm_access_ready()) AND salesperson_id=(SELECT auth.uid())));

DROP POLICY IF EXISTS crm_activities_select ON public.crm_activities;
CREATE POLICY crm_activities_select ON public.crm_activities FOR SELECT TO authenticated
USING ((SELECT public.is_admin()) OR ((SELECT public.sales_crm_access_ready()) AND (assigned_to=(SELECT auth.uid()) OR created_by=(SELECT auth.uid()))));

DROP POLICY IF EXISTS crm_activities_insert ON public.crm_activities;
CREATE POLICY crm_activities_insert ON public.crm_activities FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_admin()) OR ((SELECT public.sales_crm_access_ready()) AND (assigned_to=(SELECT auth.uid()) OR assigned_to IS NULL) AND (created_by=(SELECT auth.uid()) OR created_by IS NULL)));

DROP POLICY IF EXISTS crm_activities_update ON public.crm_activities;
CREATE POLICY crm_activities_update ON public.crm_activities FOR UPDATE TO authenticated
USING ((SELECT public.is_admin()) OR ((SELECT public.sales_crm_access_ready()) AND (assigned_to=(SELECT auth.uid()) OR created_by=(SELECT auth.uid()))))
WITH CHECK ((SELECT public.is_admin()) OR ((SELECT public.sales_crm_access_ready()) AND (assigned_to=(SELECT auth.uid()) OR assigned_to IS NULL) AND (created_by=(SELECT auth.uid()) OR created_by IS NULL)));

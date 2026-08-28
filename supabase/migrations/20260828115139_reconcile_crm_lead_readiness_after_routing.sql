-- Preserve the configured Lead Assignment manager capability introduced by
-- the routing workflow, while keeping ordinary seller reads behind completed
-- Sales account setup and CRM-tour readiness.
CREATE OR REPLACE FUNCTION public.crm_can_manage_lead_assignment()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
 SELECT (SELECT auth.uid()) IS NOT NULL AND (
  public.is_admin()
  OR EXISTS(
   SELECT 1 FROM public.user_profiles u
   JOIN public.system_configuration c ON c.config_key='crm_lead_assignment'
   WHERE u.id=(SELECT auth.uid()) AND u.status='active'
    AND COALESCE(c.config_value->'managerUserIds','[]'::jsonb) ? u.id::text
  )
 );
$function$;

REVOKE ALL ON FUNCTION public.crm_can_manage_lead_assignment() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_can_manage_lead_assignment() TO authenticated;

DROP POLICY IF EXISTS crm_leads_select ON public.crm_leads;
CREATE POLICY crm_leads_select ON public.crm_leads FOR SELECT TO authenticated
USING (
 (SELECT public.crm_can_manage_lead_assignment())
 OR ((SELECT public.sales_crm_access_ready()) AND salesperson_id=(SELECT auth.uid()))
);

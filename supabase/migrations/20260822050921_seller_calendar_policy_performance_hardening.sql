-- Seller Command Center release performance hardening.
-- Consolidate overlapping Admin/self Calendar policies and ensure auth.uid() is initialized once per statement.

DROP POLICY IF EXISTS sales_meetings_admin_select ON public.sales_meetings;
DROP POLICY IF EXISTS sales_meetings_sales_read_own ON public.sales_meetings;
CREATE POLICY sales_meetings_select
ON public.sales_meetings
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    salesperson_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.role IN ('sales','sales_rep','sales_team')
    )
  )
);

DROP POLICY IF EXISTS user_calendar_settings_admin_all ON public.user_calendar_settings;
DROP POLICY IF EXISTS user_calendar_settings_self_insert ON public.user_calendar_settings;
DROP POLICY IF EXISTS user_calendar_settings_self_select ON public.user_calendar_settings;
DROP POLICY IF EXISTS user_calendar_settings_self_update ON public.user_calendar_settings;

CREATE POLICY user_calendar_settings_select
ON public.user_calendar_settings
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.role IN ('sales','sales_rep','sales_team')
    )
  )
);

CREATE POLICY user_calendar_settings_insert
ON public.user_calendar_settings
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    user_id = (SELECT auth.uid())
    AND provider = 'Manual'
    AND connection_status = 'Not Connected'
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.role IN ('sales','sales_rep','sales_team')
    )
  )
);

CREATE POLICY user_calendar_settings_update
ON public.user_calendar_settings
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.role IN ('sales','sales_rep','sales_team')
    )
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    user_id = (SELECT auth.uid())
    AND provider = 'Manual'
    AND connection_status = 'Not Connected'
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.role IN ('sales','sales_rep','sales_team')
    )
  )
);

CREATE POLICY user_calendar_settings_delete
ON public.user_calendar_settings
FOR DELETE
TO authenticated
USING (public.is_admin());

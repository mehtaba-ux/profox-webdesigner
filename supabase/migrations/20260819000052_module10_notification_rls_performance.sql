-- Module 10 performance hardening — evaluate auth/admin helpers once per statement.

DROP POLICY IF EXISTS notification_templates_admin_all ON public.notification_templates;
CREATE POLICY notification_templates_admin_all
  ON public.notification_templates
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS notification_outbox_admin_or_recipient_select ON public.notification_outbox;
CREATE POLICY notification_outbox_admin_or_recipient_select
  ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR recipient_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS in_app_notifications_self_select ON public.in_app_notifications;
CREATE POLICY in_app_notifications_self_select
  ON public.in_app_notifications
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR recipient_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS in_app_notifications_self_update ON public.in_app_notifications;
CREATE POLICY in_app_notifications_self_update
  ON public.in_app_notifications
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_admin())
    OR recipient_user_id = (SELECT auth.uid())
  )
  WITH CHECK (
    (SELECT public.is_admin())
    OR recipient_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS booking_funnel_admin_select ON public.public_booking_funnel_events;
CREATE POLICY booking_funnel_admin_select
  ON public.public_booking_funnel_events
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

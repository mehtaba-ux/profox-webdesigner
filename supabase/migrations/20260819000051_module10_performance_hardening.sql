-- Module 10 performance hardening — targeted FK indexes.
-- Scoped to Module 10 and directly adjacent booking tables used by the new workflows.

CREATE INDEX IF NOT EXISTS idx_notification_outbox_template_key
  ON public.notification_outbox(template_key);

CREATE INDEX IF NOT EXISTS idx_notification_templates_updated_by
  ON public.notification_templates(updated_by)
  WHERE updated_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_public_booking_funnel_events_salesperson
  ON public.public_booking_funnel_events(salesperson_id)
  WHERE salesperson_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_public_booking_submissions_lead_id
  ON public.public_booking_submissions(lead_id);

CREATE INDEX IF NOT EXISTS idx_booking_availability_blocks_created_by
  ON public.booking_availability_blocks(created_by);

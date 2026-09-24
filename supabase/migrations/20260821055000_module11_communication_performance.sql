-- Module 11 performance hardening for recurring customer communication scans.
CREATE INDEX IF NOT EXISTS idx_quotations_customer_validity_reminders
  ON public.quotations(valid_until,id)
  WHERE status='Sent' AND accepted_at IS NULL AND rejected_at IS NULL AND valid_until IS NOT NULL;

-- Existing Module 10 idx_payments_due_notifications covers the customer payment due-date scan.
-- Module 11D already adds idx_projects_client_review_communication for review-age scans.

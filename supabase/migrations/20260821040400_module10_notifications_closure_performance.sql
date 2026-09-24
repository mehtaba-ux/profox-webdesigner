-- Module 10 closure performance hardening for the recurring two-minute reminder scan.
CREATE INDEX IF NOT EXISTS idx_quotations_pending_approval_notifications
  ON public.quotations(approval_checked_at,id)
  WHERE status='Ready for Approval' AND approval_required IS TRUE;

CREATE INDEX IF NOT EXISTS idx_payments_due_notifications
  ON public.payments(due_date,id)
  WHERE verified_at IS NULL AND due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_verification_notifications
  ON public.payments(updated_at,id)
  WHERE status='Verification Pending' AND verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_tasks_due_notifications
  ON public.project_tasks(due_date,id)
  WHERE completed_at IS NULL AND due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_entries_review_notifications
  ON public.commission_entries(updated_at,id)
  WHERE status IN ('Under Review','Disputed');

CREATE INDEX IF NOT EXISTS idx_commission_entries_payout_notifications
  ON public.commission_entries(payout_batch_id,salesperson_id,status)
  WHERE payout_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_batches_schedule_notifications
  ON public.commission_payout_batches(scheduled_date,id)
  WHERE status='Approved';

CREATE INDEX IF NOT EXISTS idx_training_progress_submitted_reviews
  ON public.user_training_progress(updated_at,module_id,id)
  WHERE status='Submitted';

CREATE INDEX IF NOT EXISTS idx_user_profiles_active_admin_notifications
  ON public.user_profiles(role,status,id)
  WHERE role='admin' AND status='active';

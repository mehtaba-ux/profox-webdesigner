-- Safe compatibility migration.
-- Client authorization must use explicit clients.linked_user_id, never an email/JWT match.
-- Canonical RLS is applied by later hardening migrations.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.idx_unique_active_advance_payment;
DROP INDEX IF EXISTS public.idx_unique_active_final_payment;
DROP INDEX IF EXISTS public.idx_unique_active_milestone_payment;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_milestone_payment
ON public.payments (quotation_id, payment_type, COALESCE(milestone_number, 0))
WHERE status NOT IN ('Cancelled','Failed') AND quotation_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_unique_active_project_milestone_payment;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_project_milestone_payment
ON public.payments (client_id, payment_type, COALESCE(milestone_number, 0))
WHERE status NOT IN ('Cancelled','Failed') AND client_id IS NOT NULL AND quotation_id IS NULL;

-- Remove policy names created by the historical email-fallback implementation if they exist.
DROP POLICY IF EXISTS "Clients can view their own client row" ON public.clients;
DROP POLICY IF EXISTS "Clients can view their own projects" ON public.projects;
DROP POLICY IF EXISTS "Clients can view tasks of their own projects" ON public.project_tasks;
DROP POLICY IF EXISTS "Clients can view their own quotations" ON public.quotations;
DROP POLICY IF EXISTS "Clients can view their own payments" ON public.payments;
DROP POLICY IF EXISTS "Clients can update project stage for approval" ON public.projects;

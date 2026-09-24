-- Module 11 scoped performance hardening.
CREATE INDEX IF NOT EXISTS idx_productivity_playbooks_updated_by
  ON public.productivity_playbooks(updated_by)
  WHERE updated_by IS NOT NULL;

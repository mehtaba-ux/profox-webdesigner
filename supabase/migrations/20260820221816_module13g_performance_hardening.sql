-- Module 13G performance hardening — only findings introduced by Module 13.

CREATE INDEX IF NOT EXISTS idx_google_oauth_states_user
  ON public.google_calendar_oauth_states(user_id);

CREATE INDEX IF NOT EXISTS idx_google_sync_jobs_user
  ON public.google_calendar_sync_jobs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_google_sync_audit_job
  ON public.google_calendar_sync_audit(job_id)
  WHERE job_id IS NOT NULL;

-- One SELECT policy instead of separate self/admin permissive policies.
DROP POLICY IF EXISTS google_calendar_connections_self_read ON public.google_calendar_connections;
DROP POLICY IF EXISTS google_calendar_connections_admin_read ON public.google_calendar_connections;
DROP POLICY IF EXISTS google_calendar_connections_read ON public.google_calendar_connections;
CREATE POLICY google_calendar_connections_read
ON public.google_calendar_connections
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'active'
        AND p.role IN ('sales','admin')
    )
  )
);

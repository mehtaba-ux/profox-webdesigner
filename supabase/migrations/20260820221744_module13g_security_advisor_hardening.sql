-- Module 13G security-advisor hardening.
-- Internal Google synchronization tables stay completely opaque to browser roles.
-- Explicit deny policies document that boundary while service_role continues to bypass RLS.

REVOKE EXECUTE ON FUNCTION public.has_google_calendar_conflict(uuid,timestamptz,timestamptz,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_google_calendar_conflict(uuid,timestamptz,timestamptz,uuid) TO service_role;

DROP POLICY IF EXISTS google_calendar_busy_blocks_no_client_access ON public.google_calendar_busy_blocks;
CREATE POLICY google_calendar_busy_blocks_no_client_access
ON public.google_calendar_busy_blocks
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS google_calendar_event_links_no_client_access ON public.google_calendar_event_links;
CREATE POLICY google_calendar_event_links_no_client_access
ON public.google_calendar_event_links
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS google_calendar_oauth_states_no_client_access ON public.google_calendar_oauth_states;
CREATE POLICY google_calendar_oauth_states_no_client_access
ON public.google_calendar_oauth_states
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS google_calendar_sync_jobs_no_client_access ON public.google_calendar_sync_jobs;
CREATE POLICY google_calendar_sync_jobs_no_client_access
ON public.google_calendar_sync_jobs
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS google_calendar_sync_audit_no_client_access ON public.google_calendar_sync_audit;
CREATE POLICY google_calendar_sync_audit_no_client_access
ON public.google_calendar_sync_audit
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);

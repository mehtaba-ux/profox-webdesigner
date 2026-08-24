-- Module 9 — Sales Meetings schema, indexes, RLS and Admin configuration seed.
-- External calendar OAuth/sync is intentionally deferred. Manual meetings are the only live provider.

CREATE TABLE IF NOT EXISTS public.user_calendar_settings (
  user_id uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'Manual',
  calendar_email text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'UTC',
  working_days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  work_start time NOT NULL DEFAULT '09:00',
  work_end time NOT NULL DEFAULT '17:00',
  default_duration_minutes integer NOT NULL DEFAULT 30 CHECK (default_duration_minutes BETWEEN 10 AND 240),
  buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_before_minutes BETWEEN 0 AND 240),
  buffer_after_minutes integer NOT NULL DEFAULT 15 CHECK (buffer_after_minutes BETWEEN 0 AND 240),
  booking_url text NOT NULL DEFAULT '',
  default_platform text NOT NULL DEFAULT 'Google Meet',
  connection_status text NOT NULL DEFAULT 'Not Connected'
    CHECK (connection_status IN ('Not Connected','Connected','Needs Reconnect','Error')),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (work_end > work_start),
  CHECK (working_days <@ ARRAY[0,1,2,3,4,5,6]::integer[]),
  CHECK (cardinality(working_days) > 0)
);

CREATE TABLE IF NOT EXISTS public.sales_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL UNIQUE,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  salesperson_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  activity_id uuid REFERENCES public.crm_activities(id) ON DELETE SET NULL,
  meeting_type text NOT NULL DEFAULT 'Discovery Meeting',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  provider text NOT NULL DEFAULT 'Manual',
  external_calendar_id text,
  external_event_id text,
  meeting_url text NOT NULL DEFAULT '',
  attendee_name text NOT NULL DEFAULT '',
  attendee_email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Scheduled'
    CHECK (status IN ('Scheduled','Completed','Cancelled','No Show','Rescheduled')),
  sync_status text NOT NULL DEFAULT 'Not Connected'
    CHECK (sync_status IN ('Not Connected','Pending','Synced','Error')),
  sync_error text,
  outcome text NOT NULL DEFAULT '',
  requirements_summary text NOT NULL DEFAULT '',
  problems_identified text NOT NULL DEFAULT '',
  decision_makers text NOT NULL DEFAULT '',
  commercial_notes text NOT NULL DEFAULT '',
  timeline_notes text NOT NULL DEFAULT '',
  next_step text NOT NULL DEFAULT '',
  follow_up_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  completed_at timestamptz,
  cancelled_at timestamptz,
  rescheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at),
  CHECK (num_nonnulls(lead_id, opportunity_id, client_id) <= 1),
  CHECK (lead_id IS NOT NULL OR opportunity_id IS NOT NULL OR client_id IS NOT NULL OR attendee_email <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_meetings_external_event
  ON public.sales_meetings(provider, external_event_id)
  WHERE external_event_id IS NOT NULL AND external_event_id <> '';
CREATE INDEX IF NOT EXISTS idx_sales_meetings_salesperson_start ON public.sales_meetings(salesperson_id, start_at);
CREATE INDEX IF NOT EXISTS idx_sales_meetings_lead ON public.sales_meetings(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_meetings_opportunity ON public.sales_meetings(opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_meetings_client ON public.sales_meetings(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_meetings_activity ON public.sales_meetings(activity_id) WHERE activity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_meetings_status_start ON public.sales_meetings(status, start_at);

ALTER TABLE public.user_calendar_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_meetings ENABLE ROW LEVEL SECURITY;

-- Meeting lifecycle writes are RPC-only. Direct authenticated writes are deliberately denied.
REVOKE ALL ON TABLE public.sales_meetings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.sales_meetings FROM authenticated;
GRANT SELECT ON TABLE public.sales_meetings TO authenticated;

-- Availability/preferences are self-service for active Sales and manageable by Admin.
-- Connection/provider state remains fail-closed until the OAuth sub-job is deployed.
REVOKE ALL ON TABLE public.user_calendar_settings FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.user_calendar_settings FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_calendar_settings TO authenticated;

DROP POLICY IF EXISTS sales_meetings_admin_select ON public.sales_meetings;
DROP POLICY IF EXISTS sales_meetings_sales_read_own ON public.sales_meetings;
CREATE POLICY sales_meetings_admin_select ON public.sales_meetings
  FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY sales_meetings_sales_read_own ON public.sales_meetings
  FOR SELECT TO authenticated
  USING (
    salesperson_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'sales' AND p.status = 'active'
    )
  );

DROP POLICY IF EXISTS user_calendar_settings_admin_all ON public.user_calendar_settings;
DROP POLICY IF EXISTS user_calendar_settings_self_select ON public.user_calendar_settings;
DROP POLICY IF EXISTS user_calendar_settings_self_insert ON public.user_calendar_settings;
DROP POLICY IF EXISTS user_calendar_settings_self_update ON public.user_calendar_settings;
CREATE POLICY user_calendar_settings_admin_all ON public.user_calendar_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY user_calendar_settings_self_select ON public.user_calendar_settings
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'sales' AND p.status = 'active'
    )
  );
CREATE POLICY user_calendar_settings_self_insert ON public.user_calendar_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND provider = 'Manual'
    AND connection_status = 'Not Connected'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'sales' AND p.status = 'active'
    )
  );
CREATE POLICY user_calendar_settings_self_update ON public.user_calendar_settings
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'sales' AND p.status = 'active'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND provider = 'Manual'
    AND connection_status = 'Not Connected'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'sales' AND p.status = 'active'
    )
  );

-- Admin-editable defaults. Existing Admin values are never overwritten by this seed.
INSERT INTO public.system_configuration(config_key, config_value, description, updated_at)
VALUES (
  'meeting_settings',
  '{"defaultDurationMinutes":30,"allowedDurations":[15,30,45,60],"minimumBookingNoticeMinutes":120,"bufferBeforeMinutes":0,"bufferAfterMinutes":15,"defaultTimezone":"Asia/Kolkata","defaultMeetingType":"Discovery Meeting","meetingTypes":["Discovery Meeting","Proposal Review","Project Consultation","Follow-Up Meeting"],"titleTemplate":"{{company}} — {{meetingType}}","descriptionTemplate":"ProFox meeting with {{contact}} from {{company}}.","providers":["Manual"],"defaultProvider":"Manual","bookingInstructions":"Confirm the prospect timezone before booking.","cancellationInstructions":"Record cancellations in CRM and preserve meeting history.","reschedulingInstructions":"Update the existing meeting instead of creating a duplicate.","reminderMinutes":[1440,60],"active":true}'::jsonb,
  'Admin-configurable defaults for Sales meeting scheduling and calendar behavior.',
  now()
)
ON CONFLICT (config_key) DO NOTHING;

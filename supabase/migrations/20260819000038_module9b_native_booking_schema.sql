-- Module 9B — ProFox native booking schema.
-- ProFox Calendar is the primary scheduling system. External calendars remain optional integrations.

CREATE SEQUENCE IF NOT EXISTS public.public_booking_reference_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.next_public_booking_reference()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT 'PF-BKG-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.public_booking_reference_seq')::text, 5, '0');
$$;

CREATE TABLE IF NOT EXISTS public.public_booking_profiles (
  salesperson_id uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  headline text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  avatar_url text NOT NULL DEFAULT '',
  niches text[] NOT NULL DEFAULT ARRAY[]::text[],
  service_expertise text[] NOT NULL DEFAULT ARRAY[]::text[],
  languages text[] NOT NULL DEFAULT ARRAY['English']::text[],
  meeting_type text NOT NULL DEFAULT 'Discovery Meeting',
  meeting_duration_minutes integer NOT NULL DEFAULT 30 CHECK (meeting_duration_minutes BETWEEN 10 AND 240),
  is_public boolean NOT NULL DEFAULT false,
  accepting_bookings boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.booking_availability_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE TABLE IF NOT EXISTS public.public_booking_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL UNIQUE,
  booking_reference text NOT NULL UNIQUE DEFAULT public.next_public_booking_reference(),
  salesperson_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE RESTRICT,
  meeting_id uuid NOT NULL UNIQUE REFERENCES public.sales_meetings(id) ON DELETE RESTRICT,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  company_name text NOT NULL,
  website text NOT NULL DEFAULT '',
  country text NOT NULL,
  industry text NOT NULL DEFAULT 'Other',
  service_interest text NOT NULL DEFAULT '',
  qualification_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  visitor_timezone text NOT NULL DEFAULT 'UTC',
  status text NOT NULL DEFAULT 'Confirmed' CHECK (status IN ('Confirmed','Cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_blocks_user_time
  ON public.booking_availability_blocks(user_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_public_booking_submissions_salesperson_created
  ON public.public_booking_submissions(salesperson_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_booking_submissions_email_created
  ON public.public_booking_submissions(lower(email), created_at DESC);

ALTER TABLE public.public_booking_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_availability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_booking_submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_booking_profiles FROM anon;
REVOKE ALL ON TABLE public.booking_availability_blocks FROM anon;
REVOKE ALL ON TABLE public.public_booking_submissions FROM anon;

REVOKE ALL ON TABLE public.public_booking_profiles FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_booking_profiles TO authenticated;
REVOKE ALL ON TABLE public.booking_availability_blocks FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.booking_availability_blocks TO authenticated;
REVOKE ALL ON TABLE public.public_booking_submissions FROM authenticated;
GRANT SELECT ON TABLE public.public_booking_submissions TO authenticated;

DROP POLICY IF EXISTS public_booking_profiles_admin_or_self_select ON public.public_booking_profiles;
DROP POLICY IF EXISTS public_booking_profiles_admin_or_self_insert ON public.public_booking_profiles;
DROP POLICY IF EXISTS public_booking_profiles_admin_or_self_update ON public.public_booking_profiles;
DROP POLICY IF EXISTS public_booking_profiles_admin_or_self_delete ON public.public_booking_profiles;
CREATE POLICY public_booking_profiles_admin_or_self_select ON public.public_booking_profiles
  FOR SELECT TO authenticated
  USING (public.is_admin() OR salesperson_id = auth.uid());
CREATE POLICY public_booking_profiles_admin_or_self_insert ON public.public_booking_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (salesperson_id = auth.uid() AND public.has_active_role(ARRAY['sales','admin']::text[]))
  );
CREATE POLICY public_booking_profiles_admin_or_self_update ON public.public_booking_profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR salesperson_id = auth.uid())
  WITH CHECK (
    public.is_admin()
    OR (salesperson_id = auth.uid() AND public.has_active_role(ARRAY['sales','admin']::text[]))
  );
CREATE POLICY public_booking_profiles_admin_or_self_delete ON public.public_booking_profiles
  FOR DELETE TO authenticated
  USING (public.is_admin() OR salesperson_id = auth.uid());

DROP POLICY IF EXISTS booking_blocks_admin_or_self_select ON public.booking_availability_blocks;
DROP POLICY IF EXISTS booking_blocks_admin_or_self_insert ON public.booking_availability_blocks;
DROP POLICY IF EXISTS booking_blocks_admin_or_self_update ON public.booking_availability_blocks;
DROP POLICY IF EXISTS booking_blocks_admin_or_self_delete ON public.booking_availability_blocks;
CREATE POLICY booking_blocks_admin_or_self_select ON public.booking_availability_blocks
  FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());
CREATE POLICY booking_blocks_admin_or_self_insert ON public.booking_availability_blocks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (user_id = auth.uid() AND public.has_active_role(ARRAY['sales','admin']::text[]))
  );
CREATE POLICY booking_blocks_admin_or_self_update ON public.booking_availability_blocks
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR user_id = auth.uid())
  WITH CHECK (
    public.is_admin()
    OR (user_id = auth.uid() AND public.has_active_role(ARRAY['sales','admin']::text[]))
  );
CREATE POLICY booking_blocks_admin_or_self_delete ON public.booking_availability_blocks
  FOR DELETE TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS public_booking_submissions_admin_or_owner_select ON public.public_booking_submissions;
CREATE POLICY public_booking_submissions_admin_or_owner_select ON public.public_booking_submissions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (salesperson_id = auth.uid() AND public.has_active_role(ARRAY['sales']::text[]))
  );

CREATE OR REPLACE FUNCTION public.validate_public_booking_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meeting_settings jsonb;
  v_duration_allowed boolean;
  v_type_allowed boolean;
BEGIN
  NEW.slug := lower(trim(COALESCE(NEW.slug,'')));
  NEW.slug := regexp_replace(NEW.slug, '[^a-z0-9]+', '-', 'g');
  NEW.slug := trim(both '-' from NEW.slug);
  IF NEW.slug = '' THEN
    NEW.slug := 'expert-' || left(NEW.salesperson_id::text, 8);
  END IF;

  NEW.display_name := trim(COALESCE(NEW.display_name,''));
  NEW.headline := left(trim(COALESCE(NEW.headline,'')), 160);
  NEW.bio := left(trim(COALESCE(NEW.bio,'')), 2000);
  NEW.country := left(trim(COALESCE(NEW.country,'')), 120);
  NEW.avatar_url := left(trim(COALESCE(NEW.avatar_url,'')), 1000);
  NEW.niches := ARRAY(SELECT DISTINCT trim(x) FROM unnest(COALESCE(NEW.niches, ARRAY[]::text[])) x WHERE trim(x) <> '');
  NEW.service_expertise := ARRAY(SELECT DISTINCT trim(x) FROM unnest(COALESCE(NEW.service_expertise, ARRAY[]::text[])) x WHERE trim(x) <> '');
  NEW.languages := ARRAY(SELECT DISTINCT trim(x) FROM unnest(COALESCE(NEW.languages, ARRAY[]::text[])) x WHERE trim(x) <> '');

  IF (NEW.is_public OR NEW.accepting_bookings) AND NOT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = NEW.salesperson_id AND p.status = 'active' AND p.role IN ('sales','admin')
  ) THEN
    RAISE EXCEPTION 'Only an active Sales Representative or Administrator may publish a booking profile.';
  END IF;

  IF NEW.accepting_bookings AND NOT EXISTS (
    SELECT 1 FROM public.user_calendar_settings c
    WHERE c.user_id=NEW.salesperson_id AND c.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Save active ProFox working availability before accepting public bookings.';
  END IF;

  SELECT config_value INTO v_meeting_settings
  FROM public.system_configuration WHERE config_key = 'meeting_settings';
  v_meeting_settings := COALESCE(v_meeting_settings, '{}'::jsonb);

  SELECT EXISTS(
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(v_meeting_settings->'allowedDurations','[15,30,45,60]'::jsonb)) x
    WHERE x::integer = NEW.meeting_duration_minutes
  ) INTO v_duration_allowed;
  IF NOT v_duration_allowed THEN
    RAISE EXCEPTION 'Public booking duration must be one of the Admin-approved meeting durations.';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(v_meeting_settings->'meetingTypes','["Discovery Meeting"]'::jsonb)) x
    WHERE x = NEW.meeting_type
  ) INTO v_type_allowed;
  IF NOT v_type_allowed THEN
    RAISE EXCEPTION 'Public booking meeting type must be enabled in Meeting Settings.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_public_booking_profile ON public.public_booking_profiles;
CREATE TRIGGER trg_validate_public_booking_profile
BEFORE INSERT OR UPDATE ON public.public_booking_profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_public_booking_profile();

CREATE OR REPLACE FUNCTION public.touch_booking_availability_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.reason := left(trim(COALESCE(NEW.reason,'')), 500);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_booking_availability_block ON public.booking_availability_blocks;
CREATE TRIGGER trg_touch_booking_availability_block
BEFORE INSERT OR UPDATE ON public.booking_availability_blocks
FOR EACH ROW EXECUTE FUNCTION public.touch_booking_availability_block();

REVOKE ALL ON FUNCTION public.next_public_booking_reference() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_public_booking_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_booking_availability_block() FROM PUBLIC, anon, authenticated;

INSERT INTO public.system_configuration(config_key, config_value, description, updated_at)
VALUES (
  'public_booking_settings',
  '{
    "active": true,
    "pageTitle": "Book a strategy call",
    "pageSubtitle": "Choose the ProFox specialist who best matches your business, pick an available time, and tell us what you want to achieve.",
    "confirmationMessage": "Your meeting is confirmed. We have shared the details with your selected ProFox specialist.",
    "maxAdvanceDays": 60,
    "slotIntervalMinutes": 15,
    "maxBookingsPerEmailPerDay": 3,
    "qualificationQuestions": [
      {"id":"project_goal","label":"What would you like us to help you achieve?","type":"textarea","required":true,"placeholder":"Tell us the result you want from this project."},
      {"id":"budget_range","label":"What budget range are you working with?","type":"select","required":true,"options":["Under $1,000","$1,000 - $3,000","$3,000 - $6,000","$6,000 - $10,000","$10,000+","Not decided yet"]},
      {"id":"timeline","label":"When would you like to start?","type":"select","required":true,"options":["As soon as possible","Within 30 days","1 - 3 months","3+ months","Just exploring"]},
      {"id":"decision_maker","label":"Are you involved in the final decision?","type":"select","required":true,"options":["Yes, I am the decision maker","Yes, with other stakeholders","No, I am researching for the decision maker"]}
    ]
  }'::jsonb,
  'Admin-configurable public ProFox booking flow, qualification questions, and slot policy.',
  now()
)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO public.public_booking_profiles(
  salesperson_id, slug, display_name, country, avatar_url, meeting_type, meeting_duration_minutes, is_public, accepting_bookings
)
SELECT
  p.id,
  trim(both '-' from regexp_replace(lower(COALESCE(NULLIF(p.full_name,''),'expert')), '[^a-z0-9]+', '-', 'g')) || '-' || left(p.id::text, 8),
  p.full_name,
  COALESCE(p.country,''),
  COALESCE(p.avatar_url,''),
  COALESCE((SELECT config_value->>'defaultMeetingType' FROM public.system_configuration WHERE config_key='meeting_settings'),'Discovery Meeting'),
  COALESCE((SELECT (config_value->>'defaultDurationMinutes')::integer FROM public.system_configuration WHERE config_key='meeting_settings'),30),
  false,
  false
FROM public.user_profiles p
WHERE p.status='active' AND p.role IN ('sales','admin')
ON CONFLICT (salesperson_id) DO NOTHING;
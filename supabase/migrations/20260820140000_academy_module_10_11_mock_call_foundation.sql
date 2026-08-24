-- Sales Academy Module 10 + 11: automated call practice and live mock-call assessment foundation.
-- Source of truth: Profox Webdesiger App + Website.

UPDATE public.training_modules
SET title='Call Practice',
    description='Build discovery-call fluency through guided drills, full rehearsals, self-coaching, and an automated readiness handoff into the live mock-call assessment.',
    module_type='practical', required=true, active=true, passing_score=NULL,
    requires_admin_review=false, updated_at=now()
WHERE slug='call-practice';

UPDATE public.training_modules
SET title='Mock Sales Call Test',
    description='Complete a live, human-evaluated ProFox mock discovery call using a simulated cold-outreach lead, a private evaluator scenario, and a standardized scoring rubric.',
    module_type='practical', required=true, active=true, passing_score=75,
    requires_admin_review=true, updated_at=now()
WHERE slug='mock-call-test';

CREATE TABLE IF NOT EXISTS public.call_practice_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'Discovery',
  instructions text NOT NULL DEFAULT '',
  completion_prompt text NOT NULL DEFAULT '',
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.call_practice_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  progress_id uuid NOT NULL UNIQUE REFERENCES public.user_training_progress(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  completed_lesson_ids uuid[] NOT NULL DEFAULT '{}',
  completed_drill_ids uuid[] NOT NULL DEFAULT '{}',
  rehearsals jsonb NOT NULL DEFAULT '[]'::jsonb,
  assessment_availability jsonb NOT NULL DEFAULT '{}'::jsonb,
  readiness_acknowledged boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,module_id)
);

CREATE TABLE IF NOT EXISTS public.mock_call_evaluator_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  evaluator_class text NOT NULL DEFAULT 'sales_agent' CHECK (evaluator_class IN ('sales_agent','manager','admin')),
  service_start_date date,
  availability_mode text NOT NULL DEFAULT 'calendar' CHECK (availability_mode IN ('calendar','custom','global')),
  custom_availability jsonb NOT NULL DEFAULT '{}'::jsonb,
  meeting_url text NOT NULL DEFAULT '',
  max_active_sessions integer CHECK (max_active_sessions IS NULL OR max_active_sessions BETWEEN 1 AND 50),
  max_weekly_sessions integer CHECK (max_weekly_sessions IS NULL OR max_weekly_sessions BETWEEN 1 AND 100),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mock_call_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service_type text NOT NULL,
  industry text NOT NULL,
  difficulty text NOT NULL DEFAULT 'standard' CHECK (difficulty IN ('foundation','standard','advanced')),
  seller_brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluator_brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluator_instructions text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  weight integer NOT NULL DEFAULT 100 CHECK (weight BETWEEN 1 AND 1000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mock_call_rubric_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  max_points integer NOT NULL CHECK (max_points BETWEEN 1 AND 100),
  sort_order integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mock_call_critical_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mock_call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE RESTRICT,
  progress_id uuid NOT NULL REFERENCES public.user_training_progress(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL DEFAULT 1 CHECK (attempt_no > 0),
  scenario_id uuid REFERENCES public.mock_call_scenarios(id) ON DELETE SET NULL,
  scenario_name_snapshot text NOT NULL DEFAULT '',
  scenario_version_snapshot integer NOT NULL DEFAULT 1,
  seller_brief_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluator_brief_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluator_instructions_snapshot text NOT NULL DEFAULT '',
  rubric_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  critical_rules_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluator_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  meeting_id uuid REFERENCES public.sales_meetings(id) ON DELETE SET NULL,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  timezone text NOT NULL DEFAULT 'UTC',
  meeting_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending_assignment' CHECK (status IN ('pending_assignment','scheduled','evaluator_declined','completed','passed','retry_required','cancelled','needs_admin_attention')),
  assignment_method text NOT NULL DEFAULT 'balanced_random',
  assignment_attempts integer NOT NULL DEFAULT 0,
  evaluator_assigned_at timestamptz,
  score integer CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  rubric_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  critical_failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluator_feedback text NOT NULL DEFAULT '',
  evaluated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trainee_id,attempt_no)
);

CREATE TABLE IF NOT EXISTS public.mock_call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.mock_call_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_practice_state_user ON public.call_practice_state(user_id);
CREATE INDEX IF NOT EXISTS idx_mock_call_sessions_trainee ON public.mock_call_sessions(trainee_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mock_call_sessions_evaluator ON public.mock_call_sessions(evaluator_id,status,scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_mock_call_sessions_status ON public.mock_call_sessions(status,scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_mock_call_events_session ON public.mock_call_events(session_id,created_at);

ALTER TABLE public.call_practice_drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_practice_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_call_evaluator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_call_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_call_rubric_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_call_critical_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_call_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS call_practice_drills_read ON public.call_practice_drills;
CREATE POLICY call_practice_drills_read ON public.call_practice_drills FOR SELECT TO authenticated
USING (active OR public.is_admin());
DROP POLICY IF EXISTS call_practice_drills_admin_write ON public.call_practice_drills;
CREATE POLICY call_practice_drills_admin_write ON public.call_practice_drills FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS call_practice_state_read ON public.call_practice_state;
CREATE POLICY call_practice_state_read ON public.call_practice_state FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS call_practice_state_admin_write ON public.call_practice_state;
CREATE POLICY call_practice_state_admin_write ON public.call_practice_state FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS mock_call_evaluator_profiles_read ON public.mock_call_evaluator_profiles;
CREATE POLICY mock_call_evaluator_profiles_read ON public.mock_call_evaluator_profiles FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS mock_call_evaluator_profiles_admin_write ON public.mock_call_evaluator_profiles;
CREATE POLICY mock_call_evaluator_profiles_admin_write ON public.mock_call_evaluator_profiles FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS mock_call_scenarios_admin ON public.mock_call_scenarios;
CREATE POLICY mock_call_scenarios_admin ON public.mock_call_scenarios FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mock_call_rubric_admin ON public.mock_call_rubric_items;
CREATE POLICY mock_call_rubric_admin ON public.mock_call_rubric_items FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mock_call_critical_admin ON public.mock_call_critical_rules;
CREATE POLICY mock_call_critical_admin ON public.mock_call_critical_rules FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mock_call_sessions_admin ON public.mock_call_sessions;
CREATE POLICY mock_call_sessions_admin ON public.mock_call_sessions FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mock_call_events_admin ON public.mock_call_events;
CREATE POLICY mock_call_events_admin ON public.mock_call_events FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.system_configuration(config_key,config_value,description,updated_at)
VALUES (
  'mock_call_automation_settings',
  jsonb_build_object(
    'active',true,
    'minSalesTenureMonths',24,
    'adminsEligibleByDefault',true,
    'minimumNoticeHours',24,
    'schedulingHorizonDays',14,
    'slotIntervalMinutes',30,
    'defaultDurationMinutes',30,
    'reminderMinutes',jsonb_build_array(1440,60),
    'balanceWindowDays',30,
    'defaultMaxActiveSessions',3,
    'defaultMaxWeeklySessions',5,
    'fallbackWorkingDays',jsonb_build_array(1,2,3,4,5),
    'fallbackWorkStart','09:00',
    'fallbackWorkEnd','17:00',
    'defaultTimezone','Asia/Kolkata',
    'retryDelayHours',24,
    'reassignmentDelayMinutes',60,
    'maxAssignmentAttempts',10,
    'fullRehearsalsRequired',3,
    'requiredDrills',12,
    'selfScoreReadinessBenchmark',16,
    'scenarioReuseAfterAllSeen',true,
    'automationCheckMinutes',30
  ),
  'Controls fully automated Module 10 readiness and Module 11 evaluator/scenario assignment, scheduling, reminders, retries, and fallback behavior.',
  now()
)
ON CONFLICT (config_key) DO NOTHING;

-- Mock calls are a native ProFox meeting type. Preserve all existing Admin meeting types.
UPDATE public.system_configuration
SET config_value=jsonb_set(
      config_value,
      '{meetingTypes}',
      COALESCE(config_value->'meetingTypes','[]'::jsonb) || '"Mock Sales Call"'::jsonb,
      true
    ), updated_at=now()
WHERE config_key='meeting_settings'
  AND NOT COALESCE(config_value->'meetingTypes','[]'::jsonb) @> '["Mock Sales Call"]'::jsonb;

-- Active Admins are valid fallback evaluators immediately; Admin can disable any account later.
INSERT INTO public.mock_call_evaluator_profiles(user_id,enabled,evaluator_class,availability_mode,notes)
SELECT id,true,'admin','global','Auto-enabled as an Admin fallback evaluator. Editable in Mock Call Automation settings.'
FROM public.user_profiles
WHERE role='admin' AND status='active'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,active,description,updated_at)
VALUES
('mock_call_scheduled_trainee','Mock call scheduled — trainee','Your ProFox mock sales call is scheduled','Hi {{traineeName}},\n\nYour live ProFox Mock Sales Call has been scheduled for {{scheduledLocal}}.\nEvaluator: {{evaluatorName}}\nMeeting link: {{meetingUrl}}\n\nOpen Module 11 to review your simulated lead brief. The evaluator has a separate confidential scenario, so prepare exactly as you would for a real cold-outreach prospect.','true','Automatic Module 11 schedule confirmation for the trainee.',now()),
('mock_call_scheduled_evaluator','Mock call assigned — evaluator','You have been assigned a ProFox mock sales call','Hi {{evaluatorName}},\n\nYou have been automatically assigned a ProFox Mock Sales Call for {{scheduledLocal}} with trainee {{traineeName}}.\nMeeting link: {{meetingUrl}}\n\nOpen the Mock Call Evaluator workspace before the call to review your confidential prospect scenario and scoring rubric.','true','Automatic evaluator assignment confirmation.',now()),
('mock_call_reminder_trainee','Mock call reminder — trainee','Reminder: upcoming ProFox mock sales call','Your ProFox mock sales call with {{evaluatorName}} starts at {{scheduledLocal}}. Open Module 11 for your simulated lead brief and meeting details.','true','Automatic trainee reminder.',now()),
('mock_call_reminder_evaluator','Mock call reminder — evaluator','Reminder: mock sales call evaluation','Your assigned mock sales call with trainee {{traineeName}} starts at {{scheduledLocal}}. Review the confidential evaluator brief before joining.','true','Automatic evaluator reminder.',now()),
('mock_call_retry_trainee','Mock call retry scheduled','Your next ProFox mock sales call has been scheduled','Your previous mock call requires additional practice. Review the evaluator coaching in Module 11. A new scenario and live mock call have been scheduled automatically for {{scheduledLocal}}.','true','Automatic retry coaching and reschedule notification.',now()),
('mock_call_passed','Mock call passed','You passed the ProFox Mock Sales Call','Congratulations {{traineeName}}. You passed the live Mock Sales Call with a score of {{score}}/100 and can continue to the next Sales Academy module.','true','Automatic Module 11 pass notification.',now())
ON CONFLICT (template_key) DO NOTHING;

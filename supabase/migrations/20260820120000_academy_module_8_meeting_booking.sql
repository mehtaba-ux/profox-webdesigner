-- Sales Academy Module 8 — Meeting Booking base schema and metadata.
-- Content, assessment, guard and RPC workflow are split into ordered migrations
-- so production deployment and rollback QA remain reviewable.

CREATE TABLE IF NOT EXISTS public.meeting_booking_training_state (
  progress_id uuid PRIMARY KEY REFERENCES public.user_training_progress(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  lessons_completed integer NOT NULL DEFAULT 0 CHECK (lessons_completed >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,module_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_booking_training_state_user_module
  ON public.meeting_booking_training_state(user_id,module_id);
CREATE INDEX IF NOT EXISTS idx_meeting_booking_training_state_module
  ON public.meeting_booking_training_state(module_id);

ALTER TABLE public.meeting_booking_training_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_booking_training_state_select ON public.meeting_booking_training_state;
CREATE POLICY meeting_booking_training_state_select
ON public.meeting_booking_training_state FOR SELECT TO authenticated
USING (public.is_admin() OR user_id=(SELECT auth.uid()));

GRANT SELECT ON public.meeting_booking_training_state TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.meeting_booking_training_state FROM authenticated, anon;

UPDATE public.training_modules
SET title='Meeting Booking',
    description='Turn qualified prospect interest into a correctly qualified, confirmed ProFox discovery meeting. Learn buyer-centered booking, live and async scheduling, qualification, no-show prevention, CRM discipline, and professional recovery.',
    module_type='practical',
    required=true,
    active=true,
    passing_score=80,
    requires_admin_review=false,
    updated_at=now()
WHERE slug='meeting-booking';

-- Module 8 was empty at implementation start. Seeds are recreated deterministically.
DELETE FROM public.training_lessons
WHERE module_id=(SELECT id FROM public.training_modules WHERE slug='meeting-booking');

DELETE FROM public.training_assessment_questions
WHERE module_id=(SELECT id FROM public.training_modules WHERE slug='meeting-booking');

DELETE FROM public.training_acknowledgements
WHERE module_id=(SELECT id FROM public.training_modules WHERE slug='meeting-booking');

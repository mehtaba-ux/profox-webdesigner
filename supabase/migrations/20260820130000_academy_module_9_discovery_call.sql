-- Sales Academy Module 9 — Discovery / Call Script
-- Approved curriculum: diagnose before prescribe; one-time server-scored knowledge/judgment certification.

CREATE TABLE IF NOT EXISTS public.discovery_call_training_state (
  progress_id uuid PRIMARY KEY REFERENCES public.user_training_progress(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  lessons_completed integer NOT NULL DEFAULT 0 CHECK (lessons_completed >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,module_id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_call_training_state_user_module
  ON public.discovery_call_training_state(user_id,module_id);
CREATE INDEX IF NOT EXISTS idx_discovery_call_training_state_module
  ON public.discovery_call_training_state(module_id);

ALTER TABLE public.discovery_call_training_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS discovery_call_training_state_select ON public.discovery_call_training_state;
CREATE POLICY discovery_call_training_state_select
ON public.discovery_call_training_state FOR SELECT TO authenticated
USING (public.is_admin() OR user_id=(SELECT auth.uid()));

GRANT SELECT ON public.discovery_call_training_state TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.discovery_call_training_state FROM authenticated, anon;

UPDATE public.training_modules
SET title='Discovery / Call Script',
    description='Diagnose before you prescribe. Learn to uncover the current state, root problem, business impact, desired outcome, urgency, buying process, service fit, and mutually agreed next step.',
    module_type='practical',
    required=true,
    active=true,
    passing_score=85,
    requires_admin_review=false,
    updated_at=now()
WHERE slug='discovery-script';

-- Module 9 was an empty production placeholder at implementation start.
DELETE FROM public.training_lessons WHERE module_id=(SELECT id FROM public.training_modules WHERE slug='discovery-script');
DELETE FROM public.training_assessment_questions WHERE module_id=(SELECT id FROM public.training_modules WHERE slug='discovery-script');
DELETE FROM public.training_acknowledgements WHERE module_id=(SELECT id FROM public.training_modules WHERE slug='discovery-script');

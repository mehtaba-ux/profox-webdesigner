ALTER TABLE public.mock_call_sessions
  ADD COLUMN IF NOT EXISTS trainee_block_id uuid REFERENCES public.booking_availability_blocks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evaluator_block_id uuid REFERENCES public.booking_availability_blocks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS not_before_at timestamptz;

ALTER TABLE public.call_practice_state
  ADD COLUMN IF NOT EXISTS drill_reflections jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.system_configuration
SET config_value = config_value || jsonb_build_object('requireSalesCertification',true,'requireMeetingUrlForAutoAssignment',false,'evaluationGraceHours',24), updated_at=now()
WHERE config_key='mock_call_automation_settings';

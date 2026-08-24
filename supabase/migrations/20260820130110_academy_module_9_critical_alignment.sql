-- Align the approved Module 9 ten-category critical-failure standard.
UPDATE public.training_assessment_questions
SET critical=true,updated_at=now()
WHERE module_id=(SELECT id FROM public.training_modules WHERE slug='discovery-script')
  AND case_key IN ('price_transparency','technical_unknown');

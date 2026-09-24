-- Secure, Admin-editable assessment + acknowledgement framework for Module 2.
-- Existing trainee progress is preserved.

CREATE TABLE IF NOT EXISTS public.training_assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  prompt text NOT NULL CHECK (length(trim(prompt)) > 0),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) >= 2),
  correct_index integer NOT NULL CHECK (correct_index >= 0),
  explanation text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 1 CHECK (sort_order > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_assessment_correct_index_valid CHECK (correct_index < jsonb_array_length(options)),
  CONSTRAINT training_assessment_module_order_unique UNIQUE (module_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.training_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  statement text NOT NULL CHECK (length(trim(statement)) > 0),
  sort_order integer NOT NULL DEFAULT 1 CHECK (sort_order > 0),
  required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_acknowledgements_module_order_unique UNIQUE (module_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_training_assessment_questions_module_active_order
  ON public.training_assessment_questions(module_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_training_acknowledgements_module_active_order
  ON public.training_acknowledgements(module_id, active, sort_order);

ALTER TABLE public.training_assessment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_assessment_questions_admin_all ON public.training_assessment_questions;
CREATE POLICY training_assessment_questions_admin_all
ON public.training_assessment_questions
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS training_acknowledgements_admin_all ON public.training_acknowledgements;
CREATE POLICY training_acknowledgements_admin_all
ON public.training_acknowledgements
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.training_assessment_questions FROM anon;
REVOKE ALL ON TABLE public.training_acknowledgements FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_assessment_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_acknowledgements TO authenticated;

UPDATE public.training_modules
SET passing_score = 90,
    module_type = 'lesson',
    updated_at = now()
WHERE slug = 'agreement-rules';

-- The real knowledge check and acknowledgements are interactive steps, not answer-sheet lessons.
DELETE FROM public.training_lessons
WHERE module_id = (SELECT id FROM public.training_modules WHERE slug='agreement-rules' LIMIT 1)
  AND sort_order >= 12;

DELETE FROM public.training_assessment_questions
WHERE module_id = (SELECT id FROM public.training_modules WHERE slug='agreement-rules' LIMIT 1);

INSERT INTO public.training_assessment_questions(module_id,prompt,options,correct_index,explanation,sort_order,active)
SELECT m.id, v.prompt, v.options::jsonb, v.correct_index, v.explanation, v.sort_order, true
FROM public.training_modules m
CROSS JOIN (VALUES
(1,'A qualified prospect says, “Give me 20% off and I’ll pay today.” What is the correct ProFox response?',
 '["Promise the discount to secure the payment","Understand what is driving the objection, keep the current approved offer, and obtain Admin approval before any commercial change","Reduce the price but remove scope later","Ask the client to pay you personally so you can adjust the amount"]',1,
 'Discounts are controlled commercial decisions. Diagnose the concern first and never change approved pricing without authorization.'),
(2,'A customer sends you a screenshot showing that they transferred the deposit. Can you mark the opportunity Won?',
 '["Yes, a screenshot is sufficient proof","No. Record or forward the evidence and wait for the approved payment-verification process","Yes, if the client is trustworthy","Yes, but only for website projects"]',1,
 'Payment evidence is not payment verification. The deal becomes Won only through the approved verified-payment transition.'),
(3,'A prospect asks whether ProFox can integrate with a proprietary system you have never seen. What should you do?',
 '["Say yes so the opportunity keeps moving","Capture the requirement and have the technical team validate feasibility, scope and commercial impact before commitment","Tell them every integration is included by default","Ignore the requirement until after payment"]',1,
 'Unknown custom requirements must be validated before they become part of a scope or promise.'),
(4,'A prospect asks for a proposal after five minutes, but you do not know the business impact, budget reality, decision maker or buying process. Is the opportunity qualified?',
 '["Yes, asking for a proposal means the deal is qualified","No. Continue discovery before investing heavily in a high-value proposal","Yes, if the company has a professional website","Yes, if the prospect replied quickly"]',1,
 'Interest is useful, but qualification requires clarity about the problem, value, authority, timing, commercial fit and decision process.'),
(5,'Your contact loves the solution but says their managing director must approve the investment. What is the best next move?',
 '["Stop speaking with the current contact and contact the managing director secretly","Respect the contact, understand the approval process, and work with them to involve the managing director appropriately","Send a discount immediately","Assume the contact can approve anyway"]',1,
 'A non-economic buyer may still be a valuable champion. Understand authority without undermining the relationship.'),
(6,'A prospect shows you an old screenshot with a lower package price. Which price should guide a new quotation?',
 '["The old screenshot because the prospect saw it first","The current Admin-approved commercial information in the ProFox system","Whichever price is easiest to close","An average of the old and current price"]',1,
 'Current Admin-controlled commercial configuration is the source of truth for new business unless an authorized exception is approved.'),
(7,'A prospect asks why another agency is “bad.” How should you respond?',
 '["Invent weaknesses so ProFox looks stronger","Compare ProFox on relevant approach, scope, process, fit, capability and customer experience without making unsupported attacks","Agree with anything negative the prospect says","Refuse to discuss the buying decision at all"]',1,
 'Professional sellers differentiate through evidence and fit, not unsupported attacks on competitors.'),
(8,'You independently discover a company, but the CRM already shows an active opportunity owned by another ProFox representative. Can you claim it as self-sourced?',
 '["Yes, because you found the company independently","No. Follow the attribution rules and escalate a genuine ownership dispute using CRM history and evidence","Yes, if your commission would be higher","Yes, after deleting the existing lead record"]',1,
 'Lead-source integrity protects fair attribution, collaboration and commission accuracy.'),
(9,'A prospect says they will sign only if you guarantee a #1 Google ranking. What should you do?',
 '["Guarantee it because closing is the priority","Do not make an unsupported guarantee; explain approved objectives, evidence, capabilities and realistic expectations","Guarantee it verbally but omit it from the quotation","Promise the result only if the project is high value"]',1,
 'Never guarantee outcomes outside your control unless a specific claim is formally approved and supported.'),
(10,'A strong discovery call ends with the prospect saying, “Sounds good. We’ll speak soon.” What should happen before the call ends?',
 '["Nothing; wait for the prospect to contact you","Agree on a specific next action, identify the owner, set a date or time where possible, and record it in CRM","Send a payment link without agreement","Mark the deal as Won because the meeting went well"]',1,
 'High-ticket momentum requires a clear next action, owner and timing—not a vague promise to reconnect.')
) AS v(sort_order,prompt,options,correct_index,explanation)
WHERE m.slug='agreement-rules';

DELETE FROM public.training_acknowledgements
WHERE module_id = (SELECT id FROM public.training_modules WHERE slug='agreement-rules' LIMIT 1);

INSERT INTO public.training_acknowledgements(module_id,statement,sort_order,required,active)
SELECT m.id, v.statement, v.sort_order, true, true
FROM public.training_modules m
CROSS JOIN (VALUES
(1,'I understand that my signed Sales Partner Agreement governs my relationship with ProFox and this training does not replace it.'),
(2,'I understand the limits of my authority and will not create unauthorized commitments for ProFox.'),
(3,'I will use current Admin-approved pricing, packages, quotations and commercial terms.'),
(4,'I will not offer unauthorized discounts, free work, guarantees or custom scope.'),
(5,'I will keep CRM records accurate and will not manipulate lead attribution or sales records.'),
(6,'I will never collect ProFox client payments through an unauthorized personal account or verify payments myself.'),
(7,'I understand that a sale becomes Won only through the approved payment-verification process.'),
(8,'I will protect customer, prospect and Company information.'),
(9,'When I am uncertain about scope, pricing, legal terms, technical feasibility or authority, I will confirm before committing.'),
(10,'I will prioritize truthful, professional, customer-fit selling over earning a commission from a bad sale.')
) AS v(sort_order,statement)
WHERE m.slug='agreement-rules';

CREATE OR REPLACE FUNCTION public.can_access_sales_academy_module(p_module_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT EXISTS(SELECT 1 FROM public.training_modules m WHERE m.id=p_module_id AND m.active=true)
     AND (
       public.is_admin()
       OR EXISTS (
         SELECT 1 FROM public.applicants a
         WHERE a.linked_user_id=auth.uid()
           AND a.stage = ANY (ARRAY['One-Day Training'::text,'Final Approval'::text,'Ready for System Access'::text,'Activated'::text])
       )
       OR public.has_active_role(ARRAY['sales'::text])
     );
$$;

REVOKE ALL ON FUNCTION public.can_access_sales_academy_module(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_sales_academy_module(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_training_module_assessment(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_result jsonb;
  v_passing integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.can_access_sales_academy_module(p_module_id) THEN RAISE EXCEPTION 'Training module access denied.'; END IF;

  SELECT COALESCE(passing_score,90) INTO v_passing FROM public.training_modules WHERE id=p_module_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',q.id,
    'prompt',q.prompt,
    'options',q.options,
    'sortOrder',q.sort_order
  ) ORDER BY q.sort_order),'[]'::jsonb)
  INTO v_result
  FROM public.training_assessment_questions q
  WHERE q.module_id=p_module_id AND q.active=true;

  RETURN jsonb_build_object('passingScore',v_passing,'questions',v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_training_module_acknowledgements(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.can_access_sales_academy_module(p_module_id) THEN RAISE EXCEPTION 'Training module access denied.'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'statement',a.statement,
    'sortOrder',a.sort_order,
    'required',a.required
  ) ORDER BY a.sort_order),'[]'::jsonb)
  INTO v_result
  FROM public.training_acknowledgements a
  WHERE a.module_id=p_module_id AND a.active=true;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_training_module_assessment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_training_module_acknowledgements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_training_module_assessment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_module_acknowledgements(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_training_module_assessment(p_progress_id uuid,p_answers integer[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_progress public.user_training_progress%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_question public.training_assessment_questions%ROWTYPE;
  v_count integer;
  v_index integer := 0;
  v_correct integer := 0;
  v_score integer;
  v_passed boolean;
  v_feedback jsonb := '[]'::jsonb;
  v_event_time timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training progress record not found.'; END IF;
  IF v_progress.user_id<>auth.uid() THEN RAISE EXCEPTION 'You may only submit your own assessment.'; END IF;

  SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND active=true;
  IF NOT FOUND OR v_module.slug<>'agreement-rules' THEN RAISE EXCEPTION 'This module does not use the Agreement & Sales Rules assessment.'; END IF;

  SELECT count(*) INTO v_count FROM public.training_assessment_questions q WHERE q.module_id=v_module.id AND q.active=true;
  IF v_count=0 THEN RAISE EXCEPTION 'No active assessment questions are configured.'; END IF;
  IF COALESCE(array_length(p_answers,1),0)<>v_count THEN RAISE EXCEPTION 'Exactly % assessment answers are required.',v_count; END IF;

  FOR v_question IN
    SELECT * FROM public.training_assessment_questions q
    WHERE q.module_id=v_module.id AND q.active=true
    ORDER BY q.sort_order
  LOOP
    v_index := v_index + 1;
    IF p_answers[v_index]=v_question.correct_index THEN v_correct:=v_correct+1; END IF;
    v_feedback := v_feedback || jsonb_build_array(jsonb_build_object(
      'questionId',v_question.id,
      'correct',p_answers[v_index]=v_question.correct_index,
      'explanation',v_question.explanation
    ));
  END LOOP;

  v_score := round((v_correct::numeric*100)/v_count)::integer;
  v_passed := v_score >= COALESCE(v_module.passing_score,90);

  PERFORM set_config('profox.training_quiz_rpc','1',true);

  INSERT INTO public.training_assignments(user_id,module_id,progress_id,submission_data,created_at,updated_at)
  VALUES(v_progress.user_id,v_module.id,v_progress.id,
    jsonb_build_object('type','agreement_sales_rules_assessment','answers',to_jsonb(p_answers),'score',v_score,'passed',v_passed,'submittedAt',v_event_time),
    v_event_time,v_event_time);

  UPDATE public.user_training_progress
  SET status=CASE WHEN v_passed THEN 'In Progress' ELSE 'Retry Required' END,
      score=v_score,
      progress_percent=CASE WHEN v_passed THEN 92 ELSE 75 END,
      completed_at=NULL,
      updated_at=v_event_time
  WHERE id=v_progress.id;

  RETURN jsonb_build_object(
    'score',v_score,
    'passed',v_passed,
    'passingScore',COALESCE(v_module.passing_score,90),
    'feedback',v_feedback,
    'status',CASE WHEN v_passed THEN 'In Progress' ELSE 'Retry Required' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_training_module_assessment(uuid,integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_training_module_assessment(uuid,integer[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_training_module_acknowledgement(p_progress_id uuid,p_ack_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_progress public.user_training_progress%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_required integer;
  v_matched integer;
  v_snapshot jsonb;
  v_event_time timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT * INTO v_progress FROM public.user_training_progress WHERE id=p_progress_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Training progress record not found.'; END IF;
  IF v_progress.user_id<>auth.uid() THEN RAISE EXCEPTION 'You may only acknowledge your own training rules.'; END IF;

  SELECT * INTO v_module FROM public.training_modules WHERE id=v_progress.module_id AND active=true;
  IF NOT FOUND OR v_module.slug<>'agreement-rules' THEN RAISE EXCEPTION 'This module does not use the Agreement & Sales Rules acknowledgement.'; END IF;

  IF COALESCE(v_progress.score,0) < COALESCE(v_module.passing_score,90) THEN
    RAISE EXCEPTION 'Pass the knowledge check before completing the acknowledgement.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.training_assignments ta
    WHERE ta.user_id=v_progress.user_id AND ta.module_id=v_module.id AND ta.progress_id=v_progress.id
      AND ta.submission_data->>'type'='agreement_sales_rules_assessment'
      AND COALESCE((ta.submission_data->>'passed')::boolean,false)=true
  ) THEN
    RAISE EXCEPTION 'A passing assessment attempt is required before acknowledgement.';
  END IF;

  SELECT count(*) INTO v_required
  FROM public.training_acknowledgements a
  WHERE a.module_id=v_module.id AND a.active=true AND a.required=true;

  SELECT count(DISTINCT a.id) INTO v_matched
  FROM public.training_acknowledgements a
  WHERE a.module_id=v_module.id AND a.active=true AND a.required=true
    AND a.id=ANY(COALESCE(p_ack_ids,ARRAY[]::uuid[]));

  IF v_required<>v_matched THEN RAISE EXCEPTION 'All required acknowledgement statements must be confirmed.'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'statement',a.statement,'required',a.required) ORDER BY a.sort_order),'[]'::jsonb)
  INTO v_snapshot
  FROM public.training_acknowledgements a
  WHERE a.module_id=v_module.id AND a.active=true AND a.id=ANY(COALESCE(p_ack_ids,ARRAY[]::uuid[]));

  PERFORM set_config('profox.training_agreement_rules_rpc','1',true);

  INSERT INTO public.training_assignments(user_id,module_id,progress_id,submission_data,created_at,updated_at)
  VALUES(v_progress.user_id,v_module.id,v_progress.id,
    jsonb_build_object('type','agreement_sales_rules_acknowledgement','acknowledgements',v_snapshot,'acknowledgedAt',v_event_time),
    v_event_time,v_event_time);

  UPDATE public.user_training_progress
  SET status='Completed',progress_percent=100,completed_at=v_event_time,updated_at=v_event_time
  WHERE id=v_progress.id;

  RETURN jsonb_build_object('completed',true,'status','Completed','completedAt',v_event_time);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_training_module_acknowledgement(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_training_module_acknowledgement(uuid,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_training_progress_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_module public.training_modules%ROWTYPE;
  v_quiz_rpc text := COALESCE(current_setting('profox.training_quiz_rpc', true), '');
  v_agreement_rules_rpc text := COALESCE(current_setting('profox.training_agreement_rules_rpc', true), '');
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Training progress may only be changed by its owner or an Admin.';
  END IF;

  SELECT * INTO v_module FROM public.training_modules WHERE id=NEW.module_id;
  IF NOT FOUND OR v_module.active IS NOT TRUE THEN RAISE EXCEPTION 'Training module is missing or inactive.'; END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_status IS NOT NULL OR COALESCE(trim(NEW.feedback),'')<>'' THEN
      RAISE EXCEPTION 'Training review fields are Admin-only.';
    END IF;
    IF NEW.score IS NOT NULL AND v_quiz_rpc<>'1' THEN RAISE EXCEPTION 'Training scores must be recorded through the secure quiz/review workflow.'; END IF;
    IF v_module.requires_admin_review AND NEW.status IN ('Passed','Completed','Retry Required') THEN RAISE EXCEPTION 'This module requires Admin review before it can be passed.'; END IF;
  ELSE
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.module_id IS DISTINCT FROM OLD.module_id THEN RAISE EXCEPTION 'Training progress ownership and module are immutable.'; END IF;
    IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.review_status IS DISTINCT FROM OLD.review_status OR NEW.feedback IS DISTINCT FROM OLD.feedback THEN
      RAISE EXCEPTION 'Training review fields are Admin-only.';
    END IF;
    IF NEW.score IS DISTINCT FROM OLD.score AND v_quiz_rpc<>'1' THEN RAISE EXCEPTION 'Training scores must be recorded through the secure quiz/review workflow.'; END IF;
    IF v_module.requires_admin_review AND NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status THEN RAISE EXCEPTION 'This module requires Admin review before it can be passed.'; END IF;
    IF v_module.slug='product-training'
       AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.score IS DISTINCT FROM OLD.score)
       AND NEW.status IN ('Passed','Retry Required','Completed') AND v_quiz_rpc<>'1' THEN
      RAISE EXCEPTION 'Product quiz results must be recorded through the secure quiz workflow.';
    END IF;
    IF v_module.slug='agreement-rules' THEN
      IF NEW.score IS DISTINCT FROM OLD.score AND v_quiz_rpc<>'1' THEN
        RAISE EXCEPTION 'Agreement & Sales Rules assessment scores must be recorded through the secure assessment workflow.';
      END IF;
      IF NEW.status='Retry Required' AND OLD.status IS DISTINCT FROM NEW.status AND v_quiz_rpc<>'1' THEN
        RAISE EXCEPTION 'Agreement & Sales Rules retry status must come from the secure assessment workflow.';
      END IF;
      IF NEW.status IN ('Passed','Completed') AND OLD.status IS DISTINCT FROM NEW.status AND v_agreement_rules_rpc<>'1' THEN
        RAISE EXCEPTION 'Agreement & Sales Rules can only be completed after the secure knowledge check and acknowledgement.';
      END IF;
    END IF;
  END IF;

  IF v_module.requires_admin_review AND NEW.status NOT IN ('Not Started','In Progress','Submitted','Retry Required') THEN RAISE EXCEPTION 'Reviewed modules may only be submitted by trainees; pass/fail is Admin-controlled.'; END IF;

  IF NOT v_module.requires_admin_review AND NEW.status IN ('Passed','Completed') AND v_module.passing_score IS NOT NULL AND COALESCE(NEW.score,0) < v_module.passing_score THEN
    RAISE EXCEPTION 'Passing score of % is required for this module.',v_module.passing_score;
  END IF;

  NEW.progress_percent := GREATEST(0,LEAST(COALESCE(NEW.progress_percent,0),100));
  NEW.attempts := GREATEST(COALESCE(NEW.attempts,0),0);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_training_module_assessment(uuid,integer[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_training_module_acknowledgement(uuid,uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_training_module_assessment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_training_module_acknowledgements(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_training_module_assessment(uuid,integer[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_training_module_acknowledgement(uuid,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_module_assessment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_module_acknowledgements(uuid) TO authenticated;

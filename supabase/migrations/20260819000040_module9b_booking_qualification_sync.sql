-- Module 9B — Keep public booking context useful, valid and synchronized inside the existing meeting workflow.
-- Structured qualification JSON remains in public_booking_submissions. All configured answers are mirrored into
-- the meeting preparation summary, while standard commercial/timeline/decision answers also fill dedicated fields.

CREATE OR REPLACE FUNCTION public.validate_public_booking_qualification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_settings jsonb;
  v_question jsonb;
  v_question_id text;
  v_question_type text;
  v_answer text;
  v_required boolean;
  v_option_valid boolean;
BEGIN
  IF NEW.qualification_answers IS NULL OR jsonb_typeof(NEW.qualification_answers) <> 'object' THEN
    RAISE EXCEPTION 'Qualification answers must be submitted as an object.';
  END IF;

  SELECT COALESCE(config_value,'{}'::jsonb)
  INTO v_settings
  FROM public.system_configuration
  WHERE config_key='public_booking_settings';
  v_settings := COALESCE(v_settings,'{}'::jsonb);

  FOR v_question IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_settings->'qualificationQuestions','[]'::jsonb))
  LOOP
    v_question_id := trim(COALESCE(v_question->>'id',''));
    v_question_type := lower(trim(COALESCE(v_question->>'type','text')));
    v_required := COALESCE((v_question->>'required')::boolean,false);
    v_answer := CASE WHEN v_question_id<>'' THEN trim(COALESCE(NEW.qualification_answers->>v_question_id,'')) ELSE '' END;

    IF v_required AND (v_question_id='' OR v_answer='') THEN
      RAISE EXCEPTION 'Please answer all required qualification questions.';
    END IF;

    IF v_answer<>'' AND v_question_type='select' THEN
      SELECT EXISTS(
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(v_question->'options','[]'::jsonb)) option_value
        WHERE option_value=v_answer
      ) INTO v_option_valid;
      IF NOT v_option_valid THEN
        RAISE EXCEPTION 'A qualification answer is not one of the configured options.';
      END IF;
    END IF;
  END LOOP;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_public_booking_qualification ON public.public_booking_submissions;
CREATE TRIGGER trg_validate_public_booking_qualification
BEFORE INSERT OR UPDATE OF qualification_answers ON public.public_booking_submissions
FOR EACH ROW EXECUTE FUNCTION public.validate_public_booking_qualification();

CREATE OR REPLACE FUNCTION public.sync_public_booking_qualification_to_meeting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_settings jsonb;
  v_question jsonb;
  v_question_id text;
  v_label text;
  v_answer text;
  v_summary text := '';
BEGIN
  SELECT COALESCE(config_value,'{}'::jsonb)
  INTO v_settings
  FROM public.system_configuration
  WHERE config_key='public_booking_settings';
  v_settings := COALESCE(v_settings,'{}'::jsonb);

  FOR v_question IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_settings->'qualificationQuestions','[]'::jsonb))
  LOOP
    v_question_id := trim(COALESCE(v_question->>'id',''));
    v_label := trim(COALESCE(v_question->>'label',v_question_id));
    v_answer := trim(COALESCE(NEW.qualification_answers->>v_question_id,''));
    IF v_question_id <> '' AND v_answer <> '' THEN
      v_summary := concat_ws(E'\n',NULLIF(v_summary,''),v_label||': '||v_answer);
    END IF;
  END LOOP;

  UPDATE public.sales_meetings
  SET requirements_summary = left(
        CASE WHEN trim(COALESCE(v_summary,''))<>''
          THEN 'Public booking qualification:'||E'\n'||v_summary
          ELSE COALESCE(NEW.qualification_answers->>'project_goal','')
        END,
        8000
      ),
      commercial_notes = left(COALESCE(NEW.qualification_answers->>'budget_range',''), 2000),
      timeline_notes = left(COALESCE(NEW.qualification_answers->>'timeline',''), 2000),
      decision_makers = left(COALESCE(NEW.qualification_answers->>'decision_maker',''), 2000),
      updated_at = now()
  WHERE id = NEW.meeting_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_public_booking_qualification_to_meeting ON public.public_booking_submissions;
CREATE TRIGGER trg_sync_public_booking_qualification_to_meeting
AFTER INSERT OR UPDATE OF qualification_answers ON public.public_booking_submissions
FOR EACH ROW EXECUTE FUNCTION public.sync_public_booking_qualification_to_meeting();

CREATE OR REPLACE FUNCTION public.sync_public_booking_status_from_meeting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status='Cancelled' AND OLD.status IS DISTINCT FROM 'Cancelled' THEN
    UPDATE public.public_booking_submissions
    SET status='Cancelled',updated_at=now()
    WHERE meeting_id=NEW.id AND status<>'Cancelled';
  ELSIF NEW.status IN ('Scheduled','Rescheduled') AND OLD.status='Cancelled' THEN
    UPDATE public.public_booking_submissions
    SET status='Confirmed',updated_at=now()
    WHERE meeting_id=NEW.id AND status='Cancelled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_public_booking_status_from_meeting ON public.sales_meetings;
CREATE TRIGGER trg_sync_public_booking_status_from_meeting
AFTER UPDATE OF status ON public.sales_meetings
FOR EACH ROW EXECUTE FUNCTION public.sync_public_booking_status_from_meeting();

REVOKE ALL ON FUNCTION public.validate_public_booking_qualification() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_public_booking_qualification_to_meeting() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_public_booking_status_from_meeting() FROM PUBLIC,anon,authenticated;
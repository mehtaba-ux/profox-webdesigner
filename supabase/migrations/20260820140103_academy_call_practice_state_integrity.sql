-- Server-side integrity for Module 10 drill reflections and full-rehearsal coaching evidence.

CREATE OR REPLACE FUNCTION public.enforce_call_practice_state_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_item jsonb;
  v_count integer;
  v_distinct integer;
  v_min integer;
  v_max integer;
BEGIN
  FOREACH v_id IN ARRAY COALESCE(NEW.completed_drill_ids,'{}'::uuid[])
  LOOP
    IF length(trim(COALESCE(NEW.drill_reflections->>v_id::text,'')))<10 THEN
      RAISE EXCEPTION 'Each completed practice drill requires a meaningful reflection.';
    END IF;
  END LOOP;

  IF jsonb_typeof(COALESCE(NEW.rehearsals,'[]'::jsonb))<>'array' THEN
    RAISE EXCEPTION 'Call Practice rehearsals must be stored as an array.';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.rehearsals,'[]'::jsonb))
  LOOP
    IF COALESCE((v_item->>'rehearsalNo')::integer,0)<1 THEN RAISE EXCEPTION 'Each rehearsal requires a valid sequence number.'; END IF;
    IF length(trim(COALESCE(v_item->>'reflection','')))<20 THEN RAISE EXCEPTION 'Each full rehearsal requires a meaningful self-coaching reflection.'; END IF;
    IF COALESCE((v_item->>'score')::integer,-1) NOT BETWEEN 0 AND 20 THEN RAISE EXCEPTION 'Rehearsal self-score must be between 0 and 20.'; END IF;
  END LOOP;
  SELECT count(*),count(DISTINCT (value->>'rehearsalNo')::integer),min((value->>'rehearsalNo')::integer),max((value->>'rehearsalNo')::integer)
  INTO v_count,v_distinct,v_min,v_max FROM jsonb_array_elements(COALESCE(NEW.rehearsals,'[]'::jsonb));
  IF v_count>0 AND (v_distinct<>v_count OR v_min<>1 OR v_max<>v_count) THEN
    RAISE EXCEPTION 'Full rehearsals must be completed once each in sequence.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_call_practice_state_integrity ON public.call_practice_state;
CREATE TRIGGER trg_enforce_call_practice_state_integrity
BEFORE INSERT OR UPDATE ON public.call_practice_state
FOR EACH ROW EXECUTE FUNCTION public.enforce_call_practice_state_integrity();

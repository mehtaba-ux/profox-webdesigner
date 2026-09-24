-- Sales Academy Module 8 — protect certification-controlled progress fields.

CREATE OR REPLACE FUNCTION public.protect_meeting_booking_progress_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_slug text;
  v_rpc text:=COALESCE(current_setting('profox.training_meeting_booking_rpc',true),'');
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  SELECT slug INTO v_slug FROM public.training_modules WHERE id=NEW.module_id;
  IF v_slug<>'meeting-booking' THEN RETURN NEW; END IF;
  IF v_rpc='1' THEN RETURN NEW; END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.status IN ('Passed','Completed','Retry Required','Submitted')
       OR NEW.score IS NOT NULL
       OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Module 8 certification status is controlled by the secure Meeting Booking assessment workflow.';
    END IF;
  ELSE
    IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Passed','Completed','Retry Required','Submitted'))
       OR NEW.score IS DISTINCT FROM OLD.score
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'Module 8 certification result is controlled by the secure Meeting Booking assessment workflow.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_meeting_booking_progress_write ON public.user_training_progress;
CREATE TRIGGER trg_protect_meeting_booking_progress_write
BEFORE INSERT OR UPDATE ON public.user_training_progress
FOR EACH ROW EXECUTE FUNCTION public.protect_meeting_booking_progress_write();

-- Module 11D hardening: stage cycle identity must change for every genuine stage entry,
-- including multiple transitions inside one database transaction.
CREATE OR REPLACE FUNCTION public.track_project_stage_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public,pg_temp
AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.stage_changed_at:=COALESCE(NEW.stage_changed_at,clock_timestamp());
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
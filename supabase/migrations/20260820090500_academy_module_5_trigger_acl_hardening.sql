-- Trigger functions do not need to be exposed as PostgREST RPCs.
REVOKE ALL ON FUNCTION public.protect_lead_research_assignment_write() FROM PUBLIC,anon,authenticated;

-- These helpers are created by the preceding repository migration path and likewise must not be API-callable.
DO $$ BEGIN
  IF to_regprocedure('public.protect_module5_submitted_transition()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.protect_module5_submitted_transition() FROM PUBLIC,anon,authenticated';
  END IF;
  IF to_regprocedure('public.block_generic_module5_review()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.block_generic_module5_review() FROM PUBLIC,anon,authenticated';
  END IF;
END $$;

-- Allow the dedicated Module 7 RPC to clear prior Admin review fields/score when a trainee
-- legitimately resubmits after Retry Required. Direct learner mutations remain blocked.
DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.protect_training_progress_fields()'::regprocedure) INTO v_def;
  v_def:=replace(v_def,
    '       AND NOT (v_module.slug=''loom-outreach'' AND v_loom_rpc=''1'') THEN',
    '       AND NOT (v_module.slug=''loom-outreach'' AND v_loom_rpc=''1'')' || E'\n' ||
    '       AND NOT (v_module.slug=''outreach-cadence'' AND v_outreach_rpc=''1'') THEN');
  v_def:=replace(v_def,
    'AND v_lead_research_rpc<>''1'' AND v_loom_rpc<>''1'' THEN',
    'AND v_lead_research_rpc<>''1'' AND v_loom_rpc<>''1'' AND v_outreach_rpc<>''1'' THEN');
  EXECUTE v_def;
END $do$;

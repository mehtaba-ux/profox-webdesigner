-- Require Module 7 learner submissions to pass through the dedicated secure workflow
-- and prevent the generic Admin reviewer from bypassing the Module 7 rubric/critical-failure rules.

DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.protect_training_progress_fields()'::regprocedure) INTO v_def;
  IF position('profox.training_outreach_rpc' in v_def)=0 THEN
    v_def:=replace(v_def,
      '  v_loom_rpc text:=COALESCE(current_setting(''profox.training_loom_rpc'',true),'''');',
      '  v_loom_rpc text:=COALESCE(current_setting(''profox.training_loom_rpc'',true),'''');' || E'\n' ||
      '  v_outreach_rpc text:=COALESCE(current_setting(''profox.training_outreach_rpc'',true),'''');');
    v_def:=replace(v_def,
      '    IF v_module.slug=''loom-outreach'' AND NEW.status=''Submitted'' AND v_loom_rpc<>''1'' THEN RAISE EXCEPTION ''Personalized Loom Outreach must be submitted through the secure Module 6 workflow.''; END IF;',
      '    IF v_module.slug=''loom-outreach'' AND NEW.status=''Submitted'' AND v_loom_rpc<>''1'' THEN RAISE EXCEPTION ''Personalized Loom Outreach must be submitted through the secure Module 6 workflow.''; END IF;' || E'\n' ||
      '    IF v_module.slug=''outreach-cadence'' AND NEW.status=''Submitted'' AND v_outreach_rpc<>''1'' THEN RAISE EXCEPTION ''Outreach Messages & Follow-Up must be submitted through the secure Module 7 workflow.''; END IF;');
    v_def:=replace(v_def,
      '    IF v_module.slug=''loom-outreach'' AND NEW.status=''Submitted'' AND OLD.status IS DISTINCT FROM NEW.status AND v_loom_rpc<>''1'' THEN RAISE EXCEPTION ''Personalized Loom Outreach must be submitted through the secure Module 6 workflow.''; END IF;',
      '    IF v_module.slug=''loom-outreach'' AND NEW.status=''Submitted'' AND OLD.status IS DISTINCT FROM NEW.status AND v_loom_rpc<>''1'' THEN RAISE EXCEPTION ''Personalized Loom Outreach must be submitted through the secure Module 6 workflow.''; END IF;' || E'\n' ||
      '    IF v_module.slug=''outreach-cadence'' AND NEW.status=''Submitted'' AND OLD.status IS DISTINCT FROM NEW.status AND v_outreach_rpc<>''1'' THEN RAISE EXCEPTION ''Outreach Messages & Follow-Up must be submitted through the secure Module 7 workflow.''; END IF;');
    EXECUTE v_def;
  END IF;
END $do$;

DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.admin_review_training_progress(uuid,text,text,integer)'::regprocedure) INTO v_def;
  IF position('dedicated Outreach Messaging rubric review workflow' in v_def)=0 THEN
    v_def:=replace(v_def,
      '  IF v_module.slug=''loom-outreach'' THEN RAISE EXCEPTION ''Use the dedicated Personalized Loom Outreach rubric review workflow for Module 6.''; END IF;',
      '  IF v_module.slug=''loom-outreach'' THEN RAISE EXCEPTION ''Use the dedicated Personalized Loom Outreach rubric review workflow for Module 6.''; END IF;' || E'\n' ||
      '  IF v_module.slug=''outreach-cadence'' THEN RAISE EXCEPTION ''Use the dedicated Outreach Messaging rubric review workflow for Module 7.''; END IF;');
    EXECUTE v_def;
  END IF;
END $do$;

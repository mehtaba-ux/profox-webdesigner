-- Module 12 — bridge actionable business exceptions into Module 11 Today without duplicating source records.

DO $$
BEGIN
  IF to_regprocedure('public.get_productivity_command_center_base(text)') IS NULL
     AND to_regprocedure('public.get_productivity_command_center(text)') IS NOT NULL THEN
    ALTER FUNCTION public.get_productivity_command_center(text) RENAME TO get_productivity_command_center_base;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.get_productivity_command_center_base(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_productivity_command_center(p_scope text DEFAULT 'mine')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base jsonb;
  v_exceptions jsonb;
  v_mapped jsonb;
  v_items jsonb;
  v_counts jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  v_base:=public.get_productivity_command_center_base(p_scope);
  v_exceptions:=public.get_business_intelligence_exceptions(p_scope);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'itemKey','bi:'||(e->>'exceptionKey'),
    'sourceType','business_intelligence',
    'entityType',e->>'entityType',
    'entityId',e->>'entityId',
    'title',e->>'title',
    'subtitle',e->>'detail',
    'dueAt',NULL,
    'priorityScore',COALESCE((e->>'priorityScore')::integer,75),
    'bucket',COALESCE(NULLIF(e->>'bucket',''),'Do Now'),
    'actionLabel',COALESCE(NULLIF(e->>'actionLabel',''),'Review'),
    'actionKey','open',
    'actionUrl',COALESCE(NULLIF(e->>'actionUrl',''),'/admin/today'),
    'quick',false,
    'requiresConfirmation',false,
    'metadata',COALESCE(e->'metadata','{}'::jsonb)||jsonb_build_object('businessIntelligence',true,'severity',e->>'severity','area',e->>'area','exceptionType',e->>'type')
  )),'[]'::jsonb) INTO v_mapped FROM jsonb_array_elements(v_exceptions) e;

  WITH all_items AS (
    SELECT value item FROM jsonb_array_elements(COALESCE(v_base->'items','[]'::jsonb)||COALESCE(v_mapped,'[]'::jsonb))
  ), dedup AS (
    SELECT DISTINCT ON (item->>'entityType',item->>'entityId') item
    FROM all_items
    ORDER BY item->>'entityType',item->>'entityId',COALESCE((item->>'priorityScore')::integer,0) DESC
  ), ranked AS (
    SELECT item FROM dedup ORDER BY COALESCE((item->>'priorityScore')::integer,0) DESC,(item->>'dueAt') NULLS LAST LIMIT 40
  )
  SELECT COALESCE(jsonb_agg(item ORDER BY COALESCE((item->>'priorityScore')::integer,0) DESC,(item->>'dueAt') NULLS LAST),'[]'::jsonb)
  INTO v_items FROM ranked;

  SELECT jsonb_build_object(
    'doNow',COALESCE((SELECT count(*) FROM jsonb_array_elements(v_items) x WHERE x->>'bucket'='Do Now'),0),
    'overdue',COALESCE((SELECT count(*) FROM jsonb_array_elements(v_items) x WHERE x->>'bucket'='Overdue'),0),
    'upcoming',COALESCE((SELECT count(*) FROM jsonb_array_elements(v_items) x WHERE x->>'bucket'='Upcoming'),0),
    'waiting',COALESCE((SELECT count(*) FROM jsonb_array_elements(v_items) x WHERE x->>'bucket'='Waiting'),0),
    'total',jsonb_array_length(v_items)
  ) INTO v_counts;

  RETURN (v_base-'items'-'counts'-'generatedAt') || jsonb_build_object('counts',v_counts,'items',v_items,'generatedAt',now());
END;
$$;

REVOKE ALL ON FUNCTION public.get_productivity_command_center(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_productivity_command_center(text) TO authenticated;

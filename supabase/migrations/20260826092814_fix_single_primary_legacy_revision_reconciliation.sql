create or replace function public.assert_single_primary_quotation_plan(p_quotation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_primary_count integer;
begin
  select count(*)
  into v_primary_count
  from public.quotation_items qi
  join public.sales_products sp on sp.id = qi.sales_product_id
  where qi.quotation_id = p_quotation_id
    and qi.line_type = 'product'
    and sp.product_type in ('package', 'discovery', 'custom');

  if v_primary_count > 1 then
    raise exception 'Only one primary pricing plan may be selected per quotation. Keep one package or discovery offer and add any additional services as add-ons.';
  end if;
end;
$function$;

revoke all on function public.assert_single_primary_quotation_plan(uuid) from public, anon, authenticated;
grant execute on function public.assert_single_primary_quotation_plan(uuid) to postgres, service_role;

create or replace function public.enforce_single_primary_quotation_plan()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_product_type text;
  v_existing_count integer;
begin
  -- Historical clone operations preserve their original commercial evidence.
  if coalesce(current_setting('profox.revision_clone', true), '') = '1' then
    return new;
  end if;

  -- Atomic draft reconciliation can temporarily contain legacy rows that are
  -- removed later in the same RPC. The RPC validates the final reconciled state.
  if coalesce(current_setting('profox.quotation_primary_reconcile', true), '') = '1' then
    return new;
  end if;

  if new.sales_product_id is null or new.line_type <> 'product' then
    return new;
  end if;

  select sp.product_type
  into v_product_type
  from public.sales_products sp
  where sp.id = new.sales_product_id;

  if v_product_type not in ('package', 'discovery', 'custom') then
    return new;
  end if;

  select count(*)
  into v_existing_count
  from public.quotation_items qi
  join public.sales_products sp on sp.id = qi.sales_product_id
  where qi.quotation_id = new.quotation_id
    and qi.line_type = 'product'
    and sp.product_type in ('package', 'discovery', 'custom')
    and qi.id is distinct from new.id;

  if v_existing_count > 0 then
    raise exception 'Only one primary pricing plan may be selected per quotation. Keep one package or discovery offer and add any additional services as add-ons.';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_single_primary_quotation_plan() from public, anon, authenticated;
grant execute on function public.enforce_single_primary_quotation_plan() to postgres, service_role;

do $migration$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'update_quotation_atomic'
    and pg_get_function_identity_arguments(p.oid) = 'p_quotation_id uuid, p_updates jsonb, p_items jsonb';

  if v_definition is null then
    raise exception 'update_quotation_atomic(uuid,jsonb,jsonb) was not found.';
  end if;

  if position('profox.quotation_primary_reconcile' in v_definition) > 0 then
    raise exception 'update_quotation_atomic already contains quotation_primary_reconcile handling.';
  end if;

  v_old := $old$  IF p_items IS NOT NULL AND NOT v_items_locked THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) LOOP$old$;
  v_new := $new$  IF p_items IS NOT NULL AND NOT v_items_locked THEN
    PERFORM set_config('profox.quotation_primary_reconcile','1',true);
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) LOOP$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Could not locate quotation item reconciliation loop in update_quotation_atomic.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$    IF cardinality(v_seen_ids)=0 THEN
      DELETE FROM public.quotation_items WHERE quotation_id=p_quotation_id;
    ELSE
      DELETE FROM public.quotation_items WHERE quotation_id=p_quotation_id AND NOT (id=ANY(v_seen_ids));
    END IF;

    UPDATE public.quotations$old$;
  v_new := $new$    IF cardinality(v_seen_ids)=0 THEN
      DELETE FROM public.quotation_items WHERE quotation_id=p_quotation_id;
    ELSE
      DELETE FROM public.quotation_items WHERE quotation_id=p_quotation_id AND NOT (id=ANY(v_seen_ids));
    END IF;

    -- Validate only after stale legacy rows have been removed. This allows a
    -- legacy revision to be cleaned from multiple packages down to one, while
    -- still rejecting any final payload that contains more than one primary plan.
    PERFORM public.assert_single_primary_quotation_plan(p_quotation_id);
    PERFORM set_config('profox.quotation_primary_reconcile','',true);

    UPDATE public.quotations$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Could not locate stale-line cleanup in update_quotation_atomic.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('profox.quotation_atomic_rpc','',true);
  RAISE;$old$;
  v_new := $new$EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('profox.quotation_primary_reconcile','',true);
  PERFORM set_config('profox.quotation_atomic_rpc','',true);
  RAISE;$new$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Could not locate exception cleanup in update_quotation_atomic.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  execute v_definition;
end;
$migration$;

comment on function public.assert_single_primary_quotation_plan(uuid) is
'Final-state validator for quotation primary plan integrity. Atomic draft reconciliation calls it only after stale lines are removed.';

comment on function public.enforce_single_primary_quotation_plan() is
'Immediate single-primary guard for direct quotation item writes. Atomic draft reconciliation validates the final payload after cleanup; historical clone operations preserve source evidence.';

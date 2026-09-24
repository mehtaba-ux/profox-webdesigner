create or replace function public.admin_upsert_worker_performance_tier(p_tier jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin permission required.'; end if;
  if length(btrim(coalesce(p_tier->>'name','')))<2 then raise exception 'Tier name is required.'; end if;
  if coalesce((p_tier->>'minimumCompletedProjects')::integer,0)<0 then raise exception 'Minimum completed projects cannot be negative.'; end if;
  if coalesce((p_tier->>'minimumQuality')::numeric,0) not between 0 and 100 or coalesce((p_tier->>'minimumOnTimePercent')::numeric,0) not between 0 and 100 or coalesce((p_tier->>'minimumFirstPassPercent')::numeric,0) not between 0 and 100 then raise exception 'Tier percentages must be between 0 and 100.'; end if;
  if p_tier->>'id' is not null then
    update public.worker_performance_tiers set name=btrim(p_tier->>'name'),minimum_completed_projects=coalesce((p_tier->>'minimumCompletedProjects')::integer,0),minimum_quality=coalesce((p_tier->>'minimumQuality')::numeric,0),minimum_on_time_percent=coalesce((p_tier->>'minimumOnTimePercent')::numeric,0),minimum_first_pass_percent=coalesce((p_tier->>'minimumFirstPassPercent')::numeric,0),maximum_revision_average=nullif(p_tier->>'maximumRevisionAverage','')::numeric,eligible_content_types=coalesce(p_tier->'eligibleContentTypes','[]'::jsonb),rate_modifier_percent=coalesce((p_tier->>'rateModifierPercent')::numeric,0),manual_approval_required=coalesce((p_tier->>'manualApprovalRequired')::boolean,true),sort_order=coalesce((p_tier->>'sortOrder')::integer,0),active=coalesce((p_tier->>'active')::boolean,true),updated_by=(select auth.uid()),updated_at=now() where id=(p_tier->>'id')::uuid returning id into v_id;
    if v_id is null then raise exception 'Performance tier not found.'; end if;
  else
    insert into public.worker_performance_tiers(name,minimum_completed_projects,minimum_quality,minimum_on_time_percent,minimum_first_pass_percent,maximum_revision_average,eligible_content_types,rate_modifier_percent,manual_approval_required,sort_order,active,created_by,updated_by)
    values(btrim(p_tier->>'name'),coalesce((p_tier->>'minimumCompletedProjects')::integer,0),coalesce((p_tier->>'minimumQuality')::numeric,0),coalesce((p_tier->>'minimumOnTimePercent')::numeric,0),coalesce((p_tier->>'minimumFirstPassPercent')::numeric,0),nullif(p_tier->>'maximumRevisionAverage','')::numeric,coalesce(p_tier->'eligibleContentTypes','[]'::jsonb),coalesce((p_tier->>'rateModifierPercent')::numeric,0),coalesce((p_tier->>'manualApprovalRequired')::boolean,true),coalesce((p_tier->>'sortOrder')::integer,0),coalesce((p_tier->>'active')::boolean,true),(select auth.uid()),(select auth.uid())) returning id into v_id;
  end if;
  return v_id;
end $$;

revoke all on function public.admin_upsert_worker_performance_tier(jsonb) from public,anon;
grant execute on function public.admin_upsert_worker_performance_tier(jsonb) to authenticated;

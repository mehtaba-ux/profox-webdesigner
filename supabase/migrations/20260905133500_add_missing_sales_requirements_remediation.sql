-- Narrow remediation for legacy paid projects created before the requirements gate
-- was enforced. This does not create a second requirements record: it restores the
-- missing canonical crm_opportunities.requirements_summary and project snapshot.

create or replace function public.record_missing_sales_project_requirements(
  p_project_id uuid,
  p_requirements text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_project public.projects%rowtype;
  v_opp public.crm_opportunities%rowtype;
  v_requirements text:=btrim(coalesce(p_requirements,''));
  v_source_seller boolean:=false;
  v_existing text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;

  select * into v_project
  from public.projects
  where id=p_project_id
  for update;
  if not found then raise exception 'Project not found.'; end if;

  if v_project.status<>'Active' or v_project.stage<>'Sales Handover' then
    raise exception 'Missing Sales requirements can only be restored before the Sales handoff is completed.';
  end if;
  if exists(
    select 1 from public.project_tasks t
    where t.project_id=v_project.id
      and t.workflow_key='sales_handover_submission'
      and t.status='Done'
  ) then
    raise exception 'Sales requirements are locked after the Sales handoff is sent.';
  end if;

  select * into v_opp
  from public.crm_opportunities
  where id=v_project.source_opportunity_id
  for update;
  if not found then raise exception 'Source Sales opportunity not found.'; end if;

  v_source_seller:=v_opp.salesperson_id=v_uid and exists(
    select 1 from public.user_profiles u
    where u.id=v_uid
      and u.status='active'
      and u.role in ('sales','sales_rep','sales_team')
  );
  if not v_source_seller and not public.is_admin() then
    raise exception 'Only the source Seller or an active Administrator may restore missing Sales requirements.';
  end if;

  v_existing:=nullif(btrim(coalesce(v_project.requirements_summary,'')),'');
  if v_existing is not null then
    return jsonb_build_object(
      'projectId',v_project.id,
      'opportunityId',v_opp.id,
      'requirements',v_existing,
      'alreadyCaptured',true,
      'restored',false
    );
  end if;

  -- If Sales requirements already exist on the canonical opportunity but the project
  -- snapshot missed them, repair the snapshot without accepting replacement text.
  v_existing:=nullif(btrim(coalesce(v_opp.requirements_summary,'')),'');
  if v_existing is not null then
    update public.projects
    set requirements_summary=v_existing,updated_at=now()
    where id=v_project.id;

    perform public.crm_write_lead_event(
      v_opp.lead_id,
      'sales_requirements_snapshot_restored',
      'Sales requirements restored to delivery project',
      'The existing confirmed Sales requirements were restored to the canonical delivery project before handoff.',
      jsonb_build_object('opportunityId',v_opp.id,'projectId',v_project.id,'source','canonical_opportunity_snapshot'),
      v_uid,
      null,
      null,
      now(),
      'sales-requirements-snapshot-restored:'||v_project.id::text
    );

    return jsonb_build_object(
      'projectId',v_project.id,
      'opportunityId',v_opp.id,
      'requirements',v_existing,
      'alreadyCaptured',true,
      'restored',true
    );
  end if;

  if length(v_requirements)<20 then
    raise exception 'Record a clear Sales requirements summary of at least 20 characters.';
  end if;
  if length(v_requirements)>10000 then
    raise exception 'Sales requirements summary is too long.';
  end if;

  update public.crm_opportunities
  set requirements_summary=v_requirements,updated_at=now()
  where id=v_opp.id;

  update public.projects
  set requirements_summary=v_requirements,updated_at=now()
  where id=v_project.id;

  perform public.crm_write_lead_event(
    v_opp.lead_id,
    'missing_sales_requirements_restored',
    'Missing Sales requirements restored before handoff',
    'The source Seller restored Sales discovery requirements that were missing from the legacy paid project. The accepted quotation remains the commercial scope of record.',
    jsonb_build_object('opportunityId',v_opp.id,'projectId',v_project.id,'source','legacy_pre_handoff_remediation'),
    v_uid,
    null,
    null,
    now(),
    'missing-sales-requirements-restored:'||v_project.id::text
  );

  return jsonb_build_object(
    'projectId',v_project.id,
    'opportunityId',v_opp.id,
    'requirements',v_requirements,
    'alreadyCaptured',false,
    'restored',true
  );
end;
$function$;

revoke all on function public.record_missing_sales_project_requirements(uuid,text) from public,anon;
grant execute on function public.record_missing_sales_project_requirements(uuid,text) to authenticated,service_role;

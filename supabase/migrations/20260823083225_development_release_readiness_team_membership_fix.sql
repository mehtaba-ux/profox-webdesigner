-- Align PF-SOP-09 release-readiness staffing with the canonical project_team schema.
-- project_team membership is represented by a row; there is no active column.
create or replace function public.development_sop_ensure_release_readiness_task(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_project public.projects%rowtype;
  v_task_id uuid;
  v_dev uuid;
  v_creator uuid;
begin
  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found.'; end if;

  select id into v_task_id
  from public.project_tasks
  where project_id=p_project_id and workflow_key='development_release_readiness'
  limit 1;
  if v_task_id is not null then return v_task_id; end if;

  select pt.user_id into v_dev
  from public.project_team pt
  join public.user_profiles up on up.id=pt.user_id
  where pt.project_id=p_project_id
    and up.status='active'
    and up.role in('developer','web_developer','developer_designer')
  order by pt.assigned_at asc nulls last, pt.id
  limit 1;

  if v_dev is null then
    select assigned_to into v_dev
    from public.project_tasks
    where project_id=p_project_id
      and department='Development'
      and assigned_to is not null
    order by created_at asc
    limit 1;
  end if;

  v_creator:=coalesce(v_project.project_manager_id,auth.uid());
  if v_creator is null then
    select id into v_creator
    from public.user_profiles
    where role='admin' and status='active'
    order by created_at asc
    limit 1;
  end if;
  if v_creator is null then raise exception 'No authorized task creator is available.'; end if;

  insert into public.project_tasks(
    project_id,title,description,department,assigned_to,created_by,priority,status,due_date,
    workflow_key,workflow_stage,required_for_stage
  )
  values(
    p_project_id,
    'Engineering Release Readiness',
    'PF-SOP-09 release gate: verify regression, QA evidence, accessibility, security, performance, technical SEO/analytics, backup/recovery and rollback readiness. Growth/Scale/Custom also require a 90+ weighted Engineering Quality Score. Critical/high defects block release.',
    'Development',v_dev,v_creator,'High','To Do',v_project.target_date,
    'development_release_readiness','Final Revisions',true
  )
  on conflict(project_id,workflow_key) where workflow_key is not null
  do update set
    required_for_stage=true,
    assigned_to=coalesce(public.project_tasks.assigned_to,excluded.assigned_to),
    updated_at=now()
  returning id into v_task_id;

  return v_task_id;
end;
$$;

revoke execute on function public.development_sop_ensure_release_readiness_task(uuid) from public,anon,authenticated;
create or replace function public.advance_content_deliverable(p_deliverable_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_d public.content_deliverables%rowtype; v_task public.project_tasks%rowtype; v_project public.projects%rowtype; v_role text;
  v_from text; v_to text; v_ready jsonb; v_pkg jsonb; v_config jsonb:='{}'::jsonb; v_requires_seo boolean:=true;
  v_wip_limit integer:=2; v_active_wip integer:=0; v_pass numeric:=90; v_latest_version uuid; v_writer_qa boolean:=false;
  v_review_pass boolean:=false; v_unverified integer:=0; v_has_material integer:=0;
begin
  select * into v_d from public.content_deliverables where id=p_deliverable_id for update;
  if v_d.id is null then raise exception 'Content deliverable not found.'; end if;
  if not public.content_delivery_task_access(v_d.project_task_id) then raise exception 'Access denied.'; end if;
  select * into v_task from public.project_tasks where id=v_d.project_task_id;
  select * into v_project from public.projects where id=v_d.project_id;
  select role into v_role from public.user_profiles where id=auth.uid() and status='active';
  v_from:=v_d.lifecycle_stage;
  if v_from='Blocked — Information Required' then raise exception 'Resolve the blocker before advancing this content item.'; end if;

  if v_from in ('Requested','Intake Validated','Research','Strategy / Brief','Ready for Writing','Drafting','Writer Self-QA') then
    if auth.uid() is distinct from v_task.assigned_to and v_role<>'admin' and not (v_role='project_manager' and v_project.project_manager_id=auth.uid()) then raise exception 'Only the assigned writer or responsible Project Manager can advance the authoring stages.'; end if;
  elsif v_from='Ready for Client Review' then
    raise exception 'This content item is awaiting the client decision in the Client Portal.';
  elsif v_from in ('Client Approved','Ready for Implementation','Implemented','Approved for Publication','Published') then
    if v_role not in ('admin','project_manager','site_manager') then raise exception 'A Project Manager or Site Manager must confirm this delivery transition.'; end if;
    if v_role='project_manager' and v_project.project_manager_id is distinct from auth.uid() then raise exception 'Only the responsible Project Manager can confirm this transition.'; end if;
  else
    if v_role not in ('admin','project_manager','editor','qa','site_manager') then raise exception 'Independent delivery-review permission is required.'; end if;
    if auth.uid()=v_task.assigned_to then raise exception 'The assigned writer cannot approve their own independent delivery stage.'; end if;
    if v_role='project_manager' and v_project.project_manager_id is distinct from auth.uid() then raise exception 'Only the responsible Project Manager can act on this project.'; end if;
  end if;

  select coalesce(config_value,'{}'::jsonb) into v_config from public.system_configuration where config_key='content_delivery_sop_v1';
  v_wip_limit:=greatest(1,coalesce((v_config->>'wipLimit')::integer,2));
  v_pass:=coalesce((v_config->>'qualityPassScore')::numeric,90);
  v_pkg:=public.content_package_context(v_d.project_id);
  v_requires_seo:=coalesce((v_pkg->'profile'->>'requiresSeoReview')::boolean,true);
  v_ready:=public.content_compute_brief_readiness(v_d.id);
  select id into v_latest_version from public.content_versions where deliverable_id=v_d.id order by version_no desc limit 1;
  select count(*) into v_has_material from public.content_claims where deliverable_id=v_d.id and material is true;
  select count(*) into v_unverified from public.content_claims where deliverable_id=v_d.id and material is true and version_id=v_latest_version and verification_status not in ('Verified','Not Required');

  case v_from
    when 'Requested' then v_to:='Intake Validated';
    when 'Intake Validated' then v_to:='Research';
    when 'Research' then v_to:='Strategy / Brief';
    when 'Strategy / Brief' then
      if not coalesce((v_ready->>'ready')::boolean,false) then raise exception 'Definition of Ready is incomplete.'; end if;
      v_to:='Ready for Writing';
    when 'Ready for Writing' then
      if v_task.assigned_to is null then raise exception 'Assign a Content Writer before starting Drafting.'; end if;
      select count(*) into v_active_wip
      from public.content_deliverables d join public.project_tasks t on t.id=d.project_task_id
      where t.assigned_to=v_task.assigned_to and d.id<>v_d.id and d.lifecycle_stage in ('Drafting','Writer Self-QA');
      if v_active_wip>=v_wip_limit then raise exception 'The assigned writer has reached the active Content WIP limit of %. Finish or move an existing item before starting another.',v_wip_limit; end if;
      v_to:='Drafting';
    when 'Drafting' then
      if v_latest_version is null then raise exception 'Save a content version before Writer Self-QA.'; end if;
      update public.content_versions set status='Submitted' where id=v_latest_version;
      v_to:='Writer Self-QA';
    when 'Writer Self-QA' then
      select exists(select 1 from public.content_reviews r where r.deliverable_id=v_d.id and r.version_id=v_latest_version and r.review_type='Writer Self-QA' and r.decision='Passed') into v_writer_qa;
      if not v_writer_qa then raise exception 'Complete and pass Writer Self-QA for the current version before independent review.'; end if;
      if v_has_material>0 then v_to:='SME / Fact Check'; else v_to:='2i Editorial Review'; end if;
    when 'SME / Fact Check' then
      if v_unverified>0 then raise exception 'Every material claim on the current version must be independently verified or marked not required.'; end if;
      select exists(select 1 from public.content_reviews r where r.deliverable_id=v_d.id and r.version_id=v_latest_version and r.review_type='SME Fact Check' and r.decision='Passed') into v_review_pass;
      if not v_review_pass then raise exception 'SME / Fact Check must pass for the current version before 2i Editorial Review.'; end if;
      v_to:='2i Editorial Review';
    when '2i Editorial Review' then
      select exists(select 1 from public.content_reviews r where r.deliverable_id=v_d.id and r.version_id=v_latest_version and r.review_type='2i Editorial Review' and r.decision='Passed' and coalesce(r.total_score,0)>=v_pass) into v_review_pass;
      if not v_review_pass or v_d.critical_defect_count>0 or v_d.major_defect_count>0 then raise exception 'Independent 2i review has not passed the quality gate for the current version.'; end if;
      if v_requires_seo then
        v_to:='SEO / Conversion Review';
      else
        update public.content_versions set status='Approved' where id=v_latest_version;
        v_to:='Ready for Client Review';
      end if;
    when 'SEO / Conversion Review' then
      select exists(select 1 from public.content_reviews r where r.deliverable_id=v_d.id and r.version_id=v_latest_version and r.review_type='SEO / Conversion Review' and r.decision='Passed' and coalesce(r.total_score,0)>=v_pass) into v_review_pass;
      if not v_review_pass then raise exception 'SEO / Conversion Review must pass for the current version before client review.'; end if;
      update public.content_versions set status='Approved' where id=v_latest_version;
      v_to:='Ready for Client Review';
    when 'Client Approved' then v_to:='Ready for Implementation';
    when 'Ready for Implementation' then v_to:='Implemented';
    when 'Implemented' then v_to:='In-Context QA';
    when 'In-Context QA' then
      select exists(select 1 from public.content_reviews r where r.deliverable_id=v_d.id and r.version_id=v_latest_version and r.review_type='In-Context QA' and r.decision='Passed' and coalesce(r.total_score,0)>=v_pass) into v_review_pass;
      if not v_review_pass then raise exception 'In-Context QA must pass for the current version before publication approval.'; end if;
      v_to:='Approved for Publication';
    when 'Approved for Publication' then v_to:='Published';
    when 'Published' then v_to:='Measured / Maintained';
    when 'Measured / Maintained' then raise exception 'This content item is already at the maintenance stage.';
    else raise exception 'Unsupported content lifecycle stage.';
  end case;

  update public.content_deliverables set lifecycle_stage=v_to,brief_ready=coalesce((v_ready->>'ready')::boolean,brief_ready),published_at=case when v_to='Published' then coalesce(published_at,now()) else published_at end,measured_at=case when v_to='Measured / Maintained' then coalesce(measured_at,now()) else measured_at end,updated_at=now() where id=v_d.id;
  perform set_config('app.content_delivery_internal','1',true);
  update public.project_tasks set
    status=case when v_to in ('Drafting','Writer Self-QA') then 'In Progress' when v_to in ('SME / Fact Check','2i Editorial Review','SEO / Conversion Review','Ready for Client Review','Client Approved','Ready for Implementation','Implemented','In-Context QA','Approved for Publication') then 'Review' when v_to in ('Published','Measured / Maintained') then 'Done' else status end,
    completed_at=case when v_to in ('Published','Measured / Maintained') then coalesce(completed_at,now()) else completed_at end,
    updated_at=now()
  where id=v_d.project_task_id;
  insert into public.content_delivery_events(deliverable_id,event_type,from_stage,to_stage,notes,metadata,actor_id)
  values(v_d.id,'Stage Advanced',v_from,v_to,nullif(btrim(coalesce(p_reason,'')),''),jsonb_build_object('package',v_pkg,'wipLimit',v_wip_limit,'qualityPassScore',v_pass,'versionId',v_latest_version),auth.uid());
  return jsonb_build_object('from',v_from,'to',v_to,'readiness',v_ready,'package',v_pkg,'wipLimit',v_wip_limit,'qualityPassScore',v_pass);
end; $$;

create or replace function public.block_content_deliverable(p_deliverable_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_stage text;
begin
  if not public.content_delivery_can_edit(p_deliverable_id) then raise exception 'Only the assigned writer or responsible Project Manager can block this content item.'; end if;
  if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Describe what information or dependency is missing.'; end if;
  select lifecycle_stage into v_stage from public.content_deliverables where id=p_deliverable_id;
  if v_stage='Blocked — Information Required' then return; end if;
  if v_stage in ('Ready for Client Review','Client Approved','Ready for Implementation','Implemented','In-Context QA','Approved for Publication','Published','Measured / Maintained') then raise exception 'This stage must be handled through review or project-delivery controls, not an authoring blocker.'; end if;
  update public.content_deliverables set blocked_from_stage=v_stage,lifecycle_stage='Blocked — Information Required',blocked_reason=btrim(p_reason),updated_at=now() where id=p_deliverable_id;
  insert into public.content_delivery_events(deliverable_id,event_type,from_stage,to_stage,notes,actor_id)
  values(p_deliverable_id,'Blocked',v_stage,'Blocked — Information Required',btrim(p_reason),auth.uid());
end; $$;

create or replace function public.resume_content_deliverable(p_deliverable_id uuid,p_note text default null)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_resume text;
begin
  if not public.content_delivery_can_edit(p_deliverable_id) then raise exception 'Only the assigned writer or responsible Project Manager can resume this content item.'; end if;
  select blocked_from_stage into v_resume from public.content_deliverables where id=p_deliverable_id and lifecycle_stage='Blocked — Information Required';
  if v_resume is null then raise exception 'This content item is not blocked.'; end if;
  update public.content_deliverables set lifecycle_stage=v_resume,blocked_from_stage=null,blocked_reason=null,updated_at=now() where id=p_deliverable_id;
  insert into public.content_delivery_events(deliverable_id,event_type,from_stage,to_stage,notes,actor_id)
  values(p_deliverable_id,'Resumed','Blocked — Information Required',v_resume,nullif(btrim(coalesce(p_note,'')),''),auth.uid());
  return v_resume;
end; $$;

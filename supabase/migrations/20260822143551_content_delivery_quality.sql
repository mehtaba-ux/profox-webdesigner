-- -----------------------------------------------------------------------------
-- 6. Quality reviews
-- -----------------------------------------------------------------------------
create or replace function public.record_content_review(
  p_deliverable_id uuid,p_review_type text,p_decision text,p_scores jsonb default '{}'::jsonb,p_defects jsonb default '[]'::jsonb,p_feedback text default null
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_task_id uuid; v_writer uuid; v_version_id uuid; v_version_creator uuid; v_stage text; v_total numeric:=null;
  v_c0 integer:=0; v_c1 integer:=0; v_pass numeric:=90; v_revision numeric:=80; v_final text; v_review_id uuid; v_role text;
  v_config jsonb:='{}'::jsonb; v_dimensions jsonb:='[]'::jsonb; v_dimension jsonb; v_key text; v_weight numeric; v_value numeric;
  v_pkg jsonb:='{}'::jsonb; v_requires_senior boolean:=false; v_has_scores boolean:=false;
begin
  perform 1 from public.content_deliverables where id=p_deliverable_id for update;
  if not found then raise exception 'Content deliverable not found.'; end if;
  if p_review_type not in ('Writer Self-QA','SME Fact Check','2i Editorial Review','SEO / Conversion Review','In-Context QA') then raise exception 'Invalid review type.'; end if;
  select d.project_task_id,t.assigned_to,d.lifecycle_stage into v_task_id,v_writer,v_stage
  from public.content_deliverables d join public.project_tasks t on t.id=d.project_task_id where d.id=p_deliverable_id;
  if v_task_id is null or not public.content_delivery_task_access(v_task_id) then raise exception 'Access denied.'; end if;
  select role into v_role from public.user_profiles where id=auth.uid() and status='active';
  select id,created_by into v_version_id,v_version_creator from public.content_versions where deliverable_id=p_deliverable_id order by version_no desc limit 1;
  if v_version_id is null then raise exception 'A saved content version is required before review.'; end if;

  if p_review_type='Writer Self-QA' then
    if v_stage<>'Writer Self-QA' then raise exception 'Writer Self-QA can only be recorded at the Writer Self-QA stage.'; end if;
    if auth.uid()<>v_writer then raise exception 'Writer Self-QA must be completed by the assigned writer.'; end if;
    if not public.content_writer_playbook_complete(p_deliverable_id) then raise exception 'Complete every PF-SOP-07 production checklist item before passing Writer Self-QA.'; end if;
  else
    if not public.content_delivery_is_reviewer() and not public.is_admin() then raise exception 'Independent reviewer permission is required.'; end if;
    if auth.uid()=v_writer or auth.uid()=v_version_creator then raise exception 'The author of the current content version cannot perform its independent review.'; end if;
    if p_review_type='SME Fact Check' and v_stage<>'SME / Fact Check' then raise exception 'SME Fact Check can only be recorded at the SME / Fact Check stage.'; end if;
    if p_review_type='2i Editorial Review' and v_stage<>'2i Editorial Review' then raise exception '2i Editorial Review can only be recorded at the 2i Editorial Review stage.'; end if;
    if p_review_type='SEO / Conversion Review' and v_stage<>'SEO / Conversion Review' then raise exception 'SEO / Conversion Review can only be recorded at the SEO / Conversion Review stage.'; end if;
    if p_review_type='In-Context QA' and v_stage<>'In-Context QA' then raise exception 'In-Context QA can only be recorded at the In-Context QA stage.'; end if;
  end if;

  if p_review_type='2i Editorial Review' and v_role not in ('admin','project_manager','editor','qa') then raise exception 'Editorial reviewer permission is required.'; end if;
  if p_review_type='SEO / Conversion Review' and v_role not in ('admin','project_manager','editor','qa') then raise exception 'SEO / Conversion reviewer permission is required.'; end if;
  if p_review_type='In-Context QA' and v_role not in ('admin','project_manager','qa','site_manager') then raise exception 'QA or Site Manager permission is required for In-Context QA.'; end if;

  select coalesce(config_value,'{}'::jsonb) into v_config from public.system_configuration where config_key='content_delivery_sop_v1';
  v_pass:=coalesce((v_config->>'qualityPassScore')::numeric,90);
  v_revision:=coalesce((v_config->>'qualityRevisionFloor')::numeric,80);
  v_dimensions:=coalesce(v_config->'qualityDimensions','[]'::jsonb);
  v_pkg:=public.content_package_context((select project_id from public.content_deliverables where id=p_deliverable_id));
  v_requires_senior:=coalesce((v_pkg->'profile'->>'requiresSeniorReview')::boolean,false);
  if p_review_type='2i Editorial Review' and v_requires_senior and v_role not in ('admin','editor') then raise exception 'This package requires senior editorial review by an Editor or Admin.'; end if;

  if jsonb_typeof(coalesce(p_scores,'{}'::jsonb))<>'object' then raise exception 'Scores must be a JSON object.'; end if;
  if jsonb_typeof(coalesce(p_defects,'[]'::jsonb))<>'array' then raise exception 'Defects must be a JSON array.'; end if;
  select exists(select 1 from jsonb_each(coalesce(p_scores,'{}'::jsonb))) into v_has_scores;

  if p_review_type in ('2i Editorial Review','SEO / Conversion Review','In-Context QA') then
    if jsonb_array_length(v_dimensions)=0 then raise exception 'Quality dimensions are not configured.'; end if;
    v_total:=0;
    for v_dimension in select value from jsonb_array_elements(v_dimensions) loop
      v_key:=v_dimension->>'key'; v_weight:=coalesce((v_dimension->>'weight')::numeric,0);
      if not (coalesce(p_scores,'{}'::jsonb) ? v_key) then raise exception 'Missing required quality score: %',v_key; end if;
      begin v_value:=(p_scores->>v_key)::numeric; exception when others then raise exception 'Invalid quality score for %',v_key; end;
      if v_value<0 or v_value>v_weight then raise exception 'Score for % must be between 0 and %',v_key,v_weight; end if;
      v_total:=v_total+v_value;
    end loop;
  elsif v_has_scores then
    begin select sum(value::numeric) into v_total from jsonb_each_text(p_scores); exception when others then raise exception 'Review score values must be numeric.'; end;
    if v_total<0 or v_total>100 then raise exception 'Quality score must be between 0 and 100.'; end if;
  end if;

  select count(*) into v_c0 from jsonb_array_elements(coalesce(p_defects,'[]'::jsonb)) x where upper(coalesce(x->>'severity',''))='C0';
  select count(*) into v_c1 from jsonb_array_elements(coalesce(p_defects,'[]'::jsonb)) x where upper(coalesce(x->>'severity',''))='C1';
  if v_c0>0 or v_c1>0 then v_final:='Changes Required';
  elsif p_review_type in ('2i Editorial Review','SEO / Conversion Review','In-Context QA') then
    if v_total>=v_pass then v_final:='Passed'; elsif v_total>=v_revision then v_final:='Changes Required'; else v_final:='Rework'; end if;
  else
    if p_decision not in ('Passed','Changes Required','Rework','Rejected') then raise exception 'Invalid review decision.'; end if;
    v_final:=p_decision;
  end if;

  insert into public.content_reviews(deliverable_id,version_id,review_type,reviewer_id,decision,scores,total_score,defects,feedback)
  values(p_deliverable_id,v_version_id,p_review_type,auth.uid(),v_final,coalesce(p_scores,'{}'::jsonb),v_total,coalesce(p_defects,'[]'::jsonb),nullif(btrim(coalesce(p_feedback,'')),'')) returning id into v_review_id;

  if p_review_type in ('2i Editorial Review','SEO / Conversion Review','In-Context QA') then
    update public.content_deliverables set quality_score=v_total,quality_status=case when v_final='Passed' then 'Pass' when v_final='Changes Required' then 'Revision Required' else 'Rework' end,critical_defect_count=v_c0,major_defect_count=v_c1,updated_at=now() where id=p_deliverable_id;
  end if;

  if v_final in ('Changes Required','Rework','Rejected') then
    perform set_config('app.content_delivery_internal','1',true);
    update public.project_tasks set status='Changes Required',updated_at=now() where id=v_task_id;
    update public.content_deliverables set lifecycle_stage='Drafting',internal_revision_count=internal_revision_count+1,updated_at=now() where id=p_deliverable_id;
    update public.productivity_checklist_progress pc
      set completed_items='[]'::jsonb,completed_at=null,started_at=now(),updated_at=now()
    from public.productivity_playbooks pb
    where pc.playbook_id=pb.id and pb.playbook_key='content_task_production'
      and pc.entity_type='project_task' and pc.entity_id=v_task_id and pc.user_id=v_writer;
  end if;

  insert into public.content_delivery_events(deliverable_id,event_type,notes,metadata,actor_id)
  values(p_deliverable_id,'Review Recorded',coalesce(nullif(btrim(coalesce(p_feedback,'')),''),p_review_type||' — '||v_final),jsonb_build_object('reviewType',p_review_type,'decision',v_final,'score',v_total,'c0',v_c0,'c1',v_c1,'reviewId',v_review_id,'versionId',v_version_id),auth.uid());
  return jsonb_build_object('id',v_review_id,'decision',v_final,'totalScore',v_total,'criticalDefects',v_c0,'majorDefects',v_c1);
end; $$;

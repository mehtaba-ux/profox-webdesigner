-- -----------------------------------------------------------------------------
-- 5. Authoring and evidence RPCs
-- -----------------------------------------------------------------------------
create or replace function public.ensure_content_deliverable(p_task_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task public.project_tasks%rowtype; v_assignee_role text; v_id uuid; v_inserted boolean:=false;
begin
  if not public.content_delivery_task_access(p_task_id) then raise exception 'You do not have access to this content task.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id;
  if v_task.id is null or v_task.project_id is null then raise exception 'Project task is not linked to a valid project.'; end if;
  select role into v_assignee_role from public.user_profiles where id=v_task.assigned_to;
  if lower(coalesce(v_task.department,''))<>'content' and coalesce(v_assignee_role,'')<>'content_writer' then raise exception 'This task is not a Content Delivery assignment.'; end if;
  select id into v_id from public.content_deliverables where project_task_id=p_task_id;
  if v_id is null then
    insert into public.content_deliverables(project_task_id,project_id) values(p_task_id,v_task.project_id)
    on conflict (project_task_id) do nothing returning id into v_id;
    if v_id is not null then
      v_inserted:=true;
    else
      select id into v_id from public.content_deliverables where project_task_id=p_task_id;
    end if;
  end if;
  if v_inserted then
    insert into public.content_delivery_events(deliverable_id,event_type,to_stage,notes,actor_id)
    values(v_id,'Created','Requested','Content Delivery workspace initialized from the canonical project task.',auth.uid());
  end if;
  return v_id;
end; $$;

create or replace function public.save_content_brief(p_deliverable_id uuid,p_brief jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_readiness jsonb; v_content_type text; v_stage text;
begin
  if p_brief is null or jsonb_typeof(p_brief)<>'object' then raise exception 'Brief must be a JSON object.'; end if;
  if not public.content_delivery_can_edit(p_deliverable_id) then raise exception 'Only the assigned writer or responsible Project Manager can edit this content brief.'; end if;
  select lifecycle_stage into v_stage from public.content_deliverables where id=p_deliverable_id;
  if v_stage in ('Ready for Client Review','Client Approved','Ready for Implementation','Implemented','In-Context QA','Approved for Publication','Published','Measured / Maintained') then raise exception 'The brief is locked after internal approval. Return the item to an authoring stage before changing it.'; end if;
  v_content_type:=nullif(btrim(coalesce(p_brief->>'content_type','')),'');
  update public.content_deliverables set brief=p_brief,content_type=coalesce(v_content_type,content_type),updated_at=now() where id=p_deliverable_id;
  v_readiness:=public.content_compute_brief_readiness(p_deliverable_id);
  update public.content_deliverables set brief_ready=coalesce((v_readiness->>'ready')::boolean,false),updated_at=now() where id=p_deliverable_id;
  insert into public.content_delivery_events(deliverable_id,event_type,notes,metadata,actor_id)
  values(p_deliverable_id,'Brief Updated','Structured content brief updated.',v_readiness,auth.uid());
  return v_readiness;
end; $$;

create or replace function public.save_content_version(p_deliverable_id uuid,p_content text,p_change_summary text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_next integer; v_version_id uuid; v_stage text;
begin
  if not public.content_delivery_can_edit(p_deliverable_id) then raise exception 'Only the assigned writer or responsible Project Manager can save a content version.'; end if;
  if length(btrim(coalesce(p_content,'')))<20 then raise exception 'Add the content draft before saving a version.'; end if;
  select lifecycle_stage into v_stage from public.content_deliverables where id=p_deliverable_id for update;
  if v_stage<>'Drafting' then raise exception 'Content versions can only be saved while the item is in Drafting.'; end if;
  select coalesce(max(version_no),0)+1 into v_next from public.content_versions where deliverable_id=p_deliverable_id;
  update public.content_versions set status='Superseded' where deliverable_id=p_deliverable_id and status in ('Draft','Submitted','Approved');
  insert into public.content_versions(deliverable_id,version_no,content,change_summary,status,created_by)
  values(p_deliverable_id,v_next,btrim(p_content),nullif(btrim(coalesce(p_change_summary,'')),''),'Draft',auth.uid()) returning id into v_version_id;
  update public.content_claims set version_id=v_version_id,verification_status=case when material then 'Pending' else verification_status end,verification_note=case when material then null else verification_note end,verified_by=case when material then null else verified_by end,verified_at=case when material then null else verified_at end,updated_at=now() where deliverable_id=p_deliverable_id;
  update public.content_deliverables set current_version_no=v_next,quality_score=null,quality_status='Not Scored',critical_defect_count=0,major_defect_count=0,updated_at=now() where id=p_deliverable_id;
  insert into public.content_delivery_events(deliverable_id,event_type,notes,metadata,actor_id)
  values(p_deliverable_id,'Version Saved','A new content version was saved.',jsonb_build_object('versionNo',v_next,'versionId',v_version_id),auth.uid());
  return jsonb_build_object('id',v_version_id,'versionNo',v_next);
end; $$;

create or replace function public.upsert_content_claim(
  p_deliverable_id uuid,p_claim_id uuid,p_claim_text text,p_claim_type text default 'Factual',p_material boolean default true,p_source_url text default null,p_source_note text default null
)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_version_id uuid; v_stage text;
begin
  if not public.content_delivery_can_edit(p_deliverable_id) then raise exception 'Only the assigned writer or responsible Project Manager can maintain claim evidence.'; end if;
  if length(btrim(coalesce(p_claim_text,'')))<3 then raise exception 'Claim text is required.'; end if;
  if p_claim_type not in ('Factual','Statistic','Comparative','Testimonial','Credential','Performance','Other') then raise exception 'Unsupported claim type.'; end if;
  select lifecycle_stage into v_stage from public.content_deliverables where id=p_deliverable_id;
  if v_stage not in ('Research','Strategy / Brief','Ready for Writing','Drafting','Writer Self-QA') then raise exception 'Claim evidence can only be edited during research or authoring stages.'; end if;
  select id into v_version_id from public.content_versions where deliverable_id=p_deliverable_id order by version_no desc limit 1;
  if p_claim_id is null then
    insert into public.content_claims(deliverable_id,version_id,claim_text,claim_type,material,source_url,source_note,created_by)
    values(p_deliverable_id,v_version_id,btrim(p_claim_text),p_claim_type,p_material,nullif(btrim(coalesce(p_source_url,'')),''),nullif(btrim(coalesce(p_source_note,'')),''),auth.uid()) returning id into v_id;
  else
    update public.content_claims set claim_text=btrim(p_claim_text),claim_type=p_claim_type,material=p_material,source_url=nullif(btrim(coalesce(p_source_url,'')),''),source_note=nullif(btrim(coalesce(p_source_note,'')),''),version_id=v_version_id,verification_status='Pending',verification_note=null,verified_by=null,verified_at=null,updated_at=now()
    where id=p_claim_id and deliverable_id=p_deliverable_id returning id into v_id;
    if v_id is null then raise exception 'Claim not found.'; end if;
  end if;
  return v_id;
end; $$;

create or replace function public.verify_content_claim(p_claim_id uuid,p_status text,p_note text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_deliverable_id uuid; v_writer uuid; v_creator uuid; v_stage text; v_current_version uuid; v_claim_version uuid;
begin
  if p_status not in ('Verified','Rejected','Not Required') then raise exception 'Invalid verification status.'; end if;
  select c.deliverable_id,t.assigned_to,c.created_by,d.lifecycle_stage,c.version_id
  into v_deliverable_id,v_writer,v_creator,v_stage,v_claim_version
  from public.content_claims c join public.content_deliverables d on d.id=c.deliverable_id join public.project_tasks t on t.id=d.project_task_id
  where c.id=p_claim_id;
  if not public.content_delivery_can_access(v_deliverable_id) then raise exception 'Access denied.'; end if;
  if not public.content_delivery_is_reviewer() and not public.is_admin() then raise exception 'Independent reviewer permission is required.'; end if;
  if auth.uid()=v_writer or auth.uid()=v_creator then raise exception 'The claim author cannot independently verify their own claim.'; end if;
  if v_stage<>'SME / Fact Check' then raise exception 'Claims are independently verified during SME / Fact Check.'; end if;
  select id into v_current_version from public.content_versions where deliverable_id=v_deliverable_id order by version_no desc limit 1;
  if v_current_version is null or v_claim_version is distinct from v_current_version then raise exception 'This claim is not attached to the current content version.'; end if;
  update public.content_claims set verification_status=p_status,verification_note=nullif(btrim(coalesce(p_note,'')),''),verified_by=auth.uid(),verified_at=now(),updated_at=now() where id=p_claim_id;
end; $$;

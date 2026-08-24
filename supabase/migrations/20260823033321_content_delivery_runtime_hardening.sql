-- Final runtime closure for PF-SOP-07 Content Delivery.
-- Adds the three RPC contracts used by the frontend and hardens the RPC-only access model.

create or replace function public.get_content_delivery_workspace(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_deliverable_id uuid;
  v_deliverable public.content_deliverables%rowtype;
  v_versions jsonb:='[]'::jsonb;
  v_claims jsonb:='[]'::jsonb;
  v_reviews jsonb:='[]'::jsonb;
  v_events jsonb:='[]'::jsonb;
  v_config jsonb:='{}'::jsonb;
  v_readiness jsonb:='{}'::jsonb;
  v_package jsonb:='{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if p_task_id is null or not public.content_delivery_task_access(p_task_id) then raise exception 'Content task access required.'; end if;

  select id into v_deliverable_id from public.content_deliverables where project_task_id=p_task_id;
  if v_deliverable_id is null then
    v_deliverable_id:=public.ensure_content_deliverable(p_task_id);
  end if;
  if v_deliverable_id is null then raise exception 'Content Delivery workspace could not be initialized.'; end if;

  select * into v_deliverable from public.content_deliverables where id=v_deliverable_id;
  v_config:=public.get_content_delivery_config();
  v_readiness:=public.content_compute_brief_readiness(v_deliverable_id);
  v_package:=public.content_package_context(v_deliverable.project_id);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.version_no desc),'[]'::jsonb)
    into v_versions from public.content_versions x where x.deliverable_id=v_deliverable_id;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
    into v_claims from public.content_claims x where x.deliverable_id=v_deliverable_id;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
    into v_reviews from public.content_reviews x where x.deliverable_id=v_deliverable_id;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb)
    into v_events
    from (
      select * from public.content_delivery_events
      where deliverable_id=v_deliverable_id
      order by created_at desc
      limit 200
    ) e;

  return jsonb_build_object(
    'deliverable',to_jsonb(v_deliverable),
    'config',coalesce(v_config,'{}'::jsonb),
    'readiness',coalesce(v_readiness,'{}'::jsonb),
    'package',coalesce(v_package,'{}'::jsonb),
    'versions',coalesce(v_versions,'[]'::jsonb),
    'claims',coalesce(v_claims,'[]'::jsonb),
    'reviews',coalesce(v_reviews,'[]'::jsonb),
    'events',coalesce(v_events,'[]'::jsonb)
  );
end;
$$;

create or replace function public.get_content_review_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_result jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.content_delivery_is_reviewer() then raise exception 'Content review access required.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'deliverableId',q.deliverable_id,
    'taskId',q.task_id,
    'taskTitle',q.task_title,
    'stage',q.lifecycle_stage,
    'qualityScore',q.quality_score,
    'revisionRound',q.revision_round,
    'dueDate',q.due_date,
    'projectId',q.project_id,
    'projectNumber',q.project_number,
    'projectName',q.project_name,
    'clientName',q.client_name,
    'writerId',q.writer_id,
    'writerName',q.writer_name,
    'currentVersionNo',q.current_version_no
  ) order by q.due_date nulls last,q.updated_at),'[]'::jsonb)
  into v_result
  from (
    select d.id deliverable_id,t.id task_id,t.title task_title,d.lifecycle_stage,d.quality_score,d.revision_round,
      t.due_date,p.id project_id,p.project_number,p.project_name,
      coalesce(c.company_name,c.primary_contact_name,'Client') client_name,
      t.assigned_to writer_id,u.full_name writer_name,d.current_version_no,d.updated_at
    from public.content_deliverables d
    join public.project_tasks t on t.id=d.project_task_id
    join public.projects p on p.id=d.project_id
    left join public.clients c on c.id=p.client_id
    left join public.user_profiles u on u.id=t.assigned_to
    where d.lifecycle_stage in ('SME / Fact Check','2i Editorial Review','SEO / Conversion Review','In-Context QA')
      and public.content_delivery_management_project_access(d.project_id)
  ) q;
  return v_result;
end;
$$;

create or replace function public.get_content_delivery_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_total integer:=0;
  v_active integer:=0;
  v_blocked integer:=0;
  v_waiting_review integer:=0;
  v_waiting_client integer:=0;
  v_published integer:=0;
  v_avg_quality numeric;
  v_avg_revision numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.content_delivery_is_reviewer() then raise exception 'Content management access required.'; end if;

  select
    count(*),
    count(*) filter(where d.lifecycle_stage not in ('Published','Measured / Maintained','Blocked — Information Required')),
    count(*) filter(where d.lifecycle_stage='Blocked — Information Required'),
    count(*) filter(where d.lifecycle_stage in ('SME / Fact Check','2i Editorial Review','SEO / Conversion Review','In-Context QA')),
    count(*) filter(where d.lifecycle_stage='Ready for Client Review'),
    count(*) filter(where d.lifecycle_stage in ('Published','Measured / Maintained')),
    round(avg(d.quality_score) filter(where d.quality_score is not null),2),
    round(avg(d.revision_round::numeric),2)
  into v_total,v_active,v_blocked,v_waiting_review,v_waiting_client,v_published,v_avg_quality,v_avg_revision
  from public.content_deliverables d
  where public.content_delivery_management_project_access(d.project_id);

  return jsonb_build_object(
    'total',v_total,
    'active',v_active,
    'blocked',v_blocked,
    'waitingReview',v_waiting_review,
    'waitingClient',v_waiting_client,
    'published',v_published,
    'averageQuality',v_avg_quality,
    'averageRevisionRound',v_avg_revision
  );
end;
$$;

-- Content persistence is intentionally RPC-only. RLS remains enabled as defense in depth,
-- and authenticated/anonymous callers do not receive direct table privileges.
revoke all on table public.content_deliverables from anon,authenticated;
revoke all on table public.content_versions from anon,authenticated;
revoke all on table public.content_claims from anon,authenticated;
revoke all on table public.content_reviews from anon,authenticated;
revoke all on table public.content_delivery_events from anon,authenticated;

-- Authenticated application entry points.
revoke all on function public.get_content_delivery_workspace(uuid) from public,anon;
grant execute on function public.get_content_delivery_workspace(uuid) to authenticated;
revoke all on function public.get_content_review_queue() from public,anon;
grant execute on function public.get_content_review_queue() to authenticated;
revoke all on function public.get_content_delivery_metrics() from public,anon;
grant execute on function public.get_content_delivery_metrics() to authenticated;
revoke all on function public.get_content_uiux_handoff(uuid) from public,anon;
grant execute on function public.get_content_uiux_handoff(uuid) to authenticated;
revoke all on function public.get_content_delivery_config() from public,anon;
grant execute on function public.get_content_delivery_config() to authenticated;
revoke all on function public.save_content_delivery_config(jsonb) from public,anon;
grant execute on function public.save_content_delivery_config(jsonb) to authenticated;
revoke all on function public.save_content_brief(uuid,jsonb) from public,anon;
grant execute on function public.save_content_brief(uuid,jsonb) to authenticated;
revoke all on function public.save_content_version(uuid,text,text) from public,anon;
grant execute on function public.save_content_version(uuid,text,text) to authenticated;
revoke all on function public.upsert_content_claim(uuid,uuid,text,text,boolean,text,text) from public,anon;
grant execute on function public.upsert_content_claim(uuid,uuid,text,text,boolean,text,text) to authenticated;
revoke all on function public.verify_content_claim(uuid,text,text) from public,anon;
grant execute on function public.verify_content_claim(uuid,text,text) to authenticated;
revoke all on function public.record_content_review(uuid,text,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.record_content_review(uuid,text,text,jsonb,jsonb,text) to authenticated;
revoke all on function public.advance_content_deliverable(uuid,text) from public,anon;
grant execute on function public.advance_content_deliverable(uuid,text) to authenticated;
revoke all on function public.block_content_deliverable(uuid,text) from public,anon;
grant execute on function public.block_content_deliverable(uuid,text) to authenticated;
revoke all on function public.resume_content_deliverable(uuid,text) from public,anon;
grant execute on function public.resume_content_deliverable(uuid,text) to authenticated;
revoke all on function public.get_client_content_review_items(uuid) from public,anon;
grant execute on function public.get_client_content_review_items(uuid) to authenticated;
revoke all on function public.client_approve_content_deliverable(uuid,text) from public,anon;
grant execute on function public.client_approve_content_deliverable(uuid,text) to authenticated;
revoke all on function public.client_request_content_changes(uuid,text) from public,anon;
grant execute on function public.client_request_content_changes(uuid,text) to authenticated;

-- Internal helpers/mutations are never callable from an end-user JWT.
revoke all on function public.ensure_content_deliverable(uuid) from public,anon,authenticated;
revoke all on function public.maybe_handoff_content_project_to_uiux(uuid) from public,anon,authenticated;
revoke all on function public.initialize_project_content_delivery(uuid) from public,anon,authenticated;
revoke all on function public.initialize_content_task_record(uuid,boolean) from public,anon,authenticated;
revoke all on function public.pick_content_writer(uuid) from public,anon,authenticated;
revoke all on function public.pick_uiux_designer(uuid) from public,anon,authenticated;
revoke all on function public.queue_content_capacity_exception(uuid) from public,anon,authenticated;
revoke all on function public.content_project_ready_for_uiux(uuid) from public,anon,authenticated;
revoke all on function public.content_project_payload(uuid) from public,anon,authenticated;
revoke all on function public.content_delivery_config() from public,anon,authenticated;
revoke all on function public.content_delivery_wip_limit() from public,anon,authenticated;
revoke all on function public.content_json_has_value(jsonb,text) from public,anon,authenticated;
revoke all on function public.content_delivery_task_access(uuid) from public,anon,authenticated;
revoke all on function public.content_delivery_can_access(uuid) from public,anon,authenticated;
revoke all on function public.content_delivery_can_edit(uuid) from public,anon,authenticated;
revoke all on function public.content_delivery_is_reviewer() from public,anon,authenticated;
revoke all on function public.content_delivery_management_project_access(uuid) from public,anon,authenticated;
revoke all on function public.content_package_context(uuid) from public,anon,authenticated;
revoke all on function public.content_compute_brief_readiness(uuid) from public,anon,authenticated;
revoke all on function public.content_writer_playbook_complete(uuid) from public,anon,authenticated;

grant execute on function public.maybe_handoff_content_project_to_uiux(uuid) to service_role;
grant execute on function public.initialize_project_content_delivery(uuid) to service_role;
grant execute on function public.initialize_content_task_record(uuid,boolean) to service_role;

-- Break the historical projects/project_team policy recursion with a narrow internal membership helper.
create or replace function public.project_team_has_member(p_project_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.project_team pt where pt.project_id=p_project_id and pt.user_id=p_user_id)
$$;
revoke all on function public.project_team_has_member(uuid,uuid) from public,anon;
grant execute on function public.project_team_has_member(uuid,uuid) to authenticated;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
using (
  public.is_admin() or
  public.has_active_role(array['site_manager']::text[]) or
  project_manager_id=(select auth.uid()) or
  public.project_team_has_member(id,(select auth.uid()))
);

-- Record the responsible dependency without changing the canonical PF-SOP-07 blocker state.
create or replace function public.block_content_deliverable_with_dependency(p_deliverable_id uuid,p_reason text,p_dependency text)
returns void language plpgsql security definer set search_path='' as $$
declare v_project uuid; v_external boolean;
begin
  if p_dependency not in ('Client Information','Project Manager Information','Approved Facts','Source Materials','External Dependency','Approval Delay','Writer Dependency') then raise exception 'Select a valid blocker dependency.'; end if;
  select d.project_id into v_project from public.content_deliverables d where d.id=p_deliverable_id;
  perform public.block_content_deliverable(p_deliverable_id,p_reason);
  v_external:=p_dependency<>'Writer Dependency' and public.worker_compensation_is_manager(v_project);
  update public.content_delivery_events e set metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object('responsibleDependency',p_dependency,'externalVerified',v_external)
  where e.id=(select e2.id from public.content_delivery_events e2 where e2.deliverable_id=p_deliverable_id and e2.event_type='Blocked' order by e2.created_at desc limit 1);
end $$;

create or replace function public.manager_verify_content_block_event(p_event_id uuid,p_external boolean,p_note text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_project uuid;
begin
  select d.project_id into v_project from public.content_delivery_events e join public.content_deliverables d on d.id=e.deliverable_id where e.id=p_event_id and e.event_type='Blocked';
  if v_project is null or not public.worker_compensation_is_manager(v_project) then raise exception 'Responsible Project Manager permission required.'; end if;
  update public.content_delivery_events set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('externalVerified',p_external,'verificationNote',nullif(btrim(coalesce(p_note,'')),''),'verifiedBy',(select auth.uid()),'verifiedAt',now()) where id=p_event_id;
end $$;

create or replace function public.worker_assignment_external_block_interval(p_assignment_id uuid)
returns interval language sql stable security definer set search_path='' as $$
  select coalesce(sum(coalesce((select min(r.created_at) from public.content_delivery_events r where r.deliverable_id=b.deliverable_id and r.event_type='Resumed' and r.created_at>b.created_at),now())-b.created_at),interval '0')
  from public.content_delivery_events b
  join public.worker_assignment_items i on i.content_deliverable_id=b.deliverable_id
  where i.assignment_id=p_assignment_id and b.event_type='Blocked' and coalesce((b.metadata->>'externalVerified')::boolean,false)
$$;

revoke all on function public.block_content_deliverable_with_dependency(uuid,text,text) from public,anon;
revoke all on function public.manager_verify_content_block_event(uuid,boolean,text) from public,anon;
revoke all on function public.worker_assignment_external_block_interval(uuid) from public,anon;
grant execute on function public.block_content_deliverable_with_dependency(uuid,text,text),public.manager_verify_content_block_event(uuid,boolean,text),public.worker_assignment_external_block_interval(uuid) to authenticated;

create or replace function public.get_my_worker_command_center()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_cfg jsonb:=public.worker_compensation_config(); v_wip integer; v_active integer;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select greatest(1,coalesce((sc.config_value->>'wipLimit')::integer,2)) into v_wip from public.system_configuration sc where sc.config_key='content_delivery_sop_v1';
  select count(*) into v_active from public.worker_work_assignments a where a.writer_user_id=v_uid and a.status in ('Accepted','In Progress','Changes Required');
  return jsonb_build_object(
    'config',v_cfg,'workload',jsonb_build_object('active',v_active,'limit',coalesce(v_wip,2)),
    'summary',jsonb_build_object(
      'activeValue',coalesce((select sum(agreed_fee) from public.worker_work_assignments where writer_user_id=v_uid and status in ('Accepted','In Progress','Changes Required')),0),
      'waitingApproval',coalesce((select sum(agreed_fee) from public.worker_work_assignments where writer_user_id=v_uid and status in ('In Review','Approved')),0),
      'payable',coalesce((select sum(amount) from public.worker_earnings where writer_user_id=v_uid and status='Payable'),0),
      'paidThisMonth',coalesce((select sum(amount) from public.worker_earnings where writer_user_id=v_uid and status='Paid' and updated_at>=date_trunc('month',now())),0),
      'needsAttention',coalesce((select count(*) from public.worker_work_assignments where writer_user_id=v_uid and (status in ('Offered','Clarification Requested','Changes Required','On Hold','Disputed') or due_date_snapshot<current_date and status not in ('Paid','Cancelled','Earned','Scheduled for Payout'))),0)
    ),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'projectId',a.project_id,'projectName',p.project_name,'projectNumber',p.project_number,'clientName',c.company_name,'package',p.package_snapshot,'status',a.status,'compensationModel',a.compensation_model,'agreedFee',a.agreed_fee,'currency',a.currency,'scope',a.scope_snapshot,'deliverables',a.deliverable_snapshot,'dueDate',a.due_date_snapshot,'includedRevisions',a.included_revisions_snapshot,'qualityThreshold',a.quality_threshold_snapshot,'approvalGate',a.approval_gate_snapshot,'acceptedAt',a.accepted_at,'earnedAt',a.earned_at,'payoutStatus',a.payout_status,'items',(select coalesce(jsonb_agg(jsonb_build_object('taskId',i.project_task_id,'deliverableId',i.content_deliverable_id,'contentType',i.content_type,'quantity',i.quantity,'stage',d.lifecycle_stage,'qualityScore',d.quality_score,'qualityStatus',d.quality_status,'blockedReason',d.blocked_reason)),'[]'::jsonb) from public.worker_assignment_items i left join public.content_deliverables d on d.id=i.content_deliverable_id where i.assignment_id=a.id)) order by (case when a.status='Changes Required' then coalesce((v_cfg#>>'{priorityPolicy,changesRequired}')::integer,100) when a.due_date_snapshot<current_date then coalesce((v_cfg#>>'{priorityPolicy,overdue}')::integer,90) when a.due_date_snapshot=current_date then coalesce((v_cfg#>>'{priorityPolicy,dueToday}')::integer,80) when a.status='Offered' then 75 when a.status='In Progress' then coalesce((v_cfg#>>'{priorityPolicy,activeDrafting}')::integer,40) when a.status='In Review' then coalesce((v_cfg#>>'{priorityPolicy,waitingReview}')::integer,10) when a.status='On Hold' then coalesce((v_cfg#>>'{priorityPolicy,blocked}')::integer,20) else 30 end) desc,a.due_date_snapshot) from public.worker_work_assignments a join public.projects p on p.id=a.project_id left join public.clients c on c.id=p.client_id where a.writer_user_id=v_uid),'[]'::jsonb),
    'earnings',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'assignmentId',e.assignment_id,'projectName',p.project_name,'amount',e.amount,'currency',e.currency,'status',e.status,'earnedAt',e.earned_at,'eligibleAt',e.eligible_at,'qualityEvidence',e.quality_evidence,'payout',(select jsonb_build_object('batchNumber',b.batch_number,'transactionReference',wp.transaction_reference,'paidAt',wp.paid_at) from public.worker_payout_items pi join public.worker_payouts wp on wp.id=pi.payout_id join public.worker_payout_batches b on b.id=wp.payout_batch_id where pi.earning_id=e.id limit 1)) order by e.earned_at desc) from public.worker_earnings e join public.projects p on p.id=e.project_id where e.writer_user_id=v_uid),'[]'::jsonb),
    'performance',jsonb_build_object(
      'projectsCompleted',coalesce((select count(*) from public.worker_work_assignments where writer_user_id=v_uid and status in ('Earned','Scheduled for Payout','Paid')),0),
      'averageQuality',coalesce((select round(avg(d.quality_score),1) from public.worker_assignment_items i join public.worker_work_assignments a on a.id=i.assignment_id join public.content_deliverables d on d.id=i.content_deliverable_id where a.writer_user_id=v_uid and d.quality_score is not null),0),
      'qualityTrend',coalesce((select jsonb_agg(x.quality_score order by x.approved_at) from (select d.quality_score,a.approved_at from public.worker_assignment_items i join public.worker_work_assignments a on a.id=i.assignment_id join public.content_deliverables d on d.id=i.content_deliverable_id where a.writer_user_id=v_uid and a.approved_at is not null and d.quality_score is not null order by a.approved_at desc limit 5) x),'[]'::jsonb),
      'onTimeRate',coalesce((select round(100.0*count(*) filter(where approved_at <= due_date_snapshot::timestamptz+interval '1 day'+case when coalesce((v_cfg->>'blockedTimeExcluded')::boolean,true) then public.worker_assignment_external_block_interval(id) else interval '0' end)/nullif(count(*),0),1) from public.worker_work_assignments where writer_user_id=v_uid and approved_at is not null),0),
      'firstPassRate',coalesce((select round(100.0*count(*) filter(where coalesce(d.internal_revision_count,0)=0)/nullif(count(*),0),1) from public.worker_assignment_items i join public.worker_work_assignments a on a.id=i.assignment_id join public.content_deliverables d on d.id=i.content_deliverable_id where a.writer_user_id=v_uid and a.approved_at is not null),0),
      'averageRevisionRounds',coalesce((select round(avg(d.internal_revision_count+d.revision_round),1) from public.worker_assignment_items i join public.worker_work_assignments a on a.id=i.assignment_id join public.content_deliverables d on d.id=i.content_deliverable_id where a.writer_user_id=v_uid and a.approved_at is not null),0),
      'averageCycleTimeDays',coalesce((select round(avg(extract(epoch from (approved_at-coalesce(accepted_at,created_at)-case when coalesce((v_cfg->>'blockedTimeExcluded')::boolean,true) then public.worker_assignment_external_block_interval(id) else interval '0' end))/86400),1) from public.worker_work_assignments where writer_user_id=v_uid and approved_at is not null),0)
    ),
    'week',jsonb_build_object(
      'projectsDue',coalesce((select count(*) from public.worker_work_assignments where writer_user_id=v_uid and due_date_snapshot between current_date and current_date+6 and status not in ('Paid','Cancelled','Voided','Reversed')),0),
      'reviewsReturned',coalesce((select count(*) from public.worker_work_assignments where writer_user_id=v_uid and status='Changes Required' and updated_at>=date_trunc('week',now())),0),
      'waitingClient',coalesce((select count(*) from public.worker_assignment_items i join public.worker_work_assignments a on a.id=i.assignment_id join public.content_deliverables d on d.id=i.content_deliverable_id where a.writer_user_id=v_uid and d.lifecycle_stage='Ready for Client Review'),0),
      'potentialEarnings',coalesce((select sum(agreed_fee) from public.worker_work_assignments where writer_user_id=v_uid and due_date_snapshot between current_date and current_date+6 and status in ('Accepted','In Progress','Changes Required','In Review')),0)
    )
  );
end $$;

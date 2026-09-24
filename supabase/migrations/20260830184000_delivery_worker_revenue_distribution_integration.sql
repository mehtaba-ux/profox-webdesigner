-- Reuse the existing worker compensation ledger for project-based UI/UX and Development workers.
-- Content keeps its existing PF-SOP-07 assignment/quality workflow; UI/UX and Development are offered
-- a budget-backed fixed-project assignment from project_team and earn only after the existing project completion gates pass.

create or replace function public.revenue_distribution_paid_delivery_team_assignment()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_profile_role text;
  v_department text;
  v_role_key text;
  v_budget jsonb;
  v_project public.projects%rowtype;
  v_cfg jsonb:=public.worker_compensation_config();
  v_existing uuid;
  v_assignment uuid;
  v_actor uuid;
begin
  select role into v_profile_role
  from public.user_profiles
  where id=new.user_id and status='active';

  if v_profile_role in ('uiux_designer','ui_ux_designer','designer') then
    v_department:='UI/UX Design';
  elsif v_profile_role in ('developer','web_developer','developer_designer') then
    v_department:='Development';
  else
    return new;
  end if;

  v_role_key:=public.revenue_distribution_role_key_for_department(v_department);
  if v_role_key is null then return new; end if;
  v_budget:=public.revenue_distribution_project_role_budget_internal(new.project_id,v_role_key,null);
  if coalesce((v_budget->>'found')::boolean,false) is not true then return new; end if;
  if coalesce((v_budget->>'remainingAmount')::numeric,0)<=0 then
    raise exception 'No protected % budget remains for this project. Adjust the existing role assignment or revise project economics before adding another paid worker.',v_department;
  end if;

  select a.id into v_existing
  from public.worker_work_assignments a
  where a.project_id=new.project_id
    and a.writer_user_id=new.user_id
    and public.revenue_distribution_role_key_for_department(a.department)=v_role_key
    and a.status not in ('Cancelled','Voided','Reversed')
  limit 1;
  if v_existing is not null then return new; end if;

  select * into v_project from public.projects where id=new.project_id;
  if not found then return new; end if;
  v_actor:=coalesce(auth.uid(),v_project.created_by,new.user_id);

  insert into public.worker_work_assignments(
    project_id,writer_user_id,department,status,compensation_model,suggested_amount,agreed_fee,currency,
    scope_snapshot,deliverable_snapshot,due_date_snapshot,included_revisions_snapshot,quality_threshold_snapshot,
    approval_gate_snapshot,earning_trigger_snapshot,acceptance_required,configuration_snapshot,override_status,created_by,updated_by
  ) values(
    new.project_id,new.user_id,v_department,'Offered','Fixed Project Fee',0,0,upper(coalesce(v_budget->>'currency',v_project.currency,'USD')),
    jsonb_build_object('source','revenue_distribution_project_role_budget','projectRole',v_role_key,'teamRole',new.role),
    '[]'::jsonb,coalesce(v_project.target_date,current_date+30),
    greatest(0,coalesce((v_cfg->>'includedRevisions')::integer,2)),
    greatest(0,least(100,coalesce((v_cfg->>'qualityThreshold')::numeric,90))),
    'Existing project quality and completion gates','Project Completion',
    coalesce((v_cfg->>'acceptanceRequired')::boolean,true),
    coalesce(v_cfg,'{}'::jsonb)||jsonb_build_object(
      'revenueDistributionRoleKey',v_role_key,
      'revenueDistributionBudgetAmount',coalesce((v_budget->>'budgetAmount')::numeric,0),
      'revenueDistributionSnapshotDriven',true,
      'earningTrigger','Project Completion'
    ),
    'Not Required',v_actor,v_actor
  ) returning id into v_assignment;

  insert into public.worker_compensation_events(assignment_id,event_type,new_value,source,actor_id)
  select a.id,'Assignment Created',
    jsonb_build_object('suggestedAmount',a.suggested_amount,'agreedFee',a.agreed_fee,'status',a.status,'department',a.department,'revenueDistributionRoleKey',v_role_key),
    'Revenue Distribution Project Role Budget',v_actor
  from public.worker_work_assignments a where a.id=v_assignment;

  perform public.service_queue_staff_operational_notification(
    new.user_id,
    'worker-assignment-offered:'||v_assignment::text,
    'delivery_assignment_offered',
    'Project Work',
    'New project assignment',
    v_project.project_name||' has been assigned with protected project compensation '||coalesce(v_budget->>'currency','USD')||' '||
      (select agreed_fee::text from public.worker_work_assignments where id=v_assignment)||'. Review and accept the assignment before starting work.',
    '/admin/app/projects?tab=myWork',
    jsonb_build_object('assignmentId',v_assignment,'projectId',new.project_id,'department',v_department,'roleKey',v_role_key),
    now()
  );
  return new;
end;
$$;

drop trigger if exists trg_revenue_distribution_paid_delivery_team_assignment on public.project_team;
create trigger trg_revenue_distribution_paid_delivery_team_assignment
after insert or update of user_id,role on public.project_team
for each row execute function public.revenue_distribution_paid_delivery_team_assignment();

create or replace function public.evaluate_worker_assignment_earning(p_assignment_id uuid)
returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v public.worker_work_assignments%rowtype;
  v_earning uuid;
  v_ok boolean:=false;
  v_evidence jsonb:='[]'::jsonb;
  v_hold integer:=0;
  v_role_key text;
  v_project public.projects%rowtype;
  v_title text;
  v_source text;
begin
  select * into v from public.worker_work_assignments where id=p_assignment_id for update;
  if not found or v.status in ('Cancelled','Voided','Reversed','Paid','Scheduled for Payout','Earned') then return null; end if;
  if v.acceptance_required and v.accepted_at is null then return null; end if;

  v_role_key:=public.revenue_distribution_role_key_for_department(v.department);
  if v_role_key='content' or lower(coalesce(v.department,''))='content' then
    select bool_and(case
      when v.earning_trigger_snapshot='Internal Editorial Approval' or v.earning_trigger_snapshot='Independent Editorial Approval' then
        exists(select 1 from public.content_reviews r where r.deliverable_id=i.content_deliverable_id and r.review_type='2i Editorial Review' and r.decision='Passed' and coalesce(r.total_score,0)>=v.quality_threshold_snapshot)
        and d.critical_defect_count=0 and d.major_defect_count=0
      when v.earning_trigger_snapshot='SEO / Conversion Approval' then
        exists(select 1 from public.content_reviews r where r.deliverable_id=i.content_deliverable_id and r.review_type='SEO / Conversion Review' and r.decision='Passed' and coalesce(r.total_score,0)>=v.quality_threshold_snapshot)
      when v.earning_trigger_snapshot='Client Approval' then d.lifecycle_stage in ('Client Approved','Ready for Implementation','Implemented','In-Context QA','Approved for Publication','Published','Measured / Maintained')
      when v.earning_trigger_snapshot='Ready for Implementation' then d.lifecycle_stage in ('Ready for Implementation','Implemented','In-Context QA','Approved for Publication','Published','Measured / Maintained')
      when v.earning_trigger_snapshot='Final Content Approval' then d.lifecycle_stage in ('Approved for Publication','Published','Measured / Maintained')
      else false end),
      jsonb_agg(jsonb_build_object('deliverableId',d.id,'stage',d.lifecycle_stage,'qualityScore',d.quality_score,'qualityStatus',d.quality_status,'criticalDefects',d.critical_defect_count,'majorDefects',d.major_defect_count))
    into v_ok,v_evidence
    from public.worker_assignment_items i
    join public.content_deliverables d on d.id=i.content_deliverable_id
    where i.assignment_id=v.id;
    v_title:='Content Earnings';
    v_source:='PF-SOP-07 Quality Gate';
  else
    select * into v_project from public.projects where id=v.project_id;
    v_ok:=found and v_project.status='Completed' and v_project.stage='Completed' and v_project.completed_at is not null;
    v_evidence:=jsonb_build_array(jsonb_build_object(
      'projectId',v.project_id,
      'projectStage',v_project.stage,
      'projectStatus',v_project.status,
      'completedAt',v_project.completed_at,
      'department',v.department,
      'roleKey',v_role_key,
      'qualityBasis','Existing project delivery, QA, handover and completion gates'
    ));
    v_title:=coalesce(v.department,'Project')||' Earnings';
    v_source:='Project Completion Quality Gate';
  end if;

  if coalesce(v_ok,false) is false then return null; end if;
  v_hold:=greatest(0,coalesce((v.configuration_snapshot->>'payoutHoldDays')::integer,0));

  insert into public.worker_earnings(assignment_id,writer_user_id,project_id,scope_version,dedupe_key,amount,currency,status,quality_evidence,earned_at,eligible_at)
  values(
    v.id,v.writer_user_id,v.project_id,v.scope_version,
    'worker_assignment_earning:'||v.id::text||':'||v.scope_version::text,
    v.agreed_fee,v.currency,case when v_hold>0 then 'On Hold' else 'Payable' end,
    coalesce(v_evidence,'[]'::jsonb),now(),now()+make_interval(days=>v_hold)
  )
  on conflict(assignment_id,scope_version) do nothing
  returning id into v_earning;

  if v_earning is not null then
    update public.worker_work_assignments
    set status='Earned',approved_at=coalesce(approved_at,now()),earned_at=now(),earning_amount=agreed_fee,
        payout_status=case when v_hold>0 then 'On Hold' else 'Payable' end,updated_at=now()
    where id=v.id;

    insert into public.worker_compensation_events(assignment_id,earning_id,event_type,new_value,source,actor_id)
    values(v.id,v_earning,'Earning Created',jsonb_build_object('amount',v.agreed_fee,'currency',v.currency,'scopeVersion',v.scope_version,'qualityEvidence',v_evidence),v_source,auth.uid());

    perform public.service_queue_staff_operational_notification(
      v.writer_user_id,
      'worker-earning-created:'||v_earning::text,
      'worker_earning_payable',
      v_title,
      'Project earning approved',
      v.currency||' '||v.agreed_fee::text||' is now '||case when v_hold>0 then 'on the configured payout hold' else 'ready for payout' end||'.',
      '/admin/app/projects?tab=myWork',
      jsonb_build_object('assignmentId',v.id,'earningId',v_earning,'projectId',v.project_id,'department',v.department),
      now()
    );
  else
    select e.id into v_earning from public.worker_earnings e where e.assignment_id=v.id and e.scope_version=v.scope_version;
  end if;
  return v_earning;
end;
$$;

create or replace function public.revenue_distribution_evaluate_delivery_earnings_on_project_completion()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare v_assignment record;
begin
  if new.status='Completed' and new.stage='Completed' and new.completed_at is not null
     and (tg_op='INSERT' or old.status is distinct from 'Completed' or old.stage is distinct from 'Completed' or old.completed_at is null) then
    for v_assignment in
      select a.id
      from public.worker_work_assignments a
      where a.project_id=new.id
        and public.revenue_distribution_role_key_for_department(a.department) in ('uiux','development')
        and a.status not in ('Cancelled','Voided','Reversed','Paid','Scheduled for Payout','Earned')
    loop
      perform public.evaluate_worker_assignment_earning(v_assignment.id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_revenue_distribution_delivery_earnings_on_project_completion on public.projects;
create trigger trg_revenue_distribution_delivery_earnings_on_project_completion
after insert or update of status,stage,completed_at on public.projects
for each row execute function public.revenue_distribution_evaluate_delivery_earnings_on_project_completion();

create or replace function public.revenue_distribution_evaluate_delivery_earning_after_acceptance()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
begin
  if new.accepted_at is not null and (old.accepted_at is null or old.status is distinct from new.status)
     and public.revenue_distribution_role_key_for_department(new.department) in ('uiux','development') then
    perform public.evaluate_worker_assignment_earning(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_revenue_distribution_delivery_earning_after_acceptance on public.worker_work_assignments;
create trigger trg_revenue_distribution_delivery_earning_after_acceptance
after update of status,accepted_at on public.worker_work_assignments
for each row execute function public.revenue_distribution_evaluate_delivery_earning_after_acceptance();

revoke all on function public.revenue_distribution_paid_delivery_team_assignment() from public,anon,authenticated;
revoke all on function public.revenue_distribution_evaluate_delivery_earnings_on_project_completion() from public,anon,authenticated;
revoke all on function public.revenue_distribution_evaluate_delivery_earning_after_acceptance() from public,anon,authenticated;

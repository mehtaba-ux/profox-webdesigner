-- ProFox Development Delivery foundation
-- Reuse-first architecture:
--   * project_tasks remains the canonical assignment/work record
--   * projects remains the canonical project/scope/stage record
--   * project_team remains the canonical project staffing record
--   * design_delivery_evidence remains the approved UI/UX handoff source
--   * productivity_playbooks remains the canonical executable checklist engine
--   * existing project stage guards remain authoritative
-- New tables store only Development-specific engineering evidence and independent technical review history.

insert into public.system_configuration(config_key,config_value,description)
values(
  'development_delivery_sop_v1',
  jsonb_build_object(
    'version','1.0',
    'wipLimit',2,
    'reviewSlaHours',24,
    'requireClientDesignApproval',true,
    'requireApprovedDesignHandoff',true,
    'requireIndependentCodeReview',true,
    'accessibilityTarget','WCAG 2.2 AA (applicable success criteria)',
    'securityBaseline','OWASP ASVS 5.0 risk-based',
    'coreWebVitals',jsonb_build_object('lcpMs',2500,'inpMs',200,'cls',0.1),
    'requiredEvidenceByWorkflow',jsonb_build_object(
      'technical_architecture',jsonb_build_array('architecture_notes','repository','branch'),
      'development_implementation',jsonb_build_array('repository','branch','pull_request','commit','build_result','test_result','staging_url','accessibility_check','performance_check','security_check'),
      'final_revision_set',jsonb_build_array('pull_request','commit','test_result','staging_url'),
      'production_launch',jsonb_build_array('commit','build_result','production_url','deployment_reference','release_notes'),
      'default',jsonb_build_array('pull_request','commit','test_result','staging_url')
    )
  ),
  'Executable Development Delivery quality controls. Admin-managed; no package pricing or client secrets are stored here.'
)
on conflict(config_key) do nothing;

create table if not exists public.development_delivery_evidence(
  id uuid primary key default gen_random_uuid(),
  project_task_id uuid not null references public.project_tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  evidence_type text not null,
  label text not null default '',
  reference_url text not null default '',
  reference_note text not null default '',
  status text not null default 'Provided',
  active boolean not null default true,
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  constraint development_delivery_evidence_type_check check(evidence_type in(
    'architecture_notes','repository','branch','pull_request','commit','build_result','test_result','staging_url',
    'implementation_notes','accessibility_check','performance_check','security_check','qa_handoff','release_notes',
    'documentation','deployment_reference','production_url','handover_reference'
  )),
  constraint development_delivery_evidence_status_check check(status in('Draft','Provided','Verified','Superseded')),
  constraint development_delivery_evidence_reference_check check(length(trim(reference_url))>0 or length(trim(reference_note))>0)
);

create index if not exists development_delivery_evidence_task_idx on public.development_delivery_evidence(project_task_id,active,evidence_type);
create index if not exists development_delivery_evidence_project_idx on public.development_delivery_evidence(project_id,created_at desc);

create table if not exists public.development_delivery_reviews(
  id uuid primary key default gen_random_uuid(),
  project_task_id uuid not null references public.project_tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  review_round integer not null default 1 check(review_round>0),
  review_type text not null,
  reviewer_user_id uuid not null references public.user_profiles(id),
  status text not null default 'Pending',
  quality_score numeric(5,2),
  notes text not null default '',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid not null references public.user_profiles(id),
  constraint development_delivery_review_type_check check(review_type in('Technical Architecture Review','Peer Code Review')),
  constraint development_delivery_review_status_check check(status in('Pending','Pass','Changes Required','Cancelled')),
  constraint development_delivery_review_score_check check(quality_score is null or(quality_score>=0 and quality_score<=100))
);

create unique index if not exists development_delivery_one_pending_review_idx on public.development_delivery_reviews(project_task_id,review_type) where status='Pending';
create index if not exists development_delivery_reviewer_idx on public.development_delivery_reviews(reviewer_user_id,status,requested_at);

alter table public.development_delivery_evidence enable row level security;
alter table public.development_delivery_reviews enable row level security;

create or replace function public.development_delivery_can_access_task(p_task_id uuid)
returns boolean
language sql
stable security definer
set search_path=public,pg_temp
as $$
  select auth.uid() is not null and(
    public.productivity_can_access_entity('project_task',p_task_id)
    or exists(select 1 from public.development_delivery_reviews r where r.project_task_id=p_task_id and r.reviewer_user_id=auth.uid())
  )
$$;

drop policy if exists development_delivery_evidence_select on public.development_delivery_evidence;
create policy development_delivery_evidence_select on public.development_delivery_evidence for select to authenticated using(public.development_delivery_can_access_task(project_task_id));
drop policy if exists development_delivery_reviews_select on public.development_delivery_reviews;
create policy development_delivery_reviews_select on public.development_delivery_reviews for select to authenticated using(reviewer_user_id=auth.uid() or public.development_delivery_can_access_task(project_task_id));
revoke insert,update,delete on public.development_delivery_evidence from authenticated;
revoke insert,update,delete on public.development_delivery_reviews from authenticated;
grant select on public.development_delivery_evidence,public.development_delivery_reviews to authenticated;

-- Existing productivity checklist engine: Development gets executable status playbooks without another checklist table.
insert into public.productivity_playbooks(playbook_key,name,description,entity_type,stage,roles,checklist,active,sort_order)
values
('development-todo','Development · Definition of Ready','Confirm approved inputs and implementation ownership before coding begins. The server readiness gate remains authoritative.','project_task','To Do',array['developer','web_developer','developer_designer'],'[
  {"key":"scope","label":"Review approved scope, requirements, package and exclusions."},
  {"key":"design","label":"Open the client-approved design/handoff and confirm the current version."},
  {"key":"acceptance","label":"Understand the task outcome and acceptance conditions before implementation."},
  {"key":"reuse","label":"Inspect existing components/services/patterns before creating new implementation."},
  {"key":"dependencies","label":"Confirm required access, integrations and dependencies; surface blockers instead of guessing."},
  {"key":"security","label":"Identify sensitive data, credentials and security constraints before implementation."}
]'::jsonb,true,300),
('development-in-progress','Development · Build & Self-QA','Complete implementation and developer self-QA before requesting independent technical review.','project_task','In Progress',array['developer','web_developer','developer_designer'],'[
  {"key":"scope","label":"Implementation matches approved scope and design; no silent scope/design changes."},
  {"key":"reuse","label":"Existing components/services/patterns are reused where appropriate and duplication is avoided."},
  {"key":"responsive","label":"Relevant responsive layouts, interaction states and real-content edge cases are verified."},
  {"key":"functional","label":"Acceptance criteria and critical user flows work without known critical runtime/console errors."},
  {"key":"tests","label":"Applicable automated/manual tests and regression checks are complete."},
  {"key":"accessibility","label":"Applicable accessibility behavior has been implemented and self-checked."},
  {"key":"performance","label":"Performance impact and applicable Core Web Vitals risks have been checked."},
  {"key":"security","label":"Authorization, inputs, secrets, dependencies and data handling have been self-reviewed."},
  {"key":"evidence","label":"Repository/PR/build/test/staging evidence required for this task is current."}
]'::jsonb,true,300),
('development-review','Development · Independent Technical Review','The task is locked in technical review. Resolve only structured review feedback returned through this workflow.','project_task','Review',array['developer','web_developer','developer_designer'],'[
  {"key":"waiting","label":"Review evidence is submitted; do not bypass the independent reviewer or required status checks."}
]'::jsonb,true,300),
('development-changes','Development · Controlled Revision','Resolve structured code/QA/design findings and re-test impacted areas before resubmission.','project_task','Changes Required',array['developer','web_developer','developer_designer'],'[
  {"key":"feedback","label":"Read the complete structured finding and identify the root cause."},
  {"key":"scope","label":"Confirm the requested correction is in scope; escalate material scope changes to the Project Manager."},
  {"key":"fix","label":"Implement the correction without introducing duplicate or one-off architecture."},
  {"key":"regression","label":"Re-run relevant functional, responsive, accessibility, performance, security and regression checks."},
  {"key":"evidence","label":"Update PR/commit/test/staging evidence for the corrected release candidate."}
]'::jsonb,true,300)
on conflict(playbook_key) do update set name=excluded.name,description=excluded.description,entity_type=excluded.entity_type,stage=excluded.stage,roles=excluded.roles,checklist=excluded.checklist,active=true,sort_order=excluded.sort_order,updated_at=now();

create or replace function public.development_delivery_config()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select config_value from public.system_configuration where config_key='development_delivery_sop_v1'),'{}'::jsonb)
$$;

create or replace function public.development_delivery_required_evidence(p_task_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_task public.project_tasks%rowtype; v_config jsonb; v_key text;
begin
  select * into v_task from public.project_tasks where id=p_task_id; if not found then raise exception 'Task not found.'; end if;
  v_config:=public.development_delivery_config();
  v_key:=coalesce(nullif(v_task.workflow_key,''),'default');
  return coalesce(v_config->'requiredEvidenceByWorkflow'->v_key,v_config->'requiredEvidenceByWorkflow'->'default','[]'::jsonb);
end;
$$;

create or replace function public.development_delivery_compute_readiness(p_task_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare
  v_task public.project_tasks%rowtype; v_project public.projects%rowtype; v_config jsonb; v_blockers jsonb:='[]'::jsonb; v_checks jsonb:='{}'::jsonb;
  v_role text; v_has boolean; v_arch_done boolean:=true;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.development_delivery_can_access_task(p_task_id) then raise exception 'You do not have access to this Development task.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id; if not found then raise exception 'Task not found.'; end if;
  select * into v_project from public.projects where id=v_task.project_id; if not found then raise exception 'Project not found.'; end if;
  v_config:=public.development_delivery_config();

  v_checks:=v_checks||jsonb_build_object('developmentDepartment',v_task.department='Development');
  if v_task.department<>'Development' then v_blockers:=v_blockers||jsonb_build_array('This workspace is only for Development tasks.'); end if;

  v_checks:=v_checks||jsonb_build_object('allowedProjectStage',v_project.stage in('Development','QA','Final Revisions','Launch','Handover'));
  if v_project.stage not in('Development','QA','Final Revisions','Launch','Handover') then v_blockers:=v_blockers||jsonb_build_array('The project is not currently in an authorized Development/QA/release stage.'); end if;

  select role into v_role from public.user_profiles where id=v_task.assigned_to and status='active';
  v_checks:=v_checks||jsonb_build_object('assignedDeveloper',v_role in('developer','web_developer','developer_designer'));
  if v_role is null or v_role not in('developer','web_developer','developer_designer') then v_blockers:=v_blockers||jsonb_build_array('Assign an active Web Developer to this task.'); end if;

  v_checks:=v_checks||jsonb_build_object('scope',length(trim(coalesce(v_project.scope_summary,'')))>0);
  if length(trim(coalesce(v_project.scope_summary,'')))=0 then v_blockers:=v_blockers||jsonb_build_array('Approved project scope is missing.'); end if;
  v_checks:=v_checks||jsonb_build_object('requirements',length(trim(coalesce(v_project.requirements_summary,'')))>0);
  if length(trim(coalesce(v_project.requirements_summary,'')))=0 then v_blockers:=v_blockers||jsonb_build_array('Project requirements are missing.'); end if;
  v_checks:=v_checks||jsonb_build_object('package',length(trim(coalesce(v_project.package_snapshot,'')))>0);
  if length(trim(coalesce(v_project.package_snapshot,'')))=0 then v_blockers:=v_blockers||jsonb_build_array('Purchased package/scope snapshot is missing.'); end if;

  select exists(select 1 from public.project_client_approvals a where a.project_id=v_project.id and a.from_stage='Client Design Approval' and a.action='Approved') into v_has;
  v_checks:=v_checks||jsonb_build_object('clientDesignApproval',v_has);
  if coalesce((v_config->>'requireClientDesignApproval')::boolean,true) and not v_has then v_blockers:=v_blockers||jsonb_build_array('Recorded client Design Approval is required before implementation.'); end if;

  select exists(select 1 from public.design_delivery_evidence e where e.project_id=v_project.id and e.active and e.status='Approved' and e.evidence_type in('design_file','prototype','design_system','handoff_notes')) into v_has;
  v_checks:=v_checks||jsonb_build_object('approvedDesignHandoff',v_has);
  if coalesce((v_config->>'requireApprovedDesignHandoff')::boolean,true) and not v_has then v_blockers:=v_blockers||jsonb_build_array('Approved UI/UX handoff evidence is missing.'); end if;

  if v_task.workflow_key='development_implementation' then
    select exists(select 1 from public.project_tasks t where t.project_id=v_project.id and t.workflow_key='technical_architecture' and t.status='Done') into v_arch_done;
    v_checks:=v_checks||jsonb_build_object('architectureApproved',v_arch_done);
    if not v_arch_done then v_blockers:=v_blockers||jsonb_build_array('Technical Architecture & Build Setup must pass review before implementation starts.'); end if;
  end if;

  return jsonb_build_object('ready',jsonb_array_length(v_blockers)=0,'status',case when jsonb_array_length(v_blockers)=0 then 'READY FOR DEVELOPMENT' else 'BLOCKED — INPUT REQUIRED' end,'checks',v_checks,'blockers',v_blockers);
end;
$$;

create or replace function public.development_delivery_add_evidence(
  p_task_id uuid,p_evidence_type text,p_label text default '',p_reference_url text default '',p_reference_note text default '',p_status text default 'Provided'
)
returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_task public.project_tasks%rowtype; v_project public.projects%rowtype; v_role text; v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id for update; if not found then raise exception 'Task not found.'; end if;
  select * into v_project from public.projects where id=v_task.project_id;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if not(public.is_admin() or v_project.project_manager_id=v_uid or(v_task.assigned_to=v_uid and v_role in('developer','web_developer','developer_designer'))) then raise exception 'Only the assigned Developer, Project Manager or Admin can manage Development evidence.'; end if;
  if p_evidence_type not in('architecture_notes','repository','branch','pull_request','commit','build_result','test_result','staging_url','implementation_notes','accessibility_check','performance_check','security_check','qa_handoff','release_notes','documentation','deployment_reference','production_url','handover_reference') then raise exception 'Unsupported Development evidence type.'; end if;
  if p_status not in('Draft','Provided','Verified') then raise exception 'Evidence status must be Draft, Provided or Verified.'; end if;
  if length(trim(coalesce(p_reference_url,'')))=0 and length(trim(coalesce(p_reference_note,'')))=0 then raise exception 'Add a source link or evidence note.'; end if;
  if lower(coalesce(p_reference_url,''))~'(password|secret|token|apikey|api_key)=' then raise exception 'Do not store credentials or secret-bearing URLs in Development evidence.'; end if;
  update public.development_delivery_evidence set active=false,status='Superseded' where project_task_id=p_task_id and evidence_type=p_evidence_type and active;
  insert into public.development_delivery_evidence(project_task_id,project_id,evidence_type,label,reference_url,reference_note,status,created_by)
  values(p_task_id,v_task.project_id,p_evidence_type,left(trim(coalesce(p_label,'')),240),left(trim(coalesce(p_reference_url,'')),2000),left(trim(coalesce(p_reference_note,'')),6000),p_status,v_uid) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.development_delivery_assert_current_playbook_complete(p_task_id uuid,p_user_id uuid)
returns void
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_stage text; v_role text; v_book public.productivity_playbooks%rowtype; v_completed jsonb:='[]'::jsonb;
begin
  select t.status,u.role into v_stage,v_role from public.project_tasks t join public.user_profiles u on u.id=p_user_id where t.id=p_task_id;
  select * into v_book from public.productivity_playbooks b where b.active and b.entity_type='project_task' and b.stage=v_stage and v_role=any(b.roles) order by b.sort_order,b.name limit 1;
  if v_book.id is null then raise exception 'Development playbook is not configured for this task status.'; end if;
  select coalesce(completed_items,'[]'::jsonb) into v_completed from public.productivity_checklist_progress where playbook_id=v_book.id and entity_type='project_task' and entity_id=p_task_id and user_id=p_user_id;
  if exists(select 1 from jsonb_array_elements(v_book.checklist)i where not(coalesce(v_completed,'[]'::jsonb)?(i->>'key'))) then raise exception 'Complete the Development stage checklist before moving forward.'; end if;
end;
$$;

create or replace function public.development_delivery_assert_required_evidence(p_task_id uuid)
returns void
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_required jsonb; v_missing text:='';
begin
  v_required:=public.development_delivery_required_evidence(p_task_id);
  select string_agg(replace(req.value,'_',' '),', ' order by req.value) into v_missing
  from jsonb_array_elements_text(v_required)req(value)
  where not exists(select 1 from public.development_delivery_evidence e where e.project_task_id=p_task_id and e.active and e.status in('Provided','Verified') and e.evidence_type=req.value);
  if coalesce(v_missing,'')<>'' then raise exception 'Development review submission is missing required evidence: %.',v_missing; end if;
end;
$$;

create or replace function public.development_delivery_pick_reviewer(p_project_id uuid,p_exclude_user_id uuid)
returns uuid
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_reviewer uuid;
begin
  select u.id into v_reviewer
  from public.user_profiles u
  left join public.project_team pt on pt.project_id=p_project_id and pt.user_id=u.id
  where u.status='active' and u.id is distinct from p_exclude_user_id and u.role in('developer','web_developer','developer_designer')
  order by case when pt.user_id is not null then 0 else 1 end,(select count(*) from public.development_delivery_reviews r where r.reviewer_user_id=u.id and r.status='Pending'),u.full_name
  limit 1;
  return v_reviewer;
end;
$$;

create or replace function public.development_delivery_start_task(p_task_id uuid)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_task public.project_tasks%rowtype; v_role text; v_config jsonb; v_readiness jsonb; v_limit int:=2; v_wip int:=0;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id for update; if not found then raise exception 'Task not found.'; end if;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if v_task.assigned_to is distinct from v_uid or v_role not in('developer','web_developer','developer_designer') then raise exception 'Only the assigned Web Developer can start this task.'; end if;
  if v_task.status not in('To Do','Changes Required') then raise exception 'This Development task cannot be started from its current status.'; end if;
  v_readiness:=public.development_delivery_compute_readiness(p_task_id);
  if not coalesce((v_readiness->>'ready')::boolean,false) then raise exception '%',coalesce(v_readiness->>'status','BLOCKED — INPUT REQUIRED'); end if;
  v_config:=public.development_delivery_config(); v_limit:=greatest(1,coalesce((v_config->>'wipLimit')::int,2));
  select count(*) into v_wip from public.project_tasks where assigned_to=v_uid and department='Development' and status='In Progress' and id<>p_task_id;
  if v_task.status='To Do' and v_wip>=v_limit then raise exception 'Development WIP limit reached. Finish or move an active task before starting another.'; end if;
  update public.project_tasks set status='In Progress',start_date=coalesce(start_date,current_date),completed_at=null,updated_at=now() where id=p_task_id;
  return jsonb_build_object('taskId',p_task_id,'status','In Progress');
end;
$$;

create or replace function public.development_delivery_submit_for_review(p_task_id uuid,p_note text default '')
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_task public.project_tasks%rowtype; v_project public.projects%rowtype; v_role text; v_reviewer uuid; v_round int:=1; v_type text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id for update; if not found then raise exception 'Task not found.'; end if;
  select * into v_project from public.projects where id=v_task.project_id;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if v_task.assigned_to is distinct from v_uid or v_role not in('developer','web_developer','developer_designer') then raise exception 'Only the assigned Web Developer can submit this task.'; end if;
  if v_task.status<>'In Progress' then raise exception 'Development must be In Progress before review submission.'; end if;
  if not coalesce((public.development_delivery_compute_readiness(p_task_id)->>'ready')::boolean,false) then raise exception 'Development readiness has blockers. Resolve them before review.'; end if;
  perform public.development_delivery_assert_current_playbook_complete(p_task_id,v_uid);
  perform public.development_delivery_assert_required_evidence(p_task_id);
  if exists(select 1 from public.development_delivery_reviews where project_task_id=p_task_id and status='Pending') then raise exception 'This task already has a pending technical review.'; end if;
  v_reviewer:=public.development_delivery_pick_reviewer(v_project.id,v_uid);
  if v_reviewer is null then raise exception 'No independent qualified Web Developer is available for technical review. Assign or activate another qualified Developer before submission.'; end if;
  v_type:=case when v_task.workflow_key='technical_architecture' then 'Technical Architecture Review' else 'Peer Code Review' end;
  select coalesce(max(review_round),0)+1 into v_round from public.development_delivery_reviews where project_task_id=p_task_id;
  insert into public.development_delivery_reviews(project_task_id,project_id,review_round,review_type,reviewer_user_id,created_by,notes)
  values(p_task_id,v_project.id,v_round,v_type,v_reviewer,v_uid,left(trim(coalesce(p_note,'')),4000));
  update public.project_tasks set status='Review',updated_at=now() where id=p_task_id;
  perform public.enqueue_in_app_notification(v_reviewer,'Development Review',v_type||' required',coalesce(v_task.title,'Development task')||' is ready for independent technical review.','/admin?tab=myWork&devReviewTask='||p_task_id::text,'development-review:'||p_task_id::text||':'||v_round::text);
  return jsonb_build_object('taskId',p_task_id,'status','Review','reviewRound',v_round,'reviewType',v_type);
end;
$$;

create or replace function public.development_delivery_get_my_reviews()
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_items jsonb:='[]'::jsonb; v_sla numeric:=24;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  v_sla:=greatest(1,coalesce((public.development_delivery_config()->>'reviewSlaHours')::numeric,24));
  select coalesce(jsonb_agg(jsonb_build_object(
    'reviewId',r.id,'taskId',r.project_task_id,'reviewType',r.review_type,'reviewRound',r.review_round,'requestedAt',r.requested_at,
    'taskTitle',t.title,'priority',t.priority,'dueDate',t.due_date,'projectId',p.id,'projectNumber',p.project_number,'projectName',p.project_name,
    'clientName',c.company_name,'developerName',du.full_name,'ageHours',round(extract(epoch from(now()-r.requested_at))/3600.0,1),'slaHours',v_sla,
    'slaStatus',case when extract(epoch from(now()-r.requested_at))/3600.0>v_sla then 'Breached' when extract(epoch from(now()-r.requested_at))/3600.0>=v_sla*0.75 then 'Due Soon' else 'Healthy' end
  ) order by r.requested_at),'[]'::jsonb) into v_items
  from public.development_delivery_reviews r join public.project_tasks t on t.id=r.project_task_id join public.projects p on p.id=r.project_id left join public.clients c on c.id=p.client_id left join public.user_profiles du on du.id=t.assigned_to
  where r.reviewer_user_id=v_uid and r.status='Pending';
  return v_items;
end;
$$;

create or replace function public.development_delivery_submit_review_decision(p_review_id uuid,p_decision text,p_quality_score numeric default null,p_notes text default '')
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_review public.development_delivery_reviews%rowtype; v_task public.project_tasks%rowtype; v_project public.projects%rowtype; v_all_done boolean;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_decision not in('Pass','Changes Required') then raise exception 'Unsupported review decision.'; end if;
  select * into v_review from public.development_delivery_reviews where id=p_review_id for update; if not found then raise exception 'Review not found.'; end if;
  if v_review.status<>'Pending' then raise exception 'This review is already complete.'; end if;
  if v_review.reviewer_user_id is distinct from v_uid and not public.is_admin() then raise exception 'Only the assigned reviewer can complete this gate.'; end if;
  if p_decision='Changes Required' and length(trim(coalesce(p_notes,'')))<10 then raise exception 'Specific review feedback is required when changes are requested.'; end if;
  select * into v_task from public.project_tasks where id=v_review.project_task_id for update;
  select * into v_project from public.projects where id=v_review.project_id;
  update public.development_delivery_reviews set status=p_decision,quality_score=p_quality_score,notes=left(trim(coalesce(p_notes,'')),6000),completed_at=now() where id=p_review_id;
  if p_decision='Changes Required' then
    update public.project_tasks set status='Changes Required',completed_at=null,updated_at=now() where id=v_task.id;
    if v_task.assigned_to is not null then perform public.enqueue_in_app_notification(v_task.assigned_to,'Development Changes','Technical review changes required',coalesce(v_task.title,'Development task')||' requires changes. Open the same Development Delivery workspace and resolve the structured review feedback.','/admin?tab=myWork&focusTask='||v_task.id::text,'development-review-return:'||p_review_id::text); end if;
    return jsonb_build_object('reviewId',p_review_id,'status',p_decision,'taskStatus','Changes Required');
  end if;
  update public.project_tasks set status='Done',completed_at=now(),updated_at=now() where id=v_task.id;
  select not exists(select 1 from public.project_tasks x where x.project_id=v_project.id and x.workflow_stage='Development' and x.required_for_stage and x.status<>'Done') into v_all_done;
  if v_all_done and v_project.project_manager_id is not null then
    perform public.enqueue_in_app_notification(v_project.project_manager_id,'Development Ready for QA','All required Development tasks passed technical review',coalesce(v_project.project_number,'Project')||' · '||coalesce(v_project.project_name,'')||' has completed the required Development tasks. Review the project and advance to QA when ready.','/admin?tab=projects','development-ready-qa:'||v_project.id::text||':'||extract(epoch from now())::bigint::text);
  end if;
  return jsonb_build_object('reviewId',p_review_id,'status','Pass','taskStatus','Done','allRequiredDevelopmentTasksDone',v_all_done);
end;
$$;

create or replace function public.development_delivery_workspace(p_task_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_task public.project_tasks%rowtype; v_project public.projects%rowtype; v_client jsonb:='{}'::jsonb; v_evidence jsonb:='[]'::jsonb; v_reviews jsonb:='[]'::jsonb; v_design jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.development_delivery_can_access_task(p_task_id) then raise exception 'You do not have access to this Development task.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id; if not found then raise exception 'Task not found.'; end if;
  select * into v_project from public.projects where id=v_task.project_id;
  select coalesce(jsonb_build_object('id',c.id,'company_name',c.company_name,'industry',c.industry,'website',c.website,'country',c.country),'{}'::jsonb) into v_client from public.clients c where c.id=v_project.client_id;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) into v_evidence from public.development_delivery_evidence e where e.project_task_id=p_task_id;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc),'[]'::jsonb) into v_reviews from public.development_delivery_reviews r where r.project_task_id=p_task_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'type',e.evidence_type,'label',e.label,'url',e.reference_url,'note',e.reference_note,'version',e.version_label,'createdAt',e.created_at) order by e.created_at desc),'[]'::jsonb) into v_design
  from public.design_delivery_evidence e where e.project_id=v_project.id and e.active and e.status='Approved' and e.evidence_type in('design_file','prototype','design_system','handoff_notes');
  return jsonb_build_object('task',to_jsonb(v_task),'project',to_jsonb(v_project),'client',v_client,'config',public.development_delivery_config(),'readiness',public.development_delivery_compute_readiness(p_task_id),'requiredEvidence',public.development_delivery_required_evidence(p_task_id),'evidence',v_evidence,'reviews',v_reviews,'designHandoff',v_design);
end;
$$;

-- Auto-connect existing project staffing to canonical Development tasks.
create or replace function public.development_delivery_assign_stage_tasks(p_project_id uuid)
returns integer
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_developer uuid; v_count int:=0;
begin
  select u.id into v_developer from public.project_team pt join public.user_profiles u on u.id=pt.user_id where pt.project_id=p_project_id and u.status='active' and u.role in('developer','web_developer','developer_designer') order by case when lower(coalesce(pt.role,'')) like '%developer%' then 0 else 1 end,pt.assigned_at limit 1;
  if v_developer is null then return 0; end if;
  update public.project_tasks set assigned_to=v_developer,updated_at=now() where project_id=p_project_id and department='Development' and workflow_stage='Development' and assigned_to is null and status not in('Done','Cancelled');
  get diagnostics v_count=row_count; return v_count;
end;
$$;

create or replace function public.development_delivery_on_project_stage_change()
returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if new.stage='Development' and old.stage is distinct from 'Development' then perform public.development_delivery_assign_stage_tasks(new.id); end if;
  return new;
end;
$$;

drop trigger if exists trg_development_delivery_on_project_stage_change on public.projects;
create trigger trg_development_delivery_on_project_stage_change after update of stage on public.projects for each row execute function public.development_delivery_on_project_stage_change();

create or replace function public.development_delivery_on_team_assignment()
returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_stage text; v_role text;
begin
  select role into v_role from public.user_profiles where id=new.user_id and status='active';
  if v_role in('developer','web_developer','developer_designer') then
    select stage into v_stage from public.projects where id=new.project_id;
    if v_stage='Development' then perform public.development_delivery_assign_stage_tasks(new.project_id); end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_development_delivery_on_team_assignment on public.project_team;
create trigger trg_development_delivery_on_team_assignment after insert or update of user_id,role on public.project_team for each row execute function public.development_delivery_on_team_assignment();

revoke all on function public.development_delivery_config() from public,anon,authenticated;
revoke all on function public.development_delivery_required_evidence(uuid) from public,anon,authenticated;
revoke all on function public.development_delivery_can_access_task(uuid) from public,anon;
grant execute on function public.development_delivery_can_access_task(uuid) to authenticated;
revoke all on function public.development_delivery_assert_current_playbook_complete(uuid,uuid) from public,anon,authenticated;
revoke all on function public.development_delivery_assert_required_evidence(uuid) from public,anon,authenticated;
revoke all on function public.development_delivery_pick_reviewer(uuid,uuid) from public,anon,authenticated;
revoke all on function public.development_delivery_assign_stage_tasks(uuid) from public,anon,authenticated;
revoke all on function public.development_delivery_on_project_stage_change() from public,anon,authenticated;
revoke all on function public.development_delivery_on_team_assignment() from public,anon,authenticated;
grant execute on function public.development_delivery_compute_readiness(uuid) to authenticated;
grant execute on function public.development_delivery_add_evidence(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.development_delivery_start_task(uuid) to authenticated;
grant execute on function public.development_delivery_submit_for_review(uuid,text) to authenticated;
grant execute on function public.development_delivery_get_my_reviews() to authenticated;
grant execute on function public.development_delivery_submit_review_decision(uuid,text,numeric,text) to authenticated;
grant execute on function public.development_delivery_workspace(uuid) to authenticated;

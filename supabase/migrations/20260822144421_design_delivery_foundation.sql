-- PF-SOP-08 v1.1 — UX/UI Design Delivery foundation
-- Reuse-first architecture:
--   * project_tasks remains the canonical assignment / work record
--   * projects remains the canonical project / package / scope record
--   * project_team remains the canonical team assignment record
--   * project_client_approvals remains the canonical client approval record
--   * productivity_playbooks remains the canonical SOP checklist engine
--   * in_app_notifications remains the canonical staff/client notification surface
-- New tables store only design-specific evidence references and review-gate records.

insert into public.system_configuration(config_key, config_value, description)
values (
  'design_delivery_sop_v1',
  jsonb_build_object(
    'sopCode','PF-SOP-08',
    'version','1.1',
    'wipLimit',2,
    'minimumDesignQaScore',90,
    'reviewSlaHours',24,
    'clientReviewSlaHours',72,
    'requireIndependentDesignQa',true,
    'requireAccessibilityReview',true,
    'requireTechnicalReview',true,
    'requireBusinessObjective',true,
    'requireTargetAudience',true,
    'requirePrimaryConversion',true,
    'requireContentReference',true,
    'requireBrandAssetsReference',true
  ),
  'PF-SOP-08 executable Design Delivery controls. Admin-managed; workflow code reads this instead of hardcoding commercial/package policy.'
)
on conflict (config_key) do nothing;

create table if not exists public.design_delivery_evidence (
  id uuid primary key default gen_random_uuid(),
  project_task_id uuid not null references public.project_tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  evidence_type text not null,
  label text not null default '',
  reference_url text not null default '',
  reference_note text not null default '',
  version_label text not null default '',
  status text not null default 'Approved',
  active boolean not null default true,
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  constraint design_delivery_evidence_type_check check (evidence_type in (
    'business_objective',
    'target_audience',
    'primary_conversion',
    'approved_content',
    'brand_assets',
    'research',
    'information_architecture',
    'user_flow',
    'wireframe',
    'design_file',
    'prototype',
    'handoff_notes',
    'implementation_reference'
  )),
  constraint design_delivery_evidence_status_check check (status in ('Draft','Approved','Superseded')),
  constraint design_delivery_evidence_reference_check check (
    length(trim(reference_url)) > 0 or length(trim(reference_note)) > 0
  )
);

create index if not exists design_delivery_evidence_task_idx
  on public.design_delivery_evidence(project_task_id, active, evidence_type);
create index if not exists design_delivery_evidence_project_idx
  on public.design_delivery_evidence(project_id, created_at desc);

create table if not exists public.design_delivery_reviews (
  id uuid primary key default gen_random_uuid(),
  project_task_id uuid not null references public.project_tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  review_round integer not null default 1 check (review_round > 0),
  review_type text not null,
  reviewer_user_id uuid not null references public.user_profiles(id),
  status text not null default 'Pending',
  quality_score numeric(5,2),
  notes text not null default '',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid not null references public.user_profiles(id),
  constraint design_delivery_review_type_check check (review_type in (
    'Independent Design QA',
    'Accessibility Review',
    'Technical Feasibility',
    'Implementation QA'
  )),
  constraint design_delivery_review_status_check check (status in (
    'Pending','Pass','Minor Revision','Major Revision','Reject / Rework','Cancelled'
  )),
  constraint design_delivery_review_score_check check (quality_score is null or (quality_score >= 0 and quality_score <= 100))
);

create unique index if not exists design_delivery_one_pending_review_idx
  on public.design_delivery_reviews(project_task_id, review_type)
  where status='Pending';
create index if not exists design_delivery_review_reviewer_idx
  on public.design_delivery_reviews(reviewer_user_id, status, requested_at);
create index if not exists design_delivery_review_project_idx
  on public.design_delivery_reviews(project_id, requested_at desc);

alter table public.design_delivery_evidence enable row level security;
alter table public.design_delivery_reviews enable row level security;

-- Evidence/review rows are read through the same project/task access model already used by My Work.
-- Mutation is intentionally routed through SECURITY DEFINER RPCs below so workflow gates cannot be bypassed by direct CRUD.
drop policy if exists design_delivery_evidence_select on public.design_delivery_evidence;
create policy design_delivery_evidence_select
on public.design_delivery_evidence
for select
to authenticated
using (public.productivity_can_access_entity('project_task', project_task_id));

drop policy if exists design_delivery_reviews_select on public.design_delivery_reviews;
create policy design_delivery_reviews_select
on public.design_delivery_reviews
for select
to authenticated
using (
  reviewer_user_id=auth.uid()
  or public.productivity_can_access_entity('project_task', project_task_id)
);

revoke insert, update, delete on public.design_delivery_evidence from authenticated;
revoke insert, update, delete on public.design_delivery_reviews from authenticated;
grant select on public.design_delivery_evidence to authenticated;
grant select on public.design_delivery_reviews to authenticated;

-- Existing SOP engine: only add role/stage playbooks, never another checklist table.
insert into public.productivity_playbooks(playbook_key,name,description,entity_type,stage,roles,checklist,active,sort_order)
values
(
  'pf08-design-todo',
  'PF-SOP-08 · Design Readiness',
  'Confirm the approved inputs before design begins. The server readiness gate remains authoritative.',
  'project_task','To Do',array['uiux_designer'],
  '[
    {"key":"scope","label":"Review approved scope, package and exclusions."},
    {"key":"objective","label":"Confirm business objective, user objective and primary conversion."},
    {"key":"content","label":"Confirm approved/current content source and content hierarchy."},
    {"key":"brand","label":"Confirm brand assets/guidelines and required trust evidence."},
    {"key":"constraints","label":"Review technical, accessibility, device and integration constraints."}
  ]'::jsonb,true,200
),
(
  'pf08-design-in-progress',
  'PF-SOP-08 · Design Execution & Self-QA',
  'Complete the applicable UX/UI work and self-QA before requesting independent review.',
  'project_task','In Progress',array['uiux_designer'],
  '[
    {"key":"ux","label":"Validate IA, journeys/flows and wireframes required by scope."},
    {"key":"conversion","label":"Validate hierarchy, CTA strategy, trust and friction reduction."},
    {"key":"system","label":"Use governed components/tokens; define states and responsive behavior."},
    {"key":"accessibility","label":"Check contrast, focus, labels, target sizes, motion and reflow implications."},
    {"key":"content","label":"Stress-test real content, long values, errors, empty/loading states where applicable."},
    {"key":"technical","label":"Confirm interactions and assets are realistically implementable and performance-aware."},
    {"key":"selfqa","label":"Complete the PF-SOP-08 Designer Self-QA and resolve known defects."}
  ]'::jsonb,true,200
),
(
  'pf08-design-review',
  'PF-SOP-08 · Controlled Review',
  'Work is locked in the review gate. Respond only when structured review feedback is returned.',
  'project_task','Review',array['uiux_designer'],
  '[
    {"key":"waiting","label":"Review submission is complete; do not bypass the independent, accessibility or technical gates."}
  ]'::jsonb,true,200
),
(
  'pf08-design-changes',
  'PF-SOP-08 · Controlled Revision',
  'Resolve structured review/client feedback without losing the approved objective, scope or design-system consistency.',
  'project_task','Changes Required',array['uiux_designer'],
  '[
    {"key":"feedback","label":"Read all structured review/client feedback and identify the underlying problem."},
    {"key":"scope","label":"Confirm requested changes are in scope; escalate material scope risk to the Project Manager."},
    {"key":"revise","label":"Implement the required revision consistently across responsive/component states."},
    {"key":"regression","label":"Re-run self-QA for UX, conversion, accessibility, responsiveness and technical feasibility."}
  ]'::jsonb,true,200
)
on conflict (playbook_key) do update set
  name=excluded.name,
  description=excluded.description,
  entity_type=excluded.entity_type,
  stage=excluded.stage,
  roles=excluded.roles,
  checklist=excluded.checklist,
  active=excluded.active,
  sort_order=excluded.sort_order,
  updated_at=now();

create or replace function public.design_delivery_config()
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare v_config jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_config
  from public.system_configuration where config_key='design_delivery_sop_v1';
  return coalesce(v_config,'{}'::jsonb);
end;
$$;

create or replace function public.design_delivery_compute_readiness(p_task_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.project_tasks%rowtype;
  v_project public.projects%rowtype;
  v_config jsonb := '{}'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_checks jsonb := '{}'::jsonb;
  v_has boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.productivity_can_access_entity('project_task',p_task_id) then raise exception 'You do not have access to this task.'; end if;

  select * into v_task from public.project_tasks where id=p_task_id;
  if not found then raise exception 'Task not found.'; end if;
  select * into v_project from public.projects where id=v_task.project_id;
  if not found then raise exception 'Project not found.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_config from public.system_configuration where config_key='design_delivery_sop_v1';

  v_checks:=v_checks||jsonb_build_object('projectStage',v_project.stage='UI/UX Design');
  if v_project.stage is distinct from 'UI/UX Design' then v_blockers:=v_blockers||jsonb_build_array('Project must be in UI/UX Design before design work starts.'); end if;

  v_checks:=v_checks||jsonb_build_object('scope',length(trim(coalesce(v_project.scope_summary,'')))>0);
  if length(trim(coalesce(v_project.scope_summary,'')))=0 then v_blockers:=v_blockers||jsonb_build_array('Approved project scope is missing.'); end if;

  v_checks:=v_checks||jsonb_build_object('requirements',length(trim(coalesce(v_project.requirements_summary,'')))>0);
  if length(trim(coalesce(v_project.requirements_summary,'')))=0 then v_blockers:=v_blockers||jsonb_build_array('Project requirements are missing.'); end if;

  v_checks:=v_checks||jsonb_build_object('package',length(trim(coalesce(v_project.package_snapshot,'')))>0);
  if length(trim(coalesce(v_project.package_snapshot,'')))=0 then v_blockers:=v_blockers||jsonb_build_array('Purchased package/scope snapshot is missing.'); end if;

  select exists(select 1 from public.design_delivery_evidence e where e.project_task_id=p_task_id and e.active and e.status='Approved' and e.evidence_type='business_objective') into v_has;
  v_checks:=v_checks||jsonb_build_object('businessObjective',v_has);
  if coalesce((v_config->>'requireBusinessObjective')::boolean,true) and not v_has then v_blockers:=v_blockers||jsonb_build_array('Business objective evidence is required.'); end if;

  select exists(select 1 from public.design_delivery_evidence e where e.project_task_id=p_task_id and e.active and e.status='Approved' and e.evidence_type='target_audience') into v_has;
  v_checks:=v_checks||jsonb_build_object('targetAudience',v_has);
  if coalesce((v_config->>'requireTargetAudience')::boolean,true) and not v_has then v_blockers:=v_blockers||jsonb_build_array('Target audience evidence is required.'); end if;

  select exists(select 1 from public.design_delivery_evidence e where e.project_task_id=p_task_id and e.active and e.status='Approved' and e.evidence_type='primary_conversion') into v_has;
  v_checks:=v_checks||jsonb_build_object('primaryConversion',v_has);
  if coalesce((v_config->>'requirePrimaryConversion')::boolean,true) and not v_has then v_blockers:=v_blockers||jsonb_build_array('Primary conversion objective is required.'); end if;

  select exists(select 1 from public.design_delivery_evidence e where e.project_task_id=p_task_id and e.active and e.status='Approved' and e.evidence_type='approved_content') into v_has;
  v_checks:=v_checks||jsonb_build_object('contentReference',v_has);
  if coalesce((v_config->>'requireContentReference')::boolean,true) and not v_has then v_blockers:=v_blockers||jsonb_build_array('Approved/current content reference is required.'); end if;

  select exists(select 1 from public.design_delivery_evidence e where e.project_task_id=p_task_id and e.active and e.status='Approved' and e.evidence_type='brand_assets') into v_has;
  v_checks:=v_checks||jsonb_build_object('brandAssets',v_has);
  if coalesce((v_config->>'requireBrandAssetsReference')::boolean,true) and not v_has then v_blockers:=v_blockers||jsonb_build_array('Brand assets/guidelines reference is required.'); end if;

  return jsonb_build_object(
    'ready',jsonb_array_length(v_blockers)=0,
    'status',case when jsonb_array_length(v_blockers)=0 then 'READY' else 'BLOCKED — INPUT REQUIRED' end,
    'checks',v_checks,
    'blockers',v_blockers
  );
end;
$$;

create or replace function public.design_delivery_add_evidence(
  p_task_id uuid,
  p_evidence_type text,
  p_label text default '',
  p_reference_url text default '',
  p_reference_note text default '',
  p_version_label text default '',
  p_status text default 'Approved'
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_task public.project_tasks%rowtype;
  v_project public.projects%rowtype;
  v_role text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  select * into v_task from public.project_tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found.'; end if;
  select * into v_project from public.projects where id=v_task.project_id;

  if not (public.is_admin() or v_project.project_manager_id=v_uid or (v_task.assigned_to=v_uid and v_role='uiux_designer')) then
    raise exception 'Only the assigned UI/UX Designer, Project Manager or Admin can manage design evidence.';
  end if;
  if p_evidence_type not in ('business_objective','target_audience','primary_conversion','approved_content','brand_assets','research','information_architecture','user_flow','wireframe','design_file','prototype','handoff_notes','implementation_reference') then raise exception 'Unsupported evidence type.'; end if;
  if p_status not in ('Draft','Approved') then raise exception 'Evidence status must be Draft or Approved.'; end if;
  if length(trim(coalesce(p_reference_url,'')))=0 and length(trim(coalesce(p_reference_note,'')))=0 then raise exception 'Add a source link or evidence note.'; end if;

  update public.design_delivery_evidence
  set active=false,status='Superseded'
  where project_task_id=p_task_id and evidence_type=p_evidence_type and active;

  insert into public.design_delivery_evidence(
    project_task_id,project_id,evidence_type,label,reference_url,reference_note,version_label,status,created_by
  ) values (
    p_task_id,v_task.project_id,p_evidence_type,left(trim(coalesce(p_label,'')),240),left(trim(coalesce(p_reference_url,'')),2000),trim(coalesce(p_reference_note,'')),left(trim(coalesce(p_version_label,'')),120),p_status,v_uid
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.design_delivery_assert_current_playbook_complete(p_task_id uuid,p_user_id uuid)
returns void
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare
  v_stage text;
  v_book public.productivity_playbooks%rowtype;
  v_completed jsonb:='[]'::jsonb;
begin
  select status into v_stage from public.project_tasks where id=p_task_id;
  select * into v_book
  from public.productivity_playbooks b
  where b.active and b.entity_type='project_task' and b.stage=v_stage and 'uiux_designer'=any(b.roles)
  order by b.sort_order,b.name limit 1;
  if v_book.id is null then raise exception 'PF-SOP-08 playbook is not configured for this stage.'; end if;
  select coalesce(completed_items,'[]'::jsonb) into v_completed
  from public.productivity_checklist_progress
  where playbook_id=v_book.id and entity_type='project_task' and entity_id=p_task_id and user_id=p_user_id;
  if exists(select 1 from jsonb_array_elements(v_book.checklist) i where not (coalesce(v_completed,'[]'::jsonb) ? (i->>'key'))) then
    raise exception 'Complete the PF-SOP-08 stage checklist before moving forward.';
  end if;
end;
$$;

create or replace function public.design_delivery_pick_reviewer(p_project_id uuid,p_review_type text,p_exclude_user_id uuid)
returns uuid
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare v_reviewer uuid;
begin
  select u.id into v_reviewer
  from public.user_profiles u
  left join public.project_team pt on pt.project_id=p_project_id and pt.user_id=u.id
  where u.status='active'
    and u.id is distinct from p_exclude_user_id
    and (
      (p_review_type='Independent Design QA' and u.role='uiux_designer')
      or (p_review_type='Accessibility Review' and u.role in ('qa','uiux_designer'))
      or (p_review_type='Technical Feasibility' and u.role in ('developer','web_developer','developer_designer'))
    )
  order by
    case when pt.user_id is not null then 0 else 1 end,
    (select count(*) from public.design_delivery_reviews r where r.reviewer_user_id=u.id and r.status='Pending'),
    u.full_name
  limit 1;
  return v_reviewer;
end;
$$;

create or replace function public.design_delivery_start_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_task public.project_tasks%rowtype;
  v_role text;
  v_config jsonb:='{}'::jsonb;
  v_readiness jsonb;
  v_wip_limit integer:=2;
  v_wip integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  select * into v_task from public.project_tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found.'; end if;
  if v_role<>'uiux_designer' or v_task.assigned_to is distinct from v_uid then raise exception 'Only the assigned UI/UX Designer can start this design task.'; end if;
  if v_task.status not in ('To Do','Changes Required') then raise exception 'This design task cannot be started from its current status.'; end if;

  v_readiness:=public.design_delivery_compute_readiness(p_task_id);
  if not coalesce((v_readiness->>'ready')::boolean,false) then raise exception '%',coalesce(v_readiness->>'status','BLOCKED — INPUT REQUIRED'); end if;
  select coalesce(config_value,'{}'::jsonb) into v_config from public.system_configuration where config_key='design_delivery_sop_v1';
  v_wip_limit:=greatest(1,coalesce((v_config->>'wipLimit')::integer,2));
  select count(*) into v_wip from public.project_tasks where assigned_to=v_uid and status='In Progress' and department in ('UI/UX Design','Design') and id<>p_task_id;
  if v_task.status='To Do' and v_wip>=v_wip_limit then raise exception 'WIP limit reached. Finish or move an active design task before starting another.'; end if;

  update public.project_tasks set status='In Progress',start_date=coalesce(start_date,current_date),completed_at=null,updated_at=now() where id=p_task_id;
  return jsonb_build_object('taskId',p_task_id,'status','In Progress');
end;
$$;

create or replace function public.design_delivery_submit_for_review(p_task_id uuid,p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_task public.project_tasks%rowtype;
  v_project public.projects%rowtype;
  v_role text;
  v_config jsonb:='{}'::jsonb;
  v_readiness jsonb;
  v_round integer:=1;
  v_design_reviewer uuid;
  v_access_reviewer uuid;
  v_tech_reviewer uuid;
  v_require_access boolean:=true;
  v_require_tech boolean:=true;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  select * into v_task from public.project_tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found.'; end if;
  select * into v_project from public.projects where id=v_task.project_id for update;
  if v_role<>'uiux_designer' or v_task.assigned_to is distinct from v_uid then raise exception 'Only the assigned UI/UX Designer can submit this design.'; end if;
  if v_task.status<>'In Progress' then raise exception 'Design must be In Progress before review submission.'; end if;

  v_readiness:=public.design_delivery_compute_readiness(p_task_id);
  if not coalesce((v_readiness->>'ready')::boolean,false) then raise exception 'Design readiness has blockers. Resolve them before review.'; end if;
  perform public.design_delivery_assert_current_playbook_complete(p_task_id,v_uid);
  if not exists(select 1 from public.design_delivery_evidence where project_task_id=p_task_id and active and status='Approved' and evidence_type='design_file') then
    raise exception 'Add the current approved design/Figma reference before review submission.';
  end if;
  if exists(select 1 from public.design_delivery_reviews where project_task_id=p_task_id and status='Pending') then raise exception 'This design already has pending review gates.'; end if;

  select coalesce(config_value,'{}'::jsonb) into v_config from public.system_configuration where config_key='design_delivery_sop_v1';
  v_require_access:=coalesce((v_config->>'requireAccessibilityReview')::boolean,true);
  v_require_tech:=coalesce((v_config->>'requireTechnicalReview')::boolean,true);
  select coalesce(max(review_round),0)+1 into v_round from public.design_delivery_reviews where project_task_id=p_task_id and review_type<>'Implementation QA';

  v_design_reviewer:=public.design_delivery_pick_reviewer(v_project.id,'Independent Design QA',v_uid);
  if v_design_reviewer is null then raise exception 'No independent UI/UX Designer is available for Design QA. Add/activate another qualified designer or Design Reviewer first.'; end if;
  if v_require_access then
    v_access_reviewer:=public.design_delivery_pick_reviewer(v_project.id,'Accessibility Review',v_uid);
    if v_access_reviewer is null then raise exception 'No eligible Accessibility Reviewer is available. Assign/activate QA or another qualified UI/UX Designer first.'; end if;
  end if;
  if v_require_tech then
    v_tech_reviewer:=public.design_delivery_pick_reviewer(v_project.id,'Technical Feasibility',v_uid);
    if v_tech_reviewer is null then raise exception 'No eligible Developer/Tech Reviewer is available. Assign/activate a developer first.'; end if;
  end if;

  insert into public.design_delivery_reviews(project_task_id,project_id,review_round,review_type,reviewer_user_id,created_by,notes)
  values(p_task_id,v_project.id,v_round,'Independent Design QA',v_design_reviewer,v_uid,left(trim(coalesce(p_note,'')),4000));
  if v_require_access then
    insert into public.design_delivery_reviews(project_task_id,project_id,review_round,review_type,reviewer_user_id,created_by)
    values(p_task_id,v_project.id,v_round,'Accessibility Review',v_access_reviewer,v_uid);
  end if;
  if v_require_tech then
    insert into public.design_delivery_reviews(project_task_id,project_id,review_round,review_type,reviewer_user_id,created_by)
    values(p_task_id,v_project.id,v_round,'Technical Feasibility',v_tech_reviewer,v_uid);
  end if;

  update public.project_tasks set status='Review',updated_at=now() where id=p_task_id;

  perform public.enqueue_in_app_notification(v_design_reviewer,'Design Review','Independent Design QA required',coalesce(v_task.title,'Design')||' is ready for independent Design QA.','/admin?tab=myWork&reviewTask='||p_task_id::text,'design-review:'||p_task_id::text||':'||v_round::text||':design');
  if v_access_reviewer is not null then perform public.enqueue_in_app_notification(v_access_reviewer,'Design Review','Accessibility review required',coalesce(v_task.title,'Design')||' is ready for accessibility review.','/admin?tab=myWork&reviewTask='||p_task_id::text,'design-review:'||p_task_id::text||':'||v_round::text||':access'); end if;
  if v_tech_reviewer is not null then perform public.enqueue_in_app_notification(v_tech_reviewer,'Design Review','Technical feasibility review required',coalesce(v_task.title,'Design')||' is ready for technical feasibility review.','/admin?tab=myWork&reviewTask='||p_task_id::text,'design-review:'||p_task_id::text||':'||v_round::text||':tech'); end if;

  return jsonb_build_object('taskId',p_task_id,'status','Review','reviewRound',v_round);
end;
$$;

create or replace function public.design_delivery_get_my_reviews()
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_items jsonb:='[]'::jsonb; v_config jsonb:='{}'::jsonb; v_sla numeric:=24;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_config from public.system_configuration where config_key='design_delivery_sop_v1';
  v_sla:=greatest(1,coalesce((v_config->>'reviewSlaHours')::numeric,24));
  select coalesce(jsonb_agg(jsonb_build_object(
    'reviewId',r.id,'taskId',r.project_task_id,'reviewType',r.review_type,'reviewRound',r.review_round,'requestedAt',r.requested_at,
    'taskTitle',t.title,'priority',t.priority,'dueDate',t.due_date,'projectId',p.id,'projectNumber',p.project_number,'projectName',p.project_name,
    'clientName',c.company_name,'designerName',du.full_name,
    'ageHours',round(extract(epoch from(now()-r.requested_at))/3600.0,1),
    'slaHours',v_sla,
    'slaStatus',case when extract(epoch from(now()-r.requested_at))/3600.0>v_sla then 'Breached' when extract(epoch from(now()-r.requested_at))/3600.0>=v_sla*0.75 then 'Due Soon' else 'Healthy' end
  ) order by r.requested_at),'[]'::jsonb) into v_items
  from public.design_delivery_reviews r
  join public.project_tasks t on t.id=r.project_task_id
  join public.projects p on p.id=r.project_id
  left join public.clients c on c.id=p.client_id
  left join public.user_profiles du on du.id=t.assigned_to
  where r.reviewer_user_id=v_uid and r.status='Pending';
  return v_items;
end;
$$;

create or replace function public.design_delivery_workspace(p_task_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.project_tasks%rowtype;
  v_project public.projects%rowtype;
  v_client jsonb:='{}'::jsonb;
  v_evidence jsonb:='[]'::jsonb;
  v_reviews jsonb:='[]'::jsonb;
  v_feedback jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.productivity_can_access_entity('project_task',p_task_id) then raise exception 'You do not have access to this task.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id;
  if not found then raise exception 'Task not found.'; end if;
  select * into v_project from public.projects where id=v_task.project_id;
  select coalesce(to_jsonb(c),'{}'::jsonb) into v_client from public.clients c where c.id=v_project.client_id;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) into v_evidence from public.design_delivery_evidence e where e.project_task_id=p_task_id;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc),'[]'::jsonb) into v_reviews from public.design_delivery_reviews r where r.project_task_id=p_task_id;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb) into v_feedback from public.project_client_approvals a where a.project_id=v_project.id and a.from_stage='Client Design Approval';
  return jsonb_build_object(
    'task',to_jsonb(v_task),
    'project',to_jsonb(v_project),
    'client',v_client,
    'config',public.design_delivery_config(),
    'readiness',public.design_delivery_compute_readiness(p_task_id),
    'evidence',v_evidence,
    'reviews',v_reviews,
    'clientFeedback',v_feedback
  );
end;
$$;

create or replace function public.design_delivery_submit_review_decision(
  p_review_id uuid,
  p_decision text,
  p_quality_score numeric default null,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_review public.design_delivery_reviews%rowtype;
  v_task public.project_tasks%rowtype;
  v_project public.projects%rowtype;
  v_config jsonb:='{}'::jsonb;
  v_min_score numeric:=90;
  v_failed boolean:=false;
  v_all_pass boolean:=false;
  v_developer uuid;
  v_client_user uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_decision not in ('Pass','Minor Revision','Major Revision','Reject / Rework') then raise exception 'Unsupported review decision.'; end if;
  select * into v_review from public.design_delivery_reviews where id=p_review_id for update;
  if not found then raise exception 'Review not found.'; end if;
  if v_review.status<>'Pending' then raise exception 'This review is already completed.'; end if;
  if v_review.reviewer_user_id is distinct from v_uid and not public.is_admin() then raise exception 'Only the assigned reviewer can complete this gate.'; end if;
  select * into v_task from public.project_tasks where id=v_review.project_task_id for update;
  select * into v_project from public.projects where id=v_review.project_id for update;
  select coalesce(config_value,'{}'::jsonb) into v_config from public.system_configuration where config_key='design_delivery_sop_v1';
  v_min_score:=greatest(0,least(100,coalesce((v_config->>'minimumDesignQaScore')::numeric,90)));
  if v_review.review_type='Independent Design QA' and p_decision='Pass' and (p_quality_score is null or p_quality_score<v_min_score) then
    raise exception 'Independent Design QA requires a score of % or higher to pass.',v_min_score;
  end if;

  update public.design_delivery_reviews
  set status=p_decision,quality_score=p_quality_score,notes=trim(coalesce(p_notes,'')),completed_at=now()
  where id=p_review_id;
  v_failed:=p_decision<>'Pass';

  -- Implementation QA is a post-development loop. A failed visual implementation creates a canonical Development correction task; it never creates a parallel defect system.
  if v_review.review_type='Implementation QA' then
    if v_failed then
      select pt.user_id into v_developer
      from public.project_team pt join public.user_profiles u on u.id=pt.user_id
      where pt.project_id=v_project.id and u.status='active' and u.role in ('developer','web_developer','developer_designer')
      order by case when lower(coalesce(pt.role,'')) like '%developer%' then 0 else 1 end,pt.assigned_at limit 1;
      if v_developer is null then
        select u.id into v_developer from public.user_profiles u where u.status='active' and u.role in ('developer','web_developer','developer_designer') order by u.full_name limit 1;
      end if;
      if v_developer is not null and not exists(
        select 1 from public.project_tasks x where x.project_id=v_project.id and x.status<>'Done' and x.title='Resolve Design Implementation QA · '||v_task.title
      ) then
        insert into public.project_tasks(project_id,title,description,department,assigned_to,created_by,priority,status,due_date,notes)
        values(v_project.id,'Resolve Design Implementation QA · '||v_task.title,'Resolve the structured Design Implementation QA findings before launch.','Development',v_developer,v_uid,'High','To Do',current_date+2,trim(coalesce(p_notes,'')));
        perform public.enqueue_in_app_notification(v_developer,'Design Implementation QA','Design implementation changes required','Design Implementation QA found issues in '||coalesce(v_project.project_number,'Project')||' · '||coalesce(v_project.project_name,'')||'. Open My Work for the correction task.','/admin?tab=myWork','design-implementation-fix:'||p_review_id::text);
      end if;
    elsif v_project.project_manager_id is not null then
      perform public.enqueue_in_app_notification(v_project.project_manager_id,'Design Implementation QA','Design implementation QA passed',coalesce(v_project.project_number,'Project')||' passed the UX/UI implementation review and can continue through technical QA.','/admin?tab=projects','design-implementation-pass:'||p_review_id::text);
    end if;
    return jsonb_build_object('reviewId',p_review_id,'status',p_decision,'implementationQa',true);
  end if;

  if v_failed then
    update public.design_delivery_reviews set status='Cancelled',completed_at=now(),notes=case when length(notes)>0 then notes else 'Cancelled because another review gate required revision.' end
    where project_task_id=v_review.project_task_id and review_round=v_review.review_round and status='Pending';
    update public.project_tasks set status='Changes Required',completed_at=null,updated_at=now() where id=v_review.project_task_id;
    update public.projects set stage='UI/UX Design',updated_at=now() where id=v_project.id;
    if v_task.assigned_to is not null then
      perform public.enqueue_in_app_notification(v_task.assigned_to,'Design Changes','Design changes required',v_review.review_type||' returned '||p_decision||' for "'||coalesce(v_task.title,'Design')||'". Open the same Design Delivery workspace and resolve the structured feedback.','/admin?tab=myWork&focusTask='||v_task.id::text,'design-review-return:'||p_review_id::text);
    end if;
    return jsonb_build_object('reviewId',p_review_id,'status',p_decision,'taskStatus','Changes Required');
  end if;

  select not exists(
    select 1 from public.design_delivery_reviews r
    where r.project_task_id=v_review.project_task_id and r.review_round=v_review.review_round and r.review_type<>'Implementation QA' and r.status<>'Pass'
  ) into v_all_pass;

  if v_all_pass then
    update public.project_tasks set status='Done',completed_at=now(),updated_at=now() where id=v_review.project_task_id;
    update public.projects set stage='Client Design Approval',updated_at=now() where id=v_project.id;
    if v_project.project_manager_id is not null then
      perform public.enqueue_in_app_notification(v_project.project_manager_id,'Design Approval','Design passed all internal gates',coalesce(v_task.title,'Design')||' passed Design QA, accessibility and technical feasibility and is ready for client approval.','/admin?tab=projects','design-internal-pass:'||v_task.id::text||':'||v_review.review_round::text);
    end if;
    select linked_user_id into v_client_user from public.clients where id=v_project.client_id;
    if v_client_user is not null then
      perform public.enqueue_in_app_notification(v_client_user,'Client Design Approval','Your design is ready for review',coalesce(v_project.project_name,'Your project')||' has passed ProFox internal design quality review and is ready for your approval.','/client-portal','client-design-review:'||v_project.id::text||':'||v_review.review_round::text);
    end if;
  end if;
  return jsonb_build_object('reviewId',p_review_id,'status',p_decision,'allRequiredReviewsPassed',v_all_pass,'projectStage',case when v_all_pass then 'Client Design Approval' else v_project.stage end);
end;
$$;

-- Reuse the existing client approval engine. If the client requests design changes, reopen the same canonical design task.
create or replace function public.design_delivery_on_client_design_feedback()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_task public.project_tasks%rowtype;
begin
  if new.from_stage='Client Design Approval' and new.action='Changes Requested' then
    select * into v_task from public.project_tasks
    where project_id=new.project_id and department in ('UI/UX Design','Design')
    order by completed_at desc nulls last,created_at desc limit 1;
    if v_task.id is not null then
      update public.project_tasks set status='Changes Required',completed_at=null,updated_at=now() where id=v_task.id;
      if v_task.assigned_to is not null then
        perform public.enqueue_in_app_notification(v_task.assigned_to,'Client Design Changes','Client requested design changes','Client feedback is recorded in the existing approval history. Open the same Design Delivery workspace to revise the approved design.','/admin?tab=myWork&focusTask='||v_task.id::text,'client-design-changes:'||new.id::text);
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_design_delivery_client_feedback on public.project_client_approvals;
create trigger trg_design_delivery_client_feedback
after insert on public.project_client_approvals
for each row execute function public.design_delivery_on_client_design_feedback();

-- When Development hands the project to QA, automatically bring the original designer back for implementation fidelity review.
create or replace function public.design_delivery_on_project_stage_change()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_task public.project_tasks%rowtype; v_round integer:=1;
begin
  if new.stage='QA' and old.stage is distinct from 'QA' then
    select * into v_task from public.project_tasks
    where project_id=new.id and department in ('UI/UX Design','Design') and assigned_to is not null
    order by completed_at desc nulls last,created_at desc limit 1;
    if v_task.id is not null and not exists(select 1 from public.design_delivery_reviews where project_task_id=v_task.id and review_type='Implementation QA' and status='Pending') then
      select coalesce(max(review_round),0)+1 into v_round from public.design_delivery_reviews where project_task_id=v_task.id and review_type='Implementation QA';
      insert into public.design_delivery_reviews(project_task_id,project_id,review_round,review_type,reviewer_user_id,created_by)
      values(v_task.id,new.id,v_round,'Implementation QA',v_task.assigned_to,coalesce(new.project_manager_id,v_task.assigned_to));
      perform public.enqueue_in_app_notification(v_task.assigned_to,'Design Implementation QA','Implementation is ready for design QA',coalesce(new.project_number,'Project')||' · '||coalesce(new.project_name,'')||' entered QA. Compare staging against the approved design before launch.','/admin?tab=myWork&reviewTask='||v_task.id::text,'design-implementation-qa:'||new.id::text||':'||v_round::text);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_design_delivery_project_stage on public.projects;
create trigger trg_design_delivery_project_stage
after update of stage on public.projects
for each row execute function public.design_delivery_on_project_stage_change();

revoke all on function public.design_delivery_config() from public,anon;
revoke all on function public.design_delivery_compute_readiness(uuid) from public,anon;
revoke all on function public.design_delivery_add_evidence(uuid,text,text,text,text,text,text) from public,anon;
revoke all on function public.design_delivery_start_task(uuid) from public,anon;
revoke all on function public.design_delivery_submit_for_review(uuid,text) from public,anon;
revoke all on function public.design_delivery_get_my_reviews() from public,anon;
revoke all on function public.design_delivery_workspace(uuid) from public,anon;
revoke all on function public.design_delivery_submit_review_decision(uuid,text,numeric,text) from public,anon;

grant execute on function public.design_delivery_config() to authenticated;
grant execute on function public.design_delivery_compute_readiness(uuid) to authenticated;
grant execute on function public.design_delivery_add_evidence(uuid,text,text,text,text,text,text) to authenticated;
grant execute on function public.design_delivery_start_task(uuid) to authenticated;
grant execute on function public.design_delivery_submit_for_review(uuid,text) to authenticated;
grant execute on function public.design_delivery_get_my_reviews() to authenticated;
grant execute on function public.design_delivery_workspace(uuid) to authenticated;
grant execute on function public.design_delivery_submit_review_decision(uuid,text,numeric,text) to authenticated;

-- PF-SOP-09 quality findings, material change control, incidents and post-launch assurance.
-- Records attach to canonical projects/tasks; no parallel project or QA tracker is introduced.

create table if not exists public.development_quality_findings(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_task_id uuid references public.project_tasks(id) on delete cascade,
  source text not null,
  severity text not null,
  title text not null,
  description text not null,
  reproduction_steps text not null default '',
  expected_result text not null default '',
  actual_result text not null default '',
  evidence_url text not null default '',
  status text not null default 'Open',
  assigned_to uuid references public.user_profiles(id),
  resolution_notes text not null default '',
  regression_evidence text not null default '',
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.user_profiles(id),
  resolved_at timestamptz,
  verified_by uuid references public.user_profiles(id),
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint development_quality_findings_source_check check(source in('Developer Self-Test','Code Review','QA','Security','Accessibility','Performance','UI/UX Implementation QA','SEO','Analytics','UAT','Production Monitoring','Client')),
  constraint development_quality_findings_severity_check check(severity in('E0','E1','E2','E3')),
  constraint development_quality_findings_status_check check(status in('Open','In Progress','Resolved','Verified','Waived')),
  constraint development_quality_findings_title_check check(length(trim(title))>=3),
  constraint development_quality_findings_description_check check(length(trim(description))>=10)
);
create index if not exists development_quality_findings_project_idx on public.development_quality_findings(project_id,status,severity,created_at desc);
create index if not exists development_quality_findings_task_idx on public.development_quality_findings(project_task_id,status,created_at desc);

create table if not exists public.development_change_requests(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_task_id uuid references public.project_tasks(id) on delete set null,
  request_summary text not null,
  reason text not null,
  effort_impact text not null,
  cost_impact text not null,
  timeline_impact text not null,
  architecture_impact text not null,
  security_impact text not null,
  qa_regression_impact text not null,
  design_content_seo_impact text not null,
  status text not null default 'Pending Review',
  requested_by uuid not null references public.user_profiles(id),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.user_profiles(id),
  decision_notes text not null default '',
  decided_at timestamptz,
  constraint development_change_request_status_check check(status in('Pending Review','Approved','Rejected','Implemented','Cancelled'))
);

create table if not exists public.development_incidents(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  severity text not null,
  title text not null,
  description text not null,
  status text not null default 'Detected',
  owner_id uuid not null references public.user_profiles(id),
  detected_at timestamptz not null default now(),
  contained_at timestamptz,
  restored_at timestamptz,
  resolved_at timestamptz,
  verified_at timestamptz,
  root_cause text not null default '',
  why_not_prevented text not null default '',
  why_not_detected text not null default '',
  corrective_actions text not null default '',
  prevention_actions text not null default '',
  communication_notes text not null default '',
  created_by uuid not null references public.user_profiles(id),
  updated_at timestamptz not null default now(),
  constraint development_incidents_severity_check check(severity in('E0','E1','E2','E3')),
  constraint development_incidents_status_check check(status in('Detected','Contained','Service Restored','Investigating','Resolved','Verified','Closed'))
);

alter table public.development_quality_findings enable row level security;
alter table public.development_change_requests enable row level security;
alter table public.development_incidents enable row level security;

create or replace function public.development_quality_can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select auth.uid() is not null and(
    public.is_admin()
    or exists(select 1 from public.projects p where p.id=p_project_id and p.project_manager_id=auth.uid())
    or exists(select 1 from public.project_team pt where pt.project_id=p_project_id and pt.user_id=auth.uid())
  )
$$;

-- RLS follows the canonical project membership row; project_team has no active column.
drop policy if exists development_quality_findings_select on public.development_quality_findings;
create policy development_quality_findings_select on public.development_quality_findings for select to authenticated
using(public.development_quality_can_access_project(project_id) or(project_task_id is not null and public.development_delivery_can_access_task(project_task_id)));
drop policy if exists development_change_requests_select on public.development_change_requests;
create policy development_change_requests_select on public.development_change_requests for select to authenticated
using(public.development_quality_can_access_project(project_id));
drop policy if exists development_incidents_select on public.development_incidents;
create policy development_incidents_select on public.development_incidents for select to authenticated
using(public.development_quality_can_access_project(project_id));
revoke insert,update,delete on public.development_quality_findings,public.development_change_requests,public.development_incidents from authenticated;
grant select on public.development_quality_findings,public.development_change_requests,public.development_incidents to authenticated;

create or replace function public.development_quality_create_finding(
  p_project_id uuid,p_task_id uuid,p_source text,p_severity text,p_title text,p_description text,
  p_reproduction_steps text default '',p_expected_result text default '',p_actual_result text default '',p_evidence_url text default '',p_assigned_to uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid();v_role text;v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if not(public.is_admin() or v_role in('project_manager','qa','uiux_designer','developer','web_developer','developer_designer','site_manager')) then raise exception 'Active delivery-team access required.'; end if;
  if not public.development_quality_can_access_project(p_project_id) then raise exception 'You do not have access to this project.'; end if;
  if not exists(select 1 from public.projects where id=p_project_id) then raise exception 'Project not found.'; end if;
  if p_task_id is not null and not exists(select 1 from public.project_tasks t where t.id=p_task_id and t.project_id=p_project_id) then raise exception 'Task does not belong to this project.'; end if;
  if p_assigned_to is not null and not(
    public.is_admin()
    or exists(select 1 from public.project_team pt join public.user_profiles u on u.id=pt.user_id where pt.project_id=p_project_id and pt.user_id=p_assigned_to and u.status='active')
    or exists(select 1 from public.projects p where p.id=p_project_id and p.project_manager_id=p_assigned_to)
  ) then raise exception 'Finding assignee must be an active member of this project.'; end if;
  if p_source not in('Developer Self-Test','Code Review','QA','Security','Accessibility','Performance','UI/UX Implementation QA','SEO','Analytics','UAT','Production Monitoring','Client') then raise exception 'Unsupported finding source.'; end if;
  if p_severity not in('E0','E1','E2','E3') then raise exception 'Severity must be E0, E1, E2 or E3.'; end if;
  if length(trim(p_title))<3 or length(trim(p_description))<10 then raise exception 'Finding title and description are incomplete.'; end if;
  if lower(concat_ws(' ',p_title,p_description,p_reproduction_steps,p_expected_result,p_actual_result,p_evidence_url))~'(password\s*[:=]|api[_ -]?key\s*[:=]|access[_ -]?token\s*[:=]|private[_ -]?key\s*[:=])' then raise exception 'Quality findings must not contain credentials or secrets.'; end if;
  insert into public.development_quality_findings(project_id,project_task_id,source,severity,title,description,reproduction_steps,expected_result,actual_result,evidence_url,assigned_to,created_by)
  values(p_project_id,p_task_id,p_source,p_severity,trim(p_title),trim(p_description),trim(p_reproduction_steps),trim(p_expected_result),trim(p_actual_result),trim(p_evidence_url),p_assigned_to,v_uid)
  returning id into v_id;
  if p_severity in('E0','E1') then
    perform public.service_queue_active_admins_operational_notification('development-finding:'||v_id::text,'development_quality_finding','development_quality_finding','Release-blocking '||p_severity||' Development finding',trim(p_title),'/admin/app/my-work',jsonb_build_object('projectId',p_project_id,'taskId',p_task_id,'findingId',v_id,'severity',p_severity),now());
  end if;
  return v_id;
end;
$$;

create or replace function public.development_quality_update_finding(p_finding_id uuid,p_status text,p_resolution_notes text default '',p_regression_evidence text default '')
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid();v_f public.development_quality_findings%rowtype;v_role text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_f from public.development_quality_findings where id=p_finding_id for update;
  if not found then raise exception 'Finding not found.'; end if;
  if not public.development_quality_can_access_project(v_f.project_id) then raise exception 'You do not have access to this project.'; end if;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if v_role is null then raise exception 'Active delivery-team access required.'; end if;
  if p_status not in('Open','In Progress','Resolved','Verified','Waived') then raise exception 'Unsupported finding status.'; end if;
  if p_status='Waived' and not public.is_admin() then raise exception 'Only Admin may record an explicit finding waiver/risk acceptance.'; end if;
  if p_status='Verified' and v_role not in('admin','project_manager','qa','uiux_designer','site_manager') then raise exception 'Independent QA/Management verification is required.'; end if;
  if p_status='Verified' and v_f.created_by=v_uid and v_f.severity in('E0','E1') then raise exception 'The creator cannot independently verify their own release-blocking finding.'; end if;
  if p_status in('Resolved','Verified','Waived') and length(trim(coalesce(p_resolution_notes,'')))<10 then raise exception 'Specific resolution/risk-acceptance notes are required.'; end if;
  if p_status='Verified' and length(trim(coalesce(p_regression_evidence,'')))<5 then raise exception 'Regression evidence is required before verification.'; end if;
  update public.development_quality_findings set
    status=p_status,resolution_notes=trim(coalesce(p_resolution_notes,'')),regression_evidence=trim(coalesce(p_regression_evidence,'')),
    resolved_by=case when p_status in('Resolved','Verified','Waived') then coalesce(resolved_by,v_uid) else resolved_by end,
    resolved_at=case when p_status in('Resolved','Verified','Waived') then coalesce(resolved_at,now()) else resolved_at end,
    verified_by=case when p_status='Verified' then v_uid else verified_by end,
    verified_at=case when p_status='Verified' then now() else verified_at end,updated_at=now()
  where id=p_finding_id;
end;
$$;

create or replace function public.development_quality_release_blockers(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.development_quality_can_access_project(p_project_id) then raise exception 'You do not have access to this project.'; end if;
  select jsonb_build_object(
    'e0',count(*) filter(where severity='E0' and status not in('Verified','Waived')),
    'e1',count(*) filter(where severity='E1' and status not in('Verified','Waived')),
    'e2',count(*) filter(where severity='E2' and status not in('Verified','Waived')),
    'e3',count(*) filter(where severity='E3' and status not in('Verified','Waived')),
    'releaseBlocking',count(*) filter(where severity in('E0','E1') and status not in('Verified','Waived'))>0
  ) into v_result from public.development_quality_findings where project_id=p_project_id;
  return v_result;
end;
$$;

-- Weighted quality score derives E0/E1 from traceable findings rather than caller-declared counts.
create or replace function public.development_sop_submit_release_quality_score(p_task_id uuid,p_scores jsonb,p_critical_defects integer default 0,p_high_defects integer default 0,p_notes text default '')
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();v_task public.project_tasks%rowtype;v_role text;v_tier text;v_weights jsonb;v_key text;v_weight numeric;v_score numeric;v_total numeric:=0;v_version int;v_status text;v_id uuid;v_blockers jsonb;v_e0 int;v_e1 int;
  v_required text[]:=array['functionalCorrectness','maintainability','security','accessibility','performance','responsiveBrowser','reliabilityErrorHandling','testing','seoAnalytics','documentationDeployability'];
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id for update;
  if not found or v_task.workflow_key<>'development_release_readiness' then raise exception 'Engineering Release Readiness task not found.'; end if;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if v_task.assigned_to is distinct from v_uid or v_role not in('developer','web_developer','developer_designer') then raise exception 'Only the assigned Web Developer can submit the Engineering Quality Score.'; end if;
  v_tier:=public.development_sop_delivery_tier(v_task.project_id);
  v_weights:=public.development_delivery_config()->'qualityScoreWeights';
  foreach v_key in array v_required loop
    if not(p_scores ? v_key) then raise exception 'Missing quality score category: %.',v_key; end if;
    begin v_score:=(p_scores->>v_key)::numeric; exception when others then raise exception 'Quality score % must be numeric.',v_key; end;
    if v_score<0 or v_score>100 then raise exception 'Quality score % must be between 0 and 100.',v_key; end if;
    v_weight:=coalesce((v_weights->>v_key)::numeric,0);v_total:=v_total+(v_score*v_weight/100.0);
  end loop;
  v_total:=round(v_total,2);v_blockers:=public.development_quality_release_blockers(v_task.project_id);v_e0:=coalesce((v_blockers->>'e0')::int,0);v_e1:=coalesce((v_blockers->>'e1')::int,0);
  if v_e0>0 or v_e1>0 then v_status:='NOT RELEASE READY';
  elsif v_tier in('growth','scale','custom') and v_total<80 then v_status:='NOT RELEASE READY';
  elsif v_tier in('growth','scale','custom') and v_total<90 then v_status:='REMEDIATION REQUIRED';
  else v_status:='PASS'; end if;
  select coalesce(max(assessment_version),0)+1 into v_version from public.development_release_quality_assessments where project_task_id=p_task_id;
  insert into public.development_release_quality_assessments(project_id,project_task_id,assessment_version,delivery_tier,category_scores,total_score,critical_defects,high_defects,status,notes,assessed_by)
  values(v_task.project_id,p_task_id,v_version,v_tier,p_scores,v_total,v_e0,v_e1,v_status,trim(coalesce(p_notes,'')),v_uid) returning id into v_id;
  return jsonb_build_object('id',v_id,'version',v_version,'deliveryTier',v_tier,'totalScore',v_total,'status',v_status,'criticalDefects',v_e0,'highDefects',v_e1,'findingBlockers',v_blockers);
end;
$$;

create or replace function public.development_change_request_submit(p_project_id uuid,p_task_id uuid,p_request_summary text,p_reason text,p_effort_impact text,p_cost_impact text,p_timeline_impact text,p_architecture_impact text,p_security_impact text,p_qa_regression_impact text,p_design_content_seo_impact text)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid();v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not public.development_quality_can_access_project(p_project_id) then raise exception 'You do not have access to this project.'; end if;
  if not exists(select 1 from public.projects where id=p_project_id) then raise exception 'Project not found.'; end if;
  if p_task_id is not null and not exists(select 1 from public.project_tasks t where t.id=p_task_id and t.project_id=p_project_id) then raise exception 'Task does not belong to this project.'; end if;
  if length(trim(p_request_summary))<5 or length(trim(p_reason))<10 then raise exception 'Change summary and reason are incomplete.'; end if;
  insert into public.development_change_requests(project_id,project_task_id,request_summary,reason,effort_impact,cost_impact,timeline_impact,architecture_impact,security_impact,qa_regression_impact,design_content_seo_impact,requested_by)
  values(p_project_id,p_task_id,trim(p_request_summary),trim(p_reason),trim(p_effort_impact),trim(p_cost_impact),trim(p_timeline_impact),trim(p_architecture_impact),trim(p_security_impact),trim(p_qa_regression_impact),trim(p_design_content_seo_impact),v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.development_change_request_decide(p_request_id uuid,p_decision text,p_notes text)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_req public.development_change_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_req from public.development_change_requests where id=p_request_id for update;
  if not found then raise exception 'Change request not found.'; end if;
  if not(public.is_admin() or exists(select 1 from public.projects p where p.id=v_req.project_id and p.project_manager_id=auth.uid())) then raise exception 'Assigned Project Manager or Admin approval is required.'; end if;
  if p_decision not in('Approved','Rejected') then raise exception 'Decision must be Approved or Rejected.'; end if;
  if length(trim(p_notes))<5 then raise exception 'Decision notes are required.'; end if;
  update public.development_change_requests set status=p_decision,decided_by=auth.uid(),decision_notes=trim(p_notes),decided_at=now() where id=p_request_id;
end;
$$;

create or replace function public.development_incident_create(p_project_id uuid,p_severity text,p_title text,p_description text,p_owner_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid();v_id uuid;v_owner uuid:=coalesce(p_owner_id,auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not public.development_quality_can_access_project(p_project_id) then raise exception 'You do not have access to this project.'; end if;
  if not exists(select 1 from public.projects where id=p_project_id) then raise exception 'Project not found.'; end if;
  if not(v_owner=v_uid or public.is_admin()
    or exists(select 1 from public.project_team pt join public.user_profiles u on u.id=pt.user_id where pt.project_id=p_project_id and pt.user_id=v_owner and u.status='active')
    or exists(select 1 from public.projects p where p.id=p_project_id and p.project_manager_id=v_owner)) then
    raise exception 'Incident owner must be the caller or an active member/manager of this project.';
  end if;
  if p_severity not in('E0','E1','E2','E3') then raise exception 'Incident severity must be E0-E3.'; end if;
  if length(trim(p_title))<3 or length(trim(p_description))<10 then raise exception 'Incident details are incomplete.'; end if;
  insert into public.development_incidents(project_id,severity,title,description,owner_id,created_by)
  values(p_project_id,p_severity,trim(p_title),trim(p_description),v_owner,v_uid) returning id into v_id;
  if p_severity in('E0','E1') then
    perform public.service_queue_active_admins_operational_notification('development-incident:'||v_id::text,'development_incident','development_incident',p_severity||' production incident',trim(p_title),'/admin/app/my-work',jsonb_build_object('projectId',p_project_id,'incidentId',v_id,'severity',p_severity),now());
  end if;
  return v_id;
end;
$$;

create or replace function public.development_incident_update(p_incident_id uuid,p_status text,p_communication_notes text default '',p_root_cause text default '',p_why_not_prevented text default '',p_why_not_detected text default '',p_corrective_actions text default '',p_prevention_actions text default '')
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_i public.development_incidents%rowtype;v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_i from public.development_incidents where id=p_incident_id for update;
  if not found then raise exception 'Incident not found.'; end if;
  if not public.development_quality_can_access_project(v_i.project_id) then raise exception 'You do not have access to this project.'; end if;
  if not(public.is_admin() or v_i.owner_id=v_uid or exists(select 1 from public.projects p where p.id=v_i.project_id and p.project_manager_id=v_uid)) then raise exception 'Incident owner, Project Manager or Admin access required.'; end if;
  if p_status not in('Detected','Contained','Service Restored','Investigating','Resolved','Verified','Closed') then raise exception 'Unsupported incident status.'; end if;
  if p_status in('Verified','Closed') and(length(trim(p_root_cause))<10 or length(trim(p_corrective_actions))<10 or length(trim(p_prevention_actions))<10) then raise exception 'Root cause, corrective actions and prevention actions are required before incident verification/closure.'; end if;
  update public.development_incidents set
    status=p_status,communication_notes=trim(coalesce(p_communication_notes,'')),root_cause=trim(coalesce(p_root_cause,'')),
    why_not_prevented=trim(coalesce(p_why_not_prevented,'')),why_not_detected=trim(coalesce(p_why_not_detected,'')),
    corrective_actions=trim(coalesce(p_corrective_actions,'')),prevention_actions=trim(coalesce(p_prevention_actions,'')),
    contained_at=case when p_status='Contained' then coalesce(contained_at,now()) else contained_at end,
    restored_at=case when p_status='Service Restored' then coalesce(restored_at,now()) else restored_at end,
    resolved_at=case when p_status='Resolved' then coalesce(resolved_at,now()) else resolved_at end,
    verified_at=case when p_status in('Verified','Closed') then coalesce(verified_at,now()) else verified_at end,updated_at=now()
  where id=p_incident_id;
end;
$$;

create or replace function public.development_sop_ensure_post_launch_assurance(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_project public.projects%rowtype;v_task uuid;v_dev uuid;v_creator uuid;v_tier text;v_days int;
begin
  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found.'; end if;
  select id into v_task from public.project_tasks where project_id=p_project_id and workflow_key='development_post_launch_assurance' limit 1;
  if v_task is not null then return v_task; end if;
  v_tier:=public.development_sop_delivery_tier(p_project_id);
  v_days:=coalesce((public.development_delivery_config()->'supportDays'->>v_tier)::int,14);
  select pt.user_id into v_dev from public.project_team pt join public.user_profiles up on up.id=pt.user_id
  where pt.project_id=p_project_id and up.status='active' and up.role in('developer','web_developer','developer_designer')
  order by pt.assigned_at asc limit 1;
  v_creator:=coalesce(v_project.project_manager_id,auth.uid());
  if v_creator is null then select id into v_creator from public.user_profiles where role='admin' and status='active' order by created_at asc limit 1; end if;
  insert into public.project_tasks(project_id,title,description,department,assigned_to,created_by,priority,status,due_date,workflow_key,workflow_stage,required_for_stage)
  values(p_project_id,v_days||'-Day Post-Launch Assurance','PF-SOP-09 package-aware assurance. Monitor availability, forms/critical journeys, errors, analytics/conversion tracking, indexing/search, performance, security-relevant events and integrations according to scope. Resolve scope-related defects and record incidents/root-cause improvement where required.','Development',v_dev,v_creator,'Normal','To Do',current_date+v_days,'development_post_launch_assurance','Handover',false)
  on conflict(project_id,workflow_key) where workflow_key is not null do update set due_date=excluded.due_date,description=excluded.description
  returning id into v_task;
  return v_task;
end;
$$;

create or replace function public.development_sop_post_launch_stage_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.stage is distinct from old.stage and new.stage='Handover' then perform public.development_sop_ensure_post_launch_assurance(new.id); end if;
  return new;
end;
$$;
drop trigger if exists trg_development_sop_post_launch_assurance on public.projects;
create trigger trg_development_sop_post_launch_assurance after update of stage on public.projects for each row execute function public.development_sop_post_launch_stage_trigger();

create or replace function public.development_quality_workspace(p_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_task public.project_tasks%rowtype;v_findings jsonb;v_changes jsonb;v_incidents jsonb;v_blockers jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.development_delivery_can_access_task(p_task_id) then raise exception 'You do not have access to this Development task.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id;
  if not found then raise exception 'Task not found.'; end if;
  select coalesce(jsonb_agg(to_jsonb(f) order by case f.severity when 'E0' then 0 when 'E1' then 1 when 'E2' then 2 else 3 end,f.created_at desc),'[]'::jsonb) into v_findings
  from public.development_quality_findings f where f.project_id=v_task.project_id and(f.project_task_id=p_task_id or f.project_task_id is null);
  select coalesce(jsonb_agg(to_jsonb(c) order by c.requested_at desc),'[]'::jsonb) into v_changes
  from public.development_change_requests c where c.project_id=v_task.project_id and(c.project_task_id=p_task_id or c.project_task_id is null);
  select coalesce(jsonb_agg(to_jsonb(i) order by i.detected_at desc),'[]'::jsonb) into v_incidents
  from public.development_incidents i where i.project_id=v_task.project_id;
  v_blockers:=public.development_quality_release_blockers(v_task.project_id);
  return jsonb_build_object('findings',v_findings,'changeRequests',v_changes,'incidents',v_incidents,'releaseBlockers',v_blockers);
end;
$$;
-- Delivery staffing, assignment integrity, and executable QA review gates.

create or replace function public.delivery_role_matches_team_label(p_user_role text,p_team_role text)
returns boolean
language sql
immutable
set search_path=public,pg_temp
as $$
  select case lower(trim(coalesce(p_team_role,'')))
    when 'project manager' then p_user_role in('admin','project_manager')
    when 'content writer' then p_user_role='content_writer'
    when 'ui/ux designer' then p_user_role='uiux_designer'
    when 'developer' then p_user_role in('developer','web_developer','developer_designer')
    when 'developer / designer' then p_user_role='developer_designer'
    when 'quality assurance' then p_user_role='qa'
    when 'qa tester' then p_user_role='qa'
    when 'sales handover' then p_user_role in('sales','sales_rep','sales_team')
    when 'administrator' then p_user_role='admin'
    when 'site manager' then p_user_role='site_manager'
    else false
  end
$$;

create or replace function public.validate_project_team_role_compatibility()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_role text;
begin
  select role into v_role from public.user_profiles where id=new.user_id and status='active';
  if v_role is null then
    raise exception 'Only an active staff account can be assigned to a project team.';
  end if;
  if not public.delivery_role_matches_team_label(v_role,new.role) then
    raise exception 'The selected employee role (%) is not compatible with the project role (%).',v_role,coalesce(new.role,'Not set');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_project_team_role_compatibility on public.project_team;
create trigger trg_validate_project_team_role_compatibility
before insert or update of user_id,role on public.project_team
for each row execute function public.validate_project_team_role_compatibility();

create or replace function public.delivery_role_matches_department(p_user_role text,p_department text)
returns boolean
language sql
immutable
set search_path=public,pg_temp
as $$
  select case lower(trim(coalesce(p_department,'')))
    when 'content' then p_user_role='content_writer'
    when 'ui/ux design' then p_user_role='uiux_designer'
    when 'design' then p_user_role='uiux_designer'
    when 'development' then p_user_role in('developer','web_developer','developer_designer')
    when 'quality assurance' then p_user_role='qa'
    when 'qa' then p_user_role='qa'
    when 'project management' then p_user_role in('admin','project_manager','site_manager')
    when 'sales' then p_user_role in('sales','sales_rep','sales_team')
    when 'general' then p_user_role in('admin','project_manager','site_manager','content_writer','uiux_designer','developer','web_developer','developer_designer','qa','sales','sales_rep','sales_team')
    when '' then p_user_role in('admin','project_manager','site_manager','content_writer','uiux_designer','developer','web_developer','developer_designer','qa','sales','sales_rep','sales_team')
    else false
  end
$$;

create or replace function public.validate_project_task_assignee()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_role text;
begin
  if new.assigned_to is null or (tg_op='UPDATE' and new.assigned_to is not distinct from old.assigned_to and new.department is not distinct from old.department) then
    return new;
  end if;
  select role into v_role from public.user_profiles where id=new.assigned_to and status='active';
  if v_role is null then
    raise exception 'Project tasks may only be assigned to an active staff account.';
  end if;
  if not public.delivery_role_matches_department(v_role,new.department) then
    raise exception 'The selected employee role (%) cannot be assigned to the % department.',v_role,coalesce(new.department,'unspecified');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_project_task_assignee on public.project_tasks;
create trigger trg_validate_project_task_assignee
before insert or update of assigned_to,department on public.project_tasks
for each row execute function public.validate_project_task_assignee();

create or replace function public.pick_delivery_specialist(p_department text,p_project_id uuid default null)
returns uuid
language sql
stable security definer
set search_path=public,pg_temp
as $$
with eligible as (
  select u.id,
         coalesce(cp.availability_status,'Available') availability_status,
         coalesce(cp.max_parallel_work,case when u.role='uiux_designer' then greatest(1,coalesce((select (config_value->>'wipLimit')::integer from public.system_configuration where config_key='design_delivery_sop_v1'),2)) else 4 end) max_work,
         coalesce(cp.reviewer_eligible,false) reviewer_eligible,
         count(t.id) filter(where t.completed_at is null and lower(coalesce(t.status,'')) not in('done','completed','cancelled')) open_work,
         case when exists(select 1 from public.project_team pt where pt.project_id=p_project_id and pt.user_id=u.id) then 0 else 1 end project_rank
  from public.user_profiles u
  left join public.workforce_capability_profiles cp on cp.user_id=u.id
  left join public.project_tasks t on t.assigned_to=u.id
  where u.status='active'
    and u.onboarding_status='completed'
    and coalesce(cp.availability_status,'Available')<>'Unavailable'
    and (
      (lower(coalesce(p_department,'')) in('ui/ux design','design') and u.role='uiux_designer') or
      (lower(coalesce(p_department,''))='content' and u.role='content_writer') or
      (lower(coalesce(p_department,''))='development' and u.role in('developer','web_developer','developer_designer')) or
      (lower(coalesce(p_department,'')) in('quality assurance','qa') and u.role='qa')
    )
  group by u.id,cp.availability_status,cp.max_parallel_work,cp.reviewer_eligible,u.role
)
select id from eligible where open_work<max_work
order by project_rank,reviewer_eligible,case availability_status when 'Available' then 0 else 1 end,open_work::numeric/nullif(max_work,0),open_work,id
limit 1
$$;

create or replace function public.development_delivery_pick_reviewer(p_project_id uuid,p_exclude_user_id uuid)
returns uuid
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare v_reviewer uuid;
begin
  select u.id into v_reviewer
  from public.user_profiles u
  join public.workforce_capability_profiles cp on cp.user_id=u.id
  left join public.project_team pt on pt.project_id=p_project_id and pt.user_id=u.id
  where u.status='active'
    and u.onboarding_status='completed'
    and u.id is distinct from p_exclude_user_id
    and u.role in('developer','web_developer','developer_designer')
    and cp.reviewer_eligible
    and cp.availability_status<>'Unavailable'
    and exists(select 1 from unnest(cp.reviewer_qualifications) q where lower(q)='code review')
  order by case when pt.user_id is not null then 0 else 1 end,
           (select count(*) from public.development_delivery_reviews r where r.reviewer_user_id=u.id and r.status='Pending'),u.full_name
  limit 1;
  return v_reviewer;
end;
$$;

create or replace function public.delivery_stage_staffing_blockers(p_stage text)
returns text[]
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare v_blockers text[]:='{}'; v_count integer:=0;
begin
  if p_stage='Content' then
    select count(*) into v_count from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id
    where u.status='active' and u.onboarding_status='completed' and u.role='content_writer' and coalesce(cp.availability_status,'Available')<>'Unavailable';
    if v_count<1 then v_blockers:=array_append(v_blockers,'At least one active, onboarded and available Content Writer is required.'); end if;
  elsif p_stage in('UI/UX Design','Client Design Approval') then
    select count(*) into v_count from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id
    where u.status='active' and u.onboarding_status='completed' and u.role='uiux_designer' and coalesce(cp.availability_status,'Available')<>'Unavailable';
    if v_count<2 then v_blockers:=array_append(v_blockers,'Two available UI/UX Designers are required so the contributor and independent reviewer are different people.'); end if;
    if not exists(select 1 from public.user_profiles u join public.workforce_capability_profiles cp on cp.user_id=u.id where u.status='active' and u.onboarding_status='completed' and u.role='uiux_designer' and cp.reviewer_eligible and cp.availability_status<>'Unavailable' and exists(select 1 from unnest(cp.reviewer_qualifications) q where lower(q)='independent design qa')) then
      v_blockers:=array_append(v_blockers,'A reviewer-eligible UI/UX Designer qualified for Independent Design QA is required.');
    end if;
    if not exists(select 1 from public.user_profiles u join public.workforce_capability_profiles cp on cp.user_id=u.id where u.status='active' and u.onboarding_status='completed' and u.role in('uiux_designer','qa') and cp.reviewer_eligible and cp.availability_status<>'Unavailable' and exists(select 1 from unnest(cp.reviewer_qualifications) q where lower(q)='accessibility review')) then
      v_blockers:=array_append(v_blockers,'A reviewer-eligible UI/UX or QA specialist qualified for Accessibility Review is required.');
    end if;
    if not exists(select 1 from public.user_profiles u join public.workforce_capability_profiles cp on cp.user_id=u.id where u.status='active' and u.onboarding_status='completed' and u.role in('developer','web_developer','developer_designer') and cp.reviewer_eligible and cp.availability_status<>'Unavailable' and exists(select 1 from unnest(cp.reviewer_qualifications) q where lower(q)='technical feasibility')) then
      v_blockers:=array_append(v_blockers,'A reviewer-eligible Developer qualified for Technical Feasibility is required.');
    end if;
  elsif p_stage='Development' then
    select count(*) into v_count from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id
    where u.status='active' and u.onboarding_status='completed' and u.role in('developer','web_developer','developer_designer') and coalesce(cp.availability_status,'Available')<>'Unavailable';
    if v_count<2 then v_blockers:=array_append(v_blockers,'Two available Developers are required so implementation and peer review remain independent.'); end if;
    if not exists(select 1 from public.user_profiles u join public.workforce_capability_profiles cp on cp.user_id=u.id where u.status='active' and u.onboarding_status='completed' and u.role in('developer','web_developer','developer_designer') and cp.reviewer_eligible and cp.availability_status<>'Unavailable' and exists(select 1 from unnest(cp.reviewer_qualifications) q where lower(q)='code review')) then
      v_blockers:=array_append(v_blockers,'A reviewer-eligible Developer qualified for Code Review is required.');
    end if;
  elsif p_stage in('QA','Client Review','Final Revisions','Launch') then
    select count(*) into v_count from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id
    where u.status='active' and u.onboarding_status='completed' and u.role='qa' and coalesce(cp.availability_status,'Available')<>'Unavailable';
    if v_count<1 then v_blockers:=array_append(v_blockers,'At least one active, onboarded and available QA specialist is required.'); end if;
  end if;
  return v_blockers;
end;
$$;

create or replace function public.delivery_stage_staffing_readiness(p_project_id uuid,p_stage text)
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare v_role text; v_pm uuid; v_blockers text[];
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select role into v_role from public.user_profiles where id=auth.uid() and status='active';
  select project_manager_id into v_pm from public.projects where id=p_project_id;
  if not(public.is_admin() or v_role='site_manager' or (v_role='project_manager' and v_pm=auth.uid())) then
    raise exception 'Only the assigned Project Manager, Site Manager or Admin can inspect delivery staffing readiness.';
  end if;
  v_blockers:=public.delivery_stage_staffing_blockers(p_stage);
  return jsonb_build_object('stage',p_stage,'ready',coalesce(array_length(v_blockers,1),0)=0,'blockers',to_jsonb(v_blockers));
end;
$$;

create or replace function public.protect_delivery_stage_staffing()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_blockers text[];
begin
  if new.stage is not distinct from old.stage then return new; end if;
  v_blockers:=public.delivery_stage_staffing_blockers(new.stage);
  if coalesce(array_length(v_blockers,1),0)>0 then
    raise exception 'Cannot enter %: %',new.stage,array_to_string(v_blockers,' ');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_delivery_stage_staffing on public.projects;
create trigger trg_protect_delivery_stage_staffing
before update of stage on public.projects
for each row execute function public.protect_delivery_stage_staffing();

create or replace function public.qa_delivery_can_access_task(p_task_id uuid)
returns boolean
language sql
stable security definer
set search_path=public,pg_temp
as $$
  select auth.uid() is not null and exists(
    select 1 from public.project_tasks t
    join public.projects p on p.id=t.project_id
    join public.user_profiles u on u.id=auth.uid() and u.status='active'
    where t.id=p_task_id and lower(coalesce(t.department,'')) in('quality assurance','qa')
      and (t.assigned_to=auth.uid() or p.project_manager_id=auth.uid() or u.role in('admin','site_manager'))
  )
$$;

create or replace function public.qa_delivery_required_evidence(p_task_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare v_key text;
begin
  select workflow_key into v_key from public.project_tasks where id=p_task_id and lower(coalesce(department,'')) in('quality assurance','qa');
  if v_key='functional_responsive_testing' then return '["test_result","browser_responsive_check","accessibility_check","staging_url"]'::jsonb; end if;
  if v_key='security_performance_review' then return '["security_check","performance_check","qa_handoff"]'::jsonb; end if;
  if v_key='launch_tracking_verification' then return '["smoke_test","analytics_check","monitoring_check"]'::jsonb; end if;
  return '["test_result","qa_handoff"]'::jsonb;
end;
$$;

create or replace function public.qa_delivery_workspace(p_task_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare v_task public.project_tasks%rowtype; v_project public.projects%rowtype; v_evidence jsonb:='[]'; v_findings jsonb:='[]'; v_required jsonb; v_missing jsonb:='[]'; v_role text;
begin
  if not public.qa_delivery_can_access_task(p_task_id) then raise exception 'You do not have access to this QA task.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id;
  if not found then raise exception 'QA task not found.'; end if;
  select * into v_project from public.projects where id=v_task.project_id;
  select role into v_role from public.user_profiles where id=auth.uid();
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) into v_evidence from public.development_delivery_evidence e where e.project_task_id=p_task_id;
  select coalesce(jsonb_agg(to_jsonb(f) order by case f.severity when 'E0' then 0 when 'E1' then 1 when 'E2' then 2 else 3 end,f.created_at desc),'[]'::jsonb) into v_findings from public.development_quality_findings f where f.project_id=v_task.project_id and (f.project_task_id=p_task_id or f.project_task_id is null);
  v_required:=public.qa_delivery_required_evidence(p_task_id);
  select coalesce(jsonb_agg(req.value order by req.value),'[]'::jsonb) into v_missing
  from jsonb_array_elements_text(v_required) req(value)
  where not exists(select 1 from public.development_delivery_evidence e where e.project_task_id=p_task_id and e.active and e.status in('Provided','Verified') and e.evidence_type=req.value);
  return jsonb_build_object(
    'task',to_jsonb(v_task),'project',to_jsonb(v_project),'evidence',v_evidence,'findings',v_findings,
    'requiredEvidence',v_required,'missingEvidence',v_missing,
    'ready',jsonb_array_length(v_missing)=0 and not exists(select 1 from public.development_quality_findings f where f.project_id=v_task.project_id and f.severity in('E0','E1') and f.status not in('Verified','Waived')),
    'canReview',public.is_admin() or v_role='site_manager' or v_project.project_manager_id=auth.uid()
  );
end;
$$;

create or replace function public.qa_delivery_start_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_task public.project_tasks%rowtype; v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id for update;
  if not found then raise exception 'QA task not found.'; end if;
  select role into v_role from public.user_profiles where id=auth.uid() and status='active';
  if v_task.assigned_to is distinct from auth.uid() or v_role<>'qa' then raise exception 'Only the assigned QA specialist can start this task.'; end if;
  if lower(coalesce(v_task.department,'')) not in('quality assurance','qa') then raise exception 'This is not a QA task.'; end if;
  if v_task.status not in('To Do','Changes Required') then raise exception 'This QA task cannot be started from its current status.'; end if;
  update public.project_tasks set status='In Progress',start_date=coalesce(start_date,current_date),completed_at=null,updated_at=now() where id=p_task_id;
  return jsonb_build_object('taskId',p_task_id,'status','In Progress');
end;
$$;

create or replace function public.qa_delivery_add_evidence(p_task_id uuid,p_evidence_type text,p_label text default '',p_reference_url text default '',p_reference_note text default '')
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_task public.project_tasks%rowtype; v_project public.projects%rowtype; v_role text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id for update;
  if not found then raise exception 'QA task not found.'; end if;
  select * into v_project from public.projects where id=v_task.project_id;
  select role into v_role from public.user_profiles where id=auth.uid() and status='active';
  if lower(coalesce(v_task.department,'')) not in('quality assurance','qa') then raise exception 'This is not a QA task.'; end if;
  if not(v_task.assigned_to=auth.uid() and v_role='qa') and not(public.is_admin() or v_role='site_manager' or v_project.project_manager_id=auth.uid()) then raise exception 'Only the assigned QA specialist or delivery manager can add QA evidence.'; end if;
  if p_evidence_type not in('test_result','browser_responsive_check','accessibility_check','staging_url','security_check','performance_check','qa_handoff','smoke_test','analytics_check','monitoring_check') then raise exception 'Unsupported QA evidence type.'; end if;
  if length(trim(coalesce(p_reference_url,'')))=0 and length(trim(coalesce(p_reference_note,'')))=0 then raise exception 'Add a source link or evidence note.'; end if;
  if lower(coalesce(p_reference_url,''))~'(password|secret|token|apikey|api_key)=' then raise exception 'Do not store credentials or secret-bearing URLs in QA evidence.'; end if;
  update public.development_delivery_evidence set active=false,status='Superseded' where project_task_id=p_task_id and evidence_type=p_evidence_type and active;
  insert into public.development_delivery_evidence(project_task_id,project_id,evidence_type,label,reference_url,reference_note,status,created_by)
  values(p_task_id,v_task.project_id,p_evidence_type,left(trim(coalesce(p_label,'')),240),left(trim(coalesce(p_reference_url,'')),2000),left(trim(coalesce(p_reference_note,'')),6000),'Provided',auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.qa_delivery_submit_for_review(p_task_id uuid,p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_task public.project_tasks%rowtype; v_role text; v_required jsonb; v_missing text:='';
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id for update;
  if not found then raise exception 'QA task not found.'; end if;
  select role into v_role from public.user_profiles where id=auth.uid() and status='active';
  if v_task.assigned_to is distinct from auth.uid() or v_role<>'qa' then raise exception 'Only the assigned QA specialist can submit this task.'; end if;
  if v_task.status not in('In Progress','Changes Required') then raise exception 'QA must be In Progress before review submission.'; end if;
  v_required:=public.qa_delivery_required_evidence(p_task_id);
  select string_agg(replace(req.value,'_',' '),', ' order by req.value) into v_missing from jsonb_array_elements_text(v_required) req(value)
  where not exists(select 1 from public.development_delivery_evidence e where e.project_task_id=p_task_id and e.active and e.status in('Provided','Verified') and e.evidence_type=req.value);
  if coalesce(v_missing,'')<>'' then raise exception 'QA review submission is missing required evidence: %.',v_missing; end if;
  if exists(select 1 from public.development_quality_findings f where f.project_id=v_task.project_id and f.severity in('E0','E1') and f.status not in('Verified','Waived')) then raise exception 'Resolve and independently verify every E0/E1 finding before QA review submission.'; end if;
  perform set_config('app.qa_workflow_action','submit',true);
  update public.project_tasks set status='Review',notes=case when length(trim(coalesce(p_note,'')))>0 then left(trim(p_note),6000) else notes end,updated_at=now() where id=p_task_id;
  return jsonb_build_object('taskId',p_task_id,'status','Review');
end;
$$;

create or replace function public.qa_delivery_get_review_queue()
returns jsonb
language plpgsql
stable security definer
set search_path=public,pg_temp
as $$
declare v_role text; v_items jsonb:='[]';
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select role into v_role from public.user_profiles where id=auth.uid() and status='active';
  if v_role not in('admin','project_manager','site_manager') then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('taskId',t.id,'taskTitle',t.title,'projectId',p.id,'projectNumber',p.project_number,'projectName',p.project_name,'priority',t.priority,'dueDate',t.due_date,'submittedAt',t.updated_at,'assigneeName',u.full_name) order by t.updated_at),'[]'::jsonb) into v_items
  from public.project_tasks t join public.projects p on p.id=t.project_id left join public.user_profiles u on u.id=t.assigned_to
  where lower(coalesce(t.department,'')) in('quality assurance','qa') and t.status='Review'
    and (v_role in('admin','site_manager') or p.project_manager_id=auth.uid());
  return v_items;
end;
$$;

create or replace function public.qa_delivery_review_decision(p_task_id uuid,p_decision text,p_notes text default '')
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_task public.project_tasks%rowtype; v_project public.projects%rowtype; v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if p_decision not in('Pass','Changes Required') then raise exception 'Unsupported QA review decision.'; end if;
  if p_decision='Changes Required' and length(trim(coalesce(p_notes,'')))<10 then raise exception 'Specific review feedback is required when changes are requested.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id for update;
  if not found then raise exception 'QA task not found.'; end if;
  select * into v_project from public.projects where id=v_task.project_id;
  select role into v_role from public.user_profiles where id=auth.uid() and status='active';
  if not(public.is_admin() or v_role='site_manager' or (v_role='project_manager' and v_project.project_manager_id=auth.uid())) then raise exception 'Only the assigned Project Manager, Site Manager or Admin can review QA.'; end if;
  if v_task.status<>'Review' then raise exception 'This QA task is not awaiting review.'; end if;
  if p_decision='Pass' and exists(select 1 from public.development_quality_findings f where f.project_id=v_task.project_id and f.severity in('E0','E1') and f.status not in('Verified','Waived')) then raise exception 'QA cannot pass while an E0/E1 finding remains unresolved or unverified.'; end if;
  perform set_config('app.qa_workflow_action','review',true);
  update public.project_tasks set status=case when p_decision='Pass' then 'Done' else 'Changes Required' end,completed_at=case when p_decision='Pass' then now() else null end,notes=case when length(trim(coalesce(p_notes,'')))>0 then left(trim(p_notes),6000) else notes end,updated_at=now() where id=p_task_id;
  return jsonb_build_object('taskId',p_task_id,'status',case when p_decision='Pass' then 'Done' else 'Changes Required' end,'decision',p_decision);
end;
$$;

create or replace function public.protect_qa_task_status()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_action text:=current_setting('app.qa_workflow_action',true);
begin
  if lower(coalesce(new.department,'')) not in('quality assurance','qa') or new.status is not distinct from old.status then return new; end if;
  if new.status='Review' and coalesce(v_action,'')<>'submit' then raise exception 'Use the QA workspace to submit evidence for review.'; end if;
  if (old.status='Review' or new.status='Done') and coalesce(v_action,'')<>'review' then raise exception 'Use the QA review decision gate to complete or return this task.'; end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_qa_task_status on public.project_tasks;
create trigger trg_protect_qa_task_status
before update of status on public.project_tasks
for each row execute function public.protect_qa_task_status();

revoke all on function public.delivery_role_matches_team_label(text,text) from public,anon,authenticated;
revoke all on function public.validate_project_team_role_compatibility() from public,anon,authenticated;
revoke all on function public.delivery_role_matches_department(text,text) from public,anon,authenticated;
revoke all on function public.validate_project_task_assignee() from public,anon,authenticated;
revoke all on function public.pick_delivery_specialist(text,uuid) from public,anon,authenticated;
revoke all on function public.development_delivery_pick_reviewer(uuid,uuid) from public,anon,authenticated;
revoke all on function public.delivery_stage_staffing_blockers(text) from public,anon,authenticated;
revoke all on function public.protect_delivery_stage_staffing() from public,anon,authenticated;
revoke all on function public.qa_delivery_can_access_task(uuid) from public,anon,authenticated;
revoke all on function public.qa_delivery_required_evidence(uuid) from public,anon,authenticated;
revoke all on function public.protect_qa_task_status() from public,anon,authenticated;

revoke all on function public.delivery_stage_staffing_readiness(uuid,text) from public,anon;
revoke all on function public.qa_delivery_workspace(uuid) from public,anon;
revoke all on function public.qa_delivery_start_task(uuid) from public,anon;
revoke all on function public.qa_delivery_add_evidence(uuid,text,text,text,text) from public,anon;
revoke all on function public.qa_delivery_submit_for_review(uuid,text) from public,anon;
revoke all on function public.qa_delivery_get_review_queue() from public,anon;
revoke all on function public.qa_delivery_review_decision(uuid,text,text) from public,anon;

grant execute on function public.delivery_stage_staffing_readiness(uuid,text) to authenticated;
grant execute on function public.qa_delivery_workspace(uuid) to authenticated;
grant execute on function public.qa_delivery_start_task(uuid) to authenticated;
grant execute on function public.qa_delivery_add_evidence(uuid,text,text,text,text) to authenticated;
grant execute on function public.qa_delivery_submit_for_review(uuid,text) to authenticated;
grant execute on function public.qa_delivery_get_review_queue() to authenticated;
grant execute on function public.qa_delivery_review_decision(uuid,text,text) to authenticated;

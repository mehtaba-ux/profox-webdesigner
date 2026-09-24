-- PF-SOP-09 — ProFox Web Development, Engineering & Technical Quality Assurance SOP
-- Executable controls layered onto the existing project/task/review/evidence system.
-- No duplicate project manager, task tracker, QA tracker or handover system is introduced.

-- -----------------------------------------------------------------------------
-- 1. Controlled SOP configuration / package-aware quality policy
-- -----------------------------------------------------------------------------
insert into public.system_configuration(config_key,config_value,description)
values(
  'development_delivery_sop_v1',
  jsonb_build_object(
    'sopKey','PF-SOP-09',
    'version','1.0',
    'classification','Controlled Internal SOP',
    'reviewCycle','Every 6 months or after a major technology, security, browser, accessibility, hosting or engineering-standard change',
    'wipLimit',2,
    'reviewSlaHours',24,
    'requireClientDesignApproval',true,
    'requireApprovedDesignHandoff',true,
    'requireIndependentCodeReview',true,
    'accessibilityTarget','WCAG 2.2 AA (applicable success criteria)',
    'securityBaseline','OWASP ASVS 5.0 risk-based',
    'coreWebVitals',jsonb_build_object('lcpMs',2500,'inpMs',200,'cls',0.1,'percentile',75),
    'qualityDimensions',jsonb_build_array(
      'Functional suitability','Performance efficiency','Compatibility','Interaction capability','Reliability',
      'Security','Maintainability','Flexibility','Safety'
    ),
    'engineeringModel',jsonb_build_array('UNDERSTAND','INSPECT','PLAN','ARCHITECT','BUILD','SELF-TEST','REVIEW','INTEGRATE','TEST','VALIDATE','RELEASE','VERIFY','OBSERVE','SUPPORT','IMPROVE'),
    'qualityGates',jsonb_build_array(
      'Engineering Ready','Architecture Ready','Code Ready','QA Ready','Release Ready','Production Verified','Closure Ready'
    ),
    'reuseDecisions',jsonb_build_array('REUSE','EXTEND','REFACTOR','BUILD NEW'),
    'releaseScoreThreshold',90,
    'releaseRemediationThreshold',80,
    'supportDays',jsonb_build_object('launch',14,'growth',30,'scale',60,'custom',60),
    'qualityScoreWeights',jsonb_build_object(
      'functionalCorrectness',20,'maintainability',10,'security',15,'accessibility',10,'performance',10,
      'responsiveBrowser',10,'reliabilityErrorHandling',10,'testing',5,'seoAnalytics',5,'documentationDeployability',5
    ),
    'requiredEvidenceByWorkflow',jsonb_build_object(
      'technical_architecture',jsonb_build_array('architecture_notes','reuse_inspection','repository','branch','environment_check','dependency_review'),
      'development_implementation',jsonb_build_array('reuse_inspection','repository','branch','pull_request','commit','build_result','test_result','staging_url','browser_responsive_check','accessibility_check','performance_check','security_check'),
      'final_revision_set',jsonb_build_array('pull_request','commit','test_result','staging_url','browser_responsive_check'),
      'development_release_readiness',jsonb_build_array('test_result','staging_url','qa_handoff','accessibility_check','performance_check','security_check','seo_check','analytics_check','backup_recovery','rollback_plan'),
      'production_launch',jsonb_build_array('commit','build_result','production_url','deployment_reference','release_notes','rollback_plan'),
      'development_handover_package',jsonb_build_array('production_url','smoke_test','monitoring_check','documentation','backup_recovery','handover_reference'),
      'default',jsonb_build_array('reuse_inspection','pull_request','commit','test_result','staging_url')
    ),
    'nonNegotiables',jsonb_build_array(
      'No coding without understanding the requirement.',
      'No duplicate functionality without inspecting what already exists.',
      'No production secrets in source code.',
      'No security-critical trust in client-side code alone.',
      'No authorization based only on hidden UI.',
      'No unvalidated external input.',
      'No arbitrary dependencies without review.',
      'No raw AI-generated code accepted without human verification.',
      'No significant production release without testing.',
      'No production database changes without migration/recovery consideration.',
      'No major feature considered done before QA.',
      'No developer self-approving all high-risk work.',
      'No direct uncontrolled production modification where a controlled deployment path exists.',
      'No closing a project without technical handover.',
      'No compromising customer safety or security to meet an artificial deadline.'
    )
  ),
  'PF-SOP-09 executable Development quality controls. Admin-managed operational policy; no client secrets are stored here.'
)
on conflict(config_key) do update
set config_value=excluded.config_value,description=excluded.description,updated_at=now();

-- -----------------------------------------------------------------------------
-- 2. Structured engineering ticket metadata attached to canonical project_tasks
-- -----------------------------------------------------------------------------
create table if not exists public.development_task_specs(
  project_task_id uuid primary key references public.project_tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  environment text not null default '',
  requirement_reference text not null default '',
  design_reference text not null default '',
  acceptance_criteria text not null default '',
  dependencies text not null default '',
  security_considerations text not null default '',
  accessibility_considerations text not null default '',
  seo_implications text not null default '',
  analytics_requirements text not null default '',
  testing_requirements text not null default '',
  definition_of_done text not null default '',
  reuse_decision text,
  reuse_inspection_notes text not null default '',
  duplication_reason text not null default '',
  technical_risks text not null default '',
  updated_by uuid not null references public.user_profiles(id),
  updated_at timestamptz not null default now(),
  constraint development_task_specs_environment_check check(environment in('Development','Preview/Test','Staging','Production','Multiple') or environment=''),
  constraint development_task_specs_reuse_check check(reuse_decision is null or reuse_decision in('REUSE','EXTEND','REFACTOR','BUILD NEW'))
);
create index if not exists development_task_specs_project_idx on public.development_task_specs(project_id,updated_at desc);
alter table public.development_task_specs enable row level security;
drop policy if exists development_task_specs_select on public.development_task_specs;
create policy development_task_specs_select on public.development_task_specs for select to authenticated
using(public.development_delivery_can_access_task(project_task_id));
revoke insert,update,delete on public.development_task_specs from authenticated;
grant select on public.development_task_specs to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Architecture Decision Records for material Scale/Custom decisions
-- -----------------------------------------------------------------------------
create table if not exists public.development_architecture_decisions(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_task_id uuid not null references public.project_tasks(id) on delete cascade,
  decision_id text not null,
  problem text not null,
  context text not null,
  options_considered text not null,
  selected_option text not null,
  reason text not null,
  tradeoffs text not null,
  security_implications text not null default 'Not applicable',
  cost_implications text not null default 'Not applicable',
  reversal_migration_implications text not null default 'Not applicable',
  active boolean not null default true,
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,decision_id)
);
create index if not exists development_architecture_decisions_task_idx on public.development_architecture_decisions(project_task_id,active,created_at desc);
alter table public.development_architecture_decisions enable row level security;
drop policy if exists development_architecture_decisions_select on public.development_architecture_decisions;
create policy development_architecture_decisions_select on public.development_architecture_decisions for select to authenticated
using(public.development_delivery_can_access_task(project_task_id));
revoke insert,update,delete on public.development_architecture_decisions from authenticated;
grant select on public.development_architecture_decisions to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Weighted PF-SOP-09 Engineering Quality Score for major releases
-- -----------------------------------------------------------------------------
create table if not exists public.development_release_quality_assessments(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_task_id uuid not null references public.project_tasks(id) on delete cascade,
  assessment_version integer not null default 1 check(assessment_version>0),
  delivery_tier text not null,
  category_scores jsonb not null default '{}'::jsonb,
  total_score numeric(5,2) not null default 0,
  critical_defects integer not null default 0 check(critical_defects>=0),
  high_defects integer not null default 0 check(high_defects>=0),
  status text not null,
  notes text not null default '',
  assessed_by uuid not null references public.user_profiles(id),
  assessed_at timestamptz not null default now(),
  constraint development_release_quality_tier_check check(delivery_tier in('launch','growth','scale','custom')),
  constraint development_release_quality_status_check check(status in('PASS','REMEDIATION REQUIRED','NOT RELEASE READY')),
  constraint development_release_quality_score_check check(total_score>=0 and total_score<=100)
);
create unique index if not exists development_release_quality_version_idx on public.development_release_quality_assessments(project_task_id,assessment_version);
create index if not exists development_release_quality_project_idx on public.development_release_quality_assessments(project_id,assessed_at desc);
alter table public.development_release_quality_assessments enable row level security;
drop policy if exists development_release_quality_assessments_select on public.development_release_quality_assessments;
create policy development_release_quality_assessments_select on public.development_release_quality_assessments for select to authenticated
using(public.development_delivery_can_access_task(project_task_id));
revoke insert,update,delete on public.development_release_quality_assessments from authenticated;
grant select on public.development_release_quality_assessments to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Extend Development evidence vocabulary to the full SOP lifecycle
-- -----------------------------------------------------------------------------
alter table public.development_delivery_evidence drop constraint if exists development_delivery_evidence_type_check;
alter table public.development_delivery_evidence add constraint development_delivery_evidence_type_check check(evidence_type in(
  'architecture_notes','repository','branch','pull_request','commit','build_result','test_result','staging_url','implementation_notes',
  'accessibility_check','performance_check','security_check','qa_handoff','release_notes','documentation','deployment_reference',
  'production_url','handover_reference','reuse_inspection','acceptance_criteria','technical_discovery','architecture_decision',
  'environment_check','dependency_review','browser_responsive_check','seo_check','analytics_check','backup_recovery','rollback_plan',
  'smoke_test','monitoring_check','incident_reference','root_cause_analysis'
));

-- -----------------------------------------------------------------------------
-- 6. Package/tier resolution and support depth
-- -----------------------------------------------------------------------------
create or replace function public.development_sop_delivery_tier(p_project_id uuid)
returns text
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_project public.projects%rowtype; v_package text;
begin
  select * into v_project from public.projects where id=p_project_id;
  if not found then raise exception 'Project not found.'; end if;
  v_package:=lower(coalesce(v_project.package_snapshot,''));
  if v_package like '%custom%' then return 'custom'; end if;
  if v_package like '%scale%' then return 'scale'; end if;
  if v_package like '%growth%' then return 'growth'; end if;
  if v_package like '%launch%' then return 'launch'; end if;
  if coalesce(v_project.project_value,0)>=5799 then return 'scale'; end if;
  if coalesce(v_project.project_value,0)>=2379 then return 'growth'; end if;
  return 'launch';
end;
$$;
grant execute on function public.development_sop_delivery_tier(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Engineering ticket readiness
-- -----------------------------------------------------------------------------
create or replace function public.development_sop_ticket_readiness(p_task_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_task public.project_tasks%rowtype; v_spec public.development_task_specs%rowtype; v_blockers jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.development_delivery_can_access_task(p_task_id) then raise exception 'You do not have access to this Development task.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id;
  if not found then raise exception 'Task not found.'; end if;
  if v_task.department<>'Development' then return jsonb_build_object('ready',true,'status','NOT APPLICABLE','blockers','[]'::jsonb); end if;
  select * into v_spec from public.development_task_specs where project_task_id=p_task_id;
  if not found then
    return jsonb_build_object('ready',false,'status','BLOCKED — TECHNICAL CLARIFICATION REQUIRED','blockers',jsonb_build_array('Complete the PF-SOP-09 Engineering Ticket before coding starts.'));
  end if;
  if length(trim(v_spec.environment))=0 then v_blockers:=v_blockers||jsonb_build_array('Environment is not defined.'); end if;
  if length(trim(v_spec.requirement_reference))<3 then v_blockers:=v_blockers||jsonb_build_array('Requirement/reference is incomplete.'); end if;
  if length(trim(v_spec.design_reference))<3 then v_blockers:=v_blockers||jsonb_build_array('Approved design reference is incomplete.'); end if;
  if length(trim(v_spec.acceptance_criteria))<10 then v_blockers:=v_blockers||jsonb_build_array('Acceptance criteria must explain how success is verified.'); end if;
  if length(trim(v_spec.dependencies))<2 then v_blockers:=v_blockers||jsonb_build_array('Dependencies must be identified or explicitly marked None.'); end if;
  if length(trim(v_spec.security_considerations))<2 then v_blockers:=v_blockers||jsonb_build_array('Security considerations must be assessed or marked Not applicable.'); end if;
  if length(trim(v_spec.accessibility_considerations))<2 then v_blockers:=v_blockers||jsonb_build_array('Accessibility considerations must be assessed or marked Not applicable.'); end if;
  if length(trim(v_spec.seo_implications))<2 then v_blockers:=v_blockers||jsonb_build_array('SEO implications must be assessed or marked Not applicable.'); end if;
  if length(trim(v_spec.analytics_requirements))<2 then v_blockers:=v_blockers||jsonb_build_array('Analytics requirements must be assessed or marked Not applicable.'); end if;
  if length(trim(v_spec.testing_requirements))<5 then v_blockers:=v_blockers||jsonb_build_array('Testing requirements are incomplete.'); end if;
  if length(trim(v_spec.definition_of_done))<10 then v_blockers:=v_blockers||jsonb_build_array('Technical Definition of Done is incomplete.'); end if;
  if v_spec.reuse_decision is null then v_blockers:=v_blockers||jsonb_build_array('Inspect the existing system and choose REUSE, EXTEND, REFACTOR or BUILD NEW.'); end if;
  if length(trim(v_spec.reuse_inspection_notes))<10 then v_blockers:=v_blockers||jsonb_build_array('Record what existing components/services/data/functions/tests were inspected.'); end if;
  if v_spec.reuse_decision='BUILD NEW' and length(trim(v_spec.duplication_reason))<10 then v_blockers:=v_blockers||jsonb_build_array('BUILD NEW requires a clear reason why reuse/extension is not appropriate.'); end if;
  return jsonb_build_object(
    'ready',jsonb_array_length(v_blockers)=0,
    'status',case when jsonb_array_length(v_blockers)=0 then 'ENGINEERING READY' else 'BLOCKED — TECHNICAL CLARIFICATION REQUIRED' end,
    'blockers',v_blockers
  );
end;
$$;
grant execute on function public.development_sop_ticket_readiness(uuid) to authenticated;

create or replace function public.development_sop_upsert_task_spec(
  p_task_id uuid,p_environment text,p_requirement_reference text,p_design_reference text,p_acceptance_criteria text,p_dependencies text,
  p_security_considerations text,p_accessibility_considerations text,p_seo_implications text,p_analytics_requirements text,
  p_testing_requirements text,p_definition_of_done text,p_reuse_decision text,p_reuse_inspection_notes text,p_duplication_reason text default '',p_technical_risks text default ''
)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_task public.project_tasks%rowtype; v_project public.projects%rowtype; v_role text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id for update;
  if not found or v_task.department<>'Development' then raise exception 'Development task not found.'; end if;
  select * into v_project from public.projects where id=v_task.project_id;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if not(public.is_admin() or v_project.project_manager_id=v_uid or(v_task.assigned_to=v_uid and v_role in('developer','web_developer','developer_designer'))) then
    raise exception 'Only the assigned Developer, Project Manager or Admin may update the Engineering Ticket.';
  end if;
  if p_environment not in('Development','Preview/Test','Staging','Production','Multiple') then raise exception 'Choose a supported environment.'; end if;
  if p_reuse_decision not in('REUSE','EXTEND','REFACTOR','BUILD NEW') then raise exception 'Choose REUSE, EXTEND, REFACTOR or BUILD NEW.'; end if;
  if p_reuse_decision='BUILD NEW' and length(trim(coalesce(p_duplication_reason,'')))<10 then raise exception 'BUILD NEW requires a clear reuse/duplication rationale.'; end if;
  if lower(concat_ws(' ',p_requirement_reference,p_design_reference,p_acceptance_criteria,p_dependencies,p_security_considerations,p_accessibility_considerations,p_seo_implications,p_analytics_requirements,p_testing_requirements,p_definition_of_done,p_reuse_inspection_notes,p_duplication_reason,p_technical_risks)) ~ '(password\s*[:=]|api[_ -]?key\s*[:=]|access[_ -]?token\s*[:=]|private[_ -]?key\s*[:=])' then
    raise exception 'Engineering Ticket must not contain passwords, API keys, access tokens or private keys.';
  end if;
  insert into public.development_task_specs(
    project_task_id,project_id,environment,requirement_reference,design_reference,acceptance_criteria,dependencies,security_considerations,
    accessibility_considerations,seo_implications,analytics_requirements,testing_requirements,definition_of_done,reuse_decision,
    reuse_inspection_notes,duplication_reason,technical_risks,updated_by,updated_at
  ) values(
    p_task_id,v_task.project_id,trim(p_environment),trim(p_requirement_reference),trim(p_design_reference),trim(p_acceptance_criteria),trim(p_dependencies),
    trim(p_security_considerations),trim(p_accessibility_considerations),trim(p_seo_implications),trim(p_analytics_requirements),trim(p_testing_requirements),
    trim(p_definition_of_done),p_reuse_decision,trim(p_reuse_inspection_notes),trim(coalesce(p_duplication_reason,'')),trim(coalesce(p_technical_risks,'')),v_uid,now()
  )
  on conflict(project_task_id) do update set
    environment=excluded.environment,requirement_reference=excluded.requirement_reference,design_reference=excluded.design_reference,
    acceptance_criteria=excluded.acceptance_criteria,dependencies=excluded.dependencies,security_considerations=excluded.security_considerations,
    accessibility_considerations=excluded.accessibility_considerations,seo_implications=excluded.seo_implications,analytics_requirements=excluded.analytics_requirements,
    testing_requirements=excluded.testing_requirements,definition_of_done=excluded.definition_of_done,reuse_decision=excluded.reuse_decision,
    reuse_inspection_notes=excluded.reuse_inspection_notes,duplication_reason=excluded.duplication_reason,technical_risks=excluded.technical_risks,
    updated_by=excluded.updated_by,updated_at=now();

  -- Keep the existing evidence system as the audit/source-reference layer.
  if not exists(select 1 from public.development_delivery_evidence where project_task_id=p_task_id and evidence_type='reuse_inspection' and active) then
    insert into public.development_delivery_evidence(project_task_id,project_id,evidence_type,label,reference_note,status,created_by)
    values(p_task_id,v_task.project_id,'reuse_inspection',p_reuse_decision,trim(p_reuse_inspection_notes),'Provided',v_uid);
  end if;
  return public.development_sop_ticket_readiness(p_task_id);
end;
$$;
grant execute on function public.development_sop_upsert_task_spec(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. ADR recording
-- -----------------------------------------------------------------------------
create or replace function public.development_sop_create_adr(
  p_task_id uuid,p_decision_id text,p_problem text,p_context text,p_options_considered text,p_selected_option text,p_reason text,p_tradeoffs text,
  p_security_implications text default 'Not applicable',p_cost_implications text default 'Not applicable',p_reversal_migration_implications text default 'Not applicable'
)
returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_task public.project_tasks%rowtype; v_project public.projects%rowtype; v_role text; v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id for update;
  if not found or v_task.department<>'Development' then raise exception 'Development task not found.'; end if;
  select * into v_project from public.projects where id=v_task.project_id;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if not(public.is_admin() or v_project.project_manager_id=v_uid or(v_task.assigned_to=v_uid and v_role in('developer','web_developer','developer_designer'))) then raise exception 'Not authorized to record an ADR.'; end if;
  if length(trim(p_decision_id))<3 or length(trim(p_problem))<10 or length(trim(p_context))<10 or length(trim(p_options_considered))<10 or length(trim(p_selected_option))<3 or length(trim(p_reason))<10 or length(trim(p_tradeoffs))<5 then
    raise exception 'Complete the ADR problem, context, options, selected option, reason and trade-offs.';
  end if;
  insert into public.development_architecture_decisions(project_id,project_task_id,decision_id,problem,context,options_considered,selected_option,reason,tradeoffs,security_implications,cost_implications,reversal_migration_implications,created_by)
  values(v_task.project_id,p_task_id,trim(p_decision_id),trim(p_problem),trim(p_context),trim(p_options_considered),trim(p_selected_option),trim(p_reason),trim(p_tradeoffs),trim(p_security_implications),trim(p_cost_implications),trim(p_reversal_migration_implications),v_uid)
  returning id into v_id;
  insert into public.development_delivery_evidence(project_task_id,project_id,evidence_type,label,reference_note,status,created_by)
  values(p_task_id,v_task.project_id,'architecture_decision',trim(p_decision_id),trim(p_selected_option)||' — '||trim(p_reason),'Provided',v_uid);
  return v_id;
end;
$$;
grant execute on function public.development_sop_create_adr(uuid,text,text,text,text,text,text,text,text,text,text) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Release readiness task + weighted engineering score
-- -----------------------------------------------------------------------------
create or replace function public.development_sop_ensure_release_readiness_task(p_project_id uuid)
returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_project public.projects%rowtype; v_task_id uuid; v_dev uuid; v_creator uuid;
begin
  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found.'; end if;
  select id into v_task_id from public.project_tasks where project_id=p_project_id and workflow_key='development_release_readiness' limit 1;
  if v_task_id is not null then return v_task_id; end if;
  select pt.user_id into v_dev from public.project_team pt join public.user_profiles up on up.id=pt.user_id
  where pt.project_id=p_project_id and pt.active and up.status='active' and up.role in('developer','web_developer','developer_designer')
  order by pt.assigned_at asc limit 1;
  if v_dev is null then
    select assigned_to into v_dev from public.project_tasks where project_id=p_project_id and department='Development' and assigned_to is not null order by created_at asc limit 1;
  end if;
  v_creator:=coalesce(v_project.project_manager_id,auth.uid());
  if v_creator is null then select id into v_creator from public.user_profiles where role='admin' and status='active' order by created_at asc limit 1; end if;
  if v_creator is null then raise exception 'No authorized task creator is available.'; end if;
  insert into public.project_tasks(project_id,title,description,department,assigned_to,created_by,priority,status,due_date,workflow_key,workflow_stage,required_for_stage)
  values(
    p_project_id,'Engineering Release Readiness',
    'PF-SOP-09 release gate: verify regression, QA evidence, accessibility, security, performance, technical SEO/analytics, backup/recovery and rollback readiness. Growth/Scale/Custom also require a 90+ weighted Engineering Quality Score. Critical/high defects block release.',
    'Development',v_dev,v_creator,'High','To Do',v_project.target_date,'development_release_readiness','Final Revisions',true
  )
  on conflict(project_id,workflow_key) where workflow_key is not null do update set required_for_stage=true
  returning id into v_task_id;
  return v_task_id;
end;
$$;

create or replace function public.development_sop_on_project_stage_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if new.stage is distinct from old.stage and new.stage='Final Revisions' then perform public.development_sop_ensure_release_readiness_task(new.id); end if;
  return new;
end;
$$;
drop trigger if exists trg_development_sop_project_stage on public.projects;
create trigger trg_development_sop_project_stage after update of stage on public.projects for each row execute function public.development_sop_on_project_stage_change();

create or replace function public.development_sop_submit_release_quality_score(p_task_id uuid,p_scores jsonb,p_critical_defects integer default 0,p_high_defects integer default 0,p_notes text default '')
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid(); v_task public.project_tasks%rowtype; v_role text; v_tier text; v_weights jsonb; v_key text; v_weight numeric; v_score numeric; v_total numeric:=0; v_version int; v_status text; v_id uuid;
  v_required text[]:=array['functionalCorrectness','maintainability','security','accessibility','performance','responsiveBrowser','reliabilityErrorHandling','testing','seoAnalytics','documentationDeployability'];
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id for update;
  if not found or v_task.workflow_key<>'development_release_readiness' then raise exception 'Engineering Release Readiness task not found.'; end if;
  select role into v_role from public.user_profiles where id=v_uid and status='active';
  if v_task.assigned_to is distinct from v_uid or v_role not in('developer','web_developer','developer_designer') then raise exception 'Only the assigned Web Developer can submit the Engineering Quality Score.'; end if;
  if p_critical_defects<0 or p_high_defects<0 then raise exception 'Defect counts cannot be negative.'; end if;
  v_tier:=public.development_sop_delivery_tier(v_task.project_id);
  v_weights:=public.development_delivery_config()->'qualityScoreWeights';
  foreach v_key in array v_required loop
    if not(p_scores ? v_key) then raise exception 'Missing quality score category: %.',v_key; end if;
    begin v_score:=(p_scores->>v_key)::numeric; exception when others then raise exception 'Quality score % must be numeric.',v_key; end;
    if v_score<0 or v_score>100 then raise exception 'Quality score % must be between 0 and 100.',v_key; end if;
    v_weight:=coalesce((v_weights->>v_key)::numeric,0);
    v_total:=v_total+(v_score*v_weight/100.0);
  end loop;
  v_total:=round(v_total,2);
  if p_critical_defects>0 or p_high_defects>0 then v_status:='NOT RELEASE READY';
  elsif v_tier in('growth','scale','custom') and v_total<80 then v_status:='NOT RELEASE READY';
  elsif v_tier in('growth','scale','custom') and v_total<90 then v_status:='REMEDIATION REQUIRED';
  else v_status:='PASS'; end if;
  select coalesce(max(assessment_version),0)+1 into v_version from public.development_release_quality_assessments where project_task_id=p_task_id;
  insert into public.development_release_quality_assessments(project_id,project_task_id,assessment_version,delivery_tier,category_scores,total_score,critical_defects,high_defects,status,notes,assessed_by)
  values(v_task.project_id,p_task_id,v_version,v_tier,p_scores,v_total,p_critical_defects,p_high_defects,v_status,trim(coalesce(p_notes,'')),v_uid)
  returning id into v_id;
  return jsonb_build_object('id',v_id,'version',v_version,'deliveryTier',v_tier,'totalScore',v_total,'status',v_status,'criticalDefects',p_critical_defects,'highDefects',p_high_defects);
end;
$$;
grant execute on function public.development_sop_submit_release_quality_score(uuid,jsonb,integer,integer,text) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Hard gates: Engineering Ticket before start/review; ADR/score where required
-- -----------------------------------------------------------------------------
create or replace function public.enforce_pf_sop09_development_status_gate()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_ticket jsonb; v_tier text; v_assessment public.development_release_quality_assessments%rowtype;
begin
  if new.department<>'Development' or new.status is not distinct from old.status then return new; end if;
  if new.status='In Progress' and old.status in('To Do','Changes Required') then
    v_ticket:=public.development_sop_ticket_readiness(new.id);
    if not coalesce((v_ticket->>'ready')::boolean,false) then raise exception '%',coalesce(v_ticket->>'status','BLOCKED — TECHNICAL CLARIFICATION REQUIRED'); end if;
  end if;
  if new.status='Review' then
    v_ticket:=public.development_sop_ticket_readiness(new.id);
    if not coalesce((v_ticket->>'ready')::boolean,false) then raise exception 'PF-SOP-09 Engineering Ticket is incomplete.'; end if;
    if new.workflow_key='technical_architecture' then
      v_tier:=public.development_sop_delivery_tier(new.project_id);
      if v_tier in('scale','custom') and not exists(select 1 from public.development_architecture_decisions where project_task_id=new.id and active) then
        raise exception 'Scale/Custom technical architecture requires at least one recorded ADR before review.';
      end if;
    end if;
    if new.workflow_key='development_release_readiness' then
      select * into v_assessment from public.development_release_quality_assessments where project_task_id=new.id order by assessment_version desc limit 1;
      v_tier:=public.development_sop_delivery_tier(new.project_id);
      if not found then raise exception 'Submit the PF-SOP-09 Engineering Quality Score before Release Readiness review.'; end if;
      if v_assessment.critical_defects>0 or v_assessment.high_defects>0 then raise exception 'Critical/high defects block release.'; end if;
      if v_tier in('growth','scale','custom') and v_assessment.status<>'PASS' then raise exception 'Growth/Scale/Custom release requires a PASS Engineering Quality Score (90+).'; end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_pf_sop09_development_status_gate on public.project_tasks;
create trigger trg_pf_sop09_development_status_gate before update of status on public.project_tasks for each row execute function public.enforce_pf_sop09_development_status_gate();

-- -----------------------------------------------------------------------------
-- 11. Expanded self-QA / controlled revision playbooks from PF-SOP-09
-- -----------------------------------------------------------------------------
update public.productivity_playbooks
set checklist='[
 {"key":"ticket","label":"Engineering Ticket is complete: requirement, design, acceptance criteria, dependencies, risks, testing and Definition of Done."},
 {"key":"reuse","label":"Existing components, utilities, services, APIs, hooks, data models, database functions, auth, permissions, tokens, integrations, dependencies and tests were inspected before building."},
 {"key":"reuseDecision","label":"REUSE / EXTEND / REFACTOR / BUILD NEW decision and rationale are recorded."},
 {"key":"environment","label":"Development/preview/staging/production responsibilities and configuration are understood; no production secrets are in source code."},
 {"key":"architecture","label":"Architecture is the simplest approach that reliably meets business, security, performance, maintainability and ownership needs."},
 {"key":"dependencies","label":"Third-party dependencies/integrations are necessary, maintained, risk-reviewed and have known failure behavior."}
]'::jsonb,
name='Development · PF-SOP-09 Engineering Ready',description='Gate 1/2: Understand, inspect, plan and establish a complete engineering ticket before coding.',updated_at=now()
where playbook_key='development-todo';

update public.productivity_playbooks
set checklist='[
 {"key":"requirements","label":"Requirements and acceptance criteria are implemented; approved design intent is preserved without silent scope changes."},
 {"key":"reuse","label":"Existing functionality is reused/extended where appropriate; there is no unjustified duplicate architecture."},
 {"key":"codeQuality","label":"Code is understandable, maintainable, typed/linted where supported, free of dead code/unexplained magic values and uses focused responsibilities."},
 {"key":"responsive","label":"Narrow mobile, mobile, tablet, laptop, desktop and intermediate widths plus long-content states are checked as applicable."},
 {"key":"states","label":"Loading, empty, error, success, focus, disabled and relevant interaction states are verified."},
 {"key":"functional","label":"Happy path, errors, edge cases, forms, links, browser behavior, console/runtime errors and network/API failure behavior are checked."},
 {"key":"accessibility","label":"Semantic structure, keyboard, focus, names/labels, errors, contrast intent, target size, reflow/zoom, dialogs and motion are checked as applicable."},
 {"key":"security","label":"Authentication/authorization, trusted-layer validation, secrets, dependencies, input/file validation, data handling and error exposure are checked."},
 {"key":"performance","label":"Images, fonts, JavaScript, CSS, caching/network, third-party scripts, layout shifts and relevant Core Web Vitals risks are reviewed."},
 {"key":"seoAnalytics","label":"Applicable crawlability/status/metadata/canonical/robots/sitemap/structured-data/redirect/analytics requirements are verified."},
 {"key":"tests","label":"Applicable static, unit, component, integration, E2E, exploratory, accessibility, security, performance and regression checks are completed."},
 {"key":"documentation","label":"Documentation, migrations/configuration, deployment considerations and required evidence are current."},
 {"key":"acceptance","label":"Acceptance criteria and PF-SOP-09 Technical Definition of Done are satisfied before requesting independent review."}
]'::jsonb,
name='Development · PF-SOP-09 Build & Self-QA',description='Gate 3: implementation and Developer Self-Test. Status becomes READY FOR REVIEW, never self-declared DONE.',updated_at=now()
where playbook_key='development-in-progress';

update public.productivity_playbooks
set checklist='[
 {"key":"feedback","label":"Read the complete structured finding and identify the root cause, not only the visible symptom."},
 {"key":"scope","label":"Classify correction vs material scope change; escalate scope/cost/timeline changes through Project Management."},
 {"key":"fix","label":"Implement the minimal maintainable correction without duplicate or one-off architecture."},
 {"key":"regression","label":"Retest affected behavior and critical connected workflows; run applicable automated suites."},
 {"key":"quality","label":"Recheck functional, responsive/browser, accessibility, security, performance, SEO/analytics and integration impacts."},
 {"key":"evidence","label":"Update PR/commit/test/staging/release evidence and reviewer context for the corrected candidate."}
]'::jsonb,
name='Development · PF-SOP-09 Controlled Revision',description='Defect resolution and regression control; significant fixes must consider connected behavior and root cause.',updated_at=now()
where playbook_key='development-changes';

-- -----------------------------------------------------------------------------
-- 12. One SOP workspace RPC for the existing Development task UI
-- -----------------------------------------------------------------------------
create or replace function public.development_sop_workspace(p_task_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_task public.project_tasks%rowtype; v_ticket jsonb; v_adrs jsonb; v_assessment jsonb; v_tier text; v_config jsonb; v_support int;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.development_delivery_can_access_task(p_task_id) then raise exception 'You do not have access to this Development task.'; end if;
  select * into v_task from public.project_tasks where id=p_task_id;
  if not found then raise exception 'Task not found.'; end if;
  v_tier:=public.development_sop_delivery_tier(v_task.project_id);
  v_config:=public.development_delivery_config();
  v_support:=coalesce((v_config->'supportDays'->>v_tier)::int,14);
  select to_jsonb(s) into v_ticket from public.development_task_specs s where s.project_task_id=p_task_id;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb) into v_adrs from public.development_architecture_decisions a where a.project_task_id=p_task_id and a.active;
  select to_jsonb(q) into v_assessment from public.development_release_quality_assessments q where q.project_task_id=p_task_id order by q.assessment_version desc limit 1;
  return jsonb_build_object(
    'sop',jsonb_build_object('key',v_config->>'sopKey','version',v_config->>'version','qualityGates',v_config->'qualityGates','engineeringModel',v_config->'engineeringModel','nonNegotiables',v_config->'nonNegotiables','qualityScoreWeights',v_config->'qualityScoreWeights'),
    'deliveryTier',v_tier,'supportDays',v_support,'ticketReadiness',public.development_sop_ticket_readiness(p_task_id),
    'ticket',coalesce(v_ticket,'{}'::jsonb),'architectureDecisions',v_adrs,'releaseQualityAssessment',coalesce(v_assessment,'{}'::jsonb)
  );
end;
$$;
grant execute on function public.development_sop_workspace(uuid) to authenticated;

-- Existing server evidence function must accept the expanded controlled vocabulary.
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
  if p_evidence_type not in(
    'architecture_notes','repository','branch','pull_request','commit','build_result','test_result','staging_url','implementation_notes','accessibility_check','performance_check','security_check','qa_handoff','release_notes','documentation','deployment_reference','production_url','handover_reference','reuse_inspection','acceptance_criteria','technical_discovery','architecture_decision','environment_check','dependency_review','browser_responsive_check','seo_check','analytics_check','backup_recovery','rollback_plan','smoke_test','monitoring_check','incident_reference','root_cause_analysis'
  ) then raise exception 'Unsupported Development evidence type.'; end if;
  if p_status not in('Draft','Provided','Verified') then raise exception 'Unsupported evidence status.'; end if;
  if length(trim(coalesce(p_reference_url,'')))=0 and length(trim(coalesce(p_reference_note,'')))=0 then raise exception 'Add a source URL or verification note.'; end if;
  if lower(concat_ws(' ',p_label,p_reference_url,p_reference_note)) ~ '(password\s*[:=]|api[_ -]?key\s*[:=]|access[_ -]?token\s*[:=]|private[_ -]?key\s*[:=])' then raise exception 'Development evidence must not contain credentials or secrets.'; end if;
  insert into public.development_delivery_evidence(project_task_id,project_id,evidence_type,label,reference_url,reference_note,status,created_by)
  values(p_task_id,v_task.project_id,p_evidence_type,trim(coalesce(p_label,'')),trim(coalesce(p_reference_url,'')),trim(coalesce(p_reference_note,'')),p_status,v_uid)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.development_delivery_add_evidence(uuid,text,text,text,text,text) to authenticated;

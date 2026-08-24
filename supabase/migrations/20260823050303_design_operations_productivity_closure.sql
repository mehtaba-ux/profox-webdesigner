-- Design Operations productivity closure.
-- Reuses canonical project_tasks, design_delivery_reviews, notification infrastructure and BI surface.

create table if not exists public.workforce_capability_profiles (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  job_title text not null default '',
  level text not null default '',
  specialties text[] not null default '{}',
  reviewer_qualifications text[] not null default '{}',
  availability_status text not null default 'Available' check (availability_status in ('Available','Limited','Unavailable')),
  weekly_capacity_hours integer not null default 40 check (weekly_capacity_hours between 1 and 80),
  max_parallel_work integer not null default 2 check (max_parallel_work between 1 and 20),
  reviewer_eligible boolean not null default false,
  certification_state text not null default 'Active',
  mentor_user_id uuid references public.user_profiles(id) on delete set null,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workforce_capability_profiles enable row level security;
drop policy if exists workforce_capability_profiles_read on public.workforce_capability_profiles;
create policy workforce_capability_profiles_read on public.workforce_capability_profiles for select to authenticated
using (public.is_admin() or exists(select 1 from public.user_profiles u where u.id=auth.uid() and u.status='active' and u.role='project_manager'));
drop policy if exists workforce_capability_profiles_admin_write on public.workforce_capability_profiles;
create policy workforce_capability_profiles_admin_write on public.workforce_capability_profiles for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create index if not exists workforce_capability_profiles_staffing_idx on public.workforce_capability_profiles(availability_status, reviewer_eligible);

insert into public.workforce_capability_profiles(user_id,job_title,level,availability_status,max_parallel_work,certification_state)
select u.id,
       case u.role when 'uiux_designer' then 'UI/UX Designer' when 'content_writer' then 'Content Writer' when 'developer' then 'Developer' when 'qa' then 'QA Specialist' else coalesce(nullif(u.department,''),u.role) end,
       '', 'Available',
       case when u.role='uiux_designer' then greatest(1,coalesce((select (config_value->>'wipLimit')::integer from public.system_configuration where config_key='design_delivery_sop_v1'),2)) else 4 end,
       case when u.role='uiux_designer' and u.onboarding_status='completed' then 'Certified' else 'Active' end
from public.user_profiles u
where u.status='active' and u.role not in ('customer','pending')
on conflict(user_id) do nothing;

create table if not exists public.delivery_task_templates (
  id uuid primary key default gen_random_uuid(),
  stage_key text not null,
  workflow_key text not null unique,
  title text not null,
  description text not null default '',
  department text not null,
  priority text not null default 'Normal',
  assignee_kind text not null default 'specialist' check (assignee_kind in ('pm','seller','specialist','unassigned')),
  due_offset_days integer,
  sort_order integer not null default 10,
  required_for_stage boolean not null default true,
  active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.delivery_task_templates enable row level security;
drop policy if exists delivery_task_templates_staff_read on public.delivery_task_templates;
create policy delivery_task_templates_staff_read on public.delivery_task_templates for select to authenticated
using (exists(select 1 from public.user_profiles u where u.id=auth.uid() and u.status='active' and u.role not in ('customer','pending')));
drop policy if exists delivery_task_templates_admin_write on public.delivery_task_templates;
create policy delivery_task_templates_admin_write on public.delivery_task_templates for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create index if not exists delivery_task_templates_stage_idx on public.delivery_task_templates(stage_key,active,sort_order);

insert into public.delivery_task_templates(stage_key,workflow_key,title,description,department,priority,assignee_kind,due_offset_days,sort_order,required_for_stage)
values
('Sales Handover','sales_handover_submission','Sales Handover Submission','Sales must record the customer context, agreed expectations, requirements, scope, exclusions, promises, key contacts and any delivery risks before Project Management accepts the handover.','Sales','High','seller',1,5,true),
('Sales Handover','sales_handover_review','Sales Handover Review','Project Management reviews the accepted quotation, verified payment, requirements, scope, exclusions, promises and commercial context with Sales before progressing.','Project Management','High','pm',1,10,true),
('Client Onboarding','client_onboarding_call','Client Onboarding Call','Welcome the client, confirm primary contacts, communication path, project goals, decision makers, target dates and expectations.','Project Management','High','pm',2,10,true),
('Client Onboarding','client_assets_access','Client Assets & Access Checklist','Confirm required content, brand assets, domain/hosting/CMS access, analytics access and client portal or documented communication access.','Project Management','High','pm',3,20,true),
('Requirements','business_discovery_requirements','Business Discovery & Requirements Lock','Confirm business goals, target audience, functional requirements, conversion goals, integrations, constraints and approved success criteria.','Project Management','High','pm',3,10,true),
('Requirements','solution_architecture_plan','Solution Architecture & Delivery Plan','Document the approved solution approach, information architecture, technical assumptions, milestones and team handoffs before production work begins.','Project Management','High','pm',4,20,true),
('Content','content_curation','Content Curation & SEO Inputs','Prepare or collect approved page content, conversion copy, imagery, metadata and other content inputs required by the signed scope.','Content','High','specialist',5,10,true),
('Content','content_readiness_review','Content Readiness Review','Verify required content is complete enough for design and clearly flag any client dependencies before handoff.','Content','High','specialist',6,20,true),
('UI/UX Design','ux_research_flows','User Research, UX Flows & Information Architecture','Translate approved requirements into user journeys, information architecture and conversion-focused UX flows.','UI/UX Design','High','specialist',5,10,true),
('UI/UX Design','wireframe_approval','Wireframes & Wireframe Approval Evidence','Create responsive wireframes and record evidence that the agreed wireframe milestone has been approved before final visual design.','UI/UX Design','High','specialist',7,20,true),
('UI/UX Design','ui_design_prototype','UI Design, Prototype & Internal Design QA','Produce the responsive UI, interaction prototype and internal quality review ready for formal client design approval.','UI/UX Design','High','specialist',10,30,true),
('Client Design Approval','client_design_approval','Formal Client Design Approval','Client approval is recorded through the protected client approval workflow before Development can begin.','Project Management','High','pm',3,10,true),
('Development','technical_architecture','Technical Architecture & Build Setup','Confirm implementation architecture, environments, integrations, data/security considerations and delivery plan.','Development','High','specialist',3,10,true),
('Development','development_implementation','Development & Integration Implementation','Build the approved responsive experience and required integrations against the accepted scope and design.','Development','High','specialist',10,20,true),
('QA','functional_responsive_testing','Functional, Responsive & Accessibility Testing','Complete functional, responsive, browser/device and accessibility-oriented QA for the agreed scope.','Quality Assurance','High','specialist',4,10,true),
('QA','security_performance_review','Security, Performance & Pre-UAT Review','Complete applicable security checks, performance checks and release readiness verification before client staging review.','Quality Assurance','High','specialist',5,20,true),
('Client Review','client_staging_uat','Client Staging / UAT Approval','Client staging review and acceptance are recorded through the protected client approval workflow before final revisions and launch preparation.','Project Management','High','pm',3,10,true),
('Final Revisions','final_revision_set','Approved Final Revision Set','Apply the approved final revision set and verify no unapproved scope is introduced.','Development','High','specialist',4,10,true),
('Launch','production_launch','Production Launch','Deploy the approved release to production only after the protected final-payment launch gate passes.','Development','High','specialist',2,10,true),
('Launch','launch_tracking_verification','Launch Monitoring & Tracking Verification','Verify production health, analytics, Search Console where applicable and conversion tracking after launch.','Quality Assurance','High','specialist',3,20,true),
('Handover','documentation_client_training','Documentation & Client Training','Deliver applicable documentation, credentials/access handoff and client training for the completed solution.','Project Management','High','pm',3,10,true),
('Handover','priority_launch_assurance','60-Day Priority Launch Assurance Kickoff','Confirm the 60-day priority launch assurance path for technical defects, performance review, analytics, Search Console and conversion-tracking verification.','Project Management','High','pm',3,20,true)
on conflict(workflow_key) do nothing;

create or replace function public.pick_delivery_specialist(p_department text, p_project_id uuid default null)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
with eligible as (
  select u.id,
         coalesce(cp.availability_status,'Available') availability_status,
         coalesce(cp.max_parallel_work,case when u.role='uiux_designer' then greatest(1,coalesce((select (config_value->>'wipLimit')::integer from public.system_configuration where config_key='design_delivery_sop_v1'),2)) else 4 end) max_work,
         count(t.id) filter(where t.completed_at is null and lower(coalesce(t.status,'')) not in ('done','completed','cancelled')) open_work,
         case when exists(select 1 from public.project_team pt where pt.project_id=p_project_id and pt.user_id=u.id) then 0 else 1 end project_rank
  from public.user_profiles u
  left join public.workforce_capability_profiles cp on cp.user_id=u.id
  left join public.project_tasks t on t.assigned_to=u.id
  where u.status='active'
    and coalesce(cp.availability_status,'Available')<>'Unavailable'
    and (
      (lower(coalesce(p_department,'')) in ('ui/ux design','design') and u.role='uiux_designer') or
      (lower(coalesce(p_department,''))='content' and u.role='content_writer') or
      (lower(coalesce(p_department,''))='development' and u.role in ('developer','web_developer','developer_designer')) or
      (lower(coalesce(p_department,'')) in ('quality assurance','qa') and u.role='qa')
    )
  group by u.id,cp.availability_status,cp.max_parallel_work,u.role
)
select id from eligible where open_work<max_work
order by project_rank, case availability_status when 'Available' then 0 else 1 end, open_work::numeric/nullif(max_work,0), open_work, id limit 1;
$$;

create or replace function public.pick_uiux_designer(p_project_id uuid)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  select public.pick_delivery_specialist('UI/UX Design',p_project_id);
$$;

create or replace function public.design_delivery_pick_reviewer(p_project_id uuid,p_review_type text,p_exclude_user_id uuid)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
with candidates as (
 select u.id,
        coalesce(cp.availability_status,'Available') availability_status,
        coalesce(cp.max_parallel_work,4) max_work,
        coalesce(cp.reviewer_eligible,false) reviewer_eligible,
        coalesce(cp.reviewer_qualifications,'{}'::text[]) reviewer_qualifications,
        case when pt.user_id is not null then 0 else 1 end project_rank,
        (select count(*) from public.design_delivery_reviews r where r.reviewer_user_id=u.id and r.status='Pending') pending_reviews
 from public.user_profiles u
 left join public.workforce_capability_profiles cp on cp.user_id=u.id
 left join public.project_team pt on pt.project_id=p_project_id and pt.user_id=u.id
 where u.status='active' and u.id is distinct from p_exclude_user_id
   and coalesce(cp.availability_status,'Available')<>'Unavailable'
   and coalesce(cp.reviewer_eligible,false)=true
   and p_review_type=any(coalesce(cp.reviewer_qualifications,'{}'::text[]))
   and ((p_review_type='Independent Design QA' and u.role='uiux_designer')
     or (p_review_type='Accessibility Review' and u.role in ('qa','uiux_designer'))
     or (p_review_type='Technical Feasibility' and u.role in ('developer','web_developer','developer_designer'))
     or (p_review_type='Implementation QA' and u.role in ('uiux_designer','qa')))
)
select id from candidates where pending_reviews<max_work
order by project_rank,case availability_status when 'Available' then 0 else 1 end,pending_reviews,id limit 1;
$$;

create or replace function public.ensure_project_delivery_stage_tasks(p_project_id uuid,p_stage text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_project public.projects%rowtype; v_salesperson uuid; v_created_by uuid; v_count integer:=0;
begin
 select * into v_project from public.projects where id=p_project_id;
 if not found then raise exception 'Project not found.'; end if;
 select salesperson_id into v_salesperson from public.crm_opportunities where id=v_project.source_opportunity_id;
 v_created_by:=coalesce(v_project.project_manager_id,v_project.created_by,v_salesperson,auth.uid());
 if v_created_by is null then raise exception 'Project workflow task creator could not be resolved.'; end if;
 insert into public.project_tasks(project_id,title,description,department,assigned_to,created_by,priority,status,start_date,due_date,workflow_key,workflow_stage,required_for_stage)
 select v_project.id,t.title,t.description,t.department,
        case t.assignee_kind when 'pm' then v_project.project_manager_id when 'seller' then v_salesperson when 'specialist' then public.pick_delivery_specialist(t.department,p_project_id) else null end,
        v_created_by,t.priority,'To Do',current_date,
        case when t.due_offset_days is null then v_project.target_date when v_project.target_date is null then current_date+t.due_offset_days else least(v_project.target_date,current_date+t.due_offset_days) end,
        t.workflow_key,t.stage_key,t.required_for_stage
 from public.delivery_task_templates t where t.stage_key=p_stage and t.active order by t.sort_order,t.created_at
 on conflict(project_id,workflow_key) where workflow_key is not null do nothing;
 get diagnostics v_count=row_count;
 return v_count;
end;$$;

create or replace function public.admin_get_design_operations()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
 return jsonb_build_object(
  'people',coalesce((select jsonb_agg(jsonb_build_object('userId',u.id,'name',u.full_name,'email',u.email,'role',u.role,'department',u.department,'jobTitle',cp.job_title,'level',cp.level,'specialties',cp.specialties,'reviewerQualifications',cp.reviewer_qualifications,'availabilityStatus',cp.availability_status,'weeklyCapacityHours',cp.weekly_capacity_hours,'maxParallelWork',cp.max_parallel_work,'reviewerEligible',cp.reviewer_eligible,'certificationState',cp.certification_state) order by u.full_name) from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id where u.status='active' and u.role not in ('customer','pending')),'[]'::jsonb),
  'templates',coalesce((select jsonb_agg(to_jsonb(t) order by t.stage_key,t.sort_order,t.created_at) from public.delivery_task_templates t),'[]'::jsonb)
 );
end;$$;

create or replace function public.admin_upsert_workforce_capability_profile(p_user_id uuid,p_profile jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.workforce_capability_profiles%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
 if not exists(select 1 from public.user_profiles where id=p_user_id and status='active') then raise exception 'Active staff member not found.'; end if;
 insert into public.workforce_capability_profiles(user_id,job_title,level,specialties,reviewer_qualifications,availability_status,weekly_capacity_hours,max_parallel_work,reviewer_eligible,certification_state,mentor_user_id,updated_by,updated_at)
 values(p_user_id,left(trim(coalesce(p_profile->>'jobTitle','')),120),left(trim(coalesce(p_profile->>'level','')),80),
        coalesce(array(select jsonb_array_elements_text(coalesce(p_profile->'specialties','[]'::jsonb))),'{}'),
        coalesce(array(select jsonb_array_elements_text(coalesce(p_profile->'reviewerQualifications','[]'::jsonb))),'{}'),
        case when p_profile->>'availabilityStatus' in('Available','Limited','Unavailable') then p_profile->>'availabilityStatus' else 'Available' end,
        greatest(1,least(80,coalesce((p_profile->>'weeklyCapacityHours')::integer,40))),greatest(1,least(20,coalesce((p_profile->>'maxParallelWork')::integer,2))),
        coalesce((p_profile->>'reviewerEligible')::boolean,false),left(trim(coalesce(p_profile->>'certificationState','Active')),80),nullif(p_profile->>'mentorUserId','')::uuid,auth.uid(),now())
 on conflict(user_id) do update set job_title=excluded.job_title,level=excluded.level,specialties=excluded.specialties,reviewer_qualifications=excluded.reviewer_qualifications,availability_status=excluded.availability_status,weekly_capacity_hours=excluded.weekly_capacity_hours,max_parallel_work=excluded.max_parallel_work,reviewer_eligible=excluded.reviewer_eligible,certification_state=excluded.certification_state,mentor_user_id=excluded.mentor_user_id,updated_by=auth.uid(),updated_at=now()
 returning * into v_row;
 return to_jsonb(v_row);
end;$$;

create or replace function public.admin_upsert_delivery_task_template(p_template jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid:=nullif(p_template->>'id','')::uuid; v_row public.delivery_task_templates%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
 if trim(coalesce(p_template->>'stageKey',''))='' or trim(coalesce(p_template->>'workflowKey',''))='' or trim(coalesce(p_template->>'title',''))='' then raise exception 'Stage, workflow key and title are required.'; end if;
 insert into public.delivery_task_templates(id,stage_key,workflow_key,title,description,department,priority,assignee_kind,due_offset_days,sort_order,required_for_stage,active,created_by,updated_by,updated_at)
 values(coalesce(v_id,gen_random_uuid()),left(trim(p_template->>'stageKey'),120),left(trim(p_template->>'workflowKey'),160),left(trim(p_template->>'title'),240),trim(coalesce(p_template->>'description','')),left(trim(coalesce(p_template->>'department','Project Management')),120),left(trim(coalesce(p_template->>'priority','Normal')),40),case when p_template->>'assigneeKind' in('pm','seller','specialist','unassigned') then p_template->>'assigneeKind' else 'specialist' end,case when p_template ? 'dueOffsetDays' then greatest(0,least(365,(p_template->>'dueOffsetDays')::integer)) else null end,greatest(0,coalesce((p_template->>'sortOrder')::integer,10)),coalesce((p_template->>'requiredForStage')::boolean,true),coalesce((p_template->>'active')::boolean,true),auth.uid(),auth.uid(),now())
 on conflict(workflow_key) do update set stage_key=excluded.stage_key,title=excluded.title,description=excluded.description,department=excluded.department,priority=excluded.priority,assignee_kind=excluded.assignee_kind,due_offset_days=excluded.due_offset_days,sort_order=excluded.sort_order,required_for_stage=excluded.required_for_stage,active=excluded.active,updated_by=auth.uid(),updated_at=now()
 returning * into v_row;
 return to_jsonb(v_row);
end;$$;

create or replace function public.queue_due_design_delivery_sla()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_cfg jsonb:='{}'::jsonb; v_review_sla numeric:=24; v_client_sla numeric:=72; v_due integer:=0; v_breached integer:=0; v_client integer:=0; r record; v_payload jsonb;
begin
 select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='design_delivery_sop_v1';
 v_review_sla:=greatest(1,coalesce((v_cfg->>'reviewSlaHours')::numeric,24));
 v_client_sla:=greatest(1,coalesce((v_cfg->>'clientReviewSlaHours')::numeric,72));
 for r in select dr.*,pt.title task_title,p.project_number,p.project_name,p.project_manager_id from public.design_delivery_reviews dr join public.project_tasks pt on pt.id=dr.project_task_id join public.projects p on p.id=dr.project_id where dr.status='Pending' and dr.requested_at<=now()-make_interval(hours=>(v_review_sla*0.75)::integer) loop
  v_payload:=jsonb_build_object('reviewId',r.id,'taskId',r.project_task_id,'projectId',r.project_id,'reviewType',r.review_type,'requestedAt',r.requested_at,'slaHours',v_review_sla);
  if r.requested_at<=now()-make_interval(hours=>v_review_sla::integer) then
   perform public.service_queue_staff_operational_notification(r.reviewer_user_id,'design-review-sla-breached:'||r.id::text,'design_review_sla_breached','Design Review','Design review SLA breached',coalesce(r.project_number,'Project')||' · '||r.review_type||' is overdue. Complete the assigned review now.','/admin/app/projects?tab=myWork',v_payload,now());
   if r.project_manager_id is not null then perform public.service_queue_staff_operational_notification(r.project_manager_id,'design-review-sla-pm:'||r.id::text,'design_review_sla_breached','Delivery Exception','Design review is overdue',coalesce(r.project_number,'Project')||' · '||r.review_type||' has breached its review SLA.','/admin/app/projects?tab=projects',v_payload,now()); else perform public.service_queue_active_admins_operational_notification('design-review-sla-admin:'||r.id::text,'design_review_sla_breached','Delivery Exception','Design review is overdue',coalesce(r.project_number,'Project')||' · '||r.review_type||' has breached its review SLA.','/admin/app/projects?tab=projects',v_payload,now()); end if;
   v_breached:=v_breached+1;
  else
   perform public.service_queue_staff_operational_notification(r.reviewer_user_id,'design-review-sla-due:'||r.id::text,'design_review_sla_due','Design Review','Design review due soon',coalesce(r.project_number,'Project')||' · '||r.review_type||' is approaching its review SLA.','/admin/app/projects?tab=myWork',v_payload,now()); v_due:=v_due+1;
  end if;
 end loop;
 for r in select p.id,p.project_number,p.project_name,p.project_manager_id,p.updated_at from public.projects p where p.stage='Client Design Approval' and p.updated_at<=now()-make_interval(hours=>v_client_sla::integer) loop
  v_payload:=jsonb_build_object('projectId',r.id,'stage','Client Design Approval','slaHours',v_client_sla,'stageUpdatedAt',r.updated_at);
  if r.project_manager_id is not null then perform public.service_queue_staff_operational_notification(r.project_manager_id,'client-design-approval-sla:'||r.id::text,'client_design_approval_sla','Client Approval','Client design approval needs follow-up',coalesce(r.project_number,'Project')||' has been waiting for client design approval beyond the configured SLA.','/admin/app/projects?tab=projects',v_payload,now()); else perform public.service_queue_active_admins_operational_notification('client-design-approval-sla:'||r.id::text,'client_design_approval_sla','Client Approval','Client design approval needs follow-up',coalesce(r.project_number,'Project')||' has been waiting for client approval beyond SLA.','/admin/app/projects?tab=projects',v_payload,now()); end if; v_client:=v_client+1;
 end loop;
 return jsonb_build_object('reviewDueSoon',v_due,'reviewBreached',v_breached,'clientApprovalOverdue',v_client);
end;$$;

create or replace function public.get_design_delivery_metrics(p_period_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_days integer:=least(greatest(coalesce(p_period_days,30),7),90); v_start timestamptz:=now()-make_interval(days=>least(greatest(coalesce(p_period_days,30),7),90)); v_sla numeric:=24;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
 select greatest(1,coalesce((config_value->>'reviewSlaHours')::numeric,24)) into v_sla from public.system_configuration where config_key='design_delivery_sop_v1';
 return jsonb_build_object(
  'periodDays',v_days,
  'activeWip',(select count(*) from public.project_tasks t join public.user_profiles u on u.id=t.assigned_to where u.role='uiux_designer' and t.completed_at is null and lower(coalesce(t.status,'')) not in('done','completed','cancelled')),
  'unassignedDesignTasks',(select count(*) from public.project_tasks where lower(coalesce(department,'')) in('ui/ux design','design') and assigned_to is null and completed_at is null and lower(coalesce(status,'')) not in('done','completed','cancelled')),
  'reviewSlaBreached',(select count(*) from public.design_delivery_reviews where status='Pending' and requested_at<now()-make_interval(hours=>v_sla::integer)),
  'averageQaScore',(select round(avg(quality_score),1) from public.design_delivery_reviews where review_type='Independent Design QA' and completed_at>=v_start and quality_score is not null),
  'firstPassQaRate',coalesce((select round(100.0*count(*) filter(where status='Pass')/nullif(count(*),0),1) from public.design_delivery_reviews where review_type='Independent Design QA' and review_round=1 and completed_at>=v_start),0),
  'averageRevisionRounds',coalesce((select round(avg(rounds),1) from (select project_task_id,max(review_round) rounds from public.design_delivery_reviews where review_type='Independent Design QA' and requested_at>=v_start group by project_task_id)x),0),
  'averageDesignCycleHours',coalesce((select round(avg(extract(epoch from(t.completed_at-t.created_at))/3600.0)::numeric,1) from public.project_tasks t join public.user_profiles u on u.id=t.assigned_to where u.role='uiux_designer' and t.completed_at>=v_start),0),
  'implementationQaFirstPassRate',coalesce((select round(100.0*count(*) filter(where status='Pass')/nullif(count(*),0),1) from public.design_delivery_reviews where review_type='Implementation QA' and review_round=1 and completed_at>=v_start),0),
  'implementationCorrections',(select count(*) from public.project_tasks where title like 'Resolve Design Implementation QA · %' and created_at>=v_start),
  'clientDesignChangeRequests',(select count(*) from public.project_client_approvals where from_stage='Client Design Approval' and coalesce(action,'')<>'Approved' and created_at>=v_start)
 );
end;$$;

grant select on public.workforce_capability_profiles,public.delivery_task_templates to authenticated;
grant execute on function public.pick_delivery_specialist(text,uuid) to authenticated;
grant execute on function public.admin_get_design_operations() to authenticated;
grant execute on function public.admin_upsert_workforce_capability_profile(uuid,jsonb) to authenticated;
grant execute on function public.admin_upsert_delivery_task_template(jsonb) to authenticated;
grant execute on function public.get_design_delivery_metrics(integer) to authenticated;
revoke all on function public.queue_due_design_delivery_sla() from public,anon,authenticated;
grant execute on function public.queue_due_design_delivery_sla() to service_role;

insert into public.system_configuration(config_key,config_value,description,updated_at)
values('design_operations_v1',jsonb_build_object('slaEscalationEnabled',true,'capabilityBasedStaffing',true,'adminManagedTaskTemplates',true,'designBiEnabled',true),'Design Operations productivity and governance controls.',now())
on conflict(config_key) do update set config_value=public.system_configuration.config_value||excluded.config_value,description=excluded.description,updated_at=now();

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if not exists(select 1 from cron.job where jobname='design-delivery-sla-escalation') then
      perform cron.schedule('design-delivery-sla-escalation','23 * * * *','SELECT public.queue_due_design_delivery_sla();');
    end if;
  end if;
end $$;

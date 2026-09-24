-- PF-SOP-09 live release blockers.
-- A previously-passing score cannot override a newly discovered E0/E1 finding.

create or replace function public.enforce_pf_sop09_development_status_gate()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_ticket jsonb; v_tier text; v_assessment public.development_release_quality_assessments%rowtype; v_blockers jsonb;
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
      v_blockers:=public.development_quality_release_blockers(new.project_id);
      if coalesce((v_blockers->>'releaseBlocking')::boolean,false) then raise exception 'Current E0/E1 findings block Release Readiness. Resolve and independently verify them before review.'; end if;
      if v_tier in('growth','scale','custom') and v_assessment.status<>'PASS' then raise exception 'Growth/Scale/Custom release requires a PASS Engineering Quality Score (90+).'; end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_pf_sop09_project_release()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_release_task public.project_tasks%rowtype; v_assessment public.development_release_quality_assessments%rowtype; v_tier text; v_blockers jsonb;
begin
  if new.stage is not distinct from old.stage then return new; end if;
  if new.stage='Launch' then
    select * into v_release_task from public.project_tasks where project_id=new.id and workflow_key='development_release_readiness' limit 1;
    if not found or v_release_task.status<>'Done' then raise exception 'PF-SOP-09 Engineering Release Readiness must be complete before Launch.'; end if;
    v_blockers:=public.development_quality_release_blockers(new.id);
    if coalesce((v_blockers->>'releaseBlocking')::boolean,false) then raise exception 'Launch blocked by current E0/E1 Development findings.'; end if;
    v_tier:=public.development_sop_delivery_tier(new.id);
    select * into v_assessment from public.development_release_quality_assessments where project_task_id=v_release_task.id order by assessment_version desc limit 1;
    if not found then raise exception 'PF-SOP-09 Engineering Quality assessment is missing.'; end if;
    if v_tier in('growth','scale','custom') and v_assessment.status<>'PASS' then raise exception 'Growth/Scale/Custom Launch requires a current PASS Engineering Quality Score (90+).'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_pf_sop09_project_release on public.projects;
create trigger trg_pf_sop09_project_release before update of stage on public.projects for each row execute function public.protect_pf_sop09_project_release();

-- Restore the canonical delivery-derived assignment state after a scope-change hold.

create or replace function public.restore_worker_assignment_operational_status()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
  if new.status='Accepted' and (old.status='On Hold' or new.scope_version is distinct from old.scope_version) then
    select case
      when bool_or(d.quality_status in ('Revision Required','Rework')) then 'Changes Required'
      when bool_or(d.lifecycle_stage in ('SME / Fact Check','2i Editorial Review','SEO / Conversion Review','Ready for Client Review','Client Approved','Ready for Implementation','Implemented','In-Context QA','Approved for Publication','Published','Measured / Maintained')) then 'In Review'
      when bool_or(d.lifecycle_stage in ('Drafting','Writer Self-QA')) then 'In Progress'
      else 'Accepted' end
    into v_status
    from public.worker_assignment_items i left join public.content_deliverables d on d.id=i.content_deliverable_id
    where i.assignment_id=new.id;
    if coalesce(v_status,'Accepted')<>new.status then
      update public.worker_work_assignments set status=v_status,updated_at=now() where id=new.id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_restore_worker_assignment_operational_status on public.worker_work_assignments;
create trigger trg_restore_worker_assignment_operational_status
after update of status,scope_version on public.worker_work_assignments
for each row execute function public.restore_worker_assignment_operational_status();

revoke all on function public.restore_worker_assignment_operational_status() from public,anon,authenticated;

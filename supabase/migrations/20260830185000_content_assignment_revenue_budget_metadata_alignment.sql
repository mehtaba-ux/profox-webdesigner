-- Content assignment rows are already corrected by the revenue-distribution BEFORE trigger.
-- Normalize downstream event and in-app notification metadata to the authoritative post-trigger amount
-- without replacing the mature Content assignment RPC.

create or replace function public.align_worker_assignment_created_event_to_budget()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare v public.worker_work_assignments%rowtype;
begin
  if new.assignment_id is null or new.event_type<>'Assignment Created' then return new; end if;
  select * into v from public.worker_work_assignments where id=new.assignment_id;
  if not found then return new; end if;
  new.new_value:=coalesce(new.new_value,'{}'::jsonb)||jsonb_build_object(
    'suggestedAmount',v.suggested_amount,
    'agreedFee',v.agreed_fee,
    'status',v.status,
    'department',v.department,
    'revenueBudgetAligned',true
  );
  return new;
end;
$$;

drop trigger if exists trg_align_worker_assignment_created_event_to_budget on public.worker_compensation_events;
create trigger trg_align_worker_assignment_created_event_to_budget
before insert on public.worker_compensation_events
for each row execute function public.align_worker_assignment_created_event_to_budget();

create or replace function public.align_worker_assignment_notification_to_budget()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_assignment_id uuid;
  v public.worker_work_assignments%rowtype;
  v_project_name text;
begin
  if coalesce(new.dedupe_key,'') !~ '^worker-assignment-offered:[0-9a-fA-F-]{36}$' then return new; end if;
  begin
    v_assignment_id:=substring(new.dedupe_key from length('worker-assignment-offered:')+1)::uuid;
  exception when others then return new;
  end;
  select * into v from public.worker_work_assignments where id=v_assignment_id;
  if not found then return new; end if;
  select project_name into v_project_name from public.projects where id=v.project_id;
  new.message:=coalesce(v_project_name,'Project')||' has been assigned with agreed compensation '||v.currency||' '||to_char(v.agreed_fee,'FM999999990.00')||'.';
  return new;
end;
$$;

drop trigger if exists trg_align_worker_assignment_notification_to_budget on public.in_app_notifications;
create trigger trg_align_worker_assignment_notification_to_budget
before insert or update of message,dedupe_key on public.in_app_notifications
for each row execute function public.align_worker_assignment_notification_to_budget();

revoke all on function public.align_worker_assignment_created_event_to_budget() from public,anon,authenticated;
revoke all on function public.align_worker_assignment_notification_to_budget() from public,anon,authenticated;

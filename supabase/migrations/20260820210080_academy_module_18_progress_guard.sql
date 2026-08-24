-- Module 18 — protect certification result and mission history from client-side manipulation.

create or replace function public.protect_calendar_training_progress_write()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_slug text;
  v_rpc text:=coalesce(current_setting('profox.training_calendar_rpc',true),'');
begin
  if public.is_admin() then return new; end if;
  select slug into v_slug from public.training_modules where id=new.module_id;
  if v_slug<>'calendar-setup' then return new; end if;
  if v_rpc='1' then return new; end if;

  if tg_op='INSERT' then
    if new.status in ('Passed','Completed','Retry Required','Submitted')
       or new.score is not null or new.completed_at is not null then
      raise exception 'Module 18 certification result is controlled by the secure Calendar Training workflow.';
    end if;
  else
    -- The existing Academy shell may normalize an already server-certified Passed row to Completed.
    if old.status='Passed' and new.status='Completed'
       and new.score is not distinct from old.score
       and new.completed_at is not null then
      return new;
    end if;
    if (new.status is distinct from old.status and new.status in ('Passed','Completed','Retry Required','Submitted'))
       or new.score is distinct from old.score
       or new.completed_at is distinct from old.completed_at then
      raise exception 'Module 18 certification result is controlled by the secure Calendar Training workflow.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_calendar_training_progress_write() from public,anon,authenticated;

drop trigger if exists trg_protect_calendar_training_progress_write on public.user_training_progress;
create trigger trg_protect_calendar_training_progress_write
before insert or update on public.user_training_progress
for each row execute function public.protect_calendar_training_progress_write();

create or replace function public.protect_calendar_training_assignment_write()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_slug text;
  v_rpc text:=coalesce(current_setting('profox.training_calendar_rpc',true),'');
  v_progress_status text;
begin
  if public.is_admin() then return new; end if;
  select slug into v_slug from public.training_modules where id=new.module_id;
  if v_slug<>'calendar-setup' then return new; end if;
  if v_rpc='1' then return new; end if;

  -- Compatibility with the existing Academy shell after secure certification only.
  if coalesce(new.submission_data->>'type','')='calendar_setup' then
    select status into v_progress_status from public.user_training_progress where id=new.progress_id and user_id=auth.uid();
    if v_progress_status in ('Passed','Completed') then return new; end if;
  end if;

  raise exception 'Module 18 mission and assessment history is controlled by the secure Calendar Training workflow.';
end;
$$;

revoke all on function public.protect_calendar_training_assignment_write() from public,anon,authenticated;

drop trigger if exists trg_protect_calendar_training_assignment_write on public.training_assignments;
create trigger trg_protect_calendar_training_assignment_write
before insert or update on public.training_assignments
for each row execute function public.protect_calendar_training_assignment_write();

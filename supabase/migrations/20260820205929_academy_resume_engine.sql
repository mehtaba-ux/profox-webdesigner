-- Production-reconciled Sales Academy resume engine.
-- This is convenience-only learner state. It is never authoritative for scores,
-- pass/fail, answer keys, critical metadata, reviews, certification, Final Approval,
-- or Sales activation.

create table if not exists public.academy_resume_checkpoints (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  checkpoint jsonb not null default '{}'::jsonb,
  checkpoint_version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id,module_id)
);

alter table public.academy_resume_checkpoints enable row level security;
revoke all on public.academy_resume_checkpoints from anon,authenticated;

create index if not exists idx_academy_resume_checkpoints_module
  on public.academy_resume_checkpoints(module_id);
create index if not exists idx_academy_resume_checkpoints_updated_at
  on public.academy_resume_checkpoints(updated_at);

create or replace function public.academy_resume_checkpoint_has_forbidden_key(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path=public,pg_temp
as $$
declare
  v_key text;
  v_child jsonb;
  v_forbidden text[] := array[
    'correct','correct_index','correctindex','answer_key','answerkey','answer_keys','answerkeys',
    'critical','critical_flag','criticalflag','critical_miss','criticalmiss','critical_misses','criticalmisses',
    'critical_failure','criticalfailure','critical_failures','criticalfailures','critical_rules','criticalrules',
    'score','passed','passing_score','passingscore','reviewer','reviewed_by','reviewedby','evaluator',
    'evaluator_brief','evaluatorbrief','hidden_brief','hiddenbrief','rubric','rubric_snapshot','rubricsnapshot',
    'explanation','answer_explanation','answerexplanation'
  ];
begin
  if p_value is null then return false; end if;
  if jsonb_typeof(p_value)='object' then
    for v_key,v_child in select key,value from jsonb_each(p_value) loop
      if lower(v_key)=any(v_forbidden) then return true; end if;
      if public.academy_resume_checkpoint_has_forbidden_key(v_child) then return true; end if;
    end loop;
  elsif jsonb_typeof(p_value)='array' then
    for v_child in select value from jsonb_array_elements(p_value) loop
      if public.academy_resume_checkpoint_has_forbidden_key(v_child) then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;

create or replace function public.get_academy_resume_checkpoint(p_module_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_checkpoint jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if not exists(select 1 from public.user_training_progress where user_id=v_user and module_id=p_module_id) then
    return null;
  end if;
  select checkpoint into v_checkpoint
  from public.academy_resume_checkpoints
  where user_id=v_user and module_id=p_module_id;
  return v_checkpoint;
end;
$$;

create or replace function public.save_academy_resume_checkpoint(p_module_id uuid,p_checkpoint jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_saved jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if p_checkpoint is null or jsonb_typeof(p_checkpoint)<>'object' then
    raise exception 'Checkpoint must be a JSON object.';
  end if;
  if octet_length(p_checkpoint::text)>65536 then
    raise exception 'Checkpoint is too large.';
  end if;
  if public.academy_resume_checkpoint_has_forbidden_key(p_checkpoint) then
    raise exception 'Checkpoint contains protected certification data.';
  end if;

  select status into v_status
  from public.user_training_progress
  where user_id=v_user and module_id=p_module_id;
  if not found then raise exception 'Training progress record not found.'; end if;

  if v_status in ('Submitted','Passed','Completed') then
    delete from public.academy_resume_checkpoints where user_id=v_user and module_id=p_module_id;
    return null;
  end if;

  v_saved := p_checkpoint || jsonb_build_object('savedAt',now());
  insert into public.academy_resume_checkpoints(user_id,module_id,checkpoint,checkpoint_version,updated_at)
  values(v_user,p_module_id,v_saved,1,now())
  on conflict(user_id,module_id) do update
    set checkpoint=excluded.checkpoint,
        checkpoint_version=academy_resume_checkpoints.checkpoint_version+1,
        updated_at=now()
  returning checkpoint into v_saved;
  return v_saved;
end;
$$;

create or replace function public.clear_academy_resume_checkpoint(p_module_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  delete from public.academy_resume_checkpoints where user_id=auth.uid() and module_id=p_module_id;
end;
$$;

create or replace function public.clear_academy_resume_checkpoint_on_terminal_progress()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.status in ('Submitted','Passed','Completed','Retry Required')
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    delete from public.academy_resume_checkpoints where user_id=new.user_id and module_id=new.module_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_academy_resume_checkpoint_on_terminal_progress on public.user_training_progress;
create trigger trg_clear_academy_resume_checkpoint_on_terminal_progress
after insert or update of status on public.user_training_progress
for each row execute function public.clear_academy_resume_checkpoint_on_terminal_progress();

revoke all on function public.academy_resume_checkpoint_has_forbidden_key(jsonb) from public,anon,authenticated;
revoke all on function public.get_academy_resume_checkpoint(uuid) from public,anon;
revoke all on function public.save_academy_resume_checkpoint(uuid,jsonb) from public,anon;
revoke all on function public.clear_academy_resume_checkpoint(uuid) from public,anon;
revoke all on function public.clear_academy_resume_checkpoint_on_terminal_progress() from public,anon,authenticated;
grant execute on function public.get_academy_resume_checkpoint(uuid) to authenticated;
grant execute on function public.save_academy_resume_checkpoint(uuid,jsonb) to authenticated;
grant execute on function public.clear_academy_resume_checkpoint(uuid) to authenticated;

comment on table public.academy_resume_checkpoints is
'Sales Academy convenience-only resume state. Never authoritative for scores, certification, review, Final Approval or activation.';

-- Module 20 closure hardening: explicit evaluator separation and deep final-pass invariants.

-- A Final Certification evaluator must never be the trainee being evaluated.
alter table public.final_certification_sessions
  drop constraint if exists final_certification_no_self_evaluation;

alter table public.final_certification_sessions
  add constraint final_certification_no_self_evaluation
  check (evaluator_id is null or evaluator_id <> trainee_id);

create or replace function public.enforce_final_certification_pass_invariants()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_module public.training_modules%rowtype;
  v_state public.final_certification_state%rowtype;
  v_missing_prior integer:=0;
begin
  select * into v_module from public.training_modules where id=new.module_id;
  if not found or v_module.slug<>'final-certification' then return new; end if;
  if new.status not in ('Passed','Completed') then return new; end if;

  select count(*) into v_missing_prior
  from public.training_modules m
  where m.active=true
    and m.required=true
    and m.sort_order<v_module.sort_order
    and not exists (
      select 1
      from public.user_training_progress p
      where p.user_id=new.user_id
        and p.module_id=m.id
        and p.status in ('Passed','Completed')
        and (m.passing_score is null or coalesce(p.score,0)>=m.passing_score)
    );

  if v_missing_prior>0 then
    raise exception 'Final Certification cannot pass while % required prior Academy module(s) are incomplete or below their pass threshold.',v_missing_prior;
  end if;

  select * into v_state
  from public.final_certification_state
  where progress_id=new.id and user_id=new.user_id and module_id=new.module_id;

  if not found or v_state.judgment_passed is not true
     or coalesce(v_state.judgment_score,0)<coalesce(v_module.passing_score,90)
     or coalesce(v_state.judgment_critical_misses,1)<>0 then
    raise exception 'Final Certification requires a passing 30-scenario judgment gate with zero critical misses.';
  end if;

  if coalesce(v_state.self_assessment,'{}'::jsonb)='{}'::jsonb then
    raise exception 'Final Certification requires the learner self-assessment before a terminal pass.';
  end if;

  if not exists (
    select 1
    from public.final_certification_sessions s
    where s.id=v_state.live_session_id
      and s.progress_id=new.id
      and s.trainee_id=new.user_id
      and s.module_id=new.module_id
      and s.status='passed'
      and coalesce(s.score,0)>=coalesce(v_module.passing_score,90)
      and jsonb_array_length(coalesce(s.critical_failures,'[]'::jsonb))=0
      and s.evaluator_id is not null
      and s.evaluator_id<>s.trainee_id
      and s.evaluated_at is not null
  ) then
    raise exception 'Final Certification requires a passing live Management evaluation with zero critical failures and an independent evaluator.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_final_certification_pass_invariants() from public,anon,authenticated;

drop trigger if exists trg_enforce_final_certification_pass_invariants on public.user_training_progress;
create trigger trg_enforce_final_certification_pass_invariants
before insert or update on public.user_training_progress
for each row execute function public.enforce_final_certification_pass_invariants();

-- Module 10 server-side practice integrity hardening.
-- The UI already guides these rules; this migration makes them impossible to
-- bypass by calling the RPCs directly.

create or replace function public.complete_call_practice_drill(
  p_progress_id uuid,
  p_drill_id uuid,
  p_reflection text default ''::text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_progress public.user_training_progress%rowtype;
  v_module public.training_modules%rowtype;
  v_state public.call_practice_state%rowtype;
  v_lesson_total integer;
  v_drill_total integer;
  v_drill_done integer;
  v_reflection text := trim(coalesce(p_reflection,''));
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if length(v_reflection) < 10 then
    raise exception 'Add a short reflection about what you learned from this drill.';
  end if;

  select * into v_progress from public.user_training_progress where id=p_progress_id for update;
  if not found or v_progress.user_id<>v_uid then raise exception 'Invalid Call Practice progress.'; end if;
  select * into v_module from public.training_modules where id=v_progress.module_id and slug='call-practice' and active=true;
  if not found then raise exception 'Invalid Call Practice module.'; end if;
  if not exists (select 1 from public.call_practice_drills where id=p_drill_id and active) then
    raise exception 'Practice drill not found.';
  end if;

  insert into public.call_practice_state(user_id,progress_id,module_id)
  values(v_uid,v_progress.id,v_module.id)
  on conflict(progress_id) do nothing;
  select * into v_state from public.call_practice_state where progress_id=v_progress.id for update;

  select count(*) into v_lesson_total from public.training_lessons where module_id=v_module.id and active;
  if cardinality(v_state.completed_lesson_ids)<v_lesson_total then
    raise exception 'Complete all Call Practice lessons before recording required drills.';
  end if;

  if p_drill_id=any(v_state.completed_drill_ids) then
    raise exception 'This practice drill has already been completed.';
  end if;

  update public.call_practice_state
  set completed_drill_ids=array_append(completed_drill_ids,p_drill_id),
      drill_reflections=jsonb_set(drill_reflections,array[p_drill_id::text],to_jsonb(left(v_reflection,2000)),true),
      updated_at=now()
  where id=v_state.id
  returning * into v_state;

  select count(*) into v_drill_total from public.call_practice_drills where active and required;
  select count(*) into v_drill_done from public.call_practice_drills d where d.active and d.required and d.id=any(v_state.completed_drill_ids);

  perform set_config('profox.training_call_practice_rpc','1',true);
  update public.user_training_progress
  set progress_percent=least(75,50+round((v_drill_done::numeric/greatest(v_drill_total,1))*25)::integer),updated_at=now()
  where id=v_progress.id;

  return jsonb_build_object('drillsCompleted',v_drill_done,'requiredDrills',v_drill_total);
end;
$$;

revoke all on function public.complete_call_practice_drill(uuid,uuid,text) from public, anon;
grant execute on function public.complete_call_practice_drill(uuid,uuid,text) to authenticated;

create or replace function public.submit_call_practice_rehearsal(
  p_progress_id uuid,
  p_rehearsal_no integer,
  p_scores jsonb,
  p_reflection text default ''::text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_progress public.user_training_progress%rowtype;
  v_module public.training_modules%rowtype;
  v_state public.call_practice_state%rowtype;
  v_settings jsonb;
  v_required integer;
  v_score integer:=0;
  v_clean jsonb;
  v_rehearsals jsonb;
  v_count integer;
  v_score_count integer;
  v_expected_no integer;
  v_reflection text:=trim(coalesce(p_reflection,''));
  v_expected_keys text[]:=array[
    'preparation','openingAgenda','listening','questionQuality','rootCause',
    'businessImpact','outcomePriority','commercialDecision','summary','nextStep'
  ];
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if length(v_reflection)<20 then
    raise exception 'Add an honest coaching reflection before saving this rehearsal.';
  end if;

  select * into v_progress from public.user_training_progress where id=p_progress_id for update;
  if not found or v_progress.user_id<>v_uid then raise exception 'Invalid Call Practice progress.'; end if;
  select * into v_module from public.training_modules where id=v_progress.module_id and slug='call-practice' and active=true;
  if not found then raise exception 'Invalid Call Practice module.'; end if;
  select * into v_state from public.call_practice_state where progress_id=v_progress.id for update;
  if not found then raise exception 'Complete the Call Practice lessons and drills first.'; end if;

  if exists(select 1 from public.training_lessons l where l.module_id=v_module.id and l.active and not (l.id=any(v_state.completed_lesson_ids))) then
    raise exception 'Complete all Call Practice lessons first.';
  end if;
  if exists(select 1 from public.call_practice_drills d where d.active and d.required and not (d.id=any(v_state.completed_drill_ids))) then
    raise exception 'Complete all required practice drills first.';
  end if;

  select coalesce(config_value,'{}'::jsonb) into v_settings from public.system_configuration where config_key='mock_call_automation_settings';
  v_required:=greatest(coalesce((v_settings->>'fullRehearsalsRequired')::integer,3),1);
  select count(*) into v_count from jsonb_array_elements(v_state.rehearsals);
  v_expected_no:=v_count+1;

  if p_rehearsal_no<>v_expected_no or p_rehearsal_no>v_required then
    raise exception 'Complete full rehearsals in order. The next rehearsal is %.',least(v_expected_no,v_required);
  end if;

  if jsonb_typeof(p_scores)<>'object' then raise exception 'Self-score all 10 coaching areas.'; end if;
  select count(*) into v_score_count from jsonb_each(p_scores);
  if v_score_count<>cardinality(v_expected_keys) then raise exception 'Self-score all 10 coaching areas.'; end if;
  if exists(select 1 from unnest(v_expected_keys) k where not (p_scores ? k))
     or exists(select 1 from jsonb_object_keys(p_scores) k where not (k=any(v_expected_keys))) then
    raise exception 'Use the approved 10 Call Practice coaching dimensions.';
  end if;
  if exists(select 1 from jsonb_each_text(p_scores) e where e.value !~ '^[0-2]$') then
    raise exception 'Each self-score must be 0, 1 or 2.';
  end if;

  select coalesce(sum(value::integer),0) into v_score from jsonb_each_text(p_scores);
  v_clean:=jsonb_build_object(
    'rehearsalNo',p_rehearsal_no,
    'score',v_score,
    'scores',p_scores,
    'reflection',left(v_reflection,3000),
    'submittedAt',now()
  );
  v_rehearsals:=v_state.rehearsals||jsonb_build_array(v_clean);

  update public.call_practice_state set rehearsals=v_rehearsals,updated_at=now() where id=v_state.id;
  v_count:=v_count+1;

  perform set_config('profox.training_call_practice_rpc','1',true);
  update public.user_training_progress
  set progress_percent=least(95,75+round((v_count::numeric/greatest(v_required,1))*20)::integer),updated_at=now()
  where id=v_progress.id;

  return jsonb_build_object(
    'rehearsalsCompleted',v_count,
    'rehearsalsRequired',v_required,
    'selfScore',v_score,
    'readinessBenchmark',coalesce((v_settings->>'selfScoreReadinessBenchmark')::integer,16)
  );
end;
$$;

revoke all on function public.submit_call_practice_rehearsal(uuid,integer,jsonb,text) from public, anon;
grant execute on function public.submit_call_practice_rehearsal(uuid,integer,jsonb,text) to authenticated;

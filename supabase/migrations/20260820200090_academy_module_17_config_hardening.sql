-- Module 17 — learner config hardening.
-- Keep server-only mission validation hints out of the browser payload.

create or replace function public.get_crm_training_config(p_module_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_module public.training_modules%rowtype;
  v_progress public.user_training_progress%rowtype;
  v_state public.crm_training_state%rowtype;
  v_lesson_count integer:=0;
  v_mission_count integer:=0;
  v_missions jsonb:='[]'::jsonb;
  v_questions jsonb:='[]'::jsonb;
  v_acknowledgements jsonb:='[]'::jsonb;
  v_latest jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_module from public.training_modules where id=p_module_id and slug='crm-training' and active=true;
  if not found then raise exception 'CRM Training module not found.'; end if;
  if not public.can_access_sales_academy_module(p_module_id) then raise exception 'Training module access denied.'; end if;

  select * into v_progress from public.user_training_progress where user_id=v_user and module_id=p_module_id;
  if found then
    select * into v_state from public.crm_training_state where progress_id=v_progress.id;
    select submission_data into v_latest
    from public.training_assignments
    where user_id=v_user and module_id=p_module_id and progress_id=v_progress.id
      and submission_data->>'type'='crm_training_assessment_v1'
    order by created_at desc,id desc limit 1;
  end if;

  select count(*)::int into v_lesson_count from public.training_lessons where module_id=p_module_id and active=true;
  select count(*)::int into v_mission_count from public.crm_training_missions where module_id=p_module_id and active=true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'missionKey',m.mission_key,'title',m.title,'objective',m.objective,
    'instructions',m.instructions,
    'scenarioData',m.scenario_data - 'expectedDecision' - 'expectedStage' - 'minimumNoteLength',
    'sortOrder',m.sort_order
  ) order by m.sort_order),'[]'::jsonb)
  into v_missions
  from public.crm_training_missions m where m.module_id=p_module_id and m.active=true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'prompt',q.prompt,'options',q.options,'sortOrder',q.sort_order,
    'section',q.assessment_section,'caseKey',q.case_key
  ) order by q.sort_order),'[]'::jsonb)
  into v_questions
  from public.training_assessment_questions q
  where q.module_id=p_module_id and q.active=true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'statement',a.statement,'sortOrder',a.sort_order,'required',a.required
  ) order by a.sort_order),'[]'::jsonb)
  into v_acknowledgements
  from public.training_acknowledgements a
  where a.module_id=p_module_id and a.active=true;

  return jsonb_build_object(
    'framework','CAPTURE → VERIFY → ACT → RECORD → ADVANCE → PROTECT → HANDOFF',
    'principle','Make the CRM tell the truth. Advance only from evidence and approved workflow events.',
    'passingScore',coalesce(v_module.passing_score,85),
    'lessonCount',v_lesson_count,
    'lessonsCompleted',coalesce(v_state.lessons_completed,0),
    'missionCount',v_mission_count,
    'missionsCompleted',coalesce(v_state.missions_completed,0),
    'missions',v_missions,
    'sandboxSnapshot',coalesce(v_state.sandbox_snapshot,'{}'::jsonb),
    'questions',v_questions,
    'acknowledgements',v_acknowledgements,
    'latestAttempt',v_latest,
    'operatingStandard',jsonb_build_object(
      'sourceOfTruth','CRM records must reflect verified facts, real actions, current approved commercial state and explicit unknowns.',
      'trainingIsolation','Module 17 missions use synthetic sandbox data only and never write learner practice into production CRM records.',
      'stageRule','Lead/opportunity stage follows an observable milestone; optimism never substitutes for evidence.',
      'wonRule','Customer confirmation or a payment screenshot is not verification. Only the protected verified-payment workflow may produce the qualifying Won/client transition.'
    )
  );
end;
$$;

revoke all on function public.get_crm_training_config(uuid) from public,anon;
grant execute on function public.get_crm_training_config(uuid) to authenticated;

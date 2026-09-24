-- Module 15 — secure learner config, sequential lessons and server-scored quotation certification.

create or replace function public.get_quotation_process_training_config(p_module_id uuid)
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
  v_state public.quotation_process_training_state%rowtype;
  v_lesson_count integer:=0;
  v_questions jsonb:='[]'::jsonb;
  v_acknowledgements jsonb:='[]'::jsonb;
  v_latest jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_module from public.training_modules where id=p_module_id and slug='quotation-process' and active=true;
  if not found then raise exception 'Quotation Process module not found.'; end if;
  if not public.can_access_sales_academy_module(p_module_id) then raise exception 'Training module access denied.'; end if;

  select * into v_progress from public.user_training_progress where user_id=v_user and module_id=p_module_id;
  if found then
    select * into v_state from public.quotation_process_training_state where progress_id=v_progress.id;
    select submission_data into v_latest
    from public.training_assignments
    where user_id=v_user and module_id=p_module_id and progress_id=v_progress.id
      and submission_data->>'type'='quotation_process_assessment_v1'
    order by created_at desc,id desc limit 1;
  end if;

  select count(*)::int into v_lesson_count from public.training_lessons where module_id=p_module_id and active=true;
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
    'framework','VERIFY → SCOPE → CATALOG → ROUTE → REVIEW → ISSUE → TRACK → ACCEPT → PAYMENT HANDOFF',
    'principle','Quote exactly what ProFox can deliver—and preserve one approved commercial truth.',
    'passingScore',coalesce(v_module.passing_score,90),
    'lessonCount',v_lesson_count,
    'lessonsCompleted',coalesce(v_state.lessons_completed,0),
    'questions',v_questions,
    'acknowledgements',v_acknowledgements,
    'latestAttempt',v_latest,
    'operatingStandard',jsonb_build_object(
      'standardRoute','Active standard packages and approved add-ons configured without manager approval do not need separate human approval.',
      'approvalRoute','Custom, non-catalog, approval-required products and commercial exceptions require authorization.',
      'catalogRule','Use the live Sales Catalog and current configured price/approval rules.',
      'handoffRule','Accepted quotation → payment process → verified payment → protected Won transition.'
    )
  );
end;
$$;

create or replace function public.complete_quotation_process_lesson(p_progress_id uuid,p_lesson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_progress public.user_training_progress%rowtype;
  v_state public.quotation_process_training_state%rowtype;
  v_next uuid;
  v_count integer;
  v_done integer;
  v_percent integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_progress from public.user_training_progress where id=p_progress_id and user_id=auth.uid() for update;
  if not found then raise exception 'Training progress not found.'; end if;
  if not exists(select 1 from public.training_modules where id=v_progress.module_id and slug='quotation-process' and active=true)
     or not public.can_access_sales_academy_module(v_progress.module_id) then
    raise exception 'Quotation Process training access denied.';
  end if;
  if v_progress.status in ('Passed','Completed') then return jsonb_build_object('complete',true,'certified',true); end if;

  insert into public.quotation_process_training_state(progress_id,user_id,module_id)
  values(v_progress.id,auth.uid(),v_progress.module_id)
  on conflict(progress_id) do nothing;
  select * into v_state from public.quotation_process_training_state where progress_id=v_progress.id for update;

  select count(*)::int into v_count from public.training_lessons where module_id=v_progress.module_id and active=true;
  if v_count=0 then raise exception 'Quotation Process lessons are missing.'; end if;

  select id into v_next from public.training_lessons
  where module_id=v_progress.module_id and active=true
  order by sort_order,id offset v_state.lessons_completed limit 1;

  if v_next is null then return jsonb_build_object('lessonsCompleted',v_state.lessons_completed,'lessonCount',v_count,'complete',true); end if;
  if v_next<>p_lesson_id then raise exception 'Complete Module 15 lessons in order.'; end if;

  v_done:=least(v_state.lessons_completed+1,v_count);
  v_percent:=least(70,round((v_done::numeric/greatest(v_count,1))*70)::int);
  update public.quotation_process_training_state set lessons_completed=v_done,updated_at=now() where progress_id=v_progress.id;
  update public.user_training_progress set status='In Progress',progress_percent=greatest(coalesce(progress_percent,0),v_percent),updated_at=now() where id=v_progress.id;

  return jsonb_build_object('lessonsCompleted',v_done,'lessonCount',v_count,'complete',v_done>=v_count,'progressPercent',v_percent);
end;
$$;

create or replace function public.submit_quotation_process_assessment(
  p_progress_id uuid,
  p_answers integer[],
  p_acknowledgement_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_progress public.user_training_progress%rowtype;
  v_module public.training_modules%rowtype;
  v_state public.quotation_process_training_state%rowtype;
  v_question public.training_assessment_questions%rowtype;
  v_question_count integer:=0;
  v_lesson_count integer:=0;
  v_required_ack_count integer:=0;
  v_confirmed_ack_count integer:=0;
  v_missing_prior integer:=0;
  v_index integer:=0;
  v_correct integer:=0;
  v_critical_misses integer:=0;
  v_score integer:=0;
  v_passed boolean:=false;
  v_status text;
  v_feedback jsonb:='[]'::jsonb;
  v_event_time timestamptz:=clock_timestamp();
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_progress from public.user_training_progress where id=p_progress_id and user_id=auth.uid() for update;
  if not found then raise exception 'Training progress not found.'; end if;

  select * into v_module from public.training_modules where id=v_progress.module_id and slug='quotation-process' and active=true;
  if not found or not public.can_access_sales_academy_module(v_progress.module_id) then
    raise exception 'Quotation Process training access denied.';
  end if;
  if v_module.requires_admin_review then raise exception 'Module 15 is server-scored and must not require Admin review.'; end if;
  if v_progress.status in ('Passed','Completed') then raise exception 'Module 15 is already certified.'; end if;

  select count(*) into v_missing_prior
  from public.training_modules m
  where m.active=true and m.required=true and m.sort_order<v_module.sort_order
    and not exists(
      select 1 from public.user_training_progress p
      where p.user_id=auth.uid() and p.module_id=m.id and p.status in ('Passed','Completed')
    );
  if v_missing_prior>0 then raise exception 'Complete all previous required Academy modules before submitting Module 15.'; end if;

  select * into v_state from public.quotation_process_training_state where progress_id=v_progress.id for update;
  select count(*)::int into v_lesson_count from public.training_lessons where module_id=v_module.id and active=true;
  if v_lesson_count=0 or coalesce(v_state.lessons_completed,0)<v_lesson_count then
    raise exception 'Complete all Module 15 lessons before the Quotation Process assessment.';
  end if;

  select count(*)::int into v_question_count from public.training_assessment_questions where module_id=v_module.id and active=true;
  if v_question_count=0 then raise exception 'No active Module 15 assessment questions are configured.'; end if;
  if coalesce(array_length(p_answers,1),0)<>v_question_count then
    raise exception 'Exactly % assessment answers are required.',v_question_count;
  end if;

  select count(*)::int into v_required_ack_count
  from public.training_acknowledgements where module_id=v_module.id and active=true and required=true;
  select count(distinct a.id)::int into v_confirmed_ack_count
  from public.training_acknowledgements a
  join unnest(coalesce(p_acknowledgement_ids,array[]::uuid[])) supplied(id) on supplied.id=a.id
  where a.module_id=v_module.id and a.active=true and a.required=true;
  if v_confirmed_ack_count<>v_required_ack_count then
    raise exception 'Confirm every required Quotation Process acknowledgement before submitting.';
  end if;

  for v_question in
    select * from public.training_assessment_questions where module_id=v_module.id and active=true order by sort_order,id
  loop
    v_index:=v_index+1;
    if p_answers[v_index]<0 or p_answers[v_index]>=jsonb_array_length(v_question.options) then
      raise exception 'Assessment answer % is outside the allowed option range.',v_index;
    end if;
    if p_answers[v_index]=v_question.correct_index then
      v_correct:=v_correct+1;
    elsif coalesce(v_question.critical,false) then
      v_critical_misses:=v_critical_misses+1;
    end if;
    v_feedback:=v_feedback||jsonb_build_array(jsonb_build_object(
      'questionId',v_question.id,'sortOrder',v_question.sort_order,
      'correct',p_answers[v_index]=v_question.correct_index,
      'criticalMiss',coalesce(v_question.critical,false) and p_answers[v_index]<>v_question.correct_index,
      'explanation',v_question.explanation
    ));
  end loop;

  v_score:=round((v_correct::numeric*100)/v_question_count)::integer;
  v_passed:=v_score>=coalesce(v_module.passing_score,90) and v_critical_misses=0;
  v_status:=case when v_passed then 'Passed' else 'Retry Required' end;

  perform set_config('profox.training_quiz_rpc','1',true);
  perform set_config('profox.training_quotation_rpc','1',true);

  insert into public.training_assignments(user_id,module_id,progress_id,submission_data,created_at,updated_at)
  values(auth.uid(),v_module.id,v_progress.id,jsonb_build_object(
    'type','quotation_process_assessment_v1',
    'answers',to_jsonb(p_answers),
    'acknowledgementIds',to_jsonb(coalesce(p_acknowledgement_ids,array[]::uuid[])),
    'score',v_score,'passed',v_passed,'criticalMisses',v_critical_misses,
    'feedback',v_feedback,'submittedAt',v_event_time
  ),v_event_time,v_event_time);

  update public.user_training_progress
  set status=v_status,score=v_score,
      progress_percent=case when v_passed then 100 else 75 end,
      completed_at=case when v_passed then v_event_time else null end,
      updated_at=v_event_time
  where id=v_progress.id;

  perform set_config('profox.training_quotation_rpc','',true);
  perform set_config('profox.training_quiz_rpc','',true);

  return jsonb_build_object(
    'score',v_score,'passed',v_passed,'status',v_status,
    'passingScore',coalesce(v_module.passing_score,90),
    'criticalMisses',v_critical_misses,'feedback',v_feedback
  );
exception when others then
  perform set_config('profox.training_quotation_rpc','',true);
  perform set_config('profox.training_quiz_rpc','',true);
  raise;
end;
$$;

revoke all on function public.get_quotation_process_training_config(uuid) from public,anon;
revoke all on function public.complete_quotation_process_lesson(uuid,uuid) from public,anon;
revoke all on function public.submit_quotation_process_assessment(uuid,integer[],uuid[]) from public,anon;
grant execute on function public.get_quotation_process_training_config(uuid) to authenticated;
grant execute on function public.complete_quotation_process_lesson(uuid,uuid) to authenticated;
grant execute on function public.submit_quotation_process_assessment(uuid,integer[],uuid[]) to authenticated;

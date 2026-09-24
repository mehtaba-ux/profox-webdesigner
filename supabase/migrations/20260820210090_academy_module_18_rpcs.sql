-- Module 18 — secure learner config, sequential lessons/missions, and server-scored certification.

create or replace function public.get_calendar_training_config(p_module_id uuid)
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
  v_state public.calendar_training_state%rowtype;
  v_lesson_count integer:=0;
  v_mission_count integer:=0;
  v_missions jsonb:='[]'::jsonb;
  v_questions jsonb:='[]'::jsonb;
  v_acknowledgements jsonb:='[]'::jsonb;
  v_latest jsonb;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_module from public.training_modules where id=p_module_id and slug='calendar-setup' and active=true;
  if not found then raise exception 'Calendar / Meeting Setup module not found.'; end if;
  if not public.can_access_sales_academy_module(p_module_id) then raise exception 'Training module access denied.'; end if;

  select * into v_progress from public.user_training_progress where user_id=v_user and module_id=p_module_id;
  if found then
    select * into v_state from public.calendar_training_state where progress_id=v_progress.id;
    select submission_data into v_latest
    from public.training_assignments
    where user_id=v_user and module_id=p_module_id and progress_id=v_progress.id
      and submission_data->>'type'='calendar_training_assessment_v1'
    order by created_at desc,id desc limit 1;
  end if;

  select count(*)::int into v_lesson_count from public.training_lessons where module_id=p_module_id and active=true;
  select count(*)::int into v_mission_count from public.calendar_training_missions where module_id=p_module_id and active=true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'missionKey',m.mission_key,'title',m.title,'objective',m.objective,
    'instructions',m.instructions,
    'scenarioData',m.scenario_data - 'expectedDecision' - 'expectedAction' - 'minimumActionLength',
    'sortOrder',m.sort_order
  ) order by m.sort_order),'[]'::jsonb)
  into v_missions
  from public.calendar_training_missions m where m.module_id=p_module_id and m.active=true;

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
    'framework','PROTECT → OFFER → CONFIRM → PREPARE → MEET → CAPTURE → ADVANCE',
    'principle','Your calendar should create selling time, not consume it.',
    'passingScore',coalesce(v_module.passing_score,90),
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
      'capacity','Protect prospecting, follow-up, preparation and CRM time before filling optional meeting availability.',
      'timezone','Meeting time and buyer-facing timezone must represent the same real moment. Never guess or hide a timezone mistake.',
      'preparation','Review the existing CRM context and define the meeting objective before the buyer arrives; capture the outcome and next action immediately afterward.',
      'trainingIsolation','Module 18 practice uses synthetic calendar state only and never creates, reschedules, cancels or completes production customer meetings.'
    )
  );
end;
$$;

create or replace function public.complete_calendar_training_lesson(p_progress_id uuid,p_lesson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_progress public.user_training_progress%rowtype;
  v_state public.calendar_training_state%rowtype;
  v_next uuid;
  v_count integer;
  v_done integer;
  v_percent integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_progress from public.user_training_progress where id=p_progress_id and user_id=auth.uid() for update;
  if not found then raise exception 'Training progress not found.'; end if;
  if not exists(select 1 from public.training_modules where id=v_progress.module_id and slug='calendar-setup' and active=true)
     or not public.can_access_sales_academy_module(v_progress.module_id) then
    raise exception 'Calendar Training access denied.';
  end if;
  if v_progress.status in ('Passed','Completed') then return jsonb_build_object('complete',true,'certified',true); end if;

  insert into public.calendar_training_state(progress_id,user_id,module_id)
  values(v_progress.id,auth.uid(),v_progress.module_id)
  on conflict(progress_id) do nothing;
  select * into v_state from public.calendar_training_state where progress_id=v_progress.id for update;

  select count(*)::int into v_count from public.training_lessons where module_id=v_progress.module_id and active=true;
  if v_count=0 then raise exception 'Calendar Training lessons are missing.'; end if;

  select id into v_next from public.training_lessons
  where module_id=v_progress.module_id and active=true
  order by sort_order,id offset v_state.lessons_completed limit 1;

  if v_next is null then return jsonb_build_object('lessonsCompleted',v_state.lessons_completed,'lessonCount',v_count,'complete',true); end if;
  if v_next<>p_lesson_id then raise exception 'Complete Module 18 lessons in order.'; end if;

  v_done:=least(v_state.lessons_completed+1,v_count);
  v_percent:=least(45,round((v_done::numeric/greatest(v_count,1))*45)::int);
  update public.calendar_training_state set lessons_completed=v_done,updated_at=now() where progress_id=v_progress.id;
  update public.user_training_progress set status='In Progress',progress_percent=greatest(coalesce(progress_percent,0),v_percent),updated_at=now() where id=v_progress.id;

  return jsonb_build_object('lessonsCompleted',v_done,'lessonCount',v_count,'complete',v_done>=v_count,'progressPercent',v_percent);
end;
$$;

create or replace function public.submit_calendar_training_mission(
  p_progress_id uuid,
  p_mission_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_progress public.user_training_progress%rowtype;
  v_state public.calendar_training_state%rowtype;
  v_mission public.calendar_training_missions%rowtype;
  v_next uuid;
  v_lesson_count integer:=0;
  v_mission_count integer:=0;
  v_done integer:=0;
  v_percent integer:=0;
  v_snapshot jsonb:='{}'::jsonb;
  v_event_time timestamptz:=clock_timestamp();
  v_start timestamptz;
  v_end timestamptz;
  v_due timestamptz;
  v_work_start time;
  v_work_end time;
  v_duration integer;
  v_buffer_before integer;
  v_buffer_after integer;
  v_back_to_back integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Mission payload must be an object.'; end if;

  select * into v_progress from public.user_training_progress where id=p_progress_id and user_id=auth.uid() for update;
  if not found then raise exception 'Training progress not found.'; end if;
  if not exists(select 1 from public.training_modules where id=v_progress.module_id and slug='calendar-setup' and active=true)
     or not public.can_access_sales_academy_module(v_progress.module_id) then
    raise exception 'Calendar Training access denied.';
  end if;
  if v_progress.status in ('Passed','Completed') then raise exception 'Module 18 is already certified.'; end if;

  insert into public.calendar_training_state(progress_id,user_id,module_id)
  values(v_progress.id,auth.uid(),v_progress.module_id)
  on conflict(progress_id) do nothing;
  select * into v_state from public.calendar_training_state where progress_id=v_progress.id for update;

  select count(*)::int into v_lesson_count from public.training_lessons where module_id=v_progress.module_id and active=true;
  if v_lesson_count=0 or v_state.lessons_completed<v_lesson_count then
    raise exception 'Complete all Module 18 lessons before starting calendar sandbox missions.';
  end if;

  select count(*)::int into v_mission_count from public.calendar_training_missions where module_id=v_progress.module_id and active=true;
  if v_mission_count=0 then raise exception 'Calendar sandbox missions are missing.'; end if;

  select id into v_next from public.calendar_training_missions
  where module_id=v_progress.module_id and active=true
  order by sort_order,id offset v_state.missions_completed limit 1;
  if v_next is null then return jsonb_build_object('missionsCompleted',v_state.missions_completed,'missionCount',v_mission_count,'complete',true,'sandboxSnapshot',v_state.sandbox_snapshot); end if;
  if v_next<>p_mission_id then raise exception 'Complete Module 18 calendar missions in order.'; end if;

  select * into v_mission from public.calendar_training_missions where id=p_mission_id and module_id=v_progress.module_id and active=true;
  if not found then raise exception 'Calendar training mission not found.'; end if;
  v_snapshot:=coalesce(v_state.sandbox_snapshot,'{}'::jsonb);

  case v_mission.mission_key
    when 'configure_availability' then
      begin
        v_work_start:=(p_payload->>'workStart')::time;
        v_work_end:=(p_payload->>'workEnd')::time;
      exception when others then raise exception 'Enter valid working start and end times.'; end;
      if nullif(btrim(p_payload->>'timezone'),'') is null
         or nullif(btrim(p_payload->>'workingDays'),'') is null
         or v_work_start>=v_work_end
         or coalesce(p_payload->>'active','')<>'true' then
        raise exception 'Configure a real timezone, working days, valid daytime range and active availability.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{availability}',p_payload||jsonb_build_object('synthetic',true),true);

    when 'build_high_performance_day' then
      if char_length(btrim(coalesce(p_payload->>'prospectingBlock','')))<4
         or char_length(btrim(coalesce(p_payload->>'followUpBlock','')))<4
         or char_length(btrim(coalesce(p_payload->>'meetingWindow','')))<4
         or char_length(btrim(coalesce(p_payload->>'crmBlock','')))<4
         or char_length(btrim(coalesce(p_payload->>'priorityRule','')))<20 then
        raise exception 'Protect prospecting, follow-up, meeting and CRM blocks and explain the priority rule.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{dayPlan}',p_payload||jsonb_build_object('synthetic',true),true);

    when 'configure_capacity' then
      begin
        v_duration:=(p_payload->>'defaultDurationMinutes')::integer;
        v_buffer_before:=(p_payload->>'bufferBeforeMinutes')::integer;
        v_buffer_after:=(p_payload->>'bufferAfterMinutes')::integer;
        v_back_to_back:=(p_payload->>'maxBackToBack')::integer;
      exception when others then raise exception 'Enter valid numeric duration, buffer and capacity values.'; end;
      if v_duration not in (15,30,45,60)
         or v_buffer_before<0 or v_buffer_before>60
         or v_buffer_after<0 or v_buffer_after>60
         or v_back_to_back<1 or v_back_to_back>4 then
        raise exception 'Use an approved duration, reasonable buffers and sustainable back-to-back capacity.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{capacity}',p_payload||jsonb_build_object('synthetic',true),true);

    when 'international_discovery' then
      begin
        v_start:=(p_payload->>'startAt')::timestamptz;
        v_end:=(p_payload->>'endAt')::timestamptz;
      exception when others then raise exception 'Enter valid future meeting start and end times.'; end;
      if v_start<=v_event_time or v_end<=v_start
         or p_payload->>'meetingType'<>v_mission.scenario_data->>'meetingType'
         or p_payload->>'buyerTimezone'<>v_mission.scenario_data->>'buyerTimezone'
         or char_length(btrim(coalesce(p_payload->>'confirmedBuyerTime','')))<8 then
        raise exception 'Schedule the supplied international discovery meeting with valid timing, buyer timezone and explicit buyer-facing confirmation.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{internationalMeeting}',p_payload||jsonb_build_object('synthetic',true),true);

    when 'complete_invite' then
      if char_length(btrim(coalesce(p_payload->>'title','')))<12
         or p_payload->>'attendeeName'<>v_mission.scenario_data->>'attendeeName'
         or lower(p_payload->>'attendeeEmail')<>lower(v_mission.scenario_data->>'attendeeEmail')
         or right(lower(coalesce(p_payload->>'attendeeEmail','')),5)<>'.test'
         or p_payload->>'meetingType'<>v_mission.scenario_data->>'meetingType'
         or nullif(btrim(p_payload->>'platform'),'') is null
         or char_length(btrim(coalesce(p_payload->>'purpose','')))<20 then
        raise exception 'Create the complete synthetic invite using the supplied attendee, meeting purpose and safe test identity.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{invitation}',p_payload||jsonb_build_object('synthetic',true),true);

    when 'prepare_meeting_brief' then
      if char_length(btrim(coalesce(p_payload->>'accountContext','')))<25
         or char_length(btrim(coalesce(p_payload->>'objective','')))<15
         or char_length(btrim(coalesce(p_payload->>'knownFacts','')))<20
         or char_length(btrim(coalesce(p_payload->>'unknowns','')))<15
         or char_length(btrim(coalesce(p_payload->>'desiredOutcome','')))<15 then
        raise exception 'Prepare a useful brief with context, objective, known facts, important unknowns and desired outcome.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{meetingBrief}',p_payload||jsonb_build_object('synthetic',true),true);

    when 'mutual_next_step' then
      begin v_due:=(p_payload->>'dueAt')::timestamptz; exception when others then raise exception 'Enter a valid future next-step date and time.'; end;
      if v_due<=v_event_time
         or char_length(btrim(coalesce(p_payload->>'action','')))<15
         or nullif(btrim(p_payload->>'owner'),'') is null
         or char_length(btrim(coalesce(p_payload->>'expectedOutcome','')))<15 then
        raise exception 'The next step must contain a specific action, owner, future date and expected outcome.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{nextStep}',p_payload||jsonb_build_object('synthetic',true),true);

    when 'reschedule_existing' then
      begin
        v_start:=(p_payload->>'newStartAt')::timestamptz;
        v_end:=(p_payload->>'newEndAt')::timestamptz;
      exception when others then raise exception 'Enter valid future reschedule times.'; end;
      if p_payload->>'decision'<>v_mission.scenario_data->>'expectedDecision'
         or v_start<=v_event_time or v_end<=v_start
         or char_length(btrim(coalesce(p_payload->>'buyerConfirmation','')))<15 then
        raise exception 'Reschedule the existing synthetic meeting with valid future timing and buyer confirmation; do not create a duplicate.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{reschedule}',p_payload||jsonb_build_object('meetingReference',v_mission.scenario_data->>'existingMeeting','synthetic',true),true);

    when 'no_show_recovery' then
      if p_payload->>'outcome'<>'No-Show'
         or p_payload->>'action'<>v_mission.scenario_data->>'expectedAction'
         or char_length(btrim(coalesce(p_payload->>'message','')))<25 then
        raise exception 'Record the truthful No-Show outcome and one professional recovery action with a useful reschedule message.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{noShowRecovery}',p_payload||jsonb_build_object('synthetic',true),true);

    when 'weekly_calendar_audit' then
      if char_length(btrim(coalesce(p_payload->>'protectedBlocks','')))<15
         or char_length(btrim(coalesce(p_payload->>'capacityRisk','')))<15
         or char_length(btrim(coalesce(p_payload->>'meetingQualityRisk','')))<15
         or char_length(btrim(coalesce(p_payload->>'nextWeekImprovement','')))<15 then
        raise exception 'Complete the weekly audit with protected blocks, capacity risk, meeting-quality risk and a concrete improvement.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{weeklyAudit}',p_payload||jsonb_build_object('synthetic',true),true);

    else
      raise exception 'Unsupported Calendar Training mission configuration.';
  end case;

  v_done:=least(v_state.missions_completed+1,v_mission_count);
  v_percent:=least(80,45+round((v_done::numeric/greatest(v_mission_count,1))*35)::int);

  perform set_config('profox.training_calendar_rpc','1',true);
  update public.calendar_training_state
  set missions_completed=v_done,sandbox_snapshot=v_snapshot,updated_at=v_event_time
  where progress_id=v_progress.id;

  insert into public.training_assignments(user_id,module_id,progress_id,submission_data,created_at,updated_at)
  values(auth.uid(),v_progress.module_id,v_progress.id,jsonb_build_object(
    'type','calendar_training_mission_v1','missionId',v_mission.id,'missionKey',v_mission.mission_key,
    'missionOrder',v_mission.sort_order,'payload',p_payload,'completedAt',v_event_time
  ),v_event_time,v_event_time);

  update public.user_training_progress
  set status='In Progress',progress_percent=greatest(coalesce(progress_percent,0),v_percent),updated_at=v_event_time
  where id=v_progress.id;
  perform set_config('profox.training_calendar_rpc','',true);

  return jsonb_build_object('missionsCompleted',v_done,'missionCount',v_mission_count,'complete',v_done>=v_mission_count,'progressPercent',v_percent,'sandboxSnapshot',v_snapshot);
exception when others then
  perform set_config('profox.training_calendar_rpc','',true);
  raise;
end;
$$;

create or replace function public.submit_calendar_training_assessment(
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
  v_state public.calendar_training_state%rowtype;
  v_question public.training_assessment_questions%rowtype;
  v_question_count integer:=0;
  v_lesson_count integer:=0;
  v_mission_count integer:=0;
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

  select * into v_module from public.training_modules where id=v_progress.module_id and slug='calendar-setup' and active=true;
  if not found or not public.can_access_sales_academy_module(v_progress.module_id) then raise exception 'Calendar Training access denied.'; end if;
  if v_module.requires_admin_review then raise exception 'Module 18 is server-scored and must not require Admin review.'; end if;
  if v_progress.status in ('Passed','Completed') then raise exception 'Module 18 is already certified.'; end if;

  select count(*) into v_missing_prior
  from public.training_modules m
  where m.active=true and m.required=true and m.sort_order<v_module.sort_order
    and not exists(
      select 1 from public.user_training_progress p
      where p.user_id=auth.uid() and p.module_id=m.id and p.status in ('Passed','Completed')
    );
  if v_missing_prior>0 then raise exception 'Complete all previous required Academy modules before submitting Module 18.'; end if;

  select * into v_state from public.calendar_training_state where progress_id=v_progress.id for update;
  select count(*)::int into v_lesson_count from public.training_lessons where module_id=v_module.id and active=true;
  select count(*)::int into v_mission_count from public.calendar_training_missions where module_id=v_module.id and active=true;
  if v_lesson_count=0 or coalesce(v_state.lessons_completed,0)<v_lesson_count then raise exception 'Complete all Module 18 lessons before certification.'; end if;
  if v_mission_count=0 or coalesce(v_state.missions_completed,0)<v_mission_count then raise exception 'Complete all Module 18 synthetic calendar missions before certification.'; end if;

  select count(*)::int into v_question_count from public.training_assessment_questions where module_id=v_module.id and active=true;
  if v_question_count=0 then raise exception 'No active Module 18 certification questions are configured.'; end if;
  if coalesce(array_length(p_answers,1),0)<>v_question_count then raise exception 'Exactly % assessment answers are required.',v_question_count; end if;

  select count(*)::int into v_required_ack_count
  from public.training_acknowledgements where module_id=v_module.id and active=true and required=true;
  select count(distinct a.id)::int into v_confirmed_ack_count
  from public.training_acknowledgements a
  join unnest(coalesce(p_acknowledgement_ids,array[]::uuid[])) supplied(id) on supplied.id=a.id
  where a.module_id=v_module.id and a.active=true and a.required=true;
  if v_confirmed_ack_count<>v_required_ack_count then raise exception 'Confirm every required Calendar Training acknowledgement before submitting.'; end if;

  for v_question in
    select * from public.training_assessment_questions where module_id=v_module.id and active=true order by sort_order,id
  loop
    v_index:=v_index+1;
    if p_answers[v_index]<0 or p_answers[v_index]>=jsonb_array_length(v_question.options) then raise exception 'Assessment answer % is outside the allowed option range.',v_index; end if;
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
  perform set_config('profox.training_calendar_rpc','1',true);

  insert into public.training_assignments(user_id,module_id,progress_id,submission_data,created_at,updated_at)
  values(auth.uid(),v_module.id,v_progress.id,jsonb_build_object(
    'type','calendar_training_assessment_v1','answers',to_jsonb(p_answers),
    'acknowledgementIds',to_jsonb(coalesce(p_acknowledgement_ids,array[]::uuid[])),
    'score',v_score,'passed',v_passed,'criticalMisses',v_critical_misses,
    'feedback',v_feedback,'submittedAt',v_event_time
  ),v_event_time,v_event_time);

  update public.user_training_progress
  set status=v_status,score=v_score,
      progress_percent=case when v_passed then 100 else 85 end,
      completed_at=case when v_passed then v_event_time else null end,
      updated_at=v_event_time
  where id=v_progress.id;

  perform set_config('profox.training_calendar_rpc','',true);
  perform set_config('profox.training_quiz_rpc','',true);

  return jsonb_build_object('score',v_score,'passed',v_passed,'status',v_status,
    'passingScore',coalesce(v_module.passing_score,90),'criticalMisses',v_critical_misses,'feedback',v_feedback);
exception when others then
  perform set_config('profox.training_calendar_rpc','',true);
  perform set_config('profox.training_quiz_rpc','',true);
  raise;
end;
$$;

revoke all on function public.get_calendar_training_config(uuid) from public,anon;
revoke all on function public.complete_calendar_training_lesson(uuid,uuid) from public,anon;
revoke all on function public.submit_calendar_training_mission(uuid,uuid,jsonb) from public,anon;
revoke all on function public.submit_calendar_training_assessment(uuid,integer[],uuid[]) from public,anon;
grant execute on function public.get_calendar_training_config(uuid) to authenticated;
grant execute on function public.complete_calendar_training_lesson(uuid,uuid) to authenticated;
grant execute on function public.submit_calendar_training_mission(uuid,uuid,jsonb) to authenticated;
grant execute on function public.submit_calendar_training_assessment(uuid,integer[],uuid[]) to authenticated;

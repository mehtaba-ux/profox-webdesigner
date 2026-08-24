-- Module 17 — secure config, sequential lessons, synthetic missions and server-scored certification.

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
    'instructions',m.instructions,'scenarioData',m.scenario_data,'sortOrder',m.sort_order
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

create or replace function public.complete_crm_training_lesson(p_progress_id uuid,p_lesson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_progress public.user_training_progress%rowtype;
  v_state public.crm_training_state%rowtype;
  v_next uuid;
  v_count integer;
  v_done integer;
  v_percent integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_progress from public.user_training_progress where id=p_progress_id and user_id=auth.uid() for update;
  if not found then raise exception 'Training progress not found.'; end if;
  if not exists(select 1 from public.training_modules where id=v_progress.module_id and slug='crm-training' and active=true)
     or not public.can_access_sales_academy_module(v_progress.module_id) then
    raise exception 'CRM Training access denied.';
  end if;
  if v_progress.status in ('Passed','Completed') then return jsonb_build_object('complete',true,'certified',true); end if;

  insert into public.crm_training_state(progress_id,user_id,module_id)
  values(v_progress.id,auth.uid(),v_progress.module_id)
  on conflict(progress_id) do nothing;
  select * into v_state from public.crm_training_state where progress_id=v_progress.id for update;

  select count(*)::int into v_count from public.training_lessons where module_id=v_progress.module_id and active=true;
  if v_count=0 then raise exception 'CRM Training lessons are missing.'; end if;

  select id into v_next from public.training_lessons
  where module_id=v_progress.module_id and active=true
  order by sort_order,id offset v_state.lessons_completed limit 1;

  if v_next is null then return jsonb_build_object('lessonsCompleted',v_state.lessons_completed,'lessonCount',v_count,'complete',true); end if;
  if v_next<>p_lesson_id then raise exception 'Complete Module 17 lessons in order.'; end if;

  v_done:=least(v_state.lessons_completed+1,v_count);
  v_percent:=least(45,round((v_done::numeric/greatest(v_count,1))*45)::int);
  update public.crm_training_state set lessons_completed=v_done,updated_at=now() where progress_id=v_progress.id;
  update public.user_training_progress set status='In Progress',progress_percent=greatest(coalesce(progress_percent,0),v_percent),updated_at=now() where id=v_progress.id;

  return jsonb_build_object('lessonsCompleted',v_done,'lessonCount',v_count,'complete',v_done>=v_count,'progressPercent',v_percent);
end;
$$;

create or replace function public.submit_crm_training_mission(
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
  v_state public.crm_training_state%rowtype;
  v_mission public.crm_training_missions%rowtype;
  v_next uuid;
  v_lesson_count integer:=0;
  v_mission_count integer:=0;
  v_done integer:=0;
  v_percent integer:=0;
  v_snapshot jsonb:='{}'::jsonb;
  v_due timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_min_note integer:=40;
  v_event_time timestamptz:=clock_timestamp();
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Mission payload must be an object.'; end if;

  select * into v_progress from public.user_training_progress where id=p_progress_id and user_id=auth.uid() for update;
  if not found then raise exception 'Training progress not found.'; end if;
  if not exists(select 1 from public.training_modules where id=v_progress.module_id and slug='crm-training' and active=true)
     or not public.can_access_sales_academy_module(v_progress.module_id) then
    raise exception 'CRM Training access denied.';
  end if;
  if v_progress.status in ('Passed','Completed') then raise exception 'Module 17 is already certified.'; end if;

  insert into public.crm_training_state(progress_id,user_id,module_id)
  values(v_progress.id,auth.uid(),v_progress.module_id)
  on conflict(progress_id) do nothing;
  select * into v_state from public.crm_training_state where progress_id=v_progress.id for update;

  select count(*)::int into v_lesson_count from public.training_lessons where module_id=v_progress.module_id and active=true;
  if v_lesson_count=0 or v_state.lessons_completed<v_lesson_count then
    raise exception 'Complete all Module 17 lessons before starting CRM sandbox missions.';
  end if;

  select count(*)::int into v_mission_count from public.crm_training_missions where module_id=v_progress.module_id and active=true;
  if v_mission_count=0 then raise exception 'CRM sandbox missions are missing.'; end if;

  select id into v_next from public.crm_training_missions
  where module_id=v_progress.module_id and active=true
  order by sort_order,id offset v_state.missions_completed limit 1;
  if v_next is null then return jsonb_build_object('missionsCompleted',v_state.missions_completed,'missionCount',v_mission_count,'complete',true,'sandboxSnapshot',v_state.sandbox_snapshot); end if;
  if v_next<>p_mission_id then raise exception 'Complete Module 17 CRM missions in order.'; end if;

  select * into v_mission from public.crm_training_missions where id=p_mission_id and module_id=v_progress.module_id and active=true;
  if not found then raise exception 'CRM training mission not found.'; end if;
  v_snapshot:=coalesce(v_state.sandbox_snapshot,'{}'::jsonb);

  case v_mission.mission_key
    when 'create_lead' then
      if nullif(btrim(p_payload->>'companyName'),'') is null
         or nullif(btrim(p_payload->>'contactName'),'') is null
         or nullif(btrim(p_payload->>'email'),'') is null
         or nullif(btrim(p_payload->>'country'),'') is null
         or nullif(btrim(p_payload->>'source'),'') is null
         or nullif(btrim(p_payload->>'serviceInterest'),'') is null then
        raise exception 'Complete the required synthetic lead fields.';
      end if;
      if p_payload->>'companyName'<>v_mission.scenario_data->>'companyName'
         or lower(p_payload->>'email')<>lower(v_mission.scenario_data->>'email')
         or right(lower(p_payload->>'email'),5)<>'.test' then
        raise exception 'Use only the supplied synthetic prospect data for this mission.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{lead}',p_payload||jsonb_build_object('status','New','synthetic',true),true);

    when 'record_research' then
      v_min_note:=coalesce((v_mission.scenario_data->>'minimumNoteLength')::int,40);
      if nullif(btrim(p_payload->>'industry'),'') is null
         or char_length(btrim(coalesce(p_payload->>'researchNote','')))<v_min_note
         or char_length(btrim(coalesce(p_payload->>'observedProblem','')))<15
         or nullif(btrim(p_payload->>'unknowns'),'') is null then
        raise exception 'Research must include industry, a specific observed problem, explicit unknowns and a useful factual note.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{research}',p_payload,true);
      v_snapshot:=jsonb_set(v_snapshot,'{lead,status}',to_jsonb('Researching'::text),true);

    when 'log_outreach' then
      if p_payload->>'channel'<>v_mission.scenario_data->>'channel'
         or p_payload->>'activityType'<>v_mission.scenario_data->>'activityType'
         or char_length(btrim(coalesce(p_payload->>'subject','')))<8
         or char_length(btrim(coalesce(p_payload->>'notes','')))<20 then
        raise exception 'Log the actual synthetic outreach channel/type with a useful subject and note.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{outreachActivity}',p_payload||jsonb_build_object('status','Completed','synthetic',true),true);
      v_snapshot:=jsonb_set(v_snapshot,'{lead,status}',to_jsonb('Contacted'::text),true);

    when 'schedule_follow_up' then
      begin v_due:=(p_payload->>'dueAt')::timestamptz; exception when others then raise exception 'Enter a valid follow-up date and time.'; end;
      if v_due<=v_event_time or p_payload->>'leadStatus'<>'Follow-Up'
         or char_length(btrim(coalesce(p_payload->>'purpose','')))<15 then
        raise exception 'The follow-up must be a future owned action with truthful Follow-Up status and a clear purpose.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{followUp}',p_payload||jsonb_build_object('status','Scheduled','synthetic',true),true);
      v_snapshot:=jsonb_set(v_snapshot,'{lead,status}',to_jsonb('Follow-Up'::text),true);

    when 'qualify_convert' then
      if coalesce((p_payload->>'qualified')::boolean,false) is not true
         or char_length(btrim(coalesce(p_payload->>'qualificationReason','')))<30
         or nullif(btrim(p_payload->>'opportunityName'),'') is null then
        raise exception 'Document the qualification evidence and opportunity name before conversion.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{lead,status}',to_jsonb('Qualified'::text),true);
      v_snapshot:=jsonb_set(v_snapshot,'{opportunity}',jsonb_build_object(
        'name',p_payload->>'opportunityName','stage','Qualified','status','Open','synthetic',true,
        'source',coalesce(v_snapshot#>>'{lead,source}',''),'companyName',coalesce(v_snapshot#>>'{lead,companyName}',''),
        'qualificationReason',p_payload->>'qualificationReason'
      ),true);

    when 'record_discovery' then
      if char_length(btrim(coalesce(p_payload->>'problem','')))<15
         or char_length(btrim(coalesce(p_payload->>'desiredOutcome','')))<15
         or char_length(btrim(coalesce(p_payload->>'requirements','')))<20
         or char_length(btrim(coalesce(p_payload->>'decisionMakers','')))<10
         or char_length(btrim(coalesce(p_payload->>'timeline','')))<8
         or char_length(btrim(coalesce(p_payload->>'nextStep','')))<15 then
        raise exception 'Record complete discovery context: problem, outcome, requirements, decision-makers, timeline and next step.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{discovery}',p_payload,true);
      v_snapshot:=jsonb_set(v_snapshot,'{opportunity,stage}',to_jsonb('Requirements Confirmed'::text),true);
      v_snapshot:=jsonb_set(v_snapshot,'{opportunity,requirementsSummary}',to_jsonb(p_payload->>'requirements'),true);

    when 'schedule_meeting' then
      begin
        v_start:=(p_payload->>'startAt')::timestamptz;
        v_end:=(p_payload->>'endAt')::timestamptz;
      exception when others then raise exception 'Enter valid meeting start and end times.'; end;
      if v_start<=v_event_time or v_end<=v_start
         or p_payload->>'meetingType'<>v_mission.scenario_data->>'meetingType'
         or nullif(btrim(p_payload->>'timezone'),'') is null
         or nullif(btrim(p_payload->>'attendeeName'),'') is null
         or nullif(btrim(p_payload->>'attendeeEmail'),'') is null then
        raise exception 'Schedule the supplied synthetic meeting with future timing, valid duration, attendee and timezone.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{meeting}',p_payload||jsonb_build_object('status','Scheduled','provider','Manual','synthetic',true),true);

    when 'advance_pipeline' then
      if p_payload->>'stage'<>v_mission.scenario_data->>'expectedStage'
         or char_length(btrim(coalesce(p_payload->>'nextAction','')))<15 then
        raise exception 'Choose the stage earned by the evidence and record a clear next action.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{opportunity,stage}',to_jsonb(p_payload->>'stage'),true);
      v_snapshot:=jsonb_set(v_snapshot,'{opportunity,nextAction}',to_jsonb(p_payload->>'nextAction'),true);

    when 'record_objection' then
      if char_length(btrim(coalesce(p_payload->>'concern','')))<15
         or char_length(btrim(coalesce(p_payload->>'responseBoundary','')))<20
         or char_length(btrim(coalesce(p_payload->>'nextStep','')))<15 then
        raise exception 'Record the buyer concern, approved response boundary and exact next step.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{objection}',p_payload,true);

    when 'record_quotation' then
      if p_payload->>'quotationReference'<>v_mission.scenario_data->>'quotationReference'
         or p_payload->>'stage'<>'Quotation Sent'
         or char_length(btrim(coalesce(p_payload->>'followUpPurpose','')))<15 then
        raise exception 'Record the supplied synthetic quotation reference, Quotation Sent stage and a real follow-up purpose.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{quotation}',jsonb_build_object('reference',p_payload->>'quotationReference','status','Sent','synthetic',true),true);
      v_snapshot:=jsonb_set(v_snapshot,'{opportunity,stage}',to_jsonb('Quotation Sent'::text),true);
      v_snapshot:=jsonb_set(v_snapshot,'{quotationFollowUp}',jsonb_build_object('purpose',p_payload->>'followUpPurpose','status','Scheduled','synthetic',true),true);

    when 'handle_payment_claim' then
      if p_payload->>'decision'<>v_mission.scenario_data->>'expectedDecision'
         or p_payload->>'stage'<>v_mission.scenario_data->>'expectedStage' then
        raise exception 'A customer payment claim must remain pending verification; Sales may not self-verify or mark Won.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{payment}',jsonb_build_object('customerClaimedPaid',true,'status','Pending Verification','synthetic',true),true);
      v_snapshot:=jsonb_set(v_snapshot,'{opportunity,stage}',to_jsonb('Awaiting Advance Payment'::text),true);
      v_snapshot:=jsonb_set(v_snapshot,'{opportunity,status}',to_jsonb('Open'::text),true);

    when 'verified_handoff' then
      if p_payload->>'decision'<>v_mission.scenario_data->>'expectedDecision' then
        raise exception 'Advance the synthetic handoff only after the stated protected verification event.';
      end if;
      v_snapshot:=jsonb_set(v_snapshot,'{payment,status}',to_jsonb('Verified'::text),true);
      v_snapshot:=jsonb_set(v_snapshot,'{opportunity,stage}',to_jsonb('Won'::text),true);
      v_snapshot:=jsonb_set(v_snapshot,'{opportunity,status}',to_jsonb('Won'::text),true);
      v_snapshot:=jsonb_set(v_snapshot,'{handoff}',jsonb_build_object('ready',true,'protectedVerificationObserved',true,'synthetic',true),true);

    else
      raise exception 'Unsupported CRM training mission configuration.';
  end case;

  v_done:=least(v_state.missions_completed+1,v_mission_count);
  v_percent:=least(80,45+round((v_done::numeric/greatest(v_mission_count,1))*35)::int);

  perform set_config('profox.training_crm_rpc','1',true);
  update public.crm_training_state
  set missions_completed=v_done,sandbox_snapshot=v_snapshot,updated_at=v_event_time
  where progress_id=v_progress.id;

  insert into public.training_assignments(user_id,module_id,progress_id,submission_data,created_at,updated_at)
  values(auth.uid(),v_progress.module_id,v_progress.id,jsonb_build_object(
    'type','crm_training_mission_v1','missionId',v_mission.id,'missionKey',v_mission.mission_key,
    'missionOrder',v_mission.sort_order,'payload',p_payload,'completedAt',v_event_time
  ),v_event_time,v_event_time);

  update public.user_training_progress
  set status='In Progress',progress_percent=greatest(coalesce(progress_percent,0),v_percent),updated_at=v_event_time
  where id=v_progress.id;
  perform set_config('profox.training_crm_rpc','',true);

  return jsonb_build_object('missionsCompleted',v_done,'missionCount',v_mission_count,'complete',v_done>=v_mission_count,'progressPercent',v_percent,'sandboxSnapshot',v_snapshot);
exception when others then
  perform set_config('profox.training_crm_rpc','',true);
  raise;
end;
$$;

create or replace function public.submit_crm_training_assessment(
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
  v_state public.crm_training_state%rowtype;
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

  select * into v_module from public.training_modules where id=v_progress.module_id and slug='crm-training' and active=true;
  if not found or not public.can_access_sales_academy_module(v_progress.module_id) then raise exception 'CRM Training access denied.'; end if;
  if v_module.requires_admin_review then raise exception 'Module 17 is server-scored and must not require Admin review.'; end if;
  if v_progress.status in ('Passed','Completed') then raise exception 'Module 17 is already certified.'; end if;

  select count(*) into v_missing_prior
  from public.training_modules m
  where m.active=true and m.required=true and m.sort_order<v_module.sort_order
    and not exists(
      select 1 from public.user_training_progress p
      where p.user_id=auth.uid() and p.module_id=m.id and p.status in ('Passed','Completed')
    );
  if v_missing_prior>0 then raise exception 'Complete all previous required Academy modules before submitting Module 17.'; end if;

  select * into v_state from public.crm_training_state where progress_id=v_progress.id for update;
  select count(*)::int into v_lesson_count from public.training_lessons where module_id=v_module.id and active=true;
  select count(*)::int into v_mission_count from public.crm_training_missions where module_id=v_module.id and active=true;
  if v_lesson_count=0 or coalesce(v_state.lessons_completed,0)<v_lesson_count then raise exception 'Complete all Module 17 lessons before certification.'; end if;
  if v_mission_count=0 or coalesce(v_state.missions_completed,0)<v_mission_count then raise exception 'Complete all Module 17 synthetic CRM missions before certification.'; end if;

  select count(*)::int into v_question_count from public.training_assessment_questions where module_id=v_module.id and active=true;
  if v_question_count=0 then raise exception 'No active Module 17 certification questions are configured.'; end if;
  if coalesce(array_length(p_answers,1),0)<>v_question_count then raise exception 'Exactly % assessment answers are required.',v_question_count; end if;

  select count(*)::int into v_required_ack_count
  from public.training_acknowledgements where module_id=v_module.id and active=true and required=true;
  select count(distinct a.id)::int into v_confirmed_ack_count
  from public.training_acknowledgements a
  join unnest(coalesce(p_acknowledgement_ids,array[]::uuid[])) supplied(id) on supplied.id=a.id
  where a.module_id=v_module.id and a.active=true and a.required=true;
  if v_confirmed_ack_count<>v_required_ack_count then raise exception 'Confirm every required CRM Training acknowledgement before submitting.'; end if;

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
  v_passed:=v_score>=coalesce(v_module.passing_score,85) and v_critical_misses=0;
  v_status:=case when v_passed then 'Passed' else 'Retry Required' end;

  perform set_config('profox.training_quiz_rpc','1',true);
  perform set_config('profox.training_crm_rpc','1',true);

  insert into public.training_assignments(user_id,module_id,progress_id,submission_data,created_at,updated_at)
  values(auth.uid(),v_module.id,v_progress.id,jsonb_build_object(
    'type','crm_training_assessment_v1','answers',to_jsonb(p_answers),
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

  perform set_config('profox.training_crm_rpc','',true);
  perform set_config('profox.training_quiz_rpc','',true);

  return jsonb_build_object('score',v_score,'passed',v_passed,'status',v_status,
    'passingScore',coalesce(v_module.passing_score,85),'criticalMisses',v_critical_misses,'feedback',v_feedback);
exception when others then
  perform set_config('profox.training_crm_rpc','',true);
  perform set_config('profox.training_quiz_rpc','',true);
  raise;
end;
$$;

revoke all on function public.get_crm_training_config(uuid) from public,anon;
revoke all on function public.complete_crm_training_lesson(uuid,uuid) from public,anon;
revoke all on function public.submit_crm_training_mission(uuid,uuid,jsonb) from public,anon;
revoke all on function public.submit_crm_training_assessment(uuid,integer[],uuid[]) from public,anon;
grant execute on function public.get_crm_training_config(uuid) to authenticated;
grant execute on function public.complete_crm_training_lesson(uuid,uuid) to authenticated;
grant execute on function public.submit_crm_training_mission(uuid,uuid,jsonb) to authenticated;
grant execute on function public.submit_crm_training_assessment(uuid,integer[],uuid[]) to authenticated;

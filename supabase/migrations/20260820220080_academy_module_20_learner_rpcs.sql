-- Module 20 — secure learner config, sequential briefings/missions, judgment scoring and self-assessment.

create or replace function public.create_final_certification_live_session(p_trainee_id uuid,p_progress_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_module public.training_modules%rowtype; v_case public.final_certification_cases%rowtype; v_attempt int; v_rubric jsonb; v_critical jsonb; v_rubric_total int; v_session uuid; begin
 select * into v_module from public.training_modules where slug='final-certification' and active=true;
 if not found then raise exception 'Final Certification module is unavailable.'; end if;
 if not exists(select 1 from public.user_training_progress where id=p_progress_id and user_id=p_trainee_id and module_id=v_module.id) then raise exception 'Final Certification progress is invalid.'; end if;
 select count(*)::int,coalesce(sum(max_points),0)::int into v_attempt,v_rubric_total from public.final_certification_rubric_items where active=true;
 if v_attempt<>10 or v_rubric_total<>100 then raise exception 'Final Certification live rubric must contain 10 active items totaling exactly 100 points.'; end if;
 if (select count(*) from public.final_certification_critical_rules where active=true)<>15 then raise exception 'Final Certification requires exactly 15 active critical rules.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'maxPoints',max_points,'sortOrder',sort_order) order by sort_order),'[]'::jsonb) into v_rubric from public.final_certification_rubric_items where active=true;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'sortOrder',sort_order) order by sort_order),'[]'::jsonb) into v_critical from public.final_certification_critical_rules where active=true;
 select coalesce(max(attempt_no),0)+1 into v_attempt from public.final_certification_sessions where trainee_id=p_trainee_id;
 select * into v_case from public.final_certification_cases c where c.active=true and not exists(select 1 from public.final_certification_sessions s where s.trainee_id=p_trainee_id and s.case_id=c.id) order by random()*c.weight desc limit 1;
 if not found then select * into v_case from public.final_certification_cases where active=true order by random()*weight desc limit 1; end if;
 if not found then raise exception 'No active Final Certification buyer case is configured.'; end if;
 insert into public.final_certification_sessions(trainee_id,module_id,progress_id,attempt_no,case_id,case_name_snapshot,case_version_snapshot,seller_brief_snapshot,evaluator_brief_snapshot,rounds_snapshot,evaluator_instructions_snapshot,rubric_snapshot,critical_rules_snapshot,status)
 values(p_trainee_id,v_module.id,p_progress_id,v_attempt,v_case.id,v_case.name,v_case.version,v_case.seller_brief,v_case.evaluator_brief,v_case.rounds,v_case.evaluator_instructions,v_rubric,v_critical,'pending_assignment') returning id into v_session;
 update public.final_certification_state set live_session_id=v_session,self_assessment='{}'::jsonb,updated_at=now() where progress_id=p_progress_id;
 insert into public.final_certification_events(session_id,event_type,actor_user_id,event_data) values(v_session,'session_created',auth.uid(),jsonb_build_object('attemptNo',v_attempt,'caseId',v_case.id,'caseVersion',v_case.version));
 return v_session;
end;$$;
revoke all on function public.create_final_certification_live_session(uuid,uuid) from public,anon,authenticated;

create or replace function public.get_final_certification_config(p_module_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_module public.training_modules%rowtype; v_progress public.user_training_progress%rowtype; v_state public.final_certification_state%rowtype; v_briefing_count int; v_mission_count int; v_missions jsonb; v_questions jsonb; v_acks jsonb; v_catalog jsonb; v_session jsonb; begin
 if v_user is null then raise exception 'Authentication required.'; end if;
 select * into v_module from public.training_modules where id=p_module_id and slug='final-certification' and active=true;
 if not found then raise exception 'Final Certification module not found.'; end if;
 if not public.can_access_sales_academy_module(p_module_id) then raise exception 'Final Certification access denied.'; end if;
 if exists(select 1 from public.training_modules m where m.active=true and m.required=true and m.sort_order<20 and not exists(select 1 from public.user_training_progress p where p.user_id=v_user and p.module_id=m.id and p.status in('Passed','Completed'))) then raise exception 'Complete all required Modules 1–19 before Final Certification.'; end if;
 select * into v_progress from public.user_training_progress where user_id=v_user and module_id=p_module_id;
 if found then select * into v_state from public.final_certification_state where progress_id=v_progress.id; end if;
 select count(*)::int into v_briefing_count from public.training_lessons where module_id=p_module_id and active=true;
 select count(*)::int into v_mission_count from public.final_certification_missions where module_id=p_module_id and active=true;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'missionKey',m.mission_key,'title',m.title,'objective',m.objective,'instructions',m.instructions,'scenarioData',(m.scenario_data-'expectedDecision'-'expectedMeetingType'-'expectedProductCode'-'expectedRoute'),'sortOrder',m.sort_order) order by m.sort_order),'[]'::jsonb) into v_missions from public.final_certification_missions m where m.module_id=p_module_id and m.active=true;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'options',q.options,'sortOrder',q.sort_order,'section',q.assessment_section,'caseKey',q.case_key) order by q.sort_order),'[]'::jsonb) into v_questions from public.training_assessment_questions q where q.module_id=p_module_id and q.active=true;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'statement',a.statement,'sortOrder',a.sort_order,'required',a.required) order by a.sort_order),'[]'::jsonb) into v_acks from public.training_acknowledgements a where a.module_id=p_module_id and a.active=true;
 select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'category',category,'productType',product_type,'priceMode',price_mode,'basePrice',base_price,'currency',currency,'managerApprovalRequired',coalesce(manager_approval_required,false),'standardPaymentTerms',standard_payment_terms,'paymentSchedule',payment_schedule) order by sort_order,code),'[]'::jsonb) into v_catalog from public.sales_products where active=true;
 if v_state.live_session_id is not null then
   select jsonb_build_object('id',s.id,'attemptNo',s.attempt_no,'caseName',s.case_name_snapshot,'sellerBrief',s.seller_brief_snapshot,'status',s.status,'evaluatorName',u.full_name,'scheduledStartAt',s.scheduled_start_at,'scheduledEndAt',s.scheduled_end_at,'meetingUrl',s.meeting_url,'score',case when s.status in('passed','retry_required') then s.score else null end,'feedback',case when s.status in('passed','retry_required') then s.evaluator_feedback else null end,'selfAssessmentSubmitted',jsonb_typeof(coalesce(v_state.self_assessment,'{}'::jsonb))='object' and v_state.self_assessment<>'{}'::jsonb) into v_session
   from public.final_certification_sessions s left join public.user_profiles u on u.id=s.evaluator_id where s.id=v_state.live_session_id;
 end if;
 return jsonb_build_object('framework','THINK → EXECUTE → VERIFY → ADVANCE → PROTECT → HANDOFF','principle','A ProFox Sales Representative can execute the full sales process accurately, ethically, independently and consistently under pressure.','passingScore',coalesce(v_module.passing_score,90),'briefingCount',v_briefing_count,'briefingsCompleted',coalesce(v_state.briefings_completed,0),'missionCount',v_mission_count,'missionsCompleted',coalesce(v_state.missions_completed,0),'missions',v_missions,'salesCatalog',v_catalog,'sandboxSnapshot',coalesce(v_state.sandbox_snapshot,'{}'::jsonb),'questions',v_questions,'acknowledgements',v_acks,'judgmentPassed',coalesce(v_state.judgment_passed,false),'judgmentScore',v_state.judgment_score,'judgmentCriticalMisses',v_state.judgment_critical_misses,'liveSession',v_session,'operatingStandard',jsonb_build_object('execution','Research and qualify intelligently; diagnose before recommending; handle resistance and close with clarity.','commercialTruth','Scope, pricing, quotation, payment and Won state follow the live approved system—not seller pressure or memory.','operationalTruth','CRM, meetings and next actions must tell the truth and allow another authorized teammate to continue without guessing.','activation','Passing Module 20 creates Sales Academy Certified status only. Final Approval and secure production activation remain separate.'));
end;$$;

create or replace function public.complete_final_certification_briefing(p_progress_id uuid,p_lesson_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_progress public.user_training_progress%rowtype; v_state public.final_certification_state%rowtype; v_next uuid; v_count int; v_done int; v_percent int; begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 select * into v_progress from public.user_training_progress where id=p_progress_id and user_id=auth.uid() for update; if not found then raise exception 'Training progress not found.'; end if;
 if not exists(select 1 from public.training_modules where id=v_progress.module_id and slug='final-certification' and active=true) or not public.can_access_sales_academy_module(v_progress.module_id) then raise exception 'Final Certification access denied.'; end if;
 if exists(select 1 from public.training_modules m where m.active=true and m.required=true and m.sort_order<20 and not exists(select 1 from public.user_training_progress p where p.user_id=auth.uid() and p.module_id=m.id and p.status in('Passed','Completed'))) then raise exception 'Complete all required Modules 1–19 before Final Certification.'; end if;
 if v_progress.status in('Passed','Completed') then return jsonb_build_object('complete',true,'certified',true); end if;
 insert into public.final_certification_state(progress_id,user_id,module_id) values(v_progress.id,auth.uid(),v_progress.module_id) on conflict(progress_id) do nothing;
 select * into v_state from public.final_certification_state where progress_id=v_progress.id for update;
 select count(*)::int into v_count from public.training_lessons where module_id=v_progress.module_id and active=true; if v_count<>10 then raise exception 'Final Certification requires exactly 10 active briefings.'; end if;
 select id into v_next from public.training_lessons where module_id=v_progress.module_id and active=true order by sort_order,id offset v_state.briefings_completed limit 1;
 if v_next is null then return jsonb_build_object('briefingsCompleted',v_state.briefings_completed,'briefingCount',v_count,'complete',true); end if;
 if v_next<>p_lesson_id then raise exception 'Complete Final Certification briefings in order.'; end if;
 v_done:=v_state.briefings_completed+1; v_percent:=round((v_done::numeric/v_count)*20)::int;
 update public.final_certification_state set briefings_completed=v_done,updated_at=now() where progress_id=v_progress.id;
 update public.user_training_progress set status='In Progress',progress_percent=greatest(coalesce(progress_percent,0),v_percent),updated_at=now() where id=v_progress.id;
 return jsonb_build_object('briefingsCompleted',v_done,'briefingCount',v_count,'complete',v_done>=v_count,'progressPercent',v_percent);
end;$$;

create or replace function public.submit_final_certification_mission(p_progress_id uuid,p_mission_id uuid,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_progress public.user_training_progress%rowtype; v_state public.final_certification_state%rowtype; v_mission public.final_certification_missions%rowtype; v_next uuid; v_count int; v_done int; v_percent int; v_snapshot jsonb; v_expected text; v_expected_route text; v_product public.sales_products%rowtype; v_previous_product text; v_prev_final text:=coalesce(current_setting('profox.training_final_certification_rpc',true),''); begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if; if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Mission payload must be an object.'; end if;
 select * into v_progress from public.user_training_progress where id=p_progress_id and user_id=auth.uid() for update; if not found then raise exception 'Training progress not found.'; end if;
 if not exists(select 1 from public.training_modules where id=v_progress.module_id and slug='final-certification' and active=true) or not public.can_access_sales_academy_module(v_progress.module_id) then raise exception 'Final Certification access denied.'; end if;
 if v_progress.status in('Passed','Completed') then raise exception 'Final Certification is already passed.'; end if;
 insert into public.final_certification_state(progress_id,user_id,module_id) values(v_progress.id,auth.uid(),v_progress.module_id) on conflict(progress_id) do nothing; select * into v_state from public.final_certification_state where progress_id=v_progress.id for update;
 if v_state.briefings_completed<>10 then raise exception 'Complete all 10 certification briefings before the end-to-end deal.'; end if;
 select count(*)::int into v_count from public.final_certification_missions where module_id=v_progress.module_id and active=true; if v_count<>12 then raise exception 'Final Certification requires exactly 12 active deal missions.'; end if;
 select id into v_next from public.final_certification_missions where module_id=v_progress.module_id and active=true order by sort_order,id offset v_state.missions_completed limit 1; if v_next is null then return jsonb_build_object('missionsCompleted',v_state.missions_completed,'missionCount',v_count,'complete',true,'sandboxSnapshot',v_state.sandbox_snapshot); end if; if v_next<>p_mission_id then raise exception 'Complete the Final Certification deal missions in order.'; end if;
 select * into v_mission from public.final_certification_missions where id=p_mission_id and module_id=v_progress.module_id and active=true; if not found then raise exception 'Capstone mission not found.'; end if;
 case v_mission.mission_key
  when 'research_account' then if char_length(btrim(coalesce(p_payload->>'businessFacts','')))<30 or char_length(btrim(coalesce(p_payload->>'personalization','')))<20 or char_length(btrim(coalesce(p_payload->>'unknowns','')))<20 or char_length(btrim(coalesce(p_payload->>'assumptionsToAvoid','')))<20 then raise exception 'Separate verified facts, useful personalization, unknowns and assumptions clearly.'; end if;
  when 'qualify_prospect' then if p_payload->>'decision'<>v_mission.scenario_data->>'expectedDecision' or char_length(btrim(coalesce(p_payload->>'rationale','')))<30 then raise exception 'Use evidence to make and explain the correct qualification decision.'; end if;
  when 'personalized_outreach' then if char_length(btrim(coalesce(p_payload->>'observation','')))<20 or char_length(btrim(coalesce(p_payload->>'relevance','')))<20 or char_length(btrim(coalesce(p_payload->>'value','')))<20 or char_length(btrim(coalesce(p_payload->>'cta','')))<10 then raise exception 'Build complete observation → relevance → value → low-friction CTA outreach.'; end if;
  when 'handle_reply_book' then if p_payload->>'meetingType'<>v_mission.scenario_data->>'expectedMeetingType' or p_payload->>'buyerTimezone'<>v_mission.scenario_data->>'buyerTimezone' or char_length(btrim(coalesce(p_payload->>'reply','')))<40 or char_length(btrim(coalesce(p_payload->>'nextAction','')))<25 then raise exception 'Respond without overpitching and create the correct timezone-safe Discovery next step.'; end if;
  when 'prepare_discovery' then if char_length(btrim(coalesce(p_payload->>'known','')))<25 or char_length(btrim(coalesce(p_payload->>'unknowns','')))<25 or char_length(btrim(coalesce(p_payload->>'questions','')))<30 or char_length(btrim(coalesce(p_payload->>'objective','')))<20 or char_length(btrim(coalesce(p_payload->>'desiredNextStep','')))<20 then raise exception 'Prepare a complete discovery brief before the conversation.'; end if;
  when 'conduct_discovery' then if exists(select 1 from unnest(array['current','gap','impact','outcome','whyNow','decisionProcess','fit','nextStep']) k where char_length(btrim(coalesce(p_payload->>k,'')))<20) then raise exception 'Capture every discovery dimension with decision-useful detail.'; end if;
  when 'recommend_solution' then v_expected:=v_mission.scenario_data->>'expectedProductCode'; select * into v_product from public.sales_products where code=v_expected and active=true; if not found then raise exception 'This certification case references an inactive catalog product. Admin must reconfigure the expected live-catalog direction.'; end if; if p_payload->>'productCode'<>v_expected or char_length(btrim(coalesce(p_payload->>'rationale','')))<40 then raise exception 'Choose the evidence-based current catalog direction and explain the fit/validation boundary.'; end if;
  when 'handle_objection' then if exists(select 1 from unnest(array['clarify','validate','isolate','respond','confirm','nextStep']) k where char_length(btrim(coalesce(p_payload->>k,'')))<15) then raise exception 'Apply the complete objection-handling sequence before advancing.'; end if;
  when 'close_real_decision' then if p_payload->>'decision'<>v_mission.scenario_data->>'expectedDecision' or char_length(btrim(coalesce(p_payload->>'commitment','')))<30 then raise exception 'Secure the legitimate decision-maker step instead of inventing a close.'; end if;
  when 'commercial_path' then
    v_expected:=v_mission.scenario_data->>'expectedProductCode';
    v_previous_product:=v_state.sandbox_snapshot#>>'{recommend_solution,productCode}';
    select * into v_product from public.sales_products where code=v_expected and active=true;
    if not found then raise exception 'The expected commercial product is inactive. Admin must update the case.'; end if;
    if p_payload->>'productCode'<>v_expected or p_payload->>'productCode' is distinct from v_previous_product then raise exception 'Commercial path must match the evidence-based live-catalog recommendation.'; end if;
    v_expected_route:=case when coalesce(v_product.manager_approval_required,false) or v_product.price_mode='custom' then 'manager_review' else 'catalog_auto' end;
    if p_payload->>'route'<>v_expected_route then raise exception 'Use the approval route required by the live catalog and actual commercial promise.'; end if;
    if v_product.standard_payment_terms is not null and btrim(coalesce(p_payload->>'paymentTerms',''))<>btrim(v_product.standard_payment_terms) then raise exception 'State the current standard payment terms exactly from the live catalog.'; end if;
  when 'payment_judgment' then if p_payload->>'decision'<>v_mission.scenario_data->>'expectedDecision' or char_length(btrim(coalesce(p_payload->>'customerResponse','')))<30 then raise exception 'Customer evidence is information; protected ProFox verification controls financial truth.'; end if;
  when 'final_crm_handoff' then if exists(select 1 from unnest(array['companyContact','leadSourceStage','commercialState','nextAction','handoffSummary']) k where char_length(btrim(coalesce(p_payload->>k,'')))<25) then raise exception 'Leave a complete truthful CRM/handoff record another authorized teammate can continue from.'; end if;
  else raise exception 'Mission validation is not configured.';
 end case;
 v_snapshot:=jsonb_set(coalesce(v_state.sandbox_snapshot,'{}'::jsonb),array[v_mission.mission_key],p_payload||jsonb_build_object('synthetic',true,'verifiedAt',now()),true); v_done:=v_state.missions_completed+1; v_percent:=20+round((v_done::numeric/v_count)*35)::int;
 perform set_config('profox.training_final_certification_rpc','1',true);
 update public.final_certification_state set missions_completed=v_done,sandbox_snapshot=v_snapshot,updated_at=now() where progress_id=v_progress.id;
 update public.user_training_progress set status='In Progress',progress_percent=greatest(coalesce(progress_percent,0),v_percent),updated_at=now() where id=v_progress.id;
 insert into public.training_assignments(user_id,module_id,progress_id,submission_data) values(auth.uid(),v_progress.module_id,v_progress.id,jsonb_build_object('type','final_certification_mission_v1','missionKey',v_mission.mission_key,'missionOrder',v_mission.sort_order,'verified',true,'synthetic',true,'submittedAt',now()));
 perform set_config('profox.training_final_certification_rpc',v_prev_final,true);
 return jsonb_build_object('missionsCompleted',v_done,'missionCount',v_count,'complete',v_done>=v_count,'progressPercent',v_percent,'sandboxSnapshot',v_snapshot);
end;$$;

create or replace function public.submit_final_certification_judgment(p_progress_id uuid,p_answers integer[],p_acknowledgement_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_progress public.user_training_progress%rowtype; v_state public.final_certification_state%rowtype; v_module public.training_modules%rowtype; v_q record; v_total int; v_correct int:=0; v_critical int:=0; v_score int; v_pass boolean; v_feedback jsonb:='[]'::jsonb; v_idx int:=0; v_required int; v_supplied int; v_session uuid; v_prev_final text:=coalesce(current_setting('profox.training_final_certification_rpc',true),''); v_prev_quiz text:=coalesce(current_setting('profox.training_quiz_rpc',true),''); begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if; select * into v_progress from public.user_training_progress where id=p_progress_id and user_id=auth.uid() for update; if not found then raise exception 'Training progress not found.'; end if; select * into v_module from public.training_modules where id=v_progress.module_id and slug='final-certification' and active=true; if not found or not public.can_access_sales_academy_module(v_progress.module_id) then raise exception 'Final Certification access denied.'; end if;
 select * into v_state from public.final_certification_state where progress_id=v_progress.id for update; if not found or v_state.briefings_completed<>10 or v_state.missions_completed<>12 then raise exception 'Complete all 10 briefings and 12 deal missions before the final judgment gate.'; end if;
 select count(*)::int into v_total from public.training_assessment_questions where module_id=v_progress.module_id and active=true; if v_total<>30 or coalesce(array_length(p_answers,1),0)<>30 then raise exception 'Final Certification requires exactly 30 judgment answers.'; end if;
 select count(*)::int into v_required from public.training_acknowledgements where module_id=v_progress.module_id and active=true and required=true; if v_required<>8 then raise exception 'Final Certification requires exactly 8 operating commitments.'; end if;
 select count(distinct x)::int into v_supplied from unnest(coalesce(p_acknowledgement_ids,array[]::uuid[])) x join public.training_acknowledgements a on a.id=x and a.module_id=v_progress.module_id and a.active=true and a.required=true; if v_supplied<>v_required then raise exception 'Confirm all eight final operating commitments.'; end if;
 for v_q in select id,sort_order,correct_index,explanation,critical from public.training_assessment_questions where module_id=v_progress.module_id and active=true order by sort_order,id loop v_idx:=v_idx+1; if p_answers[v_idx]=v_q.correct_index then v_correct:=v_correct+1; elsif coalesce(v_q.critical,false) then v_critical:=v_critical+1; end if; v_feedback:=v_feedback||jsonb_build_array(jsonb_build_object('questionId',v_q.id,'sortOrder',v_q.sort_order,'correct',p_answers[v_idx]=v_q.correct_index,'criticalMiss',p_answers[v_idx]<>v_q.correct_index and coalesce(v_q.critical,false),'explanation',v_q.explanation)); end loop;
 v_score:=round((v_correct::numeric/v_total)*100)::int; v_pass:=v_score>=coalesce(v_module.passing_score,90) and v_critical=0;
 perform set_config('profox.training_final_certification_rpc','1',true); perform set_config('profox.training_quiz_rpc','1',true);
 update public.final_certification_state set judgment_passed=v_pass,judgment_score=v_score,judgment_critical_misses=v_critical,updated_at=now() where progress_id=v_progress.id;
 update public.user_training_progress set status=case when v_pass then 'Submitted' else 'Retry Required' end,progress_percent=case when v_pass then 80 else 65 end,score=v_score,attempts=coalesce(attempts,0)+1,completed_at=null,updated_at=now() where id=v_progress.id;
 insert into public.training_assignments(user_id,module_id,progress_id,submission_data) values(auth.uid(),v_progress.module_id,v_progress.id,jsonb_build_object('type','final_certification_judgment_v1','score',v_score,'passed',v_pass,'criticalMisses',v_critical,'feedback',v_feedback,'submittedAt',now()));
 if v_pass then v_session:=public.create_final_certification_live_session(auth.uid(),v_progress.id); end if;
 perform set_config('profox.training_quiz_rpc',v_prev_quiz,true); perform set_config('profox.training_final_certification_rpc',v_prev_final,true);
 return jsonb_build_object('score',v_score,'passed',v_pass,'status',case when v_pass then 'Submitted' else 'Retry Required' end,'passingScore',coalesce(v_module.passing_score,90),'criticalMisses',v_critical,'feedback',v_feedback,'liveSessionId',v_session);
end;$$;

create or replace function public.submit_final_certification_self_assessment(p_progress_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_progress public.user_training_progress%rowtype; v_state public.final_certification_state%rowtype; v_session public.final_certification_sessions%rowtype; v_key text; v_prev text:=coalesce(current_setting('profox.training_final_certification_rpc',true),''); begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if; if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Self-assessment must be an object.'; end if;
 select * into v_progress from public.user_training_progress where id=p_progress_id and user_id=auth.uid() for update; if not found then raise exception 'Training progress not found.'; end if; select * into v_state from public.final_certification_state where progress_id=v_progress.id for update; if not found or not v_state.judgment_passed or v_state.live_session_id is null then raise exception 'Pass the judgment gate and complete the live simulation before self-assessment.'; end if; select * into v_session from public.final_certification_sessions where id=v_state.live_session_id and trainee_id=auth.uid() for update; if not found or v_session.status<>'awaiting_self_assessment' then raise exception 'Your live simulation is not currently awaiting self-assessment.'; end if;
 foreach v_key in array array['strengths','clarityLoss','missedSignal','differentNextTime','developmentPriority'] loop if char_length(btrim(coalesce(p_payload->>v_key,'')))<20 then raise exception 'Give a thoughtful response to every self-assessment prompt.'; end if; end loop;
 perform set_config('profox.training_final_certification_rpc','1',true); update public.final_certification_state set self_assessment=p_payload||jsonb_build_object('submittedAt',now()),updated_at=now() where progress_id=v_progress.id; update public.final_certification_sessions set status='awaiting_evaluation',updated_at=now() where id=v_session.id; insert into public.training_assignments(user_id,module_id,progress_id,submission_data) values(auth.uid(),v_progress.module_id,v_progress.id,jsonb_build_object('type','final_certification_self_assessment_v1','sessionId',v_session.id,'submittedAt',now())); insert into public.final_certification_events(session_id,event_type,actor_user_id,event_data) values(v_session.id,'self_assessment_submitted',auth.uid(),'{}'::jsonb); perform set_config('profox.training_final_certification_rpc',v_prev,true); return jsonb_build_object('submitted',true,'sessionStatus','awaiting_evaluation');
end;$$;

revoke all on function public.get_final_certification_config(uuid) from public,anon;
revoke all on function public.complete_final_certification_briefing(uuid,uuid) from public,anon;
revoke all on function public.submit_final_certification_mission(uuid,uuid,jsonb) from public,anon;
revoke all on function public.submit_final_certification_judgment(uuid,integer[],uuid[]) from public,anon;
revoke all on function public.submit_final_certification_self_assessment(uuid,jsonb) from public,anon;
grant execute on function public.get_final_certification_config(uuid) to authenticated;
grant execute on function public.complete_final_certification_briefing(uuid,uuid) to authenticated;
grant execute on function public.submit_final_certification_mission(uuid,uuid,jsonb) to authenticated;
grant execute on function public.submit_final_certification_judgment(uuid,integer[],uuid[]) to authenticated;
grant execute on function public.submit_final_certification_self_assessment(uuid,jsonb) to authenticated;

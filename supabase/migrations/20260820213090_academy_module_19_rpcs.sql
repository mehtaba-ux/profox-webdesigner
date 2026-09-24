-- Module 19 — secure learner config, sequential lessons/missions, server-scored certification.

create or replace function public.get_confidentiality_training_config(p_module_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
 v_user uuid:=auth.uid(); v_module public.training_modules%rowtype; v_progress public.user_training_progress%rowtype; v_state public.confidentiality_training_state%rowtype;
 v_lesson_count int:=0; v_mission_count int:=0; v_missions jsonb:='[]'::jsonb; v_questions jsonb:='[]'::jsonb; v_acks jsonb:='[]'::jsonb; v_latest jsonb;
begin
 if v_user is null then raise exception 'Authentication required.'; end if;
 select * into v_module from public.training_modules where id=p_module_id and slug='confidentiality-data-protection' and active=true;
 if not found then raise exception 'Confidentiality & Data Protection module not found.'; end if;
 if not public.can_access_sales_academy_module(p_module_id) then raise exception 'Training module access denied.'; end if;
 select * into v_progress from public.user_training_progress where user_id=v_user and module_id=p_module_id;
 if found then
   select * into v_state from public.confidentiality_training_state where progress_id=v_progress.id;
   select submission_data into v_latest from public.training_assignments where user_id=v_user and module_id=p_module_id and progress_id=v_progress.id and submission_data->>'type'='confidentiality_training_assessment_v1' order by created_at desc,id desc limit 1;
 end if;
 select count(*)::int into v_lesson_count from public.training_lessons where module_id=p_module_id and active=true;
 select count(*)::int into v_mission_count from public.confidentiality_training_missions where module_id=p_module_id and active=true;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'missionKey',m.mission_key,'title',m.title,'objective',m.objective,'instructions',m.instructions,'scenarioData',m.scenario_data,'sortOrder',m.sort_order) order by m.sort_order),'[]'::jsonb) into v_missions from public.confidentiality_training_missions m where m.module_id=p_module_id and m.active=true;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'options',q.options,'sortOrder',q.sort_order,'section',q.assessment_section,'caseKey',q.case_key) order by q.sort_order),'[]'::jsonb) into v_questions from public.training_assessment_questions q where q.module_id=p_module_id and q.active=true;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'statement',a.statement,'sortOrder',a.sort_order,'required',a.required) order by a.sort_order),'[]'::jsonb) into v_acks from public.training_acknowledgements a where a.module_id=p_module_id and a.active=true;
 return jsonb_build_object(
  'framework','CLASSIFY → MINIMIZE → VERIFY → PROTECT → SHARE → RECORD → REPORT',
  'principle','Use only what you need. Access only what you need. Share only where authorized. Report anything suspicious immediately.',
  'passingScore',coalesce(v_module.passing_score,90),'lessonCount',v_lesson_count,'lessonsCompleted',coalesce(v_state.lessons_completed,0),'missionCount',v_mission_count,'missionsCompleted',coalesce(v_state.missions_completed,0),'missions',v_missions,'sandboxSnapshot',coalesce(v_state.sandbox_snapshot,'{}'::jsonb),'questions',v_questions,'acknowledgements',v_acks,'latestAttempt',v_latest,
  'operatingStandard',jsonb_build_object(
    'minimize','Collect and retain only decision-useful information required for the legitimate sales/customer process.',
    'access','Use your own authorized account and only the records/systems required for your role.',
    'sharing','Verify recipient, file, permission and approved channel before sharing confidential information.',
    'incident','STOP → PROTECT → REPORT → PRESERVE → FOLLOW. Never conceal a suspected security or privacy incident.',
    'trainingIsolation','Module 19 practice uses synthetic information only and never requires real customer data, passwords, OTPs, API keys, exports or live incidents.'
  ));
end;$$;

create or replace function public.complete_confidentiality_training_lesson(p_progress_id uuid,p_lesson_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_progress public.user_training_progress%rowtype; v_state public.confidentiality_training_state%rowtype; v_next uuid; v_count int; v_done int; v_percent int;
begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 select * into v_progress from public.user_training_progress where id=p_progress_id and user_id=auth.uid() for update;
 if not found then raise exception 'Training progress not found.'; end if;
 if not exists(select 1 from public.training_modules where id=v_progress.module_id and slug='confidentiality-data-protection' and active=true) or not public.can_access_sales_academy_module(v_progress.module_id) then raise exception 'Module 19 access denied.'; end if;
 if exists(select 1 from public.training_modules m where m.required=true and m.active=true and m.sort_order<19 and not exists(select 1 from public.user_training_progress p where p.user_id=auth.uid() and p.module_id=m.id and p.status in('Passed','Completed'))) then raise exception 'Complete all required earlier Academy modules before Module 19.'; end if;
 if v_progress.status in('Passed','Completed') then return jsonb_build_object('complete',true,'certified',true); end if;
 insert into public.confidentiality_training_state(progress_id,user_id,module_id) values(v_progress.id,auth.uid(),v_progress.module_id) on conflict(progress_id) do nothing;
 select * into v_state from public.confidentiality_training_state where progress_id=v_progress.id for update;
 select count(*)::int into v_count from public.training_lessons where module_id=v_progress.module_id and active=true;
 if v_count<>20 then raise exception 'Module 19 requires exactly 20 active lessons.'; end if;
 select id into v_next from public.training_lessons where module_id=v_progress.module_id and active=true order by sort_order,id offset v_state.lessons_completed limit 1;
 if v_next is null then return jsonb_build_object('lessonsCompleted',v_state.lessons_completed,'lessonCount',v_count,'complete',true); end if;
 if v_next<>p_lesson_id then raise exception 'Complete Module 19 lessons in order.'; end if;
 v_done:=least(v_state.lessons_completed+1,v_count); v_percent:=least(45,round((v_done::numeric/v_count)*45)::int);
 perform set_config('profox.training_confidentiality_rpc','1',true);
 update public.confidentiality_training_state set lessons_completed=v_done,updated_at=now() where progress_id=v_progress.id;
 update public.user_training_progress set status='In Progress',progress_percent=greatest(coalesce(progress_percent,0),v_percent),updated_at=now() where id=v_progress.id;
 return jsonb_build_object('lessonsCompleted',v_done,'lessonCount',v_count,'complete',v_done>=v_count,'progressPercent',v_percent);
end;$$;

create or replace function public.submit_confidentiality_training_mission(p_progress_id uuid,p_mission_id uuid,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_progress public.user_training_progress%rowtype; v_state public.confidentiality_training_state%rowtype; v_mission public.confidentiality_training_missions%rowtype; v_next uuid; v_lesson_count int; v_mission_count int; v_done int; v_percent int; v_expected text; v_decision text:=coalesce(p_payload->>'decision',''); v_notes text:=btrim(coalesce(p_payload->>'notes','')); v_snapshot jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Mission payload must be an object.'; end if;
 select * into v_progress from public.user_training_progress where id=p_progress_id and user_id=auth.uid() for update;
 if not found then raise exception 'Training progress not found.'; end if;
 if not exists(select 1 from public.training_modules where id=v_progress.module_id and slug='confidentiality-data-protection' and active=true) or not public.can_access_sales_academy_module(v_progress.module_id) then raise exception 'Module 19 access denied.'; end if;
 if v_progress.status in('Passed','Completed') then raise exception 'Module 19 is already certified.'; end if;
 insert into public.confidentiality_training_state(progress_id,user_id,module_id) values(v_progress.id,auth.uid(),v_progress.module_id) on conflict(progress_id) do nothing;
 select * into v_state from public.confidentiality_training_state where progress_id=v_progress.id for update;
 select count(*)::int into v_lesson_count from public.training_lessons where module_id=v_progress.module_id and active=true;
 if v_lesson_count<>20 or v_state.lessons_completed<20 then raise exception 'Complete all 20 Module 19 lessons before security missions.'; end if;
 select count(*)::int into v_mission_count from public.confidentiality_training_missions where module_id=v_progress.module_id and active=true;
 if v_mission_count<>10 then raise exception 'Module 19 requires exactly 10 active security missions.'; end if;
 select id into v_next from public.confidentiality_training_missions where module_id=v_progress.module_id and active=true order by sort_order,id offset v_state.missions_completed limit 1;
 if v_next is null then return jsonb_build_object('missionsCompleted',v_state.missions_completed,'missionCount',v_mission_count,'complete',true,'sandboxSnapshot',v_state.sandbox_snapshot); end if;
 if v_next<>p_mission_id then raise exception 'Complete Module 19 security missions in order.'; end if;
 select * into v_mission from public.confidentiality_training_missions where id=p_mission_id and module_id=v_progress.module_id and active=true;
 v_expected:=case v_mission.mission_key
   when 'classify_information' then 'classify_by_sensitivity'
   when 'minimize_record' then 'keep_decision_useful_only'
   when 'spot_phishing' then 'verify_and_report'
   when 'unexpected_mfa' then 'deny_secure_report'
   when 'dangerous_share' then 'fix_recipient_file_channel'
   when 'safe_screen_share' then 'share_only_required_window'
   when 'safe_crm_note' then 'remove_secrets_keep_business_context'
   when 'public_prospect_data' then 'approved_outreach_only'
   when 'safe_ai_use' then 'approved_ai_minimized_context'
   when 'incident_response' then 'stop_protect_report_preserve_follow'
   else null end;
 if v_expected is null then raise exception 'Mission validation is not configured.'; end if;
 if v_decision<>v_expected then raise exception 'That action does not meet the ProFox confidentiality/security standard. Review the scenario and choose the safest authorized response.'; end if;
 if char_length(v_notes)<15 then raise exception 'Briefly explain why the chosen action protects trust and business operations.'; end if;
 v_snapshot:=jsonb_set(coalesce(v_state.sandbox_snapshot,'{}'::jsonb),array[v_mission.mission_key],jsonb_build_object('decision',v_decision,'notes',v_notes,'synthetic',true,'verifiedAt',now()),true);
 v_done:=v_state.missions_completed+1; v_percent:=45+round((v_done::numeric/v_mission_count)*35)::int;
 perform set_config('profox.training_confidentiality_rpc','1',true);
 update public.confidentiality_training_state set missions_completed=v_done,sandbox_snapshot=v_snapshot,updated_at=now() where progress_id=v_progress.id;
 update public.user_training_progress set status='In Progress',progress_percent=greatest(coalesce(progress_percent,0),v_percent),updated_at=now() where id=v_progress.id;
 insert into public.training_assignments(user_id,module_id,progress_id,submission_data) values(auth.uid(),v_progress.module_id,v_progress.id,jsonb_build_object('type','confidentiality_training_mission_v1','missionKey',v_mission.mission_key,'missionOrder',v_mission.sort_order,'verified',true,'synthetic',true,'submittedAt',now()));
 return jsonb_build_object('missionsCompleted',v_done,'missionCount',v_mission_count,'complete',v_done>=v_mission_count,'progressPercent',v_percent,'sandboxSnapshot',v_snapshot);
end;$$;

create or replace function public.submit_confidentiality_training_assessment(p_progress_id uuid,p_answers integer[],p_acknowledgement_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_progress public.user_training_progress%rowtype; v_state public.confidentiality_training_state%rowtype; v_module public.training_modules%rowtype; v_q record; v_total int:=0; v_correct int:=0; v_critical_misses int:=0; v_score int:=0; v_passed boolean:=false; v_feedback jsonb:='[]'::jsonb; v_required_ack_count int:=0; v_supplied_ack_count int:=0; v_idx int:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 select * into v_progress from public.user_training_progress where id=p_progress_id and user_id=auth.uid() for update;
 if not found then raise exception 'Training progress not found.'; end if;
 select * into v_module from public.training_modules where id=v_progress.module_id and slug='confidentiality-data-protection' and active=true;
 if not found or not public.can_access_sales_academy_module(v_progress.module_id) then raise exception 'Module 19 access denied.'; end if;
 if v_progress.status in('Passed','Completed') then raise exception 'Module 19 is already certified.'; end if;
 select * into v_state from public.confidentiality_training_state where progress_id=v_progress.id for update;
 if not found or v_state.lessons_completed<>20 or v_state.missions_completed<>10 then raise exception 'Complete all 20 lessons and all 10 security missions before certification.'; end if;
 select count(*)::int into v_total from public.training_assessment_questions where module_id=v_progress.module_id and active=true;
 if v_total<>20 or coalesce(array_length(p_answers,1),0)<>20 then raise exception 'Module 19 requires answers to exactly 20 active scenarios.'; end if;
 select count(*)::int into v_required_ack_count from public.training_acknowledgements where module_id=v_progress.module_id and active=true and required=true;
 if v_required_ack_count<>7 then raise exception 'Module 19 requires exactly 7 active acknowledgements.'; end if;
 select count(distinct x)::int into v_supplied_ack_count from unnest(coalesce(p_acknowledgement_ids,array[]::uuid[])) x join public.training_acknowledgements a on a.id=x and a.module_id=v_progress.module_id and a.active=true and a.required=true;
 if v_supplied_ack_count<>v_required_ack_count then raise exception 'Confirm all required confidentiality acknowledgements.'; end if;
 v_total:=0;
 for v_q in select id,sort_order,correct_index,explanation,critical from public.training_assessment_questions where module_id=v_progress.module_id and active=true order by sort_order,id loop
   v_idx:=v_idx+1; v_total:=v_total+1;
   if p_answers[v_idx]=v_q.correct_index then v_correct:=v_correct+1;
   else if coalesce(v_q.critical,false) then v_critical_misses:=v_critical_misses+1; end if; end if;
   v_feedback:=v_feedback||jsonb_build_array(jsonb_build_object('questionId',v_q.id,'sortOrder',v_q.sort_order,'correct',p_answers[v_idx]=v_q.correct_index,'criticalMiss',p_answers[v_idx]<>v_q.correct_index and coalesce(v_q.critical,false),'explanation',v_q.explanation));
 end loop;
 v_score:=round((v_correct::numeric/v_total)*100)::int; v_passed:=v_score>=coalesce(v_module.passing_score,90) and v_critical_misses=0;
 perform set_config('profox.training_confidentiality_rpc','1',true);
 update public.user_training_progress set status=case when v_passed then 'Passed' else 'Retry Required' end,progress_percent=case when v_passed then 100 else 80 end,score=v_score,attempts=coalesce(attempts,0)+1,completed_at=case when v_passed then now() else null end,updated_at=now() where id=v_progress.id;
 insert into public.training_assignments(user_id,module_id,progress_id,submission_data) values(auth.uid(),v_progress.module_id,v_progress.id,jsonb_build_object('type','confidentiality_training_assessment_v1','score',v_score,'passed',v_passed,'criticalMisses',v_critical_misses,'feedback',v_feedback,'submittedAt',now()));
 return jsonb_build_object('score',v_score,'passed',v_passed,'status',case when v_passed then 'Passed' else 'Retry Required' end,'passingScore',coalesce(v_module.passing_score,90),'criticalMisses',v_critical_misses,'feedback',v_feedback);
end;$$;

revoke all on function public.get_confidentiality_training_config(uuid) from public,anon;
revoke all on function public.complete_confidentiality_training_lesson(uuid,uuid) from public,anon;
revoke all on function public.submit_confidentiality_training_mission(uuid,uuid,jsonb) from public,anon;
revoke all on function public.submit_confidentiality_training_assessment(uuid,integer[],uuid[]) from public,anon;
grant execute on function public.get_confidentiality_training_config(uuid) to authenticated;
grant execute on function public.complete_confidentiality_training_lesson(uuid,uuid) to authenticated;
grant execute on function public.submit_confidentiality_training_mission(uuid,uuid,jsonb) to authenticated;
grant execute on function public.submit_confidentiality_training_assessment(uuid,integer[],uuid[]) to authenticated;

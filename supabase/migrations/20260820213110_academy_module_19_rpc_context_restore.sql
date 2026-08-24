-- Module 19 — keep secure write flags scoped to the RPC body even inside a larger DB transaction.

create or replace function public.complete_confidentiality_training_lesson(p_progress_id uuid,p_lesson_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_progress public.user_training_progress%rowtype; v_state public.confidentiality_training_state%rowtype; v_next uuid; v_count int; v_done int; v_percent int; v_prev_conf text:=coalesce(current_setting('profox.training_confidentiality_rpc',true),'');
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
 perform set_config('profox.training_confidentiality_rpc',v_prev_conf,true);
 return jsonb_build_object('lessonsCompleted',v_done,'lessonCount',v_count,'complete',v_done>=v_count,'progressPercent',v_percent);
end;$$;

create or replace function public.submit_confidentiality_training_mission(p_progress_id uuid,p_mission_id uuid,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_progress public.user_training_progress%rowtype; v_state public.confidentiality_training_state%rowtype; v_mission public.confidentiality_training_missions%rowtype; v_next uuid; v_lesson_count int; v_mission_count int; v_done int; v_percent int; v_expected text; v_decision text:=coalesce(p_payload->>'decision',''); v_notes text:=btrim(coalesce(p_payload->>'notes','')); v_snapshot jsonb; v_prev_conf text:=coalesce(current_setting('profox.training_confidentiality_rpc',true),'');
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
 v_expected:=case v_mission.mission_key when 'classify_information' then 'classify_by_sensitivity' when 'minimize_record' then 'keep_decision_useful_only' when 'spot_phishing' then 'verify_and_report' when 'unexpected_mfa' then 'deny_secure_report' when 'dangerous_share' then 'fix_recipient_file_channel' when 'safe_screen_share' then 'share_only_required_window' when 'safe_crm_note' then 'remove_secrets_keep_business_context' when 'public_prospect_data' then 'approved_outreach_only' when 'safe_ai_use' then 'approved_ai_minimized_context' when 'incident_response' then 'stop_protect_report_preserve_follow' else null end;
 if v_expected is null then raise exception 'Mission validation is not configured.'; end if;
 if v_decision<>v_expected then raise exception 'That action does not meet the ProFox confidentiality/security standard. Review the scenario and choose the safest authorized response.'; end if;
 if char_length(v_notes)<15 then raise exception 'Briefly explain why the chosen action protects trust and business operations.'; end if;
 v_snapshot:=jsonb_set(coalesce(v_state.sandbox_snapshot,'{}'::jsonb),array[v_mission.mission_key],jsonb_build_object('decision',v_decision,'notes',v_notes,'synthetic',true,'verifiedAt',now()),true);
 v_done:=v_state.missions_completed+1; v_percent:=45+round((v_done::numeric/v_mission_count)*35)::int;
 perform set_config('profox.training_confidentiality_rpc','1',true);
 update public.confidentiality_training_state set missions_completed=v_done,sandbox_snapshot=v_snapshot,updated_at=now() where progress_id=v_progress.id;
 update public.user_training_progress set status='In Progress',progress_percent=greatest(coalesce(progress_percent,0),v_percent),updated_at=now() where id=v_progress.id;
 insert into public.training_assignments(user_id,module_id,progress_id,submission_data) values(auth.uid(),v_progress.module_id,v_progress.id,jsonb_build_object('type','confidentiality_training_mission_v1','missionKey',v_mission.mission_key,'missionOrder',v_mission.sort_order,'verified',true,'synthetic',true,'submittedAt',now()));
 perform set_config('profox.training_confidentiality_rpc',v_prev_conf,true);
 return jsonb_build_object('missionsCompleted',v_done,'missionCount',v_mission_count,'complete',v_done>=v_mission_count,'progressPercent',v_percent,'sandboxSnapshot',v_snapshot);
end;$$;

create or replace function public.submit_confidentiality_training_assessment(p_progress_id uuid,p_answers integer[],p_acknowledgement_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_progress public.user_training_progress%rowtype; v_state public.confidentiality_training_state%rowtype; v_module public.training_modules%rowtype; v_q record; v_total int:=0; v_correct int:=0; v_critical_misses int:=0; v_score int:=0; v_passed boolean:=false; v_feedback jsonb:='[]'::jsonb; v_required_ack_count int:=0; v_supplied_ack_count int:=0; v_idx int:=0; v_prev_conf text:=coalesce(current_setting('profox.training_confidentiality_rpc',true),''); v_prev_quiz text:=coalesce(current_setting('profox.training_quiz_rpc',true),'');
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
   if p_answers[v_idx]=v_q.correct_index then v_correct:=v_correct+1; else if coalesce(v_q.critical,false) then v_critical_misses:=v_critical_misses+1; end if; end if;
   v_feedback:=v_feedback||jsonb_build_array(jsonb_build_object('questionId',v_q.id,'sortOrder',v_q.sort_order,'correct',p_answers[v_idx]=v_q.correct_index,'criticalMiss',p_answers[v_idx]<>v_q.correct_index and coalesce(v_q.critical,false),'explanation',v_q.explanation));
 end loop;
 v_score:=round((v_correct::numeric/v_total)*100)::int; v_passed:=v_score>=coalesce(v_module.passing_score,90) and v_critical_misses=0;
 perform set_config('profox.training_confidentiality_rpc','1',true);
 perform set_config('profox.training_quiz_rpc','1',true);
 update public.user_training_progress set status=case when v_passed then 'Passed' else 'Retry Required' end,progress_percent=case when v_passed then 100 else 80 end,score=v_score,attempts=coalesce(attempts,0)+1,completed_at=case when v_passed then now() else null end,updated_at=now() where id=v_progress.id;
 insert into public.training_assignments(user_id,module_id,progress_id,submission_data) values(auth.uid(),v_progress.module_id,v_progress.id,jsonb_build_object('type','confidentiality_training_assessment_v1','score',v_score,'passed',v_passed,'criticalMisses',v_critical_misses,'feedback',v_feedback,'submittedAt',now()));
 perform set_config('profox.training_quiz_rpc',v_prev_quiz,true);
 perform set_config('profox.training_confidentiality_rpc',v_prev_conf,true);
 return jsonb_build_object('score',v_score,'passed',v_passed,'status',case when v_passed then 'Passed' else 'Retry Required' end,'passingScore',coalesce(v_module.passing_score,90),'criticalMisses',v_critical_misses,'feedback',v_feedback);
end;$$;

revoke all on function public.complete_confidentiality_training_lesson(uuid,uuid) from public,anon;
revoke all on function public.submit_confidentiality_training_mission(uuid,uuid,jsonb) from public,anon;
revoke all on function public.submit_confidentiality_training_assessment(uuid,integer[],uuid[]) from public,anon;
grant execute on function public.complete_confidentiality_training_lesson(uuid,uuid) to authenticated;
grant execute on function public.submit_confidentiality_training_mission(uuid,uuid,jsonb) to authenticated;
grant execute on function public.submit_confidentiality_training_assessment(uuid,integer[],uuid[]) to authenticated;

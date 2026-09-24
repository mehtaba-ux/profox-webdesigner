-- Module 19 — align the server-scored certification with the existing global secure quiz score-write guard.

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
   if p_answers[v_idx]=v_q.correct_index then v_correct:=v_correct+1; else if coalesce(v_q.critical,false) then v_critical_misses:=v_critical_misses+1; end if; end if;
   v_feedback:=v_feedback||jsonb_build_array(jsonb_build_object('questionId',v_q.id,'sortOrder',v_q.sort_order,'correct',p_answers[v_idx]=v_q.correct_index,'criticalMiss',p_answers[v_idx]<>v_q.correct_index and coalesce(v_q.critical,false),'explanation',v_q.explanation));
 end loop;
 v_score:=round((v_correct::numeric/v_total)*100)::int; v_passed:=v_score>=coalesce(v_module.passing_score,90) and v_critical_misses=0;
 perform set_config('profox.training_confidentiality_rpc','1',true);
 perform set_config('profox.training_quiz_rpc','1',true);
 update public.user_training_progress set status=case when v_passed then 'Passed' else 'Retry Required' end,progress_percent=case when v_passed then 100 else 80 end,score=v_score,attempts=coalesce(attempts,0)+1,completed_at=case when v_passed then now() else null end,updated_at=now() where id=v_progress.id;
 insert into public.training_assignments(user_id,module_id,progress_id,submission_data) values(auth.uid(),v_progress.module_id,v_progress.id,jsonb_build_object('type','confidentiality_training_assessment_v1','score',v_score,'passed',v_passed,'criticalMisses',v_critical_misses,'feedback',v_feedback,'submittedAt',now()));
 return jsonb_build_object('score',v_score,'passed',v_passed,'status',case when v_passed then 'Passed' else 'Retry Required' end,'passingScore',coalesce(v_module.passing_score,90),'criticalMisses',v_critical_misses,'feedback',v_feedback);
end;$$;

revoke all on function public.submit_confidentiality_training_assessment(uuid,integer[],uuid[]) from public,anon;
grant execute on function public.submit_confidentiality_training_assessment(uuid,integer[],uuid[]) to authenticated;

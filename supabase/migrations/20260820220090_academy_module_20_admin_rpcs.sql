-- Module 20 — Management claim/schedule/live evaluation and Final Approval request gate.

create or replace function public.admin_get_final_certification_queue()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_rows jsonb; begin
 if not public.is_admin() then raise exception 'Unauthorized: Admin access required.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'traineeId',s.trainee_id,'traineeName',u.full_name,'traineeEmail',u.email,'attemptNo',s.attempt_no,'caseName',s.case_name_snapshot,'caseVersion',s.case_version_snapshot,
  'sellerBrief',s.seller_brief_snapshot,'evaluatorBrief',s.evaluator_brief_snapshot,'rounds',s.rounds_snapshot,'evaluatorInstructions',s.evaluator_instructions_snapshot,
  'rubric',s.rubric_snapshot,'criticalRules',s.critical_rules_snapshot,'evaluatorId',s.evaluator_id,'evaluatorName',ev.full_name,'scheduledStartAt',s.scheduled_start_at,'scheduledEndAt',s.scheduled_end_at,'meetingUrl',s.meeting_url,
  'status',s.status,'score',s.score,'rubricScores',s.rubric_scores,'criticalFailures',s.critical_failures,'feedback',s.evaluator_feedback,'evaluatedAt',s.evaluated_at,'createdAt',s.created_at,
  'selfAssessment',coalesce(st.self_assessment,'{}'::jsonb)
 ) order by case when s.status in('pending_assignment','assigned','scheduled','awaiting_self_assessment','awaiting_evaluation') then 0 else 1 end,s.created_at desc),'[]'::jsonb) into v_rows
 from public.final_certification_sessions s join public.user_profiles u on u.id=s.trainee_id left join public.user_profiles ev on ev.id=s.evaluator_id left join public.final_certification_state st on st.progress_id=s.progress_id
 where s.created_at>=now()-interval '365 days';
 return v_rows;
end;$$;

create or replace function public.admin_claim_final_certification_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.final_certification_sessions%rowtype; begin
 if not public.is_admin() then raise exception 'Unauthorized: Admin access required.'; end if;
 select * into v_session from public.final_certification_sessions where id=p_session_id for update; if not found then raise exception 'Final Certification session not found.'; end if;
 if v_session.status<>'pending_assignment' then raise exception 'Only pending Final Certification sessions may be claimed.'; end if;
 update public.final_certification_sessions set evaluator_id=auth.uid(),status='assigned',updated_at=now() where id=p_session_id returning * into v_session;
 insert into public.final_certification_events(session_id,event_type,actor_user_id,event_data) values(p_session_id,'admin_claimed',auth.uid(),'{}'::jsonb);
 return jsonb_build_object('sessionId',v_session.id,'status',v_session.status,'evaluatorId',v_session.evaluator_id);
end;$$;

create or replace function public.admin_schedule_final_certification_session(p_session_id uuid,p_start_at timestamptz,p_duration_minutes integer,p_meeting_url text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.final_certification_sessions%rowtype; begin
 if not public.is_admin() then raise exception 'Unauthorized: Admin access required.'; end if;
 select * into v_session from public.final_certification_sessions where id=p_session_id for update; if not found then raise exception 'Final Certification session not found.'; end if;
 if v_session.status not in('pending_assignment','assigned','scheduled') then raise exception 'This live certification session cannot be scheduled in its current state.'; end if;
 if p_duration_minutes<30 or p_duration_minutes>90 then raise exception 'Final Certification duration must be between 30 and 90 minutes.'; end if;
 if p_start_at<now()-interval '5 minutes' then raise exception 'Choose a current or future live certification time.'; end if;
 if char_length(btrim(coalesce(p_meeting_url,'')))<8 then raise exception 'A valid approved meeting URL/instruction is required.'; end if;
 update public.final_certification_sessions set evaluator_id=coalesce(evaluator_id,auth.uid()),scheduled_start_at=p_start_at,scheduled_end_at=p_start_at+make_interval(mins=>p_duration_minutes),meeting_url=btrim(p_meeting_url),status='scheduled',updated_at=now() where id=p_session_id returning * into v_session;
 insert into public.final_certification_events(session_id,event_type,actor_user_id,event_data) values(p_session_id,'scheduled',auth.uid(),jsonb_build_object('startAt',v_session.scheduled_start_at,'endAt',v_session.scheduled_end_at));
 return jsonb_build_object('sessionId',v_session.id,'status',v_session.status,'scheduledStartAt',v_session.scheduled_start_at,'scheduledEndAt',v_session.scheduled_end_at);
end;$$;

create or replace function public.admin_mark_final_certification_live_complete(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.final_certification_sessions%rowtype; begin
 if not public.is_admin() then raise exception 'Unauthorized: Admin access required.'; end if;
 select * into v_session from public.final_certification_sessions where id=p_session_id for update; if not found then raise exception 'Final Certification session not found.'; end if;
 if v_session.status<>'scheduled' then raise exception 'Only a scheduled live certification can be marked complete.'; end if;
 if v_session.evaluator_id is distinct from auth.uid() then raise exception 'Only the assigned Management evaluator may complete this session.'; end if;
 if v_session.scheduled_start_at is null or now()<v_session.scheduled_start_at-interval '5 minutes' then raise exception 'The live certification must begin before it can be marked complete.'; end if;
 update public.final_certification_sessions set status='awaiting_self_assessment',updated_at=now() where id=p_session_id returning * into v_session;
 insert into public.final_certification_events(session_id,event_type,actor_user_id,event_data) values(p_session_id,'live_rounds_completed',auth.uid(),'{}'::jsonb);
 return jsonb_build_object('sessionId',v_session.id,'status',v_session.status);
end;$$;

create or replace function public.admin_submit_final_certification_evaluation(p_session_id uuid,p_rubric_scores jsonb,p_critical_rule_ids uuid[] default array[]::uuid[],p_feedback text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.final_certification_sessions%rowtype; v_module public.training_modules%rowtype; v_state public.final_certification_state%rowtype; v_item jsonb; v_expected int; v_supplied int; v_points int; v_max int:=0; v_earned int:=0; v_score int; v_failures jsonb:='[]'::jsonb; v_failure_count int; v_pass boolean; v_new_session uuid; begin
 if not public.is_admin() then raise exception 'Unauthorized: Admin access required.'; end if;
 select * into v_session from public.final_certification_sessions where id=p_session_id for update; if not found then raise exception 'Final Certification session not found.'; end if;
 if v_session.evaluator_id is distinct from auth.uid() then raise exception 'Only the assigned Management evaluator may score this session.'; end if;
 if v_session.status<>'awaiting_evaluation' then raise exception 'The learner must complete the live simulation and private self-assessment before evaluation.'; end if;
 select * into v_state from public.final_certification_state where progress_id=v_session.progress_id for update; if not found or v_state.self_assessment='{}'::jsonb then raise exception 'Learner self-assessment is required before evaluator results.'; end if;
 if char_length(btrim(coalesce(p_feedback,'')))<40 then raise exception 'Provide specific evaluator coaching feedback (at least 40 characters).'; end if;
 if jsonb_typeof(p_rubric_scores)<>'object' then raise exception 'Complete every Final Certification rubric item.'; end if;
 v_expected:=jsonb_array_length(v_session.rubric_snapshot); select count(*) into v_supplied from jsonb_each(p_rubric_scores); if v_expected<>10 or v_supplied<>v_expected then raise exception 'Complete all 10 Final Certification rubric items.'; end if;
 for v_item in select value from jsonb_array_elements(v_session.rubric_snapshot) loop if not (p_rubric_scores ? (v_item->>'id')) or (p_rubric_scores->>(v_item->>'id'))!~'^\d+$' then raise exception 'Every rubric item requires a whole-number score.'; end if; v_points:=(p_rubric_scores->>(v_item->>'id'))::int; if v_points<0 or v_points>(v_item->>'maxPoints')::int then raise exception 'Rubric score for % is outside its allowed range.',v_item->>'title'; end if; v_earned:=v_earned+v_points; v_max:=v_max+(v_item->>'maxPoints')::int; end loop;
 if v_max<>100 then raise exception 'Frozen Final Certification rubric must total exactly 100 points.'; end if;
 if exists(select 1 from jsonb_object_keys(p_rubric_scores) k where not exists(select 1 from jsonb_array_elements(v_session.rubric_snapshot) r where r->>'id'=k)) then raise exception 'Unexpected rubric item supplied.'; end if;
 if exists(select 1 from unnest(coalesce(p_critical_rule_ids,array[]::uuid[])) supplied(id) where not exists(select 1 from jsonb_array_elements(v_session.critical_rules_snapshot) r where r->>'id'=supplied.id::text)) then raise exception 'Unknown Final Certification critical rule supplied.'; end if;
 select coalesce(jsonb_agg(r),'[]'::jsonb) into v_failures from jsonb_array_elements(v_session.critical_rules_snapshot) r where (r->>'id')::uuid=any(coalesce(p_critical_rule_ids,array[]::uuid[])); v_failure_count:=jsonb_array_length(v_failures); v_score:=v_earned;
 select * into v_module from public.training_modules where id=v_session.module_id and slug='final-certification'; if not found then raise exception 'Final Certification module is unavailable.'; end if; v_pass:=v_score>=coalesce(v_module.passing_score,90) and v_failure_count=0;
 update public.final_certification_sessions set status=case when v_pass then 'passed' else 'retry_required' end,score=v_score,rubric_scores=p_rubric_scores,critical_failures=v_failures,evaluator_feedback=left(btrim(p_feedback),8000),evaluated_at=now(),updated_at=now() where id=p_session_id returning * into v_session;
 update public.user_training_progress set status=case when v_pass then 'Passed' else 'Retry Required' end,progress_percent=case when v_pass then 100 else 80 end,score=v_score,completed_at=case when v_pass then now() else null end,reviewed_by=auth.uid(),reviewed_at=now(),review_status=case when v_pass then 'Passed' else 'Retry Required' end,feedback=left(btrim(p_feedback),8000),updated_at=now() where id=v_session.progress_id;
 insert into public.training_reviews(progress_id,reviewer_id,status,feedback,score) values(v_session.progress_id,auth.uid(),case when v_pass then 'Passed' else 'Retry Required' end,left(btrim(p_feedback),8000),v_score);
 insert into public.training_assignments(user_id,module_id,progress_id,submission_data) values(v_session.trainee_id,v_session.module_id,v_session.progress_id,jsonb_build_object('type','final_certification_live_evaluation_v1','sessionId',v_session.id,'attemptNo',v_session.attempt_no,'score',v_score,'passed',v_pass,'rubricScores',p_rubric_scores,'criticalFailures',v_failures,'feedback',left(btrim(p_feedback),8000),'reviewerId',auth.uid(),'evaluatedAt',now()));
 insert into public.final_certification_events(session_id,event_type,actor_user_id,event_data) values(v_session.id,case when v_pass then 'evaluation_passed' else 'evaluation_retry_required' end,auth.uid(),jsonb_build_object('score',v_score,'criticalFailureCount',v_failure_count));
 if not v_pass then v_new_session:=public.create_final_certification_live_session(v_session.trainee_id,v_session.progress_id); end if;
 return jsonb_build_object('passed',v_pass,'score',v_score,'criticalFailures',v_failure_count,'status',case when v_pass then 'Passed' else 'Retry Required' end,'nextLiveSessionId',v_new_session);
end;$$;

revoke all on function public.admin_get_final_certification_queue() from public,anon,authenticated;
revoke all on function public.admin_claim_final_certification_session(uuid) from public,anon,authenticated;
revoke all on function public.admin_schedule_final_certification_session(uuid,timestamptz,integer,text) from public,anon,authenticated;
revoke all on function public.admin_mark_final_certification_live_complete(uuid) from public,anon,authenticated;
revoke all on function public.admin_submit_final_certification_evaluation(uuid,jsonb,uuid[],text) from public,anon,authenticated;
grant execute on function public.admin_get_final_certification_queue() to authenticated;
grant execute on function public.admin_claim_final_certification_session(uuid) to authenticated;
grant execute on function public.admin_schedule_final_certification_session(uuid,timestamptz,integer,text) to authenticated;
grant execute on function public.admin_mark_final_certification_live_complete(uuid) to authenticated;
grant execute on function public.admin_submit_final_certification_evaluation(uuid,jsonb,uuid[],text) to authenticated;

create or replace function public.request_sales_final_approval()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_app public.applicants%rowtype; v_final public.user_training_progress%rowtype; v_final_module public.training_modules%rowtype; v_missing_prior int; v_missing_prior_reviews int; v_review public.training_reviews%rowtype; v_session public.final_certification_sessions%rowtype; begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 select * into v_app from public.applicants where linked_user_id=auth.uid() order by created_at desc limit 1 for update; if not found then raise exception 'Linked sales candidate record not found.'; end if;
 if v_app.stage='Final Approval' then return; end if; if v_app.stage<>'One-Day Training' then raise exception 'Candidate must be in One-Day Training before requesting Final Approval.'; end if; if lower(coalesce(v_app.agreement_status,''))<>'signed' then raise exception 'Signed sales agreement is required.'; end if;
 select * into v_final_module from public.training_modules where slug='final-certification' and active=true; if not found then raise exception 'Final Certification module is unavailable.'; end if;
 select * into v_final from public.user_training_progress where user_id=auth.uid() and module_id=v_final_module.id for update; if not found or v_final.status<>'Passed' or coalesce(v_final.score,0)<coalesce(v_final_module.passing_score,90) then raise exception 'Pass the complete Module 20 capstone, including the live Management certification, before requesting Final Approval.'; end if;
 select * into v_review from public.training_reviews where progress_id=v_final.id order by created_at desc,id desc limit 1; if not found or v_review.status<>'Passed' or v_review.reviewer_id is null or coalesce(v_review.score,0)<coalesce(v_final_module.passing_score,90) then raise exception 'Final Certification requires a passing Management live review.'; end if;
 select * into v_session from public.final_certification_sessions where progress_id=v_final.id and status='passed' order by attempt_no desc limit 1; if not found or coalesce(v_session.score,0)<coalesce(v_final_module.passing_score,90) or jsonb_array_length(v_session.critical_failures)>0 then raise exception 'A passing live capstone with zero critical failures is required.'; end if;
 select count(*) into v_missing_prior from public.training_modules m where m.active=true and m.required=true and m.sort_order<v_final_module.sort_order and not exists(select 1 from public.user_training_progress p where p.user_id=auth.uid() and p.module_id=m.id and p.status in('Passed','Completed') and (m.passing_score is null or coalesce(p.score,0)>=m.passing_score)); if v_missing_prior>0 then raise exception 'All previous required modules must be complete before Final Approval. Missing: %',v_missing_prior; end if;
 select count(*) into v_missing_prior_reviews from public.training_modules m where m.active=true and m.requires_admin_review=true and m.sort_order<v_final_module.sort_order and not exists(select 1 from public.user_training_progress p join lateral(select tr.status,tr.reviewer_id from public.training_reviews tr where tr.progress_id=p.id order by tr.created_at desc,tr.id desc limit 1) r on true where p.user_id=auth.uid() and p.module_id=m.id and p.status='Passed' and r.status='Passed' and r.reviewer_id is not null); if v_missing_prior_reviews>0 then raise exception 'All prior Admin-reviewed practical gates must be passed before Final Approval. Missing: %',v_missing_prior_reviews; end if;
 update public.applicants set stage='Final Approval',onboarding_status='in_progress',onboarding_progress=100,updated_at=now() where id=v_app.id;
end;$$;

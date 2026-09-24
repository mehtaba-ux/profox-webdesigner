create or replace function public.admin_update_recruitment_assessment(
  p_assessment_id uuid,
  p_status text,
  p_score integer,
  p_rubric_scores jsonb default '{}'::jsonb,
  p_critical_failures jsonb default '[]'::jsonb,
  p_evidence text default ''::text,
  p_evidence_url text default ''::text,
  p_notes text default ''::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_assessment public.recruitment_assessments%rowtype;
  v_app public.applicants%rowtype;
  v_policy public.recruitment_stage_policies%rowtype;
  v_previous_status text;
  v_previous_score integer;
  v_passing_score integer;
begin
  if p_assessment_id is null then raise exception 'Assessment is required.'; end if;
  select * into v_assessment from public.recruitment_assessments where id=p_assessment_id for update;
  if not found then raise exception 'Assessment not found.'; end if;
  if not public.can_manage_content_applicant(v_assessment.applicant_id) and not public.is_admin() then raise exception 'Recruitment management access required.'; end if;
  select * into v_app from public.applicants where id=v_assessment.applicant_id for update;
  if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(btrim(v_app.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot have assessments edited.'; end if;
  if v_app.stage<>v_assessment.stage then raise exception 'Historical assessments cannot be edited after the candidate leaves that stage.'; end if;
  if exists(select 1 from public.recruitment_assessments newer where newer.applicant_id=v_assessment.applicant_id and newer.stage=v_assessment.stage and newer.attempt_no>v_assessment.attempt_no) then raise exception 'Only the latest assessment attempt for the current stage can be edited.'; end if;
  select * into v_policy from public.recruitment_stage_policies where job_id=public.recruitment_job_for_applicant(v_app.id) and stage=v_assessment.stage and active=true;
  if not found or not v_policy.assessment_required then raise exception 'This stage is not configured as a structured assessment stage.'; end if;
  if p_status not in('Passed','Failed','Retry Required') then raise exception 'Assessment status must be Passed, Failed or Retry Required.'; end if;
  if p_score is null or p_score<0 or p_score>100 then raise exception 'Assessment score must be between 0 and 100.'; end if;
  if jsonb_typeof(coalesce(p_rubric_scores,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_critical_failures,'[]'::jsonb))<>'array' then raise exception 'Invalid assessment evidence format.'; end if;
  v_passing_score:=coalesce(v_assessment.passing_score_snapshot,v_policy.passing_score,0);
  if p_status='Passed' and p_score<v_passing_score then raise exception 'Passed assessment score must meet the saved passing score of %.',v_passing_score; end if;
  if p_status='Passed' and jsonb_array_length(coalesce(p_critical_failures,'[]'::jsonb))>0 then raise exception 'An assessment with critical failures cannot be passed.'; end if;
  if p_status='Passed' and v_policy.interview_required and not public.recruitment_interview_requirement_satisfied(v_assessment.applicant_id,v_assessment.stage) then raise exception 'Complete or administratively skip the required % interview before marking this assessment Passed.',v_assessment.stage; end if;
  v_previous_status:=v_assessment.status;
  v_previous_score:=v_assessment.score;
  update public.recruitment_assessments set status=p_status,score=p_score,rubric_scores=coalesce(p_rubric_scores,'{}'::jsonb),critical_failures=coalesce(p_critical_failures,'[]'::jsonb),evidence=left(coalesce(p_evidence,''),10000),evidence_url=left(coalesce(p_evidence_url,''),2000),evaluator_notes=left(coalesce(p_notes,''),10000),evaluator_id=auth.uid(),evaluated_at=now(),updated_at=now() where id=v_assessment.id;
  perform public.log_applicant_event(v_assessment.applicant_id,'assessment','assessment_updated',v_assessment.stage||' assessment updated',coalesce(nullif(btrim(p_notes),''),'Latest structured recruitment assessment updated.'),v_previous_status,p_status,case when public.is_admin() then 'admin' else 'content_manager' end,auth.uid(),'recruitment_assessments',v_assessment.id,jsonb_build_object('stage',v_assessment.stage,'attemptNo',v_assessment.attempt_no,'previousScore',v_previous_score,'score',p_score,'passingScore',v_passing_score,'criticalFailures',coalesce(p_critical_failures,'[]'::jsonb)));
  return jsonb_build_object('success',true,'id',v_assessment.id,'attemptNo',v_assessment.attempt_no,'status',p_status,'score',p_score,'passingScore',v_passing_score);
end;
$$;

create or replace function public.admin_update_and_process_recruitment_assessment(
  p_assessment_id uuid,
  p_status text,
  p_score integer,
  p_rubric_scores jsonb default '{}'::jsonb,
  p_critical_failures jsonb default '[]'::jsonb,
  p_evidence text default ''::text,
  p_evidence_url text default ''::text,
  p_notes text default ''::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_assessment_row public.recruitment_assessments%rowtype;
  v_assessment jsonb;
  v_progression jsonb:=null;
begin
  select * into v_assessment_row from public.recruitment_assessments where id=p_assessment_id;
  if not found then raise exception 'Assessment not found.'; end if;
  v_assessment:=public.admin_update_recruitment_assessment(p_assessment_id,p_status,p_score,p_rubric_scores,p_critical_failures,p_evidence,p_evidence_url,p_notes);
  if p_status='Passed' then v_progression:=public.admin_advance_applicant_stage(v_assessment_row.applicant_id,null); end if;
  return jsonb_build_object('success',true,'assessment',v_assessment,'progression',v_progression);
end;
$$;

revoke all on function public.admin_update_recruitment_assessment(uuid,text,integer,jsonb,jsonb,text,text,text) from public, anon;
revoke all on function public.admin_update_and_process_recruitment_assessment(uuid,text,integer,jsonb,jsonb,text,text,text) from public, anon;
grant execute on function public.admin_update_recruitment_assessment(uuid,text,integer,jsonb,jsonb,text,text,text) to authenticated;
grant execute on function public.admin_update_and_process_recruitment_assessment(uuid,text,integer,jsonb,jsonb,text,text,text) to authenticated;
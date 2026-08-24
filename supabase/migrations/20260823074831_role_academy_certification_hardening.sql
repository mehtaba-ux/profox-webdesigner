-- Role Academy final-certification hardening.
-- Reuses the shared training/progress/assignment/review infrastructure while making
-- the Developer/UIUX final certification transitions atomic and server-authoritative.

create or replace function public.submit_role_final_certification(p_submission jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user_id uuid:=auth.uid();
  v_track text;
  v_slug text;
  v_stage text;
  v_module public.training_modules%rowtype;
  v_progress public.user_training_progress%rowtype;
  v_applicant public.applicants%rowtype;
  v_assignment_id uuid;
  v_missing integer;
  v_key text;
  v_value jsonb;
  v_admin record;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  if p_submission is null or jsonb_typeof(p_submission)<>'object' then raise exception 'Certification evidence must be a structured object.'; end if;
  if length(p_submission::text)>30000 then raise exception 'Certification evidence is too large.'; end if;

  v_track:=public.training_track_for_user(v_user_id);
  if v_track='web_development' then
    v_slug:='dev-final-certification';
    v_stage:='Developer Academy';
  elsif v_track='uiux_design' then
    v_slug:='uiux-final-certification';
    v_stage:='Design Academy';
  else
    raise exception 'This certification endpoint is only for the Development or UI/UX Academy.';
  end if;

  select * into v_applicant
  from public.applicants
  where linked_user_id=v_user_id
  order by created_at desc
  limit 1
  for update;
  if not found then raise exception 'Linked candidate record not found.'; end if;
  if v_applicant.stage<>v_stage then raise exception 'Candidate must be in % before submitting Final Certification.',v_stage; end if;
  if lower(coalesce(v_applicant.agreement_status,''))<>'signed' then raise exception 'Verified candidate agreement is required before Final Certification.'; end if;

  -- Reject secret-like top-level fields. Certification evidence stores references and
  -- explanatory notes only; credentials belong in approved secret stores.
  for v_key,v_value in select key,value from jsonb_each(p_submission) loop
    if lower(v_key) ~ '(password|passwd|secret|token|api[_ -]?key|private[_ -]?key|credential)' then
      raise exception 'Certification evidence must not contain credentials or secrets.';
    end if;
    if jsonb_typeof(v_value)='string' and length(v_value#>>'{}')>5000 then
      raise exception 'Certification evidence field % is too large.',v_key;
    end if;
  end loop;

  if v_track='web_development' then
    if nullif(trim(p_submission->>'sourcePullRequestUrl'),'') is null
       or nullif(trim(p_submission->>'previewUrl'),'') is null
       or nullif(trim(p_submission->>'testEvidence'),'') is null
       or nullif(trim(p_submission->>'responsiveAccessibilityNotes'),'') is null
       or nullif(trim(p_submission->>'performanceSecurityNotes'),'') is null
       or nullif(trim(p_submission->>'releaseHandoverNotes'),'') is null then
      raise exception 'Complete every required Web Developer certification evidence field.';
    end if;
    if (p_submission->>'sourcePullRequestUrl') !~* '^https?://' or (p_submission->>'previewUrl') !~* '^https?://' then
      raise exception 'Source/PR and preview references must be valid HTTP(S) URLs.';
    end if;
  else
    if nullif(trim(p_submission->>'figmaUrl'),'') is null
       or nullif(trim(p_submission->>'responsiveEvidence'),'') is null
       or nullif(trim(p_submission->>'componentSystemEvidence'),'') is null
       or nullif(trim(p_submission->>'statesAccessibilityNotes'),'') is null
       or nullif(trim(p_submission->>'designRationale'),'') is null
       or nullif(trim(p_submission->>'developerHandoffNote'),'') is null then
      raise exception 'Complete every required UI/UX certification evidence field.';
    end if;
    if (p_submission->>'figmaUrl') !~* '^https?://' then
      raise exception 'Figma/design reference must be a valid HTTP(S) URL.';
    end if;
  end if;

  select * into v_module from public.training_modules where slug=v_slug and active=true;
  if not found then raise exception 'Final Certification module is not configured.'; end if;

  -- All required prerequisite modules in the assigned track must already satisfy their
  -- configured pass/review rules; the final certification itself is excluded here.
  select count(*) into v_missing
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id and m.active=true
  where tm.track_key=v_track and tm.required and m.id<>v_module.id
    and not exists(
      select 1
      from public.user_training_progress p
      where p.user_id=v_user_id and p.module_id=m.id and p.status in('Passed','Completed')
        and (coalesce(tm.passing_score_override,m.passing_score) is null or coalesce(p.score,100)>=coalesce(tm.passing_score_override,m.passing_score))
        and (
          coalesce(tm.requires_review_override,m.requires_admin_review,false)=false
          or exists(select 1 from public.training_reviews r where r.progress_id=p.id and r.status='Passed' and r.reviewer_id is not null)
        )
    );
  if v_missing>0 then raise exception 'Complete every required Academy prerequisite before submitting Final Certification.'; end if;

  select * into v_progress
  from public.user_training_progress
  where user_id=v_user_id and module_id=v_module.id
  for update;
  if not found then
    insert into public.user_training_progress(user_id,module_id,status,progress_percent,attempts,completed_at,updated_at)
    values(v_user_id,v_module.id,'In Progress',10,0,null,now())
    returning * into v_progress;
  end if;
  if v_progress.status='Submitted' then raise exception 'Final Certification is already awaiting Management review.'; end if;
  if v_progress.status='Passed' then raise exception 'Final Certification is already passed.'; end if;

  insert into public.training_assignments(user_id,module_id,progress_id,submission_data)
  values(v_user_id,v_module.id,v_progress.id,p_submission||jsonb_build_object('submittedAt',now(),'trainingTrack',v_track))
  returning id into v_assignment_id;

  update public.user_training_progress
  set status='Submitted',progress_percent=100,completed_at=null,
      attempts=coalesce(attempts,0)+1,score=null,reviewed_by=null,reviewed_at=null,
      review_status=null,feedback=null,admin_feedback=null,updated_at=now()
  where id=v_progress.id;

  -- Management receives an in-app operational review item. The canonical training
  -- assignment/progress records themselves remain the audit trail; no duplicate ATS
  -- or review table is introduced.
  for v_admin in select id from public.user_profiles where role='admin' and status='active' loop
    perform public.enqueue_in_app_notification(
      v_admin.id,
      'academy_certification_review_required',
      case when v_track='web_development' then 'Web Developer certification ready for review' else 'UI/UX certification ready for review' end,
      coalesce(v_applicant.full_name,v_applicant.email)||' submitted Final Certification evidence for independent Management review.',
      '/admin/academy-certification-reviews',
      'academy-certification:'||v_progress.id::text||':'||coalesce((v_progress.attempts+1)::text,'1')||':'||v_admin.id::text
    );
  end loop;

  return jsonb_build_object('success',true,'progressId',v_progress.id,'assignmentId',v_assignment_id,'status','Submitted','trainingTrack',v_track);
end;
$$;

grant execute on function public.submit_role_final_certification(jsonb) to authenticated;

create or replace function public.admin_review_role_final_certification(
  p_progress_id uuid,
  p_status text,
  p_feedback text,
  p_score integer
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_progress public.user_training_progress%rowtype;
  v_module public.training_modules%rowtype;
  v_track text;
  v_threshold integer;
begin
  if not public.is_admin() then raise exception 'Only active Management/Admin may review Final Certification.'; end if;
  if p_status not in('Passed','Retry Required') then raise exception 'Review decision must be Passed or Retry Required.'; end if;
  if p_score<0 or p_score>100 then raise exception 'Certification score must be between 0 and 100.'; end if;

  select * into v_progress from public.user_training_progress where id=p_progress_id for update;
  if not found then raise exception 'Training progress not found.'; end if;
  if v_progress.status<>'Submitted' then raise exception 'Only a submitted Final Certification may be reviewed.'; end if;
  if v_progress.user_id=auth.uid() then raise exception 'A candidate cannot review their own Final Certification.'; end if;

  select * into v_module from public.training_modules where id=v_progress.module_id;
  if not found or v_module.slug not in('dev-final-certification','uiux-final-certification') then
    raise exception 'This review endpoint is only for Development or UI/UX Final Certification.';
  end if;
  v_track:=case when v_module.slug='dev-final-certification' then 'web_development' else 'uiux_design' end;
  select coalesce(tm.passing_score_override,v_module.passing_score,90) into v_threshold
  from public.training_track_modules tm
  where tm.track_key=v_track and tm.module_id=v_module.id;
  v_threshold:=coalesce(v_threshold,v_module.passing_score,90);

  if p_status='Passed' and p_score<v_threshold then raise exception 'A passing review requires at least % percent.',v_threshold; end if;
  if p_status='Retry Required' and length(trim(coalesce(p_feedback,'')))<10 then raise exception 'Specific correction feedback is required.'; end if;

  perform public.admin_review_training_progress(p_progress_id,p_status,trim(coalesce(p_feedback,'')),p_score);

  perform public.enqueue_in_app_notification(
    v_progress.user_id,
    case when p_status='Passed' then 'academy_certification_passed' else 'academy_certification_changes_required' end,
    case when p_status='Passed' then 'Final Certification passed' else 'Final Certification changes required' end,
    case when p_status='Passed'
      then 'Management passed your Final Certification. You can now request Final Approval after all Academy requirements are complete.'
      else 'Management returned your Final Certification. Review the feedback, correct the evidence, and resubmit.' end,
    '/academy/final-certification',
    'academy-certification-review:'||p_progress_id::text||':'||p_status||':'||p_score::text
  );
end;
$$;

grant execute on function public.admin_review_role_final_certification(uuid,text,text,integer) to authenticated;

-- PF UI/UX Designer Team — recruitment interview gate compatibility.
-- Recruitment interview status is canonically stored on the linked sales_meetings row,
-- not duplicated on recruitment_interviews. Keep progression aligned with that existing model.

create or replace function public.admin_advance_applicant_stage(p_applicant_id uuid,p_target_stage text default null)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype; v_target text; v_policy public.recruitment_stage_policies%rowtype;
  v_from_rank int; v_to_rank int; v_role text;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id for update;
  if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(trim(v_app.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot progress.'; end if;

  v_role:=coalesce(public.career_job_system_role(v_app.career_job_id),'sales');
  v_target:=coalesce(p_target_stage,public.recruitment_next_stage_for_job(v_app.career_job_id,v_app.stage));
  if v_target is null then raise exception 'No next stage is available.'; end if;
  v_from_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_app.stage);
  v_to_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_target);
  if v_from_rank is null or v_to_rank is null or v_to_rank<>v_from_rank+1 then
    raise exception 'Recruitment stages must progress sequentially through the selected job workflow.';
  end if;

  if v_role='sales' and v_app.stage='New Application' and v_target='Video Pending'
     and (coalesce(v_app.video_url,'')<>'' or coalesce(v_app.video_storage_path,'')<>'') then
    v_target:='Video Review';
  end if;
  if v_role='sales' and v_app.stage='Video Pending' and v_target='Video Review'
     and coalesce(v_app.video_url,'')='' and coalesce(v_app.video_storage_path,'')='' then
    raise exception 'Introduction video is required before Video Review.';
  end if;

  select * into v_policy
  from public.recruitment_stage_policies
  where job_id=v_app.career_job_id and stage=v_app.stage and active=true;

  if found and v_policy.assessment_required and not public.recruitment_latest_assessment_passed(v_app.id,v_app.stage) then
    raise exception 'A passed structured assessment for % is required before progression.',v_app.stage;
  end if;

  if found and v_policy.interview_required and not exists(
    select 1
    from public.recruitment_interviews ri
    join public.sales_meetings m on m.id=ri.meeting_id
    where ri.applicant_id=v_app.id
      and ri.stage=v_app.stage
      and m.status='Completed'
  ) then
    raise exception 'A completed structured interview for % is required before progression.',v_app.stage;
  end if;

  if v_app.stage='Selected' then raise exception 'Issue the approved candidate agreement to move a Selected candidate into Agreement Pending.'; end if;
  if v_app.stage='Agreement Pending' then raise exception 'A verified agreement and protected account invitation are required before onboarding training.'; end if;
  if v_app.stage in('One-Day Training','Design Academy') then raise exception 'The candidate must complete the assigned Academy and request Final Approval through the protected workflow.'; end if;
  if v_app.stage='Final Approval' then raise exception 'Use the protected Final Approval action.'; end if;
  if v_app.stage='Ready for System Access' then raise exception 'Use protected workforce activation.'; end if;

  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants set stage=v_target,updated_at=now() where id=v_app.id;
  return jsonb_build_object('success',true,'fromStage',v_app.stage,'toStage',v_target,'systemRole',v_role);
end;
$$;

revoke all on function public.admin_advance_applicant_stage(uuid,text) from public,anon;
grant execute on function public.admin_advance_applicant_stage(uuid,text) to authenticated;

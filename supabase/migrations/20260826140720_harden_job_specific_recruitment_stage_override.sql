-- Keep documented Admin stage corrections inside each role's pre-onboarding zone.
-- Mirrors production migration 20260826140720.

create or replace function public.admin_override_applicant_stage(p_applicant_id uuid, p_target_stage text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_app public.applicants%rowtype;
  v_from_rank integer;
  v_to_rank integer;
  v_boundary_rank integer;
  v_boundary_stage text;
  v_role text;
  v_type text;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if length(trim(coalesce(p_reason,'')))<12 then raise exception 'A specific override reason of at least 12 characters is required.'; end if;

  select * into v_app from public.applicants where id=p_applicant_id for update;
  if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(trim(v_app.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot be moved.'; end if;

  select j.application_type,coalesce(public.career_job_system_role(j.id),case when j.application_type='sales_representative' then 'sales' else 'pending' end)
    into v_type,v_role
  from public.career_jobs j where j.id=v_app.career_job_id;
  if not found then raise exception 'Candidate career job is missing.'; end if;

  v_from_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_app.stage);
  v_to_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,p_target_stage);
  if v_from_rank is null then raise exception 'Current stage is not active in this job pipeline.'; end if;
  if v_to_rank is null then raise exception 'Invalid target stage for this job.'; end if;

  if v_role='content_writer' or v_type='content_writer' then
    v_boundary_stage:='Content Academy';
  elsif public.recruitment_stage_rank_for_job(v_app.career_job_id,'Agreement Pending') is not null then
    v_boundary_stage:='Agreement Pending';
  else
    v_boundary_stage:='Selected';
  end if;

  v_boundary_rank:=public.recruitment_stage_rank_for_job(v_app.career_job_id,v_boundary_stage);
  if v_boundary_rank is null then raise exception 'Protected onboarding boundary is missing from this job pipeline.'; end if;

  if v_from_rank>=v_boundary_rank or v_to_rank>=v_boundary_rank then
    raise exception 'Admin Override cannot bypass the protected onboarding, Academy, certification or activation sequence.';
  end if;

  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants set stage=p_target_stage,updated_at=now() where id=p_applicant_id;
  perform public.log_applicant_event(
    p_applicant_id,'recruitment','stage_override','Recruitment stage overridden',left(trim(p_reason),2000),
    v_app.stage,p_target_stage,'admin',auth.uid(),'applicants',p_applicant_id,
    jsonb_build_object('reason',left(trim(p_reason),2000),'protectedBoundary',v_boundary_stage)
  );
  return jsonb_build_object('success',true,'fromStage',v_app.stage,'toStage',p_target_stage,'override',true,'protectedBoundary',v_boundary_stage);
end;
$function$;

revoke all on function public.admin_override_applicant_stage(uuid,text,text) from public,anon;
grant execute on function public.admin_override_applicant_stage(uuid,text,text) to authenticated,service_role;

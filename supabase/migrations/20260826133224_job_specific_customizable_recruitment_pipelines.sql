-- Job-specific, Admin-customizable recruitment pipelines.
-- Mirrors production migration 20260826133224.

create or replace function public.recruitment_stage_is_system_protected(p_job_id uuid, p_stage text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_role text;
  v_type text;
  v_stage text := trim(coalesce(p_stage,''));
begin
  if p_job_id is null or v_stage = '' then return false; end if;
  select application_type,coalesce(public.career_job_system_role(id),'pending') into v_type,v_role
  from public.career_jobs where id=p_job_id;
  if not found then return false; end if;

  if v_stage in ('New Application','Selected','Activated') then return true; end if;

  if v_role='sales' or v_type='sales_representative' then
    return v_stage in ('Video Pending','Video Review','Lead Research Test','Agreement Pending','One-Day Training','Final Approval','Ready for System Access');
  elsif v_role='uiux_designer' then
    return v_stage in ('Agreement Pending','Design Academy','Final Approval','Ready for System Access');
  elsif v_role='developer' then
    return v_stage in ('Agreement Pending','Developer Academy','Final Approval','Ready for System Access');
  elsif v_role='content_writer' or v_type='content_writer' then
    return v_stage in ('Content Academy','Practical Certification');
  end if;
  return false;
end;
$function$;

revoke all on function public.recruitment_stage_is_system_protected(uuid,text) from public,anon,authenticated;
grant execute on function public.recruitment_stage_is_system_protected(uuid,text) to service_role;

create or replace function public.recruitment_stage_rank_for_job(p_job_id uuid, p_stage text)
returns integer
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare v_rank integer;
begin
  if p_job_id is not null then
    select sort_order into v_rank from public.recruitment_stage_policies where job_id=p_job_id and stage=p_stage and active=true limit 1;
    return v_rank;
  end if;
  return public.recruitment_stage_rank(p_stage);
end;
$function$;

create or replace function public.recruitment_next_stage_for_job(p_job_id uuid, p_stage text)
returns text
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare v_current integer;v_next text;
begin
  if p_job_id is not null then
    select sort_order into v_current from public.recruitment_stage_policies where job_id=p_job_id and stage=p_stage and active=true limit 1;
    if v_current is null then return null; end if;
    select stage into v_next from public.recruitment_stage_policies where job_id=p_job_id and active=true and sort_order>v_current order by sort_order limit 1;
    return v_next;
  end if;
  return public.recruitment_next_stage(p_stage);
end;
$function$;

revoke all on function public.recruitment_stage_rank_for_job(uuid,text) from public,anon;
revoke all on function public.recruitment_next_stage_for_job(uuid,text) from public,anon;
grant execute on function public.recruitment_stage_rank_for_job(uuid,text) to authenticated,service_role;
grant execute on function public.recruitment_next_stage_for_job(uuid,text) to authenticated,service_role;

create or replace function public.admin_get_recruitment_pipeline_jobs()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'jobId',j.id,
    'title',j.title,
    'department',coalesce(j.department,''),
    'status',coalesce(j.status,''),
    'systemRole',coalesce(public.career_job_system_role(j.id),case when j.application_type='sales_representative' then 'sales' else 'pending' end),
    'activeStageCount',(select count(*) from public.recruitment_stage_policies p where p.job_id=j.id and p.active=true),
    'totalCandidates',(select count(*) from public.applicants a where a.career_job_id=j.id),
    'activeCandidates',(select count(*) from public.applicants a where a.career_job_id=j.id and coalesce(trim(a.refusal_reason),'')='' and a.stage<>'Activated')
  ) order by coalesce(j.department,''),j.title),'[]'::jsonb)
  into v_result from public.career_jobs j;
  return v_result;
end;
$function$;

create or replace function public.admin_get_recruitment_stage_policies(p_job_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_job uuid:=p_job_id;
  v_result jsonb;
  v_type text;
begin
  if v_job is null then
    select id into v_job from public.career_jobs where application_type='sales_representative'
    order by (status='Published') desc,featured desc,published_at desc nulls last,created_at desc limit 1;
  end if;
  select application_type into v_type from public.career_jobs where id=v_job;
  if not found then raise exception 'Job Post not found.'; end if;
  if not public.is_admin() and not (v_type='content_writer' and public.content_recruitment_manager()) then
    raise exception 'Recruitment management access required.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'jobId',p.job_id,
    'stage',p.stage,
    'sortOrder',p.sort_order,
    'active',p.active,
    'assessmentRequired',p.assessment_required,
    'passingScore',p.passing_score,
    'slaHours',p.sla_hours,
    'interviewRequired',p.interview_required,
    'rubric',p.rubric,
    'updatedAt',p.updated_at,
    'systemProtected',public.recruitment_stage_is_system_protected(p.job_id,p.stage),
    'currentCandidateCount',(select count(*) from public.applicants a where a.career_job_id=p.job_id and a.stage=p.stage),
    'openCandidateCount',(select count(*) from public.applicants a where a.career_job_id=p.job_id and a.stage=p.stage and coalesce(trim(a.refusal_reason),'')='' and a.stage<>'Activated'),
    'historyReferenceCount',(
      (select count(*) from public.recruitment_assessments ra where ra.job_id=p.job_id and ra.stage=p.stage)
      +(select count(*) from public.recruitment_interviews ri join public.applicants a on a.id=ri.applicant_id where a.career_job_id=p.job_id and ri.stage=p.stage)
      +(select count(*) from public.recruitment_interview_skips rs join public.applicants a on a.id=rs.applicant_id where a.career_job_id=p.job_id and rs.stage=p.stage)
      +(select count(*) from public.recruitment_task_instances rt join public.applicants a on a.id=rt.applicant_id where a.career_job_id=p.job_id and rt.stage=p.stage)
    )
  ) order by p.active desc,p.sort_order,p.stage),'[]'::jsonb)
  into v_result from public.recruitment_stage_policies p where p.job_id=v_job;
  return v_result;
end;
$function$;

create or replace function public.admin_create_recruitment_stage(
  p_job_id uuid,
  p_stage text,
  p_after_stage text default null,
  p_sla_hours integer default 24,
  p_assessment_required boolean default false,
  p_passing_score integer default null,
  p_interview_required boolean default false,
  p_rubric jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_name text:=trim(coalesce(p_stage,''));
  v_target integer;
  v_after integer;
  v_selected integer;
  v_video_review integer;
  v_role text;
  v_row public.recruitment_stage_policies%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if not exists(select 1 from public.career_jobs where id=p_job_id) then raise exception 'Job Post not found.'; end if;
  if length(v_name)<2 or length(v_name)>80 then raise exception 'Stage name must be between 2 and 80 characters.'; end if;
  if exists(select 1 from public.recruitment_stage_policies where job_id=p_job_id and lower(stage)=lower(v_name)) then
    raise exception 'A stage with this name already exists or is archived. Restore the archived stage instead.';
  end if;
  if p_assessment_required and (p_passing_score is null or p_passing_score<0 or p_passing_score>100) then raise exception 'Assessment stages require a passing score from 0 to 100.'; end if;
  if p_sla_hours<0 or p_sla_hours>720 then raise exception 'SLA hours must be between 0 and 720.'; end if;
  if jsonb_typeof(coalesce(p_rubric,'[]'::jsonb))<>'array' then raise exception 'Rubric must be an array.'; end if;

  perform 1 from public.recruitment_stage_policies where job_id=p_job_id for update;
  select coalesce(public.career_job_system_role(p_job_id),'pending') into v_role;
  select sort_order into v_selected from public.recruitment_stage_policies where job_id=p_job_id and stage='Selected' and active=true;

  if p_after_stage is not null and trim(p_after_stage)<>'' then
    select sort_order into v_after from public.recruitment_stage_policies where job_id=p_job_id and stage=trim(p_after_stage) and active=true;
    if v_after is null then raise exception 'The selected insertion point is not an active stage in this pipeline.'; end if;
    if v_selected is not null and v_after>=v_selected then raise exception 'Custom stages must be placed before the protected Selected / onboarding sequence.'; end if;
    if v_role='sales' then
      select sort_order into v_video_review from public.recruitment_stage_policies where job_id=p_job_id and stage='Video Review' and active=true;
      if v_video_review is not null and v_after<v_video_review then raise exception 'Sales custom stages must be placed after the protected Video Review intake sequence.'; end if;
    end if;
    v_target:=v_after+1;
  else
    v_target:=coalesce(v_selected,(select coalesce(max(sort_order),0)+1 from public.recruitment_stage_policies where job_id=p_job_id and active=true));
  end if;

  update public.recruitment_stage_policies set sort_order=sort_order+1,updated_at=now()
  where job_id=p_job_id and active=true and sort_order>=v_target;

  insert into public.recruitment_stage_policies(job_id,stage,sort_order,active,assessment_required,passing_score,sla_hours,interview_required,rubric,updated_by,updated_at)
  values(p_job_id,v_name,v_target,true,coalesce(p_assessment_required,false),case when p_assessment_required then p_passing_score else null end,p_sla_hours,coalesce(p_interview_required,false),coalesce(p_rubric,'[]'::jsonb),auth.uid(),now())
  returning * into v_row;

  return jsonb_build_object('success',true,'id',v_row.id,'stage',v_row.stage,'sortOrder',v_row.sort_order);
end;
$function$;

create or replace function public.admin_reorder_recruitment_stages(p_job_id uuid, p_stage_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_count integer;
  v_distinct integer;
  v_names text[];
  v_role text;
  v_suffix text[];
  v_prefix text[];
  v_suffix_len integer;
  v_total integer;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if not exists(select 1 from public.career_jobs where id=p_job_id) then raise exception 'Job Post not found.'; end if;
  perform 1 from public.recruitment_stage_policies where job_id=p_job_id for update;

  select count(*) into v_count from public.recruitment_stage_policies where job_id=p_job_id and active=true;
  select count(distinct x) into v_distinct from unnest(coalesce(p_stage_ids,'{}'::uuid[])) x;
  if cardinality(coalesce(p_stage_ids,'{}'::uuid[]))<>v_count or v_distinct<>v_count then raise exception 'Reordering must include every active stage exactly once.'; end if;
  if exists(select 1 from unnest(p_stage_ids) x left join public.recruitment_stage_policies p on p.id=x and p.job_id=p_job_id and p.active=true where p.id is null) then raise exception 'One or more stages do not belong to this active pipeline.'; end if;

  select array_agg(p.stage order by u.ord) into v_names
  from unnest(p_stage_ids) with ordinality u(id,ord)
  join public.recruitment_stage_policies p on p.id=u.id;
  v_total:=cardinality(v_names);
  if v_total<2 then raise exception 'A recruitment pipeline requires at least two active stages.'; end if;
  if v_names[1]<>'New Application' then raise exception 'New Application is a protected intake stage and must remain first.'; end if;
  if v_names[v_total]<>'Activated' then raise exception 'Activated is a protected terminal stage and must remain last.'; end if;

  select coalesce(public.career_job_system_role(p_job_id),'pending') into v_role;
  if v_role='sales' then
    v_prefix:=array['New Application','Video Pending','Video Review'];
    v_suffix:=array['Selected','Agreement Pending','One-Day Training','Final Approval','Ready for System Access','Activated'];
    if v_total<cardinality(v_prefix) or v_names[1:cardinality(v_prefix)]<>v_prefix then raise exception 'The protected Sales intake sequence must remain New Application → Video Pending → Video Review.'; end if;
  elsif v_role='uiux_designer' then
    v_suffix:=array['Selected','Agreement Pending','Design Academy','Final Approval','Ready for System Access','Activated'];
  elsif v_role='developer' then
    v_suffix:=array['Selected','Agreement Pending','Developer Academy','Final Approval','Ready for System Access','Activated'];
  elsif v_role='content_writer' then
    v_suffix:=array['Selected','Content Academy','Practical Certification','Activated'];
  else
    v_suffix:=array['Selected','Activated'];
  end if;
  v_suffix_len:=cardinality(v_suffix);
  if v_total<v_suffix_len or v_names[(v_total-v_suffix_len+1):v_total]<>v_suffix then
    raise exception 'The protected selection, onboarding and activation sequence must remain intact at the end of this pipeline.';
  end if;

  update public.recruitment_stage_policies p
  set sort_order=u.ord::integer,updated_by=auth.uid(),updated_at=now()
  from unnest(p_stage_ids) with ordinality u(id,ord)
  where p.id=u.id and p.job_id=p_job_id and p.active=true;

  return jsonb_build_object('success',true,'stageCount',v_count);
end;
$function$;

create or replace function public.admin_remove_recruitment_stage(p_stage_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_row public.recruitment_stage_policies%rowtype;
  v_open integer;
  v_refs integer:=0;
  v_action text;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_row from public.recruitment_stage_policies where id=p_stage_id for update;
  if not found then raise exception 'Recruitment stage not found.'; end if;
  if not v_row.active then raise exception 'This stage is already archived.'; end if;
  if public.recruitment_stage_is_system_protected(v_row.job_id,v_row.stage) then raise exception 'This stage is protected because secure recruitment, agreement, training or activation workflows depend on it.'; end if;
  if (select count(*) from public.recruitment_stage_policies where job_id=v_row.job_id and active=true)<=2 then raise exception 'A recruitment pipeline must keep at least two active stages.'; end if;

  select count(*) into v_open from public.applicants a
  where a.career_job_id=v_row.job_id and a.stage=v_row.stage and coalesce(trim(a.refusal_reason),'')='' and a.stage<>'Activated';
  if v_open>0 then raise exception 'Move or close the candidate(s) currently in this stage before removing it.'; end if;

  v_refs:=v_refs+(select count(*) from public.applicants a where a.career_job_id=v_row.job_id and a.stage=v_row.stage);
  v_refs:=v_refs+(select count(*) from public.recruitment_assessments r where r.job_id=v_row.job_id and r.stage=v_row.stage);
  v_refs:=v_refs+(select count(*) from public.recruitment_interviews r join public.applicants a on a.id=r.applicant_id where a.career_job_id=v_row.job_id and r.stage=v_row.stage);
  v_refs:=v_refs+(select count(*) from public.recruitment_interview_skips r join public.applicants a on a.id=r.applicant_id where a.career_job_id=v_row.job_id and r.stage=v_row.stage);
  v_refs:=v_refs+(select count(*) from public.recruitment_task_instances r join public.applicants a on a.id=r.applicant_id where a.career_job_id=v_row.job_id and r.stage=v_row.stage);

  if v_refs>0 then
    update public.recruitment_stage_policies set active=false,updated_by=auth.uid(),updated_at=now() where id=v_row.id;
    v_action:='archived';
  else
    delete from public.recruitment_stage_policies where id=v_row.id;
    v_action:='deleted';
  end if;

  with ordered as (
    select id,row_number() over(order by sort_order,created_at,id)::integer rn
    from public.recruitment_stage_policies where job_id=v_row.job_id and active=true
  )
  update public.recruitment_stage_policies p set sort_order=o.rn,updated_at=now()
  from ordered o where p.id=o.id;

  return jsonb_build_object('success',true,'action',v_action,'stage',v_row.stage,'historyReferences',v_refs);
end;
$function$;

create or replace function public.admin_restore_recruitment_stage(p_stage_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_row public.recruitment_stage_policies%rowtype;
  v_target integer;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_row from public.recruitment_stage_policies where id=p_stage_id for update;
  if not found then raise exception 'Recruitment stage not found.'; end if;
  if v_row.active then return jsonb_build_object('success',true,'stage',v_row.stage,'alreadyActive',true); end if;
  perform 1 from public.recruitment_stage_policies where job_id=v_row.job_id for update;
  select sort_order into v_target from public.recruitment_stage_policies where job_id=v_row.job_id and stage='Selected' and active=true;
  v_target:=coalesce(v_target,(select coalesce(max(sort_order),0)+1 from public.recruitment_stage_policies where job_id=v_row.job_id and active=true));
  update public.recruitment_stage_policies set sort_order=sort_order+1,updated_at=now() where job_id=v_row.job_id and active=true and sort_order>=v_target;
  update public.recruitment_stage_policies set active=true,sort_order=v_target,updated_by=auth.uid(),updated_at=now() where id=v_row.id;
  return jsonb_build_object('success',true,'stage',v_row.stage,'sortOrder',v_target);
end;
$function$;

create or replace function public.admin_get_recruitment_source_funnel(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_job_id is not null and not exists(select 1 from public.career_jobs where id=p_job_id) then raise exception 'Job Post not found.'; end if;
  with base as(
    select a.career_job_id,
      coalesce(nullif(trim(a.utm_source),''),nullif(trim(a.heard_about_source),''),nullif(trim(a.source),''),'Unknown') source_key,
      coalesce(nullif(trim(a.utm_campaign),''),'') campaign,a.stage,a.refusal_reason
    from public.applicants a where p_job_id is null or a.career_job_id=p_job_id
  ), ranked as(
    select b.*,public.recruitment_stage_rank_for_job(b.career_job_id,b.stage) stage_rank,
      public.recruitment_stage_rank_for_job(b.career_job_id,'Shortlisted') shortlisted_rank,
      public.recruitment_stage_rank_for_job(b.career_job_id,'Selected') selected_rank
    from base b
  ), grouped as(
    select source_key,campaign,count(*) applications,
      count(*) filter(where coalesce(trim(refusal_reason),'')='' and ((shortlisted_rank is not null and stage_rank>=shortlisted_rank) or (shortlisted_rank is null and selected_rank is not null and stage_rank>=greatest(1,selected_rank-1)))) shortlisted,
      count(*) filter(where coalesce(trim(refusal_reason),'')='' and selected_rank is not null and stage_rank>=selected_rank) selected,
      count(*) filter(where stage='Activated') activated,
      count(*) filter(where coalesce(trim(refusal_reason),'')<>'') closed
    from ranked group by source_key,campaign
  )
  select coalesce(jsonb_agg(jsonb_build_object('source',source_key,'campaign',campaign,'applications',applications,'shortlisted',shortlisted,'selected',selected,'activated',activated,'closed',closed) order by applications desc,source_key,campaign),'[]'::jsonb)
  into v_result from grouped;
  return v_result;
end;
$function$;

create or replace function public.admin_get_recruitment_source_funnel()
returns jsonb
language sql
security definer
set search_path to 'public','pg_temp'
as $function$ select public.admin_get_recruitment_source_funnel(null::uuid); $function$;

revoke all on function public.admin_get_recruitment_pipeline_jobs() from public,anon;
revoke all on function public.admin_get_recruitment_stage_policies(uuid) from public,anon;
revoke all on function public.admin_create_recruitment_stage(uuid,text,text,integer,boolean,integer,boolean,jsonb) from public,anon;
revoke all on function public.admin_reorder_recruitment_stages(uuid,uuid[]) from public,anon;
revoke all on function public.admin_remove_recruitment_stage(uuid) from public,anon;
revoke all on function public.admin_restore_recruitment_stage(uuid) from public,anon;
revoke all on function public.admin_get_recruitment_source_funnel(uuid) from public,anon;
revoke all on function public.admin_get_recruitment_source_funnel() from public,anon;

grant execute on function public.admin_get_recruitment_pipeline_jobs() to authenticated,service_role;
grant execute on function public.admin_get_recruitment_stage_policies(uuid) to authenticated,service_role;
grant execute on function public.admin_create_recruitment_stage(uuid,text,text,integer,boolean,integer,boolean,jsonb) to authenticated,service_role;
grant execute on function public.admin_reorder_recruitment_stages(uuid,uuid[]) to authenticated,service_role;
grant execute on function public.admin_remove_recruitment_stage(uuid) to authenticated,service_role;
grant execute on function public.admin_restore_recruitment_stage(uuid) to authenticated,service_role;
grant execute on function public.admin_get_recruitment_source_funnel(uuid) to authenticated,service_role;
grant execute on function public.admin_get_recruitment_source_funnel() to authenticated,service_role;

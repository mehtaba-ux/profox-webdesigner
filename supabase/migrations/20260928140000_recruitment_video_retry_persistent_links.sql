-- Preserve all still-active Video Review retry links for one canonical retry task.
-- Resending or scheduled reminders no longer invalidate earlier retry-email links.
-- Scope is intentionally limited to sales_video_retry_v1.

create table if not exists public.recruitment_task_access_tokens (
  id uuid primary key default gen_random_uuid(),
  task_instance_id uuid not null references public.recruitment_task_instances(id) on delete cascade,
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  source text not null default 'notification_delivery',
  created_at timestamptz not null default now()
);

alter table public.recruitment_task_access_tokens enable row level security;
revoke all on table public.recruitment_task_access_tokens from public, anon, authenticated;

create index if not exists recruitment_task_access_tokens_task_idx
  on public.recruitment_task_access_tokens(task_instance_id, issued_at desc);

create index if not exists recruitment_task_access_tokens_active_idx
  on public.recruitment_task_access_tokens(task_instance_id)
  where revoked_at is null;

insert into public.recruitment_task_access_tokens(task_instance_id,token_hash,expires_at,source)
select t.id,t.token_hash,t.due_at,'legacy_current_video_retry'
from public.recruitment_task_instances t
where coalesce(t.template_snapshot->>'taskKey','')='sales_video_retry_v1'
  and t.token_hash is not null
  and t.status in('Issued','Viewed','In Progress')
on conflict(token_hash) do nothing;

create or replace function public.resolve_recruitment_task_by_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_hash text;
  v_task_id uuid;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then
    return null;
  end if;

  v_hash:=public.recruitment_task_token_hash(p_token);

  select at.task_instance_id
  into v_task_id
  from public.recruitment_task_access_tokens at
  join public.recruitment_task_instances t on t.id=at.task_instance_id
  where at.token_hash=v_hash
    and at.revoked_at is null
    and t.status in('Issued','Viewed','In Progress')
  order by at.issued_at desc
  limit 1;

  if v_task_id is not null then
    return v_task_id;
  end if;

  select t.id
  into v_task_id
  from public.recruitment_task_instances t
  where t.token_hash is not null and t.token_hash=v_hash
  limit 1;

  return v_task_id;
end;
$$;

revoke all on function public.resolve_recruitment_task_by_token(text) from public,anon,authenticated;

create or replace function public.service_prepare_recruitment_task_delivery(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_app public.applicants%rowtype;
  v_token text;
  v_token_hash text;
  v_task_key text;
  v_is_assessment_hub boolean;
  v_task_url text;
  v_previous_score int;
  v_passing_score int;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required.';end if;
  select * into v_task from public.recruitment_task_instances where id=p_task_id for update;
  if not found then raise exception 'Recruitment task not found.';end if;
  select * into v_app from public.applicants where id=v_task.applicant_id;
  v_task_key:=coalesce(v_task.template_snapshot->>'taskKey','');
  v_is_assessment_hub:=v_task_key='sales_assessment_hub';

  if v_task.status not in('Issued','Viewed','In Progress') then raise exception 'Recruitment task is not eligible for link delivery.';end if;
  if v_task.due_at<now() then raise exception 'Recruitment task deadline has passed.';end if;
  if v_app.closed_at is not null then raise exception 'Recruitment task is no longer active.';end if;

  if v_is_assessment_hub then
    if v_app.stage not in('Shortlisted','Sales Assessment','Lead Research Test','CRM Assessment','Selected','Agreement Pending','Sales Academy Training','Final Approval','Ready for System Access','Activated') then
      raise exception 'Assessment Preparation Center access is not available for the current recruitment stage.';
    end if;
  elsif v_app.stage<>v_task.stage then
    raise exception 'Recruitment task is no longer active.';
  end if;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_token_hash:=public.recruitment_task_token_hash(v_token);

  if v_task_key='sales_video_retry_v1' then
    insert into public.recruitment_task_access_tokens(task_instance_id,token_hash,expires_at,source)
    values(v_task.id,v_token_hash,v_task.due_at,'notification_delivery')
    on conflict(token_hash) do nothing;
  end if;

  update public.recruitment_task_instances
  set token_hash=v_token_hash,updated_at=now()
  where id=v_task.id;

  v_task_url:=case
    when v_is_assessment_hub then 'https://calabtayklhltyiriiwo.supabase.co/functions/v1/sales-assessment-hub?token='||v_token
    when v_task_key='content_writer_portfolio_v2' then 'https://www.profoxwebdesigner.com/recruitment/content-portfolio/'||v_token
    when v_task_key='sales_video_retry_v1' then 'https://www.profoxwebdesigner.com/recruitment/video-retry/'||v_token
    else 'https://www.profoxwebdesigner.com/recruitment/task/'||v_token
  end;

  if v_task_key='sales_video_retry_v1' then
    select score,passing_score_snapshot
    into v_previous_score,v_passing_score
    from public.recruitment_assessments
    where applicant_id=v_task.applicant_id
      and stage=v_task.stage
      and attempt_no=v_task.attempt_no-1
    limit 1;
  end if;

  return jsonb_build_object(
    'taskUrl',v_task_url,
    'taskKey',v_task_key,
    'taskTitle',v_task.template_snapshot->>'title',
    'taskDueDate',to_char(v_task.due_at at time zone 'UTC','Mon DD, YYYY HH24:MI "UTC"'),
    'taskEstimatedTime',(v_task.template_snapshot->>'estimatedMinutes')||' minutes',
    'taskRequiredItems',v_task.template_snapshot->>'requiredItems',
    'taskTargetMarket',v_task.template_snapshot->>'targetMarket',
    'taskTargetNiche',v_task.template_snapshot->>'targetNiche',
    'taskAttempt',v_task.attempt_no,
    'taskFeedback',coalesce(nullif(v_task.retry_feedback,''),'Review the first response carefully and submit a clearer, more specific replacement video.'),
    'previousScore',v_previous_score,
    'passingScore',v_passing_score
  );
end;
$$;

revoke all on function public.service_prepare_recruitment_task_delivery(uuid) from public,anon,authenticated;
grant execute on function public.service_prepare_recruitment_task_delivery(uuid) to service_role;

create or replace function public.public_open_recruitment_task(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_task_id uuid;
  v_app public.applicants%rowtype;
  v_submission public.recruitment_task_submissions%rowtype;
  v_now timestamptz:=now();
  v_can_edit boolean;
  v_task_key text;
  v_default jsonb;
  v_previous_score int;
  v_passing_score int;
  v_role_title text;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then raise exception 'Invalid task link.';end if;

  v_task_id:=public.resolve_recruitment_task_by_token(p_token);
  if v_task_id is null then raise exception 'This task link is invalid or no longer active.';end if;

  select * into v_task
  from public.recruitment_task_instances
  where id=v_task_id
  for update;
  if not found then raise exception 'This task link is invalid or no longer active.';end if;

  perform public.check_recruitment_task_rate_limit(v_task.id,'open',120);
  select * into v_app from public.applicants where id=v_task.applicant_id;
  select * into v_submission from public.recruitment_task_submissions where task_instance_id=v_task.id;

  if v_task.status='Revoked' then raise exception 'This task link has been revoked. Contact the ProFox Recruitment Team.';end if;

  v_task_key:=coalesce(v_task.template_snapshot->>'taskKey','');
  v_default:=case
    when v_task_key='content_writer_portfolio_v2' then '{"portfolioCases":[]}'::jsonb
    when v_task_key='sales_video_retry_v1' then '{"videoUrl":"","candidateNote":""}'::jsonb
    else '{"leads":[]}'::jsonb
  end;

  if v_task.viewed_at is null then
    update public.recruitment_task_instances
    set viewed_at=v_now,status=case when status='Issued' then 'Viewed' else status end,updated_at=v_now
    where id=v_task.id
    returning * into v_task;

    insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata)
    values(
      v_task.applicant_id,
      'Recruitment',
      case when v_task_key='sales_video_retry_v1' then 'Video Retry Opened' else 'Task Viewed' end,
      coalesce(v_task.template_snapshot->>'title','Recruitment task')||' opened',
      case when v_task_key='sales_video_retry_v1'
        then 'Candidate opened secure interview-video retry attempt '||v_task.attempt_no||'.'
        else 'Candidate opened secure recruitment task attempt '||v_task.attempt_no||'.'
      end,
      'Candidate',
      'recruitment_task_instances',
      v_task.id,
      jsonb_build_object('stage',v_task.stage,'attemptNo',v_task.attempt_no,'taskKey',v_task_key)
    );
  end if;

  if v_task_key='sales_video_retry_v1' then
    select score,passing_score_snapshot
    into v_previous_score,v_passing_score
    from public.recruitment_assessments
    where applicant_id=v_task.applicant_id
      and stage=v_task.stage
      and attempt_no=v_task.attempt_no-1
    limit 1;

    select coalesce(j.title,v_app.position,'Sales Representative')
    into v_role_title
    from public.career_jobs j
    where j.id=v_app.career_job_id;
  end if;

  v_can_edit:=v_task.status in('Issued','Viewed','In Progress')
    and v_task.due_at>=v_now
    and v_app.closed_at is null
    and v_app.stage=v_task.stage;

  return jsonb_build_object(
    'taskKey',v_task_key,
    'stage',v_task.stage,
    'title',v_task.template_snapshot->>'title',
    'description',v_task.template_snapshot->>'description',
    'targetMarket',v_task.template_snapshot->>'targetMarket',
    'targetNiche',v_task.template_snapshot->>'targetNiche',
    'requiredItems',(v_task.template_snapshot->>'requiredItems')::integer,
    'estimatedMinutes',(v_task.template_snapshot->>'estimatedMinutes')::integer,
    'instructions',coalesce(v_task.template_snapshot->'instructions','[]'::jsonb),
    'attemptNo',v_task.attempt_no,
    'maxAttempts',(v_task.template_snapshot->>'maxAttempts')::integer,
    'candidateName',v_app.full_name,
    'applicationReference',v_app.application_reference,
    'status',v_task.status,
    'issuedAt',v_task.issued_at,
    'dueAt',v_task.due_at,
    'submittedAt',v_task.submitted_at,
    'retryFeedback',v_task.retry_feedback,
    'previousScore',v_previous_score,
    'passingScore',v_passing_score,
    'roleTitle',v_role_title,
    'expired',v_task.due_at<v_now,
    'canEdit',v_can_edit,
    'answers',case when v_task.submitted_at is null
      then coalesce(v_submission.draft_data,v_default)
      else coalesce(v_submission.final_data,v_submission.draft_data,v_default)
    end
  );
end;
$$;

revoke all on function public.public_open_recruitment_task(text) from public,authenticated;
grant execute on function public.public_open_recruitment_task(text) to anon,authenticated,service_role;

create or replace function public.public_save_recruitment_task_draft(p_token text,p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_task_id uuid;
  v_app public.applicants%rowtype;
  v_required integer;
  v_first_save boolean;
  v_task_key text;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then raise exception 'Invalid task link.'; end if;

  v_task_id:=public.resolve_recruitment_task_by_token(p_token);
  if v_task_id is null then raise exception 'This task link is invalid or no longer active.'; end if;

  select * into v_task
  from public.recruitment_task_instances
  where id=v_task_id
  for update;
  if not found then raise exception 'This task link is invalid or no longer active.'; end if;

  perform public.check_recruitment_task_rate_limit(v_task.id,'save',600);
  select * into v_app from public.applicants where id=v_task.applicant_id;

  if v_task.status not in('Issued','Viewed','In Progress') then raise exception 'This task is no longer editable.'; end if;
  if v_task.due_at<now() then raise exception 'This task deadline has passed. Contact the ProFox Recruitment Team if you need an extension.'; end if;
  if v_app.closed_at is not null or v_app.stage<>v_task.stage then raise exception 'This recruitment task is no longer active.'; end if;

  v_required:=(v_task.template_snapshot->>'requiredItems')::integer;
  v_task_key:=coalesce(v_task.template_snapshot->>'taskKey','');

  if v_task_key='sales_video_retry_v1' then
    perform public.assert_recruitment_video_retry_answers(p_answers,false);
  else
    perform public.assert_recruitment_task_answers(p_answers,v_required,false);
  end if;

  v_first_save:=v_task.first_saved_at is null;

  insert into public.recruitment_task_submissions(task_instance_id,draft_data,save_count,last_saved_at,updated_at)
  values(v_task.id,p_answers,1,now(),now())
  on conflict(task_instance_id) do update set
    draft_data=excluded.draft_data,
    save_count=public.recruitment_task_submissions.save_count+1,
    last_saved_at=now(),
    updated_at=now();

  update public.recruitment_task_instances
  set status='In Progress',first_saved_at=coalesce(first_saved_at,now()),last_saved_at=now(),updated_at=now()
  where id=v_task.id;

  if v_first_save then
    insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata)
    values(
      v_task.applicant_id,
      'Recruitment',
      case when v_task_key='sales_video_retry_v1' then 'Video Retry Started' else 'Task Started' end,
      case when v_task_key='sales_video_retry_v1' then 'Interview-video retry started' else 'Practical task started' end,
      case when v_task_key='sales_video_retry_v1'
        then 'Candidate saved the first draft for interview-video retry attempt '||v_task.attempt_no||'.'
        else 'Candidate saved the first draft for attempt '||v_task.attempt_no||'.'
      end,
      'Candidate',
      'recruitment_task_instances',
      v_task.id,
      jsonb_build_object('stage',v_task.stage,'attemptNo',v_task.attempt_no,'taskKey',v_task_key)
    );
  end if;

  return jsonb_build_object('success',true,'savedAt',now(),'status','In Progress');
end;
$$;

revoke all on function public.public_save_recruitment_task_draft(text,jsonb) from public,authenticated;
grant execute on function public.public_save_recruitment_task_draft(text,jsonb) to anon,authenticated,service_role;

create or replace function public.public_submit_recruitment_task(p_token text,p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_task_id uuid;
  v_app public.applicants%rowtype;
  v_required integer;
  v_admin record;
  v_payload jsonb;
  v_task_key text;
  v_is_content boolean;
  v_is_video_retry boolean;
  v_title text;
  v_previous_score int;
  v_passing_score int;
  v_admin_url text;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then raise exception 'Invalid task link.';end if;

  v_task_id:=public.resolve_recruitment_task_by_token(p_token);
  if v_task_id is null then raise exception 'This task link is invalid or no longer active.';end if;

  select * into v_task
  from public.recruitment_task_instances
  where id=v_task_id
  for update;
  if not found then raise exception 'This task link is invalid or no longer active.';end if;

  perform public.check_recruitment_task_rate_limit(v_task.id,'submit',20);

  if v_task.status in('Submitted','Under Review','Passed','Retry Required','Failed') then
    return jsonb_build_object('success',true,'alreadySubmitted',true,'submittedAt',v_task.submitted_at);
  end if;

  select * into v_app from public.applicants where id=v_task.applicant_id;
  if v_task.status='Revoked' then raise exception 'This task link has been revoked.';end if;
  if v_task.due_at<now() then raise exception 'This task deadline has passed. Contact the ProFox Recruitment Team if you need an extension.';end if;
  if v_app.closed_at is not null or v_app.stage<>v_task.stage then raise exception 'This recruitment task is no longer active.';end if;

  v_required:=(v_task.template_snapshot->>'requiredItems')::integer;
  v_task_key:=coalesce(v_task.template_snapshot->>'taskKey','');
  v_is_content:=v_task_key='content_writer_portfolio_v2';
  v_is_video_retry:=v_task_key='sales_video_retry_v1';
  v_title:=coalesce(v_task.template_snapshot->>'title','Recruitment task');

  if v_is_video_retry then
    perform public.assert_recruitment_video_retry_answers(p_answers,true);
  else
    perform public.assert_recruitment_task_answers(p_answers,v_required,true);
  end if;

  insert into public.recruitment_task_submissions(task_instance_id,draft_data,final_data,save_count,last_saved_at,submitted_at,updated_at)
  values(v_task.id,p_answers,p_answers,1,now(),now(),now())
  on conflict(task_instance_id) do update set
    draft_data=excluded.draft_data,
    final_data=excluded.final_data,
    save_count=public.recruitment_task_submissions.save_count+1,
    last_saved_at=now(),
    submitted_at=now(),
    updated_at=now();

  update public.recruitment_task_instances
  set status='Submitted',submitted_at=now(),last_saved_at=now(),token_hash=null,updated_at=now()
  where id=v_task.id
  returning * into v_task;

  if v_is_video_retry then
    update public.recruitment_task_access_tokens
    set revoked_at=coalesce(revoked_at,now())
    where task_instance_id=v_task.id and revoked_at is null;
  end if;

  insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata)
  values(
    v_task.applicant_id,
    'Recruitment',
    case when v_is_video_retry then 'Video Retry Submitted' else 'Task Submitted' end,
    case when v_is_video_retry then 'Interview-video retry submitted' else v_title||' submitted' end,
    case when v_is_video_retry
      then 'Candidate submitted secure interview-video retry attempt '||v_task.attempt_no||' for review.'
      else 'Candidate submitted secure recruitment task attempt '||v_task.attempt_no||' for review.'
    end,
    'Candidate',
    'recruitment_task_instances',
    v_task.id,
    jsonb_build_object(
      'stage',v_task.stage,
      'attemptNo',v_task.attempt_no,
      'submittedAt',v_task.submitted_at,
      'taskKey',v_task_key,
      'videoUrl',case when v_is_video_retry then p_answers->>'videoUrl' else null end
    )
  );

  update public.notification_outbox
  set status='Cancelled',last_error='Candidate submitted the Video Review retry.',updated_at=now()
  where v_is_video_retry
    and dedupe_key like 'recruitment-video-retry:'||v_task.id::text||':%'
    and status in('Pending','Retry');

  if v_is_video_retry then
    select score,passing_score_snapshot
    into v_previous_score,v_passing_score
    from public.recruitment_assessments
    where applicant_id=v_task.applicant_id and stage=v_task.stage and attempt_no=v_task.attempt_no-1
    limit 1;
  end if;

  v_admin_url:='https://www.profoxwebdesigner.com/admin/app/recruitment?applicantId='||v_task.applicant_id::text;

  v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object(
    'taskTitle',v_title,
    'taskAttempt',v_task.attempt_no,
    'taskSubmittedAt',to_char(v_task.submitted_at at time zone 'UTC','Mon DD, YYYY HH24:MI "UTC"'),
    'previousScore',v_previous_score,
    'passingScore',v_passing_score,
    'adminReviewUrl',v_admin_url
  );

  perform public.enqueue_notification(
    'recruitment-task:'||v_task.id::text||':submitted',
    case
      when v_is_video_retry then 'recruitment_video_retry_submission_received'
      when v_is_content then 'content_recruitment_portfolio_submitted'
      else 'recruitment_task_submission_received'
    end,
    v_app.email,
    null,
    v_payload,
    now()
  );

  for v_admin in
    select up.id,up.email
    from public.user_profiles up
    where up.status='active' and up.role='admin'
  loop
    perform public.enqueue_in_app_notification(
      v_admin.id,
      'Recruitment',
      case when v_is_video_retry then 'Interview retry ready for review' else v_title||' ready for review' end,
      case when v_is_video_retry
        then v_app.full_name||' submitted interview-video retry attempt '||v_task.attempt_no||'. Attempt #'||(v_task.attempt_no-1)||' remains preserved.'
        else v_app.full_name||' submitted '||v_title||' attempt '||v_task.attempt_no||'.'
      end,
      '/admin/app/recruitment?applicantId='||v_task.applicant_id::text,
      'recruitment-task-review:'||v_task.id::text||':'||v_admin.id::text
    );

    if v_is_video_retry
       and nullif(btrim(coalesce(v_admin.email,'')),'') is not null
       and not exists(
         select 1
         from public.email_recipient_suppressions s
         where lower(s.email)=lower(btrim(v_admin.email)) and s.active=true
       ) then
      perform public.enqueue_notification(
        'recruitment-video-retry-admin:'||v_task.id::text||':'||v_admin.id::text,
        'recruitment_video_retry_admin_submitted',
        v_admin.email,
        v_admin.id,
        v_payload,
        now()
      );
    end if;
  end loop;

  return jsonb_build_object('success',true,'submittedAt',v_task.submitted_at,'status','Submitted');
end;
$$;

revoke all on function public.public_submit_recruitment_task(text,jsonb) from public,authenticated;
grant execute on function public.public_submit_recruitment_task(text,jsonb) to anon,authenticated,service_role;

create or replace function public.admin_resend_recruitment_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_app public.applicants%rowtype;
  v_template_key text;
  v_payload jsonb;
  v_task_key text;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select * into v_task from public.recruitment_task_instances where id=p_task_id for update;
  if not found then raise exception 'Recruitment task not found.'; end if;
  if v_task.status not in('Issued','Viewed','In Progress') then raise exception 'Only an active editable task link can be resent.'; end if;
  if v_task.due_at<now() then raise exception 'Extend the expired deadline before resending this task.'; end if;

  select * into v_app from public.applicants where id=v_task.applicant_id;
  v_task_key:=coalesce(v_task.template_snapshot->>'taskKey','');

  if v_task_key<>'sales_video_retry_v1' then
    update public.recruitment_task_instances set token_hash=null,updated_at=now() where id=v_task.id;
  end if;

  v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object('taskInstanceId',v_task.id);
  v_template_key:=case
    when v_task_key='sales_video_retry_v1' then 'recruitment_video_retry_invitation'
    when v_task_key='content_writer_portfolio_v2' and v_task.attempt_no>1 then 'content_recruitment_portfolio_retry'
    when v_task_key='content_writer_portfolio_v2' then 'content_recruitment_portfolio'
    when v_task.attempt_no>1 then 'recruitment_lead_research_retry'
    else 'recruitment_lead_research'
  end;

  perform public.enqueue_notification(
    'recruitment-task:'||v_task.id::text||':resend:'||extract(epoch from clock_timestamp())::bigint,
    v_template_key,
    v_app.email,
    null,
    v_payload,
    now()
  );

  insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,actor_user_id,source_table,source_id,metadata)
  values(
    v_task.applicant_id,
    'Recruitment',
    'Task Link Resent',
    coalesce(v_task.template_snapshot->>'title','Recruitment task')||' link resent',
    case when v_task_key='sales_video_retry_v1'
      then 'Admin requested another secure retry link. Previously issued active Video Review retry links remain valid for the same attempt.'
      else 'Admin invalidated the previous task link and requested a new secure link.'
    end,
    'Admin',
    auth.uid(),
    'recruitment_task_instances',
    v_task.id,
    jsonb_build_object('attemptNo',v_task.attempt_no,'taskKey',v_task_key)
  );

  return jsonb_build_object('success',true);
end;
$$;

create or replace function public.admin_extend_recruitment_task_deadline(p_task_id uuid,p_hours integer)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_app public.applicants%rowtype;
  v_payload jsonb;
  v_task_key text;
  v_template_key text;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_hours is null or p_hours<1 or p_hours>336 then raise exception 'Extension must be between 1 and 336 hours.'; end if;

  select * into v_task from public.recruitment_task_instances where id=p_task_id for update;
  if not found then raise exception 'Recruitment task not found.'; end if;
  if v_task.status not in('Issued','Viewed','In Progress') then raise exception 'Only an active editable task can be extended.'; end if;

  select * into v_app from public.applicants where id=v_task.applicant_id;
  v_task_key:=coalesce(v_task.template_snapshot->>'taskKey','');

  update public.recruitment_task_instances
  set due_at=greatest(due_at,now())+make_interval(hours=>p_hours),
      token_hash=case when v_task_key='sales_video_retry_v1' then token_hash else null end,
      updated_at=now()
  where id=v_task.id
  returning * into v_task;

  if v_task_key='sales_video_retry_v1' then
    update public.recruitment_task_access_tokens
    set expires_at=v_task.due_at
    where task_instance_id=v_task.id and revoked_at is null;
  end if;

  v_template_key:=case
    when v_task_key='sales_video_retry_v1' then 'recruitment_video_retry_deadline_extended'
    when v_task_key='content_writer_portfolio_v2' then 'content_recruitment_portfolio_deadline_extended'
    else 'recruitment_task_deadline_extended'
  end;

  v_payload:=public.recruitment_notification_payload(v_app)
    ||jsonb_build_object('taskInstanceId',v_task.id,'taskExtensionHours',p_hours);

  perform public.enqueue_notification(
    'recruitment-task:'||v_task.id::text||':extension:'||extract(epoch from clock_timestamp())::bigint,
    v_template_key,
    v_app.email,
    null,
    v_payload,
    now()
  );

  if v_task_key='sales_video_retry_v1' then
    perform public.schedule_sales_video_retry_followups(v_task.id);
  end if;

  insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,actor_user_id,source_table,source_id,metadata)
  values(
    v_task.applicant_id,
    'Recruitment',
    'Task Deadline Extended',
    coalesce(v_task.template_snapshot->>'title','Recruitment task')||' deadline extended',
    case when v_task_key='sales_video_retry_v1'
      then 'Admin extended the retry deadline by '||p_hours||' hours. Existing active Video Review retry links remain valid.'
      else 'Admin extended the deadline by '||p_hours||' hours and invalidated the previous link.'
    end,
    'Admin',
    auth.uid(),
    'recruitment_task_instances',
    v_task.id,
    jsonb_build_object(
      'attemptNo',v_task.attempt_no,
      'dueAt',v_task.due_at,
      'extensionHours',p_hours,
      'taskKey',v_task_key,
      'notificationTemplate',v_template_key
    )
  );

  return jsonb_build_object('success',true,'dueAt',v_task.due_at);
end;
$$;

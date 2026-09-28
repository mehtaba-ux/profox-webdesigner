-- Keep Sales Video Review retry workflow operational when an Admin email is suppressed.
-- Forward-only follow-up to 20260928121000_sales_video_review_retry_workflow.sql.

create or replace function public.schedule_sales_video_retry_followups(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.recruitment_task_instances%rowtype;
  v_app public.applicants%rowtype;
  v_payload jsonb;
  v_admin record;
begin
  select * into v_task from public.recruitment_task_instances where id=p_task_id;
  if not found or coalesce(v_task.template_snapshot->>'taskKey','')<>'sales_video_retry_v1' then return; end if;

  select * into v_app from public.applicants where id=v_task.applicant_id;
  if not found or v_app.closed_at is not null then return; end if;

  update public.notification_outbox
  set status='Cancelled',
      last_error='Superseded by refreshed Video Review retry follow-up schedule.',
      updated_at=now()
  where dedupe_key like 'recruitment-video-retry:'||v_task.id::text||':%'
    and status in('Pending','Retry');

  v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object('taskInstanceId',v_task.id);

  if v_task.due_at>now()+interval '25 hours' then
    perform public.enqueue_notification(
      'recruitment-video-retry:'||v_task.id::text||':reminder',
      'recruitment_video_retry_reminder',
      v_app.email,
      null,
      v_payload,
      greatest(now()+interval '30 minutes',v_task.due_at-interval '24 hours')
    );
  end if;

  if v_task.due_at>now()+interval '7 hours' then
    perform public.enqueue_notification(
      'recruitment-video-retry:'||v_task.id::text||':final-reminder',
      'recruitment_video_retry_final_reminder',
      v_app.email,
      null,
      v_payload,
      greatest(now()+interval '45 minutes',v_task.due_at-interval '6 hours')
    );
  end if;

  for v_admin in
    select up.id,up.email
    from public.user_profiles up
    where up.status='active'
      and up.role='admin'
      and nullif(btrim(coalesce(up.email,'')),'') is not null
      and not exists(
        select 1
        from public.email_recipient_suppressions s
        where lower(s.email)=lower(btrim(up.email))
          and s.active=true
      )
  loop
    perform public.enqueue_notification(
      'recruitment-video-retry:'||v_task.id::text||':overdue:'||v_admin.id::text,
      'recruitment_video_retry_overdue_admin',
      v_admin.email,
      v_admin.id,
      public.recruitment_notification_payload(v_app)||jsonb_build_object(
        'taskAttempt',v_task.attempt_no,
        'taskDueDate',to_char(v_task.due_at at time zone 'UTC','Mon DD, YYYY HH24:MI "UTC"')
      ),
      v_task.due_at+interval '1 hour'
    );
  end loop;
end;
$$;

revoke all on function public.schedule_sales_video_retry_followups(uuid) from public,anon,authenticated;
grant execute on function public.schedule_sales_video_retry_followups(uuid) to service_role;

create or replace function public.public_submit_recruitment_task(p_token text,p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_task public.recruitment_task_instances%rowtype;
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
  select * into v_task
  from public.recruitment_task_instances
  where token_hash is not null and token_hash=public.recruitment_task_token_hash(p_token)
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

  insert into public.recruitment_task_submissions(
    task_instance_id,draft_data,final_data,save_count,last_saved_at,submitted_at,updated_at
  )
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

  insert into public.applicant_events(
    applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata
  )
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
    where applicant_id=v_task.applicant_id
      and stage=v_task.stage
      and attempt_no=v_task.attempt_no-1
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
    where up.status='active'
      and up.role='admin'
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
         where lower(s.email)=lower(btrim(v_admin.email))
           and s.active=true
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

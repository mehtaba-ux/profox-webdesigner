-- Sales Video Review retry workflow
-- Reuses canonical recruitment assessments, secure recruitment task instances,
-- notification outbox/provider delivery events, applicant timeline and admin workflow.

do $preflight$
begin
  if to_regclass('public.recruitment_assessments') is null
     or to_regclass('public.recruitment_task_instances') is null
     or to_regclass('public.recruitment_task_submissions') is null
     or to_regclass('public.notification_outbox') is null
     or to_regclass('public.email_delivery_events') is null
     or to_regprocedure('public.issue_recruitment_task_internal(uuid,text,text,boolean)') is null
     or to_regprocedure('public.enqueue_notification(text,text,text,uuid,jsonb,timestamp with time zone)') is null then
    raise exception 'Sales Video Review retry workflow dependencies are missing.';
  end if;
end;
$preflight$;

do $template$
begin
  if exists(select 1 from public.recruitment_task_templates where task_key='sales_video_retry_v1') then
    update public.recruitment_task_templates
    set system_role='sales',stage='Video Review',title='ProFox Introduction Video Retry',
        description='Submit a new 60-120 second English introduction video for a separate Video Review assessment attempt.',
        target_market='',target_niche='',required_items=1,deadline_hours=72,estimated_minutes=10,max_attempts=3,
        instructions='[
          "Record a new 60-120 second introduction video in English.",
          "Answer clearly and specifically. Use real examples from your sales experience where relevant.",
          "Keep your delivery professional, confident and easy to understand.",
          "Use a shareable link that opens without requesting access.",
          "Do not edit or replace your first submission; this retry is stored as a separate attempt."
        ]'::jsonb,
        version=greatest(version,1)+1,active=true,updated_at=now()
    where task_key='sales_video_retry_v1';
  else
    insert into public.recruitment_task_templates(
      task_key,system_role,stage,title,description,target_market,target_niche,required_items,
      deadline_hours,estimated_minutes,max_attempts,instructions,version,active
    ) values(
      'sales_video_retry_v1','sales','Video Review','ProFox Introduction Video Retry',
      'Submit a new 60-120 second English introduction video for a separate Video Review assessment attempt.',
      '','',1,72,10,3,
      '[
        "Record a new 60-120 second introduction video in English.",
        "Answer clearly and specifically. Use real examples from your sales experience where relevant.",
        "Keep your delivery professional, confident and easy to understand.",
        "Use a shareable link that opens without requesting access.",
        "Do not edit or replace your first submission; this retry is stored as a separate attempt."
      ]'::jsonb,1,true
    );
  end if;
end;
$template$;

insert into public.notification_templates(template_key,name,subject_template,body_template,html_template,active,description)
values
(
  'recruitment_video_retry_invitation',
  'Recruitment - introduction video retry',
  'Action required: Please retry your ProFox introduction video',
  $text$Hi {{fullName}},

Thank you for completing your first ProFox introduction-video review.

We would like to give you another opportunity to complete this stage.

Previous assessment: {{previousScore}}%
Required score: {{passingScore}}%
New attempt: #{{taskAttempt}}
Deadline: {{taskDueDate}}

Your first video and assessment will remain on record. This retry creates a separate new attempt.

What to do:
1. Record a new 60-120 second English introduction video.
2. Answer clearly and use specific examples from your sales experience.
3. Make sure your shareable video link can be opened without requesting access.
4. Submit the new link before the deadline.

Reviewer guidance:
{{taskFeedback}}

Submit your retry here:
{{taskUrl}}

Use the latest ProFox email if you receive a newer secure link.

ProFox Recruitment Team
ProFox Web Designer$text$,
  $html$<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table width="100%" role="presentation" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px"><table width="640" role="presentation" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><tr><td style="height:5px;background:#000080"></td></tr><tr><td style="padding:30px"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#000080">PROFOX RECRUITMENT</div><h1 style="font-size:26px;line-height:1.25;margin:9px 0 12px">Please retry your introduction video</h1><p style="font-size:15px;line-height:1.7;margin:0 0 16px">Hi {{fullName}},</p><p style="font-size:15px;line-height:1.7;margin:0 0 18px">Thank you for completing your first video review. We would like to give you another opportunity to complete this stage. <strong>Your application remains active.</strong></p><table width="100%" role="presentation" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px"><tr><td style="padding:16px;font-size:14px;line-height:1.9"><strong>Previous assessment:</strong> {{previousScore}}%<br><strong>Required score:</strong> {{passingScore}}%<br><strong>New attempt:</strong> #{{taskAttempt}}<br><strong>Deadline:</strong> {{taskDueDate}}</td></tr></table><p style="font-size:14px;line-height:1.7;color:#475569;margin:18px 0"><strong>Your first attempt will not be deleted or replaced.</strong> This secure link creates a separate retry submission.</p><div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:16px"><div style="font-size:12px;font-weight:800;color:#000080;text-transform:uppercase;letter-spacing:.08em">What to improve</div><p style="font-size:14px;line-height:1.7;margin:8px 0 0;color:#334155">{{taskFeedback}}</p></div><h2 style="font-size:17px;margin:22px 0 10px">Before you submit</h2><ol style="padding-left:20px;color:#475569;font-size:14px;line-height:1.8"><li>Record a new 60-120 second video in English.</li><li>Answer clearly and use specific sales examples where relevant.</li><li>Make sure your link opens without requesting access.</li><li>Submit it before the deadline above.</li></ol><p style="margin:24px 0"><a href="{{taskUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:800">Submit My Retry Video</a></p><p style="font-size:12px;line-height:1.6;color:#64748b">For security, use the latest ProFox email if you later receive a newer secure link.</p><hr style="border:0;border-top:1px solid #e2e8f0;margin:25px 0"><p style="font-size:13px;line-height:1.6;color:#475569"><strong>ProFox Recruitment Team</strong><br>ProFox Web Designer<br><a href="mailto:admin@profoxwebdesigner.com" style="color:#000080">admin@profoxwebdesigner.com</a></p></td></tr></table></td></tr></table></body></html>$html$,
  true,
  'Candidate invitation when a Video Review assessment requires another attempt.'
),
(
  'recruitment_video_retry_reminder',
  'Recruitment - introduction video retry reminder',
  'Reminder: Your ProFox introduction-video retry is still pending',
  $text$Hi {{fullName}},

Your ProFox introduction-video retry is still pending.

Attempt: #{{taskAttempt}}
Deadline: {{taskDueDate}}

Please submit your new shareable video link before the deadline:
{{taskUrl}}

Your first attempt remains on record. Use the latest ProFox email for the current secure link.

ProFox Recruitment Team$text$,
  $html$<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table width="100%" role="presentation"><tr><td align="center" style="padding:28px 12px"><table width="640" role="presentation" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><tr><td style="height:5px;background:#000080"></td></tr><tr><td style="padding:30px"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#000080">PROFOX RECRUITMENT</div><h1 style="font-size:24px;margin:9px 0 14px">Your video retry is still pending</h1><p style="font-size:15px;line-height:1.7">Hi {{fullName}},</p><p style="font-size:15px;line-height:1.7">We have not yet received your replacement introduction video.</p><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;font-size:14px;line-height:1.8"><strong>Attempt:</strong> #{{taskAttempt}}<br><strong>Deadline:</strong> {{taskDueDate}}</div><p style="margin:22px 0"><a href="{{taskUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:800">Continue My Video Retry</a></p><p style="font-size:12px;line-height:1.6;color:#64748b">Use the latest ProFox email for the current secure link. Your first attempt remains on record.</p></td></tr></table></td></tr></table></body></html>$html$,
  true,
  'Candidate reminder before the Video Review retry deadline.'
),
(
  'recruitment_video_retry_final_reminder',
  'Recruitment - introduction video retry final reminder',
  'Final reminder: Submit your ProFox introduction-video retry',
  $text$Hi {{fullName}},

This is a final reminder that your introduction-video retry has not yet been submitted.

Attempt: #{{taskAttempt}}
Deadline: {{taskDueDate}}

If you want to continue with your ProFox application, please submit the new video link before the deadline:
{{taskUrl}}

ProFox Recruitment Team$text$,
  $html$<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table width="100%" role="presentation"><tr><td align="center" style="padding:28px 12px"><table width="640" role="presentation" style="width:100%;max-width:640px;background:#fff;border:1px solid #fed7aa;border-radius:16px;overflow:hidden"><tr><td style="height:5px;background:#b45309"></td></tr><tr><td style="padding:30px"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#b45309">FINAL REMINDER</div><h1 style="font-size:24px;margin:9px 0 14px">Submit your video retry before the deadline</h1><p style="font-size:15px;line-height:1.7">Hi {{fullName}},</p><p style="font-size:15px;line-height:1.7">Your replacement introduction video is still pending.</p><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px;font-size:14px;line-height:1.8"><strong>Attempt:</strong> #{{taskAttempt}}<br><strong>Deadline:</strong> {{taskDueDate}}</div><p style="margin:22px 0"><a href="{{taskUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:800">Submit My Retry Video</a></p><p style="font-size:12px;line-height:1.6;color:#64748b">Use the latest ProFox email for the current secure link.</p></td></tr></table></td></tr></table></body></html>$html$,
  true,
  'Final candidate reminder before the Video Review retry deadline.'
),
(
  'recruitment_video_retry_submission_received',
  'Recruitment - video retry submission received',
  'Interview retry received - ProFox',
  $text$Hi {{fullName}},

We successfully received your new introduction-video submission.

Application: {{applicationReference}}
Attempt: #{{taskAttempt}}
Submitted: {{taskSubmittedAt}}

No further action is required from you right now. The ProFox Recruitment Team has been notified and will review this as a separate assessment attempt.

Your first video and assessment remain on record.

ProFox Recruitment Team$text$,
  $html$<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table width="100%" role="presentation"><tr><td align="center" style="padding:28px 12px"><table width="640" role="presentation" style="width:100%;max-width:640px;background:#fff;border:1px solid #bbf7d0;border-radius:16px;overflow:hidden"><tr><td style="height:5px;background:#16a34a"></td></tr><tr><td style="padding:30px"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#15803d">SUBMISSION RECEIVED</div><h1 style="font-size:24px;margin:9px 0 14px">Your retry video is with our Recruitment Team</h1><p style="font-size:15px;line-height:1.7">Hi {{fullName}},</p><p style="font-size:15px;line-height:1.7">We successfully received your new introduction-video submission.</p><div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;font-size:14px;line-height:1.8"><strong>Application:</strong> {{applicationReference}}<br><strong>Attempt:</strong> #{{taskAttempt}}<br><strong>Submitted:</strong> {{taskSubmittedAt}}</div><p style="font-size:14px;line-height:1.7;color:#475569">No further action is required from you right now. We will review this as a separate assessment attempt. Your first video and assessment remain on record.</p><hr style="border:0;border-top:1px solid #e2e8f0;margin:25px 0"><p style="font-size:13px;color:#475569"><strong>ProFox Recruitment Team</strong><br>ProFox Web Designer</p></td></tr></table></td></tr></table></body></html>$html$,
  true,
  'Candidate confirmation after submitting a Video Review retry.'
),
(
  'recruitment_video_retry_admin_submitted',
  'Recruitment - video retry submitted to admin',
  'Interview retry submitted - {{fullName}}',
  $text$A candidate has submitted a new introduction-video retry.

Candidate: {{fullName}}
Application: {{applicationReference}}
Role: {{roleTitle}}
Previous score: {{previousScore}}%
Required score: {{passingScore}}%
New attempt: #{{taskAttempt}}
Submitted: {{taskSubmittedAt}}

Review the candidate in ProFox:
{{adminReviewUrl}}$text$,
  $html$<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table width="100%" role="presentation"><tr><td align="center" style="padding:28px 12px"><table width="640" role="presentation" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><tr><td style="height:5px;background:#000080"></td></tr><tr><td style="padding:30px"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#000080">RECRUITMENT ACTION</div><h1 style="font-size:24px;margin:9px 0 14px">Interview retry submitted</h1><p style="font-size:15px;line-height:1.7"><strong>{{fullName}}</strong> has submitted a new introduction video and is ready for another Video Review assessment.</p><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;font-size:14px;line-height:1.8"><strong>Application:</strong> {{applicationReference}}<br><strong>Role:</strong> {{roleTitle}}<br><strong>Previous score:</strong> {{previousScore}}%<br><strong>Required score:</strong> {{passingScore}}%<br><strong>New attempt:</strong> #{{taskAttempt}}<br><strong>Submitted:</strong> {{taskSubmittedAt}}</div><p style="margin:22px 0"><a href="{{adminReviewUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:800">Open Recruitment Review</a></p><p style="font-size:12px;line-height:1.6;color:#64748b">Attempt #1 remains unchanged and available for comparison.</p></td></tr></table></td></tr></table></body></html>$html$,
  true,
  'Admin email when a candidate submits an introduction-video retry.'
),
(
  'recruitment_video_retry_overdue_admin',
  'Recruitment - video retry overdue',
  'Interview retry overdue - {{fullName}}',
  $text$The requested introduction-video retry is overdue.

Candidate: {{fullName}}
Application: {{applicationReference}}
Role: {{roleTitle}}
Attempt: #{{taskAttempt}}
Deadline: {{taskDueDate}}

Open Recruitment:
{{adminReviewUrl}}$text$,
  $html$<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table width="100%" role="presentation"><tr><td align="center" style="padding:28px 12px"><table width="640" role="presentation" style="width:100%;max-width:640px;background:#fff;border:1px solid #fecaca;border-radius:16px;overflow:hidden"><tr><td style="height:5px;background:#dc2626"></td></tr><tr><td style="padding:30px"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#b91c1c">RECRUITMENT FOLLOW-UP</div><h1 style="font-size:24px;margin:9px 0 14px">Interview retry is overdue</h1><p style="font-size:15px;line-height:1.7"><strong>{{fullName}}</strong> has not submitted the requested replacement introduction video.</p><div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;font-size:14px;line-height:1.8"><strong>Application:</strong> {{applicationReference}}<br><strong>Attempt:</strong> #{{taskAttempt}}<br><strong>Deadline:</strong> {{taskDueDate}}</div><p style="margin:22px 0"><a href="{{adminReviewUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:800">Open Recruitment</a></p></td></tr></table></td></tr></table></body></html>$html$,
  true,
  'Admin follow-up when a Video Review retry passes its deadline without submission.'
),
(
  'recruitment_video_retry_deadline_extended',
  'Recruitment - video retry deadline extended',
  'Your ProFox introduction-video retry deadline has been extended',
  $text$Hi {{fullName}},

Your introduction-video retry deadline has been extended.

New deadline: {{taskDueDate}}
Attempt: #{{taskAttempt}}

Use this latest secure link:
{{taskUrl}}

ProFox Recruitment Team$text$,
  $html$<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table width="100%" role="presentation"><tr><td align="center" style="padding:28px 12px"><table width="640" role="presentation" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><tr><td style="height:5px;background:#000080"></td></tr><tr><td style="padding:30px"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#000080">DEADLINE UPDATED</div><h1 style="font-size:24px;margin:9px 0 14px">You have more time to submit your retry</h1><p style="font-size:15px;line-height:1.7">Hi {{fullName}},</p><p style="font-size:15px;line-height:1.7">Your introduction-video retry deadline has been extended.</p><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;font-size:14px;line-height:1.8"><strong>Attempt:</strong> #{{taskAttempt}}<br><strong>New deadline:</strong> {{taskDueDate}}</div><p style="margin:22px 0"><a href="{{taskUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:800">Continue My Video Retry</a></p><p style="font-size:12px;color:#64748b">Use this latest secure link; older retry links are intentionally invalidated.</p></td></tr></table></td></tr></table></body></html>$html$,
  true,
  'Candidate email after an Admin extends the Video Review retry deadline.'
)
on conflict(template_key) do update set
  name=excluded.name,subject_template=excluded.subject_template,body_template=excluded.body_template,
  html_template=excluded.html_template,active=true,description=excluded.description,updated_at=now();

create or replace function public.assert_recruitment_video_retry_answers(p_answers jsonb,p_final boolean default false)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_url text;v_note text;
begin
  if p_answers is null or jsonb_typeof(p_answers)<>'object' then raise exception 'Video retry submission must be a JSON object.'; end if;
  if octet_length(p_answers::text)>12000 then raise exception 'Video retry submission is too large.'; end if;
  v_url:=btrim(coalesce(p_answers->>'videoUrl',''));
  v_note:=btrim(coalesce(p_answers->>'candidateNote',''));
  if char_length(v_url)>2000 then raise exception 'Video link is too long.'; end if;
  if char_length(v_note)>2000 then raise exception 'Candidate note is too long.'; end if;
  if v_url<>'' and v_url!~*'^https?://[^[:space:]]+$' then raise exception 'Enter a valid shareable video link beginning with http:// or https://.'; end if;
  if p_final and v_url='' then raise exception 'A shareable retry-video link is required before final submission.'; end if;
end;
$$;
revoke all on function public.assert_recruitment_video_retry_answers(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.assert_recruitment_video_retry_answers(jsonb,boolean) to service_role;

create or replace function public.schedule_sales_video_retry_followups(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_task public.recruitment_task_instances%rowtype;v_app public.applicants%rowtype;v_payload jsonb;v_admin record;
begin
  select * into v_task from public.recruitment_task_instances where id=p_task_id;
  if not found or coalesce(v_task.template_snapshot->>'taskKey','')<>'sales_video_retry_v1' then return; end if;
  select * into v_app from public.applicants where id=v_task.applicant_id;
  if not found or v_app.closed_at is not null then return; end if;

  update public.notification_outbox
  set status='Cancelled',last_error='Superseded by refreshed Video Review retry follow-up schedule.',updated_at=now()
  where dedupe_key like 'recruitment-video-retry:'||v_task.id::text||':%'
    and status in('Pending','Retry');

  v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object('taskInstanceId',v_task.id);

  if v_task.due_at>now()+interval '25 hours' then
    perform public.enqueue_notification(
      'recruitment-video-retry:'||v_task.id::text||':reminder',
      'recruitment_video_retry_reminder',v_app.email,null,v_payload,
      greatest(now()+interval '30 minutes',v_task.due_at-interval '24 hours')
    );
  end if;
  if v_task.due_at>now()+interval '7 hours' then
    perform public.enqueue_notification(
      'recruitment-video-retry:'||v_task.id::text||':final-reminder',
      'recruitment_video_retry_final_reminder',v_app.email,null,v_payload,
      greatest(now()+interval '45 minutes',v_task.due_at-interval '6 hours')
    );
  end if;

  for v_admin in
    select id,email from public.user_profiles
    where status='active' and role='admin' and nullif(btrim(coalesce(email,'')),'') is not null
  loop
    perform public.enqueue_notification(
      'recruitment-video-retry:'||v_task.id::text||':overdue:'||v_admin.id::text,
      'recruitment_video_retry_overdue_admin',v_admin.email,v_admin.id,
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

create or replace function public.issue_recruitment_task_internal(p_applicant_id uuid,p_stage text,p_retry_feedback text default '',p_send_email boolean default false)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;v_template public.recruitment_task_templates%rowtype;v_existing public.recruitment_task_instances%rowtype;
  v_instance public.recruitment_task_instances%rowtype;v_attempt integer;v_assessment_attempt integer:=0;v_snapshot jsonb;v_payload jsonb;
  v_due timestamptz;v_template_key text;v_task_key text;v_feedback text;
begin
  select * into v_app from public.applicants where id=p_applicant_id;
  if not found or v_app.closed_at is not null then return null; end if;
  select * into v_template from public.recruitment_task_templates
  where active=true and system_role=public.career_job_system_role(v_app.career_job_id) and stage=p_stage
  order by version desc limit 1;
  if not found then return null; end if;
  v_task_key:=coalesce(v_template.task_key,'');

  select * into v_existing from public.recruitment_task_instances
  where applicant_id=p_applicant_id and stage=p_stage order by attempt_no desc limit 1;
  if found and v_existing.status in('Issued','Viewed','In Progress','Submitted','Under Review') then
    return jsonb_build_object('instanceId',v_existing.id,'attemptNo',v_existing.attempt_no,'status',v_existing.status,'alreadyExists',true,'dueAt',v_existing.due_at,'estimatedMinutes',(v_existing.template_snapshot->>'estimatedMinutes')::integer,'requiredItems',(v_existing.template_snapshot->>'requiredItems')::integer,'targetMarket',v_existing.template_snapshot->>'targetMarket','targetNiche',v_existing.template_snapshot->>'targetNiche','retryFeedback',v_existing.retry_feedback);
  end if;

  if v_task_key='sales_video_retry_v1' then
    select coalesce(max(attempt_no),0) into v_assessment_attempt
    from public.recruitment_assessments where applicant_id=p_applicant_id and stage=p_stage;
    if v_assessment_attempt<1 then raise exception 'A reviewed Video Review assessment is required before a retry task can be issued.'; end if;
    if not exists(
      select 1 from public.recruitment_assessments
      where applicant_id=p_applicant_id and stage=p_stage and attempt_no=v_assessment_attempt and status='Retry Required'
    ) then raise exception 'The latest Video Review assessment must be Retry Required before another video attempt can be issued.'; end if;
    v_attempt:=greatest(coalesce(v_existing.attempt_no,0),v_assessment_attempt)+1;
    v_feedback:=coalesce(nullif(btrim(p_retry_feedback),''),
      'Please record a new 60-120 second introduction video with clear English communication, confident delivery, professional presentation, and specific evidence from your sales experience.');
  else
    v_attempt:=coalesce(v_existing.attempt_no,0)+1;
    v_feedback:=coalesce(p_retry_feedback,'');
  end if;

  if v_attempt>v_template.max_attempts then raise exception 'Maximum recruitment task attempts reached.'; end if;
  v_due:=now()+make_interval(hours=>v_template.deadline_hours);
  v_snapshot:=jsonb_build_object('taskKey',v_template.task_key,'title',v_template.title,'description',v_template.description,'targetMarket',v_template.target_market,'targetNiche',v_template.target_niche,'requiredItems',v_template.required_items,'deadlineHours',v_template.deadline_hours,'estimatedMinutes',v_template.estimated_minutes,'maxAttempts',v_template.max_attempts,'instructions',v_template.instructions,'version',v_template.version);
  insert into public.recruitment_task_instances(applicant_id,template_id,stage,attempt_no,status,token_hash,template_snapshot,retry_feedback,due_at)
  values(p_applicant_id,v_template.id,p_stage,v_attempt,'Issued',null,v_snapshot,v_feedback,v_due) returning * into v_instance;
  insert into public.recruitment_task_submissions(task_instance_id) values(v_instance.id);
  insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,actor_user_id,source_table,source_id,metadata)
  values(p_applicant_id,'Recruitment',case when v_task_key='sales_video_retry_v1' then 'Video Retry Issued' else 'Task Issued' end,v_template.title,
    case when v_task_key='sales_video_retry_v1' then 'Secure interview-video retry attempt '||v_attempt||' issued with a deadline.' else 'Secure practical task attempt '||v_attempt||' issued with a deadline.' end,
    case when auth.uid() is null then 'System' else 'Admin' end,auth.uid(),'recruitment_task_instances',v_instance.id,
    jsonb_build_object('stage',p_stage,'attemptNo',v_attempt,'dueAt',v_due,'templateVersion',v_template.version,'taskKey',v_task_key));

  if p_send_email then
    v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object('taskInstanceId',v_instance.id);
    v_template_key:=case
      when v_task_key='sales_video_retry_v1' then 'recruitment_video_retry_invitation'
      when v_task_key='content_writer_portfolio_v2' and v_attempt>1 then 'content_recruitment_portfolio_retry'
      when v_task_key='content_writer_portfolio_v2' then 'content_recruitment_portfolio'
      when v_attempt>1 then 'recruitment_lead_research_retry'
      else 'recruitment_lead_research'
    end;
    perform public.enqueue_notification('recruitment-task:'||v_instance.id::text||':issued',v_template_key,v_app.email,null,v_payload,now());
    if v_task_key='sales_video_retry_v1' then perform public.schedule_sales_video_retry_followups(v_instance.id); end if;
  end if;
  return jsonb_build_object('instanceId',v_instance.id,'attemptNo',v_attempt,'status',v_instance.status,'alreadyExists',false,'dueAt',v_due,'estimatedMinutes',v_template.estimated_minutes,'requiredItems',v_template.required_items,'targetMarket',v_template.target_market,'targetNiche',v_template.target_niche,'retryFeedback',v_feedback);
end;
$$;
revoke all on function public.issue_recruitment_task_internal(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.issue_recruitment_task_internal(uuid,text,text,boolean) to service_role;

create or replace function public.service_prepare_recruitment_task_delivery(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_task public.recruitment_task_instances%rowtype;v_app public.applicants%rowtype;v_token text;v_task_key text;v_is_assessment_hub boolean;v_task_url text;v_previous_score int;v_passing_score int;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required.';end if;
  select * into v_task from public.recruitment_task_instances where id=p_task_id for update;
  if not found then raise exception 'Recruitment task not found.';end if;
  select * into v_app from public.applicants where id=v_task.applicant_id;
  v_task_key:=coalesce(v_task.template_snapshot->>'taskKey','');v_is_assessment_hub:=v_task_key='sales_assessment_hub';
  if v_task.status not in('Issued','Viewed','In Progress') then raise exception 'Recruitment task is not eligible for link delivery.';end if;
  if v_task.due_at<now() then raise exception 'Recruitment task deadline has passed.';end if;
  if v_app.closed_at is not null then raise exception 'Recruitment task is no longer active.';end if;
  if v_is_assessment_hub then
    if v_app.stage not in('Shortlisted','Sales Assessment','Lead Research Test','CRM Assessment','Selected','Agreement Pending','Sales Academy Training','Final Approval','Ready for System Access','Activated') then raise exception 'Assessment Preparation Center access is not available for the current recruitment stage.';end if;
  elsif v_app.stage<>v_task.stage then raise exception 'Recruitment task is no longer active.';end if;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  update public.recruitment_task_instances set token_hash=public.recruitment_task_token_hash(v_token),updated_at=now() where id=v_task.id;
  v_task_url:=case
    when v_is_assessment_hub then 'https://calabtayklhltyiriiwo.supabase.co/functions/v1/sales-assessment-hub?token='||v_token
    when v_task_key='content_writer_portfolio_v2' then 'https://www.profoxwebdesigner.com/recruitment/content-portfolio/'||v_token
    when v_task_key='sales_video_retry_v1' then 'https://www.profoxwebdesigner.com/recruitment/video-retry/'||v_token
    else 'https://www.profoxwebdesigner.com/recruitment/task/'||v_token end;

  if v_task_key='sales_video_retry_v1' then
    select score,passing_score_snapshot into v_previous_score,v_passing_score
    from public.recruitment_assessments
    where applicant_id=v_task.applicant_id and stage=v_task.stage and attempt_no=v_task.attempt_no-1
    limit 1;
  end if;

  return jsonb_build_object(
    'taskUrl',v_task_url,'taskKey',v_task_key,'taskTitle',v_task.template_snapshot->>'title',
    'taskDueDate',to_char(v_task.due_at at time zone 'UTC','Mon DD, YYYY HH24:MI "UTC"'),
    'taskEstimatedTime',(v_task.template_snapshot->>'estimatedMinutes')||' minutes',
    'taskRequiredItems',v_task.template_snapshot->>'requiredItems','taskTargetMarket',v_task.template_snapshot->>'targetMarket',
    'taskTargetNiche',v_task.template_snapshot->>'targetNiche','taskAttempt',v_task.attempt_no,
    'taskFeedback',coalesce(nullif(v_task.retry_feedback,''),'Review the first response carefully and submit a clearer, more specific replacement video.'),
    'previousScore',v_previous_score,'passingScore',v_passing_score
  );
end;
$$;
revoke all on function public.service_prepare_recruitment_task_delivery(uuid) from public,anon,authenticated;
grant execute on function public.service_prepare_recruitment_task_delivery(uuid) to service_role;

create or replace function public.prepare_recruitment_task_on_stage_change()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_issue jsonb;v_task_id uuid;v_task_key text;
begin
  if new.stage is distinct from old.stage then
    if new.stage='Video Review' and public.career_job_system_role(new.career_job_id)='sales' then
      return new;
    end if;
    v_issue:=public.issue_recruitment_task_internal(new.id,new.stage,'',false);
    if v_issue is not null then
      v_task_id:=(v_issue->>'instanceId')::uuid;
      select coalesce(template_snapshot->>'taskKey','') into v_task_key from public.recruitment_task_instances where id=v_task_id;
      perform set_config('profox.recruitment_task_email_context',jsonb_build_object('taskInstanceId',v_task_id)::text,true);
      if v_task_key='content_writer_portfolio_v2' then
        perform public.enqueue_notification('recruitment-task:'||v_task_id::text||':content-portfolio-issued','content_recruitment_portfolio',lower(btrim(new.email)),null,public.recruitment_notification_payload(new)||jsonb_build_object('taskInstanceId',v_task_id),now());
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.prepare_recruitment_task_on_stage_change() from public,anon,authenticated;
grant execute on function public.prepare_recruitment_task_on_stage_change() to service_role;

create or replace function public.public_open_recruitment_task(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_task public.recruitment_task_instances%rowtype;v_app public.applicants%rowtype;v_submission public.recruitment_task_submissions%rowtype;v_now timestamptz:=now();v_can_edit boolean;v_task_key text;v_default jsonb;v_previous_score int;v_passing_score int;v_role_title text;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then raise exception 'Invalid task link.';end if;
  select * into v_task from public.recruitment_task_instances where token_hash is not null and token_hash=public.recruitment_task_token_hash(p_token) for update;
  if not found then raise exception 'This task link is invalid or no longer active.';end if;
  perform public.check_recruitment_task_rate_limit(v_task.id,'open',120);
  select * into v_app from public.applicants where id=v_task.applicant_id;
  select * into v_submission from public.recruitment_task_submissions where task_instance_id=v_task.id;
  if v_task.status='Revoked' then raise exception 'This task link has been revoked. Contact the ProFox Recruitment Team.';end if;
  v_task_key:=coalesce(v_task.template_snapshot->>'taskKey','');
  v_default:=case
    when v_task_key='content_writer_portfolio_v2' then '{"portfolioCases":[]}'::jsonb
    when v_task_key='sales_video_retry_v1' then '{"videoUrl":"","candidateNote":""}'::jsonb
    else '{"leads":[]}'::jsonb end;

  if v_task.viewed_at is null then
    update public.recruitment_task_instances set viewed_at=v_now,status=case when status='Issued' then 'Viewed' else status end,updated_at=v_now where id=v_task.id returning * into v_task;
    insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata)
    values(v_task.applicant_id,'Recruitment',case when v_task_key='sales_video_retry_v1' then 'Video Retry Opened' else 'Task Viewed' end,
      coalesce(v_task.template_snapshot->>'title','Recruitment task')||' opened',
      case when v_task_key='sales_video_retry_v1' then 'Candidate opened secure interview-video retry attempt '||v_task.attempt_no||'.' else 'Candidate opened secure recruitment task attempt '||v_task.attempt_no||'.' end,
      'Candidate','recruitment_task_instances',v_task.id,jsonb_build_object('stage',v_task.stage,'attemptNo',v_task.attempt_no,'taskKey',v_task_key));
  end if;

  if v_task_key='sales_video_retry_v1' then
    select score,passing_score_snapshot into v_previous_score,v_passing_score from public.recruitment_assessments
    where applicant_id=v_task.applicant_id and stage=v_task.stage and attempt_no=v_task.attempt_no-1 limit 1;
    select coalesce(j.title,v_app.position,'Sales Representative') into v_role_title from public.career_jobs j where j.id=v_app.career_job_id;
  end if;

  v_can_edit:=v_task.status in('Issued','Viewed','In Progress') and v_task.due_at>=v_now and v_app.closed_at is null and v_app.stage=v_task.stage;
  return jsonb_build_object(
    'taskKey',v_task_key,'stage',v_task.stage,'title',v_task.template_snapshot->>'title','description',v_task.template_snapshot->>'description',
    'targetMarket',v_task.template_snapshot->>'targetMarket','targetNiche',v_task.template_snapshot->>'targetNiche',
    'requiredItems',(v_task.template_snapshot->>'requiredItems')::integer,'estimatedMinutes',(v_task.template_snapshot->>'estimatedMinutes')::integer,
    'instructions',coalesce(v_task.template_snapshot->'instructions','[]'::jsonb),'attemptNo',v_task.attempt_no,
    'maxAttempts',(v_task.template_snapshot->>'maxAttempts')::integer,'candidateName',v_app.full_name,'applicationReference',v_app.application_reference,
    'status',v_task.status,'issuedAt',v_task.issued_at,'dueAt',v_task.due_at,'submittedAt',v_task.submitted_at,'retryFeedback',v_task.retry_feedback,
    'previousScore',v_previous_score,'passingScore',v_passing_score,'roleTitle',v_role_title,
    'expired',v_task.due_at<v_now,'canEdit',v_can_edit,
    'answers',case when v_task.submitted_at is null then coalesce(v_submission.draft_data,v_default) else coalesce(v_submission.final_data,v_submission.draft_data,v_default) end
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
declare v_task public.recruitment_task_instances%rowtype;v_app public.applicants%rowtype;v_required integer;v_first_save boolean;v_task_key text;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then raise exception 'Invalid task link.'; end if;
  select * into v_task from public.recruitment_task_instances where token_hash is not null and token_hash=public.recruitment_task_token_hash(p_token) for update;
  if not found then raise exception 'This task link is invalid or no longer active.'; end if;
  perform public.check_recruitment_task_rate_limit(v_task.id,'save',600);
  select * into v_app from public.applicants where id=v_task.applicant_id;
  if v_task.status not in('Issued','Viewed','In Progress') then raise exception 'This task is no longer editable.'; end if;
  if v_task.due_at<now() then raise exception 'This task deadline has passed. Contact the ProFox Recruitment Team if you need an extension.'; end if;
  if v_app.closed_at is not null or v_app.stage<>v_task.stage then raise exception 'This recruitment task is no longer active.'; end if;
  v_required:=(v_task.template_snapshot->>'requiredItems')::integer;v_task_key:=coalesce(v_task.template_snapshot->>'taskKey','');
  if v_task_key='sales_video_retry_v1' then perform public.assert_recruitment_video_retry_answers(p_answers,false);
  else perform public.assert_recruitment_task_answers(p_answers,v_required,false); end if;
  v_first_save:=v_task.first_saved_at is null;

  insert into public.recruitment_task_submissions(task_instance_id,draft_data,save_count,last_saved_at,updated_at)
  values(v_task.id,p_answers,1,now(),now())
  on conflict(task_instance_id) do update set draft_data=excluded.draft_data,save_count=public.recruitment_task_submissions.save_count+1,last_saved_at=now(),updated_at=now();

  update public.recruitment_task_instances set status='In Progress',first_saved_at=coalesce(first_saved_at,now()),last_saved_at=now(),updated_at=now() where id=v_task.id;
  if v_first_save then
    insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata)
    values(v_task.applicant_id,'Recruitment',case when v_task_key='sales_video_retry_v1' then 'Video Retry Started' else 'Task Started' end,
      case when v_task_key='sales_video_retry_v1' then 'Interview-video retry started' else 'Practical task started' end,
      case when v_task_key='sales_video_retry_v1' then 'Candidate saved the first draft for interview-video retry attempt '||v_task.attempt_no||'.' else 'Candidate saved the first draft for attempt '||v_task.attempt_no||'.' end,
      'Candidate','recruitment_task_instances',v_task.id,jsonb_build_object('stage',v_task.stage,'attemptNo',v_task.attempt_no,'taskKey',v_task_key));
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
  v_task public.recruitment_task_instances%rowtype;v_app public.applicants%rowtype;v_required integer;v_admin record;v_payload jsonb;
  v_task_key text;v_is_content boolean;v_is_video_retry boolean;v_title text;v_previous_score int;v_passing_score int;v_admin_url text;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then raise exception 'Invalid task link.';end if;
  select * into v_task from public.recruitment_task_instances where token_hash is not null and token_hash=public.recruitment_task_token_hash(p_token) for update;
  if not found then raise exception 'This task link is invalid or no longer active.';end if;
  perform public.check_recruitment_task_rate_limit(v_task.id,'submit',20);
  if v_task.status in('Submitted','Under Review','Passed','Retry Required','Failed') then return jsonb_build_object('success',true,'alreadySubmitted',true,'submittedAt',v_task.submitted_at);end if;
  select * into v_app from public.applicants where id=v_task.applicant_id;
  if v_task.status='Revoked' then raise exception 'This task link has been revoked.';end if;
  if v_task.due_at<now() then raise exception 'This task deadline has passed. Contact the ProFox Recruitment Team if you need an extension.';end if;
  if v_app.closed_at is not null or v_app.stage<>v_task.stage then raise exception 'This recruitment task is no longer active.';end if;

  v_required:=(v_task.template_snapshot->>'requiredItems')::integer;
  v_task_key:=coalesce(v_task.template_snapshot->>'taskKey','');
  v_is_content:=v_task_key='content_writer_portfolio_v2';
  v_is_video_retry:=v_task_key='sales_video_retry_v1';
  v_title:=coalesce(v_task.template_snapshot->>'title','Recruitment task');
  if v_is_video_retry then perform public.assert_recruitment_video_retry_answers(p_answers,true);
  else perform public.assert_recruitment_task_answers(p_answers,v_required,true); end if;

  insert into public.recruitment_task_submissions(task_instance_id,draft_data,final_data,save_count,last_saved_at,submitted_at,updated_at)
  values(v_task.id,p_answers,p_answers,1,now(),now(),now())
  on conflict(task_instance_id) do update set draft_data=excluded.draft_data,final_data=excluded.final_data,save_count=public.recruitment_task_submissions.save_count+1,last_saved_at=now(),submitted_at=now(),updated_at=now();
  update public.recruitment_task_instances set status='Submitted',submitted_at=now(),last_saved_at=now(),token_hash=null,updated_at=now() where id=v_task.id returning * into v_task;

  insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata)
  values(v_task.applicant_id,'Recruitment',case when v_is_video_retry then 'Video Retry Submitted' else 'Task Submitted' end,
    case when v_is_video_retry then 'Interview-video retry submitted' else v_title||' submitted' end,
    case when v_is_video_retry then 'Candidate submitted secure interview-video retry attempt '||v_task.attempt_no||' for review.' else 'Candidate submitted secure recruitment task attempt '||v_task.attempt_no||' for review.' end,
    'Candidate','recruitment_task_instances',v_task.id,jsonb_build_object('stage',v_task.stage,'attemptNo',v_task.attempt_no,'submittedAt',v_task.submitted_at,'taskKey',v_task_key,'videoUrl',case when v_is_video_retry then p_answers->>'videoUrl' else null end));

  update public.notification_outbox set status='Cancelled',last_error='Candidate submitted the Video Review retry.',updated_at=now()
  where v_is_video_retry and dedupe_key like 'recruitment-video-retry:'||v_task.id::text||':%' and status in('Pending','Retry');

  if v_is_video_retry then
    select score,passing_score_snapshot into v_previous_score,v_passing_score from public.recruitment_assessments
    where applicant_id=v_task.applicant_id and stage=v_task.stage and attempt_no=v_task.attempt_no-1 limit 1;
  end if;
  v_admin_url:='https://www.profoxwebdesigner.com/admin/app/recruitment?applicantId='||v_task.applicant_id::text;
  v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object(
    'taskTitle',v_title,'taskAttempt',v_task.attempt_no,'taskSubmittedAt',to_char(v_task.submitted_at at time zone 'UTC','Mon DD, YYYY HH24:MI "UTC"'),
    'previousScore',v_previous_score,'passingScore',v_passing_score,'adminReviewUrl',v_admin_url
  );
  perform public.enqueue_notification('recruitment-task:'||v_task.id::text||':submitted',
    case when v_is_video_retry then 'recruitment_video_retry_submission_received' when v_is_content then 'content_recruitment_portfolio_submitted' else 'recruitment_task_submission_received' end,
    v_app.email,null,v_payload,now());

  for v_admin in select id,email from public.user_profiles where status='active' and role='admin' loop
    perform public.enqueue_in_app_notification(v_admin.id,'Recruitment',
      case when v_is_video_retry then 'Interview retry ready for review' else v_title||' ready for review' end,
      case when v_is_video_retry then v_app.full_name||' submitted interview-video retry attempt '||v_task.attempt_no||'. Attempt #'||(v_task.attempt_no-1)||' remains preserved.' else v_app.full_name||' submitted '||v_title||' attempt '||v_task.attempt_no||'.' end,
      '/admin/app/recruitment?applicantId='||v_task.applicant_id::text,
      'recruitment-task-review:'||v_task.id::text||':'||v_admin.id::text);
    if v_is_video_retry and nullif(btrim(coalesce(v_admin.email,'')),'') is not null then
      perform public.enqueue_notification('recruitment-video-retry-admin:'||v_task.id::text||':'||v_admin.id::text,
        'recruitment_video_retry_admin_submitted',v_admin.email,v_admin.id,v_payload,now());
    end if;
  end loop;
  return jsonb_build_object('success',true,'submittedAt',v_task.submitted_at,'status','Submitted');
end;
$$;
revoke all on function public.public_submit_recruitment_task(text,jsonb) from public,authenticated;
grant execute on function public.public_submit_recruitment_task(text,jsonb) to anon,authenticated,service_role;

create or replace function public.admin_get_recruitment_tasks(p_applicant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_result jsonb;
begin
  if not public.is_admin() and not public.can_manage_content_applicant(p_applicant_id) then raise exception 'Recruitment management access required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'taskKey',t.template_snapshot->>'taskKey','stage',t.stage,'attemptNo',t.attempt_no,'status',t.status,
    'title',t.template_snapshot->>'title','targetMarket',t.template_snapshot->>'targetMarket','targetNiche',t.template_snapshot->>'targetNiche',
    'requiredItems',(t.template_snapshot->>'requiredItems')::integer,'estimatedMinutes',(t.template_snapshot->>'estimatedMinutes')::integer,
    'maxAttempts',(t.template_snapshot->>'maxAttempts')::integer,'instructions',t.template_snapshot->'instructions','templateVersion',t.template_snapshot->>'version',
    'retryFeedback',t.retry_feedback,'issuedAt',t.issued_at,'dueAt',t.due_at,'viewedAt',t.viewed_at,'firstSavedAt',t.first_saved_at,
    'lastSavedAt',t.last_saved_at,'submittedAt',t.submitted_at,'reviewedAt',t.reviewed_at,
    'finalData',case when t.submitted_at is not null then s.final_data else null end,'draftData',case when t.submitted_at is null then s.draft_data else null end
  ) order by t.attempt_no desc,t.created_at desc),'[]'::jsonb)
  into v_result
  from public.recruitment_task_instances t left join public.recruitment_task_submissions s on s.task_instance_id=t.id
  where t.applicant_id=p_applicant_id;
  return v_result;
end;
$$;
revoke all on function public.admin_get_recruitment_tasks(uuid) from public,anon;
grant execute on function public.admin_get_recruitment_tasks(uuid) to authenticated,service_role;

create or replace function public.guard_recruitment_assessment_task_submission()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_role text;v_task public.recruitment_task_instances%rowtype;v_max_attempts integer;v_task_key text;
begin
  v_role:=public.career_job_system_role(new.job_id);
  select task_key,max_attempts into v_task_key,v_max_attempts
  from public.recruitment_task_templates where active=true and system_role=v_role and stage=new.stage
  order by version desc limit 1;
  if v_task_key is null then return new; end if;

  if v_task_key='sales_video_retry_v1' and new.attempt_no=1 then
    if new.status='Retry Required' and 1>=v_max_attempts then raise exception 'Maximum Video Review attempts reached. Mark the assessment Passed or Failed.'; end if;
    return new;
  end if;

  select * into v_task from public.recruitment_task_instances
  where applicant_id=new.applicant_id and stage=new.stage and attempt_no=new.attempt_no
  order by created_at desc limit 1;
  if not found or v_task.status not in('Submitted','Under Review') or v_task.submitted_at is null then
    if v_task_key='sales_video_retry_v1' then
      raise exception 'The candidate must submit the current interview-video retry before this assessment attempt can be recorded.';
    else
      raise exception 'Review the candidate practical task submission before recording this assessment.';
    end if;
  end if;
  if new.status='Retry Required' and v_task.attempt_no>=coalesce(v_max_attempts,(v_task.template_snapshot->>'maxAttempts')::integer,1) then
    raise exception 'Maximum recruitment task attempts reached. Mark the assessment Passed or Failed.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_recruitment_assessment_task_submission() from public,anon,authenticated;
grant execute on function public.guard_recruitment_assessment_task_submission() to service_role;

create or replace function public.sync_recruitment_task_from_assessment()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_task public.recruitment_task_instances%rowtype;v_feedback text;v_task_key text;v_template public.recruitment_task_templates%rowtype;v_future public.recruitment_task_instances%rowtype;
begin
  select * into v_template from public.recruitment_task_templates
  where active=true and system_role=public.career_job_system_role(new.job_id) and stage=new.stage
  order by version desc limit 1;
  if not found then return new; end if;
  v_task_key:=coalesce(v_template.task_key,'');
  v_feedback:=coalesce(nullif(btrim(new.evaluator_notes),''),
    case when v_task_key='sales_video_retry_v1' then 'Please record a new 60-120 second introduction video with clear English communication, confident delivery, professional presentation, and specific evidence from your sales experience.' else '' end);

  if v_task_key='sales_video_retry_v1' and new.attempt_no=1 then
    if new.status='Retry Required' then
      perform public.issue_recruitment_task_internal(new.applicant_id,new.stage,v_feedback,true);
    elsif new.status in('Passed','Failed') then
      select * into v_future from public.recruitment_task_instances where applicant_id=new.applicant_id and stage=new.stage and attempt_no>new.attempt_no order by attempt_no limit 1 for update;
      if found and v_future.status in('Issued','Viewed','In Progress') then
        update public.recruitment_task_instances set status='Revoked',revoked_at=now(),token_hash=null,updated_at=now() where id=v_future.id;
        update public.notification_outbox set status='Cancelled',last_error='Video Review retry was cancelled because the assessment decision changed.',updated_at=now()
        where (payload->>'taskInstanceId')=v_future.id::text and status in('Pending','Retry');
      end if;
    end if;
    return new;
  end if;

  select * into v_task from public.recruitment_task_instances
  where applicant_id=new.applicant_id and stage=new.stage and attempt_no=new.attempt_no for update;
  if not found then return new; end if;

  if new.status='Passed' then
    update public.recruitment_task_instances set status='Passed',reviewed_at=coalesce(new.evaluated_at,now()),updated_at=now() where id=v_task.id;
  elsif new.status='Failed' then
    update public.recruitment_task_instances set status='Failed',reviewed_at=coalesce(new.evaluated_at,now()),updated_at=now() where id=v_task.id;
  elsif new.status='Retry Required' then
    update public.recruitment_task_instances set status='Retry Required',reviewed_at=coalesce(new.evaluated_at,now()),token_hash=null,updated_at=now() where id=v_task.id;
    if not exists(select 1 from public.recruitment_task_instances where applicant_id=new.applicant_id and stage=new.stage and attempt_no>v_task.attempt_no) then
      perform public.issue_recruitment_task_internal(new.applicant_id,new.stage,v_feedback,true);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_recruitment_task_from_assessment() from public,anon,authenticated;
grant execute on function public.sync_recruitment_task_from_assessment() to service_role;

create or replace function public.admin_resend_recruitment_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_task public.recruitment_task_instances%rowtype;v_app public.applicants%rowtype;v_template_key text;v_payload jsonb;v_task_key text;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select * into v_task from public.recruitment_task_instances where id=p_task_id for update;
  if not found then raise exception 'Recruitment task not found.'; end if;
  if v_task.status not in('Issued','Viewed','In Progress') then raise exception 'Only an active editable task link can be resent.'; end if;
  if v_task.due_at<now() then raise exception 'Extend the expired deadline before resending this task.'; end if;
  select * into v_app from public.applicants where id=v_task.applicant_id;
  update public.recruitment_task_instances set token_hash=null,updated_at=now() where id=v_task.id;
  v_task_key:=coalesce(v_task.template_snapshot->>'taskKey','');
  v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object('taskInstanceId',v_task.id);
  v_template_key:=case
    when v_task_key='sales_video_retry_v1' then 'recruitment_video_retry_invitation'
    when v_task_key='content_writer_portfolio_v2' and v_task.attempt_no>1 then 'content_recruitment_portfolio_retry'
    when v_task_key='content_writer_portfolio_v2' then 'content_recruitment_portfolio'
    when v_task.attempt_no>1 then 'recruitment_lead_research_retry'
    else 'recruitment_lead_research' end;
  perform public.enqueue_notification('recruitment-task:'||v_task.id::text||':resend:'||extract(epoch from clock_timestamp())::bigint,v_template_key,v_app.email,null,v_payload,now());
  insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,actor_user_id,source_table,source_id,metadata)
  values(v_task.applicant_id,'Recruitment','Task Link Resent',coalesce(v_task.template_snapshot->>'title','Recruitment task')||' link resent','Admin invalidated the previous task link and requested a new secure link.','Admin',auth.uid(),'recruitment_task_instances',v_task.id,jsonb_build_object('attemptNo',v_task.attempt_no,'taskKey',v_task_key));
  return jsonb_build_object('success',true);
end;
$$;

create or replace function public.admin_extend_recruitment_task_deadline(p_task_id uuid,p_hours integer)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_task public.recruitment_task_instances%rowtype;v_app public.applicants%rowtype;v_payload jsonb;v_task_key text;v_template_key text;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_hours is null or p_hours<1 or p_hours>336 then raise exception 'Extension must be between 1 and 336 hours.'; end if;
  select * into v_task from public.recruitment_task_instances where id=p_task_id for update;
  if not found then raise exception 'Recruitment task not found.'; end if;
  if v_task.status not in('Issued','Viewed','In Progress') then raise exception 'Only an active editable task can be extended.'; end if;
  select * into v_app from public.applicants where id=v_task.applicant_id;
  update public.recruitment_task_instances set due_at=greatest(due_at,now())+make_interval(hours=>p_hours),token_hash=null,updated_at=now() where id=v_task.id returning * into v_task;
  v_task_key:=coalesce(v_task.template_snapshot->>'taskKey','');
  v_template_key:=case when v_task_key='sales_video_retry_v1' then 'recruitment_video_retry_deadline_extended' when v_task_key='content_writer_portfolio_v2' then 'content_recruitment_portfolio_deadline_extended' else 'recruitment_task_deadline_extended' end;
  v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object('taskInstanceId',v_task.id,'taskExtensionHours',p_hours);
  perform public.enqueue_notification('recruitment-task:'||v_task.id::text||':extension:'||extract(epoch from clock_timestamp())::bigint,v_template_key,v_app.email,null,v_payload,now());
  if v_task_key='sales_video_retry_v1' then perform public.schedule_sales_video_retry_followups(v_task.id); end if;
  insert into public.applicant_events(applicant_id,category,event_type,title,detail,actor_type,actor_user_id,source_table,source_id,metadata)
  values(v_task.applicant_id,'Recruitment','Task Deadline Extended',coalesce(v_task.template_snapshot->>'title','Recruitment task')||' deadline extended','Admin extended the deadline by '||p_hours||' hours and invalidated the previous link.','Admin',auth.uid(),'recruitment_task_instances',v_task.id,jsonb_build_object('attemptNo',v_task.attempt_no,'dueAt',v_task.due_at,'extensionHours',p_hours,'taskKey',v_task_key,'notificationTemplate',v_template_key));
  return jsonb_build_object('success',true,'dueAt',v_task.due_at);
end;
$$;

create or replace function public.admin_get_applicant_timeline(p_applicant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_user uuid;v_email text;result jsonb;
begin
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then raise exception 'Recruitment management access required.'; end if;
  select linked_user_id,lower(btrim(email)) into v_user,v_email from public.applicants where id=p_applicant_id;
  if not found then return '[]'::jsonb; end if;
  with timeline as(
    select e.id::text id,e.category,e.event_type type,e.title,e.detail,e.to_value status,e.occurred_at,
      coalesce(up.full_name,case when lower(e.actor_type)='applicant' then 'Applicant' else initcap(replace(e.actor_type,'_',' ')) end) actor,
      jsonb_strip_nulls(e.metadata||jsonb_build_object('from',e.from_value,'to',e.to_value,'source',e.source_table)) metadata
    from public.applicant_events e left join public.user_profiles up on up.id=e.actor_user_id where e.applicant_id=p_applicant_id
    union all
    select ra.id::text,'assessment','assessment_recorded',ra.stage||' assessment',nullif(ra.evaluator_notes,''),ra.status,coalesce(ra.evaluated_at,ra.created_at),coalesce(up.full_name,'Reviewer'),
      jsonb_strip_nulls(jsonb_build_object('attemptNo',ra.attempt_no,'score',ra.score,'passingScore',ra.passing_score_snapshot,'criticalFailures',ra.critical_failures,'evidenceUrl',nullif(ra.evidence_url,'')))
    from public.recruitment_assessments ra left join public.user_profiles up on up.id=ra.evaluator_id where ra.applicant_id=p_applicant_id
    union all
    select n.id::text||':queued','communication','email_queued','Email queued',n.template_key,n.status,n.created_at,'System',
      jsonb_strip_nulls(jsonb_build_object('templateKey',n.template_key,'recipient',n.recipient_email,'scheduledFor',n.scheduled_for,'attempts',n.attempts))
    from public.notification_outbox n where n.payload->>'applicantId'=p_applicant_id::text and lower(btrim(coalesce(n.recipient_email,'')))=v_email
    union all
    select ed.id::text,'communication','email_'||lower(replace(ed.event_type,' ','_')),
      case
        when lower(ed.event_type) like '%deliver%' then 'Email delivered'
        when lower(ed.event_type) like '%open%' then 'Email opened'
        when lower(ed.event_type) like '%click%' then 'Email link clicked'
        when lower(ed.event_type) like '%bounce%' then 'Email bounced'
        else 'Email delivery update'
      end,
      n.template_key,ed.event_type,ed.occurred_at,'Email provider',
      jsonb_strip_nulls(jsonb_build_object('templateKey',n.template_key,'provider',ed.provider,'providerMessageId',ed.provider_message_id,'reason',nullif(ed.reason,'')))
    from public.email_delivery_events ed
    join public.notification_outbox n on n.id=ed.notification_id
    where n.payload->>'applicantId'=p_applicant_id::text and lower(btrim(coalesce(ed.recipient_email,n.recipient_email,'')))=v_email
      and (lower(ed.event_type) like '%deliver%' or lower(ed.event_type) like '%open%' or lower(ed.event_type) like '%click%' or lower(ed.event_type) like '%bounce%')
    union all
    select p.id::text||':started','training','training_module_started','Training module started',m.title,p.status,p.created_at,
      case when m.academy_key='content_writer' then 'Content Academy' else 'Sales Academy' end,
      jsonb_build_object('moduleId',m.id,'moduleTitle',m.title,'progress',p.progress_percent,'score',p.score)
    from public.user_training_progress p join public.training_modules m on m.id=p.module_id where v_user is not null and p.user_id=v_user
    union all
    select p.id::text||':completed','training','training_module_completed','Training module completed',m.title,p.status,p.completed_at,
      case when m.academy_key='content_writer' then 'Content Academy' else 'Sales Academy' end,
      jsonb_build_object('moduleId',m.id,'moduleTitle',m.title,'score',p.score,'attempts',p.attempts)
    from public.user_training_progress p join public.training_modules m on m.id=p.module_id where v_user is not null and p.user_id=v_user and p.completed_at is not null
    union all
    select p.id::text||':review','training','training_review','Training review recorded',m.title,p.review_status,p.reviewed_at,coalesce(up.full_name,'Reviewer'),
      jsonb_build_object('moduleId',m.id,'moduleTitle',m.title,'score',p.score,'feedback',p.feedback)
    from public.user_training_progress p join public.training_modules m on m.id=p.module_id left join public.user_profiles up on up.id=p.reviewed_by
    where v_user is not null and p.user_id=v_user and p.reviewed_at is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'type',type,'title',title,'detail',detail,'status',status,'occurredAt',occurred_at,'actor',actor,'metadata',metadata) order by occurred_at desc),'[]'::jsonb)
  into result from timeline;
  return result;
end;
$$;
revoke all on function public.admin_get_applicant_timeline(uuid) from public,anon;
grant execute on function public.admin_get_applicant_timeline(uuid) to authenticated,service_role;

-- No existing Retry Required candidate is mutated here. Existing real candidates are
-- reconciled only after the frontend route is deployed and verified.

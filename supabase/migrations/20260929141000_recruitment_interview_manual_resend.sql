-- Allow authorized recruitment staff to resend the existing interview invitation
-- without creating another interview or another Zoho meeting.

create or replace function public.admin_get_recruitment_interview_delivery_status(p_interview_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_ri public.recruitment_interviews%rowtype;
  v_app public.applicants%rowtype;
  v_latest public.notification_outbox%rowtype;
  v_count integer:=0;
begin
  select * into v_ri from public.recruitment_interviews where id=p_interview_id;
  if not found then raise exception 'Recruitment interview not found.'; end if;

  if not public.can_manage_content_applicant(v_ri.applicant_id) and not public.is_admin() then
    raise exception 'Recruitment management access required.';
  end if;

  select * into v_app from public.applicants where id=v_ri.applicant_id;

  select count(*) into v_count
  from public.notification_outbox n
  where n.template_key='recruitment_interview_scheduled'
    and (
      n.payload->>'interviewId'=v_ri.id::text
      or n.dedupe_key like '%:interview:'||v_ri.id::text||'%'
      or n.dedupe_key like 'recruitment:browser-first-access:'||v_ri.id::text||':%'
    );

  select * into v_latest
  from public.notification_outbox n
  where n.template_key='recruitment_interview_scheduled'
    and (
      n.payload->>'interviewId'=v_ri.id::text
      or n.dedupe_key like '%:interview:'||v_ri.id::text||'%'
      or n.dedupe_key like 'recruitment:browser-first-access:'||v_ri.id::text||':%'
    )
  order by n.created_at desc
  limit 1;

  return jsonb_build_object(
    'interviewId',v_ri.id,
    'recipientEmail',lower(btrim(coalesce(v_app.email,''))),
    'sendCount',v_count,
    'hasNotification',v_latest.id is not null,
    'notificationId',v_latest.id,
    'status',coalesce(v_latest.status,'Not Sent'),
    'deliveryStatus',coalesce(v_latest.delivery_status,'Not Sent'),
    'lastQueuedAt',v_latest.created_at,
    'lastUpdatedAt',v_latest.updated_at,
    'lastError',coalesce(v_latest.last_error,'')
  );
end;
$$;

revoke all on function public.admin_get_recruitment_interview_delivery_status(uuid)
  from public,anon,authenticated;
grant execute on function public.admin_get_recruitment_interview_delivery_status(uuid)
  to authenticated;

create or replace function public.admin_resend_recruitment_interview_invitation(p_interview_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_ri public.recruitment_interviews%rowtype;
  v_app public.applicants%rowtype;
  v_meeting public.sales_meetings%rowtype;
  v_latest public.notification_outbox%rowtype;
  v_interviewer text;
  v_candidate_timezone text;
  v_candidate_local text;
  v_local text;
  v_duration integer;
  v_notification_id uuid;
  v_dedupe_key text;
begin
  select * into v_ri
  from public.recruitment_interviews
  where id=p_interview_id
  for update;

  if not found then raise exception 'Recruitment interview not found.'; end if;

  if not public.can_manage_content_applicant(v_ri.applicant_id) and not public.is_admin() then
    raise exception 'Recruitment management access required.';
  end if;

  select * into v_app from public.applicants where id=v_ri.applicant_id;
  if not found or v_app.closed_at is not null then
    raise exception 'Closed candidates cannot receive interview invitations.';
  end if;

  select * into v_meeting
  from public.sales_meetings
  where id=v_ri.meeting_id
  for update;

  if not found then raise exception 'Interview meeting not found.'; end if;
  if v_meeting.status not in('Scheduled','Rescheduled') then
    raise exception 'Only an active scheduled interview can be resent.';
  end if;
  if v_meeting.end_at<=now() then raise exception 'This interview has already ended.'; end if;
  if coalesce(btrim(v_meeting.meeting_url),'')!~*'^https://' then
    raise exception 'The Zoho Meeting join link is not ready yet.';
  end if;

  select * into v_latest
  from public.notification_outbox n
  where n.template_key='recruitment_interview_scheduled'
    and (
      n.payload->>'interviewId'=v_ri.id::text
      or n.dedupe_key like '%:interview:'||v_ri.id::text||'%'
      or n.dedupe_key like 'recruitment:browser-first-access:'||v_ri.id::text||':%'
    )
  order by n.created_at desc
  limit 1;

  if v_latest.id is not null
     and v_latest.created_at>now()-interval '45 seconds'
     and v_latest.status not in('Failed','Suppressed') then
    return jsonb_build_object(
      'success',true,
      'queued',false,
      'duplicatePrevented',true,
      'notificationId',v_latest.id,
      'status',v_latest.status,
      'deliveryStatus',v_latest.delivery_status,
      'recipientEmail',lower(btrim(v_app.email)),
      'message','An interview invitation was already queued or sent moments ago.'
    );
  end if;

  select full_name into v_interviewer
  from public.user_profiles
  where id=v_ri.interviewer_id;

  v_duration:=greatest(1,round(extract(epoch from (v_meeting.end_at-v_meeting.start_at))/60.0)::integer);
  v_local:=to_char(v_meeting.start_at at time zone v_meeting.timezone,'FMDay, FMMonth DD, YYYY at HH12:MI AM');
  v_candidate_timezone:=case
    when exists(select 1 from pg_timezone_names where name=v_app.timezone) then v_app.timezone
    else v_meeting.timezone
  end;
  v_candidate_local:=to_char(v_meeting.start_at at time zone v_candidate_timezone,'FMDay, FMMonth DD, YYYY at HH12:MI AM');

  v_dedupe_key:=
    'recruitment:'||v_app.id::text||
    ':interview:'||v_ri.id::text||
    ':manual-resend:'||replace(clock_timestamp()::text,' ','T')||
    ':'||left(gen_random_uuid()::text,8);

  v_notification_id:=public.enqueue_notification(
    v_dedupe_key,
    'recruitment_interview_scheduled',
    lower(btrim(v_app.email)),
    null,
    public.recruitment_notification_payload(v_app)||jsonb_build_object(
      'interviewId',v_ri.id,
      'interviewStage',v_ri.stage,
      'interviewDateTime',v_local,
      'interviewTimezone',v_meeting.timezone,
      'candidateDateTime',v_candidate_local,
      'candidateTimezone',v_candidate_timezone,
      'interviewerName',coalesce(v_interviewer,'ProFox Recruitment Team'),
      'interviewDuration',v_duration||' minutes',
      'manualResend',true
    ),
    now()
  );

  if v_notification_id is null then raise exception 'Interview invitation could not be queued.'; end if;

  perform public.log_applicant_event(
    v_app.id,
    'interview',
    'interview_invitation_resent',
    v_ri.stage||' interview invitation resent',
    'The existing interview invitation was manually resent. The scheduled meeting and Zoho Meeting were reused without creating a duplicate.',
    null,
    'Queued',
    case when public.is_admin() then 'admin' else 'content_manager' end,
    auth.uid(),
    'recruitment_interviews',
    v_ri.id,
    jsonb_build_object(
      'meetingId',v_meeting.id,
      'notificationId',v_notification_id,
      'recipientEmail',lower(btrim(v_app.email))
    )
  );

  return jsonb_build_object(
    'success',true,
    'queued',true,
    'duplicatePrevented',false,
    'notificationId',v_notification_id,
    'status','Pending',
    'deliveryStatus','Unknown',
    'recipientEmail',lower(btrim(v_app.email)),
    'message','Interview invitation queued for resend.'
  );
end;
$$;

revoke all on function public.admin_resend_recruitment_interview_invitation(uuid)
  from public,anon,authenticated;
grant execute on function public.admin_resend_recruitment_interview_invitation(uuid)
  to authenticated;

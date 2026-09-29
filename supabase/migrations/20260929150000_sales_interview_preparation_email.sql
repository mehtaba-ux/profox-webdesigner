-- Add Sales-specific interview preparation without changing other recruitment roles.
-- Automatic interview confirmations and manual resends select this template only
-- when the applicant's canonical system role is sales.

insert into public.notification_templates(
  template_key,name,subject_template,body_template,html_template,active,description,updated_at
)
values(
  'recruitment_sales_interview_scheduled',
  'Sales recruitment interview scheduled',
  'Your ProFox Sales Interview Is Confirmed - Here''s How to Prepare',
  'Hi {{fullName}},

Your {{interviewStage}} interview with ProFox Web Designer is confirmed.

Date and time: {{candidateDateTime}}
Time zone: {{candidateTimezone}}
Interviewer: {{interviewerName}}
Duration: {{interviewDuration}}

This will be a practical conversation about your sales experience, communication, judgment, and readiness to work with the ProFox sales process.

We do not want you to come to the interview without knowing what to expect. Please spend a little time preparing the areas below.

1. Be ready to talk about your real sales experience

Think about 1 or 2 genuine sales situations from your previous experience. Be ready to explain:
- What product or service you were selling
- Who the customer was
- How the conversation started
- What the customer needed
- Any hesitation or objection they had
- How you handled the situation
- What happened in the end

You do not need a perfect story. We care more about real experience, clear communication, and how you think during a sales conversation.

2. Understand how the ProFox sales process works

ProFox provides sales representatives with leads and opportunities inside the CRM. Your responsibility is to work those opportunities professionally and move each genuine prospect toward the appropriate next step.

The general process may look like:
Lead Assigned -> Research -> Outreach -> Qualification -> Discovery -> Solution Discussion -> Objection Handling -> Follow-Up -> Next Step -> Verified Payment -> Handover

You do not need to memorize this process. We want you to understand that good sales is not about immediately pushing a service. It is about understanding the customer, identifying the problem, and moving the conversation forward professionally.

3. Finding your own leads is optional

You will receive leads through the ProFox CRM. You are not required to find your own leads.

If you independently discover a business that you genuinely believe could be a good ProFox customer, you may identify and add that opportunity through the proper CRM process. This is optional and can be an advantage, but it is not a requirement for the role.

4. Think about the problems our customers may have

ProFox provides website, application, and other digital services to businesses. Think about problems such as:
- An outdated website
- Poor mobile experience
- Slow website
- Weak online credibility
- Broken contact forms
- Weak calls to action
- No online booking
- Poor conversion
- Services that are difficult to understand
- Manual processes that could potentially be improved digitally

You do not need to be a website expert. We mainly want to understand whether you can listen to a customer, recognize a business problem, and ask sensible questions before recommending anything.

5. Be prepared for simple sales situations

During the interview, we may give you a basic customer situation and ask what you would do next. For example:
- I am not interested.
- The price is too high.
- Send me the information.
- We already have a website.
- I need some time to think.
- Call me later.

We are not looking for memorized scripts. We want to see whether you can remain calm, understand what the customer actually means, ask an appropriate question, and guide the conversation toward a reasonable next step.

6. Be ready to talk about follow-up and CRM discipline

Since leads are managed through the ProFox CRM, proper record keeping is an important part of the role. You should be comfortable keeping track of:
- Customer information
- Conversation notes
- Lead status
- Calls and meetings
- Follow-up dates
- Customer requirements
- Objections or concerns
- Agreed next action

A salesperson should always be able to answer:
What happened?
What is the next step?
When should the next follow-up happen?

7. Know your availability and working readiness

Please be prepared to confirm:
- Your weekly availability
- Your working environment
- Laptop or desktop and internet readiness
- Ability to attend scheduled meetings
- Comfort communicating in English
- Comfort speaking with international prospects
- Willingness to learn ProFox services and the sales process

What we are looking for

You do not need to know everything about websites, applications, or software before joining the interview.

We are primarily looking for someone who can communicate clearly, listen carefully, ask useful questions, understand customer needs, handle objections professionally, follow up consistently, maintain CRM discipline, learn quickly, and take responsibility for the next step.

Please do not prepare a word-for-word script. You may keep a few short notes beside you, but we want to hear your genuine experience and your natural thinking.

Join your interview:
{{interviewJoinUrl}}

For the smoothest browser experience, open the link on a laptop or desktop using Chrome, Edge, or Firefox. Please join a few minutes early from a quiet place with reliable internet and working audio.

If you have a genuine scheduling issue, contact the ProFox Recruitment Team before the interview.

ProFox Recruitment Team
ProFox Web Designer',
  '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your ProFox Sales interview is confirmed. Here is what to prepare before you join.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f5fb;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;"><tr><td style="height:4px;background:#000080;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="padding:24px 28px 18px;border-bottom:1px solid #eef2f7;"><div style="font-size:19px;line-height:26px;font-weight:700;color:#000080;">ProFox Web Designer</div><div style="margin-top:4px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.2px;color:#64748b;">SALES RECRUITMENT INTERVIEW</div></td></tr><tr><td style="padding:28px;"><h1 style="margin:0 0 12px;font-size:25px;line-height:33px;font-weight:700;color:#0f172a;">Your Sales interview is confirmed</h1><p style="margin:0 0 20px;font-size:15px;line-height:24px;color:#334155;">Hi {{fullName}},<br><br>Your <strong>{{interviewStage}}</strong> interview with ProFox is confirmed. This will be a practical conversation about your sales experience, communication, judgment, and readiness to work with the ProFox sales process.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;"><tr><td style="padding:16px;font-size:14px;line-height:23px;color:#334155;"><strong>Date and time:</strong> {{candidateDateTime}}<br><strong>Time zone:</strong> {{candidateTimezone}}<br><strong>Interviewer:</strong> {{interviewerName}}<br><strong>Duration:</strong> {{interviewDuration}}</td></tr></table><div style="margin:0 0 22px;padding:16px 18px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;font-size:14px;line-height:23px;color:#312e81;"><strong>How to prepare</strong><br>We do not want you to come to the interview without knowing what to expect. Please review the areas below. You do not need to memorize scripts or prepare perfect answers.</div><h2 style="margin:22px 0 8px;font-size:17px;line-height:24px;color:#0f172a;">1. Your real sales experience</h2><p style="margin:0 0 8px;font-size:14px;line-height:23px;color:#475569;">Think about 1 or 2 genuine sales situations. Be ready to explain what you sold, who the customer was, how the conversation started, what the customer needed, any objection or hesitation, what you did, and the final result.</p><p style="margin:0 0 18px;font-size:14px;line-height:23px;color:#475569;">We care more about real experience, clear communication, and how you think than impressive-sounding answers.</p><h2 style="margin:22px 0 8px;font-size:17px;line-height:24px;color:#0f172a;">2. Understand the ProFox sales process</h2><p style="margin:0 0 10px;font-size:14px;line-height:23px;color:#475569;">ProFox provides sales representatives with leads and opportunities inside the CRM. Your responsibility is to work those opportunities professionally and move each genuine prospect toward the appropriate next step.</p><div style="margin:0 0 12px;padding:13px 15px;background:#f8fafc;border-left:3px solid #000080;font-size:13px;line-height:22px;color:#334155;"><strong>Lead Assigned &rarr; Research &rarr; Outreach &rarr; Qualification &rarr; Discovery &rarr; Solution Discussion &rarr; Objection Handling &rarr; Follow-Up &rarr; Next Step &rarr; Verified Payment &rarr; Handover</strong></div><p style="margin:0 0 18px;font-size:14px;line-height:23px;color:#475569;">You do not need to memorize this. Good sales is not about immediately pushing a service. It is about understanding the customer, identifying the problem, and moving the conversation forward professionally.</p><h2 style="margin:22px 0 8px;font-size:17px;line-height:24px;color:#0f172a;">3. Finding your own leads is optional</h2><p style="margin:0 0 18px;font-size:14px;line-height:23px;color:#475569;"><strong>ProFox will provide leads through the CRM.</strong> You are not required to find your own leads. If you independently discover a business that you genuinely believe could be a good ProFox customer, you may add that opportunity through the proper CRM process. This is optional, not a requirement.</p><h2 style="margin:22px 0 8px;font-size:17px;line-height:24px;color:#0f172a;">4. Think about customer problems</h2><p style="margin:0 0 8px;font-size:14px;line-height:23px;color:#475569;">ProFox provides website, application, and other digital services. Think about business problems such as an outdated website, poor mobile experience, slow performance, weak online credibility, broken forms, weak calls to action, no online booking, poor conversion, unclear services, or manual processes that could be improved digitally.</p><p style="margin:0 0 18px;font-size:14px;line-height:23px;color:#475569;">You do not need to be a website expert. We want to understand whether you can listen, recognize a business problem, and ask sensible questions before recommending anything.</p><h2 style="margin:22px 0 8px;font-size:17px;line-height:24px;color:#0f172a;">5. Be ready for simple sales situations</h2><p style="margin:0 0 8px;font-size:14px;line-height:23px;color:#475569;">We may give you a basic customer situation such as:</p><ul style="margin:0 0 12px;padding-left:20px;font-size:14px;line-height:23px;color:#475569;"><li>I am not interested.</li><li>The price is too high.</li><li>Send me the information.</li><li>We already have a website.</li><li>I need some time to think.</li><li>Call me later.</li></ul><p style="margin:0 0 18px;font-size:14px;line-height:23px;color:#475569;">We are not looking for memorized scripts. We want to see whether you can remain calm, understand the concern, ask an appropriate question, and guide the conversation toward a reasonable next step.</p><h2 style="margin:22px 0 8px;font-size:17px;line-height:24px;color:#0f172a;">6. Follow-up and CRM discipline</h2><p style="margin:0 0 8px;font-size:14px;line-height:23px;color:#475569;">Be ready to discuss how you would keep track of customer information, conversation notes, lead status, calls and meetings, follow-up dates, requirements, objections, and the agreed next action.</p><p style="margin:0 0 18px;font-size:14px;line-height:23px;color:#475569;"><strong>A salesperson should always know: What happened? What is the next step? When should the next follow-up happen?</strong></p><h2 style="margin:22px 0 8px;font-size:17px;line-height:24px;color:#0f172a;">7. Your availability and working readiness</h2><p style="margin:0 0 18px;font-size:14px;line-height:23px;color:#475569;">Be prepared to confirm your weekly availability, working environment, laptop or desktop and internet readiness, ability to attend scheduled meetings, comfort communicating in English and with international prospects, and willingness to learn ProFox services and the sales process.</p><div style="margin:24px 0;padding:17px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;line-height:23px;color:#334155;"><strong style="color:#0f172a;">What we are looking for</strong><br><br>You do not need to know everything about websites, applications, or software before the interview. We are looking for someone who can communicate clearly, listen carefully, ask useful questions, understand customer needs, handle objections professionally, follow up consistently, maintain CRM discipline, learn quickly, and take responsibility for the next step.<br><br>Please do not prepare a word-for-word script. Short notes are fine, but we want to hear your genuine experience and natural thinking.</div><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:6px;"><tr><td bgcolor="#000080" style="border-radius:9px;"><a href="{{interviewJoinUrl}}" style="display:inline-block;padding:14px 24px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Join Interview</a></td></tr></table><p style="margin:18px 0 0;font-size:13px;line-height:21px;color:#64748b;">For the smoothest browser experience, use a laptop or desktop with Chrome, Edge, or Firefox. Please join a few minutes early from a quiet place with reliable internet and working audio.</p><p style="margin:12px 0 0;font-size:13px;line-height:21px;color:#64748b;">If you have a genuine scheduling issue, contact the ProFox Recruitment Team before the interview.</p></td></tr><tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #eef2f7;font-size:12px;line-height:19px;color:#64748b;">ProFox Recruitment Team<br>ProFox Web Designer<br><a href="https://www.profoxwebdesigner.com/" style="color:#000080;text-decoration:none;">www.profoxwebdesigner.com</a></td></tr></table></td></tr></table></body></html>',
  true,
  'Sales-specific candidate confirmation with interview preparation guidance and secure browser-first join access.',
  now()
)
on conflict(template_key) do update set
  name=excluded.name,
  subject_template=excluded.subject_template,
  body_template=excluded.body_template,
  html_template=excluded.html_template,
  active=excluded.active,
  description=excluded.description,
  updated_at=now();

create or replace function public.queue_recruitment_interview_confirmation_on_meeting_link()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_ri public.recruitment_interviews%rowtype;
  v_app public.applicants%rowtype;
  v_interviewer text;
  v_local text;
  v_candidate_local text;
  v_candidate_timezone text;
  v_duration integer;
  v_template_key text;
begin
  if new.status not in('Scheduled','Rescheduled') or coalesce(btrim(new.meeting_url),'')='' then return new; end if;
  if new.meeting_url is not distinct from old.meeting_url then return new; end if;

  select * into v_ri from public.recruitment_interviews where meeting_id=new.id;
  if not found then return new; end if;
  select * into v_app from public.applicants where id=v_ri.applicant_id;
  if not found then return new; end if;
  select full_name into v_interviewer from public.user_profiles where id=v_ri.interviewer_id;

  v_template_key:=case
    when public.career_job_system_role(v_app.career_job_id)='sales'
      then 'recruitment_sales_interview_scheduled'
    else 'recruitment_interview_scheduled'
  end;

  v_duration:=greatest(1,round(extract(epoch from (new.end_at-new.start_at))/60.0)::integer);
  v_local:=to_char(new.start_at at time zone new.timezone,'FMDay, FMMonth DD, YYYY at HH12:MI AM');
  v_candidate_timezone:=case when exists(select 1 from pg_timezone_names where name=v_app.timezone) then v_app.timezone else new.timezone end;
  v_candidate_local:=to_char(new.start_at at time zone v_candidate_timezone,'FMDay, FMMonth DD, YYYY at HH12:MI AM');

  perform public.enqueue_notification(
    'recruitment:'||v_app.id::text||':interview:'||v_ri.id::text,
    v_template_key,
    lower(btrim(v_app.email)),
    null,
    public.recruitment_notification_payload(v_app)||jsonb_build_object(
      'interviewId',v_ri.id,
      'interviewStage',v_ri.stage,
      'interviewDateTime',v_local,
      'interviewTimezone',new.timezone,
      'candidateDateTime',v_candidate_local,
      'candidateTimezone',v_candidate_timezone,
      'interviewerName',coalesce(v_interviewer,'ProFox Recruitment Team'),
      'interviewDuration',v_duration||' minutes'
    ),
    now()
  );

  return new;
end;
$$;

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
  where n.template_key in('recruitment_interview_scheduled','recruitment_sales_interview_scheduled')
    and (
      n.payload->>'interviewId'=v_ri.id::text
      or n.dedupe_key like '%:interview:'||v_ri.id::text||'%'
      or n.dedupe_key like 'recruitment:browser-first-access:'||v_ri.id::text||':%'
    );

  select * into v_latest
  from public.notification_outbox n
  where n.template_key in('recruitment_interview_scheduled','recruitment_sales_interview_scheduled')
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
  v_template_key text;
begin
  select * into v_ri from public.recruitment_interviews where id=p_interview_id for update;
  if not found then raise exception 'Recruitment interview not found.'; end if;

  if not public.can_manage_content_applicant(v_ri.applicant_id) and not public.is_admin() then
    raise exception 'Recruitment management access required.';
  end if;

  select * into v_app from public.applicants where id=v_ri.applicant_id;
  if not found or v_app.closed_at is not null then
    raise exception 'Closed candidates cannot receive interview invitations.';
  end if;

  select * into v_meeting from public.sales_meetings where id=v_ri.meeting_id for update;
  if not found then raise exception 'Interview meeting not found.'; end if;
  if v_meeting.status not in('Scheduled','Rescheduled') then
    raise exception 'Only an active scheduled interview can be resent.';
  end if;
  if v_meeting.end_at<=now() then raise exception 'This interview has already ended.'; end if;
  if coalesce(btrim(v_meeting.meeting_url),'')!~*'^https://' then
    raise exception 'The Zoho Meeting join link is not ready yet.';
  end if;

  v_template_key:=case
    when public.career_job_system_role(v_app.career_job_id)='sales'
      then 'recruitment_sales_interview_scheduled'
    else 'recruitment_interview_scheduled'
  end;

  select * into v_latest
  from public.notification_outbox n
  where n.template_key in('recruitment_interview_scheduled','recruitment_sales_interview_scheduled')
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

  select full_name into v_interviewer from public.user_profiles where id=v_ri.interviewer_id;

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
    v_template_key,
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
      'recipientEmail',lower(btrim(v_app.email)),
      'templateKey',v_template_key
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

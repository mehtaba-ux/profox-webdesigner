-- Browser-first recruitment interview access through one ProFox-branded email.
-- Zoho remains the calendar and meeting provider; this suppresses duplicate
-- provider emails and keeps the candidate join URL behind a secure capability token.

create table if not exists public.recruitment_interview_join_tokens (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.recruitment_interviews(id) on delete cascade,
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  opened_at timestamptz,
  revoked_at timestamptz,
  source text not null default 'email_delivery',
  created_at timestamptz not null default now()
);

alter table public.recruitment_interview_join_tokens enable row level security;
revoke all on table public.recruitment_interview_join_tokens from public,anon,authenticated;

create index if not exists recruitment_interview_join_tokens_interview_idx
  on public.recruitment_interview_join_tokens(interview_id,issued_at desc);

create or replace function public.service_prepare_recruitment_interview_join_delivery(p_interview_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_interview public.recruitment_interviews%rowtype;
  v_meeting public.sales_meetings%rowtype;
  v_join_url text;
  v_token text;
  v_expires timestamptz;
begin
  select * into v_interview from public.recruitment_interviews where id=p_interview_id;
  if not found then raise exception 'Recruitment interview not found.'; end if;

  select * into v_meeting from public.sales_meetings where id=v_interview.meeting_id;
  if not found or v_meeting.status not in('Scheduled','Rescheduled') then
    raise exception 'Recruitment interview is not active.';
  end if;
  if v_meeting.end_at<=now()-interval '15 minutes' then
    raise exception 'Recruitment interview has already ended.';
  end if;

  select coalesce(nullif(btrim(mpl.join_url),''),nullif(btrim(v_meeting.meeting_url),''))
  into v_join_url
  from (select 1) seed
  left join public.meeting_provider_private_links mpl
    on mpl.meeting_id=v_meeting.id and mpl.provider='zoho_meeting';

  if coalesce(v_join_url,'')!~*'^https://' then
    raise exception 'Recruitment interview join link is not ready.';
  end if;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_expires:=v_meeting.end_at+interval '2 hours';

  insert into public.recruitment_interview_join_tokens(interview_id,token_hash,expires_at,source)
  values(v_interview.id,public.recruitment_task_token_hash(v_token),v_expires,'notification_delivery');

  return jsonb_build_object(
    'interviewJoinUrl','https://www.profoxwebdesigner.com/recruitment/interview/'||v_token
  );
end;
$$;

revoke all on function public.service_prepare_recruitment_interview_join_delivery(uuid)
  from public,anon,authenticated;
grant execute on function public.service_prepare_recruitment_interview_join_delivery(uuid)
  to service_role;

create or replace function public.public_open_recruitment_interview_join(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_token public.recruitment_interview_join_tokens%rowtype;
  v_interview public.recruitment_interviews%rowtype;
  v_meeting public.sales_meetings%rowtype;
  v_app public.applicants%rowtype;
  v_interviewer text;
  v_join_url text;
begin
  if char_length(coalesce(p_token,''))<40 or char_length(p_token)>200 then
    raise exception 'This interview link is invalid or no longer active.';
  end if;

  select * into v_token
  from public.recruitment_interview_join_tokens
  where token_hash=public.recruitment_task_token_hash(p_token)
    and revoked_at is null
    and expires_at>now()
  for update;

  if not found then raise exception 'This interview link is invalid or no longer active.'; end if;

  select * into v_interview from public.recruitment_interviews where id=v_token.interview_id;
  if not found then raise exception 'Recruitment interview not found.'; end if;

  select * into v_meeting from public.sales_meetings where id=v_interview.meeting_id;
  if not found or v_meeting.status not in('Scheduled','Rescheduled') then
    raise exception 'This interview is no longer active.';
  end if;

  select * into v_app from public.applicants where id=v_interview.applicant_id;
  if not found or v_app.closed_at is not null then raise exception 'This interview is no longer active.'; end if;

  select coalesce(nullif(btrim(mpl.join_url),''),nullif(btrim(v_meeting.meeting_url),''))
  into v_join_url
  from (select 1) seed
  left join public.meeting_provider_private_links mpl
    on mpl.meeting_id=v_meeting.id and mpl.provider='zoho_meeting';

  if coalesce(v_join_url,'')!~*'^https://' then raise exception 'The interview join link is not ready yet.'; end if;

  select full_name into v_interviewer from public.user_profiles where id=v_interview.interviewer_id;

  if v_token.opened_at is null then
    update public.recruitment_interview_join_tokens set opened_at=now() where id=v_token.id;
    insert into public.applicant_events(
      applicant_id,category,event_type,title,detail,actor_type,source_table,source_id,metadata
    )
    values(
      v_app.id,'Recruitment','Interview Join Link Opened',
      v_interview.stage||' interview join link opened',
      'Candidate opened the secure ProFox interview access page.',
      'Candidate','recruitment_interviews',v_interview.id,
      jsonb_build_object('meetingId',v_meeting.id,'stage',v_interview.stage)
    );
  end if;

  return jsonb_build_object(
    'candidateName',v_app.full_name,
    'interviewStage',v_interview.stage,
    'interviewerName',coalesce(v_interviewer,'ProFox Recruitment Team'),
    'startAt',v_meeting.start_at,
    'endAt',v_meeting.end_at,
    'timezone',v_meeting.timezone,
    'providerLabel','Zoho Meeting',
    'joinUrl',v_join_url,
    'status',v_meeting.status
  );
end;
$$;

revoke all on function public.public_open_recruitment_interview_join(text)
  from public,anon,authenticated;
grant execute on function public.public_open_recruitment_interview_join(text)
  to anon,authenticated,service_role;

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
begin
  if new.status not in('Scheduled','Rescheduled') or coalesce(btrim(new.meeting_url),'')='' then return new; end if;
  if new.meeting_url is not distinct from old.meeting_url then return new; end if;

  select * into v_ri from public.recruitment_interviews where meeting_id=new.id;
  if not found then return new; end if;
  select * into v_app from public.applicants where id=v_ri.applicant_id;
  if not found then return new; end if;
  select full_name into v_interviewer from public.user_profiles where id=v_ri.interviewer_id;

  v_duration:=greatest(1,round(extract(epoch from (new.end_at-new.start_at))/60.0)::integer);
  v_local:=to_char(new.start_at at time zone new.timezone,'FMDay, FMMonth DD, YYYY at HH12:MI AM');
  v_candidate_timezone:=case when exists(select 1 from pg_timezone_names where name=v_app.timezone) then v_app.timezone else new.timezone end;
  v_candidate_local:=to_char(new.start_at at time zone v_candidate_timezone,'FMDay, FMMonth DD, YYYY at HH12:MI AM');

  perform public.enqueue_notification(
    'recruitment:'||v_app.id::text||':interview:'||v_ri.id::text,
    'recruitment_interview_scheduled',
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

update public.notification_templates
set subject_template='Your ProFox interview is confirmed',
    body_template='Hi {{fullName}},

Your {{interviewStage}} interview with ProFox is confirmed.

Date and time: {{candidateDateTime}}
Time zone: {{candidateTimezone}}
Interviewer: {{interviewerName}}
Duration: {{interviewDuration}}

Join your interview:
{{interviewJoinUrl}}

For the smoothest browser experience, open the link on a laptop or desktop using Chrome, Edge, or Firefox. Please join a few minutes early from a quiet place with reliable internet.

If you have a genuine scheduling issue, contact the ProFox Recruitment Team before the interview.

ProFox Recruitment Team
ProFox Web Designer',
    html_template='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your ProFox interview is confirmed. Use the secure link to join.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f5fb;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;"><tr><td style="height:4px;background:#000080;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="padding:24px 28px 18px;border-bottom:1px solid #eef2f7;"><div style="font-size:19px;line-height:26px;font-weight:700;color:#000080;">ProFox Web Designer</div><div style="margin-top:4px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.2px;color:#64748b;">RECRUITMENT INTERVIEW</div></td></tr><tr><td style="padding:28px;"><h1 style="margin:0 0 16px;font-size:24px;line-height:32px;font-weight:700;color:#0f172a;">Your interview is confirmed</h1><p style="margin:0 0 18px;font-size:15px;line-height:24px;color:#334155;">Hi {{fullName}},<br><br>Your <strong>{{interviewStage}}</strong> interview with ProFox is scheduled and ready.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;"><tr><td style="padding:16px;font-size:14px;line-height:23px;color:#334155;"><strong>Date and time:</strong> {{candidateDateTime}}<br><strong>Time zone:</strong> {{candidateTimezone}}<br><strong>Interviewer:</strong> {{interviewerName}}<br><strong>Duration:</strong> {{interviewDuration}}</td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#000080" style="border-radius:9px;"><a href="{{interviewJoinUrl}}" style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Join Interview</a></td></tr></table><p style="margin:20px 0 0;font-size:13px;line-height:21px;color:#64748b;">For the smoothest browser experience, open this link on a laptop or desktop using Chrome, Edge, or Firefox. Please join a few minutes early from a quiet place with reliable internet.</p><p style="margin:14px 0 0;font-size:13px;line-height:21px;color:#64748b;">If you have a genuine scheduling issue, contact the ProFox Recruitment Team before the interview.</p></td></tr><tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #eef2f7;font-size:12px;line-height:19px;color:#64748b;">ProFox Recruitment Team<br>ProFox Web Designer<br><a href="https://www.profoxwebdesigner.com/" style="color:#000080;text-decoration:none;">www.profoxwebdesigner.com</a></td></tr></table></td></tr></table></body></html>',
    updated_at=now()
where template_key='recruitment_interview_scheduled';

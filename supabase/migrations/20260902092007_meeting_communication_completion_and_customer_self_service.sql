-- Complete the universal ProFox meeting communication system.

update public.system_configuration
set config_value = coalesce(config_value,'{}'::jsonb)
  || jsonb_build_object('reminderMinutes',jsonb_build_array(1440,60,15),'meetingFinalReminderEmailEnabled',true),
    updated_at=now()
where config_key='notification_settings';

update public.notification_templates
set active=false,updated_at=now()
where template_key in ('booking_confirmation','booking_rescheduled','booking_cancelled','meeting_reminder','seller_meeting_reminder','no_show_rebook');

update public.notification_templates
set body_template='Hi {{contactFirstName}},

The meeting scheduled for {{previousMeetingTimeVisitor}} is no longer going ahead.

If you would still like to continue the conversation, choose another suitable time below.

Choose another time: {{bookingPageUrl}}

If you have a question about the change, reply directly to this email.

{{ownerFirstName}}
ProFox
From site to system.
https://www.profoxwebdesigner.com/',
    html_template=public.service_profox_meeting_email_html(
      'MEETING UPDATE','Your ProFox meeting has been cancelled',
      '<p>Hi {{contactFirstName}},</p><p>The meeting scheduled for <strong>{{previousMeetingTimeVisitor}}</strong> is no longer going ahead.</p><p>If you would still like to continue the conversation, choose another suitable time below.</p><p>If you have a question about the change, reply directly to this email.</p>',
      'Choose another time','{{bookingPageUrl}}'
    ),updated_at=now()
where template_key='meeting_cancelled_by_profox_customer';

create or replace function public.get_public_booking_management(p_token uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare v_result jsonb;
begin
  if p_token is null then raise exception 'Booking access token is required.'; end if;
  select jsonb_build_object(
    'bookingReference',a.booking_reference,'status',a.status,'contactName',a.contact_name,'email',a.email,
    'companyName',a.company_name,'serviceInterest',coalesce(nullif(a.service_interest,''),m.meeting_type),
    'visitorTimezone',a.visitor_timezone,'startAt',m.start_at,'endAt',m.end_at,'sellerTimezone',m.timezone,
    'meetingStatus',m.status,'meetingType',m.meeting_type,'meetingUrl',m.meeting_url,'salespersonId',m.salesperson_id,
    'expertName',coalesce(nullif(bp.display_name,''),up.full_name,'ProFox Specialist'),
    'expertHeadline',coalesce(bp.headline,''),'expertCountry',coalesce(nullif(bp.country,''),up.country,''),
    'expertAvatarUrl',coalesce(nullif(bp.avatar_url,''),up.avatar_url,''),'attendanceStatus',a.attendance_status,
    'canReschedule',(a.status='Confirmed' and m.status in ('Scheduled','Rescheduled') and a.management_token_expires_at>now()
      and exists(select 1 from public.user_calendar_settings c where c.user_id=m.salesperson_id and c.active is true)),
    'canCancel',(a.status='Confirmed' and m.status in ('Scheduled','Rescheduled') and a.management_token_expires_at>now()),
    'tokenExpiresAt',a.management_token_expires_at
  ) into v_result
  from public.sales_meeting_customer_access a
  join public.sales_meetings m on m.id=a.meeting_id
  join public.user_profiles up on up.id=m.salesperson_id
  left join public.public_booking_profiles bp on bp.salesperson_id=m.salesperson_id
  where a.management_token=p_token;
  if v_result is null then raise exception 'Booking not found.'; end if;
  return v_result;
end;
$function$;

create or replace function public.get_public_reschedule_slots(p_token uuid,p_from_date date default null,p_days integer default 14)
returns table(start_at timestamptz,end_at timestamptz,timezone text,duration_minutes integer)
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_access public.sales_meeting_customer_access%rowtype; v_meeting public.sales_meetings%rowtype;
  v_timezone text; v_working_days integer[]; v_work_start time; v_work_end time; v_duration integer;
  v_slot_interval integer; v_max_advance integer; v_today date; v_start_date date; v_end_date date; v_days integer;
begin
  if p_token is null then return; end if;
  select * into v_access from public.sales_meeting_customer_access where management_token=p_token;
  if not found or v_access.management_token_expires_at<=now() or v_access.status<>'Confirmed' then return; end if;
  select * into v_meeting from public.sales_meetings where id=v_access.meeting_id;
  if not found or v_meeting.status not in ('Scheduled','Rescheduled') then return; end if;
  select c.timezone,c.working_days,c.work_start,c.work_end,
         round(extract(epoch from (v_meeting.end_at-v_meeting.start_at))/60.0)::integer,
         least(greatest(coalesce((pbs.config_value->>'slotIntervalMinutes')::integer,15),5),120),
         least(greatest(coalesce((pbs.config_value->>'maxAdvanceDays')::integer,60),1),365)
    into v_timezone,v_working_days,v_work_start,v_work_end,v_duration,v_slot_interval,v_max_advance
  from public.user_calendar_settings c
  left join public.system_configuration pbs on pbs.config_key='public_booking_settings'
  where c.user_id=v_meeting.salesperson_id and c.active is true;
  if not found then return; end if;
  v_days:=least(greatest(coalesce(p_days,14),1),31);
  v_today:=(now() at time zone v_timezone)::date;
  v_start_date:=greatest(coalesce(p_from_date,v_today),v_today);
  v_end_date:=least(v_start_date+(v_days-1),v_today+v_max_advance);
  if v_start_date>v_end_date then return; end if;
  return query
  with dates as (
    select gs::date d from generate_series(v_start_date::timestamp,v_end_date::timestamp,interval '1 day') gs
    where extract(dow from gs)::integer=any(v_working_days)
  ), candidates as (
    select ((d.d+v_work_start)+(n*make_interval(mins=>v_slot_interval))) at time zone v_timezone slot_start
    from dates d cross join lateral generate_series(0,
      floor(greatest(extract(epoch from ((d.d+v_work_end)-(d.d+v_work_start)-make_interval(mins=>v_duration)))/60.0,-1)/v_slot_interval)::integer) n
  )
  select c.slot_start,c.slot_start+make_interval(mins=>v_duration),v_timezone,v_duration
  from candidates c
  where public.is_public_reschedule_slot_available(v_meeting.salesperson_id,c.slot_start,v_duration,v_meeting.id)
  order by c.slot_start limit 500;
end;
$function$;

create or replace function public.reschedule_public_booking(p_token uuid,p_start_at timestamptz,p_visitor_timezone text default 'UTC')
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_access public.sales_meeting_customer_access%rowtype; v_meeting public.sales_meetings%rowtype; v_duration integer; v_end_at timestamptz; v_visitor_timezone text;
begin
  if p_token is null or p_start_at is null then raise exception 'Booking token and new meeting time are required.'; end if;
  select * into v_access from public.sales_meeting_customer_access where management_token=p_token for update;
  if not found or v_access.management_token_expires_at<=now() then raise exception 'Booking management link is invalid or expired.'; end if;
  if v_access.status<>'Confirmed' then raise exception 'This booking can no longer be rescheduled.'; end if;
  select * into v_meeting from public.sales_meetings where id=v_access.meeting_id for update;
  if not found or v_meeting.status not in ('Scheduled','Rescheduled') then raise exception 'This meeting can no longer be rescheduled.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('public-booking:'||v_meeting.salesperson_id::text,0));
  v_duration:=round(extract(epoch from (v_meeting.end_at-v_meeting.start_at))/60.0)::integer;
  if not public.is_public_reschedule_slot_available(v_meeting.salesperson_id,p_start_at,v_duration,v_meeting.id) then raise exception 'That time is no longer available. Please choose another slot.'; end if;
  v_end_at:=p_start_at+make_interval(mins=>v_duration);
  v_visitor_timezone:=coalesce(nullif(trim(p_visitor_timezone),''),v_access.visitor_timezone,'UTC');
  if not exists(select 1 from pg_timezone_names where name=v_visitor_timezone) then v_visitor_timezone:='UTC'; end if;
  perform set_config('profox.meeting_customer_action','1',true);
  update public.sales_meetings set start_at=p_start_at,end_at=v_end_at,status='Rescheduled',rescheduled_at=now(),updated_at=now() where id=v_meeting.id;
  if v_meeting.activity_id is not null then update public.crm_activities set due_at=p_start_at,status='Scheduled',updated_at=now() where id=v_meeting.activity_id; end if;
  if v_meeting.opportunity_id is not null then update public.crm_opportunities set meeting_at=p_start_at,updated_at=now() where id=v_meeting.opportunity_id; end if;
  update public.sales_meeting_customer_access set visitor_timezone=v_visitor_timezone,status='Confirmed',attendance_status='Pending',attendance_confirmed_at=null,management_token_expires_at=greatest(management_token_expires_at,v_end_at+interval '30 days'),updated_at=now() where meeting_id=v_meeting.id;
  update public.public_booking_submissions set visitor_timezone=v_visitor_timezone,status='Confirmed',updated_at=now() where meeting_id=v_meeting.id;
  perform public.service_refresh_meeting_pending_communication_payloads(v_meeting.id);
  return public.get_public_booking_management(p_token);
end;
$function$;

create or replace function public.cancel_public_booking(p_token uuid,p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_access public.sales_meeting_customer_access%rowtype; v_meeting public.sales_meetings%rowtype;
begin
  if p_token is null then raise exception 'Booking token is required.'; end if;
  select * into v_access from public.sales_meeting_customer_access where management_token=p_token for update;
  if not found or v_access.management_token_expires_at<=now() then raise exception 'Booking management link is invalid or expired.'; end if;
  if v_access.status='Cancelled' then return public.get_public_booking_management(p_token); end if;
  select * into v_meeting from public.sales_meetings where id=v_access.meeting_id for update;
  if not found or v_meeting.status not in ('Scheduled','Rescheduled') then raise exception 'This meeting can no longer be cancelled.'; end if;
  perform set_config('profox.meeting_customer_action','1',true);
  update public.sales_meetings set status='Cancelled',cancelled_at=now(),outcome=case when trim(coalesce(p_reason,''))<>'' then left(trim(p_reason),2000) else outcome end,updated_at=now() where id=v_meeting.id;
  if v_meeting.activity_id is not null then update public.crm_activities set status='Cancelled',notes=trim(concat_ws(E'\n',nullif(notes,''),nullif(left(trim(coalesce(p_reason,'')),1000),''))),updated_at=now() where id=v_meeting.activity_id; end if;
  update public.sales_meeting_customer_access set status='Cancelled',updated_at=now() where meeting_id=v_meeting.id;
  update public.public_booking_submissions set status='Cancelled',updated_at=now() where meeting_id=v_meeting.id;
  return public.get_public_booking_management(p_token);
end;
$function$;

create or replace function public.crm_queue_meeting_communication_update()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_access public.sales_meeting_customer_access%rowtype; v_customer jsonb; v_seller jsonb; v_customer_action boolean:=false;
  v_previous_visitor text:=''; v_previous_seller text:=''; v_reason text:=''; v_template text; v_dedupe text;
begin
  if not exists(select 1 from public.sales_meeting_customer_access where meeting_id=new.id) then perform public.service_ensure_meeting_customer_access(new.id,'crm',null,null); end if;
  select * into v_access from public.sales_meeting_customer_access where meeting_id=new.id;
  if not found then return new; end if;
  v_customer_action:=coalesce(current_setting('profox.meeting_customer_action',true),'')='1';
  v_customer:=public.build_sales_meeting_customer_payload(new.id); v_seller:=public.build_sales_meeting_notification_payload(new.id);
  v_previous_visitor:=public.service_format_meeting_local(old.start_at,v_access.visitor_timezone);
  v_previous_seller:=public.service_format_meeting_local(old.start_at,old.timezone);
  if new.start_at is distinct from old.start_at and new.status in ('Scheduled','Rescheduled') then
    update public.sales_meeting_customer_access set attendance_status='Pending',attendance_confirmed_at=null,management_token_expires_at=greatest(management_token_expires_at,new.end_at+interval '30 days'),updated_at=now() where meeting_id=new.id;
    perform public.service_cancel_pending_meeting_reminders(new.id,'Superseded by a meeting reschedule.');
    perform public.service_refresh_meeting_pending_communication_payloads(new.id);
    v_customer:=public.build_sales_meeting_customer_payload(new.id); v_seller:=public.build_sales_meeting_notification_payload(new.id);
    if v_customer_action then
      v_template:='meeting_rescheduled_customer'; v_dedupe:='meeting-rescheduled-customer:'||new.id::text||':'||extract(epoch from new.start_at)::bigint::text;
      perform public.enqueue_notification(v_dedupe,v_template,v_access.email,null,v_customer||jsonb_build_object('emailPurpose','meeting reschedule confirmation','previousMeetingTimeVisitor',v_previous_visitor,'previousMeetingTimeSeller',v_previous_seller),now());
      perform public.enqueue_notification('seller-customer-rescheduled:'||new.id::text||':'||extract(epoch from new.start_at)::bigint::text,'seller_customer_rescheduled',coalesce(v_seller->>'sellerEmail',''),new.salesperson_id,v_seller||jsonb_build_object('previousMeetingTimeVisitor',v_previous_visitor,'previousMeetingTimeSeller',v_previous_seller),now());
      perform public.enqueue_in_app_notification(new.salesperson_id,'Rescheduled','Meeting rescheduled - '||coalesce(nullif(v_access.company_name,''),v_access.contact_name),v_access.contact_name||' moved the meeting to a new time.','/admin/meeting-prep/'||new.id::text,'inapp-customer-rescheduled:'||new.id::text||':'||extract(epoch from new.start_at)::bigint::text);
    else
      v_template:='meeting_rescheduled_by_profox_customer'; v_dedupe:='meeting-rescheduled-profox:'||new.id::text||':'||extract(epoch from new.start_at)::bigint::text;
      perform public.enqueue_notification(v_dedupe,v_template,v_access.email,null,v_customer||jsonb_build_object('emailPurpose','meeting time update','previousMeetingTimeVisitor',v_previous_visitor,'previousMeetingTimeSeller',v_previous_seller),now());
    end if;
    perform public.service_schedule_meeting_reminders(new.id);
  end if;
  if new.status='Cancelled' and old.status is distinct from 'Cancelled' then
    update public.sales_meeting_customer_access set status='Cancelled',updated_at=now() where meeting_id=new.id;
    perform public.service_cancel_pending_meeting_reminders(new.id,'Meeting cancelled before this reminder was due.');
    v_reason:=coalesce(nullif(trim(new.outcome),''),'No reason provided.');
    v_customer:=public.build_sales_meeting_customer_payload(new.id); v_seller:=public.build_sales_meeting_notification_payload(new.id);
    if v_customer_action then
      perform public.enqueue_notification('meeting-cancelled-customer:'||new.id::text,'meeting_cancelled_customer',v_access.email,null,v_customer||jsonb_build_object('emailPurpose','meeting cancellation confirmation','previousMeetingTimeVisitor',v_previous_visitor,'previousMeetingTimeSeller',v_previous_seller),now());
      perform public.enqueue_notification('seller-customer-cancelled:'||new.id::text,'seller_customer_cancelled',coalesce(v_seller->>'sellerEmail',''),new.salesperson_id,v_seller||jsonb_build_object('previousMeetingTimeVisitor',v_previous_visitor,'previousMeetingTimeSeller',v_previous_seller,'cancellationReason',v_reason),now());
      perform public.enqueue_in_app_notification(new.salesperson_id,'Cancelled','Meeting cancelled - '||coalesce(nullif(v_access.company_name,''),v_access.contact_name),v_access.contact_name||' cancelled the scheduled meeting.','/admin/meetings','inapp-customer-cancelled:'||new.id::text);
    else
      perform public.enqueue_notification('meeting-cancelled-profox:'||new.id::text,'meeting_cancelled_by_profox_customer',v_access.email,null,v_customer||jsonb_build_object('emailPurpose','meeting cancellation notice','previousMeetingTimeVisitor',v_previous_visitor,'previousMeetingTimeSeller',v_previous_seller),now());
    end if;
  end if;
  if trim(coalesce(new.meeting_url,''))<>'' and trim(coalesce(old.meeting_url,''))='' then
    perform public.service_refresh_meeting_pending_communication_payloads(new.id);
    if exists(select 1 from public.notification_outbox where dedupe_key='meeting-confirmation:'||new.id::text and status='Sent') then
      v_customer:=public.build_sales_meeting_customer_payload(new.id);
      perform public.enqueue_notification('meeting-link-ready:'||new.id::text,'meeting_link_ready_customer',v_access.email,null,v_customer||jsonb_build_object('emailPurpose','meeting link ready'),now());
    end if;
  end if;
  if new.status='Completed' and (new.customer_summary is distinct from old.customer_summary or new.customer_next_step is distinct from old.customer_next_step or new.customer_next_step_timing is distinct from old.customer_next_step_timing) and trim(coalesce(new.customer_summary,''))<>'' and trim(coalesce(new.customer_next_step,''))<>'' then
    update public.notification_outbox set status='Cancelled',last_error='Replaced by seller-reviewed meeting recap.',updated_at=now() where dedupe_key='meeting-followup-fallback:'||new.id::text and status in ('Pending','Retry');
    update public.notification_outbox set status='Cancelled',last_error='Customer-safe next step was completed.',updated_at=now() where dedupe_key='seller-meeting-next-step-missing:'||new.id::text and status in ('Pending','Retry');
    v_customer:=public.build_sales_meeting_customer_payload(new.id);
    perform public.enqueue_notification('meeting-followup-reviewed:'||new.id::text,'meeting_completed_followup_customer',v_access.email,null,v_customer||jsonb_build_object('emailPurpose','post-meeting next steps'),now());
  end if;
  return new;
end;
$function$;

revoke all on function public.save_sales_meeting_customer_followup(uuid,text,text,text) from public,anon;
grant execute on function public.save_sales_meeting_customer_followup(uuid,text,text,text) to authenticated;
revoke all on function public.set_sales_meeting_customer_timezone(uuid,text) from public,anon;
grant execute on function public.set_sales_meeting_customer_timezone(uuid,text) to authenticated;

update public.notification_templates
set html_template=case when html_template is null or position('https://www.profoxwebdesigner.com/' in html_template)=0 then public.service_profox_meeting_email_html('PROFOX',name,replace(body_template,E'\n','<br>'),'','') else html_template end,updated_at=now()
where active is true and template_key in (
  'meeting_confirmation_customer','meeting_link_ready_customer','meeting_reconfirmation_24h_customer','meeting_reminder_1h_customer','meeting_reminder_15m_customer','meeting_rescheduled_customer','meeting_rescheduled_by_profox_customer','meeting_cancelled_customer','meeting_cancelled_by_profox_customer','meeting_no_show_rebook_customer','meeting_completed_followup_customer','meeting_completed_followup_fallback_customer','seller_new_booking','seller_meeting_prep_24h','seller_meeting_reminder_1h','seller_customer_rescheduled','seller_customer_cancelled','seller_meeting_link_missing','seller_meeting_next_step_missing','meeting_customer_email_failed'
);

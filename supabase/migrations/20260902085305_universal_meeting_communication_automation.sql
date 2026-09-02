-- Universal ProFox meeting communication engine for CRM/Pipeline and public bookings.

update public.system_configuration
set config_value=jsonb_set(jsonb_set(coalesce(config_value,'{}'::jsonb),'{reminderMinutes}','[1440,60,15]'::jsonb,true),'{meetingFinalReminderEmailEnabled}','true'::jsonb,true),updated_at=now()
where config_key='notification_settings';

update public.system_configuration
set config_value=jsonb_set(coalesce(config_value,'{}'::jsonb),'{reminderMinutes}','[1440,60,15]'::jsonb,true),updated_at=now()
where config_key='meeting_settings';

create or replace function public.service_format_meeting_local(p_at timestamptz,p_timezone text)
returns text
language plpgsql
stable
set search_path to 'public','pg_temp'
as $function$
declare v_timezone text:=coalesce(nullif(trim(p_timezone),''),'UTC');
begin
  if p_at is null then return ''; end if;
  if not exists(select 1 from pg_timezone_names where name=v_timezone) then v_timezone:='UTC'; end if;
  return to_char(p_at at time zone v_timezone,'FMDay, FMMonth FMDD, YYYY at FMHH12:MI AM')||' ('||v_timezone||')';
end;
$function$;
revoke all on function public.service_format_meeting_local(timestamptz,text) from public,anon,authenticated;

create or replace function public.service_refresh_meeting_pending_communication_payloads(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_customer jsonb; v_seller jsonb;
begin
  v_customer:=public.build_sales_meeting_customer_payload(p_meeting_id);
  v_seller:=public.build_sales_meeting_notification_payload(p_meeting_id);
  if v_seller='{}'::jsonb then return; end if;
  update public.notification_outbox o
  set payload=case
      when o.template_key like 'seller_%' or o.template_key='meeting_customer_email_failed' then v_seller||(o.payload-v_seller)
      else v_customer||(o.payload-v_customer)
    end,
    updated_at=now()
  where o.status in ('Pending','Retry') and o.payload->>'meetingId'=p_meeting_id::text;
end;
$function$;
revoke all on function public.service_refresh_meeting_pending_communication_payloads(uuid) from public,anon,authenticated;

create or replace function public.service_schedule_meeting_reminders(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_meeting public.sales_meetings%rowtype; v_access public.sales_meeting_customer_access%rowtype;
  v_settings jsonb:='{}'::jsonb; v_customer jsonb; v_seller jsonb; v_minutes integer; v_when timestamptz; v_schedule_key text;
  v_customer_template text; v_email_purpose text; v_final_enabled boolean;
begin
  select * into v_meeting from public.sales_meetings where id=p_meeting_id;
  if not found or v_meeting.status not in ('Scheduled','Rescheduled') then return; end if;
  select * into v_access from public.sales_meeting_customer_access where meeting_id=p_meeting_id and status='Confirmed';
  if not found then return; end if;
  select coalesce(config_value,'{}'::jsonb) into v_settings from public.system_configuration where config_key='notification_settings';
  v_settings:=coalesce(v_settings,'{}'::jsonb); v_final_enabled:=coalesce((v_settings->>'meetingFinalReminderEmailEnabled')::boolean,true);
  v_customer:=public.build_sales_meeting_customer_payload(p_meeting_id); v_seller:=public.build_sales_meeting_notification_payload(p_meeting_id);
  if v_customer='{}'::jsonb then return; end if;
  v_schedule_key:=extract(epoch from v_meeting.start_at)::bigint::text;

  for v_minutes in select distinct value::integer from jsonb_array_elements_text(coalesce(v_settings->'reminderMinutes','[1440,60,15]'::jsonb))
  loop
    if v_minutes not in (1440,60,15) then continue; end if;
    if v_minutes=15 and not v_final_enabled then continue; end if;
    v_when:=v_meeting.start_at-make_interval(mins=>v_minutes);
    if v_when<=now() then continue; end if;
    v_customer_template:=case v_minutes when 1440 then 'meeting_reconfirmation_24h_customer' when 60 then 'meeting_reminder_1h_customer' else 'meeting_reminder_15m_customer' end;
    v_email_purpose:=case v_minutes when 1440 then '24-hour attendance reconfirmation' when 60 then 'one-hour meeting reminder' else '15-minute meeting reminder' end;
    perform public.enqueue_notification(
      'meeting-reminder:'||p_meeting_id::text||':'||v_schedule_key||':'||v_minutes::text||':customer',
      v_customer_template,v_access.email,null,v_customer||jsonb_build_object('emailPurpose',v_email_purpose),v_when
    );
    if v_minutes=1440 then
      perform public.enqueue_notification('meeting-reminder:'||p_meeting_id::text||':'||v_schedule_key||':1440:seller',
        'seller_meeting_prep_24h',coalesce(v_seller->>'sellerEmail',''),v_meeting.salesperson_id,v_seller, v_when);
    elsif v_minutes=60 then
      perform public.enqueue_notification('meeting-reminder:'||p_meeting_id::text||':'||v_schedule_key||':60:seller',
        'seller_meeting_reminder_1h',coalesce(v_seller->>'sellerEmail',''),v_meeting.salesperson_id,v_seller, v_when);
    end if;
  end loop;
end;
$function$;
revoke all on function public.service_schedule_meeting_reminders(uuid) from public,anon,authenticated;

create or replace function public.service_cancel_pending_meeting_reminders(p_meeting_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  update public.notification_outbox
  set status='Cancelled',last_error=left(coalesce(nullif(p_reason,''),'Meeting schedule changed.'),4000),updated_at=now()
  where status in ('Pending','Retry') and payload->>'meetingId'=p_meeting_id::text
    and template_key in ('meeting_reconfirmation_24h_customer','meeting_reminder_1h_customer','meeting_reminder_15m_customer','seller_meeting_prep_24h','seller_meeting_reminder_1h');
end;
$function$;
revoke all on function public.service_cancel_pending_meeting_reminders(uuid,text) from public,anon,authenticated;

create or replace function public.crm_queue_initial_meeting_communications()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_token uuid; v_payload jsonb; v_access public.sales_meeting_customer_access%rowtype;
begin
  v_token:=public.service_ensure_meeting_customer_access(new.id,'crm',null,null);
  if v_token is null then return new; end if;
  select * into v_access from public.sales_meeting_customer_access where meeting_id=new.id;
  v_payload:=public.build_sales_meeting_customer_payload(new.id);
  if v_payload<>'{}'::jsonb then
    perform public.enqueue_notification('meeting-confirmation:'||new.id::text,'meeting_confirmation_customer',v_access.email,null,
      v_payload||jsonb_build_object('emailPurpose','meeting confirmation'),now()+interval '30 seconds');
    perform public.service_schedule_meeting_reminders(new.id);
  end if;
  return new;
end;
$function$;
revoke all on function public.crm_queue_initial_meeting_communications() from public,anon,authenticated;

drop trigger if exists trg_queue_universal_meeting_communications on public.sales_meetings;
create trigger trg_queue_universal_meeting_communications
after insert on public.sales_meetings
for each row execute function public.crm_queue_initial_meeting_communications();

create or replace function public.service_sync_public_booking_meeting_access()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  perform public.service_ensure_meeting_customer_access(new.meeting_id,'public_booking',new.management_token,new.visitor_timezone);
  update public.sales_meeting_customer_access
  set booking_reference=new.booking_reference,contact_name=new.contact_name,email=lower(trim(new.email)),company_name=new.company_name,
      service_interest=new.service_interest,visitor_timezone=new.visitor_timezone,status=new.status,management_token=new.management_token,
      management_token_expires_at=greatest(management_token_expires_at,new.management_token_expires_at),source='public_booking',updated_at=now()
  where meeting_id=new.meeting_id;
  perform public.service_refresh_meeting_pending_communication_payloads(new.meeting_id);
  return new;
end;
$function$;
revoke all on function public.service_sync_public_booking_meeting_access() from public,anon,authenticated;

create or replace function public.queue_public_booking_created_notifications()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_payload jsonb; v_seller_email text;
begin
  perform public.service_ensure_meeting_customer_access(new.meeting_id,'public_booking',new.management_token,new.visitor_timezone);
  perform public.service_refresh_meeting_pending_communication_payloads(new.meeting_id);
  v_payload:=public.build_sales_meeting_notification_payload(new.meeting_id); v_seller_email:=coalesce(v_payload->>'sellerEmail','');
  perform public.enqueue_notification('seller-new-booking:'||new.id::text,'seller_new_booking',v_seller_email,new.salesperson_id,v_payload,now());
  perform public.enqueue_in_app_notification(new.salesperson_id,'New Booking','New meeting booked - '||new.company_name,
    new.contact_name||' booked a meeting for '||coalesce(nullif(new.service_interest,''),'a ProFox consultation')||'.',
    '/admin/meeting-prep/'||new.meeting_id::text,'inapp-new-booking:'||new.id::text);
  return new;
end;
$function$;

create or replace function public.schedule_public_booking_reminders(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  perform public.service_schedule_meeting_reminders(p_meeting_id);
end;
$function$;
revoke all on function public.schedule_public_booking_reminders(uuid) from public,anon,authenticated;

-- The universal meeting triggers now own reminders; remove legacy duplicate reminder triggers.
drop trigger if exists trg_schedule_booking_reminders_on_booking on public.public_booking_submissions;
drop trigger if exists trg_refresh_booking_reminders_on_meeting on public.sales_meetings;

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
  if not exists(select 1 from public.sales_meeting_customer_access where meeting_id=new.id) then
    perform public.service_ensure_meeting_customer_access(new.id,'crm',null,null);
  end if;
  select * into v_access from public.sales_meeting_customer_access where meeting_id=new.id;
  if not found then return new; end if;
  v_customer_action:=(auth.uid() is null and exists(select 1 from public.public_booking_submissions b where b.meeting_id=new.id));
  v_customer:=public.build_sales_meeting_customer_payload(new.id); v_seller:=public.build_sales_meeting_notification_payload(new.id);
  v_previous_visitor:=public.service_format_meeting_local(old.start_at,v_access.visitor_timezone);
  v_previous_seller:=public.service_format_meeting_local(old.start_at,old.timezone);

  if new.start_at is distinct from old.start_at and new.status in ('Scheduled','Rescheduled') then
    update public.sales_meeting_customer_access set attendance_status='Pending',attendance_confirmed_at=null,
      management_token_expires_at=greatest(management_token_expires_at,new.end_at+interval '30 days'),updated_at=now() where meeting_id=new.id;
    perform public.service_cancel_pending_meeting_reminders(new.id,'Superseded by a meeting reschedule.');
    perform public.service_refresh_meeting_pending_communication_payloads(new.id);
    v_customer:=public.build_sales_meeting_customer_payload(new.id); v_seller:=public.build_sales_meeting_notification_payload(new.id);
    if v_customer_action then
      v_template:='meeting_rescheduled_customer';
      v_dedupe:='meeting-rescheduled-customer:'||new.id::text||':'||extract(epoch from new.start_at)::bigint::text;
      perform public.enqueue_notification(v_dedupe,v_template,v_access.email,null,
        v_customer||jsonb_build_object('emailPurpose','meeting reschedule confirmation','previousMeetingTimeVisitor',v_previous_visitor,'previousMeetingTimeSeller',v_previous_seller),now());
      perform public.enqueue_notification('seller-customer-rescheduled:'||new.id::text||':'||extract(epoch from new.start_at)::bigint::text,
        'seller_customer_rescheduled',coalesce(v_seller->>'sellerEmail',''),new.salesperson_id,
        v_seller||jsonb_build_object('previousMeetingTimeVisitor',v_previous_visitor,'previousMeetingTimeSeller',v_previous_seller),now());
      perform public.enqueue_in_app_notification(new.salesperson_id,'Rescheduled','Meeting rescheduled - '||coalesce(nullif(v_access.company_name,''),v_access.contact_name),
        v_access.contact_name||' moved the meeting to a new time.','/admin/meeting-prep/'||new.id::text,
        'inapp-customer-rescheduled:'||new.id::text||':'||extract(epoch from new.start_at)::bigint::text);
    else
      v_template:='meeting_rescheduled_by_profox_customer';
      v_dedupe:='meeting-rescheduled-profox:'||new.id::text||':'||extract(epoch from new.start_at)::bigint::text;
      perform public.enqueue_notification(v_dedupe,v_template,v_access.email,null,
        v_customer||jsonb_build_object('emailPurpose','meeting time update','previousMeetingTimeVisitor',v_previous_visitor,'previousMeetingTimeSeller',v_previous_seller),now());
    end if;
    perform public.service_schedule_meeting_reminders(new.id);
  end if;

  if new.status='Cancelled' and old.status is distinct from 'Cancelled' then
    update public.sales_meeting_customer_access set status='Cancelled',updated_at=now() where meeting_id=new.id;
    perform public.service_cancel_pending_meeting_reminders(new.id,'Meeting cancelled before this reminder was due.');
    v_reason:=coalesce(nullif(trim(new.outcome),''),'No additional reason was provided.');
    v_customer:=public.build_sales_meeting_customer_payload(new.id); v_seller:=public.build_sales_meeting_notification_payload(new.id);
    if v_customer_action then
      perform public.enqueue_notification('meeting-cancelled-customer:'||new.id::text,'meeting_cancelled_customer',v_access.email,null,
        v_customer||jsonb_build_object('emailPurpose','meeting cancellation confirmation','previousMeetingTimeVisitor',v_previous_visitor,'previousMeetingTimeSeller',v_previous_seller,'cancellationReason',v_reason),now());
      perform public.enqueue_notification('seller-customer-cancelled:'||new.id::text,'seller_customer_cancelled',coalesce(v_seller->>'sellerEmail',''),new.salesperson_id,
        v_seller||jsonb_build_object('previousMeetingTimeVisitor',v_previous_visitor,'previousMeetingTimeSeller',v_previous_seller,'cancellationReason',v_reason),now());
      perform public.enqueue_in_app_notification(new.salesperson_id,'Cancelled','Meeting cancelled - '||coalesce(nullif(v_access.company_name,''),v_access.contact_name),
        v_access.contact_name||' cancelled the scheduled meeting.','/admin/meetings','inapp-customer-cancelled:'||new.id::text);
    else
      perform public.enqueue_notification('meeting-cancelled-profox:'||new.id::text,'meeting_cancelled_by_profox_customer',v_access.email,null,
        v_customer||jsonb_build_object('emailPurpose','meeting cancellation notice','previousMeetingTimeVisitor',v_previous_visitor,'previousMeetingTimeSeller',v_previous_seller,'cancellationReason',v_reason),now());
    end if;
  end if;

  if trim(coalesce(new.meeting_url,''))<>'' and trim(coalesce(old.meeting_url,''))='' then
    perform public.service_refresh_meeting_pending_communication_payloads(new.id);
    if exists(select 1 from public.notification_outbox where dedupe_key='meeting-confirmation:'||new.id::text and status='Sent') then
      v_customer:=public.build_sales_meeting_customer_payload(new.id);
      perform public.enqueue_notification('meeting-link-ready:'||new.id::text,'meeting_link_ready_customer',v_access.email,null,
        v_customer||jsonb_build_object('emailPurpose','meeting link ready'),now());
    end if;
  end if;

  if new.status='Completed' and (new.customer_summary is distinct from old.customer_summary or new.customer_next_step is distinct from old.customer_next_step or new.customer_next_step_timing is distinct from old.customer_next_step_timing)
     and trim(coalesce(new.customer_summary,''))<>'' and trim(coalesce(new.customer_next_step,''))<>'' then
    update public.notification_outbox set status='Cancelled',last_error='Replaced by seller-reviewed meeting recap.',updated_at=now()
      where dedupe_key='meeting-followup-fallback:'||new.id::text and status in ('Pending','Retry');
    update public.notification_outbox set status='Cancelled',last_error='Customer-safe next step was completed.',updated_at=now()
      where dedupe_key='seller-meeting-next-step-missing:'||new.id::text and status in ('Pending','Retry');
    v_customer:=public.build_sales_meeting_customer_payload(new.id);
    perform public.enqueue_notification('meeting-followup-reviewed:'||new.id::text,'meeting_completed_followup_customer',v_access.email,null,
      v_customer||jsonb_build_object('emailPurpose','post-meeting next steps'),now());
  end if;
  return new;
end;
$function$;
revoke all on function public.crm_queue_meeting_communication_update() from public,anon,authenticated;

drop trigger if exists trg_universal_meeting_communication_update on public.sales_meetings;
create trigger trg_universal_meeting_communication_update
after update of start_at,end_at,status,meeting_url,customer_summary,customer_next_step,customer_next_step_timing
on public.sales_meetings
for each row execute function public.crm_queue_meeting_communication_update();

create or replace function public.queue_meeting_status_automation()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_access public.sales_meeting_customer_access%rowtype; v_customer jsonb; v_seller jsonb; v_settings jsonb; v_hours integer; v_company text;
begin
  if new.status is not distinct from old.status then return new; end if;
  select * into v_access from public.sales_meeting_customer_access where meeting_id=new.id;
  if not found then return new; end if;
  select coalesce(config_value,'{}'::jsonb) into v_settings from public.system_configuration where config_key='notification_settings';
  v_settings:=coalesce(v_settings,'{}'::jsonb); v_customer:=public.build_sales_meeting_customer_payload(new.id); v_seller:=public.build_sales_meeting_notification_payload(new.id);
  v_company:=coalesce(nullif(v_access.company_name,''),v_access.contact_name,'Customer');

  if new.status='No Show' then
    perform public.service_cancel_pending_meeting_reminders(new.id,'Meeting marked no show before this reminder was due.');
    v_hours:=least(greatest(coalesce((v_settings->>'noShowFollowUpHours')::integer,2),0),168);
    if not exists(select 1 from public.crm_activities a where a.assigned_to=new.salesperson_id and a.activity_type='No Show Follow-Up' and a.notes like '%Automation key: no-show:'||new.id::text||'%') then
      insert into public.crm_activities(lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by)
      values(new.lead_id,new.opportunity_id,new.salesperson_id,'No Show Follow-Up','Follow up after missed meeting - '||v_company,
        now()+make_interval(hours=>v_hours),'Scheduled','Follow-Up','Automation key: no-show:'||new.id::text,new.salesperson_id);
    end if;
    perform public.enqueue_notification('meeting-no-show-rebook:'||new.id::text,'meeting_no_show_rebook_customer',v_access.email,null,
      v_customer||jsonb_build_object('emailPurpose','missed meeting follow-up'),now()+make_interval(hours=>v_hours));
    perform public.enqueue_in_app_notification(new.salesperson_id,'Follow-Up','No-show follow-up due - '||v_company,
      'A follow-up task was created automatically.','/admin/app/crm?tab=activities','inapp-no-show:'||new.id::text);

  elsif new.status='Completed' then
    perform public.service_cancel_pending_meeting_reminders(new.id,'Meeting completed before this reminder was due.');
    if trim(coalesce(new.customer_summary,''))<>'' and trim(coalesce(new.customer_next_step,''))<>'' then
      perform public.enqueue_notification('meeting-followup-reviewed:'||new.id::text,'meeting_completed_followup_customer',v_access.email,null,
        v_customer||jsonb_build_object('emailPurpose','post-meeting next steps'),now()+interval '10 minutes');
    else
      perform public.enqueue_notification('meeting-followup-fallback:'||new.id::text,'meeting_completed_followup_fallback_customer',v_access.email,null,
        v_customer||jsonb_build_object('emailPurpose','post-meeting thank you'),now()+interval '30 minutes');
      v_hours:=least(greatest(coalesce((v_settings->>'completedReviewHours')::integer,2),0),72);
      perform public.enqueue_notification('seller-meeting-next-step-missing:'||new.id::text,'seller_meeting_next_step_missing',
        coalesce(v_seller->>'sellerEmail',''),new.salesperson_id,v_seller||jsonb_build_object('elapsedTime',v_hours::text||' hours'),now()+make_interval(hours=>v_hours));
      if not exists(select 1 from public.crm_activities a where a.assigned_to=new.salesperson_id and a.activity_type='Meeting Review' and a.notes like '%Automation key: meeting-review:'||new.id::text||'%') then
        insert into public.crm_activities(lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by)
        values(new.lead_id,new.opportunity_id,new.salesperson_id,'Meeting Review','Set the next sales action - '||v_company,
          now()+make_interval(hours=>v_hours),'Scheduled','Follow-Up','Automation key: meeting-review:'||new.id::text,new.salesperson_id);
      end if;
      perform public.enqueue_in_app_notification(new.salesperson_id,'Next Action','Set the next step - '||v_company,
        'The meeting is complete but no customer-safe next action has been recorded.','/admin/meeting-prep/'||new.id::text,'inapp-meeting-review:'||new.id::text);
    end if;
  elsif new.status='Cancelled' then
    perform public.service_cancel_pending_meeting_reminders(new.id,'Meeting cancelled before this reminder was due.');
  end if;
  return new;
end;
$function$;

create or replace function public.queue_due_meeting_communications()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare r record; v_payload jsonb; v_count integer:=0; v_minutes integer; v_label text; v_purpose text;
begin
  for r in
    select m.id,m.salesperson_id,m.start_at,a.company_name,a.contact_name
    from public.sales_meetings m join public.sales_meeting_customer_access a on a.meeting_id=m.id and a.status='Confirmed'
    where m.status in ('Scheduled','Rescheduled') and trim(coalesce(m.meeting_url,''))=''
      and m.start_at>now() and m.start_at<=now()+interval '90 minutes'
  loop
    v_minutes:=floor(extract(epoch from (r.start_at-now()))/60.0)::integer;
    for v_label in select x from unnest(array['90-minute check','60-minute escalation','30-minute critical escalation']) x
    loop
      if (v_label='90-minute check' and v_minutes<=90) or (v_label='60-minute escalation' and v_minutes<=60) or (v_label='30-minute critical escalation' and v_minutes<=30) then
        v_payload:=public.build_sales_meeting_notification_payload(r.id)||jsonb_build_object('linkAlertLabel',v_label);
        perform public.enqueue_notification('meeting-link-missing:'||r.id::text||':'||split_part(v_label,'-',1),
          'seller_meeting_link_missing',coalesce(v_payload->>'sellerEmail',''),r.salesperson_id,v_payload,now());
        v_count:=v_count+1;
      end if;
    end loop;
  end loop;

  for r in
    select o.id,o.template_key,o.recipient_email,o.attempts,(o.payload->>'meetingId')::uuid meeting_id
    from public.notification_outbox o
    where o.status='Failed' and o.payload->>'communicationAudience'='customer'
      and nullif(o.payload->>'meetingId','') is not null
      and not exists(select 1 from public.notification_outbox a where a.dedupe_key='meeting-email-failed-alert:'||o.id::text)
  loop
    v_payload:=public.build_sales_meeting_notification_payload(r.meeting_id);
    if v_payload<>'{}'::jsonb then
      v_purpose:=case r.template_key
        when 'meeting_confirmation_customer' then 'meeting confirmation'
        when 'meeting_reconfirmation_24h_customer' then '24-hour attendance confirmation'
        when 'meeting_reminder_1h_customer' then 'one-hour meeting reminder'
        when 'meeting_reminder_15m_customer' then '15-minute meeting reminder'
        when 'meeting_rescheduled_customer' then 'reschedule confirmation'
        when 'meeting_rescheduled_by_profox_customer' then 'meeting time update'
        when 'meeting_cancelled_customer' then 'cancellation confirmation'
        when 'meeting_cancelled_by_profox_customer' then 'cancellation notice'
        when 'meeting_no_show_rebook_customer' then 'missed meeting follow-up'
        when 'meeting_completed_followup_customer' then 'post-meeting next steps'
        when 'meeting_completed_followup_fallback_customer' then 'post-meeting thank you'
        else 'meeting communication' end;
      perform public.enqueue_notification('meeting-email-failed-alert:'||r.id::text,'meeting_customer_email_failed',
        coalesce(v_payload->>'sellerEmail',''),nullif(v_payload->>'sellerUserId','')::uuid,
        v_payload||jsonb_build_object('emailPurpose',v_purpose,'recipientEmail',r.recipient_email,'attemptCount',r.attempts),now());
      v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('meetingCommunicationActionsQueued',v_count);
end;
$function$;
revoke all on function public.queue_due_meeting_communications() from public,anon,authenticated;

create or replace function public.queue_due_sales_automations()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_sales jsonb:='{}'::jsonb; v_operational jsonb:='{}'::jsonb; v_quote_customer jsonb:='{}'::jsonb;
  v_payment_customer jsonb:='{}'::jsonb; v_project_customer jsonb:='{}'::jsonb; v_recruitment jsonb:='{}'::jsonb;
  v_academy jsonb:='{}'::jsonb; v_meetings jsonb:='{}'::jsonb;
begin
  v_sales:=coalesce(public.queue_due_sales_automations_base(),'{}'::jsonb);
  v_operational:=coalesce(public.queue_due_operational_notifications(),'{}'::jsonb);
  v_quote_customer:=coalesce(public.queue_due_quotation_customer_communications(),'{}'::jsonb);
  v_payment_customer:=coalesce(public.queue_due_payment_customer_communications(),'{}'::jsonb);
  v_project_customer:=coalesce(public.queue_due_project_customer_communications(),'{}'::jsonb);
  v_recruitment:=coalesce(public.queue_due_recruitment_stage_sla(),'{}'::jsonb);
  v_academy:=coalesce(public.queue_due_sales_academy_deadline_notifications(),'{}'::jsonb);
  v_meetings:=coalesce(public.queue_due_meeting_communications(),'{}'::jsonb);
  return v_sales||jsonb_build_object('module10Operational',v_operational)||jsonb_build_object('module11Customer',v_quote_customer||v_payment_customer||v_project_customer)
    ||jsonb_build_object('recruitmentOperational',v_recruitment)||jsonb_build_object('salesAcademyDeadline',v_academy)||jsonb_build_object('meetingCommunications',v_meetings);
end;
$function$;

create or replace function public.crm_audit_meeting_notification_delivery()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_lead uuid; v_purpose text; v_event_type text; v_title text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('Sent','Failed') or new.payload->>'communicationAudience'<>'customer' then return new; end if;
  v_lead:=nullif(new.payload->>'crmLeadId','')::uuid; if v_lead is null then return new; end if;
  v_purpose:=coalesce(nullif(new.payload->>'emailPurpose',''),'meeting communication');
  v_event_type:=case when new.status='Sent' then 'email_sent' else 'email_failed' end;
  v_title:=case when new.status='Sent' then 'Automated email sent' else 'Automated email failed' end;
  perform public.crm_write_lead_event(v_lead,v_event_type,v_title,
    'ProFox '||v_purpose||case when new.status='Sent' then ' was sent.' else ' could not be delivered after retries.' end,
    jsonb_build_object('notificationId',new.id,'templateKey',new.template_key,'meetingId',new.payload->>'meetingId','automated',true,'providerMessageId',new.provider_message_id),
    null,'ProFox Automation','system',coalesce(new.sent_at,new.updated_at),
    'meeting-notification:'||new.id::text||':'||lower(new.status));
  return new;
end;
$function$;
revoke all on function public.crm_audit_meeting_notification_delivery() from public,anon,authenticated;

drop trigger if exists trg_crm_audit_meeting_notification_delivery on public.notification_outbox;
create trigger trg_crm_audit_meeting_notification_delivery
after update of status on public.notification_outbox
for each row execute function public.crm_audit_meeting_notification_delivery();

create or replace function public.set_sales_meeting_customer_timezone(p_meeting_id uuid,p_visitor_timezone text)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_meeting public.sales_meetings%rowtype; v_timezone text:=trim(coalesce(p_visitor_timezone,''));
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if v_timezone='' or not exists(select 1 from pg_timezone_names where name=v_timezone) then raise exception 'Choose a valid customer timezone.'; end if;
  select * into v_meeting from public.sales_meetings where id=p_meeting_id;
  if not found then raise exception 'Meeting not found.'; end if;
  if not public.is_admin() and (v_meeting.salesperson_id<>auth.uid() or not public.has_active_role(array['sales']::text[])) then raise exception 'Unauthorized meeting update.'; end if;
  perform public.service_ensure_meeting_customer_access(p_meeting_id,'crm',null,v_timezone);
  update public.sales_meeting_customer_access set visitor_timezone=v_timezone,updated_at=now() where meeting_id=p_meeting_id;
  perform public.service_refresh_meeting_pending_communication_payloads(p_meeting_id);
end;
$function$;
grant execute on function public.set_sales_meeting_customer_timezone(uuid,text) to authenticated;
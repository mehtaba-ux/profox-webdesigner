-- Final hardening for meeting communication: one link escalation at a time and complete customer-safe recap requirements.

create or replace function public.queue_due_meeting_communications()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare r record; v_payload jsonb; v_count integer:=0; v_minutes integer; v_label text; v_suffix text; v_purpose text;
begin
  for r in
    select m.id,m.salesperson_id,m.start_at,a.company_name,a.contact_name
    from public.sales_meetings m
    join public.sales_meeting_customer_access a on a.meeting_id=m.id and a.status='Confirmed'
    where m.status in ('Scheduled','Rescheduled')
      and trim(coalesce(m.meeting_url,''))=''
      and m.start_at>now()
      and m.start_at<=now()+interval '90 minutes'
  loop
    v_minutes:=floor(extract(epoch from (r.start_at-now()))/60.0)::integer;
    if v_minutes<=30 then
      v_label:='30-minute critical escalation'; v_suffix:='30';
    elsif v_minutes<=60 then
      v_label:='60-minute escalation'; v_suffix:='60';
    else
      v_label:='90-minute check'; v_suffix:='90';
    end if;
    v_payload:=public.build_sales_meeting_notification_payload(r.id)||jsonb_build_object('linkAlertLabel',v_label);
    perform public.enqueue_notification(
      'meeting-link-missing:'||r.id::text||':'||v_suffix,
      'seller_meeting_link_missing',coalesce(v_payload->>'sellerEmail',''),r.salesperson_id,v_payload,now()
    );
    v_count:=v_count+1;
  end loop;

  for r in
    select o.id,o.template_key,o.recipient_email,o.attempts,(o.payload->>'meetingId')::uuid meeting_id
    from public.notification_outbox o
    where o.status='Failed'
      and o.payload->>'communicationAudience'='customer'
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
      perform public.enqueue_notification(
        'meeting-email-failed-alert:'||r.id::text,'meeting_customer_email_failed',
        coalesce(v_payload->>'sellerEmail',''),nullif(v_payload->>'sellerUserId','')::uuid,
        v_payload||jsonb_build_object('emailPurpose',v_purpose,'recipientEmail',r.recipient_email,'attemptCount',r.attempts),now()
      );
      v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('meetingCommunicationActionsQueued',v_count);
end;
$function$;

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
    if trim(coalesce(new.customer_summary,''))<>''
       and trim(coalesce(new.customer_next_step,''))<>''
       and trim(coalesce(new.customer_next_step_timing,''))<>'' then
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
        'The meeting is complete but the customer-safe recap, next action or timing is incomplete.','/admin/meeting-prep/'||new.id::text,'inapp-meeting-review:'||new.id::text);
    end if;
  elsif new.status='Cancelled' then
    perform public.service_cancel_pending_meeting_reminders(new.id,'Meeting cancelled before this reminder was due.');
  end if;
  return new;
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
  if new.status='Completed'
     and (new.customer_summary is distinct from old.customer_summary or new.customer_next_step is distinct from old.customer_next_step or new.customer_next_step_timing is distinct from old.customer_next_step_timing)
     and trim(coalesce(new.customer_summary,''))<>''
     and trim(coalesce(new.customer_next_step,''))<>''
     and trim(coalesce(new.customer_next_step_timing,''))<>'' then
    update public.notification_outbox set status='Cancelled',last_error='Replaced by seller-reviewed meeting recap.',updated_at=now() where dedupe_key='meeting-followup-fallback:'||new.id::text and status in ('Pending','Retry');
    update public.notification_outbox set status='Cancelled',last_error='Customer-safe next step was completed.',updated_at=now() where dedupe_key='seller-meeting-next-step-missing:'||new.id::text and status in ('Pending','Retry');
    v_customer:=public.build_sales_meeting_customer_payload(new.id);
    perform public.enqueue_notification('meeting-followup-reviewed:'||new.id::text,'meeting_completed_followup_customer',v_access.email,null,v_customer||jsonb_build_object('emailPurpose','post-meeting next steps'),now());
  end if;
  return new;
end;
$function$;

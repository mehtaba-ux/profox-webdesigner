-- ProFox meeting email library. Brand Bible: ProFox / From site to system.
-- Every template includes the ProFox website in its signature/footer.

create or replace function public.service_profox_meeting_email_html(
  p_kicker text,
  p_heading text,
  p_content_html text,
  p_cta_label text default '',
  p_cta_url text default ''
)
returns text
language sql
immutable
set search_path to 'public','pg_temp'
as $function$
  select '<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">'
    ||'<div style="max-width:640px;margin:0 auto;padding:28px 16px">'
    ||'<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden">'
    ||'<div style="height:6px;background:#000080"></div>'
    ||'<div style="padding:32px">'
    ||'<div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#FF0E0E">'||coalesce(p_kicker,'PROFOX')||'</div>'
    ||'<h1 style="margin:10px 0 20px;font-size:27px;line-height:1.2;color:#000080">'||coalesce(p_heading,'')||'</h1>'
    ||'<div style="font-size:15px;line-height:1.7;color:#334155">'||coalesce(p_content_html,'')||'</div>'
    ||case when trim(coalesce(p_cta_label,''))<>'' and trim(coalesce(p_cta_url,''))<>'' then
      '<div style="margin:26px 0"><a href="'||p_cta_url||'" style="display:inline-block;background:#FF0E0E;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">'||p_cta_label||'</a></div>' else '' end
    ||'<div style="margin-top:30px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.7;color:#64748b">'
    ||'<strong style="color:#000080">ProFox</strong><br>From site to system.<br>'
    ||'<a href="https://www.profoxwebdesigner.com/" style="color:#000080;text-decoration:none">https://www.profoxwebdesigner.com/</a>'
    ||'</div></div></div></div></body></html>'
$function$;
revoke all on function public.service_profox_meeting_email_html(text,text,text,text,text) from public,anon,authenticated;

insert into public.notification_templates(template_key,name,subject_template,body_template,html_template,active,description,updated_at)
values
('meeting_confirmation_customer','Universal meeting confirmation','Confirmed: your meeting with {{ownerFirstName}} at ProFox',
'Hi {{contactFirstName}},

Your meeting is confirmed.

When: {{meetingTimeVisitor}}
With: {{ownerName}}
Focus: {{serviceInterest}}

View meeting: {{manageUrl}}

From your meeting page, you can see the latest meeting details, add it to your calendar, or change the time if needed.

If there is anything you want me to understand before we meet, reply to this email. I will review it before the conversation.

{{ownerFirstName}}
ProFox
From site to system.
https://www.profoxwebdesigner.com/

Booking reference: {{bookingReference}}',
public.service_profox_meeting_email_html('MEETING CONFIRMED','Your meeting is confirmed','<p>Hi {{contactFirstName}},</p><p><strong>When:</strong> {{meetingTimeVisitor}}<br><strong>With:</strong> {{ownerName}}<br><strong>Focus:</strong> {{serviceInterest}}</p><p>From your meeting page, you can see the latest meeting details, add it to your calendar, or change the time if needed.</p><p>If there is anything you want me to understand before we meet, reply to this email. I will review it before the conversation.</p><p>{{ownerFirstName}}<br>ProFox</p><p style="font-size:12px;color:#64748b">Booking reference: {{bookingReference}}</p>','VIEW MEETING','{{manageUrl}}'),true,'Universal customer confirmation for both CRM/Pipeline and public bookings.',now()),

('meeting_link_ready_customer','Meeting link ready','Your ProFox meeting link is ready',
'Hi {{contactFirstName}},

Your meeting link is ready.

Meeting: {{serviceInterest}}
When: {{meetingTimeVisitor}}
With: {{ownerName}}

View meeting: {{manageUrl}}

Your meeting page will always show the latest joining details, so you do not need to search through old emails.

If you want me to review anything before we meet, reply here.

{{ownerFirstName}}
ProFox
From site to system.
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('MEETING LINK READY','Your meeting link is ready','<p>Hi {{contactFirstName}},</p><p><strong>Meeting:</strong> {{serviceInterest}}<br><strong>When:</strong> {{meetingTimeVisitor}}<br><strong>With:</strong> {{ownerName}}</p><p>Your meeting page will always show the latest joining details, so you do not need to search through old emails.</p><p>If you want me to review anything before we meet, reply here.</p><p>{{ownerFirstName}}<br>ProFox</p>','VIEW MEETING','{{manageUrl}}'),true,'Sent only when a provider meeting link becomes available after the original confirmation.',now()),

('meeting_reconfirmation_24h_customer','24-hour attendance reconfirmation','Tomorrow: your meeting with {{ownerFirstName}}',
'Hi {{contactFirstName}},

Your meeting with me is tomorrow.

When: {{meetingTimeVisitor}}
Focus: {{serviceInterest}}

Confirm attendance: {{manageUrl}}?confirm=1

Need a different time?
Reschedule: {{manageUrl}}

If there is anything you want me to review before we meet, reply to this email.

{{ownerFirstName}}
ProFox
From site to system.
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('TOMORROW','Your meeting is tomorrow','<p>Hi {{contactFirstName}},</p><p><strong>When:</strong> {{meetingTimeVisitor}}<br><strong>Focus:</strong> {{serviceInterest}}</p><p>If the time still works, confirm below. If you need a different time, you can reschedule from the same secure meeting page.</p><p>If there is anything you want me to review before we meet, reply to this email.</p><p>{{ownerFirstName}}<br>ProFox</p>','YES, I AM ATTENDING','{{manageUrl}}?confirm=1'),true,'24-hour customer reconfirmation to reduce avoidable no-shows.',now()),

('meeting_reminder_1h_customer','One-hour customer reminder','In 1 hour: your ProFox meeting',
'Hi {{contactFirstName}},

We start in one hour.

When: {{meetingTimeVisitor}}
With: {{ownerName}}
Focus: {{serviceInterest}}

Join meeting: {{joinUrl}}

If you need to move the time, use your meeting page rather than missing the meeting:
{{manageUrl}}

See you shortly.

{{ownerFirstName}}
ProFox
From site to system.
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('IN 1 HOUR','Your ProFox meeting starts in one hour','<p>Hi {{contactFirstName}},</p><p><strong>When:</strong> {{meetingTimeVisitor}}<br><strong>With:</strong> {{ownerName}}<br><strong>Focus:</strong> {{serviceInterest}}</p><p>If you need to move the time, use your meeting page rather than missing the meeting.</p><p>See you shortly.</p><p>{{ownerFirstName}}<br>ProFox</p>','JOIN MEETING','{{joinUrl}}'),true,'One-hour customer join reminder.',now()),

('meeting_reminder_15m_customer','15-minute customer reminder','In 15 minutes: join your ProFox meeting',
'Hi {{contactFirstName}},

Your meeting starts in 15 minutes.

{{meetingTimeVisitor}}

Join meeting: {{joinUrl}}

Need to move it?
{{manageUrl}}

{{ownerFirstName}}
ProFox
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('IN 15 MINUTES','Your meeting starts soon','<p>Hi {{contactFirstName}},</p><p><strong>{{meetingTimeVisitor}}</strong></p><p>Need to move it? Use your secure meeting page.</p><p>{{ownerFirstName}}<br>ProFox</p>','JOIN MEETING','{{joinUrl}}'),true,'Short final join reminder. Can be disabled through meetingFinalReminderEmailEnabled.',now()),

('meeting_rescheduled_customer','Customer reschedule confirmation','Your new ProFox meeting time is confirmed',
'Hi {{contactFirstName}},

Your new meeting time is confirmed.

New time: {{meetingTimeVisitor}}
With: {{ownerName}}
Focus: {{serviceInterest}}

View updated meeting: {{manageUrl}}

Your previous reminders have been replaced with reminders for this new time.

If anything else changes, you can manage the meeting from the same page.

{{ownerFirstName}}
ProFox
From site to system.
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('RESCHEDULED','Your new meeting time is confirmed','<p>Hi {{contactFirstName}},</p><p><strong>New time:</strong> {{meetingTimeVisitor}}<br><strong>With:</strong> {{ownerName}}<br><strong>Focus:</strong> {{serviceInterest}}</p><p>Your previous reminders have been replaced with reminders for this new time.</p><p>{{ownerFirstName}}<br>ProFox</p>','VIEW UPDATED MEETING','{{manageUrl}}'),true,'Confirmation when the customer reschedules through secure booking management.',now()),

('meeting_rescheduled_by_profox_customer','ProFox reschedule notice','Updated: your ProFox meeting time has changed',
'Hi {{contactFirstName}},

Your meeting time has been updated.

Previous time: {{previousMeetingTimeVisitor}}
New time: {{meetingTimeVisitor}}

If the new time works, no action is needed.

If it does not, choose another available time:
{{manageUrl}}

Your meeting remains with {{ownerName}} and stays connected to the same conversation and project context.

{{ownerFirstName}}
ProFox
From site to system.
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('MEETING UPDATED','Your meeting time has changed','<p>Hi {{contactFirstName}},</p><p><strong>Previous time:</strong> {{previousMeetingTimeVisitor}}<br><strong>New time:</strong> {{meetingTimeVisitor}}</p><p>If the new time works, no action is needed. If it does not, choose another available time.</p><p>Your meeting remains with {{ownerName}} and stays connected to the same conversation and project context.</p><p>{{ownerFirstName}}<br>ProFox</p>','CHOOSE ANOTHER TIME','{{manageUrl}}'),true,'Mandatory customer notice when ProFox staff changes the meeting time.',now()),

('meeting_cancelled_customer','Customer cancellation confirmation','Your ProFox meeting has been cancelled',
'Hi {{contactFirstName}},

Your meeting scheduled for {{previousMeetingTimeVisitor}} has been cancelled.

No further action is required.

If you would still like to discuss {{serviceInterest}}, you can choose another suitable time below.

Choose another time: {{bookingPageUrl}}

If now is not the right time, that is fine. You can come back when the timing makes sense.

{{ownerFirstName}}
ProFox
From site to system.
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('CANCELLED','Your meeting has been cancelled','<p>Hi {{contactFirstName}},</p><p>Your meeting scheduled for <strong>{{previousMeetingTimeVisitor}}</strong> has been cancelled.</p><p>No further action is required.</p><p>If you would still like to discuss {{serviceInterest}}, you can choose another suitable time. If now is not the right time, that is fine.</p><p>{{ownerFirstName}}<br>ProFox</p>','CHOOSE ANOTHER TIME','{{bookingPageUrl}}'),true,'Customer acknowledgement after self-service cancellation.',now()),

('meeting_cancelled_by_profox_customer','ProFox cancellation notice','Your ProFox meeting has been cancelled',
'Hi {{contactFirstName}},

The meeting scheduled for {{previousMeetingTimeVisitor}} is no longer going ahead.

{{cancellationReason}}

If you would still like to continue the conversation, choose another suitable time below.

Choose another time: {{bookingPageUrl}}

If you have a question about the change, reply directly to this email.

{{ownerFirstName}}
ProFox
From site to system.
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('MEETING CANCELLED','Your meeting is no longer going ahead','<p>Hi {{contactFirstName}},</p><p>The meeting scheduled for <strong>{{previousMeetingTimeVisitor}}</strong> is no longer going ahead.</p><p>{{cancellationReason}}</p><p>If you would still like to continue the conversation, choose another suitable time. If you have a question about the change, reply directly to this email.</p><p>{{ownerFirstName}}<br>ProFox</p>','CHOOSE ANOTHER TIME','{{bookingPageUrl}}'),true,'Mandatory customer notice when ProFox staff cancels a meeting.',now()),

('meeting_no_show_rebook_customer','No-show rebooking','Would you like to choose another time?',
'Hi {{contactFirstName}},

We missed you at your meeting with {{ownerFirstName}}.

If {{serviceInterest}} is still something you want to discuss, choose another suitable time below.

Choose another time: {{bookingPageUrl}}

If now is not the right time, no action is required.

Whenever the timing makes sense, the conversation can continue from the same context.

{{ownerFirstName}}
ProFox
From site to system.
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('MISSED MEETING','Would you like to choose another time?','<p>Hi {{contactFirstName}},</p><p>We missed you at your meeting with {{ownerFirstName}}.</p><p>If {{serviceInterest}} is still something you want to discuss, choose another suitable time below.</p><p>If now is not the right time, no action is required. Whenever the timing makes sense, the conversation can continue from the same context.</p><p>{{ownerFirstName}}<br>ProFox</p>','CHOOSE ANOTHER TIME','{{bookingPageUrl}}'),true,'Low-pressure no-show recovery for every customer meeting.',now()),

('meeting_completed_followup_customer','Reviewed post-meeting follow-up','Next steps from our ProFox meeting',
'Hi {{contactFirstName}},

Thank you for your time today.

Here is the short version of what we aligned on:

What matters:
{{customerSummary}}

Next step:
{{customerNextStep}}

Timing:
{{customerNextStepTiming}}

If I missed anything important, reply here and I will update the context before we move forward.

{{ownerFirstName}}
ProFox
From site to system.
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('NEXT STEPS','Next steps from our meeting','<p>Hi {{contactFirstName}},</p><p>Thank you for your time today.</p><p><strong>What matters</strong><br>{{customerSummary}}</p><p><strong>Next step</strong><br>{{customerNextStep}}</p><p><strong>Timing</strong><br>{{customerNextStepTiming}}</p><p>If I missed anything important, reply here and I will update the context before we move forward.</p><p>{{ownerFirstName}}<br>ProFox</p>','',''),true,'Customer-safe recap. Uses only dedicated customer-facing fields, never private CRM notes.',now()),

('meeting_completed_followup_fallback_customer','Safe post-meeting fallback','Thanks for your time today',
'Hi {{contactFirstName}},

Thank you for meeting with me today about {{serviceInterest}}.

I am reviewing the notes from our conversation and will follow up with the agreed next step.

If there is anything you want to add while the conversation is fresh, reply to this email.

{{ownerFirstName}}
ProFox
From site to system.
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('THANK YOU','Thanks for your time today','<p>Hi {{contactFirstName}},</p><p>Thank you for meeting with me today about {{serviceInterest}}.</p><p>I am reviewing the notes from our conversation and will follow up with the agreed next step.</p><p>If there is anything you want to add while the conversation is fresh, reply to this email.</p><p>{{ownerFirstName}}<br>ProFox</p>','',''),true,'Safe fallback when a reviewed customer recap has not yet been entered.',now()),

('seller_new_booking','Seller new-booking alert','New meeting booked: {{companyName}}',
'Hi {{ownerFirstName}},

{{contactName}} from {{companyName}} booked a meeting with you.

When: {{meetingTimeSeller}}
Service: {{serviceInterest}}
Budget: {{budgetRange}}
Timeline: {{timeline}}
Decision: {{decisionMaker}}

What they want to achieve:
{{projectGoal}}

Open meeting prep: {{meetingPrepUrl}}

Review the customer submitted context and CRM history before the meeting.

ProFox Sales Operations
ProFox
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('PROFOX SALES OPERATIONS','New meeting booked: {{companyName}}','<p>Hi {{ownerFirstName}},</p><p>{{contactName}} from <strong>{{companyName}}</strong> booked a meeting with you.</p><p><strong>When:</strong> {{meetingTimeSeller}}<br><strong>Service:</strong> {{serviceInterest}}<br><strong>Budget:</strong> {{budgetRange}}<br><strong>Timeline:</strong> {{timeline}}<br><strong>Decision:</strong> {{decisionMaker}}</p><p><strong>What they want to achieve</strong><br>{{projectGoal}}</p><p>Review the submitted context and CRM history before the meeting.</p><p>ProFox Sales Operations</p>','OPEN MEETING PREP','{{meetingPrepUrl}}'),true,'Seller alert after a customer books through the public booking flow.',now()),

('seller_meeting_prep_24h','Seller 24-hour meeting prep','Tomorrow: {{companyName}} meeting',
'Hi {{ownerFirstName}},

Your meeting with {{contactName}} is tomorrow.

When: {{meetingTimeSeller}}
Service: {{serviceInterest}}
Attendance: {{attendanceStatus}}

Goal: {{projectGoal}}
Budget: {{budgetRange}}
Timeline: {{timeline}}

Open meeting prep: {{meetingPrepUrl}}

Review the full CRM communication history before the meeting.

ProFox Sales Operations
ProFox
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('PROFOX SALES OPERATIONS','Tomorrow: {{companyName}} meeting','<p>Hi {{ownerFirstName}},</p><p>Your meeting with {{contactName}} is tomorrow.</p><p><strong>When:</strong> {{meetingTimeSeller}}<br><strong>Service:</strong> {{serviceInterest}}<br><strong>Attendance:</strong> {{attendanceStatus}}</p><p><strong>Goal:</strong> {{projectGoal}}<br><strong>Budget:</strong> {{budgetRange}}<br><strong>Timeline:</strong> {{timeline}}</p><p>Review the full CRM communication history before the meeting.</p><p>ProFox Sales Operations</p>','OPEN MEETING PREP','{{meetingPrepUrl}}'),true,'Seller preparation reminder 24 hours before the meeting.',now()),

('seller_meeting_reminder_1h','Seller one-hour reminder','In 1 hour: {{contactName}} at {{companyName}}',
'Hi {{ownerFirstName}},

Your meeting starts in one hour.

{{meetingTimeSeller}}

Join meeting: {{joinUrl}}
Open meeting prep: {{meetingPrepUrl}}

ProFox Sales Operations
ProFox
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('PROFOX SALES OPERATIONS','Your meeting starts in one hour','<p>Hi {{ownerFirstName}},</p><p><strong>{{meetingTimeSeller}}</strong></p><p>Review the customer context before joining.</p><p>ProFox Sales Operations</p>','JOIN MEETING','{{joinUrl}}'),true,'Seller join/prep reminder one hour before.',now()),

('seller_customer_rescheduled','Seller customer-reschedule alert','{{contactName}} rescheduled: {{meetingTimeSeller}}',
'Hi {{ownerFirstName}},

{{contactName}} from {{companyName}} changed the meeting time.

New time: {{meetingTimeSeller}}

Your calendar event and future reminders have been updated.

Open meeting: {{meetingPrepUrl}}

ProFox Sales Operations
ProFox
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('PROFOX SALES OPERATIONS','Customer rescheduled the meeting','<p>Hi {{ownerFirstName}},</p><p>{{contactName}} from {{companyName}} changed the meeting time.</p><p><strong>New time:</strong> {{meetingTimeSeller}}</p><p>Your calendar event and future reminders have been updated.</p><p>ProFox Sales Operations</p>','OPEN MEETING','{{meetingPrepUrl}}'),true,'Seller alert when a customer reschedules.',now()),

('seller_customer_cancelled','Seller customer-cancellation alert','{{contactName}} cancelled the meeting',
'Hi {{ownerFirstName}},

{{contactName}} from {{companyName}} cancelled the meeting scheduled for {{previousMeetingTimeSeller}}.

Reason: {{cancellationReason}}

The meeting remains in CRM history.

Open CRM record: {{crmUrl}}

ProFox Sales Operations
ProFox
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('PROFOX SALES OPERATIONS','Customer cancelled the meeting','<p>Hi {{ownerFirstName}},</p><p>{{contactName}} from {{companyName}} cancelled the meeting scheduled for {{previousMeetingTimeSeller}}.</p><p><strong>Reason:</strong> {{cancellationReason}}</p><p>The meeting remains in CRM history.</p><p>ProFox Sales Operations</p>','OPEN CRM RECORD','{{crmUrl}}'),true,'Seller alert when a customer cancels.',now()),

('seller_meeting_link_missing','Missing meeting-link alert','Action needed: meeting link missing for {{companyName}}',
'Hi {{ownerFirstName}},

Your meeting with {{contactName}} is approaching, but no active joining link is available.

Meeting: {{meetingTimeSeller}}
Customer: {{contactName}}
Company: {{companyName}}
Alert: {{linkAlertLabel}}

The calendar sync has already been given time to complete. Add or repair the meeting link now so the customer does not arrive without joining instructions.

Fix meeting link: {{meetingPrepUrl}}

ProFox Sales Operations
ProFox
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('ACTION NEEDED','Meeting link missing for {{companyName}}','<p>Hi {{ownerFirstName}},</p><p>Your meeting with {{contactName}} is approaching, but no active joining link is available.</p><p><strong>Meeting:</strong> {{meetingTimeSeller}}<br><strong>Customer:</strong> {{contactName}}<br><strong>Alert:</strong> {{linkAlertLabel}}</p><p>Add or repair the meeting link now so the customer does not arrive without joining instructions.</p><p>ProFox Sales Operations</p>','FIX MEETING LINK','{{meetingPrepUrl}}'),true,'Escalating seller alert when a customer meeting is approaching without a join link.',now()),

('meeting_customer_email_failed','Customer-email failure alert','Customer email failed: {{emailPurpose}} - {{companyName}}',
'Hi {{ownerFirstName}},

ProFox could not deliver the {{emailPurpose}} email to {{contactName}} after {{attemptCount}} attempts.

Customer: {{contactName}}
Email: {{recipientEmail}}
Meeting: {{meetingTimeSeller}}

The meeting itself is still active.

Contact the customer through an approved channel and verify the email address before the next automated message.

Open customer record: {{crmUrl}}

ProFox Sales Operations
ProFox
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('DELIVERY ACTION NEEDED','Customer email could not be delivered','<p>Hi {{ownerFirstName}},</p><p>ProFox could not deliver the <strong>{{emailPurpose}}</strong> email to {{contactName}} after {{attemptCount}} attempts.</p><p><strong>Email:</strong> {{recipientEmail}}<br><strong>Meeting:</strong> {{meetingTimeSeller}}</p><p>The meeting itself is still active. Contact the customer through an approved channel and verify the email address before the next automated message.</p><p>ProFox Sales Operations</p>','OPEN CUSTOMER RECORD','{{crmUrl}}'),true,'Seller/admin alert after the normal delivery retry policy is exhausted.',now()),

('seller_meeting_next_step_missing','Meeting next-step alert','Next step missing: {{companyName}}',
'Hi {{ownerFirstName}},

Your meeting with {{contactName}} was completed {{elapsedTime}} ago, but no customer-facing next step has been recorded.

Do not let the conversation lose momentum.

Add the customer-safe recap and next action now.

Complete follow-up: {{meetingPrepUrl}}

ProFox Sales Operations
ProFox
https://www.profoxwebdesigner.com/',
public.service_profox_meeting_email_html('NEXT ACTION NEEDED','Next step missing: {{companyName}}','<p>Hi {{ownerFirstName}},</p><p>Your meeting with {{contactName}} was completed {{elapsedTime}} ago, but no customer-facing next step has been recorded.</p><p>Add the customer-safe recap and next action now so the conversation keeps moving.</p><p>ProFox Sales Operations</p>','COMPLETE FOLLOW-UP','{{meetingPrepUrl}}'),true,'Seller alert when a completed meeting has no customer-safe next step.',now())

on conflict(template_key) do update set
  name=excluded.name,subject_template=excluded.subject_template,body_template=excluded.body_template,
  html_template=excluded.html_template,active=true,description=excluded.description,updated_at=now();

-- Retire legacy meeting customer templates after the universal automation is wired to the new keys.
update public.notification_templates
set active=false,updated_at=now()
where template_key in ('booking_confirmation','meeting_reminder','booking_rescheduled','booking_cancelled','no_show_rebook','seller_meeting_reminder');
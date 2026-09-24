-- Canonical ProFox email library, compact batch 7 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k49$mock_call_reminder_trainee$k49$, $s49$Reminder: upcoming ProFox mock sales call$s49$, $p49$Your ProFox mock sales call is coming up.$p49$, $b49$Hi {{traineeName}},

Your ProFox mock sales call with {{evaluatorName}} starts at {{scheduledLocal}}.

Open Module 11 before the call to review your simulated lead brief and meeting details.

Prepare exactly as you would for a real customer conversation: understand the lead context, clarify the objective and be ready to listen, discover needs and guide the conversation professionally.

ProFox Sales Academy
ProFox Web Designer
https://www.profoxwebdesigner.com/$b49$, $t49$Mock call reminder - trainee$t49$, $c49$SALES ACADEMY$c49$),
      ($k50$mock_call_retry_trainee$k50$, $s50$Your next ProFox mock sales call has been scheduled$s50$, $p50$Your previous mock call needs more practice and a new attempt has been scheduled.$p50$, $b50$Hi {{traineeName}},

Your previous mock call requires additional practice before you can pass this module.

Please review the evaluator coaching recorded in Module 11. A new scenario and live mock call have been scheduled for {{scheduledLocal}}.

Use the feedback from your previous attempt to prepare deliberately for the retry. The new attempt is another opportunity to demonstrate the required sales standard.

ProFox Sales Academy
ProFox Web Designer
https://www.profoxwebdesigner.com/$b50$, $t50$Mock call retry scheduled$t50$, $c50$SALES ACADEMY$c50$),
      ($k51$mock_call_scheduled_evaluator$k51$, $s51$You have been assigned a ProFox mock sales call$s51$, $p51$A trainee mock-call evaluation has been assigned to you.$p51$, $b51$Hi {{evaluatorName}},

You have been assigned a ProFox Mock Sales Call with trainee {{traineeName}}.

Scheduled: {{scheduledLocal}}
Meeting link: {{meetingUrl}}

Open the Mock Call Evaluator workspace before the call to review your confidential prospect scenario and scoring rubric.

Please keep the evaluator scenario confidential and record the final evaluation inside ProFox immediately after the call.

ProFox Sales Academy
ProFox Web Designer
https://www.profoxwebdesigner.com/$b51$, $t51$Mock call assigned - evaluator$t51$, $c51$SALES ACADEMY$c51$),
      ($k52$mock_call_scheduled_trainee$k52$, $s52$Your ProFox mock sales call is scheduled$s52$, $p52$Your live ProFox mock sales call has been scheduled.$p52$, $b52$Hi {{traineeName}},

Your live ProFox Mock Sales Call has been scheduled.

Scheduled: {{scheduledLocal}}
Evaluator: {{evaluatorName}}
Meeting link: {{meetingUrl}}

Open Module 11 to review your simulated lead brief before the call. The evaluator has a separate confidential scenario, so prepare exactly as you would for a real cold-outreach prospect.

ProFox Sales Academy
ProFox Web Designer
https://www.profoxwebdesigner.com/$b52$, $t52$Mock call scheduled - trainee$t52$, $c52$SALES ACADEMY$c52$),
      ($k53$no_show_rebook$k53$, $s53$Would you like to choose another meeting time?$s53$, $p53$We missed you at the scheduled meeting. You can choose another time if the project is still relevant.$p53$, $b53$Hi {{contactFirstName}},

We missed you at the scheduled meeting with {{expertName}}.

If the project is still relevant, you can choose another suitable time here:

Choose another time: {{manageUrl}}

If now is not the right time, that is completely fine - no action is required. You can come back whenever the timing makes sense.

{{expertName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b53$, $t53$Missed meeting follow-up$t53$, $c53$MEETINGS$c53$),
      ($k54$notification_test$k54$, $s54$ProFox notification system test$s54$, $p54$A test message confirming that the ProFox email delivery system is working.$p54$, $b54$This is a test from the ProFox notification system.

If you received this email, the configured email provider, sender identity, secure notification outbox and delivery worker are able to deliver messages successfully.

No action is required. This test does not represent a customer, recruitment, payment or operational event.

ProFox System
ProFox Web Designer
https://www.profoxwebdesigner.com/$b54$, $t54$Notification delivery test$t54$, $c54$SYSTEM$c54$),
      ($k55$payment_due_internal$k55$, $s55$Payment {{dueLabel}}: {{paymentReference}}$s55$, $p55$A customer payment requires seller or owner follow-up.$p55$, $b55$A customer payment requires follow-up.

Reference: {{paymentReference}}
Customer: {{customerName}}
Amount due: {{currency}} {{amountDue}}
Due date: {{dueDate}}

Review the canonical payment record before contacting the customer. If payment evidence is already pending verification, do not send a duplicate reminder.

Open payment: {{actionUrl}}

ProFox Finance Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b55$, $t55$Payment due - internal$t55$, $c55$PAYMENTS$c55$),
      ($k56$payment_overdue_internal$k56$, $s56$Payment overdue: {{paymentReference}}$s56$, $p56$A customer payment is overdue and needs an accountable next action.$p56$, $b56$A customer payment is overdue and requires review.

Reference: {{paymentReference}}
Customer: {{customerName}}
Outstanding: {{currency}} {{outstanding}}
Due date: {{dueDate}}
Days overdue: {{daysOverdue}}

Review the payment history and customer context before following up. Keep all payment-status changes and evidence inside the canonical payment record.

Open payment: {{actionUrl}}

ProFox Finance Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b56$, $t56$Payment overdue - internal$t56$, $c56$PAYMENTS$c56$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN RAISE EXCEPTION 'Expected 8 email templates in compact batch 7, updated %', v_updated; END IF;
END;
$$;

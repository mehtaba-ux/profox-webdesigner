-- Canonical ProFox email library, compact batch 1 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k1$admin_training_review_required$k1$, $s1$Academy review required: {{moduleTitle}} | {{traineeName}}$s1$, $p1$A Sales Academy submission is waiting for your review.$p1$, $b1$A Sales Academy submission is ready for Admin review.

Trainee: {{traineeName}}
Module: {{moduleTitle}}
Submitted: {{submittedAt}}

Please review the submitted evidence against the approved module criteria and record the decision inside ProFox. Do not approve from the email alone.

Review submission: {{actionUrl}}

ProFox Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b1$, $t1$Sales Academy review required$t1$, $c1$SALES ACADEMY$c1$),
      ($k2$booking_cancelled$k2$, $s2$Your ProFox meeting has been cancelled$s2$, $p2$Your meeting has been cancelled. You can choose another time whenever it suits you.$p2$, $b2$Hi {{contactFirstName}},

Your meeting with {{expertName}} has been cancelled successfully.

If you would still like to discuss your project, you can choose another suitable time using the link below.

Book another time: {{bookingPageUrl}}

If your plans have changed, no action is required. If you need help choosing the right meeting, simply reply to this email.

{{expertName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b2$, $t2$Booking cancelled$t2$, $c2$MEETINGS$c2$),
      ($k3$booking_confirmation$k3$, $s3$Your ProFox meeting is confirmed: {{bookingReference}}$s3$, $p3$Your meeting is confirmed. Here are the date, purpose and booking details.$p3$, $b3$Hi {{contactFirstName}},

Your meeting with {{expertName}} is confirmed.

Meeting time: {{meetingTimeVisitor}}
Focus: {{serviceInterest}}
Booking reference: {{bookingReference}}

You can review, reschedule or cancel your booking from the secure link below.

Manage your booking: {{manageUrl}}

If there is anything specific you would like us to understand before the meeting, reply to this email. That helps us make the conversation more useful from the start.

{{expertName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b3$, $t3$Booking confirmation$t3$, $c3$MEETINGS$c3$),
      ($k4$booking_rescheduled$k4$, $s4$Your ProFox meeting has been rescheduled$s4$, $p4$Your ProFox meeting has a new confirmed time.$p4$, $b4$Hi {{contactFirstName}},

Your meeting with {{expertName}} has been rescheduled successfully.

New meeting time: {{meetingTimeVisitor}}

You can review or manage the updated booking here:

Manage your booking: {{manageUrl}}

If the new timing changes anything we should know before the meeting, simply reply to this email.

{{expertName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b4$, $t4$Booking rescheduled$t4$, $c4$MEETINGS$c4$),
      ($k5$commission_adjusted$k5$, $s5$Commission adjusted: {{entryNumber}}$s5$, $p5$An Admin adjustment has been recorded on one of your commission entries.$p5$, $b5$Your commission entry {{entryNumber}} has been adjusted by an Administrator.

Previous amount: {{currency}} {{oldAmount}}
New amount: {{currency}} {{newAmount}}
Reason: {{adjustmentReason}}

The adjusted commission is now waiting for the required management approval before it can move toward payout. Please use the commission record inside ProFox as the source of truth.

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b5$, $t5$Commission adjusted$t5$, $c5$COMMISSIONS$c5$),
      ($k6$commission_earned$k6$, $s6$Commission earned: {{entryNumber}}$s6$, $p6$A verified customer payment has created a commission entry for you.$p6$, $b6$A verified customer payment has created commission entry {{entryNumber}}.

Product / service: {{productName}}
Commission: {{currency}} {{commissionAmount}}
Effective rate: {{effectiveRate}}%
Current status: {{status}}

Open the commission record to review the payment-linked calculation and current payout status.

Open Commissions: {{actionUrl}}

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b6$, $t6$Commission earned$t6$, $c6$COMMISSIONS$c6$),
      ($k7$commission_payout_completed$k7$, $s7$Commission payout completed: {{batchNumber}}$s7$, $p7$Your commission payout batch has been marked completed.$p7$, $b7$Commission payout batch {{batchNumber}} has been marked Completed.

Open the Commissions workspace to review the individual entries included in the batch and the recorded payout references.

Review payout details: {{actionUrl}}

If you believe a paid entry is missing or incorrect, raise it through the commission record so the audit trail remains complete.

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b7$, $t7$Commission payout completed$t7$, $c7$COMMISSIONS$c7$),
      ($k8$commission_payout_scheduled$k8$, $s8$Commission payout scheduled: {{batchNumber}}$s8$, $p8$Eligible commission has been included in an upcoming payout batch.$p8$, $b8$A commission payout batch containing your eligible commission has been scheduled.

Batch: {{batchNumber}}
Scheduled date: {{scheduledDate}}

Open the Commissions workspace to see the itemized entries included in this payout.

Review scheduled payout: {{actionUrl}}

The commission ledger inside ProFox remains the final source of truth for payout status and references.

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b8$, $t8$Commission payout scheduled$t8$, $c8$COMMISSIONS$c8$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN RAISE EXCEPTION 'Expected 8 email templates in compact batch 1, updated %', v_updated; END IF;
END;
$$;

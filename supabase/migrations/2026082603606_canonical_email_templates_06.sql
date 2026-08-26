-- Canonical ProFox email library, compact batch 6 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k41$customer_quotation_expiry_reminder$k41$, $s41$A quick note about quotation {{quotationNumber}}$s41$, $p41$Your ProFox quotation is approaching the end of its current validity period.$p41$, $b41$Hi {{contactFirstName}},

A quick note that your ProFox quotation for {{serviceLabel}} is valid until {{validUntilHuman}}.

If you are still considering the project, reply with any questions or anything you would like clarified before making a decision.

If the timing has changed, simply let us know. We would rather keep the conversation clear than send unnecessary follow-ups.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b41$, $t41$Customer quotation validity reminder$t41$, $c41$QUOTATIONS$c41$),
      ($k42$customer_quotation_sent$k42$, $s42${{emailSubject}}$s42$, $p42$Your ProFox proposal is ready to review securely online.$p42$, $b42$Hi {{contactFirstName}},

{{personalMessage}}

Your ProFox proposal is ready for review.

Proposal: {{quotationNumber}}
Investment: {{currency}} {{totalFormatted}}
Valid until: {{validUntilHuman}}
Payment terms: {{paymentTerms}}

Review your proposal: {{quotationUrl}}

Scope summary
{{scopeSummary}}

Please review the proposal carefully. If anything needs clarification before you decide, reply directly to this email and we will help.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b42$, $t42$Customer quotation ready$t42$, $c42$QUOTATIONS$c42$),
      ($k45$lead_no_next_activity$k45$, $s45$Lead needs a next activity$s45$, $p45$An active lead you own currently has no future action scheduled.$p45$, $b45$An active lead assigned to you has no future activity scheduled.

Open the lead record and set the next appropriate action so the CRM remains accurate and no genuine opportunity is left without follow-up.

The next activity should reflect the real customer situation - do not create placeholder tasks simply to clear the reminder.

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b45$, $t45$Lead needs a next activity$t45$, $c45$SALES$c45$),
      ($k46$meeting_reminder$k46$, $s46$Reminder: your ProFox meeting is {{reminderLabel}}$s46$, $p46$A reminder for your upcoming ProFox meeting.$p46$, $b46$Hi {{contactFirstName}},

A quick reminder that your meeting with {{expertName}} is {{reminderLabel}} at {{meetingTimeVisitor}}.

Manage booking: {{manageUrl}}

If there is something you would like us to review before the meeting, simply reply to this email.

{{expertName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b46$, $t46$Customer meeting reminder$t46$, $c46$MEETINGS$c46$),
      ($k47$mock_call_passed$k47$, $s47$You passed the ProFox Mock Sales Call$s47$, $p47$You passed the live mock sales call and can continue to the next Sales Academy module.$p47$, $b47$Hi {{traineeName}},

Congratulations. You passed the ProFox Mock Sales Call with a score of {{score}}/100.

You can now continue to the next required Sales Academy module.

Please review any evaluator feedback recorded in Module 11 before moving on.

ProFox Sales Academy
ProFox Web Designer
https://www.profoxwebdesigner.com/$b47$, $t47$Mock call passed$t47$, $c47$SALES ACADEMY$c47$),
      ($k48$mock_call_reminder_evaluator$k48$, $s48$Reminder: mock sales call evaluation$s48$, $p48$Your assigned ProFox mock sales call is coming up.$p48$, $b48$Hi,

Your assigned mock sales call with trainee {{traineeName}} starts at {{scheduledLocal}}.

Please open the evaluator workspace before joining so you have the approved scenario, scoring rubric and evaluation guidance ready.

Record the final score and coaching evidence in ProFox after the call.

ProFox Sales Academy
ProFox Web Designer
https://www.profoxwebdesigner.com/$b48$, $t48$Mock call reminder - evaluator$t48$, $c48$SALES ACADEMY$c48$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 6 THEN RAISE EXCEPTION 'Expected 6 email templates in compact batch 6, updated %', v_updated; END IF;
END;
$$;

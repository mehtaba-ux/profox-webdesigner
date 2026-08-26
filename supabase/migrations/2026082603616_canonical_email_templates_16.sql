-- Canonical ProFox email library, compact batch 16 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k121$sales_policy_published$k121$, $s121$Sales policy updated: {{policyTitle}}$s121$, $p121$Approved Sales policy or reference content has changed.$p121$, $b121$Approved Sales Academy policy/reference content has been updated.

Policy: {{policyTitle}}

Please review the current version before your next relevant customer interaction. Do not rely on old screenshots, saved copies or memory when the canonical ProFox policy has changed.

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b121$, $t121$Sales policy updated$t121$, $c121$SALES$c121$),
      ($k122$seller_meeting_reminder$k122$, $s122$You have a meeting {{reminderLabel}}$s122$, $p122$A reminder for your upcoming assigned customer meeting.$p122$, $b122$Hi {{expertName}},

Your meeting with {{contactName}} from {{companyName}} is {{reminderLabel}} at {{meetingTimeSeller}}.

Open the meeting-preparation record before the call and review the customer's submitted context, service interest and previous CRM history.

Open meeting preparation: {{meetingPrepUrl}}

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b122$, $t122$Seller meeting reminder$t122$, $c122$MEETINGS$c122$),
      ($k123$seller_new_booking$k123$, $s123$New ProFox booking: {{companyName}}$s123$, $p123$A new customer meeting has been booked and assigned to you.$p123$, $b123$Hi {{expertName}},

A new ProFox meeting has been booked with {{contactName}} from {{companyName}}.

When: {{meetingTimeSeller}}
Service: {{serviceInterest}}
Budget: {{budgetRange}}
Timeline: {{timeline}}
Decision maker: {{decisionMaker}}

Review the submitted context and prepare before the meeting.

Open meeting preparation: {{meetingPrepUrl}}

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b123$, $t123$Seller new-booking alert$t123$, $c123$MEETINGS$c123$),
      ($k124$uiux_capacity_exception$k124$, $s124$Approved content needs a UI/UX owner: {{projectName}}$s124$, $p124$A project is ready for UI/UX work, but no eligible designer is currently available.$p124$, $b124${{projectName}} has completed Content Delivery and is ready for UI/UX Design, but no active eligible UI/UX Designer is currently available for assignment.

Please review current designer capacity, active work-in-progress limits and project priority before manually assigning the task.

Do not bypass eligibility or capacity controls without a documented operational reason.

ProFox Delivery Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b124$, $t124$UI/UX capacity exception$t124$, $c124$OPERATIONS$c124$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 4 THEN RAISE EXCEPTION 'Expected 4 email templates in compact batch 16, updated %', v_updated; END IF;
END;
$$;

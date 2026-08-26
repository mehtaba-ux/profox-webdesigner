-- Canonical ProFox email library, compact batch 9 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k65$project_task_overdue$k65$, $s65$Task overdue: {{taskTitle}}$s65$, $p65$A project task is overdue and requires an accountable recovery action.$p65$, $b65$A project task is overdue.

Project: {{projectName}}
Task: {{taskTitle}}
Priority: {{priority}}
Due: {{dueDate}}
Days overdue: {{daysOverdue}}

Review the cause, dependency and delivery impact. Update the task with the real recovery plan and escalate when required by the project SOP.

Open task: {{actionUrl}}

ProFox Delivery Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b65$, $t65$Project task overdue$t65$, $c65$DELIVERY$c65$),
      ($k66$quotation_approval_required$k66$, $s66$Quotation Approval Required: {{quotation_number}} | {{customer_name}}$s66$, $p66$A quotation is waiting for your commercial review and approval.$p66$, $b66$A quotation has been submitted for your review and approval.

Quotation: {{quotation_number}}
Customer: {{customer_name}}
Prepared by: {{salesperson_name}}
Total value: {{currency}} {{quotation_total}}
Estimated delivery: {{project_timeline}}
Valid until: {{valid_until}}

Approval required because
{{approval_reason}}

Please review the complete quotation, including scope, pricing, discounts, add-ons, payment schedule, delivery timeline and customer-facing proposal before making a decision.

Review & approve quotation: {{quotation_approval_url}}

Current status: Awaiting Approval

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b66$, $t66$Quotation approval required$t66$, $c66$QUOTATIONS$c66$),
      ($k67$quotation_approved_internal$k67$, $s67$Quotation approved: {{quotationNumber}}$s67$, $p67$Management approved your quotation and it can continue to the next controlled sales step.$p67$, $b67$Management has approved quotation {{quotationNumber}} for {{customerName}}.

The quotation is now ready for the next permitted sales action. Review the final approved commercial details before sending or progressing it.

Open quotation: {{actionUrl}}

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b67$, $t67$Quotation approved - seller$t67$, $c67$QUOTATIONS$c67$),
      ($k68$quotation_changes_requested_internal$k68$, $s68$Changes requested for {{quotationNumber}}$s68$, $p68$Management reviewed the quotation and requested changes before approval.$p68$, $b68$Changes have been requested for quotation {{quotationNumber}}.

Customer: {{customerName}}
Reviewer: {{reviewerName}}
Reason / required change: {{decisionNote}}

Open the quotation, review the full decision context and update the commercial details carefully before resubmitting for approval.

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b68$, $t68$Quotation changes requested$t68$, $c68$QUOTATIONS$c68$),
      ($k69$quotation_follow_up_task$k69$, $s69$Quotation follow-up due: {{quotationNumber}}$s69$, $p69$A sent quotation has not progressed and needs a thoughtful follow-up decision.$p69$, $b69$Quotation {{quotationNumber}} for {{customerName}} is due for follow-up.

Open the quotation and customer CRM record before contacting the customer. Use the latest conversation and buying context to decide the right next action rather than sending an automatic generic follow-up.

Open quotation: {{quotationUrl}}

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b69$, $t69$Quotation follow-up$t69$, $c69$QUOTATIONS$c69$),
      ($k70$quotation_not_approved_internal$k70$, $s70$Quotation {{quotationNumber}} was not approved$s70$, $p70$Management did not approve this quotation in its current form.$p70$, $b70$Quotation {{quotationNumber}} was not approved.

Customer: {{customerName}}
Reviewer: {{reviewerName}}
Reason: {{decisionNote}}

Open the quotation in ProFox to review the decision. Revise and resubmit only if the commercial issue can be addressed appropriately.

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b70$, $t70$Quotation not approved$t70$, $c70$QUOTATIONS$c70$),
      ($k71$quotation_opened$k71$, $s71$Quotation opened: {{quotationNumber}}$s71$, $p71$The customer opened the quotation for the first time.$p71$, $b71${{customerName}} opened quotation {{quotationNumber}}.

Use the CRM and quotation record to understand the latest customer context before deciding whether a follow-up is appropriate. The customer opening the proposal is a signal, not a reason to create pressure.

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b71$, $t71$Quotation opened$t71$, $c71$QUOTATIONS$c71$),
      ($k72$recruitment_account_invite$k72$, $s72$Set up your ProFox Sales Academy access$s72$, $p72$Your secure Sales Academy onboarding account is ready.$p72$, $b72$Hi {{fullName}},

Your ProFox Independent Sales Partner Agreement is complete, and your Sales Academy onboarding account is ready.

Use the secure link below to set up your account:

Set up your account: {{accountInviteUrl}}

Your account is limited to onboarding and training while recruitment is still in progress. CRM and live sales access are granted only after you complete the required Sales Academy gates, Final Approval and activation.

If the link does not work, reply to this email instead of creating a second account.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b72$, $t72$Sales Academy account access$t72$, $c72$RECRUITMENT$c72$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN RAISE EXCEPTION 'Expected 8 email templates in compact batch 9, updated %', v_updated; END IF;
END;
$$;

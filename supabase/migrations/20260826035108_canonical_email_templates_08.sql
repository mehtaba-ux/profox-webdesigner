-- Canonical ProFox email library, compact batch 8 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k57$payment_status_update_internal$k57$, $s57$Payment update: {{paymentReference}} | {{status}}$s57$, $p57$The status of a customer payment you own has changed.$p57$, $b57$Payment {{paymentReference}} for {{customerName}} is now {{status}}.

Amount due: {{currency}} {{amountDue}}
Recorded paid: {{currency}} {{amountPaid}}

Review the canonical payment record before taking the next customer or sales action.

Open payment: {{actionUrl}}

ProFox Finance Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b57$, $t57$Payment status update - seller$t57$, $c57$PAYMENTS$c57$),
      ($k58$payment_verification_required$k58$, $s58$Payment verification required: {{paymentReference}}$s58$, $p58$A payment is waiting for Admin verification before any verified status is applied.$p58$, $b58$A payment is waiting for Admin verification.

Reference: {{paymentReference}}
Customer: {{customerName}}
Recorded amount: {{currency}} {{amountPaid}} / {{amountDue}}
Current status: {{status}}

Verify the payment only from confirmed evidence and the canonical ProFox record. Do not approve based only on this email.

Review payment: {{actionUrl}}

ProFox Finance Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b58$, $t58$Payment verification required$t58$, $c58$PAYMENTS$c58$),
      ($k59$project_handover_needs_pm$k59$, $s59$Assign Project Manager: {{projectNumber}}$s59$, $p59$Sales handover is ready, but the project still needs an accountable Project Manager.$p59$, $b59$Sales has submitted the handover for project {{projectNumber}}, but no Project Manager is currently assigned.

Please assign an eligible Project Manager so the handover can be reviewed and Client Onboarding can begin without creating an ownership gap.

Open Projects: {{actionUrl}}

ProFox Delivery Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b59$, $t59$Project handover needs Project Manager$t59$, $c59$DELIVERY$c59$),
      ($k60$project_handover_ready$k60$, $s60$Sales handover ready: {{projectNumber}}$s60$, $p60$Sales has submitted the project handover and it is ready for Project Manager review.$p60$, $b60$Sales has submitted the handover for project {{projectNumber}}.

Please review the customer context, approved scope, commercial commitments, timeline, dependencies and delivery notes before accepting the handover and beginning Client Onboarding.

Review project handover: {{actionUrl}}

ProFox Delivery Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b60$, $t60$Project handover ready for PM review$t60$, $c60$DELIVERY$c60$),
      ($k61$project_handover_required$k61$, $s61$Complete Sales Handover: {{projectNumber}}$s61$, $p61$A verified sale created a project that now requires Sales Handover.$p61$, $b61$A verified sale has created project {{projectNumber}}.

Please complete the required Sales Handover so Project Management receives the customer context, agreed scope, commercial commitments, known risks and delivery information needed to begin Client Onboarding correctly.

Open handover: {{actionUrl}}

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b61$, $t61$Project sales handover required$t61$, $c61$DELIVERY$c61$),
      ($k62$project_task_assigned$k62$, $s62$Project task: {{taskTitle}}$s62$, $p62$A project task has been assigned to you or materially updated.$p62$, $b62$A project task has been assigned to you or its schedule/priority has materially changed.

Project: {{projectName}}
Task: {{taskTitle}}
Priority: {{priority}}
Due: {{dueDate}}

Review the full task brief and acceptance criteria before starting work.

Open My Work: {{actionUrl}}

ProFox Delivery Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b62$, $t62$Project task assigned or updated$t62$, $c62$DELIVERY$c62$),
      ($k63$project_task_due$k63$, $s63$Task {{dueLabel}}: {{taskTitle}}$s63$, $p63$A project task assigned to you is approaching or has reached its due time.$p63$, $b63$A project task needs your attention.

Project: {{projectName}}
Task: {{taskTitle}}
Priority: {{priority}}
Due: {{dueDate}}

Open the task and confirm the next real action. If the due date or dependency is no longer accurate, update the project record rather than allowing stale status to remain.

Open My Work: {{actionUrl}}

ProFox Delivery Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b63$, $t63$Project task due reminder$t63$, $c63$DELIVERY$c63$),
      ($k64$project_task_needs_owner$k64$, $s64$High-priority task needs assignment: {{taskTitle}}$s64$, $p64$A high-priority project task is currently unassigned.$p64$, $b64$A high-priority project task currently has no accountable owner.

Project: {{projectName}}
Task: {{taskTitle}}
Due: {{dueDate}}

Please assign an eligible owner based on role, capacity and delivery responsibility. Avoid placeholder ownership that does not reflect who will actually complete the work.

Assign owner: {{actionUrl}}

ProFox Delivery Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b64$, $t64$High-priority project task needs an owner$t64$, $c64$DELIVERY$c64$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN RAISE EXCEPTION 'Expected 8 email templates in compact batch 8, updated %', v_updated; END IF;
END;
$$;

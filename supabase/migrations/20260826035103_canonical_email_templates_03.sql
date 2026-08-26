-- Canonical ProFox email library, compact batch 3 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k17$content_recruitment_selected$k17$, $s17$You have been selected for ProFox Content onboarding$s17$, $p17$You have passed the current Content Writer selection workflow and can continue to onboarding.$p17$, $b17$Hi {{fullName}},

You have successfully passed the required Content Writer selection stages and have been selected to continue into ProFox onboarding.

The next controlled step is your Content Academy onboarding process. Secure account access will be prepared for you separately.

Please note that production client-work access remains locked until the required training, practical certification and approval gates are completed.

We will send the next instruction to this email address.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b17$, $t17$Content Writer selected for onboarding$t17$, $c17$RECRUITMENT$c17$),
      ($k18$content_recruitment_stage$k18$, $s18$Your ProFox Content Writer application has moved forward$s18$, $p18$Your Content Writer application has progressed to a new recruitment stage.$p18$, $b18$Hi {{fullName}},

Your ProFox Content Writer application has progressed to {{stage}}.

Please follow only the instructions provided by the ProFox Recruitment Team and keep any requested evidence current and accessible.

If no action is requested in the latest communication, you do not need to submit anything additional. We will contact you again when the next decision or task is ready.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b18$, $t18$Content Writer recruitment update$t18$, $c18$RECRUITMENT$c18$),
      ($k19$content_uiux_handoff_ready$k19$, $s19$Approved content is ready for UI/UX: {{projectName}}$s19$, $p19$Approved content has passed its delivery gates and is ready for UI/UX work.$p19$, $b19${{projectName}} has completed the required Content Delivery quality and approval gates.

Before starting design, review the approved copy, information hierarchy, CTA direction, evidence, client feedback and project context in the assigned UI/UX task.

Use only the approved content record as the source of truth for the design handoff.

ProFox Delivery Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b19$, $t19$Content handoff ready for UI/UX$t19$, $c19$OPERATIONS$c19$),
      ($k20$customer_client_portal_ready$k20$, $s20$Your ProFox client portal is ready$s20$, $p20$Your secure ProFox client portal has been connected to your project account.$p20$, $b20$Hi {{contactFirstName}},

Your secure ProFox Client Portal is now ready.

You can use the portal to follow project progress, review payment records and complete client approval or change-request steps when your action is required.

Open Client Portal: {{clientPortalUrl}}

If you cannot sign in, use the Forgot password option with this email address. If you still need help, simply reply to this email and we will assist you.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b20$, $t20$Client portal access ready$t20$, $c20$OPERATIONS$c20$),
      ($k21$customer_content_review_ready$k21$, $s21$Your ProFox content is ready for review$s21$, $p21$A content deliverable is ready for your approval or change request in the Client Portal.$p21$, $b21$Hi {{contactFirstName}},

{{contentTitle}} for {{projectName}} is ready for your review.

Please open your secure ProFox Client Portal and either approve the content or request specific changes. Keeping feedback inside the project record helps our delivery team work from one clear source of truth.

Review content: {{clientPortalUrl}}

If anything is unclear before you review, reply to this email and we will clarify it for you.

ProFox Delivery Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b21$, $t21$Content ready for client review$t21$, $c21$DELIVERY$c21$),
      ($k22$customer_payment_due_reminder$k22$, $s22$Payment reminder for {{paymentReference}}$s22$, $p22$A friendly reminder about an upcoming or due ProFox payment milestone.$p22$, $b22$Hi {{contactFirstName}},

A quick reminder that the {{milestoneLabel}} payment for {{serviceLabel}} is {{dueLabel}}.

Payment reference: {{paymentReference}}
Outstanding amount: {{currency}} {{outstandingFormatted}}
{{paymentActionLine}}

If you have already paid, reply with the payment reference and we will check the record. If your timing has changed, let us know so we can keep the next project step clear.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b22$, $t22$Customer payment due reminder$t22$, $c22$PAYMENTS$c22$),
      ($k23$customer_payment_overdue_reminder$k23$, $s23$Payment follow-up for {{paymentReference}}$s23$, $p23$Our records still show this payment milestone as outstanding.$p23$, $b23$Hi {{contactFirstName}},

Our records still show the {{milestoneLabel}} payment for {{serviceLabel}} as outstanding.

Payment reference: {{paymentReference}}
Outstanding amount: {{currency}} {{outstandingFormatted}}
Due date: {{dueDateHuman}}
{{paymentActionLine}}

If payment has already been made, reply with the payment reference and we will verify it. If you need to discuss the timing, reply to this email and {{ownerFirstName}} will help you understand the next step.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b23$, $t23$Customer payment follow-up$t23$, $c23$PAYMENTS$c23$),
      ($k24$customer_payment_partial$k24$, $s24$Payment update for {{paymentReference}}$s24$, $p24$We have recorded a partial payment against your ProFox payment reference.$p24$, $b24$Hi {{contactFirstName}},

We have recorded a partial payment against {{paymentReference}}.

Received: {{currency}} {{amountPaidFormatted}}
Payment total: {{currency}} {{amountDueFormatted}}
Remaining: {{currency}} {{outstandingFormatted}}

The payment is not yet fully verified as complete. We will send a separate confirmation when the required total has been received and verified.

If anything in this record needs clarification, simply reply to this email.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b24$, $t24$Customer partial payment recorded$t24$, $c24$PAYMENTS$c24$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN RAISE EXCEPTION 'Expected 8 email templates in compact batch 3, updated %', v_updated; END IF;
END;
$$;

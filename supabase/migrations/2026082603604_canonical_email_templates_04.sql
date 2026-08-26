-- Canonical ProFox email library, compact batch 4 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k25$customer_payment_refund_update$k25$, $s25$Refund update for {{paymentReference}}$s25$, $p25$The refund status of your ProFox payment record has been updated.$p25$, $b25$Hi {{contactFirstName}},

Your ProFox payment record {{paymentReference}} is now marked {{status}}.

This email confirms the status recorded in the ProFox payment system. If you need the payment reference, refund context or any clarification about this update, reply to this email and we will help.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b25$, $t25$Customer refund update$t25$, $c25$PAYMENTS$c25$),
      ($k26$customer_payment_request$k26$, $s26$Payment details for {{paymentReference}}$s26$, $p26$Here are the payment details for your next ProFox milestone.$p26$, $b26$Hi {{contactFirstName}},

Here are the payment details for the {{milestoneLabel}} milestone on {{serviceLabel}}.

Payment reference: {{paymentReference}}
Amount: {{currency}} {{amountDueFormatted}}
Due date: {{dueDateHuman}}
{{paymentActionLine}}

Once payment is completed, we will confirm it after verification. If anything needs clarification before you make the payment, simply reply to this email.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b26$, $t26$Customer payment request$t26$, $c26$PAYMENTS$c26$),
      ($k27$customer_payment_verified$k27$, $s27$Payment confirmed: {{paymentReference}}$s27$, $p27$Your ProFox payment has been verified successfully.$p27$, $b27$Hi {{contactFirstName}},

We have successfully verified your payment for {{paymentReference}}. Thank you.

Amount received: {{currency}} {{amountPaidFormatted}}
For: {{milestoneLabel}} on {{serviceLabel}}

{{nextStepText}}

If you need a payment reference or any clarification about what happens next, simply reply to this email.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b27$, $t27$Customer payment confirmed$t27$, $c27$PAYMENTS$c27$),
      ($k28$customer_project_approval_recorded$k28$, $s28$Your approval has been recorded for {{projectName}}$s28$, $p28$Your project approval has been saved and the delivery workflow has moved forward.$p28$, $b28$Hi {{contactFirstName}},

Thank you. Your approval for {{previousStage}} on {{projectName}} has been recorded successfully.

The project has now moved to {{nextStage}}.

No further action is required from you at this moment. We will contact you when the next review, decision or information is needed.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b28$, $t28$Client approval recorded$t28$, $c28$DELIVERY$c28$),
      ($k29$customer_project_cancelled$k29$, $s29$Project update for {{projectName}}$s29$, $p29$Your ProFox project status has been updated to Cancelled.$p29$, $b29$Hi {{contactFirstName}},

{{projectName}} is now marked Cancelled in the ProFox delivery system.

{{statusReasonLine}}

If you need clarification about the project record, payment status, delivered work or any commercial next step, reply to this email and we will help you understand the current position.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b29$, $t29$Project cancelled$t29$, $c29$DELIVERY$c29$),
      ($k30$customer_project_changes_recorded$k30$, $s30$Your change request has been recorded for {{projectName}}$s30$, $p30$We recorded your requested changes and moved the project into the next delivery step.$p30$, $b30$Hi {{contactFirstName}},

We have recorded your requested changes for {{previousStage}} on {{projectName}}.

The project has moved to {{nextStage}} so the team can work through your feedback. We will bring the work back to you when the next review is ready.

If you need to add important context to the request, reply to this email so we can keep the record clear.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b30$, $t30$Client changes recorded$t30$, $c30$DELIVERY$c30$),
      ($k31$customer_project_completed$k31$, $s31${{projectName}} is complete$s31$, $p31$Your ProFox project has reached completion.$p31$, $b31$Hi {{contactFirstName}},

{{projectName}} is now marked Complete in ProFox.

Thank you for working through the project with us. Please keep your project records, credentials and handover information in a safe place.

{{projectAccessLine}}

If anything from the agreed delivery needs clarification, simply reply to this email and we will help you locate the correct project information.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b31$, $t31$Project completed$t31$, $c31$DELIVERY$c31$),
      ($k32$customer_project_handover$k32$, $s32$Handover is being prepared for {{projectName}}$s32$, $p32$Your project has moved into handover and we are preparing the final delivery information.$p32$, $b32$Hi {{contactFirstName}},

{{projectName}} has moved into the Handover stage.

We are preparing the final project information, access details and handover items that apply to your delivery. We will keep this focused on what you need to receive, retain or act on.

{{projectAccessLine}}

We will contact you if a final confirmation or action is required from your side.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b32$, $t32$Project handover stage$t32$, $c32$DELIVERY$c32$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN RAISE EXCEPTION 'Expected 8 email templates in compact batch 4, updated %', v_updated; END IF;
END;
$$;

-- Canonical ProFox email library, compact batch 5 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k33$customer_project_launch$k33$, $s33${{projectName}} has reached the launch stage$s33$, $p33$Your project has reached the controlled launch stage.$p33$, $b33$Hi {{contactFirstName}},

{{projectName}} has reached the Launch stage.

The required commercial launch gate has been satisfied, and our team can continue with the controlled launch work.

We will keep the remaining steps clear and let you know if anything is needed from you.

{{projectAccessLine}}

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b33$, $t33$Project launch stage$t33$, $c33$DELIVERY$c33$),
      ($k34$customer_project_paused$k34$, $s34$Project update for {{projectName}}$s34$, $p34$Your project is currently paused in the ProFox delivery workflow.$p34$, $b34$Hi {{contactFirstName}},

{{projectName}} is currently marked Paused in the ProFox delivery system.

{{statusReasonLine}}

Your ProFox contact will keep the next step clear. If you need to discuss timing, dependencies or what is required to resume the project, simply reply to this email.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b34$, $t34$Project paused$t34$, $c34$DELIVERY$c34$),
      ($k35$customer_project_resumed$k35$, $s35${{projectName}} is moving again$s35$, $p35$Your previously paused ProFox project is active again.$p35$, $b35$Hi {{contactFirstName}},

Good news - {{projectName}} is active again and the team can continue from {{stage}}.

We will keep the next client action clear as the work moves forward.

{{projectAccessLine}}

If anything has changed on your side while the project was paused, reply to this email so we can keep the delivery context accurate.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b35$, $t35$Project resumed$t35$, $c35$DELIVERY$c35$),
      ($k36$customer_project_review_reminder$k36$, $s36$A quick reminder about {{projectName}}$s36$, $p36$Your project is waiting for your review before the next delivery step can continue.$p36$, $b36$Hi {{contactFirstName}},

A quick reminder that your review is still waiting for {{projectName}}.

Current review stage: {{stage}}

{{projectAccessLine}}

If you need clarification before reviewing, reply to this email. If your timing has changed, let us know so we can plan the next step clearly without unnecessary follow-ups.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b36$, $t36$Project review reminder$t36$, $c36$DELIVERY$c36$),
      ($k37$customer_project_review_required$k37$, $s37$Your review is ready for {{projectName}}$s37$, $p37$A project deliverable is ready for your approval or requested changes.$p37$, $b37$Hi {{contactFirstName}},

{{reviewIntro}}

Project: {{projectNumber}}
Review stage: {{stage}}

{{projectAccessLine}}

Please review the current work and either approve it or request specific changes. Clear, focused feedback helps us move the next stage forward without unnecessary back-and-forth.

If anything is unclear before you review, simply reply to this email.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b37$, $t37$Project review required$t37$, $c37$DELIVERY$c37$),
      ($k38$customer_project_started$k38$, $s38$Your ProFox project is now in delivery$s38$, $p38$Your verified project has entered the ProFox delivery workflow.$p38$, $b38$Hi {{contactFirstName}},

Your project, {{projectName}}, is now active in the ProFox delivery system.

Project reference: {{projectNumber}}
Current stage: {{stage}}
{{targetDateLine}}

We will keep communication focused on the moments that need your attention. Internal production tasks stay inside our team workflow.

{{projectAccessLine}}

If you need clarification about the delivery process, reply to this email.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b38$, $t38$Project started$t38$, $c38$DELIVERY$c38$),
      ($k39$customer_quotation_accepted$k39$, $s39$Quotation {{quotationNumber}} confirmed$s39$, $p39$We recorded your acceptance of the ProFox quotation.$p39$, $b39$Hi {{contactFirstName}},

Thank you. We have recorded your confirmation for quotation {{quotationNumber}} covering {{serviceLabel}}.

The next commercial step follows the payment terms agreed in the quotation. We will keep that step clear and send the relevant payment details separately when required.

If anything needs clarification before the next step, simply reply to this email.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b39$, $t39$Customer quotation confirmed$t39$, $c39$QUOTATIONS$c39$),
      ($k40$customer_quotation_closed$k40$, $s40$Quotation {{quotationNumber}} has been closed$s40$, $p40$We recorded your decision and closed the quotation without further follow-up pressure.$p40$, $b40$Hi {{contactFirstName}},

Thank you for letting us know. We have closed quotation {{quotationNumber}} for {{serviceLabel}}.

No further action is required.

If your priorities, scope or timing change later, you can reply to this email and we can continue the conversation from the right place rather than starting again.

{{ownerName}}
ProFox Web Designer
https://www.profoxwebdesigner.com/$b40$, $t40$Customer quotation closed$t40$, $c40$QUOTATIONS$c40$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN RAISE EXCEPTION 'Expected 8 email templates in compact batch 5, updated %', v_updated; END IF;
END;
$$;

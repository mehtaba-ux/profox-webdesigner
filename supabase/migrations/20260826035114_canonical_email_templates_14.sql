-- Canonical ProFox email library, compact batch 14 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k105$recruitment_uiux_activated$k105$, $s105$Welcome to the active ProFox UI/UX Design team$s105$, $p105$Your UI/UX Designer account is now active for approved production work.$p105$, $b105$Hi {{fullName}},

Congratulations. Your UI/UX Designer account is now active.

Sign in to ProFox and use My Work / Design Delivery as the source of truth for assigned client work, briefs, evidence, reviews and delivery status.

Please work only within the access and assignments provided to your role.

Welcome to the ProFox UI/UX Design team.

ProFox UI/UX Design Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b105$, $t105$UI/UX Designer activated$t105$, $c105$RECRUITMENT$c105$),
      ($k106$recruitment_uiux_agreement_ready$k106$, $s106$Your ProFox UI/UX Designer agreement is ready$s106$, $p106$Your UI/UX Designer agreement is ready for secure review and signature.$p106$, $b106$Hi {{fullName}},

Your ProFox UI/UX Designer Services Agreement is ready for review and electronic signature.

Agreement: {{agreementNumber}}

Please read the complete agreement carefully and sign the current issued version using the secure link below.

Review & sign agreement: {{agreementUrl}}

If anything is unclear, contact the ProFox Recruitment Team before signing.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b106$, $t106$UI/UX agreement ready$t106$, $c106$RECRUITMENT$c106$),
      ($k107$recruitment_uiux_agreement_signature_received$k107$, $s107$We received your ProFox UI/UX Designer agreement signature$s107$, $p107$Your electronic signature has been received and is waiting for ProFox verification.$p107$, $b107$Hi {{fullName}},

We received your electronic signature on the ProFox UI/UX Designer Services Agreement.

ProFox will now review and countersign the exact issued agreement before Design Academy access is unlocked.

No further action is required from you unless our team contacts you for clarification.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b107$, $t107$UI/UX signature received$t107$, $c107$RECRUITMENT$c107$),
      ($k108$recruitment_uiux_agreement_verified$k108$, $s108$Your ProFox UI/UX Designer agreement is complete$s108$, $p108$Your UI/UX Designer agreement has been countersigned and verified.$p108$, $b108$Hi {{fullName}},

Your ProFox UI/UX Designer Services Agreement has been countersigned and verified successfully.

The agreement gate is complete.

Your next onboarding step is the secure ProFox Design Academy account and required training/certification process. We will send your account instructions separately.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b108$, $t108$UI/UX agreement verified$t108$, $c108$RECRUITMENT$c108$),
      ($k109$recruitment_uiux_application_received$k109$, $s109$We received your ProFox UI/UX Designer application$s109$, $p109$Your UI/UX Designer application has been received and entered into structured review.$p109$, $b109$Hi {{fullName}},

Thank you for applying for {{roleTitle}} at ProFox.

Your application has been received successfully.

Application reference: {{applicationReference}}

Our team will review your portfolio, experience and application evidence through the structured hiring process.

If your application moves forward, we will contact you by email with the next step. Please avoid submitting duplicate applications while this one is under review.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b109$, $t109$UI/UX application received$t109$, $c109$RECRUITMENT$c109$),
      ($k110$recruitment_uiux_assessment$k110$, $s110$Next step in your ProFox UI/UX Designer application$s110$, $p110$Your UI/UX Designer application has progressed to a new assessment stage.$p110$, $b110$Hi {{fullName}},

Your ProFox UI/UX Designer application has progressed to {{stage}}.

Please follow the assessment instructions provided by the Recruitment Team and submit only the requested evidence.

We will review the submitted work against the approved role criteria and contact you again when the next decision is ready.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b110$, $t110$UI/UX assessment$t110$, $c110$RECRUITMENT$c110$),
      ($k111$recruitment_uiux_design_academy$k111$, $s111$Your ProFox Design Academy onboarding is ready$s111$, $p111$Your UI/UX onboarding account is ready for the Design Academy stage.$p111$, $b111$Hi {{fullName}},

Your ProFox Design Academy onboarding is ready.

Please complete the required Design Academy modules, practical work and final certification using your secure onboarding account.

Production client-work access remains locked until the required training, Final Approval and activation gates are complete.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b111$, $t111$UI/UX Design Academy$t111$, $c111$RECRUITMENT$c111$),
      ($k112$recruitment_uiux_final_review$k112$, $s112$Your ProFox UI/UX onboarding is in final review$s112$, $p112$Your Design Academy work has reached Final Approval review.$p112$, $b112$Hi {{fullName}},

Your required Design Academy work has been submitted for Final Approval.

ProFox will review the required certification evidence and production-readiness gates before active client-work access is enabled.

No action is required unless our team contacts you for clarification.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b112$, $t112$UI/UX final review$t112$, $c112$RECRUITMENT$c112$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN RAISE EXCEPTION 'Expected 8 email templates in compact batch 14, updated %', v_updated; END IF;
END;
$$;

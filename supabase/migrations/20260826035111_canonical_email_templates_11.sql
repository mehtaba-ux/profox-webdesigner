-- Canonical ProFox email library, compact batch 11 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k81$recruitment_agreement_verified$k81$, $s81$Your ProFox Sales Partner Agreement is complete$s81$, $p81$Your Sales Partner Agreement has been countersigned and verified.$p81$, $b81$Hi {{fullName}},

Your ProFox Independent Sales Partner Agreement has been countersigned and verified successfully.

The agreement gate is now complete.

Your next onboarding step is the ProFox Sales Academy and the required training/certification process. We will send your secure account setup instructions separately.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b81$, $t81$Agreement verified$t81$, $c81$RECRUITMENT$c81$),
      ($k82$recruitment_application_received$k82$, $s82$We've Received Your ProFox Application$s82$, $p82$Your application is now with the ProFox Recruitment Team for review.$p82$, $b82$Hi {{fullName}},

Thank you for applying for the {{roleTitle}} opportunity at ProFox.

Your application has been received successfully and is now with our Recruitment Team for review.

Application reference: {{applicationReference}}
Status: Received - Under Review
Expected initial review: Within approximately 7 days

Our team will review your sales experience, communication background, availability, prospecting experience and introduction video.

If your application moves forward, the next step will be sent to {{email}}. Please also check your Spam, Junk or Promotions folder so you do not miss an important update.

There is no need to submit another application while this one is under review. If we need additional information, we will contact you directly.

Thank you for your interest in working with ProFox.

This email confirms receipt of your application. It does not constitute an employment offer, contractor engagement or guarantee of selection.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b82$, $t82$Sales application received$t82$, $c82$RECRUITMENT$c82$),
      ($k83$recruitment_crm_assessment$k83$, $s83$Next step: ProFox CRM assessment$s83$, $p83$Your application has progressed to the CRM Assessment stage.$p83$, $b83$Hi {{fullName}},

You have progressed to the ProFox CRM Assessment.

This stage checks whether you can keep leads, follow-ups, meetings and next actions clear and accurate inside the ProFox sales workflow.

Please follow the assessment instructions provided by the Recruitment Team and complete only the requested task/evidence.

We will contact you again after the assessment has been reviewed.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b83$, $t83$CRM assessment$t83$, $c83$RECRUITMENT$c83$),
      ($k84$recruitment_developer_academy$k84$, $s84$Your ProFox Developer Academy onboarding is ready$s84$, $p84$Your verified Developer onboarding account is ready for the Academy stage.$p84$, $b84$Hi {{fullName}},

Your agreement has been verified and your ProFox Developer Academy onboarding is ready.

Please use the secure onboarding account provided to complete the required Developer Academy modules and certification work.

Production/client-project access remains locked until the required Academy, Final Approval and activation gates are complete.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b84$, $t84$Developer Academy$t84$, $c84$RECRUITMENT$c84$),
      ($k85$recruitment_developer_account_invite$k85$, $s85$Set up your ProFox Developer Academy account$s85$, $p85$Your secure Developer Academy account setup link is ready.$p85$, $b85$Hi {{fullName}},

Your verified agreement is complete and your ProFox Developer Academy account is ready to be set up.

Set up your account: {{accountInviteUrl}}

Please use the newest secure link only. Production/client-project access is not enabled during onboarding and will remain locked until the required approval gates are complete.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b85$, $t85$Developer Academy account invite$t85$, $c85$RECRUITMENT$c85$),
      ($k86$recruitment_developer_activated$k86$, $s86$Welcome to the active ProFox Development team$s86$, $p86$Your Web Developer account is now active for approved production work.$p86$, $b86$Hi {{fullName}},

Congratulations. Your Web Developer account is now active.

Sign in to ProFox and use My Work / Development Delivery as the source of truth for assigned client work, requirements, evidence, QA gates and delivery status.

Please work only within the access and assignments provided to your role.

Welcome to the ProFox Development team.

ProFox Development Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b86$, $t86$Developer activated$t86$, $c86$RECRUITMENT$c86$),
      ($k87$recruitment_developer_agreement_ready$k87$, $s87$Your ProFox Web Developer agreement is ready$s87$, $p87$Your Web Developer agreement is ready for secure review and signature.$p87$, $b87$Hi {{fullName}},

Your ProFox Web Developer Agreement is ready for review and signature.

Agreement: {{agreementNumber}}

Please read the complete agreement carefully and sign the current issued version using the secure link below.

Review & sign agreement: {{agreementUrl}}

If anything in the agreement is unclear, contact the ProFox Recruitment Team before signing.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b87$, $t87$Developer agreement ready$t87$, $c87$RECRUITMENT$c87$),
      ($k88$recruitment_developer_agreement_verified$k88$, $s88$Your ProFox Web Developer agreement is verified$s88$, $p88$Your Web Developer agreement is complete and you can continue to Developer Academy onboarding.$p88$, $b88$Hi {{fullName}},

Your ProFox Web Developer Agreement has been verified successfully.

The agreement gate is complete. Your next controlled step is the ProFox Developer Academy account setup and required onboarding.

We will send the secure account instructions separately.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b88$, $t88$Developer agreement verified$t88$, $c88$RECRUITMENT$c88$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN RAISE EXCEPTION 'Expected 8 email templates in compact batch 11, updated %', v_updated; END IF;
END;
$$;

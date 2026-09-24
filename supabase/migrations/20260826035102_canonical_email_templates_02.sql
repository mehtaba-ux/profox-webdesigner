-- Canonical ProFox email library, compact batch 2 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k9$commission_review_required$k9$, $s9$Commission review required: {{entryNumber}}$s9$, $p9$A commission entry needs management review before it can proceed.$p9$, $b9$A commission entry is waiting for management review.

Entry: {{entryNumber}}
Seller: {{sellerName}}
Product / service: {{productName}}
Commission: {{currency}} {{commissionAmount}}

Please review the verified payment evidence, commission policy and calculation before making a decision.

Review commission: {{actionUrl}}

ProFox Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b9$, $t9$Commission review required$t9$, $c9$COMMISSIONS$c9$),
      ($k10$commission_status_update$k10$, $s10$Commission {{status}}: {{entryNumber}}$s10$, $p10$The status of one of your commission entries has changed.$p10$, $b10$Commission entry {{entryNumber}} is now {{status}}.

Product / service: {{productName}}
Amount: {{currency}} {{commissionAmount}}
{{statusNote}}

Open the commission record for the latest status, supporting details and payout information.

Open Commissions: {{actionUrl}}

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b10$, $t10$Commission status update$t10$, $c10$COMMISSIONS$c10$),
      ($k11$content_capacity_exception$k11$, $s11$Content work needs an available writer: {{projectName}}$s11$, $p11$Content Delivery is ready, but no eligible writer is currently available.$p11$, $b11${{projectName}} has entered Content Delivery, but the system could not assign an eligible active Content Writer within the configured work-in-progress limit.

Please review current Content capacity, active assignments and availability before manually assigning the work. Do not bypass workload or eligibility controls without a documented reason.

ProFox Delivery Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b11$, $t11$Content capacity exception$t11$, $c11$OPERATIONS$c11$),
      ($k12$content_recruitment_account_invite$k12$, $s12$Set up your ProFox Content Academy access$s12$, $p12$Your secure Content Academy onboarding account is ready.$p12$, $b12$Hi {{fullName}},

Your ProFox Content Academy access is ready.

Use the secure link below to set up your account:

Set up your account: {{accountInviteUrl}}

Your account will remain in onboarding mode while you complete the required Content Academy training and practical certification. Production client-work access is activated only after all required quality gates are completed and approved.

If the link does not work, reply to this email rather than creating another account.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b12$, $t12$Content Academy account access$t12$, $c12$RECRUITMENT$c12$),
      ($k13$content_recruitment_activated$k13$, $s13$Welcome to the ProFox Content team$s13$, $p13$Your Content Writer certification is complete and your production access is active.$p13$, $b13$Hi {{fullName}},

Congratulations. Your required Content Writer onboarding and certification are complete, and your production access is now active.

Assigned client work will appear inside Content Delivery with the approved brief, project context, SOP requirements and quality gates you must follow.

Please use ProFox as the source of truth for assignments, evidence, reviews and handoffs.

Welcome to the ProFox Content team.

ProFox Content Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b13$, $t13$Content Writer activated$t13$, $c13$RECRUITMENT$c13$),
      ($k14$content_recruitment_application_received$k14$, $s14$Application received: ProFox Content Writer$s14$, $p14$We received your Content Writer application and will now review your experience and evidence.$p14$, $b14$Hi {{fullName}},

Thank you for applying for the ProFox Content Writer opportunity.

Your application has been received successfully and is now ready for review. Our team will review your experience, portfolio and role-fit evidence against the requirements of the position.

If your application moves forward, we will contact you by email with the next step. Please keep an eye on your inbox and Spam/Junk folders.

Submitting an application does not create production workspace access. Any onboarding access will be provided only if you progress through the required recruitment stages.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b14$, $t14$Content Writer application received$t14$, $c14$RECRUITMENT$c14$),
      ($k15$content_recruitment_not_selected$k15$, $s15$Update on your ProFox Content Writer application$s15$, $p15$An update regarding your Content Writer application with ProFox.$p15$, $b15$Hi {{fullName}},

Thank you for the time and effort you invested in the ProFox Content Writer selection process.

After reviewing your application and the evidence available at this stage, we will not be progressing this application further at this time.

We appreciate your interest in working with ProFox and wish you the best with your next opportunity.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b15$, $t15$Content Writer application closed$t15$, $c15$RECRUITMENT$c15$),
      ($k16$content_recruitment_practical_review$k16$, $s16$Content Writer practical certification requires review$s16$, $p16$A Content Writer practical submission is waiting for review.$p16$, $b16${{fullName}} has submitted the required Content Writer practical certification.

Please review the submission against the approved PF-SOP-07 criteria and the role-specific quality standard before production access is activated.

Record the review and decision inside the candidate's ProFox recruitment/onboarding record so the audit trail remains complete.

ProFox Recruitment Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b16$, $t16$Content practical review required$t16$, $c16$RECRUITMENT$c16$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN RAISE EXCEPTION 'Expected 8 email templates in compact batch 2, updated %', v_updated; END IF;
END;
$$;

-- Canonical ProFox email library, compact batch 10 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k73$recruitment_activated$k73$, $s73$Welcome to ProFox: your sales access is active$s73$, $p73$Your ProFox sales workspace is now active.$p73$, $b73$Hi {{fullName}},

Congratulations. Your ProFox sales access is now Active.

Start with your Today workspace, keep every lead and follow-up accurate, and use the Sales Academy as your operating reference.

Your access is role-based. Please keep prospecting, CRM updates, quotations, meetings and customer communication inside the approved ProFox workflow.

Welcome to the ProFox sales team.

ProFox Sales Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b73$, $t73$Recruitment activated$t73$, $c73$RECRUITMENT$c73$),
      ($k74$recruitment_admin_agreement_signed$k74$, $s74$Agreement signature received: {{fullName}}$s74$, $p74$A Sales Partner candidate has signed the issued agreement and it is ready for Admin verification.$p74$, $b74$A Sales Partner candidate has signed the issued ProFox agreement.

Candidate: {{fullName}}
Email: {{email}}
Agreement: {{agreementNumber}}

Please open the Recruitment/Agreement record, review the exact issued version, countersign where appropriate and complete the protected verification step.

Do not verify the agreement from this email alone.

ProFox Recruitment Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b74$, $t74$Recruitment agreement signature review$t74$, $c74$RECRUITMENT$c74$),
      ($k75$recruitment_admin_application_received$k75$, $s75$New Sales application: {{fullName}} | {{applicationReference}}$s75$, $p75$A new Sales Representative application is ready for review.$p75$, $b75$A new Sales application has been received and is ready for review.

Candidate: {{fullName}}
Email: {{email}}
Country: {{country}}
Time zone: {{timezone}}
Role: {{roleTitle}}
Application reference: {{applicationReference}}
Submitted: {{submittedAt}}
Sales experience: {{salesExperienceMonths}} months
Preferred working window: {{preferredWorkWindow}}
Introduction video: {{videoProof}}

Please continue all review, scoring and stage actions inside the Recruitment workspace.

Review application: {{adminReviewUrl}}

ProFox Recruitment Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b75$, $t75$New Sales application - Admin$t75$, $c75$RECRUITMENT$c75$),
      ($k76$recruitment_admin_incomplete_review$k76$, $s76$Review incomplete candidate: {{fullName}}$s76$, $p76$A candidate has remained incomplete for five days and needs an Admin decision.$p76$, $b76$A ProFox sales candidate has remained in Video Pending for 5 days.

Candidate: {{fullName}}
Email: {{email}}
Country: {{country}}

Please review the candidate record and decide whether to follow up, continue waiting or close the application. Keep the reason for the decision inside the recruitment record.

Open Recruitment: https://www.profoxwebdesigner.com/admin/app/recruitment

ProFox Recruitment Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b76$, $t76$Incomplete candidate review$t76$, $c76$RECRUITMENT$c76$),
      ($k77$recruitment_admin_stage_overdue$k77$, $s77$Recruitment review overdue: {{fullName}}$s77$, $p77$A candidate has remained in the current recruitment stage beyond its configured SLA.$p77$, $b77$Candidate {{fullName}} ({{applicationReference}}) has remained in {{stage}} beyond the configured review SLA.

Please review the candidate evidence, assessment/interview status and the next required action. Record the decision in ProFox so the recruitment pipeline remains accurate.

ProFox Recruitment Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b77$, $t77$Recruitment stage overdue$t77$, $c77$RECRUITMENT$c77$),
      ($k78$recruitment_agreement_pending$k78$, $s78$Next step: ProFox Sales Partner Agreement$s78$, $p78$Your application has reached the agreement stage.$p78$, $b78$Hi {{fullName}},

Your application has progressed to Agreement Pending.

The ProFox Independent Sales Partner Agreement will confirm the commercial model, responsibilities, confidentiality requirements and operating rules for the relationship.

Please review the agreement carefully when it is issued and sign only after you understand the terms.

Training and account linking remain locked until the required agreement process is complete.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b78$, $t78$Recruitment agreement pending$t78$, $c78$RECRUITMENT$c78$),
      ($k79$recruitment_agreement_ready$k79$, $s79$Your ProFox Sales Partner Agreement is ready$s79$, $p79$Your Sales Partner Agreement is ready for secure review and signature.$p79$, $b79$Hi {{fullName}},

Your ProFox Independent Sales Partner Agreement is ready for review and electronic signature.

Please read the complete agreement carefully, confirm the required acknowledgements and sign using the secure link below.

Review & sign agreement: {{agreementUrl}}

The commercial terms in this issued agreement are frozen for this version. Later policy or Admin changes will apply only where legally and operationally appropriate to future records.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b79$, $t79$Recruitment agreement ready$t79$, $c79$RECRUITMENT$c79$),
      ($k80$recruitment_agreement_signature_received$k80$, $s80$We received your ProFox agreement signature$s80$, $p80$Your electronic signature has been received and the agreement is waiting for ProFox verification.$p80$, $b80$Hi {{fullName}},

We received your electronic signature on the ProFox Independent Sales Partner Agreement.

The agreement is now waiting for the ProFox company verification/countersignature step.

Training access will be granted only after the agreement is fully verified and your onboarding account is linked correctly.

No further action is required from you unless our team contacts you for clarification.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b80$, $t80$Partner signature received$t80$, $c80$RECRUITMENT$c80$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN RAISE EXCEPTION 'Expected 8 email templates in compact batch 10, updated %', v_updated; END IF;
END;
$$;

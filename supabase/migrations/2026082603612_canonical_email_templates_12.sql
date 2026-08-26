-- Canonical ProFox email library, compact batch 12 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k89$recruitment_developer_application_received$k89$, $s89$We received your ProFox Web Developer application$s89$, $p89$Your Web Developer application has been received and entered into structured review.$p89$, $b89$Hi {{fullName}},

Thank you for applying for {{roleTitle}} at ProFox.

Your application has been received successfully.

Application reference: {{applicationReference}}

Our team will review your shipped-work evidence, engineering experience and role fit through the structured recruitment process.

If your application moves forward, we will contact you by email with the next step. Please avoid submitting duplicate applications while this one is under review.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b89$, $t89$Developer application received$t89$, $c89$RECRUITMENT$c89$),
      ($k90$recruitment_developer_final_review$k90$, $s90$Your ProFox Developer onboarding is in final review$s90$, $p90$Your Developer Academy work has reached Final Approval review.$p90$, $b90$Hi {{fullName}},

Your required Developer Academy work has been submitted for Final Approval.

ProFox will review the required certification evidence and production-readiness gates before any live client-project access is activated.

No action is required from you unless our team contacts you for clarification.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b90$, $t90$Developer final review$t90$, $c90$RECRUITMENT$c90$),
      ($k91$recruitment_developer_review$k91$, $s91$Your ProFox Web Developer application is in review$s91$, $p91$Your Web Developer application has progressed to a new review stage.$p91$, $b91$Hi {{fullName}},

Your {{roleTitle}} application has progressed to {{stage}}.

Please follow only the instructions sent by the ProFox Recruitment Team and submit the requested evidence in the format provided.

If no action is requested, you do not need to send additional material. We will contact you when the next decision is ready.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b91$, $t91$Developer application review$t91$, $c91$RECRUITMENT$c91$),
      ($k92$recruitment_developer_selected$k92$, $s92$You have been selected for ProFox Web Developer onboarding$s92$, $p92$You passed the required Development recruitment evaluations and can continue to onboarding.$p92$, $b92$Hi {{fullName}},

You have successfully passed the required Development recruitment evaluations and have been selected to continue into ProFox Web Developer onboarding.

The next controlled step is your Web Developer agreement. Please review the agreement carefully when it is issued.

Production access is provided only after the required agreement, Developer Academy, Final Approval and activation gates are complete.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b92$, $t92$Developer selected$t92$, $c92$RECRUITMENT$c92$),
      ($k93$recruitment_final_approved$k93$, $s93$Final approval complete: ProFox$s93$, $p93$Your recruitment record has passed Final Approval and is ready for system activation.$p93$, $b93$Hi {{fullName}},

Your Final Approval is complete.

Your candidate record is now Ready for System Access.

The ProFox team will complete the final activation step and confirm when your active workspace is ready to use.

Please do not create another account or attempt to bypass the onboarding access process while activation is being completed.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b93$, $t93$Final approval complete$t93$, $c93$RECRUITMENT$c93$),
      ($k94$recruitment_final_review$k94$, $s94$Your ProFox training is in final review$s94$, $p94$Your required training has reached Final Approval review.$p94$, $b94$Hi {{fullName}},

Your required ProFox training has reached Final Approval.

Our team will review the required evidence, certification results and activation readiness before active sales access is granted.

No action is required unless we contact you for clarification. We will send the final decision to this email address.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b94$, $t94$Final recruitment review$t94$, $c94$RECRUITMENT$c94$),
      ($k95$recruitment_initial_screening$k95$, $s95$Your ProFox application is moving forward$s95$, $p95$Your introduction video passed the first review and your application is moving into Initial Screening.$p95$, $b95$Hi {{fullName}},

Your introduction video has passed our first review, and your application is moving into Initial Screening.

We will now review the experience, availability and information you submitted against the requirements of the opportunity.

If you are shortlisted, we will contact you by email with the next step. No additional action is required right now unless our team contacts you.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b95$, $t95$Initial screening$t95$, $c95$RECRUITMENT$c95$),
      ($k96$recruitment_interview_scheduled$k96$, $s96$Your ProFox recruitment interview is scheduled$s96$, $p96$Your recruitment interview is confirmed. Please review the time, timezone and meeting link.$p96$, $b96$Hi {{fullName}},

Your {{interviewStage}} interview with ProFox has been scheduled.

Date & time: {{interviewDateTime}}
Time zone: {{interviewTimezone}}
Meeting link: {{meetingUrl}}

Please join from a quiet environment with reliable internet and be ready a few minutes before the scheduled time.

If you have a genuine scheduling issue, contact the Recruitment Team before the interview rather than missing the meeting without notice.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b96$, $t96$Recruitment interview scheduled$t96$, $c96$RECRUITMENT$c96$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN RAISE EXCEPTION 'Expected 8 email templates in compact batch 12, updated %', v_updated; END IF;
END;
$$;

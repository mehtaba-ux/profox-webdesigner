-- Canonical ProFox email library, compact batch 13 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k97$recruitment_interview_updated$k97$, $s97$Update to your ProFox recruitment interview$s97$, $p97$The status of your ProFox recruitment interview has changed.$p97$, $b97$Hi {{fullName}},

Your {{interviewStage}} interview status has been updated to {{interviewStatus}}.

{{interviewOutcome}}

If the interview has been rescheduled or another action is required from you, follow the latest instructions sent by the ProFox Recruitment Team.

If no action is requested, you do not need to reply.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b97$, $t97$Recruitment interview updated$t97$, $c97$RECRUITMENT$c97$),
      ($k98$recruitment_lead_research$k98$, $s98$Next step: ProFox lead research test$s98$, $p98$Your application has progressed to the Lead Research Test.$p98$, $b98$Hi {{fullName}},

You have progressed to the ProFox Lead Research Test.

This stage checks how you identify, evaluate and qualify businesses that fit ProFox services before outreach begins.

Please follow the task instructions provided by the Recruitment Team and submit your work in the requested format.

We will contact you again after the test has been reviewed.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b98$, $t98$Lead research test$t98$, $c98$RECRUITMENT$c98$),
      ($k99$recruitment_not_selected$k99$, $s99$Update on your ProFox application$s99$, $p99$An update regarding your ProFox recruitment application.$p99$, $b99$Hi {{fullName}},

Thank you for the time and effort you invested in the ProFox recruitment process.

After reviewing your application and the available assessment evidence, we will not be moving your application forward at this stage.

We appreciate your interest in ProFox and wish you the best in your next opportunity.

This message relates only to the current application and does not disclose internal evaluation notes or refusal reasons.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b99$, $t99$Application closed$t99$, $c99$RECRUITMENT$c99$),
      ($k100$recruitment_sales_assessment$k100$, $s100$Next step: ProFox sales assessment$s100$, $p100$Your application has progressed to the ProFox Sales Assessment.$p100$, $b100$Hi {{fullName}},

Your next step is the ProFox Sales Assessment.

This stage evaluates how you communicate, discover client needs, respond to objections and move a conversation toward a clear next action.

Please follow the assessment instructions provided by the Recruitment Team. Complete only the requested assessment and evidence.

We will contact you after the assessment has been reviewed.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b100$, $t100$Sales assessment$t100$, $c100$RECRUITMENT$c100$),
      ($k101$recruitment_selected$k101$, $s101$You have been selected to continue with ProFox$s101$, $p101$You passed the required selection assessments and can continue to the agreement stage.$p101$, $b101$Hi {{fullName}},

You have successfully completed the required selection assessments for the ProFox Independent Sales Representative opportunity.

You have been selected to continue to the next stage.

The next controlled step is the ProFox Independent Sales Partner Agreement. Please review it carefully when it is sent.

Training and live sales access are provided only after the required agreement and onboarding gates are complete.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b101$, $t101$Candidate selected$t101$, $c101$RECRUITMENT$c101$),
      ($k102$recruitment_shortlisted$k102$, $s102$You have been shortlisted: ProFox$s102$, $p102$You have been shortlisted and will continue to the practical assessment stages.$p102$, $b102$Hi {{fullName}},

You have been shortlisted for the Independent Commission-Based Sales Representative opportunity at ProFox.

The next stages assess practical sales judgment, prospect research and readiness to work inside the ProFox sales process.

We will send the relevant assessment instructions as your application progresses. Please follow only the latest instructions sent by the Recruitment Team.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b102$, $t102$Candidate shortlisted$t102$, $c102$RECRUITMENT$c102$),
      ($k103$recruitment_training$k103$, $s103$Welcome to the ProFox Sales Academy$s103$, $p103$Your agreement is complete and you can begin the required Sales Academy onboarding.$p103$, $b103$Hi {{fullName}},

Your agreement is confirmed and you are moving into the ProFox Sales Academy.

Please complete all required modules, practical reviews and final certification steps assigned to your onboarding track.

Training access does not mean active sales access. Activation happens only after the required Academy gates and Final Approval are completed successfully.

ProFox Sales Academy
ProFox Web Designer
https://www.profoxwebdesigner.com/$b103$, $t103$Sales Academy onboarding$t103$, $c103$RECRUITMENT$c103$),
      ($k104$recruitment_uiux_account_invite$k104$, $s104$Set up your ProFox Design Academy account$s104$, $p104$Your secure ProFox Design Academy onboarding account is ready.$p104$, $b104$Hi {{fullName}},

Your verified UI/UX Designer Agreement is complete and your ProFox Design Academy account is ready.

Use the secure link below to set up your account:

Set up your account: {{accountInviteUrl}}

Production client-work access remains locked until the required Design Academy, Final Approval and activation gates are complete.

If the link does not work, reply to this email rather than creating a second account.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b104$, $t104$UI/UX Design Academy account$t104$, $c104$RECRUITMENT$c104$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN RAISE EXCEPTION 'Expected 8 email templates in compact batch 13, updated %', v_updated; END IF;
END;
$$;

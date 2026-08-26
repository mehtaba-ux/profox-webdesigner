-- Canonical ProFox email library, compact batch 15 of 16.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ($k113$recruitment_uiux_portfolio_review$k113$, $s113$Your ProFox UI/UX application is in portfolio review$s113$, $p113$Your UI/UX application has progressed to Portfolio Review.$p113$, $b113$Hi {{fullName}},

Your {{roleTitle}} application has moved to Portfolio Review.

Our team will review the quality, relevance and evidence in your submitted portfolio against the requirements of the role.

No action is required unless the Recruitment Team contacts you for clarification or additional evidence.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b113$, $t113$UI/UX portfolio review$t113$, $c113$RECRUITMENT$c113$),
      ($k114$recruitment_uiux_selected$k114$, $s114$You have been selected for ProFox UI/UX Designer onboarding$s114$, $p114$You passed the required UI/UX recruitment evaluations and can continue to onboarding.$p114$, $b114$Hi {{fullName}},

You have successfully passed the required UI/UX recruitment evaluations and have been selected to continue into ProFox UI/UX Designer onboarding.

The next controlled step is your UI/UX Designer agreement. Please review the agreement carefully when it is issued.

Production access is provided only after the agreement, Design Academy, Final Approval and activation gates are complete.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b114$, $t114$UI/UX selected$t114$, $c114$RECRUITMENT$c114$),
      ($k115$recruitment_video_pending$k115$, $s115$Complete your ProFox application: introduction video required$s115$, $p115$Your candidate details are saved, but the required introduction video is still missing.$p115$, $b115$Hi {{fullName}},

We have your candidate details, but your application is not ready for review because the required 60-120 second English introduction video is still missing.

Please cover your introduction, relevant sales experience, English communication, client dealing and why the ProFox opportunity fits you.

Reply with a public or viewable Loom, Google Drive, YouTube Unlisted or similar link that our team can open without requesting access.

Once the video is received, your application can move into review.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b115$, $t115$Introduction video pending$t115$, $c115$RECRUITMENT$c115$),
      ($k116$recruitment_video_received$k116$, $s116$Introduction video received: ProFox$s116$, $p116$We received your introduction video and your application is now ready for review.$p116$, $b116$Hi {{fullName}},

We have received your introduction video successfully.

Your application is now in Video Review.

Our team will review the video together with the information already submitted in your application. We will contact you by email if your application moves to the next stage.

No additional action is required right now.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b116$, $t116$Introduction video received$t116$, $c116$RECRUITMENT$c116$),
      ($k117$recruitment_video_reminder_1$k117$, $s117$Reminder: your ProFox introduction video is still pending$s117$, $p117$Your ProFox application is still waiting for the required introduction video.$p117$, $b117$Hi {{fullName}},

A friendly reminder that your ProFox sales application is still waiting for the required 60-120 second introduction video.

Please send a public/viewable video link so our team can move your application into review.

If you no longer want to continue with the application, no action is required.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b117$, $t117$Introduction video reminder$t117$, $c117$RECRUITMENT$c117$),
      ($k118$recruitment_video_reminder_2$k118$, $s118$Final reminder: complete your ProFox sales application$s118$, $p118$This is the final reminder that your application is incomplete because the introduction video is missing.$p118$, $b118$Hi {{fullName}},

This is the final reminder that your ProFox sales application is incomplete because the required introduction video is still missing.

If you would like us to continue reviewing your application, please send the 60-120 second video link requested in the earlier email.

If we do not receive the video, the application may remain incomplete or be closed according to the recruitment workflow.

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$b118$, $t118$Final introduction video reminder$t118$, $c118$RECRUITMENT$c118$),
      ($k119$sales_career_progression_eligible_admin$k119$, $s119$Career progression review: {{salespersonName}}$s119$, $p119$A salesperson has reached the configured criteria for management career-progression review.$p119$, $b119${{salespersonName}} has reached the configured verified-sales criteria for the period {{periodStart}} through {{periodEnd}}.

Please review the complete performance evidence and decide whether a salaried or expanded-role proposal should be considered.

Reaching the threshold creates review eligibility only; it does not automatically create an employment offer, salary change or promotion.

Review performance: {{actionUrl}}

ProFox Management
ProFox Web Designer
https://www.profoxwebdesigner.com/$b119$, $t119$Sales career progression review - Admin$t119$, $c119$SALES$c119$),
      ($k120$sales_career_progression_eligible_seller$k120$, $s120$Management Review eligibility reached$s120$, $p120$You reached the configured performance criteria for Management Review eligibility.$p120$, $b120$You have reached the configured verified-sales criteria for Management Review eligibility.

This is an important performance milestone, but it is not an automatic promotion, employment offer, salary commitment or guarantee.

Management will review the relevant performance evidence, responsibilities, business needs and available opportunities before deciding whether any next step should be offered.

ProFox Sales Operations
ProFox Web Designer
https://www.profoxwebdesigner.com/$b120$, $t120$Career progression eligibility reached$t120$, $c120$SALES$c120$)
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template, body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category), updated_at=now()
  FROM input WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 8 THEN RAISE EXCEPTION 'Expected 8 email templates in compact batch 15, updated %', v_updated; END IF;
END;
$$;

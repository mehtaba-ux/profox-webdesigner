-- UI/UX application form v2 production backfill
--
-- The public form already falls back to the canonical v2 configuration in the
-- frontend. Persist the matching enforcement policy into each UI/UX career job
-- so the protected submission RPC validates the same required fields/options
-- and captures that policy in application_policy_snapshot even before an Admin
-- edits the form for the first time.
--
-- Existing Admin values such as minimumWeeklyHours, sourceOptions and any
-- already-customized fieldConfig entries win over these defaults.

with canonical as (
  select '{"version":2,"fieldConfig":{"fullName":{"visible":true,"required":true},"email":{"visible":true,"required":true},"phone":{"visible":true,"required":false},"country":{"visible":true,"required":true},"timezone":{"visible":true,"required":true},"linkedinUrl":{"visible":true,"required":false},"currentRole":{"visible":true,"required":true,"options":["Employed full-time","Employed part-time","Freelancer","Contractor","Agency","Student","Between roles","Other"]},"yearsExperience":{"visible":true,"required":true,"options":["Less than 1 year","1–2 years","2–3 years","3–5 years","5–8 years","8+ years"]},"designWorkTypes":{"visible":true,"required":true,"options":["Business websites","Landing pages","SaaS / web applications","Dashboards","Mobile applications","E-commerce","User flows / information architecture","Wireframes","Prototypes","Design systems","Conversion-focused design","Other"]},"strongestCapability":{"visible":true,"required":true,"options":["UX / Information Architecture","Conversion-focused web design","Visual UI design","SaaS / Product UI","Responsive web design","Design systems","Prototyping / interaction design","Generalist UI/UX"]},"portfolioUrl":{"visible":true,"required":true},"strongestCaseStudy":{"visible":true,"required":true},"caseStudyContribution":{"visible":true,"required":true},"caseStudyOutcome":{"visible":true,"required":true},"portfolioSharingConsent":{"visible":true,"required":true},"figmaConfidence":{"visible":true,"required":true,"options":["Beginner","Intermediate","Advanced","Expert"]},"figmaCapabilities":{"visible":true,"required":true,"options":["Auto Layout","Components","Component properties","Variants","Variables","Styles","Design tokens","Libraries","Interactive prototypes","Responsive component structures","Dev Mode / handoff","Version history","Branching"]},"figmaExperience":{"visible":true,"required":true},"designSystemsExperience":{"visible":true,"required":true},"uxProcess":{"visible":true,"required":true},"responsiveExperience":{"visible":true,"required":true},"interfaceStates":{"visible":true,"required":true,"options":["Default","Hover","Focus","Active","Disabled","Loading","Empty","Success","Warning","Error","Validation","Responsive variations"]},"accessibilityConsiderations":{"visible":true,"required":true,"options":["Colour contrast","Text readability","Focus states","Keyboard navigation considerations","Form labels","Error messaging","Touch-target sizing","Content hierarchy","Screen-reader considerations","Motion / accessibility considerations","WCAG familiarity","I have limited accessibility experience"]},"accessibilityExperience":{"visible":true,"required":true},"businessConversionThinking":{"visible":true,"required":true},"handoffFrequency":{"visible":true,"required":true,"options":["Regularly","Occasionally","Once or twice","Never"]},"handoffContents":{"visible":true,"required":true,"options":["Approved design / version","Components","Design tokens / variables","Responsive rules","Interaction states","Form / error states","Assets","Prototype","Accessibility notes","Content","Animation / motion guidance","Technical notes","Developer questions / clarifications"]},"developerHandoffExperience":{"visible":true,"required":true},"clientFeedbackScenario":{"visible":true,"required":true},"availableHoursPerWeek":{"visible":true,"required":true},"preferredWorkWindow":{"visible":true,"required":true},"earliestStartDate":{"visible":true,"required":true},"canMaintainAvailability":{"visible":true,"required":true},"comfortableWithMeetings":{"visible":true,"required":true},"hasLaptopInternet":{"visible":true,"required":true},"structuredReviewAcknowledgement":{"visible":true,"required":true},"assessmentAcknowledgement":{"visible":true,"required":true},"designAcademyAcknowledgement":{"visible":true,"required":true},"projectBasedAcknowledgement":{"visible":true,"required":true},"motivation":{"visible":true,"required":true},"cv":{"visible":true,"required":true},"heardAboutSource":{"visible":true,"required":true},"heardAboutDetail":{"visible":true,"required":false},"consentAccurate":{"visible":true,"required":true},"consentPrivacy":{"visible":true,"required":true}}}'::jsonb as config
), targets as (
  select
    j.id,
    coalesce(j.role_details, '{}'::jsonb) as role_details,
    coalesce(j.role_details->'applicationForm', '{}'::jsonb) as application_form,
    c.config
  from public.career_jobs j
  cross join canonical c
  where coalesce(j.role_details->>'systemRole', '') = 'uiux_designer'
    and (
      j.role_details->'applicationForm'->>'version' is null
      or jsonb_typeof(j.role_details->'applicationForm'->'fieldConfig') is distinct from 'object'
    )
)
update public.career_jobs j
set role_details = jsonb_set(
  t.role_details,
  '{applicationForm}',
  (t.config - 'fieldConfig')
    || t.application_form
    || jsonb_build_object(
      'version', 2,
      'fieldConfig',
      (t.config->'fieldConfig') || coalesce(t.application_form->'fieldConfig', '{}'::jsonb)
    ),
  true
)
from targets t
where j.id = t.id;

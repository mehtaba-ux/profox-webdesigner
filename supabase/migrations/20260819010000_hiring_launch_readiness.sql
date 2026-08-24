-- Hiring Launch Readiness
-- Brand-aligned public offer, required introduction video, candidate-stage notifications,
-- and low-noise Admin recruitment alerts. Existing protected recruitment gates remain authoritative.

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,active,description)
VALUES
('recruitment_application_received','Recruitment — application received','Application received — ProFox','Hi {{fullName}},\n\nThank you for applying for the Independent Commission-Based Sales Representative role at ProFox.\n\nWe received your application and 60–120 second introduction video. Our team will review your communication, sales experience and fit for the role. Shortlisted candidates will be contacted using the details you submitted.\n\nSubmitting an application does not create a ProFox account or grant CRM access.\n\nProFox\nFrom site to system.','true','Sent after a public application with a valid introduction video.'),
('recruitment_video_pending','Recruitment — introduction video pending','Complete your ProFox application: introduction video required','Hi {{fullName}},\n\nWe have your candidate details, but your application is not ready for review until we receive your 60–120 second English introduction video.\n\nPlease cover: your introduction, sales experience, English communication, client dealing and why the ProFox opportunity fits you.\n\nReply with a public or viewable Loom, Google Drive, YouTube unlisted or similar link.\n\nProFox','true','Used only for legacy or Admin-created applicants missing the required video.'),
('recruitment_video_reminder_1','Recruitment — video reminder','Reminder: your ProFox introduction video is still pending','Hi {{fullName}},\n\nYour ProFox sales application is still waiting for the required 60–120 second introduction video. Send a viewable link so we can move your application into review.\n\nIf you no longer want to continue, no action is required.\n\nProFox','true','First reminder for Video Pending candidates.'),
('recruitment_video_reminder_2','Recruitment — final video reminder','Final reminder: complete your ProFox sales application','Hi {{fullName}},\n\nThis is the final reminder that your ProFox sales application is incomplete because the introduction video is still missing.\n\nSend the 60–120 second video link if you would like us to continue reviewing your application.\n\nProFox','true','Final reminder for Video Pending candidates.'),
('recruitment_video_received','Recruitment — video received','Introduction video received — ProFox','Hi {{fullName}},\n\nYour introduction video has been received and your application is now in review. We will contact you if your application moves to the next step.\n\nProFox','true','Sent when a Video Pending candidate moves into Video Review.'),
('recruitment_initial_screening','Recruitment — initial screening','Your ProFox application is moving forward','Hi {{fullName}},\n\nYour introduction video has passed our first review. Your application is moving into initial screening.\n\nWe will review the experience and information you submitted and contact you with the next step if shortlisted.\n\nProFox','true','Sent when the candidate moves to Initial Screening.'),
('recruitment_shortlisted','Recruitment — shortlisted','You have been shortlisted — ProFox','Hi {{fullName}},\n\nYou have been shortlisted for the Independent Commission-Based Sales Representative opportunity at ProFox.\n\nThe next steps assess practical sales judgment, prospect research and readiness to work inside the ProFox sales process. We will send the relevant assessment instructions as your application progresses.\n\nProFox','true','Sent when the candidate is shortlisted.'),
('recruitment_sales_assessment','Recruitment — sales assessment','Next step: ProFox sales assessment','Hi {{fullName}},\n\nYour next step is the ProFox sales assessment. This stage focuses on how you communicate, discover client needs, respond to objections and move a conversation toward a clear next action.\n\nPlease follow the assessment instructions provided by the ProFox recruitment team.\n\nProFox','true','Sent when the candidate enters Sales Assessment.'),
('recruitment_lead_research','Recruitment — lead research test','Next step: ProFox lead research test','Hi {{fullName}},\n\nYou have progressed to the Lead Research Test. This stage checks how you identify and qualify businesses that fit ProFox services before outreach begins.\n\nPlease follow the task instructions provided by the ProFox recruitment team and submit your work in the requested format.\n\nProFox','true','Sent when the candidate enters Lead Research Test.'),
('recruitment_crm_assessment','Recruitment — CRM assessment','Next step: ProFox CRM assessment','Hi {{fullName}},\n\nYou have progressed to the CRM Assessment. This stage checks whether you can keep leads, follow-ups, meetings and next actions clear and accurate inside the ProFox sales workflow.\n\nPlease follow the assessment instructions provided by the recruitment team.\n\nProFox','true','Sent when the candidate enters CRM Assessment.'),
('recruitment_selected','Recruitment — selected','You have been selected to continue with ProFox','Hi {{fullName}},\n\nYou have successfully completed the selection assessments for the ProFox Independent Sales Representative opportunity.\n\nThe next step is the ProFox Independent Sales Partner Agreement. Please review the agreement carefully when it is sent. Training and sales access are granted only after the required agreement and onboarding gates are complete.\n\nProFox','true','Sent when the candidate reaches Selected.'),
('recruitment_agreement_pending','Recruitment — agreement pending','Next step: ProFox Sales Partner Agreement','Hi {{fullName}},\n\nYour application has moved to Agreement Pending. The ProFox Independent Sales Partner Agreement will confirm the commercial model, responsibilities, confidentiality and operating rules for the relationship.\n\nPlease review and sign the agreement when it is sent. Account linking and training access remain blocked until the agreement is signed.\n\nProFox','true','Sent when the candidate moves to Agreement Pending.'),
('recruitment_training','Recruitment — Sales Academy','Welcome to the ProFox Sales Academy','Hi {{fullName}},\n\nYour agreement is confirmed and you are moving into the ProFox Sales Academy.\n\nComplete all required modules, practical reviews and final certification. Training access does not mean active sales access; activation happens only after final approval.\n\nProFox\nFrom site to system.','true','Sent when the candidate begins One-Day Training.'),
('recruitment_final_review','Recruitment — final review','Your ProFox training is in final review','Hi {{fullName}},\n\nYour required training has reached Final Approval. ProFox will review the required evidence, certification results and activation readiness before active sales access is granted.\n\nNo action is required unless the team contacts you for clarification.\n\nProFox','true','Sent when the candidate reaches Final Approval.'),
('recruitment_final_approved','Recruitment — final approval complete','Final approval complete — ProFox','Hi {{fullName}},\n\nYour final approval is complete. Your candidate record is now Ready for System Access.\n\nThe team will complete the final activation step and confirm when your active ProFox sales workspace is ready.\n\nProFox','true','Sent when the candidate reaches Ready for System Access.'),
('recruitment_activated','Recruitment — activated','Welcome to ProFox — your sales access is active','Hi {{fullName}},\n\nYour ProFox sales access is now active.\n\nStart with your Today workspace, keep every lead and follow-up current, and use the Sales Academy as your operating reference. Your access is role-based and your work should stay inside the records assigned to you.\n\nWelcome to ProFox.\nFrom site to system.','true','Sent after secure salesperson activation.'),
('recruitment_not_selected','Recruitment — application closed','Update on your ProFox application','Hi {{fullName}},\n\nThank you for the time you invested in the ProFox recruitment process. We will not be moving your application forward at this stage.\n\nWe appreciate your interest in ProFox and wish you well in your next opportunity.\n\nProFox','true','Respectful candidate-facing closure message; internal refusal reasons are not exposed by default.')
ON CONFLICT(template_key) DO UPDATE SET
  name=EXCLUDED.name,
  subject_template=EXCLUDED.subject_template,
  body_template=EXCLUDED.body_template,
  active=EXCLUDED.active,
  description=EXCLUDED.description,
  updated_at=now();

CREATE OR REPLACE FUNCTION public.recruitment_notification_payload(p_applicant public.applicants)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=public,pg_temp
AS $$
SELECT jsonb_build_object(
  'applicantId',p_applicant.id,
  'fullName',p_applicant.full_name,
  'email',p_applicant.email,
  'country',p_applicant.country,
  'timezone',p_applicant.timezone,
  'roleTitle','Independent Commission-Based Sales Representative',
  'stage',p_applicant.stage,
  'applicationUrl','https://www.profoxwebdesigner.com/careers'
);
$$;

CREATE OR REPLACE FUNCTION public.queue_recruitment_email(
  p_applicant public.applicants,
  p_template_key text,
  p_suffix text,
  p_scheduled_for timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF COALESCE(trim(p_applicant.email),'')='' THEN RETURN NULL; END IF;
  RETURN public.enqueue_notification(
    'recruitment:'||p_applicant.id::text||':'||trim(p_suffix),
    p_template_key,
    p_applicant.email,
    NULL,
    public.recruitment_notification_payload(p_applicant),
    p_scheduled_for
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_recruitment_stage_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_admin record;
  v_template text;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.stage='Video Pending' THEN
      PERFORM public.queue_recruitment_email(NEW,'recruitment_video_pending','video-pending',now());
      PERFORM public.queue_recruitment_email(NEW,'recruitment_video_reminder_1','video-reminder-24h',NEW.created_at+interval '24 hours');
      PERFORM public.queue_recruitment_email(NEW,'recruitment_video_reminder_2','video-reminder-72h',NEW.created_at+interval '72 hours');
    ELSE
      PERFORM public.queue_recruitment_email(NEW,'recruitment_application_received','application-received',now());
    END IF;

    FOR v_admin IN
      SELECT id FROM public.user_profiles WHERE role='admin' AND status='active'
    LOOP
      PERFORM public.enqueue_in_app_notification(
        v_admin.id,
        'Recruitment',
        'New sales application',
        NEW.full_name||' submitted an application for the Independent Sales Representative role.',
        '/admin/app/recruitment',
        'recruitment:new-applicant:'||NEW.id::text||':'||v_admin.id::text
      );
    END LOOP;
    RETURN NEW;
  END IF;

  IF NEW.refusal_reason IS DISTINCT FROM OLD.refusal_reason
     AND COALESCE(trim(NEW.refusal_reason),'')<>'' THEN
    PERFORM public.queue_recruitment_email(NEW,'recruitment_not_selected','not-selected',now());
    RETURN NEW;
  END IF;

  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    v_template:=CASE NEW.stage
      WHEN 'Video Pending' THEN 'recruitment_video_pending'
      WHEN 'Video Review' THEN 'recruitment_video_received'
      WHEN 'Initial Screening' THEN 'recruitment_initial_screening'
      WHEN 'Shortlisted' THEN 'recruitment_shortlisted'
      WHEN 'Sales Assessment' THEN 'recruitment_sales_assessment'
      WHEN 'Lead Research Test' THEN 'recruitment_lead_research'
      WHEN 'CRM Assessment' THEN 'recruitment_crm_assessment'
      WHEN 'Selected' THEN 'recruitment_selected'
      WHEN 'Agreement Pending' THEN 'recruitment_agreement_pending'
      WHEN 'One-Day Training' THEN 'recruitment_training'
      WHEN 'Final Approval' THEN 'recruitment_final_review'
      WHEN 'Ready for System Access' THEN 'recruitment_final_approved'
      WHEN 'Activated' THEN 'recruitment_activated'
      ELSE NULL
    END;

    IF v_template IS NOT NULL THEN
      PERFORM public.queue_recruitment_email(NEW,v_template,'stage-'||lower(replace(NEW.stage,' ','-')),now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_recruitment_stage_notifications ON public.applicants;
CREATE TRIGGER trg_queue_recruitment_stage_notifications
AFTER INSERT OR UPDATE OF stage,refusal_reason ON public.applicants
FOR EACH ROW EXECUTE FUNCTION public.queue_recruitment_stage_notifications();

-- Public applications now require the introduction video that the hiring offer promises.
CREATE OR REPLACE FUNCTION public.submit_public_application(
  p_full_name text,
  p_email text,
  p_phone text DEFAULT '',
  p_country text DEFAULT '',
  p_timezone text DEFAULT 'UTC',
  p_linkedin_url text DEFAULT '',
  p_current_role text DEFAULT '',
  p_sales_experience text DEFAULT '',
  p_digital_sales_experience text DEFAULT '',
  p_international_sales_experience text DEFAULT '',
  p_english_rating text DEFAULT '',
  p_availability text DEFAULT '',
  p_has_laptop_internet boolean DEFAULT true,
  p_comfortable_commission boolean DEFAULT true,
  p_comfortable_sourcing boolean DEFAULT true,
  p_cv_url text DEFAULT '',
  p_video_url text DEFAULT '',
  p_referral_source text DEFAULT '',
  p_message text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_email text:=lower(trim(p_email));
  v_name text:=trim(p_full_name);
  v_video text:=trim(COALESCE(p_video_url,''));
  v_existing uuid;
  v_new uuid;
  v_notes text;
BEGIN
  IF v_name IS NULL OR char_length(v_name)<2 THEN
    RETURN jsonb_build_object('success',false,'error','Please provide a valid full name.');
  END IF;
  IF v_email IS NULL OR v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN jsonb_build_object('success',false,'error','Please provide a valid email address.');
  END IF;
  IF COALESCE(trim(p_country),'')='' THEN
    RETURN jsonb_build_object('success',false,'error','Please provide your country.');
  END IF;
  IF char_length(trim(COALESCE(p_sales_experience,'')))<2 THEN
    RETURN jsonb_build_object('success',false,'error','Please tell us about your sales or business development experience.');
  END IF;
  IF v_video='' OR v_video !~* '^https?://' THEN
    RETURN jsonb_build_object('success',false,'error','A valid shareable link to your 60–120 second introduction video is required.');
  END IF;
  IF p_comfortable_commission IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('success',false,'error','This opportunity is commission-only. Please apply only if this model works for you.');
  END IF;
  IF p_has_laptop_internet IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('success',false,'error','A reliable laptop and internet connection are required for this remote sales role.');
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.user_profiles
    WHERE lower(trim(email))=v_email AND role='sales' AND status='active'
  ) THEN
    RETURN jsonb_build_object('success',false,'duplicate',true,'message','This email is already associated with an active ProFox sales representative account.');
  END IF;

  SELECT id INTO v_existing
  FROM public.applicants
  WHERE lower(trim(email))=v_email
    AND COALESCE(trim(refusal_reason),'')=''
    AND stage<>'Activated'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'duplicate',true,'message','An active application under this email address is already being reviewed by our team.');
  END IF;

  v_notes:=concat_ws(E'\n',
    'Current Role: '||COALESCE(NULLIF(trim(p_current_role),''),'N/A'),
    'Digital/SaaS Exp: '||COALESCE(NULLIF(trim(p_digital_sales_experience),''),'N/A'),
    'International Sales Exp: '||COALESCE(NULLIF(trim(p_international_sales_experience),''),'N/A'),
    'English Rating: '||COALESCE(NULLIF(trim(p_english_rating),''),'N/A'),
    'Availability: '||COALESCE(NULLIF(trim(p_availability),''),'N/A'),
    'Laptop/Internet Ready: Yes',
    'Commission Model Agreed: Yes',
    'Self-Sourcing Ready: '||CASE WHEN p_comfortable_sourcing THEN 'Yes' ELSE 'No' END,
    'Referral Source: '||COALESCE(NULLIF(trim(p_referral_source),''),'ProFox Website'),
    'Message/Motivation: '||COALESCE(NULLIF(trim(p_message),''),'N/A')
  );

  BEGIN
    INSERT INTO public.applicants(
      full_name,email,phone,country,timezone,position,linkedin_url,cv_url,video_url,sales_experience,
      source,stage,notes,agreement_status,onboarding_status,onboarding_progress,final_approval,linked_user_id
    ) VALUES (
      v_name,v_email,COALESCE(p_phone,''),trim(p_country),COALESCE(NULLIF(trim(p_timezone),''),'UTC'),
      'Independent Commission-Based Sales Representative',COALESCE(p_linkedin_url,''),COALESCE(p_cv_url,''),
      v_video,trim(p_sales_experience),'ProFox Website','Video Review',v_notes,
      'not_sent','not_started',0,false,NULL
    ) RETURNING id INTO v_new;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success',false,'duplicate',true,'message','An active application under this email address is already being reviewed by our team.');
  END;

  RETURN jsonb_build_object('success',true,'applicant_id',v_new,'stage','Video Review','message','Application received successfully.');
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_notification_payload(public.applicants) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.queue_recruitment_email(public.applicants,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.queue_recruitment_stage_notifications() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_application(text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,boolean,text,text,text,text) TO anon,authenticated;

-- Bring the live Careers CMS record in line with the approved hiring campaign while keeping it editable.
UPDATE public.content c
SET data=(
  SELECT jsonb_agg(
    CASE WHEN p->>'id'='careers' OR p->>'slug'='careers' THEN
      p || jsonb_build_object(
        'title','Careers at ProFox',
        'heroTitle','Independent Sales Representative',
        'heroSubtitle','Help businesses move from site to system.',
        'bodyContent','A remote, commission-based sales opportunity representing ProFox Web, ProFox Apps and ProFox Flow with businesses in the US, UK, Canada and Australia.',
        'updatedAt','2026-08-19',
        'seo',COALESCE(p->'seo','{}'::jsonb) || jsonb_build_object(
          'metaTitle','Independent Sales Representative | ProFox Careers',
          'metaDescription','Apply for the ProFox Independent Commission-Based Sales Representative role. Remote international sales, transparent commission, structured training and clear activation gates.',
          'ogTitle','Independent Sales Representative | ProFox Careers',
          'ogDescription','Remote international sales with transparent commission, structured assessment and the ProFox Sales Academy.',
          'focusKeyword','independent commission sales representative remote'
        ),
        'careersData',jsonb_build_object(
          'hero',jsonb_build_object(
            'badge','REMOTE · COMMISSION-BASED · INTERNATIONAL SALES',
            'title','Independent Sales Representative',
            'line','Help businesses move from site to system.',
            'description','Represent ProFox with businesses in the US, UK, Canada and Australia. Find qualified prospects, start useful conversations, run discovery calls and close website, application and automation projects.'
          ),
          'role',jsonb_build_object(
            'location','Remote · Worldwide',
            'type','Independent contractor · Commission-only',
            'experience','6+ months sales experience',
            'summary','This role is for salespeople who can work independently, communicate clearly in English and stay consistent from prospect research through follow-up and close.'
          )
        )
      )
    ELSE p END
  )
  FROM jsonb_array_elements(c.data) p
)
WHERE c.id='customPages' AND jsonb_typeof(c.data)='array';

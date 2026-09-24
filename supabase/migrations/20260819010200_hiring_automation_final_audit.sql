-- Final hiring automation audit.
-- Ensures every recruitment stage transition queues an email, Video Pending gets the full reminder sequence,
-- stale Video Pending reminders are cancelled when the candidate progresses/refuses, and the 5-day founder review is queued.

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,active,description)
VALUES (
  'recruitment_admin_incomplete_review',
  'Recruitment — incomplete candidate review',
  'Review incomplete candidate — {{fullName}}',
  'A ProFox sales candidate has remained in Video Pending for 5 days.\n\nCandidate: {{fullName}}\nEmail: {{email}}\nCountry: {{country}}\n\nReview the candidate record and decide whether to follow up, keep waiting, or close the application.\n\nOpen Recruitment: https://www.profoxwebdesigner.com/admin/app/recruitment',
  true,
  'Internal founder/Admin reminder after 5 days in Video Pending. Automatically cancelled if the candidate progresses or is refused.'
)
ON CONFLICT(template_key) DO UPDATE SET
  name=EXCLUDED.name,
  subject_template=EXCLUDED.subject_template,
  body_template=EXCLUDED.body_template,
  active=EXCLUDED.active,
  description=EXCLUDED.description,
  updated_at=now();

CREATE OR REPLACE FUNCTION public.queue_recruitment_admin_email(
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
DECLARE
  v_admin_email text;
BEGIN
  SELECT lower(trim(email)) INTO v_admin_email
  FROM public.user_profiles
  WHERE role='admin' AND status='active' AND COALESCE(trim(email),'')<>''
  ORDER BY CASE WHEN lower(trim(email))='mehtaba@profoxwebdesigner.com' THEN 0 ELSE 1 END,
           created_at ASC,
           id ASC
  LIMIT 1;

  IF COALESCE(v_admin_email,'')='' THEN RETURN NULL; END IF;

  RETURN public.enqueue_notification(
    'recruitment:'||p_applicant.id::text||':'||trim(p_suffix),
    p_template_key,
    v_admin_email,
    NULL,
    public.recruitment_notification_payload(p_applicant),
    p_scheduled_for
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_recruitment_video_pending_followups(
  p_applicant_id uuid,
  p_reason text DEFAULT 'Candidate is no longer waiting for the introduction video.'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.notification_outbox
  SET status='Cancelled',
      last_error=COALESCE(NULLIF(trim(p_reason),''),'Candidate is no longer waiting for the introduction video.'),
      updated_at=now()
  WHERE payload->>'applicantId'=p_applicant_id::text
    AND template_key IN (
      'recruitment_video_reminder_1',
      'recruitment_video_reminder_2',
      'recruitment_admin_incomplete_review'
    )
    AND status IN ('Pending','Retry');
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_recruitment_video_pending_followups(
  p_applicant public.applicants,
  p_cycle text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  PERFORM public.queue_recruitment_email(
    p_applicant,
    'recruitment_video_reminder_1',
    'video-reminder-24h-'||p_cycle,
    now()+interval '24 hours'
  );
  PERFORM public.queue_recruitment_email(
    p_applicant,
    'recruitment_video_reminder_2',
    'video-reminder-72h-'||p_cycle,
    now()+interval '72 hours'
  );
  PERFORM public.queue_recruitment_admin_email(
    p_applicant,
    'recruitment_admin_incomplete_review',
    'review-incomplete-120h-'||p_cycle,
    now()+interval '120 hours'
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
  v_cycle text := md5(clock_timestamp()::text||random()::text||NEW.id::text);
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.stage='Video Pending' THEN
      PERFORM public.queue_recruitment_email(NEW,'recruitment_video_pending','video-pending-'||v_cycle,now());
      PERFORM public.queue_recruitment_video_pending_followups(NEW,v_cycle);
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
    PERFORM public.cancel_recruitment_video_pending_followups(NEW.id,'Candidate application was closed.');
    PERFORM public.queue_recruitment_email(NEW,'recruitment_not_selected','not-selected',now());
    RETURN NEW;
  END IF;

  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    IF OLD.stage='Video Pending' AND NEW.stage<>'Video Pending' THEN
      PERFORM public.cancel_recruitment_video_pending_followups(NEW.id,'Candidate progressed beyond Video Pending.');
    END IF;

    v_template:=CASE NEW.stage
      WHEN 'New Application' THEN 'recruitment_application_received'
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
      PERFORM public.queue_recruitment_email(
        NEW,
        v_template,
        'stage-'||lower(replace(NEW.stage,' ','-'))||'-'||v_cycle,
        now()
      );
    END IF;

    IF NEW.stage='Video Pending' THEN
      PERFORM public.queue_recruitment_video_pending_followups(NEW,v_cycle);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_recruitment_admin_email(public.applicants,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cancel_recruitment_video_pending_followups(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.queue_recruitment_video_pending_followups(public.applicants,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.queue_recruitment_stage_notifications() FROM PUBLIC,anon,authenticated;

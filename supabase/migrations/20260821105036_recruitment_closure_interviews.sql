-- Recruitment closure: reuse ProFox sales_meetings for recruitment interviews.

UPDATE public.system_configuration
SET config_value=jsonb_set(
  config_value,
  '{meetingTypes}',
  CASE
    WHEN coalesce(config_value->'meetingTypes','[]'::jsonb) ? 'Recruitment Interview' THEN coalesce(config_value->'meetingTypes','[]'::jsonb)
    ELSE coalesce(config_value->'meetingTypes','[]'::jsonb) || jsonb_build_array('Recruitment Interview')
  END,
  true
),updated_at=now()
WHERE config_key='meeting_settings';

CREATE TABLE IF NOT EXISTS public.recruitment_interviews(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  stage text NOT NULL,
  meeting_id uuid NOT NULL UNIQUE REFERENCES public.sales_meetings(id) ON DELETE CASCADE,
  interviewer_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  interview_type text NOT NULL DEFAULT 'Recruitment Interview',
  outcome_notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recruitment_interviews_applicant_stage ON public.recruitment_interviews(applicant_id,stage,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_interviews_interviewer ON public.recruitment_interviews(interviewer_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_interviews_created_by ON public.recruitment_interviews(created_by);
ALTER TABLE public.recruitment_interviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recruitment_interviews_admin_all ON public.recruitment_interviews;
CREATE POLICY recruitment_interviews_admin_all ON public.recruitment_interviews FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
REVOKE ALL ON public.recruitment_interviews FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.recruitment_interviews TO authenticated;
GRANT ALL ON public.recruitment_interviews TO service_role;

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,active,description)
VALUES(
 'recruitment_interview_scheduled','Recruitment interview scheduled','Your ProFox recruitment interview is scheduled',
 'Hi {{fullName}},\n\nYour {{interviewStage}} interview with ProFox is scheduled for {{interviewDateTime}} ({{interviewTimezone}}).\n\nMeeting link: {{meetingUrl}}\n\nPlease join from a quiet environment with reliable internet and be ready a few minutes before the scheduled time.\n\nProFox\nFrom site to system.',true,
 'Candidate confirmation for a scheduled recruitment interview.'
),(
 'recruitment_interview_updated','Recruitment interview updated','Update to your ProFox recruitment interview',
 'Hi {{fullName}},\n\nYour {{interviewStage}} interview status is now {{interviewStatus}}.\n\n{{interviewOutcome}}\n\nProFox',true,
 'Candidate update when a recruitment interview is completed, cancelled, rescheduled or marked no show.'
)
ON CONFLICT(template_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_get_recruitment_interviews(p_applicant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_result jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',ri.id,'applicantId',ri.applicant_id,'stage',ri.stage,'meetingId',m.id,
  'interviewerId',ri.interviewer_id,'interviewerName',u.full_name,'interviewType',ri.interview_type,
  'startAt',m.start_at,'endAt',m.end_at,'timezone',m.timezone,'meetingUrl',m.meeting_url,
  'status',m.status,'outcomeNotes',ri.outcome_notes,'createdAt',ri.created_at,'updatedAt',ri.updated_at
 ) ORDER BY m.start_at DESC),'[]'::jsonb) INTO v_result
 FROM public.recruitment_interviews ri
 JOIN public.sales_meetings m ON m.id=ri.meeting_id
 LEFT JOIN public.user_profiles u ON u.id=ri.interviewer_id
 WHERE ri.applicant_id=p_applicant_id;
 RETURN v_result;
END;$$;
REVOKE ALL ON FUNCTION public.admin_get_recruitment_interviews(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_recruitment_interviews(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_schedule_recruitment_interview(
 p_applicant_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_timezone text,p_meeting_url text DEFAULT '',p_interviewer_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_app public.applicants%rowtype;v_policy public.recruitment_stage_policies%rowtype;v_interviewer uuid:=coalesce(p_interviewer_id,auth.uid());v_meeting uuid;v_interview uuid;v_local text;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.'; END IF;
 IF coalesce(trim(v_app.refusal_reason),'')<>'' THEN RAISE EXCEPTION 'Closed candidates cannot be scheduled.'; END IF;
 SELECT * INTO v_policy FROM public.recruitment_stage_policies WHERE job_id=coalesce(v_app.career_job_id,(SELECT id FROM public.career_jobs WHERE application_type='sales_representative' ORDER BY (status='Published') DESC,featured DESC,published_at DESC NULLS LAST LIMIT 1)) AND stage=v_app.stage AND active=true;
 IF NOT FOUND OR v_policy.interview_required IS NOT TRUE THEN RAISE EXCEPTION 'The current stage is not configured to require a recruitment interview.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=v_interviewer AND role='admin' AND status='active') THEN RAISE EXCEPTION 'Interviewer must be an active Admin.'; END IF;
 IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at<=p_start_at OR p_start_at<=now() THEN RAISE EXCEPTION 'Interview must be scheduled for a valid future time.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN RAISE EXCEPTION 'Invalid IANA timezone.'; END IF;
 IF coalesce(trim(p_meeting_url),'')<>'' AND p_meeting_url!~*'^https?://' THEN RAISE EXCEPTION 'Meeting link must begin with http:// or https://.'; END IF;
 INSERT INTO public.sales_meetings(request_key,salesperson_id,meeting_type,title,description,start_at,end_at,timezone,provider,meeting_url,attendee_name,attendee_email,status,created_by)
 VALUES(gen_random_uuid(),v_interviewer,'Recruitment Interview','Recruitment: '||v_app.full_name||' - '||v_app.stage,'ProFox recruitment interview for application '||coalesce(v_app.application_reference,v_app.id::text),p_start_at,p_end_at,p_timezone,'Manual',coalesce(trim(p_meeting_url),''),v_app.full_name,lower(trim(v_app.email)),'Scheduled',auth.uid())
 RETURNING id INTO v_meeting;
 INSERT INTO public.recruitment_interviews(applicant_id,stage,meeting_id,interviewer_id,created_by)
 VALUES(p_applicant_id,v_app.stage,v_meeting,v_interviewer,auth.uid()) RETURNING id INTO v_interview;
 v_local:=to_char(p_start_at AT TIME ZONE p_timezone,'FMDay, FMMonth DD, YYYY at HH12:MI AM');
 PERFORM public.enqueue_notification('recruitment:'||p_applicant_id::text||':interview:'||v_interview::text,'recruitment_interview_scheduled',lower(trim(v_app.email)),NULL,public.recruitment_notification_payload(v_app)||jsonb_build_object('interviewStage',v_app.stage,'interviewDateTime',v_local,'interviewTimezone',p_timezone,'meetingUrl',coalesce(trim(p_meeting_url),'')),now());
 PERFORM public.log_applicant_event(p_applicant_id,'interview','interview_scheduled',v_app.stage||' interview scheduled',v_local||' ('||p_timezone||')',NULL,'Scheduled','admin',auth.uid(),'recruitment_interviews',v_interview,jsonb_build_object('meetingId',v_meeting,'interviewerId',v_interviewer,'startAt',p_start_at,'endAt',p_end_at,'timezone',p_timezone,'meetingUrl',coalesce(trim(p_meeting_url),'')));
 RETURN jsonb_build_object('success',true,'id',v_interview,'meetingId',v_meeting,'stage',v_app.stage,'status','Scheduled','startAt',p_start_at,'endAt',p_end_at,'timezone',p_timezone);
END;$$;
REVOKE ALL ON FUNCTION public.admin_schedule_recruitment_interview(uuid,timestamptz,timestamptz,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_schedule_recruitment_interview(uuid,timestamptz,timestamptz,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_recruitment_interview(p_interview_id uuid,p_status text,p_outcome_notes text DEFAULT '',p_meeting_url text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_row public.recruitment_interviews%rowtype;v_meeting public.sales_meetings%rowtype;v_app public.applicants%rowtype;v_payload jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 IF p_status NOT IN('Scheduled','Completed','Cancelled','No Show','Rescheduled') THEN RAISE EXCEPTION 'Invalid interview status.'; END IF;
 SELECT * INTO v_row FROM public.recruitment_interviews WHERE id=p_interview_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Recruitment interview not found.'; END IF;
 SELECT * INTO v_meeting FROM public.sales_meetings WHERE id=v_row.meeting_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Linked meeting not found.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE id=v_row.applicant_id;
 IF p_meeting_url IS NOT NULL AND trim(p_meeting_url)<>'' AND p_meeting_url!~*'^https?://' THEN RAISE EXCEPTION 'Meeting link must begin with http:// or https://.'; END IF;
 UPDATE public.sales_meetings SET status=p_status,meeting_url=CASE WHEN p_meeting_url IS NULL THEN meeting_url ELSE trim(p_meeting_url) END,outcome=CASE WHEN p_status IN('Completed','No Show') THEN left(coalesce(p_outcome_notes,''),5000) ELSE outcome END,completed_at=CASE WHEN p_status='Completed' THEN now() ELSE completed_at END,cancelled_at=CASE WHEN p_status='Cancelled' THEN now() ELSE cancelled_at END,rescheduled_at=CASE WHEN p_status='Rescheduled' THEN now() ELSE rescheduled_at END,updated_at=now() WHERE id=v_meeting.id;
 UPDATE public.recruitment_interviews SET outcome_notes=left(coalesce(p_outcome_notes,''),10000),updated_at=now() WHERE id=p_interview_id;
 v_payload:=public.recruitment_notification_payload(v_app)||jsonb_build_object('interviewStage',v_row.stage,'interviewStatus',p_status,'interviewOutcome',CASE WHEN trim(coalesce(p_outcome_notes,''))='' THEN 'The recruitment team will contact you if any further action is required.' ELSE left(trim(p_outcome_notes),1500) END);
 IF p_status IN('Cancelled','Rescheduled') THEN PERFORM public.enqueue_notification('recruitment:'||v_app.id::text||':interview-update:'||v_row.id::text||':'||lower(replace(p_status,' ','-')),'recruitment_interview_updated',lower(trim(v_app.email)),NULL,v_payload,now()); END IF;
 PERFORM public.log_applicant_event(v_app.id,'interview','interview_status_updated',v_row.stage||' interview updated',left(coalesce(p_outcome_notes,''),2000),v_meeting.status,p_status,'admin',auth.uid(),'recruitment_interviews',v_row.id,jsonb_build_object('meetingId',v_meeting.id,'status',p_status));
 RETURN jsonb_build_object('success',true,'id',v_row.id,'meetingId',v_meeting.id,'status',p_status);
END;$$;
REVOKE ALL ON FUNCTION public.admin_update_recruitment_interview(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_update_recruitment_interview(uuid,text,text,text) TO authenticated;

-- Interview-required stages cannot be passed without a completed linked interview.
CREATE OR REPLACE FUNCTION public.admin_record_recruitment_assessment(p_applicant_id uuid,p_stage text,p_status text,p_score integer,p_rubric_scores jsonb DEFAULT '{}'::jsonb,p_critical_failures jsonb DEFAULT '[]'::jsonb,p_evidence text DEFAULT '',p_evidence_url text DEFAULT '',p_notes text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_app public.applicants%rowtype;v_policy public.recruitment_stage_policies%rowtype;v_attempt integer;v_id uuid;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.'; END IF;
 IF coalesce(trim(v_app.refusal_reason),'')<>'' THEN RAISE EXCEPTION 'Closed candidates cannot receive new assessments.'; END IF;
 IF v_app.stage<>p_stage THEN RAISE EXCEPTION 'Assessment must be recorded for the candidate current stage: %.',v_app.stage; END IF;
 SELECT * INTO v_policy FROM public.recruitment_stage_policies WHERE job_id=coalesce(v_app.career_job_id,(SELECT id FROM public.career_jobs WHERE application_type='sales_representative' ORDER BY (status='Published') DESC,featured DESC,published_at DESC NULLS LAST LIMIT 1)) AND stage=p_stage AND active=true;
 IF NOT FOUND OR NOT v_policy.assessment_required THEN RAISE EXCEPTION 'This stage is not configured as a structured assessment stage.'; END IF;
 IF p_status NOT IN('Passed','Failed','Retry Required') THEN RAISE EXCEPTION 'Assessment status must be Passed, Failed or Retry Required.'; END IF;
 IF p_score IS NULL OR p_score<0 OR p_score>100 THEN RAISE EXCEPTION 'Assessment score must be between 0 and 100.'; END IF;
 IF p_status='Passed' AND p_score<coalesce(v_policy.passing_score,0) THEN RAISE EXCEPTION 'Passed assessment score must meet the configured passing score of %.',v_policy.passing_score; END IF;
 IF p_status='Passed' AND jsonb_array_length(coalesce(p_critical_failures,'[]'::jsonb))>0 THEN RAISE EXCEPTION 'An assessment with critical failures cannot be passed.'; END IF;
 IF p_status='Passed' AND v_policy.interview_required AND NOT EXISTS(
   SELECT 1 FROM public.recruitment_interviews ri JOIN public.sales_meetings m ON m.id=ri.meeting_id
   WHERE ri.applicant_id=p_applicant_id AND ri.stage=p_stage AND m.status='Completed'
 ) THEN RAISE EXCEPTION 'Complete the required % interview before marking this assessment Passed.',p_stage; END IF;
 IF jsonb_typeof(coalesce(p_rubric_scores,'{}'::jsonb))<>'object' OR jsonb_typeof(coalesce(p_critical_failures,'[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'Invalid assessment evidence format.'; END IF;
 SELECT coalesce(max(attempt_no),0)+1 INTO v_attempt FROM public.recruitment_assessments WHERE applicant_id=p_applicant_id AND stage=p_stage;
 INSERT INTO public.recruitment_assessments(applicant_id,job_id,stage,attempt_no,status,score,passing_score_snapshot,rubric_snapshot,rubric_scores,critical_failures,evidence,evidence_url,evaluator_notes,evaluator_id,evaluated_at)
 VALUES(p_applicant_id,v_app.career_job_id,p_stage,v_attempt,p_status,p_score,v_policy.passing_score,v_policy.rubric,coalesce(p_rubric_scores,'{}'::jsonb),coalesce(p_critical_failures,'[]'::jsonb),left(coalesce(p_evidence,''),10000),left(coalesce(p_evidence_url,''),2000),left(coalesce(p_notes,''),10000),auth.uid(),now()) RETURNING id INTO v_id;
 PERFORM public.log_applicant_event(p_applicant_id,'assessment','assessment_recorded',p_stage||' assessment recorded',coalesce(nullif(trim(p_notes),''),'Structured recruitment assessment recorded.'),NULL,p_status,'admin',auth.uid(),'recruitment_assessments',v_id,jsonb_build_object('stage',p_stage,'attemptNo',v_attempt,'score',p_score,'passingScore',v_policy.passing_score,'criticalFailures',coalesce(p_critical_failures,'[]'::jsonb)));
 RETURN jsonb_build_object('success',true,'id',v_id,'attemptNo',v_attempt,'status',p_status,'score',p_score,'passingScore',v_policy.passing_score);
END;$$;
REVOKE ALL ON FUNCTION public.admin_record_recruitment_assessment(uuid,text,text,integer,jsonb,jsonb,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_record_recruitment_assessment(uuid,text,text,integer,jsonb,jsonb,text,text,text) TO authenticated;

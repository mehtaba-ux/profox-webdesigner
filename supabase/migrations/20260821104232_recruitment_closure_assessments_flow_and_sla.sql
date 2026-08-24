-- Recruitment closure: structured assessment evidence, guarded progression, access revocation and SLA

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS career_job_id uuid REFERENCES public.career_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

UPDATE public.applicants a
SET career_job_id = j.id
FROM LATERAL (
  SELECT id FROM public.career_jobs
  WHERE application_type='sales_representative'
  ORDER BY (status='Published') DESC, featured DESC, published_at DESC NULLS LAST, created_at DESC
  LIMIT 1
) j
WHERE a.career_job_id IS NULL
  AND lower(coalesce(a.position,'')) LIKE '%sales%';

UPDATE public.applicants
SET stage_entered_at = COALESCE(application_submitted_at, created_at, now())
WHERE stage_entered_at IS NULL OR stage_entered_at > now() + interval '5 minutes';

CREATE INDEX IF NOT EXISTS idx_applicants_career_job ON public.applicants(career_job_id);
CREATE INDEX IF NOT EXISTS idx_applicants_stage_sla ON public.applicants(stage, stage_entered_at) WHERE refusal_reason IS NULL;
CREATE INDEX IF NOT EXISTS idx_applicants_closed_by ON public.applicants(closed_by) WHERE closed_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.recruitment_stage_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.career_jobs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  sort_order integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  assessment_required boolean NOT NULL DEFAULT false,
  passing_score integer,
  sla_hours integer NOT NULL DEFAULT 0,
  interview_required boolean NOT NULL DEFAULT false,
  rubric jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recruitment_stage_policy_unique UNIQUE(job_id,stage),
  CONSTRAINT recruitment_stage_policy_score_check CHECK (passing_score IS NULL OR passing_score BETWEEN 0 AND 100),
  CONSTRAINT recruitment_stage_policy_sla_check CHECK (sla_hours BETWEEN 0 AND 720),
  CONSTRAINT recruitment_stage_policy_rubric_check CHECK (jsonb_typeof(rubric)='array')
);

CREATE INDEX IF NOT EXISTS idx_recruitment_stage_policies_job_order ON public.recruitment_stage_policies(job_id,sort_order);
CREATE INDEX IF NOT EXISTS idx_recruitment_stage_policies_updated_by ON public.recruitment_stage_policies(updated_by) WHERE updated_by IS NOT NULL;
ALTER TABLE public.recruitment_stage_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recruitment_stage_policies_admin_all ON public.recruitment_stage_policies;
CREATE POLICY recruitment_stage_policies_admin_all ON public.recruitment_stage_policies FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.recruitment_stage_policies FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.recruitment_stage_policies TO authenticated;
GRANT ALL ON public.recruitment_stage_policies TO service_role;

CREATE TABLE IF NOT EXISTS public.recruitment_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.career_jobs(id) ON DELETE SET NULL,
  stage text NOT NULL,
  attempt_no integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Passed','Failed','Retry Required')),
  score integer CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  passing_score_snapshot integer CHECK (passing_score_snapshot IS NULL OR passing_score_snapshot BETWEEN 0 AND 100),
  rubric_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rubric_snapshot)='array'),
  rubric_scores jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rubric_scores)='object'),
  critical_failures jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(critical_failures)='array'),
  evidence text NOT NULL DEFAULT '',
  evidence_url text NOT NULL DEFAULT '',
  evaluator_notes text NOT NULL DEFAULT '',
  evaluator_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  evaluated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recruitment_assessment_attempt_unique UNIQUE(applicant_id,stage,attempt_no),
  CONSTRAINT recruitment_assessment_attempt_check CHECK (attempt_no > 0)
);

CREATE INDEX IF NOT EXISTS idx_recruitment_assessments_applicant_stage ON public.recruitment_assessments(applicant_id,stage,attempt_no DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_assessments_evaluator ON public.recruitment_assessments(evaluator_id) WHERE evaluator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recruitment_assessments_job ON public.recruitment_assessments(job_id) WHERE job_id IS NOT NULL;
ALTER TABLE public.recruitment_assessments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recruitment_assessments_admin_all ON public.recruitment_assessments;
CREATE POLICY recruitment_assessments_admin_all ON public.recruitment_assessments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.recruitment_assessments FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.recruitment_assessments TO authenticated;
GRANT ALL ON public.recruitment_assessments TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_stage_rank(p_stage text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
SELECT CASE p_stage
 WHEN 'New Application' THEN 1 WHEN 'Video Pending' THEN 2 WHEN 'Video Review' THEN 3
 WHEN 'Initial Screening' THEN 4 WHEN 'Shortlisted' THEN 5 WHEN 'Sales Assessment' THEN 6
 WHEN 'Lead Research Test' THEN 7 WHEN 'CRM Assessment' THEN 8 WHEN 'Selected' THEN 9
 WHEN 'Agreement Pending' THEN 10 WHEN 'One-Day Training' THEN 11 WHEN 'Final Approval' THEN 12
 WHEN 'Ready for System Access' THEN 13 WHEN 'Activated' THEN 14 ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.recruitment_next_stage(p_stage text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
SELECT CASE p_stage
 WHEN 'New Application' THEN 'Video Pending'
 WHEN 'Video Pending' THEN 'Video Review'
 WHEN 'Video Review' THEN 'Initial Screening'
 WHEN 'Initial Screening' THEN 'Shortlisted'
 WHEN 'Shortlisted' THEN 'Sales Assessment'
 WHEN 'Sales Assessment' THEN 'Lead Research Test'
 WHEN 'Lead Research Test' THEN 'CRM Assessment'
 WHEN 'CRM Assessment' THEN 'Selected'
 WHEN 'Selected' THEN 'Agreement Pending'
 WHEN 'Agreement Pending' THEN 'One-Day Training'
 WHEN 'One-Day Training' THEN 'Final Approval'
 WHEN 'Final Approval' THEN 'Ready for System Access'
 WHEN 'Ready for System Access' THEN 'Activated'
 ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.recruitment_latest_assessment_passed(p_applicant_id uuid,p_stage text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public','pg_temp' AS $$
SELECT EXISTS(
 SELECT 1 FROM public.recruitment_assessments a
 WHERE a.applicant_id=p_applicant_id AND a.stage=p_stage AND a.status='Passed'
 ORDER BY a.attempt_no DESC LIMIT 1
);
$$;

REVOKE ALL ON FUNCTION public.recruitment_latest_assessment_passed(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_latest_assessment_passed(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.track_applicant_stage_entered_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
BEGIN
 IF NEW.stage IS DISTINCT FROM OLD.stage THEN NEW.stage_entered_at:=clock_timestamp(); END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_track_applicant_stage_entered_at ON public.applicants;
CREATE TRIGGER trg_track_applicant_stage_entered_at BEFORE UPDATE OF stage ON public.applicants FOR EACH ROW EXECUTE FUNCTION public.track_applicant_stage_entered_at();

CREATE OR REPLACE FUNCTION public.protect_recruitment_stage_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE
 v_flow text:=coalesce(current_setting('profox.recruitment_stage_rpc',true),'');
 v_agreement text:=coalesce(current_setting('profox.agreement_issue_stage',true),'');
 v_final text:=coalesce(current_setting('profox.final_approval_rpc',true),'');
 v_activation text:=coalesce(current_setting('profox.sales_activation_rpc',true),'');
BEGIN
 IF NEW.stage IS DISTINCT FROM OLD.stage AND v_flow<>'1' AND v_agreement<>'1' AND v_final<>'1' AND v_activation<>'1' THEN
   RAISE EXCEPTION 'Recruitment stage changes must use the protected recruitment workflow.';
 END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_protect_recruitment_stage_update ON public.applicants;
CREATE TRIGGER trg_protect_recruitment_stage_update BEFORE UPDATE OF stage ON public.applicants FOR EACH ROW EXECUTE FUNCTION public.protect_recruitment_stage_update();

CREATE OR REPLACE FUNCTION public.protect_recruitment_refusal_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_close text:=coalesce(current_setting('profox.recruitment_close_rpc',true),'');
BEGIN
 IF NEW.refusal_reason IS DISTINCT FROM OLD.refusal_reason AND v_close<>'1' THEN
   RAISE EXCEPTION 'Candidate closure must use the protected recruitment close workflow.';
 END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_protect_recruitment_refusal_update ON public.applicants;
CREATE TRIGGER trg_protect_recruitment_refusal_update BEFORE UPDATE OF refusal_reason ON public.applicants FOR EACH ROW EXECUTE FUNCTION public.protect_recruitment_refusal_update();

CREATE OR REPLACE FUNCTION public.admin_get_recruitment_stage_policies(p_job_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_job uuid; v_result jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 v_job:=p_job_id;
 IF v_job IS NULL THEN SELECT id INTO v_job FROM public.career_jobs WHERE application_type='sales_representative' ORDER BY (status='Published') DESC,featured DESC,published_at DESC NULLS LAST,created_at DESC LIMIT 1; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'jobId',job_id,'stage',stage,'sortOrder',sort_order,'active',active,'assessmentRequired',assessment_required,'passingScore',passing_score,'slaHours',sla_hours,'interviewRequired',interview_required,'rubric',rubric,'updatedAt',updated_at) ORDER BY sort_order),'[]'::jsonb)
 INTO v_result FROM public.recruitment_stage_policies WHERE job_id=v_job;
 RETURN v_result;
END;$$;
GRANT EXECUTE ON FUNCTION public.admin_get_recruitment_stage_policies(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_recruitment_stage_policy(p_job_id uuid,p_stage text,p_assessment_required boolean,p_passing_score integer,p_sla_hours integer,p_interview_required boolean,p_rubric jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_rank integer; v_row public.recruitment_stage_policies%rowtype;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 v_rank:=public.recruitment_stage_rank(p_stage); IF v_rank IS NULL THEN RAISE EXCEPTION 'Invalid recruitment stage.'; END IF;
 IF p_assessment_required AND (p_passing_score IS NULL OR p_passing_score<0 OR p_passing_score>100) THEN RAISE EXCEPTION 'Assessment stages require a passing score from 0 to 100.'; END IF;
 IF p_sla_hours<0 OR p_sla_hours>720 THEN RAISE EXCEPTION 'SLA hours must be between 0 and 720.'; END IF;
 IF jsonb_typeof(coalesce(p_rubric,'[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'Rubric must be an array.'; END IF;
 INSERT INTO public.recruitment_stage_policies(job_id,stage,sort_order,active,assessment_required,passing_score,sla_hours,interview_required,rubric,updated_by,updated_at)
 VALUES(p_job_id,p_stage,v_rank,true,coalesce(p_assessment_required,false),CASE WHEN p_assessment_required THEN p_passing_score ELSE NULL END,p_sla_hours,coalesce(p_interview_required,false),coalesce(p_rubric,'[]'::jsonb),auth.uid(),now())
 ON CONFLICT(job_id,stage) DO UPDATE SET sort_order=excluded.sort_order,active=true,assessment_required=excluded.assessment_required,passing_score=excluded.passing_score,sla_hours=excluded.sla_hours,interview_required=excluded.interview_required,rubric=excluded.rubric,updated_by=auth.uid(),updated_at=now()
 RETURNING * INTO v_row;
 RETURN jsonb_build_object('success',true,'stage',v_row.stage,'assessmentRequired',v_row.assessment_required,'passingScore',v_row.passing_score,'slaHours',v_row.sla_hours,'interviewRequired',v_row.interview_required,'rubric',v_row.rubric,'updatedAt',v_row.updated_at);
END;$$;
GRANT EXECUTE ON FUNCTION public.admin_save_recruitment_stage_policy(uuid,text,boolean,integer,integer,boolean,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_recruitment_assessments(p_applicant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_result jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'applicantId',a.applicant_id,'jobId',a.job_id,'stage',a.stage,'attemptNo',a.attempt_no,'status',a.status,'score',a.score,'passingScore',a.passing_score_snapshot,'rubric',a.rubric_snapshot,'rubricScores',a.rubric_scores,'criticalFailures',a.critical_failures,'evidence',a.evidence,'evidenceUrl',a.evidence_url,'evaluatorNotes',a.evaluator_notes,'evaluatorId',a.evaluator_id,'evaluatorName',u.full_name,'evaluatedAt',a.evaluated_at,'createdAt',a.created_at,'updatedAt',a.updated_at) ORDER BY a.created_at DESC),'[]'::jsonb)
 INTO v_result FROM public.recruitment_assessments a LEFT JOIN public.user_profiles u ON u.id=a.evaluator_id WHERE a.applicant_id=p_applicant_id;
 RETURN v_result;
END;$$;
GRANT EXECUTE ON FUNCTION public.admin_get_recruitment_assessments(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_record_recruitment_assessment(p_applicant_id uuid,p_stage text,p_status text,p_score integer,p_rubric_scores jsonb DEFAULT '{}'::jsonb,p_critical_failures jsonb DEFAULT '[]'::jsonb,p_evidence text DEFAULT '',p_evidence_url text DEFAULT '',p_notes text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_app public.applicants%rowtype; v_policy public.recruitment_stage_policies%rowtype; v_attempt integer; v_id uuid;
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
 IF jsonb_typeof(coalesce(p_rubric_scores,'{}'::jsonb))<>'object' OR jsonb_typeof(coalesce(p_critical_failures,'[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'Invalid assessment evidence format.'; END IF;
 SELECT coalesce(max(attempt_no),0)+1 INTO v_attempt FROM public.recruitment_assessments WHERE applicant_id=p_applicant_id AND stage=p_stage;
 INSERT INTO public.recruitment_assessments(applicant_id,job_id,stage,attempt_no,status,score,passing_score_snapshot,rubric_snapshot,rubric_scores,critical_failures,evidence,evidence_url,evaluator_notes,evaluator_id,evaluated_at)
 VALUES(p_applicant_id,v_app.career_job_id,p_stage,v_attempt,p_status,p_score,v_policy.passing_score,v_policy.rubric,coalesce(p_rubric_scores,'{}'::jsonb),coalesce(p_critical_failures,'[]'::jsonb),left(coalesce(p_evidence,''),10000),left(coalesce(p_evidence_url,''),2000),left(coalesce(p_notes,''),10000),auth.uid(),now()) RETURNING id INTO v_id;
 PERFORM public.log_applicant_event(p_applicant_id,'assessment','assessment_recorded',p_stage||' assessment recorded',coalesce(nullif(trim(p_notes),''),'Structured recruitment assessment recorded.'),NULL,p_status,'admin',auth.uid(),'recruitment_assessments',v_id,jsonb_build_object('stage',p_stage,'attemptNo',v_attempt,'score',p_score,'passingScore',v_policy.passing_score,'criticalFailures',coalesce(p_critical_failures,'[]'::jsonb)));
 RETURN jsonb_build_object('success',true,'id',v_id,'attemptNo',v_attempt,'status',p_status,'score',p_score,'passingScore',v_policy.passing_score);
END;$$;
GRANT EXECUTE ON FUNCTION public.admin_record_recruitment_assessment(uuid,text,text,integer,jsonb,jsonb,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_advance_applicant_stage(p_applicant_id uuid,p_target_stage text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_app public.applicants%rowtype; v_target text; v_policy public.recruitment_stage_policies%rowtype;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.'; END IF;
 IF coalesce(trim(v_app.refusal_reason),'')<>'' THEN RAISE EXCEPTION 'Closed candidates cannot progress.'; END IF;
 v_target:=coalesce(p_target_stage,public.recruitment_next_stage(v_app.stage)); IF v_target IS NULL THEN RAISE EXCEPTION 'No next stage is available.'; END IF;
 IF public.recruitment_stage_rank(v_target)<>public.recruitment_stage_rank(v_app.stage)+1 THEN RAISE EXCEPTION 'Recruitment stages must progress sequentially. Use documented Admin Override only for exceptional pre-agreement corrections.'; END IF;
 IF v_app.stage='New Application' AND v_target='Video Pending' AND (coalesce(v_app.video_url,'')<>'' OR coalesce(v_app.video_storage_path,'')<>'') THEN v_target:='Video Review'; END IF;
 IF v_app.stage='Video Pending' AND v_target='Video Review' AND coalesce(v_app.video_url,'')='' AND coalesce(v_app.video_storage_path,'')='' THEN RAISE EXCEPTION 'Introduction video is required before Video Review.'; END IF;
 SELECT * INTO v_policy FROM public.recruitment_stage_policies WHERE job_id=coalesce(v_app.career_job_id,(SELECT id FROM public.career_jobs WHERE application_type='sales_representative' ORDER BY (status='Published') DESC,featured DESC,published_at DESC NULLS LAST LIMIT 1)) AND stage=v_app.stage AND active=true;
 IF FOUND AND v_policy.assessment_required AND NOT public.recruitment_latest_assessment_passed(v_app.id,v_app.stage) THEN RAISE EXCEPTION 'A passed structured assessment for % is required before progression.',v_app.stage; END IF;
 IF v_app.stage='Selected' THEN RAISE EXCEPTION 'Issue the Sales Partner Agreement to move a Selected candidate into Agreement Pending.'; END IF;
 IF v_app.stage='Agreement Pending' THEN RAISE EXCEPTION 'Signed agreement and protected account linking are required to enter Sales Academy.'; END IF;
 IF v_app.stage='One-Day Training' THEN RAISE EXCEPTION 'The candidate must request Final Approval through the protected Sales Academy workflow.'; END IF;
 IF v_app.stage='Final Approval' THEN RAISE EXCEPTION 'Use the protected Final Approval action.'; END IF;
 IF v_app.stage='Ready for System Access' THEN RAISE EXCEPTION 'Use protected Sales activation.'; END IF;
 PERFORM set_config('profox.recruitment_stage_rpc','1',true);
 UPDATE public.applicants SET stage=v_target,updated_at=now() WHERE id=v_app.id;
 RETURN jsonb_build_object('success',true,'fromStage',v_app.stage,'toStage',v_target);
END;$$;
GRANT EXECUTE ON FUNCTION public.admin_advance_applicant_stage(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_override_applicant_stage(p_applicant_id uuid,p_target_stage text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_app public.applicants%rowtype; v_from_rank int; v_to_rank int;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 IF length(trim(coalesce(p_reason,'')))<12 THEN RAISE EXCEPTION 'A specific override reason of at least 12 characters is required.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.'; END IF;
 IF coalesce(trim(v_app.refusal_reason),'')<>'' THEN RAISE EXCEPTION 'Closed candidates cannot be moved.'; END IF;
 v_from_rank:=public.recruitment_stage_rank(v_app.stage); v_to_rank:=public.recruitment_stage_rank(p_target_stage);
 IF v_to_rank IS NULL THEN RAISE EXCEPTION 'Invalid target stage.'; END IF;
 IF v_from_rank>=10 OR v_to_rank>=10 THEN RAISE EXCEPTION 'Admin Override cannot bypass Agreement, Academy, Final Approval or activation gates.'; END IF;
 PERFORM set_config('profox.recruitment_stage_rpc','1',true);
 UPDATE public.applicants SET stage=p_target_stage,updated_at=now() WHERE id=p_applicant_id;
 PERFORM public.log_applicant_event(p_applicant_id,'recruitment','stage_override','Recruitment stage overridden',left(trim(p_reason),2000),v_app.stage,p_target_stage,'admin',auth.uid(),'applicants',p_applicant_id,jsonb_build_object('reason',left(trim(p_reason),2000)));
 RETURN jsonb_build_object('success',true,'fromStage',v_app.stage,'toStage',p_target_stage,'override',true);
END;$$;
GRANT EXECUTE ON FUNCTION public.admin_override_applicant_stage(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_close_applicant(p_applicant_id uuid,p_reason text,p_notes text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_app public.applicants%rowtype; v_profile public.user_profiles%rowtype; v_cancelled int:=0;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 IF length(trim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'Closure reason is required.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.'; END IF;
 IF v_app.stage='Activated' THEN RAISE EXCEPTION 'Activated sales staff must be deactivated through Team & Users, not recruitment closure.'; END IF;
 IF coalesce(trim(v_app.refusal_reason),'')<>'' THEN RETURN jsonb_build_object('success',true,'alreadyClosed',true,'reason',v_app.refusal_reason); END IF;
 PERFORM set_config('profox.recruitment_close_rpc','1',true);
 UPDATE public.applicants SET refusal_reason=trim(p_reason),closed_at=now(),closed_by=auth.uid(),onboarding_status=CASE WHEN linked_user_id IS NULL THEN onboarding_status ELSE 'failed' END,updated_at=now() WHERE id=p_applicant_id;
 IF v_app.linked_user_id IS NOT NULL THEN
   SELECT * INTO v_profile FROM public.user_profiles WHERE id=v_app.linked_user_id FOR UPDATE;
   IF FOUND AND v_profile.status IN('pending','onboarding') THEN
     UPDATE public.user_profiles SET status='inactive',onboarding_status='failed',updated_at=now() WHERE id=v_profile.id;
     PERFORM public.log_applicant_event(p_applicant_id,'account','onboarding_access_revoked','Onboarding access revoked',coalesce(nullif(trim(p_notes),''),'Candidate was closed before activation.'),v_profile.status,'inactive','admin',auth.uid(),'user_profiles',v_profile.id,jsonb_build_object('reason',trim(p_reason)));
   END IF;
 END IF;
 UPDATE public.notification_outbox SET status='Cancelled',last_error='Candidate recruitment workflow was closed.',updated_at=now()
 WHERE payload->>'applicantId'=p_applicant_id::text AND status IN('Pending','Retry') AND template_key<>'recruitment_not_selected';
 GET DIAGNOSTICS v_cancelled=ROW_COUNT;
 RETURN jsonb_build_object('success',true,'reason',trim(p_reason),'accessRevoked',v_app.linked_user_id IS NOT NULL,'notificationsCancelled',v_cancelled);
END;$$;
GRANT EXECUTE ON FUNCTION public.admin_close_applicant(uuid,text,text) TO authenticated;

-- Existing protected account linking now declares the trusted stage transition context.
CREATE OR REPLACE FUNCTION public.link_sales_candidate_account(p_applicant_id uuid,p_target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_app public.applicants%ROWTYPE;v_profile public.user_profiles%ROWTYPE;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: only an active Admin may link a candidate account.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.'; END IF;
 IF coalesce(trim(v_app.refusal_reason),'')<>'' THEN RAISE EXCEPTION 'A refused candidate cannot be linked for onboarding.'; END IF;
 IF v_app.stage NOT IN('Selected','Agreement Pending','One-Day Training','Final Approval','Ready for System Access') THEN RAISE EXCEPTION 'Candidate must be selected before an onboarding account can be linked.'; END IF;
 IF lower(coalesce(v_app.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'Signed sales agreement is required before training access is granted.'; END IF;
 SELECT * INTO v_profile FROM public.user_profiles WHERE id=p_target_user_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found.'; END IF;
 IF lower(trim(coalesce(v_profile.email,'')))<>lower(trim(coalesce(v_app.email,''))) THEN RAISE EXCEPTION 'Candidate email must exactly match the linked system account.'; END IF;
 IF v_profile.role='admin' THEN RAISE EXCEPTION 'An Admin account cannot be linked as a sales trainee.'; END IF;
 IF EXISTS(SELECT 1 FROM public.applicants a WHERE a.linked_user_id=p_target_user_id AND a.id<>p_applicant_id AND a.stage<>'Activated') THEN RAISE EXCEPTION 'This system account is already linked to another active candidate record.'; END IF;
 PERFORM set_config('profox.recruitment_stage_rpc','1',true);
 UPDATE public.applicants SET linked_user_id=p_target_user_id,stage=CASE WHEN stage IN('Selected','Agreement Pending') THEN 'One-Day Training' ELSE stage END,onboarding_status=CASE WHEN onboarding_status='completed' THEN onboarding_status ELSE 'in_progress' END,updated_at=now() WHERE id=p_applicant_id;
 UPDATE public.user_profiles SET full_name=coalesce(nullif(trim(v_app.full_name),''),full_name),phone=coalesce(nullif(trim(v_app.phone),''),phone),country=coalesce(nullif(trim(v_app.country),''),country),timezone=coalesce(nullif(trim(v_app.timezone),''),timezone),role='sales',department='Sales',status='onboarding',onboarding_status='in_progress',onboarding_progress=least(coalesce(onboarding_progress,0),99),updated_at=now() WHERE id=p_target_user_id;
END;$$;

-- Existing learner request now declares the trusted stage transition context.
CREATE OR REPLACE FUNCTION public.request_sales_final_approval()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_app public.applicants%rowtype;v_final public.user_training_progress%rowtype;v_final_module public.training_modules%rowtype;v_missing_prior int;v_missing_prior_reviews int;v_review public.training_reviews%rowtype;v_session public.final_certification_sessions%rowtype;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE linked_user_id=auth.uid() ORDER BY created_at DESC LIMIT 1 FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Linked sales candidate record not found.'; END IF;
 IF v_app.stage='Final Approval' THEN RETURN; END IF; IF v_app.stage<>'One-Day Training' THEN RAISE EXCEPTION 'Candidate must be in One-Day Training before requesting Final Approval.'; END IF; IF lower(coalesce(v_app.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'Signed sales agreement is required.'; END IF;
 SELECT * INTO v_final_module FROM public.training_modules WHERE slug='final-certification' AND active=true; IF NOT FOUND THEN RAISE EXCEPTION 'Final Certification module is unavailable.'; END IF;
 SELECT * INTO v_final FROM public.user_training_progress WHERE user_id=auth.uid() AND module_id=v_final_module.id FOR UPDATE; IF NOT FOUND OR v_final.status<>'Passed' OR coalesce(v_final.score,0)<coalesce(v_final_module.passing_score,90) THEN RAISE EXCEPTION 'Pass the complete Module 20 capstone, including the live Management certification, before requesting Final Approval.'; END IF;
 SELECT * INTO v_review FROM public.training_reviews WHERE progress_id=v_final.id ORDER BY created_at DESC,id DESC LIMIT 1; IF NOT FOUND OR v_review.status<>'Passed' OR v_review.reviewer_id IS NULL OR coalesce(v_review.score,0)<coalesce(v_final_module.passing_score,90) THEN RAISE EXCEPTION 'Final Certification requires a passing Management live review.'; END IF;
 SELECT * INTO v_session FROM public.final_certification_sessions WHERE progress_id=v_final.id AND status='passed' ORDER BY attempt_no DESC LIMIT 1; IF NOT FOUND OR coalesce(v_session.score,0)<coalesce(v_final_module.passing_score,90) OR jsonb_array_length(coalesce(v_session.critical_failures,'[]'::jsonb))>0 THEN RAISE EXCEPTION 'A passing live capstone with zero critical failures is required.'; END IF;
 SELECT count(*) INTO v_missing_prior FROM public.training_modules m WHERE m.active=true AND m.required=true AND m.sort_order<v_final_module.sort_order AND NOT EXISTS(SELECT 1 FROM public.user_training_progress p WHERE p.user_id=auth.uid() AND p.module_id=m.id AND p.status IN('Passed','Completed') AND (m.passing_score IS NULL OR coalesce(p.score,0)>=m.passing_score)); IF v_missing_prior>0 THEN RAISE EXCEPTION 'All previous required modules must be complete before Final Approval. Missing: %',v_missing_prior; END IF;
 SELECT count(*) INTO v_missing_prior_reviews FROM public.training_modules m WHERE m.active=true AND m.requires_admin_review=true AND m.sort_order<v_final_module.sort_order AND NOT EXISTS(SELECT 1 FROM public.user_training_progress p JOIN LATERAL(SELECT tr.status,tr.reviewer_id FROM public.training_reviews tr WHERE tr.progress_id=p.id ORDER BY tr.created_at DESC,tr.id DESC LIMIT 1) r ON true WHERE p.user_id=auth.uid() AND p.module_id=m.id AND p.status='Passed' AND r.status='Passed' AND r.reviewer_id IS NOT NULL); IF v_missing_prior_reviews>0 THEN RAISE EXCEPTION 'All prior Admin-reviewed practical gates must be passed before Final Approval. Missing: %',v_missing_prior_reviews; END IF;
 PERFORM set_config('profox.recruitment_stage_rpc','1',true);
 UPDATE public.applicants SET stage='Final Approval',onboarding_status='in_progress',onboarding_progress=100,updated_at=now() WHERE id=v_app.id;
END;$$;

INSERT INTO public.recruitment_stage_policies(job_id,stage,sort_order,active,assessment_required,passing_score,sla_hours,interview_required,rubric)
SELECT j.id,v.stage,v.sort_order,true,v.assessment_required,v.passing_score,v.sla_hours,v.interview_required,v.rubric
FROM public.career_jobs j
CROSS JOIN (VALUES
 ('New Application',1,false,NULL::int,24,false,'[]'::jsonb),
 ('Video Pending',2,false,NULL::int,120,false,'[]'::jsonb),
 ('Video Review',3,true,70,24,false,'[{"key":"communication","label":"English communication and clarity","maxPoints":25},{"key":"confidence","label":"Confidence and presence","maxPoints":20},{"key":"professionalism","label":"Professionalism","maxPoints":20},{"key":"salesEvidence","label":"Credible sales experience and evidence","maxPoints":20},{"key":"fit","label":"Potential fit for the ProFox sales model","maxPoints":15}]'::jsonb),
 ('Initial Screening',4,true,70,48,true,'[{"key":"experience","label":"Relevant sales experience","maxPoints":25},{"key":"english","label":"English and international communication readiness","maxPoints":20},{"key":"availability","label":"Availability and work readiness","maxPoints":15},{"key":"commercialModel","label":"Understanding of commission and self-sourcing model","maxPoints":20},{"key":"judgment","label":"Professional judgment and role fit","maxPoints":20}]'::jsonb),
 ('Shortlisted',5,false,NULL::int,48,false,'[]'::jsonb),
 ('Sales Assessment',6,true,75,72,true,'[{"key":"discovery","label":"Discovery and probing questions","maxPoints":25},{"key":"listening","label":"Listening and problem understanding","maxPoints":20},{"key":"positioning","label":"Solution positioning","maxPoints":20},{"key":"objections","label":"Objection handling","maxPoints":20},{"key":"nextStep","label":"Clear next-step control","maxPoints":15}]'::jsonb),
 ('Lead Research Test',7,true,80,72,false,'[{"key":"qualification","label":"Lead qualification quality","maxPoints":25},{"key":"research","label":"Research accuracy and evidence","maxPoints":25},{"key":"decisionMaker","label":"Decision-maker identification","maxPoints":15},{"key":"problem","label":"Digital problem identification","maxPoints":20},{"key":"fit","label":"ProFox service-fit judgment","maxPoints":15}]'::jsonb),
 ('CRM Assessment',8,true,80,72,false,'[{"key":"recordQuality","label":"CRM record completeness","maxPoints":25},{"key":"stage","label":"Correct stage and status discipline","maxPoints":20},{"key":"activities","label":"Next activity and follow-up discipline","maxPoints":25},{"key":"notes","label":"Clear useful notes","maxPoints":15},{"key":"dataDiscipline","label":"Data accuracy and ownership discipline","maxPoints":15}]'::jsonb),
 ('Selected',9,false,NULL::int,24,false,'[]'::jsonb),
 ('Agreement Pending',10,false,NULL::int,72,false,'[]'::jsonb),
 ('One-Day Training',11,false,NULL::int,48,false,'[]'::jsonb),
 ('Final Approval',12,false,NULL::int,24,false,'[]'::jsonb),
 ('Ready for System Access',13,false,NULL::int,24,false,'[]'::jsonb),
 ('Activated',14,false,NULL::int,0,false,'[]'::jsonb)
) AS v(stage,sort_order,assessment_required,passing_score,sla_hours,interview_required,rubric)
WHERE j.application_type='sales_representative'
ON CONFLICT(job_id,stage) DO NOTHING;

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,active,description)
VALUES('recruitment_admin_stage_overdue','Recruitment stage overdue','Recruitment review overdue: {{fullName}}','Candidate {{fullName}} ({{applicationReference}}) has remained in {{stage}} beyond the configured review SLA.\n\nOpen Recruitment and review the candidate evidence, assessment status and next required action.\n\nProFox',true,'Admin alert when a candidate remains in a recruitment stage beyond its configured SLA.')
ON CONFLICT(template_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.queue_due_recruitment_stage_sla()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE r record; a record; v_candidate_count int:=0; v_inapp int:=0; v_email int:=0; v_stage_key text;
BEGIN
 FOR r IN
  SELECT ap.*,p.sla_hours,p.stage policy_stage
  FROM public.applicants ap
  JOIN public.recruitment_stage_policies p ON p.job_id=coalesce(ap.career_job_id,(SELECT id FROM public.career_jobs WHERE application_type='sales_representative' ORDER BY (status='Published') DESC,featured DESC,published_at DESC NULLS LAST LIMIT 1)) AND p.stage=ap.stage AND p.active=true
  WHERE coalesce(trim(ap.refusal_reason),'')='' AND ap.stage<>'Activated' AND p.sla_hours>0 AND ap.stage_entered_at + make_interval(hours=>p.sla_hours)<=now()
 LOOP
  v_candidate_count:=v_candidate_count+1;
  v_stage_key:=lower(regexp_replace(r.stage,'[^a-zA-Z0-9]+','-','g'))||':'||to_char(r.stage_entered_at AT TIME ZONE 'UTC','YYYYMMDDHH24MISS');
  FOR a IN SELECT id FROM public.user_profiles WHERE role='admin' AND status='active' LOOP
   PERFORM public.enqueue_in_app_notification(a.id,'Recruitment','Recruitment review overdue',r.full_name||' has remained in '||r.stage||' beyond the configured '||r.sla_hours||'-hour SLA.','/admin/app/recruitment?tab=recruitment','recruitment:sla:'||r.id::text||':'||v_stage_key||':'||a.id::text);
   v_inapp:=v_inapp+1;
  END LOOP;
  IF public.queue_recruitment_admin_email(r,'recruitment_admin_stage_overdue','stage-sla-'||v_stage_key,now()) IS NOT NULL THEN v_email:=v_email+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('overdueCandidates',v_candidate_count,'adminNotifications',v_inapp,'adminEmails',v_email);
END;$$;
REVOKE ALL ON FUNCTION public.queue_due_recruitment_stage_sla() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_recruitment_stage_sla() TO service_role;

CREATE OR REPLACE FUNCTION public.queue_due_sales_automations()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_sales jsonb:='{}'::jsonb;v_operational jsonb:='{}'::jsonb;v_quote_customer jsonb:='{}'::jsonb;v_payment_customer jsonb:='{}'::jsonb;v_project_customer jsonb:='{}'::jsonb;v_recruitment jsonb:='{}'::jsonb;
BEGIN
 v_sales:=coalesce(public.queue_due_sales_automations_base(),'{}'::jsonb);
 v_operational:=coalesce(public.queue_due_operational_notifications(),'{}'::jsonb);
 v_quote_customer:=coalesce(public.queue_due_quotation_customer_communications(),'{}'::jsonb);
 v_payment_customer:=coalesce(public.queue_due_payment_customer_communications(),'{}'::jsonb);
 v_project_customer:=coalesce(public.queue_due_project_customer_communications(),'{}'::jsonb);
 v_recruitment:=coalesce(public.queue_due_recruitment_stage_sla(),'{}'::jsonb);
 RETURN v_sales||jsonb_build_object('module10Operational',v_operational)||jsonb_build_object('module11Customer',v_quote_customer||v_payment_customer||v_project_customer)||jsonb_build_object('recruitmentOperational',v_recruitment);
END;$$;

-- Extend the Admin timeline with structured pre-hire assessments.
CREATE OR REPLACE FUNCTION public.admin_get_applicant_timeline(p_applicant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_user uuid;result jsonb;BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required';END IF;SELECT linked_user_id INTO v_user FROM public.applicants WHERE id=p_applicant_id;IF NOT FOUND THEN RETURN '[]'::jsonb;END IF;
 WITH timeline AS(
 SELECT e.id::text id,e.category,e.event_type type,e.title,e.detail,e.to_value status,e.occurred_at,coalesce(up.full_name,CASE WHEN e.actor_type='applicant' THEN 'Applicant' ELSE initcap(e.actor_type) END) actor,jsonb_strip_nulls(e.metadata||jsonb_build_object('from',e.from_value,'to',e.to_value,'source',e.source_table)) metadata FROM public.applicant_events e LEFT JOIN public.user_profiles up ON up.id=e.actor_user_id WHERE e.applicant_id=p_applicant_id
 UNION ALL SELECT ra.id::text,'assessment','assessment_recorded',ra.stage||' assessment',nullif(ra.evaluator_notes,''),ra.status,coalesce(ra.evaluated_at,ra.created_at),coalesce(up.full_name,'Reviewer'),jsonb_strip_nulls(jsonb_build_object('attemptNo',ra.attempt_no,'score',ra.score,'passingScore',ra.passing_score_snapshot,'criticalFailures',ra.critical_failures,'evidenceUrl',nullif(ra.evidence_url,''))) FROM public.recruitment_assessments ra LEFT JOIN public.user_profiles up ON up.id=ra.evaluator_id WHERE ra.applicant_id=p_applicant_id
 UNION ALL SELECT n.id::text||':queued','communication','email_queued','Email queued',n.template_key,n.status,n.created_at,'System',jsonb_strip_nulls(jsonb_build_object('templateKey',n.template_key,'recipient',n.recipient_email,'scheduledFor',n.scheduled_for,'attempts',n.attempts)) FROM public.notification_outbox n WHERE n.payload->>'applicantId'=p_applicant_id::text
 UNION ALL SELECT n.id::text||':delivery','communication',CASE WHEN n.status='Sent' THEN 'email_sent' WHEN n.status='Failed' THEN 'email_failed' WHEN n.status='Cancelled' THEN 'email_cancelled' ELSE 'email_delivery_update' END,CASE WHEN n.status='Sent' THEN 'Email sent' WHEN n.status='Failed' THEN 'Email failed' WHEN n.status='Cancelled' THEN 'Email cancelled' ELSE 'Email delivery updated' END,n.template_key,n.status,coalesce(n.sent_at,n.last_attempt_at,n.updated_at),'Notification worker',jsonb_strip_nulls(jsonb_build_object('templateKey',n.template_key,'attempts',n.attempts,'providerMessageId',n.provider_message_id,'lastError',nullif(n.last_error,''),'sentAt',n.sent_at,'lastAttemptAt',n.last_attempt_at)) FROM public.notification_outbox n WHERE n.payload->>'applicantId'=p_applicant_id::text AND(n.sent_at IS NOT NULL OR n.last_attempt_at IS NOT NULL OR n.status IN('Failed','Cancelled'))
 UNION ALL SELECT ae.id::text,'agreement',ae.event_type,'Agreement: '||replace(initcap(replace(ae.event_type,'_',' ')),'  ',' '),NULL,NULL,ae.created_at,coalesce(up.full_name,ae.actor_email,initcap(ae.actor_type)),jsonb_strip_nulls(coalesce(ae.metadata,'{}')||jsonb_build_object('agreementNumber',ag.agreement_number,'ipAddress',ae.ip_address,'userAgent',ae.user_agent)) FROM public.sales_agreement_events ae JOIN public.sales_partner_agreements ag ON ag.id=ae.agreement_id LEFT JOIN public.user_profiles up ON up.id=ae.actor_user_id WHERE ag.applicant_id=p_applicant_id
 UNION ALL SELECT p.id::text||':started','training','training_module_started','Training module started',m.title,p.status,p.created_at,'Sales Academy',jsonb_build_object('moduleId',m.id,'moduleTitle',m.title,'progress',p.progress_percent,'score',p.score) FROM public.user_training_progress p JOIN public.training_modules m ON m.id=p.module_id WHERE v_user IS NOT NULL AND p.user_id=v_user
 UNION ALL SELECT p.id::text||':completed','training','training_module_completed','Training module completed',m.title,p.status,p.completed_at,'Sales Academy',jsonb_build_object('moduleId',m.id,'moduleTitle',m.title,'score',p.score,'attempts',p.attempts) FROM public.user_training_progress p JOIN public.training_modules m ON m.id=p.module_id WHERE v_user IS NOT NULL AND p.user_id=v_user AND p.completed_at IS NOT NULL
 UNION ALL SELECT p.id::text||':review','training','training_review','Training review recorded',m.title,p.review_status,p.reviewed_at,coalesce(up.full_name,'Reviewer'),jsonb_build_object('moduleId',m.id,'moduleTitle',m.title,'score',p.score,'feedback',p.feedback) FROM public.user_training_progress p JOIN public.training_modules m ON m.id=p.module_id LEFT JOIN public.user_profiles up ON up.id=p.reviewed_by WHERE v_user IS NOT NULL AND p.user_id=v_user AND p.reviewed_at IS NOT NULL
 UNION ALL SELECT fe.id::text,'certification',fe.event_type,'Final certification: '||replace(initcap(replace(fe.event_type,'_',' ')),'  ',' '),fs.case_name_snapshot,fs.status,fe.created_at,coalesce(up.full_name,'Certification system'),jsonb_strip_nulls(coalesce(fe.event_data,'{}')||jsonb_build_object('sessionId',fs.id,'score',fs.score,'attemptNo',fs.attempt_no,'evaluatedAt',fs.evaluated_at)) FROM public.final_certification_events fe JOIN public.final_certification_sessions fs ON fs.id=fe.session_id LEFT JOIN public.user_profiles up ON up.id=fe.actor_user_id WHERE v_user IS NOT NULL AND fs.trainee_id=v_user)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'type',type,'title',title,'detail',detail,'status',status,'occurredAt',occurred_at,'actor',actor,'metadata',metadata) ORDER BY occurred_at DESC),'[]'::jsonb) INTO result FROM timeline;RETURN result;END$$;

-- RLS / execute hardening for service-only helpers.
REVOKE ALL ON FUNCTION public.recruitment_stage_rank(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recruitment_stage_rank(text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.recruitment_next_stage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recruitment_next_stage(text) TO authenticated,service_role;

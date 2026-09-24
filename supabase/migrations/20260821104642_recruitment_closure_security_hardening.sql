-- Explicit function privilege and search_path hardening for Recruitment Closure.
CREATE OR REPLACE FUNCTION public.recruitment_stage_rank(p_stage text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='public','pg_temp' AS $$
SELECT CASE p_stage
 WHEN 'New Application' THEN 1 WHEN 'Video Pending' THEN 2 WHEN 'Video Review' THEN 3
 WHEN 'Initial Screening' THEN 4 WHEN 'Shortlisted' THEN 5 WHEN 'Sales Assessment' THEN 6
 WHEN 'Lead Research Test' THEN 7 WHEN 'CRM Assessment' THEN 8 WHEN 'Selected' THEN 9
 WHEN 'Agreement Pending' THEN 10 WHEN 'One-Day Training' THEN 11 WHEN 'Final Approval' THEN 12
 WHEN 'Ready for System Access' THEN 13 WHEN 'Activated' THEN 14 ELSE NULL END;
$$;
CREATE OR REPLACE FUNCTION public.recruitment_next_stage(p_stage text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='public','pg_temp' AS $$
SELECT CASE p_stage
 WHEN 'New Application' THEN 'Video Pending' WHEN 'Video Pending' THEN 'Video Review'
 WHEN 'Video Review' THEN 'Initial Screening' WHEN 'Initial Screening' THEN 'Shortlisted'
 WHEN 'Shortlisted' THEN 'Sales Assessment' WHEN 'Sales Assessment' THEN 'Lead Research Test'
 WHEN 'Lead Research Test' THEN 'CRM Assessment' WHEN 'CRM Assessment' THEN 'Selected'
 WHEN 'Selected' THEN 'Agreement Pending' WHEN 'Agreement Pending' THEN 'One-Day Training'
 WHEN 'One-Day Training' THEN 'Final Approval' WHEN 'Final Approval' THEN 'Ready for System Access'
 WHEN 'Ready for System Access' THEN 'Activated' ELSE NULL END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_stage_rank(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recruitment_stage_rank(text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.recruitment_next_stage(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recruitment_next_stage(text) TO authenticated,service_role;

REVOKE ALL ON FUNCTION public.admin_get_recruitment_stage_policies(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_recruitment_stage_policies(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_save_recruitment_stage_policy(uuid,text,boolean,integer,integer,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_save_recruitment_stage_policy(uuid,text,boolean,integer,integer,boolean,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_get_recruitment_assessments(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_recruitment_assessments(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_record_recruitment_assessment(uuid,text,text,integer,jsonb,jsonb,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_record_recruitment_assessment(uuid,text,text,integer,jsonb,jsonb,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_advance_applicant_stage(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_advance_applicant_stage(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_override_applicant_stage(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_override_applicant_stage(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_close_applicant(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_close_applicant(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_get_recruitment_source_funnel() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_recruitment_source_funnel() TO authenticated;

REVOKE ALL ON FUNCTION public.track_applicant_stage_entered_at() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.protect_recruitment_stage_update() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.protect_recruitment_refusal_update() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.queue_due_recruitment_stage_sla() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_recruitment_stage_sla() TO service_role;
REVOKE ALL ON FUNCTION public.recruitment_latest_assessment_passed(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_latest_assessment_passed(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.service_link_invited_sales_candidate(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_link_invited_sales_candidate(uuid,uuid,text) TO service_role;

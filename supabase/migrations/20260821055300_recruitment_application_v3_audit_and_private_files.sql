ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS application_reference text,
  ADD COLUMN IF NOT EXISTS application_version text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS current_job_title text,
  ADD COLUMN IF NOT EXISTS digital_sales_experience text,
  ADD COLUMN IF NOT EXISTS international_sales_experience text,
  ADD COLUMN IF NOT EXISTS english_rating text,
  ADD COLUMN IF NOT EXISTS sales_experience_months integer,
  ADD COLUMN IF NOT EXISTS b2b_experience_months integer,
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS target_markets text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prospecting_channels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS crm_experience text,
  ADD COLUMN IF NOT EXISTS available_days text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS available_hours_per_week integer,
  ADD COLUMN IF NOT EXISTS preferred_work_window text,
  ADD COLUMN IF NOT EXISTS earliest_start_date date,
  ADD COLUMN IF NOT EXISTS heard_about_source text,
  ADD COLUMN IF NOT EXISTS heard_about_detail text,
  ADD COLUMN IF NOT EXISTS motivation text,
  ADD COLUMN IF NOT EXISTS has_laptop_internet boolean,
  ADD COLUMN IF NOT EXISTS comfortable_commission boolean,
  ADD COLUMN IF NOT EXISTS comfortable_sourcing boolean,
  ADD COLUMN IF NOT EXISTS comfortable_english_calls boolean,
  ADD COLUMN IF NOT EXISTS video_commitment boolean,
  ADD COLUMN IF NOT EXISTS accuracy_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS application_policy_version text,
  ADD COLUMN IF NOT EXISTS application_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS cv_storage_path text,
  ADD COLUMN IF NOT EXISTS video_storage_path text;

ALTER TABLE public.applicants DROP CONSTRAINT IF EXISTS applicants_sales_experience_months_check;
ALTER TABLE public.applicants ADD CONSTRAINT applicants_sales_experience_months_check CHECK (sales_experience_months IS NULL OR sales_experience_months BETWEEN 0 AND 600);
ALTER TABLE public.applicants DROP CONSTRAINT IF EXISTS applicants_b2b_experience_months_check;
ALTER TABLE public.applicants ADD CONSTRAINT applicants_b2b_experience_months_check CHECK (b2b_experience_months IS NULL OR b2b_experience_months BETWEEN 0 AND 600);
ALTER TABLE public.applicants DROP CONSTRAINT IF EXISTS applicants_available_hours_check;
ALTER TABLE public.applicants ADD CONSTRAINT applicants_available_hours_check CHECK (available_hours_per_week IS NULL OR available_hours_per_week BETWEEN 1 AND 80);
ALTER TABLE public.applicants DROP CONSTRAINT IF EXISTS applicants_country_code_check;
ALTER TABLE public.applicants ADD CONSTRAINT applicants_country_code_check CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');

CREATE SEQUENCE IF NOT EXISTS public.sales_application_reference_seq START WITH 1001;
CREATE OR REPLACE FUNCTION public.next_sales_application_reference()
RETURNS text LANGUAGE sql VOLATILE SET search_path=public,pg_temp
AS $$ SELECT 'PF-SALES-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.sales_application_reference_seq')::text,6,'0') $$;
REVOKE ALL ON FUNCTION public.next_sales_application_reference() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_sales_application_reference() TO authenticated;

UPDATE public.applicants SET application_reference=public.next_sales_application_reference() WHERE application_reference IS NULL;
ALTER TABLE public.applicants ALTER COLUMN application_reference SET DEFAULT public.next_sales_application_reference();
ALTER TABLE public.applicants ALTER COLUMN application_reference SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS applicants_application_reference_uidx ON public.applicants(application_reference);
CREATE INDEX IF NOT EXISTS applicants_created_at_idx ON public.applicants(created_at DESC);
CREATE INDEX IF NOT EXISTS applicants_stage_created_idx ON public.applicants(stage,created_at DESC);

UPDATE public.career_jobs
SET role_details=jsonb_set(COALESCE(role_details,'{}'::jsonb),'{applicationForm}',
  COALESCE(role_details->'applicationForm','{}'::jsonb)||jsonb_build_object(
    'minimumSalesExperienceMonths',COALESCE((role_details->'applicationForm'->>'minimumSalesExperienceMonths')::int,6),
    'minimumWeeklyHours',COALESCE((role_details->'applicationForm'->>'minimumWeeklyHours')::int,35),
    'sourceOptions',COALESCE(role_details->'applicationForm'->'sourceOptions','["LinkedIn","Google Search","Social media","Job board","Referral","ProFox website","Other"]'::jsonb)
  ),true),updated_at=now()
WHERE application_type='sales_representative';

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('recruitment-applications','recruitment-applications',false,83886080,
ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','video/mp4','video/webm','video/quicktime']::text[])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

DROP POLICY IF EXISTS "Admins read recruitment application files" ON storage.objects;
CREATE POLICY "Admins read recruitment application files" ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='recruitment-applications' AND public.is_admin());

CREATE TABLE IF NOT EXISTS public.recruitment_upload_intents(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email_normalized text NOT NULL,kind text NOT NULL CHECK(kind IN('cv','video')),
  storage_path text NOT NULL UNIQUE,original_filename text NOT NULL,content_type text NOT NULL,max_bytes bigint NOT NULL,ip_hash text,
  expires_at timestamptz NOT NULL,used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.recruitment_upload_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recruitment_upload_intents FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS recruitment_upload_intents_email_created_idx ON public.recruitment_upload_intents(email_normalized,created_at DESC);
CREATE INDEX IF NOT EXISTS recruitment_upload_intents_ip_created_idx ON public.recruitment_upload_intents(ip_hash,created_at DESC) WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS recruitment_upload_intents_expires_idx ON public.recruitment_upload_intents(expires_at) WHERE used_at IS NULL;

CREATE OR REPLACE FUNCTION public.service_create_recruitment_upload_intent(p_email text,p_kind text,p_filename text,p_content_type text,p_size_bytes bigint,p_ip_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_email text:=lower(trim(COALESCE(p_email,'')));v_kind text:=lower(trim(COALESCE(p_kind,'')));v_type text:=lower(trim(COALESCE(p_content_type,'')));
 v_max bigint;v_ext text;v_id uuid:=gen_random_uuid();v_path text;v_exp timestamptz:=now()+interval '2 hours';
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required';END IF;
 IF v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Valid email required';END IF;
 IF v_kind NOT IN('cv','video') THEN RAISE EXCEPTION 'Unsupported file kind';END IF;
 IF char_length(trim(COALESCE(p_filename,'')))<1 OR char_length(p_filename)>180 THEN RAISE EXCEPTION 'Invalid filename';END IF;
 IF v_kind='cv' THEN v_max:=8388608;
   IF v_type='application/pdf' THEN v_ext:='pdf';ELSIF v_type='application/msword' THEN v_ext:='doc';ELSIF v_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN v_ext:='docx';ELSE RAISE EXCEPTION 'CV must be PDF, DOC or DOCX';END IF;
 ELSE v_max:=83886080;
   IF v_type='video/mp4' THEN v_ext:='mp4';ELSIF v_type='video/webm' THEN v_ext:='webm';ELSIF v_type='video/quicktime' THEN v_ext:='mov';ELSE RAISE EXCEPTION 'Video must be MP4, WebM or MOV';END IF;
 END IF;
 IF p_size_bytes IS NULL OR p_size_bytes<1 OR p_size_bytes>v_max THEN RAISE EXCEPTION 'File size is outside the allowed limit';END IF;
 IF(SELECT count(*) FROM public.recruitment_upload_intents WHERE email_normalized=v_email AND created_at>now()-interval '1 hour')>=8 THEN RAISE EXCEPTION 'Too many upload requests for this email. Try again later.';END IF;
 IF COALESCE(trim(p_ip_hash),'')<>'' AND(SELECT count(*) FROM public.recruitment_upload_intents WHERE ip_hash=p_ip_hash AND created_at>now()-interval '1 hour')>=15 THEN RAISE EXCEPTION 'Too many upload requests. Try again later.';END IF;
 v_path:='applications/'||to_char(now(),'YYYY/MM')||'/'||v_id::text||'/'||v_kind||'.'||v_ext;
 INSERT INTO public.recruitment_upload_intents(id,email_normalized,kind,storage_path,original_filename,content_type,max_bytes,ip_hash,expires_at)
 VALUES(v_id,v_email,v_kind,v_path,trim(p_filename),v_type,v_max,NULLIF(trim(p_ip_hash),''),v_exp);
 RETURN jsonb_build_object('intentId',v_id,'path',v_path,'expiresAt',v_exp,'maxBytes',v_max);
END$$;
REVOKE ALL ON FUNCTION public.service_create_recruitment_upload_intent(text,text,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_create_recruitment_upload_intent(text,text,text,text,bigint,text) TO service_role;

CREATE TABLE IF NOT EXISTS public.applicant_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
 category text NOT NULL,event_type text NOT NULL,title text NOT NULL,detail text,from_value text,to_value text,actor_type text NOT NULL DEFAULT 'system',
 actor_user_id uuid,source_table text,source_id uuid,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,occurred_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.applicant_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.applicant_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.applicant_events TO authenticated;
DROP POLICY IF EXISTS applicant_events_admin_read ON public.applicant_events;
CREATE POLICY applicant_events_admin_read ON public.applicant_events FOR SELECT TO authenticated USING(public.is_admin());
CREATE INDEX IF NOT EXISTS applicant_events_applicant_time_idx ON public.applicant_events(applicant_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS applicant_events_type_idx ON public.applicant_events(event_type,occurred_at DESC);

CREATE OR REPLACE FUNCTION public.log_applicant_event(p_applicant_id uuid,p_category text,p_event_type text,p_title text,p_detail text DEFAULT NULL,p_from_value text DEFAULT NULL,p_to_value text DEFAULT NULL,p_actor_type text DEFAULT 'system',p_actor_user_id uuid DEFAULT NULL,p_source_table text DEFAULT NULL,p_source_id uuid DEFAULT NULL,p_metadata jsonb DEFAULT '{}'::jsonb,p_occurred_at timestamptz DEFAULT now())
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE v_id uuid;BEGIN
 INSERT INTO public.applicant_events(applicant_id,category,event_type,title,detail,from_value,to_value,actor_type,actor_user_id,source_table,source_id,metadata,occurred_at)
 VALUES(p_applicant_id,p_category,p_event_type,p_title,p_detail,p_from_value,p_to_value,COALESCE(p_actor_type,'system'),p_actor_user_id,p_source_table,p_source_id,COALESCE(p_metadata,'{}'::jsonb),COALESCE(p_occurred_at,now())) RETURNING id INTO v_id;RETURN v_id;END$$;
REVOKE ALL ON FUNCTION public.log_applicant_event(uuid,text,text,text,text,text,text,text,uuid,text,uuid,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.log_applicant_event(uuid,text,text,text,text,text,text,text,uuid,text,uuid,jsonb,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.audit_applicant_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid();v_actor_type text:=CASE WHEN auth.uid() IS NOT NULL THEN 'admin' WHEN TG_OP='INSERT' AND NEW.source='ProFox Website' THEN 'applicant' ELSE 'system' END;v_changed text[]:=ARRAY[]::text[];
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM public.log_applicant_event(NEW.id,'application','application_submitted','Application submitted','Candidate application entered the ProFox recruitment workflow.',NULL,NEW.stage,v_actor_type,v_actor,'applicants',NEW.id,jsonb_strip_nulls(jsonb_build_object('reference',NEW.application_reference,'source',NEW.source,'applicationVersion',NEW.application_version)));RETURN NEW;
 END IF;
 IF OLD.stage IS DISTINCT FROM NEW.stage THEN PERFORM public.log_applicant_event(NEW.id,'recruitment','stage_changed','Recruitment stage changed',NULL,OLD.stage,NEW.stage,v_actor_type,v_actor,'applicants',NEW.id,'{}');END IF;
 IF OLD.refusal_reason IS DISTINCT FROM NEW.refusal_reason THEN PERFORM public.log_applicant_event(NEW.id,'recruitment',CASE WHEN COALESCE(NEW.refusal_reason,'')='' THEN 'refusal_cleared' ELSE 'application_refused' END,CASE WHEN COALESCE(NEW.refusal_reason,'')='' THEN 'Refusal cleared' ELSE 'Application refused' END,NULL,OLD.refusal_reason,NEW.refusal_reason,v_actor_type,v_actor,'applicants',NEW.id,'{}');END IF;
 IF OLD.linked_user_id IS DISTINCT FROM NEW.linked_user_id THEN PERFORM public.log_applicant_event(NEW.id,'account','account_link_changed',CASE WHEN NEW.linked_user_id IS NULL THEN 'Training account unlinked' ELSE 'Training account linked' END,NULL,OLD.linked_user_id::text,NEW.linked_user_id::text,v_actor_type,v_actor,'applicants',NEW.id,'{}');END IF;
 IF OLD.final_approval IS DISTINCT FROM NEW.final_approval THEN PERFORM public.log_applicant_event(NEW.id,'recruitment','final_approval_changed',CASE WHEN NEW.final_approval THEN 'Final approval granted' ELSE 'Final approval removed' END,NULL,OLD.final_approval::text,NEW.final_approval::text,v_actor_type,v_actor,'applicants',NEW.id,'{}');END IF;
 IF OLD.onboarding_status IS DISTINCT FROM NEW.onboarding_status THEN PERFORM public.log_applicant_event(NEW.id,'training','onboarding_status_changed','Onboarding status changed',NULL,OLD.onboarding_status,NEW.onboarding_status,v_actor_type,v_actor,'applicants',NEW.id,'{}');END IF;
 IF OLD.onboarding_progress IS DISTINCT FROM NEW.onboarding_progress THEN PERFORM public.log_applicant_event(NEW.id,'training','onboarding_progress_changed','Onboarding progress changed',NULL,OLD.onboarding_progress::text,NEW.onboarding_progress::text,v_actor_type,v_actor,'applicants',NEW.id,'{}');END IF;
 IF OLD.rating IS DISTINCT FROM NEW.rating THEN PERFORM public.log_applicant_event(NEW.id,'review','rating_changed','Candidate rating changed',NULL,OLD.rating::text,NEW.rating::text,v_actor_type,v_actor,'applicants',NEW.id,'{}');END IF;
 IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN v_changed:=array_append(v_changed,'fullName');END IF;IF OLD.email IS DISTINCT FROM NEW.email THEN v_changed:=array_append(v_changed,'email');END IF;IF OLD.phone IS DISTINCT FROM NEW.phone THEN v_changed:=array_append(v_changed,'phone');END IF;
 IF OLD.country IS DISTINCT FROM NEW.country OR OLD.country_code IS DISTINCT FROM NEW.country_code THEN v_changed:=array_append(v_changed,'country');END IF;IF OLD.timezone IS DISTINCT FROM NEW.timezone THEN v_changed:=array_append(v_changed,'timezone');END IF;IF OLD.linkedin_url IS DISTINCT FROM NEW.linkedin_url THEN v_changed:=array_append(v_changed,'linkedin');END IF;
 IF OLD.cv_url IS DISTINCT FROM NEW.cv_url OR OLD.cv_storage_path IS DISTINCT FROM NEW.cv_storage_path THEN v_changed:=array_append(v_changed,'cv');END IF;IF OLD.video_url IS DISTINCT FROM NEW.video_url OR OLD.video_storage_path IS DISTINCT FROM NEW.video_storage_path THEN v_changed:=array_append(v_changed,'video');END IF;
 IF OLD.sales_experience IS DISTINCT FROM NEW.sales_experience OR OLD.sales_experience_months IS DISTINCT FROM NEW.sales_experience_months THEN v_changed:=array_append(v_changed,'salesExperience');END IF;IF OLD.previous_sales_results IS DISTINCT FROM NEW.previous_sales_results THEN v_changed:=array_append(v_changed,'previousSalesResults');END IF;
 IF OLD.weekly_availability IS DISTINCT FROM NEW.weekly_availability OR OLD.available_hours_per_week IS DISTINCT FROM NEW.available_hours_per_week OR OLD.available_days IS DISTINCT FROM NEW.available_days THEN v_changed:=array_append(v_changed,'availability');END IF;IF OLD.sample_outreach_message IS DISTINCT FROM NEW.sample_outreach_message THEN v_changed:=array_append(v_changed,'sampleOutreach');END IF;IF OLD.professional_reference IS DISTINCT FROM NEW.professional_reference THEN v_changed:=array_append(v_changed,'professionalReference');END IF;
 IF OLD.target_markets IS DISTINCT FROM NEW.target_markets THEN v_changed:=array_append(v_changed,'targetMarkets');END IF;IF OLD.prospecting_channels IS DISTINCT FROM NEW.prospecting_channels THEN v_changed:=array_append(v_changed,'prospectingChannels');END IF;IF OLD.crm_experience IS DISTINCT FROM NEW.crm_experience THEN v_changed:=array_append(v_changed,'crmExperience');END IF;
 IF cardinality(v_changed)>0 THEN PERFORM public.log_applicant_event(NEW.id,'application','candidate_information_updated','Candidate information updated',NULL,NULL,NULL,v_actor_type,v_actor,'applicants',NEW.id,jsonb_build_object('changedFields',to_jsonb(v_changed)));END IF;RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION public.audit_applicant_changes() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_audit_applicant_changes ON public.applicants;
CREATE TRIGGER trg_audit_applicant_changes AFTER INSERT OR UPDATE ON public.applicants FOR EACH ROW EXECUTE FUNCTION public.audit_applicant_changes();

INSERT INTO public.applicant_events(applicant_id,category,event_type,title,detail,to_value,actor_type,source_table,source_id,metadata,occurred_at)
SELECT a.id,'application','historical_record_imported','Existing applicant record available','Audit timeline began after this applicant was already in the system.',a.stage,'system','applicants',a.id,jsonb_build_object('reference',a.application_reference,'source',a.source),a.created_at
FROM public.applicants a WHERE NOT EXISTS(SELECT 1 FROM public.applicant_events e WHERE e.applicant_id=a.id);

CREATE OR REPLACE FUNCTION public.submit_public_sales_application_v3(p_application jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_job public.career_jobs%ROWTYPE;v_cfg jsonb;v_min_months int;v_min_hours int;v_email text:=lower(trim(COALESCE(p_application->>'email','')));v_name text:=trim(COALESCE(p_application->>'fullName',''));
 v_phone text:=regexp_replace(trim(COALESCE(p_application->>'phone','')),'[[:space:]()-]','','g');v_country text:=trim(COALESCE(p_application->>'country',''));v_country_code text:=upper(trim(COALESCE(p_application->>'countryCode','')));v_timezone text:=trim(COALESCE(p_application->>'timezone',''));
 v_linkedin text:=trim(COALESCE(p_application->>'linkedinUrl',''));v_cv_url text:=trim(COALESCE(p_application->>'cvUrl',''));v_video_url text:=trim(COALESCE(p_application->>'videoUrl',''));v_cv_path text:=trim(COALESCE(p_application->>'cvStoragePath',''));v_video_path text:=trim(COALESCE(p_application->>'videoStoragePath',''));
 v_sales_months int;v_b2b_months int;v_hours int;v_start date;v_target_markets text[]:=ARRAY[]::text[];v_channels text[]:=ARRAY[]::text[];v_days text[]:=ARRAY[]::text[];v_existing uuid;v_new uuid;v_ref text;v_now timestamptz:=clock_timestamp();v_policy text;
BEGIN
 IF jsonb_typeof(COALESCE(p_application,'{}'::jsonb))<>'object' THEN RETURN jsonb_build_object('success',false,'error','Invalid application payload.');END IF;
 IF p_application ? 'targetMarkets' AND jsonb_typeof(p_application->'targetMarkets')<>'array' THEN RETURN jsonb_build_object('success',false,'field','targetMarkets','error','Target markets must be a list.');END IF;
 IF p_application ? 'prospectingChannels' AND jsonb_typeof(p_application->'prospectingChannels')<>'array' THEN RETURN jsonb_build_object('success',false,'field','prospectingChannels','error','Prospecting channels must be a list.');END IF;
 IF p_application ? 'availableDays' AND jsonb_typeof(p_application->'availableDays')<>'array' THEN RETURN jsonb_build_object('success',false,'field','availableDays','error','Available days must be a list.');END IF;
 v_target_markets:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_application->'targetMarkets','[]'::jsonb)) LIMIT 20);v_channels:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_application->'prospectingChannels','[]'::jsonb)) LIMIT 30);v_days:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_application->'availableDays','[]'::jsonb)) LIMIT 7);
 SELECT * INTO v_job FROM public.career_jobs WHERE application_type='sales_representative' AND status='Published' ORDER BY featured DESC,published_at DESC NULLS LAST,created_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','This role is not currently accepting applications.');END IF;
 v_cfg:=COALESCE(v_job.role_details->'applicationForm','{}');v_min_months:=GREATEST(0,COALESCE((v_cfg->>'minimumSalesExperienceMonths')::int,6));v_min_hours:=GREATEST(1,COALESCE((v_cfg->>'minimumWeeklyHours')::int,35));v_policy:='sales-job:'||v_job.id::text||':'||to_char(v_job.updated_at AT TIME ZONE 'UTC','YYYYMMDDHH24MISSMS');
 BEGIN v_sales_months:=(p_application->>'salesExperienceMonths')::int;EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'field','salesExperienceMonths','error','Provide total sales experience in months.');END;
 BEGIN v_b2b_months:=NULLIF(p_application->>'b2bExperienceMonths','')::int;EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'field','b2bExperienceMonths','error','Provide valid B2B experience in months.');END;
 BEGIN v_hours:=(p_application->>'availableHoursPerWeek')::int;EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'field','availableHoursPerWeek','error','Provide your available hours per week.');END;
 BEGIN v_start:=NULLIF(p_application->>'earliestStartDate','')::date;EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'field','earliestStartDate','error','Provide a valid earliest start date.');END;
 IF char_length(v_name)<2 THEN RETURN jsonb_build_object('success',false,'field','fullName','error','Please provide your full name.');END IF;
 IF v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RETURN jsonb_build_object('success',false,'field','email','error','Please provide a valid email address.');END IF;
 IF v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN RETURN jsonb_build_object('success',false,'field','phone','error','Use an international phone number with country code, for example +14155552671.');END IF;
 IF v_country='' OR v_country_code !~ '^[A-Z]{2}$' THEN RETURN jsonb_build_object('success',false,'field','country','error','Please select your country.');END IF;
 IF v_timezone='' OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN RETURN jsonb_build_object('success',false,'field','timezone','error','Please select a valid time zone.');END IF;
 IF v_linkedin !~* '^https?://([^/]+\.)?linkedin\.com/' THEN RETURN jsonb_build_object('success',false,'field','linkedinUrl','error','Please provide a valid LinkedIn profile URL.');END IF;
 IF v_sales_months<v_min_months THEN RETURN jsonb_build_object('success',false,'field','salesExperienceMonths','error','This role currently requires at least '||v_min_months||' months of sales experience.');END IF;
 IF v_sales_months>600 OR COALESCE(v_b2b_months,0)>600 THEN RETURN jsonb_build_object('success',false,'error','Experience values are outside the allowed range.');END IF;
 IF char_length(trim(COALESCE(p_application->>'salesExperience','')))<20 THEN RETURN jsonb_build_object('success',false,'field','salesExperience','error','Please describe your sales experience with enough detail for review.');END IF;
 IF char_length(trim(COALESCE(p_application->>'previousSalesResults','')))<20 THEN RETURN jsonb_build_object('success',false,'field','previousSalesResults','error','Please describe one measurable sales result.');END IF;
 IF v_hours<v_min_hours OR v_hours>80 THEN RETURN jsonb_build_object('success',false,'field','availableHoursPerWeek','error','This role currently requires at least '||v_min_hours||' available hours per week.');END IF;
 IF cardinality(v_days)=0 THEN RETURN jsonb_build_object('success',false,'field','availableDays','error','Select at least one available working day.');END IF;
 IF char_length(trim(COALESCE(p_application->>'sampleOutreachMessage','')))<20 THEN RETURN jsonb_build_object('success',false,'field','sampleOutreachMessage','error','Please provide a short sample cold outreach message.');END IF;
 IF COALESCE(p_application->>'englishRating','') NOT IN('Fluent / Native','Professional working proficiency','Conversational') THEN RETURN jsonb_build_object('success',false,'field','englishRating','error','Please select your English level.');END IF;
 IF cardinality(v_channels)=0 THEN RETURN jsonb_build_object('success',false,'field','prospectingChannels','error','Select at least one prospecting channel you have used.');END IF;
 IF COALESCE((p_application->>'hasLaptopInternet')::boolean,false) IS DISTINCT FROM true THEN RETURN jsonb_build_object('success',false,'error','Confirm that you have the required equipment and reliable internet.');END IF;IF COALESCE((p_application->>'comfortableCommission')::boolean,false) IS DISTINCT FROM true THEN RETURN jsonb_build_object('success',false,'error','Confirm that the commission-based starting model works for you.');END IF;IF COALESCE((p_application->>'comfortableSourcing')::boolean,false) IS DISTINCT FROM true THEN RETURN jsonb_build_object('success',false,'error','Confirm that you can initially source your own qualified leads.');END IF;IF COALESCE((p_application->>'comfortableEnglishCalls')::boolean,false) IS DISTINCT FROM true THEN RETURN jsonb_build_object('success',false,'error','Confirm that you can conduct professional English sales conversations.');END IF;IF COALESCE((p_application->>'videoCommitment')::boolean,false) IS DISTINCT FROM true THEN RETURN jsonb_build_object('success',false,'error','Confirm the required 60-120 second English introduction video.');END IF;
 IF COALESCE((p_application->>'consentAccurate')::boolean,false) IS DISTINCT FROM true OR COALESCE((p_application->>'consentPrivacy')::boolean,false) IS DISTINCT FROM true THEN RETURN jsonb_build_object('success',false,'error','Accuracy and privacy confirmations are required.');END IF;
 IF v_cv_path='' AND v_cv_url='' THEN RETURN jsonb_build_object('success',false,'field','cv','error','Upload your CV/resume or provide a shareable link.');END IF;IF v_video_path='' AND v_video_url='' THEN RETURN jsonb_build_object('success',false,'field','video','error','Upload your introduction video or provide a shareable link.');END IF;
 IF v_cv_url<>'' AND v_cv_url !~* '^https?://' THEN RETURN jsonb_build_object('success',false,'field','cvUrl','error','CV link must begin with http:// or https://.');END IF;IF v_video_url<>'' AND v_video_url !~* '^https?://' THEN RETURN jsonb_build_object('success',false,'field','videoUrl','error','Video link must begin with http:// or https://.');END IF;
 IF v_cv_path<>'' AND NOT EXISTS(SELECT 1 FROM public.recruitment_upload_intents i JOIN storage.objects o ON o.bucket_id='recruitment-applications' AND o.name=i.storage_path WHERE i.storage_path=v_cv_path AND i.email_normalized=v_email AND i.kind='cv' AND i.used_at IS NULL AND i.expires_at>now() AND COALESCE((o.metadata->>'size')::bigint,0)<=i.max_bytes AND lower(COALESCE(o.metadata->>'mimetype',''))=lower(i.content_type)) THEN RETURN jsonb_build_object('success',false,'field','cv','error','The uploaded CV could not be verified. Please upload it again or use a shareable link.');END IF;
 IF v_video_path<>'' AND NOT EXISTS(SELECT 1 FROM public.recruitment_upload_intents i JOIN storage.objects o ON o.bucket_id='recruitment-applications' AND o.name=i.storage_path WHERE i.storage_path=v_video_path AND i.email_normalized=v_email AND i.kind='video' AND i.used_at IS NULL AND i.expires_at>now() AND COALESCE((o.metadata->>'size')::bigint,0)<=i.max_bytes AND lower(COALESCE(o.metadata->>'mimetype',''))=lower(i.content_type)) THEN RETURN jsonb_build_object('success',false,'field','video','error','The uploaded video could not be verified. Please upload it again or use a shareable link.');END IF;
 IF EXISTS(SELECT 1 FROM public.user_profiles WHERE lower(trim(email))=v_email AND role='sales' AND status='active') THEN RETURN jsonb_build_object('success',false,'duplicate',true,'message','This email is already associated with an active ProFox sales representative account.');END IF;
 SELECT id INTO v_existing FROM public.applicants WHERE lower(trim(email))=v_email AND COALESCE(trim(refusal_reason),'')='' AND stage<>'Activated' ORDER BY created_at DESC LIMIT 1;IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',false,'duplicate',true,'message','An active application under this email address is already being reviewed by our team.');END IF;
 v_ref:=public.next_sales_application_reference();
 INSERT INTO public.applicants(application_reference,application_version,application_policy_version,application_submitted_at,full_name,email,phone,country,country_code,timezone,position,linkedin_url,current_job_title,cv_url,cv_storage_path,video_url,video_storage_path,sales_experience,sales_experience_months,b2b_experience_months,digital_sales_experience,international_sales_experience,english_rating,previous_sales_results,target_markets,prospecting_channels,crm_experience,weekly_availability,available_days,available_hours_per_week,preferred_work_window,earliest_start_date,sample_outreach_message,professional_reference,heard_about_source,heard_about_detail,motivation,has_laptop_internet,comfortable_commission,comfortable_sourcing,comfortable_english_calls,video_commitment,accuracy_confirmed_at,privacy_consent_at,source,stage,notes,agreement_status,onboarding_status,onboarding_progress,final_approval,linked_user_id)
 VALUES(v_ref,'sales_role_v3',v_policy,v_now,v_name,v_email,v_phone,v_country,v_country_code,v_timezone,v_job.title,v_linkedin,NULLIF(trim(p_application->>'currentRole'),''),NULLIF(v_cv_url,''),NULLIF(v_cv_path,''),NULLIF(v_video_url,''),NULLIF(v_video_path,''),trim(p_application->>'salesExperience'),v_sales_months,v_b2b_months,NULLIF(trim(p_application->>'digitalSalesExperience'),''),NULLIF(trim(p_application->>'internationalSalesExperience'),''),p_application->>'englishRating',trim(p_application->>'previousSalesResults'),v_target_markets,v_channels,NULLIF(trim(p_application->>'crmExperience'),''),concat_ws(' | ','Hours/week: '||v_hours::text,'Days: '||array_to_string(v_days,', '),NULLIF(trim(p_application->>'preferredWorkWindow'),'')),v_days,v_hours,NULLIF(trim(p_application->>'preferredWorkWindow'),''),v_start,trim(p_application->>'sampleOutreachMessage'),NULLIF(trim(p_application->>'professionalReference'),''),NULLIF(trim(p_application->>'heardAboutSource'),''),NULLIF(trim(p_application->>'heardAboutDetail'),''),NULLIF(trim(p_application->>'message'),''),true,true,true,true,true,v_now,v_now,'ProFox Website','Video Review','Application V3 submitted through the canonical Sales job form.','not_sent','not_started',0,false,NULL) RETURNING id INTO v_new;
 IF v_cv_path<>'' THEN UPDATE public.recruitment_upload_intents SET used_at=v_now WHERE storage_path=v_cv_path AND used_at IS NULL;END IF;IF v_video_path<>'' THEN UPDATE public.recruitment_upload_intents SET used_at=v_now WHERE storage_path=v_video_path AND used_at IS NULL;END IF;
 RETURN jsonb_build_object('success',true,'applicant_id',v_new,'reference',v_ref,'stage','Video Review','message','Application received successfully.');
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'duplicate',true,'message','An active application under this email address is already being reviewed by our team.');WHEN invalid_text_representation THEN RETURN jsonb_build_object('success',false,'error','One or more application values are invalid. Please review the form and try again.');END$$;
REVOKE ALL ON FUNCTION public.submit_public_sales_application_v3(jsonb) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.submit_public_sales_application_v3(jsonb) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_applicant_review_snapshot(p_applicant_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.applicants%ROWTYPE;j public.career_jobs%ROWTYPE;cfg jsonb;min_months int;min_hours int;checks jsonb;passed int;total int;
BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required';END IF;SELECT * INTO a FROM public.applicants WHERE id=p_applicant_id;IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO j FROM public.career_jobs WHERE application_type='sales_representative' AND status='Published' ORDER BY featured DESC,published_at DESC NULLS LAST,created_at DESC LIMIT 1;cfg:=COALESCE(j.role_details->'applicationForm','{}');min_months:=GREATEST(0,COALESCE((cfg->>'minimumSalesExperienceMonths')::int,6));min_hours:=GREATEST(1,COALESCE((cfg->>'minimumWeeklyHours')::int,35));
 checks:=jsonb_build_array(jsonb_build_object('key','contact','label','Contact details complete','passed',COALESCE(a.phone,'')<>'' AND COALESCE(a.country,'')<>'' AND COALESCE(a.timezone,'')<>''),jsonb_build_object('key','linkedin','label','LinkedIn profile provided','passed',COALESCE(a.linkedin_url,'')<>''),jsonb_build_object('key','experience','label','Minimum sales experience','passed',COALESCE(a.sales_experience_months,0)>=min_months,'detail',COALESCE(a.sales_experience_months,0)||' / '||min_months||' months'),jsonb_build_object('key','availability','label','Minimum weekly availability','passed',COALESCE(a.available_hours_per_week,0)>=min_hours,'detail',COALESCE(a.available_hours_per_week,0)||' / '||min_hours||' hours'),jsonb_build_object('key','prospecting','label','Prospecting experience selected','passed',cardinality(COALESCE(a.prospecting_channels,'{}'))>0),jsonb_build_object('key','result','label','Previous sales result provided','passed',char_length(COALESCE(a.previous_sales_results,''))>=20),jsonb_build_object('key','outreach','label','Sample outreach provided','passed',char_length(COALESCE(a.sample_outreach_message,''))>=20),jsonb_build_object('key','cv','label','CV or resume available','passed',COALESCE(a.cv_storage_path,'')<>'' OR COALESCE(a.cv_url,'')<>''),jsonb_build_object('key','video','label','Introduction video available','passed',COALESCE(a.video_storage_path,'')<>'' OR COALESCE(a.video_url,'')<>''),jsonb_build_object('key','confirmations','label','Required applicant confirmations recorded','passed',a.has_laptop_internet IS TRUE AND a.comfortable_commission IS TRUE AND a.comfortable_sourcing IS TRUE AND a.comfortable_english_calls IS TRUE AND a.video_commitment IS TRUE),jsonb_build_object('key','consent','label','Accuracy and privacy consent recorded','passed',a.accuracy_confirmed_at IS NOT NULL AND a.privacy_consent_at IS NOT NULL));
 SELECT count(*),count(*) FILTER(WHERE(x->>'passed')::boolean) INTO total,passed FROM jsonb_array_elements(checks)x;
 RETURN jsonb_build_object('reference',a.application_reference,'applicationVersion',a.application_version,'policyVersion',a.application_policy_version,'submittedAt',COALESCE(a.application_submitted_at,a.created_at),'currentStage',a.stage,'checks',checks,'passedChecks',passed,'totalChecks',total,'completenessPercent',CASE WHEN total=0 THEN 0 ELSE round((passed::numeric/total::numeric)*100) END,'readyForReview',passed=total,'currentPolicy',jsonb_build_object('minimumSalesExperienceMonths',min_months,'minimumWeeklyHours',min_hours,'jobUpdatedAt',j.updated_at));END$$;
REVOKE ALL ON FUNCTION public.admin_get_applicant_review_snapshot(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.admin_get_applicant_review_snapshot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_applicant_timeline(p_applicant_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid;result jsonb;BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required';END IF;SELECT linked_user_id INTO v_user FROM public.applicants WHERE id=p_applicant_id;IF NOT FOUND THEN RETURN '[]'::jsonb;END IF;
 WITH timeline AS(
 SELECT e.id::text id,e.category,e.event_type type,e.title,e.detail,e.to_value status,e.occurred_at,COALESCE(up.full_name,CASE WHEN e.actor_type='applicant' THEN 'Applicant' ELSE initcap(e.actor_type) END) actor,jsonb_strip_nulls(e.metadata||jsonb_build_object('from',e.from_value,'to',e.to_value,'source',e.source_table)) metadata FROM public.applicant_events e LEFT JOIN public.user_profiles up ON up.id=e.actor_user_id WHERE e.applicant_id=p_applicant_id
 UNION ALL SELECT n.id::text||':queued','communication','email_queued','Email queued',n.template_key,n.status,n.created_at,'System',jsonb_strip_nulls(jsonb_build_object('templateKey',n.template_key,'recipient',n.recipient_email,'scheduledFor',n.scheduled_for,'attempts',n.attempts)) FROM public.notification_outbox n WHERE n.payload->>'applicantId'=p_applicant_id::text
 UNION ALL SELECT n.id::text||':delivery','communication',CASE WHEN n.status='Sent' THEN 'email_sent' WHEN n.status='Failed' THEN 'email_failed' WHEN n.status='Cancelled' THEN 'email_cancelled' ELSE 'email_delivery_update' END,CASE WHEN n.status='Sent' THEN 'Email sent' WHEN n.status='Failed' THEN 'Email failed' WHEN n.status='Cancelled' THEN 'Email cancelled' ELSE 'Email delivery updated' END,n.template_key,n.status,COALESCE(n.sent_at,n.last_attempt_at,n.updated_at),'Notification worker',jsonb_strip_nulls(jsonb_build_object('templateKey',n.template_key,'attempts',n.attempts,'providerMessageId',n.provider_message_id,'lastError',NULLIF(n.last_error,''),'sentAt',n.sent_at,'lastAttemptAt',n.last_attempt_at)) FROM public.notification_outbox n WHERE n.payload->>'applicantId'=p_applicant_id::text AND(n.sent_at IS NOT NULL OR n.last_attempt_at IS NOT NULL OR n.status IN('Failed','Cancelled'))
 UNION ALL SELECT ae.id::text,'agreement',ae.event_type,'Agreement: '||replace(initcap(replace(ae.event_type,'_',' ')),'  ',' '),NULL,NULL,ae.created_at,COALESCE(up.full_name,ae.actor_email,initcap(ae.actor_type)),jsonb_strip_nulls(COALESCE(ae.metadata,'{}')||jsonb_build_object('agreementNumber',ag.agreement_number,'ipAddress',ae.ip_address,'userAgent',ae.user_agent)) FROM public.sales_agreement_events ae JOIN public.sales_partner_agreements ag ON ag.id=ae.agreement_id LEFT JOIN public.user_profiles up ON up.id=ae.actor_user_id WHERE ag.applicant_id=p_applicant_id
 UNION ALL SELECT p.id::text||':started','training','training_module_started','Training module started',m.title,p.status,p.created_at,'Sales Academy',jsonb_build_object('moduleId',m.id,'moduleTitle',m.title,'progress',p.progress_percent,'score',p.score) FROM public.user_training_progress p JOIN public.training_modules m ON m.id=p.module_id WHERE v_user IS NOT NULL AND p.user_id=v_user
 UNION ALL SELECT p.id::text||':completed','training','training_module_completed','Training module completed',m.title,p.status,p.completed_at,'Sales Academy',jsonb_build_object('moduleId',m.id,'moduleTitle',m.title,'score',p.score,'attempts',p.attempts) FROM public.user_training_progress p JOIN public.training_modules m ON m.id=p.module_id WHERE v_user IS NOT NULL AND p.user_id=v_user AND p.completed_at IS NOT NULL
 UNION ALL SELECT p.id::text||':review','training','training_review','Training review recorded',m.title,p.review_status,p.reviewed_at,COALESCE(up.full_name,'Reviewer'),jsonb_build_object('moduleId',m.id,'moduleTitle',m.title,'score',p.score,'feedback',p.feedback) FROM public.user_training_progress p JOIN public.training_modules m ON m.id=p.module_id LEFT JOIN public.user_profiles up ON up.id=p.reviewed_by WHERE v_user IS NOT NULL AND p.user_id=v_user AND p.reviewed_at IS NOT NULL
 UNION ALL SELECT fe.id::text,'certification',fe.event_type,'Final certification: '||replace(initcap(replace(fe.event_type,'_',' ')),'  ',' '),fs.case_name_snapshot,fs.status,fe.created_at,COALESCE(up.full_name,'Certification system'),jsonb_strip_nulls(COALESCE(fe.event_data,'{}')||jsonb_build_object('sessionId',fs.id,'score',fs.score,'attemptNo',fs.attempt_no,'evaluatedAt',fs.evaluated_at)) FROM public.final_certification_events fe JOIN public.final_certification_sessions fs ON fs.id=fe.session_id LEFT JOIN public.user_profiles up ON up.id=fe.actor_user_id WHERE v_user IS NOT NULL AND fs.trainee_id=v_user)
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'category',category,'type',type,'title',title,'detail',detail,'status',status,'occurredAt',occurred_at,'actor',actor,'metadata',metadata) ORDER BY occurred_at DESC),'[]'::jsonb) INTO result FROM timeline;RETURN result;END$$;
REVOKE ALL ON FUNCTION public.admin_get_applicant_timeline(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.admin_get_applicant_timeline(uuid) TO authenticated;
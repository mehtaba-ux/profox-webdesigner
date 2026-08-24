-- Recruitment closure: campaign attribution + controlled Academy account invitation

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS landing_page text,
  ADD COLUMN IF NOT EXISTS referrer_url text,
  ADD COLUMN IF NOT EXISTS onboarding_invite_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_invite_last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_invite_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.applicants DROP CONSTRAINT IF EXISTS applicants_onboarding_invite_count_check;
ALTER TABLE public.applicants ADD CONSTRAINT applicants_onboarding_invite_count_check CHECK(onboarding_invite_count>=0);
CREATE INDEX IF NOT EXISTS idx_applicants_utm_source_campaign ON public.applicants(utm_source,utm_campaign) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applicants_invite_pending ON public.applicants(agreement_status,onboarding_invite_last_sent_at) WHERE linked_user_id IS NULL AND refusal_reason IS NULL;

INSERT INTO public.notification_templates(template_key,name,subject_template,body_template,active,description)
VALUES(
 'recruitment_account_invite',
 'Sales Academy account access',
 'Set up your ProFox Sales Academy access',
 'Hi {{fullName}},\n\nYour Sales Partner Agreement is complete. Set up your ProFox account to begin the required Sales Academy.\n\nSet up your account: {{accountInviteUrl}}\n\nThis account is limited to training while onboarding is in progress. CRM and live sales access are granted only after Final Approval and activation.\n\nProFox\nFrom site to system.',
 true,
 'Secure account setup link sent after the Sales Partner Agreement is verified.'
)
ON CONFLICT(template_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.protect_user_profile_privileged_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_invite text:=coalesce(current_setting('profox.sales_candidate_invite_rpc',true),'');
BEGIN
  IF public.is_admin() OR v_invite='1' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR OLD.id<>auth.uid() THEN RAISE EXCEPTION 'Unauthorized profile update.'; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status OR NEW.department IS DISTINCT FROM OLD.department OR NEW.manager IS DISTINCT FROM OLD.manager OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status OR NEW.onboarding_progress IS DISTINCT FROM OLD.onboarding_progress OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Privileged profile fields may only be changed by an Admin.';
  END IF;
  RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION public.service_link_invited_sales_candidate(p_applicant_id uuid,p_target_user_id uuid,p_account_invite_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_app public.applicants%rowtype;v_profile public.user_profiles%rowtype;v_outbox uuid;
BEGIN
 IF current_user NOT IN('postgres','service_role') AND coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required.'; END IF;
 SELECT * INTO v_app FROM public.applicants WHERE id=p_applicant_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found.'; END IF;
 IF coalesce(trim(v_app.refusal_reason),'')<>'' THEN RAISE EXCEPTION 'Closed candidates cannot receive onboarding access.'; END IF;
 IF v_app.stage NOT IN('Selected','Agreement Pending','One-Day Training') THEN RAISE EXCEPTION 'Candidate is not in an account-invitation stage.'; END IF;
 IF lower(coalesce(v_app.agreement_status,''))<>'signed' THEN RAISE EXCEPTION 'Verified Sales Partner Agreement is required before account access.'; END IF;
 IF length(trim(coalesce(p_account_invite_url,'')))<20 OR p_account_invite_url !~* '^https?://' THEN RAISE EXCEPTION 'A valid secure account setup URL is required.'; END IF;
 SELECT * INTO v_profile FROM public.user_profiles WHERE id=p_target_user_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Invited user profile not found.'; END IF;
 IF lower(trim(coalesce(v_profile.email,'')))<>lower(trim(coalesce(v_app.email,''))) THEN RAISE EXCEPTION 'Invited account email must exactly match the candidate application.'; END IF;
 IF v_profile.role='admin' THEN RAISE EXCEPTION 'An Admin account cannot be linked as a Sales trainee.'; END IF;
 IF v_profile.status='active' AND v_profile.role='sales' THEN RAISE EXCEPTION 'This account is already an active salesperson.'; END IF;
 IF EXISTS(SELECT 1 FROM public.applicants x WHERE x.linked_user_id=p_target_user_id AND x.id<>p_applicant_id AND x.stage<>'Activated' AND coalesce(trim(x.refusal_reason),'')='') THEN RAISE EXCEPTION 'This account is already linked to another active candidate.'; END IF;
 PERFORM set_config('profox.recruitment_stage_rpc','1',true);
 PERFORM set_config('profox.sales_candidate_invite_rpc','1',true);
 UPDATE public.applicants SET linked_user_id=p_target_user_id,stage='One-Day Training',onboarding_status='in_progress',onboarding_invite_sent_at=coalesce(onboarding_invite_sent_at,now()),onboarding_invite_last_sent_at=now(),onboarding_invite_count=onboarding_invite_count+1,updated_at=now() WHERE id=p_applicant_id;
 UPDATE public.user_profiles SET full_name=coalesce(nullif(trim(v_app.full_name),''),full_name),phone=coalesce(nullif(trim(v_app.phone),''),phone),country=coalesce(nullif(trim(v_app.country),''),country),timezone=coalesce(nullif(trim(v_app.timezone),''),timezone),role='sales',department='Sales',status='onboarding',onboarding_status='in_progress',onboarding_progress=least(coalesce(onboarding_progress,0),99),updated_at=now() WHERE id=p_target_user_id;
 v_outbox:=public.enqueue_notification('recruitment:'||p_applicant_id::text||':academy-account-invite:'||(v_app.onboarding_invite_count+1)::text,'recruitment_account_invite',lower(trim(v_app.email)),p_target_user_id,public.recruitment_notification_payload(v_app)||jsonb_build_object('accountInviteUrl',p_account_invite_url,'applicationReference',v_app.application_reference),now());
 PERFORM public.log_applicant_event(p_applicant_id,'account','academy_account_invited','Sales Academy account invitation sent','The candidate account was securely linked in onboarding mode.',v_profile.status,'onboarding','system',NULL,'user_profiles',p_target_user_id,jsonb_build_object('inviteNumber',v_app.onboarding_invite_count+1,'outboxId',v_outbox));
 RETURN jsonb_build_object('success',true,'linkedUserId',p_target_user_id,'stage','One-Day Training','status','onboarding','inviteNumber',v_app.onboarding_invite_count+1);
END;$$;
REVOKE ALL ON FUNCTION public.service_link_invited_sales_candidate(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_link_invited_sales_candidate(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_get_recruitment_source_funnel()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_result jsonb;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.'; END IF;
 WITH base AS(
  SELECT coalesce(nullif(trim(utm_source),''),nullif(trim(heard_about_source),''),nullif(trim(source),''),'Unknown') source_key,
         coalesce(nullif(trim(utm_campaign),''),'') campaign,
         stage,refusal_reason
  FROM public.applicants
 ), grouped AS(
  SELECT source_key,campaign,count(*) applications,
   count(*) FILTER(WHERE public.recruitment_stage_rank(stage)>=5 AND coalesce(trim(refusal_reason),'')='') shortlisted,
   count(*) FILTER(WHERE public.recruitment_stage_rank(stage)>=9 AND coalesce(trim(refusal_reason),'')='') selected,
   count(*) FILTER(WHERE stage='Activated') activated,
   count(*) FILTER(WHERE coalesce(trim(refusal_reason),'')<>'') closed
  FROM base GROUP BY source_key,campaign
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',source_key,'campaign',campaign,'applications',applications,'shortlisted',shortlisted,'selected',selected,'activated',activated,'closed',closed) ORDER BY applications DESC,source_key,campaign),'[]'::jsonb) INTO v_result FROM grouped;
 RETURN v_result;
END;$$;
GRANT EXECUTE ON FUNCTION public.admin_get_recruitment_source_funnel() TO authenticated;

-- Extend V3 core to preserve technical campaign attribution and the canonical job id.
CREATE OR REPLACE FUNCTION public.submit_public_sales_application_v3_core(p_application jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','storage','pg_temp' AS $$
DECLARE v_job public.career_jobs%ROWTYPE;v_cfg jsonb;v_min_months int;v_min_hours int;v_email text:=lower(trim(coalesce(p_application->>'email','')));v_name text:=trim(coalesce(p_application->>'fullName',''));
 v_phone text:=regexp_replace(trim(coalesce(p_application->>'phone','')),'[[:space:]()-]','','g');v_country text:=trim(coalesce(p_application->>'country',''));v_country_code text:=upper(trim(coalesce(p_application->>'countryCode','')));v_timezone text:=trim(coalesce(p_application->>'timezone',''));
 v_linkedin text:=trim(coalesce(p_application->>'linkedinUrl',''));v_cv_url text:=trim(coalesce(p_application->>'cvUrl',''));v_video_url text:=trim(coalesce(p_application->>'videoUrl',''));v_cv_path text:=trim(coalesce(p_application->>'cvStoragePath',''));v_video_path text:=trim(coalesce(p_application->>'videoStoragePath',''));
 v_sales_months int;v_b2b_months int;v_hours int;v_start date;v_target_markets text[]:=ARRAY[]::text[];v_channels text[]:=ARRAY[]::text[];v_days text[]:=ARRAY[]::text[];v_existing uuid;v_new uuid;v_ref text;v_now timestamptz:=clock_timestamp();v_policy text;
 v_utm_source text:=left(nullif(trim(coalesce(p_application->>'utmSource','')),''),200);v_utm_medium text:=left(nullif(trim(coalesce(p_application->>'utmMedium','')),''),200);v_utm_campaign text:=left(nullif(trim(coalesce(p_application->>'utmCampaign','')),''),300);v_utm_content text:=left(nullif(trim(coalesce(p_application->>'utmContent','')),''),300);v_utm_term text:=left(nullif(trim(coalesce(p_application->>'utmTerm','')),''),300);v_landing text:=left(nullif(trim(coalesce(p_application->>'landingPage','')),''),1000);v_referrer text:=left(nullif(trim(coalesce(p_application->>'referrerUrl','')),''),1000);
BEGIN
 IF jsonb_typeof(coalesce(p_application,'{}'::jsonb))<>'object' THEN RETURN jsonb_build_object('success',false,'error','Invalid application payload.');END IF;
 IF p_application?'targetMarkets' AND jsonb_typeof(p_application->'targetMarkets')<>'array' THEN RETURN jsonb_build_object('success',false,'field','targetMarkets','error','Target markets must be a list.');END IF;
 IF p_application?'prospectingChannels' AND jsonb_typeof(p_application->'prospectingChannels')<>'array' THEN RETURN jsonb_build_object('success',false,'field','prospectingChannels','error','Prospecting channels must be a list.');END IF;
 IF p_application?'availableDays' AND jsonb_typeof(p_application->'availableDays')<>'array' THEN RETURN jsonb_build_object('success',false,'field','availableDays','error','Available days must be a list.');END IF;
 v_target_markets:=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_application->'targetMarkets','[]'::jsonb)) LIMIT 20);v_channels:=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_application->'prospectingChannels','[]'::jsonb)) LIMIT 30);v_days:=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_application->'availableDays','[]'::jsonb)) LIMIT 7);
 SELECT * INTO v_job FROM public.career_jobs WHERE application_type='sales_representative' AND status='Published' AND(closes_at IS NULL OR closes_at>now()) ORDER BY featured DESC,published_at DESC NULLS LAST,created_at DESC LIMIT 1; IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','This role is not currently accepting applications.');END IF;
 v_cfg:=coalesce(v_job.role_details->'applicationForm','{}');v_min_months:=greatest(0,coalesce((v_cfg->>'minimumSalesExperienceMonths')::int,6));v_min_hours:=greatest(1,coalesce((v_job.role_details->'workingArrangement'->>'expectedHoursPerWeek')::int,(v_cfg->>'minimumWeeklyHours')::int,35));v_policy:='sales-job:'||v_job.id::text||':'||to_char(v_job.updated_at AT TIME ZONE 'UTC','YYYYMMDDHH24MISSMS');
 BEGIN v_sales_months:=(p_application->>'salesExperienceMonths')::int;EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'field','salesExperienceMonths','error','Provide total sales experience in months.');END;
 BEGIN v_b2b_months:=nullif(p_application->>'b2bExperienceMonths','')::int;EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'field','b2bExperienceMonths','error','Provide valid B2B experience in months.');END;
 BEGIN v_hours:=(p_application->>'availableHoursPerWeek')::int;EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'field','availableHoursPerWeek','error','Provide your available hours per week.');END;
 BEGIN v_start:=nullif(p_application->>'earliestStartDate','')::date;EXCEPTION WHEN others THEN RETURN jsonb_build_object('success',false,'field','earliestStartDate','error','Provide a valid earliest start date.');END;
 IF char_length(v_name)<2 THEN RETURN jsonb_build_object('success',false,'field','fullName','error','Please provide your full name.');END IF;
 IF v_email!~*'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RETURN jsonb_build_object('success',false,'field','email','error','Please provide a valid email address.');END IF;
 IF v_phone!~'^\+[1-9][0-9]{7,14}$' THEN RETURN jsonb_build_object('success',false,'field','phone','error','Use an international phone number with country code, for example +14155552671.');END IF;
 IF v_country='' OR v_country_code!~'^[A-Z]{2}$' THEN RETURN jsonb_build_object('success',false,'field','country','error','Please select your country.');END IF;
 IF v_timezone='' OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN RETURN jsonb_build_object('success',false,'field','timezone','error','Please select a valid time zone.');END IF;
 IF v_linkedin!~*'^https?://([^/]+\.)?linkedin\.com/' THEN RETURN jsonb_build_object('success',false,'field','linkedinUrl','error','Please provide a valid LinkedIn profile URL.');END IF;
 IF v_sales_months<v_min_months THEN RETURN jsonb_build_object('success',false,'field','salesExperienceMonths','error','This role currently requires at least '||v_min_months||' months of sales experience.');END IF;
 IF v_sales_months>600 OR coalesce(v_b2b_months,0)>600 THEN RETURN jsonb_build_object('success',false,'error','Experience values are outside the allowed range.');END IF;
 IF char_length(trim(coalesce(p_application->>'salesExperience','')))<20 THEN RETURN jsonb_build_object('success',false,'field','salesExperience','error','Please describe your sales experience with enough detail for review.');END IF;
 IF char_length(trim(coalesce(p_application->>'previousSalesResults','')))<20 THEN RETURN jsonb_build_object('success',false,'field','previousSalesResults','error','Please describe one measurable sales result.');END IF;
 IF v_hours<v_min_hours OR v_hours>80 THEN RETURN jsonb_build_object('success',false,'field','availableHoursPerWeek','error','This role currently requires at least '||v_min_hours||' available hours per week.');END IF;
 IF cardinality(v_days)=0 THEN RETURN jsonb_build_object('success',false,'field','availableDays','error','Select at least one available working day.');END IF;
 IF char_length(trim(coalesce(p_application->>'sampleOutreachMessage','')))<20 THEN RETURN jsonb_build_object('success',false,'field','sampleOutreachMessage','error','Please provide a short sample cold outreach message.');END IF;
 IF coalesce(p_application->>'englishRating','') NOT IN('Fluent / Native','Professional working proficiency','Conversational') THEN RETURN jsonb_build_object('success',false,'field','englishRating','error','Please select your English level.');END IF;
 IF cardinality(v_target_markets)=0 THEN RETURN jsonb_build_object('success',false,'field','targetMarkets','error','Select at least one target market that describes your experience.');END IF;
 IF cardinality(v_channels)=0 THEN RETURN jsonb_build_object('success',false,'field','prospectingChannels','error','Select at least one prospecting channel you have used.');END IF;
 IF coalesce((p_application->>'hasLaptopInternet')::boolean,false) IS DISTINCT FROM true THEN RETURN jsonb_build_object('success',false,'error','Confirm that you have the required equipment and reliable internet.');END IF;IF coalesce((p_application->>'comfortableCommission')::boolean,false) IS DISTINCT FROM true THEN RETURN jsonb_build_object('success',false,'error','Confirm that the commission-based starting model works for you.');END IF;IF coalesce((p_application->>'comfortableSourcing')::boolean,false) IS DISTINCT FROM true THEN RETURN jsonb_build_object('success',false,'error','Confirm that you can initially source your own qualified leads.');END IF;IF coalesce((p_application->>'comfortableEnglishCalls')::boolean,false) IS DISTINCT FROM true THEN RETURN jsonb_build_object('success',false,'error','Confirm that you can conduct professional English sales conversations.');END IF;IF coalesce((p_application->>'videoCommitment')::boolean,false) IS DISTINCT FROM true THEN RETURN jsonb_build_object('success',false,'error','Confirm the required 60-120 second English introduction video.');END IF;
 IF coalesce((p_application->>'consentAccurate')::boolean,false) IS DISTINCT FROM true OR coalesce((p_application->>'consentPrivacy')::boolean,false) IS DISTINCT FROM true THEN RETURN jsonb_build_object('success',false,'error','Accuracy and privacy confirmations are required.');END IF;
 IF v_start IS NULL OR v_start<current_date THEN RETURN jsonb_build_object('success',false,'field','earliestStartDate','error','Earliest start date must be today or a future date.');END IF;
 IF v_cv_path='' AND v_cv_url='' THEN RETURN jsonb_build_object('success',false,'field','cv','error','Upload your CV/resume or provide a shareable link.');END IF;IF v_video_path='' AND v_video_url='' THEN RETURN jsonb_build_object('success',false,'field','video','error','Upload your introduction video or provide a shareable link.');END IF;
 IF v_cv_url<>'' AND v_cv_url!~*'^https?://' THEN RETURN jsonb_build_object('success',false,'field','cvUrl','error','CV link must begin with http:// or https://.');END IF;IF v_video_url<>'' AND v_video_url!~*'^https?://' THEN RETURN jsonb_build_object('success',false,'field','videoUrl','error','Video link must begin with http:// or https://.');END IF;
 IF v_cv_path<>'' AND NOT EXISTS(SELECT 1 FROM public.recruitment_upload_intents i JOIN storage.objects o ON o.bucket_id='recruitment-applications' AND o.name=i.storage_path WHERE i.storage_path=v_cv_path AND i.email_normalized=v_email AND i.kind='cv' AND i.used_at IS NULL AND i.expires_at>now() AND coalesce((o.metadata->>'size')::bigint,0)<=i.max_bytes AND lower(coalesce(o.metadata->>'mimetype',''))=lower(i.content_type)) THEN RETURN jsonb_build_object('success',false,'field','cv','error','The uploaded CV could not be verified. Please upload it again or use a shareable link.');END IF;
 IF v_video_path<>'' AND NOT EXISTS(SELECT 1 FROM public.recruitment_upload_intents i JOIN storage.objects o ON o.bucket_id='recruitment-applications' AND o.name=i.storage_path WHERE i.storage_path=v_video_path AND i.email_normalized=v_email AND i.kind='video' AND i.used_at IS NULL AND i.expires_at>now() AND coalesce((o.metadata->>'size')::bigint,0)<=i.max_bytes AND lower(coalesce(o.metadata->>'mimetype',''))=lower(i.content_type)) THEN RETURN jsonb_build_object('success',false,'field','video','error','The uploaded video could not be verified. Please upload it again or use a shareable link.');END IF;
 IF EXISTS(SELECT 1 FROM public.user_profiles WHERE lower(trim(email))=v_email AND role='sales' AND status='active') THEN RETURN jsonb_build_object('success',false,'duplicate',true,'message','This email is already associated with an active ProFox sales representative account.');END IF;
 SELECT id INTO v_existing FROM public.applicants WHERE lower(trim(email))=v_email AND coalesce(trim(refusal_reason),'')='' AND stage<>'Activated' ORDER BY created_at DESC LIMIT 1;IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',false,'duplicate',true,'message','An active application under this email address is already being reviewed by our team.');END IF;
 v_ref:=public.next_sales_application_reference();
 INSERT INTO public.applicants(application_reference,application_version,application_policy_version,application_submitted_at,career_job_id,stage_entered_at,full_name,email,phone,country,country_code,timezone,position,linkedin_url,current_job_title,cv_url,cv_storage_path,video_url,video_storage_path,sales_experience,sales_experience_months,b2b_experience_months,digital_sales_experience,international_sales_experience,english_rating,previous_sales_results,target_markets,prospecting_channels,crm_experience,weekly_availability,available_days,available_hours_per_week,preferred_work_window,earliest_start_date,sample_outreach_message,professional_reference,heard_about_source,heard_about_detail,motivation,has_laptop_internet,comfortable_commission,comfortable_sourcing,comfortable_english_calls,video_commitment,accuracy_confirmed_at,privacy_consent_at,source,stage,notes,agreement_status,onboarding_status,onboarding_progress,final_approval,linked_user_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term,landing_page,referrer_url)
 VALUES(v_ref,'sales_role_v3',v_policy,v_now,v_job.id,v_now,v_name,v_email,v_phone,v_country,v_country_code,v_timezone,v_job.title,v_linkedin,nullif(trim(p_application->>'currentRole'),''),nullif(v_cv_url,''),nullif(v_cv_path,''),nullif(v_video_url,''),nullif(v_video_path,''),trim(p_application->>'salesExperience'),v_sales_months,v_b2b_months,nullif(trim(p_application->>'digitalSalesExperience'),''),nullif(trim(p_application->>'internationalSalesExperience'),''),p_application->>'englishRating',trim(p_application->>'previousSalesResults'),v_target_markets,v_channels,nullif(trim(p_application->>'crmExperience'),''),concat_ws(' | ','Hours/week: '||v_hours::text,'Days: '||array_to_string(v_days,', '),nullif(trim(p_application->>'preferredWorkWindow'),'')),v_days,v_hours,nullif(trim(p_application->>'preferredWorkWindow'),''),v_start,trim(p_application->>'sampleOutreachMessage'),nullif(trim(p_application->>'professionalReference'),''),nullif(trim(p_application->>'heardAboutSource'),''),nullif(trim(p_application->>'heardAboutDetail'),''),nullif(trim(p_application->>'message'),''),true,true,true,true,true,v_now,v_now,'ProFox Website','Video Review','Application V3 submitted through the canonical Sales job form.','not_sent','not_started',0,false,NULL,v_utm_source,v_utm_medium,v_utm_campaign,v_utm_content,v_utm_term,v_landing,v_referrer) RETURNING id INTO v_new;
 IF v_cv_path<>'' THEN UPDATE public.recruitment_upload_intents SET used_at=v_now WHERE storage_path=v_cv_path AND used_at IS NULL;END IF;IF v_video_path<>'' THEN UPDATE public.recruitment_upload_intents SET used_at=v_now WHERE storage_path=v_video_path AND used_at IS NULL;END IF;
 RETURN jsonb_build_object('success',true,'applicant_id',v_new,'reference',v_ref,'stage','Video Review','message','Application received successfully.');
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'duplicate',true,'message','An active application under this email address is already being reviewed by our team.');WHEN invalid_text_representation THEN RETURN jsonb_build_object('success',false,'error','One or more application values are invalid. Please review the form and try again.');END$$;

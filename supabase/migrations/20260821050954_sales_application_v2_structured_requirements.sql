ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS previous_sales_results text,
  ADD COLUMN IF NOT EXISTS weekly_availability text,
  ADD COLUMN IF NOT EXISTS sample_outreach_message text,
  ADD COLUMN IF NOT EXISTS professional_reference text;

DROP FUNCTION IF EXISTS public.submit_public_application(text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,boolean,text,text,text,text);

CREATE FUNCTION public.submit_public_application(
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
  p_message text DEFAULT '',
  p_previous_sales_results text DEFAULT '',
  p_weekly_availability text DEFAULT '',
  p_sample_outreach_message text DEFAULT '',
  p_professional_reference text DEFAULT '',
  p_application_version text DEFAULT 'legacy'
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
  v_v2 boolean:=COALESCE(p_application_version,'legacy')='sales_role_v2';
BEGIN
  IF v_name IS NULL OR char_length(v_name)<2 THEN RETURN jsonb_build_object('success',false,'error','Please provide a valid full name.'); END IF;
  IF v_email IS NULL OR v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN RETURN jsonb_build_object('success',false,'error','Please provide a valid email address.'); END IF;
  IF COALESCE(trim(p_country),'')='' THEN RETURN jsonb_build_object('success',false,'error','Please provide your country.'); END IF;
  IF char_length(trim(COALESCE(p_sales_experience,'')))<2 THEN RETURN jsonb_build_object('success',false,'error','Please tell us about your sales or business development experience.'); END IF;
  IF v_video='' OR v_video !~* '^https?://' THEN RETURN jsonb_build_object('success',false,'error','A valid shareable link to your 60-120 second introduction video is required.'); END IF;
  IF p_comfortable_commission IS DISTINCT FROM true THEN RETURN jsonb_build_object('success',false,'error','This opportunity is commission-based. Please apply only if this model works for you.'); END IF;
  IF p_has_laptop_internet IS DISTINCT FROM true THEN RETURN jsonb_build_object('success',false,'error','A reliable laptop and internet connection are required for this remote sales role.'); END IF;

  IF v_v2 THEN
    IF COALESCE(trim(p_phone),'')='' THEN RETURN jsonb_build_object('success',false,'error','Please provide your WhatsApp or contact number.'); END IF;
    IF COALESCE(trim(p_linkedin_url),'')='' OR trim(p_linkedin_url) !~* '^https?://' THEN RETURN jsonb_build_object('success',false,'error','Please provide a valid LinkedIn profile URL.'); END IF;
    IF COALESCE(trim(p_cv_url),'')='' OR trim(p_cv_url) !~* '^https?://' THEN RETURN jsonb_build_object('success',false,'error','Please provide a shareable CV or resume link.'); END IF;
    IF char_length(trim(COALESCE(p_previous_sales_results,'')))<5 THEN RETURN jsonb_build_object('success',false,'error','Please describe a previous sales result.'); END IF;
    IF char_length(trim(COALESCE(p_weekly_availability,'')))<2 THEN RETURN jsonb_build_object('success',false,'error','Please provide your weekly availability.'); END IF;
    IF char_length(trim(COALESCE(p_sample_outreach_message,'')))<20 THEN RETURN jsonb_build_object('success',false,'error','Please provide a short sample cold outreach message.'); END IF;
  END IF;

  IF EXISTS(SELECT 1 FROM public.user_profiles WHERE lower(trim(email))=v_email AND role='sales' AND status='active') THEN
    RETURN jsonb_build_object('success',false,'duplicate',true,'message','This email is already associated with an active ProFox sales representative account.');
  END IF;
  SELECT id INTO v_existing FROM public.applicants WHERE lower(trim(email))=v_email AND COALESCE(trim(refusal_reason),'')='' AND stage<>'Activated' ORDER BY created_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',false,'duplicate',true,'message','An active application under this email address is already being reviewed by our team.'); END IF;

  v_notes:=concat_ws(E'\n',
    'Current Role: '||COALESCE(NULLIF(trim(p_current_role),''),'N/A'),
    'Digital/SaaS Exp: '||COALESCE(NULLIF(trim(p_digital_sales_experience),''),'N/A'),
    'International Sales Exp: '||COALESCE(NULLIF(trim(p_international_sales_experience),''),'N/A'),
    'English Rating: '||COALESCE(NULLIF(trim(p_english_rating),''),'N/A'),
    'Availability: '||COALESCE(NULLIF(trim(p_weekly_availability),''),NULLIF(trim(p_availability),''),'N/A'),
    'Previous Sales Results: '||COALESCE(NULLIF(trim(p_previous_sales_results),''),'N/A'),
    'Sample Outreach: '||COALESCE(NULLIF(trim(p_sample_outreach_message),''),'N/A'),
    'Professional Reference: '||COALESCE(NULLIF(trim(p_professional_reference),''),'Not provided'),
    'Laptop/Internet Ready: Yes',
    'Commission Model Agreed: Yes',
    'Self-Sourcing Ready: '||CASE WHEN p_comfortable_sourcing THEN 'Yes' ELSE 'No' END,
    'Referral Source: '||COALESCE(NULLIF(trim(p_referral_source),''),'ProFox Website'),
    'Message/Motivation: '||COALESCE(NULLIF(trim(p_message),''),'N/A')
  );

  BEGIN
    INSERT INTO public.applicants(
      full_name,email,phone,country,timezone,position,linkedin_url,cv_url,video_url,sales_experience,
      previous_sales_results,weekly_availability,sample_outreach_message,professional_reference,
      source,stage,notes,agreement_status,onboarding_status,onboarding_progress,final_approval,linked_user_id
    ) VALUES (
      v_name,v_email,COALESCE(p_phone,''),trim(p_country),COALESCE(NULLIF(trim(p_timezone),''),'UTC'),
      'Independent Commission-Based Sales Representative',COALESCE(p_linkedin_url,''),COALESCE(p_cv_url,''),v_video,trim(p_sales_experience),
      NULLIF(trim(p_previous_sales_results),''),NULLIF(trim(COALESCE(p_weekly_availability,p_availability)),''),NULLIF(trim(p_sample_outreach_message),''),NULLIF(trim(p_professional_reference),''),
      'ProFox Website','Video Review',v_notes,'not_sent','not_started',0,false,NULL
    ) RETURNING id INTO v_new;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success',false,'duplicate',true,'message','An active application under this email address is already being reviewed by our team.');
  END;
  RETURN jsonb_build_object('success',true,'applicant_id',v_new,'stage','Video Review','message','Application received successfully.');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_application(text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,boolean,text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_application(text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,boolean,text,text,text,text,text,text,text,text,text) TO anon, authenticated;

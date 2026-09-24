-- Public recruitment duplicate protection under concurrent submissions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_applicants_unique_active_email
ON public.applicants ((lower(trim(email))))
WHERE COALESCE(trim(refusal_reason),'')='' AND stage<>'Activated';

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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text:=lower(trim(p_email));
  v_name text:=trim(p_full_name);
  v_stage text;
  v_existing uuid;
  v_new uuid;
  v_notes text;
BEGIN
  IF v_name IS NULL OR char_length(v_name)<2 THEN RETURN jsonb_build_object('success',false,'error','Please provide a valid full name.'); END IF;
  IF v_email IS NULL OR v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN RETURN jsonb_build_object('success',false,'error','Please provide a valid email address.'); END IF;

  IF EXISTS(SELECT 1 FROM public.user_profiles WHERE lower(trim(email))=v_email AND role='sales' AND status='active') THEN
    RETURN jsonb_build_object('success',false,'duplicate',true,'message','This email is already associated with an active ProFox sales representative account.');
  END IF;

  SELECT id INTO v_existing FROM public.applicants
  WHERE lower(trim(email))=v_email AND COALESCE(trim(refusal_reason),'')='' AND stage<>'Activated'
  ORDER BY created_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'duplicate',true,'message','An active application under this email address is already being reviewed by our team.');
  END IF;

  v_stage:=CASE WHEN COALESCE(trim(p_video_url),'')<>'' THEN 'Video Review' ELSE 'Video Pending' END;
  v_notes:=concat_ws(E'\n',
    'Current Role: '||COALESCE(NULLIF(trim(p_current_role),''),'N/A'),
    'Digital/SaaS Exp: '||COALESCE(NULLIF(trim(p_digital_sales_experience),''),'N/A'),
    'International Sales Exp: '||COALESCE(NULLIF(trim(p_international_sales_experience),''),'N/A'),
    'English Rating: '||COALESCE(NULLIF(trim(p_english_rating),''),'N/A'),
    'Availability: '||COALESCE(NULLIF(trim(p_availability),''),'N/A'),
    'Laptop/Internet Ready: '||CASE WHEN p_has_laptop_internet THEN 'Yes' ELSE 'No' END,
    'Commission Model Agreed: '||CASE WHEN p_comfortable_commission THEN 'Yes' ELSE 'No' END,
    'Self-Sourcing Ready: '||CASE WHEN p_comfortable_sourcing THEN 'Yes' ELSE 'No' END,
    'Referral Source: '||COALESCE(NULLIF(trim(p_referral_source),''),'ProFox Website'),
    'Message/Motivation: '||COALESCE(NULLIF(trim(p_message),''),'N/A')
  );

  BEGIN
    INSERT INTO public.applicants(full_name,email,phone,country,timezone,position,linkedin_url,cv_url,video_url,sales_experience,source,stage,notes,agreement_status,onboarding_status,onboarding_progress,final_approval,linked_user_id)
    VALUES(v_name,v_email,COALESCE(p_phone,''),COALESCE(p_country,''),COALESCE(NULLIF(p_timezone,''),'UTC'),'Independent Commission-Based Sales Representative',COALESCE(p_linkedin_url,''),COALESCE(p_cv_url,''),COALESCE(p_video_url,''),COALESCE(p_sales_experience,''),'ProFox Website',v_stage,v_notes,'not_sent','not_started',0,false,NULL)
    RETURNING id INTO v_new;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success',false,'duplicate',true,'message','An active application under this email address is already being reviewed by our team.');
  END;

  RETURN jsonb_build_object('success',true,'applicant_id',v_new,'stage',v_stage,'message','Application received successfully.');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_application(text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,boolean,text,text,text,text) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_application(text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,boolean,text,text,text,text) TO anon;

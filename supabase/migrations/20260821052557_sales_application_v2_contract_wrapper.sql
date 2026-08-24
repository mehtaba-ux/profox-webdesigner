CREATE OR REPLACE FUNCTION public.submit_public_sales_application_v2(p_application jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_timezone text:=trim(COALESCE(p_application->>'timezone',''));
BEGIN
  IF jsonb_typeof(COALESCE(p_application,'{}'::jsonb)) <> 'object' THEN
    RETURN jsonb_build_object('success',false,'error','Invalid application payload.');
  END IF;
  IF v_timezone='' THEN
    RETURN jsonb_build_object('success',false,'error','Please provide your time zone.');
  END IF;
  RETURN public.submit_public_application(
    p_full_name=>COALESCE(p_application->>'fullName',''),
    p_email=>COALESCE(p_application->>'email',''),
    p_phone=>COALESCE(p_application->>'phone',''),
    p_country=>COALESCE(p_application->>'country',''),
    p_timezone=>v_timezone,
    p_linkedin_url=>COALESCE(p_application->>'linkedinUrl',''),
    p_current_role=>COALESCE(p_application->>'currentRole',''),
    p_sales_experience=>COALESCE(p_application->>'salesExperience',''),
    p_digital_sales_experience=>COALESCE(p_application->>'digitalSalesExperience',''),
    p_international_sales_experience=>COALESCE(p_application->>'internationalSalesExperience',''),
    p_english_rating=>COALESCE(p_application->>'englishRating',''),
    p_availability=>COALESCE(p_application->>'weeklyAvailability',p_application->>'availability',''),
    p_has_laptop_internet=>COALESCE((p_application->>'hasLaptopInternet')::boolean,false),
    p_comfortable_commission=>COALESCE((p_application->>'comfortableCommission')::boolean,false),
    p_comfortable_sourcing=>COALESCE((p_application->>'comfortableSourcing')::boolean,false),
    p_cv_url=>COALESCE(p_application->>'cvUrl',''),
    p_video_url=>COALESCE(p_application->>'videoUrl',''),
    p_referral_source=>COALESCE(p_application->>'referralSource','ProFox Website'),
    p_message=>COALESCE(p_application->>'message',''),
    p_previous_sales_results=>COALESCE(p_application->>'previousSalesResults',''),
    p_weekly_availability=>COALESCE(p_application->>'weeklyAvailability',''),
    p_sample_outreach_message=>COALESCE(p_application->>'sampleOutreachMessage',''),
    p_professional_reference=>COALESCE(p_application->>'professionalReference',''),
    p_application_version=>'sales_role_v2'
  );
EXCEPTION WHEN invalid_text_representation THEN
  RETURN jsonb_build_object('success',false,'error','Invalid application confirmation values.');
END;
$$;
REVOKE ALL ON FUNCTION public.submit_public_sales_application_v2(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_sales_application_v2(jsonb) TO anon, authenticated;

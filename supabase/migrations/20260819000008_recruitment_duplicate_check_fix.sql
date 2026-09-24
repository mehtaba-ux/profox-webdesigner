-- ==============================================================================
-- ProFox CRM - Migration 20260819000008
-- Recruitment Duplicate Application Logic Fix
-- ==============================================================================

-- Update submit_public_application RPC to check refusal_reason instead of non-existent stages
CREATE OR REPLACE FUNCTION public.submit_public_application(
  p_full_name TEXT,
  p_email TEXT,
  p_phone TEXT DEFAULT '',
  p_country TEXT DEFAULT '',
  p_timezone TEXT DEFAULT 'UTC',
  p_linkedin_url TEXT DEFAULT '',
  p_current_role TEXT DEFAULT '',
  p_sales_experience TEXT DEFAULT '',
  p_digital_sales_experience TEXT DEFAULT '',
  p_international_sales_experience TEXT DEFAULT '',
  p_english_rating TEXT DEFAULT '',
  p_availability TEXT DEFAULT '',
  p_has_laptop_internet BOOLEAN DEFAULT TRUE,
  p_comfortable_commission BOOLEAN DEFAULT TRUE,
  p_comfortable_sourcing BOOLEAN DEFAULT TRUE,
  p_cv_url TEXT DEFAULT '',
  p_video_url TEXT DEFAULT '',
  p_referral_source TEXT DEFAULT '',
  p_message TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_email TEXT;
  v_clean_name TEXT;
  v_stage TEXT;
  v_existing_id UUID;
  v_new_id UUID;
  v_notes_summary TEXT;
BEGIN
  -- Normalize inputs
  v_clean_email := LOWER(TRIM(p_email));
  v_clean_name := TRIM(p_full_name);

  -- 1. Basic validation
  IF v_clean_name IS NULL OR CHAR_LENGTH(v_clean_name) < 2 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Please provide a valid full name.'
    );
  END IF;

  IF v_clean_email IS NULL OR v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Please provide a valid email address.'
    );
  END IF;

  -- 2. Check for existing active application (no refusal_reason set and stage != 'Activated')
  SELECT id INTO v_existing_id
  FROM public.applicants
  WHERE LOWER(email) = v_clean_email
    AND (refusal_reason IS NULL OR TRIM(refusal_reason) = '')
    AND stage NOT IN ('Activated')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'duplicate', true,
      'message', 'An active application under this email address is already being reviewed by our team. Thank you for your interest in ProFox!'
    );
  END IF;

  -- 3. Determine initial recruitment stage
  IF TRIM(COALESCE(p_video_url, '')) != '' THEN
    v_stage := 'Video Review';
  ELSE
    v_stage := 'Video Pending';
  END IF;

  -- 4. Build notes summary
  v_notes_summary := CONCAT(
    'Current Role: ', COALESCE(NULLIF(TRIM(p_current_role), ''), 'N/A'), E'\n',
    'Digital/SaaS Exp: ', COALESCE(NULLIF(TRIM(p_digital_sales_experience), ''), 'N/A'), E'\n',
    'International Sales Exp: ', COALESCE(NULLIF(TRIM(p_international_sales_experience), ''), 'N/A'), E'\n',
    'English Rating: ', COALESCE(NULLIF(TRIM(p_english_rating), ''), 'N/A'), E'\n',
    'Availability: ', COALESCE(NULLIF(TRIM(p_availability), ''), 'N/A'), E'\n',
    'Laptop/Internet Ready: ', CASE WHEN p_has_laptop_internet THEN 'Yes' ELSE 'No' END, E'\n',
    'Commission Model Agreed: ', CASE WHEN p_comfortable_commission THEN 'Yes' ELSE 'No' END, E'\n',
    'Self-Sourcing Ready: ', CASE WHEN p_comfortable_sourcing THEN 'Yes' ELSE 'No' END, E'\n',
    'Referral Source: ', COALESCE(NULLIF(TRIM(p_referral_source), ''), 'ProFox Website'), E'\n',
    'Message/Motivation: ', COALESCE(NULLIF(TRIM(p_message), ''), 'N/A')
  );

  -- 5. Insert applicant record safely
  INSERT INTO public.applicants (
    full_name,
    email,
    phone,
    country,
    timezone,
    position,
    linkedin_url,
    cv_url,
    video_url,
    sales_experience,
    source,
    stage,
    notes,
    agreement_status,
    onboarding_status,
    onboarding_progress,
    final_approval,
    linked_user_id
  ) VALUES (
    v_clean_name,
    v_clean_email,
    COALESCE(p_phone, ''),
    COALESCE(p_country, ''),
    COALESCE(p_timezone, 'UTC'),
    'Independent Sales Representative',
    COALESCE(p_linkedin_url, ''),
    COALESCE(p_cv_url, ''),
    COALESCE(p_video_url, ''),
    COALESCE(p_sales_experience, ''),
    'ProFox Website',
    v_stage,
    v_notes_summary,
    'not_sent',
    'not_started',
    0,
    false,
    null
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'applicant_id', v_new_id,
    'stage', v_stage,
    'message', 'Application received successfully! Our talent acquisition team will review your details and intro video.'
  );
END;
$$;

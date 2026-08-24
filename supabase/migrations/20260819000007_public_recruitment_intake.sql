-- ==============================================================================
-- ProFox CRM - Migration 20260819000007
-- Public Recruitment Intake, Security Policy & RPC Function
-- ==============================================================================

-- 1. Ensure anonymous users do NOT have direct INSERT/UPDATE/DELETE access to public.applicants.
-- Public candidate submissions must strictly go through the secure submit_public_application SECURITY DEFINER RPC.
DROP POLICY IF EXISTS "Public candidates can submit applications" ON public.applicants;

-- 2. Create or replace secure RPC function for public job application submission
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

  -- 2. Check for existing active application to prevent spam / duplicate submissions
  SELECT id INTO v_existing_id
  FROM public.applicants
  WHERE LOWER(email) = v_clean_email
    AND stage NOT IN ('Rejected', 'Archived')
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

  -- 4. Build comprehensive notes summary for admin context
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

  -- 5. Insert applicant record safely (preventing injection of final_approval or linked_user_id)
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
    TRIM(COALESCE(p_phone, '')),
    TRIM(COALESCE(p_country, '')),
    TRIM(COALESCE(p_timezone, 'UTC')),
    'Independent Sales Representative',
    TRIM(COALESCE(p_linkedin_url, '')),
    TRIM(COALESCE(p_cv_url, '')),
    TRIM(COALESCE(p_video_url, '')),
    TRIM(COALESCE(p_sales_experience, '')),
    'ProFox Website',
    v_stage,
    v_notes_summary,
    'not_sent',
    'not_started',
    0,
    FALSE,
    NULL
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'applicant_id', v_new_id,
    'stage', v_stage,
    'message', 'Application received successfully! Our talent acquisition team will review your details and intro video.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant EXECUTE to anonymous and authenticated web visitors
REVOKE EXECUTE ON FUNCTION public.submit_public_application FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_application TO anon, authenticated;

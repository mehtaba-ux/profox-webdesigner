-- ==============================================================================
-- ProFox CRM & Team Management - Recruitment & Applicants Schema Migration
-- Module 2 - Job 1: Recruitment & Team Management Foundation
-- ==============================================================================

-- 1. Create Applicants Table
CREATE TABLE IF NOT EXISTS public.applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  country TEXT DEFAULT '',
  timezone TEXT DEFAULT 'UTC',
  position TEXT NOT NULL DEFAULT 'Sales Representative',
  linkedin_url TEXT DEFAULT '',
  cv_url TEXT DEFAULT '',
  video_url TEXT DEFAULT '',
  sales_experience TEXT DEFAULT '',
  skills TEXT DEFAULT '',
  source TEXT DEFAULT 'Manual Entry',
  
  -- Recruitment Progress
  stage TEXT NOT NULL DEFAULT 'New Application',
  rating INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  refusal_reason TEXT DEFAULT NULL,
  
  -- Agreement & Onboarding
  agreement_status TEXT NOT NULL DEFAULT 'not_sent',
  onboarding_status TEXT NOT NULL DEFAULT 'not_started',
  onboarding_progress INTEGER DEFAULT 0,
  final_approval BOOLEAN NOT NULL DEFAULT false,
  
  -- Links
  linked_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  -- Stage constraint (Exact ProFox pipeline)
  CONSTRAINT valid_stage CHECK (
    stage IN (
      'New Application',
      'Video Pending',
      'Video Review',
      'Initial Screening',
      'Shortlisted',
      'Sales Assessment',
      'Lead Research Test',
      'CRM Assessment',
      'Selected',
      'Agreement Pending',
      'One-Day Training',
      'Final Approval',
      'Ready for System Access',
      'Ready for Odoo Access', -- Legacy compatibility
      'Activated'
    )
  ),

  -- Rating constraint
  CONSTRAINT valid_rating CHECK (rating >= 0 AND rating <= 5),

  -- Agreement status constraint
  CONSTRAINT valid_agreement_status CHECK (
    agreement_status IN ('not_sent', 'sent', 'signed', 'declined')
  ),

  -- Onboarding status constraint
  CONSTRAINT valid_onboarding_status CHECK (
    onboarding_status IN ('not_started', 'in_progress', 'completed', 'failed')
  )
);

-- 2. Create Indexes
CREATE INDEX IF NOT EXISTS idx_applicants_email ON public.applicants(email);
CREATE INDEX IF NOT EXISTS idx_applicants_stage ON public.applicants(stage);
CREATE INDEX IF NOT EXISTS idx_applicants_linked_user ON public.applicants(linked_user_id);

-- 3. Automatic Updated_at Trigger
CREATE TRIGGER trigger_applicants_updated_at
  BEFORE UPDATE ON public.applicants
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4. Enable RLS
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;

-- 5. Policies for public.applicants

-- Policy 1: Admin and active staff can view all applicants
CREATE POLICY "Admins and active staff can view applicants"
  ON public.applicants
  FOR SELECT
  USING (public.is_admin() OR public.is_active_staff());

-- Policy 2: Only Admins can insert/update/delete applicants in this version
CREATE POLICY "Admins can manage applicants"
  ON public.applicants
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 6. Helper to check if applicant is ready for activation
CREATE OR REPLACE FUNCTION public.check_applicant_activation_ready(applicant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  ready BOOLEAN;
BEGIN
  SELECT (
    final_approval = true 
    AND agreement_status = 'signed'
    AND onboarding_status = 'completed'
    AND linked_user_id IS NOT NULL
  ) INTO ready
  FROM public.applicants
  WHERE id = applicant_id;
  
  RETURN COALESCE(ready, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

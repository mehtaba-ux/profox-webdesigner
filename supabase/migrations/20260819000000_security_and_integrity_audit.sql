-- ==============================================================================
-- ProFox CRM - Production Security & Data Integrity Audit Hardening
-- Module 5 - Job 1: Comprehensive Security, Transactional & RLS Hardening
-- ==============================================================================

-- 1. DROP FAULTY AND INSECURE POLICIES THAT REFERENCED THE NON-EXISTENT user_roles TABLE
DROP POLICY IF EXISTS "Admins have full access to projects" ON public.projects;
DROP POLICY IF EXISTS "PMs can manage their own projects" ON public.projects;
DROP POLICY IF EXISTS "Team members can view assigned projects" ON public.projects;
DROP POLICY IF EXISTS "Admins and PMs can manage team" ON public.project_team;
DROP POLICY IF EXISTS "Admins and PMs can manage all tasks in their projects" ON public.project_tasks;
DROP POLICY IF EXISTS "Team members can view tasks in assigned projects" ON public.project_tasks;

DROP POLICY IF EXISTS "Admins manage training modules" ON public.training_modules;
DROP POLICY IF EXISTS "Admins manage training lessons" ON public.training_lessons;
DROP POLICY IF EXISTS "Admins view all progress" ON public.user_training_progress;
DROP POLICY IF EXISTS "Admins update all progress" ON public.user_training_progress;
DROP POLICY IF EXISTS "Admins view all assignments" ON public.training_assignments;
DROP POLICY IF EXISTS "Admins manage reviews" ON public.training_reviews;


-- 2. RE-DEFINE CORRECT SECURITY-FIRST RLS POLICIES USING public.is_admin()

-- public.projects
CREATE POLICY "Admins have full access to projects" 
    ON public.projects FOR ALL 
    TO authenticated 
    USING (public.is_admin());

CREATE POLICY "PMs can manage their own projects" 
    ON public.projects FOR ALL 
    TO authenticated 
    USING (project_manager_id = auth.uid() OR public.is_admin());

CREATE POLICY "Team members can view assigned projects" 
    ON public.projects FOR SELECT 
    TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.project_team WHERE project_id = projects.id AND user_id = auth.uid()) OR
        project_manager_id = auth.uid() OR
        public.is_admin()
    );

-- public.project_team
CREATE POLICY "Admins and PMs can manage team" 
    ON public.project_team FOR ALL 
    TO authenticated 
    USING (
        public.is_admin() OR
        EXISTS (SELECT 1 FROM public.projects WHERE id = project_team.project_id AND project_manager_id = auth.uid())
    );

-- public.project_tasks
CREATE POLICY "Admins and PMs can manage all tasks in their projects" 
    ON public.project_tasks FOR ALL 
    TO authenticated 
    USING (
        public.is_admin() OR
        EXISTS (SELECT 1 FROM public.projects WHERE id = project_tasks.project_id AND project_manager_id = auth.uid())
    );

CREATE POLICY "Team members can view tasks in assigned projects" 
    ON public.project_tasks FOR SELECT 
    TO authenticated 
    USING (
        EXISTS (SELECT 1 FROM public.project_team WHERE project_id = project_tasks.project_id AND user_id = auth.uid()) OR
        public.is_admin()
    );

-- public.training_modules
CREATE POLICY "Admins manage training modules" 
    ON public.training_modules FOR ALL 
    TO authenticated 
    USING (public.is_admin());

-- public.training_lessons
CREATE POLICY "Admins manage training lessons" 
    ON public.training_lessons FOR ALL 
    TO authenticated 
    USING (public.is_admin());

-- public.user_training_progress
CREATE POLICY "Admins view all progress" 
    ON public.user_training_progress FOR SELECT 
    TO authenticated 
    USING (public.is_admin());

CREATE POLICY "Admins update all progress" 
    ON public.user_training_progress FOR ALL 
    TO authenticated 
    USING (public.is_admin());

-- public.training_assignments
CREATE POLICY "Admins view all assignments" 
    ON public.training_assignments FOR SELECT 
    TO authenticated 
    USING (public.is_admin());

-- public.training_reviews
CREATE POLICY "Admins manage reviews" 
    ON public.training_reviews FOR ALL 
    TO authenticated 
    USING (public.is_admin());


-- 3. HARDEN WORKFLOWS AND SENSITIVE DATABASE STATE TRANSITIONS

-- Prevent Non-Admins from self-completing onboarding or elevating status in public.user_profiles
DROP POLICY IF EXISTS "Users can update their own personal info" ON public.user_profiles;
CREATE POLICY "Users can update their own personal info"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      -- Admins can update anything
      public.is_admin()
      OR (
        -- Regular user cannot change role, status, department, onboarding_status, or onboarding_progress
        role = (SELECT p.role FROM public.user_profiles p WHERE p.id = auth.uid())
        AND status = (SELECT p.status FROM public.user_profiles p WHERE p.id = auth.uid())
        AND department = (SELECT p.department FROM public.user_profiles p WHERE p.id = auth.uid())
        AND onboarding_status = (SELECT p.onboarding_status FROM public.user_profiles p WHERE p.id = auth.uid())
        AND onboarding_progress = (SELECT p.onboarding_progress FROM public.user_profiles p WHERE p.id = auth.uid())
      )
    )
  );

-- Prevent Trainees from self-passing modules or review tampering in public.user_training_progress
DROP POLICY IF EXISTS "Users update own progress" ON public.user_training_progress;
CREATE POLICY "Users update own progress" 
  ON public.user_training_progress FOR UPDATE 
  TO authenticated 
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      -- Admins can do anything
      public.is_admin()
      OR (
        -- Regular user cannot modify review audit trail
        (reviewed_by IS NULL OR reviewed_by = (SELECT p.reviewed_by FROM public.user_training_progress p WHERE p.id = id))
        AND (reviewed_at IS NULL OR reviewed_at = (SELECT p.reviewed_at FROM public.user_training_progress p WHERE p.id = id))
        AND (feedback IS NULL OR feedback = (SELECT p.feedback FROM public.user_training_progress p WHERE p.id = id))
        AND (review_status IS NULL OR review_status = (SELECT p.review_status FROM public.user_training_progress p WHERE p.id = id))
        AND (
          -- Trainees cannot self-pass/complete any modules requiring admin review
          (status NOT IN ('Passed', 'Completed') OR NOT EXISTS (
            SELECT 1 FROM public.training_modules m 
            WHERE m.id = module_id AND m.requires_admin_review = TRUE
          ))
        )
      )
    )
  );


-- 4. QUOTATION SECURITY: PREVENT SELF-APPROVAL AND ENFORCE STATUS VALIDATIONS
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS check_not_self_approved;
ALTER TABLE public.quotations ADD CONSTRAINT check_not_self_approved CHECK (approved_by IS NULL OR approved_by != salesperson_id);

ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS check_approval_for_sent_accepted;
ALTER TABLE public.quotations ADD CONSTRAINT check_approval_for_sent_accepted CHECK (status NOT IN ('Sent', 'Accepted') OR approved_by IS NOT NULL);

-- Enforce that salespersons cannot self-approve their own quotations in RLS
DROP POLICY IF EXISTS "Sales can manage their own quotations" ON public.quotations;
DROP POLICY IF EXISTS "Sales can update their own quotations" ON public.quotations;

-- Split the quotations management policy for sales representatives
CREATE POLICY "Sales can view their own quotations" ON public.quotations FOR SELECT USING (salesperson_id = auth.uid());
CREATE POLICY "Sales can insert their own quotations" ON public.quotations FOR INSERT WITH CHECK (
  salesperson_id = auth.uid() AND status IN ('Draft', 'Ready for Approval')
);
CREATE POLICY "Sales can update their own quotations" ON public.quotations FOR UPDATE USING (salesperson_id = auth.uid()) WITH CHECK (
  salesperson_id = auth.uid()
  AND (
    public.is_admin()
    OR (
      -- Sales cannot self-approve or tamper with approved audits
      (approved_by IS NULL OR approved_by = (SELECT q.approved_by FROM public.quotations q WHERE q.id = id))
      AND (approved_at IS NULL OR approved_at = (SELECT q.approved_at FROM public.quotations q WHERE q.id = id))
      AND (status != 'Approved')
    )
  )
);
CREATE POLICY "Sales can delete their own draft quotations" ON public.quotations FOR DELETE USING (
  salesperson_id = auth.uid() AND status = 'Draft'
);


-- 5. PAYMENT SECURITY: PREVENT PAYMENT TAMPERING & MULTIPLE ACTIVE ADVANCES

-- Re-split payments policy for sales representatives to completely block self-verification
DROP POLICY IF EXISTS "Sales can manage their own payments" ON public.payments;
DROP POLICY IF EXISTS "Sales can view their own payments" ON public.payments;
DROP POLICY IF EXISTS "Sales can insert their own payments" ON public.payments;
DROP POLICY IF EXISTS "Sales can update their own payments" ON public.payments;
DROP POLICY IF EXISTS "Sales can delete their own draft payments" ON public.payments;

CREATE POLICY "Sales can view their own payments" ON public.payments FOR SELECT USING (salesperson_id = auth.uid());
CREATE POLICY "Sales can insert their own payments" ON public.payments FOR INSERT WITH CHECK (
  salesperson_id = auth.uid() 
  AND status IN ('Draft', 'Ready', 'Sent', 'Pending')
);
CREATE POLICY "Sales can update their own payments" ON public.payments FOR UPDATE USING (salesperson_id = auth.uid()) WITH CHECK (
  salesperson_id = auth.uid()
  AND (
    public.is_admin()
    OR (
      -- Regular sales rep cannot verify payments or tamper with verification audits
      (status != 'Verified')
      AND (verified_by IS NULL OR verified_by = (SELECT p.verified_by FROM public.payments p WHERE p.id = id))
      AND (verified_at IS NULL OR verified_at = (SELECT p.verified_at FROM public.payments p WHERE p.id = id))
    )
  )
);
CREATE POLICY "Sales can delete their own draft payments" ON public.payments FOR DELETE USING (
  salesperson_id = auth.uid() 
  AND status = 'Draft'
);

-- Enforce that there can be at most one active Advance payment per quotation/sale
DROP INDEX IF EXISTS public.idx_unique_active_advance_payment;
CREATE UNIQUE INDEX idx_unique_active_advance_payment 
ON public.payments (quotation_id) 
WHERE (payment_type = 'Advance' AND status NOT IN ('Cancelled', 'Failed'));


-- 6. PROJECT INTEGRITY: ENFORCE ONE-PROJECT-PER-SALE CONSTRAINTS
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS unique_source_opportunity;
ALTER TABLE public.projects ADD CONSTRAINT unique_source_opportunity UNIQUE (source_opportunity_id);


-- 7. RE-DEFINE SECURE CALLER-VERIFIED SECURITY DEFINER DATABASE FUNCTIONS

-- Atomic User Activation RPC (harden authorization & validation checks)
CREATE OR REPLACE FUNCTION public.activate_salesperson(target_user_id UUID, admin_id UUID DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    v_applicant_id UUID;
    v_stage TEXT;
    v_agreement_status TEXT;
    v_onboarding_status TEXT;
    v_final_approval BOOLEAN;
BEGIN
    -- A. Secure Caller Authorization (ignore client-supplied admin_id parameter)
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only an active Admin can perform final candidate activation.';
    END IF;

    -- B. Verify candidate applicant record exists and linked
    SELECT id, stage, agreement_status, onboarding_status, final_approval
    INTO v_applicant_id, v_stage, v_agreement_status, v_onboarding_status, v_final_approval
    FROM public.applicants
    WHERE linked_user_id = target_user_id;

    IF v_applicant_id IS NULL THEN
        RAISE EXCEPTION 'Candidate record not found for the linked account.';
    END IF;

    -- C. Strict security and readiness checks
    IF COALESCE(v_agreement_status, '') != 'signed' THEN
        RAISE EXCEPTION 'Candidate cannot be activated: Sales Agreement has not been signed.';
    END IF;

    IF COALESCE(v_onboarding_status, '') != 'completed' THEN
        RAISE EXCEPTION 'Candidate cannot be activated: Training and onboarding requirements are incomplete.';
    END IF;

    IF COALESCE(v_final_approval, FALSE) = FALSE THEN
        RAISE EXCEPTION 'Candidate cannot be activated: Missing final Admin approval.';
    END IF;

    -- D. Update User Profile atomically
    UPDATE public.user_profiles
    SET 
        status = 'active',
        role = 'sales',
        onboarding_status = 'completed',
        onboarding_progress = 100,
        updated_at = NOW()
    WHERE id = target_user_id;

    -- E. Update Applicant Record atomically
    UPDATE public.applicants
    SET 
        stage = 'Activated',
        onboarding_status = 'completed',
        onboarding_progress = 100,
        updated_at = NOW()
    WHERE id = v_applicant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Atomic Payment Verification RPC (harden caller verification and de-duplicate client)
CREATE OR REPLACE FUNCTION public.verify_payment_atomic(p_payment_id UUID, p_admin_id UUID DEFAULT NULL, p_notes TEXT DEFAULT '')
RETURNS VOID AS $$
DECLARE
    v_payment_type TEXT;
    v_opp_id UUID;
    v_quote_id UUID;
    v_client_id UUID;
    v_total_value NUMERIC;
    v_currency TEXT;
    v_company_name TEXT;
    v_contact_name TEXT;
    v_email TEXT;
    v_phone TEXT;
    v_country TEXT;
    v_industry TEXT;
    v_salesperson_id UUID;
    v_caller_id UUID := auth.uid();
BEGIN
    -- A. Secure Caller Authorization (ignore client-supplied p_admin_id parameter)
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only an active Admin can verify payments.';
    END IF;

    -- B. Retrieve payment record details
    SELECT payment_type, opportunity_id, quotation_id 
    INTO v_payment_type, v_opp_id, v_quote_id
    FROM public.payments WHERE id = p_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment record not found.';
    END IF;

    -- C. Update Payment record securely with verified audit log
    UPDATE public.payments
    SET 
        status = 'Verified',
        verified_at = NOW(),
        verified_by = v_caller_id,
        notes = COALESCE(p_notes, notes)
    WHERE id = p_payment_id;

    -- D. Transactionally handle CRM Opportunity and client creation on Advance Payment Verification
    IF v_payment_type = 'Advance' AND v_opp_id IS NOT NULL THEN
        -- Mark associated opportunity as Won
        UPDATE public.crm_opportunities
        SET 
            status = 'Won',
            stage = 'Won',
            won_at = NOW()
        WHERE id = v_opp_id;

        -- Check if client is already created and linked
        SELECT client_id INTO v_client_id FROM public.crm_opportunities WHERE id = v_opp_id;

        IF v_client_id IS NULL THEN
            -- Retrieve opportunity details to construct client profile
            SELECT 
                company_name, contact_name, email, phone, country, industry, salesperson_id, expected_value, currency
            INTO 
                v_company_name, v_contact_name, v_email, v_phone, v_country, v_industry, v_salesperson_id, v_total_value, v_currency
            FROM public.crm_opportunities WHERE id = v_opp_id;

            -- Safe precision de-duplication: check for exact email match before inserting a new client record
            SELECT id INTO v_client_id FROM public.clients WHERE email = v_email LIMIT 1;

            IF v_client_id IS NULL THEN
                -- Insert new client profile
                INSERT INTO public.clients (
                    company_name, primary_contact_name, email, phone, country, industry, salesperson_id, 
                    source_opportunity_id, first_quotation_id, total_sales_value, currency, status
                ) VALUES (
                    v_company_name, v_contact_name, v_email, v_phone, v_country, v_industry, v_salesperson_id,
                    v_opp_id, v_quote_id, v_total_value, v_currency, 'Active'
                ) RETURNING id INTO v_client_id;
            END IF;

            -- Associate the client ID across pipeline and quotations
            UPDATE public.crm_opportunities SET client_id = v_client_id WHERE id = v_opp_id;
            UPDATE public.quotations SET client_id = v_client_id WHERE id = v_quote_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

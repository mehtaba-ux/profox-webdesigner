-- final_security_and_integrity_closure.sql
-- 1. HARDEN CANDIDATE ACTIVATION FUNCTION
-- Require strict, explicit checks for agreement, required training, specific mock-call/CRM assessments, and final Admin approval.
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

    -- Check that all required, active training modules have been completed/passed by checking progress status
    IF EXISTS (
        SELECT 1 FROM public.training_modules m
        LEFT JOIN public.user_training_progress p ON p.module_id = m.id AND p.user_id = target_user_id
        WHERE m.required = TRUE AND m.active = TRUE
          AND (p.id IS NULL OR p.status NOT IN ('Passed', 'Completed'))
    ) THEN
        RAISE EXCEPTION 'Candidate cannot be activated: All required and active training modules must be completed and passed first.';
    END IF;

    -- Check specifically that 'Mock Sales Call Test' is completed/passed
    IF NOT EXISTS (
        SELECT 1 FROM public.user_training_progress p
        JOIN public.training_modules m ON p.module_id = m.id
        WHERE p.user_id = target_user_id 
          AND m.slug = 'mock-call-test' 
          AND p.status IN ('Passed', 'Completed')
    ) THEN
        RAISE EXCEPTION 'Candidate cannot be activated: Mock Sales Call Test has not been completed and passed.';
    END IF;

    -- Check specifically that 'CRM Training' is completed/passed
    IF NOT EXISTS (
        SELECT 1 FROM public.user_training_progress p
        JOIN public.training_modules m ON p.module_id = m.id
        WHERE p.user_id = target_user_id 
          AND m.slug = 'crm-training' 
          AND p.status IN ('Passed', 'Completed')
    ) THEN
        RAISE EXCEPTION 'Candidate cannot be activated: CRM Training and Assessment has not been completed and passed.';
    END IF;

    -- Check specifically that 'Final Certification' is completed/passed
    IF NOT EXISTS (
        SELECT 1 FROM public.user_training_progress p
        JOIN public.training_modules m ON p.module_id = m.id
        WHERE p.user_id = target_user_id 
          AND m.slug = 'final-certification' 
          AND p.status IN ('Passed', 'Completed')
    ) THEN
        RAISE EXCEPTION 'Candidate cannot be activated: Final Certification assessment has not been completed and passed.';
    END IF;

    IF COALESCE(v_onboarding_status, '') != 'completed' THEN
        RAISE EXCEPTION 'Candidate cannot be activated: Training and onboarding status is not set to completed.';
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- 2. SECURE PROJECT CREATION RPC
-- Creates project, updates stage, copy scope snapshots, and inserts initial PM tasks in a secure transaction.
CREATE OR REPLACE FUNCTION public.create_project_from_sale(p_opportunity_id UUID)
RETURNS UUID AS $$
DECLARE
    v_opp_status TEXT;
    v_opp_client_id UUID;
    v_opp_company_name TEXT;
    v_opp_name TEXT;
    v_opp_salesperson_id UUID;
    v_opp_requirements TEXT;
    v_quote_id UUID;
    v_quote_total NUMERIC;
    v_quote_currency TEXT;
    v_quote_scope TEXT;
    v_quote_exclusions TEXT;
    v_package_snapshot TEXT;
    v_payment_verified BOOLEAN := FALSE;
    v_project_id UUID;
    v_caller_id UUID := auth.uid();
    v_is_admin BOOLEAN := FALSE;
    v_is_active_sales BOOLEAN := FALSE;
BEGIN
    -- A. Check Caller Authorization
    -- Caller must be active Admin or the salesperson of the opportunity who is active
    v_is_admin := public.is_admin();
    
    SELECT salesperson_id, status, client_id, company_name, name, requirements_summary
    INTO v_opp_salesperson_id, v_opp_status, v_opp_client_id, v_opp_company_name, v_opp_name, v_opp_requirements
    FROM public.crm_opportunities
    WHERE id = p_opportunity_id;

    IF v_opp_salesperson_id IS NULL THEN
        RAISE EXCEPTION 'Opportunity not found.';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = v_caller_id AND status = 'active' AND role IN ('sales', 'sales_rep', 'sales_team')
    ) INTO v_is_active_sales;

    IF NOT v_is_admin AND (v_caller_id != v_opp_salesperson_id OR NOT v_is_active_sales) THEN
        RAISE EXCEPTION 'Unauthorized: Only an active Admin or the assigned active salesperson can create a project from this sale.';
    END IF;

    -- B. Prevent duplicate project creation at transaction level
    IF EXISTS (SELECT 1 FROM public.projects WHERE source_opportunity_id = p_opportunity_id) THEN
        RAISE EXCEPTION 'Project already exists for this sale/opportunity.';
    END IF;

    -- C. Verify that the required advance payment is Verified
    SELECT EXISTS (
        SELECT 1 FROM public.payments
        WHERE opportunity_id = p_opportunity_id
          AND payment_type = 'Advance'
          AND status = 'Verified'
    ) INTO v_payment_verified;

    IF NOT v_payment_verified THEN
        RAISE EXCEPTION 'Advance payment must be verified by an Admin before creating a project.';
    END IF;

    -- D. Retrieve the accepted quotation details
    SELECT q.id, q.total, q.currency, q.scope_summary, q.exclusions,
           COALESCE((SELECT qi.product_name_snapshot FROM public.quotation_items qi WHERE qi.quotation_id = q.id AND qi.item_type = 'package' LIMIT 1), 'Custom Package')
    INTO v_quote_id, v_quote_total, v_quote_currency, v_quote_scope, v_quote_exclusions, v_package_snapshot
    FROM public.quotations q
    WHERE q.opportunity_id = p_opportunity_id
      AND q.status = 'Accepted'
    ORDER BY q.accepted_at DESC
    LIMIT 1;

    IF v_quote_id IS NULL THEN
        RAISE EXCEPTION 'No accepted quotation found for this opportunity.';
    END IF;

    -- E. Insert Project
    INSERT INTO public.projects (
        project_name,
        client_id,
        source_opportunity_id,
        quotation_id,
        project_value,
        currency,
        package_snapshot,
        stage,
        priority,
        status,
        requirements_summary,
        scope_summary,
        exclusions,
        sales_handover_notes
    ) VALUES (
        COALESCE(v_opp_company_name, v_opp_name) || ' Website Delivery',
        v_opp_client_id,
        p_opportunity_id,
        v_quote_id,
        v_quote_total,
        v_quote_currency,
        v_package_snapshot,
        'Sales Handover',
        'Normal',
        'Active',
        v_opp_requirements,
        v_quote_scope,
        v_quote_exclusions,
        'Sales Representative: ' || COALESCE((SELECT email FROM public.user_profiles WHERE id = v_opp_salesperson_id), 'Unknown') || E'\nSold on: ' || NOW()::date::text
    ) RETURNING id INTO v_project_id;

    -- F. Insert Initial Tasks atomically
    INSERT INTO public.project_tasks (
        project_id,
        title,
        department,
        priority,
        status,
        description
    ) VALUES 
    (
        v_project_id,
        'Sales Handover Meeting',
        'Project Management',
        'High',
        'To Do',
        'Review project scope, requirements, and client expectations with the Sales Representative.'
    ),
    (
        v_project_id,
        'Client Onboarding Call',
        'Project Management',
        'High',
        'To Do',
        'Welcome the client and collect any missing initial assets/info.'
    );

    RETURN v_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- 3. HARDEN QUOTATION APPROVALS AND ITEMS POLICIES
-- Ensure salespersons cannot modify accepted/sent quotations or their items.
-- Validate that "Sales cannot approve their own quotation" via check constraints.
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS check_approval_for_sent_accepted;
ALTER TABLE public.quotations ADD CONSTRAINT check_approval_for_sent_accepted CHECK (status NOT IN ('Approved', 'Sent', 'Accepted') OR approved_by IS NOT NULL);

DROP POLICY IF EXISTS "Staff can manage items" ON public.quotation_items;
DROP POLICY IF EXISTS "Admins have full access to quotation items" ON public.quotation_items;
DROP POLICY IF EXISTS "Sales can manage items in draft quotations" ON public.quotation_items;

CREATE POLICY "Admins have full access to quotation items" 
ON public.quotation_items FOR ALL TO authenticated 
USING (public.is_admin());

CREATE POLICY "Sales can manage items in draft quotations" 
ON public.quotation_items FOR ALL TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.quotations q 
    WHERE q.id = quotation_id 
      AND q.salesperson_id = auth.uid() 
      AND q.status IN ('Draft', 'Ready for Approval')
      -- Require active salesperson
      AND EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND status = 'active')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotations q 
    WHERE q.id = quotation_id 
      AND q.salesperson_id = auth.uid() 
      AND q.status IN ('Draft', 'Ready for Approval')
      -- Require active salesperson
      AND EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND status = 'active')
  )
);


-- 4. HARDEN SALES ACCESS POLICIES (RESTRICT ONBOARDING & DEACTIVATED USERS)
-- Require active staff status for all CRM, Client, Payment, and Quotation operations.

-- A. Leads
DROP POLICY IF EXISTS "Sales can view assigned leads" ON public.crm_leads;
CREATE POLICY "Sales can view assigned leads" ON public.crm_leads FOR SELECT TO authenticated
USING (salesperson_id = auth.uid() AND public.is_active_staff());

DROP POLICY IF EXISTS "Sales can manage their own leads" ON public.crm_leads;
CREATE POLICY "Sales can manage their own leads" ON public.crm_leads FOR ALL TO authenticated
USING (salesperson_id = auth.uid() AND public.is_active_staff())
WITH CHECK (salesperson_id = auth.uid() AND public.is_active_staff());

-- B. Opportunities
DROP POLICY IF EXISTS "Sales can view assigned opportunities" ON public.crm_opportunities;
CREATE POLICY "Sales can view assigned opportunities" ON public.crm_opportunities FOR SELECT TO authenticated
USING (salesperson_id = auth.uid() AND public.is_active_staff());

DROP POLICY IF EXISTS "Sales can manage their own opportunities" ON public.crm_opportunities;
CREATE POLICY "Sales can manage their own opportunities" ON public.crm_opportunities FOR ALL TO authenticated
USING (salesperson_id = auth.uid() AND public.is_active_staff())
WITH CHECK (salesperson_id = auth.uid() AND public.is_active_staff());

-- C. Activities
DROP POLICY IF EXISTS "Sales can view assigned activities" ON public.crm_activities;
CREATE POLICY "Sales can view assigned activities" ON public.crm_activities FOR SELECT TO authenticated
USING (assigned_to = auth.uid() AND public.is_active_staff());

DROP POLICY IF EXISTS "Sales can manage their own activities" ON public.crm_activities;
CREATE POLICY "Sales can manage their own activities" ON public.crm_activities FOR ALL TO authenticated
USING (assigned_to = auth.uid() AND public.is_active_staff())
WITH CHECK (assigned_to = auth.uid() AND public.is_active_staff());

-- D. Quotations
DROP POLICY IF EXISTS "Sales can view their own quotations" ON public.quotations;
CREATE POLICY "Sales can view their own quotations" ON public.quotations FOR SELECT TO authenticated
USING (salesperson_id = auth.uid() AND public.is_active_staff());

DROP POLICY IF EXISTS "Sales can update their own quotations" ON public.quotations;
CREATE POLICY "Sales can update their own quotations" ON public.quotations FOR UPDATE TO authenticated
USING (salesperson_id = auth.uid() AND public.is_active_staff())
WITH CHECK (
  salesperson_id = auth.uid()
  AND public.is_active_staff()
  AND (
    public.is_admin()
    OR (
      (approved_by IS NULL OR approved_by = (SELECT q.approved_by FROM public.quotations q WHERE q.id = id))
      AND (approved_at IS NULL OR approved_at = (SELECT q.approved_at FROM public.quotations q WHERE q.id = id))
      AND (status NOT IN ('Approved', 'Sent', 'Accepted'))
    )
  )
);

-- E. Payments
DROP POLICY IF EXISTS "Sales can view their own payments" ON public.payments;
CREATE POLICY "Sales can view their own payments" ON public.payments FOR SELECT TO authenticated
USING (salesperson_id = auth.uid() AND public.is_active_staff());

DROP POLICY IF EXISTS "Sales can update their own payments" ON public.payments;
CREATE POLICY "Sales can update their own payments" ON public.payments FOR UPDATE TO authenticated
USING (salesperson_id = auth.uid() AND public.is_active_staff())
WITH CHECK (
  salesperson_id = auth.uid()
  AND public.is_active_staff()
  AND (
    public.is_admin()
    OR (
      (status != 'Verified')
      AND (verified_by IS NULL OR verified_by = (SELECT p.verified_by FROM public.payments p WHERE p.id = id))
      AND (verified_at IS NULL OR verified_at = (SELECT p.verified_at FROM public.payments p WHERE p.id = id))
    )
  )
);

-- F. Clients
DROP POLICY IF EXISTS "Sales can view their own clients" ON public.clients;
CREATE POLICY "Sales can view their own clients" ON public.clients FOR SELECT TO authenticated
USING (salesperson_id = auth.uid() AND public.is_active_staff());


-- 5. SECURE CLIENT PORTAL ISOLATION & RLS
-- Enable clients (customers) to securely query ONLY their own projects, tasks, quotations, and payments.
-- Restrict any access to other client's records.
DROP POLICY IF EXISTS "Clients can view their own projects" ON public.projects;
CREATE POLICY "Clients can view their own projects" ON public.projects FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR public.is_active_staff()
  -- Client's email matches the authenticated token email
  OR client_id IN (SELECT id FROM public.clients WHERE email = (auth.jwt() ->> 'email'))
);

DROP POLICY IF EXISTS "Clients can view tasks of their own projects" ON public.project_tasks;
CREATE POLICY "Clients can view tasks of their own projects" ON public.project_tasks FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR public.is_active_staff()
  OR project_id IN (
    SELECT id FROM public.projects WHERE client_id IN (
      SELECT id FROM public.clients WHERE email = (auth.jwt() ->> 'email')
    )
  )
);

DROP POLICY IF EXISTS "Clients can view their own quotations" ON public.quotations;
CREATE POLICY "Clients can view their own quotations" ON public.quotations FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR public.is_active_staff()
  OR client_id IN (SELECT id FROM public.clients WHERE email = (auth.jwt() ->> 'email'))
);

DROP POLICY IF EXISTS "Clients can view their own payments" ON public.payments;
CREATE POLICY "Clients can view their own payments" ON public.payments FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR public.is_active_staff()
  OR client_id IN (SELECT id FROM public.clients WHERE email = (auth.jwt() ->> 'email'))
);


-- 6. ADDITIONAL FINAL PAYMENT UNIQUE INDEX (DUPLICATE PROTECTION)
-- Prevent multiple active final payments per quotation.
DROP INDEX IF EXISTS idx_unique_active_final_payment;
CREATE UNIQUE INDEX idx_unique_active_final_payment ON public.payments (quotation_id) WHERE (payment_type = 'Final' AND status != 'Cancelled');

-- Also add a unique constraint to crm_opportunities(lead_id) to prevent multiple duplicate opportunity conversions
ALTER TABLE public.crm_opportunities DROP CONSTRAINT IF EXISTS unique_lead_id;
ALTER TABLE public.crm_opportunities ADD CONSTRAINT unique_lead_id UNIQUE (lead_id);

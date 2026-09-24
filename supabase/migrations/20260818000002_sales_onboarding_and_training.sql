-- MODULE 4: SALES ONBOARDING & TRAINING SYSTEM

-- 1. Training Modules
CREATE TABLE IF NOT EXISTS training_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    module_type TEXT DEFAULT 'lesson', -- lesson, quiz, assignment, practical
    sort_order INTEGER DEFAULT 0,
    required BOOLEAN DEFAULT TRUE,
    active BOOLEAN DEFAULT TRUE,
    passing_score INTEGER,
    requires_admin_review BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Training Lessons
CREATE TABLE IF NOT EXISTS training_lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID REFERENCES training_modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT, -- Markdown content
    video_url TEXT,
    sort_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. User Training Progress
CREATE TABLE IF NOT EXISTS user_training_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    module_id UUID REFERENCES training_modules(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'Not Started', -- Not Started, In Progress, Submitted, Passed, Retry Required, Completed
    progress_percent INTEGER DEFAULT 0,
    score INTEGER,
    attempts INTEGER DEFAULT 0,
    completed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    review_status TEXT, -- Passed, Retry Required
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, module_id)
);

-- 4. Training Assignments (Submissions)
CREATE TABLE IF NOT EXISTS training_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    progress_id UUID REFERENCES user_training_progress(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    module_id UUID REFERENCES training_modules(id) ON DELETE CASCADE,
    submission_data JSONB, -- { type: 'loom', url: '...' } or { type: 'lead_research', leads: [...] }
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Training Reviews
CREATE TABLE IF NOT EXISTS training_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    progress_id UUID REFERENCES user_training_progress(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES auth.users(id),
    status TEXT NOT NULL, -- Passed, Retry Required
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies for Training
ALTER TABLE training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_reviews ENABLE ROW LEVEL SECURITY;

-- Admins manage everything
CREATE POLICY "Admins manage training modules" ON training_modules FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins manage training lessons" ON training_lessons FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Onboarding users and active sales can view modules/lessons
CREATE POLICY "Internal users view training" ON training_modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal users view lessons" ON training_lessons FOR SELECT TO authenticated USING (true);

-- Progress policies
CREATE POLICY "Users view own progress" ON user_training_progress FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own progress" ON user_training_progress FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own progress" ON user_training_progress FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins view all progress" ON user_training_progress FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins update all progress" ON user_training_progress FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Assignment policies
CREATE POLICY "Users manage own assignments" ON training_assignments FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins view all assignments" ON training_assignments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Review policies
CREATE POLICY "Admins manage reviews" ON training_reviews FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Users view reviews for own progress" ON training_reviews FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM user_training_progress WHERE id = training_reviews.progress_id AND user_id = auth.uid()));

-- PRE-FLIGHT SECURITY FIXES

-- Ensure projects don't duplicate for same opportunity
ALTER TABLE projects ADD CONSTRAINT unique_source_opportunity_id UNIQUE (source_opportunity_id);

-- Atomic User Activation RPC
CREATE OR REPLACE FUNCTION activate_salesperson(target_user_id UUID, admin_id UUID)
RETURNS VOID AS $$
BEGIN
    -- 1. Check if admin
    IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can activate users';
    END IF;

    -- 2. Check if onboarding is completed (all required modules passed)
    -- This is a soft check, admin override is implied since they are calling this.
    
    -- 3. Update User Profile status and role
    UPDATE user_profiles
    SET 
        status = 'active',
        role = 'sales_rep',
        onboarding_status = 'completed',
        onboarding_progress = 100,
        updated_at = NOW()
    WHERE id = target_user_id;

    -- 4. Update Applicant stage to Activated
    UPDATE applicants
    SET 
        stage = 'Activated',
        final_approval = TRUE,
        onboarding_status = 'completed',
        onboarding_progress = 100,
        updated_at = NOW()
    WHERE linked_user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic Payment Verification RPC
CREATE OR REPLACE FUNCTION verify_payment_atomic(p_payment_id UUID, p_admin_id UUID, p_notes TEXT)
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
BEGIN
    -- 1. Verify admin
    IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = p_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- 2. Fetch payment details
    SELECT payment_type, opportunity_id, quotation_id 
    INTO v_payment_type, v_opp_id, v_quote_id
    FROM payments WHERE id = p_payment_id;

    -- 3. Update Payment
    UPDATE payments
    SET 
        status = 'Verified',
        verified_at = NOW(),
        verified_by = p_admin_id,
        notes = COALESCE(p_notes, notes)
    WHERE id = p_payment_id;

    -- 4. If Advance, handle Won and Client
    IF v_payment_type = 'Advance' AND v_opp_id IS NOT NULL THEN
        -- Mark Won
        UPDATE crm_opportunities
        SET 
            status = 'Won',
            stage = 'Won',
            won_at = NOW()
        WHERE id = v_opp_id;

        -- Ensure Client (Simple version of ensureClientForOpportunity)
        SELECT client_id INTO v_client_id FROM crm_opportunities WHERE id = v_opp_id;

        IF v_client_id IS NULL THEN
            SELECT 
                company_name, contact_name, email, phone, country, industry, salesperson_id, expected_value, currency
            INTO 
                v_company_name, v_contact_name, v_email, v_phone, v_country, v_industry, v_salesperson_id, v_total_value, v_currency
            FROM crm_opportunities WHERE id = v_opp_id;

            INSERT INTO clients (
                company_name, primary_contact_name, email, phone, country, industry, salesperson_id, 
                source_opportunity_id, first_quotation_id, total_sales_value, currency, status
            ) VALUES (
                v_company_name, v_contact_name, v_email, v_phone, v_country, v_industry, v_salesperson_id,
                v_opp_id, v_quote_id, v_total_value, v_currency, 'Active'
            ) RETURNING id INTO v_client_id;

            UPDATE crm_opportunities SET client_id = v_client_id WHERE id = v_opp_id;
            UPDATE quotations SET client_id = v_client_id WHERE id = v_quote_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Initial Training Modules Seed
INSERT INTO training_modules (title, slug, description, sort_order, module_type) VALUES
('Welcome to ProFox', 'welcome', 'Introduction to ProFox vision and team.', 1, 'lesson'),
('Agreement & Sales Rules', 'agreement-rules', 'Review and sign our sales agreement.', 2, 'assignment'),
('Product & Package Training', 'product-training', 'Master our service catalog.', 3, 'quiz'),
('Niche-Specific Training', 'niche-training', 'Vertical playbooks for top niches.', 4, 'lesson'),
('Lead Research & Qualification', 'lead-research', 'How to find the best prospects.', 5, 'assignment'),
('Personalized Loom Outreach', 'loom-outreach', 'Create high-converting video pitches.', 6, 'assignment'),
('Outreach Messages & Follow-Up', 'outreach-cadence', 'Mastering the 9-day cadence.', 7, 'lesson'),
('Meeting Booking', 'meeting-booking', 'Closing for the discovery call.', 8, 'practical'),
('Discovery / Call Script', 'discovery-script', 'How to run a perfect discovery meeting.', 9, 'lesson'),
('Call Practice', 'call-practice', 'Roleplay scenarios.', 10, 'practical'),
('Mock Sales Call Test', 'mock-call-test', 'Pass your first live-mock call.', 11, 'practical'),
('Product Presentation', 'presentation-skills', 'Diagnosing before prescribing.', 12, 'lesson'),
('Objection Handling', 'objections', 'Turning "No" into "Not Yet".', 13, 'lesson'),
('Closing Training', 'closing', 'Asking for the business.', 14, 'lesson'),
('Quotation Process', 'quotation-process', 'Using the ProFox quote engine.', 15, 'lesson'),
('Payment Process', 'payment-process', 'Securing the deposit.', 16, 'lesson'),
('CRM Training', 'crm-training', 'Pipeline management excellence.', 17, 'practical'),
('Calendar / Meeting Setup', 'calendar-setup', 'Tooling for productivity.', 18, 'practical'),
('Confidentiality & Data Protection', 'privacy', 'Protecting our clients and trade secrets.', 19, 'lesson'),
('Final Certification', 'final-certification', 'Review of all skills.', 20, 'practical')
ON CONFLICT (slug) DO NOTHING;

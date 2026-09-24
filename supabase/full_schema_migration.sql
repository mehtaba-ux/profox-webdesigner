-- ==============================================================================
-- ProFox Full Database Migration Script
-- Copy and paste this complete script into your Supabase SQL Editor and click "Run".
-- ==============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. USER PROFILES & ROLES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  country TEXT DEFAULT '',
  timezone TEXT DEFAULT 'UTC',
  role TEXT NOT NULL DEFAULT 'pending',
  department TEXT DEFAULT 'General',
  status TEXT NOT NULL DEFAULT 'pending',
  manager TEXT DEFAULT '',
  onboarding_status TEXT NOT NULL DEFAULT 'not_started',
  onboarding_progress INTEGER NOT NULL DEFAULT 0,
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT valid_role CHECK (
    role IN (
      'admin', 'sales', 'project_manager', 'uiux_designer', 'content_writer', 
      'developer', 'qa', 'site_manager', 'editor', 'customer', 'pending',
      'developer_designer', 'sales_team'
    )
  ),
  CONSTRAINT valid_status CHECK (
    status IN ('pending', 'onboarding', 'active', 'inactive')
  ),
  CONSTRAINT valid_onboarding_status CHECK (
    onboarding_status IN ('not_started', 'in_progress', 'completed', 'failed')
  ),
  CONSTRAINT valid_onboarding_progress CHECK (
    onboarding_progress >= 0 AND onboarding_progress <= 100
  ),
  CONSTRAINT valid_department CHECK (
    department IN (
      'Management', 'Sales', 'Project Management', 'UI/UX Design', 'Content',
      'Development', 'Quality Assurance', 'General', ''
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_status ON public.user_profiles(status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_department ON public.user_profiles(department);

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trigger_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  initial_role TEXT := 'pending';
  initial_status TEXT := 'pending';
  user_full_name TEXT := '';
BEGIN
  IF NEW.raw_user_meta_data IS NOT NULL THEN
    user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '');
  END IF;

  INSERT INTO public.user_profiles (
    id, email, full_name, role, status, department, onboarding_status, onboarding_progress, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.email, user_full_name, initial_role, initial_status, 'General', 'not_started', 0, timezone('utc'::text, now()), timezone('utc'::text, now())
  ) ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND status = 'active'
      AND role IN ('admin', 'site_manager', 'editor', 'project_manager', 'sales', 'developer', 'uiux_designer', 'content_writer', 'qa', 'developer_designer', 'sales_team')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 2. APPLICANTS & RECRUITMENT
-- ------------------------------------------------------------------------------
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
  stage TEXT NOT NULL DEFAULT 'New Application',
  rating INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  refusal_reason TEXT DEFAULT NULL,
  agreement_status TEXT NOT NULL DEFAULT 'not_sent',
  onboarding_status TEXT NOT NULL DEFAULT 'not_started',
  onboarding_progress INTEGER DEFAULT 0,
  final_approval BOOLEAN NOT NULL DEFAULT false,
  linked_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT valid_stage CHECK (
    stage IN (
      'New Application', 'Video Pending', 'Video Review', 'Initial Screening', 'Shortlisted',
      'Sales Assessment', 'Lead Research Test', 'CRM Assessment', 'Selected', 'Agreement Pending',
      'One-Day Training', 'Final Approval', 'Ready for System Access', 'Ready for Odoo Access', 'Activated'
    )
  ),
  CONSTRAINT valid_rating CHECK (rating >= 0 AND rating <= 5),
  CONSTRAINT valid_agreement_status CHECK (
    agreement_status IN ('not_sent', 'sent', 'signed', 'declined')
  ),
  CONSTRAINT valid_onboarding_status CHECK (
    onboarding_status IN ('not_started', 'in_progress', 'completed', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_applicants_email ON public.applicants(email);
CREATE INDEX IF NOT EXISTS idx_applicants_stage ON public.applicants(stage);
CREATE INDEX IF NOT EXISTS idx_applicants_linked_user ON public.applicants(linked_user_id);

DROP TRIGGER IF EXISTS trigger_applicants_updated_at ON public.applicants;
CREATE TRIGGER trigger_applicants_updated_at BEFORE UPDATE ON public.applicants FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 3. CRM LEADS & PIPELINE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  country TEXT NOT NULL,
  industry TEXT DEFAULT 'Other',
  source TEXT NOT NULL,
  salesperson_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  service_interest TEXT DEFAULT '',
  estimated_value DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'New',
  loom_video_url TEXT DEFAULT '',
  initial_outreach_channel TEXT DEFAULT 'Email',
  last_contact_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  self_generated BOOLEAN DEFAULT false,
  converted_opportunity_id UUID,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT valid_lead_status CHECK (
    status IN ('New', 'Researching', 'Contacted', 'Follow-Up', 'Interested', 'Qualified', 'Not Qualified')
  )
);

CREATE TABLE IF NOT EXISTS public.crm_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  country TEXT NOT NULL,
  industry TEXT DEFAULT 'Other',
  source TEXT NOT NULL,
  self_generated BOOLEAN DEFAULT false,
  salesperson_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  service_interest TEXT DEFAULT '',
  expected_value DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  stage TEXT NOT NULL DEFAULT 'Qualified',
  status TEXT NOT NULL DEFAULT 'Open',
  probability INTEGER DEFAULT 10,
  meeting_at TIMESTAMPTZ,
  meeting_url TEXT DEFAULT '',
  requirements_summary TEXT DEFAULT '',
  next_follow_up_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  lost_reason TEXT DEFAULT NULL,
  won_at TIMESTAMPTZ DEFAULT NULL,
  lost_at TIMESTAMPTZ DEFAULT NULL,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT valid_opportunity_stage CHECK (
    stage IN ('Qualified', 'Meeting Scheduled', 'Requirements Confirmed', 'Quotation Sent', 'Negotiation / Decision Pending', 'Awaiting Advance Payment', 'Won')
  ),
  CONSTRAINT valid_opportunity_status CHECK (status IN ('Open', 'Won', 'Lost')),
  CONSTRAINT unique_lead_id UNIQUE (lead_id)
);

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Scheduled',
  channel TEXT DEFAULT 'Email',
  loom_video_url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT valid_activity_type CHECK (
    activity_type IN ('Lead Research', 'Cold Call', 'Cold Email', 'LinkedIn / Social Outreach', 'Loom Outreach', 'Follow-Up', 'Discovery Meeting', 'Meeting Follow-Up', 'Quotation Follow-Up', 'Payment Follow-Up', 'Other')
  ),
  CONSTRAINT valid_activity_status CHECK (status IN ('Scheduled', 'Completed', 'Cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_leads_salesperson ON public.crm_leads(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.crm_leads(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_salesperson ON public.crm_opportunities(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON public.crm_opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_activities_assigned_to ON public.crm_activities(assigned_to);

DROP TRIGGER IF EXISTS trigger_crm_leads_updated_at ON public.crm_leads;
CREATE TRIGGER trigger_crm_leads_updated_at BEFORE UPDATE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_crm_opportunities_updated_at ON public.crm_opportunities;
CREATE TRIGGER trigger_crm_opportunities_updated_at BEFORE UPDATE ON public.crm_opportunities FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_crm_activities_updated_at ON public.crm_activities;
CREATE TRIGGER trigger_crm_activities_updated_at BEFORE UPDATE ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 4. SALES PRODUCTS & QUOTATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  product_type TEXT NOT NULL,
  price_mode TEXT NOT NULL,
  base_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  billing_period TEXT,
  short_description TEXT,
  full_description TEXT,
  scope JSONB DEFAULT '[]'::jsonb,
  technology TEXT,
  manager_approval_required BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT valid_product_type CHECK (product_type IN ('package', 'addon', 'care_plan', 'discovery', 'custom')),
  CONSTRAINT valid_price_mode CHECK (price_mode IN ('fixed', 'starting_at', 'custom'))
);

CREATE SEQUENCE IF NOT EXISTS public.quotation_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.generate_quotation_number()
RETURNS TEXT AS $$
DECLARE
  next_val INTEGER;
BEGIN
  SELECT nextval('public.quotation_number_seq') INTO next_val;
  RETURN 'PF-Q-' || LPAD(next_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT NOT NULL UNIQUE DEFAULT public.generate_quotation_number(),
  opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  salesperson_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  country TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'Draft',
  valid_until DATE,
  payment_terms TEXT,
  scope_summary TEXT,
  exclusions TEXT,
  customer_notes TEXT,
  internal_notes TEXT,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  approved_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT valid_quotation_status CHECK (
    status IN ('Draft', 'Ready for Approval', 'Approved', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Cancelled')
  )
);

CREATE TABLE IF NOT EXISTS public.quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID REFERENCES public.quotations(id) ON DELETE CASCADE,
  sales_product_id UUID REFERENCES public.sales_products(id) ON DELETE SET NULL,
  product_code_snapshot TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  description_snapshot TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  item_type TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.sales_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 5. CLIENTS & PAYMENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  primary_contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  country TEXT,
  industry TEXT,
  salesperson_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  source_opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  first_quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  total_sales_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT valid_client_status CHECK (status IN ('Active', 'Inactive'))
);

CREATE SEQUENCE IF NOT EXISTS public.payment_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.generate_payment_reference()
RETURNS TEXT AS $$
DECLARE
  next_val INTEGER;
BEGIN
  SELECT nextval('public.payment_number_seq') INTO next_val;
  RETURN 'PF-PAY-' || LPAD(next_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_reference TEXT NOT NULL UNIQUE DEFAULT public.generate_payment_reference(),
  quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  salesperson_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  payment_type TEXT NOT NULL,
  milestone_number INTEGER,
  milestone_label TEXT,
  amount_due DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method TEXT,
  payment_provider TEXT,
  payment_link TEXT,
  provider_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  due_date DATE,
  paid_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT valid_payment_type CHECK (
    payment_type IN ('Advance', 'Design Milestone', 'Staging Milestone', 'Final Payment', 'Full Payment', 'Custom Milestone')
  ),
  CONSTRAINT valid_payment_status CHECK (
    status IN ('Draft', 'Ready', 'Sent', 'Pending', 'Partially Paid', 'Verification Pending', 'Verified', 'Failed', 'Cancelled', 'Refunded', 'Partially Refunded')
  )
);

ALTER TABLE public.crm_opportunities ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Unique constraint preventing duplicate active final payments
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_final_payment ON public.payments (quotation_id) WHERE (payment_type = 'Final' AND status != 'Cancelled');

-- ------------------------------------------------------------------------------
-- 6. PROJECTS & TASKS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number TEXT UNIQUE NOT NULL DEFAULT ('PF-PROJ-' || LPAD(nextval('public.payment_number_seq')::text, 6, '0')),
  project_name TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id),
  source_opportunity_id UUID REFERENCES public.crm_opportunities(id) UNIQUE,
  quotation_id UUID REFERENCES public.quotations(id),
  package_snapshot TEXT,
  project_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  project_manager_id UUID REFERENCES public.user_profiles(id),
  stage TEXT DEFAULT 'Sales Handover',
  priority TEXT DEFAULT 'Normal',
  status TEXT DEFAULT 'Active',
  start_date DATE,
  target_date DATE,
  completed_at TIMESTAMPTZ,
  requirements_summary TEXT,
  scope_summary TEXT,
  exclusions TEXT,
  sales_handover_notes TEXT,
  internal_notes TEXT,
  created_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  role TEXT,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  department TEXT,
  assigned_to UUID REFERENCES public.user_profiles(id),
  created_by UUID REFERENCES public.user_profiles(id),
  priority TEXT DEFAULT 'Normal',
  status TEXT DEFAULT 'To Do',
  start_date DATE,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 7. SALES ONBOARDING & TRAINING MODULES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.training_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  module_type TEXT DEFAULT 'lesson',
  sort_order INTEGER DEFAULT 0,
  required BOOLEAN DEFAULT TRUE,
  active BOOLEAN DEFAULT TRUE,
  passing_score INTEGER,
  requires_admin_review BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.training_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES public.training_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  video_url TEXT,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_training_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  module_id UUID REFERENCES public.training_modules(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'Not Started',
  progress_percent INTEGER DEFAULT 0,
  score INTEGER,
  attempts INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.user_profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_status TEXT,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, module_id)
);

CREATE TABLE IF NOT EXISTS public.training_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_id UUID REFERENCES public.user_training_progress(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  module_id UUID REFERENCES public.training_modules(id) ON DELETE CASCADE,
  submission_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.training_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_id UUID REFERENCES public.user_training_progress(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES public.user_profiles(id),
  status TEXT NOT NULL,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_reviews ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 8. SEED DATA (PRODUCTS & TRAINING MODULES)
-- ------------------------------------------------------------------------------
INSERT INTO public.sales_products (code, name, category, product_type, price_mode, base_price, short_description, scope, technology, sort_order)
VALUES 
('PF-WEB-LAUNCH', 'ProFox Launch', 'Web Design', 'package', 'starting_at', 599.00, 'Small businesses, startups, consultants, local service businesses, and professionals requiring a strong professional website.', '["Business requirements discovery", "Basic competitor review", "Up to 5 core pages", "Professional customized design", "Responsive desktop/tablet/mobile experience", "Content refinement/copywriting for agreed pages", "Conversion-focused page structure", "Contact/enquiry form", "Click-to-call/email", "Social links", "WhatsApp integration where appropriate", "Basic SEO foundation", "Page titles/meta descriptions", "Heading structure", "Search-friendly URLs", "XML sitemap", "Image optimization", "Basic performance optimization", "Google Analytics/Search Console setup where applicable", "Form/responsive/browser QA", "Domain/launch assistance", "2 structured revision rounds", "14 days post-launch support"]', 'WordPress', 10),
('PF-WEB-GROWTH', 'ProFox Growth', 'Web Design', 'package', 'starting_at', 2379.00, 'A custom, conversion-focused website for businesses that expect their digital presence to generate trust, enquiries, and measurable growth.', '["Everything in Launch plus:", "Detailed discovery", "Business and audience analysis", "Competitor analysis", "Customer journey planning", "Sitemap", "Information architecture", "Approximately 10–12 agreed pages", "Fully custom UI/UX", "Key-page wireframes", "Custom homepage", "Custom service layouts", "Conversion-focused copywriting", "Messaging refinement", "Strategic calls to action", "FAQ/trust content where appropriate", "Keyword/topic research", "Enhanced on-page SEO", "Internal linking", "Structured data where appropriate", "Conversion tracking", "Form tracking", "Phone/email click tracking", "Dedicated thank-you page where appropriate", "Up to 2 standard integrations", "Enhanced performance optimization", "Comprehensive QA", "3 structured revision rounds", "30 days priority post-launch support"]', 'WordPress, WooCommerce, Shopify, Webflow, Next.js / React', 20),
('PF-WEB-SCALE', 'ProFox Scale', 'Web Design', 'package', 'starting_at', 5799.00, 'A differentiated digital experience for established organizations that need advanced UX, deeper strategy, and scalable technology.', '["Everything in Growth plus:", "Strategic stakeholder discovery", "Deep competitor benchmarking", "Existing website audit where applicable", "Audience/customer analysis", "UX analysis", "Content-gap analysis", "Conversion-path analysis", "Analytics review where available", "Advanced information architecture", "Customer journey mapping", "Full key-page wireframing", "Interactive prototype for important experiences", "Premium bespoke UI", "Custom visual direction", "Design system", "Component library", "Advanced responsive behavior", "Micro-interactions", "Premium animation strategy within scope", "Brand messaging strategy", "Advanced conversion copywriting", "Advanced technical SEO foundation", "Structured-data strategy", "Search and AI-discovery content structure", "Advanced lead qualification", "Event/funnel tracking architecture", "Multiple approved integrations", "Advanced performance optimization", "Enhanced accessibility implementation", "50+ point pre-launch QA", "Milestone-based review/approval", "60 days priority post-launch support"]', 'Custom WordPress, Headless WordPress, Next.js, React, TypeScript, Shopify, WooCommerce, Headless CMS, Supabase/PostgreSQL, Firebase, Cloudflare', 30),
('PF-CUSTOM', 'ProFox Custom Digital Experience & Web Application', 'Web Design', 'package', 'custom', 0.00, 'For portals, dashboards, SaaS products, booking platforms, marketplaces, and business systems.', '["Customer portal", "Employee portal", "Vendor/partner portal", "Admin dashboard", "Authentication", "Role-based permissions", "Custom database", "SaaS", "Subscription systems", "Custom booking platforms", "Custom CRM", "Business-management systems", "Workflow automation", "Custom reporting", "Complex e-commerce", "Marketplace", "Custom APIs", "Payment workflows", "Multi-user systems", "Multi-tenant applications"]', 'React, Next.js, TypeScript, Node.js, ASP.NET Core, PostgreSQL, Supabase, Firebase, Microsoft SQL Server, Cloudflare', 40),
('PF-DISCOVERY', 'ProFox Solution Blueprint & Discovery Sprint', 'Discovery', 'discovery', 'starting_at', 1499.00, 'Use primarily for substantial or unclear Custom projects.', '["Requirements discovery", "Business-process review", "User roles", "Feature map", "Key user flows", "Critical wireframes where required", "Technical recommendation", "Development phases", "Estimated timeline", "Final project quotation"]', 'Discovery Workshop', 5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.training_modules (title, slug, description, sort_order, module_type) VALUES
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

-- ------------------------------------------------------------------------------
-- 9. TRANSACTIONAL FUNCTIONS & SECURITY DEFINERS
-- ------------------------------------------------------------------------------

-- Candidate Activation Function
CREATE OR REPLACE FUNCTION public.activate_salesperson(target_user_id UUID, admin_id UUID DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    v_applicant_id UUID;
    v_stage TEXT;
    v_agreement_status TEXT;
    v_onboarding_status TEXT;
    v_final_approval BOOLEAN;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only an active Admin can perform final candidate activation.';
    END IF;

    SELECT id, stage, agreement_status, onboarding_status, final_approval
    INTO v_applicant_id, v_stage, v_agreement_status, v_onboarding_status, v_final_approval
    FROM public.applicants
    WHERE linked_user_id = target_user_id;

    IF v_applicant_id IS NULL THEN
        RAISE EXCEPTION 'Candidate record not found for the linked account.';
    END IF;

    IF COALESCE(v_agreement_status, '') != 'signed' THEN
        RAISE EXCEPTION 'Candidate cannot be activated: Sales Agreement has not been signed.';
    END IF;

    IF COALESCE(v_onboarding_status, '') != 'completed' THEN
        RAISE EXCEPTION 'Candidate cannot be activated: Training and onboarding status is not set to completed.';
    END IF;

    IF COALESCE(v_final_approval, FALSE) = FALSE THEN
        RAISE EXCEPTION 'Candidate cannot be activated: Missing final Admin approval.';
    END IF;

    UPDATE public.user_profiles
    SET status = 'active', role = 'sales', onboarding_status = 'completed', onboarding_progress = 100, updated_at = NOW()
    WHERE id = target_user_id;

    UPDATE public.applicants
    SET stage = 'Activated', onboarding_status = 'completed', onboarding_progress = 100, updated_at = NOW()
    WHERE id = v_applicant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Project Creation RPC
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

    IF EXISTS (SELECT 1 FROM public.projects WHERE source_opportunity_id = p_opportunity_id) THEN
        RAISE EXCEPTION 'Project already exists for this sale/opportunity.';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.payments
        WHERE opportunity_id = p_opportunity_id AND payment_type = 'Advance' AND status = 'Verified'
    ) INTO v_payment_verified;

    IF NOT v_payment_verified THEN
        RAISE EXCEPTION 'Advance payment must be verified by an Admin before creating a project.';
    END IF;

    SELECT q.id, q.total, q.currency, q.scope_summary, q.exclusions,
           COALESCE((SELECT qi.product_name_snapshot FROM public.quotation_items qi WHERE qi.quotation_id = q.id AND qi.item_type = 'package' LIMIT 1), 'Custom Package')
    INTO v_quote_id, v_quote_total, v_quote_currency, v_quote_scope, v_quote_exclusions, v_package_snapshot
    FROM public.quotations q
    WHERE q.opportunity_id = p_opportunity_id AND q.status = 'Accepted'
    ORDER BY q.accepted_at DESC
    LIMIT 1;

    IF v_quote_id IS NULL THEN
        RAISE EXCEPTION 'No accepted quotation found for this opportunity.';
    END IF;

    INSERT INTO public.projects (
        project_name, client_id, source_opportunity_id, quotation_id, project_value, currency, package_snapshot, stage, priority, status, requirements_summary, scope_summary, exclusions, sales_handover_notes
    ) VALUES (
        COALESCE(v_opp_company_name, v_opp_name) || ' Website Delivery',
        v_opp_client_id, p_opportunity_id, v_quote_id, v_quote_total, v_quote_currency, v_package_snapshot,
        'Sales Handover', 'Normal', 'Active', v_opp_requirements, v_quote_scope, v_quote_exclusions,
        'Sales Representative: ' || COALESCE((SELECT email FROM public.user_profiles WHERE id = v_opp_salesperson_id), 'Unknown') || E'\nSold on: ' || NOW()::date::text
    ) RETURNING id INTO v_project_id;

    INSERT INTO public.project_tasks (project_id, title, department, priority, status, description)
    VALUES 
    (v_project_id, 'Sales Handover Meeting', 'Project Management', 'High', 'To Do', 'Review project scope, requirements, and client expectations with the Sales Representative.'),
    (v_project_id, 'Client Onboarding Call', 'Project Management', 'High', 'To Do', 'Welcome the client and collect any missing initial assets/info.');

    RETURN v_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

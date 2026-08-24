-- ==============================================================================
-- ProFox CRM - Sales Catalog & Quotation System
-- Module 2 - Job 3: Packages, Add-ons & Quotations
-- ==============================================================================

-- 1. Sales Products (Catalog)
CREATE TABLE IF NOT EXISTS public.sales_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- e.g. 'Web Design', 'Add-on', 'Care Plan'
  product_type TEXT NOT NULL, -- 'package', 'addon', 'care_plan', 'discovery', 'custom'
  price_mode TEXT NOT NULL, -- 'fixed', 'starting_at', 'custom'
  base_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  billing_period TEXT, -- 'month', 'year', NULL
  short_description TEXT,
  full_description TEXT,
  scope JSONB DEFAULT '[]'::jsonb, -- Array of strings
  technology TEXT,
  manager_approval_required BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT valid_product_type CHECK (
    product_type IN ('package', 'addon', 'care_plan', 'discovery', 'custom')
  ),
  CONSTRAINT valid_price_mode CHECK (
    price_mode IN ('fixed', 'starting_at', 'custom')
  )
);

-- 2. Quotation Number Sequence
CREATE SEQUENCE IF NOT EXISTS public.quotation_number_seq START WITH 1;

-- Function to generate quotation number
CREATE OR REPLACE FUNCTION public.generate_quotation_number()
RETURNS TEXT AS $$
DECLARE
  next_val INTEGER;
BEGIN
  SELECT nextval('public.quotation_number_seq') INTO next_val;
  RETURN 'PF-Q-' || LPAD(next_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- 3. Quotations
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

-- 4. Quotation Items
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
  item_type TEXT NOT NULL, -- 'package', 'addon', 'care_plan', 'discovery', 'custom'
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Triggers for updated_at
CREATE TRIGGER trigger_sales_products_updated_at BEFORE UPDATE ON public.sales_products FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trigger_quotations_updated_at BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trigger_quotation_items_updated_at BEFORE UPDATE ON public.quotation_items FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 6. Enable RLS
ALTER TABLE public.sales_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies

-- Sales Products (Read all for staff, Manage for Admins)
CREATE POLICY "Staff can view active products" ON public.sales_products FOR SELECT USING (
  public.is_admin() OR (SELECT role FROM public.user_profiles WHERE id = auth.uid()) IN ('sales', 'sales_rep', 'sales_team')
);
CREATE POLICY "Admins can manage products" ON public.sales_products FOR ALL USING (public.is_admin());

-- Quotations
CREATE POLICY "Admins can view all quotations" ON public.quotations FOR SELECT USING (public.is_admin());
CREATE POLICY "Sales can view their own quotations" ON public.quotations FOR SELECT USING (salesperson_id = auth.uid());
CREATE POLICY "Admins can manage all quotations" ON public.quotations FOR ALL USING (public.is_admin());
CREATE POLICY "Sales can manage their own quotations" ON public.quotations FOR ALL 
  USING (salesperson_id = auth.uid()) 
  WITH CHECK (salesperson_id = auth.uid());

-- Quotation Items (Follow quotation policies)
CREATE POLICY "Staff can view items" ON public.quotation_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND (public.is_admin() OR q.salesperson_id = auth.uid()))
);
CREATE POLICY "Staff can manage items" ON public.quotation_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND (public.is_admin() OR q.salesperson_id = auth.uid()))
);

-- 8. Seed Sales Products

-- Core Packages
INSERT INTO public.sales_products (code, name, category, product_type, price_mode, base_price, short_description, scope, technology, sort_order)
VALUES 
('PF-WEB-LAUNCH', 'ProFox Launch', 'Web Design', 'package', 'starting_at', 599.00, 'Small businesses, startups, consultants, local service businesses, and professionals requiring a strong professional website.', 
'["Business requirements discovery", "Basic competitor review", "Up to 5 core pages", "Professional customized design", "Responsive desktop/tablet/mobile experience", "Content refinement/copywriting for agreed pages", "Conversion-focused page structure", "Contact/enquiry form", "Click-to-call/email", "Social links", "WhatsApp integration where appropriate", "Basic SEO foundation", "Page titles/meta descriptions", "Heading structure", "Search-friendly URLs", "XML sitemap", "Image optimization", "Basic performance optimization", "Google Analytics/Search Console setup where applicable", "Form/responsive/browser QA", "Domain/launch assistance", "2 structured revision rounds", "14 days post-launch support"]', 'WordPress', 10),

('PF-WEB-GROWTH', 'ProFox Growth', 'Web Design', 'package', 'starting_at', 2379.00, 'A custom, conversion-focused website for businesses that expect their digital presence to generate trust, enquiries, and measurable growth.', 
'["Everything in Launch plus:", "Detailed discovery", "Business and audience analysis", "Competitor analysis", "Customer journey planning", "Sitemap", "Information architecture", "Approximately 10–12 agreed pages", "Fully custom UI/UX", "Key-page wireframes", "Custom homepage", "Custom service layouts", "Conversion-focused copywriting", "Messaging refinement", "Strategic calls to action", "FAQ/trust content where appropriate", "Keyword/topic research", "Enhanced on-page SEO", "Internal linking", "Structured data where appropriate", "Conversion tracking", "Form tracking", "Phone/email click tracking", "Dedicated thank-you page where appropriate", "Up to 2 standard integrations", "Enhanced performance optimization", "Comprehensive QA", "3 structured revision rounds", "30 days priority post-launch support"]', 'WordPress, WooCommerce, Shopify, Webflow, Next.js / React', 20),

('PF-WEB-SCALE', 'ProFox Scale', 'Web Design', 'package', 'starting_at', 5799.00, 'A differentiated digital experience for established organizations that need advanced UX, deeper strategy, and scalable technology.', 
'["Everything in Growth plus:", "Strategic stakeholder discovery", "Deep competitor benchmarking", "Existing website audit where applicable", "Audience/customer analysis", "UX analysis", "Content-gap analysis", "Conversion-path analysis", "Analytics review where available", "Advanced information architecture", "Customer journey mapping", "Full key-page wireframing", "Interactive prototype for important experiences", "Premium bespoke UI", "Custom visual direction", "Design system", "Component library", "Advanced responsive behavior", "Micro-interactions", "Premium animation strategy within scope", "Brand messaging strategy", "Advanced conversion copywriting", "Advanced technical SEO foundation", "Structured-data strategy", "Search and AI-discovery content structure", "Advanced lead qualification", "Event/funnel tracking architecture", "Multiple approved integrations", "Advanced performance optimization", "Enhanced accessibility implementation", "50+ point pre-launch QA", "Milestone-based review/approval", "60 days priority post-launch support"]', 'Custom WordPress, Headless WordPress, Next.js, React, TypeScript, Shopify, WooCommerce, Headless CMS, Supabase/PostgreSQL, Firebase, Cloudflare', 30),

('PF-CUSTOM', 'ProFox Custom Digital Experience & Web Application', 'Web Design', 'package', 'custom', 0.00, 'For portals, dashboards, SaaS products, booking platforms, marketplaces, and business systems.', 
'["Customer portal", "Employee portal", "Vendor/partner portal", "Admin dashboard", "Authentication", "Role-based permissions", "Custom database", "SaaS", "Subscription systems", "Custom booking platforms", "Custom CRM", "Business-management systems", "Workflow automation", "Custom reporting", "Complex e-commerce", "Marketplace", "Custom APIs", "Payment workflows", "Multi-user systems", "Multi-tenant applications"]', 'React, Next.js, TypeScript, Node.js, ASP.NET Core, PostgreSQL, Supabase, Firebase, Microsoft SQL Server, Cloudflare', 40);

-- Discovery
INSERT INTO public.sales_products (code, name, category, product_type, price_mode, base_price, short_description, scope, technology, sort_order)
VALUES 
('PF-DISCOVERY', 'ProFox Solution Blueprint & Discovery Sprint', 'Discovery', 'discovery', 'starting_at', 1499.00, 'Use primarily for substantial or unclear Custom projects.', 
'["Requirements discovery", "Business-process review", "User roles", "Feature map", "Key user flows", "Critical wireframes where required", "Technical recommendation", "Development phases", "Estimated timeline", "Final project quotation"]', 'Discovery Workshop', 5);

-- Add-ons (Pages & Content)
INSERT INTO public.sales_products (code, name, category, product_type, price_mode, base_price, sort_order)
VALUES 
('PF-ADD-PAGE', 'Additional Standard Page', 'Pages & Content', 'addon', 'starting_at', 129.00, 100),
('PF-ADD-CUSTOM-PAGE', 'Additional Custom-Designed Page', 'Pages & Content', 'addon', 'starting_at', 249.00, 101),
('PF-ADD-LANDING', 'Conversion Landing Page', 'Pages & Content', 'addon', 'starting_at', 399.00, 102),
('PF-ADD-COPY', 'Additional Copywriting Page', 'Pages & Content', 'addon', 'starting_at', 129.00, 103),
('PF-ADD-BLOG', 'Blog Setup', 'Pages & Content', 'addon', 'starting_at', 249.00, 104),
('PF-ADD-MIGRATION20', 'Content Migration — Up to 20 Pages', 'Pages & Content', 'addon', 'starting_at', 299.00, 105);

-- Add-ons (Lead Gen)
INSERT INTO public.sales_products (code, name, category, product_type, price_mode, base_price, sort_order)
VALUES 
('PF-ADD-LEAD-FORM', 'Advanced Lead Form', 'Lead Gen', 'addon', 'starting_at', 249.00, 110),
('PF-ADD-BOOKING', 'Booking / Calendar Integration', 'Lead Gen', 'addon', 'starting_at', 199.00, 111),
('PF-ADD-CHAT', 'WhatsApp / Live Chat Integration', 'Lead Gen', 'addon', 'starting_at', 99.00, 112),
('PF-ADD-REVIEWS', 'Review Platform Integration', 'Lead Gen', 'addon', 'starting_at', 99.00, 113),
('PF-ADD-CRM-INT', 'Standard CRM Integration', 'Lead Gen', 'addon', 'starting_at', 399.00, 114),
('PF-ADD-TRACKING', 'Advanced Conversion Tracking', 'Lead Gen', 'addon', 'starting_at', 299.00, 115),
('PF-ADD-CRO-AUDIT', 'CRO Launch Audit', 'Lead Gen', 'addon', 'starting_at', 499.00, 116);

-- Add-ons (Search)
INSERT INTO public.sales_products (code, name, category, product_type, price_mode, base_price, sort_order)
VALUES 
('PF-ADD-LOCAL-SEO', 'Local Search Foundation', 'Search', 'addon', 'starting_at', 599.00, 120),
('PF-ADD-ADV-SEO', 'Advanced SEO Launch Pack', 'Search', 'addon', 'starting_at', 899.00, 121),
('PF-ADD-GEO-AI', 'AI / GEO Discovery Foundation', 'Search', 'addon', 'starting_at', 499.00, 122),
('PF-ADD-TECH-SEO', 'Technical SEO Audit', 'Search', 'addon', 'starting_at', 499.00, 123),
('PF-ADD-SEO-MIG', 'SEO Migration / Redirect Plan', 'Search', 'addon', 'starting_at', 399.00, 124);

-- Add-ons (Branding)
INSERT INTO public.sales_products (code, name, category, product_type, price_mode, base_price, sort_order)
VALUES 
('PF-ADD-LOGO', 'Logo Refresh', 'Branding', 'addon', 'starting_at', 499.00, 130),
('PF-ADD-IDENTITY', 'Mini Brand Identity', 'Branding', 'addon', 'starting_at', 899.00, 131),
('PF-ADD-ICONS', 'Custom Icon Set', 'Branding', 'addon', 'starting_at', 399.00, 132),
('PF-ADD-ANIMATION', 'Advanced Animation Pack', 'Branding', 'addon', 'starting_at', 799.00, 133),
('PF-ADD-ILLUSTRATION', 'Custom Illustration', 'Branding', 'addon', 'starting_at', 299.00, 134),
('PF-ADD-3D', 'Interactive / 3D Experience', 'Branding', 'addon', 'starting_at', 1499.00, 135);

-- Add-ons (E-commerce)
INSERT INTO public.sales_products (code, name, category, product_type, price_mode, base_price, sort_order)
VALUES 
('PF-ADD-COMMERCE-START', 'Commerce Starter — Up to 25 Products', 'E-commerce', 'addon', 'starting_at', 1499.00, 140),
('PF-ADD-COMMERCE-PROD', 'Additional 25 Product Setup', 'E-commerce', 'addon', 'starting_at', 299.00, 141),
('PF-ADD-COMMERCE-FILTERS', 'Advanced Product Filters', 'E-commerce', 'addon', 'starting_at', 499.00, 142),
('PF-ADD-COMMERCE-SUBS', 'Subscription Functionality', 'E-commerce', 'addon', 'starting_at', 699.00, 143),
('PF-ADD-COMMERCE-GATE', 'Additional Payment Gateway', 'E-commerce', 'addon', 'starting_at', 399.00, 144),
('PF-ADD-COMMERCE-CHECKOUT', 'Custom Checkout Experience', 'E-commerce', 'addon', 'starting_at', 999.00, 145);

-- Add-ons (Integrations)
INSERT INTO public.sales_products (code, name, category, product_type, price_mode, base_price, sort_order)
VALUES 
('PF-ADD-INT-SIMPLE', 'Simple Third-Party Integration', 'Integrations', 'addon', 'starting_at', 299.00, 150),
('PF-ADD-INT-ADV', 'Advanced Integration', 'Integrations', 'addon', 'starting_at', 599.00, 151),
('PF-ADD-INT-API', 'Custom API Integration', 'Integrations', 'addon', 'starting_at', 999.00, 152),
('PF-ADD-INT-EMAIL', 'Email Automation Starter', 'Integrations', 'addon', 'starting_at', 799.00, 153),
('PF-ADD-INT-CRM-ROUTE', 'CRM Lead Routing', 'Integrations', 'addon', 'starting_at', 699.00, 154),
('PF-ADD-INT-PAY', 'Payment Integration', 'Integrations', 'addon', 'starting_at', 399.00, 155),
('PF-ADD-INT-BPA', 'Business Process Automation', 'Integrations', 'addon', 'starting_at', 999.00, 156);

-- Care Plans
INSERT INTO public.sales_products (code, name, category, product_type, price_mode, base_price, billing_period, scope, sort_order)
VALUES 
('PF-CARE', 'ProFox Care', 'Care Plans', 'care_plan', 'fixed', 99.00, 'month', '["Routine website maintenance", "Updates where applicable", "Backup checks where supported", "Basic monitoring", "Up to 1 hour small website changes per month", "Standard support"]', 200),
('PF-CARE-GROWTH', 'ProFox Growth Care', 'Care Plans', 'care_plan', 'fixed', 249.00, 'month', '["Everything in ProFox Care", "Up to 3 hours small website changes per month", "Performance review", "Analytics review", "Basic SEO/conversion checks", "Priority support"]', 201),
('PF-CARE-PRIORITY', 'ProFox Priority Care', 'Care Plans', 'care_plan', 'fixed', 499.00, 'month', '["Everything in Growth Care", "Up to 6 hours website work per month", "Priority service queue", "Proactive improvement recommendations", "Performance monitoring", "Conversion/analytics review", "Quarterly website strategy review"]', 202);

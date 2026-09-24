INSERT INTO public.sales_products 
  (code, name, category, product_type, price_mode, base_price, billing_period, manager_approval_required, sort_order)
VALUES 
  -- PACKAGES
  ('PF-WEB-LAUNCH', 'ProFox Launch', 'Web Design', 'package', 'starting_at', 599.00, NULL, false, 10),
  ('PF-WEB-GROWTH', 'ProFox Growth', 'Web Design', 'package', 'starting_at', 2379.00, NULL, false, 20),
  ('PF-WEB-SCALE', 'ProFox Scale', 'Web Design', 'package', 'starting_at', 5799.00, NULL, false, 30),
  ('PF-CUSTOM', 'ProFox Custom Digital Experience & Web Application', 'Web Design', 'package', 'custom', 0.00, NULL, true, 40),
  ('PF-DISCOVERY', 'ProFox Solution Blueprint & Discovery Sprint', 'Discovery', 'discovery', 'starting_at', 1499.00, NULL, false, 50),

  -- PAGES & CONTENT (Add-ons)
  ('PF-ADD-PAGE', 'Additional Standard Page', 'Pages & Content', 'addon', 'starting_at', 129.00, NULL, false, 100),
  ('PF-ADD-CUSTOM-PAGE', 'Additional Custom-Designed Page', 'Pages & Content', 'addon', 'starting_at', 249.00, NULL, false, 101),
  ('PF-ADD-LANDING', 'Conversion Landing Page', 'Pages & Content', 'addon', 'starting_at', 399.00, NULL, false, 102),
  ('PF-ADD-COPY', 'Additional Copywriting Page', 'Pages & Content', 'addon', 'starting_at', 129.00, NULL, false, 103),
  ('PF-ADD-BLOG', 'Blog Setup', 'Pages & Content', 'addon', 'starting_at', 249.00, NULL, false, 104),
  ('PF-ADD-MIGRATION20', 'Content Migration — Up to 20 Pages', 'Pages & Content', 'addon', 'starting_at', 299.00, NULL, false, 105),

  -- LEAD GENERATION & CONVERSION (Add-ons)
  ('PF-ADD-LEADFORM', 'Advanced Lead Form', 'Lead Gen', 'addon', 'starting_at', 249.00, NULL, false, 200),
  ('PF-ADD-BOOKING', 'Booking / Calendar Integration', 'Lead Gen', 'addon', 'starting_at', 199.00, NULL, false, 201),
  ('PF-ADD-CHAT', 'WhatsApp / Live Chat Integration', 'Lead Gen', 'addon', 'starting_at', 99.00, NULL, false, 202),
  ('PF-ADD-REVIEWS', 'Review Platform Integration', 'Lead Gen', 'addon', 'starting_at', 99.00, NULL, false, 203),
  ('PF-ADD-CRM', 'Standard CRM Integration', 'Lead Gen', 'addon', 'starting_at', 399.00, NULL, false, 204),
  ('PF-ADD-TRACKING', 'Advanced Conversion Tracking', 'Lead Gen', 'addon', 'starting_at', 299.00, NULL, false, 205),
  ('PF-ADD-CRO', 'CRO Launch Audit', 'Lead Gen', 'addon', 'starting_at', 499.00, NULL, false, 206),

  -- SEARCH & VISIBILITY (Add-ons)
  ('PF-ADD-LOCALSEO', 'Local Search Foundation', 'Search', 'addon', 'starting_at', 599.00, NULL, false, 300),
  ('PF-ADD-ADVSEO', 'Advanced SEO Launch Pack', 'Search', 'addon', 'starting_at', 899.00, NULL, false, 301),
  ('PF-ADD-AIDISCOVERY', 'AI / GEO Discovery Foundation', 'Search', 'addon', 'starting_at', 499.00, NULL, false, 302),
  ('PF-ADD-SEOAUDIT', 'Technical SEO Audit', 'Search', 'addon', 'starting_at', 499.00, NULL, false, 303),
  ('PF-ADD-SEOMIGRATION', 'SEO Migration / Redirect Plan', 'Search', 'addon', 'starting_at', 399.00, NULL, false, 304),

  -- BRANDING & VISUAL EXPERIENCE (Add-ons)
  ('PF-ADD-LOGOREFRESH', 'Logo Refresh', 'Branding', 'addon', 'starting_at', 499.00, NULL, false, 400),
  ('PF-ADD-MINIBRAND', 'Mini Brand Identity', 'Branding', 'addon', 'starting_at', 899.00, NULL, false, 401),
  ('PF-ADD-ICONS', 'Custom Icon Set', 'Branding', 'addon', 'starting_at', 399.00, NULL, false, 402),
  ('PF-ADD-ANIMATION', 'Advanced Animation Pack', 'Branding', 'addon', 'starting_at', 799.00, NULL, false, 403),
  ('PF-ADD-ILLUSTRATION', 'Custom Illustration', 'Branding', 'addon', 'starting_at', 299.00, NULL, false, 404),
  ('PF-ADD-3D', 'Interactive / 3D Experience', 'Branding', 'addon', 'starting_at', 1499.00, NULL, false, 405),

  -- E-COMMERCE (Add-ons)
  ('PF-ADD-COMMERCE25', 'Commerce Starter — Up to 25 Products', 'E-commerce', 'addon', 'starting_at', 1499.00, NULL, false, 500),
  ('PF-ADD-COMMERCEADD25', 'Additional 25 Product Setup', 'E-commerce', 'addon', 'starting_at', 299.00, NULL, false, 501),
  ('PF-ADD-FILTERS', 'Advanced Product Filters', 'E-commerce', 'addon', 'starting_at', 499.00, NULL, false, 502),
  ('PF-ADD-SUBSCRIPTION', 'Subscription Functionality', 'E-commerce', 'addon', 'starting_at', 699.00, NULL, false, 503),
  ('PF-ADD-PAYGATEWAY', 'Additional Payment Gateway', 'E-commerce', 'addon', 'starting_at', 399.00, NULL, false, 504),
  ('PF-ADD-CHECKOUT', 'Custom Checkout Experience', 'E-commerce', 'addon', 'starting_at', 999.00, NULL, false, 505),

  -- INTEGRATIONS & AUTOMATION (Add-ons)
  ('PF-ADD-INT-SIMPLE', 'Simple Third-Party Integration', 'Integrations', 'addon', 'starting_at', 299.00, NULL, false, 600),
  ('PF-ADD-INT-ADV', 'Advanced Integration', 'Integrations', 'addon', 'starting_at', 599.00, NULL, false, 601),
  ('PF-ADD-API', 'Custom API Integration', 'Integrations', 'addon', 'starting_at', 999.00, NULL, false, 602),
  ('PF-ADD-EMAIL', 'Email Automation Starter', 'Integrations', 'addon', 'starting_at', 799.00, NULL, false, 603),
  ('PF-ADD-LEADROUTE', 'CRM Lead Routing', 'Integrations', 'addon', 'starting_at', 699.00, NULL, false, 604),
  ('PF-ADD-PAYMENT', 'Payment Integration', 'Integrations', 'addon', 'starting_at', 399.00, NULL, false, 605),
  ('PF-ADD-BPA', 'Business Process Automation', 'Integrations', 'addon', 'starting_at', 999.00, NULL, false, 606),

  -- CARE PLANS
  ('PF-CARE', 'ProFox Care', 'Care Plans', 'care_plan', 'fixed', 99.00, 'month', false, 700),
  ('PF-CARE-GROWTH', 'ProFox Growth Care', 'Care Plans', 'care_plan', 'fixed', 249.00, 'month', false, 701),
  ('PF-CARE-PRIORITY', 'ProFox Priority Care', 'Care Plans', 'care_plan', 'fixed', 499.00, 'month', false, 702)

ON CONFLICT (code) DO NOTHING;

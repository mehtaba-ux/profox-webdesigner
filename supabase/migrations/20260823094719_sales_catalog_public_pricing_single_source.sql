alter table public.sales_products
  add column if not exists public_details jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_products_public_details_object_chk'
      and conrelid = 'public.sales_products'::regclass
  ) then
    alter table public.sales_products
      add constraint sales_products_public_details_object_chk
      check (jsonb_typeof(public_details) = 'object');
  end if;
end $$;

comment on column public.sales_products.public_details is
  'Admin-managed public presentation metadata for Sales Catalog products. Current website pricing reads this together with canonical price, scope, payment schedule and visibility from the same sales_products row.';

update public.sales_products
set public_details = coalesce(public_details, '{}'::jsonb) || jsonb_build_object(
  'slug','launch',
  'badge','Professional foundation',
  'summary','A credible, modern website for businesses that need to look established and make it easy for customers to get in touch.',
  'bestFor','Small businesses, startups, consultants, local service companies, and independent professionals.',
  'quote','We need a professional website that clearly explains our business and helps customers contact us.',
  'ctaText','Start With Launch',
  'ctaUrl','/contact-us',
  'featured',false,
  'technologies',jsonb_build_array(
    jsonb_build_object('name','WordPress','logoUrl','https://cdn.simpleicons.org/wordpress/21759B'),
    jsonb_build_object('name','Google Analytics','logoUrl','https://cdn.simpleicons.org/googleanalytics/E37400'),
    jsonb_build_object('name','Google Search Console','logoUrl','https://cdn.simpleicons.org/google/4285F4')
  ),
  'comparison',jsonb_build_object(
    'Professional design','Included','Responsive design','Included','Pages','Up to 5',
    'Business discovery','Basic','Competitor research','Basic','Custom UI/UX','Customized system',
    'Wireframes','—','Customer journey strategy','—','Copywriting','Included',
    'SEO foundation','Included','Search & AI discovery structure','—','Conversion strategy','Basic',
    'Analytics','Basic','Standard integrations','Basic','Advanced animation','—','E-commerce','Add-on',
    'User login / dashboard','—','Custom backend','—','Quality assurance','Standard',
    'Revision process','2 rounds','Post-launch support','14 days','Typical technology','WordPress'
  )
), updated_at = timezone('utc', now())
where code = 'PF-WEB-LAUNCH';

update public.sales_products
set public_details = coalesce(public_details, '{}'::jsonb) || jsonb_build_object(
  'slug','growth',
  'badge','Most popular',
  'summary','A custom, conversion-focused website for businesses that expect their digital presence to generate trust, enquiries, and measurable growth.',
  'bestFor','Established companies, clinics, hospitality, real estate, home services, professional services, and lead-focused B2B teams.',
  'quote','Our website needs to generate leads, improve credibility, and actively support business growth.',
  'ctaText','Choose Growth',
  'ctaUrl','/contact-us',
  'featured',true,
  'technologies',jsonb_build_array(
    jsonb_build_object('name','WordPress','logoUrl','https://cdn.simpleicons.org/wordpress/21759B'),
    jsonb_build_object('name','WooCommerce','logoUrl','https://cdn.simpleicons.org/woocommerce/96588A'),
    jsonb_build_object('name','Shopify','logoUrl','https://cdn.simpleicons.org/shopify/7AB55C'),
    jsonb_build_object('name','Webflow','logoUrl','https://cdn.simpleicons.org/webflow/4353FF')
  ),
  'comparison',jsonb_build_object(
    'Professional design','Included','Responsive design','Included','Pages','Approx. 10–12',
    'Business discovery','Detailed','Competitor research','Included','Custom UI/UX','Fully custom',
    'Wireframes','Key pages','Customer journey strategy','Included','Copywriting','Conversion focused',
    'SEO foundation','Enhanced','Search & AI discovery structure','Basic','Conversion strategy','Included',
    'Analytics','Advanced','Standard integrations','Up to 2','Advanced animation','Limited','E-commerce','Add-on',
    'User login / dashboard','—','Custom backend','—','Quality assurance','Comprehensive',
    'Revision process','3 rounds','Post-launch support','30 days','Typical technology','WordPress / Shopify / Webflow'
  )
), updated_at = timezone('utc', now())
where code = 'PF-WEB-GROWTH';

update public.sales_products
set public_details = coalesce(public_details, '{}'::jsonb) || jsonb_build_object(
  'slug','scale',
  'badge','Premium growth system',
  'summary','A differentiated digital experience for established organizations that need advanced UX, deeper strategy, and scalable technology.',
  'bestFor','Growing brands, technology companies, SaaS teams, premium providers, multi-location businesses, and organizations in digital transformation.',
  'quote','Our website is a serious part of our sales, marketing, brand, and growth strategy.',
  'ctaText','Discuss Scale',
  'ctaUrl','/contact-us',
  'featured',false,
  'technologies',jsonb_build_array(
    jsonb_build_object('name','Next.js','logoUrl','https://cdn.simpleicons.org/nextdotjs/000000'),
    jsonb_build_object('name','React','logoUrl','https://cdn.simpleicons.org/react/087EA4'),
    jsonb_build_object('name','TypeScript','logoUrl','https://cdn.simpleicons.org/typescript/3178C6'),
    jsonb_build_object('name','Supabase','logoUrl','https://cdn.simpleicons.org/supabase/3FCF8E'),
    jsonb_build_object('name','Cloudflare','logoUrl','https://cdn.simpleicons.org/cloudflare/F38020')
  ),
  'comparison',jsonb_build_object(
    'Professional design','Included','Responsive design','Included','Pages','Scope based',
    'Business discovery','Strategic','Competitor research','Advanced','Custom UI/UX','Premium bespoke',
    'Wireframes','Advanced','Customer journey strategy','Advanced','Copywriting','Advanced',
    'SEO foundation','Advanced','Search & AI discovery structure','Advanced','Conversion strategy','Advanced',
    'Analytics','Advanced','Standard integrations','Multiple','Advanced animation','Included','E-commerce','Available',
    'User login / dashboard','Separate scope','Custom backend','Separate scope','Quality assurance','50+ point QA',
    'Revision process','Milestone based','Post-launch support','60 days','Typical technology','Custom / Headless / Next.js'
  )
), updated_at = timezone('utc', now())
where code = 'PF-WEB-SCALE';

update public.sales_products
set public_details = coalesce(public_details, '{}'::jsonb) || jsonb_build_object(
  'slug','custom',
  'badge','Beyond a traditional website',
  'summary','For portals, dashboards, SaaS products, booking platforms, marketplaces, and business systems that need custom product design and engineering.',
  'bestFor','Organizations building a platform, portal, dashboard, workflow, multi-user product, or custom application.',
  'quote','We need a system, platform, portal, dashboard, or custom application—not just a website.',
  'ctaText','Discuss Your Custom Project',
  'ctaUrl','/contact-us',
  'featured',false,
  'technologies',jsonb_build_array(
    jsonb_build_object('name','React','logoUrl','https://cdn.simpleicons.org/react/087EA4'),
    jsonb_build_object('name','Node.js','logoUrl','https://cdn.simpleicons.org/nodedotjs/5FA04E'),
    jsonb_build_object('name','ASP.NET Core','logoUrl','https://cdn.simpleicons.org/dotnet/512BD4'),
    jsonb_build_object('name','PostgreSQL','logoUrl','https://cdn.simpleicons.org/postgresql/4169E1'),
    jsonb_build_object('name','Firebase','logoUrl','https://cdn.simpleicons.org/firebase/DD2C00'),
    jsonb_build_object('name','Cloudflare','logoUrl','https://cdn.simpleicons.org/cloudflare/F38020')
  ),
  'comparison',jsonb_build_object(
    'Professional design','Included','Responsive design','Included','Pages','Scope based',
    'Business discovery','Deep discovery','Competitor research','Project specific','Custom UI/UX','Product UX/UI',
    'Wireframes','Included','Customer journey strategy','Included','Copywriting','Project specific',
    'SEO foundation','Project specific','Search & AI discovery structure','Project specific','Conversion strategy','Custom',
    'Analytics','Custom','Standard integrations','Custom','Advanced animation','Included','E-commerce','Custom',
    'User login / dashboard','Included','Custom backend','Included','Quality assurance','Full QA / UAT',
    'Revision process','Milestone based','Post-launch support','Project specific','Typical technology','Project architecture'
  )
), updated_at = timezone('utc', now())
where code = 'PF-CUSTOM';

update public.sales_products
set public_details = coalesce(public_details, '{}'::jsonb) || jsonb_build_object(
  'slug','care','badge','Reliable website care',
  'summary','For businesses that need dependable maintenance and a clear support channel.',
  'ctaText','Choose Care','ctaUrl','/contact-us','featured',false
), updated_at = timezone('utc', now())
where code = 'PF-CARE';

update public.sales_products
set public_details = coalesce(public_details, '{}'::jsonb) || jsonb_build_object(
  'slug','growth-care','badge','For active marketing websites',
  'summary','For businesses using their website consistently for marketing, enquiries, and lead generation.',
  'ctaText','Choose Growth Care','ctaUrl','/contact-us','featured',true
), updated_at = timezone('utc', now())
where code = 'PF-CARE-GROWTH';

update public.sales_products
set public_details = coalesce(public_details, '{}'::jsonb) || jsonb_build_object(
  'slug','priority-care','badge','Ongoing improvement',
  'summary','For businesses that want priority service and proactive website improvement throughout the year.',
  'ctaText','Choose Priority Care','ctaUrl','/contact-us','featured',false
), updated_at = timezone('utc', now())
where code = 'PF-CARE-PRIORITY';

create or replace function public.get_public_sales_catalog()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'code', p.code,
        'name', p.name,
        'category', p.category,
        'productType', p.product_type,
        'priceMode', p.price_mode,
        'basePrice', p.base_price,
        'currency', p.currency,
        'billingPeriod', p.billing_period,
        'shortDescription', p.short_description,
        'fullDescription', p.full_description,
        'scope', coalesce(p.scope, '[]'::jsonb),
        'technology', p.technology,
        'standardPaymentTerms', p.standard_payment_terms,
        'paymentSchedule', coalesce(p.payment_schedule, '[]'::jsonb),
        'managerApprovalRequired', p.manager_approval_required,
        'sortOrder', p.sort_order,
        'publicDetails', coalesce(p.public_details, '{}'::jsonb),
        'updatedAt', p.updated_at
      ) order by p.sort_order, p.name
    ), '[]'::jsonb
  )
  from public.sales_products p
  where p.active = true and p.public_visible = true;
$$;

revoke all on function public.get_public_sales_catalog() from public;
grant execute on function public.get_public_sales_catalog() to anon, authenticated, service_role;

alter table public.sales_products add column if not exists service_family text;
alter table public.sales_products add column if not exists onboarding_template_key text;

comment on column public.sales_products.service_family is 'Explicit delivery service family used to select the correct client onboarding template for current/future catalog products.';
comment on column public.sales_products.onboarding_template_key is 'Explicit onboarding template key. Quotation snapshots preserve the resolved questions sold to each client.';

update public.system_configuration
set config_value = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(config_value,'{version}','3'::jsonb,true),
      '{serviceFamilies}',
      '[
        {"key":"website","label":"Website / Landing Pages"},
        {"key":"lead_generation","label":"Lead Generation / Conversion"},
        {"key":"seo","label":"SEO / Search / AI Discovery"},
        {"key":"branding","label":"Branding / Creative"},
        {"key":"ecommerce","label":"E-commerce"},
        {"key":"crm_integrations","label":"CRM / Integrations"},
        {"key":"automation","label":"Business Automation"},
        {"key":"email_marketing","label":"Email Marketing"},
        {"key":"web_app","label":"Web Application"},
        {"key":"mobile_app","label":"Mobile Application"},
        {"key":"saas","label":"SaaS Platform"},
        {"key":"custom_software","label":"Custom Software / System"},
        {"key":"content_copywriting","label":"Content / Copywriting"},
        {"key":"analytics_tracking","label":"Analytics / Tracking"},
        {"key":"care_support","label":"Care / Support"},
        {"key":"discovery","label":"Discovery / Planning"}
      ]'::jsonb,
      true
    ),
    '{fieldLibrary}',
    coalesce(config_value->'fieldLibrary','[]'::jsonb) || '[
      {"key":"businessModel","type":"textarea","label":"Business Model / Revenue Model","section":"Project Direction","required":true,"placeholder":"How does this product or system create value or revenue? Include plans, pricing, transactions, subscriptions, or internal operational value where relevant."},
      {"key":"platformTargets","type":"textarea","label":"Target Platforms & Devices","section":"Application Requirements","required":true,"placeholder":"Which platforms/devices are included: web, iOS, Android, tablet, desktop, or specific browsers/devices?"},
      {"key":"userJourneyRequirements","type":"textarea","label":"Key User Journeys","section":"Application Requirements","required":true,"placeholder":"Describe the important start-to-finish journeys users must be able to complete in the purchased scope."},
      {"key":"notificationRequirements","type":"textarea","label":"Notification Requirements","section":"Application Requirements","required":false,"placeholder":"Describe any included push, email, SMS, in-app, or system notifications, their triggers, recipients, and expected action."},
      {"key":"offlineDeviceRequirements","type":"textarea","label":"Offline / Device Capability Requirements","section":"Application Requirements","required":false,"placeholder":"If included, describe offline use, camera, GPS/location, files, contacts, biometrics, Bluetooth, or other device capabilities."},
      {"key":"appStoreRequirements","type":"textarea","label":"App Store / Play Store Release Requirements","section":"Application Requirements","required":true,"placeholder":"Who owns the Apple/Google developer accounts, which countries should be supported, and what release/listing assets or constraints apply? Do not enter passwords."},
      {"key":"securityComplianceRequirements","type":"textarea","label":"Security / Compliance Requirements","section":"Access & Technical","required":false,"placeholder":"Share security, privacy, regulatory, data residency, audit, SSO/MFA, retention, or compliance requirements relevant to the purchased scope."},
      {"key":"performanceScaleRequirements","type":"textarea","label":"Expected Usage / Scale","section":"Application Requirements","required":false,"placeholder":"Expected users, traffic, transactions, data volume, locations, concurrency, or performance expectations if known."},
      {"key":"hostingDeploymentRequirements","type":"textarea","label":"Hosting / Deployment Requirements","section":"Access & Technical","required":false,"placeholder":"Share existing cloud/hosting, environments, domains, deployment restrictions, ownership, or infrastructure requirements. Do not enter secrets."},
      {"key":"dataMigrationRequirements","type":"textarea","label":"Existing Data / Migration Requirements","section":"Access & Technical","required":false,"placeholder":"If migration/import is included, describe source systems, data types, approximate volume, cleanup/mapping needs, and ownership."},
      {"key":"billingEntitlementRequirements","type":"textarea","label":"Plans, Billing & Entitlement Requirements","section":"Application Requirements","required":false,"placeholder":"If included, describe plans, billing frequency, trials, upgrades/downgrades, limits, entitlements, cancellation, invoices, and access changes."},
      {"key":"emailMarketingGoals","type":"textarea","label":"Email Marketing Goals","section":"Email Marketing","required":true,"placeholder":"What should the included email marketing work achieve: nurture, sales, onboarding, retention, reactivation, education, or another measurable result?"},
      {"key":"emailAudienceRequirements","type":"textarea","label":"Audience, Lists & Segmentation","section":"Email Marketing","required":true,"placeholder":"Describe the audiences/lists, sources, segments, lifecycle stages, exclusions, and approximate list sizes relevant to the included work."},
      {"key":"emailCampaignRequirements","type":"textarea","label":"Campaign / Sequence Requirements","section":"Email Marketing","required":true,"placeholder":"Describe the included campaigns/sequences, triggers or schedule, offer, CTA, frequency, and customer journey."},
      {"key":"emailSenderRequirements","type":"textarea","label":"Sending Domain & Sender Setup","section":"Email Marketing","required":false,"placeholder":"Share the sending domain, sender names/addresses, current email platform, and who can grant DNS/platform access. Do not enter passwords."},
      {"key":"emailConsentRequirements","type":"textarea","label":"Consent / Subscription Rules","section":"Email Marketing","required":false,"placeholder":"Describe how contacts opt in, unsubscribe, preference-center needs, suppression rules, and any compliance requirements your business follows."},
      {"key":"emailAssetRequirements","type":"textarea","label":"Email Content / Creative Assets","section":"Email Marketing","required":false,"placeholder":"Share approved brand assets, offers, copy, templates, product/service information, testimonials, or links needed for the included campaigns."},
      {"key":"automationCurrentProcess","type":"textarea","label":"Current Process / Starting Point","section":"Automation","required":true,"placeholder":"Describe how the process works today, the people/systems involved, manual steps, pain points, and where the included automation should start/end."},
      {"key":"automationVolumes","type":"textarea","label":"Automation Volume / Frequency","section":"Automation","required":false,"placeholder":"Approximate records, leads, orders, messages, files, runs, or events per day/week/month and any peak periods."},
      {"key":"automationExceptionRules","type":"textarea","label":"Exceptions, Approvals & Failure Rules","section":"Automation","required":true,"placeholder":"What exceptions need human approval, what should happen when data is missing/invalid, and who should be alerted when automation fails?"}
    ]'::jsonb,
    true
  ),
  '{onboardingTemplates}',
  '[
    {"key":"website_launch","family":"website","label":"Website — Launch","description":"Core launch website delivery brief.","fieldKeys":["projectGoals","targetAudience","primaryOffer","pageBriefs","primaryCta","designPreferences","brandAssetsUrl","contentStatus","assetLinks","trustProof","formRouting","contactActions","seoMarkets","analyticsAccess","technicalAccess"]},
    {"key":"website_growth","family":"website","label":"Website — Growth","description":"Growth website with copy, conversion, SEO and integrations.","fieldKeys":["projectGoals","targetAudience","primaryOffer","pageBriefs","primaryCta","designPreferences","brandAssetsUrl","contentStatus","assetLinks","competitors","trustProof","formRouting","contactActions","seoMarkets","keywordPriorities","analyticsAccess","trackingGoals","integrationRequirements","copyVoice","technicalAccess"]},
    {"key":"website_scale","family":"website","label":"Website — Scale","description":"Advanced website delivery brief.","fieldKeys":["projectGoals","targetAudience","primaryOffer","pageBriefs","primaryCta","designPreferences","brandAssetsUrl","contentStatus","assetLinks","competitors","trustProof","formRouting","contactActions","seoMarkets","keywordPriorities","seoAssets","analyticsAccess","trackingGoals","integrationRequirements","copyVoice","croPriorities","accessibilityNeeds","stakeholderList","technicalAccess"]},
    {"key":"website_core","family":"website","label":"Website — General","description":"General website package for new future website offers.","fieldKeys":["projectGoals","targetAudience","primaryOffer","pageBriefs","primaryCta","designPreferences","brandAssetsUrl","contentStatus","assetLinks","trustProof","formRouting","contactActions","technicalAccess"]},
    {"key":"landing_page","family":"website","label":"Landing Page","description":"Campaign landing page.","fieldKeys":["landingPageBrief","primaryCta","trustProof","assetLinks"]},
    {"key":"additional_page","family":"website","label":"Additional Page","description":"Purchased additional page.","fieldKeys":["additionalPageBriefs","contentStatus","assetLinks"]},
    {"key":"custom_page","family":"website","label":"Custom Additional Page","description":"Additional custom-designed page.","fieldKeys":["additionalPageBriefs","designPreferences","contentStatus","assetLinks"]},
    {"key":"copywriting","family":"content_copywriting","label":"Copywriting","description":"Purchased copywriting.","fieldKeys":["copyPageBrief","copyVoice","trustProof"]},
    {"key":"blog_setup","family":"content_copywriting","label":"Blog Setup","description":"Blog setup/migration brief.","fieldKeys":["blogRequirements","assetLinks"]},
    {"key":"content_migration","family":"content_copywriting","label":"Content Migration","description":"Purchased content migration.","fieldKeys":["migrationRequirements","technicalAccess"]},
    {"key":"lead_form","family":"lead_generation","label":"Lead Form","description":"Lead capture and routing.","fieldKeys":["leadFormRequirements","formRouting"]},
    {"key":"booking","family":"lead_generation","label":"Booking / Calendar","description":"Booking integration.","fieldKeys":["bookingRequirements","technicalAccess"]},
    {"key":"live_chat","family":"lead_generation","label":"Live Chat / WhatsApp","description":"Customer chat integration.","fieldKeys":["chatRequirements"]},
    {"key":"reviews","family":"lead_generation","label":"Reviews Integration","description":"Review platform integration.","fieldKeys":["reviewsRequirements"]},
    {"key":"cro","family":"lead_generation","label":"Conversion Optimization","description":"Conversion optimization scope.","fieldKeys":["croPriorities","trackingGoals"]},
    {"key":"lead_generation","family":"lead_generation","label":"Lead Generation — General","description":"General future lead-generation work.","fieldKeys":["projectGoals","targetAudience","primaryOffer","leadFormRequirements","formRouting","trackingGoals","trustProof"]},
    {"key":"seo_local","family":"seo","label":"Local SEO","description":"Local/service-market SEO.","fieldKeys":["seoMarkets","seoAssets","technicalAccess"]},
    {"key":"seo_advanced","family":"seo","label":"Advanced SEO","description":"Advanced SEO strategy and implementation.","fieldKeys":["seoMarkets","keywordPriorities","seoAssets","technicalAccess"]},
    {"key":"seo_audit","family":"seo","label":"SEO Audit","description":"SEO audit access and evidence.","fieldKeys":["seoAssets","technicalAccess"]},
    {"key":"seo_migration","family":"seo","label":"SEO Migration","description":"SEO migration/redirect planning.","fieldKeys":["seoMigration","seoAssets","technicalAccess"]},
    {"key":"ai_discovery","family":"seo","label":"AI / GEO Discovery","description":"AI/search discovery scope.","fieldKeys":["aiDiscoveryTopics","seoMarkets"]},
    {"key":"seo_general","family":"seo","label":"SEO — General","description":"General future SEO package.","fieldKeys":["projectGoals","seoMarkets","keywordPriorities","seoAssets","analyticsAccess","trackingGoals","technicalAccess"]},
    {"key":"branding_logo","family":"branding","label":"Logo / Identity Refresh","description":"Logo/identity work.","fieldKeys":["brandDirection","brandAssetsUrl","creativeAssetBrief"]},
    {"key":"branding_system","family":"branding","label":"Brand System","description":"Brand direction/system.","fieldKeys":["brandDirection","brandAssetsUrl"]},
    {"key":"creative_asset","family":"branding","label":"Creative Asset","description":"Icons, illustration, animation or 3D asset.","fieldKeys":["brandAssetsUrl","creativeAssetBrief"]},
    {"key":"branding_general","family":"branding","label":"Branding — General","description":"General future branding package.","fieldKeys":["projectGoals","targetAudience","brandDirection","brandAssetsUrl","creativeAssetBrief","stakeholderList","acceptanceCriteria"]},
    {"key":"ecommerce","family":"ecommerce","label":"E-commerce Setup","description":"Store/catalog setup.","fieldKeys":["ecommerceRequirements","paymentGatewayRequirements","technicalAccess"]},
    {"key":"ecommerce_products","family":"ecommerce","label":"Additional E-commerce Products","description":"Additional product/catalog work.","fieldKeys":["ecommerceRequirements","assetLinks"]},
    {"key":"product_filters","family":"ecommerce","label":"Product Filters","description":"Product filtering/sorting.","fieldKeys":["productFilterRequirements"]},
    {"key":"subscription","family":"ecommerce","label":"Subscription Commerce","description":"Recurring-commerce requirements.","fieldKeys":["subscriptionRequirements","paymentGatewayRequirements"]},
    {"key":"payment_gateway","family":"ecommerce","label":"Payment Gateway","description":"Payment gateway integration.","fieldKeys":["paymentGatewayRequirements","technicalAccess"]},
    {"key":"checkout","family":"ecommerce","label":"Checkout","description":"Checkout flow.","fieldKeys":["checkoutRequirements","paymentGatewayRequirements"]},
    {"key":"crm","family":"crm_integrations","label":"CRM Integration","description":"CRM setup/integration.","fieldKeys":["crmRequirements","technicalAccess"]},
    {"key":"integration","family":"crm_integrations","label":"API / Integration","description":"General system integration.","fieldKeys":["integrationRequirements","technicalAccess"]},
    {"key":"lead_routing","family":"crm_integrations","label":"CRM Lead Routing","description":"Lead routing rules.","fieldKeys":["crmLeadRouting","crmRequirements"]},
    {"key":"automation","family":"automation","label":"Business Automation","description":"End-to-end business process automation.","fieldKeys":["projectGoals","automationCurrentProcess","automationRequirements","integrationRequirements","automationVolumes","automationExceptionRules","dataRequirements","securityComplianceRequirements","acceptanceCriteria","technicalAccess","stakeholderList"]},
    {"key":"email_marketing","family":"email_marketing","label":"Email Marketing / Automation","description":"Campaigns, sequences and lifecycle email.","fieldKeys":["projectGoals","targetAudience","emailMarketingGoals","emailAudienceRequirements","emailCampaignRequirements","emailSenderRequirements","emailConsentRequirements","emailAssetRequirements","emailAutomationRequirements","trackingGoals","technicalAccess","stakeholderList"]},
    {"key":"analytics_tracking","family":"analytics_tracking","label":"Analytics / Tracking","description":"Analytics, tagging and conversion measurement.","fieldKeys":["projectGoals","trackingGoals","analyticsAccess","technicalAccess"]},
    {"key":"web_app","family":"web_app","label":"Web Application","description":"Web application/package delivery requirements.","fieldKeys":["projectGoals","targetAudience","primaryOffer","businessModel","userRoles","userJourneyRequirements","workflowRequirements","featurePriorities","adminReporting","authPermissions","dataRequirements","integrationRequirements","securityComplianceRequirements","performanceScaleRequirements","hostingDeploymentRequirements","dataMigrationRequirements","designPreferences","brandAssetsUrl","acceptanceCriteria","technicalAccess","trainingHandover","stakeholderList"]},
    {"key":"mobile_app","family":"mobile_app","label":"Mobile Application","description":"iOS/Android/mobile application requirements.","fieldKeys":["projectGoals","targetAudience","primaryOffer","businessModel","platformTargets","userRoles","userJourneyRequirements","workflowRequirements","featurePriorities","authPermissions","dataRequirements","integrationRequirements","notificationRequirements","offlineDeviceRequirements","appStoreRequirements","securityComplianceRequirements","performanceScaleRequirements","designPreferences","brandAssetsUrl","acceptanceCriteria","technicalAccess","trainingHandover","stakeholderList"]},
    {"key":"saas","family":"saas","label":"SaaS Platform","description":"SaaS/member platform requirements.","fieldKeys":["projectGoals","targetAudience","primaryOffer","businessModel","userRoles","userJourneyRequirements","workflowRequirements","featurePriorities","portalRequirements","adminReporting","authPermissions","dataRequirements","integrationRequirements","billingEntitlementRequirements","securityComplianceRequirements","performanceScaleRequirements","hostingDeploymentRequirements","dataMigrationRequirements","designPreferences","brandAssetsUrl","acceptanceCriteria","technicalAccess","trainingHandover","stakeholderList"]},
    {"key":"custom_software","family":"custom_software","label":"Custom Software / System","description":"Custom system, portal or internal application.","fieldKeys":["projectGoals","targetAudience","primaryOffer","businessModel","userRoles","userJourneyRequirements","workflowRequirements","featurePriorities","portalRequirements","adminReporting","authPermissions","dataRequirements","integrationRequirements","securityComplianceRequirements","performanceScaleRequirements","hostingDeploymentRequirements","dataMigrationRequirements","designPreferences","brandAssetsUrl","acceptanceCriteria","technicalAccess","trainingHandover","stakeholderList"]},
    {"key":"discovery","family":"discovery","label":"Discovery / Planning","description":"Discovery before final build scope.","fieldKeys":["projectGoals","targetAudience","userRoles","workflowRequirements","featurePriorities","integrationRequirements","discoveryConstraints","acceptanceCriteria"]},
    {"key":"care","family":"care_support","label":"Care / Maintenance","description":"Care-plan requirements.","fieldKeys":["maintenancePriorities","technicalAccess"]},
    {"key":"care_growth","family":"care_support","label":"Care — Growth","description":"Care with analytics/SEO.","fieldKeys":["maintenancePriorities","analyticsAccess","seoAssets","technicalAccess"]},
    {"key":"care_priority","family":"care_support","label":"Care — Priority","description":"Priority care and ongoing strategy.","fieldKeys":["maintenancePriorities","analyticsAccess","seoAssets","strategyPriorities","technicalAccess"]}
  ]'::jsonb,
  true
),
updated_at=now()
where config_key='client_onboarding_settings';

create or replace function public.client_onboarding_infer_service_family(
  p_code text,p_name text,p_category text,p_product_type text,p_scope jsonb default '[]'::jsonb
) returns text language plpgsql stable security definer set search_path='public','pg_temp' as $function$
declare
  v_code text:=upper(btrim(coalesce(p_code,'')));
  v_hint text:=lower(concat_ws(' ',coalesce(p_code,''),coalesce(p_name,''),coalesce(p_category,''),coalesce(p_scope,'[]'::jsonb)::text));
  v_type text:=lower(btrim(coalesce(p_product_type,'')));
begin
  if v_code in ('PF-WEB-LAUNCH','PF-WEB-GROWTH','PF-WEB-SCALE','PF-ADD-PAGE','PF-ADD-CUSTOM-PAGE','PF-ADD-LANDING') then return 'website'; end if;
  if v_code in ('PF-ADD-COPY','PF-ADD-BLOG','PF-ADD-MIGRATION20') then return 'content_copywriting'; end if;
  if v_code in ('PF-ADD-LEADFORM','PF-ADD-BOOKING','PF-ADD-CHAT','PF-ADD-REVIEWS','PF-ADD-CRO') then return 'lead_generation'; end if;
  if v_code in ('PF-ADD-LOCALSEO','PF-ADD-ADVSEO','PF-ADD-AIDISCOVERY','PF-ADD-SEOAUDIT','PF-ADD-SEOMIGRATION') then return 'seo'; end if;
  if v_code in ('PF-ADD-LOGOREFRESH','PF-ADD-MINIBRAND','PF-ADD-ICONS','PF-ADD-ANIMATION','PF-ADD-ILLUSTRATION','PF-ADD-3D') then return 'branding'; end if;
  if v_code in ('PF-ADD-COMMERCE25','PF-ADD-COMMERCEADD25','PF-ADD-FILTERS','PF-ADD-SUBSCRIPTION','PF-ADD-PAYGATEWAY','PF-ADD-CHECKOUT','PF-ADD-PAYMENT') then return 'ecommerce'; end if;
  if v_code in ('PF-ADD-CRM','PF-ADD-INT-SIMPLE','PF-ADD-INT-ADV','PF-ADD-API','PF-ADD-LEADROUTE') then return 'crm_integrations'; end if;
  if v_code='PF-ADD-EMAIL' then return 'email_marketing'; end if;
  if v_code='PF-ADD-BPA' then return 'automation'; end if;
  if v_code='PF-ADD-TRACKING' then return 'analytics_tracking'; end if;
  if v_code in ('PF-CARE','PF-CARE-GROWTH','PF-CARE-PRIORITY') then return 'care_support'; end if;
  if v_code='PF-DISCOVERY' or v_type='discovery' then return 'discovery'; end if;
  if v_code='PF-CUSTOM' then return 'custom_software'; end if;

  if v_hint ~ '(mobile app|ios app|android app|app store|play store|react native|flutter)' then return 'mobile_app'; end if;
  if v_hint ~ '(saas|software as a service|multi-tenant|multitenant)' then return 'saas'; end if;
  if v_hint ~ '(web app|web application|client portal|customer portal|employee portal|admin portal|dashboard application)' then return 'web_app'; end if;
  if v_hint ~ '(email marketing|newsletter|email campaign|email sequence|lifecycle email|email automation)' then return 'email_marketing'; end if;
  if v_hint ~ '(automation|workflow|business process|zapier|make.com|n8n)' then return 'automation'; end if;
  if v_hint ~ '(e-commerce|ecommerce|online store|shopify|woocommerce|product catalog|checkout)' then return 'ecommerce'; end if;
  if v_hint ~ '(seo|search engine|local search|keyword|search migration|geo discovery)' then return 'seo'; end if;
  if v_hint ~ '(branding|logo|brand identity|illustration|animation|3d)' then return 'branding'; end if;
  if v_hint ~ '(crm|api integration|integration|hubspot|salesforce|zoho)' then return 'crm_integrations'; end if;
  if v_hint ~ '(analytics|tracking|tag manager|ga4|conversion tracking)' then return 'analytics_tracking'; end if;
  if v_hint ~ '(lead generation|lead form|booking|calendar|whatsapp|live chat|reviews|conversion optimization|cro)' then return 'lead_generation'; end if;
  if v_hint ~ '(copywriting|content writing|blog|content migration)' then return 'content_copywriting'; end if;
  if v_hint ~ '(maintenance|care plan|support plan)' then return 'care_support'; end if;
  if v_hint ~ '(website|web design|landing page|wordpress)' then return 'website'; end if;
  if v_type='custom' or v_hint ~ '(software|system|platform|application)' then return 'custom_software'; end if;
  return 'custom_software';
end;$function$;

create or replace function public.client_onboarding_infer_template_key(
  p_code text,p_name text,p_category text,p_product_type text,p_scope jsonb default '[]'::jsonb,p_family text default null
) returns text language plpgsql stable security definer set search_path='public','pg_temp' as $function$
declare
  v_code text:=upper(btrim(coalesce(p_code,'')));
  v_hint text:=lower(concat_ws(' ',coalesce(p_code,''),coalesce(p_name,''),coalesce(p_category,''),coalesce(p_scope,'[]'::jsonb)::text));
  v_family text:=coalesce(nullif(btrim(p_family),''),public.client_onboarding_infer_service_family(p_code,p_name,p_category,p_product_type,p_scope));
begin
  case v_code
    when 'PF-WEB-LAUNCH' then return 'website_launch'; when 'PF-WEB-GROWTH' then return 'website_growth'; when 'PF-WEB-SCALE' then return 'website_scale';
    when 'PF-ADD-PAGE' then return 'additional_page'; when 'PF-ADD-CUSTOM-PAGE' then return 'custom_page'; when 'PF-ADD-LANDING' then return 'landing_page';
    when 'PF-ADD-COPY' then return 'copywriting'; when 'PF-ADD-BLOG' then return 'blog_setup'; when 'PF-ADD-MIGRATION20' then return 'content_migration';
    when 'PF-ADD-LEADFORM' then return 'lead_form'; when 'PF-ADD-BOOKING' then return 'booking'; when 'PF-ADD-CHAT' then return 'live_chat'; when 'PF-ADD-REVIEWS' then return 'reviews'; when 'PF-ADD-CRO' then return 'cro';
    when 'PF-ADD-LOCALSEO' then return 'seo_local'; when 'PF-ADD-ADVSEO' then return 'seo_advanced'; when 'PF-ADD-AIDISCOVERY' then return 'ai_discovery'; when 'PF-ADD-SEOAUDIT' then return 'seo_audit'; when 'PF-ADD-SEOMIGRATION' then return 'seo_migration';
    when 'PF-ADD-LOGOREFRESH' then return 'branding_logo'; when 'PF-ADD-MINIBRAND' then return 'branding_system'; when 'PF-ADD-ICONS' then return 'creative_asset'; when 'PF-ADD-ANIMATION' then return 'creative_asset'; when 'PF-ADD-ILLUSTRATION' then return 'creative_asset'; when 'PF-ADD-3D' then return 'creative_asset';
    when 'PF-ADD-COMMERCE25' then return 'ecommerce'; when 'PF-ADD-COMMERCEADD25' then return 'ecommerce_products'; when 'PF-ADD-FILTERS' then return 'product_filters'; when 'PF-ADD-SUBSCRIPTION' then return 'subscription'; when 'PF-ADD-PAYGATEWAY' then return 'payment_gateway'; when 'PF-ADD-CHECKOUT' then return 'checkout'; when 'PF-ADD-PAYMENT' then return 'payment_gateway';
    when 'PF-ADD-CRM' then return 'crm'; when 'PF-ADD-INT-SIMPLE' then return 'integration'; when 'PF-ADD-INT-ADV' then return 'integration'; when 'PF-ADD-API' then return 'integration'; when 'PF-ADD-LEADROUTE' then return 'lead_routing';
    when 'PF-ADD-BPA' then return 'automation'; when 'PF-ADD-EMAIL' then return 'email_marketing'; when 'PF-ADD-TRACKING' then return 'analytics_tracking';
    when 'PF-CARE' then return 'care'; when 'PF-CARE-GROWTH' then return 'care_growth'; when 'PF-CARE-PRIORITY' then return 'care_priority';
    when 'PF-DISCOVERY' then return 'discovery'; when 'PF-CUSTOM' then return 'custom_software';
    else null;
  end case;

  if v_family='mobile_app' then return 'mobile_app'; end if;
  if v_family='web_app' then return 'web_app'; end if;
  if v_family='saas' then return 'saas'; end if;
  if v_family='automation' then return 'automation'; end if;
  if v_family='email_marketing' then return 'email_marketing'; end if;
  if v_family='analytics_tracking' then return 'analytics_tracking'; end if;
  if v_family='discovery' then return 'discovery'; end if;
  if v_family='custom_software' then return 'custom_software'; end if;
  if v_family='care_support' then return case when v_hint like '%priority%' then 'care_priority' when v_hint like '%growth%' then 'care_growth' else 'care' end; end if;
  if v_family='website' then return case when v_hint like '%landing%' then 'landing_page' else 'website_core' end; end if;
  if v_family='seo' then return case when v_hint like '%migrat%' or v_hint like '%redirect%' then 'seo_migration' when v_hint like '%audit%' then 'seo_audit' when v_hint like '%local%' then 'seo_local' when v_hint like '%ai%' or v_hint like '%geo%' then 'ai_discovery' when v_hint like '%advanced%' or v_hint like '%keyword%' then 'seo_advanced' else 'seo_general' end; end if;
  if v_family='branding' then return case when v_hint like '%logo%' then 'branding_logo' when v_hint ~ '(icon|illustrat|animation|motion|3d)' then 'creative_asset' else 'branding_general' end; end if;
  if v_family='ecommerce' then return case when v_hint like '%filter%' then 'product_filters' when v_hint like '%subscription%' or v_hint like '%recurring%' then 'subscription' when v_hint like '%checkout%' then 'checkout' when v_hint like '%payment%' or v_hint like '%gateway%' then 'payment_gateway' else 'ecommerce' end; end if;
  if v_family='crm_integrations' then return case when v_hint like '%lead rout%' then 'lead_routing' when v_hint like '%crm%' then 'crm' else 'integration' end; end if;
  if v_family='lead_generation' then return case when v_hint ~ '(book|calendar|appointment)' then 'booking' when v_hint ~ '(whatsapp|chat|messag)' then 'live_chat' when v_hint ~ '(review|testimonial)' then 'reviews' when v_hint ~ '(cro|conversion optim)' then 'cro' else 'lead_generation' end; end if;
  if v_family='content_copywriting' then return case when v_hint like '%blog%' then 'blog_setup' when v_hint like '%migrat%' then 'content_migration' else 'copywriting' end; end if;
  return 'custom_software';
end;$function$;

create or replace function public.client_onboarding_template_requirements(p_template_key text,p_scope jsonb default '[]'::jsonb,p_family text default null)
returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $function$
declare
  v_cfg jsonb:=public.client_onboarding_config();
  v_template jsonb; v_keys jsonb; v_scope_text text:=lower(coalesce(p_scope,'[]'::jsonb)::text); v_family text:=lower(coalesce(p_family,''));
  v_extra text[]:=array[]::text[]; v_key text; v_result text[]:=array[]::text[];
begin
  select value into v_template from jsonb_array_elements(coalesce(v_cfg->'onboardingTemplates','[]'::jsonb)) where value->>'key'=p_template_key limit 1;
  if v_template is null then raise exception 'Unknown onboarding template: %.',p_template_key; end if;
  if nullif(v_family,'') is not null and v_template->>'family'<>v_family then raise exception 'Onboarding template % does not belong to service family %.',p_template_key,v_family; end if;
  v_keys:=coalesce(v_template->'fieldKeys','[]'::jsonb);
  for v_key in select value from jsonb_array_elements_text(v_keys) loop if not (v_key=any(v_result)) then v_result:=array_append(v_result,v_key); end if; end loop;

  if v_scope_text ~ '(booking|calendar|appointment)' then v_extra:=array_append(v_extra,'bookingRequirements'); end if;
  if v_scope_text ~ '(whatsapp|live chat|chat integration)' then v_extra:=array_append(v_extra,'chatRequirements'); end if;
  if v_scope_text ~ '(crm|hubspot|salesforce|zoho crm)' then v_extra:=array_append(v_extra,'crmRequirements'); end if;
  if v_scope_text ~ '(email automation|email marketing|newsletter|email sequence)' then v_extra:=array_append(v_extra,'emailAutomationRequirements'); end if;
  if v_scope_text ~ '(analytics|tracking|ga4|tag manager|conversion event)' then v_extra:=array_append(v_extra,'trackingGoals'); end if;
  if v_scope_text ~ '(payment gateway|online payment|stripe|paypal|razorpay)' then v_extra:=array_append(v_extra,'paymentGatewayRequirements'); end if;
  if v_scope_text ~ '(subscription|recurring billing|membership plan)' then
    if v_family in ('web_app','mobile_app','saas','custom_software') then v_extra:=array_append(v_extra,'billingEntitlementRequirements'); else v_extra:=array_append(v_extra,'subscriptionRequirements'); end if;
  end if;
  if v_scope_text ~ '(push notification|in-app notification|sms notification)' then v_extra:=array_append(v_extra,'notificationRequirements'); end if;
  if v_scope_text ~ '(migration|data import|legacy data|existing data)' then
    if v_family in ('web_app','mobile_app','saas','custom_software','automation') then v_extra:=array_append(v_extra,'dataMigrationRequirements'); end if;
  end if;
  if v_scope_text ~ '(sso|single sign-on|mfa|multi-factor|role-based|permissions|authentication|login)' then v_extra:=array_append(v_extra,'authPermissions'); end if;
  if v_scope_text ~ '(admin dashboard|reporting|reports|analytics dashboard)' then v_extra:=array_append(v_extra,'adminReporting'); end if;
  if v_scope_text ~ '(api|integration|webhook)' then v_extra:=array_append(v_extra,'integrationRequirements'); end if;
  if v_scope_text ~ '(offline|camera|gps|geolocation|bluetooth|biometric)' then v_extra:=array_append(v_extra,'offlineDeviceRequirements'); end if;

  foreach v_key in array v_extra loop if not (v_key=any(v_result)) then v_result:=array_append(v_result,v_key); end if; end loop;
  return jsonb_build_object('fieldKeys',to_jsonb(v_result),'templateKey',p_template_key,'serviceFamily',coalesce(nullif(v_family,''),v_template->>'family'),'source','template');
end;$function$;

update public.sales_products sp set
  service_family=public.client_onboarding_infer_service_family(sp.code,sp.name,sp.category,sp.product_type,sp.scope),
  onboarding_template_key=public.client_onboarding_infer_template_key(sp.code,sp.name,sp.category,sp.product_type,sp.scope,public.client_onboarding_infer_service_family(sp.code,sp.name,sp.category,sp.product_type,sp.scope)),
  onboarding_requirements=sp.onboarding_requirements || jsonb_build_object(
    'serviceFamily',public.client_onboarding_infer_service_family(sp.code,sp.name,sp.category,sp.product_type,sp.scope),
    'templateKey',public.client_onboarding_infer_template_key(sp.code,sp.name,sp.category,sp.product_type,sp.scope,public.client_onboarding_infer_service_family(sp.code,sp.name,sp.category,sp.product_type,sp.scope)),
    'source','catalog_mapped'
  )
where service_family is null or onboarding_template_key is null or not (onboarding_requirements ? 'serviceFamily');

alter table public.sales_products alter column service_family set not null;
alter table public.sales_products alter column onboarding_template_key set not null;

create or replace function public.admin_upsert_sales_product(p_product jsonb)
returns uuid language plpgsql security definer set search_path='public','pg_temp' as $function$
declare
  v_id uuid; v_code text:=upper(trim(coalesce(p_product->>'code',''))); v_name text:=trim(coalesce(p_product->>'name','')); v_category text:=trim(coalesce(p_product->>'category',''));
  v_product_type text:=trim(coalesce(p_product->>'product_type','')); v_price_mode text:=trim(coalesce(p_product->>'price_mode','')); v_scope jsonb:=coalesce(p_product->'scope','[]'::jsonb);
  v_public_details jsonb:=coalesce(p_product->'public_details','{}'::jsonb); v_client_expectations jsonb:=coalesce(p_product->'client_expectations','{}'::jsonb);
  v_payment_schedule jsonb:=case when p_product ? 'payment_schedule' then p_product->'payment_schedule' else null end;
  v_duration_min integer:=case when nullif(p_product->>'delivery_duration_min','') is null then null else (p_product->>'delivery_duration_min')::integer end;
  v_duration_max integer:=case when nullif(p_product->>'delivery_duration_max','') is null then null else (p_product->>'delivery_duration_max')::integer end;
  v_timeline_impact text:=coalesce(nullif(p_product->>'timeline_impact',''),case when v_product_type='care_plan' then 'parallel' when v_price_mode='custom' or v_product_type='custom' then 'assessment_required' when v_product_type='package' then 'base' when v_product_type in ('addon','discovery') then 'additive' else 'assessment_required' end);
  v_requirements jsonb; v_current_requirements jsonb; v_cfg jsonb:=public.client_onboarding_config(); v_key text;
  v_current_service_family text; v_current_template_key text; v_current_scope jsonb;
  v_service_family text; v_template_key text; v_template jsonb;
  v_active boolean:=coalesce((p_product->>'active')::boolean,true);
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if v_code='' or v_name='' or v_category='' then raise exception 'Product code, name and category are required'; end if;
  if v_product_type not in ('package','addon','care_plan','discovery','custom') then raise exception 'Invalid product type'; end if;
  if v_price_mode not in ('fixed','starting_at','custom') then raise exception 'Invalid price mode'; end if;
  if v_timeline_impact not in ('base','additive','parallel','assessment_required') then raise exception 'Invalid timeline impact'; end if;
  if (v_duration_min is null)<>(v_duration_max is null) or coalesce(v_duration_min,0)<0 or (v_duration_min is not null and v_duration_max<v_duration_min) then raise exception 'Delivery duration must contain a valid minimum and maximum business-day range'; end if;
  if jsonb_typeof(v_scope)<>'array' then raise exception 'Scope must be an array'; end if;
  if jsonb_typeof(v_public_details)<>'object' then raise exception 'Public details must be an object'; end if;
  if jsonb_typeof(v_client_expectations)<>'object' then raise exception 'Client expectations must be an object'; end if;
  if exists(select 1 from jsonb_each(v_client_expectations) entry where entry.key not in ('clientResponsibilities','deliveryAssumptions','reviewAndApproval','handoverAndSupport') or jsonb_typeof(entry.value)<>'array') then raise exception 'Client expectations contain an unsupported section or non-array value'; end if;
  if exists(select 1 from jsonb_each(v_client_expectations) entry cross join lateral jsonb_array_elements(entry.value) item where jsonb_typeof(item)<>'string') then raise exception 'Each client expectation must be text'; end if;
  if v_payment_schedule is not null and jsonb_typeof(v_payment_schedule)<>'array' then raise exception 'Payment schedule must be an array'; end if;
  if coalesce((p_product->>'base_price')::numeric,0)<0 then raise exception 'Base price cannot be negative'; end if;

  if nullif(p_product->>'id','') is not null then
    select onboarding_requirements,service_family,onboarding_template_key,scope into v_current_requirements,v_current_service_family,v_current_template_key,v_current_scope from public.sales_products where id=(p_product->>'id')::uuid;
    if not found then raise exception 'Sales product not found'; end if;
  end if;

  v_service_family:=coalesce(nullif(btrim(p_product->>'service_family'),''),v_current_service_family,public.client_onboarding_infer_service_family(v_code,v_name,v_category,v_product_type,v_scope));
  v_template_key:=coalesce(nullif(btrim(p_product->>'onboarding_template_key'),''),v_current_template_key,public.client_onboarding_infer_template_key(v_code,v_name,v_category,v_product_type,v_scope,v_service_family));

  if not exists(select 1 from jsonb_array_elements(coalesce(v_cfg->'serviceFamilies','[]'::jsonb)) f where f->>'key'=v_service_family) then raise exception 'Unknown onboarding service family: %.',v_service_family; end if;
  select value into v_template from jsonb_array_elements(coalesce(v_cfg->'onboardingTemplates','[]'::jsonb)) where value->>'key'=v_template_key limit 1;
  if v_template is null then raise exception 'Unknown onboarding template: %.',v_template_key; end if;
  if v_template->>'family'<>v_service_family then raise exception 'Onboarding template % is not valid for service family %.',v_template_key,v_service_family; end if;

  if p_product ? 'onboarding_requirements' then
    v_requirements:=p_product->'onboarding_requirements' || jsonb_build_object('serviceFamily',v_service_family,'templateKey',v_template_key,'source','custom');
  elsif v_current_requirements is not null
        and v_current_service_family=v_service_family
        and v_current_template_key=v_template_key
        and v_current_scope is not distinct from v_scope then
    v_requirements:=v_current_requirements || jsonb_build_object('serviceFamily',v_service_family,'templateKey',v_template_key);
  else
    v_requirements:=public.client_onboarding_template_requirements(v_template_key,v_scope,v_service_family);
  end if;

  if jsonb_typeof(v_requirements)<>'object' then raise exception 'Onboarding requirements must be an object.'; end if;
  if jsonb_typeof(coalesce(v_requirements->'fieldKeys','[]'::jsonb))<>'array' then raise exception 'Onboarding fieldKeys must be an array.'; end if;
  if v_requirements ? 'customFields' and jsonb_typeof(v_requirements->'customFields')<>'array' then raise exception 'Onboarding customFields must be an array.'; end if;
  if v_active and jsonb_array_length(coalesce(v_requirements->'fieldKeys','[]'::jsonb))=0 and jsonb_array_length(case when jsonb_typeof(v_requirements->'customFields')='array' then v_requirements->'customFields' else '[]'::jsonb end)=0 then raise exception 'An active catalog product must define at least one onboarding requirement.'; end if;
  for v_key in select value from jsonb_array_elements_text(coalesce(v_requirements->'fieldKeys','[]'::jsonb)) loop if not exists(select 1 from jsonb_array_elements(coalesce(v_cfg->'fieldLibrary','[]'::jsonb)) f where f->>'key'=v_key) then raise exception 'Unknown onboarding field key: %.',v_key; end if; end loop;

  if nullif(p_product->>'id','') is null then
    insert into public.sales_products(code,name,category,product_type,price_mode,base_price,currency,billing_period,short_description,full_description,scope,technology,manager_approval_required,active,sort_order,standard_payment_terms,payment_schedule,public_visible,public_details,client_expectations,delivery_duration_min,delivery_duration_max,delivery_duration_unit,timeline_impact,delivery_duration_note,onboarding_requirements,service_family,onboarding_template_key,updated_at)
    values(v_code,v_name,v_category,v_product_type,v_price_mode,coalesce((p_product->>'base_price')::numeric,0),coalesce(nullif(p_product->>'currency',''),'USD'),nullif(p_product->>'billing_period',''),nullif(p_product->>'short_description',''),nullif(p_product->>'full_description',''),v_scope,nullif(p_product->>'technology',''),coalesce((p_product->>'manager_approval_required')::boolean,false),v_active,coalesce((p_product->>'sort_order')::integer,0),nullif(p_product->>'standard_payment_terms',''),v_payment_schedule,case when v_active then coalesce((p_product->>'public_visible')::boolean,false) else false end,v_public_details,v_client_expectations,v_duration_min,v_duration_max,'business_days',v_timeline_impact,nullif(btrim(coalesce(p_product->>'delivery_duration_note','')),''),v_requirements,v_service_family,v_template_key,timezone('utc',now())) returning id into v_id;
  else
    v_id:=(p_product->>'id')::uuid;
    update public.sales_products set code=v_code,name=v_name,category=v_category,product_type=v_product_type,price_mode=v_price_mode,base_price=coalesce((p_product->>'base_price')::numeric,0),currency=coalesce(nullif(p_product->>'currency',''),'USD'),billing_period=nullif(p_product->>'billing_period',''),short_description=nullif(p_product->>'short_description',''),full_description=nullif(p_product->>'full_description',''),scope=v_scope,technology=nullif(p_product->>'technology',''),manager_approval_required=coalesce((p_product->>'manager_approval_required')::boolean,false),active=v_active,sort_order=coalesce((p_product->>'sort_order')::integer,0),standard_payment_terms=nullif(p_product->>'standard_payment_terms',''),payment_schedule=v_payment_schedule,public_visible=case when v_active then coalesce((p_product->>'public_visible')::boolean,false) else false end,public_details=v_public_details,client_expectations=v_client_expectations,delivery_duration_min=v_duration_min,delivery_duration_max=v_duration_max,delivery_duration_unit='business_days',timeline_impact=v_timeline_impact,delivery_duration_note=nullif(btrim(coalesce(p_product->>'delivery_duration_note','')),''),onboarding_requirements=v_requirements,service_family=v_service_family,onboarding_template_key=v_template_key,updated_at=timezone('utc',now()) where id=v_id;
    if not found then raise exception 'Sales product not found'; end if;
  end if;
  return v_id;
end;$function$;

create or replace function public.client_onboarding_default_requirements(p_code text,p_name text,p_category text,p_product_type text,p_scope jsonb default '[]'::jsonb)
returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $function$
declare
  v_family text; v_template text;
begin
  v_family:=public.client_onboarding_infer_service_family(p_code,p_name,p_category,p_product_type,p_scope);
  v_template:=public.client_onboarding_infer_template_key(p_code,p_name,p_category,p_product_type,p_scope,v_family);
  return public.client_onboarding_template_requirements(v_template,p_scope,v_family);
end;$function$;

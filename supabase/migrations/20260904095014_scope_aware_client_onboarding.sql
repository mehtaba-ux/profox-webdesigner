alter table public.sales_products
  add column if not exists onboarding_requirements jsonb not null default '{"fieldKeys":[]}'::jsonb;

comment on column public.sales_products.onboarding_requirements is
  'Delivery onboarding information required when this catalog product is part of committed quotation scope. Resolved against client_onboarding_settings.fieldLibrary and snapshotted when a quotation is sent.';

alter table public.sales_products drop constraint if exists sales_products_onboarding_requirements_object_chk;
alter table public.sales_products add constraint sales_products_onboarding_requirements_object_chk
  check (jsonb_typeof(onboarding_requirements)='object');

insert into public.system_configuration(config_key,config_value,updated_at)
values(
  'client_onboarding_settings',
  jsonb_build_object(
    'version',2,
    'onboardingLinkExpiryDays',30,
    'portalInviteExpiryDays',7,
    'baseFields',jsonb_build_array(
      jsonb_build_object('key','companyName','type','text','label','Company / Brand Name','section','Business Details','required',true,'placeholder','Your company or brand name'),
      jsonb_build_object('key','website','type','url','label','Current Website','section','Business Details','required',false,'placeholder','https://example.com (if you have one)'),
      jsonb_build_object('key','phone','type','text','label','Primary Contact Phone','section','Business Details','required',true,'placeholder','Include country code'),
      jsonb_build_object('key','country','type','text','label','Country / Primary Market','section','Business Details','required',true,'placeholder','Primary country or market'),
      jsonb_build_object('key','decisionMaker','type','text','label','Primary Decision Maker','section','Communication','required',true,'placeholder','Name and role of the final decision maker'),
      jsonb_build_object('key','communicationPreference','type','select','label','Preferred Communication','section','Communication','required',true,'options',jsonb_build_array('Client Portal','Email','Scheduled Meeting')),
      jsonb_build_object('key','timezone','type','text','label','Timezone','section','Communication','required',true,'placeholder','Example: America/New_York or Europe/London'),
      jsonb_build_object('key','generalDeliveryNotes','type','textarea','label','Anything Else Our Delivery Team Should Know?','section','Communication','required',false,'placeholder','Optional. Share only information relevant to delivering the agreed scope.')
    ),
    'fieldLibrary',jsonb_build_array(
      jsonb_build_object('key','projectGoals','type','textarea','label','Main Project Goals','section','Project Direction','required',true,'placeholder','What should the included project achieve for your business?'),
      jsonb_build_object('key','targetAudience','type','textarea','label','Target Audience','section','Project Direction','required',true,'placeholder','Who are the primary customers or users for this project?'),
      jsonb_build_object('key','primaryOffer','type','textarea','label','Primary Offer / Service','section','Project Direction','required',true,'placeholder','What should the included website or system help you sell, promote, or deliver?'),
      jsonb_build_object('key','pageBriefs','type','textarea','label','Brief for the Pages Included in Your Plan','section','Pages & Content','required',true,'placeholder','For each page already included in your accepted scope, share its purpose, key information, CTA, and any specific content. Do not add new pages here.'),
      jsonb_build_object('key','additionalPageBriefs','type','textarea','label','Brief for Your Purchased Additional Page(s)','section','Pages & Content','required',true,'placeholder','Share the purpose, content, CTA, and assets for the additional page(s) included in your quotation.'),
      jsonb_build_object('key','landingPageBrief','type','textarea','label','Landing Page Campaign Brief','section','Pages & Content','required',true,'placeholder','What is the campaign, offer, audience, desired action, and source of traffic for this included landing page?'),
      jsonb_build_object('key','primaryCta','type','text','label','Primary Call to Action','section','Conversion & Leads','required',true,'placeholder','Example: Book a consultation, Request a quote, Buy now'),
      jsonb_build_object('key','designPreferences','type','textarea','label','Design Preferences','section','Brand & Design','required',true,'placeholder','Describe the visual direction and share what you like or dislike.'),
      jsonb_build_object('key','brandAssetsUrl','type','url','label','Brand Assets Link','section','Brand & Design','required',false,'placeholder','Drive/Dropbox/brand folder link'),
      jsonb_build_object('key','contentStatus','type','select','label','Content Status for Included Scope','section','Pages & Content','required',true,'options',jsonb_build_array('Ready','Partially Ready','Need ProFox Copywriting','Not Started')),
      jsonb_build_object('key','assetLinks','type','textarea','label','Content / Asset Links','section','Pages & Content','required',false,'placeholder','Share links to approved copy, images, videos, documents, testimonials, or other assets for the included scope.'),
      jsonb_build_object('key','competitors','type','textarea','label','Competitors / Reference Websites','section','Strategy & Research','required',false,'placeholder','Share relevant competitors or references and what you like or dislike about them.'),
      jsonb_build_object('key','trustProof','type','textarea','label','Trust Proof Available','section','Conversion & Leads','required',false,'placeholder','Reviews, testimonials, case studies, certifications, guarantees, awards, licenses, partner badges, or other proof we may use.'),
      jsonb_build_object('key','formRouting','type','textarea','label','Form Submission & Lead Routing','section','Conversion & Leads','required',true,'placeholder','Who should receive form enquiries, what information should be collected, and what should happen after submission?'),
      jsonb_build_object('key','contactActions','type','textarea','label','Contact & Action Details','section','Conversion & Leads','required',false,'placeholder','Phone, email, WhatsApp, social profiles, locations, or other customer actions that should be connected.'),
      jsonb_build_object('key','seoMarkets','type','textarea','label','SEO Services / Locations to Prioritize','section','Search & Analytics','required',false,'placeholder','List the priority services, products, locations, or markets relevant to the SEO included in your scope.'),
      jsonb_build_object('key','keywordPriorities','type','textarea','label','Keyword / Search Priorities','section','Search & Analytics','required',false,'placeholder','Share known priority search terms, topics, services, products, or locations. Leave blank if ProFox is researching them.'),
      jsonb_build_object('key','seoAssets','type','textarea','label','Existing SEO Assets & Access Notes','section','Search & Analytics','required',false,'placeholder','Search Console, analytics, sitemap, SEO reports, priority URLs, or existing SEO provider notes. Do not enter passwords.'),
      jsonb_build_object('key','seoMigration','type','textarea','label','SEO Migration / Redirect Requirements','section','Search & Analytics','required',true,'placeholder','Share URLs/pages that must be preserved, known redirects, ranking-critical pages, domain-change details, and migration concerns.'),
      jsonb_build_object('key','analyticsAccess','type','textarea','label','Analytics / Search Console Setup','section','Search & Analytics','required',false,'placeholder','Tell us whether GA4, Tag Manager, Search Console, or other analytics already exist and who can grant access. Do not enter passwords.'),
      jsonb_build_object('key','trackingGoals','type','textarea','label','Conversions & Events to Track','section','Search & Analytics','required',true,'placeholder','Which actions should be measured: forms, calls, email clicks, bookings, purchases, downloads, or other events?'),
      jsonb_build_object('key','integrationRequirements','type','textarea','label','Included Integration Requirements','section','Integrations & Systems','required',true,'placeholder','For the integrations included in your quotation, name the systems and describe the required data/workflow. Do not enter API keys or passwords.'),
      jsonb_build_object('key','copyVoice','type','textarea','label','Brand Voice & Messaging Direction','section','Copywriting','required',true,'placeholder','How should the brand sound? Share differentiators, objections, proof, phrases to use/avoid, and any messaging rules.'),
      jsonb_build_object('key','copyPageBrief','type','textarea','label','Copywriting Brief for Purchased Page(s)','section','Copywriting','required',true,'placeholder','For the page(s) with copywriting included, share the goal, audience, offer, key points, proof, CTA, and any required facts.'),
      jsonb_build_object('key','blogRequirements','type','textarea','label','Blog Setup Requirements','section','Pages & Content','required',true,'placeholder','Share desired blog categories, authors, existing posts/content to migrate, and publishing requirements for the included blog setup.'),
      jsonb_build_object('key','migrationRequirements','type','textarea','label','Content Migration Requirements','section','Pages & Content','required',true,'placeholder','Identify the existing site/source and the content/pages included in the purchased migration. Flag anything that must not be migrated.'),
      jsonb_build_object('key','leadFormRequirements','type','textarea','label','Advanced Lead Form Requirements','section','Conversion & Leads','required',true,'placeholder','What should the included lead form ask, qualify, route, notify, or trigger?'),
      jsonb_build_object('key','bookingRequirements','type','textarea','label','Booking / Calendar Requirements','section','Conversion & Leads','required',true,'placeholder','Name the booking/calendar platform, meeting types, routing rules, availability owner, and desired booking flow.'),
      jsonb_build_object('key','chatRequirements','type','textarea','label','WhatsApp / Live Chat Requirements','section','Conversion & Leads','required',true,'placeholder','Which included chat channel/platform should be connected, who handles enquiries, and what customer path should it support?'),
      jsonb_build_object('key','reviewsRequirements','type','textarea','label','Review Platform Integration','section','Conversion & Leads','required',true,'placeholder','Which review platform/profile should be connected and where should reviews be displayed?'),
      jsonb_build_object('key','crmRequirements','type','textarea','label','CRM Integration Requirements','section','Integrations & Systems','required',true,'placeholder','Name the CRM, required lead/contact fields, pipeline destination, ownership/routing, and who can grant access.'),
      jsonb_build_object('key','croPriorities','type','textarea','label','Conversion Optimization Priorities','section','Conversion & Leads','required',false,'placeholder','Share current conversion problems, important funnels/actions, existing results if known, and areas you want prioritized.'),
      jsonb_build_object('key','aiDiscoveryTopics','type','textarea','label','AI / Search Discovery Topics','section','Search & Analytics','required',true,'placeholder','Which services, products, expertise areas, questions, and entities should the included AI/GEO discovery work prioritize?'),
      jsonb_build_object('key','brandDirection','type','textarea','label','Brand / Creative Direction','section','Brand & Design','required',true,'placeholder','Share desired personality, colors, visual references, existing brand rules, and what must remain or change.'),
      jsonb_build_object('key','creativeAssetBrief','type','textarea','label','Creative Asset Brief','section','Brand & Design','required',true,'placeholder','Describe the included logo/icon/illustration/animation/3D asset, its use, style references, dimensions or technical requirements.'),
      jsonb_build_object('key','ecommerceRequirements','type','textarea','label','E-commerce Setup Requirements','section','E-commerce','required',true,'placeholder','Share the product/catalog source, variants, pricing, inventory, shipping, tax, countries/currencies, and operational requirements within the purchased scope.'),
      jsonb_build_object('key','productFilterRequirements','type','textarea','label','Product Filter Requirements','section','E-commerce','required',true,'placeholder','Which product attributes/categories should customers be able to filter or sort by?'),
      jsonb_build_object('key','subscriptionRequirements','type','textarea','label','Subscription Requirements','section','E-commerce','required',true,'placeholder','Describe plans, billing frequency, trials, upgrades/downgrades, cancellation rules, and customer access expected in the included subscription functionality.'),
      jsonb_build_object('key','paymentGatewayRequirements','type','textarea','label','Payment Gateway Requirements','section','E-commerce','required',true,'placeholder','Which payment provider/account should be connected, currencies/regions to support, and who can securely grant access? Do not enter credentials.'),
      jsonb_build_object('key','checkoutRequirements','type','textarea','label','Checkout Experience Requirements','section','E-commerce','required',true,'placeholder','Describe the included checkout flow, fields, order rules, confirmations, upsells, or special behavior.'),
      jsonb_build_object('key','emailAutomationRequirements','type','textarea','label','Email Automation Requirements','section','Integrations & Systems','required',true,'placeholder','Name the email platform and describe the triggers, audiences, messages, lists/tags, and handoff required in the purchased automation.'),
      jsonb_build_object('key','crmLeadRouting','type','textarea','label','CRM Lead Routing Rules','section','Integrations & Systems','required',true,'placeholder','Describe how leads should be assigned, tagged, staged, notified, or routed in the CRM.'),
      jsonb_build_object('key','automationRequirements','type','textarea','label','Business Automation Requirements','section','Integrations & Systems','required',true,'placeholder','Describe the included trigger → actions → systems → owners → expected outcome for each automation.'),
      jsonb_build_object('key','userRoles','type','textarea','label','User Types / Roles','section','Custom System','required',true,'placeholder','Who will use the included system and what should each role be allowed to see or do?'),
      jsonb_build_object('key','workflowRequirements','type','textarea','label','Core User / Business Workflows','section','Custom System','required',true,'placeholder','Describe the important start-to-finish workflows the included system must support.'),
      jsonb_build_object('key','featurePriorities','type','textarea','label','Included Feature Priorities','section','Custom System','required',true,'placeholder','List the features already agreed in scope and what successful behavior looks like. Do not use this field to request unquoted features.'),
      jsonb_build_object('key','portalRequirements','type','textarea','label','Portal Requirements','section','Custom System','required',true,'placeholder','For the included customer/employee/vendor/partner portal, describe users, screens, actions, data, and notifications.'),
      jsonb_build_object('key','adminReporting','type','textarea','label','Admin Dashboard / Reporting Requirements','section','Custom System','required',true,'placeholder','What should administrators manage, approve, search, export, or report on in the included admin experience?'),
      jsonb_build_object('key','authPermissions','type','textarea','label','Authentication & Permission Rules','section','Custom System','required',true,'placeholder','Describe login method, roles, approvals, sensitive actions, and access boundaries for the included system.'),
      jsonb_build_object('key','dataRequirements','type','textarea','label','Data / Backend Requirements','section','Custom System','required',true,'placeholder','What business data must the included system store, relate, import/export, retain, or report on? Do not submit secrets.'),
      jsonb_build_object('key','acceptanceCriteria','type','textarea','label','Success / Acceptance Criteria','section','Project Direction','required',true,'placeholder','What observable outcomes will confirm the agreed scope has been delivered successfully?'),
      jsonb_build_object('key','technicalAccess','type','textarea','label','Technical Environment & Access Notes','section','Access & Technical','required',false,'placeholder','Domain, DNS, hosting, CMS, repository, analytics, or other relevant systems and who can grant access. Never enter passwords, card details, or secret keys.'),
      jsonb_build_object('key','trainingHandover','type','textarea','label','Training / Handover Requirements','section','Access & Technical','required',false,'placeholder','Who needs training or documentation for the included system and what should the handover cover?'),
      jsonb_build_object('key','accessibilityNeeds','type','textarea','label','Accessibility Requirements','section','Brand & Design','required',false,'placeholder','Share any agreed accessibility target, user needs, standards, or known constraints relevant to this scope.'),
      jsonb_build_object('key','stakeholderList','type','textarea','label','Project Stakeholders & Approvers','section','Communication','required',false,'placeholder','List additional design/content/technical/legal approvers relevant to this project and their role in approvals.'),
      jsonb_build_object('key','maintenancePriorities','type','textarea','label','Maintenance / Support Priorities','section','Care & Support','required',true,'placeholder','What site/system is covered by this care plan, what should be monitored/maintained, and which recurring issues or priorities matter most?'),
      jsonb_build_object('key','strategyPriorities','type','textarea','label','Ongoing Improvement Priorities','section','Care & Support','required',false,'placeholder','Share the business, conversion, SEO, analytics, or website improvement priorities for the included ongoing strategy work.'),
      jsonb_build_object('key','discoveryConstraints','type','textarea','label','Known Constraints / Dependencies','section','Project Direction','required',false,'placeholder','Share known deadlines, systems, regulations, dependencies, technical constraints, or decisions the discovery must account for.')
    )
  ),
  now()
)
on conflict(config_key) do update set config_value=excluded.config_value, updated_at=excluded.updated_at;

create or replace function public.client_onboarding_default_requirements(
  p_code text,
  p_name text,
  p_category text,
  p_product_type text,
  p_scope jsonb default '[]'::jsonb
) returns jsonb
language plpgsql stable security definer set search_path='public','pg_temp'
as $function$
declare
  v_code text:=upper(btrim(coalesce(p_code,'')));
  v_category text:=lower(btrim(coalesce(p_category,'')));
  v_keys text[]:=array[]::text[];
begin
  case v_code
    when 'PF-WEB-LAUNCH' then v_keys:=array['projectGoals','targetAudience','primaryOffer','pageBriefs','primaryCta','designPreferences','brandAssetsUrl','contentStatus','assetLinks','trustProof','formRouting','contactActions','seoMarkets','analyticsAccess','technicalAccess'];
    when 'PF-WEB-GROWTH' then v_keys:=array['projectGoals','targetAudience','primaryOffer','pageBriefs','primaryCta','designPreferences','brandAssetsUrl','contentStatus','assetLinks','competitors','trustProof','formRouting','contactActions','seoMarkets','keywordPriorities','analyticsAccess','trackingGoals','integrationRequirements','copyVoice','technicalAccess'];
    when 'PF-WEB-SCALE' then v_keys:=array['projectGoals','targetAudience','primaryOffer','pageBriefs','primaryCta','designPreferences','brandAssetsUrl','contentStatus','assetLinks','competitors','trustProof','formRouting','contactActions','seoMarkets','keywordPriorities','seoAssets','analyticsAccess','trackingGoals','integrationRequirements','copyVoice','croPriorities','accessibilityNeeds','stakeholderList','technicalAccess'];
    when 'PF-CUSTOM' then v_keys:=array['projectGoals','targetAudience','primaryOffer','userRoles','workflowRequirements','featurePriorities','portalRequirements','adminReporting','authPermissions','dataRequirements','integrationRequirements','paymentGatewayRequirements','automationRequirements','designPreferences','brandAssetsUrl','acceptanceCriteria','technicalAccess','trainingHandover','stakeholderList'];
    when 'PF-DISCOVERY' then v_keys:=array['projectGoals','targetAudience','userRoles','workflowRequirements','featurePriorities','integrationRequirements','discoveryConstraints','acceptanceCriteria'];
    when 'PF-ADD-PAGE' then v_keys:=array['additionalPageBriefs','contentStatus','assetLinks'];
    when 'PF-ADD-CUSTOM-PAGE' then v_keys:=array['additionalPageBriefs','designPreferences','contentStatus','assetLinks'];
    when 'PF-ADD-LANDING' then v_keys:=array['landingPageBrief','primaryCta','trustProof','assetLinks'];
    when 'PF-ADD-COPY' then v_keys:=array['copyPageBrief','copyVoice','trustProof'];
    when 'PF-ADD-BLOG' then v_keys:=array['blogRequirements','assetLinks'];
    when 'PF-ADD-MIGRATION20' then v_keys:=array['migrationRequirements','technicalAccess'];
    when 'PF-ADD-LEADFORM' then v_keys:=array['leadFormRequirements','formRouting'];
    when 'PF-ADD-BOOKING' then v_keys:=array['bookingRequirements','technicalAccess'];
    when 'PF-ADD-CHAT' then v_keys:=array['chatRequirements'];
    when 'PF-ADD-REVIEWS' then v_keys:=array['reviewsRequirements'];
    when 'PF-ADD-CRM' then v_keys:=array['crmRequirements','technicalAccess'];
    when 'PF-ADD-TRACKING' then v_keys:=array['trackingGoals','analyticsAccess','technicalAccess'];
    when 'PF-ADD-CRO' then v_keys:=array['croPriorities','trackingGoals'];
    when 'PF-ADD-LOCALSEO' then v_keys:=array['seoMarkets','seoAssets','technicalAccess'];
    when 'PF-ADD-ADVSEO' then v_keys:=array['seoMarkets','keywordPriorities','seoAssets','technicalAccess'];
    when 'PF-ADD-AIDISCOVERY' then v_keys:=array['aiDiscoveryTopics','seoMarkets'];
    when 'PF-ADD-SEOAUDIT' then v_keys:=array['seoAssets','technicalAccess'];
    when 'PF-ADD-SEOMIGRATION' then v_keys:=array['seoMigration','seoAssets','technicalAccess'];
    when 'PF-ADD-LOGOREFRESH' then v_keys:=array['brandDirection','brandAssetsUrl','creativeAssetBrief'];
    when 'PF-ADD-MINIBRAND' then v_keys:=array['brandDirection','brandAssetsUrl'];
    when 'PF-ADD-ICONS' then v_keys:=array['brandAssetsUrl','creativeAssetBrief'];
    when 'PF-ADD-ANIMATION' then v_keys:=array['brandAssetsUrl','creativeAssetBrief'];
    when 'PF-ADD-ILLUSTRATION' then v_keys:=array['brandAssetsUrl','creativeAssetBrief'];
    when 'PF-ADD-3D' then v_keys:=array['brandAssetsUrl','creativeAssetBrief','technicalAccess'];
    when 'PF-ADD-COMMERCE25' then v_keys:=array['ecommerceRequirements','paymentGatewayRequirements','technicalAccess'];
    when 'PF-ADD-COMMERCEADD25' then v_keys:=array['ecommerceRequirements','assetLinks'];
    when 'PF-ADD-FILTERS' then v_keys:=array['productFilterRequirements'];
    when 'PF-ADD-SUBSCRIPTION' then v_keys:=array['subscriptionRequirements','paymentGatewayRequirements'];
    when 'PF-ADD-PAYGATEWAY' then v_keys:=array['paymentGatewayRequirements','technicalAccess'];
    when 'PF-ADD-CHECKOUT' then v_keys:=array['checkoutRequirements','paymentGatewayRequirements'];
    when 'PF-ADD-INT-SIMPLE' then v_keys:=array['integrationRequirements','technicalAccess'];
    when 'PF-ADD-INT-ADV' then v_keys:=array['integrationRequirements','technicalAccess'];
    when 'PF-ADD-API' then v_keys:=array['integrationRequirements','technicalAccess'];
    when 'PF-ADD-EMAIL' then v_keys:=array['emailAutomationRequirements','technicalAccess'];
    when 'PF-ADD-LEADROUTE' then v_keys:=array['crmLeadRouting','crmRequirements'];
    when 'PF-ADD-PAYMENT' then v_keys:=array['paymentGatewayRequirements','technicalAccess'];
    when 'PF-ADD-BPA' then v_keys:=array['automationRequirements','integrationRequirements'];
    when 'PF-CARE' then v_keys:=array['maintenancePriorities','technicalAccess'];
    when 'PF-CARE-GROWTH' then v_keys:=array['maintenancePriorities','analyticsAccess','seoAssets','technicalAccess'];
    when 'PF-CARE-PRIORITY' then v_keys:=array['maintenancePriorities','analyticsAccess','seoAssets','strategyPriorities','technicalAccess'];
    else
      if p_product_type='package' and v_category like '%web%' then v_keys:=array['projectGoals','targetAudience','primaryOffer','pageBriefs','primaryCta','designPreferences','brandAssetsUrl','contentStatus','assetLinks','technicalAccess'];
      elsif v_category like '%page%' or v_category like '%content%' then v_keys:=array['additionalPageBriefs','contentStatus','assetLinks'];
      elsif v_category like '%lead%' then v_keys:=array['leadFormRequirements','formRouting'];
      elsif v_category like '%search%' or v_category like '%seo%' then v_keys:=array['seoMarkets','seoAssets','technicalAccess'];
      elsif v_category like '%brand%' then v_keys:=array['brandDirection','brandAssetsUrl','creativeAssetBrief'];
      elsif v_category like '%commerce%' then v_keys:=array['ecommerceRequirements','paymentGatewayRequirements','technicalAccess'];
      elsif v_category like '%integration%' then v_keys:=array['integrationRequirements','technicalAccess'];
      elsif v_category like '%care%' then v_keys:=array['maintenancePriorities','technicalAccess'];
      elsif p_product_type='discovery' then v_keys:=array['projectGoals','targetAudience','workflowRequirements','featurePriorities','discoveryConstraints'];
      elsif p_product_type='custom' then v_keys:=array['projectGoals','targetAudience','workflowRequirements','featurePriorities','acceptanceCriteria','technicalAccess'];
      else v_keys:=array['projectGoals']; end if;
  end case;
  return jsonb_build_object('fieldKeys',to_jsonb(v_keys));
end;$function$;

update public.sales_products sp
set onboarding_requirements=public.client_onboarding_default_requirements(sp.code,sp.name,sp.category,sp.product_type,sp.scope), updated_at=updated_at;

create or replace function public.client_onboarding_fields_for_requirements(p_requirements jsonb)
returns jsonb
language plpgsql stable security definer set search_path='public','pg_temp'
as $function$
declare
  v_cfg jsonb:=public.client_onboarding_config(); v_library jsonb:=coalesce(v_cfg->'fieldLibrary','[]'::jsonb); v_result jsonb:='[]'::jsonb;
  v_key text; v_field jsonb; v_custom jsonb;
begin
  if p_requirements is null or jsonb_typeof(p_requirements)<>'object' then return v_result; end if;
  if jsonb_typeof(coalesce(p_requirements->'fieldKeys','[]'::jsonb))='array' then
    for v_key in select value from jsonb_array_elements_text(coalesce(p_requirements->'fieldKeys','[]'::jsonb)) loop
      select value into v_field from jsonb_array_elements(v_library) where value->>'key'=v_key limit 1;
      if v_field is not null then v_result:=v_result||jsonb_build_array(v_field); end if; v_field:=null;
    end loop;
  end if;
  if jsonb_typeof(coalesce(p_requirements->'customFields','[]'::jsonb))='array' then
    for v_custom in select value from jsonb_array_elements(coalesce(p_requirements->'customFields','[]'::jsonb)) loop
      if jsonb_typeof(v_custom)='object' and btrim(coalesce(v_custom->>'key',''))<>'' then v_result:=v_result||jsonb_build_array(v_custom); end if;
    end loop;
  end if;
  return v_result;
end;$function$;

create or replace function public.client_onboarding_resolve_fields(p_quotation_id uuid)
returns jsonb
language plpgsql stable security definer set search_path='public','pg_temp'
as $function$
declare
  v_quote public.quotations%rowtype; v_cfg jsonb:=public.client_onboarding_config(); v_base jsonb; v_result jsonb:='[]'::jsonb; v_seen text[]:=array[]::text[];
  v_field jsonb; v_key text; v_line record; v_snapshot_item jsonb; v_fields jsonb; v_requirements jsonb;
begin
  select * into v_quote from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found for onboarding.'; end if;
  v_base:=coalesce(v_cfg->'baseFields',v_cfg->'fields','[]'::jsonb); if jsonb_typeof(v_base)<>'array' then v_base:='[]'::jsonb; end if;
  for v_field in select value from jsonb_array_elements(v_base) loop
    v_key:=btrim(coalesce(v_field->>'key','')); if v_key<>'' and not (v_key=any(v_seen)) then v_result:=v_result||jsonb_build_array(v_field); v_seen:=array_append(v_seen,v_key); end if;
  end loop;
  for v_line in select qi.id,qi.sales_product_id,qi.sort_order,qi.created_at from public.quotation_items qi where qi.quotation_id=p_quotation_id and coalesce(qi.optional_for_client,false)=false order by qi.sort_order,qi.created_at loop
    v_snapshot_item:=null;
    if jsonb_typeof(coalesce(v_quote.commercial_snapshot->'items','[]'::jsonb))='array' then
      select value into v_snapshot_item from jsonb_array_elements(coalesce(v_quote.commercial_snapshot->'items','[]'::jsonb)) where value->>'id'=v_line.id::text limit 1;
    end if;
    v_fields:=case when jsonb_typeof(v_snapshot_item->'onboardingFields')='array' then v_snapshot_item->'onboardingFields' else null end;
    if v_fields is null then
      v_requirements:=case when jsonb_typeof(v_snapshot_item->'onboardingRequirements')='object' then v_snapshot_item->'onboardingRequirements' else null end;
      if v_requirements is null and v_line.sales_product_id is not null then select sp.onboarding_requirements into v_requirements from public.sales_products sp where sp.id=v_line.sales_product_id; end if;
      v_fields:=public.client_onboarding_fields_for_requirements(coalesce(v_requirements,'{}'::jsonb));
    end if;
    if jsonb_typeof(coalesce(v_fields,'[]'::jsonb))='array' then
      for v_field in select value from jsonb_array_elements(coalesce(v_fields,'[]'::jsonb)) loop
        v_key:=btrim(coalesce(v_field->>'key','')); if v_key<>'' and not (v_key=any(v_seen)) then v_result:=v_result||jsonb_build_array(v_field); v_seen:=array_append(v_seen,v_key); end if;
      end loop;
    end if;
  end loop;
  if jsonb_array_length(v_result)=0 then raise exception 'Client onboarding form resolved to no fields.'; end if;
  return v_result;
end;$function$;

create or replace function public.admin_upsert_sales_product(p_product jsonb)
returns uuid
language plpgsql security definer set search_path='public','pg_temp'
as $function$
declare
  v_id uuid; v_code text:=upper(trim(coalesce(p_product->>'code',''))); v_name text:=trim(coalesce(p_product->>'name','')); v_category text:=trim(coalesce(p_product->>'category',''));
  v_product_type text:=trim(coalesce(p_product->>'product_type','')); v_price_mode text:=trim(coalesce(p_product->>'price_mode','')); v_scope jsonb:=coalesce(p_product->'scope','[]'::jsonb);
  v_public_details jsonb:=coalesce(p_product->'public_details','{}'::jsonb); v_client_expectations jsonb:=coalesce(p_product->'client_expectations','{}'::jsonb);
  v_payment_schedule jsonb:=case when p_product ? 'payment_schedule' then p_product->'payment_schedule' else null end;
  v_duration_min integer:=case when nullif(p_product->>'delivery_duration_min','') is null then null else (p_product->>'delivery_duration_min')::integer end;
  v_duration_max integer:=case when nullif(p_product->>'delivery_duration_max','') is null then null else (p_product->>'delivery_duration_max')::integer end;
  v_timeline_impact text:=coalesce(nullif(p_product->>'timeline_impact',''),case when v_product_type='care_plan' then 'parallel' when v_price_mode='custom' or v_product_type='custom' then 'assessment_required' when v_product_type='package' then 'base' when v_product_type in ('addon','discovery') then 'additive' else 'assessment_required' end);
  v_requirements jsonb; v_current_requirements jsonb; v_cfg jsonb:=public.client_onboarding_config(); v_key text;
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
  if p_product ? 'onboarding_requirements' then v_requirements:=p_product->'onboarding_requirements';
  elsif nullif(p_product->>'id','') is not null then select onboarding_requirements into v_current_requirements from public.sales_products where id=(p_product->>'id')::uuid; v_requirements:=coalesce(v_current_requirements,public.client_onboarding_default_requirements(v_code,v_name,v_category,v_product_type,v_scope));
  else v_requirements:=public.client_onboarding_default_requirements(v_code,v_name,v_category,v_product_type,v_scope); end if;
  if jsonb_typeof(v_requirements)<>'object' then raise exception 'Onboarding requirements must be an object.'; end if;
  if jsonb_typeof(coalesce(v_requirements->'fieldKeys','[]'::jsonb))<>'array' then raise exception 'Onboarding fieldKeys must be an array.'; end if;
  for v_key in select value from jsonb_array_elements_text(coalesce(v_requirements->'fieldKeys','[]'::jsonb)) loop
    if not exists(select 1 from jsonb_array_elements(coalesce(v_cfg->'fieldLibrary','[]'::jsonb)) f where f->>'key'=v_key) then raise exception 'Unknown onboarding field key: %.',v_key; end if;
  end loop;
  if nullif(p_product->>'id','') is null then
    insert into public.sales_products(code,name,category,product_type,price_mode,base_price,currency,billing_period,short_description,full_description,scope,technology,manager_approval_required,active,sort_order,standard_payment_terms,payment_schedule,public_visible,public_details,client_expectations,delivery_duration_min,delivery_duration_max,delivery_duration_unit,timeline_impact,delivery_duration_note,onboarding_requirements,updated_at)
    values(v_code,v_name,v_category,v_product_type,v_price_mode,coalesce((p_product->>'base_price')::numeric,0),coalesce(nullif(p_product->>'currency',''),'USD'),nullif(p_product->>'billing_period',''),nullif(p_product->>'short_description',''),nullif(p_product->>'full_description',''),v_scope,nullif(p_product->>'technology',''),coalesce((p_product->>'manager_approval_required')::boolean,false),coalesce((p_product->>'active')::boolean,true),coalesce((p_product->>'sort_order')::integer,0),nullif(p_product->>'standard_payment_terms',''),v_payment_schedule,coalesce((p_product->>'public_visible')::boolean,false),v_public_details,v_client_expectations,v_duration_min,v_duration_max,'business_days',v_timeline_impact,nullif(btrim(coalesce(p_product->>'delivery_duration_note','')),''),v_requirements,timezone('utc',now())) returning id into v_id;
  else
    v_id:=(p_product->>'id')::uuid;
    update public.sales_products set code=v_code,name=v_name,category=v_category,product_type=v_product_type,price_mode=v_price_mode,base_price=coalesce((p_product->>'base_price')::numeric,0),currency=coalesce(nullif(p_product->>'currency',''),'USD'),billing_period=nullif(p_product->>'billing_period',''),short_description=nullif(p_product->>'short_description',''),full_description=nullif(p_product->>'full_description',''),scope=v_scope,technology=nullif(p_product->>'technology',''),manager_approval_required=coalesce((p_product->>'manager_approval_required')::boolean,false),active=coalesce((p_product->>'active')::boolean,true),sort_order=coalesce((p_product->>'sort_order')::integer,0),standard_payment_terms=nullif(p_product->>'standard_payment_terms',''),payment_schedule=v_payment_schedule,public_visible=coalesce((p_product->>'public_visible')::boolean,false),public_details=v_public_details,client_expectations=v_client_expectations,delivery_duration_min=v_duration_min,delivery_duration_max=v_duration_max,delivery_duration_unit='business_days',timeline_impact=v_timeline_impact,delivery_duration_note=nullif(btrim(coalesce(p_product->>'delivery_duration_note','')),''),onboarding_requirements=v_requirements,updated_at=timezone('utc',now()) where id=v_id;
    if not found then raise exception 'Sales product not found'; end if;
  end if;
  return v_id;
end;$function$;

create or replace function public.snapshot_quotation_payment_schedule_before_send()
returns trigger
language plpgsql security definer set search_path='public','pg_temp'
as $function$
declare v_res jsonb; v_items jsonb:='[]'::jsonb; v_missing text[]:='{}'::text[];
begin
  if new.status='Sent' and old.status is distinct from new.status then
    if coalesce(new.total,0)<=0 then raise exception 'Quotation total must be greater than zero before sending.'; end if;
    v_missing:=public.quotation_timeline_missing_items(new.id);
    if cardinality(v_missing)>0 or nullif(btrim(coalesce(new.duration_snapshot_text,'')),'') is null then raise exception 'Confirm the required product timeline information before sending this quotation.'; end if;
    if new.payment_schedule_snapshot is null then v_res:=public.resolve_quotation_payment_schedule(new.id); new.payment_schedule_snapshot:=v_res->'schedule'; new.payment_schedule_source_code:=v_res->>'sourceCode'; new.payment_schedule_snapshotted_at:=now(); new.payment_terms:=coalesce(nullif(btrim(new.payment_terms),''),nullif(btrim(v_res->>'standardPaymentTerms'),'')); end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',qi.id,'salesProductId',qi.sales_product_id,'productCode',qi.product_code_snapshot,'productName',qi.product_name_snapshot,'description',qi.description_snapshot,'quantity',qi.quantity,'unitPrice',qi.unit_price,'grossTotal',round((qi.quantity*qi.unit_price)::numeric,2),'discountType',qi.discount_type,'discountValue',qi.discount_value,'discountAmount',qi.discount_amount,'lineTotal',qi.line_total,'itemType',qi.item_type,'lineType',qi.line_type,'optionalForClient',qi.optional_for_client,'sectionKey',qi.section_key,'configuration',qi.configuration_snapshot,'clientExpectations',qi.client_expectations_snapshot,'scope',coalesce(sp.scope,'[]'::jsonb),'onboardingRequirements',coalesce(sp.onboarding_requirements,'{"fieldKeys":[]}'::jsonb),'onboardingFields',public.client_onboarding_fields_for_requirements(coalesce(sp.onboarding_requirements,'{"fieldKeys":[]}'::jsonb)),'durationMin',qi.duration_min_snapshot,'durationMax',qi.duration_max_snapshot,'durationUnit',qi.duration_unit_snapshot,'timelineImpact',qi.timeline_impact_snapshot,'durationNote',qi.duration_note_snapshot,'timelineText',public.format_quotation_line_timeline(qi.item_type,qi.duration_min_snapshot,qi.duration_max_snapshot,qi.duration_unit_snapshot,qi.timeline_impact_snapshot)) order by qi.sort_order,qi.created_at),'[]'::jsonb)
    into v_items from public.quotation_items qi left join public.sales_products sp on sp.id=qi.sales_product_id where qi.quotation_id=new.id;
    new.commercial_snapshot:=jsonb_build_object('quotationNumber',new.quotation_number,'revisionNumber',new.revision_number,'proposalTitle',new.proposal_title,'customerName',new.customer_name,'contactName',new.contact_name,'email',new.email,'phone',new.phone,'country',new.country,'currency',new.currency,'validUntil',new.valid_until,'paymentTerms',new.payment_terms,'scopeSummary',new.scope_summary,'exclusions',new.exclusions,'executiveSummary',new.executive_summary,'coverMessage',new.cover_message,'clientResponsibilities',new.client_responsibilities,'deliveryAssumptions',new.delivery_assumptions,'reviewProcess',new.review_process,'handoverSupport',new.handover_support,'termsAndConditions',new.terms_and_conditions,'subtotal',new.subtotal,'lineDiscountTotal',new.line_discount_total,'quoteDiscountType',new.quote_discount_type,'quoteDiscountValue',new.quote_discount_value,'quoteDiscountTotal',new.quote_discount_total,'optionalTotal',new.optional_total,'taxRate',new.tax_rate,'taxTotal',new.tax_total,'total',new.total,'timeline',jsonb_build_object('min',new.estimated_duration_min,'max',new.estimated_duration_max,'unit',new.duration_unit,'text',new.duration_snapshot_text,'source',new.duration_source),'paymentSchedule',new.payment_schedule_snapshot,'items',v_items);
    new.commercial_snapshotted_at:=now();
  end if;
  return new;
end;$function$;

create or replace function public.ensure_client_onboarding_for_project(p_project_id uuid, p_send_invite boolean default true)
returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_temp'
as $function$
declare
  v_project public.projects%rowtype; v_client public.clients%rowtype; v_quote public.quotations%rowtype; v_onboarding public.client_onboardings%rowtype; v_identity uuid; v_payment uuid; v_cfg jsonb; v_fields jsonb; v_token text; v_base text; v_url text; v_days integer; v_queued uuid; v_count integer;
begin
  select * into v_project from public.projects where id=p_project_id for update; if not found then raise exception 'Project not found.'; end if;
  if v_project.client_id is null or v_project.quotation_id is null then raise exception 'Paid project must be linked to a client and accepted quotation before onboarding.'; end if;
  select * into v_client from public.clients where id=v_project.client_id; if not found then raise exception 'Project client not found.'; end if;
  select * into v_quote from public.quotations where id=v_project.quotation_id; if not found or v_quote.status<>'Accepted' then raise exception 'Accepted quotation is required before client onboarding.'; end if;
  select p.id into v_payment from public.payments p where p.quotation_id=v_quote.id and p.payment_type in ('Advance','Full Payment') and p.status='Verified' order by coalesce(p.milestone_number,1),p.verified_at,p.created_at limit 1; if v_payment is null then raise exception 'Verified first payment is required before client onboarding.'; end if;
  v_identity:=coalesce(v_client.customer_identity_id,v_quote.customer_identity_id,public.customer_identity_resolve(v_client.email,v_client.primary_contact_name,v_client.phone)); if v_identity is null then raise exception 'Customer identity could not be resolved for onboarding.'; end if;
  v_cfg:=public.client_onboarding_config(); v_fields:=public.client_onboarding_resolve_fields(v_quote.id); v_days:=greatest(1,least(90,coalesce((v_cfg->>'onboardingLinkExpiryDays')::integer,30)));
  select * into v_onboarding from public.client_onboardings where project_id=v_project.id for update;
  if not found then insert into public.client_onboardings(customer_identity_id,client_id,project_id,quotation_id,triggering_payment_id,status,form_version,field_schema) values(v_identity,v_client.id,v_project.id,v_quote.id,v_payment,'Pending',greatest(2,coalesce((v_cfg->>'version')::integer,2)),v_fields) returning * into v_onboarding;
  else update public.client_onboardings set customer_identity_id=v_identity,client_id=v_client.id,quotation_id=v_quote.id,triggering_payment_id=coalesce(triggering_payment_id,v_payment),form_version=case when status='Completed' then form_version else greatest(2,coalesce((v_cfg->>'version')::integer,2)) end,field_schema=case when status='Completed' then field_schema else v_fields end,updated_at=now() where id=v_onboarding.id returning * into v_onboarding; end if;
  if p_send_invite and v_onboarding.status<>'Completed' then v_token:=encode(extensions.gen_random_bytes(32),'hex'); v_count:=least(v_onboarding.onboarding_invite_count+1,100); update public.client_onboardings set public_token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),public_token_issued_at=now(),public_token_expires_at=now()+make_interval(days=>v_days),onboarding_invite_count=v_count,onboarding_invite_last_sent_at=now(),updated_at=now() where id=v_onboarding.id returning * into v_onboarding; select nullif(btrim(config_value->>'url'),'') into v_base from public.system_configuration where config_key='public_app_base_url'; v_base:=rtrim(coalesce(v_base,'https://www.profoxwebdesigner.com'),'/'); v_url:=v_base||'/client-onboarding/'||v_token; v_queued:=public.service_queue_customer_communication('customer-client-onboarding:'||v_onboarding.id::text||':'||v_count::text,'customer_client_onboarding_required',v_client.email,v_client.salesperson_id,v_client.primary_contact_name,v_client.company_name,jsonb_build_object('onboardingId',v_onboarding.id,'projectId',v_project.id,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'packageName',coalesce(v_project.package_snapshot,''),'onboardingUrl',v_url),now()); end if;
  return jsonb_build_object('onboardingId',v_onboarding.id,'projectId',v_project.id,'status',v_onboarding.status,'inviteQueued',v_queued is not null,'inviteCount',v_onboarding.onboarding_invite_count,'fieldCount',jsonb_array_length(v_fields));
end;$function$;

create or replace function public.public_client_onboarding_open(p_token text)
returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_temp'
as $function$
declare
  v_hash text; v_o public.client_onboardings%rowtype; v_project public.projects%rowtype; v_client public.clients%rowtype; v_identity public.customer_identities%rowtype; v_quote public.quotations%rowtype; v_fields jsonb; v_scope_items jsonb:='[]'::jsonb; v_scope_item jsonb;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Onboarding link is invalid.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex'); select * into v_o from public.client_onboardings where public_token_hash=v_hash for update; if not found then raise exception 'Onboarding link is invalid or no longer available.'; end if; if v_o.public_token_expires_at is not null and v_o.public_token_expires_at<now() then raise exception 'This onboarding link has expired. Please ask ProFox to resend it.'; end if;
  select * into v_project from public.projects where id=v_o.project_id; select * into v_client from public.clients where id=v_o.client_id; select * into v_identity from public.customer_identities where id=v_o.customer_identity_id; select * into v_quote from public.quotations where id=v_o.quotation_id;
  if v_o.status<>'Completed' and v_quote.id is not null then v_fields:=public.client_onboarding_resolve_fields(v_quote.id); if v_o.field_schema is distinct from v_fields then update public.client_onboardings set field_schema=v_fields,form_version=greatest(form_version,2),updated_at=now() where id=v_o.id returning * into v_o; end if; end if;
  if v_quote.id is not null then
    for v_scope_item in select jsonb_build_object('id',qi.id,'productCode',qi.product_code_snapshot,'productName',qi.product_name_snapshot,'description',qi.description_snapshot,'quantity',qi.quantity,'itemType',qi.item_type,'sectionKey',qi.section_key,'configuration',coalesce(qi.configuration_snapshot,'{}'::jsonb),'inclusions',coalesce((select si->'scope' from jsonb_array_elements(coalesce(v_quote.commercial_snapshot->'items','[]'::jsonb)) si where si->>'id'=qi.id::text and jsonb_typeof(si->'scope')='array' limit 1),sp.scope,'[]'::jsonb)) from public.quotation_items qi left join public.sales_products sp on sp.id=qi.sales_product_id where qi.quotation_id=v_quote.id and coalesce(qi.optional_for_client,false)=false order by qi.sort_order,qi.created_at loop v_scope_items:=v_scope_items||jsonb_build_array(v_scope_item); end loop;
  end if;
  return jsonb_build_object('onboardingId',v_o.id,'status',v_o.status,'formVersion',v_o.form_version,'fields',v_o.field_schema,'responses',v_o.responses,'submittedAt',v_o.submitted_at,'completedAt',v_o.completed_at,'expiresAt',v_o.public_token_expires_at,'customer',jsonb_build_object('name',v_client.primary_contact_name,'companyName',v_client.company_name,'email',v_identity.email,'phone',v_client.phone,'country',v_client.country,'website',v_client.website),'project',jsonb_build_object('id',v_project.id,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'packageName',v_project.package_snapshot,'stage',v_project.stage),'scope',jsonb_build_object('quotationNumber',v_quote.quotation_number,'summary',v_quote.scope_summary,'items',v_scope_items));
end;$function$;

create or replace function public.admin_save_client_onboarding_settings(p_config jsonb)
returns jsonb
language plpgsql security definer set search_path='public','pg_temp'
as $function$
declare v_current jsonb:=public.client_onboarding_config(); v_next jsonb; v_fields jsonb; v_field jsonb; v_keys text[]:=array[]::text[]; v_key text; v_type text;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if; if p_config is null or jsonb_typeof(p_config)<>'object' then raise exception 'Onboarding settings must be an object.'; end if;
  v_next:=v_current||p_config; if not (p_config ? 'baseFields') then v_next:=jsonb_set(v_next,'{baseFields}',coalesce(v_current->'baseFields','[]'::jsonb),true); end if; if not (p_config ? 'fieldLibrary') then v_next:=jsonb_set(v_next,'{fieldLibrary}',coalesce(v_current->'fieldLibrary','[]'::jsonb),true); end if;
  v_fields:=coalesce(v_next->'baseFields','[]'::jsonb)||coalesce(v_next->'fieldLibrary','[]'::jsonb); if jsonb_typeof(v_fields)<>'array' or jsonb_array_length(v_fields)<1 or jsonb_array_length(v_fields)>100 then raise exception 'Configure between 1 and 100 onboarding fields across baseFields and fieldLibrary.'; end if;
  for v_field in select value from jsonb_array_elements(v_fields) loop v_key:=btrim(coalesce(v_field->>'key','')); v_type:=btrim(coalesce(v_field->>'type','')); if v_key !~ '^[a-zA-Z][a-zA-Z0-9_]{1,63}$' then raise exception 'Invalid onboarding field key: %.',v_key; end if; if v_key=any(v_keys) then raise exception 'Duplicate onboarding field key: %.',v_key; end if; v_keys:=array_append(v_keys,v_key); if btrim(coalesce(v_field->>'label',''))='' then raise exception 'Every onboarding field requires a label.'; end if; if v_type not in ('text','textarea','url','select') then raise exception 'Unsupported onboarding field type: %.',v_type; end if; if v_type='select' and (jsonb_typeof(v_field->'options')<>'array' or jsonb_array_length(v_field->'options')<1) then raise exception 'Select field % requires options.',v_key; end if; end loop;
  insert into public.system_configuration(config_key,config_value,updated_by,updated_at) values('client_onboarding_settings',v_next,auth.uid(),now()) on conflict(config_key) do update set config_value=excluded.config_value,updated_by=auth.uid(),updated_at=now(); return v_next;
end;$function$;

update public.client_onboardings o set field_schema=public.client_onboarding_resolve_fields(o.quotation_id),form_version=2,updated_at=now() where o.status<>'Completed' and o.quotation_id is not null;

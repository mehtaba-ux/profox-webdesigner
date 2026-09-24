-- ProFox CRM Sales SOP Part 3: canonical Probing & Discovery question catalog.
-- Reuses crm_discovery_questions from Part 1. No Lead-specific customer data is inserted.
-- This migration is additive and idempotent: existing standard questions with the same stable key win.
-- Global standard questions are system configuration, not a Seller-authored CRM record. The Part 1
-- insert-actor trigger deliberately rejects unauthenticated runtime writes, so this transaction
-- disables only that trigger while the migration-owned global catalog is inserted. ALTER TABLE
-- takes the required lock until commit and the trigger is re-enabled before the transaction ends.

alter table public.crm_discovery_questions
  disable trigger crm_discovery_questions_stamp_insert_actor;

with canonical_questions (
  question_key,
  category,
  question_text,
  purpose,
  framework,
  applicability,
  sort_order
) as (
  values
    ('business_what_do_you_offer', 'SITUATION_BUSINESS', 'What does your business primarily sell or provide today?', 'Understand the client''s actual business before discussing the website/system.', 'SITUATION', '{"questionClass":"CORE","relatedRequirementKeys":["primary_offer_service"],"section":"SITUATION"}'::jsonb, 10),
    ('business_priority_service', 'SITUATION_BUSINESS', 'Which service, product, or part of the business do you most want this project to grow?', null, 'SITUATION', '{"questionClass":"CORE","relatedRequirementKeys":["business_priority","business_objective"],"section":"SITUATION"}'::jsonb, 20),
    ('business_current_lead_sources', 'SITUATION_BUSINESS', 'How are customers currently finding or contacting you?', null, 'SITUATION', '{"questionClass":"CORE","relatedRequirementKeys":["current_customer_journey"],"section":"SITUATION"}'::jsonb, 30),
    ('business_current_process', 'SITUATION_BUSINESS', 'What happens today from the moment someone becomes interested until they become a customer?', null, 'SITUATION', '{"questionClass":"CORE","relatedRequirementKeys":["current_customer_journey"],"section":"SITUATION"}'::jsonb, 40),
    ('business_current_tools', 'SITUATION_BUSINESS', 'What website, CRM, booking, marketing, or internal tools are you currently using?', null, 'SITUATION', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["existing_digital_state","crm_integration","third_party_integrations"],"section":"SITUATION"}'::jsonb, 50),
    ('problem_main', 'PROBLEM', 'What is the biggest problem you want this project to solve?', null, 'PROBLEM', '{"questionClass":"CORE","relatedRequirementKeys":["primary_problem"],"section":"PROBLEM"}'::jsonb, 60),
    ('problem_current_site', 'PROBLEM', 'What is not working well with your current website or digital process?', null, 'PROBLEM', '{"questionClass":"CORE","relatedRequirementKeys":["primary_problem","existing_digital_state"],"section":"PROBLEM"}'::jsonb, 70),
    ('problem_customer_dropoff', 'PROBLEM', 'Where do you think prospects or customers are getting stuck or dropping off today?', null, 'PROBLEM', '{"questionClass":"CORE","relatedRequirementKeys":["secondary_problems","conversion_paths"],"section":"PROBLEM"}'::jsonb, 80),
    ('problem_internal_team', 'PROBLEM', 'What part of the current process creates the most frustration or manual work for your team?', null, 'PROBLEM', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["secondary_problems","automation_requirements"],"section":"PROBLEM"}'::jsonb, 90),
    ('problem_previous_attempts', 'PROBLEM', 'What have you already tried to fix this?', null, 'PROBLEM', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["current_situation"],"section":"PROBLEM"}'::jsonb, 100),
    ('impact_business', 'IMPACT', 'How is this problem affecting the business today?', null, 'IMPLICATION_IMPACT', '{"questionClass":"CORE","relatedRequirementKeys":["business_impact"],"section":"IMPACT"}'::jsonb, 110),
    ('impact_leads_revenue', 'IMPACT', 'How does this affect leads, sales, revenue, or customer acquisition?', null, 'IMPLICATION_IMPACT', '{"questionClass":"CORE","relatedRequirementKeys":["business_impact","success_metrics"],"section":"IMPACT"}'::jsonb, 120),
    ('impact_team_time', 'IMPACT', 'How much staff time or operational effort is this problem creating?', null, 'IMPLICATION_IMPACT', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["business_impact"],"section":"IMPACT"}'::jsonb, 130),
    ('impact_customer_experience', 'IMPACT', 'How does the current problem affect your customer''s experience?', null, 'IMPLICATION_IMPACT', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["business_impact"],"section":"IMPACT"}'::jsonb, 140),
    ('impact_do_nothing', 'IMPACT', 'What happens if nothing changes over the next 6 to 12 months?', null, 'IMPLICATION_IMPACT', '{"questionClass":"CORE","relatedRequirementKeys":["cost_of_inaction"],"section":"IMPACT"}'::jsonb, 150),
    ('outcome_success', 'DESIRED_OUTCOME', 'If this project works exactly as you want, what changes for the business?', null, 'NEED_DESIRED_OUTCOME', '{"questionClass":"CORE","relatedRequirementKeys":["desired_outcome"],"section":"DESIRED_OUTCOME"}'::jsonb, 160),
    ('outcome_success_definition', 'DESIRED_OUTCOME', 'What would make you say this project was a success?', null, 'NEED_DESIRED_OUTCOME', '{"questionClass":"CORE","relatedRequirementKeys":["success_definition"],"section":"DESIRED_OUTCOME"}'::jsonb, 170),
    ('outcome_metric', 'DESIRED_OUTCOME', 'Is there a specific result or metric you want to improve?', null, 'NEED_DESIRED_OUTCOME', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["success_metrics"],"section":"DESIRED_OUTCOME"}'::jsonb, 180),
    ('outcome_user_action', 'DESIRED_OUTCOME', 'What is the most important action you want visitors or users to take?', null, 'NEED_DESIRED_OUTCOME', '{"questionClass":"CORE","relatedRequirementKeys":["primary_cta"],"section":"DESIRED_OUTCOME"}'::jsonb, 190),
    ('audience_ideal_customer', 'AUDIENCE', 'Who is your ideal customer for this project?', null, 'SCOPE', '{"questionClass":"CORE","relatedRequirementKeys":["target_customer"],"section":"AUDIENCE"}'::jsonb, 200),
    ('audience_geography', 'AUDIENCE', 'Which locations or markets are most important?', null, 'SCOPE', '{"questionClass":"CORE","relatedRequirementKeys":["target_geography"],"section":"AUDIENCE"}'::jsonb, 210),
    ('audience_motivation', 'AUDIENCE', 'What usually motivates this customer to contact or buy from you?', null, 'SCOPE', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["customer_motivations"],"section":"AUDIENCE"}'::jsonb, 220),
    ('audience_objections', 'AUDIENCE', 'What normally stops or delays them from taking action?', null, 'SCOPE', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["customer_objections"],"section":"AUDIENCE"}'::jsonb, 230),
    ('audience_segments', 'AUDIENCE', 'Do different customer groups need different information or experiences?', null, 'SCOPE', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["audience_segments"],"section":"AUDIENCE"}'::jsonb, 240),
    ('scope_new_or_redesign', 'PROJECT_SCOPE', 'Is this a completely new project, a redesign, or an improvement to an existing system?', null, 'SCOPE', '{"questionClass":"CORE","relatedRequirementKeys":["project_type"],"section":"PROJECT"}'::jsonb, 250),
    ('scope_pages', 'PROJECT_SCOPE', 'What pages or main sections do you already know you need?', null, 'SCOPE', '{"questionClass":"CORE","relatedRequirementKeys":["required_pages"],"section":"PROJECT"}'::jsonb, 260),
    ('scope_features', 'PROJECT_SCOPE', 'What must the website or application allow the user to do?', null, 'SCOPE', '{"questionClass":"CORE","relatedRequirementKeys":["required_functionality"],"section":"PROJECT"}'::jsonb, 270),
    ('scope_forms', 'PROJECT_SCOPE', 'What forms, enquiry paths, applications, or lead-capture actions are required?', null, 'SCOPE', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["forms_lead_capture"],"section":"PROJECT"}'::jsonb, 280),
    ('scope_conversion', 'PROJECT_SCOPE', 'What should happen after someone completes the main call to action?', null, 'SCOPE', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["conversion_paths"],"section":"PROJECT"}'::jsonb, 290),
    ('scope_multilingual', 'PROJECT_SCOPE', 'Does the project need to support more than one language?', null, 'SCOPE', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["multilingual_requirement"],"section":"PROJECT"}'::jsonb, 300),
    ('content_existing', 'CONTENT', 'What usable content do you already have?', null, 'SCOPE', '{"questionClass":"CORE","relatedRequirementKeys":["content_status"],"section":"CONTENT"}'::jsonb, 310),
    ('content_copy_owner', 'CONTENT', 'Who will provide or approve the website copy?', null, 'SCOPE', '{"questionClass":"CORE","relatedRequirementKeys":["copywriting_requirement"],"section":"CONTENT"}'::jsonb, 320),
    ('content_photos', 'CONTENT', 'Do you already have suitable photos, videos, or other media?', null, 'SCOPE', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["images_media"],"section":"CONTENT"}'::jsonb, 330),
    ('content_proof', 'CONTENT', 'What reviews, testimonials, certifications, case studies, or proof can we use?', null, 'SCOPE', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["trust_proof"],"section":"CONTENT"}'::jsonb, 340),
    ('content_compliance', 'CONTENT', 'Are there legal, regulatory, or industry-specific content requirements we need to account for?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["legal_compliance_content"],"section":"CONTENT"}'::jsonb, 350),
    ('brand_existing', 'BRAND', 'Do you already have a logo, brand guidelines, and final brand assets?', null, 'SCOPE', '{"questionClass":"CORE","relatedRequirementKeys":["logo_status","brand_guidelines_status","brand_assets_status"],"section":"BRAND"}'::jsonb, 360),
    ('brand_change', 'BRAND', 'Should this project follow the current brand closely, or are you expecting a visual change?', null, 'SCOPE', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["visual_preferences","branding_work_required"],"section":"BRAND"}'::jsonb, 370),
    ('brand_examples', 'BRAND', 'Are there websites or brands you like or dislike, and why?', null, 'SCOPE', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["visual_preferences"],"section":"BRAND"}'::jsonb, 380),
    ('commercial_timeline', 'COMMERCIAL_TIMELINE', 'When would you ideally like the project live?', null, 'COMMERCIAL', '{"questionClass":"CORE","relatedRequirementKeys":["target_timeline","target_launch_date"],"section":"COMMERCIAL"}'::jsonb, 390),
    ('commercial_deadline_reason', 'COMMERCIAL_TIMELINE', 'Is there a business event, campaign, launch, or other reason behind that date?', null, 'COMMERCIAL', '{"questionClass":"CORE","relatedRequirementKeys":["deadline_reason"],"section":"COMMERCIAL"}'::jsonb, 400),
    ('commercial_budget', 'COMMERCIAL_TIMELINE', 'What investment range have you planned for solving this properly?', null, 'COMMERCIAL', '{"questionClass":"CORE","relatedRequirementKeys":["budget_context"],"section":"COMMERCIAL"}'::jsonb, 410),
    ('commercial_priority', 'COMMERCIAL_TIMELINE', 'If scope, timeline, and budget cannot all be maximized at once, which is most important?', null, 'COMMERCIAL', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["decision_criteria"],"section":"COMMERCIAL"}'::jsonb, 420),
    ('decision_who_involved', 'DECISION_PROCESS', 'Who else will be involved in evaluating or approving this project?', null, 'DECISION', '{"questionClass":"CORE","relatedRequirementKeys":["decision_maker","stakeholder_map"],"section":"DECISION"}'::jsonb, 430),
    ('decision_final_approval', 'DECISION_PROCESS', 'Who gives final approval?', null, 'DECISION', '{"questionClass":"CORE","relatedRequirementKeys":["primary_approver"],"section":"DECISION"}'::jsonb, 440),
    ('decision_criteria', 'DECISION_PROCESS', 'What will matter most when you choose the right partner or solution?', null, 'DECISION', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["decision_criteria"],"section":"DECISION"}'::jsonb, 450),
    ('decision_process', 'DECISION_PROCESS', 'What needs to happen internally before you can move forward?', null, 'DECISION', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["decision_process"],"section":"DECISION"}'::jsonb, 460),
    ('decision_alternatives', 'DECISION_PROCESS', 'Are you evaluating other solutions, agencies, internal options, or doing nothing?', null, 'DECISION', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["competition_alternatives"],"section":"DECISION"}'::jsonb, 470),
    ('complex_economic_buyer', 'COMPLEX_DEAL', 'Who ultimately owns the budget or commercial decision?', null, 'DECISION', '{"questionClass":"COMPLEX","relatedRequirementKeys":["economic_buyer"],"section":"COMPLEX"}'::jsonb, 480),
    ('complex_procurement', 'COMPLEX_DEAL', 'Are there procurement, contract, legal, vendor, or security steps we need to plan for?', null, 'DECISION', '{"questionClass":"COMPLEX","relatedRequirementKeys":["procurement_process"],"section":"COMPLEX"}'::jsonb, 490),
    ('complex_champion', 'COMPLEX_DEAL', 'Who internally is most invested in getting this project approved and successful?', null, 'DECISION', '{"questionClass":"COMPLEX","relatedRequirementKeys":["internal_champion"],"section":"COMPLEX"}'::jsonb, 500),
    ('integration_any', 'INTEGRATIONS', 'Does this project need to connect with any CRM, booking platform, payment system, marketing platform, or internal software?', null, 'TECHNICAL', '{"questionClass":"CORE","relatedRequirementKeys":["crm_integration","third_party_integrations"],"section":"INTEGRATIONS"}'::jsonb, 510),
    ('integration_which_systems', 'INTEGRATIONS', 'Which systems need to connect?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["third_party_integrations"],"section":"INTEGRATIONS"}'::jsonb, 520),
    ('integration_purpose', 'INTEGRATIONS', 'What should the integration actually accomplish?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["integration_data_flow"],"section":"INTEGRATIONS"}'::jsonb, 530),
    ('integration_direction', 'INTEGRATIONS', 'Which information needs to move between the systems, and in which direction?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["integration_data_flow"],"section":"INTEGRATIONS"}'::jsonb, 540),
    ('integration_account', 'INTEGRATIONS', 'Do you already have active accounts for those systems?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["third_party_integrations"],"section":"INTEGRATIONS"}'::jsonb, 550),
    ('integration_criticality', 'INTEGRATIONS', 'Is this integration essential for launch, or can it follow later?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["technical_uncertainties"],"section":"INTEGRATIONS"}'::jsonb, 560),
    ('integration_api_custom', 'INTEGRATIONS', 'Does this require a standard integration, or is custom API work expected?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["api_requirements"],"section":"INTEGRATIONS"}'::jsonb, 570),
    ('ecommerce_need', 'ECOMMERCE', 'Will customers buy or pay directly through the website?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["ecommerce_required"],"section":"ECOMMERCE"}'::jsonb, 580),
    ('ecommerce_products', 'ECOMMERCE', 'What are you selling, and approximately how many products or variations are involved?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["product_catalog"],"section":"ECOMMERCE"}'::jsonb, 590),
    ('ecommerce_payments', 'ECOMMERCE', 'Which payment provider or payment methods do you need?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["payment_gateway"],"section":"ECOMMERCE"}'::jsonb, 600),
    ('ecommerce_shipping', 'ECOMMERCE', 'How should shipping or delivery work?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["shipping_requirement"],"section":"ECOMMERCE"}'::jsonb, 610),
    ('ecommerce_tax', 'ECOMMERCE', 'Are there tax rules the store needs to handle?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["tax_requirement"],"section":"ECOMMERCE"}'::jsonb, 620),
    ('ecommerce_inventory', 'ECOMMERCE', 'Does inventory need to sync with another system?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["inventory_requirement"],"section":"ECOMMERCE"}'::jsonb, 630),
    ('ecommerce_subscription', 'ECOMMERCE', 'Do you need subscriptions or recurring payments?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["subscription_requirement"],"section":"ECOMMERCE"}'::jsonb, 640),
    ('booking_need', 'BOOKING', 'Do customers need to schedule an appointment, consultation, or service?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["booking_required"],"section":"BOOKING"}'::jsonb, 650),
    ('booking_provider', 'BOOKING', 'Which calendar or booking platform are you using today?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["booking_provider"],"section":"BOOKING"}'::jsonb, 660),
    ('booking_rules', 'BOOKING', 'Are there special rules for availability, staff assignment, locations, or appointment types?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["booking_availability_logic"],"section":"BOOKING"}'::jsonb, 670),
    ('booking_notifications', 'BOOKING', 'What confirmations or reminders should the customer receive?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["booking_notifications"],"section":"BOOKING"}'::jsonb, 680),
    ('seo_importance', 'SEO', 'How important is organic search to this project?', null, 'SCOPE', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["seo_priority"],"section":"SEO"}'::jsonb, 690),
    ('seo_services', 'SEO', 'Which services or topics do you most want to be found for?', null, 'SCOPE', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["seo_service_topics"],"section":"SEO"}'::jsonb, 700),
    ('seo_locations', 'SEO', 'Which locations or markets should SEO focus on?', null, 'SCOPE', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["seo_locations"],"section":"SEO"}'::jsonb, 710),
    ('seo_existing', 'SEO', 'Do you have existing rankings, Search Console data, SEO pages, or other assets we need to preserve?', null, 'TECHNICAL', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["existing_seo_assets"],"section":"SEO"}'::jsonb, 720),
    ('seo_migration', 'SEO', 'Will existing URLs or content need to be migrated or redirected?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["seo_redirect_migration"],"section":"SEO"}'::jsonb, 730),
    ('analytics_current', 'ANALYTICS', 'What analytics or tracking are you using today?', null, 'TECHNICAL', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["analytics_platform"],"section":"ANALYTICS"}'::jsonb, 740),
    ('analytics_conversions', 'ANALYTICS', 'Which actions should count as conversions?', null, 'TECHNICAL', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["conversion_tracking"],"section":"ANALYTICS"}'::jsonb, 750),
    ('analytics_events', 'ANALYTICS', 'Are there specific user actions or events you need tracked?', null, 'TECHNICAL', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["analytics_events"],"section":"ANALYTICS"}'::jsonb, 760),
    ('analytics_reporting', 'ANALYTICS', 'Who needs reporting, and what should they be able to see?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["reporting_requirements"],"section":"ANALYTICS"}'::jsonb, 770),
    ('technical_domain', 'TECHNICAL', 'Who currently controls the domain?', null, 'TECHNICAL', '{"questionClass":"CORE","relatedRequirementKeys":["domain_status"],"section":"TECHNICAL"}'::jsonb, 780),
    ('technical_hosting', 'TECHNICAL', 'Where is the current site or system hosted?', null, 'TECHNICAL', '{"questionClass":"CORE","relatedRequirementKeys":["hosting_status"],"section":"TECHNICAL"}'::jsonb, 790),
    ('technical_platform', 'TECHNICAL', 'What platform or CMS is the current site using?', null, 'TECHNICAL', '{"questionClass":"CORE","relatedRequirementKeys":["cms_platform"],"section":"TECHNICAL"}'::jsonb, 800),
    ('technical_migration', 'TECHNICAL', 'What needs to be migrated from the current system?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["migration_requirements"],"section":"TECHNICAL"}'::jsonb, 810),
    ('technical_login', 'TECHNICAL', 'Will users need accounts, login, authentication, or password recovery?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["authentication_requirement"],"section":"TECHNICAL"}'::jsonb, 820),
    ('technical_roles', 'TECHNICAL', 'Will different users need different permissions or access?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["user_roles_permissions"],"section":"TECHNICAL"}'::jsonb, 830),
    ('technical_dashboard', 'TECHNICAL', 'Does anyone need a portal, dashboard, or private account area?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["portal_dashboard"],"section":"TECHNICAL"}'::jsonb, 840),
    ('technical_security', 'TECHNICAL', 'Are there specific security, compliance, privacy, or data-handling requirements?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["security_requirements"],"section":"TECHNICAL"}'::jsonb, 850),
    ('technical_accessibility', 'TECHNICAL', 'Are there specific accessibility standards or compliance requirements?', null, 'TECHNICAL', '{"questionClass":"CONDITIONAL","relatedRequirementKeys":["accessibility_requirements"],"section":"TECHNICAL"}'::jsonb, 860),
    ('app_users', 'CUSTOM_APPLICATION', 'Who will use the application, and what different user types exist?', null, 'TECHNICAL', '{"questionClass":"COMPLEX","relatedRequirementKeys":["app_user_types"],"section":"CUSTOM_APP"}'::jsonb, 870),
    ('app_workflow', 'CUSTOM_APPLICATION', 'Walk me through the workflow the application needs to support from beginning to end.', null, 'TECHNICAL', '{"questionClass":"COMPLEX","relatedRequirementKeys":["business_workflows"],"section":"CUSTOM_APP"}'::jsonb, 880),
    ('app_permissions', 'CUSTOM_APPLICATION', 'What should each user role be allowed to see or do?', null, 'TECHNICAL', '{"questionClass":"COMPLEX","relatedRequirementKeys":["app_permissions"],"section":"CUSTOM_APP"}'::jsonb, 890),
    ('app_data', 'CUSTOM_APPLICATION', 'What data does the application need to store, import, export, or synchronize?', null, 'TECHNICAL', '{"questionClass":"COMPLEX","relatedRequirementKeys":["data_database"],"section":"CUSTOM_APP"}'::jsonb, 900),
    ('app_notifications', 'CUSTOM_APPLICATION', 'What notifications or automated messages are required?', null, 'TECHNICAL', '{"questionClass":"COMPLEX","relatedRequirementKeys":["app_notifications"],"section":"CUSTOM_APP"}'::jsonb, 910),
    ('app_admin', 'CUSTOM_APPLICATION', 'What does the internal admin team need to manage?', null, 'TECHNICAL', '{"questionClass":"COMPLEX","relatedRequirementKeys":["app_admin_operations"],"section":"CUSTOM_APP"}'::jsonb, 920),
    ('app_reporting', 'CUSTOM_APPLICATION', 'What reports or dashboards are required?', null, 'TECHNICAL', '{"questionClass":"COMPLEX","relatedRequirementKeys":["app_reporting"],"section":"CUSTOM_APP"}'::jsonb, 930),
    ('app_scale', 'CUSTOM_APPLICATION', 'Approximately how many users, records, transactions, or locations should we design for?', null, 'TECHNICAL', '{"questionClass":"COMPLEX","relatedRequirementKeys":["app_usage_scale"],"section":"CUSTOM_APP"}'::jsonb, 940),
    ('app_acceptance', 'CUSTOM_APPLICATION', 'What must be true before you would consider the application ready to accept?', null, 'TECHNICAL', '{"questionClass":"COMPLEX","relatedRequirementKeys":["acceptance_criteria"],"section":"CUSTOM_APP"}'::jsonb, 950),
    ('risk_dependencies', 'RISKS_DEPENDENCIES', 'What do you or your team need to provide for this project to stay on schedule?', null, 'TECHNICAL', '{"questionClass":"CORE","relatedRequirementKeys":["client_dependencies"],"section":"RISKS"}'::jsonb, 960),
    ('risk_known', 'RISKS_DEPENDENCIES', 'Are there any known technical, legal, content, approval, or timing risks?', null, 'TECHNICAL', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["technical_uncertainties","scope_risks"],"section":"RISKS"}'::jsonb, 970),
    ('risk_assumptions', 'RISKS_DEPENDENCIES', 'What assumptions are we currently making that still need to be confirmed?', null, 'TECHNICAL', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["assumptions"],"section":"RISKS"}'::jsonb, 980),
    ('risk_exclusions', 'RISKS_DEPENDENCIES', 'Is there anything specifically not expected to be part of this project?', null, 'SCOPE', '{"questionClass":"RECOMMENDED","relatedRequirementKeys":["exclusions"],"section":"RISKS"}'::jsonb, 990)
)
insert into public.crm_discovery_questions (
  question_key,
  category,
  question_text,
  purpose,
  framework,
  applicability,
  lead_id,
  is_custom,
  active,
  sort_order
)
select
  c.question_key,
  c.category,
  c.question_text,
  c.purpose,
  c.framework,
  c.applicability,
  null,
  false,
  true,
  c.sort_order
from canonical_questions c
where not exists (
  select 1
  from public.crm_discovery_questions q
  where q.lead_id is null
    and q.is_custom = false
    and q.question_key = c.question_key
);

alter table public.crm_discovery_questions
  enable trigger crm_discovery_questions_stamp_insert_actor;

-- Part 3 intentionally does not create/modify Discovery tables, RLS, audit,
-- conversion, pipeline, quotation, payment, Won, or package-fit behavior.
-- Commercial package truth remains in public.sales_products.
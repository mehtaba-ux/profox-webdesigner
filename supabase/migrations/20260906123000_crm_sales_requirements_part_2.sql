-- Part 2: canonical Sales SOP requirement definitions and connected Requirements workspace read model.
-- Extends system_configuration and crm_get_sales_discovery_workspace only.
-- No duplicate requirements table, no deal-specific seed data, and no downstream sales gates change.

with requirement_definitions(category, requirement_class, requirement_key, title, applicability, sort_order) as (
  values
    ('BUSINESS', 'CORE', 'business_objective', 'Business objective', '{}'::jsonb, 1),
    ('BUSINESS', 'CORE', 'current_situation', 'Current situation', '{}'::jsonb, 2),
    ('BUSINESS', 'CORE', 'primary_offer_service', 'Primary offer / service', '{}'::jsonb, 3),
    ('BUSINESS', 'RECOMMENDED', 'business_model_context', 'Business context / model', '{}'::jsonb, 4),
    ('BUSINESS', 'RECOMMENDED', 'business_priority', 'Business / revenue priority', '{}'::jsonb, 5),
    ('BUSINESS', 'RECOMMENDED', 'current_customer_journey', 'Current customer journey / process', '{}'::jsonb, 6),
    ('PROBLEM', 'CORE', 'primary_problem', 'Primary problem', '{}'::jsonb, 7),
    ('PROBLEM', 'CORE', 'business_impact', 'Business impact', '{}'::jsonb, 8),
    ('PROBLEM', 'CORE', 'urgency_reason', 'Why change now?', '{}'::jsonb, 9),
    ('PROBLEM', 'RECOMMENDED', 'secondary_problems', 'Secondary problems', '{}'::jsonb, 10),
    ('PROBLEM', 'RECOMMENDED', 'cost_of_inaction', 'Cost / consequence of doing nothing', '{}'::jsonb, 11),
    ('DESIRED_OUTCOME', 'CORE', 'desired_outcome', 'Desired outcome', '{}'::jsonb, 12),
    ('DESIRED_OUTCOME', 'CORE', 'success_definition', 'What success looks like', '{}'::jsonb, 13),
    ('DESIRED_OUTCOME', 'RECOMMENDED', 'success_metrics', 'Measurable success / metrics', '{}'::jsonb, 14),
    ('AUDIENCE_CUSTOMER', 'CORE', 'target_customer', 'Target customer', '{}'::jsonb, 15),
    ('AUDIENCE_CUSTOMER', 'CORE', 'target_geography', 'Target geography / market', '{}'::jsonb, 16),
    ('AUDIENCE_CUSTOMER', 'RECOMMENDED', 'audience_segments', 'Audience segments', '{}'::jsonb, 17),
    ('AUDIENCE_CUSTOMER', 'RECOMMENDED', 'customer_motivations', 'Customer motivations', '{}'::jsonb, 18),
    ('AUDIENCE_CUSTOMER', 'RECOMMENDED', 'customer_objections', 'Customer objections', '{}'::jsonb, 19),
    ('PROJECT_SCOPE', 'CORE', 'project_type', 'Project type', '{}'::jsonb, 20),
    ('PROJECT_SCOPE', 'CORE', 'existing_digital_state', 'Existing website / digital state', '{}'::jsonb, 21),
    ('PROJECT_SCOPE', 'CORE', 'required_pages', 'Required pages / main sections', '{}'::jsonb, 22),
    ('PROJECT_SCOPE', 'CORE', 'primary_cta', 'Primary conversion action', '{}'::jsonb, 23),
    ('PROJECT_SCOPE', 'CORE', 'required_functionality', 'Required functionality', '{}'::jsonb, 24),
    ('PROJECT_SCOPE', 'RECOMMENDED', 'site_structure', 'Site / information structure', '{}'::jsonb, 25),
    ('PROJECT_SCOPE', 'RECOMMENDED', 'forms_lead_capture', 'Forms / lead capture', '{}'::jsonb, 26),
    ('PROJECT_SCOPE', 'RECOMMENDED', 'conversion_paths', 'Conversion paths', '{}'::jsonb, 27),
    ('PROJECT_SCOPE', 'CONDITIONAL', 'multilingual_requirement', 'Multilingual requirement', '{}'::jsonb, 28),
    ('CONTENT', 'CORE', 'content_status', 'Current content status', '{}'::jsonb, 29),
    ('CONTENT', 'CORE', 'copywriting_requirement', 'Copywriting requirement', '{}'::jsonb, 30),
    ('CONTENT', 'RECOMMENDED', 'images_media', 'Images / media', '{}'::jsonb, 31),
    ('CONTENT', 'RECOMMENDED', 'trust_proof', 'Testimonials / trust proof', '{}'::jsonb, 32),
    ('CONTENT', 'CONDITIONAL', 'legal_compliance_content', 'Legal / compliance content', '{}'::jsonb, 33),
    ('BRAND', 'CORE', 'logo_status', 'Logo status', '{}'::jsonb, 34),
    ('BRAND', 'CORE', 'brand_guidelines_status', 'Brand guidelines', '{}'::jsonb, 35),
    ('BRAND', 'CORE', 'brand_assets_status', 'Brand assets', '{}'::jsonb, 36),
    ('BRAND', 'RECOMMENDED', 'visual_preferences', 'Visual preferences', '{}'::jsonb, 37),
    ('BRAND', 'CONDITIONAL', 'branding_work_required', 'Branding work required', '{}'::jsonb, 38),
    ('INTEGRATIONS', 'CONDITIONAL', 'crm_integration', 'CRM integration', '{"conditions":["integration"]}'::jsonb, 39),
    ('INTEGRATIONS', 'CONDITIONAL', 'third_party_integrations', 'Third-party integrations', '{"conditions":["integration"]}'::jsonb, 40),
    ('INTEGRATIONS', 'CONDITIONAL', 'api_requirements', 'API requirements', '{"conditions":["integration"]}'::jsonb, 41),
    ('INTEGRATIONS', 'CONDITIONAL', 'automation_requirements', 'Automation requirements', '{"conditions":["integration"]}'::jsonb, 42),
    ('INTEGRATIONS', 'CONDITIONAL', 'integration_data_flow', 'Integration data flow', '{"conditions":["integration"]}'::jsonb, 43),
    ('ECOMMERCE', 'CONDITIONAL', 'ecommerce_required', 'E-commerce required', '{"conditions":["ecommerce"]}'::jsonb, 44),
    ('ECOMMERCE', 'CONDITIONAL', 'product_catalog', 'Products / catalog', '{"conditions":["ecommerce"]}'::jsonb, 45),
    ('ECOMMERCE', 'CONDITIONAL', 'payment_gateway', 'Payment processing', '{"conditions":["ecommerce"]}'::jsonb, 46),
    ('ECOMMERCE', 'CONDITIONAL', 'shipping_requirement', 'Shipping', '{"conditions":["ecommerce"]}'::jsonb, 47),
    ('ECOMMERCE', 'CONDITIONAL', 'tax_requirement', 'Tax handling', '{"conditions":["ecommerce"]}'::jsonb, 48),
    ('ECOMMERCE', 'CONDITIONAL', 'inventory_requirement', 'Inventory', '{"conditions":["ecommerce"]}'::jsonb, 49),
    ('ECOMMERCE', 'CONDITIONAL', 'subscription_requirement', 'Subscriptions / recurring billing', '{"conditions":["ecommerce"]}'::jsonb, 50),
    ('ECOMMERCE', 'CONDITIONAL', 'ecommerce_customer_accounts', 'Customer accounts', '{"conditions":["ecommerce"]}'::jsonb, 51),
    ('BOOKING', 'CONDITIONAL', 'booking_required', 'Booking / appointment requirement', '{"conditions":["booking"]}'::jsonb, 52),
    ('BOOKING', 'CONDITIONAL', 'booking_provider', 'Booking provider / calendar', '{"conditions":["booking"]}'::jsonb, 53),
    ('BOOKING', 'CONDITIONAL', 'booking_availability_logic', 'Availability logic', '{"conditions":["booking"]}'::jsonb, 54),
    ('BOOKING', 'CONDITIONAL', 'booking_notifications', 'Booking confirmations / reminders', '{"conditions":["booking"]}'::jsonb, 55),
    ('SEO', 'CORE', 'seo_priority', 'SEO priority', '{}'::jsonb, 56),
    ('SEO', 'RECOMMENDED', 'seo_service_topics', 'Target services / topics', '{}'::jsonb, 57),
    ('SEO', 'RECOMMENDED', 'seo_locations', 'SEO locations / markets', '{}'::jsonb, 58),
    ('SEO', 'RECOMMENDED', 'existing_seo_assets', 'Existing SEO assets / rankings', '{}'::jsonb, 59),
    ('SEO', 'RECOMMENDED', 'seo_keyword_priorities', 'Keyword priorities', '{}'::jsonb, 60),
    ('SEO', 'CONDITIONAL', 'seo_redirect_migration', 'Redirect / SEO migration requirement', '{}'::jsonb, 61),
    ('ANALYTICS', 'RECOMMENDED', 'analytics_platform', 'Analytics platform', '{}'::jsonb, 62),
    ('ANALYTICS', 'RECOMMENDED', 'conversion_tracking', 'Conversion tracking', '{}'::jsonb, 63),
    ('ANALYTICS', 'RECOMMENDED', 'analytics_events', 'Events / goals', '{}'::jsonb, 64),
    ('ANALYTICS', 'CONDITIONAL', 'reporting_requirements', 'Reporting requirements', '{}'::jsonb, 65),
    ('TECHNICAL', 'CORE', 'domain_status', 'Domain status', '{}'::jsonb, 66),
    ('TECHNICAL', 'CORE', 'hosting_status', 'Hosting status', '{}'::jsonb, 67),
    ('TECHNICAL', 'CORE', 'cms_platform', 'CMS / current platform', '{}'::jsonb, 68),
    ('TECHNICAL', 'RECOMMENDED', 'performance_requirements', 'Performance requirements', '{}'::jsonb, 69),
    ('TECHNICAL', 'CONDITIONAL', 'migration_requirements', 'Migration requirements', '{}'::jsonb, 70),
    ('TECHNICAL', 'CONDITIONAL', 'authentication_requirement', 'Authentication / login', '{}'::jsonb, 71),
    ('TECHNICAL', 'CONDITIONAL', 'user_roles_permissions', 'User roles / permissions', '{}'::jsonb, 72),
    ('TECHNICAL', 'CONDITIONAL', 'portal_dashboard', 'Portal / dashboard', '{}'::jsonb, 73),
    ('TECHNICAL', 'CONDITIONAL', 'data_database', 'Data / database requirements', '{}'::jsonb, 74),
    ('TECHNICAL', 'CONDITIONAL', 'security_requirements', 'Security requirements', '{}'::jsonb, 75),
    ('TECHNICAL', 'CONDITIONAL', 'accessibility_requirements', 'Accessibility requirements', '{}'::jsonb, 76),
    ('TECHNICAL', 'CONDITIONAL', 'mobile_specific_requirement', 'Mobile-specific requirement', '{}'::jsonb, 77),
    ('COMMERCIAL', 'CORE', 'budget_context', 'Budget / investment context', '{}'::jsonb, 78),
    ('COMMERCIAL', 'CORE', 'target_timeline', 'Target timeline', '{}'::jsonb, 79),
    ('COMMERCIAL', 'CORE', 'target_launch_date', 'Target launch date', '{}'::jsonb, 80),
    ('COMMERCIAL', 'CONDITIONAL', 'deadline_reason', 'Reason for deadline', '{}'::jsonb, 81),
    ('DECISION_BUYING_PROCESS', 'CORE', 'decision_maker', 'Decision maker', '{}'::jsonb, 82),
    ('DECISION_BUYING_PROCESS', 'CORE', 'primary_approver', 'Final approver', '{}'::jsonb, 83),
    ('DECISION_BUYING_PROCESS', 'RECOMMENDED', 'decision_criteria', 'Decision criteria', '{}'::jsonb, 84),
    ('DECISION_BUYING_PROCESS', 'RECOMMENDED', 'decision_process', 'Decision process', '{}'::jsonb, 85),
    ('DECISION_BUYING_PROCESS', 'RECOMMENDED', 'competition_alternatives', 'Alternatives / competition', '{}'::jsonb, 86),
    ('DECISION_BUYING_PROCESS', 'COMPLEX', 'economic_buyer', 'Economic buyer', '{"conditions":["complex_decision"]}'::jsonb, 87),
    ('DECISION_BUYING_PROCESS', 'COMPLEX', 'procurement_process', 'Procurement / paper process', '{"conditions":["complex_decision"]}'::jsonb, 88),
    ('DECISION_BUYING_PROCESS', 'COMPLEX', 'internal_champion', 'Internal champion', '{"conditions":["complex_decision"]}'::jsonb, 89),
    ('DECISION_BUYING_PROCESS', 'COMPLEX', 'stakeholder_map', 'Key stakeholders', '{"conditions":["complex_decision"]}'::jsonb, 90),
    ('CUSTOM_APPLICATION', 'COMPLEX', 'business_workflows', 'Business workflows', '{"conditions":["custom_app"]}'::jsonb, 91),
    ('CUSTOM_APPLICATION', 'COMPLEX', 'app_user_types', 'Application user types', '{"conditions":["custom_app"]}'::jsonb, 92),
    ('CUSTOM_APPLICATION', 'COMPLEX', 'app_permissions', 'Application permissions', '{"conditions":["custom_app"]}'::jsonb, 93),
    ('CUSTOM_APPLICATION', 'COMPLEX', 'app_notifications', 'Notifications', '{"conditions":["custom_app"]}'::jsonb, 94),
    ('CUSTOM_APPLICATION', 'COMPLEX', 'app_reporting', 'Reporting', '{"conditions":["custom_app"]}'::jsonb, 95),
    ('CUSTOM_APPLICATION', 'COMPLEX', 'app_admin_operations', 'Admin operations', '{"conditions":["custom_app"]}'::jsonb, 96),
    ('CUSTOM_APPLICATION', 'COMPLEX', 'app_usage_scale', 'Usage / scale expectations', '{"conditions":["custom_app"]}'::jsonb, 97),
    ('CUSTOM_APPLICATION', 'COMPLEX', 'acceptance_criteria', 'Acceptance criteria', '{"conditions":["custom_app"]}'::jsonb, 98),
    ('CUSTOM_APPLICATION', 'COMPLEX', 'training_handover', 'Training / handover requirement', '{"conditions":["custom_app"]}'::jsonb, 99),
    ('RISKS_DEPENDENCIES', 'CORE', 'technical_uncertainties', 'Technical uncertainties', '{}'::jsonb, 100),
    ('RISKS_DEPENDENCIES', 'CORE', 'client_dependencies', 'Client dependencies', '{}'::jsonb, 101),
    ('RISKS_DEPENDENCIES', 'CORE', 'assumptions', 'Assumptions', '{}'::jsonb, 102),
    ('RISKS_DEPENDENCIES', 'CORE', 'exclusions', 'Known exclusions', '{}'::jsonb, 103),
    ('RISKS_DEPENDENCIES', 'CORE', 'scope_risks', 'Scope risks', '{}'::jsonb, 104),
    ('RISKS_DEPENDENCIES', 'RECOMMENDED', 'access_required_later', 'Access required during onboarding/delivery', '{}'::jsonb, 105)
)
insert into public.system_configuration (config_key, config_value, description)
select
  'crm_requirement_definitions_v1',
  jsonb_build_object(
    'version', 1,
    'definitions', jsonb_agg(
      jsonb_build_object(
        'requirementKey', requirement_key,
        'category', category,
        'title', title,
        'helpText', case
          when requirement_key = 'access_required_later' then 'Identify what access will eventually be required. Never record passwords, API secret keys, private keys, recovery codes, payment-card data, or authentication secrets.'
          else 'Capture the client''s ' || lower(title) || '.'
        end,
        'requirementClass', requirement_class,
        'sortOrder', sort_order,
        'active', true,
        'applicability', applicability
      ) order by sort_order
    )
  ),
  'Canonical seller-facing Sales SOP Requirement definitions. Deal-specific facts remain in crm_requirements; commercial package truth remains in sales_products.'
from requirement_definitions
on conflict (config_key) do nothing;

create or replace function public.crm_get_sales_discovery_workspace(
  p_lead_id uuid default null,
  p_opportunity_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_lead_id uuid;
  v_opportunity_id uuid;
  v_requirement_definitions jsonb := '[]'::jsonb;
begin
  if p_opportunity_id is not null then
    select o.lead_id into v_lead_id
    from public.crm_opportunities o
    where o.id = p_opportunity_id;

    if v_lead_id is null then
      raise exception 'Opportunity is not connected to a CRM lead.';
    end if;

    if p_lead_id is not null and p_lead_id is distinct from v_lead_id then
      raise exception 'Lead and opportunity do not belong to the same sales lifecycle.';
    end if;

    v_opportunity_id := p_opportunity_id;
  else
    v_lead_id := p_lead_id;
    select o.id into v_opportunity_id
    from public.crm_opportunities o
    where o.lead_id = v_lead_id
    order by o.created_at desc
    limit 1;
  end if;

  if v_lead_id is null then
    raise exception 'Lead or opportunity is required.';
  end if;

  if not public.crm_can_access_lead(v_lead_id) then
    raise exception 'CRM lead access is required.';
  end if;

  select coalesce(
    jsonb_agg(definition order by coalesce((definition->>'sortOrder')::integer, 0), definition->>'requirementKey'),
    '[]'::jsonb
  )
  into v_requirement_definitions
  from public.system_configuration sc
  cross join lateral jsonb_array_elements(coalesce(sc.config_value->'definitions', '[]'::jsonb)) definition
  where sc.config_key = 'crm_requirement_definitions_v1'
    and coalesce((definition->>'active')::boolean, true);

  return jsonb_build_object(
    'leadId', v_lead_id,
    'opportunityId', v_opportunity_id,
    'requirementDefinitions', coalesce(v_requirement_definitions, '[]'::jsonb),
    'requirements', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
      from public.crm_requirements r
      where r.lead_id = v_lead_id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.sort_order, q.created_at, q.id)
      from public.crm_discovery_questions q
      where (q.lead_id is null or q.lead_id = v_lead_id)
        and (
          q.active
          or exists (
            select 1
            from public.crm_discovery_responses dr
            where dr.lead_id = v_lead_id and dr.question_id = q.id
          )
        )
    ), '[]'::jsonb),
    'responses', coalesce((
      select jsonb_agg(to_jsonb(dr) order by dr.updated_at, dr.id)
      from public.crm_discovery_responses dr
      where dr.lead_id = v_lead_id
    ), '[]'::jsonb),
    'clientVoice', coalesce((
      select jsonb_agg(to_jsonb(cv) order by cv.created_at, cv.id)
      from public.crm_client_voice cv
      where cv.lead_id = v_lead_id
    ), '[]'::jsonb),
    'meetingPreparations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'meetingId', m.id,
          'title', m.title,
          'scheduledAt', m.start_at,
          'status', m.status,
          'preparationState', case
            when m.prep_reviewed_at is not null then 'READY'
            when mp.meeting_id is not null
              or exists (
                select 1
                from public.crm_meeting_discovery_questions mdqx
                where mdqx.meeting_id = m.id
              ) then 'IN_PROGRESS'
            else 'NOT_STARTED'
          end,
          'preparedBy', m.prep_reviewed_by,
          'preparedAt', m.prep_reviewed_at,
          'preparation', to_jsonb(mp),
          'selectedQuestionIds', coalesce((
            select jsonb_agg(mdq.question_id order by mdq.created_at, mdq.question_id)
            from public.crm_meeting_discovery_questions mdq
            where mdq.meeting_id = m.id
          ), '[]'::jsonb)
        )
        order by m.start_at desc, m.id
      )
      from public.sales_meetings m
      left join public.crm_opportunities mo on mo.id = m.opportunity_id
      left join public.crm_meeting_preparations mp on mp.meeting_id = m.id
      where coalesce(m.lead_id, mo.lead_id) = v_lead_id
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.crm_get_sales_discovery_workspace(uuid, uuid) from public, anon;
grant execute on function public.crm_get_sales_discovery_workspace(uuid, uuid) to authenticated;

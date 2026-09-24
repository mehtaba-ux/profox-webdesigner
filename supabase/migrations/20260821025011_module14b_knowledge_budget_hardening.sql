-- Keep approved AI knowledge within a predictable context budget.
CREATE OR REPLACE FUNCTION public.get_ai_assistance_knowledge(p_capability text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_role text; v_cap text:=lower(trim(COALESCE(p_capability,''))); v_slugs text[]:=ARRAY[]::text[];
  v_academy text:=''; v_catalog jsonb:='[]'::jsonb; v_playbooks jsonb:='[]'::jsonb;
  v_sales_caps text[]:=ARRAY['lead_research','outreach_drafting','loom_preparation','meeting_preparation','meeting_summary','sales_coaching','next_best_action_explanation','quotation_assistant'];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  SELECT role INTO v_role FROM public.user_profiles WHERE id=v_uid AND status='active';
  IF v_role IS NULL OR v_role IN ('customer','pending') THEN RAISE EXCEPTION 'Active staff access required.'; END IF;
  IF v_cap=ANY(v_sales_caps) AND v_role NOT IN ('admin','sales','sales_rep','sales_team') THEN RAISE EXCEPTION 'Sales AI knowledge is not available for this role.'; END IF;
  IF v_cap='management_intelligence' AND v_role<>'admin' THEN RAISE EXCEPTION 'Administrator access required.'; END IF;

  v_slugs:=CASE v_cap
    WHEN 'lead_research' THEN ARRAY['lead-research']
    WHEN 'outreach_drafting' THEN ARRAY['outreach-cadence']
    WHEN 'loom_preparation' THEN ARRAY['loom-outreach']
    WHEN 'meeting_preparation' THEN ARRAY['discovery-script','product-training']
    WHEN 'meeting_summary' THEN ARRAY['discovery-script']
    WHEN 'sales_coaching' THEN ARRAY['objections','closing']
    WHEN 'next_best_action_explanation' THEN ARRAY['crm-training']
    WHEN 'quotation_assistant' THEN ARRAY['quotation-process','product-training']
    ELSE ARRAY[]::text[] END;

  IF cardinality(v_slugs)>0 THEN
    SELECT left(COALESCE(string_agg('['||m.title||' / '||l.title||']'||chr(10)||left(COALESCE(l.content,''),1100),chr(10)||chr(10) ORDER BY m.sort_order,l.sort_order),''),8000)
    INTO v_academy
    FROM public.training_modules m
    JOIN public.training_lessons l ON l.module_id=m.id AND l.active=true
    WHERE m.active=true AND m.slug=ANY(v_slugs);
  END IF;

  IF v_cap IN ('quotation_assistant','meeting_preparation','lead_research','sales_coaching') THEN
    SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.sort_order),'[]'::jsonb) INTO v_catalog
    FROM (
      SELECT sp.sort_order,jsonb_build_object(
        'code',sp.code,'name',sp.name,'category',sp.category,'productType',sp.product_type,'priceMode',sp.price_mode,
        'basePrice',sp.base_price,'currency',sp.currency,'billingPeriod',sp.billing_period,'description',sp.short_description,
        'managerApprovalRequired',sp.manager_approval_required,'standardPaymentTerms',sp.standard_payment_terms,'paymentSchedule',sp.payment_schedule
      ) obj
      FROM public.sales_products sp WHERE sp.active=true ORDER BY sp.sort_order,sp.name LIMIT 20
    ) x;
  END IF;

  SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.sort_order),'[]'::jsonb) INTO v_playbooks
  FROM (
    SELECT p.sort_order,jsonb_build_object('name',p.name,'entityType',p.entity_type,'stage',p.stage,'description',p.description,'checklist',p.checklist) obj
    FROM public.productivity_playbooks p
    WHERE p.active=true AND (cardinality(p.roles)=0 OR v_role=ANY(p.roles) OR v_role='admin')
    ORDER BY p.sort_order,p.name LIMIT 10
  ) x;

  RETURN jsonb_build_object(
    'sourcePolicy','Approved ProFox sources only. Academy and catalog remain Admin-editable sources of truth.',
    'academyGuidance',COALESCE(v_academy,''),
    'activeCatalog',COALESCE(v_catalog,'[]'::jsonb),
    'operationalPlaybooks',COALESCE(v_playbooks,'[]'::jsonb),
    'brandGuidance',CASE WHEN v_cap IN ('outreach_drafting','loom_preparation') THEN jsonb_build_object(
      'voice','Calm, intelligent, concise, certain and human.',
      'rules',jsonb_build_array('No emojis in customer-facing email copy.','No em dash in customer-facing email copy.','No fake urgency or inflated claims.','Use one clear next action.','Use only verifiable facts.'),
      'masterLine','From site to system.'
    ) ELSE '{}'::jsonb END
  );
END;
$$;

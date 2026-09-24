ALTER TABLE public.sales_products
  ADD COLUMN IF NOT EXISTS public_visible boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sales_products.public_visible IS
  'Controls whether an active Sales Catalog product is exposed through the narrow public pricing catalog RPC.';

UPDATE public.sales_products
SET public_visible = true
WHERE code IN (
  'PF-WEB-LAUNCH','PF-WEB-GROWTH','PF-WEB-SCALE','PF-CUSTOM',
  'PF-CARE','PF-CARE-GROWTH','PF-CARE-PRIORITY'
);

UPDATE public.sales_products SET scope = to_jsonb(ARRAY[
  'Up to 5 core pages',
  'Business requirements discovery',
  'Professional customized design',
  'Responsive desktop, tablet, and mobile experience',
  'Content refinement for included pages',
  'Conversion-focused page structure',
  'Contact, call, email, social, and WhatsApp actions',
  'SEO titles, descriptions, headings, and search-friendly URLs',
  'XML sitemap, image, performance, and browser optimization',
  'Analytics and Search Console setup where applicable',
  '2 structured revision rounds',
  '14 days of post-launch support'
]::text[]) WHERE code='PF-WEB-LAUNCH';

UPDATE public.sales_products SET scope = to_jsonb(ARRAY[
  'Everything in Launch',
  'Detailed strategy, audience, and competitor analysis',
  'Customer journey, sitemap, and information architecture',
  'Approximately 10–12 agreed pages',
  'Fully custom UI/UX and key-page wireframes',
  'Custom homepage and service-page layouts',
  'Conversion copywriting and message refinement',
  'Strategic calls to action, FAQs, and trust content',
  'Keyword research and page-level SEO planning',
  'Enhanced on-page SEO and internal linking',
  'Structured data where appropriate',
  'Conversion, form, call, and email tracking',
  'Up to 2 standard integrations',
  '3 structured revision rounds',
  '30 days of priority post-launch support'
]::text[]) WHERE code='PF-WEB-GROWTH';

UPDATE public.sales_products SET scope = to_jsonb(ARRAY[
  'Everything in Growth',
  'Stakeholder discovery and deep competitor benchmarking',
  'Website, UX, content-gap, conversion-path, and analytics review',
  'Advanced information architecture and journey mapping',
  'Full key-page wireframing and interactive prototyping',
  'Premium bespoke UI and custom visual direction',
  'Design system and reusable component library',
  'Advanced responsive behavior and micro-interactions',
  'Premium animation strategy within scope',
  'Advanced conversion copywriting and technical SEO',
  'Search and AI-discovery content structure',
  'Advanced lead qualification and event architecture',
  'Multiple approved integrations',
  'Enhanced accessibility and performance implementation',
  '50+ point pre-launch QA process',
  'Milestone-based review and approval',
  '60 days of priority post-launch support'
]::text[]) WHERE code='PF-WEB-SCALE';

UPDATE public.sales_products SET scope = to_jsonb(ARRAY[
  'Product discovery and requirements',
  'Customer, employee, vendor, or partner portals',
  'Admin dashboards and custom reporting',
  'Authentication and role-based permissions',
  'Custom databases and backend architecture',
  'SaaS and subscription systems',
  'Complex booking, commerce, and payment workflows',
  'CRM, ERP, and custom API integrations',
  'Workflow automation and webhooks',
  'UX, wireframes, UI design, and technical architecture',
  'QA, user acceptance testing, documentation, and training',
  'Project-specific launch and support plan'
]::text[]) WHERE code='PF-CUSTOM';

UPDATE public.sales_products SET scope = to_jsonb(ARRAY[
  'Routine website maintenance',
  'Updates where applicable',
  'Backup checks where supported',
  'Basic monitoring',
  'Up to 1 hour of small website changes per month',
  'Standard support'
]::text[]) WHERE code='PF-CARE';

UPDATE public.sales_products SET scope = to_jsonb(ARRAY[
  'Everything in ProFox Care',
  'Up to 3 hours of small website changes per month',
  'Performance review',
  'Analytics review',
  'Basic SEO and conversion checks',
  'Priority support'
]::text[]) WHERE code='PF-CARE-GROWTH';

UPDATE public.sales_products SET scope = to_jsonb(ARRAY[
  'Everything in Growth Care',
  'Up to 6 hours of website work per month',
  'Priority service queue',
  'Proactive improvement recommendations',
  'Performance monitoring',
  'Conversion and analytics review',
  'Quarterly website strategy review'
]::text[]) WHERE code='PF-CARE-PRIORITY';

REVOKE ALL ON TABLE public.sales_products FROM anon;

CREATE OR REPLACE FUNCTION public.get_public_sales_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
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
        'scope', COALESCE(p.scope, '[]'::jsonb),
        'standardPaymentTerms', p.standard_payment_terms,
        'paymentSchedule', COALESCE(p.payment_schedule, '[]'::jsonb),
        'managerApprovalRequired', p.manager_approval_required,
        'sortOrder', p.sort_order,
        'updatedAt', p.updated_at
      ) ORDER BY p.sort_order, p.name
    ), '[]'::jsonb
  )
  FROM public.sales_products p
  WHERE p.active = true AND p.public_visible = true;
$function$;

REVOKE ALL ON FUNCTION public.get_public_sales_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_sales_catalog() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_seller_command_center(p_salesperson_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_target uuid;
  v_scope text;
  v_month_start date := date_trunc('month', current_date)::date;
  v_month_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_monthly_target integer := 5;
  v_today jsonb := '{}'::jsonb;
  v_progress jsonb := NULL;
  v_payout_schedule text := '';
  v_core_codes text[] := ARRAY['PF-WEB-LAUNCH','PF-WEB-GROWTH','PF-WEB-SCALE','PF-CUSTOM']::text[];
  v_settings jsonb := '{}'::jsonb;
  v_quote_days integer := 2;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  v_is_admin := public.is_admin();
  IF NOT v_is_admin AND NOT public.has_active_role(ARRAY['sales']::text[]) THEN
    RAISE EXCEPTION 'Active Sales access required.';
  END IF;

  IF v_is_admin THEN v_target := p_salesperson_id; ELSE v_target := v_uid; END IF;
  v_scope := CASE WHEN v_target IS NULL THEN 'team' ELSE 'individual' END;

  SELECT COALESCE((role_details #>> '{performanceExpectations,minimumMonthlyPaidSales}')::integer, 5),
         COALESCE(core_product_codes, v_core_codes)
    INTO v_monthly_target, v_core_codes
  FROM public.career_jobs
  WHERE slug='independent-sales-representative'
  ORDER BY updated_at DESC
  LIMIT 1;
  v_monthly_target := GREATEST(COALESCE(v_monthly_target,5),1);

  SELECT COALESCE(payout_schedule,'') INTO v_payout_schedule
  FROM public.commission_settings WHERE id='default';

  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_settings
  FROM public.system_configuration WHERE config_key='notification_settings';
  v_quote_days := LEAST(GREATEST(COALESCE((v_settings->>'quotationFollowUpDays')::integer,2),1),30);

  v_today := public.get_sales_today_dashboard(v_target);
  IF v_target IS NOT NULL THEN
    v_progress := public.calculate_sales_career_progression(v_target,current_date);
  END IF;

  RETURN jsonb_build_object(
    'scope', v_scope,
    'salespersonId', v_target,
    'generatedAt', now(),
    'period', jsonb_build_object('start',v_month_start,'end',v_month_end),
    'today', v_today,
    'performance', jsonb_build_object(
      'confirmedPaidSales', (
        SELECT count(*) FROM (
          SELECT DISTINCT COALESCE(ce.quotation_id::text, ce.opportunity_id::text, ce.payment_id::text) sale_key
          FROM public.commission_entries ce
          JOIN public.payments pay ON pay.id=ce.payment_id
          WHERE (v_target IS NULL OR ce.salesperson_id=v_target)
            AND ce.status IN ('Earned','Under Review','Approved','Paid')
            AND pay.status='Verified' AND pay.verified_at IS NOT NULL
            AND pay.verified_at::date BETWEEN v_month_start AND v_month_end
        ) s WHERE sale_key IS NOT NULL
      ),
      'verifiedRevenue', COALESCE((
        SELECT sum(pay.amount_paid) FROM public.payments pay
        WHERE (v_target IS NULL OR pay.salesperson_id=v_target)
          AND pay.status='Verified' AND pay.verified_at IS NOT NULL
          AND pay.verified_at::date BETWEEN v_month_start AND v_month_end
      ),0),
      'pipelineValue', COALESCE((
        SELECT sum(o.expected_value) FROM public.crm_opportunities o
        WHERE (v_target IS NULL OR o.salesperson_id=v_target) AND o.status='Open'
      ),0),
      'monthlyTarget', v_monthly_target,
      'meetingsCompleted', (
        SELECT count(*) FROM public.sales_meetings m
        WHERE (v_target IS NULL OR m.salesperson_id=v_target)
          AND m.status='Completed'
          AND COALESCE(m.completed_at,m.start_at)::date BETWEEN v_month_start AND v_month_end
      ),
      'productBreakdown', COALESCE((
        WITH qualifying AS (
          SELECT DISTINCT ce.product_code, ce.product_name,
            COALESCE(ce.quotation_id::text, ce.opportunity_id::text, ce.payment_id::text) sale_key
          FROM public.commission_entries ce
          JOIN public.payments pay ON pay.id=ce.payment_id
          WHERE (v_target IS NULL OR ce.salesperson_id=v_target)
            AND ce.status IN ('Earned','Under Review','Approved','Paid')
            AND pay.status='Verified' AND pay.verified_at IS NOT NULL
            AND pay.verified_at::date BETWEEN v_month_start AND v_month_end
        )
        SELECT jsonb_agg(jsonb_build_object('productCode',product_code,'productName',product_name,'sales',sale_count) ORDER BY sale_count DESC,product_name)
        FROM (SELECT product_code,max(product_name) product_name,count(*)::integer sale_count FROM qualifying WHERE sale_key IS NOT NULL GROUP BY product_code) x
      ),'[]'::jsonb)
    ),
    'pipeline', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('stage',stage,'count',cnt,'value',value) ORDER BY rank_order)
      FROM (
        SELECT o.stage, count(*)::integer cnt, COALESCE(sum(o.expected_value),0) value,
          CASE o.stage
            WHEN 'Qualified' THEN 1 WHEN 'Meeting Scheduled' THEN 2 WHEN 'Requirements Confirmed' THEN 3
            WHEN 'Quotation Sent' THEN 4 WHEN 'Negotiation / Decision Pending' THEN 5
            WHEN 'Awaiting Advance Payment' THEN 6 WHEN 'Won' THEN 7 ELSE 99 END rank_order
        FROM public.crm_opportunities o
        WHERE (v_target IS NULL OR o.salesperson_id=v_target) AND o.status <> 'Lost'
        GROUP BY o.stage
      ) p
    ),'[]'::jsonb),
    'commissions', jsonb_build_object(
      'earned', COALESCE((SELECT sum(commission_amount) FROM public.commission_entries WHERE (v_target IS NULL OR salesperson_id=v_target) AND status='Earned'),0),
      'underReview', COALESCE((SELECT sum(commission_amount) FROM public.commission_entries WHERE (v_target IS NULL OR salesperson_id=v_target) AND status='Under Review'),0),
      'approved', COALESCE((SELECT sum(commission_amount) FROM public.commission_entries WHERE (v_target IS NULL OR salesperson_id=v_target) AND status='Approved'),0),
      'paid', COALESCE((SELECT sum(commission_amount) FROM public.commission_entries WHERE (v_target IS NULL OR salesperson_id=v_target) AND status='Paid'),0),
      'payoutSchedule', v_payout_schedule,
      'upcomingPayout', (
        SELECT COALESCE(to_jsonb(x),'null'::jsonb)
        FROM (
          SELECT b.id,b.batch_number "batchNumber",b.scheduled_date "scheduledDate",b.status,
                 COALESCE(sum(ce.commission_amount),0) amount,count(ce.id)::integer "entryCount"
          FROM public.commission_payout_batches b
          JOIN public.commission_entries ce ON ce.payout_batch_id=b.id
          WHERE b.status='Approved' AND b.scheduled_date>=current_date
            AND (v_target IS NULL OR ce.salesperson_id=v_target)
          GROUP BY b.id,b.batch_number,b.scheduled_date,b.status
          ORDER BY b.scheduled_date,b.created_at
          LIMIT 1
        ) x
      )
    ),
    'quotations', jsonb_build_object(
      'draft', (SELECT count(*) FROM public.quotations q WHERE (v_target IS NULL OR q.salesperson_id=v_target) AND q.status='Draft'),
      'readyForApproval', (SELECT count(*) FROM public.quotations q WHERE (v_target IS NULL OR q.salesperson_id=v_target) AND q.status='Ready for Approval'),
      'sent', (SELECT count(*) FROM public.quotations q WHERE (v_target IS NULL OR q.salesperson_id=v_target) AND q.status='Sent'),
      'accepted', (SELECT count(*) FROM public.quotations q WHERE (v_target IS NULL OR q.salesperson_id=v_target) AND q.status='Accepted'),
      'expired', (SELECT count(*) FROM public.quotations q WHERE (v_target IS NULL OR q.salesperson_id=v_target) AND q.status='Expired')
    ),
    'payments', jsonb_build_object(
      'awaitingCustomer', (SELECT count(*) FROM public.payments pay WHERE (v_target IS NULL OR pay.salesperson_id=v_target) AND pay.status IN ('Ready','Sent','Pending','Partially Paid')),
      'verificationPending', (SELECT count(*) FROM public.payments pay WHERE (v_target IS NULL OR pay.salesperson_id=v_target) AND pay.status='Verification Pending'),
      'overdue', (SELECT count(*) FROM public.payments pay WHERE (v_target IS NULL OR pay.salesperson_id=v_target) AND pay.status IN ('Ready','Sent','Pending','Partially Paid') AND pay.due_date IS NOT NULL AND pay.due_date<current_date),
      'verifiedThisMonth', (SELECT count(*) FROM public.payments pay WHERE (v_target IS NULL OR pay.salesperson_id=v_target) AND pay.status='Verified' AND pay.verified_at IS NOT NULL AND pay.verified_at::date BETWEEN v_month_start AND v_month_end)
    ),
    'recentSales', COALESCE((
      SELECT jsonb_agg(obj ORDER BY verified_at DESC)
      FROM (
        SELECT pay.verified_at,
          jsonb_build_object(
            'paymentId',pay.id,'customerName',pay.customer_name,'amount',pay.amount_paid,'currency',pay.currency,
            'verifiedAt',pay.verified_at,'productCode',ce.product_code,'productName',ce.product_name,
            'commissionAmount',ce.commission_amount,'commissionStatus',ce.status,
            'opportunityId',pay.opportunity_id,'quotationId',pay.quotation_id
          ) obj
        FROM public.payments pay
        LEFT JOIN LATERAL (
          SELECT c.product_code,c.product_name,c.commission_amount,c.status
          FROM public.commission_entries c WHERE c.payment_id=pay.id ORDER BY c.created_at LIMIT 1
        ) ce ON true
        WHERE (v_target IS NULL OR pay.salesperson_id=v_target) AND pay.status='Verified' AND pay.verified_at IS NOT NULL
        ORDER BY pay.verified_at DESC LIMIT 8
      ) r
    ),'[]'::jsonb),
    'attention', COALESCE((
      SELECT jsonb_agg(item ORDER BY priority, sort_at)
      FROM (
        SELECT * FROM (
          SELECT 1 priority,a.due_at sort_at,jsonb_build_object('type','overdue_follow_up','priority','high','title',a.subject,'detail','Follow-up overdue','actionUrl','/admin/app/crm?tab=activities','entityId',a.id) item
          FROM public.crm_activities a
          WHERE (v_target IS NULL OR a.assigned_to=v_target) AND lower(COALESCE(a.status,'')) NOT IN ('completed','cancelled') AND a.due_at<now()
          UNION ALL
          SELECT 1,COALESCE(pay.updated_at,pay.created_at),jsonb_build_object('type','payment_verification','priority','high','title',pay.customer_name,'detail','Customer payment is waiting for verification','actionUrl','/admin/app/sales?tab=payments','entityId',pay.id)
          FROM public.payments pay
          WHERE (v_target IS NULL OR pay.salesperson_id=v_target) AND pay.status='Verification Pending'
          UNION ALL
          SELECT 2,COALESCE(q.sent_at,q.updated_at),jsonb_build_object('type','quotation_follow_up','priority','medium','title',q.customer_name,'detail',q.quotation_number||' is awaiting follow-up','actionUrl','/admin/app/sales?tab=quotations','entityId',q.id)
          FROM public.quotations q
          WHERE (v_target IS NULL OR q.salesperson_id=v_target) AND q.status='Sent' AND q.accepted_at IS NULL AND q.rejected_at IS NULL
            AND q.sent_at IS NOT NULL AND q.sent_at<=now()-make_interval(days=>v_quote_days)
          UNION ALL
          SELECT 2,COALESCE(o.next_follow_up_at,o.updated_at),jsonb_build_object('type','opportunity_next_step','priority','medium','title',o.company_name,'detail','Open opportunity has no future follow-up scheduled','actionUrl','/admin/app/crm?tab=pipeline','entityId',o.id)
          FROM public.crm_opportunities o
          WHERE (v_target IS NULL OR o.salesperson_id=v_target) AND o.status='Open' AND (o.next_follow_up_at IS NULL OR o.next_follow_up_at<now())
        ) raw
        ORDER BY priority,sort_at
        LIMIT 15
      ) a
    ),'[]'::jsonb),
    'careerProgression', v_progress,
    'coreProducts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code',p.code,'name',p.name,'priceMode',p.price_mode,'basePrice',p.base_price,'currency',p.currency,
        'shortDescription',p.short_description,'scope',COALESCE(p.scope,'[]'::jsonb),
        'standardPaymentTerms',p.standard_payment_terms,'paymentSchedule',COALESCE(p.payment_schedule,'[]'::jsonb),
        'managerApprovalRequired',p.manager_approval_required
      ) ORDER BY array_position(v_core_codes,p.code),p.sort_order)
      FROM public.sales_products p WHERE p.active=true AND p.code=ANY(v_core_codes)
    ),'[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_seller_command_center(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seller_command_center(uuid) TO authenticated, service_role;

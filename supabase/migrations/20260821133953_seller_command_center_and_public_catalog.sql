-- Historical foundation for the Seller Command Center / public pricing catalog.
-- The follow-up 20260822035919 hardening migration contains the authoritative
-- final RPC definitions and privilege model. This file preserves migration
-- history so a clean environment reaches the same schema in sequence.

ALTER TABLE public.sales_products
  ADD COLUMN IF NOT EXISTS public_visible boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sales_products.public_visible IS
  'Controls whether an active Sales Catalog product is exposed through the narrow public pricing catalog RPC.';

UPDATE public.sales_products
SET public_visible = true
WHERE code IN ('PF-WEB-LAUNCH','PF-WEB-GROWTH','PF-WEB-SCALE','PF-CUSTOM');

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

-- get_seller_command_center(uuid) is defined authoritatively in the immediately
-- following hardening migration. Keeping that definition in one migration avoids
-- two independently maintained copies of a large cross-module reporting RPC.

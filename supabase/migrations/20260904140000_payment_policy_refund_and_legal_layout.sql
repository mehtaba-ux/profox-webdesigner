-- Publish the revised Payment Policy metadata and keep quotation consent
-- audit records aligned with the policy version customers actually review.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.content c
    CROSS JOIN LATERAL jsonb_array_elements(c.data) AS page
    WHERE c.id = 'customPages'
      AND (page->>'id' = 'payment-policy' OR page->>'slug' = 'payment-policy')
  ) THEN
    RAISE EXCEPTION 'Payment Policy CMS page is missing';
  END IF;

  UPDATE public.content AS c
  SET data = rebuilt.data,
      updated_at = now()
  FROM (
    SELECT jsonb_agg(
      CASE
        WHEN page->>'id' = 'payment-policy' OR page->>'slug' = 'payment-policy' THEN
          page || jsonb_build_object(
            'title', 'Payment Policy',
            'heroSubheading', 'PAYMENT POLICY',
            'heroTitle', 'Clear Payment Terms Before Work Begins',
            'heroSubtitle', 'How ProFox confirms project pricing, payment milestones, third-party costs, scope changes, refunds, cancellations, payment adjustments, and payment authorization.',
            'bodyContent', 'This Payment Policy works together with your approved quotation, Statement of Work (SOW), service agreement and the ProFox Terms & Conditions. Your approved quotation remains the primary source of truth for project scope, investment, payment schedule, milestones, deliverables, exclusions and project-specific commercial terms.',
            'policyVersion', '2026-09-04',
            'updatedAt', '2026-09-04',
            'seo', coalesce(page->'seo', '{}'::jsonb) || jsonb_build_object(
              'metaTitle', 'Payment Policy | ProFox Web Designer',
              'metaDescription', 'Read the ProFox Payment Policy covering project pricing, payment milestones, refunds, cancellations, third-party costs, payment adjustments and payment authorization.',
              'focusKeyword', 'ProFox payment policy',
              'canonicalUrl', 'https://www.profoxwebdesigner.com/payment-policy',
              'schemaType', 'WebPage',
              'noIndex', false
            )
          )
        ELSE page
      END
      ORDER BY ordinality
    ) AS data
    FROM public.content source
    CROSS JOIN LATERAL jsonb_array_elements(source.data) WITH ORDINALITY AS pages(page, ordinality)
    WHERE source.id = 'customPages'
  ) AS rebuilt
  WHERE c.id = 'customPages';
END
$migration$;

CREATE OR REPLACE FUNCTION public.quotation_legal_policy_metadata()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'termsUrl','https://www.profoxwebdesigner.com/terms-and-conditions',
    'termsVersion','2026-08-07',
    'paymentPolicyUrl','https://www.profoxwebdesigner.com/payment-policy',
    'paymentPolicyVersion','2026-09-04',
    'consentText','I have reviewed this quotation and agree to the ProFox Terms & Conditions and Payment Policy. I understand that accepting the quotation does not itself authorize a charge; any payment is authorized separately through the approved payment method or payment provider.'
  );
$function$;

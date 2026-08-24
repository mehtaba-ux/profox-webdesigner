-- Seller Command Center release hardening:
-- keep Sales role aliases consistent from Workspace navigation through protected Calendar/Meeting RPCs and RLS.
-- Existing canonical `sales` behavior is preserved. `sales_rep` and `sales_team` are treated as members of
-- the same Sales role family only when a guarded helper explicitly asks for `sales` access.

CREATE OR REPLACE FUNCTION public.has_active_role(p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND status = 'active'
      AND (
        role = ANY(p_roles)
        OR ('sales' = ANY(p_roles) AND role IN ('sales_rep','sales_team'))
      )
  );
$function$;

DROP POLICY IF EXISTS sales_meetings_sales_read_own ON public.sales_meetings;
CREATE POLICY sales_meetings_sales_read_own
ON public.sales_meetings
FOR SELECT
TO authenticated
USING (
  salesperson_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('sales','sales_rep','sales_team')
  )
);

DROP POLICY IF EXISTS user_calendar_settings_self_insert ON public.user_calendar_settings;
CREATE POLICY user_calendar_settings_self_insert
ON public.user_calendar_settings
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND provider = 'Manual'
  AND connection_status = 'Not Connected'
  AND EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('sales','sales_rep','sales_team')
  )
);

DROP POLICY IF EXISTS user_calendar_settings_self_select ON public.user_calendar_settings;
CREATE POLICY user_calendar_settings_self_select
ON public.user_calendar_settings
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('sales','sales_rep','sales_team')
  )
);

DROP POLICY IF EXISTS user_calendar_settings_self_update ON public.user_calendar_settings;
CREATE POLICY user_calendar_settings_self_update
ON public.user_calendar_settings
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('sales','sales_rep','sales_team')
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND provider = 'Manual'
  AND connection_status = 'Not Connected'
  AND EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('sales','sales_rep','sales_team')
  )
);

CREATE OR REPLACE FUNCTION public.get_my_seller_profile_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.user_profiles%ROWTYPE;
  v_applicant public.applicants%ROWTYPE;
  v_agreement public.sales_partner_agreements%ROWTYPE;
  v_cert public.user_training_progress%ROWTYPE;
  v_payout_schedule text := '';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF NOT public.is_admin() AND NOT public.has_active_role(ARRAY['sales']::text[]) THEN
    RAISE EXCEPTION 'Active Sales access required.';
  END IF;

  SELECT * INTO v_profile FROM public.user_profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found.'; END IF;

  SELECT * INTO v_applicant
  FROM public.applicants
  WHERE linked_user_id = v_uid
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_applicant.id IS NOT NULL THEN
    SELECT * INTO v_agreement
    FROM public.sales_partner_agreements
    WHERE applicant_id = v_applicant.id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  SELECT p.* INTO v_cert
  FROM public.user_training_progress p
  JOIN public.training_modules m ON m.id = p.module_id
  WHERE p.user_id = v_uid AND m.slug = 'final-certification'
  ORDER BY p.updated_at DESC
  LIMIT 1;

  SELECT COALESCE(payout_schedule,'') INTO v_payout_schedule
  FROM public.commission_settings
  WHERE id = 'default';

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'email', COALESCE(v_profile.email,''),
      'fullName', COALESCE(v_profile.full_name,''),
      'phone', COALESCE(v_profile.phone,''),
      'country', COALESCE(v_profile.country,''),
      'timezone', COALESCE(v_profile.timezone,'UTC'),
      'role', COALESCE(v_profile.role,''),
      'status', COALESCE(v_profile.status,''),
      'onboardingStatus', COALESCE(v_profile.onboarding_status,''),
      'onboardingProgress', COALESCE(v_profile.onboarding_progress,0),
      'avatarUrl', COALESCE(v_profile.avatar_url,'')
    ),
    'activation', jsonb_build_object(
      'stage', NULLIF(v_applicant.stage,''),
      'activatedAt', CASE WHEN v_applicant.stage = 'Activated' THEN v_applicant.stage_entered_at ELSE NULL END,
      'finalApproval', v_applicant.final_approval
    ),
    'agreement', jsonb_build_object(
      'status', NULLIF(v_agreement.status,''),
      'agreementNumber', NULLIF(v_agreement.agreement_number,''),
      'partnerSignedAt', v_agreement.partner_signed_at,
      'companySignedAt', v_agreement.company_signed_at,
      'verifiedAt', v_agreement.verified_at,
      'commissionTermsAcknowledgedThroughAgreement', (v_agreement.verified_at IS NOT NULL AND v_agreement.commercial_snapshot IS NOT NULL)
    ),
    'academy', jsonb_build_object(
      'finalCertificationStatus', NULLIF(v_cert.status,''),
      'finalCertificationScore', v_cert.score,
      'finalCertificationReviewStatus', NULLIF(v_cert.review_status,''),
      'finalCertificationCompletedAt', v_cert.completed_at
    ),
    'commission', jsonb_build_object(
      'payoutSchedule', v_payout_schedule
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_seller_profile_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_seller_profile_context() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_seller_profile_context() TO authenticated;

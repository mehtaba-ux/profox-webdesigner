-- ProFox CRM stabilization step 1: helper functions, client identity link, privileged-field guards

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND status = 'active'
      AND role IN ('admin','sales','project_manager','uiux_designer','content_writer','developer','qa','site_manager','editor')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_active_role(p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND status = 'active'
      AND role = ANY(p_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_role(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_role(text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role, status, department)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'pending',
    'pending',
    'General'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.protect_user_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR OLD.id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized profile update.';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.department IS DISTINCT FROM OLD.department
     OR NEW.manager IS DISTINCT FROM OLD.manager
     OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
     OR NEW.onboarding_progress IS DISTINCT FROM OLD.onboarding_progress
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Privileged profile fields may only be changed by an Admin.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_profile_privileged_fields ON public.user_profiles;
CREATE TRIGGER trg_protect_user_profile_privileged_fields
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_user_profile_privileged_fields();

CREATE OR REPLACE FUNCTION public.protect_payment_verification_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('Verified','Refunded','Partially Refunded')
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid THEN
    RAISE EXCEPTION 'Payment verification and settlement fields are Admin-only.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_payment_verification_fields ON public.payments;
CREATE TRIGGER trg_protect_payment_verification_fields
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.protect_payment_verification_fields();

CREATE OR REPLACE FUNCTION public.protect_training_review_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_requires_review boolean := false;
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(requires_admin_review, false)
    INTO v_requires_review
  FROM public.training_modules
  WHERE id = NEW.module_id;

  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_status IS DISTINCT FROM OLD.review_status
     OR NEW.feedback IS DISTINCT FROM OLD.feedback THEN
    RAISE EXCEPTION 'Training review fields are Admin-only.';
  END IF;

  IF v_requires_review
     AND NEW.status IN ('Passed','Completed')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'This module requires Admin review before it can be passed.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_training_review_fields ON public.user_training_progress;
CREATE TRIGGER trg_protect_training_review_fields
BEFORE UPDATE ON public.user_training_progress
FOR EACH ROW EXECUTE FUNCTION public.protect_training_review_fields();

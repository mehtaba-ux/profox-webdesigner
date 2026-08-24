-- Explicit Admin-controlled client portal account linking.
CREATE OR REPLACE FUNCTION public.link_client_account(p_client_id uuid, p_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client public.clients%ROWTYPE;
  v_profile public.user_profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: only an active Admin may link a client portal account.'; END IF;
  SELECT * INTO v_client FROM public.clients WHERE id=p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client record not found.'; END IF;
  IF v_client.status<>'Active' THEN RAISE EXCEPTION 'Only an active client can receive portal access.'; END IF;

  SELECT * INTO v_profile FROM public.user_profiles WHERE id=p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found.'; END IF;
  IF lower(trim(COALESCE(v_profile.email,'')))<>lower(trim(COALESCE(v_client.email,''))) THEN RAISE EXCEPTION 'Client contact email must exactly match the portal account email.'; END IF;
  IF v_profile.role NOT IN ('pending','customer') THEN RAISE EXCEPTION 'Staff/Admin accounts cannot be linked as client portal accounts.'; END IF;

  UPDATE public.clients SET linked_user_id=p_target_user_id,updated_at=now() WHERE id=p_client_id;
  UPDATE public.user_profiles
  SET role='customer',status='active',department='General',onboarding_status='completed',onboarding_progress=100,
      full_name=COALESCE(NULLIF(trim(v_client.primary_contact_name),''),full_name),updated_at=now()
  WHERE id=p_target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_client_account(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_user_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized: only an active Admin may unlink a client portal account.'; END IF;
  SELECT linked_user_id INTO v_user_id FROM public.clients WHERE id=p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client record not found.'; END IF;
  UPDATE public.clients SET linked_user_id=NULL,updated_at=now() WHERE id=p_client_id;
  IF v_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clients WHERE linked_user_id=v_user_id AND id<>p_client_id) THEN
    UPDATE public.user_profiles
    SET role='pending',status='pending',department='General',onboarding_status='not_started',onboarding_progress=0,updated_at=now()
    WHERE id=v_user_id AND role='customer';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.link_client_account(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.unlink_client_account(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.link_client_account(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_client_account(uuid) TO authenticated;

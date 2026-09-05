-- Make the invitation-based Client Portal claim safe to retry after the
-- relationship has already been linked. This prevents a stale or duplicated
-- post-confirmation attempt from showing an activation error after the
-- canonical customer identity is already active.

create or replace function public.customer_portal_claim_identity(p_invite_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_role text;
  v_status text;
  v_hash text;
  v_o public.client_onboardings%rowtype;
  v_identity public.customer_identities%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select lower(btrim(u.email)), u.email_confirmed_at, p.role, p.status
  into v_email, v_confirmed, v_role, v_status
  from auth.users u
  join public.user_profiles p on p.id = u.id
  where u.id = v_uid;

  if not found then
    raise exception 'Portal profile is not available.';
  end if;
  if v_confirmed is null then
    raise exception 'Verify your email address before activating the Client Portal.';
  end if;
  if v_role not in ('pending', 'customer') then
    raise exception 'Staff accounts cannot be linked to customer portal history.';
  end if;

  -- A completed claim is canonical relationship state. Once this verified user
  -- is already linked to an active customer profile, repeated confirmation
  -- redirects must be harmless and must not depend on the invitation query
  -- string still being present or current.
  select *
  into v_identity
  from public.customer_identities
  where linked_user_id = v_uid
  limit 1;

  if found and v_role = 'customer' and v_status = 'active' then
    return jsonb_build_object(
      'identityId', v_identity.id,
      'email', v_email,
      'relationshipStatus', v_identity.relationship_status,
      'linked', true,
      'alreadyLinked', true
    );
  end if;

  if p_invite_token is null or length(p_invite_token) < 40 or length(p_invite_token) > 256 then
    raise exception 'A valid completed-onboarding portal invitation is required.';
  end if;

  v_hash := encode(extensions.digest(p_invite_token, 'sha256'), 'hex');
  select *
  into v_o
  from public.client_onboardings
  where portal_activation_token_hash = v_hash
  for update;

  if not found or v_o.status <> 'Completed' then
    raise exception 'Portal activation link is invalid or onboarding is not complete.';
  end if;

  select *
  into v_identity
  from public.customer_identities
  where id = v_o.customer_identity_id
  for update;

  if v_identity.email <> v_email then
    raise exception 'Use the same verified email address registered for this ProFox client relationship.';
  end if;
  if v_identity.linked_user_id is not null and v_identity.linked_user_id <> v_uid then
    raise exception 'This customer history is already linked to another verified portal account.';
  end if;
  if v_identity.linked_user_id is null
     and (v_o.portal_activation_expires_at is null or v_o.portal_activation_expires_at < now()) then
    raise exception 'This portal activation link has expired. Please ask ProFox to resend it.';
  end if;

  update public.customer_identities
  set linked_user_id = v_uid,
      last_seen_at = greatest(last_seen_at, now()),
      updated_at = now()
  where id = v_identity.id;

  perform set_config('profox.customer_portal_claim_rpc', '1', true);
  update public.user_profiles
  set role = 'customer',
      status = 'active',
      department = 'General',
      onboarding_status = 'completed',
      onboarding_progress = 100,
      full_name = coalesce(
        nullif(btrim((select primary_contact_name from public.clients where id = v_o.client_id)), ''),
        full_name
      ),
      updated_at = now()
  where id = v_uid
    and role in ('pending', 'customer');
  perform set_config('profox.customer_portal_claim_rpc', '', true);

  update public.clients
  set linked_user_id = v_uid,
      updated_at = now()
  where customer_identity_id = v_identity.id
    and (linked_user_id is null or linked_user_id = v_uid);

  update public.client_onboardings
  set portal_activation_claimed_at = coalesce(portal_activation_claimed_at, now()),
      updated_at = now()
  where customer_identity_id = v_identity.id
    and status = 'Completed'
    and (portal_activation_claimed_at is null or id = v_o.id);

  return jsonb_build_object(
    'identityId', v_identity.id,
    'email', v_email,
    'relationshipStatus', v_identity.relationship_status,
    'linked', true,
    'alreadyLinked', false,
    'projectId', v_o.project_id
  );
exception
  when others then
    perform set_config('profox.customer_portal_claim_rpc', '', true);
    raise;
end;
$function$;

revoke execute on function public.customer_portal_claim_identity(text) from public, anon;
grant execute on function public.customer_portal_claim_identity(text) to authenticated, service_role;

create or replace function public.protect_user_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_sales_invite text:=coalesce(current_setting('profox.sales_candidate_invite_rpc',true),'');
  v_content_invite text:=coalesce(current_setting('profox.content_writer_invite_rpc',true),'');
  v_content_activation text:=coalesce(current_setting('profox.content_writer_activation_rpc',true),'');
  v_customer_portal_claim text:=coalesce(current_setting('profox.customer_portal_claim_rpc',true),'');
begin
  if public.is_admin() or v_sales_invite='1' or v_content_invite='1' or v_content_activation='1' or v_customer_portal_claim='1' then return new; end if;
  if auth.uid() is null or old.id<>auth.uid() then raise exception 'Unauthorized profile update.'; end if;
  if new.role is distinct from old.role or new.status is distinct from old.status or new.department is distinct from old.department or new.manager is distinct from old.manager or new.onboarding_status is distinct from old.onboarding_status or new.onboarding_progress is distinct from old.onboarding_progress or new.email is distinct from old.email then
    raise exception 'Privileged profile fields may only be changed by an authorized workflow.';
  end if;
  return new;
end;$function$;

create or replace function public.customer_portal_claim_identity()
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_role text;
  v_identity public.customer_identities%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select lower(btrim(u.email)),u.email_confirmed_at,p.role into v_email,v_confirmed,v_role from auth.users u join public.user_profiles p on p.id=u.id where u.id=v_uid;
  if not found then raise exception 'Portal profile is not available.'; end if;
  if v_confirmed is null then raise exception 'Verify your email address before linking relationship history.'; end if;
  if v_role not in ('pending','customer') then raise exception 'Staff accounts cannot be linked to customer relationship history.'; end if;
  select * into v_identity from public.customer_identities where email=v_email for update;
  if not found then raise exception 'No ProFox relationship history is registered for this verified email yet.'; end if;
  if v_identity.linked_user_id is not null and v_identity.linked_user_id<>v_uid then raise exception 'This customer history is already linked to another verified portal account.'; end if;

  update public.customer_identities set linked_user_id=v_uid,last_seen_at=greatest(last_seen_at,now()),updated_at=now() where id=v_identity.id;

  perform set_config('profox.customer_portal_claim_rpc','1',true);
  update public.user_profiles
  set role='customer',status='active',department='General',onboarding_status='completed',onboarding_progress=100,updated_at=now()
  where id=v_uid and role in ('pending','customer');
  perform set_config('profox.customer_portal_claim_rpc','',true);

  update public.clients set linked_user_id=v_uid,updated_at=now() where customer_identity_id=v_identity.id and (linked_user_id is null or linked_user_id=v_uid);

  return jsonb_build_object('identityId',v_identity.id,'email',v_email,'relationshipStatus',v_identity.relationship_status,'linked',true);
exception when others then
  perform set_config('profox.customer_portal_claim_rpc','',true);
  raise;
end;$function$;

revoke all on function public.customer_portal_claim_identity() from public,anon;
grant execute on function public.customer_portal_claim_identity() to authenticated,service_role,postgres;
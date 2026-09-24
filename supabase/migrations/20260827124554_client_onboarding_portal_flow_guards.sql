create or replace function public.public_client_portal_invite_status(p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public','extensions','pg_temp' as $function$
declare v_hash text; v_o public.client_onboardings%rowtype; v_identity public.customer_identities%rowtype; v_client public.clients%rowtype; v_project public.projects%rowtype; v_linked boolean:=false;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Portal activation link is invalid.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_o from public.client_onboardings where portal_activation_token_hash=v_hash;
  if not found or v_o.status<>'Completed' then raise exception 'Portal activation link is invalid or onboarding is not complete.'; end if;
  select * into v_identity from public.customer_identities where id=v_o.customer_identity_id;
  select * into v_client from public.clients where id=v_o.client_id;
  select * into v_project from public.projects where id=v_o.project_id;
  v_linked:=v_identity.linked_user_id is not null and exists(select 1 from public.user_profiles u where u.id=v_identity.linked_user_id and u.role='customer' and u.status='active');
  if not v_linked and (v_o.portal_activation_expires_at is null or v_o.portal_activation_expires_at<now()) then raise exception 'This portal activation link has expired. Please ask ProFox to resend it.'; end if;
  return jsonb_build_object('valid',true,'email',v_identity.email,'contactName',v_client.primary_contact_name,'companyName',v_client.company_name,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'expiresAt',v_o.portal_activation_expires_at,'alreadyLinked',v_linked);
end;$function$;
revoke all on function public.public_client_portal_invite_status(text) from public;
grant execute on function public.public_client_portal_invite_status(text) to anon,authenticated,service_role,postgres;

create or replace function public.customer_portal_claim_identity(p_invite_token text)
returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
declare v_uid uuid:=auth.uid(); v_email text; v_confirmed timestamptz; v_role text; v_hash text; v_o public.client_onboardings%rowtype; v_identity public.customer_identities%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_invite_token is null or length(p_invite_token)<40 or length(p_invite_token)>256 then raise exception 'A valid completed-onboarding portal invitation is required.'; end if;
  select lower(btrim(u.email)),u.email_confirmed_at,p.role into v_email,v_confirmed,v_role from auth.users u join public.user_profiles p on p.id=u.id where u.id=v_uid;
  if not found then raise exception 'Portal profile is not available.'; end if;
  if v_confirmed is null then raise exception 'Verify your email address before activating the Client Portal.'; end if;
  if v_role not in ('pending','customer') then raise exception 'Staff accounts cannot be linked to customer portal history.'; end if;
  v_hash:=encode(extensions.digest(p_invite_token,'sha256'),'hex');
  select * into v_o from public.client_onboardings where portal_activation_token_hash=v_hash for update;
  if not found or v_o.status<>'Completed' then raise exception 'Portal activation link is invalid or onboarding is not complete.'; end if;
  select * into v_identity from public.customer_identities where id=v_o.customer_identity_id for update;
  if v_identity.email<>v_email then raise exception 'Use the same verified email address registered for this ProFox client relationship.'; end if;
  if v_identity.linked_user_id is not null and v_identity.linked_user_id<>v_uid then raise exception 'This customer history is already linked to another verified portal account.'; end if;
  if v_identity.linked_user_id is null and (v_o.portal_activation_expires_at is null or v_o.portal_activation_expires_at<now()) then raise exception 'This portal activation link has expired. Please ask ProFox to resend it.'; end if;

  update public.customer_identities set linked_user_id=v_uid,last_seen_at=greatest(last_seen_at,now()),updated_at=now() where id=v_identity.id;
  perform set_config('profox.customer_portal_claim_rpc','1',true);
  update public.user_profiles set role='customer',status='active',department='General',onboarding_status='completed',onboarding_progress=100,full_name=coalesce(nullif(btrim((select primary_contact_name from public.clients where id=v_o.client_id)),''),full_name),updated_at=now() where id=v_uid and role in ('pending','customer');
  perform set_config('profox.customer_portal_claim_rpc','',true);
  update public.clients set linked_user_id=v_uid,updated_at=now() where customer_identity_id=v_identity.id and (linked_user_id is null or linked_user_id=v_uid);
  update public.client_onboardings set portal_activation_claimed_at=coalesce(portal_activation_claimed_at,now()),updated_at=now() where customer_identity_id=v_identity.id and status='Completed' and (portal_activation_claimed_at is null or id=v_o.id);
  return jsonb_build_object('identityId',v_identity.id,'email',v_email,'relationshipStatus',v_identity.relationship_status,'linked',true,'projectId',v_o.project_id);
exception when others then perform set_config('profox.customer_portal_claim_rpc','',true); raise;
end;$function$;
revoke all on function public.customer_portal_claim_identity(text) from public,anon;
grant execute on function public.customer_portal_claim_identity(text) to authenticated,service_role,postgres;

create or replace function public.customer_portal_claim_identity()
returns jsonb language plpgsql stable security definer set search_path to 'public','auth','pg_temp' as $function$
declare v_uid uuid:=auth.uid(); v_identity public.customer_identities%rowtype; v_profile public.user_profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_profile from public.user_profiles where id=v_uid;
  select * into v_identity from public.customer_identities where linked_user_id=v_uid;
  if found and v_profile.role='customer' and v_profile.status='active' then return jsonb_build_object('identityId',v_identity.id,'email',v_identity.email,'relationshipStatus',v_identity.relationship_status,'linked',true); end if;
  raise exception 'Client Portal activation requires a completed onboarding invitation.';
end;$function$;
revoke all on function public.customer_portal_claim_identity() from public,anon;
grant execute on function public.customer_portal_claim_identity() to authenticated,service_role,postgres;

create or replace function public.link_client_account(p_client_id uuid,p_target_user_id uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_client public.clients%rowtype; v_profile public.user_profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Unauthorized: only an active Admin may link a client portal account.'; end if;
  select * into v_client from public.clients where id=p_client_id for update; if not found then raise exception 'Client record not found.'; end if;
  if v_client.status<>'Active' then raise exception 'Only an active client can receive portal access.'; end if;
  if not exists(select 1 from public.client_onboardings o where o.client_id=v_client.id and o.status='Completed') then raise exception 'Complete the required client onboarding before linking portal access.'; end if;
  select * into v_profile from public.user_profiles where id=p_target_user_id for update; if not found then raise exception 'User profile not found.'; end if;
  if lower(btrim(coalesce(v_profile.email,'')))<>lower(btrim(coalesce(v_client.email,''))) then raise exception 'Client contact email must exactly match the portal account email.'; end if;
  if v_profile.role not in ('pending','customer') then raise exception 'Staff/Admin accounts cannot be linked as client portal accounts.'; end if;
  perform set_config('profox.customer_portal_claim_rpc','1',true);
  update public.clients set linked_user_id=p_target_user_id,updated_at=now() where customer_identity_id=v_client.customer_identity_id or id=p_client_id;
  update public.customer_identities set linked_user_id=p_target_user_id,last_seen_at=greatest(last_seen_at,now()),updated_at=now() where id=v_client.customer_identity_id and (linked_user_id is null or linked_user_id=p_target_user_id);
  update public.user_profiles set role='customer',status='active',department='General',onboarding_status='completed',onboarding_progress=100,full_name=coalesce(nullif(btrim(v_client.primary_contact_name),''),full_name),updated_at=now() where id=p_target_user_id;
  perform set_config('profox.customer_portal_claim_rpc','',true);
exception when others then perform set_config('profox.customer_portal_claim_rpc','',true); raise;
end;$function$;

create or replace function public.service_link_client_portal_invite(p_client_id uuid,p_target_user_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_client public.clients%rowtype; v_profile public.user_profiles%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Service role required.'; end if;
  select * into v_client from public.clients where id=p_client_id for update; if not found then raise exception 'Client record not found.'; end if;
  if v_client.status<>'Active' then raise exception 'Only an active client can receive portal access.'; end if;
  if not exists(select 1 from public.client_onboardings o where o.client_id=v_client.id and o.status='Completed') then raise exception 'Complete the required client onboarding before linking portal access.'; end if;
  select * into v_profile from public.user_profiles where id=p_target_user_id for update; if not found then raise exception 'User profile not found.'; end if;
  if lower(btrim(coalesce(v_profile.email,'')))<>lower(btrim(coalesce(v_client.email,''))) then raise exception 'Client contact email must exactly match the invited account email.'; end if;
  if v_profile.role not in ('pending','customer') then raise exception 'A staff or Admin account cannot be linked as a client portal account.'; end if;
  perform set_config('profox.customer_portal_claim_rpc','1',true);
  update public.clients set linked_user_id=p_target_user_id,portal_invite_count=least(portal_invite_count+1,50),portal_invite_last_sent_at=now(),updated_at=now() where customer_identity_id=v_client.customer_identity_id or id=p_client_id;
  update public.customer_identities set linked_user_id=p_target_user_id,last_seen_at=greatest(last_seen_at,now()),updated_at=now() where id=v_client.customer_identity_id and (linked_user_id is null or linked_user_id=p_target_user_id);
  update public.user_profiles set role='customer',status='active',department='General',onboarding_status='completed',onboarding_progress=100,full_name=coalesce(nullif(btrim(v_client.primary_contact_name),''),full_name),updated_at=now() where id=p_target_user_id;
  perform set_config('profox.customer_portal_claim_rpc','',true);
  return jsonb_build_object('clientId',p_client_id,'linkedUserId',p_target_user_id,'email',lower(btrim(v_client.email)));
exception when others then perform set_config('profox.customer_portal_claim_rpc','',true); raise;
end;$function$;

create or replace function public.protect_project_stage_workflow()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_expected text; v_incomplete integer:=0; v_client_decision boolean:=coalesce(current_setting('profox.project_client_decision_rpc',true),'')='1'; v_content_handoff boolean:=coalesce(current_setting('profox.content_handoff_rpc',true),'')='1';
begin
  if new.stage is not distinct from old.stage then return new; end if;
  if old.status<>'Active' then raise exception 'Only an active project may change delivery stage.'; end if;
  if v_content_handoff then
    if old.stage<>'Content' or new.stage<>'UI/UX Design' then raise exception 'Invalid protected Content handoff transition.'; end if;
    select count(*) into v_incomplete from public.project_tasks t where t.project_id=old.id and t.workflow_stage='Content' and t.required_for_stage is true and t.status<>'Done';
    if v_incomplete>0 then raise exception 'Complete all required Content workflow tasks before advancing the project. Remaining: %.',v_incomplete; end if;
    return new;
  end if;
  if v_client_decision then
    if old.stage='Client Design Approval' and new.stage in ('Development','UI/UX Design') then return new; end if;
    if old.stage='Client Review' and new.stage='Final Revisions' then return new; end if;
    raise exception 'Invalid client-controlled project transition.';
  end if;
  if not public.is_admin() and old.project_manager_id is distinct from auth.uid() then raise exception 'Only the assigned Project Manager or Administrator may advance the project.'; end if;
  if old.stage in ('Client Design Approval','Client Review') then raise exception 'This stage requires a recorded client decision before delivery can continue.'; end if;
  v_expected:=case old.stage when 'Sales Handover' then 'Client Onboarding' when 'Client Onboarding' then 'Requirements' when 'Requirements' then 'Content' when 'Content' then 'UI/UX Design' when 'UI/UX Design' then 'Client Design Approval' when 'Development' then 'QA' when 'QA' then 'Client Review' when 'Final Revisions' then 'Launch' when 'Launch' then 'Handover' when 'Handover' then 'Completed' else null end;
  if v_expected is null or new.stage<>v_expected then raise exception 'Project stages must follow the approved delivery sequence. Expected next stage: %.',coalesce(v_expected,'none'); end if;
  if old.stage='Sales Handover' then
    if old.project_manager_id is null then raise exception 'Assign an active Project Manager before completing Sales Handover.'; end if;
    if length(btrim(coalesce(old.sales_handover_notes,'')))<10 then raise exception 'Record the Sales Handover notes before Client Onboarding.'; end if;
  end if;
  if old.stage='Client Onboarding' and not exists(select 1 from public.client_onboardings o where o.project_id=old.id and o.status='Completed' and o.completed_at is not null) then raise exception 'Client onboarding form must be completed before advancing the project to Requirements.'; end if;
  select count(*) into v_incomplete from public.project_tasks t where t.project_id=old.id and t.workflow_stage=old.stage and t.required_for_stage is true and t.status<>'Done';
  if v_incomplete>0 then raise exception 'Complete all required % workflow tasks before advancing the project. Remaining: %.',old.stage,v_incomplete; end if;
  if new.stage='Completed' then new.status:='Completed'; new.completed_at:=coalesce(new.completed_at,now()); end if;
  return new;
end;$function$;

create or replace function public.get_project_client_onboarding(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $function$
declare v_project public.projects%rowtype; v_salesperson uuid; v_o public.client_onboardings%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_project from public.projects where id=p_project_id; if not found then raise exception 'Project not found.'; end if;
  select salesperson_id into v_salesperson from public.crm_opportunities where id=v_project.source_opportunity_id;
  if not public.is_admin() and v_project.project_manager_id is distinct from auth.uid() and v_salesperson is distinct from auth.uid() and not exists(select 1 from public.project_team t where t.project_id=v_project.id and t.user_id=auth.uid()) then raise exception 'Project onboarding access denied.'; end if;
  select * into v_o from public.client_onboardings where project_id=v_project.id;
  if not found then return jsonb_build_object('exists',false,'projectId',v_project.id); end if;
  return jsonb_build_object('exists',true,'id',v_o.id,'status',v_o.status,'responses',v_o.responses,'fields',v_o.field_schema,'submittedAt',v_o.submitted_at,'completedAt',v_o.completed_at,'inviteCount',v_o.onboarding_invite_count,'inviteLastSentAt',v_o.onboarding_invite_last_sent_at,'portalInviteCount',v_o.portal_invite_count,'portalInviteLastSentAt',v_o.portal_invite_last_sent_at);
end;$function$;
revoke all on function public.get_project_client_onboarding(uuid) from public,anon;
grant execute on function public.get_project_client_onboarding(uuid) to authenticated,service_role,postgres;

create or replace function public.admin_get_client_onboarding_settings()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $function$
begin if not public.is_admin() then raise exception 'Administrator access required.'; end if; return public.client_onboarding_config(); end;$function$;
revoke all on function public.admin_get_client_onboarding_settings() from public,anon;
grant execute on function public.admin_get_client_onboarding_settings() to authenticated,service_role,postgres;

create or replace function public.admin_save_client_onboarding_settings(p_config jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_fields jsonb; v_field jsonb; v_keys text[]:=array[]::text[]; v_key text; v_type text;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_config is null or jsonb_typeof(p_config)<>'object' then raise exception 'Onboarding settings must be an object.'; end if;
  v_fields:=p_config->'fields';
  if jsonb_typeof(v_fields)<>'array' or jsonb_array_length(v_fields)<1 or jsonb_array_length(v_fields)>50 then raise exception 'Configure between 1 and 50 onboarding fields.'; end if;
  for v_field in select value from jsonb_array_elements(v_fields) loop
    v_key:=btrim(coalesce(v_field->>'key','')); v_type:=btrim(coalesce(v_field->>'type',''));
    if v_key !~ '^[a-zA-Z][a-zA-Z0-9_]{1,63}$' then raise exception 'Invalid onboarding field key: %.',v_key; end if;
    if v_key=any(v_keys) then raise exception 'Duplicate onboarding field key: %.',v_key; end if;
    v_keys:=array_append(v_keys,v_key);
    if btrim(coalesce(v_field->>'label',''))='' then raise exception 'Every onboarding field requires a label.'; end if;
    if v_type not in ('text','textarea','url','select') then raise exception 'Unsupported onboarding field type: %.',v_type; end if;
    if v_type='select' and (jsonb_typeof(v_field->'options')<>'array' or jsonb_array_length(v_field->'options')<1) then raise exception 'Select field % requires options.',v_key; end if;
  end loop;
  insert into public.system_configuration(config_key,config_value,updated_by,updated_at) values('client_onboarding_settings',p_config,auth.uid(),now()) on conflict(config_key) do update set config_value=excluded.config_value,updated_by=auth.uid(),updated_at=now();
  return p_config;
end;$function$;
revoke all on function public.admin_save_client_onboarding_settings(jsonb) from public,anon;
grant execute on function public.admin_save_client_onboarding_settings(jsonb) to authenticated,service_role,postgres;
create table if not exists public.client_onboardings (
  id uuid primary key default gen_random_uuid(),
  customer_identity_id uuid not null references public.customer_identities(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  project_id uuid not null unique references public.projects(id) on delete restrict,
  quotation_id uuid not null references public.quotations(id) on delete restrict,
  triggering_payment_id uuid references public.payments(id) on delete set null,
  status text not null default 'Pending' check (status in ('Pending','In Progress','Completed')),
  form_version integer not null default 1,
  field_schema jsonb not null default '[]'::jsonb,
  responses jsonb not null default '{}'::jsonb,
  public_token_hash text unique,
  public_token_issued_at timestamptz,
  public_token_expires_at timestamptz,
  onboarding_invite_count integer not null default 0 check (onboarding_invite_count between 0 and 100),
  onboarding_invite_last_sent_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  portal_activation_token_hash text unique,
  portal_activation_issued_at timestamptz,
  portal_activation_expires_at timestamptz,
  portal_activation_claimed_at timestamptz,
  portal_invite_count integer not null default 0 check (portal_invite_count between 0 and 100),
  portal_invite_last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_onboardings_identity_idx on public.client_onboardings(customer_identity_id,created_at desc);
create index if not exists client_onboardings_client_idx on public.client_onboardings(client_id,created_at desc);
create index if not exists client_onboardings_status_idx on public.client_onboardings(status,updated_at desc);
alter table public.client_onboardings enable row level security;
revoke all on public.client_onboardings from public,anon,authenticated;
grant select,insert,update,delete on public.client_onboardings to service_role;

insert into public.system_configuration(config_key,config_value,updated_at)
values('client_onboarding_settings',jsonb_build_object(
  'version',1,
  'onboardingLinkExpiryDays',30,
  'portalInviteExpiryDays',7,
  'fields',jsonb_build_array(
    jsonb_build_object('key','companyName','label','Company / Brand Name','type','text','required',true,'section','Business Details','placeholder','Your company or brand name'),
    jsonb_build_object('key','website','label','Current Website','type','url','required',false,'section','Business Details','placeholder','https://example.com'),
    jsonb_build_object('key','phone','label','Primary Contact Phone','type','text','required',true,'section','Business Details','placeholder','Include country code'),
    jsonb_build_object('key','country','label','Country / Market','type','text','required',true,'section','Business Details','placeholder','Primary market or country'),
    jsonb_build_object('key','projectGoals','label','Main Project Goals','type','textarea','required',true,'section','Project Direction','placeholder','What should this project achieve for your business?'),
    jsonb_build_object('key','targetAudience','label','Target Audience','type','textarea','required',true,'section','Project Direction','placeholder','Who are the primary customers or users?'),
    jsonb_build_object('key','primaryOffer','label','Primary Offer / Service','type','textarea','required',true,'section','Project Direction','placeholder','What should the website or application help you sell or deliver?'),
    jsonb_build_object('key','requiredFeatures','label','Required Features / Integrations','type','textarea','required',true,'section','Project Direction','placeholder','List must-have functionality, integrations or workflows'),
    jsonb_build_object('key','competitors','label','Competitors / Reference Websites','type','textarea','required',false,'section','Brand & References','placeholder','Share competitors or references you like or dislike'),
    jsonb_build_object('key','designPreferences','label','Design Preferences','type','textarea','required',true,'section','Brand & References','placeholder','Describe the visual direction, style or examples you prefer'),
    jsonb_build_object('key','brandAssetsUrl','label','Brand Assets Link','type','url','required',false,'section','Brand & References','placeholder','Drive/Dropbox/brand folder link'),
    jsonb_build_object('key','contentStatus','label','Content Status','type','select','required',true,'section','Content & Assets','options',jsonb_build_array('Ready','Partially Ready','Need ProFox Copywriting','Not Started')),
    jsonb_build_object('key','assetLinks','label','Content / Asset Links','type','textarea','required',false,'section','Content & Assets','placeholder','Share Drive, Dropbox, image, copy or document links'),
    jsonb_build_object('key','decisionMaker','label','Primary Decision Maker','type','text','required',true,'section','Communication','placeholder','Name and role of the final decision maker'),
    jsonb_build_object('key','communicationPreference','label','Preferred Communication','type','select','required',true,'section','Communication','options',jsonb_build_array('Client Portal','Email','Scheduled Meeting')),
    jsonb_build_object('key','timezone','label','Timezone','type','text','required',true,'section','Communication','placeholder','Example: America/New_York or Europe/London'),
    jsonb_build_object('key','accessNotes','label','Access / Technical Notes','type','textarea','required',false,'section','Access & Technical','placeholder','Domain, hosting, CMS, analytics or other access notes. Do not enter passwords here.')
  )
),now())
on conflict(config_key) do nothing;

insert into public.notification_templates(template_key,name,subject_template,body_template,html_template,active,description,updated_at)
values
('customer_client_onboarding_required','Client onboarding required','Complete your ProFox onboarding - {{projectNumber}}','Hi {{contactFirstName}},\n\nYour first required payment has been verified and your ProFox project has been created.\n\nProject: {{projectNumber}} - {{projectName}}\nPackage: {{packageName}}\n\nBefore delivery moves forward, please complete your secure onboarding form:\n{{onboardingUrl}}\n\nYour registered email remains the identity for this project and future Client Portal access. Do not share this onboarding link.\n\nProFox Web Designer','<!doctype html><html><body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5fb"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:24px 28px;border-bottom:1px solid #eef2f7"><div style="font-size:19px;font-weight:700;color:#000080">ProFox Web Designer</div><div style="margin-top:4px;font-size:11px;font-weight:700;letter-spacing:1.2px;color:#64748b">CLIENT ONBOARDING</div></td></tr><tr><td style="padding:28px"><h1 style="margin:0 0 16px;font-size:22px;line-height:30px">Your project is ready for onboarding</h1><p style="font-size:15px;line-height:24px;color:#334155">Hi {{contactFirstName}},<br><br>Your first required payment has been verified and project <strong>{{projectNumber}}</strong> has been created.<br><br><strong>{{projectName}}</strong><br>{{packageName}}</p><p style="margin:24px 0"><a href="{{onboardingUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Complete Client Onboarding</a></p><p style="font-size:12px;line-height:19px;color:#64748b">Complete the required onboarding before delivery advances. Your registered email remains your ProFox customer identity. Do not share this secure link.</p></td></tr></table></td></tr></table></body></html>',true,'Sent after verified first payment and project creation. Opens the secure no-login onboarding form.',now()),
('customer_client_portal_invitation','Client portal activation','Activate your ProFox Client Portal','Hi {{contactFirstName}},\n\nYour required onboarding is complete. Your ProFox Client Portal is now ready to activate.\n\nActivate using the same verified email registered with your ProFox relationship:\n{{portalActivationUrl}}\n\nCreate your own password after verifying that email. ProFox will never email you a generated password.\n\nProFox Web Designer','<!doctype html><html><body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5fb"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:24px 28px;border-bottom:1px solid #eef2f7"><div style="font-size:19px;font-weight:700;color:#000080">ProFox Web Designer</div><div style="margin-top:4px;font-size:11px;font-weight:700;letter-spacing:1.2px;color:#64748b">CLIENT PORTAL</div></td></tr><tr><td style="padding:28px"><h1 style="margin:0 0 16px;font-size:22px;line-height:30px">Your Client Portal is ready</h1><p style="font-size:15px;line-height:24px;color:#334155">Hi {{contactFirstName}},<br><br>Your required onboarding is complete. Activate your permanent ProFox Client Portal using the same verified email connected to your relationship history.</p><p style="margin:24px 0"><a href="{{portalActivationUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Activate Client Portal</a></p><p style="font-size:12px;line-height:19px;color:#64748b">You will create your own password after email verification. ProFox will never send you a generated password.</p></td></tr></table></td></tr></table></body></html>',true,'Invitation-driven Client Portal activation sent only after mandatory onboarding completion.',now()),
('customer_existing_portal_project_onboarded','Existing portal project onboarding complete','Your new ProFox project is ready in the Client Portal','Hi {{contactFirstName}},\n\nOnboarding for {{projectNumber}} is complete. This project is now connected to your existing ProFox Client Portal.\n\nOpen your portal: {{clientPortalUrl}}\n\nProFox Web Designer','<!doctype html><html><body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5fb"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:28px"><h1 style="margin:0 0 16px;font-size:22px">Your project is connected</h1><p style="font-size:15px;line-height:24px;color:#334155">Hi {{contactFirstName}},<br><br>Onboarding for <strong>{{projectNumber}}</strong> is complete. Your new project is connected to your existing Client Portal.</p><p style="margin:24px 0"><a href="{{clientPortalUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Open Client Portal</a></p></td></tr></table></td></tr></table></body></html>',true,'Used for repeat customers who already have an active linked Client Portal.',now())
on conflict(template_key) do update set name=excluded.name,subject_template=excluded.subject_template,body_template=excluded.body_template,html_template=excluded.html_template,active=true,description=excluded.description,updated_at=now();

create or replace function public.client_onboarding_config()
returns jsonb language sql stable security definer set search_path to 'public','pg_temp' as $function$
  select coalesce((select config_value from public.system_configuration where config_key='client_onboarding_settings'),'{}'::jsonb)
$function$;
revoke all on function public.client_onboarding_config() from public,anon,authenticated;
grant execute on function public.client_onboarding_config() to service_role,postgres;

create or replace function public.ensure_client_onboarding_for_project(p_project_id uuid,p_send_invite boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $function$
declare
  v_project public.projects%rowtype; v_client public.clients%rowtype; v_quote public.quotations%rowtype; v_onboarding public.client_onboardings%rowtype;
  v_identity uuid; v_payment uuid; v_cfg jsonb; v_fields jsonb; v_token text; v_base text; v_url text; v_days integer; v_queued uuid; v_count integer;
begin
  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found.'; end if;
  if v_project.client_id is null or v_project.quotation_id is null then raise exception 'Paid project must be linked to a client and accepted quotation before onboarding.'; end if;
  select * into v_client from public.clients where id=v_project.client_id;
  if not found then raise exception 'Project client not found.'; end if;
  select * into v_quote from public.quotations where id=v_project.quotation_id;
  if not found or v_quote.status<>'Accepted' then raise exception 'Accepted quotation is required before client onboarding.'; end if;
  select p.id into v_payment from public.payments p where p.quotation_id=v_quote.id and p.payment_type in ('Advance','Full Payment') and p.status='Verified' order by coalesce(p.milestone_number,1),p.verified_at,p.created_at limit 1;
  if v_payment is null then raise exception 'Verified first payment is required before client onboarding.'; end if;
  v_identity:=coalesce(v_client.customer_identity_id,v_quote.customer_identity_id,public.customer_identity_resolve(v_client.email,v_client.primary_contact_name,v_client.phone));
  if v_identity is null then raise exception 'Customer identity could not be resolved for onboarding.'; end if;
  v_cfg:=public.client_onboarding_config();
  v_fields:=coalesce(v_cfg->'fields','[]'::jsonb);
  if jsonb_typeof(v_fields)<>'array' or jsonb_array_length(v_fields)=0 then raise exception 'Client onboarding form configuration is empty.'; end if;
  v_days:=greatest(1,least(90,coalesce((v_cfg->>'onboardingLinkExpiryDays')::integer,30)));

  select * into v_onboarding from public.client_onboardings where project_id=v_project.id for update;
  if not found then
    insert into public.client_onboardings(customer_identity_id,client_id,project_id,quotation_id,triggering_payment_id,status,form_version,field_schema)
    values(v_identity,v_client.id,v_project.id,v_quote.id,v_payment,'Pending',greatest(1,coalesce((v_cfg->>'version')::integer,1)),v_fields)
    returning * into v_onboarding;
  else
    update public.client_onboardings set customer_identity_id=v_identity,client_id=v_client.id,quotation_id=v_quote.id,triggering_payment_id=coalesce(triggering_payment_id,v_payment),updated_at=now() where id=v_onboarding.id returning * into v_onboarding;
  end if;

  if p_send_invite and v_onboarding.status<>'Completed' then
    v_token:=encode(extensions.gen_random_bytes(32),'hex');
    v_count:=least(v_onboarding.onboarding_invite_count+1,100);
    update public.client_onboardings set public_token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),public_token_issued_at=now(),public_token_expires_at=now()+make_interval(days=>v_days),onboarding_invite_count=v_count,onboarding_invite_last_sent_at=now(),updated_at=now() where id=v_onboarding.id returning * into v_onboarding;
    select nullif(btrim(config_value->>'url'),'') into v_base from public.system_configuration where config_key='public_app_base_url';
    v_base:=rtrim(coalesce(v_base,'https://www.profoxwebdesigner.com'),'/');
    v_url:=v_base||'/client-onboarding/'||v_token;
    v_queued:=public.service_queue_customer_communication('customer-client-onboarding:'||v_onboarding.id::text||':'||v_count::text,'customer_client_onboarding_required',v_client.email,v_client.salesperson_id,v_client.primary_contact_name,v_client.company_name,jsonb_build_object('onboardingId',v_onboarding.id,'projectId',v_project.id,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'packageName',coalesce(v_project.package_snapshot,''),'onboardingUrl',v_url),now());
  end if;
  return jsonb_build_object('onboardingId',v_onboarding.id,'projectId',v_project.id,'status',v_onboarding.status,'inviteQueued',v_queued is not null,'inviteCount',v_onboarding.onboarding_invite_count);
end;$function$;
revoke all on function public.ensure_client_onboarding_for_project(uuid,boolean) from public,anon,authenticated;
grant execute on function public.ensure_client_onboarding_for_project(uuid,boolean) to service_role,postgres;

create or replace function public.initialize_client_onboarding_after_project_create()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $function$
begin
  perform public.ensure_client_onboarding_for_project(new.id,true);
  return new;
end;$function$;
revoke all on function public.initialize_client_onboarding_after_project_create() from public,anon,authenticated;
grant execute on function public.initialize_client_onboarding_after_project_create() to service_role,postgres;
drop trigger if exists initialize_client_onboarding_after_project_create on public.projects;
create trigger initialize_client_onboarding_after_project_create after insert on public.projects for each row execute function public.initialize_client_onboarding_after_project_create();

create or replace function public.admin_send_client_onboarding(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare v_project public.projects%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_project from public.projects where id=p_project_id;
  if not found then raise exception 'Project not found.'; end if;
  if not public.is_admin() and (v_project.project_manager_id is distinct from auth.uid() or not public.has_active_role(array['project_manager'])) then raise exception 'Only Admin or the assigned active Project Manager may resend client onboarding.'; end if;
  return public.ensure_client_onboarding_for_project(p_project_id,true);
end;$function$;
revoke all on function public.admin_send_client_onboarding(uuid) from public,anon;
grant execute on function public.admin_send_client_onboarding(uuid) to authenticated,service_role,postgres;

create or replace function public.public_client_onboarding_open(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $function$
declare v_hash text; v_o public.client_onboardings%rowtype; v_project public.projects%rowtype; v_client public.clients%rowtype; v_identity public.customer_identities%rowtype;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Onboarding link is invalid.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_o from public.client_onboardings where public_token_hash=v_hash;
  if not found then raise exception 'Onboarding link is invalid or no longer available.'; end if;
  if v_o.public_token_expires_at is not null and v_o.public_token_expires_at<now() then raise exception 'This onboarding link has expired. Please ask ProFox to resend it.'; end if;
  select * into v_project from public.projects where id=v_o.project_id;
  select * into v_client from public.clients where id=v_o.client_id;
  select * into v_identity from public.customer_identities where id=v_o.customer_identity_id;
  return jsonb_build_object('onboardingId',v_o.id,'status',v_o.status,'formVersion',v_o.form_version,'fields',v_o.field_schema,'responses',v_o.responses,'submittedAt',v_o.submitted_at,'completedAt',v_o.completed_at,'expiresAt',v_o.public_token_expires_at,'customer',jsonb_build_object('name',v_client.primary_contact_name,'companyName',v_client.company_name,'email',v_identity.email,'phone',v_client.phone,'country',v_client.country,'website',v_client.website),'project',jsonb_build_object('id',v_project.id,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'packageName',v_project.package_snapshot,'stage',v_project.stage));
end;$function$;
revoke all on function public.public_client_onboarding_open(text) from public;
grant execute on function public.public_client_onboarding_open(text) to anon,authenticated,service_role,postgres;

create or replace function public.public_client_onboarding_save(p_token text,p_responses jsonb,p_submit boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $function$
declare
  v_hash text; v_o public.client_onboardings%rowtype; v_client public.clients%rowtype; v_project public.projects%rowtype; v_identity public.customer_identities%rowtype; v_cfg jsonb;
  v_allowed jsonb:='{}'::jsonb; v_merged jsonb; v_field jsonb; v_key text; v_val jsonb; v_text text; v_options jsonb; v_missing text[]:=array[]::text[];
  v_portal_token text; v_portal_hash text; v_base text; v_next_url text; v_days integer; v_queued uuid; v_portal_count integer;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Onboarding link is invalid.'; end if;
  if p_responses is null or jsonb_typeof(p_responses)<>'object' then raise exception 'Onboarding responses must be an object.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_o from public.client_onboardings where public_token_hash=v_hash for update;
  if not found then raise exception 'Onboarding link is invalid or no longer available.'; end if;
  if v_o.public_token_expires_at is not null and v_o.public_token_expires_at<now() then raise exception 'This onboarding link has expired. Please ask ProFox to resend it.'; end if;
  if v_o.status='Completed' then return jsonb_build_object('onboardingId',v_o.id,'status','Completed','completedAt',v_o.completed_at,'nextUrl',case when exists(select 1 from public.customer_identities i join public.user_profiles u on u.id=i.linked_user_id where i.id=v_o.customer_identity_id and u.role='customer' and u.status='active') then '/client-portal' else null end); end if;

  for v_field in select value from jsonb_array_elements(v_o.field_schema) loop
    v_key:=btrim(coalesce(v_field->>'key',''));
    if v_key<>'' and p_responses ? v_key then
      v_val:=p_responses->v_key;
      if jsonb_typeof(v_val) not in ('string','number','boolean','null') then raise exception 'Invalid value supplied for onboarding field %.',v_key; end if;
      if jsonb_typeof(v_val)='string' and length(v_val#>>'{}')>5000 then raise exception 'Onboarding field % is too long.',v_key; end if;
      v_allowed:=v_allowed||jsonb_build_object(v_key,v_val);
    end if;
  end loop;
  v_merged:=coalesce(v_o.responses,'{}'::jsonb)||v_allowed;

  if p_submit then
    for v_field in select value from jsonb_array_elements(v_o.field_schema) loop
      v_key:=btrim(coalesce(v_field->>'key',''));
      if coalesce((v_field->>'required')::boolean,false) then
        v_text:=btrim(coalesce(v_merged->>v_key,''));
        if v_text='' then v_missing:=array_append(v_missing,coalesce(nullif(v_field->>'label',''),v_key)); end if;
      end if;
      if v_field->>'type'='select' and btrim(coalesce(v_merged->>v_key,''))<>'' then
        v_options:=coalesce(v_field->'options','[]'::jsonb);
        if jsonb_typeof(v_options)='array' and not exists(select 1 from jsonb_array_elements_text(v_options) x where x=v_merged->>v_key) then raise exception 'Choose a valid option for %.',coalesce(nullif(v_field->>'label',''),v_key); end if;
      end if;
    end loop;
    if cardinality(v_missing)>0 then raise exception 'Complete all required onboarding fields: %.',array_to_string(v_missing,', '); end if;
  end if;

  update public.client_onboardings set responses=v_merged,status=case when p_submit then 'Completed' else 'In Progress' end,submitted_at=case when p_submit then coalesce(submitted_at,now()) else submitted_at end,completed_at=case when p_submit then coalesce(completed_at,now()) else completed_at end,updated_at=now() where id=v_o.id returning * into v_o;

  if not p_submit then return jsonb_build_object('onboardingId',v_o.id,'status',v_o.status,'savedAt',v_o.updated_at); end if;

  select * into v_client from public.clients where id=v_o.client_id for update;
  select * into v_project from public.projects where id=v_o.project_id;
  select * into v_identity from public.customer_identities where id=v_o.customer_identity_id for update;
  update public.clients set company_name=coalesce(nullif(btrim(v_merged->>'companyName'),''),company_name),website=coalesce(nullif(btrim(v_merged->>'website'),''),website),phone=coalesce(nullif(btrim(v_merged->>'phone'),''),phone),country=coalesce(nullif(btrim(v_merged->>'country'),''),country),updated_at=now() where id=v_client.id returning * into v_client;
  update public.customer_identities set display_name=coalesce(nullif(btrim(v_client.primary_contact_name),''),display_name),phone=coalesce(nullif(btrim(v_merged->>'phone'),''),phone),last_seen_at=greatest(last_seen_at,now()),updated_at=now() where id=v_identity.id returning * into v_identity;

  select nullif(btrim(config_value->>'url'),'') into v_base from public.system_configuration where config_key='public_app_base_url';
  v_base:=rtrim(coalesce(v_base,'https://www.profoxwebdesigner.com'),'/');
  if v_identity.linked_user_id is not null and exists(select 1 from public.user_profiles u where u.id=v_identity.linked_user_id and u.role='customer' and u.status='active') then
    v_next_url:=v_base||'/client-portal';
    v_portal_count:=least(v_o.portal_invite_count+1,100);
    v_queued:=public.service_queue_customer_communication('customer-existing-portal-project-onboarded:'||v_o.id::text||':'||v_portal_count::text,'customer_existing_portal_project_onboarded',v_identity.email,v_client.salesperson_id,v_client.primary_contact_name,v_client.company_name,jsonb_build_object('projectId',v_project.id,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'clientPortalUrl',v_next_url),now());
    update public.client_onboardings set portal_invite_count=v_portal_count,portal_invite_last_sent_at=case when v_queued is not null then now() else portal_invite_last_sent_at end,updated_at=now() where id=v_o.id;
  else
    v_cfg:=public.client_onboarding_config();
    v_days:=greatest(1,least(30,coalesce((v_cfg->>'portalInviteExpiryDays')::integer,7)));
    v_portal_token:=encode(extensions.gen_random_bytes(32),'hex');
    v_portal_hash:=encode(extensions.digest(v_portal_token,'sha256'),'hex');
    v_next_url:=v_base||'/client-portal?invite='||v_portal_token;
    v_portal_count:=least(v_o.portal_invite_count+1,100);
    update public.client_onboardings set portal_activation_token_hash=v_portal_hash,portal_activation_issued_at=now(),portal_activation_expires_at=now()+make_interval(days=>v_days),portal_activation_claimed_at=null,portal_invite_count=v_portal_count,updated_at=now() where id=v_o.id;
    v_queued:=public.service_queue_customer_communication('customer-client-portal-invitation:'||v_o.id::text||':'||v_portal_count::text,'customer_client_portal_invitation',v_identity.email,v_client.salesperson_id,v_client.primary_contact_name,v_client.company_name,jsonb_build_object('onboardingId',v_o.id,'projectId',v_project.id,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'portalActivationUrl',v_next_url),now());
    update public.client_onboardings set portal_invite_last_sent_at=case when v_queued is not null then now() else portal_invite_last_sent_at end,updated_at=now() where id=v_o.id;
  end if;
  return jsonb_build_object('onboardingId',v_o.id,'status','Completed','completedAt',v_o.completed_at,'portalInvitationQueued',v_queued is not null,'nextUrl',v_next_url);
end;$function$;
revoke all on function public.public_client_onboarding_save(text,jsonb,boolean) from public;
grant execute on function public.public_client_onboarding_save(text,jsonb,boolean) to anon,authenticated,service_role,postgres;

-- Backfill continuity records for already-created paid projects without emailing customers.
do $do$ declare r record; begin
  for r in select p.id from public.projects p where p.client_id is not null and p.quotation_id is not null and exists(select 1 from public.quotations q where q.id=p.quotation_id and q.status='Accepted') and exists(select 1 from public.payments pay where pay.quotation_id=p.quotation_id and pay.payment_type in ('Advance','Full Payment') and pay.status='Verified') and not exists(select 1 from public.client_onboardings o where o.project_id=p.id) loop
    perform public.ensure_client_onboarding_for_project(r.id,false);
  end loop;
end;$do$;
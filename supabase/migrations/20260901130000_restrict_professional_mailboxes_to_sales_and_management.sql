-- Restrict professional Zoho mailboxes to explicit Sales/Management roles only.
-- Delivery roles must never become eligible simply because they are active/onboarded.

create or replace function public.service_professional_mailbox_role_eligible(p_role text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select lower(btrim(coalesce(p_role,''))) = any (
    array[
      'sales',
      'sales_rep',
      'sales_team',
      'admin',
      'project_manager',
      'site_manager'
    ]::text[]
  );
$function$;

create or replace function public.service_professional_mailbox_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
    from public.user_profiles p
    where p.id = p_user_id
      and lower(coalesce(p.status,'')) = 'active'
      and lower(coalesce(p.onboarding_status,'')) = 'completed'
      and public.service_professional_mailbox_role_eligible(p.role)
  );
$function$;

-- Make the employee-facing professional integration status role-aware.
-- Global provider configuration may be enabled, but non-eligible Delivery staff must
-- never see professional Mail as required or provisioning-enabled for their account.
create or replace function public.get_my_professional_integration_status()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile public.user_profiles%rowtype;
  v_account public.staff_professional_accounts%rowtype;
  v_google public.google_calendar_connections%rowtype;
  v_zoho public.zoho_connections%rowtype;
  v_cfg jsonb := '{}'::jsonb;
  v_cal text;
  v_meet text;
  v_mail text;
  v_mailbox_eligible boolean := false;
  v_email_required boolean := false;
  v_mail_provisioning boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_profile
  from public.user_profiles
  where id=v_uid and lower(coalesce(status,''))='active';

  if not found
     or lower(coalesce(v_profile.role,'')) in ('customer','client','pending','talent_partner')
  then
    raise exception 'Active staff access required.';
  end if;

  select coalesce(config_value,'{}'::jsonb) into v_cfg
  from public.system_configuration
  where config_key='professional_integrations';

  select * into v_account from public.staff_professional_accounts where user_id=v_uid;
  select * into v_google from public.google_calendar_connections where user_id=v_uid;
  select * into v_zoho from public.zoho_connections where user_id=v_uid;

  v_mailbox_eligible := public.service_professional_mailbox_eligible(v_uid);
  v_email_required := v_mailbox_eligible
    and coalesce((v_cfg->>'professionalEmailRequired')::boolean,false);
  v_mail_provisioning := v_mailbox_eligible
    and coalesce((v_cfg->>'mailProvisioningEnabled')::boolean,false);

  v_mail := case
    when v_mailbox_eligible then coalesce(v_account.mail_provider,nullif(v_cfg->>'defaultMailProvider',''),'none')
    else coalesce(v_account.mail_provider,'none')
  end;
  v_cal := coalesce(v_account.calendar_provider,nullif(v_cfg->>'defaultCalendarProvider',''),'google');
  v_meet := coalesce(v_account.meeting_provider,nullif(v_cfg->>'defaultMeetingProvider',''),'google_meet');

  return jsonb_build_object(
    'userId',v_uid,
    'professionalMailboxEligible',v_mailbox_eligible,
    'workEmail',coalesce(v_account.work_email,''),
    'mailProvider',v_mail,
    'calendarProvider',v_cal,
    'meetingProvider',v_meet,
    'mailboxStatus',coalesce(v_account.mailbox_status,'not_configured'),
    'professionalEmailRequired',v_email_required,
    'professionalEmailReady',not v_email_required or (
      coalesce(v_account.mailbox_status='active',false)
      and coalesce(length(btrim(v_account.work_email)),0)>0
    ),
    'zohoEnabled',coalesce((v_cfg->>'zohoEnabled')::boolean,false),
    'zohoMailEnabled',coalesce((v_cfg->>'zohoMailEnabled')::boolean,false),
    'zohoCalendarEnabled',coalesce((v_cfg->>'zohoCalendarEnabled')::boolean,false),
    'zohoMeetingEnabled',coalesce((v_cfg->>'zohoMeetingEnabled')::boolean,false),
    'mailProvisioningEnabled',v_mail_provisioning,
    'google',jsonb_build_object(
      'connected',coalesce(v_google.status='connected',false),
      'status',coalesce(v_google.status,'disconnected'),
      'accountEmail',coalesce(v_google.account_email,''),
      'calendarTimezone',coalesce(v_google.calendar_timezone,''),
      'meetReady',coalesce(v_google.status='connected' and v_google.create_meet,false)
    ),
    'zoho',jsonb_build_object(
      'connected',coalesce(v_zoho.status='connected',false),
      'status',coalesce(v_zoho.status,'disconnected'),
      'accountEmail',coalesce(v_zoho.account_email,''),
      'calendarTimezone',coalesce(v_zoho.calendar_timezone,''),
      'meetingReady',coalesce(v_zoho.status='connected' and v_zoho.meeting_ready,false)
    )
  );
end;
$function$;

-- Keep the activation trigger fail-closed when an account changes from an eligible
-- Seller/Manager role to an ineligible Delivery role. We do not delete external Zoho
-- mailboxes automatically; existing external mailboxes are suspended in-app for an
-- administrator to deprovision/reassign deliberately.
create or replace function public.trigger_queue_professional_mailbox_on_staff_activation()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op='INSERT'
     or old.status is distinct from new.status
     or old.onboarding_status is distinct from new.onboarding_status
     or old.role is distinct from new.role
  then
    if public.service_professional_mailbox_eligible(new.id) then
      perform public.queue_professional_mailbox_provisioning(new.id,'staff_activation',null);
    else
      update public.professional_mailbox_provisioning_jobs
      set status='skipped',
          locked_at=null,
          completed_at=now(),
          last_error='Staff role/status is not eligible for professional mailbox provisioning.',
          updated_at=now()
      where user_id=new.id
        and status in ('pending','retry');

      update public.staff_professional_accounts
      set mail_provider=case when work_email is null then 'none' else mail_provider end,
          mailbox_status=case
            when work_email is null then 'not_configured'
            else 'suspended'
          end,
          last_error=case
            when work_email is null then null
            else 'Professional mailbox suspended because this staff role is not eligible. Administrator deprovisioning or reassignment is required.'
          end,
          updated_at=now()
      where user_id=new.id
        and mailbox_status <> 'not_configured';
    end if;
  end if;

  return new;
end;
$function$;

-- Reconcile any pre-existing queued work immediately. No active external mailbox is
-- deleted automatically by this migration.
update public.professional_mailbox_provisioning_jobs j
set status='skipped',
    locked_at=null,
    completed_at=now(),
    last_error='Staff role/status is not eligible for professional mailbox provisioning.',
    updated_at=now()
where j.status in ('pending','retry')
  and not public.service_professional_mailbox_eligible(j.user_id);

update public.staff_professional_accounts a
set mail_provider=case when a.work_email is null then 'none' else a.mail_provider end,
    mailbox_status=case when a.work_email is null then 'not_configured' else 'suspended' end,
    last_error=case
      when a.work_email is null then null
      else 'Professional mailbox suspended because this staff role is not eligible. Administrator deprovisioning or reassignment is required.'
    end,
    updated_at=now()
where not public.service_professional_mailbox_eligible(a.user_id)
  and a.mailbox_status in ('provisioning','active','error');

-- Keep low-level policy helpers server-only. Frontend flows use higher-level RPCs.
revoke all on function public.service_professional_mailbox_role_eligible(text) from public, anon, authenticated;
revoke all on function public.service_professional_mailbox_eligible(uuid) from public, anon, authenticated;
grant execute on function public.service_professional_mailbox_role_eligible(text) to service_role;
grant execute on function public.service_professional_mailbox_eligible(uuid) to service_role;

-- Re-grant the employee-facing status RPC after replacement.
revoke all on function public.get_my_professional_integration_status() from public, anon;
grant execute on function public.get_my_professional_integration_status() to authenticated, service_role;

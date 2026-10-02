alter table public.zoho_service_calendar_connection
  add column if not exists sdk_host_status text not null default 'unknown',
  add column if not exists sdk_host_error text,
  add column if not exists sdk_host_checked_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='zoho_service_calendar_sdk_host_status_check'
      and conrelid='public.zoho_service_calendar_connection'::regclass
  ) then
    alter table public.zoho_service_calendar_connection
      add constraint zoho_service_calendar_sdk_host_status_check
      check (sdk_host_status in ('unknown','ready','avsdk_required','reauthorization_required','error'));
  end if;
end;
$$;

update public.zoho_service_calendar_connection
set scopes = (
      select array_agg(distinct s order by s)
      from unnest(coalesce(scopes,'{}'::text[]) || array['ZohoMeeting.sdk.READ','ZohoMeeting.sdk.CREATE']::text[]) s
    ),
    sdk_host_status='avsdk_required',
    sdk_host_error='Zoho Meeting AVSDK is not enabled. Standard Calendar and Meeting remain connected.',
    sdk_host_checked_at=now(),
    status='connected',
    last_error=null,
    updated_at=now()
where singleton_key='primary';

create or replace function public.get_zoho_service_calendar_status()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','vault','pg_temp'
as $$
declare
  v_user uuid:=auth.uid();
  v_profile public.user_profiles%rowtype;
  v_row public.zoho_service_calendar_connection%rowtype;
  v_cfg jsonb:='{}'::jsonb;
  v_provider_id boolean:=false;
  v_provider_secret boolean:=false;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_profile from public.user_profiles where id=v_user and lower(coalesce(status,''))='active';
  if not found or lower(coalesce(v_profile.role,'')) in ('customer','client','pending','talent_partner') then
    raise exception 'Active staff access required.';
  end if;

  select * into v_row from public.zoho_service_calendar_connection where singleton_key='primary';
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='professional_integrations';
  select exists(select 1 from vault.secrets where name='profox_zoho_client_id') into v_provider_id;
  select exists(select 1 from vault.secrets where name='profox_zoho_client_secret') into v_provider_secret;

  return jsonb_build_object(
    'connected',found and v_row.status='connected',
    'status',coalesce(v_row.status,'disconnected'),
    'accountEmail',coalesce(v_row.account_email,''),
    'calendarId',coalesce(v_row.calendar_id,''),
    'calendarTimezone',coalesce(v_row.calendar_timezone,''),
    'meetingReady',coalesce(v_row.meeting_ready,false),
    'sdkMeetingReady',coalesce(v_row.sdk_host_status,'unknown')='ready',
    'sdkHostStatus',coalesce(v_row.sdk_host_status,'unknown'),
    'sdkHostError',v_row.sdk_host_error,
    'lastAuthAt',v_row.last_auth_at,
    'lastSuccessfulSyncAt',v_row.last_successful_sync_at,
    'lastError',v_row.last_error,
    'calendarEnabled',coalesce((v_cfg->>'zohoCalendarEnabled')::boolean,false),
    'meetingEnabled',coalesce((v_cfg->>'zohoMeetingEnabled')::boolean,false),
    'defaultCalendarProvider',coalesce(nullif(v_cfg->>'defaultCalendarProvider',''),'google'),
    'defaultMeetingProvider',coalesce(nullif(v_cfg->>'defaultMeetingProvider',''),'google_meet'),
    'providerConfigured',v_provider_id and v_provider_secret,
    'managedByProFox',true,
    'sellerAuthorizationRequired',false
  );
end;
$$;

create or replace function public.admin_get_recruitment_interviews(p_applicant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_result jsonb;
begin
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then
    raise exception 'Recruitment management access required.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',ri.id,
        'applicantId',ri.applicant_id,
        'stage',ri.stage,
        'meetingId',m.id,
        'interviewerId',ri.interviewer_id,
        'interviewerName',u.full_name,
        'interviewType',ri.interview_type,
        'startAt',m.start_at,
        'endAt',m.end_at,
        'timezone',m.timezone,
        'meetingUrl',
          case
            when (public.is_admin() or ri.interviewer_id=auth.uid())
              and coalesce(mpl.host_url,'') ~* '^https://'
              and coalesce(mpl.host_url,'') ilike '%/statelessStart%'
              and coalesce(mpl.host_url,'') ~* '[?&]signature='
              then mpl.host_url
            when coalesce(mpl.join_url,'') ~* '^https://'
              then mpl.join_url
            when coalesce(m.meeting_url,'') ~* '^https://'
              then m.meeting_url
            else ''
          end,
        'meetingLaunchRole',
          case
            when (public.is_admin() or ri.interviewer_id=auth.uid())
              and coalesce(mpl.host_url,'') ~* '^https://'
              and coalesce(mpl.host_url,'') ilike '%/statelessStart%'
              and coalesce(mpl.host_url,'') ~* '[?&]signature='
              then 'host'
            else 'participant'
          end,
        'hostLaunchReady',
          case
            when (public.is_admin() or ri.interviewer_id=auth.uid())
              and coalesce(mpl.host_url,'') ~* '^https://'
              and coalesce(mpl.host_url,'') ilike '%/statelessStart%'
              and coalesce(mpl.host_url,'') ~* '[?&]signature='
              then true
            else false
          end,
        'hostLaunchStatus',coalesce(zc.sdk_host_status,'unknown'),
        'hostLaunchMessage',zc.sdk_host_error,
        'status',m.status,
        'outcomeNotes',ri.outcome_notes,
        'createdAt',ri.created_at,
        'updatedAt',ri.updated_at
      )
      order by m.start_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.recruitment_interviews ri
  join public.sales_meetings m on m.id=ri.meeting_id
  left join public.user_profiles u on u.id=ri.interviewer_id
  left join public.meeting_provider_private_links mpl
    on mpl.meeting_id=m.id and mpl.provider='zoho_meeting'
  left join public.zoho_service_calendar_connection zc
    on zc.singleton_key='primary'
  where ri.applicant_id=p_applicant_id;

  return v_result;
end;
$$;
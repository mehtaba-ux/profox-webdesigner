create or replace function public.admin_get_sales_account_setup_status(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required.'; end if;

  select jsonb_build_object(
    'userId',p.id,'profilePhotoReady',coalesce(length(btrim(p.avatar_url)),0)>0,'timezoneReady',coalesce(length(btrim(p.timezone)),0)>0,
    'professionalEmailRequired',coalesce((cfg.config_value->>'professionalEmailRequired')::boolean,false),
    'professionalEmailReady',coalesce((cfg.config_value->>'professionalEmailRequired')::boolean,false) is false or (coalesce(sp.mailbox_status='active',false) and coalesce(length(btrim(sp.work_email)),0)>0),
    'workEmail',coalesce(sp.work_email,''),'mailProvider',coalesce(sp.mail_provider,cfg.config_value->>'defaultMailProvider','none'),
    'calendarProvider',coalesce(sp.calendar_provider,cfg.config_value->>'defaultCalendarProvider','google'),'meetingProvider',coalesce(sp.meeting_provider,cfg.config_value->>'defaultMeetingProvider','google_meet'),
    'googleCalendarConnected',coalesce(g.status='connected',false),'googleMeetReady',coalesce(g.status='connected' and g.create_meet,false),
    'zohoCalendarConnected',coalesce(z.status='connected',false),'zohoMeetingReady',coalesce(z.status='connected' and z.meeting_ready,false),
    'availabilityReady',coalesce(c.active,false) and coalesce(array_length(c.working_days,1),0)>0 and c.work_start is not null and c.work_end is not null and c.work_end>c.work_start,
    'crmTourStep',coalesce(s.crm_tour_step,0),'crmTourCompleted',coalesce(s.crm_tour_completed_at is not null,false),'setupCompleted',coalesce(s.completed_at is not null,false),'completedAt',s.completed_at
  ) into v_result
  from public.user_profiles p
  left join public.staff_professional_accounts sp on sp.user_id=p.id
  left join public.google_calendar_connections g on g.user_id=p.id
  left join public.zoho_connections z on z.user_id=p.id
  left join public.user_calendar_settings c on c.user_id=p.id
  left join public.sales_account_setup_state s on s.user_id=p.id
  left join public.system_configuration cfg on cfg.config_key='professional_integrations'
  where p.id=p_user_id;

  if v_result is null then raise exception 'Sales profile not found.'; end if;
  return v_result;
end;
$function$;

revoke all on function public.admin_get_sales_account_setup_status(uuid) from public, anon;
grant execute on function public.admin_get_sales_account_setup_status(uuid) to authenticated, service_role, postgres;

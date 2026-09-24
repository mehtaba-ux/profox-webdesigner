revoke all on function public.crm_protect_activity_execution_fields() from public, anon, authenticated, service_role;
grant execute on function public.crm_protect_activity_execution_fields() to postgres;

revoke all on function public.crm_adjust_activity_due(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_adjust_activity_due(uuid, timestamptz) to postgres, service_role;

revoke all on function public.crm_can_manage_activity(uuid) from public, anon, authenticated;
grant execute on function public.crm_can_manage_activity(uuid) to postgres, service_role;

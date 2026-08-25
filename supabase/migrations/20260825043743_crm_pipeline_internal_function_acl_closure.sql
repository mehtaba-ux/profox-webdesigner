-- CRM pipeline internal-function ACL closure.
-- These functions are internal trigger/helpers and must not be callable through PostgREST.

revoke all on function public.crm_audit_opportunity_change() from public, anon, authenticated, service_role;
grant execute on function public.crm_audit_opportunity_change() to postgres;

revoke all on function public.crm_audit_payment_timeline() from public, anon, authenticated, service_role;
grant execute on function public.crm_audit_payment_timeline() to postgres;

revoke all on function public.crm_audit_quotation_timeline() from public, anon, authenticated, service_role;
grant execute on function public.crm_audit_quotation_timeline() to postgres;

revoke all on function public.crm_process_automation_event() from public, anon, authenticated, service_role;
grant execute on function public.crm_process_automation_event() to postgres;

revoke all on function public.crm_automation_is_manually_stopped(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.crm_automation_is_manually_stopped(uuid, text) to postgres;

revoke all on function public.crm_automation_stop_condition_met(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.crm_automation_stop_condition_met(uuid, uuid, jsonb) to postgres;

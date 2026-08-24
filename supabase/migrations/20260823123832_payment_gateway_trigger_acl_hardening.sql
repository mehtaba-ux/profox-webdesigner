revoke all on function public.activate_project_payment_milestone() from public, anon, authenticated;
revoke all on function public.snapshot_quotation_payment_schedule_before_send() from public, anon, authenticated;
grant execute on function public.activate_project_payment_milestone() to service_role;
grant execute on function public.snapshot_quotation_payment_schedule_before_send() to service_role;
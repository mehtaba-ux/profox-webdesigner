-- Part 10B privilege hardening.
-- Sellers/Admins receive final-Send readiness and blockers through the existing
-- get_quotation_cpq_summary / reconciliation contract. The invariant assertion
-- itself is an internal server primitive used by the protected Sent transition.

revoke all on function public.crm_assert_quotation_send_ready(uuid) from public, anon, authenticated;
grant execute on function public.crm_assert_quotation_send_ready(uuid) to service_role;

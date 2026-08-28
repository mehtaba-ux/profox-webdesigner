-- Explicitly separate the public contact surface from authenticated management RPCs.
-- Internal role checks already reject unauthorized callers; these grants minimize the exposed API surface too.

revoke all on function public.crm_admin_get_contact_lead_configuration() from public,anon;
revoke all on function public.crm_admin_save_contact_lead_configuration(jsonb,jsonb) from public,anon;
revoke all on function public.crm_get_lead_assignment_status() from public,anon;
revoke all on function public.crm_bulk_assign_leads(uuid[],uuid) from public,anon;
revoke all on function public.crm_distribute_leads_round_robin(uuid[]) from public,anon;
revoke all on function public.crm_can_manage_lead_assignment() from public,anon;

grant execute on function public.crm_admin_get_contact_lead_configuration() to authenticated;
grant execute on function public.crm_admin_save_contact_lead_configuration(jsonb,jsonb) to authenticated;
grant execute on function public.crm_get_lead_assignment_status() to authenticated;
grant execute on function public.crm_bulk_assign_leads(uuid[],uuid) to authenticated;
grant execute on function public.crm_distribute_leads_round_robin(uuid[]) to authenticated;
grant execute on function public.crm_can_manage_lead_assignment() to authenticated;

-- These are intentionally public: one serves the form definition and one accepts the public enquiry.
revoke all on function public.get_public_contact_form_configuration() from public;
revoke all on function public.submit_public_crm_lead(jsonb) from public;
grant execute on function public.get_public_contact_form_configuration() to anon,authenticated;
grant execute on function public.submit_public_crm_lead(jsonb) to anon,authenticated;

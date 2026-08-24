-- PF-SOP-07 Content internal privilege hardening.
-- Public application submission remains intentionally anonymous; internal trigger/helper
-- functions are not RPC endpoints. RLS helper functions remain authenticated because
-- authenticated policies call them as the querying role.

-- RLS helpers: authenticated only, never anonymous/public.
revoke all on function public.content_recruitment_manager() from public,anon;
grant execute on function public.content_recruitment_manager() to authenticated;
revoke all on function public.can_manage_content_applicant(uuid) from public,anon;
grant execute on function public.can_manage_content_applicant(uuid) to authenticated;

-- Internal Academy/recruitment helpers are reached only from protected SECURITY DEFINER
-- workflows or triggers, never directly by the browser.
revoke all on function public.content_academy_required_complete(uuid,boolean) from public,anon,authenticated;
revoke all on function public.recruitment_job_for_applicant(uuid) from public,anon,authenticated;
revoke all on function public.recruitment_next_stage_for_applicant(uuid) from public,anon,authenticated;

-- Trigger functions must not be callable as Supabase RPC endpoints.
revoke all on function public.content_delivery_notify_event() from public,anon,authenticated;
revoke all on function public.protect_content_project_handoff() from public,anon,authenticated;
revoke all on function public.sync_content_writer_training_stage() from public,anon,authenticated;
revoke all on function public.trigger_initialize_content_project_task() from public,anon,authenticated;
revoke all on function public.trigger_initialize_project_content_delivery() from public,anon,authenticated;

-- The public application endpoint is intentionally the only anonymous Content recruitment
-- mutation. Keep its contract explicit rather than inheriting PUBLIC execution.
revoke all on function public.submit_public_content_writer_application(jsonb) from public;
grant execute on function public.submit_public_content_writer_application(jsonb) to anon,authenticated;

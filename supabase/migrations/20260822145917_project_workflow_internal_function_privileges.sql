-- Internal project workflow trigger functions must never be callable as public RPCs.
-- Triggers and owner/service-role execution continue to work; authenticated app users use protected public RPCs instead.

REVOKE ALL ON FUNCTION public.notify_seller_project_handover_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_project_completion_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_project_stage_workflow() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_project_tasks_after_stage_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_project_manager_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_project_team_from_task_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_project_manager_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_project_task_assignee() FROM PUBLIC, anon, authenticated;

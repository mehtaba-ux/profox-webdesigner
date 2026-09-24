-- Seller policy notification functions are trigger-only helpers and must not be callable as API RPCs.
-- Trigger/owner/service execution remains available; no public or authenticated direct execution is required.

REVOKE ALL ON FUNCTION public.notify_sales_policy_module_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_sales_policy_lesson_update() FROM PUBLIC, anon, authenticated;

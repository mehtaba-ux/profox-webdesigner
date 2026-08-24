-- UI/UX runtime compatibility cleanup prep.
-- Remove both temporary compatibility triggers created during production-safe notification-template migration ordering.
-- Canonical notification validation/copy-standard triggers remain untouched.

drop trigger if exists aaa_uiux_notification_template_compatibility_map on public.notification_templates;
drop trigger if exists trg_uiux_notification_template_compatibility_map on public.notification_templates;
drop function if exists public.uiux_notification_template_compatibility_map();

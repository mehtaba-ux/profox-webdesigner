-- UI/UX notification compatibility must run before the canonical notification-template
-- validation/copy triggers while the transitional UI/UX migrations are executing.
-- PostgreSQL fires triggers with the same timing/event alphabetically by trigger name.
-- Keep canonical validators intact; only move the temporary mapper ahead of them.

drop trigger if exists trg_uiux_notification_template_compatibility_map on public.notification_templates;
drop trigger if exists aaa_uiux_notification_template_compatibility_map on public.notification_templates;

create trigger aaa_uiux_notification_template_compatibility_map
before insert or update on public.notification_templates
for each row execute function public.uiux_notification_template_compatibility_map();

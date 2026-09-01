-- Keep the communication-access audit trail append-only for application roles.
-- Trigger functions run as the database owner and remain able to record events.

revoke all on table public.internal_chat_access_audit from service_role;
grant select on table public.internal_chat_access_audit to service_role;

revoke all on function public.internal_chat_record_access_audit(
  text, uuid, uuid, text, uuid, uuid, uuid, jsonb
) from service_role;

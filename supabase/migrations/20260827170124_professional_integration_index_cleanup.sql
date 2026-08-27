-- Remove the duplicate provider/thread index introduced by the integration hardening migration.
drop index if exists public.idx_client_email_messages_thread_lookup;

-- Cover the employee FK used by inbox/provider workflows.
create index if not exists client_email_messages_employee_user_id_idx
  on public.client_email_messages(employee_user_id);

-- Cover audit/config actor FKs used by the integration health/configuration path.
create index if not exists configuration_audit_log_changed_by_idx
  on public.configuration_audit_log(changed_by);
create index if not exists system_configuration_updated_by_idx
  on public.system_configuration(updated_by);

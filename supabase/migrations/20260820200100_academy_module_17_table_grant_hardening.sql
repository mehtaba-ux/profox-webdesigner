-- Module 17 — explicit table privilege allowlist.
-- RLS does not protect TRUNCATE, so authenticated must not inherit broad default table privileges.

revoke all on public.crm_training_state from anon, authenticated;
grant select on public.crm_training_state to authenticated;

revoke all on public.crm_training_missions from anon, authenticated;
grant select, insert, update, delete on public.crm_training_missions to authenticated;

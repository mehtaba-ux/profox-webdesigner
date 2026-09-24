-- Ensure Approved and Paid commissions always retain explicit administrator
-- approval evidence, including rows inserted by future privileged workflows.

alter table public.commission_entries
  drop constraint if exists commission_entries_approval_evidence_check;

alter table public.commission_entries
  add constraint commission_entries_approval_evidence_check
  check (
    status not in ('Approved','Paid')
    or (approved_at is not null and approved_by is not null)
  ) not valid;

alter table public.commission_entries
  validate constraint commission_entries_approval_evidence_check;


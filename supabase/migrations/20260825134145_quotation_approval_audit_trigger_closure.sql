drop trigger if exists trg_audit_quotation_approval_center on public.quotations;
create trigger trg_audit_quotation_approval_center
after update on public.quotations
for each row execute function public.audit_quotation_approval_center();
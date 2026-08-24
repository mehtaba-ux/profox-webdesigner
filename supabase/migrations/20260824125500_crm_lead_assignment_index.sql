-- Cover the lead assignment audit foreign key used by ownership/history views.
create index if not exists idx_crm_leads_assigned_by
  on public.crm_leads(assigned_by)
  where assigned_by is not null;

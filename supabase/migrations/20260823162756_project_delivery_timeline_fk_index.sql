-- Index the Admin duration-override audit foreign key for delete/set-null and lookup efficiency.
create index if not exists idx_quotations_duration_override_by
on public.quotations(duration_override_by)
where duration_override_by is not null;

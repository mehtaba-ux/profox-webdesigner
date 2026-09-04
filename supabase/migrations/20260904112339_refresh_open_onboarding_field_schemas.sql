update public.client_onboardings o
set field_schema = public.client_onboarding_resolve_fields(o.quotation_id),
    form_version = greatest(coalesce(o.form_version, 1), 3),
    updated_at = now()
where o.status <> 'Completed'
  and o.quotation_id is not null
  and o.field_schema is distinct from public.client_onboarding_resolve_fields(o.quotation_id);

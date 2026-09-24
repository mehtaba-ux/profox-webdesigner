create index if not exists idx_crm_activities_last_rescheduled_by
  on public.crm_activities(last_rescheduled_by)
  where last_rescheduled_by is not null;

create index if not exists idx_crm_activities_next_activity_id
  on public.crm_activities(next_activity_id)
  where next_activity_id is not null;

create index if not exists idx_crm_activity_plan_enrollments_created_by
  on public.crm_activity_plan_enrollments(created_by)
  where created_by is not null;

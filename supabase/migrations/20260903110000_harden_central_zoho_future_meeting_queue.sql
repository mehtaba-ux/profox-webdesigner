create or replace function public.service_queue_existing_unsynced_meetings_for_central_zoho()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  inserted_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.';
  end if;

  if not public.service_central_zoho_ready() then
    return 0;
  end if;

  insert into public.zoho_calendar_sync_jobs (
    user_id,
    meeting_id,
    job_type,
    status,
    attempts,
    max_attempts,
    calendar_provider_generation,
    payload,
    scheduled_for,
    next_attempt_at
  )
  select
    m.sales_rep_id,
    m.id,
    'upsert',
    'pending',
    0,
    6,
    greatest(public.service_calendar_provider_generation(), 1),
    jsonb_build_object(
      'source', 'central-zoho-activation',
      'meetingId', m.id,
      'calendarProvider', 'zoho',
      'meetingProvider', 'zoho_meeting',
      'providerGeneration', greatest(public.service_calendar_provider_generation(), 1),
      'queuedAt', now()
    ),
    now(),
    now()
  from public.sales_meetings m
  where m.status in ('Scheduled', 'Rescheduled')
    and m.start_at > now()
    and not exists (
      select 1 from public.google_calendar_event_links g where g.meeting_id = m.id
    )
    and not exists (
      select 1 from public.zoho_calendar_event_links z where z.meeting_id = m.id
    )
    and not exists (
      select 1
      from public.zoho_calendar_sync_jobs j
      where j.meeting_id = m.id
        and j.status in ('pending', 'processing', 'retry')
        and coalesce(j.calendar_provider_generation, 0) = greatest(public.service_calendar_provider_generation(), 1)
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$function$;

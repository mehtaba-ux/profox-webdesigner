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

create or replace function public.service_claim_zoho_sync_jobs(p_limit integer default 20)
returns setof public.zoho_calendar_sync_jobs
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.zoho_calendar_sync_jobs
  set status = 'retry',
      next_attempt_at = now(),
      locked_at = null,
      updated_at = now()
  where status = 'processing'
    and locked_at < now() - interval '10 minutes';

  update public.zoho_calendar_sync_jobs j
  set status = 'skipped',
      last_error = 'Skipped because the scheduled meeting start time is already in the past.',
      locked_at = null,
      completed_at = now(),
      updated_at = now()
  where j.status in ('pending', 'retry')
    and j.job_type <> 'delete_event'
    and exists (
      select 1
      from public.sales_meetings m
      where m.id = j.meeting_id
        and m.status in ('Scheduled', 'Rescheduled')
        and m.start_at <= now()
    );

  update public.zoho_calendar_sync_jobs j
  set status = 'skipped',
      last_error = 'Skipped because this ProFox meeting is not assigned to the active Zoho service.',
      locked_at = null,
      completed_at = now(),
      updated_at = now()
  where j.status in ('pending', 'retry')
    and (
      j.calendar_provider_generation <> public.service_effective_calendar_provider_generation(j.user_id)
      or (j.meeting_id is not null and public.service_meeting_external_provider(j.meeting_id) <> 'zoho')
      or (
        not public.service_central_zoho_ready()
        and (
          public.service_effective_calendar_provider(j.user_id) <> 'zoho'
          or not exists (
            select 1
            from public.zoho_connections c
            where c.user_id = j.user_id
              and c.status = 'connected'
          )
        )
      )
    );

  return query
  with picked as (
    select j.id
    from public.zoho_calendar_sync_jobs j
    where j.status in ('pending', 'retry')
      and j.next_attempt_at <= now()
      and j.calendar_provider_generation = public.service_effective_calendar_provider_generation(j.user_id)
      and not (
        j.job_type <> 'delete_event'
        and exists (
          select 1
          from public.sales_meetings m
          where m.id = j.meeting_id
            and m.status in ('Scheduled', 'Rescheduled')
            and m.start_at <= now()
        )
      )
      and (
        (
          public.service_central_zoho_ready()
          and j.meeting_id is not null
          and public.service_meeting_external_provider(j.meeting_id) = 'zoho'
        )
        or (
          not public.service_central_zoho_ready()
          and public.service_effective_calendar_provider(j.user_id) = 'zoho'
          and exists (
            select 1
            from public.zoho_connections c
            where c.user_id = j.user_id
              and c.status = 'connected'
          )
        )
      )
    order by j.next_attempt_at, j.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  )
  update public.zoho_calendar_sync_jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from picked p
  where j.id = p.id
  returning j.*;
end;
$function$;

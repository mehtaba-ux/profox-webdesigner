create or replace function public.service_finish_google_sync_job(p_job_id bigint, p_status text, p_error text default null::text, p_retry_seconds integer default null::integer)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_job public.google_calendar_sync_jobs%rowtype;
  v_final_status text;
begin
  if p_status not in('succeeded','retry','reconnect_required','failed','skipped','dead_letter') then raise exception 'Invalid sync job result.'; end if;
  select * into v_job from public.google_calendar_sync_jobs where id=p_job_id for update;
  if not found then return; end if;

  v_final_status:=p_status;
  if p_status='failed' then
    if public.service_effective_calendar_provider(v_job.user_id)<>'google'
       or v_job.calendar_provider_generation<>public.service_effective_calendar_provider_generation(v_job.user_id)
       or not exists(select 1 from public.google_calendar_connections c where c.user_id=v_job.user_id and c.status='connected' and c.sync_enabled is true)
    then
      v_final_status:='skipped';
    else
      v_final_status:='dead_letter';
    end if;
  end if;

  update public.google_calendar_sync_jobs set
    status=v_final_status,
    last_error=case when v_final_status='succeeded' then null else left(coalesce(p_error,''),2000) end,
    locked_at=null,
    next_attempt_at=case when v_final_status='retry' then now()+make_interval(secs=>least(greatest(coalesce(p_retry_seconds,60),5),21600)) else next_attempt_at end,
    completed_at=case when v_final_status in('succeeded','reconnect_required','failed','skipped','dead_letter') then now() else null end,
    updated_at=now()
  where id=p_job_id;

  if v_job.meeting_id is not null then
    update public.sales_meetings set
      sync_status=case when v_final_status='succeeded' then 'Synced' when v_final_status='retry' then 'Pending' when v_final_status='skipped' then 'Not Connected' else 'Error' end,
      sync_error=case when v_final_status in('succeeded','skipped') then null else left(coalesce(p_error,''),2000) end
    where id=v_job.meeting_id;
  end if;
end;
$function$;
revoke all on function public.service_finish_google_sync_job(bigint,text,text,integer) from public, anon, authenticated;
grant execute on function public.service_finish_google_sync_job(bigint,text,text,integer) to service_role, postgres;

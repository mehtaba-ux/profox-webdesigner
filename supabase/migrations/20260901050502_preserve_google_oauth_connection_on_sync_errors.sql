-- A failed sync is operational health, not proof that the seller's OAuth grant
-- was removed. Only an explicit disconnect or an authentication/permission
-- response may take the account out of the connected onboarding state.

create or replace function public.service_mark_google_connection_state(
  p_user_id uuid,
  p_status text,
  p_error text default null,
  p_success boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_status text;
begin
  if p_status not in ('connected','reconnect_required','disconnected','error') then
    raise exception 'Invalid connection state.';
  end if;

  -- Legacy workers used `error` for ordinary sync failures. Preserve the
  -- durable OAuth connection while retaining the error in health metadata.
  v_status := case when p_status='error' then 'connected' else p_status end;

  update public.google_calendar_connections
  set status=v_status,
      last_attempt_at=now(),
      last_successful_sync_at=case when coalesce(p_success,false) then now() else last_successful_sync_at end,
      last_error=case when v_status='connected' and coalesce(p_success,false) then null else left(coalesce(p_error,''),2000) end,
      disconnected_at=case when v_status='disconnected' then now() else disconnected_at end,
      updated_at=now()
  where user_id=p_user_id;
end;
$function$;

-- Repair sellers who previously completed OAuth but were incorrectly moved to
-- `error` by a non-authentication sync failure. Their Vault token remains the
-- evidence that a connection was established; revoked tokens will be moved to
-- reconnect_required by the worker on its next authenticated attempt.
update public.google_calendar_connections
set status='connected', updated_at=now()
where status='error'
  and refresh_secret_id is not null
  and disconnected_at is null;

revoke all on function public.service_mark_google_connection_state(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.service_mark_google_connection_state(uuid,text,text,boolean) to service_role,postgres;

-- The retained Sales test identity had a historical pre-OAuth error record.
-- Reset it through the canonical disconnect helper so the now-active seller
-- can test ProFox booking immediately and connect Google afresh if desired.

do $do$
declare v_sales_id uuid;
begin
  select id into v_sales_id
  from public.user_profiles
  where lower(email)='sales.demo@profoxwebdesigner.test'
    and role='sales' and status='active';
  if v_sales_id is null then raise exception 'Active Sales test profile was not found.'; end if;

  if exists(
    select 1 from public.google_calendar_connections
    where user_id=v_sales_id and status in ('error','reconnect_required')
  ) then
    perform public.service_disconnect_google_calendar(v_sales_id);
  end if;
end;
$do$;

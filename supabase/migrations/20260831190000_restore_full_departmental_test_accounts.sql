-- Restore the four retained departmental test identities to the same active
-- production role behavior they had before launch hardening. This is an
-- explicit operating choice: these sessions can read and mutate live data.

do $do$
declare v_count integer;
begin
  select count(*) into v_count
  from public.user_profiles
  where lower(email) in (
    'sales.demo@profoxwebdesigner.test',
    'content.demo@profoxwebdesigner.test',
    'designer.demo@profoxwebdesigner.test',
    'developer.demo@profoxwebdesigner.test'
  )
    and role in ('sales','content_writer','uiux_designer','developer')
    and onboarding_status='completed'
    and onboarding_progress=100;
  if v_count <> 4 then
    raise exception 'Expected four completed retained departmental test profiles; found %.',v_count;
  end if;
end;
$do$;

select set_config('profox.sales_candidate_invite_rpc','1',true);
select set_config('profox.sales_activation_rpc','1',true);
update public.user_profiles
set status='active',updated_at=now()
where lower(email) in (
  'sales.demo@profoxwebdesigner.test',
  'content.demo@profoxwebdesigner.test',
  'designer.demo@profoxwebdesigner.test',
  'developer.demo@profoxwebdesigner.test'
)
  and role in ('sales','content_writer','uiux_designer','developer')
  and onboarding_status='completed'
  and onboarding_progress=100;
select set_config('profox.sales_candidate_invite_rpc','',true);
select set_config('profox.sales_activation_rpc','',true);

do $booking$
declare v_sales_id uuid;
begin
  select id into v_sales_id
  from public.user_profiles
  where lower(email)='sales.demo@profoxwebdesigner.test'
    and role='sales' and status='active' and onboarding_status='completed';
  if v_sales_id is null then raise exception 'Active Sales test profile was not found.'; end if;

  perform public.service_ensure_sales_public_booking_profile(v_sales_id);

  if not exists(
    select 1 from public.user_calendar_settings
    where user_id=v_sales_id and active is true
      and coalesce(array_length(working_days,1),0)>0
      and work_start is not null and work_end is not null and work_end>work_start
  ) then
    raise exception 'Sales test profile needs valid active availability before public booking can be enabled.';
  end if;

  update public.public_booking_profiles
  set is_public=true,accepting_bookings=true,updated_at=now()
  where salesperson_id=v_sales_id;
end;
$booking$;

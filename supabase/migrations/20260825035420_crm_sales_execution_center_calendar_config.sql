create or replace function public.crm_adjust_activity_due(p_owner uuid,p_requested timestamptz)
returns timestamptz language plpgsql stable security definer set search_path='public','pg_temp' as $$
declare
  v_due timestamptz:=p_requested;
  v_tz text:='UTC';
  v_local timestamp;
  v_cfg jsonb;
  v_start time:=time '09:00';
  v_end time:=time '17:30';
  v_weekdays int[]:=array[1,2,3,4,5];
  v_day int;
  v_attempt int:=0;
begin
  if v_due is null then raise exception 'Due date is required.'; end if;
  select config_value into v_cfg from public.system_configuration where config_key='crm_activity_execution_settings';
  begin
    if nullif(v_cfg#>>'{workingHours,start}','') is not null then v_start:=(v_cfg#>>'{workingHours,start}')::time; end if;
    if nullif(v_cfg#>>'{workingHours,end}','') is not null then v_end:=(v_cfg#>>'{workingHours,end}')::time; end if;
    select coalesce(array_agg(value::int order by ord),array[1,2,3,4,5]) into v_weekdays
    from jsonb_array_elements_text(coalesce(v_cfg#>'{workingHours,weekdays}','[1,2,3,4,5]'::jsonb)) with ordinality d(value,ord)
    where value ~ '^[1-7]$';
  exception when others then
    v_start:=time '09:00'; v_end:=time '17:30'; v_weekdays:=array[1,2,3,4,5];
  end;
  if v_end<=v_start then raise exception 'Configured working-hour end must be later than start.'; end if;
  if coalesce(array_length(v_weekdays,1),0)=0 then raise exception 'At least one working weekday must be configured.'; end if;

  select coalesce(nullif(timezone,''),'UTC') into v_tz from public.user_profiles where id=p_owner;
  if v_tz is null then v_tz:='UTC'; end if;
  begin perform now() at time zone v_tz; exception when others then v_tz:='UTC'; end;

  loop
    v_local:=v_due at time zone v_tz;
    v_day:=extract(isodow from v_local)::int;
    if not (v_day=any(v_weekdays)) then
      loop
        v_local:=(v_local::date+1)+v_start;
        v_day:=extract(isodow from v_local)::int;
        exit when v_day=any(v_weekdays);
      end loop;
      v_due:=v_local at time zone v_tz;
    elsif v_local::time < v_start then
      v_due:=(v_local::date+v_start) at time zone v_tz;
    elsif v_local::time > v_end then
      loop
        v_local:=(v_local::date+1)+v_start;
        v_day:=extract(isodow from v_local)::int;
        exit when v_day=any(v_weekdays);
      end loop;
      v_due:=v_local at time zone v_tz;
    end if;

    exit when not exists(
      select 1 from public.sales_meetings m
      where m.salesperson_id=p_owner and m.status in ('Scheduled','Rescheduled')
        and tstzrange(m.start_at,m.end_at,'[)') && tstzrange(v_due,v_due+interval '30 minutes','[)')
    ) and not exists(
      select 1 from public.booking_availability_blocks b
      where b.user_id=p_owner
        and tstzrange(b.start_at,b.end_at,'[)') && tstzrange(v_due,v_due+interval '30 minutes','[)')
    );
    v_due:=v_due+interval '30 minutes';
    v_attempt:=v_attempt+1;
    if v_attempt>=24 then exit; end if;
  end loop;
  return v_due;
end $$;

revoke execute on function public.crm_adjust_activity_due(uuid,timestamptz) from public, anon;
grant execute on function public.crm_adjust_activity_due(uuid,timestamptz) to authenticated;

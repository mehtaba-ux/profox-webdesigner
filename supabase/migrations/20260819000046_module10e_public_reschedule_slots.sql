-- Module 10E — Privacy-safe slot discovery for an existing public booking.
-- The current meeting is excluded so moving the booking does not hide otherwise valid nearby slots.

CREATE OR REPLACE FUNCTION public.get_public_reschedule_slots(
  p_token uuid,
  p_from_date date DEFAULT NULL,
  p_days integer DEFAULT 14
)
RETURNS TABLE(start_at timestamptz,end_at timestamptz,timezone text,duration_minutes integer)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.public_booking_submissions%ROWTYPE;
  v_meeting public.sales_meetings%ROWTYPE;
  v_timezone text;
  v_working_days integer[];
  v_work_start time;
  v_work_end time;
  v_duration integer;
  v_slot_interval integer;
  v_max_advance integer;
  v_today date;
  v_start_date date;
  v_end_date date;
  v_days integer;
BEGIN
  IF p_token IS NULL THEN RETURN; END IF;
  SELECT * INTO v_booking FROM public.public_booking_submissions WHERE management_token=p_token;
  IF NOT FOUND OR v_booking.management_token_expires_at<=now() OR v_booking.status<>'Confirmed' THEN RETURN; END IF;
  SELECT * INTO v_meeting FROM public.sales_meetings WHERE id=v_booking.meeting_id;
  IF NOT FOUND OR v_meeting.status NOT IN ('Scheduled','Rescheduled') THEN RETURN; END IF;

  SELECT c.timezone,c.working_days,c.work_start,c.work_end,
    round(extract(epoch FROM (v_meeting.end_at-v_meeting.start_at))/60.0)::integer,
    LEAST(GREATEST(COALESCE((pbs.config_value->>'slotIntervalMinutes')::integer,15),5),120),
    LEAST(GREATEST(COALESCE((pbs.config_value->>'maxAdvanceDays')::integer,60),1),365)
  INTO v_timezone,v_working_days,v_work_start,v_work_end,v_duration,v_slot_interval,v_max_advance
  FROM public.user_calendar_settings c
  LEFT JOIN public.system_configuration pbs ON pbs.config_key='public_booking_settings'
  WHERE c.user_id=v_booking.salesperson_id AND c.active IS TRUE;
  IF NOT FOUND THEN RETURN; END IF;

  v_days:=LEAST(GREATEST(COALESCE(p_days,14),1),31);
  v_today:=(now() AT TIME ZONE v_timezone)::date;
  v_start_date:=GREATEST(COALESCE(p_from_date,v_today),v_today);
  v_end_date:=LEAST(v_start_date+(v_days-1),v_today+v_max_advance);
  IF v_start_date>v_end_date THEN RETURN; END IF;

  RETURN QUERY
  WITH dates AS (
    SELECT gs::date d FROM generate_series(v_start_date::timestamp,v_end_date::timestamp,interval '1 day') gs
    WHERE extract(dow FROM gs)::integer=ANY(v_working_days)
  ), candidates AS (
    SELECT ((d.d+v_work_start)+(n*make_interval(mins=>v_slot_interval))) AT TIME ZONE v_timezone slot_start
    FROM dates d
    CROSS JOIN LATERAL generate_series(
      0,
      floor(GREATEST(extract(epoch FROM ((d.d+v_work_end)-(d.d+v_work_start)-make_interval(mins=>v_duration)))/60.0,-1)/v_slot_interval)::integer
    ) n
  )
  SELECT c.slot_start,c.slot_start+make_interval(mins=>v_duration),v_timezone,v_duration
  FROM candidates c
  WHERE public.is_public_reschedule_slot_available(v_booking.salesperson_id,c.slot_start,v_duration,v_meeting.id)
  ORDER BY c.slot_start
  LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_reschedule_slots(uuid,date,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_reschedule_slots(uuid,date,integer) TO anon,authenticated;
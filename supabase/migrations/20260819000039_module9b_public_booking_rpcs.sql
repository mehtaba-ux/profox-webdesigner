-- Module 9B — Public, privacy-safe booking discovery + atomic booking RPCs.
-- Public callers never receive direct table access. All public data is deliberately projected by these functions.

CREATE OR REPLACE FUNCTION public.get_public_booking_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT config_value FROM public.system_configuration WHERE config_key='public_booking_settings'),
    '{"active":false,"qualificationQuestions":[]}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.list_public_booking_experts()
RETURNS TABLE(
  salesperson_id uuid,
  slug text,
  display_name text,
  headline text,
  bio text,
  country text,
  avatar_url text,
  niches text[],
  service_expertise text[],
  languages text[],
  meeting_type text,
  meeting_duration_minutes integer,
  timezone text,
  working_days integer[],
  work_start time,
  work_end time
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH public_settings AS (
    SELECT COALESCE(
      (SELECT config_value FROM public.system_configuration WHERE config_key='public_booking_settings'),
      '{"active":false}'::jsonb
    ) AS cfg
  ), meeting_settings AS (
    SELECT COALESCE(
      (SELECT config_value FROM public.system_configuration WHERE config_key='meeting_settings'),
      '{}'::jsonb
    ) AS cfg
  )
  SELECT
    b.salesperson_id,
    b.slug,
    COALESCE(NULLIF(b.display_name,''), p.full_name) AS display_name,
    b.headline,
    b.bio,
    COALESCE(NULLIF(b.country,''), p.country, '') AS country,
    COALESCE(NULLIF(b.avatar_url,''), p.avatar_url, '') AS avatar_url,
    b.niches,
    b.service_expertise,
    b.languages,
    b.meeting_type,
    b.meeting_duration_minutes,
    COALESCE(NULLIF(c.timezone,''), NULLIF(p.timezone,''), NULLIF(ms.cfg->>'defaultTimezone',''), 'UTC') AS timezone,
    COALESCE(c.working_days, ARRAY[1,2,3,4,5]::integer[]) AS working_days,
    COALESCE(c.work_start, '09:00'::time) AS work_start,
    COALESCE(c.work_end, '17:00'::time) AS work_end
  FROM public.public_booking_profiles b
  JOIN public.user_profiles p ON p.id=b.salesperson_id
  LEFT JOIN public.user_calendar_settings c ON c.user_id=b.salesperson_id
  CROSS JOIN public_settings ps
  CROSS JOIN meeting_settings ms
  WHERE COALESCE((ps.cfg->>'active')::boolean,false) IS TRUE
    AND b.is_public IS TRUE
    AND b.accepting_bookings IS TRUE
    AND p.status='active'
    AND p.role IN ('sales','admin')
    AND COALESCE(c.active,true) IS TRUE
  ORDER BY b.sort_order, COALESCE(NULLIF(b.display_name,''),p.full_name), b.salesperson_id;
$$;

CREATE OR REPLACE FUNCTION public.get_public_booking_slots(
  p_salesperson_id uuid,
  p_from_date date DEFAULT NULL,
  p_days integer DEFAULT 14
)
RETURNS TABLE(
  start_at timestamptz,
  end_at timestamptz,
  timezone text,
  duration_minutes integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_timezone text;
  v_working_days integer[];
  v_work_start time;
  v_work_end time;
  v_calendar_active boolean;
  v_duration integer;
  v_buffer_before integer;
  v_buffer_after integer;
  v_slot_interval integer;
  v_max_advance integer;
  v_min_notice integer;
  v_public_active boolean;
  v_meeting_active boolean;
  v_today date;
  v_start_date date;
  v_end_date date;
  v_days integer;
BEGIN
  SELECT
    COALESCE(NULLIF(c.timezone,''),NULLIF(p.timezone,''),NULLIF(ms.config_value->>'defaultTimezone',''),'UTC'),
    COALESCE(c.working_days,ARRAY[1,2,3,4,5]::integer[]),
    COALESCE(c.work_start,'09:00'::time),
    COALESCE(c.work_end,'17:00'::time),
    COALESCE(c.active,true),
    b.meeting_duration_minutes,
    COALESCE(c.buffer_before_minutes,GREATEST(COALESCE((ms.config_value->>'bufferBeforeMinutes')::integer,0),0)),
    COALESCE(c.buffer_after_minutes,GREATEST(COALESCE((ms.config_value->>'bufferAfterMinutes')::integer,0),0)),
    LEAST(GREATEST(COALESCE((pbs.config_value->>'slotIntervalMinutes')::integer,15),5),120),
    LEAST(GREATEST(COALESCE((pbs.config_value->>'maxAdvanceDays')::integer,60),1),365),
    GREATEST(COALESCE((ms.config_value->>'minimumBookingNoticeMinutes')::integer,0),0),
    COALESCE((pbs.config_value->>'active')::boolean,false),
    COALESCE((ms.config_value->>'active')::boolean,true)
  INTO
    v_timezone,v_working_days,v_work_start,v_work_end,v_calendar_active,v_duration,
    v_buffer_before,v_buffer_after,v_slot_interval,v_max_advance,v_min_notice,v_public_active,v_meeting_active
  FROM public.public_booking_profiles b
  JOIN public.user_profiles p ON p.id=b.salesperson_id
  LEFT JOIN public.user_calendar_settings c ON c.user_id=b.salesperson_id
  LEFT JOIN public.system_configuration ms ON ms.config_key='meeting_settings'
  LEFT JOIN public.system_configuration pbs ON pbs.config_key='public_booking_settings'
  WHERE b.salesperson_id=p_salesperson_id
    AND b.is_public IS TRUE
    AND b.accepting_bookings IS TRUE
    AND p.status='active'
    AND p.role IN ('sales','admin');

  IF NOT FOUND OR v_public_active IS NOT TRUE OR v_meeting_active IS NOT TRUE OR v_calendar_active IS NOT TRUE THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN
    RETURN;
  END IF;

  v_days := LEAST(GREATEST(COALESCE(p_days,14),1),31);
  v_today := (now() AT TIME ZONE v_timezone)::date;
  v_start_date := GREATEST(COALESCE(p_from_date,v_today),v_today);
  v_end_date := LEAST(v_start_date + (v_days-1), v_today + v_max_advance);
  IF v_start_date > v_end_date THEN RETURN; END IF;

  RETURN QUERY
  WITH dates AS (
    SELECT gs::date AS d
    FROM generate_series(v_start_date::timestamp,v_end_date::timestamp,interval '1 day') gs
    WHERE extract(dow FROM gs)::integer = ANY(v_working_days)
  ), slot_candidates AS (
    SELECT
      ((d.d + v_work_start) + (n * make_interval(mins=>v_slot_interval))) AT TIME ZONE v_timezone AS slot_start,
      (((d.d + v_work_start) + (n * make_interval(mins=>v_slot_interval))) AT TIME ZONE v_timezone)
        + make_interval(mins=>v_duration) AS slot_end
    FROM dates d
    CROSS JOIN LATERAL generate_series(
      0,
      floor(
        GREATEST(
          extract(epoch FROM ((d.d + v_work_end) - (d.d + v_work_start) - make_interval(mins=>v_duration))) / 60.0,
          -1
        ) / v_slot_interval
      )::integer
    ) n
  )
  SELECT s.slot_start, s.slot_end, v_timezone, v_duration
  FROM slot_candidates s
  WHERE s.slot_start >= now() + make_interval(mins=>v_min_notice)
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_availability_blocks b
      WHERE b.user_id=p_salesperson_id
        AND b.start_at < s.slot_end
        AND b.end_at > s.slot_start
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.sales_meetings m
      WHERE m.salesperson_id=p_salesperson_id
        AND m.status IN ('Scheduled','Rescheduled')
        AND m.start_at < s.slot_end + make_interval(mins=>GREATEST(COALESCE(v_buffer_after,0),0))
        AND m.end_at > s.slot_start - make_interval(mins=>GREATEST(COALESCE(v_buffer_before,0),0))
    )
  ORDER BY s.slot_start
  LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.book_public_sales_meeting(
  p_request_key uuid,
  p_salesperson_id uuid,
  p_start_at timestamptz,
  p_visitor_timezone text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_company_name text,
  p_website text,
  p_country text,
  p_industry text,
  p_service_interest text,
  p_qualification_answers jsonb DEFAULT '{}'::jsonb,
  p_honeypot text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_public_settings jsonb;
  v_meeting_settings jsonb;
  v_existing_email text;
  v_existing_result jsonb;
  v_email text;
  v_contact_name text;
  v_company_name text;
  v_country text;
  v_visitor_timezone text;
  v_meeting_type text;
  v_duration integer;
  v_seller_timezone text;
  v_expert_name text;
  v_end_at timestamptz;
  v_lead_id uuid;
  v_meeting_id uuid;
  v_activity_id uuid;
  v_reference text;
  v_title text;
  v_description text;
  v_question jsonb;
  v_question_id text;
  v_required boolean;
  v_max_per_day integer;
  v_confirm_message text;
BEGIN
  IF p_request_key IS NULL OR p_salesperson_id IS NULL OR p_start_at IS NULL THEN
    RAISE EXCEPTION 'Booking request, specialist and meeting time are required.';
  END IF;
  IF trim(COALESCE(p_honeypot,'')) <> '' THEN
    RAISE EXCEPTION 'Unable to complete this booking.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('booking-request:'||p_request_key::text,0));

  SELECT s.email,
         jsonb_build_object(
           'bookingReference',s.booking_reference,
           'meetingId',s.meeting_id,
           'leadId',s.lead_id,
           'salespersonId',s.salesperson_id,
           'expertName',COALESCE(NULLIF(bp.display_name,''),up.full_name),
           'startAt',m.start_at,
           'endAt',m.end_at,
           'timezone',m.timezone,
           'visitorTimezone',s.visitor_timezone,
           'confirmationMessage',COALESCE(cfg.config_value->>'confirmationMessage','Your meeting is confirmed.')
         )
  INTO v_existing_email,v_existing_result
  FROM public.public_booking_submissions s
  JOIN public.sales_meetings m ON m.id=s.meeting_id
  JOIN public.user_profiles up ON up.id=s.salesperson_id
  LEFT JOIN public.public_booking_profiles bp ON bp.salesperson_id=s.salesperson_id
  LEFT JOIN public.system_configuration cfg ON cfg.config_key='public_booking_settings'
  WHERE s.request_key=p_request_key;

  v_email := lower(trim(COALESCE(p_email,'')));
  IF FOUND THEN
    IF v_email <> lower(trim(COALESCE(v_existing_email,''))) THEN
      RAISE EXCEPTION 'This booking request key has already been used.';
    END IF;
    RETURN v_existing_result;
  END IF;

  SELECT config_value INTO v_public_settings
  FROM public.system_configuration WHERE config_key='public_booking_settings';
  v_public_settings := COALESCE(v_public_settings,'{"active":false,"qualificationQuestions":[]}'::jsonb);
  IF COALESCE((v_public_settings->>'active')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Public booking is currently unavailable.';
  END IF;

  SELECT config_value INTO v_meeting_settings
  FROM public.system_configuration WHERE config_key='meeting_settings';
  v_meeting_settings := COALESCE(v_meeting_settings,'{}'::jsonb);
  IF COALESCE((v_meeting_settings->>'active')::boolean,true) IS NOT TRUE THEN
    RAISE EXCEPTION 'New meetings are currently unavailable.';
  END IF;

  v_contact_name := left(trim(COALESCE(p_contact_name,'')),160);
  v_company_name := left(trim(COALESCE(p_company_name,'')),200);
  v_country := left(trim(COALESCE(p_country,'')),120);
  IF v_contact_name='' THEN RAISE EXCEPTION 'Your name is required.'; END IF;
  IF v_company_name='' THEN RAISE EXCEPTION 'Company or business name is required.'; END IF;
  IF v_country='' THEN RAISE EXCEPTION 'Country is required.'; END IF;
  IF v_email='' OR v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Enter a valid email address.';
  END IF;
  IF length(v_email)>320 THEN RAISE EXCEPTION 'Email address is too long.'; END IF;

  IF p_qualification_answers IS NULL OR jsonb_typeof(p_qualification_answers) <> 'object' THEN
    RAISE EXCEPTION 'Qualification answers must be submitted as an object.';
  END IF;
  FOR v_question IN
    SELECT value FROM jsonb_array_elements(COALESCE(v_public_settings->'qualificationQuestions','[]'::jsonb))
  LOOP
    v_question_id := trim(COALESCE(v_question->>'id',''));
    v_required := COALESCE((v_question->>'required')::boolean,false);
    IF v_required AND (v_question_id='' OR NOT (p_qualification_answers ? v_question_id)
       OR trim(COALESCE(p_qualification_answers->>v_question_id,''))='') THEN
      RAISE EXCEPTION 'Please answer all required qualification questions.';
    END IF;
  END LOOP;

  v_visitor_timezone := COALESCE(NULLIF(trim(p_visitor_timezone),''),'UTC');
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=v_visitor_timezone) THEN
    v_visitor_timezone := 'UTC';
  END IF;

  SELECT
    b.meeting_type,
    b.meeting_duration_minutes,
    COALESCE(NULLIF(c.timezone,''),NULLIF(up.timezone,''),NULLIF(v_meeting_settings->>'defaultTimezone',''),'UTC'),
    COALESCE(NULLIF(b.display_name,''),up.full_name)
  INTO v_meeting_type,v_duration,v_seller_timezone,v_expert_name
  FROM public.public_booking_profiles b
  JOIN public.user_profiles up ON up.id=b.salesperson_id
  LEFT JOIN public.user_calendar_settings c ON c.user_id=b.salesperson_id
  WHERE b.salesperson_id=p_salesperson_id
    AND b.is_public IS TRUE
    AND b.accepting_bookings IS TRUE
    AND up.status='active'
    AND up.role IN ('sales','admin')
    AND COALESCE(c.active,true) IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This specialist is not currently accepting bookings.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('public-booking:'||p_salesperson_id::text,0));

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_public_booking_slots(
      p_salesperson_id,
      (p_start_at AT TIME ZONE v_seller_timezone)::date,
      1
    ) slot
    WHERE slot.start_at=p_start_at
  ) THEN
    RAISE EXCEPTION 'That time is no longer available. Please choose another slot.';
  END IF;

  v_max_per_day := LEAST(GREATEST(COALESCE((v_public_settings->>'maxBookingsPerEmailPerDay')::integer,3),1),20);
  IF (
    SELECT count(*)
    FROM public.public_booking_submissions s
    WHERE lower(s.email)=v_email
      AND s.created_at >= now()-interval '24 hours'
      AND s.status='Confirmed'
  ) >= v_max_per_day THEN
    RAISE EXCEPTION 'Booking limit reached for this email address. Please contact ProFox if you need another meeting.';
  END IF;

  SELECT l.id INTO v_lead_id
  FROM public.crm_leads l
  WHERE lower(trim(COALESCE(l.email,'')))=v_email
    AND l.converted_opportunity_id IS NULL
    AND (l.salesperson_id=p_salesperson_id OR l.salesperson_id IS NULL)
  ORDER BY l.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_lead_id IS NULL THEN
    INSERT INTO public.crm_leads(
      title,company_name,contact_name,email,phone,website,country,industry,source,salesperson_id,
      service_interest,estimated_value,currency,status,initial_outreach_channel,next_follow_up_at,
      notes,self_generated,created_by,created_at,updated_at
    ) VALUES (
      left(v_company_name||' — Website Booking',250),v_company_name,v_contact_name,v_email,
      left(trim(COALESCE(p_phone,'')),80),left(trim(COALESCE(p_website,'')),1000),v_country,
      left(trim(COALESCE(NULLIF(p_industry,''),'Other')),160),'Website Booking',p_salesperson_id,
      left(trim(COALESCE(p_service_interest,'')),250),0,'USD','Interested','Website Booking',p_start_at,
      'Created automatically from the ProFox public booking flow.',false,p_salesperson_id,now(),now()
    ) RETURNING id INTO v_lead_id;
  ELSE
    UPDATE public.crm_leads
    SET salesperson_id=COALESCE(salesperson_id,p_salesperson_id),
        contact_name=v_contact_name,
        company_name=v_company_name,
        phone=CASE WHEN trim(COALESCE(p_phone,''))<>'' THEN left(trim(p_phone),80) ELSE phone END,
        website=CASE WHEN trim(COALESCE(p_website,''))<>'' THEN left(trim(p_website),1000) ELSE website END,
        country=v_country,
        industry=CASE WHEN trim(COALESCE(p_industry,''))<>'' THEN left(trim(p_industry),160) ELSE industry END,
        service_interest=CASE WHEN trim(COALESCE(p_service_interest,''))<>'' THEN left(trim(p_service_interest),250) ELSE service_interest END,
        status=CASE WHEN status IN ('New','Researching','Contacted','Follow-Up') THEN 'Interested' ELSE status END,
        next_follow_up_at=p_start_at,
        updated_at=now()
    WHERE id=v_lead_id;
  END IF;

  v_end_at := p_start_at + make_interval(mins=>v_duration);
  v_title := replace(
    replace(COALESCE(v_meeting_settings->>'titleTemplate','{{company}} — {{meetingType}}'),'{{company}}',v_company_name),
    '{{meetingType}}',v_meeting_type
  );
  v_description := replace(
    replace(COALESCE(v_meeting_settings->>'descriptionTemplate','ProFox meeting with {{contact}} from {{company}}.'),'{{company}}',v_company_name),
    '{{contact}}',v_contact_name
  );

  INSERT INTO public.sales_meetings(
    request_key,lead_id,salesperson_id,meeting_type,title,description,start_at,end_at,timezone,
    provider,meeting_url,attendee_name,attendee_email,status,sync_status,created_by
  ) VALUES (
    p_request_key,v_lead_id,p_salesperson_id,v_meeting_type,left(trim(v_title),250),left(v_description,3000),
    p_start_at,v_end_at,v_seller_timezone,'Manual','',v_contact_name,v_email,'Scheduled','Not Connected',p_salesperson_id
  ) RETURNING id INTO v_meeting_id;

  INSERT INTO public.crm_activities(
    lead_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by
  ) VALUES (
    v_lead_id,p_salesperson_id,'Discovery Meeting',left(trim(v_title),250),p_start_at,'Scheduled','Website Booking',
    'Created automatically from a confirmed ProFox public booking.',p_salesperson_id
  ) RETURNING id INTO v_activity_id;

  UPDATE public.sales_meetings SET activity_id=v_activity_id WHERE id=v_meeting_id;

  INSERT INTO public.public_booking_submissions(
    request_key,salesperson_id,lead_id,meeting_id,contact_name,email,phone,company_name,website,country,
    industry,service_interest,qualification_answers,visitor_timezone,status
  ) VALUES (
    p_request_key,p_salesperson_id,v_lead_id,v_meeting_id,v_contact_name,v_email,left(trim(COALESCE(p_phone,'')),80),
    v_company_name,left(trim(COALESCE(p_website,'')),1000),v_country,left(trim(COALESCE(NULLIF(p_industry,''),'Other')),160),
    left(trim(COALESCE(p_service_interest,'')),250),p_qualification_answers,v_visitor_timezone,'Confirmed'
  ) RETURNING booking_reference INTO v_reference;

  UPDATE public.crm_leads
  SET notes=trim(concat_ws(E'\n',NULLIF(notes,''),'Public booking '||v_reference||' confirmed for '||p_start_at::text)),
      updated_at=now()
  WHERE id=v_lead_id;

  v_confirm_message := COALESCE(v_public_settings->>'confirmationMessage','Your meeting is confirmed.');
  RETURN jsonb_build_object(
    'bookingReference',v_reference,
    'meetingId',v_meeting_id,
    'leadId',v_lead_id,
    'salespersonId',p_salesperson_id,
    'expertName',v_expert_name,
    'startAt',p_start_at,
    'endAt',v_end_at,
    'timezone',v_seller_timezone,
    'visitorTimezone',v_visitor_timezone,
    'confirmationMessage',v_confirm_message
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_booking_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_booking_experts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_booking_slots(uuid,date,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_public_sales_meeting(uuid,uuid,timestamptz,text,text,text,text,text,text,text,text,text,jsonb,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_booking_settings() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_booking_experts() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_booking_slots(uuid,date,integer) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.book_public_sales_meeting(uuid,uuid,timestamptz,text,text,text,text,text,text,text,text,text,jsonb,text) TO anon,authenticated;
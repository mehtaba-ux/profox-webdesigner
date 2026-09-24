-- Module 10C — Reminder scheduling, quotation follow-up, seller Today view and booking funnel analytics.

CREATE TABLE IF NOT EXISTS public.public_booking_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'Page Viewed','Service Selected','Expert Selected','First Available Selected','Slot Selected','Qualification Started','Booking Completed'
  )),
  salesperson_id uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  service_interest text NOT NULL DEFAULT '',
  event_fingerprint text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_funnel_events_created ON public.public_booking_funnel_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_funnel_events_type_created ON public.public_booking_funnel_events(event_type,created_at DESC);
ALTER TABLE public.public_booking_funnel_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_booking_funnel_events FROM anon,authenticated;
GRANT SELECT ON TABLE public.public_booking_funnel_events TO authenticated;
DROP POLICY IF EXISTS booking_funnel_admin_select ON public.public_booking_funnel_events;
CREATE POLICY booking_funnel_admin_select ON public.public_booking_funnel_events
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.track_public_booking_event(
  p_session_key uuid,
  p_event_type text,
  p_salesperson_id uuid DEFAULT NULL,
  p_service_interest text DEFAULT '',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_type text:=trim(COALESCE(p_event_type,'')); v_service text:=left(trim(COALESCE(p_service_interest,'')),250); v_fingerprint text;
BEGIN
  IF p_session_key IS NULL THEN RETURN false; END IF;
  IF v_type NOT IN ('Page Viewed','Service Selected','Expert Selected','First Available Selected','Slot Selected','Qualification Started','Booking Completed') THEN
    RAISE EXCEPTION 'Unsupported booking analytics event.';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata)<>'object' OR length(p_metadata::text)>4000 THEN
    RAISE EXCEPTION 'Invalid analytics metadata.';
  END IF;
  IF p_salesperson_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.user_profiles WHERE id=p_salesperson_id AND status='active' AND role IN ('sales','admin')
  ) THEN p_salesperson_id:=NULL; END IF;

  v_fingerprint := p_session_key::text||':'||v_type||':'||COALESCE(p_salesperson_id::text,'')||':'||lower(v_service);
  INSERT INTO public.public_booking_funnel_events(session_key,event_type,salesperson_id,service_interest,event_fingerprint,metadata)
  VALUES(p_session_key,v_type,p_salesperson_id,v_service,v_fingerprint,p_metadata)
  ON CONFLICT(event_fingerprint) DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_booking_analytics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_days integer:=LEAST(GREATEST(COALESCE(p_days,30),1),365); v_since timestamptz; v_views bigint; v_completed bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
  v_since:=now()-make_interval(days=>v_days);
  SELECT count(*) INTO v_views FROM public.public_booking_funnel_events WHERE created_at>=v_since AND event_type='Page Viewed';
  SELECT count(*) INTO v_completed FROM public.public_booking_funnel_events WHERE created_at>=v_since AND event_type='Booking Completed';
  RETURN jsonb_build_object(
    'days',v_days,
    'views',v_views,
    'completed',v_completed,
    'conversionRate',CASE WHEN v_views=0 THEN 0 ELSE round((v_completed::numeric/v_views::numeric)*100,2) END,
    'events',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('eventType',event_type,'count',cnt) ORDER BY sort_order)
      FROM (
        SELECT event_type,count(*) cnt,
          CASE event_type WHEN 'Page Viewed' THEN 1 WHEN 'Service Selected' THEN 2 WHEN 'Expert Selected' THEN 3
            WHEN 'First Available Selected' THEN 4 WHEN 'Slot Selected' THEN 5 WHEN 'Qualification Started' THEN 6 WHEN 'Booking Completed' THEN 7 ELSE 99 END sort_order
        FROM public.public_booking_funnel_events WHERE created_at>=v_since GROUP BY event_type
      ) q
    ),'[]'::jsonb),
    'topServices',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('service',service_interest,'count',cnt) ORDER BY cnt DESC)
      FROM (SELECT service_interest,count(*) cnt FROM public.public_booking_funnel_events
        WHERE created_at>=v_since AND event_type='Booking Completed' AND service_interest<>'' GROUP BY service_interest ORDER BY cnt DESC LIMIT 10) q
    ),'[]'::jsonb),
    'topExperts',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('salespersonId',q.salesperson_id,'name',q.full_name,'count',q.cnt) ORDER BY q.cnt DESC)
      FROM (
        SELECT e.salesperson_id,COALESCE(NULLIF(bp.display_name,''),up.full_name,'ProFox Specialist') full_name,count(*) cnt
        FROM public.public_booking_funnel_events e
        LEFT JOIN public.user_profiles up ON up.id=e.salesperson_id
        LEFT JOIN public.public_booking_profiles bp ON bp.salesperson_id=e.salesperson_id
        WHERE e.created_at>=v_since AND e.event_type='Booking Completed' AND e.salesperson_id IS NOT NULL
        GROUP BY e.salesperson_id,COALESCE(NULLIF(bp.display_name,''),up.full_name,'ProFox Specialist') ORDER BY cnt DESC LIMIT 10
      ) q
    ),'[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_public_booking_reminders(p_meeting_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.public_booking_submissions%ROWTYPE;
  v_meeting public.sales_meetings%ROWTYPE;
  v_settings jsonb;
  v_payload jsonb;
  v_minutes integer;
  v_when timestamptz;
  v_label text;
BEGIN
  SELECT * INTO v_booking FROM public.public_booking_submissions WHERE meeting_id=p_meeting_id;
  IF NOT FOUND OR v_booking.status<>'Confirmed' THEN RETURN; END IF;
  SELECT * INTO v_meeting FROM public.sales_meetings WHERE id=p_meeting_id;
  IF NOT FOUND OR v_meeting.status NOT IN ('Scheduled','Rescheduled') THEN RETURN; END IF;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_settings FROM public.system_configuration WHERE config_key='notification_settings';
  v_settings:=COALESCE(v_settings,'{}'::jsonb);
  v_payload:=public.build_public_booking_notification_payload(v_booking.id);

  FOR v_minutes IN SELECT value::integer FROM jsonb_array_elements_text(COALESCE(v_settings->'reminderMinutes','[1440,60]'::jsonb))
  LOOP
    v_minutes:=LEAST(GREATEST(v_minutes,5),10080);
    v_when:=v_meeting.start_at-make_interval(mins=>v_minutes);
    IF v_when<=now() THEN CONTINUE; END IF;
    v_label:=CASE WHEN v_minutes=1440 THEN 'tomorrow'
      WHEN v_minutes=60 THEN 'in 1 hour'
      WHEN v_minutes%1440=0 THEN 'in '||(v_minutes/1440)::text||' days'
      WHEN v_minutes%60=0 THEN 'in '||(v_minutes/60)::text||' hours'
      ELSE 'in '||v_minutes::text||' minutes' END;

    PERFORM public.enqueue_notification(
      'meeting-reminder:'||p_meeting_id::text||':'||v_minutes::text||':visitor',
      'meeting_reminder',v_booking.email,NULL,v_payload||jsonb_build_object('reminderLabel',v_label),v_when
    );
    PERFORM public.enqueue_notification(
      'meeting-reminder:'||p_meeting_id::text||':'||v_minutes::text||':seller',
      'seller_meeting_reminder',COALESCE(v_payload->>'sellerEmail',''),v_booking.salesperson_id,
      v_payload||jsonb_build_object('reminderLabel',v_label),v_when
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_schedule_booking_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.schedule_public_booking_reminders(NEW.meeting_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_schedule_booking_reminders_on_booking ON public.public_booking_submissions;
CREATE TRIGGER trg_schedule_booking_reminders_on_booking
AFTER INSERT ON public.public_booking_submissions
FOR EACH ROW EXECUTE FUNCTION public.trigger_schedule_booking_reminders();

CREATE OR REPLACE FUNCTION public.trigger_refresh_booking_reminders_on_meeting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.start_at IS DISTINCT FROM OLD.start_at AND NEW.status IN ('Scheduled','Rescheduled') THEN
    PERFORM public.schedule_public_booking_reminders(NEW.id);
  END IF;
  IF NEW.status IN ('Completed','Cancelled','No Show') AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.notification_outbox
    SET status='Cancelled',updated_at=now()
    WHERE dedupe_key LIKE ('meeting-reminder:'||NEW.id::text||':%') AND status IN ('Pending','Retry');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_refresh_booking_reminders_on_meeting ON public.sales_meetings;
CREATE TRIGGER trg_refresh_booking_reminders_on_meeting
AFTER UPDATE OF start_at,status ON public.sales_meetings
FOR EACH ROW EXECUTE FUNCTION public.trigger_refresh_booking_reminders_on_meeting();

CREATE OR REPLACE FUNCTION public.queue_due_sales_automations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_settings jsonb;
  v_quote_days integer;
  v_quote record;
  v_count integer:=0;
  v_seller_email text;
BEGIN
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_settings FROM public.system_configuration WHERE config_key='notification_settings';
  v_settings:=COALESCE(v_settings,'{}'::jsonb);
  v_quote_days:=LEAST(GREATEST(COALESCE((v_settings->>'quotationFollowUpDays')::integer,2),1),30);

  -- Recover worker claims left behind by a terminated delivery invocation.
  UPDATE public.notification_outbox
  SET status='Retry',scheduled_for=now(),last_error='Recovered stale processing claim.',updated_at=now()
  WHERE status='Processing' AND last_attempt_at<now()-interval '20 minutes';

  FOR v_quote IN
    SELECT q.id,q.quotation_number,q.customer_name,q.salesperson_id,q.sent_at,q.opportunity_id
    FROM public.quotations q
    JOIN public.user_profiles up ON up.id=q.salesperson_id AND up.status='active'
    WHERE lower(COALESCE(q.status,''))='sent'
      AND q.sent_at IS NOT NULL
      AND q.sent_at<=now()-make_interval(days=>v_quote_days)
      AND q.accepted_at IS NULL AND q.rejected_at IS NULL
  LOOP
    IF NOT EXISTS(
      SELECT 1 FROM public.crm_activities a
      WHERE a.assigned_to=v_quote.salesperson_id AND a.activity_type='Quotation Follow-Up'
        AND a.notes LIKE ('%Automation key: quotation-follow-up:'||v_quote.id::text||'%')
    ) THEN
      INSERT INTO public.crm_activities(opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by)
      VALUES(v_quote.opportunity_id,v_quote.salesperson_id,'Quotation Follow-Up',
        'Follow up quotation '||v_quote.quotation_number||' — '||v_quote.customer_name,
        now(),'Scheduled','Follow-Up','Automation key: quotation-follow-up:'||v_quote.id::text,v_quote.salesperson_id);
      v_count:=v_count+1;
    END IF;

    SELECT email INTO v_seller_email FROM public.user_profiles WHERE id=v_quote.salesperson_id;
    PERFORM public.enqueue_in_app_notification(
      v_quote.salesperson_id,'Quotation','Quotation follow-up due — '||v_quote.customer_name,
      v_quote.quotation_number||' has been sent and is waiting for action.',
      '/admin/app/sales?tab=quotations','inapp-quotation-follow-up:'||v_quote.id::text
    );
    PERFORM public.enqueue_notification(
      'quotation-follow-up:'||v_quote.id::text,'quotation_follow_up_task',COALESCE(v_seller_email,''),v_quote.salesperson_id,
      jsonb_build_object(
        'quotationNumber',v_quote.quotation_number,'customerName',v_quote.customer_name,
        'quotationUrl',COALESCE(NULLIF(v_settings->>'publicBaseUrl',''),'https://www.profoxwebdesigner.com')||'/admin/app/sales?tab=quotations'
      ),now()
    );
  END LOOP;
  RETURN jsonb_build_object('quotationFollowUpsCreated',v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_today_dashboard(p_salesperson_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin boolean;
  v_target uuid;
  v_quote_days integer;
  v_settings jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  v_is_admin:=public.is_admin();
  IF NOT v_is_admin AND NOT public.has_active_role(ARRAY['sales']::text[]) THEN RAISE EXCEPTION 'Active Sales access required.'; END IF;
  IF v_is_admin THEN v_target:=p_salesperson_id; ELSE v_target:=auth.uid(); END IF;
  SELECT COALESCE(config_value,'{}'::jsonb) INTO v_settings FROM public.system_configuration WHERE config_key='notification_settings';
  v_quote_days:=LEAST(GREATEST(COALESCE((v_settings->>'quotationFollowUpDays')::integer,2),1),30);

  RETURN jsonb_build_object(
    'scope',CASE WHEN v_target IS NULL THEN 'team' ELSE 'individual' END,
    'salespersonId',v_target,
    'counts',jsonb_build_object(
      'meetingsToday',(SELECT count(*) FROM public.sales_meetings m WHERE (v_target IS NULL OR m.salesperson_id=v_target)
        AND m.status IN ('Scheduled','Rescheduled') AND (m.start_at AT TIME ZONE COALESCE(NULLIF(m.timezone,''),'UTC'))::date=(now() AT TIME ZONE COALESCE(NULLIF(m.timezone,''),'UTC'))::date),
      'overdueActivities',(SELECT count(*) FROM public.crm_activities a WHERE (v_target IS NULL OR a.assigned_to=v_target)
        AND lower(COALESCE(a.status,'')) NOT IN ('completed','cancelled') AND a.due_at<now()),
      'newBookings',(SELECT count(*) FROM public.public_booking_submissions b WHERE (v_target IS NULL OR b.salesperson_id=v_target)
        AND b.created_at>=now()-interval '24 hours' AND b.status='Confirmed'),
      'quotationFollowUps',(SELECT count(*) FROM public.quotations q WHERE (v_target IS NULL OR q.salesperson_id=v_target)
        AND lower(COALESCE(q.status,''))='sent' AND q.sent_at<=now()-make_interval(days=>v_quote_days) AND q.accepted_at IS NULL AND q.rejected_at IS NULL),
      'unreadNotifications',(SELECT count(*) FROM public.in_app_notifications n WHERE (v_target IS NULL OR n.recipient_user_id=v_target) AND n.read_at IS NULL)
    ),
    'todayMeetings',COALESCE((SELECT jsonb_agg(x.obj ORDER BY x.start_at) FROM (
      SELECT m.start_at,jsonb_build_object(
        'id',m.id,'title',m.title,'startAt',m.start_at,'endAt',m.end_at,'timezone',m.timezone,'status',m.status,
        'meetingUrl',m.meeting_url,'companyName',COALESCE(b.company_name,o.company_name,l.company_name,''),
        'contactName',COALESCE(b.contact_name,o.contact_name,l.contact_name,m.attendee_name,''),
        'serviceInterest',COALESCE(b.service_interest,o.service_interest,l.service_interest,''),
        'prepUrl','/admin/meeting-prep/'||m.id::text
      ) obj
      FROM public.sales_meetings m
      LEFT JOIN public.public_booking_submissions b ON b.meeting_id=m.id
      LEFT JOIN public.crm_opportunities o ON o.id=m.opportunity_id
      LEFT JOIN public.crm_leads l ON l.id=m.lead_id
      WHERE (v_target IS NULL OR m.salesperson_id=v_target) AND m.status IN ('Scheduled','Rescheduled')
        AND (m.start_at AT TIME ZONE COALESCE(NULLIF(m.timezone,''),'UTC'))::date=(now() AT TIME ZONE COALESCE(NULLIF(m.timezone,''),'UTC'))::date
      ORDER BY m.start_at LIMIT 12
    ) x),'[]'::jsonb),
    'overdueActivities',COALESCE((SELECT jsonb_agg(x.obj ORDER BY x.due_at) FROM (
      SELECT a.due_at,jsonb_build_object('id',a.id,'activityType',a.activity_type,'subject',a.subject,'dueAt',a.due_at,
        'leadId',a.lead_id,'opportunityId',a.opportunity_id,'status',a.status,'channel',a.channel) obj
      FROM public.crm_activities a
      WHERE (v_target IS NULL OR a.assigned_to=v_target) AND lower(COALESCE(a.status,'')) NOT IN ('completed','cancelled') AND a.due_at<now()
      ORDER BY a.due_at LIMIT 15
    ) x),'[]'::jsonb),
    'upcomingMeetings',COALESCE((SELECT jsonb_agg(x.obj ORDER BY x.start_at) FROM (
      SELECT m.start_at,jsonb_build_object('id',m.id,'title',m.title,'startAt',m.start_at,'timezone',m.timezone,
        'attendeeName',m.attendee_name,'prepUrl','/admin/meeting-prep/'||m.id::text) obj
      FROM public.sales_meetings m
      WHERE (v_target IS NULL OR m.salesperson_id=v_target) AND m.status IN ('Scheduled','Rescheduled')
        AND m.start_at>now() AND m.start_at<now()+interval '7 days' ORDER BY m.start_at LIMIT 12
    ) x),'[]'::jsonb),
    'quotationActions',COALESCE((SELECT jsonb_agg(x.obj ORDER BY x.sent_at) FROM (
      SELECT q.sent_at,jsonb_build_object('id',q.id,'quotationNumber',q.quotation_number,'customerName',q.customer_name,'total',q.total,
        'currency',q.currency,'sentAt',q.sent_at,'status',q.status,'url','/admin/app/sales?tab=quotations') obj
      FROM public.quotations q
      WHERE (v_target IS NULL OR q.salesperson_id=v_target) AND lower(COALESCE(q.status,''))='sent'
        AND q.sent_at<=now()-make_interval(days=>v_quote_days) AND q.accepted_at IS NULL AND q.rejected_at IS NULL
      ORDER BY q.sent_at LIMIT 12
    ) x),'[]'::jsonb),
    'notifications',COALESCE((SELECT jsonb_agg(x.obj ORDER BY x.created_at DESC) FROM (
      SELECT n.created_at,jsonb_build_object('id',n.id,'type',n.notification_type,'title',n.title,'message',n.message,
        'actionUrl',n.action_url,'createdAt',n.created_at,'readAt',n.read_at) obj
      FROM public.in_app_notifications n WHERE (v_target IS NULL OR n.recipient_user_id=v_target) AND n.read_at IS NULL
      ORDER BY n.created_at DESC LIMIT 12
    ) x),'[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_in_app_notification_read(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  UPDATE public.in_app_notifications SET read_at=COALESCE(read_at,now())
  WHERE id=p_id AND (recipient_user_id=auth.uid() OR public.is_admin());
END;
$$;

REVOKE ALL ON FUNCTION public.track_public_booking_event(uuid,text,uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_booking_analytics(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.schedule_public_booking_reminders(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.trigger_schedule_booking_reminders() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.trigger_refresh_booking_reminders_on_meeting() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.queue_due_sales_automations() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_sales_today_dashboard(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mark_in_app_notification_read(uuid) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.track_public_booking_event(uuid,text,uuid,text,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_booking_analytics(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_due_sales_automations() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sales_today_dashboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_in_app_notification_read(uuid) TO authenticated;
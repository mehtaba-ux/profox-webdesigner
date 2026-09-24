-- Module 13G QA fix — queue dedupe does not need a cryptographic primitive.
-- Use built-in md5() so enqueue is independent of the pgcrypto extension schema/search_path.

CREATE OR REPLACE FUNCTION public.queue_google_calendar_sync(
  p_user_id uuid,
  p_job_type text,
  p_meeting_id uuid DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_connection public.google_calendar_connections%ROWTYPE;
  v_meeting public.sales_meetings%ROWTYPE;
  v_basis text;
  v_key text;
  v_id bigint;
BEGIN
  IF p_job_type NOT IN ('refresh_busy','upsert_event','delete_event','reconcile_event') THEN
    RAISE EXCEPTION 'Invalid Google sync job type.';
  END IF;
  SELECT * INTO v_connection FROM public.google_calendar_connections WHERE user_id=p_user_id;
  IF NOT FOUND OR v_connection.status<>'connected' OR v_connection.sync_enabled IS NOT TRUE THEN RETURN NULL; END IF;

  IF p_job_type<>'refresh_busy' THEN
    IF p_meeting_id IS NULL THEN RAISE EXCEPTION 'Meeting is required for event synchronization.'; END IF;
    SELECT * INTO v_meeting FROM public.sales_meetings WHERE id=p_meeting_id AND salesperson_id=p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Meeting does not belong to this Google connection.'; END IF;
    v_basis:=concat_ws('|',v_meeting.id::text,v_meeting.start_at::text,v_meeting.end_at::text,v_meeting.title,v_meeting.description,
      v_meeting.attendee_name,v_meeting.attendee_email,v_meeting.status,p_job_type);
  ELSE
    v_basis:=concat_ws('|',p_user_id::text,p_job_type,to_char(date_trunc('minute',now()),'YYYYMMDDHH24MI'));
  END IF;

  v_key:=p_user_id::text||':'||p_job_type||':'||md5(v_basis);
  INSERT INTO public.google_calendar_sync_jobs(user_id,meeting_id,job_type,dedupe_key,status,next_attempt_at,updated_at)
  VALUES(p_user_id,p_meeting_id,p_job_type,v_key,'pending',now(),now())
  ON CONFLICT(dedupe_key) DO UPDATE SET
    status=CASE WHEN p_force THEN 'pending' ELSE public.google_calendar_sync_jobs.status END,
    next_attempt_at=CASE WHEN p_force THEN now() ELSE public.google_calendar_sync_jobs.next_attempt_at END,
    last_error=CASE WHEN p_force THEN NULL ELSE public.google_calendar_sync_jobs.last_error END,
    updated_at=now()
  RETURNING id INTO v_id;

  IF p_meeting_id IS NOT NULL AND p_job_type IN ('upsert_event','delete_event','reconcile_event') THEN
    UPDATE public.sales_meetings SET sync_status='Pending',sync_error=NULL WHERE id=p_meeting_id;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_google_calendar_sync(uuid,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_google_calendar_sync(uuid,text,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.decline_mock_call_assignment(p_session_id uuid,p_reason text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_session public.mock_call_sessions%ROWTYPE;
  v_old_evaluator uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF length(trim(COALESCE(p_reason,'')))<3 THEN RAISE EXCEPTION 'Add a short reason before releasing the assignment.'; END IF;
  SELECT * INTO v_session FROM public.mock_call_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR (NOT public.is_admin() AND v_session.evaluator_id IS DISTINCT FROM v_uid) THEN RAISE EXCEPTION 'Mock call assignment not found.'; END IF;
  IF v_session.status<>'scheduled' OR COALESCE(v_session.scheduled_start_at,now())<=now() THEN RAISE EXCEPTION 'Only a future scheduled mock call can be declined.'; END IF;
  v_old_evaluator:=v_session.evaluator_id;
  PERFORM public.release_mock_call_reservations(v_session.id);
  UPDATE public.notification_outbox SET status='Cancelled',updated_at=now() WHERE dedupe_key LIKE 'mock-call:'||v_session.id||':%' AND status IN ('Pending','Retry');
  INSERT INTO public.mock_call_events(session_id,event_type,actor_user_id,event_data)
  VALUES(v_session.id,'evaluator_declined',v_uid,jsonb_build_object('evaluatorId',v_old_evaluator,'reason',left(trim(p_reason),2000)));
  UPDATE public.mock_call_sessions
  SET status='evaluator_declined',evaluator_id=NULL,scheduled_start_at=NULL,scheduled_end_at=NULL,meeting_url='',evaluator_assigned_at=NULL,updated_at=now()
  WHERE id=v_session.id;
  v_result:=public.try_schedule_mock_call_session(v_session.id);
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.decline_mock_call_assignment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.decline_mock_call_assignment(uuid,text) TO authenticated;

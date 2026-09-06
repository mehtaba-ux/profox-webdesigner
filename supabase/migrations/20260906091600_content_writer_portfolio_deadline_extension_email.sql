INSERT INTO public.notification_templates(
  template_key,
  name,
  subject_template,
  body_template,
  active,
  description,
  html_template
)
VALUES (
  'content_recruitment_portfolio_deadline_extended',
  'Content Writer portfolio deadline extended',
  'Your ProFox Portfolio Review deadline has been extended',
  'Hi {{candidateName}},\n\nYour Content Writer Portfolio Review deadline has been extended by {{taskExtensionHours}} hours.\n\nNew deadline: {{taskDueDate}}\n\nContinue your secure portfolio submission here:\n{{taskUrl}}\n\nPlease submit only work you are authorized to share and describe your own contribution accurately.\n\nRegards,\nProFox Recruitment Team',
  true,
  'Candidate notification after an Admin extends a Content Writer Portfolio Review deadline.',
  '<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table width="100%" role="presentation"><tr><td align="center" style="padding:28px 12px"><table width="640" role="presentation" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:28px"><div style="font-size:12px;font-weight:700;letter-spacing:.12em;color:#000080">CONTENT WRITER RECRUITMENT</div><h1 style="font-size:24px;margin:8px 0 14px">Portfolio Review deadline extended</h1><p style="font-size:15px;line-height:1.7">Hi {{candidateName}},</p><p style="font-size:15px;line-height:1.7">Your Content Writer Portfolio Review deadline has been extended by {{taskExtensionHours}} hours.</p><p style="font-size:14px"><strong>New deadline:</strong> {{taskDueDate}}</p><p><a href="{{taskUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Continue Portfolio Review</a></p><p style="font-size:13px;line-height:1.6;color:#475569">Please submit only work you are authorized to share and describe your own contribution accurately.</p><hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0"><p style="font-size:13px;line-height:1.6;color:#475569"><strong>ProFox Recruitment Team</strong><br>ProFox Web Designer</p></td></tr></table></td></tr></table></body></html>'
)
ON CONFLICT (template_key) DO UPDATE
SET name = EXCLUDED.name,
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    active = EXCLUDED.active,
    description = EXCLUDED.description,
    html_template = EXCLUDED.html_template,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.admin_extend_recruitment_task_deadline(p_task_id uuid, p_hours integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_task public.recruitment_task_instances%rowtype;
  v_app public.applicants%rowtype;
  v_payload jsonb;
  v_task_key text;
  v_template_key text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required.';
  END IF;

  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 336 THEN
    RAISE EXCEPTION 'Extension must be between 1 and 336 hours.';
  END IF;

  SELECT * INTO v_task
  FROM public.recruitment_task_instances
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recruitment task not found.';
  END IF;

  IF v_task.status NOT IN ('Issued', 'Viewed', 'In Progress') THEN
    RAISE EXCEPTION 'Only an active editable task can be extended.';
  END IF;

  SELECT * INTO v_app
  FROM public.applicants
  WHERE id = v_task.applicant_id;

  UPDATE public.recruitment_task_instances
  SET due_at = greatest(due_at, now()) + make_interval(hours => p_hours),
      token_hash = null,
      updated_at = now()
  WHERE id = v_task.id
  RETURNING * INTO v_task;

  v_task_key := coalesce(v_task.template_snapshot ->> 'taskKey', '');
  v_template_key := CASE
    WHEN v_task_key = 'content_writer_portfolio_v2'
      THEN 'content_recruitment_portfolio_deadline_extended'
    ELSE 'recruitment_task_deadline_extended'
  END;

  v_payload := public.recruitment_notification_payload(v_app) || jsonb_build_object(
    'taskInstanceId', v_task.id,
    'taskExtensionHours', p_hours
  );

  PERFORM public.enqueue_notification(
    'recruitment-task:' || v_task.id::text || ':extension:' || extract(epoch from clock_timestamp())::bigint,
    v_template_key,
    v_app.email,
    null,
    v_payload,
    now()
  );

  INSERT INTO public.applicant_events(
    applicant_id, category, event_type, title, detail, actor_type, actor_user_id,
    source_table, source_id, metadata
  ) VALUES (
    v_task.applicant_id,
    'Recruitment',
    'Task Deadline Extended',
    coalesce(v_task.template_snapshot ->> 'title', 'Recruitment task') || ' deadline extended',
    'Admin extended the deadline by ' || p_hours || ' hours and invalidated the previous link.',
    'Admin',
    auth.uid(),
    'recruitment_task_instances',
    v_task.id,
    jsonb_build_object(
      'attemptNo', v_task.attempt_no,
      'dueAt', v_task.due_at,
      'extensionHours', p_hours,
      'taskKey', v_task_key,
      'notificationTemplate', v_template_key
    )
  );

  RETURN jsonb_build_object('success', true, 'dueAt', v_task.due_at);
END;
$function$;

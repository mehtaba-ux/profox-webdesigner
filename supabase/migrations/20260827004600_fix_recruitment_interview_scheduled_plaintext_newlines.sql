update public.notification_templates
set body_template = replace(body_template, E'\\n', E'\n'),
    updated_at = now()
where template_key = 'recruitment_interview_scheduled'
  and position(E'\\n' in body_template) > 0;

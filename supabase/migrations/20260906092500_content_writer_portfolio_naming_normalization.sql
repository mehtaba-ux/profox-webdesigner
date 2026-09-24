-- Keep Content Writer as the canonical role name across the Portfolio Review task and candidate communications.

UPDATE public.recruitment_task_templates
SET title = 'Content Writer Portfolio — 3 Case Studies',
    updated_at = now()
WHERE task_key = 'content_writer_portfolio_v2'
  AND title IS DISTINCT FROM 'Content Writer Portfolio — 3 Case Studies';

UPDATE public.notification_templates
SET name = replace(name, 'Content Creator', 'Content Writer'),
    subject_template = replace(subject_template, 'Content Creator', 'Content Writer'),
    body_template = replace(body_template, 'Content Creator', 'Content Writer'),
    html_template = CASE WHEN html_template IS NULL THEN NULL ELSE replace(html_template, 'Content Creator', 'Content Writer') END,
    updated_at = now()
WHERE template_key IN (
  'content_recruitment_portfolio',
  'content_recruitment_portfolio_retry',
  'content_recruitment_portfolio_submitted',
  'content_recruitment_portfolio_deadline_extended'
);

UPDATE public.notification_templates
SET subject_template='Update on your ProFox Content Creator application',
    body_template=replace(body_template,'Content Writer','Content Creator'),
    updated_at=now()
WHERE template_key='content_recruitment_not_selected';

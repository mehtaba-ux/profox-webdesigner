-- PF-SOP-09 operational notifications aligned to the canonical notification_templates schema.
insert into public.notification_templates(template_key,name,subject_template,body_template,description,active,updated_at) values
('development_quality_finding','Development quality finding','Release-blocking Development finding','{{title}}','PF-SOP-09 release-blocking quality finding escalation.',true,now()),
('development_incident','Development incident','Production Development incident','{{title}}','PF-SOP-09 production incident escalation.',true,now())
on conflict(template_key) do update set
  name=excluded.name,
  subject_template=excluded.subject_template,
  body_template=excluded.body_template,
  description=excluded.description,
  active=true,
  updated_at=now();
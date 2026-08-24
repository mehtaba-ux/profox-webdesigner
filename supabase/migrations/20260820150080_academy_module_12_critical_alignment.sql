-- Module 12 — align the certification to 12 critical trust/commercial rules.
-- Timeline overcommitment remains an assessed error, while the critical integrity
-- boundary is already represented by the broader unverified commitment rule.

update public.training_assessment_questions q
set critical=false,updated_at=now()
where q.module_id=(select id from public.training_modules where slug='presentation-skills')
  and q.case_key='timeline-integrity';

insert into public.training_tracks(track_key,name,target_role,department,description,active,updated_at)
values(
  'sales_assessment_prep',
  'ProFox Sales Assessment Preparation Center',
  'sales_candidate',
  'Sales',
  'Pre-selection practical preparation for shortlisted Sales candidates. This is separate from the protected post-agreement ProFox Sales Academy.',
  true,
  now()
)
on conflict (track_key) do update set
  name=excluded.name,target_role=excluded.target_role,department=excluded.department,
  description=excluded.description,active=true,updated_at=now();

insert into public.training_modules(title,slug,description,module_type,sort_order,required,active,passing_score,requires_admin_review,academy_key,updated_at)
values
('Assessment Prep · Welcome & Journey','assessment-prep-welcome','Start here. Understand the three assessment stages, how to use this center, and the standard ProFox expects from a prepared candidate.','lesson',1001,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · ProFox & Role Basics','assessment-prep-role-profox','Understand what the Sales role actually involves, what ProFox helps businesses solve, and why diagnosis comes before recommendation.','lesson',1002,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · Lead Research Playbook','assessment-prep-lead-research-playbook','Learn a repeatable research workflow for finding, verifying, qualifying and documenting legitimate prospects with public evidence.','lesson',1003,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · Sales Practical Playbook','assessment-prep-sales-practical','Prepare for a realistic sales conversation using discovery, listening, diagnosis, business impact, solution fit and next-step control.','lesson',1004,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · Objection Practice','assessment-prep-objection-practice','Build confidence handling common buyer concerns calmly, ethically and without pressure or unauthorized promises.','lesson',1005,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · Lead Research Assessment','assessment-prep-lead-research-assessment','Understand what a strong five-business submission looks like and how to quality-check your evidence and reasoning before submission.','lesson',1006,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · CRM Confidence','assessment-prep-crm-confidence','Understand CRM truth, duplicate prevention, useful notes, evidence-based statuses and specific next actions without needing production CRM access.','lesson',1007,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · Integrated Practice Lab','assessment-prep-practice-lab','Combine research, discovery, solution judgment and CRM thinking in one realistic fictional business scenario.','practical',1008,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · Rules & Knowledge Check','assessment-prep-rules-check','Review assessment ethics, data boundaries and the most important concepts you should be able to explain without guessing.','quiz',1009,true,true,null,false,'sales_assessment_prep',now()),
('Assessment Prep · Final Readiness','assessment-prep-final-readiness','Use practical checklists and one final end-to-end drill to decide whether you are ready for the ProFox Sales Assessment.','lesson',1010,true,true,null,false,'sales_assessment_prep',now())
on conflict (slug) do update set
  title=excluded.title,description=excluded.description,module_type=excluded.module_type,
  sort_order=excluded.sort_order,required=excluded.required,active=true,passing_score=excluded.passing_score,
  requires_admin_review=excluded.requires_admin_review,academy_key='sales_assessment_prep',updated_at=now();

insert into public.training_track_modules(track_key,module_id,sort_order,required,passing_score_override,requires_review_override)
select 'sales_assessment_prep',m.id,x.sort_order,true,null,false
from (values
  ('assessment-prep-welcome',1),('assessment-prep-role-profox',2),('assessment-prep-lead-research-playbook',3),
  ('assessment-prep-sales-practical',4),('assessment-prep-objection-practice',5),('assessment-prep-lead-research-assessment',6),
  ('assessment-prep-crm-confidence',7),('assessment-prep-practice-lab',8),('assessment-prep-rules-check',9),('assessment-prep-final-readiness',10)
) as x(slug,sort_order)
join public.training_modules m on m.slug=x.slug
on conflict (track_key,module_id) do update set sort_order=excluded.sort_order,required=true,passing_score_override=null,requires_review_override=false;

delete from public.training_lessons
where module_id in (select id from public.training_modules where academy_key='sales_assessment_prep');

-- Candidate preparation lessons are seeded in production by the matching applied migration.
-- The complete content is maintained in the admin-editable training_lessons records for academy_key sales_assessment_prep.

update public.recruitment_task_templates
set title='ProFox Sales Assessment Preparation Center',
    description='A practical, secure preparation center that helps shortlisted Sales candidates understand, practise and self-check the skills used in the ProFox Sales Practical Interview, Lead Research Test and CRM Assessment.',
    estimated_minutes=150,
    instructions=jsonb_build_array(
      'Use the Preparation Center in this order: Learn, review the worked example, complete the practice activity, then check yourself.',
      'Practise with fictional or non-assessment examples. Do not copy training examples into your live assessment submission.',
      'Your separate interview and task emails remain the source of truth for live assessment dates, links, deadlines and submission actions.',
      'Use only legitimate public business information for lead research and clearly separate facts, observations, hypotheses and unknowns.',
      'This Preparation Center does not grant live Sales, customer or production CRM access.',
      'The full ProFox Sales Academy remains protected until selection and verification of the signed Sales Partner Agreement.'
    ),version=greatest(coalesce(version,1),2),updated_at=now()
where task_key='sales_assessment_hub' and system_role='sales' and stage='Shortlisted' and active=true;

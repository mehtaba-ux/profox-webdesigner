insert into public.training_tracks(track_key,name,target_role,department,description)
values('web_development','ProFox Developer Academy','developer','Development','Production-readiness training for Web Developers from approved design handoff through manager-approved client handover.')
on conflict(track_key) do update set name=excluded.name,target_role=excluded.target_role,department=excluded.department,description=excluded.description,active=true,updated_at=now();

update public.training_track_modules
set sort_order=sort_order+100
where track_key='web_development' and sort_order between 2 and 99;

with desired(slug,sort_order) as (
values
('welcome',1),('dev-pf-sop-09',2),('dev-delivery-model',3),('dev-definition-ready',4),('dev-design-to-code',5),('dev-reuse-architecture',6),('dev-git-pr-workflow',7),('dev-responsive-states',8),('dev-testing-quality',9),('dev-accessibility',10),('dev-performance',11),('dev-security-data',12),('dev-staging-release',13),('dev-qa-feedback',14),('dev-launch-handover',15),('confidentiality-data-protection',16),('dev-final-certification',17)
)
insert into public.training_track_modules(track_key,module_id,sort_order,required,passing_score_override,requires_review_override)
select 'web_development',m.id,d.sort_order,true,case when m.slug='dev-pf-sop-09' then 90 else m.passing_score end,case when m.slug='dev-pf-sop-09' then false else coalesce(m.requires_admin_review,false) end
from desired d join public.training_modules m on m.slug=d.slug
on conflict(track_key,module_id) do update set sort_order=excluded.sort_order,required=true,passing_score_override=excluded.passing_score_override,requires_review_override=excluded.requires_review_override;
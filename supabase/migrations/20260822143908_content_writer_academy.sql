-- Content Writer Academy and protected activation.
-- Reuses training_modules, training_lessons, user_training_progress, training_assignments,
-- training_reviews and user_profiles. Existing Sales Academy remains isolated by academy_key.

alter table public.training_modules
  add column if not exists academy_key text not null default 'sales';

create index if not exists idx_training_modules_academy on public.training_modules(academy_key,active,sort_order);

update public.training_modules set academy_key='sales' where academy_key is null or btrim(academy_key)='';

insert into public.training_modules(title,slug,description,module_type,sort_order,required,active,passing_score,requires_admin_review,academy_key)
values
('Content Delivery Operating Model','content-operating-model','Understand how Content fits into the ProFox client project, what the writer owns, what remains canonical elsewhere, and how work moves to UI/UX.','lesson',1,true,true,null,false,'content_writer'),
('PF-SOP-07: Research to Approval','content-pf-sop-07','Learn and apply the mandatory ProFox Content Strategy, Creation, Curation & Quality Assurance SOP.','lesson',2,true,true,null,false,'content_writer'),
('Research, Evidence & Claim Discipline','content-research-evidence','Use client evidence, authoritative sources, customer language and claim verification without inventing facts or copying competitors.','lesson',3,true,true,null,false,'content_writer'),
('Conversion, UX Content & Search Intent','content-conversion-search','Structure useful, scannable content around user need, business objective, CTA, trust and search intent.','lesson',4,true,true,null,false,'content_writer'),
('AI, Confidentiality & Client Truth','content-ai-confidentiality','Use AI only as assistance, protect client information, and independently verify every material statement before submission.','lesson',5,true,true,null,false,'content_writer'),
('Review, Revisions & UI/UX Handoff','content-review-handoff','Work through self-QA, independent review, client feedback and an implementation-ready handoff to UI/UX.','lesson',6,true,true,null,false,'content_writer'),
('Content Writer Practical Certification','content-practical-certification','Produce a complete evidence-based sample deliverable and handoff package. Independent review at 90+ with no critical failure is required for production access.','practical',7,true,true,90,true,'content_writer')
on conflict (slug) do update set
  title=excluded.title,description=excluded.description,module_type=excluded.module_type,sort_order=excluded.sort_order,
  required=excluded.required,active=excluded.active,passing_score=excluded.passing_score,
  requires_admin_review=excluded.requires_admin_review,academy_key=excluded.academy_key,updated_at=now();

with m as (select id,slug from public.training_modules where academy_key='content_writer')
insert into public.training_lessons(module_id,title,content,video_url,sort_order,active)
select m.id,v.title,v.content,'',v.sort_order,true
from m join (values
('content-operating-model','One connected client-delivery record',
'ProFox uses the existing client, project, project task, project team, quotation/package, approval and notification records as the source of truth. Content Delivery does not create a second project system. Your job is to complete the assigned Content work inside that connected record.\n\nYour normal path is: Brief → Research → Create → Writer Self-QA → Independent Review → Client Review when required → Ready for UI/UX.\n\nWhen a required input is missing, block the item as **Information Required**. Never fill a gap with an assumption presented as fact.',1),
('content-pf-sop-07','PF-SOP-07 non-negotiables',
'Every deliverable follows: Research → Strategy → Content Architecture → Copywriting → Evidence Verification → Conversion Review → SEO Review where included → Independent Editorial Review → Client/SME Approval → In-context QA → Measurement.\n\nNon-negotiables: no content without purpose; no final writing without adequate information; no invented business facts; no unsupported quantitative claims; no copied competitor content; no keyword stuffing; no fake urgency; no raw AI copy; no writer self-approval; no client draft before internal QA; no factual approval without verification.\n\nThe Definition of Ready and the task playbook are gates, not suggestions.',1),
('content-research-evidence','Evidence before claims',
'Use evidence in this order: client primary evidence; authoritative external primary sources; high-quality secondary sources; community evidence for language/context; competitors only for market context.\n\nMaterial factual, numerical, comparative, testimonial, credential and performance claims must be traceable. If a performance claim has no acceptable evidence, do not write it as fact. Record the claim and source in the Claim Register.\n\nCompetitor research is for gaps, patterns and differentiation. It is never permission to copy wording or structure mechanically.',1),
('content-conversion-search','Write for the user decision',
'Before polishing sentences, identify the audience, user need, business objective and primary conversion action. Build the message hierarchy around what the user must understand, believe and do next.\n\nUse clear headings, short information blocks, meaningful proof and natural terminology. Where SEO is included, satisfy search intent and page purpose without stuffing keywords or writing to an arbitrary word count. Conversion quality comes from relevance, clarity, trust and an appropriate next step.',1),
('content-ai-confidentiality','AI assists; the writer owns the truth',
'AI may help brainstorm, organize research or improve phrasing, but the writer remains accountable for accuracy, originality, brand voice, sources and final wording. Never submit raw AI output. Never place confidential client information into an unapproved external tool.\n\nBefore submission, independently verify names, prices, scope, locations, credentials, statistics, testimonials, guarantees, contact details and any statement that could materially affect a customer decision.',1),
('content-review-handoff','Finish the content so design can start cleanly',
'Writer Self-QA happens before independent review. The writer cannot perform the final 2i approval on their own work. Resolve C0/C1 issues before anything reaches the client. Consolidate revisions instead of reacting sentence-by-sentence without checking the whole page.\n\nThe UI/UX handoff must contain the approved copy, hierarchy, CTA, audience/goal context, proof and trust elements, required forms/FAQs, SEO or accessibility notes where relevant, image/content requirements, approved evidence notes and the latest approved version. The designer should not need to ask what copy is final.',1),
('content-practical-certification','Practical certification assignment',
'Create one complete website-page content deliverable from a realistic brief. Submit: (1) the final copy or a secure document link, (2) research/source notes, (3) material claims with evidence, (4) Writer Self-QA notes, and (5) a concise UI/UX handoff note explaining hierarchy, CTA, proof and implementation requirements.\n\nThe independent reviewer scores the work against the ProFox quality standard. A score below 90, any critical failure, unsupported material claim, copied content, or misleading statement requires retry.',1)
) as v(slug,title,content,sort_order) on v.slug=m.slug
where not exists(select 1 from public.training_lessons l where l.module_id=m.id and l.sort_order=v.sort_order);

-- Restrict academy rows to the trainee's actual academy while preserving Admin management.
drop policy if exists training_modules_select on public.training_modules;
create policy training_modules_select on public.training_modules for select to authenticated using (
  public.is_admin()
  or (academy_key='sales' and (
    public.has_active_role(array['sales'::text])
    or exists(select 1 from public.applicants a where a.linked_user_id=auth.uid() and a.stage=any(array['One-Day Training','Final Approval','Ready for System Access','Activated']))
  ))
  or (academy_key='content_writer' and (
    exists(select 1 from public.applicants a join public.career_jobs j on j.id=a.career_job_id
      where a.linked_user_id=auth.uid() and j.application_type='content_writer'
        and a.stage=any(array['Content Academy','Practical Certification','Activated']))
    or public.content_recruitment_manager()
  ))
);

drop policy if exists training_lessons_select on public.training_lessons;
create policy training_lessons_select on public.training_lessons for select to authenticated using (
  public.is_admin() or exists(
    select 1 from public.training_modules m where m.id=training_lessons.module_id and (
      (m.academy_key='sales' and (
        public.has_active_role(array['sales'::text])
        or exists(select 1 from public.applicants a where a.linked_user_id=auth.uid() and a.stage=any(array['One-Day Training','Final Approval','Ready for System Access','Activated']))
      ))
      or (m.academy_key='content_writer' and (
        exists(select 1 from public.applicants a join public.career_jobs j on j.id=a.career_job_id
          where a.linked_user_id=auth.uid() and j.application_type='content_writer'
            and a.stage=any(array['Content Academy','Practical Certification','Activated']))
        or public.content_recruitment_manager()
      ))
    )
  )
);

-- Content managers may see only the Content Academy trainee evidence needed for review.
create policy training_progress_content_manager_select on public.user_training_progress for select to authenticated using (
  exists(select 1 from public.training_modules m where m.id=user_training_progress.module_id and m.academy_key='content_writer')
  and public.content_recruitment_manager()
);
create policy training_assignments_content_manager_select on public.training_assignments for select to authenticated using (
  exists(select 1 from public.training_modules m where m.id=training_assignments.module_id and m.academy_key='content_writer')
  and public.content_recruitment_manager()
);
create policy training_reviews_content_manager_select on public.training_reviews for select to authenticated using (
  exists(select 1 from public.user_training_progress p join public.training_modules m on m.id=p.module_id
    where p.id=training_reviews.progress_id and m.academy_key='content_writer')
  and public.content_recruitment_manager()
);

-- Preserve existing privileged-field protection and add narrow Content onboarding/activation flags.
create or replace function public.protect_user_profile_privileged_fields()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_sales_invite text:=coalesce(current_setting('profox.sales_candidate_invite_rpc',true),'');
  v_content_invite text:=coalesce(current_setting('profox.content_writer_invite_rpc',true),'');
  v_content_activation text:=coalesce(current_setting('profox.content_writer_activation_rpc',true),'');
begin
  if public.is_admin() or v_sales_invite='1' or v_content_invite='1' or v_content_activation='1' then return new; end if;
  if auth.uid() is null or old.id<>auth.uid() then raise exception 'Unauthorized profile update.'; end if;
  if new.role is distinct from old.role or new.status is distinct from old.status or new.department is distinct from old.department or new.manager is distinct from old.manager or new.onboarding_status is distinct from old.onboarding_status or new.onboarding_progress is distinct from old.onboarding_progress or new.email is distinct from old.email then
    raise exception 'Privileged profile fields may only be changed by an authorized workflow.';
  end if;
  return new;
end; $$;

create or replace function public.content_academy_required_complete(p_user_id uuid,p_exclude_practical boolean default false)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select not exists(
    select 1 from public.training_modules m
    where m.academy_key='content_writer' and m.active=true and m.required=true
      and (not p_exclude_practical or m.slug<>'content-practical-certification')
      and not exists(
        select 1 from public.user_training_progress p
        where p.user_id=p_user_id and p.module_id=m.id and p.status in('Passed','Completed')
          and (m.passing_score is null or coalesce(p.score,0)>=m.passing_score)
      )
  );
$$;

create or replace function public.sync_content_writer_training_stage()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_module public.training_modules%rowtype;v_app public.applicants%rowtype;
begin
  select * into v_module from public.training_modules where id=new.module_id;
  if v_module.academy_key<>'content_writer' then return new; end if;
  select * into v_app from public.applicants a join public.career_jobs j on j.id=a.career_job_id
  where a.linked_user_id=new.user_id and j.application_type='content_writer' and coalesce(btrim(a.refusal_reason),'')='' order by a.created_at desc limit 1;
  if v_app.id is null or v_app.stage='Activated' then return new; end if;
  if v_module.slug='content-practical-certification' and new.status='Submitted' and v_app.stage='Content Academy' then
    perform set_config('profox.recruitment_stage_rpc','1',true);
    update public.applicants set stage='Practical Certification',onboarding_progress=95,updated_at=now() where id=v_app.id;
    perform public.service_queue_active_admins_operational_notification(
      'content-practical-review:'||v_app.id::text||':'||new.id::text,
      'content_recruitment_practical_review','Recruitment','Content practical requires review — '||v_app.full_name,
      'Review the submitted Content Writer certification against PF-SOP-07.','/admin/app/recruitment?tab=onboarding',
      jsonb_build_object('applicantId',v_app.id,'progressId',new.id,'candidateName',v_app.full_name),now()
    );
  elsif public.content_academy_required_complete(new.user_id,true) then
    update public.user_profiles set onboarding_progress=least(90,greatest(coalesce(onboarding_progress,0),90)),updated_at=now() where id=new.user_id;
    update public.applicants set onboarding_progress=least(90,greatest(coalesce(onboarding_progress,0),90)),updated_at=now() where id=v_app.id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_sync_content_writer_training_stage on public.user_training_progress;
create trigger trg_sync_content_writer_training_stage after insert or update of status,progress_percent on public.user_training_progress
for each row execute function public.sync_content_writer_training_stage();

-- Reuse the existing review RPC. Sales behavior stays unchanged; Content Academy review
-- is permitted to Admin or the designated Content management roles and can activate only
-- after the independent practical passes at the configured standard.
create or replace function public.admin_review_training_progress(p_progress_id uuid,p_status text,p_feedback text default '',p_score integer default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_progress public.user_training_progress%rowtype;v_module public.training_modules%rowtype;v_score integer;
  v_submission_count integer;v_submission jsonb;v_event_time timestamptz:=clock_timestamp();v_missing_prior integer;
  v_app public.applicants%rowtype;v_exam_score integer;
begin
  select * into v_progress from public.user_training_progress where id=p_progress_id for update; if not found then raise exception 'Training progress record not found.'; end if;
  select * into v_module from public.training_modules where id=v_progress.module_id and active=true; if not found then raise exception 'Training module is missing or inactive.'; end if;
  if v_module.academy_key='content_writer' then
    if not public.content_recruitment_manager() then raise exception 'Content Academy review access required.'; end if;
  elsif not public.is_admin() then raise exception 'Unauthorized: only an active Admin may review Sales Academy submissions.'; end if;
  if p_status not in('Passed','Retry Required') then raise exception 'Training review status must be Passed or Retry Required.'; end if;
  if v_module.requires_admin_review is not true then raise exception 'This module does not require an independent review.'; end if;
  if v_module.academy_key='sales' and v_module.slug='lead-research' then raise exception 'Use the dedicated Lead Research rubric review workflow for Module 5.'; end if;
  if v_module.academy_key='sales' and v_module.slug='loom-outreach' then raise exception 'Use the dedicated Personalized Loom Outreach rubric review workflow for Module 6.'; end if;
  if v_module.academy_key='sales' and v_module.slug='outreach-cadence' then raise exception 'Use the dedicated Outreach Messaging rubric review workflow for Module 7.'; end if;
  if p_status='Passed' and v_progress.status<>'Submitted' then raise exception 'The trainee must submit or resubmit this module before it can be passed.'; end if;
  select count(*) into v_submission_count from public.training_assignments where progress_id=v_progress.id and user_id=v_progress.user_id and module_id=v_progress.module_id;
  select submission_data into v_submission from public.training_assignments where progress_id=v_progress.id and user_id=v_progress.user_id and module_id=v_progress.module_id order by created_at desc,id desc limit 1;
  if v_module.slug in('mock-call-test','crm-training','final-certification','content-practical-certification') and v_submission_count=0 then raise exception 'A trainee submission is required before this module can be reviewed.'; end if;
  if v_module.slug='content-practical-certification' and p_status='Passed' then
    if coalesce(v_submission->>'type','')<>'content_writer_practical' then raise exception 'A valid Content Writer practical submission is required.'; end if;
    if char_length(coalesce(v_submission->>'content',''))<300 and coalesce(v_submission->>'contentUrl','')='' then raise exception 'The practical must include substantial sample copy or a secure content URL.'; end if;
    if char_length(coalesce(v_submission->>'researchNotes',''))<80 then raise exception 'Research/source notes are required for the practical.'; end if;
    if char_length(coalesce(v_submission->>'handoffNotes',''))<80 then raise exception 'A UI/UX handoff note is required for the practical.'; end if;
  end if;
  if v_module.slug='final-certification' then
    if coalesce(v_submission->>'type','')<>'final_certification_exam' or jsonb_typeof(v_submission->'answers') is distinct from 'array' or jsonb_array_length(v_submission->'answers')<>15 then raise exception 'A server-scored 15-question Final Certification submission is required.'; end if;
    begin v_exam_score:=(v_submission->>'score')::integer; exception when others then raise exception 'Final Certification server score is missing or invalid.'; end;
    v_score:=v_exam_score;
  else
    v_score:=coalesce(p_score,case when p_status='Passed' then 100 else 50 end);
  end if;
  if v_score<0 or v_score>100 then raise exception 'Training review score must be between 0 and 100.'; end if;
  if p_status='Passed' and v_module.passing_score is not null and v_score<v_module.passing_score then raise exception 'A score of at least % is required to pass this module.',v_module.passing_score; end if;
  if v_module.slug='final-certification' and p_status='Passed' then
    select count(*) into v_missing_prior from public.training_modules m where m.academy_key='sales' and m.active=true and m.required=true and m.sort_order<v_module.sort_order and not exists(select 1 from public.user_training_progress p where p.user_id=v_progress.user_id and p.module_id=m.id and p.status in('Passed','Completed') and (m.passing_score is null or coalesce(p.score,0)>=m.passing_score));
    if v_missing_prior>0 then raise exception 'Final Certification cannot pass until all previous required modules are complete. Missing: %',v_missing_prior; end if;
  end if;
  if v_module.slug='content-practical-certification' and p_status='Passed' and not public.content_academy_required_complete(v_progress.user_id,true) then raise exception 'All required Content Academy learning modules must be complete before practical certification can pass.'; end if;
  insert into public.training_reviews(progress_id,reviewer_id,status,feedback,score,created_at) values(v_progress.id,auth.uid(),p_status,coalesce(p_feedback,''),v_score,v_event_time);
  update public.user_training_progress set status=case when p_status='Passed' then 'Passed' else 'Retry Required' end,review_status=p_status,reviewed_by=auth.uid(),reviewed_at=v_event_time,feedback=coalesce(p_feedback,''),score=v_score,progress_percent=case when p_status='Passed' then 100 else 50 end,completed_at=case when p_status='Passed' then v_event_time else null end,updated_at=v_event_time where id=v_progress.id;
  if v_module.slug='content-practical-certification' then
    select a.* into v_app from public.applicants a join public.career_jobs j on j.id=a.career_job_id where a.linked_user_id=v_progress.user_id and j.application_type='content_writer' and coalesce(btrim(a.refusal_reason),'')='' order by a.created_at desc limit 1 for update of a;
    if v_app.id is null then raise exception 'Linked Content Writer candidate record not found.'; end if;
    if p_status='Passed' then
      perform set_config('profox.content_writer_activation_rpc','1',true);
      perform set_config('profox.recruitment_stage_rpc','1',true);
      update public.applicants set stage='Activated',final_approval=true,onboarding_status='completed',onboarding_progress=100,updated_at=now() where id=v_app.id;
      update public.user_profiles set role='content_writer',department='Content',status='active',onboarding_status='completed',onboarding_progress=100,updated_at=now() where id=v_progress.user_id;
      perform public.enqueue_notification('recruitment:'||v_app.id::text||':content-activated','content_recruitment_activated',lower(btrim(v_app.email)),v_progress.user_id,public.recruitment_notification_payload(v_app),now());
      perform public.log_applicant_event(v_app.id,'activation','content_writer_activated','Content Writer activated','PF-SOP-07 Academy and independent practical certification passed.','Practical Certification','Activated','system',auth.uid(),'user_profiles',v_progress.user_id,jsonb_build_object('progressId',v_progress.id,'score',v_score));
    else
      perform set_config('profox.recruitment_stage_rpc','1',true);
      update public.applicants set stage='Content Academy',onboarding_progress=90,updated_at=now() where id=v_app.id;
    end if;
  end if;
end; $$;

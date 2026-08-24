-- PF UI/UX Designer Team — close the Academy review/approval notification loop.

create or replace function public.queue_uiux_certification_review_notifications()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare m public.training_modules%rowtype; a public.applicants%rowtype; r record;
begin
  if new.status is not distinct from old.status then return new; end if;
  select * into m from public.training_modules where id=new.module_id;
  if not found or m.slug<>'uiux-final-certification' then return new; end if;
  select * into a from public.applicants where linked_user_id=new.user_id and coalesce(public.career_job_system_role(career_job_id),'')='uiux_designer' order by created_at desc limit 1;
  if not found then return new; end if;

  if new.status='Submitted' then
    for r in select id from public.user_profiles where role='admin' and status='active' loop
      perform public.enqueue_in_app_notification(
        r.id,'Recruitment','UI/UX Final Certification ready for review',
        a.full_name||' submitted the required Design Academy final certification. Record an independent Management review before Final Approval.',
        '/admin/uiux-academy-review/'||new.user_id::text,
        'uiux-certification-submitted:'||new.id::text||':'||r.id::text||':'||coalesce(new.updated_at::text,now()::text)
      );
    end loop;
  elsif new.status='Passed' then
    perform public.enqueue_in_app_notification(
      new.user_id,'Training','UI/UX Final Certification passed',
      'Your Design Academy final certification passed Management review. Open Design Academy and request Final Approval.',
      '/design-academy','uiux-certification-passed:'||new.id::text||':'||coalesce(new.reviewed_at::text,new.updated_at::text)
    );
  elsif new.status='Retry Required' then
    perform public.enqueue_in_app_notification(
      new.user_id,'Training','UI/UX Final Certification needs revision',
      'Management requested changes to your final certification. Open Design Academy, review the feedback and resubmit the same certification module.',
      '/design-academy','uiux-certification-retry:'||new.id::text||':'||coalesce(new.reviewed_at::text,new.updated_at::text)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_queue_uiux_certification_review_notifications on public.user_training_progress;
create trigger trg_queue_uiux_certification_review_notifications
after update of status on public.user_training_progress
for each row execute function public.queue_uiux_certification_review_notifications();

revoke all on function public.queue_uiux_certification_review_notifications() from public,anon,authenticated;

create or replace function public.request_uiux_final_approval()
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare a public.applicants%rowtype; m public.training_modules%rowtype; p public.user_training_progress%rowtype; r public.training_reviews%rowtype; v_admin record;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into a from public.applicants where linked_user_id=auth.uid() order by created_at desc limit 1 for update;
  if not found or coalesce(public.career_job_system_role(a.career_job_id),'')<>'uiux_designer' then raise exception 'Linked UI/UX Designer candidate record not found.'; end if;
  if a.stage='Final Approval' then return; end if;
  if a.stage<>'Design Academy' then raise exception 'Candidate must be in Design Academy before requesting Final Approval.'; end if;
  if lower(coalesce(a.agreement_status,''))<>'signed' then raise exception 'Verified UI/UX Designer agreement is required.'; end if;
  if not public.uiux_training_ready(auth.uid()) then raise exception 'Complete and pass every required Design Academy module before requesting Final Approval.'; end if;
  select * into m from public.training_modules where slug='uiux-final-certification' and active=true;
  select * into p from public.user_training_progress where user_id=auth.uid() and module_id=m.id;
  if not found or p.status<>'Passed' or coalesce(p.score,0)<coalesce(m.passing_score,90) then raise exception 'UI/UX Final Certification must be passed before Final Approval.'; end if;
  select * into r from public.training_reviews where progress_id=p.id order by created_at desc,id desc limit 1;
  if not found or r.status<>'Passed' or r.reviewer_id is null then raise exception 'UI/UX Final Certification requires independent Management review.'; end if;
  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants set stage='Final Approval',onboarding_status='in_progress',onboarding_progress=100,updated_at=now() where id=a.id;
  for v_admin in select id from public.user_profiles where role='admin' and status='active' loop
    perform public.enqueue_in_app_notification(
      v_admin.id,'Recruitment','UI/UX Designer ready for Final Approval',
      a.full_name||' completed the required Design Academy and passed final certification. Review the candidate record and grant Final Approval if production readiness is confirmed.',
      '/admin/uiux-recruitment','uiux-final-approval-request:'||a.id::text||':'||v_admin.id::text
    );
  end loop;
end;
$$;

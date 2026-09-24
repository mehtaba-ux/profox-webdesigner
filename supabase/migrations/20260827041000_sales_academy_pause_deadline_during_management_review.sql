alter table public.applicants add column if not exists academy_review_wait_started_at timestamptz;

create or replace function public.sync_sales_academy_management_review_pause()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_requires_review boolean:=false;
  v_other_waiting boolean:=false;
begin
  select coalesce(tm.requires_review_override,m.requires_admin_review,false)
  into v_requires_review
  from public.training_modules m
  join public.training_track_modules tm on tm.module_id=m.id and tm.track_key='sales'
  where m.id=new.module_id and m.active=true;

  if not coalesce(v_requires_review,false) then return new; end if;

  select * into v_app
  from public.applicants
  where linked_user_id=new.user_id
    and stage='Sales Academy Training'
    and academy_started_at is not null
    and academy_due_at is not null
    and academy_completed_at is null
  order by created_at desc
  limit 1
  for update;
  if not found then return new; end if;

  if new.status='Submitted' and (tg_op='INSERT' or old.status is distinct from new.status) then
    if v_app.academy_review_wait_started_at is null then
      update public.applicants
      set academy_review_wait_started_at=now(), updated_at=now()
      where id=v_app.id;
    end if;
    return new;
  end if;

  if tg_op='UPDATE' and old.status='Submitted' and new.status<>'Submitted' and v_app.academy_review_wait_started_at is not null then
    select exists(
      select 1
      from public.user_training_progress p
      join public.training_track_modules tm on tm.module_id=p.module_id and tm.track_key='sales'
      join public.training_modules m on m.id=p.module_id and m.active=true
      where p.user_id=new.user_id
        and p.status='Submitted'
        and coalesce(tm.requires_review_override,m.requires_admin_review,false)=true
    ) into v_other_waiting;

    if not v_other_waiting then
      update public.applicants
      set academy_due_at=academy_due_at + (now()-academy_review_wait_started_at),
          academy_review_wait_started_at=null,
          updated_at=now()
      where id=v_app.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_sales_academy_management_review_pause on public.user_training_progress;
create trigger trg_sync_sales_academy_management_review_pause
after insert or update of status on public.user_training_progress
for each row execute function public.sync_sales_academy_management_review_pause();

create or replace function public.start_sales_academy_training()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_started timestamptz;
  v_due timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_app
  from public.applicants
  where linked_user_id=auth.uid()
    and coalesce(trim(refusal_reason),'')=''
  order by created_at desc
  limit 1
  for update;
  if not found then raise exception 'Linked Sales Academy candidate record not found.'; end if;
  if v_app.stage not in ('Sales Academy Training','Final Approval','Ready for System Access','Activated') then raise exception 'Sales Academy access is not available at the current recruitment stage.'; end if;
  if lower(coalesce(v_app.agreement_status,''))<>'signed' then raise exception 'A verified Sales Partner Agreement is required before Academy training can start.'; end if;

  if v_app.academy_started_at is null then
    if v_app.stage<>'Sales Academy Training' then raise exception 'The Academy completion window can only start during Sales Academy Training.'; end if;
    v_started:=now();
    v_due:=v_started+interval '10 days';
    update public.applicants
    set academy_started_at=v_started,academy_due_at=v_due,academy_completed_at=null,
        academy_last_reminder_key=null,academy_review_wait_started_at=null,
        onboarding_status='in_progress',updated_at=now()
    where id=v_app.id;
    perform public.enqueue_notification(
      'recruitment:'||v_app.id::text||':sales-academy-started','recruitment_academy_started',lower(trim(v_app.email)),v_app.linked_user_id,
      public.recruitment_notification_payload(v_app)||jsonb_build_object(
        'academyUrl','https://www.profoxwebdesigner.com/admin/app/sales_academy?tab=training',
        'deadlineLabel',to_char(v_due at time zone 'UTC','FMMonth DD, YYYY HH24:MI')||' UTC','daysRemaining',10,
        'applicationReference',v_app.application_reference),now());
  else
    v_started:=v_app.academy_started_at;
    v_due:=v_app.academy_due_at;
  end if;
  return jsonb_build_object('stage',v_app.stage,'startedAt',v_started,'dueAt',v_due,'completedAt',v_app.academy_completed_at,
    'secondsRemaining',case when v_due is null then null else greatest(0,floor(extract(epoch from (v_due-now())))::bigint) end,
    'overdue',coalesce(v_due<now() and v_app.academy_completed_at is null,false),'pausedForReview',false);
end;
$$;

grant execute on function public.start_sales_academy_training() to authenticated;

create or replace function public.get_my_sales_academy_deadline()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_effective_due timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_app from public.applicants where linked_user_id=auth.uid() order by created_at desc limit 1;
  if not found then return null; end if;
  v_effective_due:=case when v_app.academy_due_at is not null and v_app.academy_review_wait_started_at is not null and v_app.academy_completed_at is null
    then v_app.academy_due_at+(now()-v_app.academy_review_wait_started_at) else v_app.academy_due_at end;
  return jsonb_build_object(
    'stage',v_app.stage,'startedAt',v_app.academy_started_at,'dueAt',v_effective_due,'completedAt',v_app.academy_completed_at,
    'secondsRemaining',case when v_effective_due is null then null else greatest(0,floor(extract(epoch from (v_effective_due-now())))::bigint) end,
    'overdue',coalesce(v_effective_due<now() and v_app.academy_completed_at is null,false),
    'pausedForReview',v_app.academy_review_wait_started_at is not null and v_app.academy_completed_at is null,
    'reviewWaitStartedAt',v_app.academy_review_wait_started_at);
end;
$$;

grant execute on function public.get_my_sales_academy_deadline() to authenticated;

create or replace function public.queue_due_sales_academy_deadline_notifications()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;v_key text;v_days int;v_total int;v_completed int;v_percent int;v_queued int:=0;v_admin record;
begin
  select count(*) into v_total from public.training_track_modules tm join public.training_modules m on m.id=tm.module_id where tm.track_key='sales' and tm.required=true and m.active=true;
  for v_app in select * from public.applicants where stage='Sales Academy Training' and linked_user_id is not null and academy_started_at is not null and academy_due_at is not null and academy_completed_at is null and academy_review_wait_started_at is null and coalesce(trim(refusal_reason),'')='' loop
    v_key:=case when now()>=v_app.academy_due_at then 'overdue' when now()>=v_app.academy_due_at-interval '1 day' then 'final-day' when now()>=v_app.academy_due_at-interval '2 days' then '2-days' when now()>=v_app.academy_due_at-interval '3 days' then '3-days' when now()>=v_app.academy_due_at-interval '5 days' then '5-days' when now()>=v_app.academy_due_at-interval '7 days' then '7-days' else null end;
    if v_key is null or v_key=coalesce(v_app.academy_last_reminder_key,'') then continue; end if;
    select count(*) into v_completed from public.training_track_modules tm join public.training_modules m on m.id=tm.module_id join public.user_training_progress p on p.module_id=m.id and p.user_id=v_app.linked_user_id where tm.track_key='sales' and tm.required=true and m.active=true and p.status in ('Passed','Completed');
    v_percent:=case when v_total=0 then 0 else round((v_completed::numeric/v_total::numeric)*100)::int end;
    v_days:=greatest(0,ceil(extract(epoch from (v_app.academy_due_at-now()))/86400.0)::int);
    perform public.enqueue_notification('recruitment:'||v_app.id::text||':sales-academy-deadline:'||v_key,'recruitment_academy_deadline_reminder',lower(trim(v_app.email)),v_app.linked_user_id,
      public.recruitment_notification_payload(v_app)||jsonb_build_object('academyUrl','https://www.profoxwebdesigner.com/admin/app/sales_academy?tab=training','deadlineLabel',to_char(v_app.academy_due_at at time zone 'UTC','FMMonth DD, YYYY HH24:MI')||' UTC','deadlineStatus',case when v_key='overdue' then 'Deadline reached. Management review is required.' else 'Training window in progress.' end,'daysRemaining',v_days,'progressPercent',v_percent,'completedModules',v_completed,'totalModules',v_total,'applicationReference',v_app.application_reference),now());
    update public.applicants set academy_last_reminder_key=v_key,updated_at=now() where id=v_app.id;v_queued:=v_queued+1;
    if v_key='overdue' then
      for v_admin in select id from public.user_profiles where role='admin' and status='active' loop
        perform public.enqueue_in_app_notification(v_admin.id,'Sales Academy','Sales Academy deadline reached',coalesce(v_app.full_name,'Candidate')||' reached the 10-day Sales Academy deadline. Review remaining candidate work and any Management-review blockers.','/admin/app/recruitment?tab=recruitment','sales-academy-overdue:'||v_app.id::text||':'||v_admin.id::text);
      end loop;
    end if;
  end loop;
  return jsonb_build_object('queued',v_queued);
end;
$$;
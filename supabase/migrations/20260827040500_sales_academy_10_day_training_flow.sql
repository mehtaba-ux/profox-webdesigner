alter table public.applicants add column if not exists academy_started_at timestamptz;
alter table public.applicants add column if not exists academy_due_at timestamptz;
alter table public.applicants add column if not exists academy_completed_at timestamptz;
alter table public.applicants add column if not exists academy_last_reminder_key text;

update public.recruitment_stage_policies
set stage='Sales Academy Training', sla_hours=240, updated_at=now()
where stage='One-Day Training';

do $$
declare r record; v_def text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and pg_get_functiondef(p.oid) ilike '%One-Day Training%'
  loop
    v_def := replace(pg_get_functiondef(r.oid), 'One-Day Training', 'Sales Academy Training');
    execute v_def;
  end loop;
end $$;

alter table public.applicants disable trigger trg_protect_recruitment_stage_update;
alter table public.applicants disable trigger trg_queue_recruitment_stage_notifications;
alter table public.applicants disable trigger trg_close_inactive_recruitment_tasks;
alter table public.applicants disable trigger trg_prepare_recruitment_task_on_stage_change;
alter table public.applicants disable trigger trg_track_applicant_stage_entered_at;
update public.applicants set stage='Sales Academy Training', updated_at=now() where stage='One-Day Training';
alter table public.applicants enable trigger trg_track_applicant_stage_entered_at;
alter table public.applicants enable trigger trg_prepare_recruitment_task_on_stage_change;
alter table public.applicants enable trigger trg_close_inactive_recruitment_tasks;
alter table public.applicants enable trigger trg_queue_recruitment_stage_notifications;
alter table public.applicants enable trigger trg_protect_recruitment_stage_update;

create or replace function public.mark_sales_academy_completion_timestamp()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if old.stage='Sales Academy Training' and new.stage='Final Approval' then
    new.academy_completed_at := coalesce(new.academy_completed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mark_sales_academy_completion_timestamp on public.applicants;
create trigger trg_mark_sales_academy_completion_timestamp
before update of stage on public.applicants
for each row execute function public.mark_sales_academy_completion_timestamp();

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
  if v_app.stage not in ('Sales Academy Training','Final Approval','Ready for System Access','Activated') then
    raise exception 'Sales Academy access is not available at the current recruitment stage.';
  end if;
  if lower(coalesce(v_app.agreement_status,''))<>'signed' then
    raise exception 'A verified Sales Partner Agreement is required before Academy training can start.';
  end if;

  if v_app.academy_started_at is null then
    if v_app.stage<>'Sales Academy Training' then
      raise exception 'The Academy completion window can only start during Sales Academy Training.';
    end if;
    v_started := now();
    v_due := v_started + interval '10 days';
    update public.applicants
    set academy_started_at=v_started,
        academy_due_at=v_due,
        academy_completed_at=null,
        academy_last_reminder_key=null,
        onboarding_status='in_progress',
        updated_at=now()
    where id=v_app.id;

    perform public.enqueue_notification(
      'recruitment:'||v_app.id::text||':sales-academy-started',
      'recruitment_academy_started',
      lower(trim(v_app.email)),
      v_app.linked_user_id,
      public.recruitment_notification_payload(v_app)||jsonb_build_object(
        'academyUrl','https://www.profoxwebdesigner.com/admin/app/sales_academy?tab=training',
        'deadlineLabel',to_char(v_due at time zone 'UTC','FMMonth DD, YYYY HH24:MI')||' UTC',
        'daysRemaining',10,
        'applicationReference',v_app.application_reference
      ),
      now()
    );
  else
    v_started := v_app.academy_started_at;
    v_due := v_app.academy_due_at;
  end if;

  return jsonb_build_object(
    'stage',v_app.stage,
    'startedAt',v_started,
    'dueAt',v_due,
    'completedAt',v_app.academy_completed_at,
    'secondsRemaining',case when v_due is null then null else greatest(0,floor(extract(epoch from (v_due-now())))::bigint) end,
    'overdue',coalesce(v_due<now() and v_app.academy_completed_at is null,false)
  );
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
declare v_app public.applicants%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_app
  from public.applicants
  where linked_user_id=auth.uid()
  order by created_at desc
  limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'stage',v_app.stage,
    'startedAt',v_app.academy_started_at,
    'dueAt',v_app.academy_due_at,
    'completedAt',v_app.academy_completed_at,
    'secondsRemaining',case when v_app.academy_due_at is null then null else greatest(0,floor(extract(epoch from (v_app.academy_due_at-now())))::bigint) end,
    'overdue',coalesce(v_app.academy_due_at<now() and v_app.academy_completed_at is null,false)
  );
end;
$$;

grant execute on function public.get_my_sales_academy_deadline() to authenticated;

insert into public.notification_templates(template_key,name,subject_template,body_template,html_template,active,description,updated_at)
values
('recruitment_academy_started','Sales Academy 10-day window started','Your 10-day ProFox Sales Academy window has started',
'Hi {{fullName}},\n\nYour ProFox Sales Academy training window has started.\n\nYou have 10 days to complete all required modules, assessments, candidate-controlled practical submissions and final certification requirements.\n\nDeadline: {{deadlineLabel}}\nOpen Sales Academy: {{academyUrl}}\n\nYour dashboard shows the live countdown and current completion progress. Complete the work steadily rather than leaving modules until the final day.\n\nIf a required item is waiting for ProFox Management review, that review state will be visible in the Academy and will not be treated as missing candidate work.\n\nApplication reference: {{applicationReference}}\nSupport: {{supportEmail}}\n\nProFox Sales Academy\nProFox Web Designer',
'<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="640" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:28px"><div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#000080">SALES ACADEMY</div><h1 style="font-size:24px;line-height:32px;margin:8px 0 16px">Your 10-day training window has started</h1><p style="font-size:15px;line-height:24px;color:#334155">Hi {{fullName}},<br><br>Complete all required Sales Academy learning and candidate-controlled submissions by <strong>{{deadlineLabel}}</strong>.</p><p><a href="{{academyUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:13px 20px;border-radius:9px;font-weight:700">Open Sales Academy</a></p><p style="font-size:13px;line-height:21px;color:#64748b">Your Academy dashboard shows the live countdown and progress. Application reference: {{applicationReference}}</p></td></tr></table></td></tr></table></body></html>',true,'Sent when a Sales candidate completes protected Academy account setup and the 10-day training window begins.',now()),
('recruitment_academy_deadline_reminder','Sales Academy deadline reminder','ProFox Sales Academy deadline reminder',
'Hi {{fullName}},\n\nThis is a reminder about your ProFox Sales Academy completion deadline.\n\nStatus: {{deadlineStatus}}\nTime remaining: {{daysRemaining}} day(s)\nDeadline: {{deadlineLabel}}\nOpen Sales Academy: {{academyUrl}}\n\nCurrent progress: {{progressPercent}}%\nCompleted required modules: {{completedModules}} of {{totalModules}}\n\nPlease continue the remaining candidate-controlled training and submissions. If a required item is already waiting for Management review, keep monitoring the Academy for the review outcome.\n\nApplication reference: {{applicationReference}}\nSupport: {{supportEmail}}\n\nProFox Sales Academy\nProFox Web Designer',
'<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="640" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#FF0E0E"></td></tr><tr><td style="padding:28px"><div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#000080">SALES ACADEMY DEADLINE</div><h1 style="font-size:24px;line-height:32px;margin:8px 0 16px">Keep your Academy progress on schedule</h1><p style="font-size:15px;line-height:24px;color:#334155">Hi {{fullName}},<br><br><strong>{{deadlineStatus}}</strong><br>Time remaining: {{daysRemaining}} day(s)<br>Deadline: {{deadlineLabel}}</p><p><a href="{{academyUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:13px 20px;border-radius:9px;font-weight:700">Continue Sales Academy</a></p><p style="font-size:13px;line-height:21px;color:#64748b">Progress: {{progressPercent}}% | Completed required modules: {{completedModules}} of {{totalModules}}</p></td></tr></table></td></tr></table></body></html>',true,'Automated deadline reminders for the 10-day Sales Academy training window.',now())
on conflict(template_key) do update set
 name=excluded.name,subject_template=excluded.subject_template,body_template=excluded.body_template,html_template=excluded.html_template,active=true,description=excluded.description,updated_at=now();

update public.notification_templates
set body_template=replace(body_template,
'Your onboarding track contains the required 20-module ProFox Sales Academy, including product and package training, niche training, lead research, outreach, meeting booking, discovery, call practice, mock call review, presentation, objection handling, closing, quotation, payment process, CRM, calendar setup, confidentiality and final certification.',
'Your onboarding track contains the required 20-module ProFox Sales Academy. Your 10-day completion window starts only after you successfully open this secure link, create your password and enter the Academy.'),
updated_at=now()
where template_key='recruitment_account_invite';

update public.notification_templates
set body_template='Hi {{fullName}},\n\nYour verified agreement is complete and your protected ProFox Sales Academy account is ready.\n\nComplete account setup using the most recent Academy invitation email. Your 10-day training completion window begins only after successful account setup.\n\nComplete every required module, assessment, candidate-controlled practical submission and final certification requirement in the assigned 20-module Sales Academy.\n\nTraining access is not live Sales access. CRM, customer and active selling permissions remain protected until Academy completion, Final Approval and activation.\n\nApplication reference: {{applicationReference}}\nSupport: {{supportEmail}}\n\nProFox Sales Academy\nProFox Web Designer\nhttps://www.profoxwebdesigner.com/',
updated_at=now()
where template_key='recruitment_training';

create or replace function public.queue_due_sales_academy_deadline_notifications()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_key text;
  v_days int;
  v_total int;
  v_completed int;
  v_percent int;
  v_queued int:=0;
  v_admin record;
begin
  select count(*) into v_total
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  where tm.track_key='sales' and tm.required=true and m.active=true;

  for v_app in
    select * from public.applicants
    where stage='Sales Academy Training'
      and linked_user_id is not null
      and academy_started_at is not null
      and academy_due_at is not null
      and academy_completed_at is null
      and coalesce(trim(refusal_reason),'')=''
  loop
    v_key := case
      when now()>=v_app.academy_due_at then 'overdue'
      when now()>=v_app.academy_due_at-interval '1 day' then 'final-day'
      when now()>=v_app.academy_due_at-interval '2 days' then '2-days'
      when now()>=v_app.academy_due_at-interval '3 days' then '3-days'
      when now()>=v_app.academy_due_at-interval '5 days' then '5-days'
      when now()>=v_app.academy_due_at-interval '7 days' then '7-days'
      else null end;
    if v_key is null or v_key=coalesce(v_app.academy_last_reminder_key,'') then continue; end if;

    select count(*) into v_completed
    from public.training_track_modules tm
    join public.training_modules m on m.id=tm.module_id
    join public.user_training_progress p on p.module_id=m.id and p.user_id=v_app.linked_user_id
    where tm.track_key='sales' and tm.required=true and m.active=true
      and p.status in ('Passed','Completed');
    v_percent := case when v_total=0 then 0 else round((v_completed::numeric/v_total::numeric)*100)::int end;
    v_days := greatest(0,ceil(extract(epoch from (v_app.academy_due_at-now()))/86400.0)::int);

    perform public.enqueue_notification(
      'recruitment:'||v_app.id::text||':sales-academy-deadline:'||v_key,
      'recruitment_academy_deadline_reminder',
      lower(trim(v_app.email)),
      v_app.linked_user_id,
      public.recruitment_notification_payload(v_app)||jsonb_build_object(
        'academyUrl','https://www.profoxwebdesigner.com/admin/app/sales_academy?tab=training',
        'deadlineLabel',to_char(v_app.academy_due_at at time zone 'UTC','FMMonth DD, YYYY HH24:MI')||' UTC',
        'deadlineStatus',case when v_key='overdue' then 'Deadline reached. Management review is required.' else 'Training window in progress.' end,
        'daysRemaining',v_days,
        'progressPercent',v_percent,
        'completedModules',v_completed,
        'totalModules',v_total,
        'applicationReference',v_app.application_reference
      ),
      now()
    );
    update public.applicants set academy_last_reminder_key=v_key,updated_at=now() where id=v_app.id;
    v_queued:=v_queued+1;

    if v_key='overdue' then
      for v_admin in select id from public.user_profiles where role='admin' and status='active' loop
        perform public.enqueue_in_app_notification(
          v_admin.id,
          'Sales Academy',
          'Sales Academy deadline reached',
          coalesce(v_app.full_name,'Candidate')||' reached the 10-day Sales Academy deadline. Review remaining candidate work and any Management-review blockers.',
          '/admin/app/recruitment?tab=recruitment',
          'sales-academy-overdue:'||v_app.id::text||':'||v_admin.id::text
        );
      end loop;
    end if;
  end loop;
  return jsonb_build_object('queued',v_queued);
end;
$$;

create or replace function public.queue_due_sales_automations()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_sales jsonb:='{}'::jsonb;
  v_operational jsonb:='{}'::jsonb;
  v_quote_customer jsonb:='{}'::jsonb;
  v_payment_customer jsonb:='{}'::jsonb;
  v_project_customer jsonb:='{}'::jsonb;
  v_recruitment jsonb:='{}'::jsonb;
  v_academy jsonb:='{}'::jsonb;
begin
  v_sales:=coalesce(public.queue_due_sales_automations_base(),'{}'::jsonb);
  v_operational:=coalesce(public.queue_due_operational_notifications(),'{}'::jsonb);
  v_quote_customer:=coalesce(public.queue_due_quotation_customer_communications(),'{}'::jsonb);
  v_payment_customer:=coalesce(public.queue_due_payment_customer_communications(),'{}'::jsonb);
  v_project_customer:=coalesce(public.queue_due_project_customer_communications(),'{}'::jsonb);
  v_recruitment:=coalesce(public.queue_due_recruitment_stage_sla(),'{}'::jsonb);
  v_academy:=coalesce(public.queue_due_sales_academy_deadline_notifications(),'{}'::jsonb);
  return v_sales
    ||jsonb_build_object('module10Operational',v_operational)
    ||jsonb_build_object('module11Customer',v_quote_customer||v_payment_customer||v_project_customer)
    ||jsonb_build_object('recruitmentOperational',v_recruitment)
    ||jsonb_build_object('salesAcademyDeadline',v_academy);
end;
$$;
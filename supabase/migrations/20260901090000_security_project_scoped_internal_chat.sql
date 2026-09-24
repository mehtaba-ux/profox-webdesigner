-- Project-scoped internal communications security.
-- Default deny: legacy threads without a project_id remain preserved but inaccessible.
-- Internal staff access is derived from live project ownership/assignment records.

alter table public.internal_chat_threads
  add column if not exists project_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'internal_chat_threads_project_id_fkey'
      and conrelid = 'public.internal_chat_threads'::regclass
  ) then
    alter table public.internal_chat_threads
      add constraint internal_chat_threads_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null;
  end if;
end;
$$;

alter table public.internal_chat_threads
  drop constraint if exists internal_chat_threads_unique_pair;

create unique index if not exists internal_chat_threads_project_pair_uidx
  on public.internal_chat_threads(project_id, participant_one, participant_two)
  where project_id is not null;

create unique index if not exists internal_chat_threads_legacy_pair_uidx
  on public.internal_chat_threads(participant_one, participant_two)
  where project_id is null;

create index if not exists internal_chat_threads_project_id_idx
  on public.internal_chat_threads(project_id);

create table if not exists public.internal_chat_access_audit (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  project_id uuid,
  user_id uuid,
  peer_user_id uuid,
  thread_id uuid,
  source text not null default 'system',
  source_id uuid,
  actor_user_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists internal_chat_access_audit_project_idx
  on public.internal_chat_access_audit(project_id, created_at desc);
create index if not exists internal_chat_access_audit_user_idx
  on public.internal_chat_access_audit(user_id, created_at desc);
create index if not exists internal_chat_access_audit_thread_idx
  on public.internal_chat_access_audit(thread_id, created_at desc);

alter table public.internal_chat_access_audit enable row level security;
revoke all on table public.internal_chat_access_audit from anon, authenticated;
grant all on table public.internal_chat_access_audit to service_role;

create or replace function public.internal_chat_project_is_communicable(
  p_status text,
  p_completed_at timestamptz
)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select p_completed_at is null
    and lower(btrim(coalesce(p_status, ''))) in ('active', 'in progress', 'on hold');
$function$;

create or replace function public.internal_chat_task_assignment_is_active(
  p_status text,
  p_completed_at timestamptz
)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select p_completed_at is null
    and lower(btrim(coalesce(p_status, ''))) in (
      'to do', 'todo', 'pending', 'active', 'in progress', 'blocked', 'in review', 'changes required'
    );
$function$;

create or replace function public.internal_chat_worker_assignment_is_active(p_status text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select btrim(coalesce(p_status, '')) in (
    'Accepted', 'In Progress', 'In Review', 'Changes Required', 'On Hold', 'Disputed'
  );
$function$;

create or replace function public.internal_chat_user_has_project_access(
  p_project_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
    from public.user_profiles u
    join public.projects pr on pr.id = p_project_id
    left join public.clients c on c.id = pr.client_id
    left join public.crm_opportunities o on o.id = pr.source_opportunity_id
    where u.id = p_user_id
      and lower(coalesce(u.status, '')) = 'active'
      and lower(coalesce(u.role, '')) not in ('', 'customer', 'client', 'pending', 'talent_partner')
      and public.internal_chat_project_is_communicable(pr.status, pr.completed_at)
      and (
        lower(coalesce(u.role, '')) = 'admin'
        or pr.project_manager_id = p_user_id
        or c.salesperson_id = p_user_id
        or o.salesperson_id = p_user_id
        or exists (
          select 1
          from public.project_team pt
          where pt.project_id = pr.id
            and pt.user_id = p_user_id
        )
        or exists (
          select 1
          from public.project_tasks task
          where task.project_id = pr.id
            and task.assigned_to = p_user_id
            and public.internal_chat_task_assignment_is_active(task.status, task.completed_at)
        )
        or exists (
          select 1
          from public.worker_work_assignments wa
          where wa.project_id = pr.id
            and wa.writer_user_id = p_user_id
            and public.internal_chat_worker_assignment_is_active(wa.status)
        )
      )
  );
$function$;

create or replace function public.internal_chat_project_pair_allowed(
  p_project_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select p_project_id is not null
    and p_user_a is not null
    and p_user_b is not null
    and p_user_a is distinct from p_user_b
    and public.internal_chat_pair_allowed(p_user_a, p_user_b)
    and public.internal_chat_user_has_project_access(p_project_id, p_user_a)
    and public.internal_chat_user_has_project_access(p_project_id, p_user_b);
$function$;

create or replace function public.internal_chat_current_user_pair_allowed(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select auth.uid() is not null
    and auth.uid() in (p_user_a, p_user_b)
    and exists (
      select 1
      from public.projects pr
      where public.internal_chat_project_pair_allowed(pr.id, p_user_a, p_user_b)
    );
$function$;

create or replace function public.internal_chat_can_access_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
    from public.internal_chat_threads t
    where t.id = p_thread_id
      and t.project_id is not null
      and auth.uid() in (t.participant_one, t.participant_two)
      and public.internal_chat_project_pair_allowed(
        t.project_id,
        t.participant_one,
        t.participant_two
      )
  );
$function$;

-- Return project-scoped contacts. One person may appear once per shared project.
drop function if exists public.internal_chat_contacts();
create function public.internal_chat_contacts()
returns table(
  project_id uuid,
  project_name text,
  user_id uuid,
  full_name text,
  role text,
  department text,
  avatar_url text,
  communication_scope text
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  return query
  select
    pr.id,
    pr.project_name::text,
    p.id,
    coalesce(nullif(p.full_name, ''), p.email, 'Team member')::text,
    p.role::text,
    coalesce(p.department, 'General')::text,
    coalesce(p.avatar_url, '')::text,
    case
      when p.role in ('admin', 'project_manager', 'site_manager') then 'Manager'
      when p.role in ('content_writer', 'uiux_designer', 'developer', 'web_developer', 'developer_designer') then 'Delivery Collaboration'
      else 'Internal'
    end::text
  from public.projects pr
  join public.user_profiles p
    on p.id <> v_uid
  where public.internal_chat_user_has_project_access(pr.id, v_uid)
    and public.internal_chat_project_pair_allowed(pr.id, v_uid, p.id)
  order by
    lower(pr.project_name),
    case when p.role in ('admin', 'project_manager', 'site_manager') then 0 else 1 end,
    lower(coalesce(nullif(p.full_name, ''), p.email, ''));
end;
$function$;

-- Return only threads that remain authorized for their exact project.
drop function if exists public.internal_chat_list_threads();
create function public.internal_chat_list_threads()
returns table(
  project_id uuid,
  project_name text,
  thread_id uuid,
  other_user_id uuid,
  other_full_name text,
  other_role text,
  other_department text,
  other_avatar_url text,
  last_message_preview text,
  last_message_sender_id uuid,
  last_message_at timestamptz,
  unread_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  return query
  select
    t.project_id,
    pr.project_name::text,
    t.id,
    other.id,
    coalesce(nullif(other.full_name, ''), other.email, 'Team member')::text,
    other.role::text,
    coalesce(other.department, 'General')::text,
    coalesce(other.avatar_url, '')::text,
    coalesce(t.last_message_preview, '')::text,
    t.last_message_sender_id,
    t.last_message_at,
    (
      select count(*)
      from public.internal_chat_messages m
      where m.thread_id = t.id
        and m.sender_id <> v_uid
        and m.created_at > case
          when t.participant_one = v_uid then t.participant_one_last_read_at
          else t.participant_two_last_read_at
        end
    )::bigint
  from public.internal_chat_threads t
  join public.projects pr on pr.id = t.project_id
  join public.user_profiles other
    on other.id = case
      when t.participant_one = v_uid then t.participant_two
      else t.participant_one
    end
  where v_uid in (t.participant_one, t.participant_two)
    and public.internal_chat_can_access_thread(t.id)
  order by coalesce(t.last_message_at, t.created_at) desc;
end;
$function$;

-- Explicit project-aware thread creation used by the current client.
create or replace function public.internal_chat_get_or_create_thread(
  p_other_user_id uuid,
  p_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_one uuid;
  v_two uuid;
  v_thread_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;
  if p_project_id is null then
    raise exception 'Project context is required.';
  end if;
  if p_other_user_id is null or p_other_user_id = v_uid then
    raise exception 'Choose another team member.';
  end if;
  if not public.internal_chat_project_pair_allowed(p_project_id, v_uid, p_other_user_id) then
    raise exception 'This project conversation is not permitted by the internal communication policy.';
  end if;

  if v_uid::text < p_other_user_id::text then
    v_one := v_uid;
    v_two := p_other_user_id;
  else
    v_one := p_other_user_id;
    v_two := v_uid;
  end if;

  select t.id into v_thread_id
  from public.internal_chat_threads t
  where t.project_id = p_project_id
    and t.participant_one = v_one
    and t.participant_two = v_two;

  if v_thread_id is null then
    insert into public.internal_chat_threads (
      project_id,
      participant_one,
      participant_two,
      created_by,
      participant_one_last_read_at,
      participant_two_last_read_at
    ) values (
      p_project_id,
      v_one,
      v_two,
      v_uid,
      now(),
      now()
    )
    on conflict do nothing;

    select t.id into v_thread_id
    from public.internal_chat_threads t
    where t.project_id = p_project_id
      and t.participant_one = v_one
      and t.participant_two = v_two;
  end if;

  if v_thread_id is null then
    raise exception 'Unable to open project conversation.';
  end if;

  return v_thread_id;
end;
$function$;

-- Backward-compatible resolver for stale clients. It refuses ambiguous pairs.
create or replace function public.internal_chat_get_or_create_thread(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_projects uuid[];
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;
  if p_other_user_id is null or p_other_user_id = v_uid then
    raise exception 'Choose another team member.';
  end if;

  select coalesce(array_agg(pr.id order by pr.id), array[]::uuid[])
    into v_projects
  from public.projects pr
  where public.internal_chat_project_pair_allowed(pr.id, v_uid, p_other_user_id);

  if cardinality(v_projects) = 0 then
    raise exception 'No active assigned project permits this conversation.';
  end if;
  if cardinality(v_projects) > 1 then
    raise exception 'Project context is required because you share more than one project.';
  end if;

  return public.internal_chat_get_or_create_thread(p_other_user_id, v_projects[1]);
end;
$function$;

-- The message/read RPCs already call internal_chat_can_access_thread();
-- replacing that function above makes all existing read/write paths project-safe.

drop policy if exists internal_chat_threads_select on public.internal_chat_threads;
create policy internal_chat_threads_select
  on public.internal_chat_threads
  for select
  to authenticated
  using (public.internal_chat_can_access_thread(id));

drop policy if exists internal_chat_messages_select on public.internal_chat_messages;
create policy internal_chat_messages_select
  on public.internal_chat_messages
  for select
  to authenticated
  using (public.internal_chat_can_access_thread(thread_id));

-- Authenticated clients may read through RLS but cannot mutate tables directly.
revoke truncate, trigger, references on table public.internal_chat_threads from authenticated;
revoke truncate, trigger, references on table public.internal_chat_messages from authenticated;

-- Audit helper. It is trigger/service-only; authenticated users cannot invoke it.
create or replace function public.internal_chat_record_access_audit(
  p_event_type text,
  p_project_id uuid,
  p_user_id uuid,
  p_source text,
  p_source_id uuid default null,
  p_peer_user_id uuid default null,
  p_thread_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.internal_chat_access_audit (
    event_type,
    project_id,
    user_id,
    peer_user_id,
    thread_id,
    source,
    source_id,
    actor_user_id,
    details
  ) values (
    p_event_type,
    p_project_id,
    p_user_id,
    p_peer_user_id,
    p_thread_id,
    coalesce(nullif(p_source, ''), 'system'),
    p_source_id,
    auth.uid(),
    coalesce(p_details, '{}'::jsonb)
  );
end;
$function$;

create or replace function public.internal_chat_audit_project_team()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.project_id is not null and new.user_id is not null then
      perform public.internal_chat_record_access_audit(
        'access_source_granted', new.project_id, new.user_id, 'project_team', new.id,
        null, null, jsonb_build_object('role', new.role)
      );
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.project_id is not null and old.user_id is not null then
      perform public.internal_chat_record_access_audit(
        'access_source_revoked', old.project_id, old.user_id, 'project_team', old.id,
        null, null, jsonb_build_object('role', old.role)
      );
    end if;
    return old;
  end if;

  if old.project_id is distinct from new.project_id or old.user_id is distinct from new.user_id then
    if old.project_id is not null and old.user_id is not null then
      perform public.internal_chat_record_access_audit(
        'access_source_revoked', old.project_id, old.user_id, 'project_team', old.id,
        null, null, jsonb_build_object('role', old.role)
      );
    end if;
    if new.project_id is not null and new.user_id is not null then
      perform public.internal_chat_record_access_audit(
        'access_source_granted', new.project_id, new.user_id, 'project_team', new.id,
        null, null, jsonb_build_object('role', new.role)
      );
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists internal_chat_audit_project_team_trg on public.project_team;
create trigger internal_chat_audit_project_team_trg
after insert or delete or update of project_id, user_id on public.project_team
for each row execute function public.internal_chat_audit_project_team();

create or replace function public.internal_chat_audit_project_tasks()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_old_active boolean := false;
  v_new_active boolean := false;
begin
  if tg_op <> 'INSERT' then
    v_old_active := old.project_id is not null
      and old.assigned_to is not null
      and public.internal_chat_task_assignment_is_active(old.status, old.completed_at);
  end if;
  if tg_op <> 'DELETE' then
    v_new_active := new.project_id is not null
      and new.assigned_to is not null
      and public.internal_chat_task_assignment_is_active(new.status, new.completed_at);
  end if;

  if v_old_active and (
    tg_op = 'DELETE'
    or not v_new_active
    or old.project_id is distinct from new.project_id
    or old.assigned_to is distinct from new.assigned_to
  ) then
    perform public.internal_chat_record_access_audit(
      'access_source_revoked', old.project_id, old.assigned_to, 'project_tasks', old.id,
      null, null, jsonb_build_object('status', old.status)
    );
  end if;

  if v_new_active and (
    tg_op = 'INSERT'
    or not v_old_active
    or old.project_id is distinct from new.project_id
    or old.assigned_to is distinct from new.assigned_to
  ) then
    perform public.internal_chat_record_access_audit(
      'access_source_granted', new.project_id, new.assigned_to, 'project_tasks', new.id,
      null, null, jsonb_build_object('status', new.status)
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists internal_chat_audit_project_tasks_trg on public.project_tasks;
create trigger internal_chat_audit_project_tasks_trg
after insert or delete or update of project_id, assigned_to, status, completed_at on public.project_tasks
for each row execute function public.internal_chat_audit_project_tasks();

create or replace function public.internal_chat_audit_worker_assignments()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_old_active boolean := false;
  v_new_active boolean := false;
begin
  if tg_op <> 'INSERT' then
    v_old_active := public.internal_chat_worker_assignment_is_active(old.status);
  end if;
  if tg_op <> 'DELETE' then
    v_new_active := public.internal_chat_worker_assignment_is_active(new.status);
  end if;

  if v_old_active and (
    tg_op = 'DELETE'
    or not v_new_active
    or old.project_id is distinct from new.project_id
    or old.writer_user_id is distinct from new.writer_user_id
  ) then
    perform public.internal_chat_record_access_audit(
      'access_source_revoked', old.project_id, old.writer_user_id, 'worker_work_assignments', old.id,
      null, null, jsonb_build_object('status', old.status)
    );
  end if;

  if v_new_active and (
    tg_op = 'INSERT'
    or not v_old_active
    or old.project_id is distinct from new.project_id
    or old.writer_user_id is distinct from new.writer_user_id
  ) then
    perform public.internal_chat_record_access_audit(
      'access_source_granted', new.project_id, new.writer_user_id, 'worker_work_assignments', new.id,
      null, null, jsonb_build_object('status', new.status)
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists internal_chat_audit_worker_assignments_trg on public.worker_work_assignments;
create trigger internal_chat_audit_worker_assignments_trg
after insert or delete or update of project_id, writer_user_id, status on public.worker_work_assignments
for each row execute function public.internal_chat_audit_worker_assignments();

create or replace function public.internal_chat_audit_projects()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid;
  v_old_open boolean := false;
  v_new_open boolean := false;
begin
  if tg_op <> 'INSERT' then
    v_old_open := public.internal_chat_project_is_communicable(old.status, old.completed_at);
  end if;
  if tg_op <> 'DELETE' then
    v_new_open := public.internal_chat_project_is_communicable(new.status, new.completed_at);
  end if;

  if tg_op <> 'INSERT' and old.project_manager_id is distinct from (case when tg_op = 'DELETE' then null else new.project_manager_id end) then
    if old.project_manager_id is not null then
      perform public.internal_chat_record_access_audit(
        'access_source_revoked', old.id, old.project_manager_id, 'project_manager', old.id
      );
    end if;
  end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.project_manager_id is distinct from old.project_manager_id) then
    if new.project_manager_id is not null then
      perform public.internal_chat_record_access_audit(
        'access_source_granted', new.id, new.project_manager_id, 'project_manager', new.id
      );
    end if;
  end if;

  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.client_id is distinct from old.client_id) then
    if tg_op = 'UPDATE' and old.client_id is not null then
      select c.salesperson_id into v_user from public.clients c where c.id = old.client_id;
      if v_user is not null then
        perform public.internal_chat_record_access_audit(
          'access_source_revoked', old.id, v_user, 'client_salesperson', old.client_id
        );
      end if;
    end if;
    if new.client_id is not null then
      select c.salesperson_id into v_user from public.clients c where c.id = new.client_id;
      if v_user is not null then
        perform public.internal_chat_record_access_audit(
          'access_source_granted', new.id, v_user, 'client_salesperson', new.client_id
        );
      end if;
    end if;
  elsif tg_op = 'DELETE' and old.client_id is not null then
    select c.salesperson_id into v_user from public.clients c where c.id = old.client_id;
    if v_user is not null then
      perform public.internal_chat_record_access_audit(
        'access_source_revoked', old.id, v_user, 'client_salesperson', old.client_id
      );
    end if;
  end if;

  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.source_opportunity_id is distinct from old.source_opportunity_id) then
    if tg_op = 'UPDATE' and old.source_opportunity_id is not null then
      select o.salesperson_id into v_user from public.crm_opportunities o where o.id = old.source_opportunity_id;
      if v_user is not null then
        perform public.internal_chat_record_access_audit(
          'access_source_revoked', old.id, v_user, 'opportunity_salesperson', old.source_opportunity_id
        );
      end if;
    end if;
    if new.source_opportunity_id is not null then
      select o.salesperson_id into v_user from public.crm_opportunities o where o.id = new.source_opportunity_id;
      if v_user is not null then
        perform public.internal_chat_record_access_audit(
          'access_source_granted', new.id, v_user, 'opportunity_salesperson', new.source_opportunity_id
        );
      end if;
    end if;
  elsif tg_op = 'DELETE' and old.source_opportunity_id is not null then
    select o.salesperson_id into v_user from public.crm_opportunities o where o.id = old.source_opportunity_id;
    if v_user is not null then
      perform public.internal_chat_record_access_audit(
        'access_source_revoked', old.id, v_user, 'opportunity_salesperson', old.source_opportunity_id
      );
    end if;
  end if;

  if tg_op = 'UPDATE' and v_old_open is distinct from v_new_open then
    insert into public.internal_chat_access_audit (
      event_type, project_id, user_id, source, source_id, actor_user_id, details
    )
    select
      case when v_new_open then 'project_communication_opened' else 'project_communication_closed' end,
      new.id,
      entitled.user_id,
      'projects',
      new.id,
      auth.uid(),
      jsonb_build_object('status', new.status, 'completed_at', new.completed_at)
    from (
      select new.project_manager_id as user_id
      union select c.salesperson_id from public.clients c where c.id = new.client_id
      union select o.salesperson_id from public.crm_opportunities o where o.id = new.source_opportunity_id
      union select pt.user_id from public.project_team pt where pt.project_id = new.id
      union select task.assigned_to from public.project_tasks task
        where task.project_id = new.id
          and public.internal_chat_task_assignment_is_active(task.status, task.completed_at)
      union select wa.writer_user_id from public.worker_work_assignments wa
        where wa.project_id = new.id
          and public.internal_chat_worker_assignment_is_active(wa.status)
    ) entitled
    where entitled.user_id is not null;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists internal_chat_audit_projects_trg on public.projects;
create trigger internal_chat_audit_projects_trg
after insert or delete or update of project_manager_id, client_id, source_opportunity_id, status, completed_at on public.projects
for each row execute function public.internal_chat_audit_projects();

create or replace function public.internal_chat_audit_client_salesperson()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if old.salesperson_id is not distinct from new.salesperson_id then
    return new;
  end if;

  if old.salesperson_id is not null then
    insert into public.internal_chat_access_audit (
      event_type, project_id, user_id, source, source_id, actor_user_id
    )
    select 'access_source_revoked', pr.id, old.salesperson_id, 'client_salesperson', new.id, auth.uid()
    from public.projects pr
    where pr.client_id = new.id;
  end if;

  if new.salesperson_id is not null then
    insert into public.internal_chat_access_audit (
      event_type, project_id, user_id, source, source_id, actor_user_id
    )
    select 'access_source_granted', pr.id, new.salesperson_id, 'client_salesperson', new.id, auth.uid()
    from public.projects pr
    where pr.client_id = new.id;
  end if;

  return new;
end;
$function$;

drop trigger if exists internal_chat_audit_client_salesperson_trg on public.clients;
create trigger internal_chat_audit_client_salesperson_trg
after update of salesperson_id on public.clients
for each row execute function public.internal_chat_audit_client_salesperson();

create or replace function public.internal_chat_audit_opportunity_salesperson()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if old.salesperson_id is not distinct from new.salesperson_id then
    return new;
  end if;

  if old.salesperson_id is not null then
    insert into public.internal_chat_access_audit (
      event_type, project_id, user_id, source, source_id, actor_user_id
    )
    select 'access_source_revoked', pr.id, old.salesperson_id, 'opportunity_salesperson', new.id, auth.uid()
    from public.projects pr
    where pr.source_opportunity_id = new.id;
  end if;

  if new.salesperson_id is not null then
    insert into public.internal_chat_access_audit (
      event_type, project_id, user_id, source, source_id, actor_user_id
    )
    select 'access_source_granted', pr.id, new.salesperson_id, 'opportunity_salesperson', new.id, auth.uid()
    from public.projects pr
    where pr.source_opportunity_id = new.id;
  end if;

  return new;
end;
$function$;

drop trigger if exists internal_chat_audit_opportunity_salesperson_trg on public.crm_opportunities;
create trigger internal_chat_audit_opportunity_salesperson_trg
after update of salesperson_id on public.crm_opportunities
for each row execute function public.internal_chat_audit_opportunity_salesperson();

create or replace function public.internal_chat_audit_thread_creation()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.project_id is not null then
    perform public.internal_chat_record_access_audit(
      'thread_created', new.project_id, new.created_by, 'internal_chat_threads', new.id,
      case when new.created_by = new.participant_one then new.participant_two else new.participant_one end,
      new.id,
      '{}'::jsonb
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists internal_chat_audit_thread_creation_trg on public.internal_chat_threads;
create trigger internal_chat_audit_thread_creation_trg
after insert on public.internal_chat_threads
for each row execute function public.internal_chat_audit_thread_creation();

-- RPC permissions: only authenticated staff clients and service-role backends may call public chat endpoints.
revoke all on function public.internal_chat_project_is_communicable(text, timestamptz) from public, anon, authenticated;
revoke all on function public.internal_chat_task_assignment_is_active(text, timestamptz) from public, anon, authenticated;
revoke all on function public.internal_chat_worker_assignment_is_active(text) from public, anon, authenticated;
revoke all on function public.internal_chat_user_has_project_access(uuid, uuid) from public, anon, authenticated;
revoke all on function public.internal_chat_project_pair_allowed(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.internal_chat_record_access_audit(text, uuid, uuid, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.internal_chat_audit_project_team() from public, anon, authenticated;
revoke all on function public.internal_chat_audit_project_tasks() from public, anon, authenticated;
revoke all on function public.internal_chat_audit_worker_assignments() from public, anon, authenticated;
revoke all on function public.internal_chat_audit_projects() from public, anon, authenticated;
revoke all on function public.internal_chat_audit_client_salesperson() from public, anon, authenticated;
revoke all on function public.internal_chat_audit_opportunity_salesperson() from public, anon, authenticated;
revoke all on function public.internal_chat_audit_thread_creation() from public, anon, authenticated;

grant execute on function public.internal_chat_project_is_communicable(text, timestamptz) to service_role;
grant execute on function public.internal_chat_task_assignment_is_active(text, timestamptz) to service_role;
grant execute on function public.internal_chat_worker_assignment_is_active(text) to service_role;
grant execute on function public.internal_chat_user_has_project_access(uuid, uuid) to service_role;
grant execute on function public.internal_chat_project_pair_allowed(uuid, uuid, uuid) to service_role;
grant execute on function public.internal_chat_record_access_audit(text, uuid, uuid, text, uuid, uuid, uuid, jsonb) to service_role;

revoke all on function public.internal_chat_contacts() from public, anon;
revoke all on function public.internal_chat_list_threads() from public, anon;
revoke all on function public.internal_chat_get_or_create_thread(uuid) from public, anon;
revoke all on function public.internal_chat_get_or_create_thread(uuid, uuid) from public, anon;
revoke all on function public.internal_chat_can_access_thread(uuid) from public, anon;
revoke all on function public.internal_chat_current_user_pair_allowed(uuid, uuid) from public, anon;

grant execute on function public.internal_chat_contacts() to authenticated, service_role;
grant execute on function public.internal_chat_list_threads() to authenticated, service_role;
grant execute on function public.internal_chat_get_or_create_thread(uuid) to authenticated, service_role;
grant execute on function public.internal_chat_get_or_create_thread(uuid, uuid) to authenticated, service_role;
grant execute on function public.internal_chat_can_access_thread(uuid) to authenticated, service_role;
grant execute on function public.internal_chat_current_user_pair_allowed(uuid, uuid) to authenticated, service_role;

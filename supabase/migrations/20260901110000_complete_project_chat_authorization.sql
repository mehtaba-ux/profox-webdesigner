-- Complete project chat authorization without widening access globally.
-- 1) Allow Sales <-> Delivery only when both users are assigned to the same open project.
-- 2) Preserve manager bridges and same-family Sales/Delivery collaboration.
-- 3) Add explicit, revocable project-level Delivery <-> Client chat grants.
-- 4) Keep all customer access default-deny unless an authorized Seller/Manager grants it.

create or replace function public.internal_chat_normalize_role(p_role text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select lower(replace(replace(btrim(coalesce(p_role, '')), '-', '_'), ' ', '_'));
$function$;

create or replace function public.internal_chat_is_manager_role(p_role text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select public.internal_chat_normalize_role(p_role) = any (
    array['admin','management','manager','project_manager','site_manager']::text[]
  );
$function$;

create or replace function public.internal_chat_is_sales_role(p_role text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select public.internal_chat_normalize_role(p_role) = any (
    array['sales','sales_manager','salesmanager','salesman','salesperson','seller']::text[]
  );
$function$;

create or replace function public.internal_chat_is_delivery_role(p_role text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select public.internal_chat_normalize_role(p_role) = any (
    array[
      'content_writer','contentwriter','content_creator','contentcreator',
      'developer','web_developer','webdeveloper','developer_designer',
      'uiux_designer','uiuxdesigner','ui_designer','ux_designer'
    ]::text[]
  );
$function$;

create or replace function public.internal_chat_is_customer_role(p_role text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select public.internal_chat_normalize_role(p_role) = any (array['customer','client']::text[]);
$function$;

create or replace function public.internal_chat_roles_can_connect(p_role_a text, p_role_b text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select case
    when public.internal_chat_normalize_role(p_role_a) = ''
      or public.internal_chat_normalize_role(p_role_b) = '' then false
    when public.internal_chat_is_customer_role(p_role_a)
      or public.internal_chat_is_customer_role(p_role_b)
      or public.internal_chat_normalize_role(p_role_a) = any (array['pending','talent_partner']::text[])
      or public.internal_chat_normalize_role(p_role_b) = any (array['pending','talent_partner']::text[]) then false
    when public.internal_chat_is_manager_role(p_role_a)
      or public.internal_chat_is_manager_role(p_role_b) then true
    when public.internal_chat_is_sales_role(p_role_a)
      and public.internal_chat_is_sales_role(p_role_b) then true
    when public.internal_chat_is_delivery_role(p_role_a)
      and public.internal_chat_is_delivery_role(p_role_b) then true
    when (public.internal_chat_is_sales_role(p_role_a) and public.internal_chat_is_delivery_role(p_role_b))
      or (public.internal_chat_is_delivery_role(p_role_a) and public.internal_chat_is_sales_role(p_role_b)) then true
    else false
  end;
$function$;

-- Keep the generic staff-pair check customer-free. Customer access is handled only by
-- the explicit project grant path in internal_chat_project_pair_allowed().
create or replace function public.internal_chat_pair_allowed(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
    from public.user_profiles a
    join public.user_profiles b on b.id = p_user_b
    where a.id = p_user_a
      and p_user_a is distinct from p_user_b
      and lower(coalesce(a.status, '')) = 'active'
      and lower(coalesce(b.status, '')) = 'active'
      and public.internal_chat_roles_can_connect(a.role, b.role)
  );
$function$;

create table if not exists public.project_delivery_client_chat_grants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  customer_user_id uuid not null,
  delivery_user_id uuid not null,
  granted_by uuid not null,
  is_active boolean not null default true,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_delivery_client_chat_grants_distinct_users
    check (customer_user_id <> delivery_user_id),
  constraint project_delivery_client_chat_grants_expiry
    check (expires_at is null or expires_at > granted_at),
  unique (project_id, customer_user_id, delivery_user_id)
);

create index if not exists project_delivery_client_chat_grants_delivery_idx
  on public.project_delivery_client_chat_grants(delivery_user_id, project_id)
  where is_active;
create index if not exists project_delivery_client_chat_grants_customer_idx
  on public.project_delivery_client_chat_grants(customer_user_id, project_id)
  where is_active;
create index if not exists project_delivery_client_chat_grants_project_idx
  on public.project_delivery_client_chat_grants(project_id, is_active);

alter table public.project_delivery_client_chat_grants enable row level security;
revoke all on table public.project_delivery_client_chat_grants from public, anon, authenticated;
grant select on table public.project_delivery_client_chat_grants to service_role;

create or replace function public.internal_chat_customer_has_project_access(
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
    from public.projects pr
    join public.clients c on c.id = pr.client_id
    join public.user_profiles u on u.id = p_user_id
    where pr.id = p_project_id
      and c.linked_user_id = p_user_id
      and lower(coalesce(u.status, '')) = 'active'
      and public.internal_chat_is_customer_role(u.role)
      and public.internal_chat_project_is_communicable(pr.status, pr.completed_at)
  );
$function$;

create or replace function public.internal_chat_delivery_client_grant_active(
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
  select exists (
    select 1
    from public.project_delivery_client_chat_grants g
    join public.user_profiles d on d.id = g.delivery_user_id
    where g.project_id = p_project_id
      and g.is_active
      and (g.expires_at is null or g.expires_at > now())
      and g.customer_user_id = any (array[p_user_a, p_user_b]::uuid[])
      and g.delivery_user_id = any (array[p_user_a, p_user_b]::uuid[])
      and g.customer_user_id <> g.delivery_user_id
      and lower(coalesce(d.status, '')) = 'active'
      and public.internal_chat_is_delivery_role(d.role)
      and public.internal_chat_customer_has_project_access(p_project_id, g.customer_user_id)
      and public.internal_chat_user_has_project_access(p_project_id, g.delivery_user_id)
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
    and (
      (
        public.internal_chat_pair_allowed(p_user_a, p_user_b)
        and public.internal_chat_user_has_project_access(p_project_id, p_user_a)
        and public.internal_chat_user_has_project_access(p_project_id, p_user_b)
      )
      or public.internal_chat_delivery_client_grant_active(p_project_id, p_user_a, p_user_b)
    );
$function$;

create or replace function public.internal_chat_can_manage_client_chat(
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
    from public.projects pr
    left join public.clients c on c.id = pr.client_id
    left join public.crm_opportunities o on o.id = pr.source_opportunity_id
    join public.user_profiles u on u.id = p_user_id
    where pr.id = p_project_id
      and lower(coalesce(u.status, '')) = 'active'
      and public.internal_chat_project_is_communicable(pr.status, pr.completed_at)
      and (
        (
          public.internal_chat_is_manager_role(u.role)
          and public.internal_chat_user_has_project_access(pr.id, p_user_id)
        )
        or (
          public.internal_chat_is_sales_role(u.role)
          and (c.salesperson_id = p_user_id or o.salesperson_id = p_user_id)
        )
      )
  );
$function$;

create or replace function public.internal_chat_set_delivery_client_access(
  p_project_id uuid,
  p_delivery_user_id uuid,
  p_allow boolean,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_client_id uuid;
  v_customer_user_id uuid;
  v_delivery_role text;
  v_grant_id uuid;
  v_thread_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;
  if p_project_id is null or p_delivery_user_id is null then
    raise exception 'Project and delivery member are required.';
  end if;
  if not public.internal_chat_can_manage_client_chat(p_project_id, v_uid) then
    raise exception 'You are not authorized to manage client chat for this project.';
  end if;

  select pr.client_id, c.linked_user_id
    into v_client_id, v_customer_user_id
  from public.projects pr
  join public.clients c on c.id = pr.client_id
  where pr.id = p_project_id;

  if v_client_id is null or v_customer_user_id is null then
    raise exception 'This project does not have an active linked Client Portal identity.';
  end if;
  if not public.internal_chat_customer_has_project_access(p_project_id, v_customer_user_id) then
    raise exception 'The linked customer is not currently eligible for project chat.';
  end if;

  select p.role into v_delivery_role
  from public.user_profiles p
  where p.id = p_delivery_user_id
    and lower(coalesce(p.status, '')) = 'active';

  if not public.internal_chat_is_delivery_role(v_delivery_role)
     or not public.internal_chat_user_has_project_access(p_project_id, p_delivery_user_id) then
    raise exception 'Choose an active delivery member assigned to this project.';
  end if;

  if coalesce(p_allow, false) and p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Expiry must be in the future.';
  end if;

  if coalesce(p_allow, false) then
    insert into public.project_delivery_client_chat_grants (
      project_id, client_id, customer_user_id, delivery_user_id, granted_by,
      is_active, granted_at, revoked_at, expires_at, updated_at
    ) values (
      p_project_id, v_client_id, v_customer_user_id, p_delivery_user_id, v_uid,
      true, now(), null, p_expires_at, now()
    )
    on conflict (project_id, customer_user_id, delivery_user_id)
    do update set
      client_id = excluded.client_id,
      granted_by = excluded.granted_by,
      is_active = true,
      granted_at = now(),
      revoked_at = null,
      expires_at = excluded.expires_at,
      updated_at = now()
    returning id into v_grant_id;

    perform public.internal_chat_record_access_audit(
      'client_chat_granted', p_project_id, p_delivery_user_id,
      'project_delivery_client_chat_grants', v_grant_id,
      v_customer_user_id, null,
      jsonb_build_object('expires_at', p_expires_at)
    );
  else
    update public.project_delivery_client_chat_grants g
    set is_active = false,
        revoked_at = now(),
        updated_at = now()
    where g.project_id = p_project_id
      and g.customer_user_id = v_customer_user_id
      and g.delivery_user_id = p_delivery_user_id
      and g.is_active
    returning g.id into v_grant_id;

    if v_grant_id is null then
      raise exception 'No active client-chat grant exists for this delivery member.';
    end if;

    select t.id into v_thread_id
    from public.internal_chat_threads t
    where t.project_id = p_project_id
      and v_customer_user_id in (t.participant_one, t.participant_two)
      and p_delivery_user_id in (t.participant_one, t.participant_two)
    limit 1;

    perform public.internal_chat_record_access_audit(
      'client_chat_revoked', p_project_id, p_delivery_user_id,
      'project_delivery_client_chat_grants', v_grant_id,
      v_customer_user_id, v_thread_id, '{}'::jsonb
    );
  end if;

  return v_grant_id;
end;
$function$;

create or replace function public.internal_chat_client_access_options()
returns table(
  project_id uuid,
  project_name text,
  customer_user_id uuid,
  customer_name text,
  delivery_user_id uuid,
  delivery_name text,
  delivery_role text,
  grant_id uuid,
  is_active boolean,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select
    pr.id,
    pr.project_name::text,
    c.linked_user_id,
    coalesce(nullif(c.primary_contact_name, ''), cu.full_name, c.email, 'Client')::text,
    d.id,
    coalesce(nullif(d.full_name, ''), d.email, 'Delivery member')::text,
    d.role::text,
    g.id,
    coalesce(g.is_active and (g.expires_at is null or g.expires_at > now()), false),
    g.expires_at
  from public.projects pr
  join public.clients c on c.id = pr.client_id and c.linked_user_id is not null
  join public.user_profiles cu on cu.id = c.linked_user_id
  join public.user_profiles d
    on lower(coalesce(d.status, '')) = 'active'
   and public.internal_chat_is_delivery_role(d.role)
   and public.internal_chat_user_has_project_access(pr.id, d.id)
  left join public.project_delivery_client_chat_grants g
    on g.project_id = pr.id
   and g.customer_user_id = c.linked_user_id
   and g.delivery_user_id = d.id
  where auth.uid() is not null
    and public.internal_chat_can_manage_client_chat(pr.id, auth.uid())
    and public.internal_chat_customer_has_project_access(pr.id, c.linked_user_id)
  order by lower(pr.project_name), lower(coalesce(nullif(d.full_name, ''), d.email, ''));
$function$;

-- Contacts are now derived from the complete project-pair policy. A customer can only
-- see explicitly granted delivery people; delivery can only see explicitly granted clients.
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
    coalesce(nullif(p.full_name, ''), p.email, 'Project contact')::text,
    p.role::text,
    case
      when public.internal_chat_is_customer_role(p.role) then 'Client'
      else coalesce(p.department, 'General')
    end::text,
    coalesce(p.avatar_url, '')::text,
    case
      when public.internal_chat_is_customer_role(p.role) then 'Client'
      when public.internal_chat_is_manager_role(p.role) then 'Manager'
      when public.internal_chat_is_delivery_role(p.role) then 'Delivery'
      when public.internal_chat_is_sales_role(p.role) then 'Sales'
      else 'Project'
    end::text
  from public.projects pr
  join public.user_profiles p on p.id <> v_uid
  where public.internal_chat_project_pair_allowed(pr.id, v_uid, p.id)
  order by lower(pr.project_name), lower(coalesce(nullif(p.full_name, ''), p.email, ''));
end;
$function$;

-- Harden helper privileges: application callers use only the public RPC surface.
revoke all on function public.internal_chat_normalize_role(text) from public, anon, authenticated;
revoke all on function public.internal_chat_is_manager_role(text) from public, anon, authenticated;
revoke all on function public.internal_chat_is_sales_role(text) from public, anon, authenticated;
revoke all on function public.internal_chat_is_delivery_role(text) from public, anon, authenticated;
revoke all on function public.internal_chat_is_customer_role(text) from public, anon, authenticated;
revoke all on function public.internal_chat_delivery_client_grant_active(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.internal_chat_customer_has_project_access(uuid, uuid) from public, anon, authenticated;
revoke all on function public.internal_chat_can_manage_client_chat(uuid, uuid) from public, anon, authenticated;

revoke all on function public.internal_chat_set_delivery_client_access(uuid, uuid, boolean, timestamptz) from public, anon;
grant execute on function public.internal_chat_set_delivery_client_access(uuid, uuid, boolean, timestamptz) to authenticated;
revoke all on function public.internal_chat_client_access_options() from public, anon;
grant execute on function public.internal_chat_client_access_options() to authenticated;

-- Existing authenticated RPC privileges for contacts/project-pair/thread access remain in place.
grant execute on function public.internal_chat_contacts() to authenticated, service_role;
grant execute on function public.internal_chat_project_pair_allowed(uuid, uuid, uuid) to authenticated, service_role;

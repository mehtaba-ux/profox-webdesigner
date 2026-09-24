-- Keep the private feedback inbox out of the public CMS surface, expose only
-- approved testimonial fields, and make public submission append-only.

create table if not exists public.public_feedback_rate_limits (
  email_fingerprint text primary key,
  last_submitted_at timestamptz not null default now(),
  submission_count integer not null default 1 check (submission_count > 0)
);

alter table public.public_feedback_rate_limits enable row level security;
revoke all on table public.public_feedback_rate_limits from public, anon, authenticated;
grant all on table public.public_feedback_rate_limits to service_role;

drop policy if exists content_public_read on public.content;
create policy content_public_read
on public.content
for select
to anon, authenticated
using (
  id <> 'feedback_submissions'
  or public.has_active_role(array['admin','site_manager','editor']::text[])
);

create or replace function public.get_public_feedback()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', entry->>'id',
        'customerName', coalesce(nullif(entry->>'customerName',''), 'Client'),
        'rating', case when entry->>'rating' ~ '^[1-5]$' then (entry->>'rating')::integer else 5 end,
        'comment', coalesce(entry->>'comment',''),
        'position', nullif(entry->>'position',''),
        'link', nullif(entry->>'link',''),
        'image', nullif(entry->>'image',''),
        'status', 'resolved',
        'showOnWebsite', true,
        'createdAt', entry->>'createdAt'
      )
      order by coalesce(entry->>'createdAt','') desc
    ),
    '[]'::jsonb
  )
  from public.content c
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(c.data) = 'array' then c.data else '[]'::jsonb end
  ) as entry
  where c.id = 'feedback_submissions'
    and entry->>'status' = 'resolved'
    and entry->>'showOnWebsite' = 'true';
$$;

revoke all on function public.get_public_feedback() from public;
grant execute on function public.get_public_feedback() to anon, authenticated, service_role;

create or replace function public.submit_public_feedback(p_feedback jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_feedback->>'customerName',''));
  v_email text := lower(btrim(coalesce(p_feedback->>'customerEmail','')));
  v_comment text := btrim(coalesce(p_feedback->>'comment',''));
  v_position text := nullif(btrim(coalesce(p_feedback->>'position','')), '');
  v_link text := nullif(btrim(coalesce(p_feedback->>'link','')), '');
  v_image text := nullif(coalesce(p_feedback->>'image',''), '');
  v_rating integer;
  v_id text := 'fb-' || replace(gen_random_uuid()::text, '-', '');
  v_created_at timestamptz := clock_timestamp();
  v_entry jsonb;
  v_rate_allowed boolean := false;
begin
  if p_feedback is null or jsonb_typeof(p_feedback) <> 'object' then
    raise exception 'A valid feedback submission is required.';
  end if;
  if nullif(btrim(coalesce(p_feedback->>'website','')), '') is not null then
    raise exception 'The feedback submission was rejected.';
  end if;
  if length(v_name) < 2 or length(v_name) > 100 then
    raise exception 'Name must be between 2 and 100 characters.';
  end if;
  if length(v_email) > 254 or v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
    raise exception 'A valid email address is required.';
  end if;
  if length(v_comment) < 10 or length(v_comment) > 3000 then
    raise exception 'Feedback must be between 10 and 3000 characters.';
  end if;
  begin
    v_rating := (p_feedback->>'rating')::integer;
  exception when others then
    raise exception 'Rating must be a whole number from 1 to 5.';
  end;
  if v_rating < 1 or v_rating > 5 then
    raise exception 'Rating must be a whole number from 1 to 5.';
  end if;
  if v_position is not null and length(v_position) > 120 then
    raise exception 'Position must be 120 characters or fewer.';
  end if;
  if v_link is not null and (length(v_link) > 500 or v_link !~* '^https?://') then
    raise exception 'Website link must be a valid HTTP or HTTPS URL.';
  end if;
  if v_image is not null and (
    length(v_image) > 460000
    or v_image !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'
  ) then
    raise exception 'The optional photo is invalid or too large.';
  end if;

  insert into public.public_feedback_rate_limits(email_fingerprint, last_submitted_at, submission_count)
  values (md5(v_email), v_created_at, 1)
  on conflict (email_fingerprint) do update
    set last_submitted_at = excluded.last_submitted_at,
        submission_count = public.public_feedback_rate_limits.submission_count + 1
    where public.public_feedback_rate_limits.last_submitted_at <= v_created_at - interval '5 minutes'
  returning true into v_rate_allowed;

  if not coalesce(v_rate_allowed, false) then
    raise exception 'Please wait a few minutes before submitting more feedback.';
  end if;

  v_entry := jsonb_strip_nulls(jsonb_build_object(
    'id', v_id,
    'customerName', v_name,
    'customerEmail', v_email,
    'position', v_position,
    'link', v_link,
    'image', v_image,
    'rating', v_rating,
    'comment', v_comment,
    'status', 'pending',
    'showOnWebsite', false,
    'createdAt', v_created_at
  ));

  insert into public.content(id, data, updated_at)
  values ('feedback_submissions', jsonb_build_array(v_entry), v_created_at)
  on conflict (id) do update
    set data = jsonb_build_array(v_entry) ||
      case when jsonb_typeof(public.content.data) = 'array' then public.content.data else '[]'::jsonb end,
        updated_at = v_created_at;

  return jsonb_build_object('id', v_id, 'createdAt', v_created_at, 'status', 'pending');
end;
$$;

revoke all on function public.submit_public_feedback(jsonb) from public;
grant execute on function public.submit_public_feedback(jsonb) to anon, authenticated, service_role;

-- Media objects can be created by active website/delivery staff. Destructive
-- library changes remain restricted to the roles that manage published content.
drop policy if exists media_staff_write on public.media;
drop policy if exists media_staff_insert on public.media;
drop policy if exists media_manager_update on public.media;
drop policy if exists media_manager_delete on public.media;

create policy media_staff_insert
on public.media
for insert
to authenticated
with check (
  public.has_active_role(array[
    'admin','site_manager','editor','content_writer','uiux_designer','developer',
    'web_developer','developer_designer','qa'
  ]::text[])
);

create policy media_manager_update
on public.media
for update
to authenticated
using (public.has_active_role(array['admin','site_manager','editor']::text[]))
with check (public.has_active_role(array['admin','site_manager','editor']::text[]));

create policy media_manager_delete
on public.media
for delete
to authenticated
using (public.has_active_role(array['admin','site_manager','editor']::text[]));

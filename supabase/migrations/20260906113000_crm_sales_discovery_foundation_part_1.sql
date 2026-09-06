-- Part 1: connected sales discovery foundation.
-- Additive only. Reuses crm_leads, crm_opportunities, sales_meetings,
-- crm_can_access_lead(), mark_sales_meeting_prepared(), crm_write_lead_event(),
-- and crm_lead_events. No downstream sales gates change.

create table public.crm_requirements (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  requirement_key text not null,
  category text not null,
  title text not null,
  content text,
  structured_value jsonb,
  is_custom boolean not null default false,
  information_certainty text not null default 'AWAITING_CLIENT'
    check (information_certainty in (
      'CLIENT_CONFIRMED',
      'SELLER_OBSERVATION',
      'SELLER_HYPOTHESIS',
      'AWAITING_CLIENT',
      'NEEDS_SPECIALIST_VALIDATION',
      'NOT_APPLICABLE'
    )),
  record_state text not null default 'ACTIVE'
    check (record_state in ('ACTIVE', 'ARCHIVED')),
  source_type text,
  source_record_id text,
  source_recorded_at timestamptz,
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, requirement_key)
);

create table public.crm_discovery_questions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.crm_leads(id) on delete cascade,
  question_key text not null,
  category text not null,
  question_text text not null,
  purpose text,
  framework text not null default 'CUSTOM'
    check (framework in (
      'SITUATION',
      'PROBLEM',
      'IMPLICATION_IMPACT',
      'NEED_DESIRED_OUTCOME',
      'SCOPE',
      'COMMERCIAL',
      'DECISION',
      'TECHNICAL',
      'CUSTOM'
    )),
  active boolean not null default true,
  sort_order integer not null default 0,
  applicability jsonb not null default '{}'::jsonb,
  is_custom boolean not null default false,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (is_custom and lead_id is not null and created_by is not null)
    or (not is_custom and lead_id is null)
  )
);

create unique index crm_discovery_questions_standard_key_uq
  on public.crm_discovery_questions(question_key)
  where lead_id is null;

create unique index crm_discovery_questions_custom_key_uq
  on public.crm_discovery_questions(lead_id, question_key)
  where lead_id is not null;

create table public.crm_discovery_responses (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  question_id uuid not null references public.crm_discovery_questions(id) on delete restrict,
  meeting_id uuid references public.sales_meetings(id) on delete set null,
  question_state text not null default 'NOT_ASKED'
    check (question_state in (
      'NOT_ASKED',
      'ASKED',
      'ANSWERED',
      'NEEDS_FOLLOW_UP',
      'NOT_APPLICABLE'
    )),
  answer_text text,
  structured_value jsonb,
  information_certainty text not null default 'AWAITING_CLIENT'
    check (information_certainty in (
      'CLIENT_CONFIRMED',
      'SELLER_OBSERVATION',
      'SELLER_HYPOTHESIS',
      'AWAITING_CLIENT',
      'NEEDS_SPECIALIST_VALIDATION',
      'NOT_APPLICABLE'
    )),
  source_type text,
  source_record_id text,
  source_recorded_at timestamptz,
  follow_up_required boolean not null default false,
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, question_id),
  check (
    question_state <> 'ANSWERED'
    or answer_text is not null
    or structured_value is not null
  )
);

create table public.crm_client_voice (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  meeting_id uuid references public.sales_meetings(id) on delete set null,
  customer_statement text not null,
  seller_interpretation text,
  linked_requirement_id uuid references public.crm_requirements(id) on delete set null,
  information_certainty text not null default 'SELLER_OBSERVATION'
    check (information_certainty in (
      'CLIENT_CONFIRMED',
      'SELLER_OBSERVATION',
      'SELLER_HYPOTHESIS',
      'AWAITING_CLIENT',
      'NEEDS_SPECIALIST_VALIDATION',
      'NOT_APPLICABLE'
    )),
  source_type text,
  source_record_id text,
  source_recorded_at timestamptz,
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seller-only Meeting Prep details that are genuinely missing from sales_meetings.
-- Canonical readiness remains sales_meetings.prep_reviewed_at/prep_reviewed_by and
-- the existing mark_sales_meeting_prepared(uuid) RPC.
create table public.crm_meeting_preparations (
  meeting_id uuid primary key references public.sales_meetings(id) on delete cascade,
  meeting_objective text,
  intended_advance text,
  hypotheses jsonb not null default '[]'::jsonb,
  seller_notes text,
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(hypotheses) = 'array')
);

create table public.crm_meeting_discovery_questions (
  meeting_id uuid not null references public.sales_meetings(id) on delete cascade,
  question_id uuid not null references public.crm_discovery_questions(id) on delete restrict,
  added_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (meeting_id, question_id)
);

create index crm_requirements_lead_state_idx
  on public.crm_requirements(lead_id, record_state, category, updated_at desc);
create index crm_discovery_questions_lead_active_idx
  on public.crm_discovery_questions(lead_id, active, sort_order);
create index crm_discovery_responses_lead_state_idx
  on public.crm_discovery_responses(lead_id, question_state, updated_at desc);
create index crm_discovery_responses_meeting_idx
  on public.crm_discovery_responses(meeting_id) where meeting_id is not null;
create index crm_client_voice_lead_created_idx
  on public.crm_client_voice(lead_id, created_at desc);
create index crm_client_voice_meeting_idx
  on public.crm_client_voice(meeting_id) where meeting_id is not null;
create index crm_client_voice_requirement_idx
  on public.crm_client_voice(linked_requirement_id) where linked_requirement_id is not null;
create index crm_meeting_discovery_questions_question_idx
  on public.crm_meeting_discovery_questions(question_id);

create or replace function public.crm_sales_discovery_meeting_lead_id(p_meeting_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(m.lead_id, o.lead_id)
  from public.sales_meetings m
  left join public.crm_opportunities o on o.id = m.opportunity_id
  where m.id = p_meeting_id
$$;

revoke all on function public.crm_sales_discovery_meeting_lead_id(uuid) from public, anon, authenticated;

create or replace function public.crm_can_access_sales_discovery_meeting(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null
    and public.crm_can_access_lead(public.crm_sales_discovery_meeting_lead_id(p_meeting_id))
$$;

revoke all on function public.crm_can_access_sales_discovery_meeting(uuid) from public, anon;
grant execute on function public.crm_can_access_sales_discovery_meeting(uuid) to authenticated;

create or replace function public.crm_sales_discovery_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end;
$$;

revoke all on function public.crm_sales_discovery_touch_updated_at() from public, anon, authenticated;

create trigger crm_requirements_touch_updated_at
before update on public.crm_requirements
for each row execute function public.crm_sales_discovery_touch_updated_at();
create trigger crm_discovery_questions_touch_updated_at
before update on public.crm_discovery_questions
for each row execute function public.crm_sales_discovery_touch_updated_at();
create trigger crm_discovery_responses_touch_updated_at
before update on public.crm_discovery_responses
for each row execute function public.crm_sales_discovery_touch_updated_at();
create trigger crm_client_voice_touch_updated_at
before update on public.crm_client_voice
for each row execute function public.crm_sales_discovery_touch_updated_at();
create trigger crm_meeting_preparations_touch_updated_at
before update on public.crm_meeting_preparations
for each row execute function public.crm_sales_discovery_touch_updated_at();

create or replace function public.crm_validate_sales_discovery_linkage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_question_lead_id uuid;
  v_meeting_lead_id uuid;
  v_requirement_lead_id uuid;
begin
  if tg_table_name = 'crm_discovery_responses' then
    select q.lead_id into v_question_lead_id
    from public.crm_discovery_questions q
    where q.id = new.question_id;

    if v_question_lead_id is not null and v_question_lead_id is distinct from new.lead_id then
      raise exception 'Custom discovery question belongs to another lead.';
    end if;

    if new.meeting_id is not null then
      v_meeting_lead_id := public.crm_sales_discovery_meeting_lead_id(new.meeting_id);
      if v_meeting_lead_id is null or v_meeting_lead_id is distinct from new.lead_id then
        raise exception 'Discovery answer meeting must belong to the same lead lifecycle.';
      end if;
    end if;
  elsif tg_table_name = 'crm_client_voice' then
    if new.meeting_id is not null then
      v_meeting_lead_id := public.crm_sales_discovery_meeting_lead_id(new.meeting_id);
      if v_meeting_lead_id is null or v_meeting_lead_id is distinct from new.lead_id then
        raise exception 'Client Voice meeting must belong to the same lead lifecycle.';
      end if;
    end if;

    if new.linked_requirement_id is not null then
      select r.lead_id into v_requirement_lead_id
      from public.crm_requirements r
      where r.id = new.linked_requirement_id;
      if v_requirement_lead_id is null or v_requirement_lead_id is distinct from new.lead_id then
        raise exception 'Linked requirement must belong to the same lead.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.crm_validate_sales_discovery_linkage() from public, anon, authenticated;

create trigger crm_discovery_responses_validate_linkage
before insert or update on public.crm_discovery_responses
for each row execute function public.crm_validate_sales_discovery_linkage();
create trigger crm_client_voice_validate_linkage
before insert or update on public.crm_client_voice
for each row execute function public.crm_validate_sales_discovery_linkage();

create or replace function public.crm_validate_meeting_discovery_record()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meeting_lead_id uuid;
  v_question_lead_id uuid;
  v_question_active boolean;
begin
  v_meeting_lead_id := public.crm_sales_discovery_meeting_lead_id(new.meeting_id);
  if v_meeting_lead_id is null then
    raise exception 'Meeting Prep requires a sales meeting connected to the CRM lead lifecycle.';
  end if;

  if tg_table_name = 'crm_meeting_discovery_questions' then
    select q.lead_id, q.active into v_question_lead_id, v_question_active
    from public.crm_discovery_questions q
    where q.id = new.question_id;

    if not coalesce(v_question_active, false) then
      raise exception 'Only an active discovery question can be selected for a meeting.';
    end if;

    if v_question_lead_id is not null and v_question_lead_id is distinct from v_meeting_lead_id then
      raise exception 'Custom discovery question belongs to another lead.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.crm_validate_meeting_discovery_record() from public, anon, authenticated;

create trigger crm_meeting_preparations_validate_meeting
before insert or update on public.crm_meeting_preparations
for each row execute function public.crm_validate_meeting_discovery_record();
create trigger crm_meeting_discovery_questions_validate_linkage
before insert or update on public.crm_meeting_discovery_questions
for each row execute function public.crm_validate_meeting_discovery_record();

alter table public.crm_requirements enable row level security;
alter table public.crm_discovery_questions enable row level security;
alter table public.crm_discovery_responses enable row level security;
alter table public.crm_client_voice enable row level security;
alter table public.crm_meeting_preparations enable row level security;
alter table public.crm_meeting_discovery_questions enable row level security;

create policy crm_requirements_access
on public.crm_requirements
for all
to authenticated
using (public.crm_can_access_lead(lead_id))
with check (public.crm_can_access_lead(lead_id));

create policy crm_discovery_questions_read
on public.crm_discovery_questions
for select
to authenticated
using (
  public.crm_can_access_lead(lead_id)
  or (
    lead_id is null
    and (public.is_admin() or public.sales_crm_access_ready() or public.crm_can_manage_lead_assignment())
  )
);

create policy crm_discovery_questions_insert
on public.crm_discovery_questions
for insert
to authenticated
with check (
  (is_custom and lead_id is not null and public.crm_can_access_lead(lead_id))
  or (not is_custom and lead_id is null and public.is_admin())
);

create policy crm_discovery_questions_update
on public.crm_discovery_questions
for update
to authenticated
using (
  (is_custom and lead_id is not null and public.crm_can_access_lead(lead_id))
  or (not is_custom and lead_id is null and public.is_admin())
)
with check (
  (is_custom and lead_id is not null and public.crm_can_access_lead(lead_id))
  or (not is_custom and lead_id is null and public.is_admin())
);

create policy crm_discovery_questions_delete
on public.crm_discovery_questions
for delete
to authenticated
using (
  (is_custom and lead_id is not null and public.crm_can_access_lead(lead_id))
  or (not is_custom and lead_id is null and public.is_admin())
);

create policy crm_discovery_responses_access
on public.crm_discovery_responses
for all
to authenticated
using (public.crm_can_access_lead(lead_id))
with check (public.crm_can_access_lead(lead_id));

create policy crm_client_voice_access
on public.crm_client_voice
for all
to authenticated
using (public.crm_can_access_lead(lead_id))
with check (public.crm_can_access_lead(lead_id));

create policy crm_meeting_preparations_access
on public.crm_meeting_preparations
for all
to authenticated
using (public.crm_can_access_sales_discovery_meeting(meeting_id))
with check (public.crm_can_access_sales_discovery_meeting(meeting_id));

create policy crm_meeting_discovery_questions_access
on public.crm_meeting_discovery_questions
for all
to authenticated
using (public.crm_can_access_sales_discovery_meeting(meeting_id))
with check (public.crm_can_access_sales_discovery_meeting(meeting_id));

revoke all on table public.crm_requirements from anon;
revoke all on table public.crm_discovery_questions from anon;
revoke all on table public.crm_discovery_responses from anon;
revoke all on table public.crm_client_voice from anon;
revoke all on table public.crm_meeting_preparations from anon;
revoke all on table public.crm_meeting_discovery_questions from anon;

grant select, insert, update, delete on table public.crm_requirements to authenticated;
grant select, insert, update, delete on table public.crm_discovery_questions to authenticated;
grant select, insert, update, delete on table public.crm_discovery_responses to authenticated;
grant select, insert, update, delete on table public.crm_client_voice to authenticated;
grant select, insert, update, delete on table public.crm_meeting_preparations to authenticated;
grant select, insert, delete on table public.crm_meeting_discovery_questions to authenticated;

create or replace function public.crm_sales_discovery_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record jsonb;
  v_lead_id uuid;
  v_entity_id text;
  v_metadata jsonb;
begin
  v_record := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name in ('crm_requirements', 'crm_discovery_questions', 'crm_discovery_responses', 'crm_client_voice') then
    v_lead_id := nullif(v_record->>'lead_id', '')::uuid;
  elsif tg_table_name in ('crm_meeting_preparations', 'crm_meeting_discovery_questions') then
    v_lead_id := public.crm_sales_discovery_meeting_lead_id(nullif(v_record->>'meeting_id', '')::uuid);
  end if;

  if v_lead_id is null then
    return null;
  end if;

  v_entity_id := coalesce(v_record->>'id', v_record->>'meeting_id', v_record->>'question_id');
  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'entity', tg_table_name,
    'entityId', v_entity_id,
    'operation', lower(tg_op),
    'meetingId', v_record->>'meeting_id',
    'questionId', v_record->>'question_id',
    'recordState', v_record->>'record_state',
    'informationCertainty', v_record->>'information_certainty',
    'questionState', v_record->>'question_state'
  ));

  perform public.crm_write_lead_event(
    p_lead_id => v_lead_id,
    p_event_type => 'sales_discovery.' || tg_table_name || '.' || lower(tg_op),
    p_title => 'Sales discovery ' || replace(tg_table_name, 'crm_', '') || ' ' || lower(tg_op),
    p_description => '',
    p_metadata => v_metadata,
    p_actor_user_id => auth.uid()
  );

  return null;
end;
$$;

revoke all on function public.crm_sales_discovery_audit_event() from public, anon, authenticated;

create trigger crm_requirements_audit
after insert or update or delete on public.crm_requirements
for each row execute function public.crm_sales_discovery_audit_event();
create trigger crm_discovery_questions_audit
after insert or update or delete on public.crm_discovery_questions
for each row execute function public.crm_sales_discovery_audit_event();
create trigger crm_discovery_responses_audit
after insert or update or delete on public.crm_discovery_responses
for each row execute function public.crm_sales_discovery_audit_event();
create trigger crm_client_voice_audit
after insert or update or delete on public.crm_client_voice
for each row execute function public.crm_sales_discovery_audit_event();
create trigger crm_meeting_preparations_audit
after insert or update or delete on public.crm_meeting_preparations
for each row execute function public.crm_sales_discovery_audit_event();
create trigger crm_meeting_discovery_questions_audit
after insert or delete on public.crm_meeting_discovery_questions
for each row execute function public.crm_sales_discovery_audit_event();

create or replace function public.crm_get_sales_discovery_workspace(
  p_lead_id uuid default null,
  p_opportunity_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead_id uuid;
  v_opportunity_id uuid;
begin
  if p_opportunity_id is not null then
    select o.lead_id into v_lead_id
    from public.crm_opportunities o
    where o.id = p_opportunity_id;

    if v_lead_id is null then
      raise exception 'Opportunity is not connected to a CRM lead.';
    end if;

    if p_lead_id is not null and p_lead_id is distinct from v_lead_id then
      raise exception 'Lead and opportunity do not belong to the same sales lifecycle.';
    end if;

    v_opportunity_id := p_opportunity_id;
  else
    v_lead_id := p_lead_id;
    select o.id into v_opportunity_id
    from public.crm_opportunities o
    where o.lead_id = v_lead_id
    order by o.created_at desc
    limit 1;
  end if;

  if v_lead_id is null then
    raise exception 'Lead or opportunity is required.';
  end if;

  if not public.crm_can_access_lead(v_lead_id) then
    raise exception 'CRM lead access is required.';
  end if;

  return jsonb_build_object(
    'leadId', v_lead_id,
    'opportunityId', v_opportunity_id,
    'requirements', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
      from public.crm_requirements r
      where r.lead_id = v_lead_id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.sort_order, q.created_at, q.id)
      from public.crm_discovery_questions q
      where (q.lead_id is null or q.lead_id = v_lead_id)
        and (
          q.active
          or exists (
            select 1
            from public.crm_discovery_responses dr
            where dr.lead_id = v_lead_id and dr.question_id = q.id
          )
        )
    ), '[]'::jsonb),
    'responses', coalesce((
      select jsonb_agg(to_jsonb(dr) order by dr.updated_at, dr.id)
      from public.crm_discovery_responses dr
      where dr.lead_id = v_lead_id
    ), '[]'::jsonb),
    'clientVoice', coalesce((
      select jsonb_agg(to_jsonb(cv) order by cv.created_at, cv.id)
      from public.crm_client_voice cv
      where cv.lead_id = v_lead_id
    ), '[]'::jsonb),
    'meetingPreparations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'meetingId', m.id,
          'title', m.title,
          'scheduledAt', m.start_at,
          'status', m.status,
          'preparationState', case
            when m.prep_reviewed_at is not null then 'READY'
            when mp.meeting_id is not null
              or exists (
                select 1 from public.crm_meeting_discovery_questions mdqx where mdqx.meeting_id = m.id
              ) then 'IN_PROGRESS'
            else 'NOT_STARTED'
          end,
          'preparedBy', m.prep_reviewed_by,
          'preparedAt', m.prep_reviewed_at,
          'preparation', to_jsonb(mp),
          'selectedQuestionIds', coalesce((
            select jsonb_agg(mdq.question_id order by mdq.created_at, mdq.question_id)
            from public.crm_meeting_discovery_questions mdq
            where mdq.meeting_id = m.id
          ), '[]'::jsonb)
        )
        order by m.start_at desc, m.id
      )
      from public.sales_meetings m
      left join public.crm_opportunities mo on mo.id = m.opportunity_id
      left join public.crm_meeting_preparations mp on mp.meeting_id = m.id
      where coalesce(m.lead_id, mo.lead_id) = v_lead_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.crm_get_sales_discovery_workspace(uuid, uuid) from public, anon;
grant execute on function public.crm_get_sales_discovery_workspace(uuid, uuid) to authenticated;

create or replace function public.crm_set_meeting_discovery_questions(
  p_meeting_id uuid,
  p_question_ids uuid[] default '{}'::uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead_id uuid;
  v_question_id uuid;
  v_distinct_ids uuid[];
begin
  v_lead_id := public.crm_sales_discovery_meeting_lead_id(p_meeting_id);
  if v_lead_id is null then
    raise exception 'Meeting Prep requires a sales meeting connected to the CRM lead lifecycle.';
  end if;

  if not public.crm_can_access_lead(v_lead_id) then
    raise exception 'CRM lead access is required.';
  end if;

  select coalesce(array_agg(distinct x order by x), '{}'::uuid[])
  into v_distinct_ids
  from unnest(coalesce(p_question_ids, '{}'::uuid[])) x;

  foreach v_question_id in array v_distinct_ids loop
    if not exists (
      select 1
      from public.crm_discovery_questions q
      where q.id = v_question_id
        and q.active
        and (q.lead_id is null or q.lead_id = v_lead_id)
    ) then
      raise exception 'A selected discovery question is unavailable for this lead.';
    end if;
  end loop;

  delete from public.crm_meeting_discovery_questions
  where meeting_id = p_meeting_id;

  insert into public.crm_meeting_discovery_questions(meeting_id, question_id, added_by)
  select p_meeting_id, x, auth.uid()
  from unnest(v_distinct_ids) x;

  return v_distinct_ids;
end;
$$;

revoke all on function public.crm_set_meeting_discovery_questions(uuid, uuid[]) from public, anon;
grant execute on function public.crm_set_meeting_discovery_questions(uuid, uuid[]) to authenticated;

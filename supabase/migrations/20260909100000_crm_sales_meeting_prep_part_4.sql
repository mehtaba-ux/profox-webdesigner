-- ProFox CRM Sales SOP — Part 4: Meeting Prep Workspace
-- Reuse-only hardening: no new business tables, readiness columns, or parallel systems.

-- Keep the existing readiness RPC authoritative while requiring the minimum
-- preparation fields server-side.
create or replace function public.mark_sales_meeting_prepared(p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_meeting public.sales_meetings%rowtype;
  v_prep public.crm_meeting_preparations%rowtype;
  v_lead_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_meeting
  from public.sales_meetings
  where id = p_meeting_id
  for update;

  if not found then
    raise exception 'Meeting not found.';
  end if;

  if not public.is_admin() and v_meeting.salesperson_id is distinct from v_uid then
    raise exception 'You may only prepare your own meeting.';
  end if;

  if coalesce(v_meeting.status, '') not in ('Scheduled', 'Rescheduled') then
    raise exception 'Only a Scheduled or Rescheduled meeting can be marked prepared.';
  end if;

  select *
  into v_prep
  from public.crm_meeting_preparations
  where meeting_id = p_meeting_id;

  if not found then
    raise exception 'Meeting preparation must be saved before it can be marked Ready.';
  end if;

  if nullif(btrim(coalesce(v_prep.meeting_objective, '')), '') is null then
    raise exception 'Meeting Objective is required before preparation can be marked Ready.';
  end if;

  if nullif(btrim(coalesce(v_prep.intended_advance, '')), '') is null then
    raise exception 'Intended Advance is required before preparation can be marked Ready.';
  end if;

  update public.sales_meetings
  set prep_reviewed_at = now(),
      prep_reviewed_by = v_uid,
      updated_at = now()
  where id = p_meeting_id
  returning * into v_meeting;

  v_lead_id := public.crm_sales_discovery_meeting_lead_id(p_meeting_id);
  if v_lead_id is not null then
    perform public.crm_write_lead_event(
      v_lead_id,
      'meeting_preparation_marked_ready',
      'Meeting Prep marked Ready',
      'Seller reviewed the saved preparation and marked it Ready.',
      jsonb_build_object('meetingId', p_meeting_id),
      v_uid
    );
  end if;

  return jsonb_build_object(
    'meetingId', v_meeting.id,
    'prepReviewedAt', v_meeting.prep_reviewed_at,
    'prepReviewedBy', v_meeting.prep_reviewed_by,
    'prepared', true
  );
end;
$function$;

revoke all on function public.mark_sales_meeting_prepared(uuid) from public, anon;
grant execute on function public.mark_sales_meeting_prepared(uuid) to authenticated;

-- Preserve the canonical meeting-question relationship. Exact no-op saves return
-- immediately so an unchanged question set cannot invalidate a reviewed prep.
create or replace function public.crm_set_meeting_discovery_questions(
  p_meeting_id uuid,
  p_question_ids uuid[] default '{}'::uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_lead_id uuid;
  v_question_id uuid;
  v_distinct_ids uuid[];
  v_current_ids uuid[];
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

  select coalesce(array_agg(mdq.question_id order by mdq.question_id), '{}'::uuid[])
  into v_current_ids
  from public.crm_meeting_discovery_questions mdq
  where mdq.meeting_id = p_meeting_id;

  if v_current_ids = v_distinct_ids then
    return v_distinct_ids;
  end if;

  delete from public.crm_meeting_discovery_questions
  where meeting_id = p_meeting_id;

  insert into public.crm_meeting_discovery_questions(meeting_id, question_id, added_by)
  select p_meeting_id, x, auth.uid()
  from unnest(v_distinct_ids) x;

  return v_distinct_ids;
end;
$function$;

revoke all on function public.crm_set_meeting_discovery_questions(uuid, uuid[]) from public, anon;
grant execute on function public.crm_set_meeting_discovery_questions(uuid, uuid[]) to authenticated;

-- Material preparation changes after review make the review stale. Seller Notes
-- are deliberately supplemental: a notes-only edit does not invalidate Ready.
create or replace function public.crm_invalidate_meeting_prep_readiness()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_meeting_id uuid;
  v_lead_id uuid;
  v_invalidated_count integer := 0;
  v_source text := tg_table_name;
begin
  if tg_table_name = 'crm_meeting_preparations' then
    v_meeting_id := case when tg_op = 'DELETE' then old.meeting_id else new.meeting_id end;

    if tg_op = 'UPDATE'
      and old.meeting_objective is not distinct from new.meeting_objective
      and old.intended_advance is not distinct from new.intended_advance
      and old.hypotheses is not distinct from new.hypotheses then
      return new;
    end if;
  elsif tg_table_name = 'crm_meeting_discovery_questions' then
    v_meeting_id := case when tg_op = 'DELETE' then old.meeting_id else new.meeting_id end;
  else
    raise exception 'Unsupported Meeting Prep readiness source: %', tg_table_name;
  end if;

  update public.sales_meetings
  set prep_reviewed_at = null,
      prep_reviewed_by = null,
      updated_at = now()
  where id = v_meeting_id
    and prep_reviewed_at is not null;

  get diagnostics v_invalidated_count = row_count;

  if v_invalidated_count > 0 then
    v_lead_id := public.crm_sales_discovery_meeting_lead_id(v_meeting_id);
    if v_lead_id is not null then
      perform public.crm_write_lead_event(
        v_lead_id,
        'meeting_preparation_readiness_invalidated',
        'Meeting Prep review required again',
        'A material Meeting Prep change was saved after the preparation was marked Ready.',
        jsonb_build_object('meetingId', v_meeting_id, 'source', v_source, 'operation', tg_op),
        auth.uid()
      );
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.crm_invalidate_meeting_prep_readiness() from public, anon, authenticated;

drop trigger if exists crm_meeting_preparations_invalidate_ready on public.crm_meeting_preparations;
create trigger crm_meeting_preparations_invalidate_ready
after insert or update or delete on public.crm_meeting_preparations
for each row execute function public.crm_invalidate_meeting_prep_readiness();

drop trigger if exists crm_meeting_discovery_questions_invalidate_ready on public.crm_meeting_discovery_questions;
create trigger crm_meeting_discovery_questions_invalidate_ready
after insert or update or delete on public.crm_meeting_discovery_questions
for each row execute function public.crm_invalidate_meeting_prep_readiness();

-- Extend the existing workspace payload only with meeting type. All other
-- lifecycle access, continuity, and canonical source behavior remains unchanged.
create or replace function public.crm_get_sales_discovery_workspace(
  p_lead_id uuid default null,
  p_opportunity_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_lead_id uuid;
  v_opportunity_id uuid;
  v_requirement_definitions jsonb := '[]'::jsonb;
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

  select coalesce(
    jsonb_agg(definition order by coalesce((definition->>'sortOrder')::integer, 0), definition->>'requirementKey'),
    '[]'::jsonb
  )
  into v_requirement_definitions
  from public.system_configuration sc
  cross join lateral jsonb_array_elements(coalesce(sc.config_value->'definitions', '[]'::jsonb)) definition
  where sc.config_key = 'crm_requirement_definitions_v1'
    and coalesce((definition->>'active')::boolean, true);

  return jsonb_build_object(
    'leadId', v_lead_id,
    'opportunityId', v_opportunity_id,
    'requirementDefinitions', coalesce(v_requirement_definitions, '[]'::jsonb),
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
          'meetingType', m.meeting_type,
          'preparationState', case
            when m.prep_reviewed_at is not null then 'READY'
            when mp.meeting_id is not null
              or exists (
                select 1
                from public.crm_meeting_discovery_questions mdqx
                where mdqx.meeting_id = m.id
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
$function$;

revoke all on function public.crm_get_sales_discovery_workspace(uuid, uuid) from public, anon;
grant execute on function public.crm_get_sales_discovery_workspace(uuid, uuid) to authenticated;

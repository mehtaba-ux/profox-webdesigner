-- Part 5: Meeting Management & Meeting Close-Out.
-- Reuses sales_meetings, crm_activities, canonical meeting finalization,
-- customer follow-up communication automation, CRM audit and Sales Discovery systems.
-- NO NEW BUSINESS TABLES OR PARALLEL MEETING/CLOSE-OUT STATE.

create or replace function public.save_sales_meeting_closeout_draft(
  p_meeting_id uuid,
  p_outcome text default '',
  p_requirements_summary text default '',
  p_problems_identified text default '',
  p_decision_makers text default '',
  p_commercial_notes text default '',
  p_timeline_notes text default '',
  p_next_step text default '',
  p_follow_up_at timestamptz default null
)
returns public.sales_meetings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_meeting public.sales_meetings%rowtype;
  v_outcome text := left(trim(coalesce(p_outcome, '')), 8000);
  v_requirements_summary text := left(trim(coalesce(p_requirements_summary, '')), 8000);
  v_problems_identified text := left(trim(coalesce(p_problems_identified, '')), 8000);
  v_decision_makers text := left(trim(coalesce(p_decision_makers, '')), 8000);
  v_commercial_notes text := left(trim(coalesce(p_commercial_notes, '')), 8000);
  v_timeline_notes text := left(trim(coalesce(p_timeline_notes, '')), 8000);
  v_next_step text := left(trim(coalesce(p_next_step, '')), 4000);
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_meeting
  from public.sales_meetings
  where id = p_meeting_id
  for update;

  if not found then
    raise exception 'Meeting not found.';
  end if;

  if not public.is_admin()
     and (v_meeting.salesperson_id is distinct from v_uid
          or not public.has_active_role(array['sales']::text[])) then
    raise exception 'Unauthorized meeting update.';
  end if;

  if v_meeting.status = 'Cancelled' then
    raise exception 'Cancelled meetings cannot be edited.';
  end if;

  if v_meeting.status in ('Completed', 'No Show') then
    raise exception 'Closed meetings are read-only in Meeting Management.';
  end if;

  if v_meeting.outcome is not distinct from v_outcome
     and v_meeting.requirements_summary is not distinct from v_requirements_summary
     and v_meeting.problems_identified is not distinct from v_problems_identified
     and v_meeting.decision_makers is not distinct from v_decision_makers
     and v_meeting.commercial_notes is not distinct from v_commercial_notes
     and v_meeting.timeline_notes is not distinct from v_timeline_notes
     and v_meeting.next_step is not distinct from v_next_step
     and v_meeting.follow_up_at is not distinct from p_follow_up_at then
    return v_meeting;
  end if;

  update public.sales_meetings
  set outcome = v_outcome,
      requirements_summary = v_requirements_summary,
      problems_identified = v_problems_identified,
      decision_makers = v_decision_makers,
      commercial_notes = v_commercial_notes,
      timeline_notes = v_timeline_notes,
      next_step = v_next_step,
      follow_up_at = p_follow_up_at,
      updated_at = now()
  where id = p_meeting_id
  returning * into v_meeting;

  return v_meeting;
end;
$$;

revoke all on function public.save_sales_meeting_closeout_draft(uuid,text,text,text,text,text,text,text,timestamptz) from public, anon;
grant execute on function public.save_sales_meeting_closeout_draft(uuid,text,text,text,text,text,text,text,timestamptz) to authenticated;

-- Harden the EXISTING canonical finalizer. This remains the only final meeting-status workflow.
create or replace function public.finalize_sales_meeting(
  p_meeting_id uuid,
  p_status text,
  p_outcome text default '',
  p_requirements_summary text default '',
  p_problems_identified text default '',
  p_decision_makers text default '',
  p_commercial_notes text default '',
  p_timeline_notes text default '',
  p_next_step text default '',
  p_follow_up_at timestamptz default null
)
returns public.sales_meetings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_meeting public.sales_meetings%rowtype;
  v_crm_lead_id uuid;
  v_opportunity_stage text;
  v_requires_next_action boolean := false;
  v_outcome text := left(trim(coalesce(p_outcome, '')), 8000);
  v_requirements_summary text := left(trim(coalesce(p_requirements_summary, '')), 8000);
  v_problems_identified text := left(trim(coalesce(p_problems_identified, '')), 8000);
  v_decision_makers text := left(trim(coalesce(p_decision_makers, '')), 8000);
  v_commercial_notes text := left(trim(coalesce(p_commercial_notes, '')), 8000);
  v_timeline_notes text := left(trim(coalesce(p_timeline_notes, '')), 8000);
  v_next_step text := left(trim(coalesce(p_next_step, '')), 4000);
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if p_status not in ('Completed', 'No Show') then
    raise exception 'Final meeting status must be Completed or No Show.';
  end if;

  select * into v_meeting
  from public.sales_meetings
  where id = p_meeting_id
  for update;

  if not found then
    raise exception 'Meeting not found.';
  end if;

  if not public.is_admin()
     and (v_meeting.salesperson_id is distinct from v_uid
          or not public.has_active_role(array['sales']::text[])) then
    raise exception 'Unauthorized meeting update.';
  end if;

  if v_meeting.status = 'Cancelled' then
    raise exception 'Cancelled meetings cannot be finalized.';
  end if;

  if v_meeting.status in ('Completed', 'No Show') then
    if v_meeting.status = p_status then
      return v_meeting;
    end if;
    raise exception 'Meeting is already closed.';
  end if;

  v_crm_lead_id := public.service_meeting_crm_lead_id(p_meeting_id);

  if v_meeting.opportunity_id is not null then
    select o.stage into v_opportunity_stage
    from public.crm_opportunities o
    where o.id = v_meeting.opportunity_id;
  end if;

  -- Sales close-out requirements apply only to CRM-linked Completed meetings.
  -- A Won opportunity is the current production terminal lifecycle and therefore
  -- does not require an artificial future Sales action merely to close the meeting.
  v_requires_next_action := v_crm_lead_id is not null
    and coalesce(v_opportunity_stage, '') <> 'Won';

  if p_status = 'Completed' and v_crm_lead_id is not null then
    if length(v_outcome) < 12
       or lower(v_outcome) in ('good call', 'good call.', 'successful meeting', 'client interested') then
      raise exception 'Completed CRM meetings require a meaningful Outcome describing the actual result.';
    end if;

    if v_requires_next_action then
      if length(v_next_step) < 8
         or lower(v_next_step) in ('follow up', 'follow-up', 'wait', 'tbd', 'n/a', 'na') then
        raise exception 'Active CRM meetings require a specific meaningful Next Step.';
      end if;

      if p_follow_up_at is null then
        raise exception 'Active CRM meetings require Follow-Up timing for the next Sales action.';
      end if;
    end if;
  end if;

  update public.sales_meetings
  set status = p_status,
      completed_at = case when p_status = 'Completed' then now() else null end,
      outcome = v_outcome,
      requirements_summary = v_requirements_summary,
      problems_identified = v_problems_identified,
      decision_makers = v_decision_makers,
      commercial_notes = v_commercial_notes,
      timeline_notes = v_timeline_notes,
      next_step = v_next_step,
      follow_up_at = p_follow_up_at,
      updated_at = now()
  where id = p_meeting_id
  returning * into v_meeting;

  if v_meeting.activity_id is not null then
    update public.crm_activities
    set status = 'Completed',
        completed_at = now(),
        notes = trim(concat_ws(E'\n', nullif(notes, ''), 'Meeting result: ' || p_status, nullif(v_outcome, ''))),
        updated_at = now()
    where id = v_meeting.activity_id;
  end if;

  if p_status = 'Completed' and v_meeting.opportunity_id is not null then
    update public.crm_opportunities
    set requirements_summary = case when v_requirements_summary <> '' then v_requirements_summary else requirements_summary end,
        next_follow_up_at = coalesce(p_follow_up_at, next_follow_up_at),
        updated_at = now()
    where id = v_meeting.opportunity_id;
  end if;

  -- Generic Meeting Follow-Up is for Completed meetings only.
  -- No Show is intentionally left to queue_meeting_status_automation(), which owns
  -- the existing dedicated No Show Follow-Up + customer rebooking communication.
  if p_status = 'Completed'
     and p_follow_up_at is not null
     and v_next_step <> ''
     and not exists (
       select 1
       from public.crm_activities a
       where a.assigned_to = v_meeting.salesperson_id
         and a.activity_type = 'Meeting Follow-Up'
         and a.notes like '%Automation key: meeting-followup:' || v_meeting.id::text || '%'
     ) then
    insert into public.crm_activities(
      lead_id, opportunity_id, assigned_to, activity_type, subject,
      due_at, status, channel, notes, created_by, automation_source
    ) values (
      v_crm_lead_id,
      v_meeting.opportunity_id,
      v_meeting.salesperson_id,
      'Meeting Follow-Up',
      left(v_next_step, 250),
      p_follow_up_at,
      'Scheduled',
      'Follow-Up',
      'Created from Sales Meeting: ' || v_meeting.title || E'\nAutomation key: meeting-followup:' || v_meeting.id::text,
      v_uid,
      'sales_meeting_closeout'
    );
  end if;

  return v_meeting;
end;
$$;

revoke all on function public.finalize_sales_meeting(uuid,text,text,text,text,text,text,text,text,timestamptz) from public, anon;
grant execute on function public.finalize_sales_meeting(uuid,text,text,text,text,text,text,text,text,timestamptz) to authenticated;

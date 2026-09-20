-- PF-SOP-01 Part 11 — Negotiation / Decision Pending + Next-Action Discipline
-- Extends canonical crm_opportunities / crm_activities / crm_lead_events only.
-- No production data backfill. No payment/Won/onboarding/handoff changes.

do $part11_pre$
declare
  v_cfg jsonb;
begin
  select config_value into v_cfg
  from public.system_configuration
  where config_key='crm_quotation_sales_reconciliation_policy_v1';

  if v_cfg is null
     or coalesce((v_cfg->>'finalQuotationSendGateActive')::boolean,false) is distinct from true
     or coalesce((v_cfg->>'policyVersion')::int,0) <> 2
     or coalesce((v_cfg->>'snapshotSchemaVersion')::int,0) <> 2 then
    raise exception 'Part 11 requires the active Part 10B Send gate under policy/schema version 2.';
  end if;
end
$part11_pre$;

alter table public.crm_opportunities
  add column if not exists decision_status text,
  add column if not exists primary_objection_category text,
  add column if not exists waiting_on text,
  add column if not exists decision_expected_at timestamptz,
  add column if not exists decision_recorded_at timestamptz,
  add column if not exists decision_recorded_by uuid;

do $part11_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_opportunities'::regclass
      and conname='crm_opportunities_decision_status_check'
  ) then
    alter table public.crm_opportunities
      add constraint crm_opportunities_decision_status_check
      check (
        decision_status is null or decision_status in (
          'AWAITING_CLIENT_RESPONSE',
          'CLIENT_REVIEWING',
          'QUESTIONS_OR_OBJECTIONS',
          'REVISION_REQUESTED',
          'COMMERCIAL_REVIEW_REQUIRED',
          'INTERNAL_CLIENT_APPROVAL',
          'DECISION_DATE_CONFIRMED',
          'PAUSED_BY_CLIENT'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_opportunities'::regclass
      and conname='crm_opportunities_primary_objection_category_check'
  ) then
    alter table public.crm_opportunities
      add constraint crm_opportunities_primary_objection_category_check
      check (
        primary_objection_category is null or primary_objection_category in (
          'PRICE','BUDGET','SCOPE','TIMELINE','TRUST','AUTHORITY',
          'INTERNAL_APPROVAL','PROCUREMENT','COMPETITOR','PRIORITY',
          'NO_RESPONSE','OTHER'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_opportunities'::regclass
      and conname='crm_opportunities_waiting_on_check'
  ) then
    alter table public.crm_opportunities
      add constraint crm_opportunities_waiting_on_check
      check (
        waiting_on is null or waiting_on in (
          'CLIENT','PROFOX','SPECIALIST','PROCUREMENT','THIRD_PARTY'
        )
      );
  end if;
end
$part11_constraints$;

create index if not exists crm_opportunities_negotiation_state_idx
  on public.crm_opportunities(stage, decision_status, decision_expected_at)
  where archived_at is null;

create or replace function public.crm_protect_part11_negotiation_fields()
returns trigger
language plpgsql
set search_path=public, pg_temp
as $$
begin
  if row(
    old.decision_status,
    old.primary_objection_category,
    old.waiting_on,
    old.decision_expected_at,
    old.decision_recorded_at,
    old.decision_recorded_by
  ) is distinct from row(
    new.decision_status,
    new.primary_objection_category,
    new.waiting_on,
    new.decision_expected_at,
    new.decision_recorded_at,
    new.decision_recorded_by
  ) and coalesce(current_setting('app.crm_negotiation_rpc',true),'') <> '1' then
    raise exception 'Use the canonical Negotiation decision workflow to change Part 11 state.';
  end if;
  return new;
end
$$;

drop trigger if exists trg_protect_part11_negotiation_fields on public.crm_opportunities;
create trigger trg_protect_part11_negotiation_fields
before update of decision_status, primary_objection_category, waiting_on,
  decision_expected_at, decision_recorded_at, decision_recorded_by
on public.crm_opportunities
for each row
execute function public.crm_protect_part11_negotiation_fields();

create or replace function public.crm_guard_activity_opportunity_link()
returns trigger
language plpgsql
security definer
set search_path=public, pg_temp
as $$
declare
  v_opp public.crm_opportunities%rowtype;
  v_uid uuid:=auth.uid();
begin
  if new.opportunity_id is null then
    return new;
  end if;

  select * into v_opp
  from public.crm_opportunities
  where id=new.opportunity_id and archived_at is null;

  if not found then
    raise exception 'Linked opportunity not found.';
  end if;

  if new.lead_id is null then
    new.lead_id:=v_opp.lead_id;
  elsif v_opp.lead_id is distinct from new.lead_id then
    raise exception 'Activity lead must match the linked opportunity.';
  end if;

  if v_uid is not null
     and not public.is_admin()
     and (
       not public.has_active_role(array['sales']::text[])
       or v_opp.salesperson_id is distinct from v_uid
     ) then
    raise exception 'You may link activities only to your assigned opportunity.';
  end if;

  return new;
end
$$;

drop trigger if exists trg_guard_activity_opportunity_link on public.crm_activities;
create trigger trg_guard_activity_opportunity_link
before insert or update of lead_id, opportunity_id
on public.crm_activities
for each row
execute function public.crm_guard_activity_opportunity_link();

create or replace function public.crm_get_last_meaningful_customer_interaction(p_opportunity_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public, pg_temp
as $$
  with opp as (
    select id,lead_id
    from public.crm_opportunities
    where id=p_opportunity_id and archived_at is null
  ),
  candidates as (
    select
      e.occurred_at as happened_at,
      e.event_type as interaction_type,
      e.title,
      coalesce(nullif(e.metadata->>'communicationKind',''),nullif(e.metadata->>'channel','')) as channel,
      'crm_lead_events'::text as source_type,
      e.id::text as source_id
    from opp o
    join public.crm_lead_events e on e.lead_id=o.lead_id
    where
      (
        e.event_type='chat_message'
        and coalesce((e.metadata->>'internalNote')::boolean,false)=false
        and coalesce(e.metadata->>'senderType','') in ('customer','sales_rep')
      )
      or e.event_type='email_received'
      or (
        e.event_type='email_sent'
        and coalesce((e.metadata->>'automated')::boolean,false)=false
      )
      or e.event_type in ('quotation_sent','quotation_accepted','quotation_rejected','quotation_declined')
      or e.event_type in ('customer_reply','first_response')
    union all
    select
      coalesce(a.completed_at,a.outcome_recorded_at),
      'activity_completed',
      a.subject,
      a.channel,
      'crm_activities',
      a.id::text
    from public.crm_activities a
    where a.opportunity_id=p_opportunity_id
      and a.status='Completed'
      and coalesce(a.completed_at,a.outcome_recorded_at) is not null
      and a.activity_type in (
        'Cold Call','Cold Email','LinkedIn / Social Outreach','Loom Outreach',
        'Follow-Up','Meeting Follow-Up','Quotation Follow-Up'
      )
      and coalesce(a.outcome,'') not in (
        'No Answer','Voicemail','Wrong Number','No Response','Bounced'
      )
    union all
    select
      coalesce(m.completed_at,m.end_at,m.start_at),
      'sales_meeting_completed',
      'Sales meeting completed',
      'Meeting',
      'sales_meetings',
      m.id::text
    from public.sales_meetings m
    where m.opportunity_id=p_opportunity_id
      and m.status='Completed'
      and coalesce(m.completed_at,m.end_at,m.start_at) is not null
  )
  select case when c.happened_at is null then null else jsonb_build_object(
    'at',c.happened_at,
    'type',c.interaction_type,
    'title',c.title,
    'channel',c.channel,
    'sourceType',c.source_type,
    'sourceId',c.source_id
  ) end
  from (
    select *
    from candidates
    order by happened_at desc, source_type, source_id
    limit 1
  ) c
$$;

revoke all on function public.crm_get_last_meaningful_customer_interaction(uuid) from public, anon, authenticated;
grant execute on function public.crm_get_last_meaningful_customer_interaction(uuid) to service_role;

create or replace function public.crm_record_negotiation_decision_state(
  p_opportunity_id uuid,
  p_decision_status text,
  p_primary_objection_category text default null,
  p_waiting_on text default null,
  p_decision_expected_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public, pg_temp
as $$
declare
  v_opp public.crm_opportunities%rowtype;
  v_uid uuid:=auth.uid();
  v_status text:=nullif(upper(btrim(coalesce(p_decision_status,''))),'');
  v_objection text:=nullif(upper(btrim(coalesce(p_primary_objection_category,''))),'');
  v_waiting text:=nullif(upper(btrim(coalesce(p_waiting_on,''))),'');
  v_old jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;

  select * into v_opp
  from public.crm_opportunities
  where id=p_opportunity_id and archived_at is null
  for update;

  if not found then raise exception 'Opportunity not found.'; end if;
  if not public.is_admin() and (
    not public.has_active_role(array['sales']::text[])
    or v_opp.salesperson_id is distinct from v_uid
  ) then
    raise exception 'You may update Negotiation state only for your assigned opportunity.';
  end if;
  if v_opp.status<>'Open' then raise exception 'Closed opportunities cannot change Negotiation state.'; end if;
  if v_opp.stage not in ('Quotation Sent','Negotiation / Decision Pending') then
    raise exception 'Negotiation decision state is available only after the opportunity reaches Quotation Sent.';
  end if;

  if v_status is null or v_status not in (
    'AWAITING_CLIENT_RESPONSE','CLIENT_REVIEWING','QUESTIONS_OR_OBJECTIONS',
    'REVISION_REQUESTED','COMMERCIAL_REVIEW_REQUIRED','INTERNAL_CLIENT_APPROVAL',
    'DECISION_DATE_CONFIRMED','PAUSED_BY_CLIENT'
  ) then
    raise exception 'Choose a valid customer decision status.';
  end if;

  if v_objection is not null and v_objection not in (
    'PRICE','BUDGET','SCOPE','TIMELINE','TRUST','AUTHORITY',
    'INTERNAL_APPROVAL','PROCUREMENT','COMPETITOR','PRIORITY','NO_RESPONSE','OTHER'
  ) then
    raise exception 'Choose a valid objection category.';
  end if;

  if v_waiting is not null and v_waiting not in (
    'CLIENT','PROFOX','SPECIALIST','PROCUREMENT','THIRD_PARTY'
  ) then
    raise exception 'Choose a valid waiting-on state.';
  end if;

  if v_status='QUESTIONS_OR_OBJECTIONS' and v_objection is null then
    raise exception 'Record the known objection category for Questions or Objections.';
  end if;

  if v_status in ('AWAITING_CLIENT_RESPONSE','CLIENT_REVIEWING','INTERNAL_CLIENT_APPROVAL','PAUSED_BY_CLIENT')
     and v_waiting is null then
    raise exception 'Record who the opportunity is currently waiting on.';
  end if;

  v_old:=jsonb_build_object(
    'decisionStatus',v_opp.decision_status,
    'primaryObjectionCategory',v_opp.primary_objection_category,
    'waitingOn',v_opp.waiting_on,
    'decisionExpectedAt',v_opp.decision_expected_at
  );

  perform set_config('app.crm_negotiation_rpc','1',true);
  update public.crm_opportunities
  set decision_status=v_status,
      primary_objection_category=v_objection,
      waiting_on=v_waiting,
      decision_expected_at=p_decision_expected_at,
      decision_recorded_at=now(),
      decision_recorded_by=v_uid,
      updated_at=now()
  where id=p_opportunity_id
  returning * into v_opp;

  if v_opp.lead_id is not null then
    perform public.crm_write_lead_event(
      v_opp.lead_id,
      'negotiation_decision_state_changed',
      'Negotiation decision state updated',
      'The current customer decision state was recorded for this opportunity.',
      jsonb_build_object(
        'opportunityId',v_opp.id,
        'before',v_old,
        'after',jsonb_build_object(
          'decisionStatus',v_opp.decision_status,
          'primaryObjectionCategory',v_opp.primary_objection_category,
          'waitingOn',v_opp.waiting_on,
          'decisionExpectedAt',v_opp.decision_expected_at
        )
      ),
      v_uid,null,null,now(),
      'part11-decision:'||v_opp.id::text||':'||extract(epoch from v_opp.decision_recorded_at)::bigint::text
    );
  end if;

  return jsonb_build_object(
    'id',v_opp.id,
    'decisionStatus',v_opp.decision_status,
    'primaryObjectionCategory',v_opp.primary_objection_category,
    'waitingOn',v_opp.waiting_on,
    'decisionExpectedAt',v_opp.decision_expected_at,
    'decisionRecordedAt',v_opp.decision_recorded_at
  );
end
$$;

revoke all on function public.crm_record_negotiation_decision_state(uuid,text,text,text,timestamptz) from public, anon;
grant execute on function public.crm_record_negotiation_decision_state(uuid,text,text,text,timestamptz) to authenticated, service_role;

create or replace function public.crm_schedule_opportunity_next_action(
  p_opportunity_id uuid,
  p_due_at timestamptz,
  p_subject text,
  p_activity_type text default 'Quotation Follow-Up',
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public, pg_temp
as $$
declare
  v_opp public.crm_opportunities%rowtype;
  v_activity public.crm_activities%rowtype;
  v_uid uuid:=auth.uid();
  v_subject text:=btrim(coalesce(p_subject,''));
  v_type text:=btrim(coalesce(p_activity_type,'Quotation Follow-Up'));
  v_cfg jsonb;
  v_type_cfg jsonb;
  v_due timestamptz;
  v_channel text;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;

  select * into v_opp
  from public.crm_opportunities
  where id=p_opportunity_id and archived_at is null
  for update;

  if not found then raise exception 'Opportunity not found.'; end if;
  if not public.is_admin() and (
    not public.has_active_role(array['sales']::text[])
    or v_opp.salesperson_id is distinct from v_uid
  ) then
    raise exception 'You may schedule actions only for your assigned opportunity.';
  end if;
  if v_opp.status<>'Open' then raise exception 'Closed opportunities cannot receive a next action.'; end if;
  if v_opp.salesperson_id is null then raise exception 'Assign an opportunity owner before scheduling the next action.'; end if;
  if not exists(
    select 1 from public.user_profiles up
    where up.id=v_opp.salesperson_id
      and up.status='active'
      and up.role in ('sales','admin')
  ) then
    raise exception 'The opportunity owner must be an active authorized Sales/Admin user.';
  end if;
  if p_due_at is null or p_due_at<=now() then raise exception 'Choose a future next-action date and time.'; end if;
  if char_length(v_subject) not between 2 and 180 then raise exception 'Next-action subject must be between 2 and 180 characters.'; end if;

  select config_value into v_cfg
  from public.system_configuration
  where config_key='crm_activity_execution_settings';

  select value into v_type_cfg
  from jsonb_array_elements(coalesce(v_cfg->'types','[]'::jsonb))
  where value->>'name'=v_type
    and coalesce((value->>'active')::boolean,true)
  limit 1;

  if v_type_cfg is null then raise exception 'Choose an active canonical CRM activity type.'; end if;

  v_due:=public.crm_adjust_activity_due(v_opp.salesperson_id,p_due_at);
  v_channel:=coalesce(nullif(v_type_cfg->>'channel',''),'CRM');

  perform set_config('app.crm_activity_rpc','1',true);
  insert into public.crm_activities(
    lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,
    channel,notes,created_by,automation_source
  ) values(
    v_opp.lead_id,v_opp.id,v_opp.salesperson_id,v_type,v_subject,v_due,'Scheduled',
    v_channel,left(coalesce(p_notes,''),5000),v_uid,'part11_negotiation_next_action'
  )
  returning * into v_activity;

  update public.crm_opportunities
  set next_follow_up_at=(
        select min(a.due_at)
        from public.crm_activities a
        where a.opportunity_id=v_opp.id and a.status='Scheduled'
      ),
      updated_at=now()
  where id=v_opp.id;

  return jsonb_build_object(
    'id',v_activity.id,
    'opportunityId',v_activity.opportunity_id,
    'leadId',v_activity.lead_id,
    'assignedTo',v_activity.assigned_to,
    'activityType',v_activity.activity_type,
    'subject',v_activity.subject,
    'dueAt',v_activity.due_at,
    'status',v_activity.status,
    'channel',v_activity.channel
  );
end
$$;

revoke all on function public.crm_schedule_opportunity_next_action(uuid,timestamptz,text,text,text) from public, anon;
grant execute on function public.crm_schedule_opportunity_next_action(uuid,timestamptz,text,text,text) to authenticated, service_role;

create or replace function public.crm_reschedule_activity(
  p_activity_id uuid,
  p_due_at timestamptz,
  p_reason text default '',
  p_snooze boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public, pg_temp
as $$
declare
  a public.crm_activities%rowtype;
  v_due timestamptz;
  v_required_after int:=2;
  v_cfg jsonb;
  v_negotiation boolean:=false;
begin
  if not public.crm_can_manage_activity(p_activity_id) then raise exception 'Activity access denied.'; end if;
  select * into a from public.crm_activities where id=p_activity_id for update;
  if a.status<>'Scheduled' then raise exception 'Closed activities cannot be rescheduled.'; end if;
  if p_due_at is null or p_due_at<=now() then raise exception 'Choose a future due date and time.'; end if;

  v_negotiation:=a.opportunity_id is not null and exists(
    select 1 from public.crm_opportunities o
    where o.id=a.opportunity_id
      and o.status='Open'
      and o.stage='Negotiation / Decision Pending'
      and o.archived_at is null
  );

  select config_value into v_cfg from public.system_configuration where config_key='crm_activity_execution_settings';
  v_required_after:=coalesce((v_cfg#>>'{discipline,rescheduleReasonRequiredAfter}')::int,2);

  if v_negotiation and char_length(btrim(coalesce(p_reason,'')))<3 then
    raise exception 'A real reschedule reason is required for Negotiation next actions.';
  elsif a.reschedule_count+1>v_required_after and char_length(btrim(coalesce(p_reason,'')))<3 then
    raise exception 'A reason is required after repeated rescheduling.';
  end if;

  v_due:=public.crm_adjust_activity_due(coalesce(a.assigned_to,(select auth.uid())),p_due_at);
  perform set_config('app.crm_activity_rpc','1',true);
  update public.crm_activities set
    original_due_at=coalesce(original_due_at,due_at),
    due_at=v_due,
    reschedule_count=reschedule_count+1,
    last_rescheduled_at=now(),
    last_rescheduled_by=(select auth.uid()),
    last_reschedule_reason=left(btrim(coalesce(p_reason,'')),1000),
    last_reschedule_kind=case when p_snooze then 'snooze' else 'reschedule' end,
    updated_at=now()
  where id=p_activity_id returning * into a;

  if a.lead_id is not null then
    update public.crm_leads
    set next_follow_up_at=v_due,updated_at=now()
    where id=a.lead_id
      and (next_follow_up_at is null or next_follow_up_at<=a.original_due_at or next_follow_up_at<=now());
  end if;

  if a.opportunity_id is not null then
    update public.crm_opportunities
    set next_follow_up_at=(
      select min(x.due_at)
      from public.crm_activities x
      where x.opportunity_id=a.opportunity_id and x.status='Scheduled'
    ),updated_at=now()
    where id=a.opportunity_id;
  end if;

  return jsonb_build_object(
    'id',a.id,
    'dueAt',a.due_at,
    'originalDueAt',a.original_due_at,
    'rescheduleCount',a.reschedule_count,
    'calendarAdjusted',a.due_at is distinct from p_due_at
  );
end
$$;

revoke all on function public.crm_reschedule_activity(uuid,timestamptz,text,boolean) from public, anon;
grant execute on function public.crm_reschedule_activity(uuid,timestamptz,text,boolean) to authenticated, service_role;

create or replace function public.crm_cancel_activity(
  p_activity_id uuid,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public, pg_temp
as $$
declare
  a public.crm_activities%rowtype;
  v_negotiation boolean:=false;
begin
  if not public.crm_can_manage_activity(p_activity_id) then raise exception 'Activity access denied.'; end if;
  select * into a from public.crm_activities where id=p_activity_id for update;
  if a.status<>'Scheduled' then raise exception 'Only scheduled activities can be cancelled.'; end if;

  v_negotiation:=a.opportunity_id is not null and exists(
    select 1 from public.crm_opportunities o
    where o.id=a.opportunity_id
      and o.status='Open'
      and o.stage='Negotiation / Decision Pending'
      and o.archived_at is null
  );

  if v_negotiation and char_length(btrim(coalesce(p_reason,'')))<3 then
    raise exception 'A real cancellation reason is required for Negotiation next actions.';
  end if;

  if v_negotiation and not exists(
    select 1 from public.crm_activities x
    where x.opportunity_id=a.opportunity_id
      and x.status='Scheduled'
      and x.id<>a.id
  ) then
    raise exception 'Schedule a replacement opportunity-linked action before cancelling the current Negotiation next action.';
  end if;

  perform set_config('app.crm_activity_rpc','1',true);
  update public.crm_activities
  set status='Cancelled',
      cancellation_reason=left(btrim(coalesce(p_reason,'')),1000),
      updated_at=now()
  where id=p_activity_id
  returning * into a;

  if a.opportunity_id is not null then
    update public.crm_opportunities
    set next_follow_up_at=(
      select min(x.due_at)
      from public.crm_activities x
      where x.opportunity_id=a.opportunity_id and x.status='Scheduled'
    ),updated_at=now()
    where id=a.opportunity_id;
  end if;

  if a.lead_id is not null then
    perform public.crm_refresh_lead_next_follow_up(a.lead_id);
  end if;

  return jsonb_build_object('id',a.id,'status',a.status,'cancellationReason',a.cancellation_reason);
end
$$;

revoke all on function public.crm_cancel_activity(uuid,text) from public, anon;
grant execute on function public.crm_cancel_activity(uuid,text) to authenticated, service_role;

create or replace function public.crm_transition_opportunity(p_opportunity_id uuid, p_target_stage text)
returns jsonb
language plpgsql
security definer
set search_path=public, pg_temp
as $$
declare
  v_opp public.crm_opportunities%rowtype;
  v_config jsonb; v_current jsonb; v_target jsonb;
  v_current_order int; v_target_order int; v_field text; v_missing text[]:=array[]::text[];
  v_default_probability int; v_is_admin boolean:=public.is_admin();
  v_gate jsonb; v_blocker_messages text[]:=array[]::text[]; v_blocker jsonb;
  v_next public.crm_activities%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_opp from public.crm_opportunities where id=p_opportunity_id for update;
  if not found or v_opp.archived_at is not null then raise exception 'Opportunity not found.'; end if;
  if not v_is_admin and (not public.has_active_role(array['sales']::text[]) or v_opp.salesperson_id is distinct from auth.uid()) then raise exception 'You do not have permission to move this opportunity.'; end if;
  if v_opp.status<>'Open' then raise exception 'Only open opportunities can move between pipeline stages.'; end if;

  select config_value into v_config from public.system_configuration where config_key='crm_pipeline_settings';
  select value into v_current from jsonb_array_elements(v_config->'stages') where value->>'name'=v_opp.stage limit 1;
  select value into v_target from jsonb_array_elements(v_config->'stages') where value->>'name'=p_target_stage limit 1;
  if v_current is null then raise exception 'Current pipeline stage is not configured.'; end if;
  if v_target is null or not coalesce((v_target->>'active')::boolean,false) then raise exception 'Target pipeline stage is not active.'; end if;
  if p_target_stage=v_opp.stage then return to_jsonb(v_opp); end if;

  v_current_order:=(v_current->>'order')::int; v_target_order:=(v_target->>'order')::int;
  if v_target_order>v_current_order then
    if not (coalesce((v_current->>'allowSkip')::boolean,false) or coalesce(v_current->'allowedNext','[]'::jsonb) ? p_target_stage) then raise exception 'Transition from % to % is not permitted.',v_opp.stage,p_target_stage; end if;
  else
    if not coalesce((v_current->>'allowBackward')::boolean,false) or not (coalesce(v_current->'allowedPrevious','[]'::jsonb) ? p_target_stage) then raise exception 'Backward transition from % to % is not permitted.',v_opp.stage,p_target_stage; end if;
  end if;
  if coalesce((v_target->>'approvalRequired')::boolean,false) and not v_is_admin then raise exception 'This stage requires Admin approval.'; end if;

  for v_field in select jsonb_array_elements_text(coalesce(v_target->'requiredFields','[]'::jsonb)) loop
    if (v_field='contactName' and nullif(btrim(coalesce(v_opp.contact_name,'')),'') is null)
       or (v_field='email' and nullif(btrim(coalesce(v_opp.email,'')),'') is null)
       or (v_field='phone' and nullif(btrim(coalesce(v_opp.phone,'')),'') is null)
       or (v_field='companyName' and nullif(btrim(coalesce(v_opp.company_name,'')),'') is null)
       or (v_field='country' and nullif(btrim(coalesce(v_opp.country,'')),'') is null)
       or (v_field='serviceInterest' and nullif(btrim(coalesce(v_opp.service_interest,'')),'') is null)
       or (v_field='requirementsSummary' and nullif(btrim(coalesce(v_opp.requirements_summary,'')),'') is null)
       or (v_field='nextFollowUpAt' and v_opp.next_follow_up_at is null)
       or (v_field='expectedValue' and coalesce(v_opp.expected_value,0)<=0) then v_missing:=array_append(v_missing,v_field); end if;
  end loop;
  if cardinality(v_missing)>0 then raise exception 'Missing required information: %',array_to_string(v_missing,', '); end if;

  if p_target_stage='Meeting Scheduled' and not exists(select 1 from public.sales_meetings m where m.opportunity_id=v_opp.id and m.status in ('Scheduled','Rescheduled')) then raise exception 'Schedule the sales meeting before moving this opportunity to Meeting Scheduled.'; end if;

  if p_target_stage='Requirements Confirmed' then
    v_gate:=public.crm_get_sales_gate_assessment(v_opp.id,'REQUIREMENTS_CONFIRMED');
    if v_gate->>'status'='BLOCKED' then
      for v_blocker in select value from jsonb_array_elements(coalesce(v_gate->'blockers','[]'::jsonb)) limit 5 loop
        v_blocker_messages:=array_append(v_blocker_messages,coalesce(v_blocker->>'message','Unresolved readiness blocker'));
      end loop;
      raise exception 'Requirements Confirmed is blocked: %',array_to_string(v_blocker_messages,' | ');
    end if;
  end if;

  if p_target_stage='Quotation Sent' and not exists(select 1 from public.quotations q where q.opportunity_id=v_opp.id and q.sent_at is not null and q.status in ('Sent','Accepted','Rejected','Expired')) then raise exception 'An approved quotation must be sent before moving this opportunity to Quotation Sent.'; end if;

  if p_target_stage='Negotiation / Decision Pending' then
    if not exists(
      select 1 from public.quotations q
      where q.opportunity_id=v_opp.id
        and q.sent_at is not null
        and q.status in ('Sent','Accepted','Rejected','Expired')
    ) then
      raise exception 'A canonical sent quotation is required before entering Negotiation.';
    end if;

    if v_opp.decision_status is null then
      raise exception 'Record the current customer decision status before moving this opportunity into Negotiation.';
    end if;

    if v_opp.decision_status='QUESTIONS_OR_OBJECTIONS'
       and v_opp.primary_objection_category is null then
      raise exception 'Record the known objection category before moving this opportunity into Negotiation.';
    end if;

    select * into v_next
    from public.crm_activities a
    where a.opportunity_id=v_opp.id
      and a.status='Scheduled'
    order by a.due_at, a.created_at, a.id
    limit 1;

    if not found then
      raise exception 'Schedule the next customer action and assign an owner.';
    end if;
    if v_next.assigned_to is null then
      raise exception 'Assign an owner to the current next action.';
    end if;
    if not exists(
      select 1 from public.user_profiles up
      where up.id=v_next.assigned_to
        and up.status='active'
        and up.role in ('sales','admin')
    ) then
      raise exception 'The current next-action owner is not an active authorized Sales/Admin user.';
    end if;
    if nullif(btrim(coalesce(v_next.subject,'')),'') is null then
      raise exception 'Record a meaningful subject for the current next action.';
    end if;
    if v_next.due_at<=now() then
      raise exception 'The current next action is overdue. Complete or reschedule it before entering Negotiation.';
    end if;
  end if;

  if p_target_stage='Awaiting Advance Payment' and not exists(select 1 from public.quotations q where q.opportunity_id=v_opp.id and q.status='Accepted' and q.accepted_at is not null) then raise exception 'The customer must accept the quotation before the opportunity can await advance payment.'; end if;
  if p_target_stage='Won' then
    if not v_is_admin then raise exception 'Won is controlled by Admin payment verification.'; end if;
    if not exists(select 1 from public.payments p where p.opportunity_id=v_opp.id and p.status='Verified' and p.payment_type in ('Advance','Full Payment')) then raise exception 'A verified Advance or Full Payment is required before Won.'; end if;
  end if;

  v_default_probability:=least(greatest(coalesce((v_target->>'defaultProbability')::int,v_opp.probability,0),0),100);
  update public.crm_opportunities set stage=p_target_stage,probability=v_default_probability,status=case when p_target_stage='Won' then 'Won' else status end,won_at=case when p_target_stage='Won' then coalesce(won_at,now()) else won_at end,updated_at=now() where id=v_opp.id returning * into v_opp;
  return to_jsonb(v_opp);
end
$$;

create or replace function public.crm_get_pipeline_command_center()
returns jsonb
language plpgsql
stable
security definer
set search_path=public, pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_config jsonb; v_team boolean; v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  v_team:=public.is_admin() or public.has_active_role(array['project_manager']::text[]);
  if not v_team and not public.has_active_role(array['sales']::text[]) then raise exception 'CRM access required.'; end if;
  select config_value into v_config from public.system_configuration where config_key='crm_pipeline_settings';

  with visible as (
    select o.*,up.full_name owner_name,l.lead_score,l.lead_quality,l.score_reason
    from public.crm_opportunities o
    left join public.user_profiles up on up.id=o.salesperson_id
    left join public.crm_leads l on l.id=o.lead_id
    where o.archived_at is null and (v_team or o.salesperson_id=v_uid)
  ), enriched as (
    select o.*,
      sc.stage_cfg,
      greatest(0,extract(epoch from (now()-o.stage_entered_at))/3600.0) stage_age_hours,
      public.crm_get_last_meaningful_customer_interaction(o.id) last_meaningful_interaction,
      na.id next_activity_id,na.subject next_activity_subject,na.activity_type next_activity_type,
      na.due_at next_activity_due_at,na.assigned_to next_activity_assigned_to,na.owner_name next_activity_owner_name,
      la.outcome latest_completed_outcome,la.completed_at latest_completed_at,
      mt.id meeting_id,mt.status meeting_status,mt.start_at meeting_start_at,mt.outcome meeting_outcome,
      qt.id quotation_id,qt.status quotation_status,qt.sent_at quotation_sent_at,qt.last_viewed_at quotation_viewed_at,qt.view_count quotation_view_count
    from visible o
    left join lateral (select value stage_cfg from jsonb_array_elements(v_config->'stages') where value->>'name'=o.stage limit 1) sc on true
    left join lateral (
      select a.id,a.subject,a.activity_type,a.due_at,a.assigned_to,up.full_name owner_name
      from public.crm_activities a
      left join public.user_profiles up on up.id=a.assigned_to
      where a.opportunity_id=o.id and a.status='Scheduled'
      order by a.due_at,a.created_at,a.id
      limit 1
    ) na on true
    left join lateral (
      select a.outcome,coalesce(a.completed_at,a.outcome_recorded_at) completed_at
      from public.crm_activities a
      where a.opportunity_id=o.id and a.status='Completed'
      order by coalesce(a.completed_at,a.outcome_recorded_at) desc nulls last,a.id
      limit 1
    ) la on true
    left join lateral (select m.id,m.status,m.start_at,m.outcome from public.sales_meetings m where m.opportunity_id=o.id order by case when m.status in ('Scheduled','Rescheduled') and m.start_at>=now() then 0 else 1 end,m.start_at desc limit 1) mt on true
    left join lateral (select q.id,q.status,q.sent_at,q.last_viewed_at,q.view_count from public.quotations q where q.opportunity_id=o.id order by q.created_at desc limit 1) qt on true
  ), scored as (
    select e.*,
      array_remove(array[
        case when e.status='Open' and e.next_activity_id is not null and e.next_activity_due_at<now() then 'Next action overdue' end,
        case when e.status='Open' and e.next_activity_id is null then 'No next action scheduled' end,
        case when e.status='Open' and coalesce((e.stage_cfg->>'slaHours')::numeric,0)>0 and e.stage_age_hours>coalesce((e.stage_cfg->>'slaHours')::numeric,0) then 'Stage SLA exceeded' end,
        case when e.status='Open'
                  and (e.last_meaningful_interaction is null
                       or now()-((e.last_meaningful_interaction->>'at')::timestamptz) > make_interval(hours=>coalesce((v_config#>>'{health,noActivityHours}')::int,72)))
             then 'No recent meaningful customer interaction' end,
        case when e.status='Open' and e.stage='Negotiation / Decision Pending' and e.decision_status is null then 'Decision status not recorded' end,
        case when e.status='Open' and e.stage='Negotiation / Decision Pending'
                  and e.decision_status='QUESTIONS_OR_OBJECTIONS'
                  and e.primary_objection_category is null then 'Known objection category not recorded' end,
        case when e.status='Open' and e.quotation_viewed_at is not null
                  and (e.next_activity_due_at is null or e.next_activity_due_at<=e.quotation_viewed_at)
             then 'Quotation viewed — follow-up recommended' end,
        case when e.status='Open' and e.expected_value>=coalesce((v_config#>>'{health,highValueThreshold}')::numeric,5000)
                  and (e.last_meaningful_interaction is null
                       or now()-((e.last_meaningful_interaction->>'at')::timestamptz) > make_interval(hours=>coalesce((v_config#>>'{health,highValueInactivityHours}')::int,48)))
             then 'High-value opportunity inactive' end,
        case when e.status='Open' and e.meeting_status='Completed' and coalesce(nullif(e.meeting_outcome,''),'')='' then 'Meeting outcome missing' end
      ],null) health_reasons
    from enriched e
  )
  select jsonb_build_object(
    'generatedAt',now(),
    'scope',case when v_team then 'team' else 'individual' end,
    'config',v_config,
    'opportunities',coalesce(jsonb_agg(
      jsonb_build_object(
        'id',s.id,'leadId',s.lead_id,'name',s.name,'companyName',s.company_name,'contactName',s.contact_name,'email',s.email,'phone',s.phone,'country',s.country,'industry',s.industry,'source',s.source,'selfGenerated',s.self_generated,
        'salespersonId',s.salesperson_id,'ownerName',coalesce(s.owner_name,'Unassigned'),'serviceInterest',s.service_interest,'expectedValue',s.expected_value,'currency',s.currency,'stage',s.stage,'status',s.status,'probability',s.probability,
        'meetingAt',s.meeting_at,'meetingUrl',s.meeting_url,'requirementsSummary',s.requirements_summary,'nextFollowUpAt',s.next_follow_up_at,'notes',s.notes,'lostReason',s.lost_reason,'wonAt',s.won_at,'lostAt',s.lost_at,'createdAt',s.created_at,'updatedAt',s.updated_at,
        'decisionStatus',s.decision_status,'primaryObjectionCategory',s.primary_objection_category,'waitingOn',s.waiting_on,'decisionExpectedAt',s.decision_expected_at,'decisionRecordedAt',s.decision_recorded_at,
        'leadScore',coalesce(s.lead_score,0),'leadQuality',coalesce(s.lead_quality,'Low'),'scoreReason',coalesce(s.score_reason,''),'stageEnteredAt',s.stage_entered_at,'stageAgeHours',round(s.stage_age_hours,1),'stageSlaHours',coalesce((s.stage_cfg->>'slaHours')::numeric,0),
        'lastMeaningfulActivity',s.last_meaningful_interaction,
        'nextActivity',case when s.next_activity_id is null then null else jsonb_build_object('id',s.next_activity_id,'subject',s.next_activity_subject,'type',s.next_activity_type,'dueAt',s.next_activity_due_at,'assignedTo',s.next_activity_assigned_to,'ownerName',coalesce(s.next_activity_owner_name,'Unassigned'),'overdue',s.next_activity_due_at<now()) end,
        'latestCompletedOutcome',case when s.latest_completed_at is null then null else jsonb_build_object('outcome',s.latest_completed_outcome,'at',s.latest_completed_at) end,
        'meeting',case when s.meeting_id is null then null else jsonb_build_object('id',s.meeting_id,'status',s.meeting_status,'startAt',s.meeting_start_at,'outcome',s.meeting_outcome) end,
        'quotation',case when s.quotation_id is null then null else jsonb_build_object('id',s.quotation_id,'status',s.quotation_status,'sentAt',s.quotation_sent_at,'viewedAt',s.quotation_viewed_at,'viewCount',coalesce(s.quotation_view_count,0)) end,
        'health',jsonb_build_object('status',case when cardinality(s.health_reasons)>=2 or 'Next action overdue'=any(s.health_reasons) or 'Stage SLA exceeded'=any(s.health_reasons) then 'At Risk' when cardinality(s.health_reasons)=1 then 'Needs Attention' else 'Healthy' end,'reasons',to_jsonb(s.health_reasons)),
        'negotiationAttentionReason',case
          when s.stage<>'Negotiation / Decision Pending' then null
          when s.decision_status is null then 'Record the current customer decision status.'
          when s.next_activity_id is null then 'Schedule the next opportunity-linked action.'
          when s.next_activity_due_at<now() then 'Complete or reschedule the overdue next action.'
          when s.decision_status='QUESTIONS_OR_OBJECTIONS' and s.primary_objection_category is null then 'Record the known objection category.'
          else null end,
        'nextBestAction',public.get_productivity_next_action('opportunity',s.id)
      ) order by s.created_at desc
    ),'[]'::jsonb)
  ) into v_result from scored s;
  return v_result;
end
$$;

revoke all on function public.crm_transition_opportunity(uuid,text) from public, anon;
grant execute on function public.crm_transition_opportunity(uuid,text) to authenticated, service_role;

revoke all on function public.crm_get_pipeline_command_center() from public, anon;
grant execute on function public.crm_get_pipeline_command_center() to authenticated, service_role;

do $part11_post$
declare
  v_cfg jsonb;
begin
  select config_value into v_cfg
  from public.system_configuration
  where config_key='crm_quotation_sales_reconciliation_policy_v1';

  if coalesce((v_cfg->>'finalQuotationSendGateActive')::boolean,false) is distinct from true
     or coalesce((v_cfg->>'policyVersion')::int,0) <> 2
     or coalesce((v_cfg->>'snapshotSchemaVersion')::int,0) <> 2 then
    raise exception 'Part 11 must not weaken the active Part 10B Send gate.';
  end if;
end
$part11_post$;

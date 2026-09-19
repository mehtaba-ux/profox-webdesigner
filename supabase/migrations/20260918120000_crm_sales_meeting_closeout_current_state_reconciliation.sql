-- Part 10B.6 forward-only current-state reconciliation: Meeting close-out.
-- NEW reconciliation migration. The unresolved historical Part 5 file remains untouched,
-- unexecuted, and must never be inserted into profox_migrations.applied_migrations.
-- Production execution is not authorized by this repository implementation.
--
-- Stable postcondition IDs:
-- P10B6_MEETING_FUNCTIONS_CURRENT
-- P10B6_MEETING_ACLS_CURRENT
-- P10B6_MEETING_COMPLETED_NOSHOW_BOUNDARY
-- P10B6_MEETING_BUSINESS_COUNTS_UNCHANGED
-- P10B6_SEND_GATE_FALSE

do $p10b6_pre$
declare
  r record;
  v_bad integer;
begin
  if to_regclass('public.sales_meetings') is null
     or to_regclass('public.crm_activities') is null
     or to_regclass('public.crm_opportunities') is null then
    raise exception '[P10B6_MEETING_PRECONDITION] required canonical meeting/CRM tables are missing.';
  end if;

  if to_regprocedure('public.service_meeting_crm_lead_id(uuid)') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.has_active_role(text[])') is null
     or to_regprocedure('public.queue_meeting_status_automation()') is null then
    raise exception '[P10B6_MEETING_PRECONDITION] required canonical helper functions are missing.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.sales_meetings'::regclass
      and tgname='trg_queue_meeting_status_automation'
      and not tgisinternal and tgenabled<>'D'
      and pg_get_triggerdef(oid,true)='CREATE TRIGGER trg_queue_meeting_status_automation AFTER UPDATE OF status ON sales_meetings FOR EACH ROW EXECUTE FUNCTION queue_meeting_status_automation()'
  ) then
    raise exception '[P10B6_MEETING_PRECONDITION] No Show status automation boundary is missing or drifted.';
  end if;

  for r in
    select * from (values
      ('crm_activities','activity_type','text',true),
      ('crm_activities','assigned_to','uuid',false),
      ('crm_activities','automation_source','text',true),
      ('crm_activities','channel','text',false),
      ('crm_activities','completed_at','timestamp with time zone',false),
      ('crm_activities','created_by','uuid',false),
      ('crm_activities','due_at','timestamp with time zone',true),
      ('crm_activities','lead_id','uuid',false),
      ('crm_activities','notes','text',false),
      ('crm_activities','opportunity_id','uuid',false),
      ('crm_activities','status','text',true),
      ('crm_activities','subject','text',true),
      ('crm_activities','updated_at','timestamp with time zone',true),
      ('crm_opportunities','id','uuid',true),
      ('crm_opportunities','next_follow_up_at','timestamp with time zone',false),
      ('crm_opportunities','requirements_summary','text',false),
      ('crm_opportunities','stage','text',true),
      ('crm_opportunities','updated_at','timestamp with time zone',true),
      ('sales_meetings','activity_id','uuid',false),
      ('sales_meetings','commercial_notes','text',true),
      ('sales_meetings','completed_at','timestamp with time zone',false),
      ('sales_meetings','decision_makers','text',true),
      ('sales_meetings','follow_up_at','timestamp with time zone',false),
      ('sales_meetings','id','uuid',true),
      ('sales_meetings','next_step','text',true),
      ('sales_meetings','opportunity_id','uuid',false),
      ('sales_meetings','outcome','text',true),
      ('sales_meetings','problems_identified','text',true),
      ('sales_meetings','requirements_summary','text',true),
      ('sales_meetings','salesperson_id','uuid',true),
      ('sales_meetings','status','text',true),
      ('sales_meetings','timeline_notes','text',true),
      ('sales_meetings','title','text',true),
      ('sales_meetings','updated_at','timestamp with time zone',true)
    ) as expected(table_name,column_name,data_type,not_null)
  loop
    if not exists (
      select 1
      from pg_attribute a
      join pg_class c on c.oid=a.attrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=r.table_name
        and a.attname=r.column_name and a.attnum>0 and not a.attisdropped
        and format_type(a.atttypid,a.atttypmod)=r.data_type
        and a.attnotnull=r.not_null
    ) then
      raise exception '[P10B6_MEETING_PRECONDITION] incompatible or missing %.% column.',r.table_name,r.column_name;
    end if;
  end loop;

  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='save_sales_meeting_closeout_draft'
    and pg_get_function_identity_arguments(p.oid)<>'p_meeting_id uuid, p_outcome text, p_requirements_summary text, p_problems_identified text, p_decision_makers text, p_commercial_notes text, p_timeline_notes text, p_next_step text, p_follow_up_at timestamp with time zone';
  if v_bad<>0 then
    raise exception '[P10B6_MEETING_PRECONDITION] unexpected save_sales_meeting_closeout_draft overload.';
  end if;

  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='finalize_sales_meeting'
    and pg_get_function_identity_arguments(p.oid)<>'p_meeting_id uuid, p_status text, p_outcome text, p_requirements_summary text, p_problems_identified text, p_decision_makers text, p_commercial_notes text, p_timeline_notes text, p_next_step text, p_follow_up_at timestamp with time zone';
  if v_bad<>0 then
    raise exception '[P10B6_MEETING_PRECONDITION] unexpected finalize_sales_meeting overload.';
  end if;

  if not exists (
      select 1 from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
        and coalesce((config_value->>'finalQuotationSendGateActive')::boolean,false)=false
    ) then
    raise exception '[P10B6_SEND_GATE_FALSE] finalQuotationSendGateActive must exist and remain false.';
  end if;

  perform set_config('profox.part10b6.meeting_count',(select count(*)::text from public.sales_meetings),true);
  perform set_config('profox.part10b6.activity_count',(select count(*)::text from public.crm_activities),true);
  perform set_config('profox.part10b6.opportunity_count',(select count(*)::text from public.crm_opportunities),true);
end
$p10b6_pre$;

CREATE OR REPLACE FUNCTION public.save_sales_meeting_closeout_draft(p_meeting_id uuid, p_outcome text DEFAULT ''::text, p_requirements_summary text DEFAULT ''::text, p_problems_identified text DEFAULT ''::text, p_decision_makers text DEFAULT ''::text, p_commercial_notes text DEFAULT ''::text, p_timeline_notes text DEFAULT ''::text, p_next_step text DEFAULT ''::text, p_follow_up_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS sales_meetings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.finalize_sales_meeting(p_meeting_id uuid, p_status text, p_outcome text DEFAULT ''::text, p_requirements_summary text DEFAULT ''::text, p_problems_identified text DEFAULT ''::text, p_decision_makers text DEFAULT ''::text, p_commercial_notes text DEFAULT ''::text, p_timeline_notes text DEFAULT ''::text, p_next_step text DEFAULT ''::text, p_follow_up_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS sales_meetings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;


revoke all on function public.save_sales_meeting_closeout_draft(uuid,text,text,text,text,text,text,text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.save_sales_meeting_closeout_draft(uuid,text,text,text,text,text,text,text,timestamptz)
  to authenticated, service_role;

revoke all on function public.finalize_sales_meeting(uuid,text,text,text,text,text,text,text,text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_sales_meeting(uuid,text,text,text,text,text,text,text,text,timestamptz)
  to authenticated, service_role;

do $p10b6_post$
declare
  v_save oid:=to_regprocedure('public.save_sales_meeting_closeout_draft(uuid,text,text,text,text,text,text,text,timestamp with time zone)');
  v_finalize oid:=to_regprocedure('public.finalize_sales_meeting(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)');
  v_def text;
begin
  if v_save is null or v_finalize is null
     or md5(pg_get_functiondef(v_save))<>'8bbb6f4d32ba6c5173f84f37200052be'
     or md5(pg_get_functiondef(v_finalize))<>'81bf7e2a5732798d58fa6fe12bd5af53'
     or not (select prosecdef and proconfig=array['search_path=public, pg_temp']::text[] from pg_proc where oid=v_save)
     or not (select prosecdef and proconfig=array['search_path=public, pg_temp']::text[] from pg_proc where oid=v_finalize) then
    raise exception '[P10B6_MEETING_FUNCTIONS_CURRENT] canonical function/security contract mismatch.';
  end if;

  if has_function_privilege('anon',v_save,'EXECUTE')
     or not has_function_privilege('authenticated',v_save,'EXECUTE')
     or not has_function_privilege('service_role',v_save,'EXECUTE')
     or has_function_privilege('anon',v_finalize,'EXECUTE')
     or not has_function_privilege('authenticated',v_finalize,'EXECUTE')
     or not has_function_privilege('service_role',v_finalize,'EXECUTE') then
    raise exception '[P10B6_MEETING_ACLS_CURRENT] close-out RPC ACL mismatch.';
  end if;

  v_def:=pg_get_functiondef(v_finalize);
  if position('p_status = ''Completed''' in v_def)=0
     or position('meeting-followup:' in v_def)=0
     or position('queue_meeting_status_automation' in 'CREATE TRIGGER trg_queue_meeting_status_automation AFTER UPDATE OF status ON sales_meetings FOR EACH ROW EXECUTE FUNCTION queue_meeting_status_automation()')=0 then
    raise exception '[P10B6_MEETING_COMPLETED_NOSHOW_BOUNDARY] Completed/No Show automation boundary drifted.';
  end if;

  if (select count(*) from public.sales_meetings)<>current_setting('profox.part10b6.meeting_count')::bigint
     or (select count(*) from public.crm_activities)<>current_setting('profox.part10b6.activity_count')::bigint
     or (select count(*) from public.crm_opportunities)<>current_setting('profox.part10b6.opportunity_count')::bigint then
    raise exception '[P10B6_MEETING_BUSINESS_COUNTS_UNCHANGED] reconciliation created or removed business rows.';
  end if;

  if not exists (
      select 1 from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
        and coalesce((config_value->>'finalQuotationSendGateActive')::boolean,false)=false
    ) then
    raise exception '[P10B6_SEND_GATE_FALSE] finalQuotationSendGateActive changed from false.';
  end if;
end
$p10b6_post$;

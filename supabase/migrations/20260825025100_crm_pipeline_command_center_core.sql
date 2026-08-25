-- ProFox CRM Pipeline Command Center core
-- Applied to production Supabase before this source-control mirror.
-- Extends the existing CRM, timeline, configuration and productivity systems.

alter table public.crm_opportunities
  add column if not exists stage_entered_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.user_profiles(id) on delete set null;

alter table public.crm_leads
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.user_profiles(id) on delete set null;

update public.crm_opportunities
set stage_entered_at = coalesce(stage_entered_at, updated_at, created_at, now())
where stage_entered_at is null;

alter table public.crm_opportunities alter column stage_entered_at set default now();
alter table public.crm_opportunities alter column stage_entered_at set not null;

-- History must never silently disappear with a lead.
alter table public.crm_lead_events drop constraint if exists crm_lead_events_lead_id_fkey;
alter table public.crm_lead_events
  add constraint crm_lead_events_lead_id_fkey
  foreign key (lead_id) references public.crm_leads(id) on delete restrict;

drop policy if exists crm_leads_delete on public.crm_leads;
drop policy if exists crm_opportunities_delete on public.crm_opportunities;
revoke delete on public.crm_leads from authenticated;
revoke delete on public.crm_opportunities from authenticated;

create index if not exists idx_crm_opportunities_owner_open_stage
  on public.crm_opportunities(salesperson_id,status,stage) where archived_at is null;
create index if not exists idx_crm_opportunities_open_stage_age
  on public.crm_opportunities(stage,stage_entered_at) where status='Open' and archived_at is null;
create index if not exists idx_crm_opportunities_open_follow_up
  on public.crm_opportunities(next_follow_up_at) where status='Open' and archived_at is null;
create index if not exists idx_crm_activities_opportunity_status_due
  on public.crm_activities(opportunity_id,status,due_at) where opportunity_id is not null;

insert into public.system_configuration(config_key,config_value,description,updated_at)
values(
  'crm_pipeline_settings',
  '{"version":1,"stages":[{"name":"Qualified","order":10,"color":"#475569","active":true,"defaultProbability":10,"slaHours":72,"requiredFields":[],"allowedPrevious":[],"allowedNext":["Meeting Scheduled"],"allowSkip":false,"allowBackward":false,"approvalRequired":false,"classification":"open"},{"name":"Meeting Scheduled","order":20,"color":"#2563eb","active":true,"defaultProbability":20,"slaHours":120,"requiredFields":["contactName","email"],"allowedPrevious":["Qualified"],"allowedNext":["Requirements Confirmed"],"allowSkip":false,"allowBackward":true,"approvalRequired":false,"classification":"open"},{"name":"Requirements Confirmed","order":30,"color":"#7c3aed","active":true,"defaultProbability":35,"slaHours":72,"requiredFields":["requirementsSummary"],"allowedPrevious":["Meeting Scheduled"],"allowedNext":["Quotation Sent"],"allowSkip":false,"allowBackward":true,"approvalRequired":false,"classification":"open"},{"name":"Quotation Sent","order":40,"color":"#0891b2","active":true,"defaultProbability":50,"slaHours":120,"requiredFields":[],"allowedPrevious":["Requirements Confirmed"],"allowedNext":["Negotiation / Decision Pending","Awaiting Advance Payment"],"allowSkip":false,"allowBackward":true,"approvalRequired":false,"classification":"open"},{"name":"Negotiation / Decision Pending","order":50,"color":"#d97706","active":true,"defaultProbability":65,"slaHours":168,"requiredFields":[],"allowedPrevious":["Quotation Sent","Awaiting Advance Payment"],"allowedNext":["Awaiting Advance Payment"],"allowSkip":false,"allowBackward":true,"approvalRequired":false,"classification":"open"},{"name":"Awaiting Advance Payment","order":60,"color":"#ea580c","active":true,"defaultProbability":85,"slaHours":120,"requiredFields":[],"allowedPrevious":["Quotation Sent","Negotiation / Decision Pending"],"allowedNext":["Won"],"allowSkip":false,"allowBackward":true,"approvalRequired":false,"classification":"open"},{"name":"Won","order":70,"color":"#059669","active":true,"defaultProbability":100,"slaHours":0,"requiredFields":[],"allowedPrevious":["Awaiting Advance Payment"],"allowedNext":[],"allowSkip":false,"allowBackward":false,"approvalRequired":true,"classification":"won"}],"health":{"noActivityHours":72,"highValueThreshold":5000,"highValueInactivityHours":48},"lostReasons":["Price / Budget","Not Interested","No Response","Already Has Provider","Project Postponed","Competitor Selected","Decision Maker Declined","Timing Not Suitable","Not Qualified","Other"]}'::jsonb,
  'Admin-editable CRM pipeline stages, transition rules, SLA targets and explainable deal-health thresholds.',
  now()
)
on conflict(config_key) do nothing;

create or replace function public.crm_get_pipeline_configuration()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_config jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.is_admin() and not public.has_active_role(array['sales','project_manager']::text[]) then raise exception 'CRM access required.'; end if;
  select config_value into v_config from public.system_configuration where config_key='crm_pipeline_settings';
  return coalesce(v_config,'{}'::jsonb);
end; $$;
revoke all on function public.crm_get_pipeline_configuration() from public,anon;
grant execute on function public.crm_get_pipeline_configuration() to authenticated;

create or replace function public.crm_admin_save_pipeline_configuration(p_config jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_stage jsonb; v_name text; v_ref text;
  v_allowed_fields text[]:=array['contactName','email','phone','companyName','country','serviceInterest','requirementsSummary','nextFollowUpAt','expectedValue'];
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if jsonb_typeof(coalesce(p_config,'{}'::jsonb))<>'object' or jsonb_typeof(p_config->'stages')<>'array' or jsonb_array_length(p_config->'stages')=0 then raise exception 'Pipeline configuration must contain a non-empty stages array.'; end if;
  if not exists(select 1 from jsonb_array_elements(p_config->'stages') s where s->>'name'='Won' and coalesce((s->>'active')::boolean,false)) then raise exception 'The protected Won stage must remain active.'; end if;
  if exists(select 1 from public.crm_opportunities o where o.archived_at is null and not exists(select 1 from jsonb_array_elements(p_config->'stages') s where s->>'name'=o.stage)) then raise exception 'Configuration cannot remove a stage that is currently used by CRM opportunities.'; end if;
  if exists(select 1 from (select s->>'name' name,count(*) c from jsonb_array_elements(p_config->'stages') s group by s->>'name') x where nullif(btrim(name),'') is null or c>1) then raise exception 'Pipeline stage names must be non-empty and unique.'; end if;
  if exists(select 1 from (select (s->>'order')::int ord,count(*) c from jsonb_array_elements(p_config->'stages') s group by (s->>'order')::int) x where c>1) then raise exception 'Pipeline stage display order must be unique.'; end if;
  for v_stage in select value from jsonb_array_elements(p_config->'stages') loop
    v_name:=v_stage->>'name';
    if coalesce((v_stage->>'defaultProbability')::int,-1) not between 0 and 100 then raise exception 'Default probability for stage % must be between 0 and 100.',v_name; end if;
    if coalesce((v_stage->>'slaHours')::int,-1)<0 then raise exception 'Stage SLA cannot be negative.'; end if;
    if jsonb_typeof(coalesce(v_stage->'requiredFields','[]'::jsonb))<>'array' then raise exception 'requiredFields must be an array.'; end if;
    for v_ref in select jsonb_array_elements_text(coalesce(v_stage->'requiredFields','[]'::jsonb)) loop if not (v_ref=any(v_allowed_fields)) then raise exception 'Unsupported required opportunity field: %',v_ref; end if; end loop;
    for v_ref in select jsonb_array_elements_text(coalesce(v_stage->'allowedNext','[]'::jsonb)) loop if not exists(select 1 from jsonb_array_elements(p_config->'stages') s where s->>'name'=v_ref) then raise exception 'Stage % references unknown next stage %.',v_name,v_ref; end if; end loop;
    for v_ref in select jsonb_array_elements_text(coalesce(v_stage->'allowedPrevious','[]'::jsonb)) loop if not exists(select 1 from jsonb_array_elements(p_config->'stages') s where s->>'name'=v_ref) then raise exception 'Stage % references unknown previous stage %.',v_name,v_ref; end if; end loop;
  end loop;
  insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at) values('crm_pipeline_settings',p_config,'Admin-editable CRM pipeline stages, transition rules, SLA targets and explainable deal-health thresholds.',auth.uid(),now()) on conflict(config_key) do update set config_value=excluded.config_value,description=excluded.description,updated_by=auth.uid(),updated_at=now();
  return p_config;
end; $$;
revoke all on function public.crm_admin_save_pipeline_configuration(jsonb) from public,anon;
grant execute on function public.crm_admin_save_pipeline_configuration(jsonb) to authenticated;

create or replace function public.crm_set_stage_entry_time()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then new.stage_entered_at:=coalesce(new.stage_entered_at,now());
  elsif new.stage is distinct from old.stage then new.stage_entered_at:=now(); end if;
  return new;
end; $$;
drop trigger if exists trigger_crm_set_stage_entry_time on public.crm_opportunities;
create trigger trigger_crm_set_stage_entry_time before insert or update of stage on public.crm_opportunities for each row execute function public.crm_set_stage_entry_time();

create or replace function public.crm_audit_opportunity_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_lead uuid:=coalesce(new.lead_id,old.lead_id); v_duration numeric;
begin
  if v_lead is null then return new; end if;
  if tg_op='INSERT' then
    perform public.crm_write_lead_event(v_lead,'opportunity_created','Opportunity created',coalesce(new.name,'Opportunity')||' entered the sales pipeline.',jsonb_build_object('opportunityId',new.id,'stage',new.stage,'value',new.expected_value,'currency',new.currency,'ownerId',new.salesperson_id),new.created_by,null,null,new.created_at,'opportunity-created:'||new.id::text);
    return new;
  end if;
  if new.stage is distinct from old.stage then
    v_duration:=greatest(0,extract(epoch from (now()-coalesce(old.stage_entered_at,old.updated_at,old.created_at))));
    perform public.crm_write_lead_event(v_lead,'opportunity_stage_changed','Opportunity moved to '||new.stage,'Pipeline stage moved from '||old.stage||' to '||new.stage||'.',jsonb_build_object('opportunityId',new.id,'from',old.stage,'to',new.stage,'previousValue',old.stage,'newValue',new.stage,'stageDurationSeconds',round(v_duration),'source','crm_opportunities'));
  end if;
  if new.salesperson_id is distinct from old.salesperson_id then perform public.crm_write_lead_event(v_lead,'opportunity_owner_changed','Opportunity owner changed','Sales ownership changed.',jsonb_build_object('opportunityId',new.id,'fromUserId',old.salesperson_id,'toUserId',new.salesperson_id)); end if;
  if new.expected_value is distinct from old.expected_value or new.probability is distinct from old.probability then perform public.crm_write_lead_event(v_lead,'opportunity_value_changed','Opportunity value or probability changed','Commercial forecast information was updated.',jsonb_build_object('opportunityId',new.id,'fromValue',old.expected_value,'toValue',new.expected_value,'fromProbability',old.probability,'toProbability',new.probability,'currency',new.currency)); end if;
  if new.next_follow_up_at is distinct from old.next_follow_up_at then perform public.crm_write_lead_event(v_lead,'follow_up_changed',case when new.next_follow_up_at is null then 'Opportunity follow-up cleared' else 'Opportunity follow-up scheduled' end,case when new.next_follow_up_at is null then 'The opportunity next follow-up was cleared.' else 'Next follow-up: '||new.next_follow_up_at::text end,jsonb_build_object('opportunityId',new.id,'from',old.next_follow_up_at,'to',new.next_follow_up_at)); end if;
  if new.status is distinct from old.status and new.status='Won' then perform public.crm_write_lead_event(v_lead,'opportunity_won','Opportunity Won','A verified sale moved the opportunity to Won.',jsonb_build_object('opportunityId',new.id,'fromStatus',old.status,'toStatus',new.status,'wonAt',new.won_at));
  elsif new.status is distinct from old.status and new.status='Lost' then perform public.crm_write_lead_event(v_lead,'opportunity_lost','Opportunity Lost','The opportunity was closed as Lost: '||coalesce(new.lost_reason,'No reason supplied'),jsonb_build_object('opportunityId',new.id,'fromStatus',old.status,'toStatus',new.status,'lostReason',new.lost_reason,'lostAt',new.lost_at)); end if;
  return new;
end; $$;
drop trigger if exists trigger_crm_audit_opportunity_change on public.crm_opportunities;
create trigger trigger_crm_audit_opportunity_change after insert or update on public.crm_opportunities for each row execute function public.crm_audit_opportunity_change();

create or replace function public.crm_transition_opportunity(p_opportunity_id uuid,p_target_stage text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_opp public.crm_opportunities%rowtype; v_config jsonb; v_current jsonb; v_target jsonb; v_current_order int; v_target_order int; v_field text; v_missing text[]:=array[]::text[]; v_default_probability int; v_is_admin boolean:=public.is_admin();
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
    if (v_field='contactName' and nullif(btrim(coalesce(v_opp.contact_name,'')),'') is null) or (v_field='email' and nullif(btrim(coalesce(v_opp.email,'')),'') is null) or (v_field='phone' and nullif(btrim(coalesce(v_opp.phone,'')),'') is null) or (v_field='companyName' and nullif(btrim(coalesce(v_opp.company_name,'')),'') is null) or (v_field='country' and nullif(btrim(coalesce(v_opp.country,'')),'') is null) or (v_field='serviceInterest' and nullif(btrim(coalesce(v_opp.service_interest,'')),'') is null) or (v_field='requirementsSummary' and nullif(btrim(coalesce(v_opp.requirements_summary,'')),'') is null) or (v_field='nextFollowUpAt' and v_opp.next_follow_up_at is null) or (v_field='expectedValue' and coalesce(v_opp.expected_value,0)<=0) then v_missing:=array_append(v_missing,v_field); end if;
  end loop;
  if cardinality(v_missing)>0 then raise exception 'Missing required information: %',array_to_string(v_missing,', '); end if;
  if p_target_stage='Meeting Scheduled' and not exists(select 1 from public.sales_meetings m where m.opportunity_id=v_opp.id and m.status in ('Scheduled','Rescheduled')) then raise exception 'Schedule the sales meeting before moving this opportunity to Meeting Scheduled.'; end if;
  if p_target_stage='Quotation Sent' and not exists(select 1 from public.quotations q where q.opportunity_id=v_opp.id and q.sent_at is not null and q.status in ('Sent','Accepted','Rejected','Expired')) then raise exception 'An approved quotation must be sent before moving this opportunity to Quotation Sent.'; end if;
  if p_target_stage='Awaiting Advance Payment' and not exists(select 1 from public.quotations q where q.opportunity_id=v_opp.id and q.status='Accepted' and q.accepted_at is not null) then raise exception 'The customer must accept the quotation before the opportunity can await advance payment.'; end if;
  if p_target_stage='Won' then
    if not v_is_admin then raise exception 'Won is controlled by Admin payment verification.'; end if;
    if not exists(select 1 from public.payments p where p.opportunity_id=v_opp.id and p.status='Verified' and p.payment_type in ('Advance','Full Payment')) then raise exception 'A verified Advance or Full Payment is required before Won.'; end if;
  end if;
  v_default_probability:=least(greatest(coalesce((v_target->>'defaultProbability')::int,v_opp.probability,0),0),100);
  update public.crm_opportunities set stage=p_target_stage,probability=v_default_probability,status=case when p_target_stage='Won' then 'Won' else status end,won_at=case when p_target_stage='Won' then coalesce(won_at,now()) else won_at end,updated_at=now() where id=v_opp.id returning * into v_opp;
  return to_jsonb(v_opp);
end; $$;
revoke all on function public.crm_transition_opportunity(uuid,text) from public,anon;
grant execute on function public.crm_transition_opportunity(uuid,text) to authenticated;

create or replace function public.crm_close_opportunity_lost(p_opportunity_id uuid,p_lost_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_opp public.crm_opportunities%rowtype; v_config jsonb; v_reason text:=btrim(coalesce(p_lost_reason,''));
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_opp from public.crm_opportunities where id=p_opportunity_id for update;
  if not found or v_opp.archived_at is not null then raise exception 'Opportunity not found.'; end if;
  if not public.is_admin() and (not public.has_active_role(array['sales']::text[]) or v_opp.salesperson_id is distinct from auth.uid()) then raise exception 'You do not have permission to close this opportunity.'; end if;
  if v_opp.status<>'Open' then raise exception 'Only open opportunities can be closed as Lost.'; end if;
  select config_value into v_config from public.system_configuration where config_key='crm_pipeline_settings';
  if v_reason='' or not coalesce(v_config->'lostReasons','[]'::jsonb) ? v_reason then raise exception 'Choose an approved Lost reason.'; end if;
  update public.crm_opportunities set status='Lost',lost_reason=v_reason,lost_at=now(),updated_at=now() where id=v_opp.id returning * into v_opp;
  return to_jsonb(v_opp);
end; $$;
revoke all on function public.crm_close_opportunity_lost(uuid,text) from public,anon;
grant execute on function public.crm_close_opportunity_lost(uuid,text) to authenticated;

create or replace function public.crm_archive_opportunity(p_opportunity_id uuid,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_opp public.crm_opportunities%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_opp from public.crm_opportunities where id=p_opportunity_id for update;
  if not found then raise exception 'Opportunity not found.'; end if;
  if v_opp.status='Open' then raise exception 'Close the opportunity as Won or Lost before archiving it.'; end if;
  if v_opp.archived_at is null then update public.crm_opportunities set archived_at=now(),archived_by=auth.uid(),updated_at=now() where id=v_opp.id returning * into v_opp; perform public.crm_write_lead_event(v_opp.lead_id,'opportunity_archived','Opportunity archived',coalesce(nullif(btrim(p_reason),''),'Opportunity archived by Admin.'),jsonb_build_object('opportunityId',v_opp.id,'reason',p_reason)); end if;
  return to_jsonb(v_opp);
end; $$;

create or replace function public.crm_archive_lead(p_lead_id uuid,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_lead public.crm_leads%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if not found then raise exception 'Lead not found.'; end if;
  if exists(select 1 from public.crm_opportunities o where o.lead_id=v_lead.id and o.status='Open' and o.archived_at is null) then raise exception 'Close the active opportunity before archiving this lead.'; end if;
  if v_lead.archived_at is null then perform public.crm_write_lead_event(v_lead.id,'lead_archived','Lead archived',coalesce(nullif(btrim(p_reason),''),'Lead archived by Admin.'),jsonb_build_object('reason',p_reason)); update public.crm_leads set archived_at=now(),archived_by=auth.uid(),updated_at=now() where id=v_lead.id returning * into v_lead; end if;
  return to_jsonb(v_lead);
end; $$;
revoke all on function public.crm_archive_opportunity(uuid,text) from public,anon;
revoke all on function public.crm_archive_lead(uuid,text) from public,anon;
grant execute on function public.crm_archive_opportunity(uuid,text) to authenticated;
grant execute on function public.crm_archive_lead(uuid,text) to authenticated;

-- Command-center read model: use canonical CRM/activity/meeting/quotation/history data.
create or replace function public.crm_get_pipeline_command_center()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_config jsonb; v_team boolean; v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  v_team:=public.is_admin() or public.has_active_role(array['project_manager']::text[]);
  if not v_team and not public.has_active_role(array['sales']::text[]) then raise exception 'CRM access required.'; end if;
  select config_value into v_config from public.system_configuration where config_key='crm_pipeline_settings';
  with visible as (
    select o.*,up.full_name owner_name,l.lead_score,l.lead_quality,l.score_reason from public.crm_opportunities o left join public.user_profiles up on up.id=o.salesperson_id left join public.crm_leads l on l.id=o.lead_id where o.archived_at is null and (v_team or o.salesperson_id=v_uid)
  ), enriched as (
    select o.*,sc.stage_cfg,greatest(0,extract(epoch from (now()-o.stage_entered_at))/3600.0) stage_age_hours,le.event_type last_event_type,le.title last_event_title,le.occurred_at last_event_at,na.id next_activity_id,na.subject next_activity_subject,na.activity_type next_activity_type,na.due_at next_activity_due_at,mt.id meeting_id,mt.status meeting_status,mt.start_at meeting_start_at,mt.outcome meeting_outcome,qt.id quotation_id,qt.status quotation_status,qt.sent_at quotation_sent_at,qt.last_viewed_at quotation_viewed_at,qt.view_count quotation_view_count,coalesce(le.occurred_at,o.updated_at,o.created_at) last_meaningful_at
    from visible o
    left join lateral (select value stage_cfg from jsonb_array_elements(v_config->'stages') where value->>'name'=o.stage limit 1) sc on true
    left join lateral (select e.event_type,e.title,e.occurred_at from public.crm_lead_events e where e.lead_id=o.lead_id order by e.occurred_at desc,e.created_at desc limit 1) le on true
    left join lateral (select a.id,a.subject,a.activity_type,a.due_at from public.crm_activities a where a.opportunity_id=o.id and a.status='Scheduled' order by a.due_at limit 1) na on true
    left join lateral (select m.id,m.status,m.start_at,m.outcome from public.sales_meetings m where m.opportunity_id=o.id order by case when m.status in ('Scheduled','Rescheduled') and m.start_at>=now() then 0 else 1 end,m.start_at desc limit 1) mt on true
    left join lateral (select q.id,q.status,q.sent_at,q.last_viewed_at,q.view_count from public.quotations q where q.opportunity_id=o.id order by q.created_at desc limit 1) qt on true
  ), scored as (
    select e.*,array_remove(array[
      case when e.status='Open' and ((e.next_follow_up_at is not null and e.next_follow_up_at<now()) or (e.next_activity_due_at is not null and e.next_activity_due_at<now())) then 'Follow-up overdue' end,
      case when e.status='Open' and e.next_follow_up_at is null and e.next_activity_id is null then 'No next activity' end,
      case when e.status='Open' and coalesce((e.stage_cfg->>'slaHours')::numeric,0)>0 and e.stage_age_hours>coalesce((e.stage_cfg->>'slaHours')::numeric,0) then 'Stage SLA exceeded' end,
      case when e.status='Open' and now()-e.last_meaningful_at > make_interval(hours=>coalesce((v_config#>>'{health,noActivityHours}')::int,72)) then 'No meaningful activity recently' end,
      case when e.status='Open' and e.quotation_viewed_at is not null and (e.next_follow_up_at is null or e.next_follow_up_at<=e.quotation_viewed_at) and (e.next_activity_due_at is null or e.next_activity_due_at<=e.quotation_viewed_at) then 'Quotation viewed — follow-up recommended' end,
      case when e.status='Open' and e.expected_value>=coalesce((v_config#>>'{health,highValueThreshold}')::numeric,5000) and now()-e.last_meaningful_at > make_interval(hours=>coalesce((v_config#>>'{health,highValueInactivityHours}')::int,48)) then 'High-value opportunity inactive' end,
      case when e.status='Open' and e.meeting_status='Completed' and coalesce(nullif(e.meeting_outcome,''),'')='' then 'Meeting outcome missing' end
    ],null) health_reasons from enriched e
  )
  select jsonb_build_object('generatedAt',now(),'scope',case when v_team then 'team' else 'individual' end,'config',v_config,'opportunities',coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'leadId',s.lead_id,'name',s.name,'companyName',s.company_name,'contactName',s.contact_name,'email',s.email,'phone',s.phone,'country',s.country,'industry',s.industry,'source',s.source,'selfGenerated',s.self_generated,'salespersonId',s.salesperson_id,'ownerName',coalesce(s.owner_name,'Unassigned'),'serviceInterest',s.service_interest,'expectedValue',s.expected_value,'currency',s.currency,'stage',s.stage,'status',s.status,'probability',s.probability,'meetingAt',s.meeting_at,'meetingUrl',s.meeting_url,'requirementsSummary',s.requirements_summary,'nextFollowUpAt',s.next_follow_up_at,'notes',s.notes,'lostReason',s.lost_reason,'wonAt',s.won_at,'lostAt',s.lost_at,'createdAt',s.created_at,'updatedAt',s.updated_at,'leadScore',coalesce(s.lead_score,0),'leadQuality',coalesce(s.lead_quality,'Low'),'scoreReason',coalesce(s.score_reason,''),'stageEnteredAt',s.stage_entered_at,'stageAgeHours',round(s.stage_age_hours,1),'stageSlaHours',coalesce((s.stage_cfg->>'slaHours')::numeric,0),'lastMeaningfulActivity',jsonb_build_object('type',s.last_event_type,'title',s.last_event_title,'at',s.last_event_at),'nextActivity',case when s.next_activity_id is null then null else jsonb_build_object('id',s.next_activity_id,'subject',s.next_activity_subject,'type',s.next_activity_type,'dueAt',s.next_activity_due_at,'overdue',s.next_activity_due_at<now()) end,'meeting',case when s.meeting_id is null then null else jsonb_build_object('id',s.meeting_id,'status',s.meeting_status,'startAt',s.meeting_start_at,'outcome',s.meeting_outcome) end,'quotation',case when s.quotation_id is null then null else jsonb_build_object('id',s.quotation_id,'status',s.quotation_status,'sentAt',s.quotation_sent_at,'viewedAt',s.quotation_viewed_at,'viewCount',coalesce(s.quotation_view_count,0)) end,'health',jsonb_build_object('status',case when cardinality(s.health_reasons)>=2 or 'Follow-up overdue'=any(s.health_reasons) or 'Stage SLA exceeded'=any(s.health_reasons) then 'At Risk' when cardinality(s.health_reasons)=1 then 'Needs Attention' else 'Healthy' end,'reasons',to_jsonb(s.health_reasons)),'nextBestAction',public.get_productivity_next_action('opportunity',s.id)) order by s.created_at desc),'[]'::jsonb)) into v_result from scored s;
  return v_result;
end; $$;
revoke all on function public.crm_get_pipeline_command_center() from public,anon;
grant execute on function public.crm_get_pipeline_command_center() to authenticated;

create or replace function public.crm_get_pipeline_analytics(p_days integer default 90)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_team boolean; v_days int:=least(greatest(coalesce(p_days,90),7),365);
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  v_team:=public.is_admin() or public.has_active_role(array['project_manager']::text[]);
  if not v_team and not public.has_active_role(array['sales']::text[]) then raise exception 'CRM access required.'; end if;
  return jsonb_build_object(
    'days',v_days,
    'averageStageDurationHours',coalesce((select jsonb_object_agg(stage_name,avg_hours) from (select e.metadata->>'from' stage_name,round(avg((e.metadata->>'stageDurationSeconds')::numeric)/3600.0,1) avg_hours from public.crm_lead_events e join public.crm_leads l on l.id=e.lead_id where e.event_type='opportunity_stage_changed' and e.occurred_at>=now()-make_interval(days=>v_days) and (v_team or l.salesperson_id=v_uid) and e.metadata ? 'stageDurationSeconds' group by e.metadata->>'from') x),'{}'::jsonb),
    'winRate',coalesce((select round(100.0*count(*) filter(where o.status='Won')/nullif(count(*) filter(where o.status in ('Won','Lost')),0),1) from public.crm_opportunities o where o.archived_at is null and (v_team or o.salesperson_id=v_uid) and coalesce(o.won_at,o.lost_at,o.updated_at)>=now()-make_interval(days=>v_days)),0),
    'lostReasons',coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'count',cnt) order by cnt desc) from (select coalesce(nullif(lost_reason,''),'Unknown') reason,count(*)::int cnt from public.crm_opportunities o where o.status='Lost' and o.archived_at is null and (v_team or o.salesperson_id=v_uid) and coalesce(o.lost_at,o.updated_at)>=now()-make_interval(days=>v_days) group by coalesce(nullif(lost_reason,''),'Unknown')) x),'[]'::jsonb),
    'pipelineByOwner',coalesce((select jsonb_agg(jsonb_build_object('salespersonId',o.salesperson_id,'owner',coalesce(up.full_name,'Unassigned'),'count',count(*),'value',sum(o.expected_value)) order by sum(o.expected_value) desc) from public.crm_opportunities o left join public.user_profiles up on up.id=o.salesperson_id where o.status='Open' and o.archived_at is null and (v_team or o.salesperson_id=v_uid) group by o.salesperson_id,up.full_name),'[]'::jsonb)
  );
end; $$;
revoke all on function public.crm_get_pipeline_analytics(integer) from public,anon;
grant execute on function public.crm_get_pipeline_analytics(integer) to authenticated;

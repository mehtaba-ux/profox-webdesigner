-- ProFox CRM pipeline automation manager
-- Applied to production Supabase before this source-control mirror.
-- Reuses system_configuration audit history, crm_lead_events, notification templates/outbox,
-- in-app notifications and CRM activities. No parallel delivery/audit system is introduced.

insert into public.system_configuration(config_key,config_value,description,updated_at)
values('crm_automation_rules','{"version":1,"rules":[]}'::jsonb,'Admin-managed CRM automation rules using WHEN → IF → WAIT → DO → STOP WHEN. Rules reuse the canonical CRM timeline and notification outbox.',now())
on conflict(config_key) do nothing;

create or replace function public.crm_get_automation_rules()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_rules jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.is_admin() and not public.has_active_role(array['sales','project_manager']::text[]) then raise exception 'CRM access required.'; end if;
  select config_value into v_rules from public.system_configuration where config_key='crm_automation_rules';
  return coalesce(v_rules,'{"version":1,"rules":[]}'::jsonb);
end; $$;
revoke all on function public.crm_get_automation_rules() from public,anon;
grant execute on function public.crm_get_automation_rules() to authenticated;

create or replace function public.crm_admin_save_automation_rules(p_config jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_rule jsonb; v_action jsonb; v_trigger text; v_action_type text; v_template text;
  v_allowed_triggers text[]:=array['lead_created','assignment_changed','score_changed','follow_up_changed','activity_created','activity_completed','activity_cancelled','meeting_scheduled','meeting_rescheduled','meeting_completed','meeting_cancelled','meeting_no_show','meeting_outcome_changed','opportunity_created','opportunity_stage_changed','opportunity_owner_changed','opportunity_value_changed','opportunity_won','opportunity_lost','quotation_created','quotation_approved','quotation_sent','quotation_viewed','quotation_accepted','quotation_rejected','payment_requested','payment_status_changed','payment_verified','chat_message_received','email_reply'];
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if jsonb_typeof(coalesce(p_config,'{}'::jsonb))<>'object' or jsonb_typeof(p_config->'rules')<>'array' then raise exception 'Automation configuration must contain a rules array.'; end if;
  if jsonb_array_length(p_config->'rules')>100 then raise exception 'A maximum of 100 CRM automation rules is supported.'; end if;
  if exists(select 1 from (select r->>'id' id,count(*) c from jsonb_array_elements(p_config->'rules') r group by r->>'id') x where nullif(btrim(id),'') is null or c>1) then raise exception 'Every automation requires a unique non-empty id.'; end if;
  for v_rule in select value from jsonb_array_elements(p_config->'rules') loop
    if nullif(btrim(v_rule->>'name'),'') is null then raise exception 'Every automation requires a name.'; end if;
    v_trigger:=v_rule->>'trigger';
    if not (v_trigger=any(v_allowed_triggers)) then raise exception 'Unsupported CRM automation trigger: %',v_trigger; end if;
    if coalesce((v_rule->>'waitMinutes')::int,0) not between 0 and 43200 then raise exception 'Automation wait must be between 0 and 43,200 minutes.'; end if;
    if jsonb_typeof(coalesce(v_rule->'conditions','{}'::jsonb))<>'object' then raise exception 'Automation conditions must be an object.'; end if;
    if jsonb_typeof(coalesce(v_rule->'actions','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(v_rule->'actions','[]'::jsonb))=0 then raise exception 'Every automation requires at least one action.'; end if;
    if jsonb_typeof(coalesce(v_rule->'stopWhen','[]'::jsonb))<>'array' then raise exception 'Automation stopWhen must be an array.'; end if;
    for v_action in select value from jsonb_array_elements(v_rule->'actions') loop
      v_action_type:=v_action->>'type';
      if v_action_type not in ('send_email','create_activity','schedule_follow_up','in_app_notification') then raise exception 'Unsupported CRM automation action: %',v_action_type; end if;
      if v_action_type='send_email' then
        v_template:=v_action->>'templateKey';
        if nullif(btrim(coalesce(v_template,'')),'') is null or not exists(select 1 from public.notification_templates nt where nt.template_key=v_template) then raise exception 'Automation email action references an unknown notification template: %',coalesce(v_template,''); end if;
      end if;
    end loop;
  end loop;
  insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  values('crm_automation_rules',p_config,'Admin-managed CRM automation rules using WHEN → IF → WAIT → DO → STOP WHEN. Rules reuse the canonical CRM timeline and notification outbox.',auth.uid(),now())
  on conflict(config_key) do update set config_value=excluded.config_value,description=excluded.description,updated_by=auth.uid(),updated_at=now();
  return p_config;
end; $$;
revoke all on function public.crm_admin_save_automation_rules(jsonb) from public,anon;
grant execute on function public.crm_admin_save_automation_rules(jsonb) to authenticated;

create or replace function public.crm_automation_is_manually_stopped(p_lead_id uuid,p_rule_id text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  with marks as (
    select event_type,occurred_at from public.crm_lead_events
    where lead_id=p_lead_id and event_type in ('automation_stopped','automation_resumed') and metadata->>'ruleId'=p_rule_id
    order by occurred_at desc limit 1
  )
  select coalesce((select event_type='automation_stopped' from marks),false)
$$;

create or replace function public.crm_automation_stop_condition_met(p_lead_id uuid,p_opportunity_id uuid,p_stop_when jsonb)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_stop text;
begin
  if jsonb_typeof(coalesce(p_stop_when,'[]'::jsonb))<>'array' then return false; end if;
  for v_stop in select jsonb_array_elements_text(coalesce(p_stop_when,'[]'::jsonb)) loop
    if v_stop='opportunity_won' and p_opportunity_id is not null and exists(select 1 from public.crm_opportunities where id=p_opportunity_id and status='Won') then return true; end if;
    if v_stop='opportunity_lost' and p_opportunity_id is not null and exists(select 1 from public.crm_opportunities where id=p_opportunity_id and status='Lost') then return true; end if;
    if v_stop='meeting_booked' and exists(select 1 from public.sales_meetings where lead_id=p_lead_id and status in ('Scheduled','Rescheduled')) then return true; end if;
    if v_stop='quotation_accepted' and p_opportunity_id is not null and exists(select 1 from public.quotations where opportunity_id=p_opportunity_id and status='Accepted') then return true; end if;
    if v_stop='payment_verified' and p_opportunity_id is not null and exists(select 1 from public.payments where opportunity_id=p_opportunity_id and status='Verified') then return true; end if;
    if v_stop='customer_reply' and exists(select 1 from public.crm_lead_events where lead_id=p_lead_id and event_type in ('chat_message_received','email_reply')) then return true; end if;
  end loop;
  return false;
end; $$;

create or replace function public.crm_process_automation_event()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_config jsonb; v_rule jsonb; v_action jsonb; v_lead public.crm_leads%rowtype; v_opp public.crm_opportunities%rowtype;
  v_rule_id text; v_trigger text; v_conditions jsonb; v_wait int; v_key text; v_template text; v_subject text; v_activity_type text; v_due_minutes int; v_payload jsonb; v_allow_reentry boolean; v_should_run boolean;
begin
  if new.event_type like 'automation_%' then return new; end if;
  select config_value into v_config from public.system_configuration where config_key='crm_automation_rules';
  if jsonb_typeof(coalesce(v_config->'rules','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(v_config->'rules','[]'::jsonb))=0 then return new; end if;
  select * into v_lead from public.crm_leads where id=new.lead_id;
  if not found then return new; end if;
  if new.metadata ? 'opportunityId' then select * into v_opp from public.crm_opportunities where id=(new.metadata->>'opportunityId')::uuid; end if;
  if v_opp.id is null and v_lead.converted_opportunity_id is not null then select * into v_opp from public.crm_opportunities where id=v_lead.converted_opportunity_id; end if;

  for v_rule in select value from jsonb_array_elements(v_config->'rules') loop
    begin
      if not coalesce((v_rule->>'enabled')::boolean,false) then continue; end if;
      v_rule_id:=v_rule->>'id'; v_trigger:=v_rule->>'trigger'; v_conditions:=coalesce(v_rule->'conditions','{}'::jsonb); v_wait:=least(greatest(coalesce((v_rule->>'waitMinutes')::int,0),0),43200); v_allow_reentry:=coalesce((v_rule->>'allowReentry')::boolean,false);
      if v_trigger is distinct from new.event_type then continue; end if;
      if public.crm_automation_is_manually_stopped(new.lead_id,v_rule_id) then continue; end if;
      if public.crm_automation_stop_condition_met(new.lead_id,v_opp.id,v_rule->'stopWhen') then continue; end if;
      v_should_run:=true;
      if nullif(v_conditions->>'stage','') is not null and coalesce(new.metadata->>'to',v_opp.stage,'')<>v_conditions->>'stage' then v_should_run:=false; end if;
      if nullif(v_conditions->>'leadSource','') is not null and coalesce(v_lead.source,'')<>v_conditions->>'leadSource' then v_should_run:=false; end if;
      if nullif(v_conditions->>'leadQuality','') is not null and coalesce(v_lead.lead_quality,'')<>v_conditions->>'leadQuality' then v_should_run:=false; end if;
      if nullif(v_conditions->>'serviceInterest','') is not null and coalesce(v_opp.service_interest,v_lead.service_interest,'')<>v_conditions->>'serviceInterest' then v_should_run:=false; end if;
      if nullif(v_conditions->>'country','') is not null and coalesce(v_opp.country,v_lead.country,'')<>v_conditions->>'country' then v_should_run:=false; end if;
      if nullif(v_conditions->>'salespersonId','') is not null and coalesce(v_opp.salesperson_id,v_lead.salesperson_id)::text<>v_conditions->>'salespersonId' then v_should_run:=false; end if;
      if v_conditions ? 'minDealValue' and coalesce(v_opp.expected_value,v_lead.estimated_value,0)<coalesce((v_conditions->>'minDealValue')::numeric,0) then v_should_run:=false; end if;
      if v_conditions ? 'maxDealValue' and coalesce(v_opp.expected_value,v_lead.estimated_value,0)>coalesce((v_conditions->>'maxDealValue')::numeric,999999999) then v_should_run:=false; end if;
      if not v_should_run then continue; end if;

      v_key:='crm-auto:'||v_rule_id||':'||coalesce(v_opp.id::text,new.lead_id::text)||':'||case when v_allow_reentry then new.id::text else new.event_type||':'||coalesce(new.metadata->>'to','') end;
      v_payload:=jsonb_build_object('leadId',new.lead_id,'opportunityId',v_opp.id,'leadName',v_lead.title,'companyName',coalesce(v_opp.company_name,v_lead.company_name),'contactName',coalesce(v_opp.contact_name,v_lead.contact_name),'email',coalesce(nullif(v_opp.email,''),v_lead.email),'stage',v_opp.stage,'dealValue',v_opp.expected_value,'currency',coalesce(v_opp.currency,v_lead.currency),'automationRuleId',v_rule_id,'automationRuleName',v_rule->>'name','eventId',new.id);

      for v_action in select value from jsonb_array_elements(v_rule->'actions') loop
        if v_action->>'type'='send_email' then
          v_template:=v_action->>'templateKey';
          perform public.enqueue_notification(v_key||':email:'||v_template,v_template,coalesce(nullif(v_opp.email,''),v_lead.email),null,v_payload,now()+make_interval(mins=>v_wait));
        elsif v_action->>'type' in ('create_activity','schedule_follow_up') then
          v_activity_type:=coalesce(nullif(v_action->>'activityType',''),case when v_action->>'type'='schedule_follow_up' then 'Follow-Up' else 'Other' end);
          v_subject:=left(coalesce(nullif(v_action->>'subject',''),'CRM automation follow-up'),250);
          v_due_minutes:=least(greatest(coalesce((v_action->>'dueMinutes')::int,v_wait,60),0),43200);
          if coalesce(v_opp.salesperson_id,v_lead.salesperson_id) is not null and not exists(select 1 from public.crm_activities a where a.notes like '%['||v_key||':activity]%' and a.status<>'Cancelled') then
            insert into public.crm_activities(lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by)
            values(new.lead_id,v_opp.id,coalesce(v_opp.salesperson_id,v_lead.salesperson_id),v_activity_type,v_subject,now()+make_interval(mins=>v_due_minutes),'Scheduled','Automation','['||v_key||':activity] '||coalesce(v_action->>'notes','Created by CRM automation.'),coalesce(v_opp.salesperson_id,v_lead.salesperson_id));
          end if;
        elsif v_action->>'type'='in_app_notification' then
          if coalesce(v_opp.salesperson_id,v_lead.salesperson_id) is not null then
            perform public.enqueue_in_app_notification(coalesce(v_opp.salesperson_id,v_lead.salesperson_id),'CRM Automation',left(coalesce(nullif(v_action->>'title',''),'CRM action required'),180),left(coalesce(nullif(v_action->>'message',''),v_rule->>'name'),1000),'/admin/app/crm?tab=pipeline',v_key||':inapp');
          end if;
        end if;
      end loop;
      perform public.crm_write_lead_event(new.lead_id,'automation_executed','Automation executed: '||coalesce(v_rule->>'name',v_rule_id),'CRM automation processed the triggering event.',jsonb_build_object('ruleId',v_rule_id,'ruleName',v_rule->>'name','trigger',new.event_type,'sourceEventId',new.id,'waitMinutes',v_wait,'opportunityId',v_opp.id),null,'System','automation',now(),v_key||':timeline');
    exception when others then
      perform public.crm_write_lead_event(new.lead_id,'automation_failed','Automation failed: '||coalesce(v_rule->>'name',v_rule_id),'The CRM event completed, but this automation action failed.',jsonb_build_object('ruleId',v_rule_id,'ruleName',v_rule->>'name','trigger',new.event_type,'sourceEventId',new.id,'error',left(sqlerrm,1000),'opportunityId',v_opp.id),null,'System','automation',now(),'crm-auto-failed:'||coalesce(v_rule_id,'unknown')||':'||new.id::text);
    end;
  end loop;
  return new;
end; $$;

drop trigger if exists trigger_crm_process_automation_event on public.crm_lead_events;
create trigger trigger_crm_process_automation_event after insert on public.crm_lead_events for each row execute function public.crm_process_automation_event();

create or replace function public.crm_stop_automation(p_lead_id uuid,p_rule_id text,p_reason text default '')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_lead public.crm_leads%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_lead from public.crm_leads where id=p_lead_id;
  if not found then raise exception 'Lead not found.'; end if;
  if not public.is_admin() and v_lead.salesperson_id is distinct from auth.uid() then raise exception 'You do not have permission to stop this automation.'; end if;
  return public.crm_write_lead_event(p_lead_id,'automation_stopped','Automation stopped',coalesce(nullif(btrim(p_reason),''),'Automation stopped manually.'),jsonb_build_object('ruleId',p_rule_id,'reason',p_reason));
end; $$;

create or replace function public.crm_resume_automation(p_lead_id uuid,p_rule_id text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_lead public.crm_leads%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_lead from public.crm_leads where id=p_lead_id;
  if not found then raise exception 'Lead not found.'; end if;
  if not public.is_admin() and v_lead.salesperson_id is distinct from auth.uid() then raise exception 'You do not have permission to resume this automation.'; end if;
  return public.crm_write_lead_event(p_lead_id,'automation_resumed','Automation resumed','Automation may process future matching events again.',jsonb_build_object('ruleId',p_rule_id));
end; $$;
revoke all on function public.crm_stop_automation(uuid,text,text) from public,anon;
revoke all on function public.crm_resume_automation(uuid,text) from public,anon;
grant execute on function public.crm_stop_automation(uuid,text,text) to authenticated;
grant execute on function public.crm_resume_automation(uuid,text) to authenticated;

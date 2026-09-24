-- ProFox Activities & Follow-Up -> Sales Execution Center
-- Extends canonical CRM activities, immutable CRM timeline, productivity, meetings and audited configuration.

alter table public.crm_activities
  add column if not exists outcome text,
  add column if not exists outcome_recorded_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists original_due_at timestamptz,
  add column if not exists reschedule_count integer not null default 0,
  add column if not exists last_rescheduled_at timestamptz,
  add column if not exists last_rescheduled_by uuid references public.user_profiles(id) on delete set null,
  add column if not exists last_reschedule_reason text not null default '',
  add column if not exists last_reschedule_kind text not null default '',
  add column if not exists cancellation_reason text not null default '',
  add column if not exists next_activity_id uuid references public.crm_activities(id) on delete set null,
  add column if not exists plan_step_key text,
  add column if not exists plan_step_index integer,
  add column if not exists automation_source text not null default '';

do $$ begin
  alter table public.crm_activities add constraint crm_activities_reschedule_count_nonnegative check (reschedule_count >= 0);
exception when duplicate_object then null; end $$;

create index if not exists idx_crm_activities_work_queue on public.crm_activities(assigned_to,status,due_at) where status='Scheduled';
create index if not exists idx_crm_activities_lead_status_due on public.crm_activities(lead_id,status,due_at) where lead_id is not null;
create index if not exists idx_crm_activities_reschedule_attention on public.crm_activities(assigned_to,reschedule_count desc,due_at) where status='Scheduled' and reschedule_count>0;

create table if not exists public.crm_activity_plan_enrollments (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null,
  lead_id uuid references public.crm_leads(id) on delete restrict,
  opportunity_id uuid references public.crm_opportunities(id) on delete restrict,
  owner_id uuid not null references public.user_profiles(id) on delete restrict,
  status text not null default 'Active' check (status in ('Active','Paused','Stopped','Completed')),
  current_step integer not null default -1,
  last_outcome text,
  paused_until timestamptz,
  pause_reason text not null default '',
  stop_reason text not null default '',
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_activity_plan_one_entity check ((lead_id is not null)::int + (opportunity_id is not null)::int = 1)
);

alter table public.crm_activities add column if not exists plan_enrollment_id uuid references public.crm_activity_plan_enrollments(id) on delete set null;

create unique index if not exists uq_crm_activity_plan_active_lead on public.crm_activity_plan_enrollments(lead_id,plan_key) where lead_id is not null and status in ('Active','Paused');
create unique index if not exists uq_crm_activity_plan_active_opportunity on public.crm_activity_plan_enrollments(opportunity_id,plan_key) where opportunity_id is not null and status in ('Active','Paused');
create index if not exists idx_crm_activity_plan_owner_status on public.crm_activity_plan_enrollments(owner_id,status,updated_at desc);
create unique index if not exists uq_crm_activity_plan_generated_step on public.crm_activities(plan_enrollment_id,plan_step_key) where plan_enrollment_id is not null and plan_step_key is not null;

alter table public.crm_activity_plan_enrollments enable row level security;
drop policy if exists crm_activity_plan_select on public.crm_activity_plan_enrollments;
create policy crm_activity_plan_select on public.crm_activity_plan_enrollments for select to authenticated using (public.is_admin() or owner_id=(select auth.uid()));

insert into public.system_configuration(config_key,config_value,description,updated_by)
values(
  'crm_activity_execution_settings',
  jsonb_build_object(
    'version',1,
    'discipline',jsonb_build_object('noNextActionEnabled',true,'validWaitingStates',jsonb_build_array('Needs Time','Waiting for Customer','Contact Later'),'rescheduleReasonRequiredAfter',2),
    'priority',jsonb_build_object('highValueThreshold',5000,'highValueInactivityHours',48,'quotationFollowUpHours',24,'meetingFollowUpHours',4,'overdueSlaHours',2,'firstResponseHours',2),
    'workingHours',jsonb_build_object('start','09:00','end','17:30','weekdays',jsonb_build_array(1,2,3,4,5)),
    'types',jsonb_build_array(
      jsonb_build_object('name','Lead Research','category','Research','channel','CRM','active',true,'defaultSubject','Research lead','defaultInstructions','Verify fit, company context and useful outreach angle.','defaultDueMinutes',60,'outcomes',jsonb_build_array('Research Complete','Needs More Research','Not Qualified'),'suggestedNextActivity','Cold Email','requiredFields',jsonb_build_array(),'allowedRoles',jsonb_build_array('sales','admin'),'emailTemplate',null,'slaHours',4),
      jsonb_build_object('name','Cold Call','category','Call','channel','Phone','active',true,'defaultSubject','Sales call','defaultInstructions','Use the approved call playbook and record the real disposition.','defaultDueMinutes',60,'outcomes',jsonb_build_array('Connected','No Answer','Voicemail','Wrong Number','Call Back Requested'),'suggestedNextActivity','Follow-Up','requiredFields',jsonb_build_array('outcome'),'allowedRoles',jsonb_build_array('sales','admin'),'emailTemplate',null,'slaHours',4),
      jsonb_build_object('name','Cold Email','category','Email','channel','Email','active',true,'defaultSubject','Sales email','defaultInstructions','Use approved messaging and record delivery/reply outcome.','defaultDueMinutes',60,'outcomes',jsonb_build_array('Sent','Reply Received','No Response','Bounced'),'suggestedNextActivity','Follow-Up','requiredFields',jsonb_build_array('outcome'),'allowedRoles',jsonb_build_array('sales','admin'),'emailTemplate',null,'slaHours',8),
      jsonb_build_object('name','LinkedIn / Social Outreach','category','Social','channel','LinkedIn','active',true,'defaultSubject','Social outreach','defaultInstructions','Record the channel and outcome.','defaultDueMinutes',60,'outcomes',jsonb_build_array('Sent','Reply Received','No Response','Connection Requested'),'suggestedNextActivity','Follow-Up','requiredFields',jsonb_build_array('outcome'),'allowedRoles',jsonb_build_array('sales','admin'),'emailTemplate',null,'slaHours',8),
      jsonb_build_object('name','Loom Outreach','category','Loom','channel','Loom','active',true,'defaultSubject','Loom outreach','defaultInstructions','Send the approved personalized Loom and record the result.','defaultDueMinutes',60,'outcomes',jsonb_build_array('Sent','Viewed','Reply Received','No Response'),'suggestedNextActivity','Follow-Up','requiredFields',jsonb_build_array('outcome'),'allowedRoles',jsonb_build_array('sales','admin'),'emailTemplate',null,'slaHours',8),
      jsonb_build_object('name','Follow-Up','category','Follow-Up','channel','CRM','active',true,'defaultSubject','Follow up','defaultInstructions','Move the conversation toward a clear next commitment.','defaultDueMinutes',1440,'outcomes',jsonb_build_array('Interested','Needs Time','Meeting Booked','No Response','Not Interested'),'suggestedNextActivity','Follow-Up','requiredFields',jsonb_build_array('outcome'),'allowedRoles',jsonb_build_array('sales','admin'),'emailTemplate',null,'slaHours',24),
      jsonb_build_object('name','Discovery Meeting','category','Meeting','channel','Meeting','active',true,'defaultSubject','Discovery meeting','defaultInstructions','Meetings remain managed by the canonical Meetings workspace.','defaultDueMinutes',1440,'outcomes',jsonb_build_array(),'suggestedNextActivity','Meeting Follow-Up','requiredFields',jsonb_build_array(),'allowedRoles',jsonb_build_array('sales','admin'),'emailTemplate',null,'slaHours',24),
      jsonb_build_object('name','Meeting Follow-Up','category','Meeting Follow-Up','channel','CRM','active',true,'defaultSubject','Meeting follow-up','defaultInstructions','Use the canonical meeting outcome and confirm the next commitment.','defaultDueMinutes',240,'outcomes',jsonb_build_array('Next Step Confirmed','Needs Time','Quotation Requested','No Response'),'suggestedNextActivity','Follow-Up','requiredFields',jsonb_build_array('outcome'),'allowedRoles',jsonb_build_array('sales','admin'),'emailTemplate',null,'slaHours',4),
      jsonb_build_object('name','Quotation Follow-Up','category','Quotation','channel','CRM','active',true,'defaultSubject','Quotation follow-up','defaultInstructions','Use verified quotation engagement and record the decision status.','defaultDueMinutes',1440,'outcomes',jsonb_build_array('Considering','Questions Raised','Revision Requested','Accepted','Declined'),'suggestedNextActivity','Quotation Follow-Up','requiredFields',jsonb_build_array('outcome'),'allowedRoles',jsonb_build_array('sales','admin'),'emailTemplate',null,'slaHours',24),
      jsonb_build_object('name','Payment Follow-Up','category','Payment','channel','CRM','active',true,'defaultSubject','Payment follow-up','defaultInstructions','Follow up without changing protected payment verification state.','defaultDueMinutes',1440,'outcomes',jsonb_build_array('Payment Promised','Payment Sent','Delay Requested','Payment Issue'),'suggestedNextActivity','Payment Follow-Up','requiredFields',jsonb_build_array('outcome'),'allowedRoles',jsonb_build_array('sales','admin'),'emailTemplate',null,'slaHours',24),
      jsonb_build_object('name','Other','category','Task','channel','CRM','active',true,'defaultSubject','CRM action','defaultInstructions','Record the business outcome and next action.','defaultDueMinutes',1440,'outcomes',jsonb_build_array('Completed','Needs Follow-Up','Blocked'),'suggestedNextActivity','Follow-Up','requiredFields',jsonb_build_array(),'allowedRoles',jsonb_build_array('sales','admin'),'emailTemplate',null,'slaHours',24)
    ),
    'plans',jsonb_build_array(
      jsonb_build_object('key','cold_outreach','name','Cold Outreach','active',true,'stopConditions',jsonb_build_array('customer_reply','meeting_booked','quotation_accepted','payment_verified','opportunity_won','opportunity_lost','lead_not_qualified','manual_stop'),'steps',jsonb_build_array(jsonb_build_object('key','email_1','delayMinutes',0,'activityType','Cold Email','subject','Personalized cold email','channel','Email','manual',true),jsonb_build_object('key','call_1','delayMinutes',1440,'activityType','Cold Call','subject','Cold outreach call','channel','Phone','manual',true),jsonb_build_object('key','social_1','delayMinutes',2880,'activityType','LinkedIn / Social Outreach','subject','Social follow-up','channel','LinkedIn','manual',true),jsonb_build_object('key','follow_1','delayMinutes',4320,'activityType','Follow-Up','subject','Cold outreach follow-up','channel','CRM','manual',true))),
      jsonb_build_object('key','warm_lead','name','Warm Lead','active',true,'stopConditions',jsonb_build_array('customer_reply','meeting_booked','opportunity_won','opportunity_lost','lead_not_qualified','manual_stop'),'steps',jsonb_build_array(jsonb_build_object('key','follow_1','delayMinutes',0,'activityType','Follow-Up','subject','Warm lead follow-up','channel','CRM','manual',true),jsonb_build_object('key','call_1','delayMinutes',1440,'activityType','Cold Call','subject','Warm lead call','channel','Phone','manual',true),jsonb_build_object('key','follow_2','delayMinutes',2880,'activityType','Follow-Up','subject','Warm lead next step','channel','CRM','manual',true))),
      jsonb_build_object('key','website_enquiry','name','Website Enquiry','active',true,'stopConditions',jsonb_build_array('customer_reply','meeting_booked','opportunity_won','opportunity_lost','lead_not_qualified','manual_stop'),'steps',jsonb_build_array(jsonb_build_object('key','follow_1','delayMinutes',0,'activityType','Follow-Up','subject','Respond to website enquiry','channel','CRM','manual',true),jsonb_build_object('key','call_1','delayMinutes',180,'activityType','Cold Call','subject','Website enquiry call','channel','Phone','manual',true),jsonb_build_object('key','follow_2','delayMinutes',1440,'activityType','Follow-Up','subject','Website enquiry follow-up','channel','CRM','manual',true))),
      jsonb_build_object('key','discovery_follow_up','name','Discovery Follow-Up','active',true,'stopConditions',jsonb_build_array('quotation_accepted','payment_verified','opportunity_won','opportunity_lost','manual_stop'),'steps',jsonb_build_array(jsonb_build_object('key','meeting_follow','delayMinutes',0,'activityType','Meeting Follow-Up','subject','Discovery meeting follow-up','channel','CRM','manual',true),jsonb_build_object('key','follow_2','delayMinutes',2880,'activityType','Follow-Up','subject','Confirm discovery next step','channel','CRM','manual',true))),
      jsonb_build_object('key','quotation_follow_up','name','Quotation Follow-Up','active',true,'stopConditions',jsonb_build_array('customer_reply','quotation_accepted','payment_verified','opportunity_won','opportunity_lost','manual_stop'),'steps',jsonb_build_array(jsonb_build_object('key','quote_1','delayMinutes',1440,'activityType','Quotation Follow-Up','subject','Quotation follow-up','channel','CRM','manual',true),jsonb_build_object('key','call_1','delayMinutes',2880,'activityType','Cold Call','subject','Quotation decision call','channel','Phone','manual',true),jsonb_build_object('key','quote_2','delayMinutes',5760,'activityType','Quotation Follow-Up','subject','Quotation decision follow-up','channel','CRM','manual',true))),
      jsonb_build_object('key','payment_follow_up','name','Payment Follow-Up','active',true,'stopConditions',jsonb_build_array('payment_verified','opportunity_won','opportunity_lost','manual_stop'),'steps',jsonb_build_array(jsonb_build_object('key','payment_1','delayMinutes',1440,'activityType','Payment Follow-Up','subject','Payment follow-up','channel','CRM','manual',true),jsonb_build_object('key','call_1','delayMinutes',2880,'activityType','Cold Call','subject','Payment status call','channel','Phone','manual',true))),
      jsonb_build_object('key','re_engagement','name','Re-engagement','active',true,'stopConditions',jsonb_build_array('customer_reply','meeting_booked','opportunity_won','opportunity_lost','lead_not_qualified','manual_stop'),'steps',jsonb_build_array(jsonb_build_object('key','email_1','delayMinutes',0,'activityType','Cold Email','subject','Re-engagement email','channel','Email','manual',true),jsonb_build_object('key','call_1','delayMinutes',2880,'activityType','Cold Call','subject','Re-engagement call','channel','Phone','manual',true),jsonb_build_object('key','follow_1','delayMinutes',7200,'activityType','Follow-Up','subject','Re-engagement follow-up','channel','CRM','manual',true)))
    )
  ),
  'Admin-editable activity types, outcomes, SLA, execution discipline and sales cadence definitions.',
  null
)
on conflict(config_key) do nothing;

create or replace function public.crm_get_activity_execution_config()
returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $$
declare v jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  select config_value into v from public.system_configuration where config_key='crm_activity_execution_settings';
  return coalesce(v,'{}'::jsonb);
end $$;
grant execute on function public.crm_get_activity_execution_config() to authenticated;

create or replace function public.crm_admin_save_activity_execution_config(p_config jsonb)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if jsonb_typeof(coalesce(p_config,'{}'::jsonb))<>'object' then raise exception 'Configuration must be an object.'; end if;
  if jsonb_typeof(coalesce(p_config->'types','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_config->'types','[]'::jsonb))=0 then raise exception 'At least one activity type is required.'; end if;
  if jsonb_typeof(coalesce(p_config->'plans','[]'::jsonb))<>'array' then raise exception 'Plans must be an array.'; end if;
  insert into public.system_configuration(config_key,config_value,description,updated_by)
  values('crm_activity_execution_settings',p_config,'Admin-editable activity types, outcomes, SLA, execution discipline and sales cadence definitions.',(select auth.uid()))
  on conflict(config_key) do update set config_value=excluded.config_value,updated_by=excluded.updated_by,updated_at=now();
  return p_config;
end $$;
grant execute on function public.crm_admin_save_activity_execution_config(jsonb) to authenticated;

create or replace function public.crm_can_manage_activity(p_activity_id uuid)
returns boolean language sql stable security definer set search_path='public','pg_temp' as $$
  select (select auth.uid()) is not null and exists(select 1 from public.crm_activities a where a.id=p_activity_id and (public.is_admin() or a.assigned_to=(select auth.uid()) or a.created_by=(select auth.uid())))
$$;
grant execute on function public.crm_can_manage_activity(uuid) to authenticated;

create or replace function public.crm_start_activity(p_activity_id uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare a public.crm_activities%rowtype;
begin
  if not public.crm_can_manage_activity(p_activity_id) then raise exception 'Activity access denied.'; end if;
  perform set_config('app.crm_activity_rpc','1',true);
  update public.crm_activities set started_at=coalesce(started_at,now()),updated_at=now() where id=p_activity_id and status='Scheduled' returning * into a;
  if a.id is null then raise exception 'Only scheduled activities can be started.'; end if;
  return jsonb_build_object('id',a.id,'startedAt',a.started_at);
end $$;
grant execute on function public.crm_start_activity(uuid) to authenticated;

create or replace function public.crm_reschedule_activity(p_activity_id uuid,p_due_at timestamptz,p_reason text default '',p_snooze boolean default false)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare a public.crm_activities%rowtype;v_due timestamptz;v_required_after int:=2;v_cfg jsonb;
begin
  if not public.crm_can_manage_activity(p_activity_id) then raise exception 'Activity access denied.'; end if;
  select * into a from public.crm_activities where id=p_activity_id for update;
  if a.status<>'Scheduled' then raise exception 'Closed activities cannot be rescheduled.'; end if;
  if p_due_at is null or p_due_at<=now() then raise exception 'Choose a future due date and time.'; end if;
  select config_value into v_cfg from public.system_configuration where config_key='crm_activity_execution_settings';
  v_required_after:=coalesce((v_cfg#>>'{discipline,rescheduleReasonRequiredAfter}')::int,2);
  if a.reschedule_count+1>v_required_after and char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'A reason is required after repeated rescheduling.'; end if;
  v_due:=public.crm_adjust_activity_due(coalesce(a.assigned_to,(select auth.uid())),p_due_at);
  perform set_config('app.crm_activity_rpc','1',true);
  update public.crm_activities set original_due_at=coalesce(original_due_at,due_at),due_at=v_due,reschedule_count=reschedule_count+1,last_rescheduled_at=now(),last_rescheduled_by=(select auth.uid()),last_reschedule_reason=left(btrim(coalesce(p_reason,'')),1000),last_reschedule_kind=case when p_snooze then 'snooze' else 'reschedule' end,updated_at=now() where id=p_activity_id returning * into a;
  if a.lead_id is not null then update public.crm_leads set next_follow_up_at=v_due,updated_at=now() where id=a.lead_id and (next_follow_up_at is null or next_follow_up_at<=a.original_due_at or next_follow_up_at<=now()); end if;
  if a.opportunity_id is not null then update public.crm_opportunities set next_follow_up_at=v_due,updated_at=now() where id=a.opportunity_id and (next_follow_up_at is null or next_follow_up_at<=a.original_due_at or next_follow_up_at<=now()); end if;
  return jsonb_build_object('id',a.id,'dueAt',a.due_at,'originalDueAt',a.original_due_at,'rescheduleCount',a.reschedule_count,'calendarAdjusted',a.due_at is distinct from p_due_at);
end $$;
grant execute on function public.crm_reschedule_activity(uuid,timestamptz,text,boolean) to authenticated;

create or replace function public.crm_cancel_activity(p_activity_id uuid,p_reason text default '')
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare a public.crm_activities%rowtype;
begin
  if not public.crm_can_manage_activity(p_activity_id) then raise exception 'Activity access denied.'; end if;
  select * into a from public.crm_activities where id=p_activity_id for update;
  if a.status<>'Scheduled' then raise exception 'Only scheduled activities can be cancelled.'; end if;
  perform set_config('app.crm_activity_rpc','1',true);
  update public.crm_activities set status='Cancelled',cancellation_reason=left(btrim(coalesce(p_reason,'')),1000),updated_at=now() where id=p_activity_id returning * into a;
  return jsonb_build_object('id',a.id,'status',a.status);
end $$;
grant execute on function public.crm_cancel_activity(uuid,text) to authenticated;

create or replace function public.crm_launch_activity_plan(p_entity_type text,p_entity_id uuid,p_plan_key text)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_type text:=lower(btrim(coalesce(p_entity_type,'')));v_cfg jsonb;v_plan jsonb;v_step jsonb;v_owner uuid;v_lead uuid;v_opp uuid;v_enroll public.crm_activity_plan_enrollments%rowtype;v_activity uuid;v_due timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  select config_value into v_cfg from public.system_configuration where config_key='crm_activity_execution_settings';
  select value into v_plan from jsonb_array_elements(coalesce(v_cfg->'plans','[]'::jsonb)) where value->>'key'=p_plan_key and coalesce((value->>'active')::boolean,false) limit 1;
  if v_plan is null then raise exception 'Activity plan is not active or does not exist.'; end if;
  if v_type='lead' then select id,salesperson_id into v_lead,v_owner from public.crm_leads where id=p_entity_id and (public.is_admin() or salesperson_id=(select auth.uid()));
  elsif v_type='opportunity' then select id,lead_id,salesperson_id into v_opp,v_lead,v_owner from public.crm_opportunities where id=p_entity_id and (public.is_admin() or salesperson_id=(select auth.uid()));
  else raise exception 'Plans may be launched for leads or opportunities.'; end if;
  if coalesce(v_owner,'00000000-0000-0000-0000-000000000000'::uuid)='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'The record must have an owner before launching a plan.'; end if;
  if (v_type='lead' and v_lead is null) or (v_type='opportunity' and v_opp is null) then raise exception 'Record access denied.'; end if;
  v_step:=v_plan->'steps'->0;if v_step is null then raise exception 'The plan has no steps.'; end if;
  insert into public.crm_activity_plan_enrollments(plan_key,lead_id,opportunity_id,owner_id,status,current_step,created_by)
  values(p_plan_key,case when v_type='lead' then p_entity_id else v_lead end,case when v_type='opportunity' then p_entity_id else null end,v_owner,'Active',0,(select auth.uid())) returning * into v_enroll;
  v_due:=public.crm_adjust_activity_due(v_owner,now()+make_interval(mins=>greatest(coalesce((v_step->>'delayMinutes')::int,0),0)));
  perform set_config('app.crm_activity_rpc','1',true);
  insert into public.crm_activities(lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by,plan_enrollment_id,plan_step_key,plan_step_index,automation_source)
  values(v_lead,v_opp,v_owner,v_step->>'activityType',coalesce(nullif(v_step->>'subject',''),'Plan activity'),v_due,'Scheduled',coalesce(nullif(v_step->>'channel',''),'CRM'),coalesce(v_step->>'instructions',''),(select auth.uid()),v_enroll.id,v_step->>'key',0,'activity_plan')
  on conflict(plan_enrollment_id,plan_step_key) where plan_enrollment_id is not null and plan_step_key is not null do nothing returning id into v_activity;
  if v_lead is not null then perform public.crm_write_lead_event(v_lead,'activity_plan_enrolled','Activity plan started',v_plan->>'name',jsonb_build_object('enrollmentId',v_enroll.id,'planKey',p_plan_key,'firstActivityId',v_activity),(select auth.uid()),null,null,now(),'activity-plan-enrolled:'||v_enroll.id::text); end if;
  return jsonb_build_object('enrollmentId',v_enroll.id,'activityId',v_activity,'planKey',p_plan_key,'status','Active');
end $$;
grant execute on function public.crm_launch_activity_plan(text,uuid,text) to authenticated;

create or replace function public.crm_pause_activity_plan(p_enrollment_id uuid,p_reason text,p_resume_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare e public.crm_activity_plan_enrollments%rowtype;v_lead uuid;
begin
  select * into e from public.crm_activity_plan_enrollments where id=p_enrollment_id and (public.is_admin() or owner_id=(select auth.uid())) for update;
  if e.id is null then raise exception 'Plan access denied.'; end if;if e.status<>'Active' then raise exception 'Only active plans can be paused.'; end if;
  update public.crm_activity_plan_enrollments set status='Paused',pause_reason=left(btrim(coalesce(p_reason,'')),1000),paused_until=p_resume_at,updated_at=now() where id=e.id returning * into e;
  v_lead:=coalesce(e.lead_id,(select lead_id from public.crm_opportunities where id=e.opportunity_id));
  if v_lead is not null then perform public.crm_write_lead_event(v_lead,'activity_plan_paused','Activity plan paused',e.pause_reason,jsonb_build_object('enrollmentId',e.id,'planKey',e.plan_key,'resumeAt',e.paused_until),(select auth.uid()),null,null,now(),'activity-plan-paused:'||e.id::text||':'||extract(epoch from e.updated_at)::bigint::text); end if;
  return to_jsonb(e);
end $$;
grant execute on function public.crm_pause_activity_plan(uuid,text,timestamptz) to authenticated;

create or replace function public.crm_resume_activity_plan(p_enrollment_id uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare e public.crm_activity_plan_enrollments%rowtype;v_lead uuid;
begin
  select * into e from public.crm_activity_plan_enrollments where id=p_enrollment_id and (public.is_admin() or owner_id=(select auth.uid())) for update;
  if e.id is null then raise exception 'Plan access denied.'; end if;if e.status<>'Paused' then raise exception 'Only paused plans can be resumed.'; end if;
  update public.crm_activity_plan_enrollments set status='Active',paused_until=null,pause_reason='',updated_at=now() where id=e.id returning * into e;
  v_lead:=coalesce(e.lead_id,(select lead_id from public.crm_opportunities where id=e.opportunity_id));
  if v_lead is not null then perform public.crm_write_lead_event(v_lead,'activity_plan_resumed','Activity plan resumed',e.plan_key,jsonb_build_object('enrollmentId',e.id,'planKey',e.plan_key),(select auth.uid()),null,null,now(),'activity-plan-resumed:'||e.id::text||':'||extract(epoch from e.updated_at)::bigint::text); end if;
  return to_jsonb(e);
end $$;
grant execute on function public.crm_resume_activity_plan(uuid) to authenticated;

create or replace function public.crm_stop_activity_plan(p_enrollment_id uuid,p_reason text default 'Manual stop')
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare e public.crm_activity_plan_enrollments%rowtype;v_lead uuid;
begin
  select * into e from public.crm_activity_plan_enrollments where id=p_enrollment_id and (public.is_admin() or owner_id=(select auth.uid())) for update;
  if e.id is null then raise exception 'Plan access denied.'; end if;if e.status not in ('Active','Paused') then return to_jsonb(e); end if;
  update public.crm_activity_plan_enrollments set status='Stopped',stop_reason=left(btrim(coalesce(p_reason,'Manual stop')),1000),paused_until=null,updated_at=now() where id=e.id returning * into e;
  perform set_config('app.crm_activity_rpc','1',true);
  update public.crm_activities set status='Cancelled',cancellation_reason='Plan stopped: '||e.stop_reason,updated_at=now() where plan_enrollment_id=e.id and status='Scheduled';
  v_lead:=coalesce(e.lead_id,(select lead_id from public.crm_opportunities where id=e.opportunity_id));
  if v_lead is not null then perform public.crm_write_lead_event(v_lead,'activity_plan_stopped','Activity plan stopped',e.stop_reason,jsonb_build_object('enrollmentId',e.id,'planKey',e.plan_key),(select auth.uid()),null,null,now(),'activity-plan-stopped:'||e.id::text); end if;
  return to_jsonb(e);
end $$;
grant execute on function public.crm_stop_activity_plan(uuid,text) to authenticated;

create or replace function public.crm_advance_activity_plan(p_enrollment_id uuid,p_outcome text default null)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare e public.crm_activity_plan_enrollments%rowtype;v_cfg jsonb;v_plan jsonb;v_current jsonb;v_next jsonb;v_next_index int;v_branch text;v_activity uuid;v_due timestamptz;
begin
  select * into e from public.crm_activity_plan_enrollments where id=p_enrollment_id for update;
  if e.id is null or e.status<>'Active' then return jsonb_build_object('advanced',false,'status',coalesce(e.status,'Missing')); end if;
  select config_value into v_cfg from public.system_configuration where config_key='crm_activity_execution_settings';
  select value into v_plan from jsonb_array_elements(coalesce(v_cfg->'plans','[]'::jsonb)) where value->>'key'=e.plan_key limit 1;
  if v_plan is null then update public.crm_activity_plan_enrollments set status='Stopped',stop_reason='Plan configuration unavailable',updated_at=now() where id=e.id;return jsonb_build_object('advanced',false,'status','Stopped');end if;
  v_current:=v_plan->'steps'->e.current_step;v_next_index:=e.current_step+1;v_branch:=v_current#>>array['branchByOutcome',coalesce(p_outcome,'')];if v_branch is not null and v_branch ~ '^[0-9]+$' then v_next_index:=v_branch::int;end if;v_next:=v_plan->'steps'->v_next_index;
  if v_next is null then update public.crm_activity_plan_enrollments set status='Completed',last_outcome=p_outcome,updated_at=now() where id=e.id;return jsonb_build_object('advanced',false,'status','Completed');end if;
  v_due:=public.crm_adjust_activity_due(e.owner_id,now()+make_interval(mins=>greatest(coalesce((v_next->>'delayMinutes')::int,0),0)));
  perform set_config('app.crm_activity_rpc','1',true);
  insert into public.crm_activities(lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by,plan_enrollment_id,plan_step_key,plan_step_index,automation_source)
  values(e.lead_id,e.opportunity_id,e.owner_id,v_next->>'activityType',coalesce(nullif(v_next->>'subject',''),'Plan activity'),v_due,'Scheduled',coalesce(nullif(v_next->>'channel',''),'CRM'),coalesce(v_next->>'instructions',''),coalesce((select auth.uid()),e.created_by),e.id,v_next->>'key',v_next_index,'activity_plan')
  on conflict(plan_enrollment_id,plan_step_key) where plan_enrollment_id is not null and plan_step_key is not null do nothing returning id into v_activity;
  if v_activity is null then select id into v_activity from public.crm_activities where plan_enrollment_id=e.id and plan_step_key=v_next->>'key' limit 1;end if;
  update public.crm_activity_plan_enrollments set current_step=v_next_index,last_outcome=p_outcome,updated_at=now() where id=e.id;
  return jsonb_build_object('advanced',true,'status','Active','activityId',v_activity,'stepIndex',v_next_index,'dueAt',v_due);
end $$;
grant execute on function public.crm_advance_activity_plan(uuid,text) to authenticated;

create or replace function public.crm_complete_activity(p_activity_id uuid,p_outcome text,p_notes text default '',p_next jsonb default null)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare a public.crm_activities%rowtype;v_cfg jsonb;v_type jsonb;v_outcomes jsonb;v_next_id uuid;v_next_type text;v_next_subject text;v_next_due timestamptz;v_next_channel text;v_plan_result jsonb;
begin
  if not public.crm_can_manage_activity(p_activity_id) then raise exception 'Activity access denied.'; end if;
  select * into a from public.crm_activities where id=p_activity_id for update;if a.status<>'Scheduled' then raise exception 'Only scheduled activities can be completed.'; end if;
  select config_value into v_cfg from public.system_configuration where config_key='crm_activity_execution_settings';
  select value into v_type from jsonb_array_elements(coalesce(v_cfg->'types','[]'::jsonb)) where value->>'name'=a.activity_type and coalesce((value->>'active')::boolean,true) limit 1;v_outcomes:=coalesce(v_type->'outcomes','[]'::jsonb);
  if jsonb_array_length(v_outcomes)>0 and not exists(select 1 from jsonb_array_elements_text(v_outcomes) x where x=btrim(coalesce(p_outcome,''))) then raise exception 'Choose a valid outcome for this activity type.'; end if;
  if jsonb_array_length(v_outcomes)>0 and btrim(coalesce(p_outcome,''))='' then raise exception 'An activity outcome is required.'; end if;
  perform set_config('app.crm_activity_rpc','1',true);
  update public.crm_activities set status='Completed',completed_at=now(),outcome=nullif(btrim(coalesce(p_outcome,'')),''),outcome_recorded_at=case when btrim(coalesce(p_outcome,''))<>'' then now() else outcome_recorded_at end,notes=case when btrim(coalesce(p_notes,''))<>'' then left(btrim(p_notes),5000) else notes end,updated_at=now() where id=p_activity_id returning * into a;
  if p_next is not null and jsonb_typeof(p_next)='object' and coalesce((p_next->>'create')::boolean,false) then
    v_next_type:=coalesce(nullif(p_next->>'activityType',''),nullif(v_type->>'suggestedNextActivity',''),'Follow-Up');v_next_subject:=left(coalesce(nullif(btrim(p_next->>'subject'),''),'Next follow-up'),240);
    begin v_next_due:=(p_next->>'dueAt')::timestamptz; exception when others then raise exception 'A valid next activity date/time is required.'; end;
    if v_next_due<=now() then raise exception 'The next activity must be in the future.'; end if;v_next_due:=public.crm_adjust_activity_due(coalesce(a.assigned_to,(select auth.uid())),v_next_due);
    v_next_channel:=coalesce(nullif(p_next->>'channel',''),(select value->>'channel' from jsonb_array_elements(coalesce(v_cfg->'types','[]'::jsonb)) where value->>'name'=v_next_type limit 1),'CRM');
    insert into public.crm_activities(lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by,automation_source)
    values(a.lead_id,a.opportunity_id,coalesce(a.assigned_to,(select auth.uid())),v_next_type,v_next_subject,v_next_due,'Scheduled',v_next_channel,left(coalesce(p_next->>'notes',''),5000),(select auth.uid()),'complete_and_schedule_next') returning id into v_next_id;
    update public.crm_activities set next_activity_id=v_next_id where id=a.id;
    if a.lead_id is not null then update public.crm_leads set next_follow_up_at=v_next_due,updated_at=now() where id=a.lead_id;end if;if a.opportunity_id is not null then update public.crm_opportunities set next_follow_up_at=v_next_due,updated_at=now() where id=a.opportunity_id;end if;
    if a.plan_enrollment_id is not null then update public.crm_activity_plan_enrollments set status='Paused',pause_reason='Manual next activity scheduled',last_outcome=a.outcome,updated_at=now() where id=a.plan_enrollment_id and status='Active';end if;
  elsif a.plan_enrollment_id is not null then
    v_plan_result:=public.crm_advance_activity_plan(a.plan_enrollment_id,a.outcome);v_next_id:=nullif(v_plan_result->>'activityId','')::uuid;if v_next_id is not null then update public.crm_activities set next_activity_id=v_next_id where id=a.id;end if;
  end if;
  if a.lead_id is not null and v_next_id is not null then perform public.crm_write_lead_event(a.lead_id,'activity_next_created','Next activity created','Completion created the next committed action.',jsonb_build_object('activityId',a.id,'nextActivityId',v_next_id,'outcome',a.outcome),(select auth.uid()),null,null,now(),'activity-next:'||a.id::text||':'||v_next_id::text);end if;
  return jsonb_build_object('id',a.id,'status','Completed','outcome',a.outcome,'nextActivityId',v_next_id,'plan',v_plan_result);
end $$;
grant execute on function public.crm_complete_activity(uuid,text,text,jsonb) to authenticated;

create or replace function public.crm_protect_activity_execution_fields()
returns trigger language plpgsql set search_path='public','pg_temp' as $$
begin
  if old.status in ('Completed','Cancelled') and row(old.lead_id,old.opportunity_id,old.assigned_to,old.activity_type,old.subject,old.due_at,old.status,old.outcome,old.completed_at,old.plan_enrollment_id,old.plan_step_key) is distinct from row(new.lead_id,new.opportunity_id,new.assigned_to,new.activity_type,new.subject,new.due_at,new.status,new.outcome,new.completed_at,new.plan_enrollment_id,new.plan_step_key) then raise exception 'Closed activity history cannot be rewritten.';end if;
  if (select auth.uid()) is not null and not public.is_admin() and coalesce(current_setting('app.crm_activity_rpc',true),'')<>'1' and row(old.assigned_to,old.due_at,old.status,old.completed_at,old.outcome,old.started_at,old.reschedule_count,old.plan_enrollment_id,old.plan_step_key) is distinct from row(new.assigned_to,new.due_at,new.status,new.completed_at,new.outcome,new.started_at,new.reschedule_count,new.plan_enrollment_id,new.plan_step_key) then raise exception 'Use the CRM activity workflow for completion, reassignment or rescheduling.';end if;
  return new;
end $$;
drop trigger if exists trg_protect_activity_execution_fields on public.crm_activities;
create trigger trg_protect_activity_execution_fields before update on public.crm_activities for each row execute function public.crm_protect_activity_execution_fields();

create or replace function public.crm_audit_activity_change()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_lead uuid;v_type text;v_title text;v_description text;v_key text;v_meta jsonb;
begin
  v_lead:=coalesce(new.lead_id,(select o.lead_id from public.crm_opportunities o where o.id=new.opportunity_id));if v_lead is null then return new;end if;
  v_meta:=jsonb_build_object('activityId',new.id,'activityType',new.activity_type,'status',new.status,'assignedTo',new.assigned_to,'dueAt',new.due_at,'outcome',new.outcome,'rescheduleCount',new.reschedule_count,'planEnrollmentId',new.plan_enrollment_id,'planStepKey',new.plan_step_key);
  if tg_op='INSERT' then v_type:='activity_created';v_title:=new.activity_type||' scheduled';v_description:=new.subject||' · due '||new.due_at::text;v_key:='activity-created:'||new.id::text;
  elsif new.started_at is distinct from old.started_at and old.started_at is null then v_type:='activity_started';v_title:=new.activity_type||' started';v_description:=new.subject;v_key:='activity-started:'||new.id::text;
  elsif new.due_at is distinct from old.due_at then v_type:=case when new.last_reschedule_kind='snooze' then 'activity_snoozed' else 'activity_rescheduled' end;v_title:=case when new.last_reschedule_kind='snooze' then new.activity_type||' snoozed' else new.activity_type||' rescheduled' end;v_description:=new.subject||' · '||old.due_at::text||' → '||new.due_at::text||case when new.last_reschedule_reason<>'' then ' · '||new.last_reschedule_reason else '' end;v_key:='activity-reschedule:'||new.id::text||':'||new.reschedule_count::text;v_meta:=v_meta||jsonb_build_object('oldDueAt',old.due_at,'newDueAt',new.due_at,'reason',new.last_reschedule_reason,'kind',new.last_reschedule_kind);
  elsif new.status is distinct from old.status then v_type:='activity_'||lower(replace(new.status,' ','_'));v_title:=new.activity_type||' '||lower(new.status);v_description:=new.subject||case when new.outcome is not null then ' · '||new.outcome else '' end;v_key:='activity-'||lower(new.status)||':'||new.id::text;if new.status='Cancelled' then v_meta:=v_meta||jsonb_build_object('reason',new.cancellation_reason);end if;
  elsif new.assigned_to is distinct from old.assigned_to then v_type:='activity_reassigned';v_title:=new.activity_type||' reassigned';v_description:=new.subject;v_key:=null;v_meta:=v_meta||jsonb_build_object('previousAssignee',old.assigned_to);
  elsif new.outcome is distinct from old.outcome then v_type:='activity_outcome';v_title:=new.activity_type||' outcome recorded';v_description:=coalesce(new.outcome,'');v_key:='activity-outcome:'||new.id::text;
  else return new;end if;
  perform public.crm_write_lead_event(v_lead,v_type,v_title,v_description,v_meta,coalesce((select auth.uid()),new.created_by),null,null,coalesce(new.updated_at,new.created_at),v_key);return new;
end $$;

create or replace function public.crm_activity_plan_stop_from_event()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_reason text;e record;
begin
  v_reason:=case when new.event_type in ('chat_message_received','customer_reply','email_reply') then 'Customer replied' when new.event_type in ('meeting_created','meeting_scheduled','meeting_booked') then 'Meeting booked' when new.event_type='quotation_accepted' then 'Quotation accepted' when new.event_type='payment_verified' then 'Payment verified' when new.event_type in ('opportunity_won','opportunity_stage_won') then 'Opportunity won' when new.event_type in ('opportunity_lost','opportunity_stage_lost') then 'Opportunity lost' when new.event_type in ('lead_not_qualified','lead_status_not_qualified') then 'Lead not qualified' else null end;
  if v_reason is null then return new;end if;
  for e in select pe.id from public.crm_activity_plan_enrollments pe where pe.status in ('Active','Paused') and (pe.lead_id=new.lead_id or pe.opportunity_id in (select id from public.crm_opportunities where lead_id=new.lead_id)) for update loop update public.crm_activity_plan_enrollments set status='Stopped',stop_reason=v_reason,paused_until=null,updated_at=now() where id=e.id;perform set_config('app.crm_activity_rpc','1',true);update public.crm_activities set status='Cancelled',cancellation_reason='Plan stopped: '||v_reason,updated_at=now() where plan_enrollment_id=e.id and status='Scheduled';end loop;return new;
end $$;
drop trigger if exists trg_crm_activity_plan_stop_from_event on public.crm_lead_events;
create trigger trg_crm_activity_plan_stop_from_event after insert on public.crm_lead_events for each row execute function public.crm_activity_plan_stop_from_event();

create or replace function public.crm_get_activity_execution_context(p_activity_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $$
declare a public.crm_activities%rowtype;v_lead uuid;v_record jsonb;v_events jsonb;v_meeting jsonb;v_quote jsonb;v_plan jsonb;v_next jsonb;v_type jsonb;
begin
  if not public.crm_can_manage_activity(p_activity_id) then raise exception 'Activity access denied.';end if;select * into a from public.crm_activities where id=p_activity_id;v_lead:=coalesce(a.lead_id,(select lead_id from public.crm_opportunities where id=a.opportunity_id));
  if a.opportunity_id is not null then select jsonb_build_object('entityType','opportunity','id',o.id,'companyName',o.company_name,'contactName',o.contact_name,'email',o.email,'phone',o.phone,'country',o.country,'source',o.source,'serviceInterest',o.service_interest,'value',o.expected_value,'currency',o.currency,'stage',o.stage,'status',o.status,'nextFollowUpAt',o.next_follow_up_at,'notes',o.notes,'leadId',o.lead_id) into v_record from public.crm_opportunities o where o.id=a.opportunity_id;else select jsonb_build_object('entityType','lead','id',l.id,'companyName',l.company_name,'contactName',l.contact_name,'email',l.email,'phone',l.phone,'country',l.country,'source',l.source,'serviceInterest',l.service_interest,'value',l.estimated_value,'currency',l.currency,'stage',l.status,'status',l.status,'leadScore',l.lead_score,'leadQuality',l.lead_quality,'scoreReason',l.score_reason,'lastContactAt',l.last_contact_at,'nextFollowUpAt',l.next_follow_up_at,'notes',l.notes) into v_record from public.crm_leads l where l.id=a.lead_id;end if;
  select coalesce(jsonb_agg(x order by (x->>'occurredAt')::timestamptz desc),'[]'::jsonb) into v_events from (select jsonb_build_object('id',e.id,'eventType',e.event_type,'title',e.title,'description',e.description,'actorName',e.actor_name_snapshot,'actorRole',e.actor_role_snapshot,'metadata',e.metadata,'occurredAt',e.occurred_at) x from public.crm_lead_events e where e.lead_id=v_lead order by e.occurred_at desc limit 12)s;
  select jsonb_build_object('id',m.id,'title',m.title,'status',m.status,'startAt',m.start_at,'timezone',m.timezone,'outcome',m.outcome,'nextStep',m.next_step,'followUpAt',m.follow_up_at,'meetingUrl',m.meeting_url) into v_meeting from public.sales_meetings m where (m.lead_id=v_lead or (a.opportunity_id is not null and m.opportunity_id=a.opportunity_id)) order by m.start_at desc limit 1;
  select jsonb_build_object('id',q.id,'quotationNumber',q.quotation_number,'status',q.status,'total',q.total,'currency',q.currency,'sentAt',q.sent_at,'firstViewedAt',q.first_viewed_at,'lastViewedAt',q.last_viewed_at,'viewCount',q.view_count,'acceptedAt',q.accepted_at) into v_quote from public.quotations q where a.opportunity_id is not null and q.opportunity_id=a.opportunity_id order by q.created_at desc limit 1;
  if a.plan_enrollment_id is not null then select jsonb_build_object('id',p.id,'planKey',p.plan_key,'status',p.status,'currentStep',p.current_step,'pauseReason',p.pause_reason,'pausedUntil',p.paused_until,'stopReason',p.stop_reason) into v_plan from public.crm_activity_plan_enrollments p where p.id=a.plan_enrollment_id;end if;
  select value into v_type from jsonb_array_elements(coalesce((select config_value->'types' from public.system_configuration where config_key='crm_activity_execution_settings'),'[]'::jsonb)) where value->>'name'=a.activity_type limit 1;v_next:=public.get_productivity_next_action(case when a.opportunity_id is not null then 'opportunity' else 'lead' end,coalesce(a.opportunity_id,a.lead_id));
  return jsonb_build_object('activity',to_jsonb(a),'record',v_record,'recentEvents',v_events,'meeting',v_meeting,'quotation',v_quote,'plan',v_plan,'activityTypeConfig',v_type,'nextBestAction',v_next);
end $$;
grant execute on function public.crm_get_activity_execution_context(uuid) to authenticated;

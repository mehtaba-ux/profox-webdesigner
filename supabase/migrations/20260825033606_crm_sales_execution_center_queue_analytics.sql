create or replace function public.crm_get_sales_work_queue(p_scope text default 'mine',p_channel text default 'all',p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $$
declare
  v_uid uuid:=(select auth.uid()); v_admin boolean; v_scope text; v_cfg jsonb; v_items jsonb; v_counts jsonb; v_manager jsonb;
  v_high_value numeric:=5000; v_inactive_hours int:=48;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  v_admin:=public.is_admin();
  v_scope:=case when lower(coalesce(p_scope,''))='team' and v_admin then 'team' else 'mine' end;
  select config_value into v_cfg from public.system_configuration where config_key='crm_activity_execution_settings';
  v_high_value:=coalesce((v_cfg#>>'{priority,highValueThreshold}')::numeric,5000);
  v_inactive_hours:=coalesce((v_cfg#>>'{priority,highValueInactivityHours}')::int,48);

  with activity_base as (
    select a.*,coalesce(o.lead_id,a.lead_id) as canonical_lead_id,
      coalesce(o.company_name,l.company_name,o.name,'CRM activity') as company_name,
      coalesce(o.contact_name,l.contact_name,'') as contact_name,
      coalesce(o.expected_value,l.estimated_value,0)::numeric as record_value,
      coalesce(o.currency,l.currency,'USD') as currency,
      coalesce(o.stage,l.status,'') as stage,
      coalesce(o.status,l.status,'') as record_status,
      coalesce(l.lead_score,0)::int as lead_score,
      coalesce(l.lead_quality,'Low') as lead_quality,
      coalesce(l.score_reason,'') as score_reason,
      coalesce(o.source,l.source,'') as source,
      coalesce(o.country,l.country,'') as country,
      coalesce(o.service_interest,l.service_interest,'') as service_interest,
      coalesce(o.updated_at,l.updated_at,a.updated_at) as record_updated_at,
      up.full_name as owner_name,
      q.id as quotation_id,q.status as quotation_status,q.total as quotation_total,q.sent_at,q.first_viewed_at,q.last_viewed_at,q.view_count,
      m.id as meeting_id,m.status as meeting_status,m.start_at as meeting_start_at,m.outcome as meeting_outcome,
      eng.event_type as engagement_type,eng.occurred_at as engagement_at,
      (select value from jsonb_array_elements(coalesce(v_cfg->'types','[]'::jsonb)) where value->>'name'=a.activity_type limit 1) as type_config
    from public.crm_activities a
    left join public.crm_leads l on l.id=a.lead_id
    left join public.crm_opportunities o on o.id=a.opportunity_id
    left join public.user_profiles up on up.id=a.assigned_to
    left join lateral (select qq.* from public.quotations qq where a.opportunity_id is not null and qq.opportunity_id=a.opportunity_id order by qq.created_at desc limit 1) q on true
    left join lateral (select sm.* from public.sales_meetings sm where sm.lead_id=coalesce(a.lead_id,o.lead_id) or (a.opportunity_id is not null and sm.opportunity_id=a.opportunity_id) order by sm.start_at desc limit 1) m on true
    left join lateral (select e.event_type,e.occurred_at from public.crm_lead_events e where e.lead_id=coalesce(a.lead_id,o.lead_id) and e.event_type in ('chat_message_received','customer_reply','email_reply','quotation_viewed') order by e.occurred_at desc limit 1) eng on true
    where a.status='Scheduled'
      and (v_scope='team' or a.assigned_to=v_uid)
      and (v_admin or a.assigned_to=v_uid or a.created_by=v_uid)
      and (
        lower(coalesce(p_channel,'all'))='all'
        or (lower(p_channel)='calls' and lower(a.activity_type) like '%call%')
        or (lower(p_channel)='emails' and lower(a.activity_type) like '%email%')
        or (lower(p_channel)='social' and (lower(a.activity_type) like '%social%' or lower(a.activity_type) like '%linkedin%'))
        or (lower(p_channel)='loom' and lower(a.activity_type) like '%loom%')
        or (lower(p_channel)='meeting' and lower(a.activity_type) like '%meeting%')
        or (lower(p_channel)='quotation' and lower(a.activity_type) like '%quotation%')
        or (lower(p_channel)='payment' and lower(a.activity_type) like '%payment%')
      )
  ), scored as (
    select b.*,
      least(100,greatest(0,
        32
        + case when b.due_at<now() then least(30,10+floor(extract(epoch from (now()-b.due_at))/14400)::int) when b.due_at<=now()+interval '2 hours' then 14 when b.due_at<=now()+interval '1 day' then 7 else 0 end
        + case b.lead_quality when 'High' then 12 when 'Medium' then 6 else 0 end
        + least(10,greatest(0,b.lead_score/10))
        + case when b.record_value>=v_high_value then 12 else 0 end
        + case when b.stage in ('Quotation Sent','Negotiation / Decision Pending') then 8 when b.stage='Awaiting Advance Payment' then 12 else 0 end
        + case when coalesce(b.view_count,0)>=1 then 7 else 0 end
        + case when coalesce(b.view_count,0)>=2 then least(7,b.view_count) else 0 end
        + case when b.last_viewed_at>=now()-interval '24 hours' then 5 else 0 end
        + case when b.engagement_type in ('chat_message_received','customer_reply','email_reply') and b.engagement_at>=now()-interval '48 hours' then 12 else 0 end
        + case when b.meeting_status in ('Scheduled','Rescheduled') and b.meeting_start_at between now() and now()+interval '24 hours' then 8 else 0 end
        + case when b.record_value>=v_high_value and b.record_updated_at<now()-make_interval(hours=>v_inactive_hours) then 8 else 0 end
        + least(8,b.reschedule_count*2)
      ))::int as priority_score
    from activity_base b
  ), activity_items as (
    select jsonb_build_object(
      'queueKind','activity','id',s.id,'activityId',s.id,'leadId',s.canonical_lead_id,'opportunityId',s.opportunity_id,
      'priorityScore',s.priority_score,
      'priorityLevel',case when s.priority_score>=85 then 'Act Now' when s.priority_score>=70 then 'High' when s.priority_score>=50 then 'Medium' else 'Normal' end,
      'priorityReason',concat_ws(' · ',
        case when s.due_at<now() then 'Overdue '||greatest(1,round(extract(epoch from (now()-s.due_at))/3600))::int||'h' end,
        case when s.record_value>=v_high_value then 'High-value deal' end,
        case when s.lead_quality='High' then 'High-quality lead' end,
        case when coalesce(s.view_count,0)>=2 then 'Quotation viewed '||s.view_count||' times' when coalesce(s.view_count,0)=1 then 'Quotation viewed' end,
        case when s.engagement_type in ('chat_message_received','customer_reply','email_reply') and s.engagement_at>=now()-interval '48 hours' then 'Customer replied recently' end,
        case when s.meeting_status in ('Scheduled','Rescheduled') and s.meeting_start_at between now() and now()+interval '24 hours' then 'Meeting approaching' end,
        case when s.stage='Awaiting Advance Payment' then 'Payment pending' when s.stage in ('Quotation Sent','Negotiation / Decision Pending') then 'Commercial decision pending' end,
        case when s.reschedule_count>=2 then 'Rescheduled '||s.reschedule_count||' times' end
      ),
      'activityType',s.activity_type,'subject',s.subject,'channel',s.channel,'status',s.status,'dueAt',s.due_at,'startedAt',s.started_at,
      'outcome',s.outcome,'notes',s.notes,'rescheduleCount',s.reschedule_count,'originalDueAt',s.original_due_at,
      'ownerId',s.assigned_to,'ownerName',coalesce(s.owner_name,'Unassigned'),'companyName',s.company_name,'contactName',s.contact_name,
      'value',s.record_value,'currency',s.currency,'stage',s.stage,'leadScore',s.lead_score,'leadQuality',s.lead_quality,'scoreReason',s.score_reason,
      'quotation',case when s.quotation_id is null then null else jsonb_build_object('id',s.quotation_id,'status',s.quotation_status,'total',s.quotation_total,'sentAt',s.sent_at,'firstViewedAt',s.first_viewed_at,'lastViewedAt',s.last_viewed_at,'viewCount',s.view_count) end,
      'meeting',case when s.meeting_id is null then null else jsonb_build_object('id',s.meeting_id,'status',s.meeting_status,'startAt',s.meeting_start_at,'outcome',s.meeting_outcome) end,
      'engagement',case when s.engagement_type is null then null else jsonb_build_object('type',s.engagement_type,'at',s.engagement_at) end,
      'activityTypeConfig',s.type_config,
      'recommendedAction',case when lower(s.activity_type) like '%call%' then 'Call now' when lower(s.activity_type) like '%email%' then 'Send email' when lower(s.activity_type) like '%loom%' then 'Send Loom' when lower(s.activity_type) like '%meeting%' then 'Complete meeting action' else 'Complete follow-up' end,
      'nextBestAction',public.get_productivity_next_action('activity',s.id),
      'planEnrollmentId',s.plan_enrollment_id,'planStepKey',s.plan_step_key
    ) item from scored s
  ), missing_leads as (
    select jsonb_build_object(
      'queueKind','missing_next_action','id','lead:'||l.id::text,'leadId',l.id,'opportunityId',null,'priorityScore',90,'priorityLevel','Act Now',
      'priorityReason','No next activity','activityType','Follow-Up','subject','Schedule the next committed action','channel','CRM','status','Attention','dueAt',null,
      'ownerId',l.salesperson_id,'ownerName',coalesce(up.full_name,'Unassigned'),'companyName',l.company_name,'contactName',l.contact_name,
      'value',l.estimated_value,'currency',l.currency,'stage',l.status,'leadScore',l.lead_score,'leadQuality',l.lead_quality,'scoreReason',l.score_reason,
      'recommendedAction','Schedule next action','nextBestAction',public.get_productivity_next_action('lead',l.id)
    ) item
    from public.crm_leads l left join public.user_profiles up on up.id=l.salesperson_id
    where coalesce((v_cfg#>>'{discipline,noNextActionEnabled}')::boolean,true)
      and l.archived_at is null and l.status<>'Not Qualified' and l.converted_opportunity_id is null and l.salesperson_id is not null
      and (v_scope='team' or l.salesperson_id=v_uid) and (v_admin or l.salesperson_id=v_uid)
      and not exists(select 1 from public.crm_activities a where a.lead_id=l.id and a.status='Scheduled')
      and lower(coalesce(p_channel,'all'))='all'
  ), missing_opps as (
    select jsonb_build_object(
      'queueKind','missing_next_action','id','opportunity:'||o.id::text,'leadId',o.lead_id,'opportunityId',o.id,'priorityScore',92,'priorityLevel','Act Now',
      'priorityReason','Open opportunity · No next activity','activityType','Follow-Up','subject','Schedule the next committed action','channel','CRM','status','Attention','dueAt',null,
      'ownerId',o.salesperson_id,'ownerName',coalesce(up.full_name,'Unassigned'),'companyName',coalesce(o.company_name,o.name),'contactName',o.contact_name,
      'value',o.expected_value,'currency',o.currency,'stage',o.stage,'leadScore',coalesce(l.lead_score,0),'leadQuality',coalesce(l.lead_quality,'Low'),'scoreReason',coalesce(l.score_reason,''),
      'recommendedAction','Schedule next action','nextBestAction',public.get_productivity_next_action('opportunity',o.id)
    ) item
    from public.crm_opportunities o left join public.crm_leads l on l.id=o.lead_id left join public.user_profiles up on up.id=o.salesperson_id
    where coalesce((v_cfg#>>'{discipline,noNextActionEnabled}')::boolean,true)
      and o.archived_at is null and o.status='Open' and o.salesperson_id is not null
      and (v_scope='team' or o.salesperson_id=v_uid) and (v_admin or o.salesperson_id=v_uid)
      and not exists(select 1 from public.crm_activities a where a.opportunity_id=o.id and a.status='Scheduled')
      and lower(coalesce(p_channel,'all'))='all'
  ), all_items as (
    select item from activity_items union all select item from missing_leads union all select item from missing_opps
  ), ranked as (
    select item from all_items order by (item->>'priorityScore')::int desc,(item->>'dueAt')::timestamptz nulls first limit greatest(1,least(coalesce(p_limit,100),250))
  ) select coalesce(jsonb_agg(item order by (item->>'priorityScore')::int desc,(item->>'dueAt')::timestamptz nulls first),'[]'::jsonb) into v_items from ranked;

  select jsonb_build_object(
    'total',jsonb_array_length(v_items),
    'actNow',(select count(*) from jsonb_array_elements(v_items) x where x->>'priorityLevel'='Act Now'),
    'overdue',(select count(*) from jsonb_array_elements(v_items) x where nullif(x->>'dueAt','') is not null and (x->>'dueAt')::timestamptz<now()),
    'noNextAction',(select count(*) from jsonb_array_elements(v_items) x where x->>'queueKind'='missing_next_action'),
    'highValue',(select count(*) from jsonb_array_elements(v_items) x where coalesce((x->>'value')::numeric,0)>=v_high_value),
    'rescheduledRepeatedly',(select count(*) from jsonb_array_elements(v_items) x where coalesce((x->>'rescheduleCount')::int,0)>=2)
  ) into v_counts;

  if v_scope='team' and v_admin then
    select coalesce(jsonb_agg(jsonb_build_object('ownerId',z.owner_id,'ownerName',z.owner_name,'scheduled',z.scheduled,'overdue',z.overdue,'completed30d',z.completed30d,'rescheduled',z.rescheduled) order by z.overdue desc,z.scheduled desc),'[]'::jsonb)
    into v_manager from (
      select up.id owner_id,up.full_name owner_name,
        count(a.id) filter(where a.status='Scheduled') scheduled,
        count(a.id) filter(where a.status='Scheduled' and a.due_at<now()) overdue,
        count(a.id) filter(where a.status='Completed' and a.completed_at>=now()-interval '30 days') completed30d,
        count(a.id) filter(where a.reschedule_count>=2 and a.status='Scheduled') rescheduled
      from public.user_profiles up left join public.crm_activities a on a.assigned_to=up.id
      where up.role='sales' and up.status='active' group by up.id,up.full_name
    ) z;
  else v_manager:='[]'::jsonb; end if;

  return jsonb_build_object('generatedAt',now(),'scope',v_scope,'config',v_cfg,'counts',v_counts,'items',v_items,'managerWorkload',v_manager);
end $$;

grant execute on function public.crm_get_sales_work_queue(text,text,integer) to authenticated;

create or replace function public.crm_get_activity_effectiveness(p_days integer default 30,p_scope text default 'mine')
returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $$
declare v_uid uuid:=(select auth.uid());v_admin boolean;v_scope text;v_from timestamptz;v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  v_admin:=public.is_admin();v_scope:=case when lower(coalesce(p_scope,''))='team' and v_admin then 'team' else 'mine' end;v_from:=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)));
  with a as (
    select * from public.crm_activities x where x.created_at>=v_from and (v_scope='team' or x.assigned_to=v_uid) and (v_admin or x.assigned_to=v_uid or x.created_by=v_uid)
  ), totals as (
    select count(*) total,count(*) filter(where status='Completed') completed,count(*) filter(where status='Scheduled' and due_at<now()) overdue,
      count(*) filter(where status='Completed' and completed_at<=due_at) on_time,count(*) filter(where reschedule_count>=2) excessive_reschedules,
      percentile_cont(0.5) within group(order by greatest(0,extract(epoch from (coalesce(completed_at,now())-due_at))/60)) filter(where status='Completed' and completed_at>due_at) median_delay_minutes
    from a
  ), by_type as (
    select coalesce(jsonb_agg(jsonb_build_object('activityType',activity_type,'completed',completed,'outcomes',outcomes) order by completed desc),'[]'::jsonb) data from (
      select activity_type,count(*) filter(where status='Completed') completed,
        coalesce(jsonb_object_agg(outcome,outcome_count) filter(where outcome is not null),'{}'::jsonb) outcomes
      from (select activity_type,status,outcome,count(*) over(partition by activity_type,outcome) outcome_count from a) q
      group by activity_type
    ) x
  ), by_owner as (
    select coalesce(jsonb_agg(jsonb_build_object('ownerId',owner_id,'ownerName',owner_name,'scheduled',scheduled,'completed',completed,'overdue',overdue,'onTime',on_time) order by overdue desc),'[]'::jsonb) data from (
      select up.id owner_id,up.full_name owner_name,count(*) filter(where a.status='Scheduled') scheduled,count(*) filter(where a.status='Completed') completed,count(*) filter(where a.status='Scheduled' and a.due_at<now()) overdue,count(*) filter(where a.status='Completed' and a.completed_at<=a.due_at) on_time
      from a join public.user_profiles up on up.id=a.assigned_to group by up.id,up.full_name
    ) x
  )
  select jsonb_build_object(
    'days',greatest(1,least(coalesce(p_days,30),365)),'scope',v_scope,'totalActivities',t.total,'completed',t.completed,'overdue',t.overdue,
    'completionRate',case when t.total=0 then 0 else round(100.0*t.completed/t.total,1) end,
    'onTimeRate',case when t.completed=0 then 0 else round(100.0*t.on_time/t.completed,1) end,
    'overdueRate',case when t.total=0 then 0 else round(100.0*t.overdue/t.total,1) end,
    'medianFollowUpDelayMinutes',coalesce(round(t.median_delay_minutes::numeric,1),0),'excessiveRescheduling',t.excessive_reschedules,
    'outcomesByType',bt.data,'byOwner',bo.data
  ) into v_result from totals t cross join by_type bt cross join by_owner bo;
  return v_result;
end $$;

grant execute on function public.crm_get_activity_effectiveness(integer,text) to authenticated;

create or replace function public.execute_productivity_action(p_action_key text,p_entity_type text,p_entity_id uuid,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_uid uuid:=auth.uid();v_action text:=lower(trim(coalesce(p_action_key,'')));v_type text:=lower(trim(coalesce(p_entity_type,'')));v_result jsonb:='{}'::jsonb;v_new_id uuid;v_owner uuid;v_due timestamptz;v_subject text;v_existing uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if not public.productivity_can_access_entity(v_type,p_entity_id) then raise exception 'You do not have access to this record.'; end if;
  if v_action='complete_activity' and v_type='activity' then
    v_result:=public.crm_complete_activity(p_entity_id,p_payload->>'outcome',coalesce(p_payload->>'notes',''),p_payload->'next');
  elsif v_action='complete_project_task' and v_type='project_task' then
    update public.project_tasks set status='Completed',completed_at=coalesce(completed_at,now()),updated_at=now() where id=p_entity_id and completed_at is null;
    v_result:=jsonb_build_object('completed',true,'taskId',p_entity_id);
  elsif v_action='mark_lead_contacted' and v_type='lead' then
    update public.crm_leads set status='Contacted',last_contact_at=now(),updated_at=now() where id=p_entity_id and status in ('New','Researching');
    v_result:=jsonb_build_object('status','Contacted','leadId',p_entity_id);
  elsif v_action='schedule_follow_up' and v_type in ('lead','opportunity','meeting','quotation') then
    begin v_due:=(p_payload->>'dueAt')::timestamptz; exception when others then raise exception 'A valid follow-up date/time is required.'; end;
    if v_due<=now() then raise exception 'Follow-up must be scheduled in the future.'; end if;
    if v_type='lead' then select salesperson_id into v_owner from public.crm_leads where id=p_entity_id;
    elsif v_type='opportunity' then select salesperson_id into v_owner from public.crm_opportunities where id=p_entity_id;
    elsif v_type='meeting' then select salesperson_id into v_owner from public.sales_meetings where id=p_entity_id;
    else select salesperson_id into v_owner from public.quotations where id=p_entity_id; end if;
    v_owner:=coalesce(v_owner,v_uid);v_due:=public.crm_adjust_activity_due(v_owner,v_due);v_subject:=left(trim(coalesce(nullif(p_payload->>'subject',''),'Follow up')),240);
    select id into v_existing from public.crm_activities where assigned_to=v_owner and lower(coalesce(status,'')) not in ('completed','cancelled') and subject=v_subject
      and ((v_type='lead' and lead_id=p_entity_id) or (v_type='opportunity' and opportunity_id=p_entity_id)) order by created_at desc limit 1;
    perform set_config('app.crm_activity_rpc','1',true);
    if v_existing is null then
      insert into public.crm_activities(lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by)
      values(case when v_type='lead' then p_entity_id when v_type='meeting' then (select lead_id from public.sales_meetings where id=p_entity_id) else null end,
             case when v_type='opportunity' then p_entity_id when v_type='meeting' then (select opportunity_id from public.sales_meetings where id=p_entity_id) when v_type='quotation' then (select opportunity_id from public.quotations where id=p_entity_id) else null end,
             v_owner,case when v_type='quotation' then 'Quotation Follow-Up' else 'Follow-Up' end,v_subject,v_due,'Scheduled','CRM',left(coalesce(p_payload->>'notes',''),4000),v_uid)
      returning id into v_existing;
    else
      update public.crm_activities set due_at=v_due,notes=left(coalesce(p_payload->>'notes',notes),4000),updated_at=now() where id=v_existing;
    end if;
    if v_type='lead' then update public.crm_leads set next_follow_up_at=v_due,updated_at=now() where id=p_entity_id;
    elsif v_type='opportunity' then update public.crm_opportunities set next_follow_up_at=v_due,updated_at=now() where id=p_entity_id;
    elsif v_type='meeting' then update public.sales_meetings set follow_up_at=v_due,next_step=coalesce(nullif(v_subject,''),next_step),updated_at=now() where id=p_entity_id; end if;
    v_result:=jsonb_build_object('activityId',v_existing,'dueAt',v_due);
  elsif v_action='convert_lead' and v_type='lead' then
    select public.convert_lead_to_opportunity(p_entity_id,left(coalesce(nullif(p_payload->>'name',''),(select title from public.crm_leads where id=p_entity_id)),200),greatest(coalesce((p_payload->>'expectedValue')::numeric,0),0)) into v_new_id;
    v_result:=jsonb_build_object('opportunityId',v_new_id);
  elsif v_action='create_project_from_sale' and v_type='opportunity' then
    select id into v_new_id from public.projects where source_opportunity_id=p_entity_id order by created_at limit 1;
    if v_new_id is null then select public.create_project_from_sale(p_entity_id) into v_new_id; end if;
    v_result:=jsonb_build_object('projectId',v_new_id);
  else raise exception 'This action is not available as a one-click workflow.'; end if;
  insert into public.productivity_action_log(user_id,action_key,entity_type,entity_id,payload,result,status) values(v_uid,v_action,v_type,p_entity_id,coalesce(p_payload,'{}'::jsonb),v_result,'Completed');
  return v_result;
exception when others then
  begin insert into public.productivity_action_log(user_id,action_key,entity_type,entity_id,payload,result,status) values(v_uid,v_action,v_type,p_entity_id,coalesce(p_payload,'{}'::jsonb),jsonb_build_object('error',sqlerrm),'Failed'); exception when others then null; end;
  raise;
end $$;

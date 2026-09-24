-- Closure: controlled create/reassign and bounded history for the Sales Execution Center.
create or replace function public.crm_create_activity(
  p_entity_type text,
  p_entity_id uuid,
  p_activity_type text,
  p_subject text,
  p_due_at timestamptz,
  p_notes text default '',
  p_channel text default null,
  p_assigned_to uuid default null
) returns jsonb
language plpgsql security definer set search_path='public','pg_temp' as $$
declare
  v_uid uuid:=(select auth.uid());
  v_entity text:=lower(btrim(coalesce(p_entity_type,'')));
  v_owner uuid;
  v_lead uuid;
  v_opp uuid;
  v_cfg jsonb;
  v_type jsonb;
  v_due timestamptz;
  a public.crm_activities%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if v_entity='lead' then
    select id,salesperson_id into v_lead,v_owner from public.crm_leads where id=p_entity_id and (public.is_admin() or salesperson_id=v_uid);
  elsif v_entity='opportunity' then
    select id,lead_id,salesperson_id into v_opp,v_lead,v_owner from public.crm_opportunities where id=p_entity_id and (public.is_admin() or salesperson_id=v_uid);
  else raise exception 'Activities must be linked to a lead or opportunity.'; end if;
  if (v_entity='lead' and v_lead is null) or (v_entity='opportunity' and v_opp is null) then raise exception 'Record access denied.'; end if;
  select config_value into v_cfg from public.system_configuration where config_key='crm_activity_execution_settings';
  select value into v_type from jsonb_array_elements(coalesce(v_cfg->'types','[]'::jsonb)) where value->>'name'=p_activity_type and coalesce((value->>'active')::boolean,false) limit 1;
  if v_type is null then raise exception 'Choose an active activity type.'; end if;
  if not public.is_admin() and not exists(select 1 from jsonb_array_elements_text(coalesce(v_type->'allowedRoles','[]'::jsonb)) x where x=(select role from public.user_profiles where id=v_uid)) then raise exception 'This activity type is not available for your role.'; end if;
  if char_length(btrim(coalesce(p_subject,''))) not between 2 and 240 then raise exception 'Activity subject must be between 2 and 240 characters.'; end if;
  v_owner:=coalesce(p_assigned_to,v_owner,v_uid);
  if not public.is_admin() and v_owner<>v_uid then raise exception 'Salespeople cannot assign activities to another user.'; end if;
  if not exists(select 1 from public.user_profiles where id=v_owner and status='active') then raise exception 'Choose an active owner.'; end if;
  if p_due_at is null or p_due_at<=now() then raise exception 'Choose a future due date and time.'; end if;
  v_due:=public.crm_adjust_activity_due(v_owner,p_due_at);
  perform set_config('app.crm_activity_rpc','1',true);
  insert into public.crm_activities(lead_id,opportunity_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by)
  values(v_lead,v_opp,v_owner,p_activity_type,btrim(p_subject),v_due,'Scheduled',coalesce(nullif(p_channel,''),nullif(v_type->>'channel',''),'CRM'),left(coalesce(p_notes,''),5000),v_uid)
  returning * into a;
  if v_lead is not null then update public.crm_leads set next_follow_up_at=v_due,updated_at=now() where id=v_lead; end if;
  if v_opp is not null then update public.crm_opportunities set next_follow_up_at=v_due,updated_at=now() where id=v_opp; end if;
  return jsonb_build_object('id',a.id,'leadId',a.lead_id,'opportunityId',a.opportunity_id,'assignedTo',a.assigned_to,'activityType',a.activity_type,'subject',a.subject,'dueAt',a.due_at,'status',a.status,'calendarAdjusted',a.due_at is distinct from p_due_at);
end $$;
grant execute on function public.crm_create_activity(text,uuid,text,text,timestamptz,text,text,uuid) to authenticated;

create or replace function public.crm_reassign_activity(p_activity_id uuid,p_assigned_to uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare a public.crm_activities%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required to reassign activities.'; end if;
  if not exists(select 1 from public.user_profiles where id=p_assigned_to and status='active') then raise exception 'Choose an active owner.'; end if;
  select * into a from public.crm_activities where id=p_activity_id for update;
  if a.id is null then raise exception 'Activity not found.'; end if;
  if a.status<>'Scheduled' then raise exception 'Closed activities cannot be reassigned.'; end if;
  perform set_config('app.crm_activity_rpc','1',true);
  update public.crm_activities set assigned_to=p_assigned_to,updated_at=now() where id=p_activity_id returning * into a;
  return jsonb_build_object('id',a.id,'assignedTo',a.assigned_to);
end $$;
grant execute on function public.crm_reassign_activity(uuid,uuid) to authenticated;

create or replace function public.crm_get_activity_history(p_scope text default 'mine',p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $$
declare v_uid uuid:=(select auth.uid());v_admin boolean;v_scope text;v_items jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  v_admin:=public.is_admin();v_scope:=case when lower(coalesce(p_scope,''))='team' and v_admin then 'team' else 'mine' end;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'leadId',a.lead_id,'opportunityId',a.opportunity_id,'assignedTo',a.assigned_to,'ownerName',coalesce(up.full_name,'Unassigned'),
    'activityType',a.activity_type,'subject',a.subject,'dueAt',a.due_at,'completedAt',a.completed_at,'status',a.status,'channel',a.channel,'notes',a.notes,
    'outcome',a.outcome,'originalDueAt',a.original_due_at,'rescheduleCount',a.reschedule_count,'lastRescheduledAt',a.last_rescheduled_at,'lastRescheduleReason',a.last_reschedule_reason,
    'companyName',coalesce(o.company_name,l.company_name,o.name,'CRM activity'),'value',coalesce(o.expected_value,l.estimated_value,0),'currency',coalesce(o.currency,l.currency,'USD'),'stage',coalesce(o.stage,l.status,''),
    'createdAt',a.created_at,'updatedAt',a.updated_at
  ) order by coalesce(a.completed_at,a.updated_at) desc),'[]'::jsonb) into v_items
  from (select * from public.crm_activities x where x.status in ('Completed','Cancelled') and (v_scope='team' or x.assigned_to=v_uid) and (v_admin or x.assigned_to=v_uid or x.created_by=v_uid) order by coalesce(x.completed_at,x.updated_at) desc limit greatest(1,least(coalesce(p_limit,100),250))) a
  left join public.crm_leads l on l.id=a.lead_id
  left join public.crm_opportunities o on o.id=a.opportunity_id
  left join public.user_profiles up on up.id=a.assigned_to;
  return jsonb_build_object('scope',v_scope,'items',v_items);
end $$;
grant execute on function public.crm_get_activity_history(text,integer) to authenticated;

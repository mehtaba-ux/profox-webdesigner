-- Advanced CRM lead workspace: scoring, assignment, immutable timeline,
-- embedded communication and atomic follow-up support.

alter table public.crm_leads
  add column if not exists origin_type text,
  add column if not exists lead_score integer,
  add column if not exists lead_quality text,
  add column if not exists score_reason text,
  add column if not exists assigned_by uuid references public.user_profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz;

update public.crm_leads
set origin_type = case
      when lower(coalesce(source,'')) ~ '(google ads|meta ads|facebook ads|linkedin ads|paid|campaign|ppc)' then 'paid_ads'
      when lower(coalesce(source,'')) ~ '(website|live chat|contact form|web form)' then 'website'
      when lower(coalesce(source,'')) ~ '(referral|partner)' then 'referral'
      else 'manual'
    end,
    assigned_at = case when salesperson_id is not null then coalesce(assigned_at,created_at) else assigned_at end,
    assigned_by = case when salesperson_id is not null then coalesce(assigned_by,created_by) else assigned_by end
where origin_type is null or assigned_at is null;

create or replace function public.crm_lead_score_values(p_origin_type text,p_source text)
returns table(score integer,quality text,reason text)
language sql
immutable
set search_path=public,pg_temp
as $$
  select
    case
      when lower(coalesce(p_origin_type,''))='website' then 90
      when lower(coalesce(p_origin_type,''))='paid_ads' then 60
      when lower(coalesce(p_origin_type,''))='referral' then 75
      when lower(coalesce(p_origin_type,''))='manual' then 25
      when lower(coalesce(p_source,'')) ~ '(website|live chat|contact form|web form)' then 90
      when lower(coalesce(p_source,'')) ~ '(google ads|meta ads|facebook ads|linkedin ads|paid|campaign|ppc)' then 60
      else 40
    end,
    case
      when lower(coalesce(p_origin_type,'')) in ('website','referral') then 'High'
      when lower(coalesce(p_origin_type,''))='paid_ads' then 'Medium'
      when lower(coalesce(p_origin_type,''))='manual' then 'Low'
      when lower(coalesce(p_source,'')) ~ '(website|live chat|contact form|web form)' then 'High'
      when lower(coalesce(p_source,'')) ~ '(google ads|meta ads|facebook ads|linkedin ads|paid|campaign|ppc)' then 'Medium'
      else 'Low'
    end,
    case
      when lower(coalesce(p_origin_type,''))='website' then 'Direct website enquiry or website chat'
      when lower(coalesce(p_origin_type,''))='paid_ads' then 'Paid advertising or campaign lead'
      when lower(coalesce(p_origin_type,''))='referral' then 'Referral or partner introduction'
      when lower(coalesce(p_origin_type,''))='manual' then 'Manually researched or entered in CRM'
      when lower(coalesce(p_source,'')) ~ '(website|live chat|contact form|web form)' then 'Direct website enquiry or website chat'
      when lower(coalesce(p_source,'')) ~ '(google ads|meta ads|facebook ads|linkedin ads|paid|campaign|ppc)' then 'Paid advertising or campaign lead'
      else 'Other lead source'
    end
$$;

create or replace function public.crm_prepare_lead()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_scoring record;
begin
  new.source:=left(btrim(coalesce(new.source,'Other')),120);
  if new.origin_type is null or new.origin_type not in ('manual','website','paid_ads','referral','other') then
    new.origin_type:=case
      when lower(new.source) ~ '(google ads|meta ads|facebook ads|linkedin ads|paid|campaign|ppc)' then 'paid_ads'
      when lower(new.source) ~ '(website|live chat|contact form|web form)' then 'website'
      when lower(new.source) ~ '(referral|partner)' then 'referral'
      else 'manual'
    end;
  elsif new.origin_type='manual' and lower(new.source) ~ '(google ads|meta ads|facebook ads|linkedin ads|paid|campaign|ppc)' then
    new.origin_type:='paid_ads';
  elsif new.origin_type='manual' and lower(new.source) ~ '(website|live chat|contact form|web form)' then
    new.origin_type:='website';
  end if;
  select * into v_scoring from public.crm_lead_score_values(new.origin_type,new.source);
  new.lead_score:=v_scoring.score;
  new.lead_quality:=v_scoring.quality;
  new.score_reason:=v_scoring.reason;
  if tg_op='INSERT' and new.salesperson_id is not null then
    new.assigned_at:=coalesce(new.assigned_at,now());
    new.assigned_by:=coalesce(new.assigned_by,new.created_by,(select auth.uid()));
  elsif tg_op='UPDATE' and new.salesperson_id is distinct from old.salesperson_id then
    new.assigned_at:=case when new.salesperson_id is null then null else now() end;
    new.assigned_by:=case when new.salesperson_id is null then null else (select auth.uid()) end;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_crm_prepare_lead on public.crm_leads;
create trigger trigger_crm_prepare_lead
before insert or update on public.crm_leads
for each row execute function public.crm_prepare_lead();

update public.crm_leads set source=source;

alter table public.crm_leads alter column origin_type set default 'manual';
alter table public.crm_leads alter column origin_type set not null;
alter table public.crm_leads alter column lead_score set default 25;
alter table public.crm_leads alter column lead_score set not null;
alter table public.crm_leads alter column lead_quality set default 'Low';
alter table public.crm_leads alter column lead_quality set not null;
alter table public.crm_leads alter column score_reason set default 'Manually researched or entered in CRM';
alter table public.crm_leads alter column score_reason set not null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='crm_leads_origin_type_check') then
    alter table public.crm_leads add constraint crm_leads_origin_type_check check(origin_type in ('manual','website','paid_ads','referral','other'));
  end if;
  if not exists(select 1 from pg_constraint where conname='crm_leads_score_check') then
    alter table public.crm_leads add constraint crm_leads_score_check check(lead_score between 0 and 100);
  end if;
  if not exists(select 1 from pg_constraint where conname='crm_leads_quality_check') then
    alter table public.crm_leads add constraint crm_leads_quality_check check(lead_quality in ('High','Medium','Low'));
  end if;
end $$;

create index if not exists idx_crm_leads_quality_score on public.crm_leads(lead_quality,lead_score desc);
create index if not exists idx_crm_leads_next_follow_up on public.crm_leads(next_follow_up_at) where converted_opportunity_id is null;

create table if not exists public.crm_lead_events(
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text not null default '',
  actor_user_id uuid references public.user_profiles(id) on delete set null,
  actor_name_snapshot text not null default 'System',
  actor_role_snapshot text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint crm_lead_events_type_check check(char_length(event_type) between 2 and 80),
  constraint crm_lead_events_title_check check(char_length(title) between 2 and 240),
  constraint crm_lead_events_description_check check(char_length(description)<=5000),
  constraint crm_lead_events_metadata_object check(jsonb_typeof(metadata)='object')
);

create index if not exists idx_crm_lead_events_lead_time on public.crm_lead_events(lead_id,occurred_at desc);
create index if not exists idx_crm_lead_events_actor on public.crm_lead_events(actor_user_id) where actor_user_id is not null;
alter table public.crm_lead_events enable row level security;
revoke all on public.crm_lead_events from public,anon,authenticated;
grant select on public.crm_lead_events to authenticated;
drop policy if exists crm_lead_events_select on public.crm_lead_events;
create policy crm_lead_events_select on public.crm_lead_events for select to authenticated
using(
  public.is_admin()
  or exists(
    select 1 from public.crm_leads l
    where l.id=crm_lead_events.lead_id and l.salesperson_id=(select auth.uid())
  )
);

create or replace function public.crm_event_actor(p_fallback uuid default null)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'id',u.id,
    'name',coalesce(nullif(btrim(u.full_name),''),nullif(btrim(u.email),''),'System'),
    'role',coalesce(nullif(u.role,''),'system')
  )
  from (select coalesce((select auth.uid()),p_fallback) id) x
  left join public.user_profiles u on u.id=x.id
$$;

create or replace function public.crm_write_lead_event(
  p_lead_id uuid,
  p_event_type text,
  p_title text,
  p_description text default '',
  p_metadata jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null,
  p_actor_name text default null,
  p_actor_role text default null,
  p_occurred_at timestamptz default now(),
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid; v_actor jsonb; v_uid uuid:=coalesce(p_actor_user_id,(select auth.uid()));
begin
  if p_lead_id is null then return null; end if;
  v_actor:=public.crm_event_actor(v_uid);
  insert into public.crm_lead_events(
    lead_id,event_type,title,description,actor_user_id,actor_name_snapshot,actor_role_snapshot,metadata,occurred_at,dedupe_key
  ) values(
    p_lead_id,left(coalesce(nullif(p_event_type,''),'lead_event'),80),left(coalesce(nullif(p_title,''),'Lead activity'),240),
    left(coalesce(p_description,''),5000),v_uid,
    left(coalesce(nullif(p_actor_name,''),v_actor->>'name','System'),180),
    left(coalesce(nullif(p_actor_role,''),v_actor->>'role','system'),80),
    case when jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))='object' then coalesce(p_metadata,'{}'::jsonb) else '{}'::jsonb end,
    coalesce(p_occurred_at,now()),p_dedupe_key
  ) on conflict(dedupe_key) do nothing returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.crm_audit_lead_change()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if tg_op='INSERT' then
    perform public.crm_write_lead_event(
      new.id,'lead_created','Lead created',
      'Lead entered from '||new.source||' and classified as '||new.lead_quality||' quality.',
      jsonb_build_object('source',new.source,'originType',new.origin_type,'score',new.lead_score,'quality',new.lead_quality,'assigneeId',new.salesperson_id),
      new.created_by,
      case when new.created_by is null and new.origin_type='website' then 'Website visitor' else null end,
      case when new.created_by is null and new.origin_type='website' then 'customer' else null end,
      new.created_at,'lead-created:'||new.id::text
    );
    return new;
  end if;
  if new.status is distinct from old.status then
    perform public.crm_write_lead_event(new.id,'stage_changed','Stage changed to '||new.status,
      'Stage moved from '||old.status||' to '||new.status||'.',jsonb_build_object('from',old.status,'to',new.status));
  end if;
  if new.salesperson_id is distinct from old.salesperson_id then
    perform public.crm_write_lead_event(new.id,'assignment_changed',case when new.salesperson_id is null then 'Lead unassigned' else 'Lead reassigned' end,
      case when new.salesperson_id is null then 'The lead no longer has an assignee.' else 'Ownership changed and the new assignee is now responsible for the next action.' end,
      jsonb_build_object('fromUserId',old.salesperson_id,'toUserId',new.salesperson_id));
  end if;
  if new.source is distinct from old.source or new.origin_type is distinct from old.origin_type then
    perform public.crm_write_lead_event(new.id,'source_changed','Lead source updated',
      'Source changed from '||coalesce(old.source,'Unknown')||' to '||coalesce(new.source,'Unknown')||'.',
      jsonb_build_object('fromSource',old.source,'toSource',new.source,'fromOriginType',old.origin_type,'toOriginType',new.origin_type));
  end if;
  if new.lead_score is distinct from old.lead_score or new.lead_quality is distinct from old.lead_quality then
    perform public.crm_write_lead_event(new.id,'score_changed','Lead score recalculated',
      'Lead quality is now '||new.lead_quality||' with a score of '||new.lead_score::text||'.',
      jsonb_build_object('fromScore',old.lead_score,'toScore',new.lead_score,'fromQuality',old.lead_quality,'toQuality',new.lead_quality,'reason',new.score_reason));
  end if;
  if new.next_follow_up_at is distinct from old.next_follow_up_at then
    perform public.crm_write_lead_event(new.id,'follow_up_changed',case when new.next_follow_up_at is null then 'Next follow-up cleared' else 'Next follow-up scheduled' end,
      case when new.next_follow_up_at is null then 'The next follow-up date was cleared.' else 'Next follow-up: '||new.next_follow_up_at::text end,
      jsonb_build_object('from',old.next_follow_up_at,'to',new.next_follow_up_at));
  end if;
  if new.converted_opportunity_id is distinct from old.converted_opportunity_id and new.converted_opportunity_id is not null then
    perform public.crm_write_lead_event(new.id,'converted','Converted to opportunity','The qualified lead entered the opportunity pipeline.',jsonb_build_object('opportunityId',new.converted_opportunity_id));
  end if;
  if row(new.title,new.company_name,new.contact_name,new.email,new.phone,new.website,new.country,new.industry,new.service_interest,new.estimated_value,new.currency,new.notes)
     is distinct from row(old.title,old.company_name,old.contact_name,old.email,old.phone,old.website,old.country,old.industry,old.service_interest,old.estimated_value,old.currency,old.notes) then
    perform public.crm_write_lead_event(new.id,'details_updated','Lead details updated','Contact, company, value, service or internal notes were updated.',
      jsonb_build_object('changedBy',(select auth.uid())));
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_crm_audit_lead_change on public.crm_leads;
create trigger trigger_crm_audit_lead_change
after insert or update on public.crm_leads
for each row execute function public.crm_audit_lead_change();

create or replace function public.crm_audit_activity_change()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_lead uuid; v_type text; v_title text; v_description text;
begin
  v_lead:=coalesce(new.lead_id,(select o.lead_id from public.crm_opportunities o where o.id=new.opportunity_id));
  if v_lead is null then return new; end if;
  if tg_op='INSERT' then
    v_type:='activity_created'; v_title:=new.activity_type||' scheduled';
    v_description:=new.subject||' · due '||new.due_at::text;
  elsif new.status is distinct from old.status then
    v_type:='activity_'||lower(replace(new.status,' ','_')); v_title:=new.activity_type||' '||lower(new.status);
    v_description:=new.subject;
  elsif new.assigned_to is distinct from old.assigned_to then
    v_type:='activity_reassigned'; v_title:=new.activity_type||' reassigned'; v_description:=new.subject;
  else return new;
  end if;
  perform public.crm_write_lead_event(v_lead,v_type,v_title,v_description,
    jsonb_build_object('activityId',new.id,'activityType',new.activity_type,'status',new.status,'assignedTo',new.assigned_to,'dueAt',new.due_at),
    coalesce((select auth.uid()),new.created_by),null,null,coalesce(new.updated_at,new.created_at),
    case when tg_op='INSERT' then 'activity-created:'||new.id::text else null end);
  return new;
end;
$$;

drop trigger if exists trigger_crm_audit_activity_change on public.crm_activities;
create trigger trigger_crm_audit_activity_change
after insert or update on public.crm_activities
for each row execute function public.crm_audit_activity_change();

create or replace function public.crm_audit_meeting_change()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_lead uuid; v_type text; v_title text; v_description text;
begin
  v_lead:=coalesce(new.lead_id,(select o.lead_id from public.crm_opportunities o where o.id=new.opportunity_id));
  if v_lead is null then return new; end if;
  if tg_op='INSERT' then
    v_type:='meeting_scheduled'; v_title:='Meeting scheduled';
    v_description:=new.title||' · '||new.start_at::text;
  elsif new.start_at is distinct from old.start_at then
    v_type:='meeting_rescheduled'; v_title:='Meeting rescheduled';
    v_description:=new.title||' · new time '||new.start_at::text;
  elsif new.status is distinct from old.status then
    v_type:='meeting_'||lower(replace(new.status,' ','_')); v_title:='Meeting '||lower(new.status);
    v_description:=new.title;
  else return new;
  end if;
  perform public.crm_write_lead_event(v_lead,v_type,v_title,v_description,
    jsonb_build_object('meetingId',new.id,'status',new.status,'startAt',new.start_at,'endAt',new.end_at,'salespersonId',new.salesperson_id),
    coalesce((select auth.uid()),new.created_by),null,null,coalesce(new.updated_at,new.created_at),
    case when tg_op='INSERT' then 'meeting-created:'||new.id::text else null end);
  return new;
end;
$$;

drop trigger if exists trigger_crm_audit_meeting_change on public.sales_meetings;
create trigger trigger_crm_audit_meeting_change
after insert or update on public.sales_meetings
for each row execute function public.crm_audit_meeting_change();

create or replace function public.crm_audit_sales_chat_message()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_lead uuid;
begin
  select crm_lead_id into v_lead from public.sales_chat_conversations where id=new.conversation_id;
  if v_lead is null then return new; end if;
  perform public.crm_write_lead_event(v_lead,'chat_message',
    case when new.is_internal_note then 'Internal chat note added' when new.sender_type='customer' then 'Customer sent a chat message' else 'Salesperson replied in chat' end,
    left(new.message_text,500),
    jsonb_build_object('conversationId',new.conversation_id,'messageId',new.id,'senderType',new.sender_type,'internalNote',new.is_internal_note),
    new.sender_id,new.sender_name,case when new.sender_type='customer' then 'customer' else null end,new.created_at,
    'chat-message:'||new.id::text);
  return new;
end;
$$;

drop trigger if exists trigger_crm_audit_sales_chat_message on public.sales_chat_messages;
create trigger trigger_crm_audit_sales_chat_message
after insert on public.sales_chat_messages
for each row execute function public.crm_audit_sales_chat_message();

-- Seed immutable history for records that existed before the audit stream.
insert into public.crm_lead_events(lead_id,event_type,title,description,actor_user_id,actor_name_snapshot,actor_role_snapshot,metadata,occurred_at,dedupe_key)
select l.id,'lead_created','Lead created','Historical lead imported into the unified CRM timeline.',l.created_by,
  coalesce(nullif(u.full_name,''),nullif(u.email,''),case when l.origin_type='website' then 'Website visitor' else 'System' end),
  coalesce(nullif(u.role,''),case when l.origin_type='website' then 'customer' else 'system' end),
  jsonb_build_object('source',l.source,'originType',l.origin_type,'score',l.lead_score,'quality',l.lead_quality,'assigneeId',l.salesperson_id),
  l.created_at,'lead-created:'||l.id::text
from public.crm_leads l left join public.user_profiles u on u.id=l.created_by
on conflict(dedupe_key) do nothing;

insert into public.crm_lead_events(lead_id,event_type,title,description,actor_user_id,actor_name_snapshot,actor_role_snapshot,metadata,occurred_at,dedupe_key)
select a.lead_id,'activity_created',a.activity_type||' recorded',a.subject,coalesce(a.created_by,a.assigned_to),
  coalesce(nullif(u.full_name,''),nullif(u.email,''),'System'),coalesce(nullif(u.role,''),'system'),
  jsonb_build_object('activityId',a.id,'activityType',a.activity_type,'status',a.status,'assignedTo',a.assigned_to,'dueAt',a.due_at),
  a.created_at,'activity-created:'||a.id::text
from public.crm_activities a left join public.user_profiles u on u.id=coalesce(a.created_by,a.assigned_to)
where a.lead_id is not null
on conflict(dedupe_key) do nothing;

insert into public.crm_lead_events(lead_id,event_type,title,description,actor_user_id,actor_name_snapshot,actor_role_snapshot,metadata,occurred_at,dedupe_key)
select m.lead_id,'meeting_scheduled','Meeting recorded',m.title,m.created_by,
  coalesce(nullif(u.full_name,''),nullif(u.email,''),'System'),coalesce(nullif(u.role,''),'system'),
  jsonb_build_object('meetingId',m.id,'status',m.status,'startAt',m.start_at,'endAt',m.end_at,'salespersonId',m.salesperson_id),
  m.created_at,'meeting-created:'||m.id::text
from public.sales_meetings m left join public.user_profiles u on u.id=m.created_by
where m.lead_id is not null
on conflict(dedupe_key) do nothing;

insert into public.crm_lead_events(lead_id,event_type,title,description,actor_user_id,actor_name_snapshot,actor_role_snapshot,metadata,occurred_at,dedupe_key)
select c.crm_lead_id,'chat_message',case when m.is_internal_note then 'Internal chat note added' when m.sender_type='customer' then 'Customer sent a chat message' else 'Salesperson replied in chat' end,
  left(m.message_text,500),m.sender_id,m.sender_name,case when m.sender_type='customer' then 'customer' else coalesce(u.role,'system') end,
  jsonb_build_object('conversationId',m.conversation_id,'messageId',m.id,'senderType',m.sender_type,'internalNote',m.is_internal_note),
  m.created_at,'chat-message:'||m.id::text
from public.sales_chat_messages m
join public.sales_chat_conversations c on c.id=m.conversation_id
left join public.user_profiles u on u.id=m.sender_id
where c.crm_lead_id is not null
on conflict(dedupe_key) do nothing;

create table if not exists public.crm_public_lead_rate_limits(
  email_hash text primary key,
  last_submitted_at timestamptz not null default now()
);
alter table public.crm_public_lead_rate_limits enable row level security;
revoke all on public.crm_public_lead_rate_limits from public,anon,authenticated;
drop policy if exists crm_public_lead_rate_limits_deny on public.crm_public_lead_rate_limits;
create policy crm_public_lead_rate_limits_deny on public.crm_public_lead_rate_limits for all to anon,authenticated using(false) with check(false);

create or replace function public.crm_can_access_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select (select auth.uid()) is not null and exists(
    select 1 from public.crm_leads l
    where l.id=p_lead_id and (public.is_admin() or l.salesperson_id=(select auth.uid()))
  )
$$;

create or replace function public.crm_list_lead_assignees()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not exists(
    select 1 from public.user_profiles u where u.id=(select auth.uid()) and u.status='active' and u.role in ('admin','sales','sales_rep','sales_team')
  ) then raise exception 'CRM access required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'name',coalesce(nullif(btrim(u.full_name),''),u.email),'avatarUrl',coalesce(u.avatar_url,''),'role',u.role,
    'status',u.status,'onboardingStatus',u.onboarding_status
  ) order by coalesce(nullif(btrim(u.full_name),''),u.email)),'[]'::jsonb) into v_result
  from public.user_profiles u
  where u.status='active' and u.onboarding_status='completed' and u.role in ('sales','sales_rep','sales_team');
  return v_result;
end;
$$;

create or replace function public.crm_get_lead_detail(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_lead public.crm_leads%rowtype; v_result jsonb;
begin
  if not public.crm_can_access_lead(p_lead_id) then raise exception 'Lead access denied.'; end if;
  select * into v_lead from public.crm_leads where id=p_lead_id;
  select jsonb_build_object(
    'assignee',(select jsonb_build_object('id',u.id,'name',coalesce(nullif(btrim(u.full_name),''),u.email),'avatarUrl',coalesce(u.avatar_url,''),'role',u.role) from public.user_profiles u where u.id=v_lead.salesperson_id),
    'createdBy',(select jsonb_build_object('id',u.id,'name',coalesce(nullif(btrim(u.full_name),''),u.email),'avatarUrl',coalesce(u.avatar_url,''),'role',u.role) from public.user_profiles u where u.id=v_lead.created_by),
    'assignedBy',(select jsonb_build_object('id',u.id,'name',coalesce(nullif(btrim(u.full_name),''),u.email),'avatarUrl',coalesce(u.avatar_url,''),'role',u.role) from public.user_profiles u where u.id=v_lead.assigned_by),
    'events',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'eventType',e.event_type,'title',e.title,'description',e.description,'actorUserId',e.actor_user_id,
      'actorName',e.actor_name_snapshot,'actorRole',e.actor_role_snapshot,'metadata',e.metadata,'occurredAt',e.occurred_at
    ) order by e.occurred_at desc,e.created_at desc) from public.crm_lead_events e where e.lead_id=p_lead_id),'[]'::jsonb),
    'activities',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'activityType',a.activity_type,'subject',a.subject,'dueAt',a.due_at,'completedAt',a.completed_at,
      'status',a.status,'channel',a.channel,'notes',a.notes,'assignedTo',a.assigned_to,
      'assigneeName',coalesce(nullif(btrim(u.full_name),''),u.email),'assigneeAvatarUrl',coalesce(u.avatar_url,''),'createdAt',a.created_at
    ) order by a.due_at desc) from public.crm_activities a left join public.user_profiles u on u.id=a.assigned_to where a.lead_id=p_lead_id),'[]'::jsonb),
    'meetings',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'title',m.title,'meetingType',m.meeting_type,'startAt',m.start_at,'endAt',m.end_at,'timezone',m.timezone,
      'status',m.status,'meetingUrl',m.meeting_url,'salespersonId',m.salesperson_id,'createdAt',m.created_at
    ) order by m.start_at desc) from public.sales_meetings m where m.lead_id=p_lead_id),'[]'::jsonb),
    'conversations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'crmLeadId',c.crm_lead_id,'customerName',c.customer_name,'customerEmail',c.customer_email,'customerPhone',c.customer_phone,
      'intent',c.intent,'originalSalesId',c.original_sales_id,'currentSalesId',c.current_sales_id,'status',c.status,
      'lastMessage',c.last_message,'lastMessageTime',c.last_message_time,'createdAt',c.created_at,'updatedAt',c.updated_at
    ) order by c.updated_at desc) from public.sales_chat_conversations c where c.crm_lead_id=p_lead_id),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.crm_assign_lead(p_lead_id uuid,p_salesperson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_lead public.crm_leads%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an Administrator may reassign leads.'; end if;
  if not exists(select 1 from public.user_profiles u where u.id=p_salesperson_id and u.status='active' and u.onboarding_status='completed' and u.role in ('sales','sales_rep','sales_team')) then
    raise exception 'Choose an active, qualified Sales Representative.';
  end if;
  update public.crm_leads set salesperson_id=p_salesperson_id where id=p_lead_id returning * into v_lead;
  if not found then raise exception 'Lead not found.'; end if;
  update public.sales_chat_conversations set current_sales_id=p_salesperson_id,updated_at=now() where crm_lead_id=p_lead_id and status<>'resolved';
  return jsonb_build_object('success',true,'leadId',v_lead.id,'salespersonId',v_lead.salesperson_id,'assignedAt',v_lead.assigned_at);
end;
$$;

create or replace function public.crm_schedule_lead_follow_up(p_lead_id uuid,p_due_at timestamptz,p_subject text,p_notes text default '')
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_lead public.crm_leads%rowtype; v_activity public.crm_activities%rowtype; v_subject text:=btrim(coalesce(p_subject,''));
begin
  if not public.crm_can_access_lead(p_lead_id) then raise exception 'Lead access denied.'; end if;
  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if p_due_at is null or p_due_at<=now() then raise exception 'Choose a future follow-up date and time.'; end if;
  if char_length(v_subject) not between 2 and 180 then raise exception 'Follow-up subject must be between 2 and 180 characters.'; end if;
  if v_lead.salesperson_id is null then raise exception 'Assign the lead before scheduling a follow-up.'; end if;
  insert into public.crm_activities(lead_id,assigned_to,activity_type,subject,due_at,status,channel,notes,created_by)
  values(p_lead_id,v_lead.salesperson_id,'Follow-Up',v_subject,p_due_at,'Scheduled',coalesce(nullif(v_lead.initial_outreach_channel,''),'Email'),left(coalesce(p_notes,''),5000),(select auth.uid()))
  returning * into v_activity;
  update public.crm_leads set next_follow_up_at=p_due_at,status=case when status in ('New','Researching','Contacted','Interested') then 'Follow-Up' else status end where id=p_lead_id;
  return jsonb_build_object('id',v_activity.id,'leadId',v_activity.lead_id,'assignedTo',v_activity.assigned_to,'activityType',v_activity.activity_type,'subject',v_activity.subject,'dueAt',v_activity.due_at,'status',v_activity.status);
end;
$$;

create or replace function public.crm_add_lead_note(p_lead_id uuid,p_note text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_note text:=btrim(coalesce(p_note,'')); v_id uuid;
begin
  if not public.crm_can_access_lead(p_lead_id) then raise exception 'Lead access denied.'; end if;
  if char_length(v_note) not between 2 and 4000 then raise exception 'Note must be between 2 and 4000 characters.'; end if;
  v_id:=public.crm_write_lead_event(p_lead_id,'note_added','Internal note added',v_note,jsonb_build_object('visibility','internal'));
  return jsonb_build_object('success',true,'eventId',v_id);
end;
$$;

create or replace function public.crm_log_lead_email_opened(p_lead_id uuid,p_subject text,p_body text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_lead public.crm_leads%rowtype; v_activity public.crm_activities%rowtype; v_subject text:=btrim(coalesce(p_subject,'')); v_body text:=btrim(coalesce(p_body,''));
begin
  if not public.crm_can_access_lead(p_lead_id) then raise exception 'Lead access denied.'; end if;
  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if coalesce(nullif(btrim(v_lead.email),''),'')='' then raise exception 'This lead does not have an email address.'; end if;
  if char_length(v_subject) not between 2 and 180 then raise exception 'Email subject must be between 2 and 180 characters.'; end if;
  if char_length(v_body) not between 2 and 4000 then raise exception 'Email message must be between 2 and 4000 characters.'; end if;
  insert into public.crm_activities(lead_id,assigned_to,activity_type,subject,due_at,completed_at,status,channel,notes,created_by)
  values(p_lead_id,v_lead.salesperson_id,'Cold Email',v_subject,now(),now(),'Completed','Email',
    'Prepared in ProFox CRM and opened in the user email application. Delivery is not claimed. Message: '||v_body,(select auth.uid()))
  returning * into v_activity;
  update public.crm_leads set last_contact_at=now(),status=case when status in ('New','Researching') then 'Contacted' else status end where id=p_lead_id;
  return jsonb_build_object('success',true,'activityId',v_activity.id,'recipient',lower(btrim(v_lead.email)));
end;
$$;

create or replace function public.submit_public_crm_lead(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_name text:=btrim(coalesce(p_payload->>'fullName',''));
  v_email text:=lower(btrim(coalesce(p_payload->>'email','')));
  v_subject text:=btrim(coalesce(p_payload->>'subject',''));
  v_message text:=btrim(coalesce(p_payload->>'message',''));
  v_email_hash text;
  v_last timestamptz;
  v_seller uuid;
  v_lead public.crm_leads%rowtype;
begin
  if btrim(coalesce(p_payload->>'honeypot',''))<>'' then return jsonb_build_object('success',true); end if;
  if char_length(v_name) not between 2 and 120 then raise exception 'Enter your full name.'; end if;
  if char_length(v_email)>254 or v_email!~'^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Enter a valid email address.'; end if;
  if char_length(v_subject) not between 2 and 180 then raise exception 'Choose a valid enquiry subject.'; end if;
  if char_length(v_message) not between 5 and 4000 then raise exception 'Your message must be between 5 and 4000 characters.'; end if;
  v_email_hash:=encode(extensions.digest(v_email,'sha256'),'hex');
  insert into public.crm_public_lead_rate_limits(email_hash,last_submitted_at) values(v_email_hash,now()-interval '2 minutes') on conflict(email_hash) do nothing;
  select last_submitted_at into v_last from public.crm_public_lead_rate_limits where email_hash=v_email_hash for update;
  if v_last>now()-interval '60 seconds' then raise exception 'Please wait before submitting another enquiry.'; end if;
  update public.crm_public_lead_rate_limits set last_submitted_at=now() where email_hash=v_email_hash;
  select u.id into v_seller
  from public.user_profiles u left join public.workforce_capability_profiles cp on cp.user_id=u.id
  where u.status='active' and u.onboarding_status='completed' and u.role in ('sales','sales_rep','sales_team')
    and coalesce(cp.availability_status,'Available')<>'Unavailable'
    and lower(coalesce(cp.certification_state,'active')) not in ('revoked','expired','suspended','failed')
  order by (coalesce(cp.availability_status,'Available')='Available') desc,u.created_at,u.id limit 1;
  if v_seller is null then raise exception 'No verified sales representative is currently available.'; end if;
  select * into v_lead from public.crm_leads where lower(email)=v_email and converted_opportunity_id is null order by created_at desc limit 1 for update;
  if found then
    update public.crm_leads set
      title=v_subject,service_interest=v_subject,
      notes=left(concat_ws(chr(10)||chr(10),nullif(notes,''),'Website enquiry: '||v_message),5000),
      salesperson_id=coalesce(salesperson_id,v_seller),source='Website Contact Form',origin_type='website'
    where id=v_lead.id returning * into v_lead;
    perform public.crm_write_lead_event(v_lead.id,'website_enquiry','New website enquiry received',v_message,
      jsonb_build_object('subject',v_subject,'source','Website Contact Form'),null,v_name,'customer');
  else
    insert into public.crm_leads(title,company_name,contact_name,email,country,source,origin_type,salesperson_id,service_interest,status,notes,self_generated)
    values(v_subject,v_name,v_name,v_email,'Unknown','Website Contact Form','website',v_seller,v_subject,'New',v_message,false)
    returning * into v_lead;
  end if;
  return jsonb_build_object('success',true,'reference','LEAD-'||upper(left(replace(v_lead.id::text,'-',''),8)));
end;
$$;

create or replace function public.sales_chat_conversation_json(p_conversation public.sales_chat_conversations)
returns jsonb
language sql
stable
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'id',p_conversation.id,'crmLeadId',p_conversation.crm_lead_id,
    'customerName',p_conversation.customer_name,'customerEmail',p_conversation.customer_email,'customerPhone',p_conversation.customer_phone,
    'intent',p_conversation.intent,'originalSalesId',p_conversation.original_sales_id,'currentSalesId',p_conversation.current_sales_id,
    'status',p_conversation.status,'ratingGiven',p_conversation.rating_given,'feedbackComment',p_conversation.feedback_comment,
    'lastMessage',p_conversation.last_message,'lastMessageTime',p_conversation.last_message_time,
    'createdAt',p_conversation.created_at,'updatedAt',p_conversation.updated_at
  )
$$;

revoke all on function public.crm_lead_score_values(text,text) from public,anon,authenticated;
revoke all on function public.crm_prepare_lead() from public,anon,authenticated;
revoke all on function public.crm_event_actor(uuid) from public,anon,authenticated;
revoke all on function public.crm_write_lead_event(uuid,text,text,text,jsonb,uuid,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.crm_audit_lead_change() from public,anon,authenticated;
revoke all on function public.crm_audit_activity_change() from public,anon,authenticated;
revoke all on function public.crm_audit_meeting_change() from public,anon,authenticated;
revoke all on function public.crm_audit_sales_chat_message() from public,anon,authenticated;
revoke all on function public.crm_can_access_lead(uuid) from public,anon,authenticated;
revoke all on function public.crm_list_lead_assignees() from public,anon,authenticated;
revoke all on function public.crm_get_lead_detail(uuid) from public,anon,authenticated;
revoke all on function public.crm_assign_lead(uuid,uuid) from public,anon,authenticated;
revoke all on function public.crm_schedule_lead_follow_up(uuid,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.crm_add_lead_note(uuid,text) from public,anon,authenticated;
revoke all on function public.crm_log_lead_email_opened(uuid,text,text) from public,anon,authenticated;
revoke all on function public.submit_public_crm_lead(jsonb) from public,anon,authenticated;
revoke all on function public.sales_chat_conversation_json(public.sales_chat_conversations) from public,anon,authenticated;

grant execute on function public.crm_can_access_lead(uuid) to authenticated;
grant execute on function public.crm_list_lead_assignees() to authenticated;
grant execute on function public.crm_get_lead_detail(uuid) to authenticated;
grant execute on function public.crm_assign_lead(uuid,uuid) to authenticated;
grant execute on function public.crm_schedule_lead_follow_up(uuid,timestamptz,text,text) to authenticated;
grant execute on function public.crm_add_lead_note(uuid,text) to authenticated;
grant execute on function public.crm_log_lead_email_opened(uuid,text,text) to authenticated;
grant execute on function public.submit_public_crm_lead(jsonb) to anon,authenticated;

comment on table public.crm_lead_events is 'Append-only CRM timeline containing source, assignment, stage, follow-up, chat, email, activity and meeting history.';
comment on function public.submit_public_crm_lead(jsonb) is 'Rate-limited public website enquiry entry point that creates or updates the canonical CRM lead and applies website lead scoring.';

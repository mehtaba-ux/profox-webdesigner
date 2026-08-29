-- Make the quote-enquiry workflow non-bypassable at the Data API boundary.
-- Reuses the existing CRM tables, activity queue, canonical timeline, assignment
-- configuration, opportunity conversion and quotation workflow.

alter table public.crm_leads
  add column if not exists first_response_channel text,
  add column if not exists first_response_evidence_type text,
  add column if not exists first_response_evidence_id text;

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.crm_leads'::regclass
      and conname='crm_leads_first_response_evidence_type_check'
  ) then
    alter table public.crm_leads
      add constraint crm_leads_first_response_evidence_type_check
      check (
        first_response_evidence_type is null
        or first_response_evidence_type in ('manual_confirmation','crm_chat_message','provider_receipt')
      );
  end if;
end;
$block$;

create or replace function public.crm_salesperson_access_ready(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  select p_user_id is not null and exists (
    select 1
    from public.user_profiles p
    join public.sales_account_setup_state s on s.user_id=p.id
    where p.id=p_user_id
      and p.status='active'
      and p.role in ('sales','sales_rep','sales_team')
      and p.onboarding_status='completed'
      and coalesce(p.onboarding_progress,0)=100
      and s.completed_at is not null
      and s.crm_tour_completed_at is not null
      and coalesce(s.crm_tour_step,0)>=6
  );
$function$;

create or replace function public.sales_crm_access_ready()
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  select public.crm_salesperson_access_ready((select auth.uid()));
$function$;

create or replace function public.crm_can_manage_lead_assignment()
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  select (select auth.uid()) is not null and (
    public.is_admin()
    or (
      public.crm_salesperson_access_ready((select auth.uid()))
      and exists (
        select 1 from public.system_configuration c
        where c.config_key='crm_lead_assignment'
          and coalesce(c.config_value->'managerUserIds','[]'::jsonb) ? (select auth.uid())::text
      )
    )
  );
$function$;

create or replace function public.crm_guard_lead_assignment_configuration()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_id text;
begin
  if new.config_key<>'crm_lead_assignment' then return new; end if;
  if jsonb_typeof(coalesce(new.config_value->'managerUserIds','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(new.config_value->'eligibleSalespersonIds','[]'::jsonb))<>'array' then
    raise exception 'Assignment member lists are invalid.';
  end if;
  for v_id in select jsonb_array_elements_text(coalesce(new.config_value->'managerUserIds','[]'::jsonb)) loop
    if not public.crm_salesperson_access_ready(v_id::uuid) then
      raise exception 'Assignment managers must have completed Sales CRM access.';
    end if;
  end loop;
  for v_id in select jsonb_array_elements_text(coalesce(new.config_value->'eligibleSalespersonIds','[]'::jsonb)) loop
    if not public.crm_salesperson_access_ready(v_id::uuid) then
      raise exception 'Automatic-assignment sellers must have completed Sales CRM access.';
    end if;
  end loop;
  return new;
end;
$function$;

drop trigger if exists trg_crm_guard_lead_assignment_configuration on public.system_configuration;
create trigger trg_crm_guard_lead_assignment_configuration
before insert or update of config_value on public.system_configuration
for each row execute function public.crm_guard_lead_assignment_configuration();

create or replace function public.crm_list_lead_assignees()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or (
    not public.is_admin()
    and not public.crm_can_manage_lead_assignment()
    and not public.sales_crm_access_ready()
  ) then raise exception 'CRM access required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'name',coalesce(nullif(btrim(u.full_name),''),u.email),
    'avatarUrl',coalesce(u.avatar_url,''),'role',u.role,'status',u.status,
    'onboardingStatus',u.onboarding_status
  ) order by coalesce(nullif(btrim(u.full_name),''),u.email)),'[]'::jsonb)
  into v_result
  from public.user_profiles u
  where public.crm_salesperson_access_ready(u.id);
  return v_result;
end;
$function$;

create or replace function public.crm_admin_get_contact_lead_configuration()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_form jsonb; v_assignment jsonb; v_staff jsonb; v_sales jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select config_value into v_form from public.system_configuration where config_key='public_contact_form';
  select config_value into v_assignment from public.system_configuration where config_key='crm_lead_assignment';
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'name',coalesce(nullif(btrim(u.full_name),''),u.email),'email',u.email,
    'role',u.role,'department',coalesce(u.department,'')
  ) order by coalesce(nullif(btrim(u.full_name),''),u.email)),'[]'::jsonb)
  into v_staff from public.user_profiles u
  where public.crm_salesperson_access_ready(u.id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'name',coalesce(nullif(btrim(u.full_name),''),u.email),'email',u.email,'role',u.role
  ) order by coalesce(nullif(btrim(u.full_name),''),u.email)),'[]'::jsonb)
  into v_sales from public.user_profiles u
  where public.crm_salesperson_access_ready(u.id);
  return jsonb_build_object('form',coalesce(v_form,'{}'::jsonb),
    'assignment',coalesce(v_assignment,'{}'::jsonb),'staff',v_staff,'salespeople',v_sales);
end;
$function$;

create or replace function public.crm_assign_lead(p_lead_id uuid,p_salesperson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_lead public.crm_leads%rowtype;
begin
  if not public.crm_can_manage_lead_assignment() then raise exception 'Lead assignment permission required.'; end if;
  if not public.crm_salesperson_access_ready(p_salesperson_id) then
    raise exception 'Choose a salesperson who has completed CRM access setup.';
  end if;
  update public.crm_leads set salesperson_id=p_salesperson_id
  where id=p_lead_id and archived_at is null returning * into v_lead;
  if not found then raise exception 'Lead not found.'; end if;
  update public.sales_chat_conversations set current_sales_id=p_salesperson_id,updated_at=now()
  where crm_lead_id=p_lead_id and status<>'resolved';
  return jsonb_build_object('success',true,'leadId',v_lead.id,'salespersonId',v_lead.salesperson_id,'assignedAt',v_lead.assigned_at);
end;
$function$;

create or replace function public.crm_pick_next_lead_assignee(p_require_auto_mode boolean default true)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_cfg jsonb:='{}'::jsonb; v_ids uuid[]:='{}'::uuid[]; v_last uuid; v_pos integer; v_next uuid;
begin
  select coalesce(config_value,'{}'::jsonb) into v_cfg
  from public.system_configuration where config_key='crm_lead_assignment';
  if p_require_auto_mode and coalesce(v_cfg->>'mode','manual')<>'round_robin' then return null; end if;
  perform pg_advisory_xact_lock(hashtext('profox:crm:lead-round-robin'));
  select last_salesperson_id into v_last from public.crm_lead_assignment_state
  where singleton_key='website' for update;
  select coalesce(array_agg(u.id order by u.created_at,u.id),'{}'::uuid[]) into v_ids
  from public.user_profiles u
  left join public.workforce_capability_profiles cp on cp.user_id=u.id
  where public.crm_salesperson_access_ready(u.id)
    and coalesce(cp.availability_status,'Available')<>'Unavailable'
    and lower(coalesce(cp.certification_state,'active')) not in ('revoked','expired','suspended','failed')
    and (
      jsonb_array_length(coalesce(v_cfg->'eligibleSalespersonIds','[]'::jsonb))=0
      or coalesce(v_cfg->'eligibleSalespersonIds','[]'::jsonb) ? u.id::text
    );
  if coalesce(array_length(v_ids,1),0)=0 then return null; end if;
  v_pos:=array_position(v_ids,v_last);
  if v_pos is null or v_pos>=array_length(v_ids,1) then v_next:=v_ids[1]; else v_next:=v_ids[v_pos+1]; end if;
  update public.crm_lead_assignment_state
  set last_salesperson_id=v_next,cycle_count=cycle_count+1,updated_at=now()
  where singleton_key='website';
  return v_next;
end;
$function$;

create or replace function public.crm_create_manual_lead(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid:=(select auth.uid()); v_owner uuid; v_lead public.crm_leads%rowtype;
  v_title text:=left(btrim(coalesce(p_payload->>'title','')),240);
  v_company text:=left(btrim(coalesce(p_payload->>'companyName','')),240);
  v_country text:=left(btrim(coalesce(p_payload->>'country','')),120);
  v_source text:=left(btrim(coalesce(p_payload->>'source','Manual Entry')),120);
  v_value numeric:=0;
begin
  if v_uid is null or (not public.is_admin() and not public.sales_crm_access_ready()) then
    raise exception 'Active CRM access is required.';
  end if;
  if v_title='' or v_company='' or v_country='' then raise exception 'Lead title, company and country are required.'; end if;
  if v_source='' or v_source='Website Contact Form' then
    raise exception 'Website enquiries must be created by the public contact workflow.';
  end if;
  if coalesce(p_payload->>'estimatedValue','')~'^[0-9]+(\.[0-9]{1,2})?$' then v_value:=(p_payload->>'estimatedValue')::numeric; end if;
  if public.is_admin() then
    begin v_owner:=nullif(p_payload->>'salespersonId','')::uuid; exception when invalid_text_representation then raise exception 'Choose a valid salesperson.'; end;
  else v_owner:=v_uid;
  end if;
  if not public.crm_salesperson_access_ready(v_owner) then
    raise exception 'Choose a salesperson who has completed CRM access setup.';
  end if;
  insert into public.crm_leads(
    title,company_name,contact_name,email,phone,website,country,industry,source,origin_type,
    salesperson_id,service_interest,estimated_value,currency,status,loom_video_url,
    initial_outreach_channel,notes,self_generated,created_by
  ) values (
    v_title,v_company,left(btrim(coalesce(p_payload->>'contactName','')),240),
    left(lower(btrim(coalesce(p_payload->>'email',''))),320),left(btrim(coalesce(p_payload->>'phone','')),80),
    left(btrim(coalesce(p_payload->>'website','')),500),v_country,left(btrim(coalesce(p_payload->>'industry','Other')),120),
    v_source,left(btrim(coalesce(p_payload->>'originType','manual')),30),v_owner,
    left(btrim(coalesce(p_payload->>'serviceInterest','')),240),greatest(0,v_value),
    left(btrim(coalesce(p_payload->>'currency','USD')),10),'New',
    left(btrim(coalesce(p_payload->>'loomVideoUrl','')),500),
    left(btrim(coalesce(p_payload->>'initialOutreachChannel','Email')),80),
    left(btrim(coalesce(p_payload->>'notes','')),10000),true,v_uid
  ) returning * into v_lead;
  return to_jsonb(v_lead);
end;
$function$;

create or replace function public.crm_update_lead(p_lead_id uuid,p_updates jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_lead public.crm_leads%rowtype; v_updated public.crm_leads%rowtype; v_key text; v_status text;
  v_allowed constant text[]:=array[
    'title','companyName','contactName','email','phone','website','country','industry',
    'serviceInterest','estimatedValue','currency','status','loomVideoUrl','initialOutreachChannel','notes'
  ];
begin
  if (select auth.uid()) is null or (not public.is_admin() and not public.sales_crm_access_ready()) then
    raise exception 'Active CRM access is required.';
  end if;
  if jsonb_typeof(coalesce(p_updates,'{}'::jsonb))<>'object' then raise exception 'Lead updates are invalid.'; end if;
  for v_key in select jsonb_object_keys(p_updates) loop
    if not v_key=any(v_allowed) then raise exception 'Protected lead field cannot be changed: %',v_key; end if;
  end loop;
  select * into v_lead from public.crm_leads where id=p_lead_id and archived_at is null for update;
  if not found then raise exception 'Lead not found.'; end if;
  if not public.is_admin() and v_lead.salesperson_id is distinct from (select auth.uid()) then
    raise exception 'You may update only your assigned leads.';
  end if;
  v_status:=case when p_updates ? 'status' then p_updates->>'status' else v_lead.status end;
  if v_status not in ('New','Researching','Contacted','Follow-Up','Interested','Qualified','Not Qualified') then
    raise exception 'Choose a valid lead stage.';
  end if;
  if v_lead.source='Website Contact Form' and v_status='Qualified'
     and (v_lead.accepted_at is null or v_lead.first_response_at is null) then
    raise exception 'Accept and respond to the website enquiry before qualification.';
  end if;
  update public.crm_leads set
    title=case when p_updates ? 'title' then left(btrim(coalesce(p_updates->>'title','')),240) else title end,
    company_name=case when p_updates ? 'companyName' then left(btrim(coalesce(p_updates->>'companyName','')),240) else company_name end,
    contact_name=case when p_updates ? 'contactName' then left(btrim(coalesce(p_updates->>'contactName','')),240) else contact_name end,
    email=case when p_updates ? 'email' then left(lower(btrim(coalesce(p_updates->>'email',''))),320) else email end,
    phone=case when p_updates ? 'phone' then left(btrim(coalesce(p_updates->>'phone','')),80) else phone end,
    website=case when p_updates ? 'website' then left(btrim(coalesce(p_updates->>'website','')),500) else website end,
    country=case when p_updates ? 'country' then left(btrim(coalesce(p_updates->>'country','')),120) else country end,
    industry=case when p_updates ? 'industry' then left(btrim(coalesce(p_updates->>'industry','')),120) else industry end,
    service_interest=case when p_updates ? 'serviceInterest' then left(btrim(coalesce(p_updates->>'serviceInterest','')),240) else service_interest end,
    estimated_value=case when p_updates ? 'estimatedValue' and coalesce(p_updates->>'estimatedValue','')~'^[0-9]+(\.[0-9]{1,2})?$' then greatest(0,(p_updates->>'estimatedValue')::numeric) else estimated_value end,
    currency=case when p_updates ? 'currency' then left(btrim(coalesce(p_updates->>'currency','USD')),10) else currency end,
    status=v_status,
    loom_video_url=case when p_updates ? 'loomVideoUrl' then left(btrim(coalesce(p_updates->>'loomVideoUrl','')),500) else loom_video_url end,
    initial_outreach_channel=case when p_updates ? 'initialOutreachChannel' then left(btrim(coalesce(p_updates->>'initialOutreachChannel','')),80) else initial_outreach_channel end,
    notes=case when p_updates ? 'notes' then left(btrim(coalesce(p_updates->>'notes','')),10000) else notes end,
    updated_at=now()
  where id=p_lead_id returning * into v_updated;
  if btrim(v_updated.title)='' or btrim(v_updated.company_name)='' or btrim(v_updated.country)='' then
    raise exception 'Lead title, company and country cannot be empty.';
  end if;
  return to_jsonb(v_updated);
end;
$function$;

create or replace function public.crm_update_opportunity_details(p_opportunity_id uuid,p_updates jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_opp public.crm_opportunities%rowtype; v_updated public.crm_opportunities%rowtype; v_key text;
  v_allowed constant text[]:=array[
    'name','companyName','contactName','email','phone','website','country','industry',
    'serviceInterest','expectedValue','currency','meetingAt','meetingUrl','requirementsSummary','notes'
  ];
begin
  if (select auth.uid()) is null or (not public.is_admin() and not public.sales_crm_access_ready()) then
    raise exception 'Active CRM access is required.';
  end if;
  if jsonb_typeof(coalesce(p_updates,'{}'::jsonb))<>'object' then raise exception 'Opportunity updates are invalid.'; end if;
  for v_key in select jsonb_object_keys(p_updates) loop
    if not v_key=any(v_allowed) then raise exception 'Protected opportunity field cannot be changed: %',v_key; end if;
  end loop;
  select * into v_opp from public.crm_opportunities
  where id=p_opportunity_id and archived_at is null for update;
  if not found then raise exception 'Opportunity not found.'; end if;
  if not public.is_admin() and v_opp.salesperson_id is distinct from (select auth.uid()) then
    raise exception 'You may update only your assigned opportunities.';
  end if;
  if v_opp.status<>'Open' then raise exception 'Closed opportunities cannot be edited.'; end if;
  update public.crm_opportunities set
    name=case when p_updates ? 'name' then left(btrim(coalesce(p_updates->>'name','')),240) else name end,
    company_name=case when p_updates ? 'companyName' then left(btrim(coalesce(p_updates->>'companyName','')),240) else company_name end,
    contact_name=case when p_updates ? 'contactName' then left(btrim(coalesce(p_updates->>'contactName','')),240) else contact_name end,
    email=case when p_updates ? 'email' then left(lower(btrim(coalesce(p_updates->>'email',''))),320) else email end,
    phone=case when p_updates ? 'phone' then left(btrim(coalesce(p_updates->>'phone','')),80) else phone end,
    website=case when p_updates ? 'website' then left(btrim(coalesce(p_updates->>'website','')),500) else website end,
    country=case when p_updates ? 'country' then left(btrim(coalesce(p_updates->>'country','')),120) else country end,
    industry=case when p_updates ? 'industry' then left(btrim(coalesce(p_updates->>'industry','')),120) else industry end,
    service_interest=case when p_updates ? 'serviceInterest' then left(btrim(coalesce(p_updates->>'serviceInterest','')),240) else service_interest end,
    expected_value=case when p_updates ? 'expectedValue' and coalesce(p_updates->>'expectedValue','')~'^[0-9]+(\.[0-9]{1,2})?$' then greatest(0,(p_updates->>'expectedValue')::numeric) else expected_value end,
    currency=case when p_updates ? 'currency' then left(btrim(coalesce(p_updates->>'currency','USD')),10) else currency end,
    meeting_at=case when p_updates ? 'meetingAt' and nullif(p_updates->>'meetingAt','') is not null then (p_updates->>'meetingAt')::timestamptz when p_updates ? 'meetingAt' then null else meeting_at end,
    meeting_url=case when p_updates ? 'meetingUrl' then left(btrim(coalesce(p_updates->>'meetingUrl','')),500) else meeting_url end,
    requirements_summary=case when p_updates ? 'requirementsSummary' then left(btrim(coalesce(p_updates->>'requirementsSummary','')),10000) else requirements_summary end,
    notes=case when p_updates ? 'notes' then left(btrim(coalesce(p_updates->>'notes','')),10000) else notes end,
    updated_at=now()
  where id=p_opportunity_id returning * into v_updated;
  if btrim(v_updated.name)='' or btrim(v_updated.company_name)='' or btrim(v_updated.country)='' then
    raise exception 'Opportunity name, company and country cannot be empty.';
  end if;
  return to_jsonb(v_updated);
end;
$function$;

-- Direct table mutations could previously forge acceptance/response or bypass conversion.
revoke insert,update,delete on table public.crm_leads from authenticated;
revoke insert,update,delete on table public.crm_opportunities from authenticated;

-- Completing an ordinary activity is not proof that customer communication occurred.
drop trigger if exists trg_crm_mark_quote_first_response_from_activity on public.crm_activities;

create or replace function public.crm_accept_assigned_lead(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_lead public.crm_leads%rowtype; v_uid uuid:=(select auth.uid()); v_accepted timestamptz;
begin
  if v_uid is null or (not public.is_admin() and not public.sales_crm_access_ready()) then
    raise exception 'Active CRM access is required.';
  end if;
  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if not found or v_lead.archived_at is not null then raise exception 'Lead not found.'; end if;
  if v_lead.salesperson_id is null then raise exception 'Assign the lead before accepting it.'; end if;
  if not public.is_admin() and v_lead.salesperson_id is distinct from v_uid then
    raise exception 'You may accept only your assigned lead.';
  end if;
  if v_lead.accepted_at is null then
    v_accepted:=now();
    update public.crm_leads set accepted_at=v_accepted,updated_at=now() where id=p_lead_id;
    perform public.crm_write_lead_event(p_lead_id,'lead_accepted','Assigned lead accepted',
      'The assigned owner accepted responsibility for this lead.',
      jsonb_build_object('acceptedAt',v_accepted,'firstResponseDueAt',v_lead.first_response_due_at),
      v_uid,null,null,v_accepted,'lead-accepted:'||p_lead_id::text||':'||v_lead.salesperson_id::text);
  else v_accepted:=v_lead.accepted_at;
  end if;
  return jsonb_build_object('success',true,'leadId',p_lead_id,'acceptedAt',v_accepted,
    'firstResponseDueAt',v_lead.first_response_due_at);
end;
$function$;

create or replace function public.crm_record_lead_first_response(p_lead_id uuid,p_channel text default 'Other')
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_lead public.crm_leads%rowtype; v_uid uuid:=(select auth.uid()); v_at timestamptz:=now();
  v_channel text:=initcap(lower(btrim(coalesce(p_channel,'Other'))));
begin
  if v_uid is null or (not public.is_admin() and not public.sales_crm_access_ready()) then
    raise exception 'Active CRM access is required.';
  end if;
  if v_channel not in ('Email','Phone','Whatsapp','Video Call','Meeting','Other') then raise exception 'Choose a supported response channel.'; end if;
  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if not found or v_lead.archived_at is not null then raise exception 'Lead not found.'; end if;
  if v_lead.salesperson_id is null then raise exception 'Assign the lead before recording a response.'; end if;
  if not public.is_admin() and v_lead.salesperson_id is distinct from v_uid then raise exception 'You may respond only to your assigned lead.'; end if;
  if v_lead.accepted_at is null then raise exception 'Accept the assigned lead before confirming a response.'; end if;
  update public.crm_leads set
    first_response_at=coalesce(first_response_at,v_at),last_contact_at=v_at,
    first_response_channel=coalesce(first_response_channel,v_channel),
    first_response_evidence_type=coalesce(first_response_evidence_type,'manual_confirmation'),
    first_response_evidence_id=coalesce(first_response_evidence_id,'user:'||v_uid::text||':'||extract(epoch from v_at)::bigint::text),
    status=case when status in ('New','Researching') then 'Contacted' else status end,updated_at=now()
  where id=p_lead_id;
  return jsonb_build_object('success',true,'leadId',p_lead_id,
    'firstResponseAt',coalesce(v_lead.first_response_at,v_at),'channel',v_channel,
    'evidenceType','manual_confirmation');
end;
$function$;

create or replace function public.convert_lead_to_opportunity(
  p_lead_id uuid,p_name text default null,p_expected_value numeric default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_lead public.crm_leads%rowtype; v_existing uuid; v_new uuid;
begin
  if (select auth.uid()) is null or (not public.is_admin() and not public.sales_crm_access_ready()) then
    raise exception 'Active CRM access is required.';
  end if;
  select * into v_lead from public.crm_leads where id=p_lead_id and archived_at is null for update;
  if not found then raise exception 'Lead not found.'; end if;
  if not public.is_admin() and v_lead.salesperson_id is distinct from (select auth.uid()) then
    raise exception 'You may convert only your assigned lead.';
  end if;
  select id into v_existing from public.crm_opportunities where lead_id=p_lead_id limit 1;
  if v_existing is not null then return v_existing; end if;
  if v_lead.status<>'Qualified' then raise exception 'Mark the lead Qualified before conversion.'; end if;
  if v_lead.source='Website Contact Form' and (
    v_lead.accepted_at is null or v_lead.first_response_at is null
    or v_lead.first_response_evidence_type is null
  ) then raise exception 'Accept and record evidence of the website enquiry response before conversion.'; end if;
  insert into public.crm_opportunities(
    lead_id,name,company_name,contact_name,email,phone,website,country,industry,source,self_generated,
    salesperson_id,service_interest,expected_value,currency,stage,status,created_by
  ) values (
    p_lead_id,coalesce(nullif(btrim(p_name),''),v_lead.title),v_lead.company_name,v_lead.contact_name,
    v_lead.email,v_lead.phone,v_lead.website,v_lead.country,v_lead.industry,v_lead.source,v_lead.self_generated,
    v_lead.salesperson_id,v_lead.service_interest,coalesce(p_expected_value,v_lead.estimated_value),
    v_lead.currency,'Qualified','Open',(select auth.uid())
  ) returning id into v_new;
  update public.crm_leads set converted_opportunity_id=v_new,updated_at=now() where id=p_lead_id;
  return v_new;
end;
$function$;

create or replace function public.crm_audit_sales_chat_message()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
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
  if new.sender_type='sales_rep' and not coalesce(new.is_internal_note,false) then
    update public.crm_leads set accepted_at=coalesce(accepted_at,new.created_at),
      first_response_at=coalesce(first_response_at,new.created_at),last_contact_at=new.created_at,
      first_response_channel=coalesce(first_response_channel,'Chat'),
      first_response_evidence_type=coalesce(first_response_evidence_type,'crm_chat_message'),
      first_response_evidence_id=coalesce(first_response_evidence_id,new.id::text),
      status=case when status in ('New','Researching') then 'Contacted' else status end,updated_at=now()
    where id=v_lead and salesperson_id=new.sender_id;
  end if;
  return new;
end;
$function$;

create or replace function public.crm_audit_quote_first_response()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if new.source='Website Contact Form' and old.first_response_at is null and new.first_response_at is not null then
    perform public.crm_write_lead_event(new.id,'first_response','First customer response recorded',
      'The website enquiry received its first customer-facing response.',
      jsonb_build_object('firstResponseAt',new.first_response_at,'firstResponseDueAt',new.first_response_due_at,
        'metSla',case when new.first_response_due_at is null then null else new.first_response_at<=new.first_response_due_at end,
        'channel',new.first_response_channel,'evidenceType',new.first_response_evidence_type,
        'evidenceId',new.first_response_evidence_id),
      new.salesperson_id,null,null,new.first_response_at,'quote-first-response:'||new.id::text);
  end if;
  return new;
end;
$function$;

-- Apply the qualification gate to Admin-created quotations too. Admins retain team
-- visibility, but every new quote must still be anchored to the correct opportunity.
create or replace function public.crm_enforce_quotation_qualification()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_opp public.crm_opportunities%rowtype; v_lead public.crm_leads%rowtype;
begin
  if (select auth.uid()) is null then return new; end if;
  if not public.is_admin() and not public.sales_crm_access_ready() then
    raise exception 'Active CRM access is required.';
  end if;
  if new.opportunity_id is null then raise exception 'A qualified CRM opportunity is required before creating a quotation.'; end if;
  select * into v_opp from public.crm_opportunities where id=new.opportunity_id;
  if not found or v_opp.status<>'Open' or v_opp.stage not in ('Qualified','Meeting Scheduled','Requirements Confirmed','Quotation Sent','Negotiation / Decision Pending','Awaiting Advance Payment') then
    raise exception 'The quotation must belong to an open qualified opportunity.';
  end if;
  if new.salesperson_id is distinct from v_opp.salesperson_id then raise exception 'Quotation ownership must match the opportunity owner.'; end if;
  if not public.is_admin() and v_opp.salesperson_id is distinct from (select auth.uid()) then
    raise exception 'You may create quotations only for your own qualified opportunities.';
  end if;
  if v_opp.lead_id is not null then
    select * into v_lead from public.crm_leads where id=v_opp.lead_id;
    if not found or v_lead.status<>'Qualified' then raise exception 'The originating lead must remain Qualified.'; end if;
    if v_lead.source='Website Contact Form' and (
      v_lead.accepted_at is null or v_lead.first_response_at is null
      or v_lead.first_response_evidence_type is null
    ) then raise exception 'Accept and record evidence of the website enquiry response before creating a quotation.'; end if;
  end if;
  return new;
end;
$function$;

-- Trigger-only and internal/admin SECURITY DEFINER functions must not remain anon RPCs.
-- Preserve only deliberately public, token/input-validated endpoint families.
do $block$
declare v record; v_auth_had_execute boolean;
begin
  for v in
    select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) args,
      pg_get_function_result(p.oid) result_type
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and has_function_privilege('anon',p.oid,'EXECUTE')
      and p.proname !~ '^(book_public|cancel_public|claim_public|get_public|list_public|open_public|public_|reschedule_public|respond_public|submit_public|track_public)'
  loop
    v_auth_had_execute:=has_function_privilege('authenticated',v.oid,'EXECUTE');
    execute format('revoke execute on function public.%I(%s) from public,anon',v.proname,v.args);
    if v.result_type='trigger' then
      execute format('revoke execute on function public.%I(%s) from authenticated',v.proname,v.args);
    elsif v_auth_had_execute then
      execute format('grant execute on function public.%I(%s) to authenticated',v.proname,v.args);
    end if;
  end loop;
end;
$block$;

revoke all on function public.crm_salesperson_access_ready(uuid) from public,anon,authenticated;
revoke all on function public.crm_guard_lead_assignment_configuration() from public,anon,authenticated;
revoke all on function public.crm_create_manual_lead(jsonb) from public,anon,authenticated;
revoke all on function public.crm_update_lead(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.crm_update_opportunity_details(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.crm_record_lead_first_response(uuid,text) from public,anon,authenticated;
grant execute on function public.crm_create_manual_lead(jsonb) to authenticated;
grant execute on function public.crm_update_lead(uuid,jsonb) to authenticated;
grant execute on function public.crm_update_opportunity_details(uuid,jsonb) to authenticated;
grant execute on function public.crm_record_lead_first_response(uuid,text) to authenticated;

revoke all on function public.crm_mark_quote_first_response_from_activity() from public,anon,authenticated;

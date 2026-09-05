-- Complete the Seller lifecycle experience without creating parallel CRM, customer, onboarding, or project records.

create or replace function public.crm_get_seller_customer_lifecycle(
  p_lead_id uuid default null,
  p_project_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_lead public.crm_leads%rowtype;
  v_op public.crm_opportunities%rowtype;
  v_quote public.quotations%rowtype;
  v_payment public.payments%rowtype;
  v_project public.projects%rowtype;
  v_onboarding public.client_onboardings%rowtype;
  v_seller_name text:='';
  v_pm_name text:='';
  v_seller_handoff_status text;
  v_pm_review_status text;
  v_verified boolean:=false;
  v_queue_key text;
  v_stage text;
  v_owner_role text;
  v_owner_name text;
  v_action_label text;
  v_action_url text;
  v_blocker text:='';
  v_handoff_done boolean:=false;
  v_in_production boolean:=false;
  v_completed boolean:=false;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_lead_id is null and p_project_id is null then raise exception 'Lead or project is required.'; end if;

  if p_project_id is not null then
    select * into v_project from public.projects where id=p_project_id;
    if not found then raise exception 'Project not found.'; end if;
    select * into v_op from public.crm_opportunities where id=v_project.source_opportunity_id;
    if v_op.id is not null then select * into v_lead from public.crm_leads where id=v_op.lead_id; end if;
  else
    select * into v_lead from public.crm_leads where id=p_lead_id and archived_at is null;
    if not found then raise exception 'Lead not found.'; end if;
    select * into v_op from public.crm_opportunities where lead_id=v_lead.id and archived_at is null order by created_at desc limit 1;
    if v_op.id is not null then
      select * into v_project from public.projects where source_opportunity_id=v_op.id order by created_at desc limit 1;
    end if;
  end if;

  if v_lead.id is null and p_lead_id is not null then raise exception 'Lead not found.'; end if;
  if v_op.id is null and v_project.id is not null then
    select * into v_op from public.crm_opportunities where id=v_project.source_opportunity_id;
  end if;
  if v_lead.id is null and v_op.id is not null then select * into v_lead from public.crm_leads where id=v_op.lead_id; end if;

  if not public.is_admin()
     and v_uid is distinct from v_lead.salesperson_id
     and v_uid is distinct from v_op.salesperson_id
     and v_uid is distinct from v_project.project_manager_id then
    raise exception 'Sales lifecycle access denied.';
  end if;

  if v_op.id is not null then
    select * into v_quote from public.quotations where opportunity_id=v_op.id order by created_at desc limit 1;
    select * into v_payment from public.payments
      where opportunity_id=v_op.id and status='Verified' and payment_type in ('Advance','Advance Payment','Full Payment')
      order by coalesce(verified_at,paid_at,updated_at) desc limit 1;
    v_verified:=v_payment.id is not null;
  end if;
  if v_project.id is not null then
    select * into v_onboarding from public.client_onboardings where project_id=v_project.id order by created_at desc limit 1;
    select status into v_seller_handoff_status from public.project_tasks where project_id=v_project.id and workflow_key='sales_handover_submission' order by created_at desc limit 1;
    select status into v_pm_review_status from public.project_tasks where project_id=v_project.id and workflow_key='sales_handover_review' order by created_at desc limit 1;
  end if;
  select full_name into v_seller_name from public.user_profiles where id=coalesce(v_op.salesperson_id,v_lead.salesperson_id);
  select full_name into v_pm_name from public.user_profiles where id=v_project.project_manager_id;

  v_handoff_done:=coalesce(v_seller_handoff_status='Done',false);
  v_completed:=v_project.id is not null and (v_project.status='Completed' or v_project.stage='Completed');
  v_in_production:=v_project.id is not null and not v_completed and v_project.stage<>'Sales Handover';

  if v_lead.status='Not Qualified' or v_op.status='Lost' then
    v_queue_key:='archived'; v_stage:='Closed — Not Won';
  elsif v_completed then
    v_queue_key:='closed_customers'; v_stage:='Project Completed';
  elsif v_in_production then
    v_queue_key:='closed_customers'; v_stage:='In Production';
  elsif v_onboarding.status='Completed' and v_handoff_done and v_project.project_manager_id is null then
    v_queue_key:='closed_customers'; v_stage:='Handoff Sent — PM Assignment';
  elsif v_onboarding.status='Completed' and v_handoff_done then
    v_queue_key:='closed_customers'; v_stage:='Project Manager Review';
  elsif v_onboarding.status='Completed' then
    v_queue_key:='ready_for_handoff'; v_stage:='Ready for Handoff';
  elsif v_project.id is not null or v_verified then
    v_queue_key:='onboarding'; v_stage:='Client Onboarding';
  elsif v_quote.status='Accepted' or v_op.stage='Awaiting Advance Payment' then
    v_queue_key:='awaiting_payment'; v_stage:='Awaiting Payment';
  elsif v_op.id is not null then
    v_queue_key:='deals_quotations'; v_stage:='Deal & Quotation';
  else
    v_queue_key:='active_leads'; v_stage:='Active Lead';
  end if;

  if v_queue_key in ('active_leads','deals_quotations','awaiting_payment','onboarding','ready_for_handoff') then
    v_owner_role:='Sales'; v_owner_name:=coalesce(v_seller_name,'');
  elsif v_project.project_manager_id is not null then
    v_owner_role:='Project Management'; v_owner_name:=coalesce(v_pm_name,'');
  else
    v_owner_role:='Management'; v_owner_name:='';
  end if;

  case v_queue_key
    when 'active_leads' then v_action_label:='Continue lead qualification'; v_action_url:='/admin/app/crm?tab=leads&lead='||v_lead.id::text;
    when 'deals_quotations' then v_action_label:='Move the deal forward'; v_action_url:='/admin/app/crm?tab=leads&lead='||v_lead.id::text;
    when 'awaiting_payment' then v_action_label:='Follow up on payment'; v_action_url:='/admin/app/sales?tab=payments';
    when 'onboarding' then v_action_label:='View Onboarding'; v_action_url:='/admin/app/crm?tab=leads&lead='||v_lead.id::text;
    when 'ready_for_handoff' then v_action_label:='Review & send client brief to PM'; v_action_url:='/admin/project-handover/'||v_project.id::text;
    else v_action_label:='View customer'; v_action_url:='/admin/app/crm?tab=leads&lead='||v_lead.id::text;
  end case;

  if v_queue_key='onboarding' and v_onboarding.status is not null then
    v_blocker:='Waiting for client onboarding: '||v_onboarding.status;
  elsif v_queue_key='ready_for_handoff' and v_project.project_manager_id is null then
    v_blocker:='Project Manager not assigned';
  elsif v_handoff_done and v_project.project_manager_id is null and not v_completed then
    v_blocker:='Project Manager not assigned';
  end if;

  return jsonb_build_object(
    'leadId',v_lead.id,
    'companyName',coalesce(nullif(v_lead.company_name,''),nullif(v_lead.contact_name,''),'Customer'),
    'opportunityId',v_op.id,
    'quotationId',v_quote.id,
    'quotationNumber',v_quote.quotation_number,
    'paymentReference',v_payment.payment_reference,
    'projectId',v_project.id,
    'projectNumber',v_project.project_number,
    'projectName',v_project.project_name,
    'onboardingId',v_onboarding.id,
    'lifecycleStage',v_stage,
    'queueKey',v_queue_key,
    'projectStage',coalesce(v_project.stage,''),
    'currentOwnerRole',v_owner_role,
    'currentOwnerName',v_owner_name,
    'nextActionLabel',v_action_label,
    'actionUrl',v_action_url,
    'blocker',v_blocker,
    'milestones',jsonb_build_object(
      'lead',v_lead.id is not null,
      'quotation',v_quote.id is not null,
      'payment',v_verified,
      'onboarding',v_onboarding.status='Completed' and v_onboarding.completed_at is not null,
      'handoff',v_handoff_done,
      'production',v_in_production or v_completed,
      'completed',v_completed
    ),
    'raw',jsonb_build_object(
      'leadStatus',v_lead.status,
      'opportunityStatus',v_op.status,
      'opportunityStage',v_op.stage,
      'quotationStatus',v_quote.status,
      'paymentStatus',v_payment.status,
      'onboardingStatus',v_onboarding.status,
      'projectStage',v_project.stage,
      'sellerHandoffStatus',v_seller_handoff_status,
      'pmReviewStatus',v_pm_review_status
    )
  );
end;
$function$;

revoke all on function public.crm_get_seller_customer_lifecycle(uuid,uuid) from public,anon;
grant execute on function public.crm_get_seller_customer_lifecycle(uuid,uuid) to authenticated,service_role;

create or replace function public.crm_get_seller_closed_customers(
  p_salesperson_id uuid default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_target uuid;
  v_team boolean:=false;
  v_limit integer:=least(greatest(coalesce(p_limit,25),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_search text:=lower(btrim(coalesce(p_search,'')));
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if public.is_admin() then
    v_target:=p_salesperson_id;
    v_team:=p_salesperson_id is null;
  else
    if not exists(select 1 from public.user_profiles where id=v_uid and status='active' and role in ('sales','sales_rep','sales_team')) then
      raise exception 'Sales lifecycle access denied.';
    end if;
    if p_salesperson_id is not null and p_salesperson_id<>v_uid then raise exception 'Sales lifecycle access denied.'; end if;
    v_target:=v_uid;
  end if;

  with snapshots as (
    select l.id lead_id,l.company_name,l.contact_name,l.title lead_title,l.salesperson_id,
      seller.full_name seller_name,
      op.id opportunity_id,
      q.id quotation_id,q.quotation_number,
      p.id project_id,p.project_number,p.project_name,p.status project_status,p.stage project_stage,p.project_manager_id,
      pm.full_name pm_name,
      o.status onboarding_status,
      sh.status seller_handoff_status,
      greatest(coalesce(p.updated_at,'epoch'::timestamptz),coalesce(o.updated_at,'epoch'::timestamptz),coalesce(q.updated_at,'epoch'::timestamptz),coalesce(op.updated_at,'epoch'::timestamptz),l.updated_at) activity_at
    from public.crm_leads l
    left join lateral (select x.* from public.crm_opportunities x where x.lead_id=l.id and x.archived_at is null order by x.created_at desc limit 1) op on true
    left join lateral (select x.* from public.quotations x where x.opportunity_id=op.id order by x.created_at desc limit 1) q on true
    left join lateral (select x.* from public.projects x where x.source_opportunity_id=op.id order by x.created_at desc limit 1) p on true
    left join lateral (select x.* from public.client_onboardings x where x.project_id=p.id order by x.created_at desc limit 1) o on true
    left join lateral (select x.status from public.project_tasks x where x.project_id=p.id and x.workflow_key='sales_handover_submission' order by x.created_at desc limit 1) sh on true
    left join public.user_profiles seller on seller.id=l.salesperson_id
    left join public.user_profiles pm on pm.id=p.project_manager_id
    where l.archived_at is null and (v_target is null or l.salesperson_id=v_target)
  ), closed as (
    select s.*,
      case
        when s.project_id is not null and (s.project_status='Completed' or s.project_stage='Completed') then 'Project Completed'
        when s.project_id is not null and s.project_stage<>'Sales Handover' then 'In Production'
        when s.onboarding_status='Completed' and s.seller_handoff_status='Done' and s.project_manager_id is null then 'Handoff Sent — PM Assignment'
        when s.onboarding_status='Completed' and s.seller_handoff_status='Done' then 'Project Manager Review'
        else null end lifecycle_stage
    from snapshots s
  ), filtered as (
    select * from closed c
    where c.lifecycle_stage is not null
      and (v_search='' or lower(concat_ws(' ',c.company_name,c.contact_name,c.lead_title,c.quotation_number,c.project_number,c.project_name,c.seller_name,c.pm_name)) like '%'||v_search||'%')
  ), counted as (
    select count(*) over() total_count,f.* from filtered f
  ), page as (
    select * from counted order by activity_at desc limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'scope',case when v_team then 'team' else 'individual' end,
    'salespersonId',v_target,
    'search',coalesce(p_search,''),
    'limit',v_limit,
    'offset',v_offset,
    'total',coalesce((select max(total_count) from counted),0),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'leadId',lead_id,
      'companyName',coalesce(nullif(company_name,''),nullif(contact_name,''),'Customer'),
      'projectId',project_id,
      'projectNumber',project_number,
      'projectName',project_name,
      'quotationId',quotation_id,
      'quotationNumber',quotation_number,
      'lifecycleStage',lifecycle_stage,
      'currentOwnerName',coalesce(pm_name,seller_name,''),
      'actionUrl','/admin/app/crm?tab=leads&lead='||lead_id::text,
      'updatedAt',activity_at
    ) order by activity_at desc) from page),'[]'::jsonb)
  ) into v_result;

  return coalesce(v_result,jsonb_build_object('scope',case when v_team then 'team' else 'individual' end,'salespersonId',v_target,'search',coalesce(p_search,''),'limit',v_limit,'offset',v_offset,'total',0,'items','[]'::jsonb));
end;
$function$;

revoke all on function public.crm_get_seller_closed_customers(uuid,text,integer,integer) from public,anon;
grant execute on function public.crm_get_seller_closed_customers(uuid,text,integer,integer) to authenticated,service_role;

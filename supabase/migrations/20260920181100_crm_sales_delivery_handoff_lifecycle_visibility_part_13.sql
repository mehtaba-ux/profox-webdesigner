-- PROFOX SALES SOP PART 13
-- Keep the existing Seller lifecycle queue connected to the canonical Part 13 handoff state.
-- Submitted/Returned handoffs remain visible until Delivery accepts them.

create or replace function public.crm_get_seller_lifecycle_queue(p_salesperson_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $part13$
declare
  v_uid uuid:=auth.uid();
  v_target uuid;
  v_team boolean:=false;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if public.is_admin() then
    v_target:=p_salesperson_id;
    v_team:=p_salesperson_id is null;
  else
    if not exists(select 1 from public.user_profiles u where u.id=v_uid and u.status='active' and u.role in ('sales','sales_rep','sales_team')) then
      raise exception 'Sales lifecycle access denied.';
    end if;
    if p_salesperson_id is not null and p_salesperson_id<>v_uid then raise exception 'Sales lifecycle access denied.'; end if;
    v_target:=v_uid;
  end if;

  with scoped_leads as (
    select l.* from public.crm_leads l
    where l.archived_at is null and (v_target is null or l.salesperson_id=v_target)
  ), snapshots as (
    select
      l.id lead_id,l.title lead_title,l.company_name,l.contact_name,l.status lead_status,l.updated_at lead_updated,l.salesperson_id,
      seller.full_name seller_name,
      op.id opportunity_id,op.status opportunity_status,op.stage opportunity_stage,op.updated_at opportunity_updated,
      q.id quotation_id,q.quotation_number,q.status quotation_status,q.updated_at quotation_updated,
      coalesce(pay.verified_first_payment,false) verified_first_payment,lp.payment_reference,lp.status latest_payment_status,lp.updated_at payment_updated,
      p.id project_id,p.project_number,p.project_name,p.status project_status,p.stage project_stage,p.project_manager_id,p.updated_at project_updated,
      pm.full_name pm_name,
      o.id onboarding_id,o.status onboarding_status,o.completed_at onboarding_completed_at,o.updated_at onboarding_updated,
      sh.status seller_handoff_task_status,pr.status pm_review_status,
      ha.status handoff_status,ha.attempt_number handoff_attempt,ha.reviewed_at handoff_reviewed_at
    from scoped_leads l
    left join lateral (
      select x.* from public.crm_opportunities x where x.lead_id=l.id and x.archived_at is null order by x.created_at desc limit 1
    ) op on true
    left join lateral (
      select x.* from public.quotations x where x.opportunity_id=op.id order by x.created_at desc limit 1
    ) q on true
    left join lateral (
      select bool_or(x.status='Verified' and x.payment_type in ('Advance','Advance Payment','Full Payment')) verified_first_payment
      from public.payments x where x.opportunity_id=op.id
    ) pay on true
    left join lateral (
      select x.* from public.payments x where x.opportunity_id=op.id order by x.created_at desc limit 1
    ) lp on true
    left join lateral (
      select x.* from public.projects x where x.source_opportunity_id=op.id order by x.created_at desc limit 1
    ) p on true
    left join lateral (
      select x.* from public.client_onboardings x where x.project_id=p.id order by x.created_at desc limit 1
    ) o on true
    left join lateral (
      select x.status from public.project_tasks x where x.project_id=p.id and x.workflow_key='sales_handover_submission' order by x.created_at desc limit 1
    ) sh on true
    left join lateral (
      select x.status from public.project_tasks x where x.project_id=p.id and x.workflow_key='sales_handover_review' order by x.created_at desc limit 1
    ) pr on true
    left join lateral (
      select x.status,x.attempt_number,x.reviewed_at
      from public.project_sales_handover_attempts x
      where x.project_id=p.id
      order by x.attempt_number desc
      limit 1
    ) ha on true
    left join public.user_profiles seller on seller.id=l.salesperson_id
    left join public.user_profiles pm on pm.id=p.project_manager_id
  ), classified as (
    select s.*,
      case
        when s.lead_status='Not Qualified' or s.opportunity_status='Lost' then 'archived'
        when s.project_id is not null and (s.project_status='Completed' or s.project_stage='Completed') then 'closed_customers'
        when s.project_id is not null and s.project_stage<>'Sales Handover' then 'closed_customers'
        when s.handoff_status='ACCEPTED' then 'closed_customers'
        when s.onboarding_status='Completed' then 'ready_for_handoff'
        when s.project_id is not null or s.verified_first_payment then 'onboarding'
        when s.quotation_status='Accepted' or s.opportunity_stage='Awaiting Advance Payment' then 'awaiting_payment'
        when s.opportunity_id is not null then 'deals_quotations'
        else 'active_leads' end as queue_key,
      case
        when s.project_id is not null and (s.project_status='Completed' or s.project_stage='Completed') then 'Project Completed'
        when s.project_id is not null and s.project_stage<>'Sales Handover' then 'In Production'
        when s.handoff_status='ACCEPTED' then 'Handoff Accepted'
        when s.handoff_status='RETURNED_TO_SALES' then 'Returned to Sales'
        when s.handoff_status in ('SUBMITTED','RESUBMITTED') and s.project_manager_id is null then 'Submitted — PM Assignment'
        when s.handoff_status in ('SUBMITTED','RESUBMITTED') then 'Delivery Review'
        when s.onboarding_status='Completed' then 'Ready for Handoff'
        when s.project_id is not null or s.verified_first_payment then 'Client Onboarding'
        when s.quotation_status='Accepted' or s.opportunity_stage='Awaiting Advance Payment' then 'Awaiting Payment'
        when s.opportunity_id is not null then 'Deal & Quotation'
        else 'Active Lead' end as lifecycle_stage
    from snapshots s
  ), actioned as (
    select c.*,
      case
        when c.handoff_status='RETURNED_TO_SALES' then 'Resolve returned handoff'
        when c.handoff_status in ('SUBMITTED','RESUBMITTED') then 'View Delivery review'
        when c.queue_key='active_leads' then 'Continue lead qualification'
        when c.queue_key='deals_quotations' then 'Move the deal forward'
        when c.queue_key='awaiting_payment' then 'Follow up on payment'
        when c.queue_key='onboarding' then 'Keep client onboarding moving'
        when c.queue_key='ready_for_handoff' then 'Review & send client brief to Delivery'
        else 'View customer' end as next_action_label,
      case
        when c.queue_key='active_leads' then '/admin/app/crm?tab=leads&lead='||c.lead_id::text
        when c.queue_key='deals_quotations' then '/admin/app/crm?tab=pipeline'
        when c.queue_key='awaiting_payment' then '/admin/app/sales?tab=payments'
        when c.queue_key='onboarding' then '/admin/app/crm?tab=inbox&lead='||c.lead_id::text
        when c.queue_key='ready_for_handoff' then '/admin/project-handover/'||c.project_id::text
        else '/admin/app/sales?tab=clients' end as action_url,
      case
        when c.handoff_status='RETURNED_TO_SALES' then 'Delivery returned this handoff. Sales owns the correction until it is resubmitted and accepted.'
        when c.handoff_status in ('SUBMITTED','RESUBMITTED') and c.project_manager_id is null then 'Project Manager not assigned'
        when c.handoff_status in ('SUBMITTED','RESUBMITTED') then 'Waiting for Delivery / Project Management review'
        when c.queue_key='onboarding' and c.onboarding_status is not null then 'Waiting for client onboarding: '||c.onboarding_status
        else '' end as blocker,
      greatest(
        coalesce(c.handoff_reviewed_at,'epoch'::timestamptz),
        coalesce(c.project_updated,'epoch'::timestamptz),
        coalesce(c.onboarding_updated,'epoch'::timestamptz),
        coalesce(c.payment_updated,'epoch'::timestamptz),
        coalesce(c.quotation_updated,'epoch'::timestamptz),
        coalesce(c.opportunity_updated,'epoch'::timestamptz),
        c.lead_updated
      ) as activity_at
    from classified c
  )
  select jsonb_build_object(
    'scope',case when v_team then 'team' else 'individual' end,
    'salespersonId',v_target,
    'counts',jsonb_build_object(
      'activeLeads',count(*) filter(where queue_key='active_leads'),
      'dealsQuotations',count(*) filter(where queue_key='deals_quotations'),
      'awaitingPayment',count(*) filter(where queue_key='awaiting_payment'),
      'onboarding',count(*) filter(where queue_key='onboarding'),
      'readyForHandoff',count(*) filter(where queue_key='ready_for_handoff'),
      'closedCustomers',count(*) filter(where queue_key='closed_customers')
    ),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'leadId',a.lead_id,
      'companyName',coalesce(nullif(a.company_name,''),nullif(a.contact_name,''),'Customer'),
      'leadTitle',a.lead_title,
      'salespersonId',a.salesperson_id,
      'sellerName',coalesce(a.seller_name,''),
      'opportunityId',a.opportunity_id,
      'quotationId',a.quotation_id,
      'quotationNumber',a.quotation_number,
      'paymentReference',a.payment_reference,
      'projectId',a.project_id,
      'projectNumber',a.project_number,
      'projectName',a.project_name,
      'onboardingId',a.onboarding_id,
      'lifecycleStage',a.lifecycle_stage,
      'queueKey',a.queue_key,
      'nextActionLabel',a.next_action_label,
      'actionUrl',a.action_url,
      'blocker',a.blocker,
      'handoffStatus',coalesce(a.handoff_status,'NOT_SUBMITTED'),
      'handoffAttempt',a.handoff_attempt,
      'currentOwnerRole',case
        when a.handoff_status in ('SUBMITTED','RESUBMITTED') and a.project_manager_id is not null then 'Project Management'
        when a.queue_key in ('active_leads','deals_quotations','awaiting_payment','onboarding','ready_for_handoff') then 'Sales'
        else case when a.project_manager_id is not null then 'Project Management' else 'Management' end end,
      'currentOwnerName',case
        when a.handoff_status in ('SUBMITTED','RESUBMITTED') and a.project_manager_id is not null then coalesce(a.pm_name,'')
        when a.queue_key in ('active_leads','deals_quotations','awaiting_payment','onboarding','ready_for_handoff') then coalesce(a.seller_name,'')
        else coalesce(a.pm_name,'') end,
      'raw',jsonb_build_object(
        'leadStatus',a.lead_status,
        'opportunityStatus',a.opportunity_status,
        'opportunityStage',a.opportunity_stage,
        'quotationStatus',a.quotation_status,
        'paymentStatus',a.latest_payment_status,
        'onboardingStatus',a.onboarding_status,
        'projectStage',a.project_stage,
        'sellerHandoffTaskStatus',a.seller_handoff_task_status,
        'pmReviewStatus',a.pm_review_status,
        'handoffStatus',a.handoff_status,
        'handoffAttempt',a.handoff_attempt
      ),
      'updatedAt',a.activity_at
    ) order by case a.queue_key when 'ready_for_handoff' then 1 when 'onboarding' then 2 when 'awaiting_payment' then 3 when 'deals_quotations' then 4 else 5 end,a.activity_at asc)
      from actioned a where a.queue_key not in ('archived','closed_customers')),'[]'::jsonb),
    'recentClosed',coalesce((select jsonb_agg(x.obj order by x.activity_at desc) from (
      select jsonb_build_object(
        'leadId',a.lead_id,
        'companyName',coalesce(nullif(a.company_name,''),nullif(a.contact_name,''),'Customer'),
        'projectId',a.project_id,
        'projectNumber',a.project_number,
        'projectName',a.project_name,
        'lifecycleStage',a.lifecycle_stage,
        'currentOwnerName',coalesce(a.pm_name,a.seller_name,''),
        'actionUrl','/admin/project-handover/'||a.project_id::text,
        'updatedAt',a.activity_at
      ) obj,a.activity_at
      from actioned a where a.queue_key='closed_customers'
      order by a.activity_at desc limit 20
    ) x),'[]'::jsonb)
  ) into v_result
  from actioned;

  return coalesce(v_result,jsonb_build_object(
    'scope',case when v_team then 'team' else 'individual' end,
    'salespersonId',v_target,
    'counts',jsonb_build_object('activeLeads',0,'dealsQuotations',0,'awaitingPayment',0,'onboarding',0,'readyForHandoff',0,'closedCustomers',0),
    'items','[]'::jsonb,
    'recentClosed','[]'::jsonb
  ));
end;
$part13$;

revoke all on function public.crm_get_seller_lifecycle_queue(uuid) from public,anon;
grant execute on function public.crm_get_seller_lifecycle_queue(uuid) to authenticated,service_role;

create or replace function public.crm_get_seller_customer_lifecycle(p_lead_id uuid default null,p_project_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $part13$
declare
  v_uid uuid:=auth.uid();
  v_lead public.crm_leads%rowtype;
  v_op public.crm_opportunities%rowtype;
  v_quote public.quotations%rowtype;
  v_payment public.payments%rowtype;
  v_project public.projects%rowtype;
  v_onboarding public.client_onboardings%rowtype;
  v_handoff public.project_sales_handover_attempts%rowtype;
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
    select * into v_handoff from public.project_sales_handover_attempts where project_id=v_project.id order by attempt_number desc limit 1;
  end if;

  select full_name into v_seller_name from public.user_profiles where id=coalesce(v_op.salesperson_id,v_lead.salesperson_id);
  select full_name into v_pm_name from public.user_profiles where id=v_project.project_manager_id;

  v_completed:=v_project.id is not null and (v_project.status='Completed' or v_project.stage='Completed');
  v_in_production:=v_project.id is not null and not v_completed and v_project.stage<>'Sales Handover';

  if v_lead.status='Not Qualified' or v_op.status='Lost' then
    v_queue_key:='archived'; v_stage:='Closed — Not Won';
  elsif v_completed then
    v_queue_key:='closed_customers'; v_stage:='Project Completed';
  elsif v_in_production then
    v_queue_key:='closed_customers'; v_stage:='In Production';
  elsif v_handoff.status='ACCEPTED' then
    v_queue_key:='closed_customers'; v_stage:='Handoff Accepted';
  elsif v_handoff.status='RETURNED_TO_SALES' then
    v_queue_key:='ready_for_handoff'; v_stage:='Returned to Sales';
  elsif v_handoff.status in ('SUBMITTED','RESUBMITTED') and v_project.project_manager_id is null then
    v_queue_key:='ready_for_handoff'; v_stage:='Submitted — PM Assignment';
  elsif v_handoff.status in ('SUBMITTED','RESUBMITTED') then
    v_queue_key:='ready_for_handoff'; v_stage:='Delivery Review';
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

  if v_handoff.status in ('SUBMITTED','RESUBMITTED') and v_project.project_manager_id is not null then
    v_owner_role:='Project Management'; v_owner_name:=coalesce(v_pm_name,'');
  elsif v_queue_key in ('active_leads','deals_quotations','awaiting_payment','onboarding','ready_for_handoff') then
    v_owner_role:='Sales'; v_owner_name:=coalesce(v_seller_name,'');
  elsif v_project.project_manager_id is not null then
    v_owner_role:='Project Management'; v_owner_name:=coalesce(v_pm_name,'');
  else
    v_owner_role:='Management'; v_owner_name:='';
  end if;

  if v_handoff.status='RETURNED_TO_SALES' then
    v_action_label:='Resolve returned handoff'; v_action_url:='/admin/project-handover/'||v_project.id::text;
    v_blocker:='Delivery returned this handoff. Sales owns correction and resubmission.';
  elsif v_handoff.status in ('SUBMITTED','RESUBMITTED') then
    v_action_label:='View Delivery review'; v_action_url:='/admin/project-handover/'||v_project.id::text;
    v_blocker:=case when v_project.project_manager_id is null then 'Project Manager not assigned' else 'Waiting for Delivery / Project Management review' end;
  else
    case v_queue_key
      when 'active_leads' then v_action_label:='Continue lead qualification'; v_action_url:='/admin/app/crm?tab=leads&lead='||v_lead.id::text;
      when 'deals_quotations' then v_action_label:='Move the deal forward'; v_action_url:='/admin/app/crm?tab=leads&lead='||v_lead.id::text;
      when 'awaiting_payment' then v_action_label:='Follow up on payment'; v_action_url:='/admin/app/sales?tab=payments';
      when 'onboarding' then v_action_label:='View Onboarding'; v_action_url:='/admin/app/crm?tab=leads&lead='||v_lead.id::text;
      when 'ready_for_handoff' then v_action_label:='Review & send client brief to Delivery'; v_action_url:='/admin/project-handover/'||v_project.id::text;
      else v_action_label:='View customer'; v_action_url:='/admin/app/crm?tab=leads&lead='||v_lead.id::text;
    end case;
    if v_queue_key='onboarding' and v_onboarding.status is not null then v_blocker:='Waiting for client onboarding: '||v_onboarding.status; end if;
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
      'handoff',v_handoff.status='ACCEPTED',
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
      'pmReviewStatus',v_pm_review_status,
      'handoffStatus',coalesce(v_handoff.status,'NOT_SUBMITTED'),
      'handoffAttempt',v_handoff.attempt_number
    )
  );
end;
$part13$;

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
as $part13$
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
      ha.status handoff_status,
      greatest(coalesce(ha.reviewed_at,'epoch'::timestamptz),coalesce(p.updated_at,'epoch'::timestamptz),coalesce(q.updated_at,'epoch'::timestamptz),coalesce(op.updated_at,'epoch'::timestamptz),l.updated_at) activity_at
    from public.crm_leads l
    left join lateral (select x.* from public.crm_opportunities x where x.lead_id=l.id and x.archived_at is null order by x.created_at desc limit 1) op on true
    left join lateral (select x.* from public.quotations x where x.opportunity_id=op.id order by x.created_at desc limit 1) q on true
    left join lateral (select x.* from public.projects x where x.source_opportunity_id=op.id order by x.created_at desc limit 1) p on true
    left join lateral (select x.status,x.reviewed_at from public.project_sales_handover_attempts x where x.project_id=p.id order by x.attempt_number desc limit 1) ha on true
    left join public.user_profiles seller on seller.id=l.salesperson_id
    left join public.user_profiles pm on pm.id=p.project_manager_id
    where l.archived_at is null and (v_target is null or l.salesperson_id=v_target)
  ), closed as (
    select s.*,
      case
        when s.project_id is not null and (s.project_status='Completed' or s.project_stage='Completed') then 'Project Completed'
        when s.project_id is not null and s.project_stage<>'Sales Handover' then 'In Production'
        when s.handoff_status='ACCEPTED' then 'Handoff Accepted'
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
      'actionUrl',case when project_id is not null then '/admin/project-handover/'||project_id::text else '/admin/app/crm?tab=leads&lead='||lead_id::text end,
      'updatedAt',activity_at
    ) order by activity_at desc) from page),'[]'::jsonb)
  ) into v_result;

  return coalesce(v_result,jsonb_build_object(
    'scope',case when v_team then 'team' else 'individual' end,
    'salespersonId',v_target,'search',coalesce(p_search,''),'limit',v_limit,'offset',v_offset,'total',0,'items','[]'::jsonb
  ));
end;
$part13$;

revoke all on function public.crm_get_seller_closed_customers(uuid,text,integer,integer) from public,anon;
grant execute on function public.crm_get_seller_closed_customers(uuid,text,integer,integer) to authenticated,service_role;

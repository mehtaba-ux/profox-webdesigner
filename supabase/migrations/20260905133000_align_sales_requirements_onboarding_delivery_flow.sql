-- Canonical Sales -> Client Onboarding -> Delivery flow alignment.
-- Sales owns requirements before quotation/payment. Client onboarding is a lifecycle
-- milestone after verified payment. Delivery begins with Sales Handover, then Content.

create or replace function public.crm_enforce_quotation_qualification()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_opp public.crm_opportunities%rowtype;
  v_lead public.crm_leads%rowtype;
begin
  if (select auth.uid()) is null then return new; end if;
  if not public.is_admin() and not public.sales_crm_access_ready() then
    raise exception 'Active CRM access is required.';
  end if;
  if new.opportunity_id is null then
    raise exception 'A qualified CRM opportunity is required before creating a quotation.';
  end if;

  select * into v_opp from public.crm_opportunities where id=new.opportunity_id;
  if not found or v_opp.status<>'Open' or v_opp.stage not in (
    'Requirements Confirmed',
    'Quotation Sent',
    'Negotiation / Decision Pending',
    'Awaiting Advance Payment'
  ) then
    raise exception 'Seller requirements must be confirmed before creating a quotation.';
  end if;
  if nullif(btrim(coalesce(v_opp.requirements_summary,'')),'') is null then
    raise exception 'Record the customer requirements before creating a quotation.';
  end if;
  if new.salesperson_id is distinct from v_opp.salesperson_id then
    raise exception 'Quotation ownership must match the opportunity owner.';
  end if;
  if not public.is_admin() and v_opp.salesperson_id is distinct from (select auth.uid()) then
    raise exception 'You may create quotations only for your own qualified opportunities.';
  end if;

  if v_opp.lead_id is not null then
    select * into v_lead from public.crm_leads where id=v_opp.lead_id;
    if not found or v_lead.status<>'Qualified' then
      raise exception 'The originating lead must remain Qualified.';
    end if;
    if v_lead.source='Website Contact Form' and (
      v_lead.accepted_at is null or v_lead.first_response_at is null
      or v_lead.first_response_evidence_type is null
    ) then
      raise exception 'Accept and record evidence of the website enquiry response before creating a quotation.';
    end if;
  end if;
  return new;
end;
$function$;

-- Client Onboarding and Requirements are lifecycle/pre-sale milestones, not active
-- production stages. Keep their templates for audit history but do not seed them.
update public.delivery_task_templates
set active=false,
    updated_at=now()
where stage_key in ('Client Onboarding','Requirements')
  and active=true;

update public.delivery_task_templates
set title='Review Client Brief & Start Content',
    description='Project Management reviews the confirmed Sales requirements, completed client onboarding, accepted quotation, verified payment, scope and Seller exceptions. Mark this review Done, then advance the project directly to Content.',
    updated_at=now()
where workflow_key='sales_handover_review';

update public.project_tasks
set title='Review Client Brief & Start Content',
    description='Review the confirmed Sales requirements, completed client onboarding, accepted quotation, verified payment, scope and Seller exceptions. When the protected handoff is complete, production starts with Content.',
    updated_at=now()
where workflow_key='sales_handover_review'
  and status<>'Done';

create or replace function public.protect_project_stage_workflow()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_expected text;
  v_incomplete integer:=0;
  v_client_decision boolean:=coalesce(current_setting('profox.project_client_decision_rpc',true),'')='1';
  v_content_handoff boolean:=coalesce(current_setting('profox.content_handoff_rpc',true),'')='1';
begin
  if new.stage is not distinct from old.stage then return new; end if;
  if old.status<>'Active' then raise exception 'Only an active project may change delivery stage.'; end if;

  if v_content_handoff then
    if old.stage<>'Content' or new.stage<>'UI/UX Design' then
      raise exception 'Invalid protected Content handoff transition.';
    end if;
    select count(*) into v_incomplete
    from public.project_tasks t
    where t.project_id=old.id
      and t.workflow_stage='Content'
      and t.required_for_stage is true
      and t.status<>'Done';
    if v_incomplete>0 then
      raise exception 'Complete all required Content workflow tasks before advancing the project. Remaining: %.',v_incomplete;
    end if;
    return new;
  end if;

  if v_client_decision then
    if old.stage='Client Design Approval' and new.stage in ('Development','UI/UX Design') then return new; end if;
    if old.stage='Client Review' and new.stage='Final Revisions' then return new; end if;
    raise exception 'Invalid client-controlled project transition.';
  end if;

  if not public.is_admin() and old.project_manager_id is distinct from auth.uid() then
    raise exception 'Only the assigned Project Manager or Administrator may advance the project.';
  end if;
  if old.stage in ('Client Design Approval','Client Review') then
    raise exception 'This stage requires a recorded client decision before delivery can continue.';
  end if;

  if old.stage='Sales Handover' then
    if new.stage<>'Content' then
      raise exception 'After Sales Handover, production starts with Content.';
    end if;
    if old.project_manager_id is null then
      raise exception 'Assign an active Project Manager before completing the Sales handoff.';
    end if;
    if nullif(btrim(coalesce(old.requirements_summary,'')),'') is null then
      raise exception 'Confirmed Sales requirements are required before Content can begin.';
    end if;
    if length(btrim(coalesce(old.sales_handover_notes,'')))<10 then
      raise exception 'Send the final Sales handoff before Content begins.';
    end if;
    if not exists(
      select 1 from public.client_onboardings o
      where o.project_id=old.id and o.status='Completed' and o.completed_at is not null
    ) then
      raise exception 'Client onboarding must be completed before Content begins.';
    end if;
  elsif old.stage in ('Client Onboarding','Requirements') then
    -- Legacy compatibility only. These stages are no longer part of the active
    -- production sequence and should never be created for a new project.
    if not public.is_admin() or new.stage<>'Sales Handover' then
      raise exception 'Client Onboarding and Requirements are pre-production milestones. Normalize this legacy project to Sales Handover before delivery.';
    end if;
  else
    v_expected:=case old.stage
      when 'Content' then 'UI/UX Design'
      when 'UI/UX Design' then 'Client Design Approval'
      when 'Development' then 'QA'
      when 'QA' then 'Client Review'
      when 'Final Revisions' then 'Launch'
      when 'Launch' then 'Handover'
      when 'Handover' then 'Completed'
      else null
    end;
    if v_expected is null or new.stage<>v_expected then
      raise exception 'Project stages must follow the approved delivery sequence. Expected next stage: %.',coalesce(v_expected,'none');
    end if;
  end if;

  select count(*) into v_incomplete
  from public.project_tasks t
  where t.project_id=old.id
    and t.workflow_stage=old.stage
    and t.required_for_stage is true
    and t.status<>'Done';
  if v_incomplete>0 then
    raise exception 'Complete all required % workflow tasks before advancing the project. Remaining: %.',old.stage,v_incomplete;
  end if;

  if new.stage='Completed' then
    new.status:='Completed';
    new.completed_at:=coalesce(new.completed_at,now());
  end if;
  return new;
end;
$function$;

create or replace function public.project_get_sales_handoff_brief(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_project public.projects%rowtype;
  v_quote public.quotations%rowtype;
  v_onboarding public.client_onboardings%rowtype;
  v_payment public.payments%rowtype;
  v_salesperson uuid;
  v_pm_name text;
  v_seller_done boolean:=false;
  v_pm_review_status text;
  v_requirements_captured boolean:=false;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_project from public.projects where id=p_project_id;
  if not found then raise exception 'Project not found.'; end if;

  select salesperson_id into v_salesperson
  from public.crm_opportunities
  where id=v_project.source_opportunity_id;

  if not public.is_admin()
     and v_uid is distinct from v_salesperson
     and v_uid is distinct from v_project.project_manager_id then
    raise exception 'Project handoff access denied.';
  end if;

  select * into v_quote from public.quotations where id=v_project.quotation_id;
  select * into v_onboarding
  from public.client_onboardings
  where project_id=v_project.id
  order by created_at desc
  limit 1;
  select * into v_payment
  from public.payments
  where opportunity_id=v_project.source_opportunity_id
    and status='Verified'
    and payment_type in ('Advance','Advance Payment','Full Payment')
  order by coalesce(verified_at,paid_at,updated_at) desc
  limit 1;

  select exists(
    select 1 from public.project_tasks t
    where t.project_id=v_project.id
      and t.workflow_key='sales_handover_submission'
      and t.status='Done'
  ) into v_seller_done;
  select t.status into v_pm_review_status
  from public.project_tasks t
  where t.project_id=v_project.id and t.workflow_key='sales_handover_review'
  order by t.created_at desc
  limit 1;
  select u.full_name into v_pm_name from public.user_profiles u where u.id=v_project.project_manager_id;

  v_requirements_captured:=nullif(btrim(coalesce(v_project.requirements_summary,'')),'') is not null;

  return jsonb_build_object(
    'projectId',v_project.id,
    'projectNumber',v_project.project_number,
    'projectName',v_project.project_name,
    'projectStage',v_project.stage,
    'projectStatus',v_project.status,
    'packageSnapshot',v_project.package_snapshot,
    'salesRequirements',coalesce(v_project.requirements_summary,''),
    'requirementsCaptured',v_requirements_captured,
    'scopeSummary',coalesce(nullif(v_project.scope_summary,''),nullif(v_quote.scope_summary,''),''),
    'exclusions',coalesce(nullif(v_project.exclusions,''),nullif(v_quote.exclusions,''),''),
    'quotation',jsonb_build_object(
      'id',v_quote.id,'number',v_quote.quotation_number,'status',v_quote.status,
      'total',v_quote.total,'currency',v_quote.currency,'acceptedAt',v_quote.accepted_at
    ),
    'payment',jsonb_build_object(
      'verified',v_payment.id is not null,'reference',v_payment.payment_reference,
      'type',v_payment.payment_type,'amountPaid',v_payment.amount_paid,
      'currency',v_payment.currency,'verifiedAt',v_payment.verified_at
    ),
    'onboarding',jsonb_build_object(
      'id',v_onboarding.id,
      'status',v_onboarding.status,
      'completed',v_onboarding.status='Completed' and v_onboarding.completed_at is not null,
      'completedAt',v_onboarding.completed_at,
      'questionCount',case when jsonb_typeof(v_onboarding.field_schema)='array' then jsonb_array_length(v_onboarding.field_schema) else 0 end,
      'responseCount',case when jsonb_typeof(v_onboarding.responses)='object' then (select count(*) from jsonb_object_keys(v_onboarding.responses)) else 0 end
    ),
    'discovery',jsonb_strip_nulls(jsonb_build_object(
      'projectGoals',v_onboarding.responses->>'projectGoals',
      'targetAudience',v_onboarding.responses->>'targetAudience',
      'primaryOffer',v_onboarding.responses->>'primaryOffer',
      'competitors',v_onboarding.responses->>'competitors',
      'communicationPreference',v_onboarding.responses->>'communicationPreference',
      'timezone',v_onboarding.responses->>'timezone',
      'generalDeliveryNotes',v_onboarding.responses->>'generalDeliveryNotes'
    )),
    'sellerHandoffDone',v_seller_done,
    'pmReviewStatus',coalesce(v_pm_review_status,'Not Started'),
    'projectManager',jsonb_build_object('id',v_project.project_manager_id,'name',coalesce(v_pm_name,'')),
    'sellerNotes',coalesce(v_project.sales_handover_notes,''),
    'readyToSend',
      v_requirements_captured
      and v_onboarding.status='Completed'
      and v_onboarding.completed_at is not null
      and not v_seller_done,
    'blockedReason',case
      when not v_requirements_captured then 'Confirmed Sales requirements are missing. Requirements must be captured by Sales before onboarding and handoff.'
      when not (v_onboarding.status='Completed' and v_onboarding.completed_at is not null) then 'Client onboarding must be completed before handoff.'
      when v_seller_done then 'Sales handoff has already been sent.'
      else '' end
  );
end;
$function$;

create or replace function public.submit_sales_project_handover(p_project_id uuid, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_project public.projects%rowtype;
  v_salesperson uuid;
  v_notes text:=btrim(coalesce(p_notes,''));
  v_is_source_seller boolean:=false;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if length(v_notes)>10000 then raise exception 'Final Seller notes are too long.'; end if;

  select * into v_project from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found.'; end if;
  if v_project.status<>'Active' or v_project.stage<>'Sales Handover' then
    raise exception 'The Sales handoff is already closed or this project is no longer in the handoff stage.';
  end if;
  if nullif(btrim(coalesce(v_project.requirements_summary,'')),'') is null then
    raise exception 'Confirmed Sales requirements are missing. Sales must capture requirements before client onboarding and handoff.';
  end if;
  if not exists(
    select 1 from public.client_onboardings o
    where o.project_id=v_project.id and o.status='Completed' and o.completed_at is not null
  ) then
    raise exception 'Client onboarding must be completed before the final Sales handoff can be sent.';
  end if;

  select salesperson_id into v_salesperson
  from public.crm_opportunities
  where id=v_project.source_opportunity_id;
  v_is_source_seller:=v_salesperson is not null and v_salesperson=v_uid and exists(
    select 1 from public.user_profiles u
    where u.id=v_uid and u.status='active' and u.role in ('sales','sales_rep','sales_team')
  );
  if not v_is_source_seller and not public.is_admin() and v_project.project_manager_id is distinct from v_uid then
    raise exception 'Only the source salesperson, assigned Project Manager, or Administrator may submit handoff notes.';
  end if;

  if v_notes='' then
    v_notes:='No additional Sales commitments beyond the confirmed Sales requirements, accepted quotation and completed client onboarding.';
  end if;

  update public.projects
  set sales_handover_notes=v_notes,updated_at=now()
  where id=v_project.id;

  if v_is_source_seller then
    update public.project_tasks
    set status='Done',
        completed_at=coalesce(completed_at,now()),
        notes=concat_ws(E'\n',nullif(notes,''),'Final Sales handoff reviewed and sent through the protected workflow.'),
        updated_at=now()
    where project_id=v_project.id
      and workflow_key='sales_handover_submission'
      and assigned_to=v_uid;

    if v_project.project_manager_id is not null then
      update public.project_tasks
      set assigned_to=v_project.project_manager_id,updated_at=now()
      where project_id=v_project.id
        and workflow_key='sales_handover_review'
        and status<>'Done'
        and assigned_to is null;

      perform public.service_queue_staff_operational_notification(
        v_project.project_manager_id,
        'project-sales-handover-submitted:'||v_project.id::text,
        'project_handover_ready',
        'Sales Handoff',
        'Completed client brief ready — '||v_project.project_name,
        'Sales requirements, client onboarding and Sales handoff are complete. Review the captured brief and then start Content.',
        '/admin/app/projects?tab=projects',
        jsonb_build_object(
          'projectId',v_project.id,'projectNumber',v_project.project_number,
          'projectName',v_project.project_name,'salespersonId',v_uid,
          'actionUrl','/admin/app/projects?tab=projects'
        ),
        now()
      );
    else
      perform public.service_queue_active_admins_operational_notification(
        'project-sales-handover-needs-pm:'||v_project.id::text,
        'project_handover_needs_pm',
        'Sales Handoff',
        'Assign Project Manager — '||v_project.project_name,
        'Sales requirements, client onboarding and the Sales handoff are complete. Assign a Project Manager for final handoff review before Content begins.',
        '/admin/app/projects?tab=projects',
        jsonb_build_object(
          'projectId',v_project.id,'projectNumber',v_project.project_number,
          'projectName',v_project.project_name,'salespersonId',v_uid,
          'actionUrl','/admin/app/projects?tab=projects'
        ),
        now()
      );
    end if;
  end if;

  return jsonb_build_object(
    'projectId',v_project.id,
    'submittedBy',v_uid,
    'sourceSellerSubmission',v_is_source_seller,
    'notes',v_notes,
    'submittedAt',now(),
    'requirementsCaptured',true,
    'onboardingComplete',true,
    'projectManagerAssigned',v_project.project_manager_id is not null,
    'nextProductionStage','Content'
  );
end;
$function$;

-- Organize the seller-to-production lifecycle without duplicating existing CRM, onboarding, notification, or project systems.

insert into public.notification_templates(template_key,name,subject_template,body_template,active,description)
values
('staff_client_onboarding_started','Client onboarding started for seller','Client onboarding started: {{projectNumber}}','A verified sale has created project {{projectNumber}} and the secure client onboarding has been prepared automatically.\n\nYou remain the Sales owner until the client completes onboarding. Follow up in the existing Sales conversation if needed.\n\nOpen customer conversation: {{actionUrl}}\n\nProFox Sales Operations\nProFox Web Designer\nhttps://www.profoxwebdesigner.com/',true,'Seller notice after verified payment creates a project and starts client onboarding.'),
('staff_client_onboarding_completed_unowned','Completed onboarding needs sales owner','Client onboarding completed: {{projectNumber}}','Client onboarding for {{projectNumber}} is complete, but the system could not resolve an active Sales owner.\n\nReview the project ownership and make sure the completed client brief is handed to Project Management.\n\nOpen Projects: {{actionUrl}}\n\nProFox Sales Operations\nProFox Web Designer\nhttps://www.profoxwebdesigner.com/',true,'Administrator exception notice when onboarding completes without an active source seller.'),
('staff_sales_handoff_accepted','Sales handoff accepted','Project handoff accepted: {{projectNumber}}','Project Management has accepted the completed client brief for {{projectNumber}}.\n\nSales ownership is complete. The project can now move through Requirements and production under Project Management.\n\nOpen project: {{actionUrl}}\n\nProFox Delivery Operations\nProFox Web Designer\nhttps://www.profoxwebdesigner.com/',true,'Seller confirmation after Project Management completes the protected handoff review.')
on conflict (template_key) do update set
  name=excluded.name,
  subject_template=excluded.subject_template,
  body_template=excluded.body_template,
  active=excluded.active,
  description=excluded.description,
  updated_at=now();

update public.notification_templates
set
  name='Client brief ready for Sales handoff',
  subject_template='Review & send client brief: {{projectNumber}}',
  body_template='Client onboarding for project {{projectNumber}} is complete.\n\nThe accepted quotation, verified payment, purchased scope and client answers are already captured. Review them, add only any final Sales-only commitment or exception that is not already recorded, then send the brief to Project Management.\n\nOpen handoff: {{actionUrl}}\n\nProFox Sales Operations\nProFox Web Designer\nhttps://www.profoxwebdesigner.com/',
  description='Seller action notice only after client onboarding is complete and the final Sales-to-PM handoff is ready.',
  updated_at=now()
where template_key='project_handover_required';

update public.notification_templates
set
  name='Completed client brief ready for PM review',
  subject_template='Client brief ready for review: {{projectNumber}}',
  body_template='Sales has sent the final handoff for project {{projectNumber}} after client onboarding was completed.\n\nReview the accepted quotation, verified payment, purchased scope, completed onboarding answers and any final Seller notes. Mark the handoff review task Done, then advance the project once; the already-completed onboarding stage is skipped automatically and Requirements begins.\n\nOpen project: {{actionUrl}}\n\nProFox Delivery Operations\nProFox Web Designer\nhttps://www.profoxwebdesigner.com/',
  description='Project Manager notice after the completed onboarding brief is sent by the source seller.',
  updated_at=now()
where template_key='project_handover_ready';

update public.notification_templates
set
  name='Completed handoff needs Project Manager',
  subject_template='Assign Project Manager: {{projectNumber}}',
  body_template='Client onboarding and the Sales handoff for project {{projectNumber}} are complete, but no Project Manager is assigned.\n\nAssign an eligible Project Manager so the completed brief can be reviewed and Requirements can begin without an ownership gap.\n\nOpen Projects: {{actionUrl}}\n\nProFox Delivery Operations\nProFox Web Designer\nhttps://www.profoxwebdesigner.com/',
  description='Administrator notice when client onboarding and Sales handoff are complete but PM ownership is missing.',
  updated_at=now()
where template_key='project_handover_needs_pm';

update public.delivery_task_templates
set title='Review & Send Client Brief to Project Manager',
    description='The accepted quotation, verified payment, purchased scope and client onboarding are already captured. Sales reviews them, records only any final exception or special commitment not already stored, and sends the brief to Project Management.',
    updated_at=now()
where stage_key='Sales Handover' and workflow_key='sales_handover_submission';

update public.delivery_task_templates
set title='Review Client Brief & Start Requirements',
    description='Project Management reviews the completed onboarding brief, accepted quotation, verified payment, scope and Seller exceptions. Mark this review Done, then advance the project once; the completed onboarding stage is skipped automatically and Requirements begins.',
    updated_at=now()
where stage_key='Sales Handover' and workflow_key='sales_handover_review';

update public.project_tasks
set title='Review & Send Client Brief to Project Manager',
    description='The accepted quotation, verified payment, purchased scope and client onboarding are already captured. Review them and record only final Sales exceptions or special commitments before sending the brief to Project Management.',
    updated_at=now()
where workflow_key='sales_handover_submission' and status<>'Done';

update public.project_tasks
set title='Review Client Brief & Start Requirements',
    description='Review the completed onboarding brief, accepted quotation, verified payment, scope and Seller exceptions. Mark this task Done, then advance the project once; Requirements begins automatically without repeating client onboarding.',
    updated_at=now()
where workflow_key='sales_handover_review' and status<>'Done';

create or replace function public.notify_seller_project_handover_created()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_salesperson uuid;
  v_lead_id uuid;
  v_action text;
begin
  if new.stage<>'Sales Handover' or new.source_opportunity_id is null then return new; end if;
  select o.salesperson_id,o.lead_id into v_salesperson,v_lead_id
  from public.crm_opportunities o where o.id=new.source_opportunity_id;
  if v_salesperson is null or not exists(
    select 1 from public.user_profiles u
    where u.id=v_salesperson and u.status='active' and u.role in ('sales','sales_rep','sales_team')
  ) then return new; end if;
  v_action:=case when v_lead_id is not null
    then '/admin/app/crm?tab=inbox&lead='||v_lead_id::text
    else '/admin/app/crm?tab=leads' end;
  perform public.service_queue_staff_operational_notification(
    v_salesperson,
    'project-client-onboarding-started:'||new.id::text,
    'staff_client_onboarding_started',
    'Client Onboarding',
    'Payment verified — client onboarding started',
    new.project_number||' is now in client onboarding. You remain the Sales owner until the client completes it.',
    v_action,
    jsonb_build_object('projectId',new.id,'projectNumber',new.project_number,'projectName',new.project_name,'clientId',new.client_id,'leadId',v_lead_id,'actionUrl',v_action),
    now()
  );
  return new;
end;
$function$;

create or replace function public.client_onboarding_completion_cleanup()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_project public.projects%rowtype;
  v_salesperson uuid;
  v_action text;
begin
  if new.status='Completed' and old.status is distinct from 'Completed' then
    perform public.service_cancel_client_onboarding_seller_reminders(new.id);
    select * into v_project from public.projects where id=new.project_id;
    if found then
      select o.salesperson_id into v_salesperson
      from public.crm_opportunities o where o.id=v_project.source_opportunity_id;
      v_action:='/admin/project-handover/'||v_project.id::text;
      if v_salesperson is not null and exists(
        select 1 from public.user_profiles u
        where u.id=v_salesperson and u.status='active' and u.role in ('sales','sales_rep','sales_team')
      ) then
        perform public.service_queue_staff_operational_notification(
          v_salesperson,
          'client-onboarding-completed-ready-handoff:'||new.id::text,
          'project_handover_required',
          'Sales Handoff',
          'Client onboarding complete — ready for handoff',
          v_project.project_number||' onboarding is complete. Review the captured brief, add only final Sales exceptions, then send it to Project Management.',
          v_action,
          jsonb_build_object('projectId',v_project.id,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'onboardingId',new.id,'actionUrl',v_action),
          now()
        );
      else
        perform public.service_queue_active_admins_operational_notification(
          'client-onboarding-completed-unowned:'||new.id::text,
          'staff_client_onboarding_completed_unowned',
          'Sales Handoff',
          'Completed onboarding needs an owner',
          v_project.project_number||' onboarding is complete but no active source Seller could be resolved.',
          '/admin/app/projects?tab=projects',
          jsonb_build_object('projectId',v_project.id,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'onboardingId',new.id,'actionUrl','/admin/app/projects?tab=projects'),
          now()
        );
      end if;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.notify_payment_operational_event()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_verification boolean:=false;
  v_status_changed boolean:=false;
  v_payload jsonb;
  v_note text;
  v_lead_id uuid;
  v_action text;
begin
  if tg_op='INSERT' then v_verification:=new.status='Verification Pending';
  else
    v_verification:=new.status='Verification Pending' and old.status is distinct from new.status;
    v_status_changed:=old.status is distinct from new.status and new.status in ('Verified','Partially Paid','Failed','Refunded','Partially Refunded');
  end if;
  select o.lead_id into v_lead_id from public.crm_opportunities o where o.id=new.opportunity_id;
  v_action:=case when new.status='Verified' and v_lead_id is not null
    then '/admin/app/crm?tab=inbox&lead='||v_lead_id::text
    else '/admin/app/sales?tab=payments' end;
  v_payload:=jsonb_build_object('paymentReference',new.payment_reference,'customerName',new.customer_name,'currency',new.currency,'amountDue',new.amount_due,'amountPaid',new.amount_paid,'status',new.status,'dueDate',coalesce(new.due_date::text,''),'leadId',v_lead_id,'actionUrl',v_action);
  if v_verification then
    perform public.service_queue_active_admins_operational_notification('payment-verification-required:'||new.id||':'||extract(epoch from new.updated_at)::bigint,'payment_verification_required','Payment','Payment verification required — '||new.payment_reference,coalesce(nullif(new.customer_name,''),'Customer')||' payment is waiting for protected Admin verification.','/admin/app/sales?tab=payments',v_payload,now());
  end if;
  if v_status_changed and new.salesperson_id is not null then
    v_note:=case new.status
      when 'Verified' then 'Payment verified. The project and secure client onboarding are created automatically. You remain the Sales owner until onboarding is complete.'
      when 'Partially Paid' then 'A partial receipt was recorded; the payment is not fully verified.'
      when 'Failed' then 'Payment was marked failed.'
      when 'Refunded' then 'Payment was refunded.'
      when 'Partially Refunded' then 'Payment was partially refunded.'
      else 'Payment status changed.' end;
    perform public.service_queue_staff_operational_notification(new.salesperson_id,'payment-status:'||new.id||':'||lower(replace(new.status,' ','-'))||':'||extract(epoch from new.updated_at)::bigint,'payment_status_update_internal','Payment','Payment update — '||new.payment_reference||' · '||new.status,v_note,v_action,v_payload,now());
  end if;
  return new;
end;
$function$;

create or replace function public.submit_sales_project_handover(p_project_id uuid,p_notes text)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
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
  if not exists(
    select 1 from public.client_onboardings o
    where o.project_id=v_project.id and o.status='Completed' and o.completed_at is not null
  ) then
    raise exception 'Client onboarding must be completed before the final Sales handoff can be sent.';
  end if;
  select salesperson_id into v_salesperson from public.crm_opportunities where id=v_project.source_opportunity_id;
  v_is_source_seller:=v_salesperson is not null and v_salesperson=v_uid and exists(
    select 1 from public.user_profiles u where u.id=v_uid and u.status='active' and u.role in ('sales','sales_rep','sales_team')
  );
  if not v_is_source_seller and not public.is_admin() and v_project.project_manager_id is distinct from v_uid then
    raise exception 'Only the source salesperson, assigned Project Manager, or Administrator may submit handoff notes.';
  end if;
  if v_notes='' then
    v_notes:='No additional Sales commitments beyond the accepted quotation and completed client onboarding.';
  end if;
  update public.projects set sales_handover_notes=v_notes,updated_at=now() where id=v_project.id;
  if v_is_source_seller then
    update public.project_tasks
    set status='Done',completed_at=coalesce(completed_at,now()),notes=concat_ws(E'\n',nullif(notes,''),'Final Sales handoff reviewed and sent through the protected workflow.'),updated_at=now()
    where project_id=v_project.id and workflow_key='sales_handover_submission' and assigned_to=v_uid;
    if v_project.project_manager_id is not null then
      update public.project_tasks
      set assigned_to=v_project.project_manager_id,updated_at=now()
      where project_id=v_project.id and workflow_key='sales_handover_review' and status<>'Done' and assigned_to is null;
      perform public.service_queue_staff_operational_notification(
        v_project.project_manager_id,
        'project-sales-handover-submitted:'||v_project.id::text,
        'project_handover_ready',
        'Sales Handoff',
        'Completed client brief ready — '||v_project.project_name,
        'Client onboarding and Sales handoff are complete. Review the captured brief and then start Requirements.',
        '/admin/app/projects?tab=projects',
        jsonb_build_object('projectId',v_project.id,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'salespersonId',v_uid,'actionUrl','/admin/app/projects?tab=projects'),
        now()
      );
    else
      perform public.service_queue_active_admins_operational_notification(
        'project-sales-handover-needs-pm:'||v_project.id::text,
        'project_handover_needs_pm',
        'Sales Handoff',
        'Assign Project Manager — '||v_project.project_name,
        'Client onboarding and the Sales handoff are complete. Assign a Project Manager for the final review and Requirements ownership.',
        '/admin/app/projects?tab=projects',
        jsonb_build_object('projectId',v_project.id,'projectNumber',v_project.project_number,'projectName',v_project.project_name,'salespersonId',v_uid,'actionUrl','/admin/app/projects?tab=projects'),
        now()
      );
    end if;
  end if;
  return jsonb_build_object('projectId',v_project.id,'submittedBy',v_uid,'sourceSellerSubmission',v_is_source_seller,'notes',v_notes,'submittedAt',now(),'onboardingComplete',true,'projectManagerAssigned',v_project.project_manager_id is not null);
end;
$function$;

create or replace function public.protect_project_stage_workflow()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
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
    if old.stage<>'Content' or new.stage<>'UI/UX Design' then raise exception 'Invalid protected Content handoff transition.'; end if;
    select count(*) into v_incomplete from public.project_tasks t where t.project_id=old.id and t.workflow_stage='Content' and t.required_for_stage is true and t.status<>'Done';
    if v_incomplete>0 then raise exception 'Complete all required Content workflow tasks before advancing the project. Remaining: %.',v_incomplete; end if;
    return new;
  end if;
  if v_client_decision then
    if old.stage='Client Design Approval' and new.stage in ('Development','UI/UX Design') then return new; end if;
    if old.stage='Client Review' and new.stage='Final Revisions' then return new; end if;
    raise exception 'Invalid client-controlled project transition.';
  end if;
  if not public.is_admin() and old.project_manager_id is distinct from auth.uid() then raise exception 'Only the assigned Project Manager or Administrator may advance the project.'; end if;
  if old.stage in ('Client Design Approval','Client Review') then raise exception 'This stage requires a recorded client decision before delivery can continue.'; end if;

  if old.stage='Sales Handover' then
    -- Existing UI may still request the legacy Client Onboarding stage. Because client onboarding is already complete before handoff,
    -- normalize that single request directly to Requirements instead of creating a duplicate stage.
    if new.stage not in ('Client Onboarding','Requirements') then raise exception 'After Sales Handover, the project must move to Requirements.'; end if;
    new.stage:='Requirements';
    if old.project_manager_id is null then raise exception 'Assign an active Project Manager before completing the Sales handoff.'; end if;
    if length(btrim(coalesce(old.sales_handover_notes,'')))<10 then raise exception 'Send the final Sales handoff before Project Management starts Requirements.'; end if;
    if not exists(select 1 from public.client_onboardings o where o.project_id=old.id and o.status='Completed' and o.completed_at is not null) then
      raise exception 'Client onboarding must be completed before Project Management starts Requirements.';
    end if;
  else
    v_expected:=case old.stage
      when 'Client Onboarding' then 'Requirements'
      when 'Requirements' then 'Content'
      when 'Content' then 'UI/UX Design'
      when 'UI/UX Design' then 'Client Design Approval'
      when 'Development' then 'QA'
      when 'QA' then 'Client Review'
      when 'Final Revisions' then 'Launch'
      when 'Launch' then 'Handover'
      when 'Handover' then 'Completed'
      else null end;
    if v_expected is null or new.stage<>v_expected then raise exception 'Project stages must follow the approved delivery sequence. Expected next stage: %.',coalesce(v_expected,'none'); end if;
    if old.stage='Client Onboarding' and not exists(select 1 from public.client_onboardings o where o.project_id=old.id and o.status='Completed' and o.completed_at is not null) then
      raise exception 'Client onboarding form must be completed before advancing the project to Requirements.';
    end if;
  end if;

  select count(*) into v_incomplete
  from public.project_tasks t
  where t.project_id=old.id and t.workflow_stage=old.stage and t.required_for_stage is true and t.status<>'Done';
  if v_incomplete>0 then raise exception 'Complete all required % workflow tasks before advancing the project. Remaining: %.',old.stage,v_incomplete; end if;
  if new.stage='Completed' then new.status:='Completed'; new.completed_at:=coalesce(new.completed_at,now()); end if;
  return new;
end;
$function$;

create or replace function public.project_get_sales_handoff_brief(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
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
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_project from public.projects where id=p_project_id;
  if not found then raise exception 'Project not found.'; end if;
  select salesperson_id into v_salesperson from public.crm_opportunities where id=v_project.source_opportunity_id;
  if not public.is_admin() and v_uid is distinct from v_salesperson and v_uid is distinct from v_project.project_manager_id then
    raise exception 'Project handoff access denied.';
  end if;
  select * into v_quote from public.quotations where id=v_project.quotation_id;
  select * into v_onboarding from public.client_onboardings where project_id=v_project.id order by created_at desc limit 1;
  select * into v_payment from public.payments
    where opportunity_id=v_project.source_opportunity_id and status='Verified' and payment_type in ('Advance','Advance Payment','Full Payment')
    order by coalesce(verified_at,paid_at,updated_at) desc limit 1;
  select exists(select 1 from public.project_tasks t where t.project_id=v_project.id and t.workflow_key='sales_handover_submission' and t.status='Done') into v_seller_done;
  select t.status into v_pm_review_status from public.project_tasks t where t.project_id=v_project.id and t.workflow_key='sales_handover_review' order by t.created_at desc limit 1;
  select u.full_name into v_pm_name from public.user_profiles u where u.id=v_project.project_manager_id;
  return jsonb_build_object(
    'projectId',v_project.id,
    'projectNumber',v_project.project_number,
    'projectName',v_project.project_name,
    'projectStage',v_project.stage,
    'projectStatus',v_project.status,
    'packageSnapshot',v_project.package_snapshot,
    'scopeSummary',coalesce(nullif(v_project.scope_summary,''),nullif(v_quote.scope_summary,''),''),
    'exclusions',coalesce(nullif(v_project.exclusions,''),nullif(v_quote.exclusions,''),''),
    'quotation',jsonb_build_object('id',v_quote.id,'number',v_quote.quotation_number,'status',v_quote.status,'total',v_quote.total,'currency',v_quote.currency,'acceptedAt',v_quote.accepted_at),
    'payment',jsonb_build_object('verified',v_payment.id is not null,'reference',v_payment.payment_reference,'type',v_payment.payment_type,'amountPaid',v_payment.amount_paid,'currency',v_payment.currency,'verifiedAt',v_payment.verified_at),
    'onboarding',jsonb_build_object(
      'id',v_onboarding.id,
      'status',v_onboarding.status,
      'completed',v_onboarding.status='Completed' and v_onboarding.completed_at is not null,
      'completedAt',v_onboarding.completed_at,
      'questionCount',case when jsonb_typeof(v_onboarding.field_schema)='array' then jsonb_array_length(v_onboarding.field_schema) else 0 end,
      'responseCount',case when jsonb_typeof(v_onboarding.responses)='object' then jsonb_object_length(v_onboarding.responses) else 0 end
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
    'readyToSend',v_onboarding.status='Completed' and v_onboarding.completed_at is not null and not v_seller_done
  );
end;
$function$;

revoke all on function public.project_get_sales_handoff_brief(uuid) from public,anon;
grant execute on function public.project_get_sales_handoff_brief(uuid) to authenticated,service_role;

create or replace function public.crm_get_seller_lifecycle_queue(p_salesperson_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
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
      sh.status seller_handoff_status,pr.status pm_review_status
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
    left join public.user_profiles seller on seller.id=l.salesperson_id
    left join public.user_profiles pm on pm.id=p.project_manager_id
  ), classified as (
    select s.*,
      case
        when s.lead_status='Not Qualified' or s.opportunity_status='Lost' then 'archived'
        when s.project_id is not null and (s.project_status='Completed' or s.project_stage='Completed') then 'closed_customers'
        when s.project_id is not null and s.project_stage<>'Sales Handover' then 'closed_customers'
        when s.onboarding_status='Completed' and s.seller_handoff_status='Done' then 'closed_customers'
        when s.onboarding_status='Completed' then 'ready_for_handoff'
        when s.project_id is not null or s.verified_first_payment then 'onboarding'
        when s.quotation_status='Accepted' or s.opportunity_stage='Awaiting Advance Payment' then 'awaiting_payment'
        when s.opportunity_id is not null then 'deals_quotations'
        else 'active_leads' end as queue_key,
      case
        when s.project_id is not null and (s.project_status='Completed' or s.project_stage='Completed') then 'Project Completed'
        when s.project_id is not null and s.project_stage<>'Sales Handover' then 'In Production'
        when s.onboarding_status='Completed' and s.seller_handoff_status='Done' and s.project_manager_id is null then 'Handoff Sent — PM Assignment'
        when s.onboarding_status='Completed' and s.seller_handoff_status='Done' then 'Project Manager Review'
        when s.onboarding_status='Completed' then 'Ready for Handoff'
        when s.project_id is not null or s.verified_first_payment then 'Client Onboarding'
        when s.quotation_status='Accepted' or s.opportunity_stage='Awaiting Advance Payment' then 'Awaiting Payment'
        when s.opportunity_id is not null then 'Deal & Quotation'
        else 'Active Lead' end as lifecycle_stage
    from snapshots s
  ), actioned as (
    select c.*,
      case c.queue_key
        when 'active_leads' then 'Continue lead qualification'
        when 'deals_quotations' then 'Move the deal forward'
        when 'awaiting_payment' then 'Follow up on payment'
        when 'onboarding' then 'Keep client onboarding moving'
        when 'ready_for_handoff' then 'Review & send client brief to PM'
        else 'View customer' end as next_action_label,
      case c.queue_key
        when 'active_leads' then '/admin/app/crm?tab=leads&lead='||c.lead_id::text
        when 'deals_quotations' then '/admin/app/crm?tab=pipeline'
        when 'awaiting_payment' then '/admin/app/sales?tab=payments'
        when 'onboarding' then '/admin/app/crm?tab=inbox&lead='||c.lead_id::text
        when 'ready_for_handoff' then '/admin/project-handover/'||c.project_id::text
        else '/admin/app/sales?tab=clients' end as action_url,
      case
        when c.onboarding_status='Completed' and c.seller_handoff_status='Done' and c.project_manager_id is null then 'Project Manager not assigned'
        when c.queue_key='onboarding' and c.onboarding_status is not null then 'Waiting for client onboarding: '||c.onboarding_status
        else '' end as blocker,
      greatest(coalesce(c.project_updated,'epoch'::timestamptz),coalesce(c.onboarding_updated,'epoch'::timestamptz),coalesce(c.payment_updated,'epoch'::timestamptz),coalesce(c.quotation_updated,'epoch'::timestamptz),coalesce(c.opportunity_updated,'epoch'::timestamptz),c.lead_updated) as activity_at
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
      'leadId',a.lead_id,'companyName',coalesce(nullif(a.company_name,''),nullif(a.contact_name,''),'Customer'),'leadTitle',a.lead_title,
      'salespersonId',a.salesperson_id,'sellerName',coalesce(a.seller_name,''),'opportunityId',a.opportunity_id,
      'quotationId',a.quotation_id,'quotationNumber',a.quotation_number,'paymentReference',a.payment_reference,
      'projectId',a.project_id,'projectNumber',a.project_number,'projectName',a.project_name,'onboardingId',a.onboarding_id,
      'lifecycleStage',a.lifecycle_stage,'queueKey',a.queue_key,'nextActionLabel',a.next_action_label,'actionUrl',a.action_url,'blocker',a.blocker,
      'currentOwnerRole',case when a.queue_key in ('active_leads','deals_quotations','awaiting_payment','onboarding','ready_for_handoff') then 'Sales' else case when a.project_manager_id is not null then 'Project Management' else 'Management' end end,
      'currentOwnerName',case when a.queue_key in ('active_leads','deals_quotations','awaiting_payment','onboarding','ready_for_handoff') then coalesce(a.seller_name,'') else coalesce(a.pm_name,'') end,
      'raw',jsonb_build_object('leadStatus',a.lead_status,'opportunityStatus',a.opportunity_status,'opportunityStage',a.opportunity_stage,'quotationStatus',a.quotation_status,'paymentStatus',a.latest_payment_status,'onboardingStatus',a.onboarding_status,'projectStage',a.project_stage),
      'updatedAt',a.activity_at
    ) order by case a.queue_key when 'ready_for_handoff' then 1 when 'onboarding' then 2 when 'awaiting_payment' then 3 when 'deals_quotations' then 4 else 5 end,a.activity_at asc)
      from actioned a where a.queue_key not in ('archived','closed_customers')),'[]'::jsonb),
    'recentClosed',coalesce((select jsonb_agg(x.obj order by x.activity_at desc) from (
      select jsonb_build_object('leadId',a.lead_id,'companyName',coalesce(nullif(a.company_name,''),nullif(a.contact_name,''),'Customer'),'projectId',a.project_id,'projectNumber',a.project_number,'projectName',a.project_name,'lifecycleStage',a.lifecycle_stage,'currentOwnerName',coalesce(a.pm_name,a.seller_name,''),'actionUrl',a.action_url,'updatedAt',a.activity_at) obj,a.activity_at
      from actioned a where a.queue_key='closed_customers' order by a.activity_at desc limit 20
    ) x),'[]'::jsonb)
  ) into v_result
  from actioned;
  return coalesce(v_result,jsonb_build_object('scope',case when v_team then 'team' else 'individual' end,'salespersonId',v_target,'counts',jsonb_build_object('activeLeads',0,'dealsQuotations',0,'awaitingPayment',0,'onboarding',0,'readyForHandoff',0,'closedCustomers',0),'items','[]'::jsonb,'recentClosed','[]'::jsonb));
end;
$function$;

revoke all on function public.crm_get_seller_lifecycle_queue(uuid) from public,anon;
grant execute on function public.crm_get_seller_lifecycle_queue(uuid) to authenticated,service_role;

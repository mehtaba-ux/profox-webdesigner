-- Align the canonical Sales discovery requirements with production handoff.
-- Requirements are owned by Sales before quotation/payment. Client onboarding remains
-- a post-payment prerequisite, not a delivery stage. Production starts at Content.

create or replace function public.enforce_sales_requirements_before_quotation_write()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_requirements text;
begin
  if new.opportunity_id is null then
    return new;
  end if;

  select o.requirements_summary
    into v_requirements
  from public.crm_opportunities o
  where o.id = new.opportunity_id;

  if length(btrim(coalesce(v_requirements, ''))) = 0 then
    raise exception 'Confirm and record Seller requirements before creating a quotation.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_require_sales_requirements_before_quotation on public.quotations;
create trigger trg_require_sales_requirements_before_quotation
before insert or update of opportunity_id on public.quotations
for each row execute function public.enforce_sales_requirements_before_quotation_write();

create or replace function public.enforce_sales_requirements_before_verified_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_requirements text;
begin
  if new.status <> 'Verified'
     or new.payment_type not in ('Advance', 'Advance Payment', 'Full Payment')
     or new.opportunity_id is null
     or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;

  select o.requirements_summary
    into v_requirements
  from public.crm_opportunities o
  where o.id = new.opportunity_id;

  if length(btrim(coalesce(v_requirements, ''))) = 0 then
    raise exception 'Seller requirements must be recorded before the first qualifying payment can be verified.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_require_sales_requirements_before_verified_payment on public.payments;
create trigger trg_require_sales_requirements_before_verified_payment
before insert or update of status, payment_type, opportunity_id on public.payments
for each row execute function public.enforce_sales_requirements_before_verified_payment();

create or replace function public.enforce_sales_requirements_before_project_creation()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_requirements text;
begin
  if new.source_opportunity_id is null then
    return new;
  end if;

  select o.requirements_summary
    into v_requirements
  from public.crm_opportunities o
  where o.id = new.source_opportunity_id;

  if length(btrim(coalesce(v_requirements, ''))) = 0 then
    raise exception 'Seller requirements must be recorded before a delivery project can be created.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_require_sales_requirements_before_project_creation on public.projects;
create trigger trg_require_sales_requirements_before_project_creation
before insert or update of source_opportunity_id on public.projects
for each row execute function public.enforce_sales_requirements_before_project_creation();

-- Safe repair path for historical paid projects that were created before requirements
-- were enforced. This updates the existing canonical Opportunity + Project only.
create or replace function public.crm_correct_sales_requirements_for_handoff(
  p_project_id uuid,
  p_requirements_summary text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_project public.projects%rowtype;
  v_salesperson uuid;
  v_requirements text := btrim(coalesce(p_requirements_summary, ''));
  v_is_source_seller boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;
  if length(v_requirements) < 10 then
    raise exception 'Seller requirements must contain the confirmed client requirement, not a placeholder.';
  end if;
  if length(v_requirements) > 20000 then
    raise exception 'Seller requirements are too long.';
  end if;

  select * into v_project
  from public.projects
  where id = p_project_id
  for update;

  if not found then
    raise exception 'Project not found.';
  end if;
  if v_project.status <> 'Active' or v_project.stage <> 'Sales Handover' then
    raise exception 'Seller requirements can only be corrected before the Sales handoff is completed.';
  end if;

  select o.salesperson_id
    into v_salesperson
  from public.crm_opportunities o
  where o.id = v_project.source_opportunity_id;

  v_is_source_seller := v_salesperson is not null
    and v_salesperson = v_uid
    and exists (
      select 1
      from public.user_profiles u
      where u.id = v_uid
        and u.status = 'active'
        and u.role in ('sales', 'sales_rep', 'sales_team', 'seller')
    );

  if not v_is_source_seller and not public.is_admin() then
    raise exception 'Only the source salesperson or Administrator may correct Seller requirements.';
  end if;

  if exists (
    select 1 from public.project_tasks t
    where t.project_id = v_project.id
      and t.workflow_key = 'sales_handover_submission'
      and t.status = 'Done'
  ) then
    raise exception 'The Sales handoff is already complete; requirements can no longer be corrected here.';
  end if;

  update public.crm_opportunities
  set requirements_summary = v_requirements,
      updated_at = now()
  where id = v_project.source_opportunity_id;

  update public.projects
  set requirements_summary = v_requirements,
      updated_at = now()
  where id = v_project.id;

  return jsonb_build_object(
    'projectId', v_project.id,
    'opportunityId', v_project.source_opportunity_id,
    'requirementsSummary', v_requirements,
    'requirementsComplete', true,
    'updatedAt', now()
  );
end;
$function$;

revoke all on function public.crm_correct_sales_requirements_for_handoff(uuid, text) from public;
grant execute on function public.crm_correct_sales_requirements_for_handoff(uuid, text) to authenticated;

create or replace function public.project_get_sales_handoff_brief(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_project public.projects%rowtype;
  v_quote public.quotations%rowtype;
  v_onboarding public.client_onboardings%rowtype;
  v_payment public.payments%rowtype;
  v_salesperson uuid;
  v_requirements text;
  v_pm_name text;
  v_seller_done boolean := false;
  v_pm_review_status text;
  v_requirements_complete boolean := false;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'Project not found.'; end if;

  select o.salesperson_id, o.requirements_summary
    into v_salesperson, v_requirements
  from public.crm_opportunities o
  where o.id = v_project.source_opportunity_id;

  if not public.is_admin() and v_uid is distinct from v_salesperson and v_uid is distinct from v_project.project_manager_id then
    raise exception 'Project handoff access denied.';
  end if;

  v_requirements := coalesce(nullif(btrim(v_requirements), ''), nullif(btrim(v_project.requirements_summary), ''), '');
  v_requirements_complete := length(v_requirements) > 0;

  select * into v_quote from public.quotations where id = v_project.quotation_id;
  select * into v_onboarding from public.client_onboardings where project_id = v_project.id order by created_at desc limit 1;
  select * into v_payment from public.payments
    where opportunity_id = v_project.source_opportunity_id
      and status = 'Verified'
      and payment_type in ('Advance', 'Advance Payment', 'Full Payment')
    order by coalesce(verified_at, paid_at, updated_at) desc limit 1;
  select exists(
    select 1 from public.project_tasks t
    where t.project_id = v_project.id and t.workflow_key = 'sales_handover_submission' and t.status = 'Done'
  ) into v_seller_done;
  select t.status into v_pm_review_status
    from public.project_tasks t
    where t.project_id = v_project.id and t.workflow_key = 'sales_handover_review'
    order by t.created_at desc limit 1;
  select u.full_name into v_pm_name from public.user_profiles u where u.id = v_project.project_manager_id;

  return jsonb_build_object(
    'projectId', v_project.id,
    'projectNumber', v_project.project_number,
    'projectName', v_project.project_name,
    'projectStage', v_project.stage,
    'projectStatus', v_project.status,
    'packageSnapshot', v_project.package_snapshot,
    'requirementsSummary', v_requirements,
    'requirementsComplete', v_requirements_complete,
    'scopeSummary', coalesce(nullif(v_project.scope_summary, ''), nullif(v_quote.scope_summary, ''), ''),
    'exclusions', coalesce(nullif(v_project.exclusions, ''), nullif(v_quote.exclusions, ''), ''),
    'quotation', jsonb_build_object('id', v_quote.id, 'number', v_quote.quotation_number, 'status', v_quote.status, 'total', v_quote.total, 'currency', v_quote.currency, 'acceptedAt', v_quote.accepted_at),
    'payment', jsonb_build_object('verified', v_payment.id is not null, 'reference', v_payment.payment_reference, 'type', v_payment.payment_type, 'amountPaid', v_payment.amount_paid, 'currency', v_payment.currency, 'verifiedAt', v_payment.verified_at),
    'onboarding', jsonb_build_object(
      'id', v_onboarding.id,
      'status', v_onboarding.status,
      'completed', v_onboarding.status = 'Completed' and v_onboarding.completed_at is not null,
      'completedAt', v_onboarding.completed_at,
      'questionCount', case when jsonb_typeof(v_onboarding.field_schema) = 'array' then jsonb_array_length(v_onboarding.field_schema) else 0 end,
      'responseCount', case when jsonb_typeof(v_onboarding.responses) = 'object' then (select count(*) from jsonb_object_keys(v_onboarding.responses)) else 0 end
    ),
    'discovery', jsonb_strip_nulls(jsonb_build_object(
      'projectGoals', v_onboarding.responses->>'projectGoals',
      'targetAudience', v_onboarding.responses->>'targetAudience',
      'primaryOffer', v_onboarding.responses->>'primaryOffer',
      'competitors', v_onboarding.responses->>'competitors',
      'communicationPreference', v_onboarding.responses->>'communicationPreference',
      'timezone', v_onboarding.responses->>'timezone',
      'generalDeliveryNotes', v_onboarding.responses->>'generalDeliveryNotes'
    )),
    'sellerHandoffDone', v_seller_done,
    'pmReviewStatus', coalesce(v_pm_review_status, 'Not Started'),
    'projectManager', jsonb_build_object('id', v_project.project_manager_id, 'name', coalesce(v_pm_name, '')),
    'sellerNotes', coalesce(v_project.sales_handover_notes, ''),
    'readyToSend', v_onboarding.status = 'Completed'
      and v_onboarding.completed_at is not null
      and v_requirements_complete
      and not v_seller_done
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
  v_uid uuid := auth.uid();
  v_project public.projects%rowtype;
  v_salesperson uuid;
  v_requirements text;
  v_notes text := btrim(coalesce(p_notes, ''));
  v_is_source_seller boolean := false;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if length(v_notes) > 10000 then raise exception 'Final Seller notes are too long.'; end if;

  select * into v_project from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project not found.'; end if;
  if v_project.status <> 'Active' or v_project.stage <> 'Sales Handover' then
    raise exception 'The Sales handoff is already closed or this project is no longer in the handoff stage.';
  end if;

  select o.salesperson_id, o.requirements_summary
    into v_salesperson, v_requirements
  from public.crm_opportunities o
  where o.id = v_project.source_opportunity_id;

  if length(btrim(coalesce(v_requirements, ''))) = 0 then
    raise exception 'Seller requirements are missing. Record the confirmed requirements before sending the production brief.';
  end if;

  if not exists(
    select 1 from public.client_onboardings o
    where o.project_id = v_project.id and o.status = 'Completed' and o.completed_at is not null
  ) then
    raise exception 'Client onboarding must be completed before the final Sales handoff can be sent.';
  end if;

  v_is_source_seller := v_salesperson is not null and v_salesperson = v_uid and exists(
    select 1 from public.user_profiles u
    where u.id = v_uid and u.status = 'active' and u.role in ('sales', 'sales_rep', 'sales_team', 'seller')
  );
  if not v_is_source_seller and not public.is_admin() and v_project.project_manager_id is distinct from v_uid then
    raise exception 'Only the source salesperson, assigned Project Manager, or Administrator may submit handoff notes.';
  end if;

  if v_notes = '' then
    v_notes := 'No additional Sales commitments beyond the confirmed Seller requirements, accepted quotation, and completed client onboarding.';
  end if;

  update public.projects
  set sales_handover_notes = v_notes,
      requirements_summary = v_requirements,
      updated_at = now()
  where id = v_project.id;

  if v_is_source_seller then
    update public.project_tasks
    set status = 'Done',
        completed_at = coalesce(completed_at, now()),
        notes = concat_ws(E'\n', nullif(notes, ''), 'Final production brief reviewed and sent through the protected workflow.'),
        updated_at = now()
    where project_id = v_project.id
      and workflow_key = 'sales_handover_submission'
      and assigned_to = v_uid;

    if v_project.project_manager_id is not null then
      update public.project_tasks
      set assigned_to = v_project.project_manager_id,
          updated_at = now()
      where project_id = v_project.id
        and workflow_key = 'sales_handover_review'
        and status <> 'Done'
        and assigned_to is null;

      perform public.service_queue_staff_operational_notification(
        v_project.project_manager_id,
        'project-sales-handover-submitted:' || v_project.id::text,
        'project_handover_ready',
        'Sales Handoff',
        'Production brief ready — ' || v_project.project_name,
        'Seller requirements, accepted scope, verified payment and client onboarding are complete. Validate the brief and release the project to Content.',
        '/admin/app/projects?tab=projects',
        jsonb_build_object('projectId', v_project.id, 'projectNumber', v_project.project_number, 'projectName', v_project.project_name, 'salespersonId', v_uid, 'actionUrl', '/admin/app/projects?tab=projects'),
        now()
      );
    else
      perform public.service_queue_active_admins_operational_notification(
        'project-sales-handover-needs-pm:' || v_project.id::text,
        'project_handover_needs_pm',
        'Sales Handoff',
        'Assign Project Manager — ' || v_project.project_name,
        'The Seller requirements, client onboarding and production brief are complete. Assign a Project Manager for final validation and release to Content.',
        '/admin/app/projects?tab=projects',
        jsonb_build_object('projectId', v_project.id, 'projectNumber', v_project.project_number, 'projectName', v_project.project_name, 'salespersonId', v_uid, 'actionUrl', '/admin/app/projects?tab=projects'),
        now()
      );
    end if;
  end if;

  return jsonb_build_object(
    'projectId', v_project.id,
    'submittedBy', v_uid,
    'sourceSellerSubmission', v_is_source_seller,
    'notes', v_notes,
    'submittedAt', now(),
    'requirementsComplete', true,
    'onboardingComplete', true,
    'projectManagerAssigned', v_project.project_manager_id is not null
  );
end;
$function$;

-- The delivery stage shown to clients and staff starts production after the handoff.
-- Legacy Client Onboarding / Requirements requests are accepted only as aliases and
-- normalized immediately to Content so historical callers do not break.
create or replace function public.protect_delivery_stage_staffing()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_blockers text[];
  v_effective_stage text;
begin
  if new.stage is not distinct from old.stage then return new; end if;

  v_effective_stage := new.stage;
  if old.stage = 'Sales Handover' and new.stage in ('Client Onboarding', 'Requirements', 'Content') then
    v_effective_stage := 'Content';
  elsif old.stage in ('Client Onboarding', 'Requirements') and new.stage in ('Requirements', 'Content') then
    v_effective_stage := 'Content';
  end if;

  v_blockers := public.delivery_stage_staffing_blockers(v_effective_stage);
  if coalesce(array_length(v_blockers, 1), 0) > 0 then
    raise exception 'Cannot enter %: %', v_effective_stage, array_to_string(v_blockers, ' ');
  end if;
  return new;
end;
$function$;

create or replace function public.protect_project_stage_workflow()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_expected text;
  v_incomplete integer := 0;
  v_requirements text;
  v_client_decision boolean := coalesce(current_setting('profox.project_client_decision_rpc', true), '') = '1';
  v_content_handoff boolean := coalesce(current_setting('profox.content_handoff_rpc', true), '') = '1';
begin
  if new.stage is not distinct from old.stage then return new; end if;
  if old.status <> 'Active' then raise exception 'Only an active project may change delivery stage.'; end if;

  if v_content_handoff then
    if old.stage <> 'Content' or new.stage <> 'UI/UX Design' then raise exception 'Invalid protected Content handoff transition.'; end if;
    select count(*) into v_incomplete from public.project_tasks t where t.project_id = old.id and t.workflow_stage = 'Content' and t.required_for_stage is true and t.status <> 'Done';
    if v_incomplete > 0 then raise exception 'Complete all required Content workflow tasks before advancing the project. Remaining: %.', v_incomplete; end if;
    return new;
  end if;

  if v_client_decision then
    if old.stage = 'Client Design Approval' and new.stage in ('Development', 'UI/UX Design') then return new; end if;
    if old.stage = 'Client Review' and new.stage = 'Final Revisions' then return new; end if;
    raise exception 'Invalid client-controlled project transition.';
  end if;

  if not public.is_admin() and old.project_manager_id is distinct from auth.uid() then
    raise exception 'Only the assigned Project Manager or Administrator may advance the project.';
  end if;
  if old.stage in ('Client Design Approval', 'Client Review') then
    raise exception 'This stage requires a recorded client decision before delivery can continue.';
  end if;

  select o.requirements_summary into v_requirements
  from public.crm_opportunities o
  where o.id = old.source_opportunity_id;

  if old.stage = 'Sales Handover' then
    if new.stage not in ('Client Onboarding', 'Requirements', 'Content') then
      raise exception 'After Sales Handover, the project must move to Content.';
    end if;
    new.stage := 'Content';

    if old.project_manager_id is null then
      raise exception 'Assign an active Project Manager before completing the Sales handoff.';
    end if;
    if length(btrim(coalesce(v_requirements, ''))) = 0 then
      raise exception 'Seller requirements must be confirmed before production can start.';
    end if;
    if length(btrim(coalesce(old.sales_handover_notes, ''))) < 10 then
      raise exception 'Send the final Sales production brief before releasing the project to Content.';
    end if;
    if not exists(
      select 1 from public.client_onboardings o
      where o.project_id = old.id and o.status = 'Completed' and o.completed_at is not null
    ) then
      raise exception 'Client onboarding must be completed before production can start.';
    end if;
  elsif old.stage in ('Client Onboarding', 'Requirements') then
    if new.stage not in ('Requirements', 'Content') then
      raise exception 'Legacy onboarding/requirements stages must continue directly to Content.';
    end if;
    new.stage := 'Content';
    if length(btrim(coalesce(v_requirements, ''))) = 0 then
      raise exception 'Seller requirements must be confirmed before production can start.';
    end if;
    if not exists(
      select 1 from public.client_onboardings o
      where o.project_id = old.id and o.status = 'Completed' and o.completed_at is not null
    ) then
      raise exception 'Client onboarding must be completed before production can start.';
    end if;
  else
    v_expected := case old.stage
      when 'Content' then 'UI/UX Design'
      when 'UI/UX Design' then 'Client Design Approval'
      when 'Development' then 'QA'
      when 'QA' then 'Client Review'
      when 'Final Revisions' then 'Launch'
      when 'Launch' then 'Handover'
      when 'Handover' then 'Completed'
      else null end;
    if v_expected is null or new.stage <> v_expected then
      raise exception 'Project stages must follow the approved delivery sequence. Expected next stage: %.', coalesce(v_expected, 'none');
    end if;
  end if;

  if old.stage not in ('Client Onboarding', 'Requirements') then
    select count(*) into v_incomplete
    from public.project_tasks t
    where t.project_id = old.id
      and t.workflow_stage = old.stage
      and t.required_for_stage is true
      and t.status <> 'Done';
    if v_incomplete > 0 then
      raise exception 'Complete all required % workflow tasks before advancing the project. Remaining: %.', old.stage, v_incomplete;
    end if;
  end if;

  if new.stage = 'Completed' then
    new.status := 'Completed';
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$function$;

-- Remove the two pre-production concepts from active delivery task generation.
update public.delivery_task_templates
set active = false
where stage_key in ('Client Onboarding', 'Requirements')
  and active is true;

update public.delivery_task_templates
set title = 'Review Production Brief & Release to Content',
    description = 'Validate Seller requirements, accepted quotation/scope, verified payment and completed client onboarding. Mark the review complete, then release the project to Content.'
where workflow_key = 'sales_handover_review';

update public.delivery_task_templates
set description = 'Review the confirmed Seller requirements, accepted quotation/scope, verified payment and completed client onboarding, then send the protected production brief to Project Management.'
where workflow_key = 'sales_handover_submission';

update public.project_tasks
set title = 'Review Production Brief & Release to Content',
    description = 'Validate Seller requirements, accepted quotation/scope, verified payment and completed client onboarding. Mark the review complete, then release the project to Content.',
    updated_at = now()
where workflow_key = 'sales_handover_review'
  and status <> 'Done';

update public.project_tasks
set description = 'Review the confirmed Seller requirements, accepted quotation/scope, verified payment and completed client onboarding, then send the protected production brief to Project Management.',
    updated_at = now()
where workflow_key = 'sales_handover_submission'
  and status <> 'Done';

-- Historical tasks from the removed pre-production project stages must not block
-- a legacy project from normalizing to Content.
update public.project_tasks
set required_for_stage = false,
    updated_at = now()
where workflow_stage in ('Client Onboarding', 'Requirements')
  and status <> 'Done'
  and required_for_stage is true;

revoke all on function public.project_get_sales_handoff_brief(uuid) from public;
grant execute on function public.project_get_sales_handoff_brief(uuid) to authenticated;
revoke all on function public.submit_sales_project_handover(uuid, text) from public;
grant execute on function public.submit_sales_project_handover(uuid, text) to authenticated;

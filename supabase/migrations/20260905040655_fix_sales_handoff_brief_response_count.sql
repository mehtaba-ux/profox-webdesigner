-- Fix production runtime compatibility: this Postgres instance does not expose jsonb_object_length(jsonb).
-- Count object keys with jsonb_object_keys instead, preserving the existing protected handoff contract.

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
    'readyToSend',v_onboarding.status='Completed' and v_onboarding.completed_at is not null and not v_seller_done
  );
end;
$function$;

revoke all on function public.project_get_sales_handoff_brief(uuid) from public,anon;
grant execute on function public.project_get_sales_handoff_brief(uuid) to authenticated,service_role;

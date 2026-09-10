create table public.quotation_sales_coverage (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  scope_condition_id uuid references public.crm_sales_scope_conditions(id) on delete restrict,
  promise_id uuid references public.crm_sales_promises(id) on delete restrict,
  coverage_status text not null,
  target_type text,
  quotation_field_key text,
  quotation_item_id uuid references public.quotation_items(id) on delete set null,
  target_fingerprint text,
  target_excerpt text,
  coverage_note text,
  reviewed_by uuid not null references public.user_profiles(id) on delete restrict,
  reviewed_at timestamptz not null default statement_timestamp(),
  is_current boolean not null default true,
  supersedes_coverage_id uuid references public.quotation_sales_coverage(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint quotation_sales_coverage_one_source check ((scope_condition_id is null) <> (promise_id is null)),
  constraint quotation_sales_coverage_status_check check (coverage_status = any (array['UNMAPPED','PARTIAL','COVERED','CONFLICT','STALE','NOT_APPLICABLE']::text[])),
  constraint quotation_sales_coverage_target_type_check check (target_type is null or target_type = any (array['QUOTATION_FIELD','QUOTATION_ITEM']::text[])),
  constraint quotation_sales_coverage_target_shape_check check (
    (target_type is null and quotation_field_key is null and quotation_item_id is null)
    or (target_type='QUOTATION_FIELD' and quotation_field_key is not null and quotation_item_id is null)
    or (target_type='QUOTATION_ITEM' and quotation_field_key is null)
  ),
  constraint quotation_sales_coverage_note_check check (coverage_note is null or char_length(coverage_note) <= 2000),
  constraint quotation_sales_coverage_excerpt_check check (target_excerpt is null or char_length(target_excerpt) <= 1200)
);

create unique index quotation_sales_coverage_current_scope_uq
  on public.quotation_sales_coverage(quotation_id,scope_condition_id)
  where is_current and scope_condition_id is not null;
create unique index quotation_sales_coverage_current_promise_uq
  on public.quotation_sales_coverage(quotation_id,promise_id)
  where is_current and promise_id is not null;
create index quotation_sales_coverage_quote_idx
  on public.quotation_sales_coverage(quotation_id,is_current,reviewed_at desc);
create index quotation_sales_coverage_item_idx
  on public.quotation_sales_coverage(quotation_item_id)
  where quotation_item_id is not null;

alter table public.quotation_sales_coverage enable row level security;

create policy quotation_sales_coverage_no_direct_authenticated
  on public.quotation_sales_coverage
  for all to authenticated
  using (false)
  with check (false);

revoke all on table public.quotation_sales_coverage from public, anon, authenticated;

insert into public.system_configuration(config_key,config_value,description,updated_at)
values (
  'crm_quotation_sales_reconciliation_policy_v1',
  jsonb_build_object(
    'policyKey','crm_quotation_sales_reconciliation_policy_v1',
    'policyVersion',1,
    'finalQuotationSendGateActive',false,
    'coverageStatuses',jsonb_build_array('UNMAPPED','PARTIAL','COVERED','CONFLICT','STALE','NOT_APPLICABLE'),
    'reviewableStatuses',jsonb_build_array('PARTIAL','COVERED','CONFLICT'),
    'customerVisibleFieldKeys',jsonb_build_array('scope_summary','exclusions','client_responsibilities','delivery_assumptions','handover_support','terms_and_conditions','payment_terms','duration_snapshot_text'),
    'prohibitedFieldKeys',jsonb_build_array('internal_notes','customer_notes'),
    'scopeConditionTargets',jsonb_build_object(
      'ASSUMPTION',jsonb_build_array('delivery_assumptions'),
      'EXCLUSION',jsonb_build_array('exclusions'),
      'DEPENDENCY',jsonb_build_array('delivery_assumptions','client_responsibilities','scope_summary','terms_and_conditions'),
      'CLIENT_RESPONSIBILITY',jsonb_build_array('client_responsibilities'),
      'SCOPE_BOUNDARY',jsonb_build_array('scope_summary','QUOTATION_ITEM','terms_and_conditions')
    ),
    'promiseTargets',jsonb_build_object(
      'SCOPE',jsonb_build_array('scope_summary','QUOTATION_ITEM','terms_and_conditions'),
      'TECHNICAL',jsonb_build_array('QUOTATION_ITEM','scope_summary','terms_and_conditions'),
      'TIMELINE',jsonb_build_array('duration_snapshot_text','terms_and_conditions'),
      'COMMERCIAL',jsonb_build_array('payment_terms','terms_and_conditions'),
      'SUPPORT',jsonb_build_array('handover_support','QUOTATION_ITEM'),
      'COMPLIANCE',jsonb_build_array('scope_summary','terms_and_conditions'),
      'PERFORMANCE_RESULT',jsonb_build_array('scope_summary','terms_and_conditions'),
      'OTHER',jsonb_build_array('scope_summary','QUOTATION_ITEM','terms_and_conditions')
    ),
    'allowNotApplicable',false,
    'historicalStatuses',jsonb_build_array('Sent','Accepted','Rejected','Expired')
  ),
  'Part 10A non-blocking quotation reconciliation policy. Sales reconciliation previews future send readiness but does not activate the final quotation-send gate.',
  statement_timestamp()
)
on conflict (config_key) do update
set config_value=excluded.config_value,
    description=excluded.description,
    updated_at=statement_timestamp();

create or replace function public.crm_quotation_sales_target_evidence(
  p_quotation_id uuid,
  p_target_type text,
  p_quotation_field_key text default null,
  p_quotation_item_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_q public.quotations%rowtype;
  v_i public.quotation_items%rowtype;
  v_content text;
  v_label text;
  v_present boolean := false;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then
    return jsonb_build_object('exists',false,'customerVisible',false,'contentPresent',false);
  end if;

  if p_target_type='QUOTATION_FIELD' then
    if p_quotation_field_key is null or p_quotation_item_id is not null then
      return jsonb_build_object('exists',false,'customerVisible',false,'contentPresent',false);
    end if;
    case p_quotation_field_key
      when 'scope_summary' then v_content:=v_q.scope_summary; v_label:='Scope Summary';
      when 'exclusions' then v_content:=v_q.exclusions; v_label:='Exclusions';
      when 'client_responsibilities' then v_content:=v_q.client_responsibilities; v_label:='Client Responsibilities';
      when 'delivery_assumptions' then v_content:=v_q.delivery_assumptions; v_label:='Delivery Assumptions';
      when 'handover_support' then v_content:=v_q.handover_support; v_label:='Handover & Support';
      when 'terms_and_conditions' then v_content:=v_q.terms_and_conditions; v_label:='Terms & Conditions';
      when 'payment_terms' then v_content:=v_q.payment_terms; v_label:='Payment Terms';
      when 'duration_snapshot_text' then v_content:=v_q.duration_snapshot_text; v_label:='Delivery Timeline';
      else
        return jsonb_build_object('exists',false,'customerVisible',false,'contentPresent',false,'prohibited',p_quotation_field_key in ('internal_notes','customer_notes'));
    end case;
    v_content:=nullif(btrim(coalesce(v_content,'')),'');
    v_present:=v_content is not null;
    return jsonb_build_object(
      'exists',true,'customerVisible',true,'contentPresent',v_present,
      'targetType','QUOTATION_FIELD','fieldKey',p_quotation_field_key,'label',v_label,
      'excerpt',case when v_present then left(v_content,1200) else null end,
      'fingerprint',case when v_present then md5('QUOTATION_FIELD|'||p_quotation_field_key||'|'||v_content) else null end
    );
  elsif p_target_type='QUOTATION_ITEM' then
    if p_quotation_item_id is null or p_quotation_field_key is not null then
      return jsonb_build_object('exists',false,'customerVisible',false,'contentPresent',false);
    end if;
    select * into v_i
    from public.quotation_items
    where id=p_quotation_item_id and quotation_id=p_quotation_id;
    if not found then
      return jsonb_build_object('exists',false,'customerVisible',false,'contentPresent',false);
    end if;
    if coalesce(v_i.line_type,'product') not in ('product','custom') or coalesce(v_i.optional_for_client,false) then
      return jsonb_build_object('exists',true,'customerVisible',false,'contentPresent',false,'itemId',v_i.id,'label',v_i.product_name_snapshot);
    end if;
    v_content:=concat_ws(E'\n',
      nullif(btrim(coalesce(v_i.description_snapshot,'')),''),
      case when coalesce(v_i.configuration_snapshot,'{}'::jsonb) <> '{}'::jsonb then v_i.configuration_snapshot::text end,
      case when coalesce(v_i.client_expectations_snapshot,'[]'::jsonb) not in ('[]'::jsonb,'{}'::jsonb) then v_i.client_expectations_snapshot::text end
    );
    v_content:=nullif(btrim(coalesce(v_content,'')),'');
    v_present:=v_content is not null;
    return jsonb_build_object(
      'exists',true,'customerVisible',true,'contentPresent',v_present,
      'targetType','QUOTATION_ITEM','itemId',v_i.id,'label',v_i.product_name_snapshot,
      'productCode',v_i.product_code_snapshot,
      'excerpt',case when v_present then left(v_content,1200) else null end,
      'fingerprint',case when v_present then md5('QUOTATION_ITEM|'||v_i.id::text||'|'||v_content) else null end
    );
  end if;

  return jsonb_build_object('exists',false,'customerVisible',false,'contentPresent',false);
end;
$function$;

revoke all on function public.crm_quotation_sales_target_evidence(uuid,text,text,uuid) from public, anon, authenticated;

create or replace function public.crm_review_quotation_sales_coverage(
  p_quotation_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_coverage_status text,
  p_target_type text,
  p_quotation_field_key text default null,
  p_quotation_item_id uuid default null,
  p_coverage_note text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_q public.quotations%rowtype;
  v_opp public.crm_opportunities%rowtype;
  v_condition public.crm_sales_scope_conditions%rowtype;
  v_promise public.crm_sales_promises%rowtype;
  v_existing public.quotation_sales_coverage%rowtype;
  v_new public.quotation_sales_coverage%rowtype;
  v_policy jsonb;
  v_eligible jsonb:='[]'::jsonb;
  v_evidence jsonb;
  v_source_label text;
  v_lead_id uuid;
  v_note text:=nullif(btrim(coalesce(p_coverage_note,'')),'');
begin
  if v_uid is null then raise exception 'Authentication is required for quotation Sales reconciliation.'; end if;
  if p_quotation_id is null or p_source_id is null then raise exception 'Quotation and source are required.'; end if;
  if upper(btrim(coalesce(p_source_type,''))) not in ('SCOPE_CONDITION','PROMISE') then raise exception 'Unsupported reconciliation source type.'; end if;
  if upper(btrim(coalesce(p_coverage_status,''))) not in ('PARTIAL','COVERED','CONFLICT') then raise exception 'Coverage review must be Partial, Covered, or Conflict.'; end if;
  if upper(btrim(coalesce(p_target_type,''))) not in ('QUOTATION_FIELD','QUOTATION_ITEM') then raise exception 'A customer-visible quotation target is required.'; end if;
  if v_note is not null and char_length(v_note)>2000 then raise exception 'Coverage note is too long.'; end if;
  if upper(btrim(p_coverage_status)) in ('PARTIAL','CONFLICT') and coalesce(char_length(v_note),0)<3 then raise exception 'Partial or conflicting coverage requires a brief review note.'; end if;

  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if not public.is_admin() and v_q.salesperson_id is distinct from v_uid then raise exception 'Authorized quotation ownership is required.'; end if;
  if v_q.superseded_by_id is not null then raise exception 'Superseded quotation revisions are read-only.'; end if;
  if v_q.status not in ('Draft','Ready for Approval','Approved') then raise exception 'Coverage review is available only before a quotation is delivered.'; end if;
  if v_q.opportunity_id is null then raise exception 'Quotation must be connected to a CRM opportunity before Sales reconciliation.'; end if;

  select * into v_opp from public.crm_opportunities where id=v_q.opportunity_id and archived_at is null;
  if not found or v_opp.lead_id is null then raise exception 'Quotation opportunity is not connected to an active CRM Lead.'; end if;
  v_lead_id:=v_opp.lead_id;
  if not public.crm_can_access_lead(v_lead_id) then raise exception 'Authorized CRM Lead access is required.'; end if;

  select config_value into v_policy from public.system_configuration where config_key='crm_quotation_sales_reconciliation_policy_v1';
  if v_policy is null or v_policy->>'policyKey' is distinct from 'crm_quotation_sales_reconciliation_policy_v1' or nullif(v_policy->>'policyVersion','')::int is distinct from 1 then
    raise exception 'Quotation Sales reconciliation policy is unavailable or unsupported.';
  end if;
  if coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,true) then raise exception 'Part 10A policy must keep final quotation send enforcement inactive.'; end if;

  if upper(btrim(p_source_type))='SCOPE_CONDITION' then
    select * into v_condition from public.crm_sales_scope_conditions where id=p_source_id;
    if not found or v_condition.lead_id is distinct from v_lead_id or (v_condition.opportunity_id is not null and v_condition.opportunity_id is distinct from v_q.opportunity_id) then
      raise exception 'Scope Condition does not belong to this quotation Sales lifecycle.';
    end if;
    if v_condition.state<>'ACTIVE' then raise exception 'Only a current Active Scope Condition can be reviewed for quotation coverage.'; end if;
    v_eligible:=coalesce(v_policy #> array['scopeConditionTargets',v_condition.condition_type],'[]'::jsonb);
    v_source_label:=v_condition.condition_type||': '||v_condition.title;
  else
    select * into v_promise from public.crm_sales_promises where id=p_source_id;
    if not found or v_promise.lead_id is distinct from v_lead_id or (v_promise.opportunity_id is not null and v_promise.opportunity_id is distinct from v_q.opportunity_id) then
      raise exception 'Promise does not belong to this quotation Sales lifecycle.';
    end if;
    if v_promise.record_state<>'ACTIVE' then raise exception 'Only a current Active Promise can be reviewed for quotation coverage.'; end if;
    v_eligible:=coalesce(v_policy #> array['promiseTargets',v_promise.promise_type],'[]'::jsonb);
    v_source_label:=v_promise.promise_type||' Promise';
  end if;

  if jsonb_typeof(v_eligible) is distinct from 'array' then raise exception 'Quotation target policy is malformed for this source.'; end if;
  if upper(btrim(p_target_type))='QUOTATION_FIELD' then
    if p_quotation_field_key is null or not (v_eligible ? p_quotation_field_key) then raise exception 'This quotation field is not an eligible coverage target for the selected source.'; end if;
    if coalesce(v_policy->'prohibitedFieldKeys','[]'::jsonb) ? p_quotation_field_key then raise exception 'Internal/customer note fields cannot satisfy material Sales coverage.'; end if;
  else
    if not (v_eligible ? 'QUOTATION_ITEM') then raise exception 'A quotation item is not an eligible target for the selected source.'; end if;
    if p_quotation_item_id is null then raise exception 'Quotation item target is required.'; end if;
  end if;

  v_evidence:=public.crm_quotation_sales_target_evidence(p_quotation_id,upper(btrim(p_target_type)),p_quotation_field_key,p_quotation_item_id);
  if not coalesce((v_evidence->>'exists')::boolean,false) then raise exception 'Quotation target does not exist for this quotation.'; end if;
  if not coalesce((v_evidence->>'customerVisible')::boolean,false) then raise exception 'Coverage target must be a committed customer-visible quotation destination.'; end if;
  if not coalesce((v_evidence->>'contentPresent')::boolean,false) or nullif(v_evidence->>'fingerprint','') is null then raise exception 'Coverage target must contain meaningful current customer-visible content.'; end if;

  if upper(btrim(p_source_type))='SCOPE_CONDITION' then
    select * into v_existing from public.quotation_sales_coverage
    where quotation_id=p_quotation_id and scope_condition_id=p_source_id and is_current
    limit 1 for update;
  else
    select * into v_existing from public.quotation_sales_coverage
    where quotation_id=p_quotation_id and promise_id=p_source_id and is_current
    limit 1 for update;
  end if;

  if found
     and v_existing.coverage_status=upper(btrim(p_coverage_status))
     and v_existing.target_type=upper(btrim(p_target_type))
     and v_existing.quotation_field_key is not distinct from p_quotation_field_key
     and v_existing.quotation_item_id is not distinct from p_quotation_item_id
     and v_existing.target_fingerprint is not distinct from v_evidence->>'fingerprint'
     and v_existing.coverage_note is not distinct from v_note then
    return jsonb_build_object('coverageId',v_existing.id,'idempotent',true,'coverageStatus',v_existing.coverage_status,'reviewedBy',v_existing.reviewed_by,'reviewedAt',v_existing.reviewed_at,'targetFingerprint',v_existing.target_fingerprint);
  end if;

  if v_existing.id is not null then
    update public.quotation_sales_coverage
    set is_current=false,updated_at=statement_timestamp()
    where id=v_existing.id;
  end if;

  insert into public.quotation_sales_coverage(
    quotation_id,scope_condition_id,promise_id,coverage_status,target_type,quotation_field_key,quotation_item_id,
    target_fingerprint,target_excerpt,coverage_note,reviewed_by,reviewed_at,is_current,supersedes_coverage_id
  ) values (
    p_quotation_id,
    case when upper(btrim(p_source_type))='SCOPE_CONDITION' then p_source_id else null end,
    case when upper(btrim(p_source_type))='PROMISE' then p_source_id else null end,
    upper(btrim(p_coverage_status)),upper(btrim(p_target_type)),
    case when upper(btrim(p_target_type))='QUOTATION_FIELD' then p_quotation_field_key else null end,
    case when upper(btrim(p_target_type))='QUOTATION_ITEM' then p_quotation_item_id else null end,
    v_evidence->>'fingerprint',left(v_evidence->>'excerpt',1200),v_note,v_uid,statement_timestamp(),true,v_existing.id
  ) returning * into v_new;

  perform public.crm_write_lead_event(
    v_lead_id,
    'quotation_sales_coverage_reviewed',
    'Quotation Sales coverage reviewed',
    left(v_source_label||' was reviewed against '||coalesce(v_evidence->>'label','a customer-visible quotation target')||' as '||upper(btrim(p_coverage_status))||'.',5000),
    jsonb_build_object('quotationId',p_quotation_id,'coverageId',v_new.id,'sourceType',upper(btrim(p_source_type)),'sourceId',p_source_id,'coverageStatus',v_new.coverage_status,'targetType',v_new.target_type,'quotationFieldKey',v_new.quotation_field_key,'quotationItemId',v_new.quotation_item_id),
    v_uid,null,null,statement_timestamp(),null
  );

  return jsonb_build_object('coverageId',v_new.id,'idempotent',false,'coverageStatus',v_new.coverage_status,'reviewedBy',v_new.reviewed_by,'reviewedAt',v_new.reviewed_at,'targetFingerprint',v_new.target_fingerprint);
end;
$function$;

revoke all on function public.crm_review_quotation_sales_coverage(uuid,text,uuid,text,text,text,uuid,text) from public, anon;
grant execute on function public.crm_review_quotation_sales_coverage(uuid,text,uuid,text,text,text,uuid,text) to authenticated;
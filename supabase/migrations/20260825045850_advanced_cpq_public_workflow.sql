-- Advanced ProFox CPQ: professional presentation, revisions, sending, public response and immutable snapshots.

create or replace function public.quotation_payment_schedule_preview(p_quotation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare
  v_q public.quotations%rowtype;
  v_res jsonb;
  v_schedule jsonb;
  v_source text;
  v_error text;
  v_item jsonb;
  v_out jsonb:='[]'::jsonb;
  v_number integer;
  v_max integer;
  v_pct numeric;
  v_amount numeric;
  v_allocated numeric:=0;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then return jsonb_build_object('schedule','[]'::jsonb,'error','Quotation not found.'); end if;
  if v_q.payment_schedule_snapshot is not null then
    v_schedule:=v_q.payment_schedule_snapshot;
    v_source:=v_q.payment_schedule_source_code;
  else
    begin
      v_res:=public.resolve_quotation_payment_schedule(p_quotation_id);
      v_schedule:=v_res->'schedule';
      v_source:=v_res->>'sourceCode';
    exception when others then
      v_error:=sqlerrm;
      return jsonb_build_object('schedule','[]'::jsonb,'sourceCode',null,'error',v_error,'snapshotted',false);
    end;
  end if;
  if v_schedule is null or jsonb_typeof(v_schedule)<>'array' or jsonb_array_length(v_schedule)=0 then
    return jsonb_build_object('schedule','[]'::jsonb,'sourceCode',v_source,'error','Payment schedule is not configured.','snapshotted',v_q.payment_schedule_snapshot is not null);
  end if;
  select max((x->>'milestoneNumber')::int) into v_max from jsonb_array_elements(v_schedule) x;
  for v_item in select value from jsonb_array_elements(v_schedule) order by (value->>'milestoneNumber')::int loop
    v_number:=coalesce((v_item->>'milestoneNumber')::int,1);
    v_pct:=coalesce((v_item->>'percentage')::numeric,0);
    if v_number=v_max then
      v_amount:=round((v_q.total-v_allocated)::numeric,2);
    else
      v_amount:=round((v_q.total*v_pct/100.0)::numeric,2);
      v_allocated:=v_allocated+v_amount;
    end if;
    v_out:=v_out||jsonb_build_array(v_item||jsonb_build_object('amount',v_amount,'currency',v_q.currency));
  end loop;
  return jsonb_build_object('schedule',v_out,'sourceCode',v_source,'error',null,'snapshotted',v_q.payment_schedule_snapshot is not null,'capturedAt',v_q.payment_schedule_snapshotted_at);
end;
$$;
revoke all on function public.quotation_payment_schedule_preview(uuid) from public, anon, authenticated, service_role;
grant execute on function public.quotation_payment_schedule_preview(uuid) to postgres;

create or replace function public.quotation_presentation_payload(p_quotation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare
  v_q public.quotations%rowtype;
  v_items jsonb:='[]'::jsonb;
  v_cfg jsonb:=public.quotation_cpq_settings_safe();
  v_comm jsonb:='{}'::jsonb;
  v_payment jsonb;
  v_owner_name text:='ProFox';
  v_owner_email text;
  v_owner_phone text;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_comm from public.system_configuration where config_key='communication_settings';
  if v_q.salesperson_id is not null then
    select coalesce(nullif(full_name,''),'ProFox'),nullif(email,''),nullif(phone,'') into v_owner_name,v_owner_email,v_owner_phone from public.user_profiles where id=v_q.salesperson_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',qi.id,
    'salesProductId',qi.sales_product_id,
    'productCode',qi.product_code_snapshot,
    'productName',qi.product_name_snapshot,
    'description',qi.description_snapshot,
    'quantity',qi.quantity,
    'unitPrice',qi.unit_price,
    'grossTotal',round((qi.quantity*qi.unit_price)::numeric,2),
    'discountType',qi.discount_type,
    'discountValue',qi.discount_value,
    'discountAmount',qi.discount_amount,
    'lineTotal',qi.line_total,
    'itemType',qi.item_type,
    'lineType',qi.line_type,
    'optionalForClient',qi.optional_for_client,
    'sectionKey',qi.section_key,
    'configuration',coalesce(qi.configuration_snapshot,'{}'::jsonb),
    'clientExpectations',coalesce(qi.client_expectations_snapshot,'{}'::jsonb),
    'durationMin',qi.duration_min_snapshot,
    'durationMax',qi.duration_max_snapshot,
    'durationUnit',qi.duration_unit_snapshot,
    'timelineImpact',qi.timeline_impact_snapshot,
    'durationNote',qi.duration_note_snapshot
  ) order by qi.sort_order,qi.created_at),'[]'::jsonb) into v_items
  from public.quotation_items qi where qi.quotation_id=v_q.id;
  v_payment:=public.quotation_payment_schedule_preview(v_q.id);
  return jsonb_build_object(
    'id',v_q.id,
    'quotationNumber',v_q.quotation_number,
    'revisionNumber',v_q.revision_number,
    'revisionRootId',v_q.revision_root_id,
    'previousRevisionId',v_q.previous_revision_id,
    'supersededById',v_q.superseded_by_id,
    'isSuperseded',v_q.superseded_by_id is not null,
    'quotationTemplateKey',v_q.quotation_template_key,
    'proposalTitle',coalesce(nullif(v_q.proposal_title,''),nullif(v_cfg->>'defaultProposalTitle',''),'Digital Project Proposal'),
    'executiveSummary',v_q.executive_summary,
    'coverMessage',coalesce(nullif(v_q.cover_message,''),nullif(v_cfg->>'defaultCoverMessage','')),
    'customerName',v_q.customer_name,
    'contactName',v_q.contact_name,
    'email',v_q.email,
    'phone',v_q.phone,
    'country',v_q.country,
    'currency',v_q.currency,
    'status',v_q.status,
    'preparedAt',v_q.created_at,
    'validUntil',v_q.valid_until,
    'sentAt',v_q.sent_at,
    'acceptedAt',v_q.accepted_at,
    'rejectedAt',v_q.rejected_at,
    'scopeSummary',v_q.scope_summary,
    'paymentTerms',v_q.payment_terms,
    'exclusions',v_q.exclusions,
    'customerNotes',v_q.customer_notes,
    'clientResponsibilities',v_q.client_responsibilities,
    'deliveryAssumptions',v_q.delivery_assumptions,
    'reviewProcess',v_q.review_process,
    'handoverSupport',v_q.handover_support,
    'termsAndConditions',coalesce(nullif(v_q.terms_and_conditions,''),nullif(v_cfg->>'standardTerms','')),
    'acceptanceMethod',v_q.acceptance_method,
    'subtotal',v_q.subtotal,
    'lineDiscountTotal',v_q.line_discount_total,
    'quoteDiscountType',v_q.quote_discount_type,
    'quoteDiscountValue',v_q.quote_discount_value,
    'quoteDiscountTotal',v_q.quote_discount_total,
    'optionalTotal',v_q.optional_total,
    'taxLabel',coalesce(nullif(v_cfg->>'taxLabel',''),'Tax'),
    'taxRate',v_q.tax_rate,
    'taxTotal',v_q.tax_total,
    'total',v_q.total,
    'estimatedDurationMin',v_q.estimated_duration_min,
    'estimatedDurationMax',v_q.estimated_duration_max,
    'durationUnit',v_q.duration_unit,
    'durationSnapshotText',v_q.duration_snapshot_text,
    'durationSource',v_q.duration_source,
    'durationRequiresAssessment',v_q.duration_requires_assessment,
    'paymentPlan',v_payment,
    'firstViewedAt',v_q.first_viewed_at,
    'lastViewedAt',v_q.last_viewed_at,
    'viewCount',v_q.view_count,
    'changeRequestedAt',v_q.change_requested_at,
    'items',v_items,
    'preparedBy',jsonb_build_object('name',coalesce(v_owner_name,'ProFox'),'email',v_owner_email,'phone',v_owner_phone),
    'branding',jsonb_build_object(
      'businessName',coalesce(nullif(v_cfg->>'businessName',''),'ProFox Web Designer'),
      'registeredName',coalesce(nullif(v_cfg->>'registeredName',''),'ProFox Digital Solution'),
      'websiteUrl',coalesce(nullif(v_cfg->>'websiteUrl',''),nullif(v_comm->>'websiteUrl',''),'https://www.profoxwebdesigner.com'),
      'contactEmail',coalesce(nullif(v_cfg->>'contactEmail',''),nullif(v_comm->>'defaultReplyTo',''),'contact@profoxwebdesigner.com'),
      'brandLine',coalesce(nullif(v_cfg->>'brandLine',''),nullif(v_comm->>'brandLine',''),'From site to system.')
    )
  );
end;
$$;
revoke all on function public.quotation_presentation_payload(uuid) from public, anon, authenticated, service_role;
grant execute on function public.quotation_presentation_payload(uuid) to postgres;

create or replace function public.get_quotation_cpq_summary(p_quotation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare
  v_q public.quotations%rowtype;
  v_presentation jsonb;
  v_payment jsonb;
  v_reasons text[];
  v_missing text[]:='{}'::text[];
  v_has_scope boolean;
  v_email_ok boolean;
  v_expiry_ok boolean;
  v_payment_ok boolean;
  v_timeline_ok boolean;
  v_ready boolean;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then raise exception 'Quotation not found.'; end if;
  if not public.is_admin() and v_q.salesperson_id is distinct from auth.uid() and not public.has_active_role(array['project_manager','site_manager']) then raise exception 'Unauthorized.'; end if;
  v_presentation:=public.quotation_presentation_payload(p_quotation_id);
  v_payment:=v_presentation->'paymentPlan';
  v_reasons:=public.quotation_cpq_approval_reasons(p_quotation_id);
  select exists(select 1 from public.quotation_items where quotation_id=p_quotation_id and line_type in ('product','custom') and optional_for_client=false) into v_has_scope;
  v_email_ok:=coalesce(v_q.email,'')~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
  v_expiry_ok:=v_q.valid_until is not null and v_q.valid_until>=current_date;
  v_payment_ok:=coalesce(v_payment->>'error','')='' and jsonb_typeof(v_payment->'schedule')='array' and jsonb_array_length(v_payment->'schedule')>0;
  v_timeline_ok:=coalesce(v_q.duration_requires_assessment,true)=false and nullif(btrim(coalesce(v_q.duration_snapshot_text,'')),'') is not null;
  if v_q.opportunity_id is null then v_missing:=array_append(v_missing,'CRM Opportunity linked'); end if;
  if not v_email_ok then v_missing:=array_append(v_missing,'Customer email available'); end if;
  if not v_has_scope then v_missing:=array_append(v_missing,'At least one committed product/service'); end if;
  if coalesce(v_q.total,0)<=0 then v_missing:=array_append(v_missing,'Pricing valid'); end if;
  if not v_timeline_ok then v_missing:=array_append(v_missing,'Timeline confirmed'); end if;
  if not v_payment_ok then v_missing:=array_append(v_missing,'Payment schedule valid'); end if;
  if v_q.status<>'Approved' then v_missing:=array_append(v_missing,'Required approval completed'); end if;
  if not v_expiry_ok then v_missing:=array_append(v_missing,'Expiration date valid'); end if;
  if v_q.superseded_by_id is not null then v_missing:=array_append(v_missing,'Current revision'); end if;
  v_ready:=cardinality(v_missing)=0;
  return jsonb_build_object(
    'presentation',v_presentation,
    'approval',jsonb_build_object('required',cardinality(v_reasons)>0,'reasons',to_jsonb(v_reasons),'status',v_q.status,'route',v_q.approval_route,'reason',v_q.approval_reason),
    'readiness',jsonb_build_object('readyToSend',v_ready,'missing',to_jsonb(v_missing),'opportunityLinked',v_q.opportunity_id is not null,'emailAvailable',v_email_ok,'hasProductOrService',v_has_scope,'pricingValid',coalesce(v_q.total,0)>0,'timelineConfirmed',v_timeline_ok,'paymentScheduleValid',v_payment_ok,'approvalCompleted',v_q.status='Approved','expirationValid',v_expiry_ok,'currentRevision',v_q.superseded_by_id is null),
    'views',jsonb_build_object('firstViewedAt',v_q.first_viewed_at,'lastViewedAt',v_q.last_viewed_at,'viewCount',v_q.view_count)
  );
end;
$$;
revoke all on function public.get_quotation_cpq_summary(uuid) from public, anon;
grant execute on function public.get_quotation_cpq_summary(uuid) to authenticated, service_role, postgres;

create or replace function public.admin_approve_quotation_cpq(p_quotation_id uuid,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare v_q public.quotations%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if v_q.status<>'Ready for Approval' then raise exception 'Only a quotation waiting for approval can be manager-approved.'; end if;
  if v_q.superseded_by_id is not null then raise exception 'A superseded revision cannot be approved.'; end if;
  if not exists(select 1 from public.quotation_items where quotation_id=p_quotation_id and optional_for_client=false and line_type in ('product','custom')) then raise exception 'At least one committed product or service is required.'; end if;
  update public.quotations set status='Approved',approval_required=false,approval_route='manager_approved',approval_reason=coalesce(nullif(btrim(coalesce(p_note,'')),''),'Reviewed and approved by Management.'),approval_checked_at=now(),approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=p_quotation_id;
  return public.get_quotation_cpq_summary(p_quotation_id);
end;
$$;
revoke all on function public.admin_approve_quotation_cpq(uuid,text) from public, anon;
grant execute on function public.admin_approve_quotation_cpq(uuid,text) to authenticated, service_role, postgres;

create or replace function public.protect_quotation_commercial_terms()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare v_locked boolean:=old.sent_at is not null or old.first_viewed_at is not null or old.status in ('Sent','Accepted','Rejected','Expired');
begin
  if not v_locked then return new; end if;
  if new.opportunity_id is distinct from old.opportunity_id
    or new.salesperson_id is distinct from old.salesperson_id
    or new.customer_name is distinct from old.customer_name
    or new.contact_name is distinct from old.contact_name
    or new.email is distinct from old.email
    or new.phone is distinct from old.phone
    or new.country is distinct from old.country
    or new.currency is distinct from old.currency
    or new.valid_until is distinct from old.valid_until
    or new.payment_terms is distinct from old.payment_terms
    or new.scope_summary is distinct from old.scope_summary
    or new.exclusions is distinct from old.exclusions
    or new.subtotal is distinct from old.subtotal
    or new.total is distinct from old.total
    or new.quotation_template_key is distinct from old.quotation_template_key
    or new.proposal_title is distinct from old.proposal_title
    or new.executive_summary is distinct from old.executive_summary
    or new.cover_message is distinct from old.cover_message
    or new.client_responsibilities is distinct from old.client_responsibilities
    or new.delivery_assumptions is distinct from old.delivery_assumptions
    or new.review_process is distinct from old.review_process
    or new.handover_support is distinct from old.handover_support
    or new.terms_and_conditions is distinct from old.terms_and_conditions
    or new.acceptance_method is distinct from old.acceptance_method
    or new.quote_discount_type is distinct from old.quote_discount_type
    or new.quote_discount_value is distinct from old.quote_discount_value
    or new.line_discount_total is distinct from old.line_discount_total
    or new.quote_discount_total is distinct from old.quote_discount_total
    or new.optional_total is distinct from old.optional_total
    or new.tax_rate is distinct from old.tax_rate
    or new.tax_total is distinct from old.tax_total
    or new.payment_schedule_snapshot is distinct from old.payment_schedule_snapshot
    or new.estimated_duration_min is distinct from old.estimated_duration_min
    or new.estimated_duration_max is distinct from old.estimated_duration_max
    or new.duration_snapshot_text is distinct from old.duration_snapshot_text
  then
    raise exception 'Delivered quotation commercial terms are immutable. Create a new revision for material changes.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_quotation_commercial_terms() from public, anon, authenticated, service_role;
grant execute on function public.protect_quotation_commercial_terms() to postgres;
drop trigger if exists trg_protect_quotation_commercial_terms on public.quotations;
create trigger trg_protect_quotation_commercial_terms before update on public.quotations for each row execute function public.protect_quotation_commercial_terms();

create or replace function public.snapshot_quotation_payment_schedule_before_send()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare v_res jsonb; v_items jsonb:='[]'::jsonb;
begin
  if new.status='Sent' and old.status is distinct from new.status then
    if coalesce(new.total,0)<=0 then raise exception 'Quotation total must be greater than zero before sending.'; end if;
    if coalesce(new.duration_requires_assessment,true) or nullif(btrim(coalesce(new.duration_snapshot_text,'')),'') is null then raise exception 'Confirm the estimated project delivery timeline before sending this quotation.'; end if;
    if new.payment_schedule_snapshot is null then
      v_res:=public.resolve_quotation_payment_schedule(new.id);
      new.payment_schedule_snapshot:=v_res->'schedule'; new.payment_schedule_source_code:=v_res->>'sourceCode'; new.payment_schedule_snapshotted_at:=now();
      new.payment_terms:=coalesce(nullif(btrim(new.payment_terms),''),nullif(btrim(v_res->>'standardPaymentTerms'),''));
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',qi.id,'salesProductId',qi.sales_product_id,'productCode',qi.product_code_snapshot,'productName',qi.product_name_snapshot,'description',qi.description_snapshot,'quantity',qi.quantity,'unitPrice',qi.unit_price,'grossTotal',round((qi.quantity*qi.unit_price)::numeric,2),'discountType',qi.discount_type,'discountValue',qi.discount_value,'discountAmount',qi.discount_amount,'lineTotal',qi.line_total,'itemType',qi.item_type,'lineType',qi.line_type,'optionalForClient',qi.optional_for_client,'sectionKey',qi.section_key,'configuration',qi.configuration_snapshot,'clientExpectations',qi.client_expectations_snapshot,'durationMin',qi.duration_min_snapshot,'durationMax',qi.duration_max_snapshot,'durationUnit',qi.duration_unit_snapshot,'timelineImpact',qi.timeline_impact_snapshot,'durationNote',qi.duration_note_snapshot
    ) order by qi.sort_order,qi.created_at),'[]'::jsonb) into v_items from public.quotation_items qi where qi.quotation_id=new.id;
    new.commercial_snapshot:=jsonb_build_object(
      'quotationNumber',new.quotation_number,'revisionNumber',new.revision_number,'proposalTitle',new.proposal_title,'customerName',new.customer_name,'contactName',new.contact_name,'email',new.email,'phone',new.phone,'country',new.country,'currency',new.currency,'validUntil',new.valid_until,'paymentTerms',new.payment_terms,'scopeSummary',new.scope_summary,'exclusions',new.exclusions,'executiveSummary',new.executive_summary,'coverMessage',new.cover_message,'clientResponsibilities',new.client_responsibilities,'deliveryAssumptions',new.delivery_assumptions,'reviewProcess',new.review_process,'handoverSupport',new.handover_support,'termsAndConditions',new.terms_and_conditions,'subtotal',new.subtotal,'lineDiscountTotal',new.line_discount_total,'quoteDiscountType',new.quote_discount_type,'quoteDiscountValue',new.quote_discount_value,'quoteDiscountTotal',new.quote_discount_total,'optionalTotal',new.optional_total,'taxRate',new.tax_rate,'taxTotal',new.tax_total,'total',new.total,'timeline',jsonb_build_object('min',new.estimated_duration_min,'max',new.estimated_duration_max,'unit',new.duration_unit,'text',new.duration_snapshot_text,'source',new.duration_source),'paymentSchedule',new.payment_schedule_snapshot,'items',v_items
    );
    new.commercial_snapshotted_at:=now();
  end if;
  return new;
end;
$$;

create or replace function public.quotation_customer_communication_context(p_quotation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare v_q public.quotations%rowtype; v_service text; v_total text; v_valid text; v_terms text; v_scope text; v_subject text; v_message text;
begin
  select * into v_q from public.quotations where id=p_quotation_id;
  if not found then return '{}'::jsonb; end if;
  select product_name_snapshot into v_service from public.quotation_items where quotation_id=v_q.id and line_type in ('product','custom') and optional_for_client=false order by (item_type='package') desc,sort_order,id limit 1;
  v_service:=coalesce(nullif(trim(v_service),''),'your project');
  v_total:=trim(to_char(coalesce(v_q.total,0),'FM999999999990.00'));
  v_valid:=case when v_q.valid_until is null then 'the date agreed with your ProFox contact' else to_char(v_q.valid_until,'FMMonth DD, YYYY') end;
  v_terms:=coalesce(nullif(trim(v_q.payment_terms),''),'As agreed in the quotation');
  v_scope:=coalesce(nullif(trim(v_q.scope_summary),''),'The agreed project scope is included in the quotation.');
  v_subject:=coalesce(nullif(trim(v_q.send_subject),''),'Your ProFox proposal is ready: '||v_q.quotation_number);
  v_message:=coalesce(nullif(trim(v_q.send_message),''),'Thank you for the opportunity to prepare this proposal. Please review the scope, investment, timeline and payment plan using the secure link below.');
  return jsonb_build_object('quotationNumber',v_q.quotation_number,'revisionNumber',v_q.revision_number,'serviceLabel',v_service,'currency',coalesce(nullif(trim(v_q.currency),''),'USD'),'totalFormatted',v_total,'validUntil',coalesce(v_q.valid_until::text,''),'validUntilHuman',v_valid,'paymentTerms',v_terms,'scopeSummary',v_scope,'emailSubject',v_subject,'personalMessage',v_message);
end;
$$;

create or replace function public.notify_quotation_customer_event()
returns trigger
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $$
declare v_context jsonb; v_key text; v_template text; v_token text; v_base_url text; v_quote_url text; v_cc text;
begin
  if tg_op<>'UPDATE' or new.status is not distinct from old.status then return new; end if;
  if lower(trim(coalesce(new.email,'')))='' then return new; end if;
  if new.status='Sent' then
    v_key:='customer-quotation-sent:'||new.id::text; v_template:='customer_quotation_sent'; v_token:=encode(extensions.gen_random_bytes(32),'hex');
    select nullif(btrim(config_value->>'url'),'') into v_base_url from public.system_configuration where config_key='public_app_base_url';
    v_base_url:=rtrim(coalesce(v_base_url,'https://www.profoxwebdesigner.com'),'/'); v_quote_url:=v_base_url||'/quotation/review/'||v_token;
    perform set_config('profox.quotation_view_tracking_rpc','1',true);
    update public.quotations set customer_view_token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),customer_view_token_issued_at=now(),first_viewed_at=null,last_viewed_at=null,view_count=0,updated_at=now() where id=new.id;
    perform set_config('profox.quotation_view_tracking_rpc','',true);
  elsif new.status='Accepted' then v_key:='customer-quotation-accepted:'||new.id::text; v_template:='customer_quotation_accepted';
  elsif new.status='Rejected' then v_key:='customer-quotation-closed:'||new.id::text; v_template:='customer_quotation_closed';
  else return new; end if;
  v_context:=public.quotation_customer_communication_context(new.id);
  if v_quote_url is not null then v_context:=v_context||jsonb_build_object('quotationUrl',v_quote_url); end if;
  perform public.service_queue_customer_communication(v_key,v_template,new.email,new.salesperson_id,new.contact_name,new.customer_name,v_context,now());
  if new.status='Sent' and array_length(new.send_cc,1) is not null then
    foreach v_cc in array new.send_cc loop
      if lower(btrim(coalesce(v_cc,'')))<>'' and lower(btrim(v_cc))<>lower(btrim(new.email)) then
        perform public.service_queue_customer_communication('customer-quotation-sent-cc:'||new.id::text||':'||lower(btrim(v_cc)),v_template,v_cc,new.salesperson_id,new.contact_name,new.customer_name,v_context,now());
      end if;
    end loop;
  end if;
  return new;
exception when others then
  perform set_config('profox.quotation_view_tracking_rpc','',true);
  raise;
end;
$$;

update public.notification_templates
set subject_template='{{emailSubject}}',
    body_template='Hi {{contactFirstName}},\n\n{{personalMessage}}\n\nProposal: {{quotationNumber}}\nInvestment: {{currency}} {{totalFormatted}}\nValid until: {{validUntilHuman}}\nPayment terms: {{paymentTerms}}\n\nReview Your Proposal\n{{quotationUrl}}\n\nScope\n{{scopeSummary}}\n\nIf anything needs clarification, reply directly to this email.\n\n{{ownerName}}\nProFox\n{{brandLine}}',
    description='Professional ProFox proposal delivery message using the existing secure quotation link and customer communication infrastructure.',
    updated_at=now()
where template_key='customer_quotation_sent';

create or replace function public.open_public_quotation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $$
declare v_hash text; v_quote public.quotations%rowtype; v_first_open boolean:=false;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Quotation link is invalid.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_quote from public.quotations where customer_view_token_hash=v_hash and customer_view_token_issued_at is not null and status in ('Sent','Accepted','Rejected','Expired') for update;
  if not found then raise exception 'Quotation link is invalid or no longer available.'; end if;
  v_first_open:=v_quote.first_viewed_at is null;
  perform set_config('profox.quotation_view_tracking_rpc','1',true);
  update public.quotations set first_viewed_at=coalesce(first_viewed_at,now()),last_viewed_at=now(),view_count=view_count+1,updated_at=now() where id=v_quote.id returning * into v_quote;
  perform set_config('profox.quotation_view_tracking_rpc','',true);
  if v_first_open and v_quote.salesperson_id is not null then perform public.service_queue_staff_operational_notification(v_quote.salesperson_id,'quotation-opened:'||v_quote.id::text,'quotation_opened','Quotation','Quotation opened - '||v_quote.quotation_number,coalesce(nullif(v_quote.customer_name,''),'Customer')||' opened the quotation for the first time.','/admin/focus/quotation/'||v_quote.id::text,jsonb_build_object('quotationNumber',v_quote.quotation_number,'customerName',v_quote.customer_name,'currency',v_quote.currency,'total',v_quote.total,'firstViewedAt',v_quote.first_viewed_at),now()); end if;
  return public.quotation_presentation_payload(v_quote.id);
exception when others then
  perform set_config('profox.quotation_view_tracking_rpc','',true);
  raise;
end;
$$;
revoke all on function public.open_public_quotation(text) from public;
grant execute on function public.open_public_quotation(text) to anon, authenticated, service_role, postgres;

create or replace function public.respond_public_quotation(p_token text,p_response text,p_note text default ''::text)
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $$
declare v_hash text; v_quote public.quotations%rowtype; v_response text:=lower(btrim(coalesce(p_response,''))); v_note text:=left(btrim(coalesce(p_note,'')),2000); v_payment jsonb:='{}'::jsonb;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Quotation link is invalid.'; end if;
  if v_response not in ('accept','reject','request_changes') then raise exception 'Choose Accept, Request Changes, or Decline.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_quote from public.quotations where customer_view_token_hash=v_hash for update;
  if not found then raise exception 'Quotation link is invalid or no longer available.'; end if;
  if v_quote.superseded_by_id is not null then raise exception 'This quotation has been superseded by a newer revision. Please review the latest proposal from ProFox.'; end if;
  if v_quote.status='Accepted' and v_response='accept' then v_payment:=public.sync_quotation_payment_plan(v_quote.id); return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status','Accepted','acceptedAt',v_quote.accepted_at,'payment',v_payment); end if;
  if v_quote.status='Rejected' and v_response='reject' then return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status','Rejected','rejectedAt',v_quote.rejected_at); end if;
  if v_quote.status<>'Sent' then raise exception 'This quotation can no longer be changed from this link.'; end if;
  if v_quote.valid_until is not null and v_quote.valid_until<current_date then raise exception 'This quotation has expired. Please contact ProFox for an updated quotation.'; end if;
  if v_response='request_changes' then
    if v_note='' then raise exception 'Please describe your question or requested change.'; end if;
    update public.quotations set change_requested_at=now(),change_request_note=v_note,updated_at=now() where id=v_quote.id returning * into v_quote;
    if v_quote.salesperson_id is not null then perform public.service_queue_staff_operational_notification(v_quote.salesperson_id,'quotation-change-requested:'||v_quote.id::text||':'||extract(epoch from v_quote.change_requested_at)::bigint,'quotation_change_requested','Quotation','Customer requested changes — '||v_quote.quotation_number,coalesce(nullif(v_quote.customer_name,''),'Customer')||' asked a question or requested a quotation change.','/admin/app/sales?tab=quotations',jsonb_build_object('quotationNumber',v_quote.quotation_number,'customerName',v_quote.customer_name,'note',v_note),now()); end if;
    return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status',v_quote.status,'changeRequestedAt',v_quote.change_requested_at,'message','Your request has been sent to ProFox.');
  end if;
  if v_response='accept' and v_quote.payment_schedule_snapshot is null then perform public.snapshot_quotation_payment_schedule(v_quote.id); end if;
  perform set_config('profox.quotation_atomic_rpc','1',true);
  if v_response='accept' then
    update public.quotations set status='Accepted',accepted_at=coalesce(accepted_at,now()),rejected_at=null,customer_notes=case when v_note='' then customer_notes else concat_ws(E'\n',nullif(customer_notes,''),'Customer response: '||v_note) end,updated_at=now() where id=v_quote.id returning * into v_quote;
  else
    update public.quotations set status='Rejected',rejected_at=coalesce(rejected_at,now()),customer_notes=case when v_note='' then customer_notes else concat_ws(E'\n',nullif(customer_notes,''),'Customer response: '||v_note) end,updated_at=now() where id=v_quote.id returning * into v_quote;
  end if;
  perform set_config('profox.quotation_atomic_rpc','',true);
  if v_response='accept' then v_payment:=public.sync_quotation_payment_plan(v_quote.id); end if;
  return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status',v_quote.status,'acceptedAt',v_quote.accepted_at,'rejectedAt',v_quote.rejected_at,'payment',v_payment);
exception when others then perform set_config('profox.quotation_atomic_rpc','',true); raise;
end;
$$;
revoke all on function public.respond_public_quotation(text,text,text) from public;
grant execute on function public.respond_public_quotation(text,text,text) to anon, authenticated, service_role, postgres;

create or replace function public.duplicate_quotation_cpq(p_quotation_id uuid)
returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare v_source public.quotations%rowtype; v_new uuid; v_days int:=coalesce((public.quotation_cpq_settings_safe()->>'defaultValidityDays')::int,30); r public.quotation_items%rowtype;
begin
  select * into v_source from public.quotations where id=p_quotation_id for share;
  if not found then raise exception 'Quotation not found.'; end if;
  if not public.is_admin() and (not public.has_active_role(array['sales']) or v_source.salesperson_id is distinct from auth.uid()) then raise exception 'Unauthorized.'; end if;
  perform set_config('profox.quotation_atomic_rpc','1',true); perform set_config('profox.revision_clone','1',true);
  insert into public.quotations(opportunity_id,salesperson_id,customer_name,contact_name,email,phone,country,currency,status,valid_until,payment_terms,scope_summary,exclusions,customer_notes,internal_notes,created_by,quotation_template_key,proposal_title,executive_summary,cover_message,client_responsibilities,delivery_assumptions,review_process,handover_support,terms_and_conditions,acceptance_method,quote_discount_type,quote_discount_value,tax_rate)
  values(v_source.opportunity_id,v_source.salesperson_id,v_source.customer_name,v_source.contact_name,v_source.email,v_source.phone,v_source.country,v_source.currency,'Draft',current_date+v_days,v_source.payment_terms,v_source.scope_summary,v_source.exclusions,v_source.customer_notes,v_source.internal_notes,auth.uid(),v_source.quotation_template_key,v_source.proposal_title,v_source.executive_summary,v_source.cover_message,v_source.client_responsibilities,v_source.delivery_assumptions,v_source.review_process,v_source.handover_support,v_source.terms_and_conditions,v_source.acceptance_method,v_source.quote_discount_type,v_source.quote_discount_value,v_source.tax_rate) returning id into v_new;
  for r in select * from public.quotation_items where quotation_id=p_quotation_id order by sort_order,created_at loop
    insert into public.quotation_items(quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,quantity,unit_price,line_total,item_type,sort_order,client_expectations_snapshot,duration_min_snapshot,duration_max_snapshot,duration_unit_snapshot,timeline_impact_snapshot,duration_note_snapshot,line_type,discount_type,discount_value,optional_for_client,section_key,configuration_snapshot)
    values(v_new,r.sales_product_id,r.product_code_snapshot,r.product_name_snapshot,r.description_snapshot,r.quantity,r.unit_price,0,r.item_type,r.sort_order,r.client_expectations_snapshot,r.duration_min_snapshot,r.duration_max_snapshot,r.duration_unit_snapshot,r.timeline_impact_snapshot,r.duration_note_snapshot,r.line_type,r.discount_type,r.discount_value,r.optional_for_client,r.section_key,r.configuration_snapshot);
  end loop;
  perform public.refresh_quotation_delivery_timeline(v_new);
  perform set_config('profox.revision_clone','',true); perform set_config('profox.quotation_atomic_rpc','',true);
  return v_new;
exception when others then perform set_config('profox.revision_clone','',true); perform set_config('profox.quotation_atomic_rpc','',true); raise;
end;
$$;
revoke all on function public.duplicate_quotation_cpq(uuid) from public, anon;
grant execute on function public.duplicate_quotation_cpq(uuid) to authenticated, service_role, postgres;

create or replace function public.create_quotation_revision(p_quotation_id uuid)
returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare v_source public.quotations%rowtype; v_new uuid; v_root uuid; v_days int:=coalesce((public.quotation_cpq_settings_safe()->>'defaultValidityDays')::int,30); r public.quotation_items%rowtype;
begin
  select * into v_source from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if not public.is_admin() and (not public.has_active_role(array['sales']) or v_source.salesperson_id is distinct from auth.uid()) then raise exception 'Unauthorized.'; end if;
  if v_source.status not in ('Sent','Rejected','Expired') then raise exception 'Create a revision only for a delivered or closed quotation. Use Duplicate for a separate draft.'; end if;
  if v_source.superseded_by_id is not null then raise exception 'This quotation already has a newer revision.'; end if;
  v_root:=coalesce(v_source.revision_root_id,v_source.id);
  perform set_config('profox.quotation_atomic_rpc','1',true); perform set_config('profox.revision_clone','1',true);
  insert into public.quotations(opportunity_id,salesperson_id,customer_name,contact_name,email,phone,country,currency,status,valid_until,payment_terms,scope_summary,exclusions,customer_notes,internal_notes,created_by,revision_number,revision_root_id,previous_revision_id,quotation_template_key,proposal_title,executive_summary,cover_message,client_responsibilities,delivery_assumptions,review_process,handover_support,terms_and_conditions,acceptance_method,quote_discount_type,quote_discount_value,tax_rate)
  values(v_source.opportunity_id,v_source.salesperson_id,v_source.customer_name,v_source.contact_name,v_source.email,v_source.phone,v_source.country,v_source.currency,'Draft',current_date+v_days,v_source.payment_terms,v_source.scope_summary,v_source.exclusions,v_source.customer_notes,v_source.internal_notes,auth.uid(),v_source.revision_number+1,v_root,v_source.id,v_source.quotation_template_key,v_source.proposal_title,v_source.executive_summary,v_source.cover_message,v_source.client_responsibilities,v_source.delivery_assumptions,v_source.review_process,v_source.handover_support,v_source.terms_and_conditions,v_source.acceptance_method,v_source.quote_discount_type,v_source.quote_discount_value,v_source.tax_rate) returning id into v_new;
  for r in select * from public.quotation_items where quotation_id=p_quotation_id order by sort_order,created_at loop
    insert into public.quotation_items(quotation_id,sales_product_id,product_code_snapshot,product_name_snapshot,description_snapshot,quantity,unit_price,line_total,item_type,sort_order,client_expectations_snapshot,duration_min_snapshot,duration_max_snapshot,duration_unit_snapshot,timeline_impact_snapshot,duration_note_snapshot,line_type,discount_type,discount_value,optional_for_client,section_key,configuration_snapshot)
    values(v_new,r.sales_product_id,r.product_code_snapshot,r.product_name_snapshot,r.description_snapshot,r.quantity,r.unit_price,0,r.item_type,r.sort_order,r.client_expectations_snapshot,r.duration_min_snapshot,r.duration_max_snapshot,r.duration_unit_snapshot,r.timeline_impact_snapshot,r.duration_note_snapshot,r.line_type,r.discount_type,r.discount_value,r.optional_for_client,r.section_key,r.configuration_snapshot);
  end loop;
  update public.quotations set superseded_by_id=v_new,updated_at=now() where id=v_source.id;
  perform public.refresh_quotation_delivery_timeline(v_new);
  perform set_config('profox.revision_clone','',true); perform set_config('profox.quotation_atomic_rpc','',true);
  return v_new;
exception when others then perform set_config('profox.revision_clone','',true); perform set_config('profox.quotation_atomic_rpc','',true); raise;
end;
$$;
revoke all on function public.create_quotation_revision(uuid) from public, anon;
grant execute on function public.create_quotation_revision(uuid) to authenticated, service_role, postgres;

create or replace function public.send_quotation_professional(p_quotation_id uuid,p_recipient text,p_cc text[] default '{}'::text[],p_subject text default null,p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare v_q public.quotations%rowtype; v_summary jsonb; v_email text:=lower(btrim(coalesce(p_recipient,''))); v_cc text[]:=coalesce(p_cc,'{}'::text[]);
begin
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if not public.is_admin() and (not public.has_active_role(array['sales']) or v_q.salesperson_id is distinct from auth.uid()) then raise exception 'Unauthorized.'; end if;
  if v_q.status<>'Approved' then raise exception 'Quotation must be Approved before it can be sent.'; end if;
  if v_q.superseded_by_id is not null then raise exception 'A superseded quotation cannot be sent.'; end if;
  if v_email='' or v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A valid customer email is required.'; end if;
  v_summary:=public.get_quotation_cpq_summary(p_quotation_id);
  if coalesce((v_summary->'readiness'->>'readyToSend')::boolean,false) is not true then raise exception 'Quotation is not ready to send: %',array_to_string(array(select jsonb_array_elements_text(v_summary->'readiness'->'missing')),', '); end if;
  perform set_config('profox.quotation_atomic_rpc','1',true);
  update public.quotations set email=v_email,send_cc=v_cc,send_subject=coalesce(nullif(btrim(coalesce(p_subject,'')),''),'Your ProFox proposal is ready: '||quotation_number),send_message=nullif(btrim(coalesce(p_message,'')),''),status='Sent',sent_at=coalesce(sent_at,now()),updated_at=now() where id=p_quotation_id;
  perform set_config('profox.quotation_atomic_rpc','',true);
  return public.get_quotation_cpq_summary(p_quotation_id);
exception when others then perform set_config('profox.quotation_atomic_rpc','',true); raise;
end;
$$;
revoke all on function public.send_quotation_professional(uuid,text,text[],text,text) from public, anon;
grant execute on function public.send_quotation_professional(uuid,text,text[],text,text) to authenticated, service_role, postgres;

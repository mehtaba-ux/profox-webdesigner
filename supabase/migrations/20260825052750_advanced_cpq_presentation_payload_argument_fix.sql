-- PostgreSQL functions accept at most 100 arguments. Compose the canonical presentation
-- payload from smaller objects while preserving the exact public/internal JSON shape.
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
  v_payload jsonb;
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

  v_payload:=jsonb_build_object(
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
    'optionalTotal',v_q.optional_total
  );

  v_payload:=v_payload||jsonb_build_object(
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
  return v_payload;
end;
$$;

revoke all on function public.quotation_presentation_payload(uuid) from public, anon, authenticated, service_role;
grant execute on function public.quotation_presentation_payload(uuid) to postgres;

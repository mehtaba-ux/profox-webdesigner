-- Enrich the token-scoped public payment payload with customer-facing quotation
-- context needed for a clear checkout experience. This intentionally excludes
-- internal notes, profitability, commissions, approvals, and staff-only data.

create or replace function public.open_public_payment(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_hash text;
  v_p public.payments%rowtype;
  v_q public.quotations%rowtype;
  v_cfg jsonb;
  v_r jsonb;
  v_pp jsonb;
  v_outstanding numeric;
  v_items jsonb := '[]'::jsonb;
  v_progress jsonb := '[]'::jsonb;
  v_latest_attempt public.payment_gateway_attempts%rowtype;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then
    raise exception 'Payment link is invalid.';
  end if;

  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_p
  from public.payments
  where public_payment_token_hash=v_hash
    and public_payment_token_issued_at is not null;

  if not found then raise exception 'Payment link is invalid or no longer available.'; end if;
  if v_p.public_payment_token_expires_at is not null
     and v_p.public_payment_token_expires_at<now()
     and v_p.status<>'Verified' then
    raise exception 'Payment link has expired. Please contact ProFox for a refreshed payment link.';
  end if;

  if v_p.quotation_id is not null then
    select * into v_q from public.quotations where id=v_p.quotation_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'name', qi.product_name_snapshot,
      'description', qi.description_snapshot,
      'quantity', qi.quantity,
      'lineTotal', qi.line_total,
      'itemType', qi.item_type
    ) order by qi.sort_order, qi.created_at), '[]'::jsonb)
    into v_items
    from public.quotation_items qi
    where qi.quotation_id=v_p.quotation_id
      and coalesce(qi.optional_for_client,false)=false;

    select coalesce(jsonb_agg(jsonb_build_object(
      'paymentId', p.id,
      'paymentReference', p.payment_reference,
      'milestoneNumber', p.milestone_number,
      'label', coalesce(nullif(p.milestone_label,''), p.payment_type),
      'amountDue', p.amount_due,
      'amountPaid', p.amount_paid,
      'currency', p.currency,
      'status', p.status,
      'dueDate', p.due_date,
      'current', p.id=v_p.id
    ) order by coalesce(p.milestone_number,999), p.created_at), '[]'::jsonb)
    into v_progress
    from public.payments p
    where p.quotation_id=v_p.quotation_id;
  end if;

  select * into v_latest_attempt
  from public.payment_gateway_attempts a
  where a.payment_id=v_p.id
    and a.status in ('Completed','Captured','Created','Pending','Approved')
  order by case when a.status in ('Completed','Captured') then 0 else 1 end,
           coalesce(a.completed_at,a.updated_at,a.created_at) desc
  limit 1;

  v_cfg:=public.payment_gateway_settings_safe();
  v_r:=coalesce(v_cfg->'razorpay','{}'::jsonb);
  v_pp:=coalesce(v_cfg->'paypal','{}'::jsonb);
  v_outstanding:=greatest(round(coalesce(v_p.amount_due,0)-coalesce(v_p.amount_paid,0),2),0);

  return jsonb_build_object(
    'paymentId',v_p.id,
    'paymentReference',v_p.payment_reference,
    'quotationNumber',v_q.quotation_number,
    'customerName',v_p.customer_name,
    'customerEmail',v_p.customer_email,
    'paymentType',v_p.payment_type,
    'milestoneNumber',v_p.milestone_number,
    'milestoneLabel',v_p.milestone_label,
    'amountDue',v_p.amount_due,
    'amountPaid',v_p.amount_paid,
    'outstanding',v_outstanding,
    'currency',v_p.currency,
    'status',v_p.status,
    'dueDate',v_p.due_date,
    'paidAt',v_p.paid_at,
    'verifiedAt',v_p.verified_at,
    'payable',(v_outstanding>0 and v_p.status in ('Sent','Pending','Partially Paid','Verification Pending')),
    'quotation', case when v_q.id is null then null else jsonb_build_object(
      'number', v_q.quotation_number,
      'proposalTitle', v_q.proposal_title,
      'scopeSummary', v_q.scope_summary,
      'total', v_q.total,
      'currency', v_q.currency,
      'status', v_q.status,
      'acceptedAt', v_q.accepted_at,
      'paymentTerms', v_q.payment_terms,
      'paymentSchedule', coalesce(v_q.payment_schedule_snapshot,'[]'::jsonb),
      'deliveryTimeline', v_q.duration_snapshot_text,
      'items', v_items
    ) end,
    'paymentProgress', v_progress,
    'lastGatewayCharge', case when v_latest_attempt.id is null then null else jsonb_build_object(
      'provider', v_latest_attempt.provider,
      'providerAmount', v_latest_attempt.provider_amount,
      'providerCurrency', v_latest_attempt.provider_currency,
      'fxRate', v_latest_attempt.fx_rate,
      'fxSource', v_latest_attempt.fx_source,
      'fxQuotedAt', v_latest_attempt.fx_quoted_at,
      'status', v_latest_attempt.status,
      'completedAt', v_latest_attempt.completed_at
    ) end,
    'providers',jsonb_build_array(
      jsonb_build_object(
        'id','razorpay','label','Razorpay',
        'enabled',coalesce((v_r->>'enabled')::boolean,false),
        'mode',coalesce(v_r->>'mode','test'),
        'productionReady',coalesce((v_r->>'productionReady')::boolean,false),
        'testMode',coalesce((v_r->>'testMode')::boolean,false)
      ),
      jsonb_build_object(
        'id','paypal','label','PayPal',
        'enabled',coalesce((v_pp->>'enabled')::boolean,false),
        'mode',coalesce(v_pp->>'mode','sandbox'),
        'productionReady',coalesce((v_pp->>'productionReady')::boolean,false),
        'testMode',coalesce((v_pp->>'testMode')::boolean,false)
      )
    )
  );
end;
$$;

-- Preserve the existing public payment-token access model. The function itself
-- validates the high-entropy token hash before returning any customer data.
revoke all on function public.open_public_payment(text) from public;
grant execute on function public.open_public_payment(text) to anon, authenticated;

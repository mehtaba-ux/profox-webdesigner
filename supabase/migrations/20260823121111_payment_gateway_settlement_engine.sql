create or replace function public.protect_payment_verification_fields()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_gateway text:=coalesce(current_setting('profox.gateway_settlement',true),''); v_sync text:=coalesce(current_setting('profox.payment_plan_sync',true),'');
begin
  if v_gateway='1' or v_sync='1' then return new; end if;
  if public.is_admin() then return new; end if;
  if new.status in ('Verified','Refunded','Partially Refunded') or new.verified_at is distinct from old.verified_at or new.verified_by is distinct from old.verified_by or new.amount_paid is distinct from old.amount_paid then
    raise exception 'Payment verification and settlement fields are Admin-only.';
  end if;
  return new;
end; $$;

create or replace function public.validate_payment_request()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_internal text:=coalesce(current_setting('profox.payment_plan_sync',true),''); v_gateway text:=coalesce(current_setting('profox.gateway_settlement',true),'');
begin
  if v_internal='1' or v_gateway='1' then return new; end if;
  if coalesce(new.amount_due,0)<0 then raise exception 'Payment amount cannot be negative.'; end if;
  if tg_op='INSERT' then
    if public.is_admin() then if coalesce(new.amount_due,0)<=0 then raise exception 'Payment amount must be greater than zero.'; end if; return new; end if;
    raise exception 'Payment requests are generated automatically from accepted quotations. Sellers cannot create a separate payment amount or package.';
  end if;
  if public.is_admin() then return new; end if;
  if not public.has_active_role(array['sales']) or old.salesperson_id is distinct from auth.uid() then raise exception 'Unauthorized payment update.'; end if;
  if old.status in ('Verified','Refunded','Partially Refunded','Failed') then raise exception 'Settled or terminal payment records may only be changed by an Admin.'; end if;
  if new.quotation_id is distinct from old.quotation_id or new.opportunity_id is distinct from old.opportunity_id or new.client_id is distinct from old.client_id or new.salesperson_id is distinct from old.salesperson_id or new.customer_name is distinct from old.customer_name or new.customer_email is distinct from old.customer_email or new.payment_type is distinct from old.payment_type or new.milestone_number is distinct from old.milestone_number or new.milestone_label is distinct from old.milestone_label or new.amount_due is distinct from old.amount_due or new.amount_paid is distinct from old.amount_paid or new.currency is distinct from old.currency or new.verified_at is distinct from old.verified_at or new.verified_by is distinct from old.verified_by then raise exception 'Core payment amount, ownership and verification fields are locked for Sales.'; end if;
  if new.status not in ('Draft','Ready','Sent','Pending','Verification Pending','Cancelled') then raise exception 'Sales cannot set settlement status %.',new.status; end if;
  return new;
end; $$;

create or replace function public.generate_commission_for_verified_payment(p_payment_id uuid)
returns uuid language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_pay public.payments%rowtype; v_quote public.quotations%rowtype; v_opp public.crm_opportunities%rowtype; v_rule public.commission_rules%rowtype; v_set public.commission_settings%rowtype; v_item record; v_existing uuid; v_first_rank int; v_rank int; v_base numeric; v_self numeric:=0; v_perf numeric:=0; v_rate numeric; v_amount numeric; v_status text:='Earned'; v_new uuid; v_gateway boolean:=coalesce(current_setting('profox.gateway_settlement',true),'')='1';
begin
  if not public.is_admin() and not v_gateway then raise exception 'Unauthorized: commission generation is restricted to protected payment verification.'; end if;
  select id into v_existing from public.commission_entries where payment_id=p_payment_id; if v_existing is not null then return v_existing; end if;
  select * into v_pay from public.payments where id=p_payment_id; if not found or v_pay.status<>'Verified' then raise exception 'Verified payment required.'; end if;
  if v_pay.salesperson_id is null or v_pay.quotation_id is null then return null; end if;
  select * into v_quote from public.quotations where id=v_pay.quotation_id;
  select * into v_opp from public.crm_opportunities where id=v_pay.opportunity_id;
  select qi.product_code_snapshot,qi.product_name_snapshot into v_item from public.quotation_items qi where qi.quotation_id=v_pay.quotation_id and qi.item_type='package' order by qi.sort_order,qi.created_at limit 1;
  if v_item.product_code_snapshot is null then return null; end if;
  select * into v_rule from public.commission_rules where product_code=v_item.product_code_snapshot and enabled=true; if not found then return null; end if;
  select * into v_set from public.commission_settings where id='default';
  v_base:=v_rule.base_rate_percent;
  if v_rule.requires_admin_rate then
    if v_quote.approved_commission_rate is null or v_quote.approved_commission_rate<v_rule.min_rate_percent or v_quote.approved_commission_rate>v_rule.max_rate_percent then v_status:='Under Review';v_base:=v_rule.min_rate_percent; else v_base:=v_quote.approved_commission_rate; end if;
  end if;
  if coalesce(v_opp.self_generated,false) then v_self:=v_set.self_generated_bonus_percent; end if;
  select min(sale_rank) into v_first_rank from public.commission_entries where quotation_id=v_pay.quotation_id and salesperson_id=v_pay.salesperson_id and status<>'Reversed';
  if v_first_rank is not null then v_rank:=v_first_rank; else
    select count(distinct quotation_id)+1 into v_rank from public.commission_entries where salesperson_id=v_pay.salesperson_id and status<>'Reversed' and quotation_id is not null and date_trunc('month',created_at)=date_trunc('month',coalesce(v_pay.verified_at,now()));
  end if;
  if v_rank>v_set.performance_threshold then v_perf:=v_set.performance_bonus_percent; end if;
  v_rate:=v_base+v_self+v_perf; v_amount:=round((coalesce(nullif(v_pay.amount_paid,0),v_pay.amount_due)*v_rate/100.0)::numeric,2);
  insert into public.commission_entries(payment_id,quotation_id,opportunity_id,client_id,salesperson_id,product_code,product_name,verified_payment_amount,currency,base_rate_percent,self_generated_bonus_percent,performance_bonus_percent,effective_rate_percent,commission_amount,sale_rank,status,rule_snapshot)
  values(v_pay.id,v_pay.quotation_id,v_pay.opportunity_id,v_pay.client_id,v_pay.salesperson_id,v_item.product_code_snapshot,v_item.product_name_snapshot,coalesce(nullif(v_pay.amount_paid,0),v_pay.amount_due),v_pay.currency,v_base,v_self,v_perf,v_rate,v_amount,v_rank,v_status,jsonb_build_object('baseRate',v_base,'selfGeneratedBonus',v_self,'performanceBonus',v_perf,'saleRank',v_rank,'productCode',v_item.product_code_snapshot,'capturedAt',now())) returning id into v_new;
  return v_new;
end; $$;

create or replace function public.create_project_from_sale(p_opportunity_id uuid)
returns uuid language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_opp public.crm_opportunities%rowtype; v_quote public.quotations%rowtype; v_project uuid; v_package text; v_pm_id uuid; v_gateway boolean:=coalesce(current_setting('profox.gateway_settlement',true),'')='1';
begin
  if not public.has_active_role(array['admin','project_manager']) and not v_gateway then raise exception 'Unauthorized: only Admin, Project Manager, or protected gateway settlement may create a project.'; end if;
  select id into v_project from public.projects where source_opportunity_id=p_opportunity_id limit 1; if v_project is not null then return v_project; end if;
  select * into v_opp from public.crm_opportunities where id=p_opportunity_id for share; if not found then raise exception 'Opportunity not found.'; end if;
  if v_opp.status<>'Won' then raise exception 'Opportunity must be Won before project creation.'; end if;
  if v_opp.client_id is null then raise exception 'Won opportunity must be linked to the verified client before project creation.'; end if;
  if not exists(select 1 from public.payments where opportunity_id=p_opportunity_id and payment_type in ('Advance','Full Payment') and status='Verified') then raise exception 'Verified advance/full payment is required.'; end if;
  select * into v_quote from public.quotations where opportunity_id=p_opportunity_id and status='Accepted' order by accepted_at desc nulls last,created_at desc limit 1; if not found then raise exception 'Accepted quotation not found.'; end if;
  select product_name_snapshot into v_package from public.quotation_items where quotation_id=v_quote.id and item_type='package' order by sort_order limit 1;
  if not v_gateway and not public.is_admin() and public.has_active_role(array['project_manager']) then v_pm_id:=auth.uid(); end if;
  insert into public.projects(project_name,client_id,source_opportunity_id,quotation_id,package_snapshot,project_value,currency,project_manager_id,stage,priority,status,requirements_summary,scope_summary,exclusions,created_by)
  values(coalesce(nullif(v_opp.company_name,''),v_opp.name)||' Website Delivery',v_opp.client_id,v_opp.id,v_quote.id,coalesce(v_package,'Custom Package'),v_quote.total,v_quote.currency,v_pm_id,'Sales Handover','Normal','Active',v_opp.requirements_summary,v_quote.scope_summary,v_quote.exclusions,case when v_gateway then null else auth.uid() end) returning id into v_project;
  if v_opp.salesperson_id is not null and exists(select 1 from public.user_profiles u where u.id=v_opp.salesperson_id and u.status='active' and u.role in ('sales','sales_rep','sales_team')) then insert into public.project_team(project_id,user_id,role) values(v_project,v_opp.salesperson_id,'Sales Handover') on conflict(project_id,user_id) do update set role='Sales Handover'; end if;
  if v_pm_id is not null then insert into public.project_team(project_id,user_id,role) values(v_project,v_pm_id,'Project Manager') on conflict(project_id,user_id) do update set role='Project Manager'; end if;
  perform public.ensure_project_delivery_stage_tasks(v_project,'Sales Handover'); return v_project;
end; $$;

create or replace function public.verify_payment_atomic(p_payment_id uuid,p_admin_id uuid default null,p_notes text default '',p_amount_received numeric default null)
returns uuid language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_payment public.payments%rowtype; v_opp public.crm_opportunities%rowtype; v_quote public.quotations%rowtype; v_client_id uuid; v_identity text; v_received numeric; v_project_id uuid; v_gateway boolean:=coalesce(current_setting('profox.gateway_settlement',true),'')='1';
begin
  if not public.is_admin() and not v_gateway then raise exception 'Unauthorized: only an active Admin or protected gateway settlement may verify payments.'; end if;
  select * into v_payment from public.payments where id=p_payment_id for update; if not found then raise exception 'Payment not found.'; end if;
  if v_payment.status='Verified' then perform public.generate_commission_for_verified_payment(p_payment_id); if v_payment.payment_type in ('Advance','Full Payment') and v_payment.opportunity_id is not null then v_project_id:=public.create_project_from_sale(v_payment.opportunity_id); end if; return v_payment.client_id; end if;
  if v_payment.status in ('Cancelled','Failed','Refunded') then raise exception 'A cancelled, failed, or refunded payment cannot be verified.'; end if;
  if coalesce(v_payment.amount_due,0)<=0 then raise exception 'Payment amount must be greater than zero.'; end if;
  v_received:=round(coalesce(p_amount_received,nullif(v_payment.amount_paid,0),v_payment.amount_due)::numeric,2);
  if v_received<=0 then raise exception 'Confirmed amount received must be greater than zero.'; end if;
  if v_received>round(v_payment.amount_due::numeric,2) then raise exception 'Confirmed amount received (%) cannot exceed this payment request amount (%).',v_received,v_payment.amount_due; end if;
  if v_payment.quotation_id is not null then select * into v_quote from public.quotations where id=v_payment.quotation_id for share; if not found then raise exception 'Quotation linked to payment was not found.'; end if; end if;
  if v_payment.payment_type in ('Advance','Full Payment') then if v_payment.quotation_id is null or v_quote.status<>'Accepted' then raise exception 'Advance/full payment may only be verified against an accepted quotation.'; end if; if v_payment.opportunity_id is null or v_quote.opportunity_id is distinct from v_payment.opportunity_id then raise exception 'Payment opportunity must match the accepted quotation.'; end if; end if;
  if v_received<round(v_payment.amount_due::numeric,2) then update public.payments set amount_paid=v_received,status='Partially Paid',paid_at=coalesce(paid_at,now()),verified_at=null,verified_by=null,notes=coalesce(nullif(trim(p_notes),''),notes),updated_at=now() where id=p_payment_id; return v_payment.client_id; end if;
  update public.payments set status='Verified',amount_paid=v_received,paid_at=coalesce(paid_at,now()),verified_at=now(),verified_by=case when v_gateway then null else auth.uid() end,notes=coalesce(nullif(trim(p_notes),''),notes),updated_at=now() where id=p_payment_id returning * into v_payment;
  if v_payment.payment_type in ('Advance','Full Payment') and v_payment.opportunity_id is not null then
    select * into v_opp from public.crm_opportunities where id=v_payment.opportunity_id for update; if not found then raise exception 'Opportunity linked to payment was not found.'; end if;
    update public.crm_opportunities set status='Won',stage='Won',won_at=coalesce(won_at,now()),updated_at=now() where id=v_opp.id;
    v_client_id:=v_opp.client_id;
    if v_client_id is null then
      if trim(coalesce(v_opp.email,''))<>'' and trim(coalesce(v_opp.company_name,''))<>'' then v_identity:=lower(trim(v_opp.email))||'|'||lower(trim(v_opp.company_name)); perform pg_advisory_xact_lock(hashtextextended(v_identity,0)); end if;
      select id into v_client_id from public.clients where lower(trim(coalesce(email,'')))=lower(trim(coalesce(v_opp.email,''))) and lower(trim(coalesce(company_name,'')))=lower(trim(coalesce(v_opp.company_name,''))) order by created_at limit 1;
      if v_client_id is null then insert into public.clients(company_name,primary_contact_name,email,phone,website,country,industry,salesperson_id,source_opportunity_id,first_quotation_id,total_sales_value,currency,status) values(coalesce(nullif(trim(v_opp.company_name,''),''),v_opp.name),coalesce(nullif(trim(v_opp.contact_name),''),nullif(trim(v_opp.company_name),''),v_opp.name),coalesce(v_opp.email,''),v_opp.phone,v_opp.website,v_opp.country,v_opp.industry,v_opp.salesperson_id,v_opp.id,v_payment.quotation_id,coalesce(v_quote.total,v_opp.expected_value,0),coalesce(v_quote.currency,v_opp.currency,'USD'),'Active') returning id into v_client_id; end if;
      update public.crm_opportunities set client_id=v_client_id,updated_at=now() where id=v_opp.id; update public.quotations set client_id=v_client_id,updated_at=now() where opportunity_id=v_opp.id;
    end if;
    update public.payments set client_id=v_client_id,updated_at=now() where id=p_payment_id returning * into v_payment;
  end if;
  perform public.generate_commission_for_verified_payment(p_payment_id);
  if v_payment.payment_type in ('Advance','Full Payment') and v_payment.opportunity_id is not null then v_project_id:=public.create_project_from_sale(v_payment.opportunity_id); end if;
  return v_client_id;
end; $$;

create or replace function public.service_prepare_payment_gateway_checkout(p_token text,p_provider text)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_temp' as $$
declare v_provider text:=lower(trim(coalesce(p_provider,''))); v_hash text; v_p public.payments%rowtype; v_cfg jsonb; v_pc jsonb; v_outstanding numeric; v_attempt public.payment_gateway_attempts%rowtype; v_generation int; v_mode text; v_key text;
begin
  if v_provider not in ('razorpay','paypal') then raise exception 'Unsupported payment provider.'; end if;
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Payment link is invalid.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_p from public.payments where public_payment_token_hash=v_hash for update;
  if not found then raise exception 'Payment link is invalid.'; end if;
  if v_p.public_payment_token_expires_at is not null and v_p.public_payment_token_expires_at<now() then raise exception 'Payment link has expired.'; end if;
  if v_p.status='Verified' then return jsonb_build_object('alreadyPaid',true,'paymentId',v_p.id,'paymentReference',v_p.payment_reference,'amountDue',v_p.amount_due,'amountPaid',v_p.amount_paid,'currency',v_p.currency); end if;
  if v_p.status not in ('Sent','Pending','Partially Paid') then raise exception 'This payment milestone is not currently payable.'; end if;
  v_outstanding:=round(greatest(coalesce(v_p.amount_due,0)-coalesce(v_p.amount_paid,0),0)::numeric,2); if v_outstanding<=0 then raise exception 'This payment has no outstanding balance.'; end if;
  v_cfg:=public.payment_gateway_settings_safe(); v_pc:=coalesce(v_cfg->v_provider,'{}'::jsonb);
  if not coalesce((v_pc->>'enabled')::boolean,false) or not coalesce((v_pc->>'configured')::boolean,false) or not coalesce((v_pc->>'webhookConfigured')::boolean,false) then raise exception 'Selected payment provider is not enabled and fully configured.'; end if;
  v_mode:=lower(coalesce(v_pc->>'mode',case when v_provider='razorpay' then 'test' else 'sandbox' end));

  select * into v_attempt from public.payment_gateway_attempts where payment_id=v_p.id and provider=v_provider and status in ('Creating','Created','Pending','Approved') and amount=v_outstanding and currency=v_p.currency and created_at>now()-interval '2 hours' order by created_at desc limit 1 for update;
  if found then
    return jsonb_build_object('attemptId',v_attempt.id,'paymentId',v_p.id,'paymentReference',v_p.payment_reference,'provider',v_provider,'environment',v_attempt.environment,'amount',v_attempt.amount,'currency',v_attempt.currency,'providerOrderId',v_attempt.provider_order_id,'checkoutUrl',v_attempt.checkout_url,'paymentLink',v_p.payment_link,'customerName',v_p.customer_name,'customerEmail',v_p.customer_email,'publicId',case when v_provider='razorpay' then v_pc->>'keyId' else v_pc->>'clientId' end,'reused',true);
  end if;

  update public.payment_gateway_attempts set status='Failed',error_code='ATTEMPT_EXPIRED',error_message='Superseded by a new checkout attempt.',updated_at=now() where payment_id=v_p.id and provider=v_provider and status in ('Creating','Created','Pending','Approved') and created_at<=now()-interval '2 hours';
  select count(*)+1 into v_generation from public.payment_gateway_attempts where payment_id=v_p.id and provider=v_provider;
  v_key:=v_p.id::text||':'||v_provider||':'||v_p.currency||':'||trim(to_char(v_outstanding,'FM9999999999990.00'))||':'||v_generation;
  insert into public.payment_gateway_attempts(payment_id,provider,environment,status,amount,currency,idempotency_key)
  values(v_p.id,v_provider,v_mode,'Creating',v_outstanding,v_p.currency,v_key) returning * into v_attempt;
  perform set_config('profox.payment_plan_sync','1',true);
  update public.payments set status='Pending',payment_provider=v_provider,payment_method='Online Checkout',updated_at=now() where id=v_p.id and status in ('Sent','Partially Paid');
  perform set_config('profox.payment_plan_sync','',true);
  return jsonb_build_object('attemptId',v_attempt.id,'paymentId',v_p.id,'paymentReference',v_p.payment_reference,'provider',v_provider,'environment',v_mode,'amount',v_outstanding,'currency',v_p.currency,'paymentLink',v_p.payment_link,'customerName',v_p.customer_name,'customerEmail',v_p.customer_email,'publicId',case when v_provider='razorpay' then v_pc->>'keyId' else v_pc->>'clientId' end,'reused',false);
exception when others then perform set_config('profox.payment_plan_sync','',true); raise;
end; $$;

create or replace function public.service_store_payment_gateway_order(p_attempt_id uuid,p_provider_order_id text,p_checkout_url text default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_a public.payment_gateway_attempts%rowtype;
begin
  select * into v_a from public.payment_gateway_attempts where id=p_attempt_id for update; if not found then raise exception 'Gateway attempt not found.'; end if;
  if v_a.status in ('Completed','Captured','Cancelled') then return jsonb_build_object('attemptId',v_a.id,'providerOrderId',v_a.provider_order_id,'checkoutUrl',v_a.checkout_url,'status',v_a.status); end if;
  update public.payment_gateway_attempts set provider_order_id=coalesce(nullif(trim(p_provider_order_id),''),provider_order_id),checkout_url=coalesce(nullif(trim(p_checkout_url),''),checkout_url),safe_metadata=coalesce(p_metadata,'{}'::jsonb),status='Created',updated_at=now() where id=p_attempt_id returning * into v_a;
  return jsonb_build_object('attemptId',v_a.id,'providerOrderId',v_a.provider_order_id,'checkoutUrl',v_a.checkout_url,'status',v_a.status);
end; $$;

create or replace function public.service_get_payment_gateway_attempt(p_attempt_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $$
declare v_a public.payment_gateway_attempts%rowtype; v_p public.payments%rowtype;
begin
  select * into v_a from public.payment_gateway_attempts where id=p_attempt_id; if not found then raise exception 'Gateway attempt not found.'; end if;
  select * into v_p from public.payments where id=v_a.payment_id;
  return jsonb_build_object('attemptId',v_a.id,'paymentId',v_a.payment_id,'provider',v_a.provider,'environment',v_a.environment,'status',v_a.status,'amount',v_a.amount,'currency',v_a.currency,'providerOrderId',v_a.provider_order_id,'providerPaymentId',v_a.provider_payment_id,'providerCaptureId',v_a.provider_capture_id,'checkoutUrl',v_a.checkout_url,'paymentLink',v_p.payment_link,'paymentReference',v_p.payment_reference,'paymentStatus',v_p.status,'amountPaid',v_p.amount_paid,'amountDue',v_p.amount_due);
end; $$;

create or replace function public.service_fail_payment_gateway_attempt(p_attempt_id uuid,p_code text default '',p_message text default '')
returns void language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_a public.payment_gateway_attempts%rowtype;
begin
  update public.payment_gateway_attempts set status='Failed',error_code=left(coalesce(p_code,''),120),error_message=left(coalesce(p_message,''),1000),updated_at=now() where id=p_attempt_id and status not in ('Completed','Captured') returning * into v_a;
  if v_a.id is null then return; end if;
  if not exists(select 1 from public.payment_gateway_attempts where payment_id=v_a.payment_id and id<>v_a.id and status in ('Creating','Created','Pending','Approved')) then
    perform set_config('profox.payment_plan_sync','1',true);
    update public.payments set status='Sent',updated_at=now() where id=v_a.payment_id and status='Pending' and verified_at is null;
    perform set_config('profox.payment_plan_sync','',true);
  end if;
exception when others then perform set_config('profox.payment_plan_sync','',true); raise;
end; $$;

create or replace function public.service_finalize_payment_gateway_attempt(p_attempt_id uuid,p_provider_payment_id text default '',p_provider_capture_id text default '',p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_a public.payment_gateway_attempts%rowtype; v_p public.payments%rowtype; v_total_received numeric; v_client uuid;
begin
  select * into v_a from public.payment_gateway_attempts where id=p_attempt_id for update; if not found then raise exception 'Gateway attempt not found.'; end if;
  select * into v_p from public.payments where id=v_a.payment_id for update; if not found then raise exception 'Payment not found.'; end if;
  if v_p.status='Verified' then
    update public.payment_gateway_attempts set status='Completed',provider_payment_id=coalesce(nullif(trim(p_provider_payment_id),''),provider_payment_id),provider_capture_id=coalesce(nullif(trim(p_provider_capture_id),''),provider_capture_id),completed_at=coalesce(completed_at,now()),updated_at=now() where id=v_a.id;
    return jsonb_build_object('paymentId',v_p.id,'paymentReference',v_p.payment_reference,'status','Verified','alreadyVerified',true,'clientId',v_p.client_id);
  end if;
  if v_p.status in ('Cancelled','Failed','Refunded') then raise exception 'Closed payment cannot be settled by a gateway.'; end if;
  if upper(v_a.currency)<>upper(v_p.currency) then raise exception 'Gateway currency does not match the payment request.'; end if;
  if round(v_a.amount,2)<>round(greatest(v_p.amount_due-v_p.amount_paid,0),2) then raise exception 'Gateway amount does not match the exact outstanding payment balance.'; end if;
  v_total_received:=round(v_p.amount_paid+v_a.amount,2);
  perform set_config('profox.gateway_settlement','1',true);
  perform set_config('profox.payment_plan_sync','1',true);
  update public.payments set payment_provider=v_a.provider,payment_method=case when v_a.provider='paypal' then 'PayPal' else 'Razorpay' end,provider_payment_id=coalesce(nullif(trim(p_provider_capture_id),''),nullif(trim(p_provider_payment_id),''),provider_payment_id),updated_at=now() where id=v_p.id;
  v_client:=public.verify_payment_atomic(v_p.id,null,'Verified automatically from a cryptographically validated '||initcap(v_a.provider)||' gateway capture.',v_total_received);
  update public.payment_gateway_attempts set status='Completed',provider_payment_id=coalesce(nullif(trim(p_provider_payment_id),''),provider_payment_id),provider_capture_id=coalesce(nullif(trim(p_provider_capture_id),''),provider_capture_id),safe_metadata=coalesce(p_metadata,'{}'::jsonb),completed_at=now(),updated_at=now() where id=v_a.id;
  perform set_config('profox.payment_plan_sync','',true); perform set_config('profox.gateway_settlement','',true);
  return jsonb_build_object('paymentId',v_p.id,'paymentReference',v_p.payment_reference,'status','Verified','alreadyVerified',false,'clientId',v_client);
exception when others then perform set_config('profox.payment_plan_sync','',true); perform set_config('profox.gateway_settlement','',true); raise;
end; $$;

create or replace function public.service_register_payment_gateway_event(p_provider text,p_event_id text,p_event_type text,p_provider_order_id text default '',p_provider_payment_id text default '',p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_provider text:=lower(trim(coalesce(p_provider,''))); v_event uuid; v_existing uuid; v_a public.payment_gateway_attempts%rowtype;
begin
  if v_provider not in ('razorpay','paypal') or trim(coalesce(p_event_id,''))='' then raise exception 'Valid gateway event identity required.'; end if;
  select * into v_a from public.payment_gateway_attempts where provider=v_provider and ((nullif(trim(p_provider_order_id),'') is not null and provider_order_id=trim(p_provider_order_id)) or (nullif(trim(p_provider_payment_id),'') is not null and provider_payment_id=trim(p_provider_payment_id))) order by created_at desc limit 1;
  insert into public.payment_gateway_events(provider,provider_event_id,event_type,payment_id,attempt_id,verified,processed,safe_metadata)
  values(v_provider,left(trim(p_event_id),255),left(trim(coalesce(p_event_type,'')),255),v_a.payment_id,v_a.id,true,false,coalesce(p_metadata,'{}'::jsonb))
  on conflict(provider,provider_event_id) do nothing returning id into v_event;
  if v_event is null then select id into v_existing from public.payment_gateway_events where provider=v_provider and provider_event_id=left(trim(p_event_id),255); return jsonb_build_object('isNew',false,'eventId',v_existing,'attemptId',v_a.id,'paymentId',v_a.payment_id); end if;
  return jsonb_build_object('isNew',true,'eventId',v_event,'attemptId',v_a.id,'paymentId',v_a.payment_id);
end; $$;

create or replace function public.service_complete_payment_gateway_event(p_event_id uuid,p_processed boolean,p_error text default '')
returns void language sql security definer set search_path='public','pg_temp' as $$
  update public.payment_gateway_events set processed=coalesce(p_processed,false),error_message=nullif(left(coalesce(p_error,''),1000),''),processed_at=case when p_processed then now() else processed_at end where id=p_event_id;
$$;

create or replace function public.activate_project_payment_milestone()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_type text; v_days int; v_cfg jsonb;
begin
  if old.stage is not distinct from new.stage or new.quotation_id is null then return new; end if;
  if new.stage='Development' and exists(select 1 from public.payments where quotation_id=new.quotation_id and payment_type='Design Milestone') and not exists(select 1 from public.payments where quotation_id=new.quotation_id and payment_type='Design Milestone' and status='Verified') then raise exception 'Verified Design Milestone payment is required before Development.'; end if;
  if new.stage='Final Revisions' and exists(select 1 from public.payments where quotation_id=new.quotation_id and payment_type='Staging Milestone') and not exists(select 1 from public.payments where quotation_id=new.quotation_id and payment_type='Staging Milestone' and status='Verified') then raise exception 'Verified Staging Milestone payment is required before Final Revisions.'; end if;
  v_type:=case new.stage when 'Client Design Approval' then 'Design Milestone' when 'Client Review' then 'Staging Milestone' when 'Final Revisions' then 'Final Payment' else null end;
  if v_type is not null then
    v_cfg:=public.payment_gateway_settings_safe(); v_days:=least(greatest(coalesce((v_cfg->>'milestoneDueDays')::int,5),0),90);
    perform set_config('profox.payment_plan_sync','1',true);
    update public.payments set status='Sent',due_date=coalesce(due_date,current_date+v_days),updated_at=now() where quotation_id=new.quotation_id and payment_type=v_type and status in ('Draft','Ready');
    perform set_config('profox.payment_plan_sync','',true);
  end if;
  return new;
exception when others then perform set_config('profox.payment_plan_sync','',true); raise;
end; $$;

revoke all on function public.service_prepare_payment_gateway_checkout(text,text) from public,anon,authenticated;
revoke all on function public.service_store_payment_gateway_order(uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.service_get_payment_gateway_attempt(uuid) from public,anon,authenticated;
revoke all on function public.service_fail_payment_gateway_attempt(uuid,text,text) from public,anon,authenticated;
revoke all on function public.service_finalize_payment_gateway_attempt(uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.service_register_payment_gateway_event(text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.service_complete_payment_gateway_event(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.service_prepare_payment_gateway_checkout(text,text) to service_role;
grant execute on function public.service_store_payment_gateway_order(uuid,text,text,jsonb) to service_role;
grant execute on function public.service_get_payment_gateway_attempt(uuid) to service_role;
grant execute on function public.service_fail_payment_gateway_attempt(uuid,text,text) to service_role;
grant execute on function public.service_finalize_payment_gateway_attempt(uuid,text,text,jsonb) to service_role;
grant execute on function public.service_register_payment_gateway_event(text,text,text,text,text,jsonb) to service_role;
grant execute on function public.service_complete_payment_gateway_event(uuid,boolean,text) to service_role;
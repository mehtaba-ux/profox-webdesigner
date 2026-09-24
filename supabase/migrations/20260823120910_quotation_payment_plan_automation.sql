create or replace function public.resolve_quotation_payment_schedule(p_quotation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $$
declare v_count int; v_product record; v_schedule jsonb; v_total numeric; v_first_type text;
begin
  select count(*) into v_count
  from public.quotation_items qi join public.sales_products sp on sp.id=qi.sales_product_id
  where qi.quotation_id=p_quotation_id and sp.product_type in ('package','discovery','custom');
  if v_count<>1 then raise exception 'Quotation must contain exactly one primary package or custom/discovery offer before payment can be configured.'; end if;

  select qi.product_code_snapshot,qi.product_name_snapshot,sp.payment_schedule,sp.standard_payment_terms
  into v_product
  from public.quotation_items qi join public.sales_products sp on sp.id=qi.sales_product_id
  where qi.quotation_id=p_quotation_id and sp.product_type in ('package','discovery','custom')
  order by qi.sort_order,qi.created_at limit 1;

  v_schedule:=v_product.payment_schedule;
  if v_schedule is null or jsonb_typeof(v_schedule)<>'array' or jsonb_array_length(v_schedule)=0 then
    raise exception 'The selected Sales Catalog offer does not have an approved payment schedule. Configure it in Sales Catalog before sending the quotation.';
  end if;
  select coalesce(sum((x->>'percentage')::numeric),0) into v_total from jsonb_array_elements(v_schedule) x;
  if round(v_total,4)<>100 then raise exception 'The Sales Catalog payment schedule must total 100 percent.'; end if;
  select x->>'paymentType' into v_first_type from jsonb_array_elements(v_schedule) x order by (x->>'milestoneNumber')::int limit 1;
  if v_first_type not in ('Advance','Full Payment') then
    raise exception 'The first approved payment milestone must be Advance or Full Payment so the verified sale can enter delivery.';
  end if;
  return jsonb_build_object('sourceCode',v_product.product_code_snapshot,'sourceName',v_product.product_name_snapshot,'schedule',v_schedule,'standardPaymentTerms',v_product.standard_payment_terms);
end; $$;

create or replace function public.snapshot_quotation_payment_schedule(p_quotation_id uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_q public.quotations%rowtype; v_res jsonb;
begin
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if v_q.payment_schedule_snapshot is not null then
    return jsonb_build_object('sourceCode',v_q.payment_schedule_source_code,'schedule',v_q.payment_schedule_snapshot,'capturedAt',v_q.payment_schedule_snapshotted_at);
  end if;
  if coalesce(v_q.total,0)<=0 then raise exception 'Quotation total must be greater than zero before payment can be configured.'; end if;
  v_res:=public.resolve_quotation_payment_schedule(p_quotation_id);
  perform set_config('profox.quotation_atomic_rpc','1',true);
  update public.quotations set
    payment_schedule_snapshot=v_res->'schedule',
    payment_schedule_source_code=v_res->>'sourceCode',
    payment_schedule_snapshotted_at=now(),
    payment_terms=coalesce(nullif(btrim(payment_terms),''),nullif(btrim(v_res->>'standardPaymentTerms'),'')),
    updated_at=now()
  where id=p_quotation_id
  returning * into v_q;
  perform set_config('profox.quotation_atomic_rpc','',true);
  return jsonb_build_object('sourceCode',v_q.payment_schedule_source_code,'schedule',v_q.payment_schedule_snapshot,'capturedAt',v_q.payment_schedule_snapshotted_at);
exception when others then
  perform set_config('profox.quotation_atomic_rpc','',true);
  raise;
end; $$;

create or replace function public.snapshot_quotation_payment_schedule_before_send()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_res jsonb;
begin
  if new.status='Sent' and old.status is distinct from new.status then
    if coalesce(new.total,0)<=0 then raise exception 'Quotation total must be greater than zero before sending.'; end if;
    if new.payment_schedule_snapshot is null then
      v_res:=public.resolve_quotation_payment_schedule(new.id);
      new.payment_schedule_snapshot:=v_res->'schedule';
      new.payment_schedule_source_code:=v_res->>'sourceCode';
      new.payment_schedule_snapshotted_at:=now();
      new.payment_terms:=coalesce(nullif(btrim(new.payment_terms),''),nullif(btrim(v_res->>'standardPaymentTerms'),''));
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_snapshot_quotation_payment_schedule on public.quotations;
create trigger trg_snapshot_quotation_payment_schedule
before update on public.quotations for each row execute function public.snapshot_quotation_payment_schedule_before_send();

create or replace function public.payment_gateway_settings_safe()
returns jsonb language sql stable security definer set search_path='public','pg_temp' as $$
  select coalesce((select config_value from public.system_configuration where config_key='payment_gateway_settings'),'{}'::jsonb);
$$;

create or replace function public.sync_quotation_payment_plan(p_quotation_id uuid)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_temp' as $$
declare
  v_q public.quotations%rowtype; v_schedule jsonb; v_cfg jsonb; v_base text; v_first_days int; v_item jsonb; v_number int; v_max int; v_pct numeric; v_amount numeric; v_allocated numeric:=0;
  v_token text; v_hash text; v_existing public.payments%rowtype; v_first public.payments%rowtype; v_link text; v_status text;
begin
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if v_q.status<>'Accepted' then raise exception 'Payment plan can be generated only for an accepted quotation.'; end if;
  if v_q.payment_schedule_snapshot is null then
    perform public.snapshot_quotation_payment_schedule(v_q.id);
    select * into v_q from public.quotations where id=p_quotation_id for update;
  end if;
  v_schedule:=v_q.payment_schedule_snapshot;
  if v_schedule is null or jsonb_typeof(v_schedule)<>'array' or jsonb_array_length(v_schedule)=0 then raise exception 'Accepted quotation does not have a payment schedule snapshot.'; end if;
  v_cfg:=public.payment_gateway_settings_safe();
  v_base:=rtrim(coalesce(nullif(v_cfg->>'checkoutBaseUrl',''),'https://www.profoxwebdesigner.com'),'/');
  v_first_days:=least(greatest(coalesce((v_cfg->>'firstPaymentDueDays')::int,7),0),90);
  select max((x->>'milestoneNumber')::int) into v_max from jsonb_array_elements(v_schedule) x;

  perform set_config('profox.payment_plan_sync','1',true);
  for v_item in select value from jsonb_array_elements(v_schedule) order by (value->>'milestoneNumber')::int loop
    v_number:=(v_item->>'milestoneNumber')::int; v_pct:=(v_item->>'percentage')::numeric;
    if v_number=v_max then v_amount:=round((v_q.total-v_allocated)::numeric,2); else v_amount:=round((v_q.total*v_pct/100.0)::numeric,2); v_allocated:=v_allocated+v_amount; end if;
    if v_amount<=0 then raise exception 'Calculated payment milestone amount must be greater than zero.'; end if;

    select * into v_existing from public.payments where quotation_id=v_q.id and (milestone_number=v_number or payment_type=v_item->>'paymentType') order by created_at limit 1;
    if found then
      if v_existing.public_payment_token_hash is null or coalesce(v_existing.payment_link,'')='' then
        v_token:=encode(extensions.gen_random_bytes(32),'hex'); v_hash:=encode(extensions.digest(v_token,'sha256'),'hex'); v_link:=v_base||'/pay/'||v_token;
        update public.payments set public_payment_token_hash=v_hash,public_payment_token_issued_at=now(),public_payment_token_expires_at=now()+interval '365 days',payment_link=v_link,updated_at=now() where id=v_existing.id returning * into v_existing;
      end if;
      if v_number=1 then v_first:=v_existing; end if;
      continue;
    end if;

    v_token:=encode(extensions.gen_random_bytes(32),'hex'); v_hash:=encode(extensions.digest(v_token,'sha256'),'hex'); v_link:=v_base||'/pay/'||v_token;
    v_status:=case when v_number=1 then 'Sent' else 'Draft' end;
    insert into public.payments(
      quotation_id,opportunity_id,client_id,salesperson_id,customer_name,customer_email,payment_type,milestone_number,milestone_label,amount_due,amount_paid,currency,
      payment_method,payment_provider,payment_link,status,due_date,created_by,public_payment_token_hash,public_payment_token_issued_at,public_payment_token_expires_at
    ) values(
      v_q.id,v_q.opportunity_id,v_q.client_id,v_q.salesperson_id,v_q.customer_name,coalesce(v_q.email,''),v_item->>'paymentType',v_number,coalesce(nullif(v_item->>'label',''),v_item->>'paymentType'),v_amount,0,v_q.currency,
      'Online Checkout',null,v_link,v_status,case when v_number=1 then current_date+v_first_days else null end,v_q.salesperson_id,v_hash,now(),now()+interval '365 days'
    ) returning * into v_existing;
    if v_number=1 then v_first:=v_existing; end if;
  end loop;

  if v_q.opportunity_id is not null then
    update public.crm_opportunities set stage='Awaiting Advance Payment',updated_at=now()
    where id=v_q.opportunity_id and status='Open' and stage<>'Won';
  end if;
  perform set_config('profox.payment_plan_sync','',true);
  return case when v_first.id is null then '{}'::jsonb else jsonb_build_object('paymentId',v_first.id,'paymentReference',v_first.payment_reference,'paymentUrl',v_first.payment_link,'paymentType',v_first.payment_type,'milestoneLabel',v_first.milestone_label,'amountDue',v_first.amount_due,'currency',v_first.currency,'status',v_first.status,'dueDate',v_first.due_date) end;
exception when others then
  perform set_config('profox.payment_plan_sync','',true);
  raise;
end; $$;

create or replace function public.validate_payment_request()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_internal text:=coalesce(current_setting('profox.payment_plan_sync',true),'');
begin
  if v_internal='1' then return new; end if;
  if coalesce(new.amount_due,0)<0 then raise exception 'Payment amount cannot be negative.'; end if;
  if tg_op='INSERT' then
    if public.is_admin() then
      if coalesce(new.amount_due,0)<=0 then raise exception 'Payment amount must be greater than zero.'; end if;
      return new;
    end if;
    raise exception 'Payment requests are generated automatically from accepted quotations. Sellers cannot create a separate payment amount or package.';
  end if;
  if public.is_admin() then return new; end if;
  if not public.has_active_role(array['sales']) or old.salesperson_id is distinct from auth.uid() then raise exception 'Unauthorized payment update.'; end if;
  if old.status in ('Verified','Refunded','Partially Refunded','Failed') then raise exception 'Settled or terminal payment records may only be changed by an Admin.'; end if;
  if new.quotation_id is distinct from old.quotation_id or new.opportunity_id is distinct from old.opportunity_id or new.client_id is distinct from old.client_id or new.salesperson_id is distinct from old.salesperson_id or new.customer_name is distinct from old.customer_name or new.customer_email is distinct from old.customer_email or new.payment_type is distinct from old.payment_type or new.milestone_number is distinct from old.milestone_number or new.milestone_label is distinct from old.milestone_label or new.amount_due is distinct from old.amount_due or new.amount_paid is distinct from old.amount_paid or new.currency is distinct from old.currency or new.verified_at is distinct from old.verified_at or new.verified_by is distinct from old.verified_by then raise exception 'Core payment amount, ownership and verification fields are locked for Sales.'; end if;
  if new.status not in ('Draft','Ready','Sent','Pending','Verification Pending','Cancelled') then raise exception 'Sales cannot set settlement status %.',new.status; end if;
  return new;
end; $$;

create or replace function public.open_public_payment(p_token text)
returns jsonb language plpgsql stable security definer set search_path='public','extensions','pg_temp' as $$
declare v_hash text; v_p public.payments%rowtype; v_q public.quotations%rowtype; v_cfg jsonb; v_r jsonb; v_pp jsonb; v_outstanding numeric;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Payment link is invalid.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_p from public.payments where public_payment_token_hash=v_hash and public_payment_token_issued_at is not null;
  if not found then raise exception 'Payment link is invalid or no longer available.'; end if;
  if v_p.public_payment_token_expires_at is not null and v_p.public_payment_token_expires_at<now() and v_p.status<>'Verified' then raise exception 'Payment link has expired. Please contact ProFox for a refreshed payment link.'; end if;
  if v_p.quotation_id is not null then select * into v_q from public.quotations where id=v_p.quotation_id; end if;
  v_cfg:=public.payment_gateway_settings_safe(); v_r:=coalesce(v_cfg->'razorpay','{}'::jsonb); v_pp:=coalesce(v_cfg->'paypal','{}'::jsonb);
  v_outstanding:=greatest(round(coalesce(v_p.amount_due,0)-coalesce(v_p.amount_paid,0),2),0);
  return jsonb_build_object(
    'paymentId',v_p.id,'paymentReference',v_p.payment_reference,'quotationNumber',v_q.quotation_number,'customerName',v_p.customer_name,'customerEmail',v_p.customer_email,
    'paymentType',v_p.payment_type,'milestoneNumber',v_p.milestone_number,'milestoneLabel',v_p.milestone_label,'amountDue',v_p.amount_due,'amountPaid',v_p.amount_paid,'outstanding',v_outstanding,
    'currency',v_p.currency,'status',v_p.status,'dueDate',v_p.due_date,'paidAt',v_p.paid_at,'verifiedAt',v_p.verified_at,
    'payable',(v_outstanding>0 and v_p.status in ('Sent','Pending','Partially Paid','Verification Pending')),
    'providers',jsonb_build_array(
      jsonb_build_object('id','razorpay','label','Razorpay','enabled',coalesce((v_r->>'enabled')::boolean,false) and coalesce((v_r->>'configured')::boolean,false) and coalesce((v_r->>'webhookConfigured')::boolean,false)),
      jsonb_build_object('id','paypal','label','PayPal','enabled',coalesce((v_pp->>'enabled')::boolean,false) and coalesce((v_pp->>'configured')::boolean,false) and coalesce((v_pp->>'webhookConfigured')::boolean,false))
    )
  );
end; $$;

create or replace function public.send_generated_payment_request(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_temp' as $$
declare v_p public.payments%rowtype; v_cfg jsonb; v_days int; v_token text; v_hash text; v_base text;
begin
  select * into v_p from public.payments where id=p_payment_id for update;
  if not found then raise exception 'Payment not found.'; end if;
  if not public.is_admin() and (not public.has_active_role(array['sales']) or v_p.salesperson_id is distinct from auth.uid()) then raise exception 'Unauthorized.'; end if;
  if v_p.status in ('Verified','Refunded','Partially Refunded','Failed','Cancelled') then raise exception 'This payment request is already settled or closed.'; end if;
  if v_p.quotation_id is null or not exists(select 1 from public.quotations q where q.id=v_p.quotation_id and q.status='Accepted') then raise exception 'Payment request requires an accepted quotation.'; end if;
  v_cfg:=public.payment_gateway_settings_safe(); v_days:=least(greatest(coalesce((v_cfg->>'milestoneDueDays')::int,5),0),90); v_base:=rtrim(coalesce(nullif(v_cfg->>'checkoutBaseUrl',''),'https://www.profoxwebdesigner.com'),'/');
  if v_p.public_payment_token_hash is null or coalesce(v_p.payment_link,'')='' or (v_p.public_payment_token_expires_at is not null and v_p.public_payment_token_expires_at<now()) then
    v_token:=encode(extensions.gen_random_bytes(32),'hex'); v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
    v_p.payment_link:=v_base||'/pay/'||v_token;
  else v_hash:=v_p.public_payment_token_hash; end if;
  perform set_config('profox.payment_plan_sync','1',true);
  update public.payments set status='Sent',due_date=coalesce(due_date,current_date+v_days),payment_link=v_p.payment_link,public_payment_token_hash=v_hash,
    public_payment_token_issued_at=case when v_token is not null then now() else public_payment_token_issued_at end,
    public_payment_token_expires_at=case when v_token is not null then now()+interval '365 days' else public_payment_token_expires_at end,updated_at=now()
  where id=p_payment_id returning * into v_p;
  perform set_config('profox.payment_plan_sync','',true);
  return jsonb_build_object('paymentId',v_p.id,'paymentReference',v_p.payment_reference,'paymentUrl',v_p.payment_link,'amountDue',v_p.amount_due,'currency',v_p.currency,'status',v_p.status,'dueDate',v_p.due_date);
exception when others then perform set_config('profox.payment_plan_sync','',true); raise;
end; $$;

create or replace function public.activate_project_payment_milestone()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_type text; v_payment public.payments%rowtype;
begin
  if old.stage is not distinct from new.stage or new.quotation_id is null then return new; end if;
  if new.stage='Development' and exists(select 1 from public.payments where quotation_id=new.quotation_id and payment_type='Design Milestone') and not exists(select 1 from public.payments where quotation_id=new.quotation_id and payment_type='Design Milestone' and status='Verified') then
    raise exception 'Verified Design Milestone payment is required before Development.';
  end if;
  if new.stage='Final Revisions' and exists(select 1 from public.payments where quotation_id=new.quotation_id and payment_type='Staging Milestone') and not exists(select 1 from public.payments where quotation_id=new.quotation_id and payment_type='Staging Milestone' and status='Verified') then
    raise exception 'Verified Staging Milestone payment is required before Final Revisions.';
  end if;
  v_type:=case new.stage when 'Client Design Approval' then 'Design Milestone' when 'Client Review' then 'Staging Milestone' when 'Final Revisions' then 'Final Payment' else null end;
  if v_type is not null then
    select * into v_payment from public.payments where quotation_id=new.quotation_id and payment_type=v_type order by milestone_number limit 1;
    if found and v_payment.status in ('Draft','Ready') then perform public.send_generated_payment_request(v_payment.id); end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_activate_project_payment_milestone on public.projects;
create trigger trg_activate_project_payment_milestone before update of stage on public.projects for each row execute function public.activate_project_payment_milestone();

create or replace function public.respond_public_quotation(p_token text,p_response text,p_note text default '')
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_temp' as $$
declare v_hash text; v_quote public.quotations%rowtype; v_response text:=lower(btrim(coalesce(p_response,''))); v_note text:=left(btrim(coalesce(p_note,'')),2000); v_payment jsonb:='{}'::jsonb;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>256 then raise exception 'Quotation link is invalid.'; end if;
  if v_response not in ('accept','reject') then raise exception 'Choose Accept or Decline.'; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  select * into v_quote from public.quotations where customer_view_token_hash=v_hash for update;
  if not found then raise exception 'Quotation link is invalid or no longer available.'; end if;
  if v_quote.status='Accepted' and v_response='accept' then
    v_payment:=public.sync_quotation_payment_plan(v_quote.id);
    return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status','Accepted','acceptedAt',v_quote.accepted_at,'payment',v_payment);
  end if;
  if v_quote.status='Rejected' and v_response='reject' then return jsonb_build_object('quotationNumber',v_quote.quotation_number,'status','Rejected','rejectedAt',v_quote.rejected_at); end if;
  if v_quote.status<>'Sent' then raise exception 'This quotation can no longer be changed from this link.'; end if;
  if v_quote.valid_until is not null and v_quote.valid_until<current_date then raise exception 'This quotation has expired. Please contact ProFox for an updated quotation.'; end if;
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
end; $$;

revoke all on function public.resolve_quotation_payment_schedule(uuid) from public,anon,authenticated;
revoke all on function public.snapshot_quotation_payment_schedule(uuid) from public,anon,authenticated;
revoke all on function public.sync_quotation_payment_plan(uuid) from public,anon,authenticated;
revoke all on function public.payment_gateway_settings_safe() from public,anon,authenticated;
revoke all on function public.open_public_payment(text) from public;
revoke all on function public.send_generated_payment_request(uuid) from public,anon;
grant execute on function public.open_public_payment(text) to anon,authenticated,service_role;
grant execute on function public.send_generated_payment_request(uuid) to authenticated,service_role;
grant execute on function public.sync_quotation_payment_plan(uuid) to service_role;
grant execute on function public.snapshot_quotation_payment_schedule(uuid) to service_role;
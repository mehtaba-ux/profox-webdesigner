-- PROFOX SALES SOP PART 12
-- Awaiting Advance Payment + Verified Payment -> Won + sale-activation integrity.
-- This migration adds no business table and performs no business-data backfill.

do $part12_preflight$
declare
  v_policy jsonb;
begin
  select config_value into v_policy
  from public.system_configuration
  where config_key='crm_quotation_sales_reconciliation_policy_v1';

  if v_policy is null
     or coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,false) is distinct from true
     or coalesce((v_policy->>'policyVersion')::int,0) <> 2
     or coalesce((v_policy->>'snapshotSchemaVersion')::int,0) <> 2 then
    raise exception 'Part 12 requires the active Part 10B send gate under policy/schema version 2.';
  end if;

  if to_regprocedure('public.verify_payment_atomic(uuid,uuid,text,numeric)') is null
     or to_regprocedure('public.create_project_from_sale(uuid)') is null
     or to_regprocedure('public.ensure_client_onboarding_for_project(uuid,boolean)') is null
     or to_regprocedure('public.crm_transition_opportunity(uuid,text)') is null then
    raise exception 'Part 12 canonical payment/sale activation dependencies are missing.';
  end if;
end;
$part12_preflight$;

create or replace function public.protect_payment_verification_fields()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $part12$
declare
  v_gateway text:=coalesce(current_setting('profox.gateway_settlement',true),'');
  v_sync text:=coalesce(current_setting('profox.payment_plan_sync',true),'');
  v_verify text:=coalesce(current_setting('profox.payment_verification_rpc',true),'');
begin
  if v_gateway='1' or v_sync='1' or v_verify='1' then
    return new;
  end if;

  if tg_op='INSERT' then
    if new.status in ('Verified','Partially Paid')
       or new.verified_at is not null
       or new.verified_by is not null
       or coalesce(new.amount_paid,0)<>0 then
      raise exception 'Payment settlement evidence must be created through the protected verification workflow.';
    end if;
    return new;
  end if;

  if new.status in ('Verified','Partially Paid')
     and new.status is distinct from old.status then
    raise exception 'Payment verification is restricted to Admin or trusted gateway settlement through the protected verification workflow.';
  end if;

  if new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by
     or new.amount_paid is distinct from old.amount_paid then
    raise exception 'Payment settlement evidence is server-derived and may only change through the protected verification workflow.';
  end if;

  return new;
end;
$part12$;

drop trigger if exists trg_protect_payment_verification_fields on public.payments;
create trigger trg_protect_payment_verification_fields
before insert or update on public.payments
for each row execute function public.protect_payment_verification_fields();

create or replace function public.protect_opportunity_won_transition()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $part12$
declare
  v_verified_won text:=coalesce(current_setting('profox.payment_verified_won_transition',true),'');
begin
  if tg_op='INSERT' then
    if new.stage='Awaiting Advance Payment' then
      raise exception 'Customer acceptance is required before moving this opportunity to Awaiting Advance Payment.';
    end if;
    if new.status='Won' or new.stage='Won' then
      raise exception 'Won is created automatically when a qualifying payment is verified.';
    end if;
    return new;
  end if;

  if new.stage='Awaiting Advance Payment'
     and old.stage is distinct from new.stage
     and not exists (
       select 1
       from public.quotations q
       where q.opportunity_id=new.id
         and q.status='Accepted'
         and q.accepted_at is not null
     ) then
    raise exception 'Customer acceptance is required before moving this opportunity to Awaiting Advance Payment.';
  end if;

  if (new.status='Won' or new.stage='Won')
     and (old.status is distinct from new.status or old.stage is distinct from new.stage) then
    if v_verified_won<>'1' then
      raise exception 'Won is created automatically when a qualifying payment is verified.';
    end if;

    if not exists (
      select 1
      from public.payments p
      join public.quotations q on q.id=p.quotation_id
      where p.opportunity_id=new.id
        and p.status='Verified'
        and p.payment_type in ('Advance','Full Payment')
        and q.opportunity_id=new.id
        and q.status='Accepted'
        and q.accepted_at is not null
    ) then
      raise exception 'Opportunity may become Won only inside qualifying verified-payment processing.';
    end if;
  end if;
  return new;
end;
$part12$;

drop trigger if exists trg_protect_opportunity_won_transition on public.crm_opportunities;
create trigger trg_protect_opportunity_won_transition
before insert or update on public.crm_opportunities
for each row execute function public.protect_opportunity_won_transition();

create or replace function public.sync_quotation_payment_plan(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_temp'
as $part12$
declare
  v_q public.quotations%rowtype;
  v_schedule jsonb;
  v_cfg jsonb;
  v_base text;
  v_first_days int;
  v_item jsonb;
  v_number int;
  v_max int;
  v_pct numeric;
  v_amount numeric;
  v_allocated numeric:=0;
  v_token text;
  v_hash text;
  v_existing public.payments%rowtype;
  v_first public.payments%rowtype;
  v_link text;
  v_status text;
begin
  select * into v_q from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found.'; end if;
  if v_q.status<>'Accepted' or v_q.accepted_at is null then
    raise exception 'Payment plan can be generated only after canonical customer quotation acceptance is recorded.';
  end if;

  if v_q.payment_schedule_snapshot is null then
    perform public.snapshot_quotation_payment_schedule(v_q.id);
    select * into v_q from public.quotations where id=p_quotation_id for update;
  end if;

  v_schedule:=v_q.payment_schedule_snapshot;
  if v_schedule is null or jsonb_typeof(v_schedule)<>'array' or jsonb_array_length(v_schedule)=0 then
    raise exception 'Accepted quotation does not have a payment schedule snapshot.';
  end if;

  v_cfg:=public.payment_gateway_settings_safe();
  v_base:=rtrim(coalesce(nullif(v_cfg->>'checkoutBaseUrl',''),'https://www.profoxwebdesigner.com'),'/');
  v_first_days:=least(greatest(coalesce((v_cfg->>'firstPaymentDueDays')::int,7),0),90);
  select max((x->>'milestoneNumber')::int) into v_max from jsonb_array_elements(v_schedule) x;

  perform set_config('profox.payment_plan_sync','1',true);
  for v_item in
    select value from jsonb_array_elements(v_schedule)
    order by (value->>'milestoneNumber')::int
  loop
    v_number:=(v_item->>'milestoneNumber')::int;
    v_pct:=(v_item->>'percentage')::numeric;
    if v_number=v_max then
      v_amount:=round((v_q.total-v_allocated)::numeric,2);
    else
      v_amount:=round((v_q.total*v_pct/100.0)::numeric,2);
      v_allocated:=v_allocated+v_amount;
    end if;
    if v_amount<=0 then raise exception 'Calculated payment milestone amount must be greater than zero.'; end if;

    select * into v_existing
    from public.payments
    where quotation_id=v_q.id
      and (milestone_number=v_number or payment_type=v_item->>'paymentType')
    order by created_at
    limit 1;

    if found then
      if v_existing.opportunity_id is distinct from v_q.opportunity_id then
        raise exception 'The Payment is linked to a different quotation/opportunity.';
      end if;
      if v_existing.public_payment_token_hash is null or coalesce(v_existing.payment_link,'')='' then
        v_token:=encode(extensions.gen_random_bytes(32),'hex');
        v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
        v_link:=v_base||'/pay/'||v_token;
        update public.payments
        set public_payment_token_hash=v_hash,
            public_payment_token_issued_at=now(),
            public_payment_token_expires_at=now()+interval '365 days',
            payment_link=v_link,
            updated_at=now()
        where id=v_existing.id
        returning * into v_existing;
      end if;
      if v_number=1 then v_first:=v_existing; end if;
      continue;
    end if;

    v_token:=encode(extensions.gen_random_bytes(32),'hex');
    v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
    v_link:=v_base||'/pay/'||v_token;
    v_status:=case when v_number=1 then 'Sent' else 'Draft' end;

    insert into public.payments(
      quotation_id,opportunity_id,client_id,salesperson_id,customer_name,customer_email,
      payment_type,milestone_number,milestone_label,amount_due,amount_paid,currency,
      payment_method,payment_provider,payment_link,status,due_date,created_by,
      public_payment_token_hash,public_payment_token_issued_at,public_payment_token_expires_at
    )
    values(
      v_q.id,v_q.opportunity_id,v_q.client_id,v_q.salesperson_id,v_q.customer_name,coalesce(v_q.email,''),
      v_item->>'paymentType',v_number,coalesce(nullif(v_item->>'label',''),v_item->>'paymentType'),
      v_amount,0,v_q.currency,'Online Checkout',null,v_link,v_status,
      case when v_number=1 then current_date+v_first_days else null end,
      v_q.salesperson_id,v_hash,now(),now()+interval '365 days'
    )
    returning * into v_existing;

    if v_number=1 then v_first:=v_existing; end if;
  end loop;

  if v_q.opportunity_id is not null then
    update public.crm_opportunities
    set stage='Awaiting Advance Payment',updated_at=now()
    where id=v_q.opportunity_id
      and status='Open'
      and stage<>'Won'
      and exists (
        select 1 from public.quotations q
        where q.id=v_q.id
          and q.opportunity_id=public.crm_opportunities.id
          and q.status='Accepted'
          and q.accepted_at is not null
      );
  end if;

  perform set_config('profox.payment_plan_sync','',true);
  return case
    when v_first.id is null then '{}'::jsonb
    else jsonb_build_object(
      'paymentId',v_first.id,
      'paymentReference',v_first.payment_reference,
      'paymentUrl',v_first.payment_link,
      'paymentType',v_first.payment_type,
      'milestoneLabel',v_first.milestone_label,
      'amountDue',v_first.amount_due,
      'currency',v_first.currency,
      'status',v_first.status,
      'dueDate',v_first.due_date
    )
  end;
exception when others then
  perform set_config('profox.payment_plan_sync','',true);
  raise;
end;
$part12$;

create or replace function public.verify_payment_atomic(
  p_payment_id uuid,
  p_admin_id uuid default null,
  p_notes text default '',
  p_amount_received numeric default null
)
returns uuid
language plpgsql
security definer
set search_path='public','pg_temp'
as $part12$
declare
  v_payment public.payments%rowtype;
  v_opp public.crm_opportunities%rowtype;
  v_quote public.quotations%rowtype;
  v_client_id uuid;
  v_identity text;
  v_received numeric;
  v_project_id uuid;
  v_gateway boolean:=coalesce(current_setting('profox.gateway_settlement',true),'')='1';
begin
  if not public.is_admin() and not v_gateway then
    raise exception 'Payment verification is restricted to Admin or trusted gateway settlement.';
  end if;
  if not v_gateway and p_admin_id is not null and p_admin_id is distinct from auth.uid() then
    raise exception 'Payment verification actor is server-derived from the authenticated Admin.';
  end if;

  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found then raise exception 'Payment not found.'; end if;

  if v_payment.status='Verified' then
    if v_payment.payment_type in ('Advance','Full Payment') then
      if not exists(
        select 1
        from public.quotations q
        where q.id=v_payment.quotation_id
          and q.opportunity_id=v_payment.opportunity_id
          and q.status='Accepted'
          and q.accepted_at is not null
      ) then
        raise exception 'Verified payment lineage is inconsistent with canonical quotation acceptance.';
      end if;
      if not exists(
        select 1
        from public.crm_opportunities o
        where o.id=v_payment.opportunity_id
          and o.status='Won'
          and o.stage='Won'
      ) then
        raise exception 'Verified qualifying payment exists but Won activation is incomplete. Admin review is required.';
      end if;
    end if;
    perform public.generate_commission_for_verified_payment(p_payment_id);
    if v_payment.payment_type in ('Advance','Full Payment') and v_payment.opportunity_id is not null then
      v_project_id:=public.create_project_from_sale(v_payment.opportunity_id);
    end if;
    return v_payment.client_id;
  end if;

  if v_payment.status in ('Cancelled','Failed','Refunded') then
    raise exception 'A cancelled, failed, or refunded payment cannot be verified.';
  end if;
  if coalesce(v_payment.amount_due,0)<=0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  v_received:=round(coalesce(p_amount_received,nullif(v_payment.amount_paid,0),v_payment.amount_due)::numeric,2);
  if v_received<=0 then raise exception 'Confirmed amount received must be greater than zero.'; end if;
  if v_received>round(v_payment.amount_due::numeric,2) then
    raise exception 'Confirmed amount received (%) cannot exceed this payment request amount (%).',v_received,v_payment.amount_due;
  end if;

  if v_payment.quotation_id is not null then
    select * into v_quote from public.quotations where id=v_payment.quotation_id for share;
    if not found then raise exception 'Quotation linked to payment was not found.'; end if;
  end if;

  if v_payment.payment_type in ('Advance','Full Payment') then
    if v_payment.quotation_id is null or v_quote.status<>'Accepted' or v_quote.accepted_at is null then
      raise exception 'Advance/full payment may only be verified against a canonically accepted quotation.';
    end if;
    if v_payment.opportunity_id is null or v_quote.opportunity_id is distinct from v_payment.opportunity_id then
      raise exception 'The Payment is linked to a different quotation/opportunity.';
    end if;

    select * into v_opp from public.crm_opportunities where id=v_payment.opportunity_id for update;
    if not found then raise exception 'Opportunity linked to payment was not found.'; end if;

    if v_opp.client_id is not null and v_quote.client_id is not null and v_opp.client_id is distinct from v_quote.client_id then
      raise exception 'Cross-client activation is blocked: opportunity and accepted quotation client links do not match.';
    end if;
    if v_opp.client_id is not null and v_payment.client_id is not null and v_opp.client_id is distinct from v_payment.client_id then
      raise exception 'Cross-client activation is blocked: opportunity and payment client links do not match.';
    end if;
    if v_quote.client_id is not null and v_payment.client_id is not null and v_quote.client_id is distinct from v_payment.client_id then
      raise exception 'Cross-client activation is blocked: accepted quotation and payment client links do not match.';
    end if;
  end if;

  perform set_config('profox.payment_verification_rpc','1',true);

  if v_received<round(v_payment.amount_due::numeric,2) then
    update public.payments
    set amount_paid=v_received,
        status='Partially Paid',
        paid_at=coalesce(paid_at,now()),
        verified_at=null,
        verified_by=null,
        notes=coalesce(nullif(trim(p_notes),''),notes),
        updated_at=now()
    where id=p_payment_id;
    perform set_config('profox.payment_verification_rpc','',true);
    return v_payment.client_id;
  end if;

  update public.payments
  set status='Verified',
      amount_paid=v_received,
      paid_at=coalesce(paid_at,now()),
      verified_at=now(),
      verified_by=case when v_gateway then null else auth.uid() end,
      notes=coalesce(nullif(trim(p_notes),''),notes),
      updated_at=now()
  where id=p_payment_id
  returning * into v_payment;

  if v_payment.payment_type in ('Advance','Full Payment') and v_payment.opportunity_id is not null then
    v_client_id:=coalesce(v_opp.client_id,v_quote.client_id,v_payment.client_id);

    if v_client_id is not null and not exists(select 1 from public.clients c where c.id=v_client_id) then
      raise exception 'Canonical Client link could not be resolved.';
    end if;

    if v_client_id is null then
      if trim(coalesce(v_opp.email,''))<>'' and trim(coalesce(v_opp.company_name,''))<>'' then
        v_identity:=lower(trim(v_opp.email))||'|'||lower(trim(v_opp.company_name));
        perform pg_advisory_xact_lock(hashtextextended(v_identity,0));
      end if;

      select id into v_client_id
      from public.clients
      where lower(trim(coalesce(email,'')))=lower(trim(coalesce(v_opp.email,'')))
        and lower(trim(coalesce(company_name,'')))=lower(trim(coalesce(v_opp.company_name,'')))
      order by created_at
      limit 1;

      if v_client_id is null then
        insert into public.clients(
          company_name,primary_contact_name,email,phone,website,country,industry,
          salesperson_id,source_opportunity_id,first_quotation_id,total_sales_value,currency,status
        )
        values(
          coalesce(nullif(trim(v_opp.company_name),''),v_opp.name),
          coalesce(nullif(trim(v_opp.contact_name),''),nullif(trim(v_opp.company_name),''),v_opp.name),
          coalesce(v_opp.email,''),v_opp.phone,v_opp.website,v_opp.country,v_opp.industry,
          v_opp.salesperson_id,v_opp.id,v_payment.quotation_id,
          coalesce(v_quote.total,v_opp.expected_value,0),
          coalesce(v_quote.currency,v_opp.currency,'USD'),'Active'
        )
        returning id into v_client_id;
      end if;
    end if;

    update public.crm_opportunities
    set client_id=v_client_id,updated_at=now()
    where id=v_opp.id;

    update public.quotations
    set client_id=v_client_id,updated_at=now()
    where id=v_quote.id;

    update public.payments
    set client_id=v_client_id,updated_at=now()
    where id=p_payment_id
    returning * into v_payment;

    perform set_config('profox.payment_verified_won_transition','1',true);
    update public.crm_opportunities
    set status='Won',
        stage='Won',
        won_at=coalesce(won_at,now()),
        updated_at=now()
    where id=v_opp.id;
    perform set_config('profox.payment_verified_won_transition','',true);
  end if;

  perform public.generate_commission_for_verified_payment(p_payment_id);

  if v_payment.payment_type in ('Advance','Full Payment') and v_payment.opportunity_id is not null then
    v_project_id:=public.create_project_from_sale(v_payment.opportunity_id);
  end if;

  perform set_config('profox.payment_verification_rpc','',true);
  return v_client_id;
exception when others then
  perform set_config('profox.payment_verified_won_transition','',true);
  perform set_config('profox.payment_verification_rpc','',true);
  raise;
end;
$part12$;

create or replace function public.crm_get_sale_activation_state(p_opportunity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $part12$
declare
  v_uid uuid:=auth.uid();
  v_is_admin boolean:=public.is_admin();
  v_team boolean:=v_is_admin or public.has_active_role(array['project_manager']::text[]);
  v_opp public.crm_opportunities%rowtype;
  v_quote public.quotations%rowtype;
  v_payment public.payments%rowtype;
  v_follow public.crm_activities%rowtype;
  v_follow_owner text;
  v_project public.projects%rowtype;
  v_onboarding public.client_onboardings%rowtype;
  v_commission public.commission_entries%rowtype;
  v_outstanding numeric:=0;
  v_overdue boolean:=false;
  v_customer_action boolean:=false;
  v_external_wait boolean:=false;
  v_label text;
  v_next jsonb;
  v_blockers jsonb:='[]'::jsonb;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;

  select * into v_opp
  from public.crm_opportunities
  where id=p_opportunity_id and archived_at is null;

  if not found then raise exception 'Opportunity not found.'; end if;

  if not v_team and (
    not public.sales_crm_access_ready()
    or v_opp.salesperson_id is distinct from v_uid
  ) then
    raise exception 'CRM access required.';
  end if;

  select * into v_quote
  from public.quotations q
  where q.opportunity_id=v_opp.id
    and q.status='Accepted'
    and q.accepted_at is not null
  order by q.accepted_at desc,q.created_at desc
  limit 1;

  if v_quote.id is not null then
    select * into v_payment
    from public.payments p
    where p.opportunity_id=v_opp.id
      and p.quotation_id=v_quote.id
      and p.payment_type in ('Advance','Full Payment')
    order by coalesce(p.milestone_number,1),p.created_at,p.id
    limit 1;
  end if;

  select * into v_follow
  from public.crm_activities a
  where a.opportunity_id=v_opp.id
    and a.status='Scheduled'
    and a.activity_type='Payment Follow-Up'
  order by a.due_at,a.created_at,a.id
  limit 1;

  if v_follow.id is not null and v_follow.assigned_to is not null then
    select full_name into v_follow_owner from public.user_profiles where id=v_follow.assigned_to;
  end if;

  if v_opp.client_id is not null then
    select * into v_project
    from public.projects p
    where p.source_opportunity_id=v_opp.id
    order by p.created_at
    limit 1;
  end if;

  if v_project.id is not null then
    select * into v_onboarding
    from public.client_onboardings co
    where co.project_id=v_project.id
    limit 1;
  end if;

  if v_payment.id is not null then
    select * into v_commission
    from public.commission_entries ce
    where ce.payment_id=v_payment.id
    limit 1;
    v_outstanding:=round(greatest(coalesce(v_payment.amount_due,0)-coalesce(v_payment.amount_paid,0),0)::numeric,2);
    v_overdue:=v_payment.status not in ('Verified','Cancelled','Failed','Refunded')
               and v_payment.due_date is not null
               and v_payment.due_date<current_date;
    v_customer_action:=coalesce(v_payment.payment_link,'')<>''
                       and v_payment.status in ('Sent','Pending','Partially Paid');
    v_external_wait:=v_customer_action and v_payment.due_date is not null;
  end if;

  if v_quote.id is null then
    v_label:='QUOTATION NOT ACCEPTED';
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','CUSTOMER_ACCEPTANCE_REQUIRED',
      'message','Customer acceptance is required before moving this opportunity to Awaiting Advance Payment.'
    ));
    v_next:=jsonb_build_object('kind','quotation','label','Secure canonical quotation acceptance','url','/admin/app/sales?tab=quotations');
  elsif v_payment.id is null then
    v_label:='REQUEST NOT CREATED';
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','PAYMENT_REQUEST_MISSING',
      'message','The accepted quotation has no canonical Advance/Full Payment request. Generate the payment plan through the existing quotation/payment workflow.'
    ));
    v_next:=jsonb_build_object('kind','payment','label','Generate the canonical payment request','url','/admin/app/sales?tab=payments');
  elsif v_payment.status in ('Draft','Ready') then
    v_label:='REQUEST NOT SENT';
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','PAYMENT_REQUEST_NOT_SENT',
      'message','The canonical payment request exists but has not been sent to the customer.'
    ));
    v_next:=jsonb_build_object('kind','payment','label','Send the existing payment request','url','/admin/app/sales?tab=payments');
  elsif v_payment.status='Partially Paid' then
    v_label:='PARTIAL PAYMENT RECEIVED';
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','PARTIAL_PAYMENT',
      'message','The customer has paid only part of the required amount. The opportunity cannot become Won.'
    ));
    if v_follow.id is not null then
      v_next:=jsonb_build_object(
        'kind','activity','label',v_follow.subject,'dueAt',v_follow.due_at,
        'ownerId',v_follow.assigned_to,'ownerName',coalesce(v_follow_owner,'Unassigned'),
        'url','/admin/app/crm?tab=activities'
      );
    else
      v_next:=jsonb_build_object(
        'kind','external_wait','label',
        case when v_overdue then 'Follow up on the overdue remaining balance' else 'Wait for the remaining customer payment' end,
        'dueAt',v_payment.due_date,'waitingOn','Customer payment',
        'url','/admin/app/sales?tab=payments'
      );
    end if;
  elsif v_payment.status='Verification Pending' then
    v_label:='VERIFICATION REQUIRED';
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'code','PAYMENT_VERIFICATION_REQUIRED',
      'message','An Advance or Full Payment is awaiting verification.'
    ));
    v_next:=jsonb_build_object(
      'kind','verification',
      'label',case when v_is_admin then 'Review and verify payment evidence' else 'Await protected Admin payment verification' end,
      'url','/admin/app/sales?tab=payments'
    );
  elsif v_payment.status='Verified' then
    v_label:='VERIFIED';
    if v_opp.status<>'Won' or v_opp.stage<>'Won' then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','WON_ACTIVATION_INCOMPLETE',
        'message','Verified qualifying payment exists but Won activation is incomplete. Admin review is required.'
      ));
    end if;
    if v_opp.status='Won' and v_opp.client_id is null then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','CLIENT_ACTIVATION_INCOMPLETE','message','Won sale is missing its canonical Client link.'
      ));
    end if;
    if v_opp.status='Won' and v_project.id is null then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','PROJECT_ACTIVATION_INCOMPLETE','message','Won sale is missing its canonical Project activation.'
      ));
    end if;
    if v_project.id is not null and v_onboarding.id is null then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','ONBOARDING_ACTIVATION_INCOMPLETE','message','Activated Project is missing its canonical Client Onboarding record.'
      ));
    end if;
    v_next:=case
      when jsonb_array_length(v_blockers)>0
        then jsonb_build_object('kind','admin_review','label','Review sale activation integrity','url','/admin/app/sales?tab=payments')
      else jsonb_build_object('kind','activated','label','Sale activation complete','url','/admin/app/projects')
    end;
  elsif v_payment.status='Failed' then
    v_label:='FAILED';
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PAYMENT_FAILED','message','The payment failed and cannot create Won.'));
    v_next:=jsonb_build_object('kind','payment','label','Review the canonical payment request','url','/admin/app/sales?tab=payments');
  elsif v_payment.status='Cancelled' then
    v_label:='CANCELLED';
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PAYMENT_CANCELLED','message','The payment is cancelled and cannot create Won.'));
    v_next:=jsonb_build_object('kind','payment','label','Review the canonical payment request','url','/admin/app/sales?tab=payments');
  elsif v_payment.status in ('Refunded','Partially Refunded') then
    v_label:=upper(v_payment.status);
    v_next:=jsonb_build_object('kind','history','label','Review canonical payment history','url','/admin/app/sales?tab=payments');
  else
    v_label:=case when v_overdue then 'PAYMENT OVERDUE' else 'AWAITING CUSTOMER PAYMENT' end;
    if v_overdue then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','PAYMENT_OVERDUE','message','The customer payment is overdue. Follow up through the canonical CRM activity workflow.'
      ));
    end if;
    if v_follow.id is not null then
      v_next:=jsonb_build_object(
        'kind','activity','label',v_follow.subject,'dueAt',v_follow.due_at,
        'ownerId',v_follow.assigned_to,'ownerName',coalesce(v_follow_owner,'Unassigned'),
        'url','/admin/app/crm?tab=activities'
      );
    else
      v_next:=jsonb_build_object(
        'kind','external_wait',
        'label',case when v_overdue then 'Follow up because payment is overdue' else 'Follow up if unpaid by the due date' end,
        'dueAt',v_payment.due_date,'waitingOn','Customer payment',
        'url','/admin/app/sales?tab=payments'
      );
    end if;
  end if;

  return jsonb_build_object(
    'opportunityId',v_opp.id,
    'opportunityStage',v_opp.stage,
    'opportunityStatus',v_opp.status,
    'wonAt',v_opp.won_at,
    'acceptedQuotation',case when v_quote.id is null then null else jsonb_build_object(
      'id',v_quote.id,'quotationNumber',v_quote.quotation_number,'status',v_quote.status,
      'acceptedAt',v_quote.accepted_at,'total',v_quote.total,'currency',v_quote.currency,
      'url','/admin/quotations/'||v_quote.id::text
    ) end,
    'payment',case when v_payment.id is null then null else jsonb_build_object(
      'id',v_payment.id,'paymentReference',v_payment.payment_reference,'paymentType',v_payment.payment_type,
      'status',v_payment.status,'amountDue',v_payment.amount_due,'amountPaid',v_payment.amount_paid,
      'outstandingAmount',v_outstanding,'currency',v_payment.currency,'dueDate',v_payment.due_date,
      'requestAvailable',v_customer_action,'externalWaitRepresented',v_external_wait,'overdue',v_overdue,
      'verifiedAt',v_payment.verified_at,
      'verifiedBy',case when v_is_admin then v_payment.verified_by else null end
    ) end,
    'paymentFollowUp',case when v_follow.id is null then null else jsonb_build_object(
      'id',v_follow.id,'subject',v_follow.subject,'dueAt',v_follow.due_at,'assignedTo',v_follow.assigned_to,
      'ownerName',coalesce(v_follow_owner,'Unassigned'),'overdue',v_follow.due_at<now()
    ) end,
    'operationalLabel',v_label,
    'nextAction',v_next,
    'blockers',v_blockers,
    'client',jsonb_build_object('linked',v_opp.client_id is not null,'id',v_opp.client_id),
    'project',jsonb_build_object('created',v_project.id is not null,'id',v_project.id,'stage',v_project.stage,'status',v_project.status),
    'onboarding',jsonb_build_object('created',v_onboarding.id is not null,'id',v_onboarding.id,'status',v_onboarding.status),
    'commission',jsonb_build_object('created',v_commission.id is not null,'id',v_commission.id,'status',v_commission.status),
    'canVerifyPayment',v_is_admin,
    'paymentWorkspaceUrl','/admin/app/sales?tab=payments',
    'activityWorkspaceUrl','/admin/app/crm?tab=activities'
  );
end;
$part12$;

create or replace function public.crm_get_sale_activation_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $part12$
declare
  v_uid uuid:=auth.uid();
  v_team boolean;
  v_result jsonb:='[]'::jsonb;
  r record;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  v_team:=public.is_admin() or public.has_active_role(array['project_manager']::text[]);
  if not v_team and not public.sales_crm_access_ready() then
    raise exception 'CRM access required.';
  end if;

  for r in
    select o.id
    from public.crm_opportunities o
    where o.archived_at is null
      and (v_team or o.salesperson_id=v_uid)
      and (o.stage='Awaiting Advance Payment' or o.status='Won' or o.stage='Won')
    order by coalesce(o.won_at,o.updated_at,o.created_at) desc,o.id
  loop
    v_result:=v_result||jsonb_build_array(public.crm_get_sale_activation_state(r.id));
  end loop;

  return v_result;
end;
$part12$;

revoke all on function public.crm_get_sale_activation_state(uuid) from public,anon;
revoke all on function public.crm_get_sale_activation_queue() from public,anon;
grant execute on function public.crm_get_sale_activation_state(uuid) to authenticated;
grant execute on function public.crm_get_sale_activation_queue() to authenticated;

do $part12_postconditions$
declare
  v_policy jsonb;
begin
  select config_value into v_policy
  from public.system_configuration
  where config_key='crm_quotation_sales_reconciliation_policy_v1';

  if coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,false) is distinct from true
     or coalesce((v_policy->>'policyVersion')::int,0) <> 2
     or coalesce((v_policy->>'snapshotSchemaVersion')::int,0) <> 2 then
    raise exception 'Part 12 altered protected Part 10B quotation-send policy state.';
  end if;

  if to_regprocedure('public.crm_get_sale_activation_state(uuid)') is null
     or to_regprocedure('public.crm_get_sale_activation_queue()') is null then
    raise exception 'Part 12 sale-activation read model was not installed.';
  end if;
end;
$part12_postconditions$;

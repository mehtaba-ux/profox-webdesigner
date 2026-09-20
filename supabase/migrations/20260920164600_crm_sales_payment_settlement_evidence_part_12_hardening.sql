-- PROFOX SALES SOP PART 12 HARDENING
-- Protect provider settlement identity and paid-at evidence from direct browser/table writes.
-- Additive only: no business table, no business-data backfill, no historical rewrite.

do $part12_settlement_preflight$
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
    raise exception 'Part 12 settlement hardening requires the active Part 10B send gate under policy/schema version 2.';
  end if;

  if to_regprocedure('public.verify_payment_atomic(uuid,uuid,text,numeric)') is null
     or to_regprocedure('public.protect_payment_verification_fields()') is null
     or to_regprocedure('public.service_finalize_payment_gateway_attempt(uuid,text,text,jsonb)') is null then
    raise exception 'Part 12 canonical payment verification/gateway dependencies are missing.';
  end if;
end;
$part12_settlement_preflight$;

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
  -- Canonical internal paths set a transaction-local context before touching settlement evidence.
  if v_gateway='1' or v_sync='1' or v_verify='1' then
    return new;
  end if;

  if tg_op='INSERT' then
    if new.status in ('Verified','Partially Paid')
       or new.verified_at is not null
       or new.verified_by is not null
       or coalesce(new.amount_paid,0)<>0
       or new.paid_at is not null
       or nullif(trim(coalesce(new.provider_payment_id,'')),'') is not null then
      raise exception 'Payment settlement/provider evidence must be created through the protected verification or trusted gateway workflow.';
    end if;
    return new;
  end if;

  if new.status in ('Verified','Partially Paid')
     and new.status is distinct from old.status then
    raise exception 'Payment verification is restricted to Admin or trusted gateway settlement through the protected verification workflow.';
  end if;

  if new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by
     or new.amount_paid is distinct from old.amount_paid
     or new.paid_at is distinct from old.paid_at
     or new.provider_payment_id is distinct from old.provider_payment_id then
    raise exception 'Payment settlement/provider evidence is server-derived and may only change through the protected verification or trusted gateway workflow.';
  end if;

  return new;
end;
$part12$;

-- The existing trigger already covers INSERT OR UPDATE; assert it remains installed exactly once.
do $part12_settlement_postconditions$
declare
  v_policy jsonb;
  v_trigger_count int;
begin
  select config_value into v_policy
  from public.system_configuration
  where config_key='crm_quotation_sales_reconciliation_policy_v1';

  if coalesce((v_policy->>'finalQuotationSendGateActive')::boolean,false) is distinct from true
     or coalesce((v_policy->>'policyVersion')::int,0) <> 2
     or coalesce((v_policy->>'snapshotSchemaVersion')::int,0) <> 2 then
    raise exception 'Part 12 settlement hardening altered protected Part 10B quotation-send policy state.';
  end if;

  select count(*)::int into v_trigger_count
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname='payments'
    and t.tgname='trg_protect_payment_verification_fields'
    and not t.tgisinternal
    and pg_get_triggerdef(t.oid,true) ilike '%BEFORE INSERT OR UPDATE%';

  if v_trigger_count<>1 then
    raise exception 'Part 12 payment settlement protection trigger is not installed exactly once for INSERT OR UPDATE.';
  end if;
end;
$part12_settlement_postconditions$;

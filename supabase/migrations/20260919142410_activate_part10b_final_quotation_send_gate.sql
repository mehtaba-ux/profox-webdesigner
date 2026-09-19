-- Part 10B.8: controlled activation of the existing final quotation Send gate.
--
-- This migration is intentionally limited to one configuration-field transition:
--   crm_quotation_sales_reconciliation_policy_v1.finalQuotationSendGateActive
--   false -> true
--
-- It creates no business rows, rewrites no quotation history, captures no snapshot,
-- redefines no function, and grants no privilege. Every structural, security,
-- migration-lineage, ordering and business-count prerequisite is checked before the
-- canonical policy is changed. Any drift fails the transaction closed.

do $part10b8_activation$
declare
  v_policy_before jsonb;
  v_policy_after jsonb;
  v_sales_gate_policy jsonb;
  v_transition_definition text;
  v_capture_position integer;
  v_admin_position integer;
  v_atomic_position integer;
  v_updated integer;
  v_business_counts_before jsonb;
  v_business_counts_after jsonb;
  v_expected_replacements constant jsonb := $expected$
  [
    {"version":"20260918120000","name":"crm_sales_meeting_closeout_current_state_reconciliation","checksum":"dbd984de4d6bd324a2529e523346733798d4bc8817c14dad1abaed5ad5516035"},
    {"version":"20260918121000","name":"crm_sales_validation_current_state_reconciliation","checksum":"afdaeed9a52e3d59a960dcc4a896c56930bbd15357def57c3f2cb2029a99d13c"},
    {"version":"20260918122000","name":"crm_sales_proposal_readiness_current_state_reconciliation","checksum":"bd318ef44168c97c1200e71c676570f2bf2e887725e25b285c6b2b88a663a32e"},
    {"version":"20260918123000","name":"sales_catalog_current_state_reconciliation","checksum":"5c837bf6ab4c38835bec8c195ace7203c68858dc977079c9ecd3ec071f188b58"}
  ]
  $expected$::jsonb;
  v_forbidden_historical constant text[] := array[
    '20260909110000',
    '20260909193000',
    '20260909200000',
    '20260909201500',
    '20260915154800'
  ];
begin
  if to_regclass('profox_migrations.applied_migrations') is null
     or to_regclass('profox_migrations.state') is null then
    raise exception '[P10B8_MIGRATION_CONTROL_MISSING] Canonical production migration control is unavailable.';
  end if;

  if (select count(*) from profox_migrations.state where singleton=true)<>1 then
    raise exception '[P10B8_MIGRATION_STATE_DRIFT] Exactly one authoritative migration state row is required.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_expected_replacements) as expected(version text,name text,checksum text)
    left join profox_migrations.applied_migrations applied
      on applied.version=expected.version
     and applied.name=expected.name
     and applied.checksum=expected.checksum
    where applied.version is null
  ) then
    raise exception '[P10B8_FORWARD_REPLACEMENT_DRIFT] All four exact Part 10B.6 forward replacements must be applied.';
  end if;

  if exists (
    select 1
    from profox_migrations.applied_migrations
    where version=any(v_forbidden_historical)
  ) then
    raise exception '[P10B8_HISTORICAL_LEDGER_DRIFT] A forbidden unresolved historical migration is present in the custom ledger.';
  end if;

  if (select max(version) from profox_migrations.applied_migrations)<>'20260918123000' then
    raise exception '[P10B8_UNEXPECTED_NEWER_MIGRATION] The approved pre-activation custom-ledger maximum must be 20260918123000.';
  end if;

  if (select count(*) from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1')<>1 then
    raise exception '[P10B8_POLICY_CARDINALITY] Exactly one canonical quotation Sales reconciliation policy is required.';
  end if;

  select config_value into v_policy_before
  from public.system_configuration
  where config_key='crm_quotation_sales_reconciliation_policy_v1'
  for update;

  if jsonb_typeof(v_policy_before)<>'object'
     or (v_policy_before->>'policyVersion')::integer<>2
     or (v_policy_before->>'snapshotSchemaVersion')::integer<>2
     or coalesce((v_policy_before->>'finalQuotationSendGateActive')::boolean,true)<>false then
    raise exception '[P10B8_POLICY_PRECONDITION] Policy v2, snapshot schema v2 and an explicitly false gate are required.';
  end if;

  select config_value into v_sales_gate_policy
  from public.system_configuration
  where config_key='crm_sales_gate_policy_v1';
  if v_sales_gate_policy is null
     or (v_sales_gate_policy->>'policyVersion')::integer<>1
     or (v_sales_gate_policy->>'evaluatorVersion')::integer<>3 then
    raise exception '[P10B8_READINESS_POLICY_DRIFT] Sales gate policy v1 with evaluator v3 is required.';
  end if;

  if (select count(*) from pg_proc where oid=to_regprocedure('public.crm_assert_quotation_send_ready(uuid)'))<>1
     or (select count(*) from pg_proc where oid=to_regprocedure('public.crm_capture_quotation_sales_scope_snapshot(uuid)'))<>1
     or (select count(*) from pg_proc where oid=to_regprocedure('public.crm_get_quotation_sales_reconciliation(uuid)'))<>1
     or (select count(*) from pg_proc where oid=to_regprocedure('public.crm_build_quotation_sales_scope_snapshot(uuid)'))<>1 then
    raise exception '[P10B8_CANONICAL_FUNCTION_DRIFT] Assertion, capture, reconciliation and snapshot builder must each exist exactly once.';
  end if;

  if to_regprocedure('public.send_quotation_professional(uuid,text,text[],text,text)') is null
     or to_regprocedure('public.update_quotation_atomic(uuid,jsonb,jsonb)') is null
     or to_regprocedure('public.protect_quotation_transition()') is null then
    raise exception '[P10B8_SEND_ARCHITECTURE_DRIFT] Canonical quotation Send/update/transition functions are required.';
  end if;

  if to_regprocedure('public.crm_get_package_fit_assessment(uuid,uuid)') is null
     or to_regprocedure('public.crm_get_sales_gate_assessment(uuid,text)') is null
     or to_regclass('public.crm_sales_scope_conditions') is null
     or to_regclass('public.crm_sales_promises') is null
     or to_regclass('public.crm_sales_validations') is null
     or to_regclass('public.quotation_sales_coverage') is null then
    raise exception '[P10B8_RECONCILIATION_ARCHITECTURE_DRIFT] Canonical Package Fit, readiness, Scope, Promise, Validation and coverage architecture is required.';
  end if;

  if (select count(*) from information_schema.columns
      where table_schema='public' and table_name='quotations'
        and column_name in ('sales_scope_snapshot','sales_scope_snapshot_at','sales_scope_snapshot_schema_version'))<>3 then
    raise exception '[P10B8_SNAPSHOT_COLUMNS_DRIFT] All immutable quotation Sales-snapshot columns are required.';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    join pg_proc trigger_function on trigger_function.oid=trigger_row.tgfoid
    where trigger_row.tgrelid='public.quotations'::regclass
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled<>'D'
      and trigger_function.oid=to_regprocedure('public.protect_quotation_transition()')
  ) then
    raise exception '[P10B8_TRANSITION_TRIGGER_MISSING] The canonical quotation transition trigger is not enabled.';
  end if;

  select lower(pg_get_functiondef(to_regprocedure('public.protect_quotation_transition()')))
    into v_transition_definition;
  v_capture_position:=strpos(v_transition_definition,'crm_capture_quotation_sales_scope_snapshot');
  v_admin_position:=strpos(v_transition_definition,'if public.is_admin()');
  v_atomic_position:=strpos(v_transition_definition,$needle$if v_atomic='1'$needle$);
  if strpos(v_transition_definition,$needle$old.status<>'sent' and new.status='sent'$needle$)=0
     or v_capture_position=0
     or v_admin_position<=v_capture_position
     or v_atomic_position<=v_capture_position then
    raise exception '[P10B8_TRANSITION_ORDER_DRIFT] Final assertion/capture must precede Admin and atomic-RPC early returns.';
  end if;

  if exists (
       select 1 from pg_proc function_row,
       lateral aclexplode(coalesce(function_row.proacl,acldefault('f',function_row.proowner))) privilege_row
       where function_row.oid in (
         to_regprocedure('public.crm_assert_quotation_send_ready(uuid)'),
         to_regprocedure('public.crm_capture_quotation_sales_scope_snapshot(uuid)')
       )
         and privilege_row.grantee=0
         and privilege_row.privilege_type='EXECUTE'
     )
     or coalesce(has_function_privilege('anon',to_regprocedure('public.crm_assert_quotation_send_ready(uuid)'),'EXECUTE'),false)
     or coalesce(has_function_privilege('authenticated',to_regprocedure('public.crm_assert_quotation_send_ready(uuid)'),'EXECUTE'),false)
     or coalesce(has_function_privilege('anon',to_regprocedure('public.crm_capture_quotation_sales_scope_snapshot(uuid)'),'EXECUTE'),false)
     or coalesce(has_function_privilege('authenticated',to_regprocedure('public.crm_capture_quotation_sales_scope_snapshot(uuid)'),'EXECUTE'),false)
     or not coalesce(has_function_privilege('service_role',to_regprocedure('public.crm_assert_quotation_send_ready(uuid)'),'EXECUTE'),false)
     or not coalesce(has_function_privilege('service_role',to_regprocedure('public.crm_capture_quotation_sales_scope_snapshot(uuid)'),'EXECUTE'),false) then
    raise exception '[P10B8_INTERNAL_FUNCTION_ACL_DRIFT] Browser roles must not execute internal assertion/capture authority.';
  end if;

  select jsonb_build_object(
    'leads',(select count(*) from public.crm_leads),
    'opportunities',(select count(*) from public.crm_opportunities),
    'meetings',(select count(*) from public.sales_meetings),
    'activities',(select count(*) from public.crm_activities),
    'requirements',(select count(*) from public.crm_requirements),
    'discoveryResponses',(select count(*) from public.crm_discovery_responses),
    'validations',(select count(*) from public.crm_sales_validations),
    'scopeConditions',(select count(*) from public.crm_sales_scope_conditions),
    'promises',(select count(*) from public.crm_sales_promises),
    'coverage',(select count(*) from public.quotation_sales_coverage),
    'quotations',(select count(*) from public.quotations),
    'quotationItems',(select count(*) from public.quotation_items),
    'payments',(select count(*) from public.payments),
    'clients',(select count(*) from public.clients),
    'clientOnboardings',(select count(*) from public.client_onboardings),
    'capturedSnapshots',(select count(*) from public.quotations where sales_scope_snapshot is not null),
    'sentQuotations',(select count(*) from public.quotations where status='Sent')
  ) into v_business_counts_before;

  update public.system_configuration
  set config_value=jsonb_set(config_value,'{finalQuotationSendGateActive}','true'::jsonb,false)
  where config_key='crm_quotation_sales_reconciliation_policy_v1'
    and (config_value->>'policyVersion')::integer=2
    and (config_value->>'snapshotSchemaVersion')::integer=2
    and coalesce((config_value->>'finalQuotationSendGateActive')::boolean,true)=false;
  get diagnostics v_updated=row_count;
  if v_updated<>1 then
    raise exception '[P10B8_ACTIVATION_RACE] Exactly one canonical policy row must transition false to true.';
  end if;

  select config_value into v_policy_after
  from public.system_configuration
  where config_key='crm_quotation_sales_reconciliation_policy_v1';
  if (v_policy_after->>'policyVersion')::integer<>2
     or (v_policy_after->>'snapshotSchemaVersion')::integer<>2
     or coalesce((v_policy_after->>'finalQuotationSendGateActive')::boolean,false)<>true
     or (v_policy_before-'finalQuotationSendGateActive') is distinct from (v_policy_after-'finalQuotationSendGateActive') then
    raise exception '[P10B8_ACTIVATION_POSTCONDITION] The gate must be true and every other policy field must remain byte-for-byte equivalent.';
  end if;

  select jsonb_build_object(
    'leads',(select count(*) from public.crm_leads),
    'opportunities',(select count(*) from public.crm_opportunities),
    'meetings',(select count(*) from public.sales_meetings),
    'activities',(select count(*) from public.crm_activities),
    'requirements',(select count(*) from public.crm_requirements),
    'discoveryResponses',(select count(*) from public.crm_discovery_responses),
    'validations',(select count(*) from public.crm_sales_validations),
    'scopeConditions',(select count(*) from public.crm_sales_scope_conditions),
    'promises',(select count(*) from public.crm_sales_promises),
    'coverage',(select count(*) from public.quotation_sales_coverage),
    'quotations',(select count(*) from public.quotations),
    'quotationItems',(select count(*) from public.quotation_items),
    'payments',(select count(*) from public.payments),
    'clients',(select count(*) from public.clients),
    'clientOnboardings',(select count(*) from public.client_onboardings),
    'capturedSnapshots',(select count(*) from public.quotations where sales_scope_snapshot is not null),
    'sentQuotations',(select count(*) from public.quotations where status='Sent')
  ) into v_business_counts_after;

  if v_business_counts_after is distinct from v_business_counts_before then
    raise exception '[P10B8_BUSINESS_DATA_MUTATION] Activation changed business inventory: before %, after %.',v_business_counts_before,v_business_counts_after;
  end if;

  if (select count(*) from pg_proc where oid=to_regprocedure('public.crm_assert_quotation_send_ready(uuid)'))<>1
     or (select count(*) from pg_proc where oid=to_regprocedure('public.crm_capture_quotation_sales_scope_snapshot(uuid)'))<>1
     or (select count(*) from pg_proc where oid=to_regprocedure('public.crm_get_quotation_sales_reconciliation(uuid)'))<>1
     or (select count(*) from pg_proc where oid=to_regprocedure('public.crm_build_quotation_sales_scope_snapshot(uuid)'))<>1 then
    raise exception '[P10B8_POST_ACTIVATION_FUNCTION_DRIFT] Canonical function cardinality changed during activation.';
  end if;
end
$part10b8_activation$;

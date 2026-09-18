// Part 10B.6 forward-only migration convergence metadata and postcondition verification.
// This module is a helper for the EXISTING production migration runner; it is not a runner.
// Historical provenance remains unresolved forever unless separately proven. Supersession means only
// that a later exact repository migration was actually ledgered and its mapped current-state checks pass.

export const PART10B6_FORWARD_REPLACEMENT_VERSIONS = Object.freeze([
  '20260918120000',
  '20260918121000',
  '20260918122000',
  '20260918123000',
]);

const records = [
  {
    oldVersion: '20260909110000',
    oldName: 'crm_sales_meeting_management_closeout_part_5',
    oldRepositorySha256: 'bc4944edf31ce435bc7bf1efc71d12e660fccdb3952bf578150e89f1fe2e13b4',
    classification: 'HISTORICAL_PROVENANCE_UNRESOLVED',
    replacementVersion: '20260918120000',
    replacementName: 'crm_sales_meeting_closeout_current_state_reconciliation',
    replacementSha256: 'dbd984de4d6bd324a2529e523346733798d4bc8817c14dad1abaed5ad5516035',
    reason: 'Forward-only reconciliation establishes the current canonical meeting close-out RPCs and Completed/No Show automation boundary without replaying or asserting execution of the unresolved Part 5 file.',
    coveredStateIds: [
      'MEETING_CLOSEOUT_CURRENT_STATE',
      'MEETING_COMPLETED_NOSHOW_AUTOMATION_BOUNDARY',
    ],
    postconditionIds: [
      'P10B6_MEETING_FUNCTIONS_CURRENT',
      'P10B6_MEETING_ACLS_CURRENT',
      'P10B6_MEETING_COMPLETED_NOSHOW_BOUNDARY',
      'P10B6_SEND_GATE_FALSE',
    ],
  },
  {
    oldVersion: '20260909193000',
    oldName: 'crm_sales_validation_escalation_part_7',
    oldRepositorySha256: 'f153f00f85c8e7ec6974b220f7ba1072bb9432963f37081282cffeb7add40564',
    classification: 'HISTORICAL_PROVENANCE_UNRESOLVED',
    replacementVersion: '20260918121000',
    replacementName: 'crm_sales_validation_current_state_reconciliation',
    replacementSha256: 'b4d024cf5bb08749af648e4c4e97730dc80a15f634868d0e59c68608c4977389',
    reason: 'Forward-only reconciliation establishes the final current Part 7 table, policy, functions, My Work routing, indexes, triggers, RLS and ACLs including later hardening.',
    coveredStateIds: [
      'SALES_VALIDATION_SCHEMA_AND_POLICY_CURRENT',
      'SALES_VALIDATION_RUNTIME_CURRENT',
      'SALES_VALIDATION_MY_WORK_ROUTING_CURRENT',
    ],
    postconditionIds: [
      'P10B6_VALIDATION_SCHEMA_39_COLUMNS',
      'P10B6_VALIDATION_INDEXES_13_CURRENT',
      'P10B6_VALIDATION_TRIGGERS_3_ENABLED',
      'P10B6_VALIDATION_RLS_POLICY_CURRENT',
      'P10B6_VALIDATION_FUNCTIONS_CURRENT',
      'P10B6_VALIDATION_ACLS_CURRENT',
      'P10B6_VALIDATION_POLICY_V1',
      'P10B6_VALIDATION_MY_WORK_ROUTING',
      'P10B6_SEND_GATE_FALSE',
    ],
  },
  {
    oldVersion: '20260909200000',
    oldName: 'crm_sales_requirements_confirmed_proposal_readiness_part_8',
    oldRepositorySha256: 'd430a06cc0065af0bf2385ee90657a25820c404c66a8594c774455583220ea61',
    classification: 'HISTORICAL_PROVENANCE_UNRESOLVED',
    replacementVersion: '20260918122000',
    replacementName: 'crm_sales_proposal_readiness_current_state_reconciliation',
    replacementSha256: 'bd318ef44168c97c1200e71c676570f2bf2e887725e25b285c6b2b88a663a32e',
    reason: 'Forward-only reconciliation establishes the current policy v1/evaluator v3, Requirements Confirmed pipeline invariant and canonical opportunity transition without restoring evaluator 1.',
    coveredStateIds: [
      'PROPOSAL_READINESS_POLICY_EVALUATOR3_CURRENT',
      'REQUIREMENTS_CONFIRMED_PIPELINE_INVARIANT',
      'OPPORTUNITY_TRANSITION_CURRENT',
    ],
    postconditionIds: [
      'P10B6_READINESS_POLICY_V1_EVALUATOR_V3',
      'P10B6_READINESS_DIMENSIONS_20_PLUS_3',
      'P10B6_READINESS_EVALUATOR_CURRENT',
      'P10B6_READINESS_PART9_SCOPE_PROMISE',
      'P10B6_READINESS_TRANSITION_CURRENT',
      'P10B6_READINESS_PIPELINE_INVARIANT',
      'P10B6_READINESS_ACLS_CURRENT',
      'P10B6_SEND_GATE_FALSE',
    ],
  },
  {
    oldVersion: '20260909201500',
    oldName: 'crm_sales_requirements_confirmed_proposal_readiness_part_8_hardening',
    oldRepositorySha256: '5917aa1bdefd2387bb654907344e9997bc1eb957bfbd2aff59ce1061741f9068',
    classification: 'HISTORICAL_PROVENANCE_UNRESOLVED',
    replacementVersion: '20260918122000',
    replacementName: 'crm_sales_proposal_readiness_current_state_reconciliation',
    replacementSha256: 'bd318ef44168c97c1200e71c676570f2bf2e887725e25b285c6b2b88a663a32e',
    reason: 'The same atomic forward migration establishes the final hardened evaluator 3/security/policy authority, superseding the unresolved evaluator 2 intermediate state without replay.',
    coveredStateIds: [
      'PROPOSAL_READINESS_HARDENED_EVALUATOR3_CURRENT',
      'PART9_SCOPE_PROMISE_INTEGRATION_CURRENT',
      'PROPOSAL_READINESS_ACLS_CURRENT',
    ],
    postconditionIds: [
      'P10B6_READINESS_POLICY_V1_EVALUATOR_V3',
      'P10B6_READINESS_DIMENSIONS_20_PLUS_3',
      'P10B6_READINESS_EVALUATOR_CURRENT',
      'P10B6_READINESS_PART9_SCOPE_PROMISE',
      'P10B6_READINESS_ACLS_CURRENT',
      'P10B6_SEND_GATE_FALSE',
    ],
  },
  {
    oldVersion: '20260915154800',
    oldName: 'sales_catalog_clarity_repository_reconciliation',
    oldRepositorySha256: 'fb1f50f908653298da2e0a77b56fa1580117739c7dac73a6b3e79e4093ff2c3e',
    classification: 'HISTORICAL_PROVENANCE_UNRESOLVED',
    replacementVersion: '20260918123000',
    replacementName: 'sales_catalog_current_state_reconciliation',
    replacementSha256: 'a2f203823e853dd2ae2ca555adf94abe91b5d9f776e4f255ccb951183adb2572',
    reason: 'Forward-only reconciliation asserts canonical catalog schema, trigger, ACL and business invariants without replaying historical broad UPDATE statements or backfilling snapshots.',
    coveredStateIds: [
      'SALES_CATALOG_SCHEMA_CURRENT',
      'SALES_CATALOG_CANONICAL_45_37_CURRENT',
      'SALES_CATALOG_NAMED_PACKAGE_RULES_CURRENT',
    ],
    postconditionIds: [
      'P10B6_CATALOG_SCHEMA_CURRENT',
      'P10B6_CATALOG_SELLER_GUIDANCE_TRIGGER_CURRENT',
      'P10B6_CATALOG_ACL_CURRENT',
      'P10B6_CATALOG_ACTIVE_45_UNIQUE',
      'P10B6_CATALOG_ADDONS_37_PRIVATE',
      'P10B6_CATALOG_DEFINITIONS_COMPLETE',
      'P10B6_CATALOG_PF_CUSTOM_CURRENT',
      'P10B6_CATALOG_LAUNCH_CURRENT',
      'P10B6_CATALOG_GROWTH_CURRENT',
      'P10B6_CATALOG_SCALE_CURRENT',
      'P10B6_SEND_GATE_FALSE',
    ],
  },
];

export const historicalForwardMigrationSupersessions = Object.freeze(
  records.map(record => Object.freeze({
    ...record,
    coveredStateIds: Object.freeze([...record.coveredStateIds]),
    postconditionIds: Object.freeze([...record.postconditionIds]),
  })),
);

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ''));
}

function hasWildcardOrRange(value) {
  return /[*?\[\]{}<>]|\.\.|\bthrough\b|\brange\b/i.test(String(value || ''));
}

export function validateForwardMigrationSupersessionRegistry({
  migrations,
  registry = historicalForwardMigrationSupersessions,
} = {}) {
  if (!Array.isArray(migrations)) throw new Error('Migration manifest is required for supersession validation.');
  if (!Array.isArray(registry)) throw new Error('Supersession registry must be an array.');

  const byVersion = new Map(migrations.map(migration => [migration.version, migration]));
  const seenOld = new Set();
  const oldGraph = new Map();

  for (const record of registry) {
    if (!/^\d{14}$/.test(record.oldVersion || '') || !/^\d{14}$/.test(record.replacementVersion || '')) {
      throw new Error(`Invalid supersession version for ${record.oldVersion || record.oldName || 'unknown record'}.`);
    }
    if (hasWildcardOrRange(record.oldVersion) || hasWildcardOrRange(record.replacementVersion)
        || hasWildcardOrRange(record.oldName) || hasWildcardOrRange(record.replacementName)) {
      throw new Error(`Wildcard/range supersession is forbidden for ${record.oldVersion}_${record.oldName}.`);
    }
    if (record.classification !== 'HISTORICAL_PROVENANCE_UNRESOLVED') {
      throw new Error(`Invalid historical classification for ${record.oldVersion}_${record.oldName}.`);
    }
    if (!record.oldName || !record.replacementName || !record.reason) {
      throw new Error(`Incomplete supersession identity for ${record.oldVersion || 'unknown'}.`);
    }
    if (!isSha256(record.oldRepositorySha256) || !isSha256(record.replacementSha256)) {
      throw new Error(`Invalid SHA-256 pin for supersession ${record.oldVersion}_${record.oldName}.`);
    }
    if (!Array.isArray(record.coveredStateIds) || record.coveredStateIds.length === 0
        || !Array.isArray(record.postconditionIds) || record.postconditionIds.length === 0
        || record.coveredStateIds.some(id => !id || hasWildcardOrRange(id))
        || record.postconditionIds.some(id => !id || hasWildcardOrRange(id))
        || new Set(record.coveredStateIds).size !== record.coveredStateIds.length
        || new Set(record.postconditionIds).size !== record.postconditionIds.length) {
      throw new Error(`Invalid state/postcondition mapping for ${record.oldVersion}_${record.oldName}.`);
    }
    if (seenOld.has(record.oldVersion)) {
      throw new Error(`Duplicate supersession old version ${record.oldVersion}.`);
    }
    seenOld.add(record.oldVersion);

    const oldMigration = byVersion.get(record.oldVersion);
    if (!oldMigration) throw new Error(`Supersession old migration is missing: ${record.oldVersion}_${record.oldName}.`);
    if (oldMigration.name !== record.oldName) {
      throw new Error(`Supersession old migration name drift: expected ${record.oldVersion}_${record.oldName}, found ${oldMigration.file}.`);
    }
    if (oldMigration.checksum !== record.oldRepositorySha256) {
      throw new Error(`Supersession old SHA drift for ${oldMigration.file}: expected ${record.oldRepositorySha256}, found ${oldMigration.checksum}.`);
    }

    const replacement = byVersion.get(record.replacementVersion);
    if (!replacement) {
      throw new Error(`Supersession replacement migration is missing: ${record.replacementVersion}_${record.replacementName}.`);
    }
    if (replacement.name !== record.replacementName) {
      throw new Error(`Supersession replacement name drift: expected ${record.replacementVersion}_${record.replacementName}, found ${replacement.file}.`);
    }
    if (replacement.checksum !== record.replacementSha256) {
      throw new Error(`Supersession replacement checksum drift for ${replacement.file}: expected ${record.replacementSha256}, found ${replacement.checksum}.`);
    }
    if (record.replacementVersion <= record.oldVersion) {
      throw new Error(`Supersession replacement must be later than historical migration ${record.oldVersion}.`);
    }
    oldGraph.set(record.oldVersion, record.replacementVersion);
  }

  for (const start of oldGraph.keys()) {
    const seen = new Set();
    let cursor = start;
    while (oldGraph.has(cursor)) {
      if (seen.has(cursor)) throw new Error(`Supersession cycle detected at ${cursor}.`);
      seen.add(cursor);
      cursor = oldGraph.get(cursor);
    }
  }

  return {
    records: registry,
    byOldVersion: new Map(registry.map(record => [record.oldVersion, record])),
    replacementVersions: new Set(registry.map(record => record.replacementVersion)),
  };
}

const checks = Object.freeze({
  P10B6_SEND_GATE_FALSE: `
    select coalesce((
      select (config_value->>'finalQuotationSendGateActive')::boolean=false
      from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
    ),false) as ok
  `,

  P10B6_MEETING_FUNCTIONS_CURRENT: `
    select (
      md5(pg_get_functiondef(to_regprocedure('public.save_sales_meeting_closeout_draft(uuid,text,text,text,text,text,text,text,timestamp with time zone)')))
        ='8bbb6f4d32ba6c5173f84f37200052be'
      and md5(pg_get_functiondef(to_regprocedure('public.finalize_sales_meeting(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)')))
        ='81bf7e2a5732798d58fa6fe12bd5af53'
      and (select prosecdef and proconfig=array['search_path=public, pg_temp']::text[]
           from pg_proc where oid=to_regprocedure('public.save_sales_meeting_closeout_draft(uuid,text,text,text,text,text,text,text,timestamp with time zone)'))
      and (select prosecdef and proconfig=array['search_path=public, pg_temp']::text[]
           from pg_proc where oid=to_regprocedure('public.finalize_sales_meeting(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)'))
    ) as ok
  `,
  P10B6_MEETING_ACLS_CURRENT: `
    select (
      not has_function_privilege('anon',to_regprocedure('public.save_sales_meeting_closeout_draft(uuid,text,text,text,text,text,text,text,timestamp with time zone)'),'EXECUTE')
      and has_function_privilege('authenticated',to_regprocedure('public.save_sales_meeting_closeout_draft(uuid,text,text,text,text,text,text,text,timestamp with time zone)'),'EXECUTE')
      and has_function_privilege('service_role',to_regprocedure('public.save_sales_meeting_closeout_draft(uuid,text,text,text,text,text,text,text,timestamp with time zone)'),'EXECUTE')
      and not has_function_privilege('anon',to_regprocedure('public.finalize_sales_meeting(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)'),'EXECUTE')
      and has_function_privilege('authenticated',to_regprocedure('public.finalize_sales_meeting(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)'),'EXECUTE')
      and has_function_privilege('service_role',to_regprocedure('public.finalize_sales_meeting(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)'),'EXECUTE')
    ) as ok
  `,
  P10B6_MEETING_COMPLETED_NOSHOW_BOUNDARY: `
    select (
      position('meeting-followup:' in pg_get_functiondef(to_regprocedure('public.finalize_sales_meeting(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)')))>0
      and exists (
        select 1 from pg_trigger
        where tgrelid='public.sales_meetings'::regclass
          and tgname='trg_queue_meeting_status_automation'
          and not tgisinternal and tgenabled<>'D'
          and position('queue_meeting_status_automation' in pg_get_triggerdef(oid,true))>0
      )
    ) as ok
  `,

  P10B6_VALIDATION_SCHEMA_39_COLUMNS: `
    select (
      (select count(*) from pg_attribute
       where attrelid='public.crm_sales_validations'::regclass and attnum>0 and not attisdropped)=39
      and (select count(*) from pg_constraint where conrelid='public.crm_sales_validations'::regclass)=30
    ) as ok
  `,
  P10B6_VALIDATION_INDEXES_13_CURRENT: `
    select (
      select count(*)=13 from pg_indexes
      where schemaname='public' and tablename='crm_sales_validations'
        and indexname<>'crm_sales_validations_pkey'
    ) as ok
  `,
  P10B6_VALIDATION_TRIGGERS_3_ENABLED: `
    select (
      (select count(*)=2 from pg_trigger
       where tgrelid='public.crm_sales_validations'::regclass and not tgisinternal and tgenabled<>'D')
      and exists (
        select 1 from pg_trigger
        where tgrelid='public.crm_requirements'::regclass
          and tgname='trg_crm_requirement_sales_validation_stale'
          and not tgisinternal and tgenabled<>'D'
      )
    ) as ok
  `,
  P10B6_VALIDATION_RLS_POLICY_CURRENT: `
    select (
      (select relrowsecurity from pg_class where oid='public.crm_sales_validations'::regclass)
      and (select count(*)=1 from pg_policies where schemaname='public' and tablename='crm_sales_validations')
      and exists (
        select 1 from pg_policies
        where schemaname='public' and tablename='crm_sales_validations'
          and policyname='crm_sales_validations_select_authorized'
          and cmd='SELECT'
          and roles=array['authenticated']::name[]
          and position('( SELECT auth.uid() AS uid)' in qual)>0
      )
    ) as ok
  `,
  P10B6_VALIDATION_FUNCTIONS_CURRENT: `
    with expected(sig,digest) as (values
      ('public.crm_get_sales_validation_detail(uuid)','4921a86ef2cb1ceec62b49d61b1cd24e'),
      ('public.crm_get_sales_validation_queue()','bccacfae8264d87d1c10a55ca3b94351'),
      ('public.crm_get_sales_validation_workspace(uuid,uuid)','0da9c862f689e58cd58e5d0912660084'),
      ('public.crm_request_sales_validation(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text)','dce1a970a58ca6d21fcd4271129ad54f'),
      ('public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text)','9f55254be437570f044182a19c7d61ae'),
      ('public.crm_sales_validation_notify_seller(uuid,uuid,text,text,text)','5ee5b7bae8d86cd47966f2452199fad6'),
      ('public.crm_sales_validation_policy_entry(text)','693d7866c3dff34b871526242796bf02'),
      ('public.crm_sales_validation_prevent_delete()','00334e7a892b22bfa594306bff927950'),
      ('public.crm_sales_validation_requirement_changed()','96ff62d0ae40a1122473e8720bf3d455'),
      ('public.crm_sales_validation_reviewer_eligible(text,text,uuid)','5eaf170529ed179a19ae17575cd8e74a'),
      ('public.crm_sales_validation_source_state(uuid,uuid,uuid,text,integer)','fbe2ebd9db6250efaf565ca58c999dc3'),
      ('public.crm_sales_validation_touch_updated_at()','746dff910f030318f733706a52f4cbcf'),
      ('public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text)','ed5003e1b342f0010d9df2db21f9fa43')
    )
    select count(*)=13 and bool_and(to_regprocedure(sig) is not null and md5(pg_get_functiondef(to_regprocedure(sig)))=digest) as ok
    from expected
  `,
  P10B6_VALIDATION_ACLS_CURRENT: `
    select (
      has_table_privilege('authenticated','public.crm_sales_validations','SELECT')
      and not has_table_privilege('authenticated','public.crm_sales_validations','INSERT')
      and not has_table_privilege('authenticated','public.crm_sales_validations','UPDATE')
      and not has_table_privilege('authenticated','public.crm_sales_validations','DELETE')
      and has_table_privilege('service_role','public.crm_sales_validations','SELECT')
      and has_table_privilege('service_role','public.crm_sales_validations','INSERT')
      and has_table_privilege('service_role','public.crm_sales_validations','UPDATE')
      and has_table_privilege('service_role','public.crm_sales_validations','DELETE')
    ) as ok
  `,
  P10B6_VALIDATION_POLICY_V1: `
    select coalesce((
      select (config_value->>'policyVersion')::integer=1
        and jsonb_object_length(config_value->'validationTypes')=5
      from public.system_configuration
      where config_key='crm_sales_validation_policy_v1'
    ),false) as ok
  `,
  P10B6_VALIDATION_MY_WORK_ROUTING: `
    select (
      position('/admin?tab=myWork' in pg_get_functiondef(to_regprocedure('public.crm_sales_validation_notify_reviewers(uuid,text,text,uuid,text,text,text)')))>0
      and position('/admin?tab=myWork' in pg_get_functiondef(to_regprocedure('public.crm_transition_sales_validation(uuid,text,text,text,text,text,text,text)')))>0
      and position('/admin?tab=myWork' in pg_get_functiondef(to_regprocedure('public.crm_sales_validation_requirement_changed()')))>0
    ) as ok
  `,

  P10B6_READINESS_POLICY_V1_EVALUATOR_V3: `
    select coalesce((
      select (config_value->>'policyVersion')::integer=1
        and (config_value->>'evaluatorVersion')::integer=3
      from public.system_configuration
      where config_key='crm_sales_gate_policy_v1'
    ),false) as ok
  `,
  P10B6_READINESS_DIMENSIONS_20_PLUS_3: `
    select coalesce((
      select jsonb_array_length(config_value->'proposalDimensions')=20
        and jsonb_array_length(config_value->'futureProposalDimensions')=3
        and config_value->'proposalDimensions' ?& array['SCOPE_CONDITIONS_REGISTER','PROMISE_REGISTER_INTEGRITY']
        and config_value->'futureProposalDimensions' ?& array['PROMISE_COVERAGE','FINAL_SCOPE_RECONCILIATION','QUOTATION_SNAPSHOT_COVERAGE']
      from public.system_configuration
      where config_key='crm_sales_gate_policy_v1'
    ),false) as ok
  `,
  P10B6_READINESS_EVALUATOR_CURRENT: `
    select (
      md5(pg_get_functiondef(to_regprocedure('public.crm_get_sales_gate_assessment(uuid,text)')))
        ='1a1ecb061cdcee8e8115b845bd69d698'
      and (select prosecdef and provolatile='s' and proconfig=array['search_path=""']::text[]
           from pg_proc where oid=to_regprocedure('public.crm_get_sales_gate_assessment(uuid,text)'))
    ) as ok
  `,
  P10B6_READINESS_PART9_SCOPE_PROMISE: `
    select (
      position('crm_get_sales_scope_commitment_assessment' in pg_get_functiondef(to_regprocedure('public.crm_get_sales_gate_assessment(uuid,text)')))>0
      and position('SCOPE_CONDITIONS_REGISTER' in pg_get_functiondef(to_regprocedure('public.crm_get_sales_gate_assessment(uuid,text)')))>0
      and position('PROMISE_REGISTER_INTEGRITY' in pg_get_functiondef(to_regprocedure('public.crm_get_sales_gate_assessment(uuid,text)')))>0
    ) as ok
  `,
  P10B6_READINESS_TRANSITION_CURRENT: `
    select (
      md5(pg_get_functiondef(to_regprocedure('public.crm_transition_opportunity(uuid,text)')))
        ='a43508854e20f76c4a3966e8adf793d4'
      and position('crm_get_sales_gate_assessment' in pg_get_functiondef(to_regprocedure('public.crm_transition_opportunity(uuid,text)')))>0
    ) as ok
  `,
  P10B6_READINESS_PIPELINE_INVARIANT: `
    with stages as (
      select value
      from public.system_configuration sc,
           jsonb_array_elements(sc.config_value->'stages')
      where sc.config_key='crm_pipeline_settings' and value->>'name'='Requirements Confirmed'
    )
    select (
      (select count(*) from stages)=1
      and not exists (
        select 1 from stages, jsonb_array_elements_text(coalesce(value->'requiredFields','[]'::jsonb)) f
        where f='requirementsSummary'
      )
    ) as ok
  `,
  P10B6_READINESS_ACLS_CURRENT: `
    select (
      not has_function_privilege('anon',to_regprocedure('public.crm_get_sales_gate_assessment(uuid,text)'),'EXECUTE')
      and has_function_privilege('authenticated',to_regprocedure('public.crm_get_sales_gate_assessment(uuid,text)'),'EXECUTE')
      and has_function_privilege('service_role',to_regprocedure('public.crm_get_sales_gate_assessment(uuid,text)'),'EXECUTE')
      and not has_function_privilege('anon',to_regprocedure('public.crm_transition_opportunity(uuid,text)'),'EXECUTE')
      and has_function_privilege('authenticated',to_regprocedure('public.crm_transition_opportunity(uuid,text)'),'EXECUTE')
      and has_function_privilege('service_role',to_regprocedure('public.crm_transition_opportunity(uuid,text)'),'EXECUTE')
    ) as ok
  `,

  P10B6_CATALOG_SCHEMA_CURRENT: `
    select (
      (select count(*)=8 from pg_attribute
       where attrelid='public.sales_products'::regclass and attnum>0 and not attisdropped
         and attname=any(array['seller_guidance','catalog_version','effective_from','delivery_duration_min','delivery_duration_max','delivery_duration_unit','timeline_impact','delivery_duration_note']))
      and (select count(*)=2 from pg_attribute
       where attrelid='public.quotation_items'::regclass and attnum>0 and not attisdropped
         and attname=any(array['catalog_snapshot','catalog_version_snapshot']))
    ) as ok
  `,
  P10B6_CATALOG_SELLER_GUIDANCE_TRIGGER_CURRENT: `
    select (
      md5(pg_get_functiondef(to_regprocedure('public.preserve_sales_product_seller_guidance()')))
        ='2269678e3b6940c631e998da7f0f68e0'
      and exists (
        select 1 from pg_trigger
        where tgrelid='public.sales_products'::regclass
          and tgname='trg_preserve_sales_product_seller_guidance'
          and not tgisinternal and tgenabled<>'D'
      )
    ) as ok
  `,
  P10B6_CATALOG_ACL_CURRENT: `
    select (
      not has_function_privilege('anon',to_regprocedure('public.preserve_sales_product_seller_guidance()'),'EXECUTE')
      and not has_function_privilege('authenticated',to_regprocedure('public.preserve_sales_product_seller_guidance()'),'EXECUTE')
      and has_function_privilege('service_role',to_regprocedure('public.preserve_sales_product_seller_guidance()'),'EXECUTE')
    ) as ok
  `,
  P10B6_CATALOG_ACTIVE_45_UNIQUE: `
    select (
      count(*)=45 and count(distinct code)=45
    ) as ok
    from public.sales_products
    where active=true
  `,
  P10B6_CATALOG_ADDONS_37_PRIVATE: `
    select (
      count(*) filter (where active=true and product_type='addon')=37
      and count(*) filter (where active=true and product_type='addon' and public_visible=true)=0
    ) as ok
    from public.sales_products
  `,
  P10B6_CATALOG_DEFINITIONS_COMPLETE: `
    select not exists (
      select 1 from public.sales_products
      where active=true and (
        nullif(btrim(coalesce(short_description,'')),'') is null
        or nullif(btrim(coalesce(full_description,'')),'') is null
        or jsonb_array_length(coalesce(scope,'[]'::jsonb))=0
        or coalesce(seller_guidance,'{}'::jsonb)='{}'::jsonb
        or nullif(btrim(coalesce(delivery_duration_note,'')),'') is null
      )
    ) as ok
  `,
  P10B6_CATALOG_PF_CUSTOM_CURRENT: `
    select exists (
      select 1 from public.sales_products
      where code='PF-CUSTOM' and price_mode='custom' and base_price=0 and payment_schedule is null
    ) as ok
  `,
  P10B6_CATALOG_LAUNCH_CURRENT: `
    select exists (
      select 1 from public.sales_products
      where code='PF-WEB-LAUNCH'
        and public_details#>>'{comparison,Post-launch support}'='20 days'
        and public_details#>>'{comparison,Copywriting}'='Content refinement'
    ) as ok
  `,
  P10B6_CATALOG_GROWTH_CURRENT: `
    select exists (
      select 1 from public.sales_products
      where code='PF-WEB-GROWTH'
        and technology='WordPress, Next.js / React'
        and public_details#>>'{comparison,Typical technology}'='WordPress / Next.js / React'
    ) as ok
  `,
  P10B6_CATALOG_SCALE_CURRENT: `
    select exists (
      select 1 from public.sales_products
      where code='PF-WEB-SCALE'
        and public_details#>>'{comparison,E-commerce}'='Optional add-on / separate scope'
    ) as ok
  `,
});

export const forwardReconciliationPostconditionIds = Object.freeze(Object.keys(checks));

export async function verifyForwardReconciliationPostconditions(client, {
  ids = forwardReconciliationPostconditionIds,
  throwOnFailure = false,
} = {}) {
  const results = new Map();
  for (const id of ids) {
    const sql = checks[id];
    if (!sql) throw new Error(`Unknown forward reconciliation postcondition ID: ${id}.`);
    const result = await client.query(sql);
    const ok = result.rows?.[0]?.ok === true;
    results.set(id, ok);
    if (!ok && throwOnFailure) {
      throw new Error(`Forward reconciliation postcondition failed: ${id}.`);
    }
  }
  return results;
}

export function mappedPostconditionsPass(record, postconditionResults) {
  return record.postconditionIds.every(id => postconditionResults?.get(id) === true);
}

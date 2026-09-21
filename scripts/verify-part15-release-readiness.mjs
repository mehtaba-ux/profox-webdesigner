import dotenv from 'dotenv';
import pg from 'pg';
import { auditAppliedMigrationLedger, loadMigrationManifest } from './migration-manifest.mjs';

dotenv.config({ path: '.env.local', quiet: true });

const VERSION='20260921190000';
const NAME='crm_seller_quality_performance_part_15';
const EXPECTED_CHECKSUM='b810ff80cd93e3dfd1f2d288db7060ec02974e583487c715c5c00f1a4457f41b';
const REQUIRED_METRICS=[
  'firstResponseSla','discoveryCompleteness','proposalReadiness',
  'firstPassHandoffAcceptance','missingInformationRate','postSaleSalesAttributedScopeChanges',
  'unauthorizedPromiseIncidents','discountFrequency','commercialExceptions',
  'nextActionDiscipline','clientExpectationDisputes','verifiedRevenue','winRate','dealValue'
];

const connectionString=String(process.env.SUPABASE_DB_URL||'').trim();
if(!/^postgres(?:ql)?:\/\//i.test(connectionString)){
  throw new Error('SUPABASE_DB_URL is required for Part 15 production release verification.');
}

const client=new pg.Client({
  connectionString,
  ssl:{rejectUnauthorized:false},
  application_name:'profox-part15-release-readiness-verifier',
});

const failures=[];
const pass=(label,detail)=>console.log(`PASS  ${label}: ${detail}`);
const fail=(label,detail)=>{failures.push(`${label}: ${detail}`);console.error(`FAIL  ${label}: ${detail}`);};

try{
  const migrations=await loadMigrationManifest();
  const migration=migrations.find(item=>item.version===VERSION&&item.name===NAME);
  if(!migration) throw new Error(`Repository migration ${VERSION}_${NAME} is missing.`);
  if(migration.checksum!==EXPECTED_CHECKSUM){
    throw new Error(`Part 15 migration checksum changed: expected ${EXPECTED_CHECKSUM}; found ${migration.checksum}.`);
  }

  await client.connect();
  await client.query('begin read only');

  const appliedRows=(await client.query(`
    select version,name,checksum,baseline
    from profox_migrations.applied_migrations
    order by version
  `)).rows;
  const audit=auditAppliedMigrationLedger({migrations,appliedRows,requireAllApplied:false});
  if(audit.issues.length) fail('Production migration ledger integrity',audit.issues.join(' | '));
  else pass('Production migration ledger integrity',`${appliedRows.length} exact custom-ledger row(s)`);

  const rows=appliedRows.filter(row=>String(row.version)===VERSION);
  if(rows.length===1&&rows[0].name===NAME&&rows[0].checksum===EXPECTED_CHECKSUM&&rows[0].baseline===false){
    pass('Part 15 migration identity',`${VERSION}_${NAME} · ${EXPECTED_CHECKSUM}`);
  }else fail('Part 15 migration identity',`expected one exact non-baseline row; found ${JSON.stringify(rows)}`);

  const state=(await client.query(`
    with policy as (
      select config_value from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
    ),
    funcs as (
      select
        count(*) filter(where p.proname='get_sales_performance_period_snapshot')::int period_snapshot_count,
        count(*) filter(where p.proname='get_sales_performance_snapshot')::int current_snapshot_count,
        count(*) filter(where p.proname='get_my_sales_performance')::int seller_payload_count,
        count(*) filter(where p.proname='admin_get_sales_performance')::int admin_payload_count,
        count(*) filter(where p.proname='admin_update_sales_performance_review')::int review_update_count,
        count(*) filter(where p.proname='admin_update_sales_performance_settings')::int settings_update_count,
        count(*) filter(where p.proname='ensure_sales_performance_schedule')::int schedule_count,
        count(*) filter(where p.proname='crm_get_sales_gate_assessment')::int readiness_count,
        count(*) filter(where p.proname='crm_get_pipeline_command_center')::int pipeline_count,
        count(*) filter(where p.proname='verify_payment_atomic')::int payment_count,
        count(*) filter(where p.proname='project_get_sales_handoff_readiness')::int handoff_count,
        count(*) filter(where p.proname='crm_get_manager_exception_workspace')::int part14_count
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
    )
    select
      (select (config_value->>'finalQuotationSendGateActive')::boolean from policy) gate_active,
      (select (config_value->>'policyVersion')::int from policy) policy_version,
      (select (config_value->>'snapshotSchemaVersion')::int from policy) snapshot_schema_version,
      funcs.*,
      (select count(*)::int from information_schema.tables
       where table_schema='public'
         and table_name in ('seller_quality_reviews','sales_performance_v2','seller_scorecards','sales_quality_scores','performance_reviews_v2')) forbidden_performance_tables,
      (select count(*)::int from public.sales_performance_reviews) review_count,
      (select count(*)::int from public.sales_performance_reviews where status='Completed') completed_review_count,
      (select coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb)
       from (select status,count(*)::int cnt from public.sales_performance_reviews group by status order by status) x) review_statuses,
      (select count(*)::int from public.sales_performance_settings) settings_count,
      (select count(*)::int from public.user_profiles where status='active' and lower(role) in ('sales','sales_rep','sales_team')) active_sales_count
    from funcs
  `)).rows[0];

  if(state.gate_active===true&&Number(state.policy_version)===2&&Number(state.snapshot_schema_version)===2)
    pass('Part 10B preservation','finalQuotationSendGateActive=true · policyVersion=2 · snapshotSchemaVersion=2');
  else fail('Part 10B preservation',JSON.stringify(state));

  const canonical={
    periodSnapshot:state.period_snapshot_count,currentSnapshot:state.current_snapshot_count,
    sellerPayload:state.seller_payload_count,adminPayload:state.admin_payload_count,
    reviewUpdate:state.review_update_count,settingsUpdate:state.settings_update_count,
    schedule:state.schedule_count,readiness:state.readiness_count,pipeline:state.pipeline_count,
    payment:state.payment_count,handoff:state.handoff_count,part14:state.part14_count,
  };
  const missing=Object.entries(canonical).filter(([,value])=>Number(value)!==1);
  if(missing.length) fail('Canonical Part 15 dependency/functions',JSON.stringify(missing));
  else pass('Canonical Part 15 dependency/functions','all required functions exist exactly once');

  if(Number(state.forbidden_performance_tables)===0)
    pass('No duplicate performance truth table','0 prohibited Part 15 performance tables');
  else fail('No duplicate performance truth table',`${state.forbidden_performance_tables} prohibited table(s) found`);

  const functionRows=(await client.query(`
    select p.proname,p.oid,p.prosecdef,p.provolatile,p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
      has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec,
      pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('get_sales_performance_period_snapshot','get_sales_performance_snapshot','admin_update_sales_performance_review')
    order by p.proname
  `)).rows;
  const byName=Object.fromEntries(functionRows.map(row=>[row.proname,row]));
  const periodFn=byName.get_sales_performance_period_snapshot;
  const currentFn=byName.get_sales_performance_snapshot;
  const reviewFn=byName.admin_update_sales_performance_review;

  if(periodFn?.prosecdef===true&&periodFn.provolatile==='s'&&periodFn.anon_exec===false&&periodFn.auth_exec===true
      &&Array.isArray(periodFn.proconfig)&&periodFn.proconfig.some(v=>String(v).startsWith('search_path='))){
    pass('Part 15 period RPC security','STABLE SECURITY DEFINER; fixed search_path; anon denied; authenticated with internal self/Admin authorization');
  }else fail('Part 15 period RPC security',JSON.stringify(periodFn));

  if(currentFn?.prosecdef===true&&currentFn.provolatile==='s'&&currentFn.anon_exec===false&&currentFn.auth_exec===false)
    pass('Part 15 internal current snapshot security','direct authenticated execution remains revoked; existing guarded payload RPCs are the browser path');
  else fail('Part 15 internal current snapshot security',JSON.stringify(currentFn));

  const periodDef=String(periodFn?.definition||'');
  for(const [label,pattern,expected] of [
    ['Part 8 Requirements evaluator reuse',/REQUIREMENTS_CONFIRMED/i,true],
    ['Part 8 Proposal Readiness reuse',/PROPOSAL_READINESS/i,true],
    ['Part 13 handoff source reuse',/project_sales_handover_attempts/i,true],
    ['Part 11 activity source reuse',/crm_activities/i,true],
    ['Verified Payment authority',/status='Verified'/i,true],
    ['Legacy next_follow_up_at excluded',/next_follow_up_at/i,false],
    ['No source INSERT',/\binsert\s+into\b/i,false],
    ['No source UPDATE',/\bupdate\s+public\./i,false],
    ['No source DELETE',/\bdelete\s+from\b/i,false],
  ]){
    const found=pattern.test(periodDef);
    if(found===expected) pass(label,expected?'present':'absent as required');
    else fail(label,expected?'required source contract missing':'forbidden behavior found');
  }

  const reviewDef=String(reviewFn?.definition||'');
  for(const [label,pattern,expected] of [
    ['Completed-review immutability',/Completed performance reviews are immutable/i,true],
    ['Early completion blocked',/cannot be completed before its evidence period ends/i,true],
    ['Exact review period snapshot',/get_sales_performance_period_snapshot\(v_review\.salesperson_id,\s*v_review\.period_start,\s*v_review\.period_end\)/i,true],
    ['Human management decision required',/requires a management decision/i,true],
    ['No automatic user access mutation',/update\s+public\.user_profiles/i,false],
    ['No automatic recruitment mutation',/update\s+public\.applicants/i,false],
    ['No automatic commission mutation',/(insert|update)\s+public\.commission/i,false],
    ['No automatic certification mutation',/(insert|update)\s+public\.[a-z_]*certif/i,false],
  ]){
    const found=pattern.test(reviewDef);
    if(found===expected) pass(label,expected?'present':'absent as required');
    else fail(label,expected?'required review contract missing':'forbidden automatic consequence found');
  }

  const admin=(await client.query(`
    select id from public.user_profiles
    where role='admin' and status='active'
    order by created_at limit 1
  `)).rows[0];
  const seller=(await client.query(`
    select id from public.user_profiles
    where status='active' and lower(role) in ('sales','sales_rep','sales_team')
    order by created_at limit 1
  `)).rows[0];
  if(!admin?.id||!seller?.id) throw new Error('Active Admin and Seller are required for read-only Part 15 verification.');

  const review=(await client.query(`
    select period_start,period_end
    from public.sales_performance_reviews
    where salesperson_id=$1
    order by scheduled_for,review_key
    limit 1
  `,[seller.id])).rows[0];
  if(!review) throw new Error('Seller has no canonical performance review period for Part 15 verification.');

  await client.query(`select set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated')::text,true)`,[admin.id]);
  const snapshot=(await client.query(`
    select public.get_sales_performance_period_snapshot($1,$2,$3) result
  `,[seller.id,review.period_start,review.period_end])).rows[0]?.result;

  if(!snapshot||snapshot.schemaVersion!==1) fail('Part 15 period snapshot response','missing schemaVersion=1 response');
  else{
    const evidence=snapshot.qualityEvidence||{};
    const keys=Object.keys(evidence).sort();
    const missingKeys=REQUIRED_METRICS.filter(key=>!evidence[key]);
    const extraKeys=keys.filter(key=>!REQUIRED_METRICS.includes(key));
    if(!missingKeys.length&&!extraKeys.length)
      pass('Part 15 metric contract',`exact ${REQUIRED_METRICS.length} required metrics`);
    else fail('Part 15 metric contract',JSON.stringify({missingKeys,extraKeys}));

    const invalidAvailability=REQUIRED_METRICS.filter(key=>!['AVAILABLE','INSUFFICIENT_DATA','NOT_TRACKED_AUTHORITATIVELY'].includes(evidence[key]?.availability));
    if(!invalidAvailability.length) pass('Metric availability semantics','all metrics use the approved availability vocabulary');
    else fail('Metric availability semantics',invalidAvailability.join(', '));

    if(evidence.postSaleSalesAttributedScopeChanges?.availability==='NOT_TRACKED_AUTHORITATIVELY'
       &&evidence.clientExpectationDisputes?.availability==='NOT_TRACKED_AUTHORITATIVELY')
      pass('Unsupported attribution fails closed','scope-change attribution and client disputes are explicitly not tracked authoritatively');
    else fail('Unsupported attribution fails closed',JSON.stringify({
      scope:evidence.postSaleSalesAttributedScopeChanges?.availability,
      disputes:evidence.clientExpectationDisputes?.availability
    }));

    const serialized=JSON.stringify(snapshot).toLowerCase();
    const forbidden=['provider_payment_id','customer_view_token_hash','access_token','refresh_token','private_key','service_role','api_secret'];
    const exposed=forbidden.filter(value=>serialized.includes(value));
    if(!exposed.length) pass('Safe performance payload','no secret/provider/token fields exposed');
    else fail('Safe performance payload',exposed.join(', '));

    if(snapshot.currentOperationalHealth?.source==='Part 11 opportunity-linked Scheduled crm_activities')
      pass('Current operational health separation','Part 11 activity truth is surfaced separately from review-period metrics');
    else fail('Current operational health separation',JSON.stringify(snapshot.currentOperationalHealth));
  }

  await client.query(`select set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated')::text,true)`,[seller.id]);
  const own=(await client.query(`
    select public.get_sales_performance_period_snapshot($1,$2,$3) result
  `,[seller.id,review.period_start,review.period_end])).rows[0]?.result;
  if(own?.qualityEvidence) pass('Seller self-scope read','active Seller can read own Part 15 period evidence');
  else fail('Seller self-scope read','Seller own period evidence unavailable');

  await client.query('savepoint part15_cross_scope');
  let crossDenied=false;
  try{
    await client.query(`select public.get_sales_performance_period_snapshot($1,$2,$3)`,[admin.id,review.period_start,review.period_end]);
  }catch(error){
    crossDenied=/only view your own sales performance/i.test(String(error?.message||error));
    await client.query('rollback to savepoint part15_cross_scope');
  }
  if(crossDenied) pass('Seller cross-user denial','Seller cannot read another user performance snapshot');
  else fail('Seller cross-user denial','cross-user performance access was not rejected as expected');

  pass('Part 15 production review inventory',`reviews ${state.review_count}; completed ${state.completed_review_count}; statuses ${JSON.stringify(state.review_statuses)}; settings ${state.settings_count}; active Sales ${state.active_sales_count}`);

  await client.query('rollback');
}catch(error){
  try{await client.query('rollback');}catch{}
  throw error;
}finally{
  await client.end();
}

console.log(`\nPart 15 release readiness: ${failures.length} failure(s).`);
if(failures.length>0) process.exitCode=1;

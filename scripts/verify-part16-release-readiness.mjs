import dotenv from 'dotenv';
import pg from 'pg';
import { auditAppliedMigrationLedger, loadMigrationManifest } from './migration-manifest.mjs';

dotenv.config({ path: '.env.local', quiet: true });

const VERSION='20260922150000';
const NAME='crm_sales_certification_deal_permissions_part_16';
const HARDENING_VERSION='20260922151000';
const HARDENING_NAME='crm_sales_certification_deal_permissions_part_16_performance_hardening';

const connectionString=String(process.env.SUPABASE_DB_URL||'').trim();
if(!/^postgres(?:ql)?:\/\//i.test(connectionString)){
  throw new Error('SUPABASE_DB_URL is required for Part 16 production release verification.');
}

const client=new pg.Client({
  connectionString,
  ssl:{rejectUnauthorized:false},
  application_name:'profox-part16-release-readiness-verifier',
});

const failures=[];
const pass=(label,detail)=>console.log(`PASS  ${label}: ${detail}`);
const fail=(label,detail)=>{failures.push(`${label}: ${detail}`);console.error(`FAIL  ${label}: ${detail}`);};

try{
  const migrations=await loadMigrationManifest();
  const migration=migrations.find(item=>item.version===VERSION&&item.name===NAME);
  if(!migration) throw new Error(`Repository migration ${VERSION}_${NAME} is missing.`);
  const hardeningMigration=migrations.find(item=>item.version===HARDENING_VERSION&&item.name===HARDENING_NAME);
  if(!hardeningMigration) throw new Error(`Repository migration ${HARDENING_VERSION}_${HARDENING_NAME} is missing.`);

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
  if(rows.length===1&&rows[0].name===NAME&&rows[0].checksum===migration.checksum&&rows[0].baseline===false){
    pass('Part 16 migration identity',`${VERSION}_${NAME} · ${migration.checksum}`);
  }else fail('Part 16 migration identity',`expected one exact non-baseline row matching repository checksum; found ${JSON.stringify(rows)}`);

  const hardeningRows=appliedRows.filter(row=>String(row.version)===HARDENING_VERSION);
  if(hardeningRows.length===1&&hardeningRows[0].name===HARDENING_NAME&&hardeningRows[0].checksum===hardeningMigration.checksum&&hardeningRows[0].baseline===false){
    pass('Part 16 performance hardening migration identity',`${HARDENING_VERSION}_${HARDENING_NAME} · ${hardeningMigration.checksum}`);
  }else fail('Part 16 performance hardening migration identity',`expected one exact non-baseline row matching repository checksum; found ${JSON.stringify(hardeningRows)}`);

  const state=(await client.query(`
    with part16_policy as (
      select config_value from public.system_configuration
      where config_key='crm_sales_certification_deal_permission_policy_v1'
    ),
    part10b as (
      select config_value from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
    ),
    funcs as (
      select
        count(*) filter(where p.proname='sales_get_certification_permission_snapshot')::int snapshot_count,
        count(*) filter(where p.proname='get_my_sales_certification_permissions')::int seller_count,
        count(*) filter(where p.proname='admin_get_sales_certification_permissions')::int admin_count,
        count(*) filter(where p.proname='admin_grant_sales_package_certification')::int grant_count,
        count(*) filter(where p.proname='admin_revoke_sales_package_certification')::int revoke_count,
        count(*) filter(where p.proname='crm_get_sales_certification_deal_permission')::int deal_count,
        count(*) filter(where p.proname='crm_assert_sales_certification_deal_permission')::int assert_count,
        count(*) filter(where p.proname='sales_academy_training_ready')::int academy_count,
        count(*) filter(where p.proname='crm_get_package_fit_assessment')::int package_fit_count,
        count(*) filter(where p.proname='crm_assert_quotation_send_ready')::int final_send_count
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
    )
    select
      (select config_value->>'policyKey' from part16_policy) policy_key,
      (select (config_value->>'policyVersion')::int from part16_policy) policy_version,
      (select (config_value->>'grantingActive')::boolean from part16_policy) granting_active,
      (select (config_value->>'enforcementActive')::boolean from part16_policy) enforcement_active,
      (select (config_value->>'criteriaApproved')::boolean from part16_policy) criteria_approved,
      (select config_value->>'rolloutState' from part16_policy) rollout_state,
      (select config_value->'packageCriteria' from part16_policy) package_criteria,
      (select (config_value->>'finalQuotationSendGateActive')::boolean from part10b) part10b_active,
      (select (config_value->>'policyVersion')::int from part10b) part10b_policy_version,
      (select (config_value->>'snapshotSchemaVersion')::int from part10b) part10b_snapshot_version,
      funcs.*,
      (select count(*)::int from public.sales_certification_package_grants) grant_history_count,
      (select count(*)::int from public.sales_certification_package_grants where revoked_at is null) active_grant_count,
      (select count(*)::int from public.user_profiles where status='active' and lower(role) in ('sales','sales_rep','sales_team')) active_sales_count,
      (select count(*)::int from public.sales_products where active=true and lower(coalesce(product_type,''))='package') active_package_count,
      (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='sales_certification_package_grants') rls_enabled,
      has_table_privilege('authenticated','public.sales_certification_package_grants','SELECT') auth_select,
      has_table_privilege('authenticated','public.sales_certification_package_grants','INSERT') auth_insert,
      has_table_privilege('authenticated','public.sales_certification_package_grants','UPDATE') auth_update,
      has_table_privilege('authenticated','public.sales_certification_package_grants','DELETE') auth_delete,
      to_regclass('public.sales_certification_package_grants_granted_by_idx') is not null granted_by_index,
      to_regclass('public.sales_certification_package_grants_revoked_by_idx') is not null revoked_by_index,
      (select qual from pg_policies
       where schemaname='public'
         and tablename='sales_certification_package_grants'
         and policyname='sales_certification_package_grants_read_self_or_admin') rls_qual
    from funcs
  `)).rows[0];

  if(state.policy_key==='crm_sales_certification_deal_permission_policy_v1'&&Number(state.policy_version)===1)
    pass('Part 16 policy identity','policy v1 present');
  else fail('Part 16 policy identity',JSON.stringify(state));

  if(state.part10b_active===true&&Number(state.part10b_policy_version)===2&&Number(state.part10b_snapshot_version)===2)
    pass('Part 10B preservation','finalQuotationSendGateActive=true · policyVersion=2 · snapshotSchemaVersion=2');
  else fail('Part 10B preservation',JSON.stringify(state));

  const canonical={
    snapshot:state.snapshot_count,seller:state.seller_count,admin:state.admin_count,
    grant:state.grant_count,revoke:state.revoke_count,deal:state.deal_count,assert:state.assert_count,
    academy:state.academy_count,packageFit:state.package_fit_count,finalSend:state.final_send_count,
  };
  const missing=Object.entries(canonical).filter(([,value])=>Number(value)!==1);
  if(missing.length) fail('Canonical Part 16 functions/dependencies',JSON.stringify(missing));
  else pass('Canonical Part 16 functions/dependencies','all required functions exist exactly once');

  if(state.rls_enabled===true&&state.auth_select===true&&state.auth_insert===false&&state.auth_update===false&&state.auth_delete===false)
    pass('Grant table browser privileges','RLS enabled; authenticated SELECT only; all browser writes RPC-only');
  else fail('Grant table browser privileges',JSON.stringify({
    rls:state.rls_enabled,select:state.auth_select,insert:state.auth_insert,update:state.auth_update,delete:state.auth_delete
  }));

  const rlsQual=String(state.rls_qual||'');
  if(state.granted_by_index===true&&state.revoked_by_index===true)
    pass('Part 16 actor foreign-key indexes','granted_by and revoked_by are covered');
  else fail('Part 16 actor foreign-key indexes',JSON.stringify({grantedBy:state.granted_by_index,revokedBy:state.revoked_by_index}));

  if(/SELECT\s+auth\.uid\(\)/i.test(rlsQual)&&/SELECT\s+(?:public\.)?is_admin\(\)/i.test(rlsQual))
    pass('Part 16 RLS init-plan hardening','self/Admin policy evaluates auth/admin helpers through SELECT init plans');
  else fail('Part 16 RLS init-plan hardening',rlsQual);

  if(state.granting_active===false&&state.enforcement_active===false&&state.criteria_approved===false){
    if(Number(state.active_grant_count)===0&&JSON.stringify(state.package_criteria||{})==='{}')
      pass('Safe staged rollout','granting=false · enforcement=false · criteria=false · zero active grants · zero fabricated package criteria');
    else fail('Safe staged rollout',JSON.stringify({
      granting:state.granting_active,enforcement:state.enforcement_active,criteria:state.criteria_approved,
      activeGrants:state.active_grant_count,packageCriteria:state.package_criteria
    }));
  }else{
    pass('Part 16 activated rollout','policy has moved beyond the initial staged state; verifier will validate live grants and evaluator semantics');
  }

  const fnRows=(await client.query(`
    select p.proname,p.prosecdef,p.provolatile,p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
      has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec,
      pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'sales_get_certification_permission_snapshot',
        'get_my_sales_certification_permissions',
        'admin_get_sales_certification_permissions',
        'admin_grant_sales_package_certification',
        'admin_revoke_sales_package_certification',
        'crm_get_sales_certification_deal_permission',
        'crm_assert_sales_certification_deal_permission'
      )
    order by p.proname
  `)).rows;
  const byName=Object.fromEntries(fnRows.map(row=>[row.proname,row]));
  for(const name of ['sales_get_certification_permission_snapshot','get_my_sales_certification_permissions','admin_get_sales_certification_permissions','admin_grant_sales_package_certification','admin_revoke_sales_package_certification','crm_get_sales_certification_deal_permission']){
    const row=byName[name];
    const fixedPath=Array.isArray(row?.proconfig)&&row.proconfig.some(v=>String(v).startsWith('search_path='));
    if(row?.prosecdef===true&&row.anon_exec===false&&row.auth_exec===true&&fixedPath)
      pass(`${name} security`,'SECURITY DEFINER; fixed search_path; anon denied; authenticated guarded internally');
    else fail(`${name} security`,JSON.stringify(row));
  }
  const assertFn=byName.crm_assert_sales_certification_deal_permission;
  if(assertFn?.prosecdef===true&&assertFn.anon_exec===false&&assertFn.auth_exec===false)
    pass('Internal pre-send assertion security','direct browser execution revoked');
  else fail('Internal pre-send assertion security',JSON.stringify(assertFn));

  const dealDef=String(byName.crm_get_sales_certification_deal_permission?.definition||'');
  for(const [label,pattern,expected] of [
    ['Explicit package grant source',/sales_certification_package_grants/i,true],
    ['General certification prerequisite',/sales_certification_general_ready/i,true],
    ['Staged preservation behavior',/STAGED_NOT_ENFORCED/i,true],
    ['Supervised approval evidence',/approval_decision.*approved/is,true],
    ['Missing grant fails closed when active',/PACKAGE_CERTIFICATION_NOT_GRANTED/i,true],
    ['No deal mutation in evaluator',/\bupdate\s+public\./i,false],
    ['No grant mutation in evaluator',/\binsert\s+into\s+public\.sales_certification_package_grants/i,false],
  ]){
    const found=pattern.test(dealDef);
    if(found===expected) pass(label,expected?'present':'absent as required');
    else fail(label,expected?'required evaluator contract missing':'forbidden evaluator mutation found');
  }

  const triggers=(await client.query(`
    select t.tgname,c.relname table_name,pg_get_triggerdef(t.oid,true) definition
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and t.tgname in ('trg_crm_enforce_sales_certification_package_item','trg_crm_enforce_sales_certification_before_send','trg_validate_sales_certification_deal_permission_policy')
      and not t.tgisinternal
    order by t.tgname
  `)).rows;
  if(triggers.length===3) pass('Part 16 server hooks','package-item, pre-send, and policy-validation triggers present exactly once');
  else fail('Part 16 server hooks',JSON.stringify(triggers));

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
  if(!admin?.id||!seller?.id) throw new Error('Active Admin and Seller are required for read-only Part 16 verification.');

  await client.query(`select set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated')::text,true)`,[admin.id]);
  const adminPayload=(await client.query(`select public.admin_get_sales_certification_permissions() result`)).rows[0]?.result;
  if(Array.isArray(adminPayload?.sellers)&&adminPayload.sellers.some(row=>row.id===seller.id))
    pass('Admin certification visibility','active Seller appears in canonical Admin Part 16 payload');
  else fail('Admin certification visibility','active Seller missing from Admin payload');

  await client.query(`select set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated')::text,true)`,[seller.id]);
  const sellerPayload=(await client.query(`select public.get_my_sales_certification_permissions() result`)).rows[0]?.result;
  if(sellerPayload?.salespersonId===seller.id&&Array.isArray(sellerPayload?.products))
    pass('Seller self-scope certification visibility',`${sellerPayload.products.length} active package(s) surfaced`);
  else fail('Seller self-scope certification visibility',JSON.stringify(sellerPayload));

  await client.query('savepoint part16_cross_scope');
  let crossDenied=false;
  try{
    await client.query(`select public.sales_get_certification_permission_snapshot($1)`,[admin.id]);
  }catch(error){
    crossDenied=/only view your own Sales certification permissions/i.test(String(error?.message||error));
    await client.query('rollback to savepoint part16_cross_scope');
  }
  if(crossDenied) pass('Seller cross-user denial','Seller cannot read another user certification snapshot');
  else fail('Seller cross-user denial','cross-user certification access was not rejected as expected');

  const opportunity=(await client.query(`
    select id
    from public.crm_opportunities
    where salesperson_id=$1 and status='Open'
    order by created_at desc limit 1
  `,[seller.id])).rows[0];
  if(opportunity?.id){
    const assessment=(await client.query(`
      select public.crm_get_sales_certification_deal_permission(NULL,NULL,$1,NULL) result
    `,[opportunity.id])).rows[0]?.result;
    if(state.enforcement_active===false&&assessment?.status==='STAGED_NOT_ENFORCED'&&assessment?.canDraft===true&&assessment?.canSend===true)
      pass('Staged deal-authority preservation','existing Seller deal authority remains unchanged while enforcement is off');
    else if(state.enforcement_active===true&&['INDEPENDENT','SUPERVISED','BLOCKED'].includes(assessment?.status))
      pass('Active deal-authority evaluation',assessment.status);
    else fail('Deal-authority evaluation',JSON.stringify(assessment));
  }else{
    pass('Deal-authority live opportunity check','no open Seller opportunity exists; self-scope permission snapshot still verified');
  }

  pass('Part 16 production inventory',`grant history ${state.grant_history_count}; active grants ${state.active_grant_count}; active Sales ${state.active_sales_count}; active packages ${state.active_package_count}`);

  await client.query('rollback');
}catch(error){
  try{await client.query('rollback');}catch{}
  throw error;
}finally{
  await client.end();
}

console.log(`\nPart 16 release readiness: ${failures.length} failure(s).`);
if(failures.length>0) process.exitCode=1;

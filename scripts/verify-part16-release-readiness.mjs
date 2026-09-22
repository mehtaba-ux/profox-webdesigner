import dotenv from 'dotenv';
import pg from 'pg';
import { auditAppliedMigrationLedger, loadMigrationManifest } from './migration-manifest.mjs';

dotenv.config({ path: '.env.local', quiet: true });

const REQUIRED_MIGRATIONS=[
  ['20260922150000','crm_sales_certification_deal_permissions_part_16'],
  ['20260922151000','crm_sales_certification_deal_permissions_part_16_performance_hardening'],
  ['20260922170000','crm_sales_certification_deal_permissions_part_16_policy_completion'],
  ['20260922171000','crm_sales_certification_deal_permissions_part_16_evaluator_completion'],
];
const CERT_KEYS=['LAUNCH_CERTIFIED','GROWTH_CERTIFIED','SCALE_CERTIFIED','CUSTOM_QUALIFICATION_CERTIFIED'];
const MODES=['INDEPENDENT','SUPERVISED','QUALIFY_ONLY','BLOCKED'];
const ADDON_BEHAVIORS=['INHERIT_BASE_PACKAGE','REQUIRE_GROWTH','REQUIRE_SCALE','REQUIRE_SPECIALIST_VALIDATION','CUSTOM_QUALIFICATION_ONLY'];

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
  const expected=[];
  for(const [version,name] of REQUIRED_MIGRATIONS){
    const migration=migrations.find(item=>item.version===version&&item.name===name);
    if(!migration) throw new Error(`Repository migration ${version}_${name} is missing.`);
    expected.push(migration);
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

  for(const migration of expected){
    const rows=appliedRows.filter(row=>String(row.version)===migration.version);
    const label=migration.version==='20260922150000'
      ? 'Part 16 migration identity'
      : `Part 16 forward migration ${migration.version}`;
    if(rows.length===1&&rows[0].name===migration.name&&rows[0].checksum===migration.checksum&&rows[0].baseline===false)
      pass(label,`${migration.version}_${migration.name} · ${migration.checksum}`);
    else fail(label,`expected one exact non-baseline ledger row matching repository checksum; found ${JSON.stringify(rows)}`);
  }

  const state=(await client.query(`
    with p16 as (
      select config_value from public.system_configuration
      where config_key='crm_sales_certification_deal_permission_policy_v1'
    ),
    p10b as (
      select config_value from public.system_configuration
      where config_key='crm_quotation_sales_reconciliation_policy_v1'
    ),
    funcs as (
      select
        count(*) filter(where p.proname='sales_get_certification_permission_snapshot')::int snapshot_count,
        count(*) filter(where p.proname='get_my_sales_certification_permissions')::int seller_count,
        count(*) filter(where p.proname='admin_get_sales_certification_permissions')::int admin_count,
        count(*) filter(where p.proname='admin_update_sales_certification_policy')::int policy_update_count,
        count(*) filter(where p.proname='admin_grant_sales_package_certification')::int grant_count,
        count(*) filter(where p.proname='admin_revoke_sales_package_certification')::int revoke_count,
        count(*) filter(where p.proname='crm_get_sales_certification_deal_permission')::int deal_count,
        count(*) filter(where p.proname='crm_assert_sales_certification_deal_permission')::int assert_count,
        count(*) filter(where p.proname='sales_academy_training_ready')::int academy_count,
        count(*) filter(where p.proname='get_product_package_training')::int product_training_count,
        count(*) filter(where p.proname='crm_get_package_fit_assessment')::int package_fit_count,
        count(*) filter(where p.proname='crm_enforce_quotation_qualification')::int quotation_qualification_count,
        count(*) filter(where p.proname='crm_transition_opportunity')::int transition_count,
        count(*) filter(where p.proname='crm_assert_quotation_send_ready')::int final_send_count,
        count(*) filter(where p.proname='crm_get_pipeline_command_center')::int part11_count,
        count(*) filter(where p.proname='verify_payment_atomic')::int part12_count,
        count(*) filter(where p.proname='project_get_sales_handoff_readiness')::int part13_count,
        count(*) filter(where p.proname='crm_get_manager_exception_workspace')::int part14_count,
        count(*) filter(where p.proname='get_sales_performance_period_snapshot')::int part15_count
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
    )
    select
      (select config_value from p16) policy,
      (select (config_value->>'finalQuotationSendGateActive')::boolean from p10b) part10b_active,
      (select (config_value->>'policyVersion')::int from p10b) part10b_policy_version,
      (select (config_value->>'snapshotSchemaVersion')::int from p10b) part10b_snapshot_version,
      funcs.*,
      (select count(*)::int from public.sales_certification_package_grants) grant_history_count,
      (select count(*)::int from public.sales_certification_package_grants
        where revoked_at is null
          and public.sales_certification_grant_effective_status(grant_state,expires_at,revoked_at)='ACTIVE') active_grant_count,
      (select count(*)::int from public.user_profiles where status='active' and lower(role) in ('sales','sales_rep','sales_team')) active_sales_count,
      (select count(*)::int from public.sales_products where active=true and lower(coalesce(product_type,''))='package') active_package_count,
      (select count(*)::int from public.sales_products where active=true and lower(coalesce(product_type,''))='addon') active_addon_count,
      (select count(*)::int from information_schema.tables where table_schema='public'
        and table_name in ('seller_certifications','sales_package_permissions','deal_permissions','sales_academy_v2','final_certification_v2','sales_products_v2')) duplicate_truth_tables,
      (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname='sales_certification_package_grants') rls_enabled,
      has_table_privilege('authenticated','public.sales_certification_package_grants','SELECT') auth_select,
      has_table_privilege('authenticated','public.sales_certification_package_grants','INSERT') auth_insert,
      has_table_privilege('authenticated','public.sales_certification_package_grants','UPDATE') auth_update,
      has_table_privilege('authenticated','public.sales_certification_package_grants','DELETE') auth_delete,
      to_regclass('public.sales_certification_package_grants_granted_by_idx') is not null granted_by_index,
      to_regclass('public.sales_certification_package_grants_revoked_by_idx') is not null revoked_by_index,
      (select qual from pg_policies
       where schemaname='public'
         and tablename='sales_certification_package_grants'
         and policyname='sales_certification_package_grants_read_self_or_admin') rls_qual,
      (select count(*)::int from information_schema.columns
       where table_schema='public' and table_name='sales_certification_package_grants'
         and column_name in ('certification_key','grant_state','expires_at')) completion_columns
    from funcs
  `)).rows[0];

  const policy=state.policy||{};
  if(policy.policyKey==='crm_sales_certification_deal_permission_policy_v1'
     &&Number(policy.schemaVersion)===2
     &&Number(policy.policyVersion)>=1)
    pass('Part 16 policy identity',`schema v${policy.schemaVersion} · policy v${policy.policyVersion}`);
  else fail('Part 16 policy identity',JSON.stringify(policy));

  if(JSON.stringify(policy.allowedCertificationKeys||[])===JSON.stringify(CERT_KEYS))
    pass('Part 16 certification keys',CERT_KEYS.join(', '));
  else fail('Part 16 certification keys',JSON.stringify(policy.allowedCertificationKeys));

  if(JSON.stringify(policy.permissionModes||[])===JSON.stringify(MODES))
    pass('Part 16 permission modes',MODES.join(', '));
  else fail('Part 16 permission modes',JSON.stringify(policy.permissionModes));

  if(JSON.stringify(policy.addonBehaviors||[])===JSON.stringify(ADDON_BEHAVIORS))
    pass('Part 16 add-on behaviors',ADDON_BEHAVIORS.join(', '));
  else fail('Part 16 add-on behaviors',JSON.stringify(policy.addonBehaviors));

  if(state.part10b_active===true&&Number(state.part10b_policy_version)===2&&Number(state.part10b_snapshot_version)===2)
    pass('Part 10B preservation','finalQuotationSendGateActive=true · policyVersion=2 · snapshotSchemaVersion=2');
  else fail('Part 10B preservation',JSON.stringify(state));

  const canonical={
    snapshot:state.snapshot_count,seller:state.seller_count,admin:state.admin_count,policyUpdate:state.policy_update_count,
    grant:state.grant_count,revoke:state.revoke_count,deal:state.deal_count,assert:state.assert_count,
    academy:state.academy_count,productTraining:state.product_training_count,packageFit:state.package_fit_count,
    quotationQualification:state.quotation_qualification_count,transition:state.transition_count,finalSend:state.final_send_count,
    part11:state.part11_count,part12:state.part12_count,part13:state.part13_count,part14:state.part14_count,part15:state.part15_count,
  };
  const missing=Object.entries(canonical).filter(([,value])=>Number(value)!==1);
  if(missing.length) fail('Canonical Part 16 dependencies + Parts 11–15',JSON.stringify(missing));
  else pass('Canonical Part 16 dependencies + Parts 11–15','all required existing authorities/functions exist exactly once');

  if(Number(state.duplicate_truth_tables)===0)
    pass('No duplicate Academy/Final/Product permission truth','0 prohibited duplicate truth tables');
  else fail('No duplicate Academy/Final/Product permission truth',`${state.duplicate_truth_tables} prohibited duplicate table(s)`);

  if(Number(state.completion_columns)===3)
    pass('Part 16 durable grant lifecycle','certification_key + grant_state + expires_at present');
  else fail('Part 16 durable grant lifecycle',`completion columns=${state.completion_columns}`);

  if(state.rls_enabled===true&&state.auth_select===true&&state.auth_insert===false&&state.auth_update===false&&state.auth_delete===false)
    pass('Grant table browser privileges','RLS enabled; authenticated SELECT only; browser writes RPC-only');
  else fail('Grant table browser privileges',JSON.stringify({
    rls:state.rls_enabled,select:state.auth_select,insert:state.auth_insert,update:state.auth_update,delete:state.auth_delete
  }));

  if(state.granted_by_index===true&&state.revoked_by_index===true)
    pass('Part 16 actor foreign-key indexes','granted_by and revoked_by are covered');
  else fail('Part 16 actor foreign-key indexes',JSON.stringify({grantedBy:state.granted_by_index,revokedBy:state.revoked_by_index}));

  const rlsQual=String(state.rls_qual||'');
  if(/SELECT\s+auth\.uid\(\)/i.test(rlsQual)&&/SELECT\s+(?:public\.)?is_admin\(\)/i.test(rlsQual))
    pass('Part 16 RLS init-plan hardening','self/Admin policy uses init-plan helpers');
  else fail('Part 16 RLS init-plan hardening',rlsQual);

  if(policy.criteriaApproved===false&&policy.grantingActive===false&&policy.enforcementActive===false
     &&Object.keys(policy.productRules||{}).length===0&&Object.keys(policy.addonRules||{}).length===0
     &&Array.isArray(policy.protectedCommitmentStages)&&policy.protectedCommitmentStages.length===0
     &&Number(state.grant_history_count)===0&&Number(state.active_grant_count)===0)
    pass('Safe staged rollout','criteria/granting/enforcement=false · zero product/add-on mappings · zero grants');
  else fail('Safe staged rollout',JSON.stringify({
    criteriaApproved:policy.criteriaApproved,grantingActive:policy.grantingActive,enforcementActive:policy.enforcementActive,
    productRules:policy.productRules,addonRules:policy.addonRules,protectedCommitmentStages:policy.protectedCommitmentStages,
    grantHistory:state.grant_history_count,activeGrants:state.active_grant_count
  }));

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
        'admin_update_sales_certification_policy',
        'admin_grant_sales_package_certification',
        'admin_revoke_sales_package_certification',
        'crm_get_sales_certification_deal_permission',
        'crm_assert_sales_certification_deal_permission'
      )
    order by p.proname
  `)).rows;
  const byName=Object.fromEntries(fnRows.map(row=>[row.proname,row]));

  for(const name of [
    'sales_get_certification_permission_snapshot','get_my_sales_certification_permissions',
    'admin_get_sales_certification_permissions','admin_update_sales_certification_policy',
    'admin_grant_sales_package_certification','admin_revoke_sales_package_certification',
    'crm_get_sales_certification_deal_permission'
  ]){
    const row=byName[name];
    const fixedPath=Array.isArray(row?.proconfig)&&row.proconfig.some(v=>String(v).startsWith('search_path='));
    if(row?.prosecdef===true&&row.anon_exec===false&&row.auth_exec===true&&fixedPath)
      pass(`${name} security`,'SECURITY DEFINER · fixed search_path · anon denied · authenticated internally authorized');
    else fail(`${name} security`,JSON.stringify(row));
  }
  const assertFn=byName.crm_assert_sales_certification_deal_permission;
  if(assertFn?.prosecdef===true&&assertFn.anon_exec===false&&assertFn.auth_exec===false)
    pass('Internal pre-send assertion security','direct browser execution revoked');
  else fail('Internal pre-send assertion security',JSON.stringify(assertFn));

  const evaluatorDef=String(byName.crm_get_sales_certification_deal_permission?.definition||'');
  const grantDef=String(byName.admin_grant_sales_package_certification?.definition||'');
  const policyDef=String(byName.admin_update_sales_certification_policy?.definition||'');
  for(const [label,pattern,source] of [
    ['Four permission modes',/INDEPENDENT.*SUPERVISED.*QUALIFY_ONLY.*BLOCKED/is,evaluatorDef],
    ['Explicit grant source',/sales_certification_package_grants/i,evaluatorDef],
    ['Canonical product source',/sales_products/i,evaluatorDef],
    ['General certification prerequisite',/sales_certification_general_ready/i,evaluatorDef],
    ['Sales Validation reuse',/crm_sales_validations/i,evaluatorDef],
    ['Existing quotation supervision reuse',/approval_decision.*approved/is,evaluatorDef],
    ['Staged preservation behavior',/STAGED_NOT_ENFORCED/i,evaluatorDef],
    ['Missing grant fails closed when active',/PACKAGE_CERTIFICATION_NOT_GRANTED/i,evaluatorDef],
    ['Custom qualification boundary',/QUALIFY_ONLY/is,evaluatorDef],
    ['Server-derived grant actor',/auth\.uid\(\)/i,grantDef],
    ['Admin policy authorization',/Admin access required/i,policyDef],
  ]){
    if(pattern.test(source)) pass(label,'present');
    else fail(label,'required contract missing');
  }

  if(!/sales_academy_test_bypasses/i.test(evaluatorDef)&&!/sales_academy_test_bypasses/i.test(grantDef))
    pass('Test-bypass isolation','production evaluator/grant authority does not read Academy test bypasses');
  else fail('Test-bypass isolation','Academy test bypass leaked into production Part 16 authority');

  for(const [label,pattern,expected] of [
    ['No evaluator quotation mutation',/\bupdate\s+public\.(quotations|quotation_items)/i,false],
    ['No evaluator grant mutation',/\binsert\s+into\s+public\.sales_certification_package_grants/i,false],
    ['No policy employment mutation',/\bupdate\s+public\.(user_profiles|applicants)/i,false],
    ['No commission mutation',/(insert|update|delete)\s+(into\s+|from\s+)?public\.[a-z_]*commission/i,false],
  ]){
    const source=label.startsWith('No policy')?policyDef:evaluatorDef+grantDef;
    const found=pattern.test(source);
    if(found===expected) pass(label,expected?'present':'absent as required');
    else fail(label,expected?'required behavior missing':'forbidden mutation found');
  }

  const triggerRows=(await client.query(`
    select t.tgname,c.relname table_name,pg_get_triggerdef(t.oid,true) definition
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and t.tgname in (
        'trg_crm_enforce_sales_certification_package_item',
        'trg_crm_enforce_sales_certification_before_send',
        'trg_crm_enforce_sales_certification_pipeline_stage',
        'trg_validate_sales_certification_deal_permission_policy'
      )
      and not t.tgisinternal
    order by t.tgname
  `)).rows;
  if(triggerRows.length===4)
    pass('Part 16 progressive server hooks','package/add-on item, pre-send, protected pipeline-stage, policy validator present exactly once');
  else fail('Part 16 progressive server hooks',JSON.stringify(triggerRows));

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
  if(Array.isArray(adminPayload?.sellers)&&adminPayload.sellers.some(row=>row.id===seller.id)
     &&Number(adminPayload?.policy?.schemaVersion)===2)
    pass('Admin certification visibility','active Seller + schema-v2 policy appear in canonical Admin payload');
  else fail('Admin certification visibility',JSON.stringify(adminPayload));

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
  else fail('Seller cross-user denial','cross-user certification access was not rejected');

  const firstProduct=(await client.query(`
    select id from public.sales_products
    where active=true and lower(coalesce(product_type,''))='package'
    order by sort_order,code limit 1
  `)).rows[0];
  await client.query('savepoint part16_self_grant');
  let selfGrantDenied=false;
  try{
    await client.query(`select public.admin_grant_sales_package_certification($1,$2,'SUPERVISED','VERIFIER','{}'::jsonb,'Verifier must be denied before any write.')`,[seller.id,firstProduct.id]);
  }catch(error){
    selfGrantDenied=/Admin access required/i.test(String(error?.message||error));
    await client.query('rollback to savepoint part16_self_grant');
  }
  if(selfGrantDenied) pass('Seller self-grant denied','Admin-only grant RPC rejects Seller before mutation');
  else fail('Seller self-grant denied','Seller grant RPC was not rejected by Admin authorization');

  await client.query('savepoint part16_policy_write');
  let sellerPolicyDenied=false;
  try{
    await client.query(`select public.admin_update_sales_certification_policy('{}','{}','[]',false,false,false,'Verifier must be denied before any policy write.')`);
  }catch(error){
    sellerPolicyDenied=/Admin access required/i.test(String(error?.message||error));
    await client.query('rollback to savepoint part16_policy_write');
  }
  if(sellerPolicyDenied) pass('Seller policy mutation denied','Admin-only policy RPC rejects Seller before mutation');
  else fail('Seller policy mutation denied','Seller policy RPC was not rejected by Admin authorization');

  const opportunity=(await client.query(`
    select id
    from public.crm_opportunities
    where salesperson_id=$1
    order by created_at desc limit 1
  `,[seller.id])).rows[0];
  if(opportunity?.id){
    const assessment=(await client.query(`
      select public.crm_get_sales_certification_deal_permission(NULL,NULL,$1,NULL) result
    `,[opportunity.id])).rows[0]?.result;
    if(policy.enforcementActive===false&&assessment?.status==='STAGED_NOT_ENFORCED'
       &&assessment?.allowed===true&&assessment?.canDraft===true&&assessment?.canSend===true
       &&assessment?.permissionMode==='STAGED_NOT_ENFORCED')
      pass('Staged deal-authority preservation','existing Seller authority unchanged until explicit product policy approval');
    else fail('Staged deal-authority preservation',JSON.stringify(assessment));
  }else{
    pass('Staged deal-authority live opportunity check','no Seller opportunity exists; self-scope permission snapshot still verified');
  }

  pass('Part 16 production inventory',`grant history ${state.grant_history_count}; active grants ${state.active_grant_count}; active Sales ${state.active_sales_count}; active packages ${state.active_package_count}; active add-ons ${state.active_addon_count}`);

  await client.query('rollback');
}catch(error){
  try{await client.query('rollback');}catch{}
  throw error;
}finally{
  await client.end();
}

console.log(`\nPart 16 release readiness: ${failures.length} failure(s).`);
if(failures.length>0) process.exitCode=1;

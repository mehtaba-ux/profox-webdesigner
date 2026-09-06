import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const workspace = readFileSync('src/components/admin/crm/CRMLeadWorkspace.tsx', 'utf8');
const stagePicker = readFileSync('src/components/admin/crm/CRMLeadStagePicker.tsx', 'utf8');
const crmService = readFileSync('src/lib/crmService.ts', 'utf8');
const migrationSql = readdirSync('supabase/migrations')
  .filter(name => name.endsWith('.sql'))
  .map(name => readFileSync(join('supabase/migrations', name), 'utf8'))
  .join('\n');

test('converted leads leave the active lead command center without deleting canonical history', () => {
  assert.match(workspace, /activeLeads=useMemo\(\(\)=>leads\.filter\(lead=>!lead\.convertedOpportunityId\)/);
  assert.match(workspace, /total:activeLeads\.length/);
  assert.match(workspace, /Converted leads live in Pipeline/);
  assert.match(workspace, /updated\?\.convertedOpportunityId\?null/);
  assert.doesNotMatch(workspace, /deleteLead|archiveLead/);
});

test('qualification uses the existing canonical conversion path and rolls back a failed transition', () => {
  assert.match(workspace, /crmService\.updateLead\(lead\.id,\{status:'Qualified'\}\)/);
  assert.match(workspace, /crmService\.convertToOpportunity\(lead\.id,\{name:lead\.title,expectedValue:lead\.estimatedValue\}\)/);
  assert.match(workspace, /conversionState==='linked'/);
  assert.match(workspace, /conversionState==='unlinked'.*crmService\.updateLead\(lead\.id,\{status:previous\}\)/s);
  assert.match(workspace, /Lead qualified and moved to Pipeline\./);
  assert.doesNotMatch(workspace, /crm_opportunities.*insert|\.from\('crm_opportunities'\)\.insert/s);
});

test('qualification UI clearly explains that Qualified transfers the lead into Pipeline', () => {
  assert.match(stagePicker, /Qualify & move to Pipeline/);
  assert.match(stagePicker, /one linked opportunity in Pipeline/);
  assert.match(stagePicker, /original lead history stays preserved/);
  assert.match(stagePicker, /value === 'Qualified'[\s\S]*setQualificationOpen\(true\)/);
});

test('database history protects one opportunity per canonical lead and conversion is RPC based', () => {
  assert.match(crmService, /supabase\.rpc\('convert_lead_to_opportunity'/);
  assert.match(crmService, /p_lead_id: leadId/);
  assert.match(migrationSql, /convert_lead_to_opportunity/i);
  assert.match(migrationSql, /unique[^\n]*lead_id|unique_lead_id/i);
});

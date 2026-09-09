import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  CERTAINTY_GUIDANCE,
  DISCOVERY_FRAMEWORK_GUIDANCE,
  DISCOVERY_STATE_GUIDANCE,
  LEAD_STATUS_GUIDANCE,
  OPPORTUNITY_STAGE_GUIDANCE,
  QUESTION_CLASS_GUIDANCE,
  getSellerGuidance,
} from '../../src/lib/crmSellerGuidance';
import { LEAD_STATUSES, OPPORTUNITY_STAGES } from '../../src/types';

const leadStagePicker = readFileSync('src/components/admin/crm/CRMLeadStagePicker.tsx', 'utf8');
const guidanceSource = readFileSync('src/lib/crmSellerGuidance.ts', 'utf8');
const docs = readFileSync('docs/crm-seller-guidance-tooltips-part-3-5.md', 'utf8');

const FRAMEWORKS = [
  'SITUATION',
  'PROBLEM',
  'IMPLICATION_IMPACT',
  'NEED_DESIRED_OUTCOME',
  'SCOPE',
  'COMMERCIAL',
  'DECISION',
  'TECHNICAL',
  'CUSTOM',
].sort();

test('Part 3.5 — all canonical Discovery frameworks have guidance', () => {
  assert.deepEqual(Object.keys(DISCOVERY_FRAMEWORK_GUIDANCE).sort(), FRAMEWORKS);
  for (const entry of Object.values(DISCOVERY_FRAMEWORK_GUIDANCE)) {
    assert.ok(entry.key.startsWith('framework.'));
    assert.ok(entry.shortHelp.trim().length >= 50);
  }
});

test('Part 3.5 — all canonical Lead statuses have guidance and picker integration', () => {
  assert.deepEqual(Object.keys(LEAD_STATUS_GUIDANCE).sort(), [...LEAD_STATUSES].sort());
  assert.match(leadStagePicker, /getLeadStatusGuidance/);
  assert.match(leadStagePicker, /SellerGuidanceHelp/);
  assert.match(leadStagePicker, /action\.qualify_lead/);
});

test('Part 3.5 — all canonical Pipeline stages have guidance', () => {
  assert.deepEqual(Object.keys(OPPORTUNITY_STAGE_GUIDANCE).sort(), [...OPPORTUNITY_STAGES].sort());
  for (const stage of OPPORTUNITY_STAGES) {
    assert.ok(OPPORTUNITY_STAGE_GUIDANCE[stage].shortHelp.length >= 40, stage);
  }
});

test('Part 3.5 — priority, Discovery-state, certainty and Requirement-state vocabularies are complete', () => {
  assert.equal(Object.keys(QUESTION_CLASS_GUIDANCE).length, 4);
  assert.equal(Object.keys(DISCOVERY_STATE_GUIDANCE).length, 5);
  assert.equal(Object.keys(CERTAINTY_GUIDANCE).length, 6);
  assert.ok(getSellerGuidance('requirement.record_state.ACTIVE'));
  assert.ok(getSellerGuidance('requirement.record_state.ARCHIVED'));
});

test('Part 3.5 — non-obvious current Seller actions have canonical stable guidance keys', () => {
  const requiredKeys = [
    'action.add_custom_question',
    'action.save_response',
    'action.edit_response',
    'action.mark_follow_up',
    'action.link_requirement',
    'action.open_requirements',
    'action.open_discovery',
    'action.change_discovery_state',
    'action.add_client_voice',
    'action.schedule_meeting',
    'action.create_follow_up',
    'action.qualify_lead',
    'action.add_custom_requirement',
    'action.save_requirement',
    'action.archive_custom_requirement',
  ];
  for (const key of requiredKeys) assert.ok(getSellerGuidance(key), key);
});

test('Part 3.5 — guidance registry remains read-only and Part 4-free', () => {
  assert.doesNotMatch(guidanceSource, /supabase|\.insert\(|\.upsert\(|crm_meeting_preparations|Mark Prep Ready|Meeting Objective|Intended Advance/i);
  assert.match(docs, /FUTURE UI — NOT YET APPLICABLE/);
  assert.match(docs, /No Part 3\.5 database migration is required/);
});

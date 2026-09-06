import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260906113000_crm_sales_discovery_foundation_part_1.sql', 'utf8');
const hardening = readFileSync('supabase/migrations/20260906113500_crm_sales_discovery_foundation_hardening.sql', 'utf8');
const service = readFileSync('src/lib/crmSalesDiscoveryService.ts', 'utf8');
const drawer = readFileSync('src/components/admin/crm/CRMLeadDrawerBase.tsx', 'utf8');

const certaintyStates = [
  'CLIENT_CONFIRMED',
  'SELLER_OBSERVATION',
  'SELLER_HYPOTHESIS',
  'AWAITING_CLIENT',
  'NEEDS_SPECIALIST_VALIDATION',
  'NOT_APPLICABLE',
];

const questionStates = [
  'NOT_ASKED',
  'ASKED',
  'ANSWERED',
  'NEEDS_FOLLOW_UP',
  'NOT_APPLICABLE',
];

test('Part 1 creates only connected discovery structures and reuses canonical CRM entities', () => {
  for (const table of [
    'crm_requirements',
    'crm_discovery_questions',
    'crm_discovery_responses',
    'crm_client_voice',
    'crm_meeting_preparations',
    'crm_meeting_discovery_questions',
  ]) assert.match(migration, new RegExp(`create table public\\.${table}`));

  assert.doesNotMatch(migration, /create table public\.crm_leads/i);
  assert.doesNotMatch(migration, /create table public\.crm_opportunities/i);
  assert.doesNotMatch(migration, /create table public\.sales_meetings/i);
  assert.doesNotMatch(migration, /create table public\.crm_lead_events/i);
  assert.match(migration, /references public\.crm_leads\(id\)/);
  assert.match(migration, /references public\.sales_meetings\(id\)/);
  assert.match(migration, /from public\.crm_opportunities o\s+where o\.id = p_opportunity_id/);
  assert.match(migration, /where o\.lead_id = v_lead_id/);
});

test('certainty, provenance, standard/custom requirements and discovery question lifecycle are explicit', () => {
  for (const state of certaintyStates) {
    assert.match(migration, new RegExp(state));
    assert.match(service, new RegExp(state));
  }
  for (const state of questionStates) {
    assert.match(migration, new RegExp(state));
    assert.match(service, new RegExp(state));
  }

  assert.match(migration, /is_custom boolean not null default false/);
  assert.match(migration, /source_type text/);
  assert.match(migration, /source_record_id text/);
  assert.match(migration, /source_recorded_at timestamptz/);
  assert.match(migration, /question_state text not null default 'NOT_ASKED'/);
  assert.match(migration, /follow_up_required boolean not null default false/);
  assert.match(service, /saveRequirement/);
  assert.match(service, /saveQuestion/);
  assert.match(service, /saveResponse/);
});

test('Client Voice keeps customer language separate from seller interpretation and linked requirements', () => {
  assert.match(migration, /customer_statement text not null/);
  assert.match(migration, /seller_interpretation text/);
  assert.match(migration, /linked_requirement_id uuid references public\.crm_requirements/);
  assert.match(service, /customerStatement/);
  assert.match(service, /sellerInterpretation/);
  assert.match(service, /linkedRequirementId/);
});

test('Meeting Prep remains a protected child of canonical sales_meetings', () => {
  assert.match(migration, /meeting_id uuid primary key references public\.sales_meetings\(id\)/);
  assert.match(migration, /meeting_objective text/);
  assert.match(migration, /intended_advance text/);
  assert.match(migration, /hypotheses jsonb/);
  assert.match(migration, /preparation_state text/);
  assert.match(migration, /prepared_by uuid/);
  assert.match(migration, /prepared_at timestamptz/);
  assert.match(migration, /seller_notes text/);
  assert.match(migration, /crm_set_meeting_discovery_questions/);
  assert.doesNotMatch(migration, /alter table public\.sales_meetings add column/i);
});

test('RLS reuses current lead authorization, denies anon, and audit reuses crm_lead_events', () => {
  for (const table of [
    'crm_requirements',
    'crm_discovery_questions',
    'crm_discovery_responses',
    'crm_client_voice',
    'crm_meeting_preparations',
    'crm_meeting_discovery_questions',
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon`));
  }
  assert.match(migration, /public\.crm_can_access_lead/);
  assert.match(migration, /insert into public\.crm_lead_events/);
  assert.match(migration, /security definer/);
  assert.match(hardening, /crm_sales_discovery_stamp_insert_actor/);
  assert.match(hardening, /crm_sales_discovery_protect_identity/);
  assert.match(hardening, /crm_meeting_preparation_stamp_ready/);
});

test('frontend foundation uses the existing Supabase client and one coherent workspace read model', () => {
  assert.match(service, /import \{ supabase \} from '\.\/supabase'/);
  assert.doesNotMatch(service, /createClient/);
  assert.match(service, /crm_get_sales_discovery_workspace/);
  assert.match(service, /crm_set_meeting_discovery_questions/);
  assert.match(migration, /crm_get_sales_discovery_workspace/);
});

test('Part 1 does not add Lead Drawer tabs or change downstream sales gates', () => {
  assert.match(drawer, /export type LeadDrawerTab = 'overview' \| 'timeline' \| 'communication' \| 'activities'/);
  assert.doesNotMatch(drawer, /label: 'Requirements'/);
  assert.doesNotMatch(drawer, /label: 'Probing & Discovery'/);
  assert.doesNotMatch(drawer, /label: 'Meeting Prep'/);
  assert.doesNotMatch(migration, /create or replace function public\.convert_lead_to_opportunity/i);
  assert.doesNotMatch(migration, /create or replace function public\.crm_transition_opportunity/i);
  assert.doesNotMatch(migration, /alter table public\.quotations/i);
});

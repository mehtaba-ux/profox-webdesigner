import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync('src/components/client/ClientDashboard.tsx', 'utf8');
const entry = readFileSync('src/components/client/ClientPortalEntry.tsx', 'utf8');

test('Client Portal command center uses the canonical ProFox systems instead of parallel data stores', () => {
  assert.match(dashboard, /notificationCenterService/);
  assert.match(dashboard, /internalChatService/);
  assert.match(dashboard, /profileService/);
  assert.match(dashboard, /projectService/);
  assert.match(dashboard, /<ClientProjectChat/);
  assert.match(dashboard, /<ClientRelationshipHistory/);
  assert.match(dashboard, /<ClientDevelopmentHandover/);
  assert.doesNotMatch(dashboard, /\.from\(['"]client_portal_/);
});

test('Client Portal is organized as a branded sidebar command center', () => {
  assert.match(dashboard, /<Logo light/);
  assert.match(dashboard, /Project Command Center/);
  assert.match(dashboard, /Overview/);
  assert.match(dashboard, /Project Journey/);
  assert.match(dashboard, /Deliverables/);
  assert.match(dashboard, /Payments/);
  assert.match(dashboard, /Relationship History/);
  assert.match(dashboard, /Notifications/);
  assert.match(dashboard, /My Profile/);
});

test('Client Portal presents real project stages and one clear next milestone', () => {
  assert.match(dashboard, /PROJECT_STAGES\.indexOf/);
  assert.match(dashboard, /PROJECT_STAGES\[stageIndex \+ 1\]/);
  assert.match(dashboard, /Next milestone/);
  assert.match(dashboard, /Needs Your Attention/);
});

test('Client Portal profile requires an image or company logo and saves through the canonical profile service', () => {
  assert.match(dashboard, /Profile image or company logo/);
  assert.match(dashboard, /Please upload a profile image or company logo before saving/);
  assert.match(dashboard, /<ProfileImageUploader/);
  assert.match(dashboard, /profileService\.updateMyProfile/);
});

test('Client Portal exposes canonical chat as a floating bottom-right experience', () => {
  assert.match(dashboard, /fixed bottom-5 right-5/);
  assert.match(dashboard, /Open project chat/);
  assert.match(dashboard, /internalChatService\.listThreads/);
  assert.match(dashboard, /<ClientProjectChat \/>/);
});

test('secure invitation and activation flow remains owned by ClientPortalEntry', () => {
  assert.match(entry, /public_client_portal_invite_status/);
  assert.match(entry, /customer_portal_claim_identity/);
  assert.match(entry, /client-portal-verification/);
  assert.match(entry, /profile\?\.role === 'customer' && profile\.status === 'active'/);
  assert.match(entry, /<ClientDashboard \/>/);
});

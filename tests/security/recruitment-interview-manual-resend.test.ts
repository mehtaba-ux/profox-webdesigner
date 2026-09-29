import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260929141000_recruitment_interview_manual_resend.sql','utf8');
const service = fs.readFileSync('src/lib/recruitmentInterviewService.ts','utf8');
const panel = fs.readFileSync('src/components/admin/RecruitmentWorkflowPanel.tsx','utf8');

test('manual interview resend reuses the existing interview and meeting', () => {
  assert.match(migration, /admin_resend_recruitment_interview_invitation/);
  assert.match(migration, /v_ri\.meeting_id/);
  assert.match(migration, /template_key='recruitment_interview_scheduled'/);
  assert.match(migration, /'interviewId',v_ri\.id/);
  assert.match(migration, /interval '45 seconds'/);
  assert.doesNotMatch(migration, /insert into public\.sales_meetings/i);
  assert.doesNotMatch(migration, /insert into public\.recruitment_interviews/i);
});

test('recruitment card exposes resend control and delivery status', () => {
  assert.match(service, /getDeliveryStatus/);
  assert.match(service, /resendInvitation/);
  assert.match(panel, /Resend Interview Email/);
  assert.match(panel, /Candidate invitation/);
  assert.match(panel, /does not create another meeting/);
});

test('recruitment interview card no longer advertises Google Meet', () => {
  assert.doesNotMatch(panel, /Google Meet/);
  assert.match(panel, /Zoho Meeting/);
});

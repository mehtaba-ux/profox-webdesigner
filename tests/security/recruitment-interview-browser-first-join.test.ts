import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260929133000_recruitment_interview_browser_first_join.sql','utf8');
const zohoWorker = fs.readFileSync('supabase/functions/process-zoho-calendar-sync/index.ts','utf8');
const notificationWorker = fs.readFileSync('supabase/functions/process-notification-outbox/index.ts','utf8');
const app = fs.readFileSync('src/App.tsx','utf8');
const page = fs.readFileSync('src/pages/RecruitmentInterviewJoinPage.tsx','utf8');

test('candidate interview email uses secure ProFox join page instead of raw provider URL', () => {
  assert.match(migration, /recruitment_interview_join_tokens/);
  assert.match(migration, /service_prepare_recruitment_interview_join_delivery/);
  assert.match(migration, /public_open_recruitment_interview_join/);
  assert.match(migration, /\{\{interviewJoinUrl\}\}/);
  assert.doesNotMatch(migration, /Meeting link: \{\{meetingUrl\}\}/);
  assert.match(notificationWorker, /enrichSecureRecruitmentInterviewPayload/);
});

test('future Zoho meetings do not send a second provider-branded candidate invitation', () => {
  assert.doesNotMatch(zohoWorker, /session\.participants\s*=/);
  assert.match(zohoWorker, /notify_attendee:\s*0/);
  assert.match(zohoWorker, /Candidate-facing invitations are sent only by ProFox/);
});

test('public recruitment interview route forwards to the validated Zoho participant link', () => {
  assert.match(app, /RecruitmentInterviewJoinPage/);
  assert.match(app, /recruitment\/interview\/:token/);
  assert.match(page, /window\.location\.replace\(interview\.joinUrl\)/);
  assert.match(page, /Your ProFox interview is ready/);
  assert.match(page, /Zoho may hand the meeting off to its mobile app/);
});

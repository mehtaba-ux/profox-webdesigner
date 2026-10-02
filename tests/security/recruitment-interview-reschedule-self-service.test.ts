import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260930161358_recruitment_interview_reschedule_self_service.sql','utf8');
const expiredZohoMigration = fs.readFileSync('supabase/migrations/20261001073000_rotate_expired_zoho_reschedules.sql','utf8');
const staffBrowserJoinMigration = fs.readFileSync('supabase/migrations/20261002031341_recruitment_staff_browser_join.sql','utf8');
const interviewerHostMigration = fs.readFileSync('supabase/migrations/20261002033022_recruitment_interviewer_host_launch.sql','utf8');
const zohoWorker = fs.readFileSync('supabase/functions/process-zoho-calendar-sync/index.ts','utf8');
const zohoOauth = fs.readFileSync('supabase/functions/zoho-calendar-oauth/index.ts','utf8');
const sdkFoundation = fs.readFileSync('supabase/migrations/20261002034955_recruitment_zoho_sdk_host_launch_foundation.sql','utf8');
const joinService = fs.readFileSync('src/lib/recruitmentInterviewJoinService.ts','utf8');
const joinPage = fs.readFileSync('src/pages/RecruitmentInterviewJoinPage.tsx','utf8');
const workflowPanel = fs.readFileSync('src/components/admin/RecruitmentWorkflowPanel.tsx','utf8');
const bookingDialog = fs.readFileSync('src/components/admin/RecruitmentInterviewBookingDialog.tsx','utf8');

test('candidate reschedule is one-time and capped at 24 hours', () => {
  assert.match(migration, /recruitment_interview_candidate_reschedules/);
  assert.match(migration, /interview_id uuid not null unique/);
  assert.match(migration, /new_start_at > original_start_at/);
  assert.match(migration, /original_start_at \+ interval '1 day'/);
  assert.match(migration, /public_get_recruitment_interview_reschedule_slots/);
  assert.match(migration, /public_reschedule_recruitment_interview/);
  assert.match(migration, /already used the one-time interview reschedule/);
});

test('candidate reschedule reuses the existing meeting and revokes old secure links', () => {
  assert.match(migration, /update public\.recruitment_interview_join_tokens\s+set revoked_at=now\(\)/);
  assert.match(migration, /update public\.sales_meetings\s+set start_at=v_slot\.start_at/);
  assert.match(migration, /existing Zoho meeting and calendar event will be updated/);
  assert.match(migration, /v_schedule_key:=to_char/);
});

test('ended scheduled interview can be rescheduled by staff without a manual status change', () => {
  assert.match(migration, /m\.status='Scheduled' and m\.end_at<=now\(\)/);
  assert.match(workflowPanel, /Reschedule Interview/);
  assert.match(bookingDialog, /Reschedule Recruitment Interview/);
  assert.match(bookingDialog, /Confirm Reschedule/);
});

test('candidate secure page exposes available slots and one-time reschedule action', () => {
  assert.match(joinService, /listRescheduleSlots/);
  assert.match(joinService, /public_get_recruitment_interview_reschedule_slots/);
  assert.match(joinService, /public_reschedule_recruitment_interview/);
  assert.match(joinPage, /Reschedule Interview/);
  assert.match(joinPage, /24 hours later/);
  assert.match(joinPage, /does not create a duplicate meeting/);
});


test('expired Zoho interview reschedules rotate stale provider mappings without duplicating the ProFox meeting', () => {
  assert.match(expiredZohoMigration, /rotate_expired_zoho_provider_links_before_reschedule/);
  assert.match(expiredZohoMigration, /old\.end_at > now\(\)/);
  assert.match(expiredZohoMigration, /delete from public\.zoho_calendar_event_links/);
  assert.match(expiredZohoMigration, /delete from public\.meeting_provider_private_links/);
  assert.match(expiredZohoMigration, /queue_zoho_calendar_sync/);
  assert.match(expiredZohoMigration, /meeting_provider_rotations/);
});

test('admin or assigned interviewer launches recruitment through a signed stateless Zoho host URL', () => {
  assert.match(staffBrowserJoinMigration, /mpl\.join_url/);
  assert.match(sdkFoundation, /public\.is_admin\(\) or ri\.interviewer_id=auth\.uid\(\)/);
  assert.match(sdkFoundation, /statelessStart/);
  assert.match(sdkFoundation, /signature=/);
  assert.match(sdkFoundation, /meetingLaunchRole/);
  assert.match(sdkFoundation, /hostLaunchReady/);
  assert.match(workflowPanel, /Launch Interview as Host/);
  assert.match(workflowPanel, /Host launch is not ready yet/);
});

test('Zoho recruitment sync creates SDK sessions and requires SDK OAuth scopes', () => {
  assert.match(zohoWorker, /ZohoMeeting\.sdk\.READ/);
  assert.match(zohoWorker, /ZohoMeeting\.sdk\.CREATE/);
  assert.match(zohoWorker, /\/sdk\/session/);
  assert.match(zohoWorker, /statelessStart/);
  assert.match(zohoWorker, /createRecruitmentSdkMeeting/);
  assert.match(zohoOauth, /ZohoMeeting\.sdk\.READ/);
  assert.match(zohoOauth, /ZohoMeeting\.sdk\.CREATE/);
  assert.match(zohoOauth, /service_queue_upcoming_recruitment_meetings_for_zoho_sdk/);
  assert.match(zohoWorker, /findCalendarEventByMarker/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260929113000_zoho_calendar_universal_booking_cutover.sql','utf8');
const recruitmentService = fs.readFileSync('src/lib/recruitmentInterviewService.ts','utf8');
const recruitmentDialog = fs.readFileSync('src/components/admin/RecruitmentInterviewBookingDialog.tsx','utf8');
const crmModal = fs.readFileSync('src/components/admin/crm/CRMLeadMeetingModal.tsx','utf8');
const meetingsWorkspace = fs.readFileSync('src/components/admin/MeetingsWorkspace.tsx','utf8');

test('Zoho is the canonical provider for new booking flows', () => {
  assert.match(migration, /'defaultCalendarProvider', 'zoho'/);
  assert.match(migration, /'defaultMeetingProvider', 'zoho_meeting'/);
  assert.match(migration, /service_calendar_provider_status/);
  assert.match(migration, /service_has_effective_calendar_conflict/);
  assert.match(migration, /provider='Zoho Calendar'/);
});

test('existing external provider links remain provider-locked', () => {
  assert.match(migration, /google_calendar_event_links where meeting_id=p_meeting_id/);
  assert.match(migration, /zoho_calendar_event_links where meeting_id=p_meeting_id/);
  assert.match(migration, /Duplicate external calendar events are not allowed/);
});

test('recruitment booking uses Zoho sync and Zoho meeting language', () => {
  assert.match(recruitmentService, /process-zoho-calendar-sync/);
  assert.doesNotMatch(recruitmentService, /process-google-calendar-sync/);
  assert.match(recruitmentDialog, /Zoho Calendar event/);
  assert.match(recruitmentDialog, /Zoho Meeting link/);
});

test('CRM and direct meeting scheduling no longer ask for manual or Google links', () => {
  assert.doesNotMatch(crmModal, /Google Meet/);
  assert.doesNotMatch(crmModal, /meetingUrl\.trim\(\)/);
  assert.match(crmModal, /Zoho Calendar \+ Zoho Meeting/);
  assert.doesNotMatch(meetingsWorkspace, /Manual Meeting Link/);
  assert.match(meetingsWorkspace, /Zoho Calendar \+ Zoho Meeting/);
});

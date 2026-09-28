import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260928121000_sales_video_review_retry_workflow.sql','utf8');
const taskService = fs.readFileSync('src/lib/recruitmentTaskService.ts','utf8');
const workflow = fs.readFileSync('src/components/admin/RecruitmentWorkflowPanel.tsx','utf8');
const page = fs.readFileSync('src/pages/RecruitmentVideoRetryPage.tsx','utf8');
const app = fs.readFileSync('src/App.tsx','utf8');

test('Video Review retry uses canonical assessment/task/outbox flow', () => {
  assert.match(migration, /sales_video_retry_v1/);
  assert.match(migration, /recruitment_video_retry_invitation/);
  assert.match(migration, /recruitment_video_retry_admin_submitted/);
  assert.match(migration, /email_delivery_events/);
  assert.match(migration, /attempt_no=v_task\.attempt_no-1/);
  assert.doesNotMatch(migration, /update public\.applicants set video_url/i);
});

test('candidate retry page and route are present', () => {
  assert.match(app, /RecruitmentVideoRetryPage/);
  assert.match(app, /recruitment\/video-retry\/:token/);
  assert.match(page, /Your first video and assessment stay on record/);
  assert.match(page, /Submit Retry Video/);
  assert.match(taskService, /sales_video_retry_v1/);
});

test('admin scoring stays locked until the retry is submitted', () => {
  assert.match(workflow, /candidate must submit the requested interview-video retry/i);
  assert.match(workflow, /defaultEvidenceUrl/);
  assert.match(workflow, /Open Submitted Retry Video/);
});

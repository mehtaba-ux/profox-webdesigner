import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260929150000_sales_interview_preparation_email.sql','utf8');

test('Sales interview confirmation explains preparation without requiring self-sourced leads', () => {
  assert.match(migration, /recruitment_sales_interview_scheduled/);
  assert.match(migration, /ProFox provides sales representatives with leads and opportunities inside the CRM/);
  assert.match(migration, /Finding your own leads is optional/);
  assert.match(migration, /You are not required to find your own leads/);
  assert.match(migration, /This is optional, not a requirement/);
  assert.match(migration, /Lead Assigned -> Research -> Outreach -> Qualification -> Discovery/);
  assert.match(migration, /Please do not prepare a word-for-word script/);
  assert.match(migration, /\{\{interviewJoinUrl\}\}/);
});

test('Only canonical Sales candidates receive the Sales preparation template', () => {
  assert.match(migration, /career_job_system_role\(v_app\.career_job_id\)='sales'/);
  assert.match(migration, /then 'recruitment_sales_interview_scheduled'/);
  assert.match(migration, /else 'recruitment_interview_scheduled'/);
});

test('manual resend and delivery history recognize both generic and Sales templates', () => {
  assert.match(migration, /admin_resend_recruitment_interview_invitation/);
  assert.match(migration, /admin_get_recruitment_interview_delivery_status/);
  assert.match(migration, /template_key in\('recruitment_interview_scheduled','recruitment_sales_interview_scheduled'\)/);
});

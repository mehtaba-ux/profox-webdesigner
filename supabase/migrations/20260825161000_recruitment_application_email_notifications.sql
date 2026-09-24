-- Branded Sales application confirmation + internal Admin notification.
-- Keeps the canonical recruitment submission/stage workflow unchanged.

create or replace function public.recruitment_notification_payload(p_applicant public.applicants)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
select jsonb_build_object(
  'applicantId', p_applicant.id,
  'fullName', p_applicant.full_name,
  'candidateName', p_applicant.full_name,
  'email', p_applicant.email,
  'candidateEmail', p_applicant.email,
  'phone', coalesce(p_applicant.phone, ''),
  'country', coalesce(p_applicant.country, ''),
  'timezone', coalesce(p_applicant.timezone, ''),
  'roleTitle', coalesce((select j.title from public.career_jobs j where j.id = p_applicant.career_job_id), p_applicant.position, 'Independent Commission-Based Sales Representative'),
  'stage', p_applicant.stage,
  'applicationReference', coalesce(p_applicant.application_reference, ''),
  'reference', coalesce(p_applicant.application_reference, ''),
  'submittedAt', coalesce(to_char(p_applicant.application_submitted_at at time zone 'UTC', 'Mon DD, YYYY HH24:MI "UTC"'), to_char(p_applicant.created_at at time zone 'UTC', 'Mon DD, YYYY HH24:MI "UTC"')),
  'salesExperienceMonths', coalesce(p_applicant.sales_experience_months, 0),
  'preferredWorkWindow', coalesce(p_applicant.preferred_work_window, 'Not specified'),
  'videoProof', case
    when coalesce(trim(p_applicant.video_url), '') <> '' then p_applicant.video_url
    when coalesce(trim(p_applicant.video_storage_path), '') <> '' then 'Secure introduction video received'
    else 'No introduction video proof recorded'
  end,
  'careerJobSlug', coalesce((select j.slug from public.career_jobs j where j.id = p_applicant.career_job_id), ''),
  'applicationUrl', 'https://www.profoxwebdesigner.com/careers',
  'adminReviewUrl', 'https://www.profoxwebdesigner.com/admin/app/recruitment?tab=recruitment',
  'reviewWindow', 'Up to 7 days',
  'supportEmail', 'admin@profoxwebdesigner.com',
  'privacyUrl', 'https://www.profoxwebdesigner.com/privacy-policy'
);
$function$;

insert into public.notification_templates (
  template_key, name, subject_template, body_template, html_template, active, description, updated_at
)
values (
  'recruitment_application_received',
  'Recruitment - application received',
  'We''ve Received Your ProFox Application',
  $candidate_body$Hi {{fullName}},

Thank you for applying for the {{roleTitle}} opportunity at ProFox.

Your application has been successfully received and is now with our team for review.

Application reference: {{applicationReference}}
Please keep this reference in case you need to contact us about your application.

WHAT HAPPENS NEXT
Our team will review your application, including your sales experience, communication background, availability, prospecting experience and introduction video. Please allow up to 7 days for the initial review.

If your application moves forward, we will send the next step to the email address you provided: {{email}}
Please also check your Spam, Junk or Promotions folder so you do not miss an important update from ProFox.

While your application is under review, there is no need to submit another application or contact multiple team members. If we need any additional information, our team will contact you directly.

Application status: Received - Under Review
Expected initial review: Within approximately 7 days

Thank you for your interest in working with ProFox.

ProFox Recruitment Team
ProFox Web Designer

This email confirms receipt of your application. It does not constitute an employment offer, contractor engagement, or guarantee of selection. Any next step or offer will be communicated separately by an authorized ProFox representative.$candidate_body$,
  $candidate_html$<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your application is now with our team for review. We will contact you by email within approximately 7 days.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f5fb;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr><td style="height:5px;background:#000080;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:32px 32px 12px 32px;">
            <div style="font-size:18px;line-height:24px;font-weight:800;color:#000080;letter-spacing:-0.02em;">ProFox</div>
            <div style="margin-top:22px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#5c5cff;">Application Received</div>
            <h1 style="margin:8px 0 12px 0;font-size:28px;line-height:36px;color:#071126;font-weight:700;letter-spacing:-0.03em;">Thank you for applying to ProFox.</h1>
            <p style="margin:0;font-size:15px;line-height:24px;color:#475569;">Hi {{fullName}}, your application for the <strong style="color:#0f172a;">{{roleTitle}}</strong> opportunity has been successfully received and is now with our team for review.</p>
          </td></tr>
          <tr><td style="padding:16px 32px 0 32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#fbfcff;border:1px solid #e2e8f0;border-radius:12px;"><tr><td style="padding:18px 20px;">
              <div style="font-size:11px;line-height:16px;font-weight:700;text-transform:uppercase;letter-spacing:0.10em;color:#64748b;">Application reference</div>
              <div style="margin-top:5px;font-size:19px;line-height:26px;font-weight:700;color:#000080;">{{applicationReference}}</div>
              <div style="margin-top:5px;font-size:12px;line-height:19px;color:#64748b;">Keep this reference for any future application-related communication.</div>
            </td></tr></table>
          </td></tr>
          <tr><td style="padding:28px 32px 0 32px;">
            <h2 style="margin:0 0 10px 0;font-size:18px;line-height:26px;color:#071126;font-weight:700;">What happens next?</h2>
            <p style="margin:0;font-size:14px;line-height:23px;color:#475569;">Our team will review your sales experience, communication background, availability, prospecting experience and introduction video. Please allow <strong style="color:#0f172a;">up to 7 days</strong> for the initial review.</p>
            <p style="margin:12px 0 0 0;font-size:14px;line-height:23px;color:#475569;">If your application moves forward, we will send the next step to the email address you provided.</p>
          </td></tr>
          <tr><td style="padding:24px 32px 0 32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;width:38%;">Application status</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">Received - Under Review</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">Initial review</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">Within approximately 7 days</td></tr>
              <tr><td style="padding:10px 0;font-size:13px;color:#64748b;">Updates sent to</td><td style="padding:10px 0;font-size:13px;font-weight:700;color:#0f172a;">{{email}}</td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:24px 32px 0 32px;"><div style="padding:16px 18px;background:#f4f5fb;border-left:4px solid #000080;border-radius:8px;font-size:13px;line-height:21px;color:#475569;">Please check your <strong style="color:#0f172a;">Spam, Junk or Promotions folder</strong> as well as your inbox so you do not miss an important ProFox update.</div></td></tr>
          <tr><td style="padding:24px 32px 30px 32px;">
            <p style="margin:0;font-size:13px;line-height:21px;color:#475569;">While your application is under review, there is no need to submit another application or contact multiple team members. If we need anything else, we will contact you directly.</p>
            <p style="margin:22px 0 0 0;font-size:14px;line-height:22px;color:#0f172a;font-weight:700;">ProFox Recruitment Team</p>
            <p style="margin:2px 0 0 0;font-size:13px;line-height:20px;color:#64748b;">ProFox Web Designer</p>
          </td></tr>
          <tr><td style="padding:18px 32px;background:#071126;font-size:11px;line-height:18px;color:#cbd5e1;">This email confirms receipt of your application. It does not constitute an employment offer, contractor engagement, or guarantee of selection. Any next step or offer will be communicated separately by an authorized ProFox representative.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>$candidate_html$,
  true,
  'Branded confirmation sent after a Sales application is successfully received. Explains the review window, email follow-up channel and next steps.',
  now()
)
on conflict (template_key) do update set
  name = excluded.name,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  html_template = excluded.html_template,
  active = true,
  description = excluded.description,
  updated_at = now();

insert into public.notification_templates (
  template_key, name, subject_template, body_template, html_template, active, description, updated_at
)
values (
  'recruitment_admin_application_received',
  'Recruitment - new Sales application - Admin',
  'New Sales application: {{fullName}} | {{applicationReference}}',
  $admin_body$New Sales application received

A new application is ready for review.

Candidate: {{fullName}}
Email: {{email}}
Country: {{country}}
Time zone: {{timezone}}
Role: {{roleTitle}}
Reference: {{applicationReference}}
Submitted: {{submittedAt}}
Sales experience: {{salesExperienceMonths}} months
Preferred working window: {{preferredWorkWindow}}
Introduction video: {{videoProof}}

Review application: {{adminReviewUrl}}

This is an internal ProFox recruitment notification. Continue all review and stage actions inside Recruitment.$admin_body$,
  $admin_html$<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">A new Independent Sales Representative application is ready for review.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f5fb;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr><td style="height:5px;background:#000080;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:30px 32px 16px 32px;">
            <div style="font-size:18px;line-height:24px;font-weight:800;color:#000080;">ProFox</div>
            <div style="margin-top:20px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#5c5cff;">Recruitment Notification</div>
            <h1 style="margin:8px 0 10px 0;font-size:26px;line-height:34px;color:#071126;font-weight:700;letter-spacing:-0.03em;">New Sales application received</h1>
            <p style="margin:0;font-size:14px;line-height:23px;color:#475569;">{{fullName}} has submitted a new application for <strong style="color:#0f172a;">{{roleTitle}}</strong>. It is ready for review in ProFox Recruitment.</p>
          </td></tr>
          <tr><td style="padding:12px 32px 0 32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;width:39%;">Candidate</td><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">{{fullName}}</td></tr>
              <tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">Email</td><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">{{email}}</td></tr>
              <tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">Country / time zone</td><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">{{country}} | {{timezone}}</td></tr>
              <tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">Reference</td><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#000080;">{{applicationReference}}</td></tr>
              <tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">Submitted</td><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">{{submittedAt}}</td></tr>
              <tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">Sales experience</td><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">{{salesExperienceMonths}} months</td></tr>
              <tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">Working window</td><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">{{preferredWorkWindow}}</td></tr>
              <tr><td style="padding:9px 0;font-size:13px;color:#64748b;">Video proof</td><td style="padding:9px 0;font-size:13px;font-weight:700;color:#0f172a;word-break:break-word;">{{videoProof}}</td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:26px 32px 30px 32px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#000080" style="border-radius:8px;"><a href="{{adminReviewUrl}}" style="display:inline-block;padding:13px 20px;font-size:13px;line-height:18px;font-weight:700;color:#ffffff;text-decoration:none;">Review Application</a></td></tr></table>
            <p style="margin:18px 0 0 0;font-size:12px;line-height:20px;color:#64748b;">Continue all screening, notes and stage actions inside ProFox Recruitment so the candidate record remains the single source of truth.</p>
          </td></tr>
          <tr><td style="padding:16px 32px;background:#071126;font-size:11px;line-height:18px;color:#cbd5e1;">Internal ProFox recruitment notification. Do not forward candidate data outside the authorized recruitment team.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>$admin_html$,
  true,
  'Internal email sent to the primary active ProFox Admin when a new Sales application is submitted.',
  now()
)
on conflict (template_key) do update set
  name = excluded.name,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  html_template = excluded.html_template,
  active = true,
  description = excluded.description,
  updated_at = now();

create or replace function public.queue_sales_application_admin_email()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_application_type text;
  v_role text;
begin
  select application_type into v_application_type
  from public.career_jobs
  where id = new.career_job_id;

  v_role := coalesce(
    public.career_job_system_role(new.career_job_id),
    case when v_application_type = 'sales_representative' then 'sales' else 'pending' end
  );

  if v_role = 'sales' then
    perform public.queue_recruitment_admin_email(
      new,
      'recruitment_admin_application_received',
      'admin-application-received',
      now()
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_queue_sales_application_admin_email on public.applicants;
create trigger trg_queue_sales_application_admin_email
after insert on public.applicants
for each row
execute function public.queue_sales_application_admin_email();
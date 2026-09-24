insert into public.notification_templates(template_key,name,subject_template,body_template,html_template,active,description)
select
  'recruitment_assessment_guide_access','Sales Assessment Guide Access','Your ProFox Sales Assessment Guide is available',
  $body$Hi {{fullName}},

Your secure ProFox Sales Assessment Guide is now available.

Open your guide here:
{{taskUrl}}

The guide shows the complete three-step assessment journey, your current assessment phase, role context, assessment rules and the boundary between pre-selection assessment access and the full ProFox Sales Academy.

Your assessment sequence is:
1. Sales Practical Interview
2. Lead Research Test - 5 researched businesses
3. CRM Assessment

Please continue from your current recruitment stage and follow the most recent ProFox email for the exact task, interview or submission instructions that apply to you.

Important:
- Do not create another ProFox account.
- This guide does not grant live CRM, customer or active Sales access.
- Full Sales Academy account access is issued only after selection and verification of the signed Sales Partner Agreement.

Application reference: {{applicationReference}}
Support: {{supportEmail}}

ProFox Recruitment Team
ProFox Web Designer
https://www.profoxwebdesigner.com/$body$,
  $html$<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="640" style="width:100%;max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="height:4px;background:#000080"></td></tr><tr><td style="padding:28px"><div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#000080">PROFOX SALES ASSESSMENT</div><h1 style="font-size:24px;line-height:32px;margin:8px 0 16px">Your secure Assessment Guide is available</h1><p style="font-size:15px;line-height:24px;color:#334155">Hi {{fullName}},<br><br>Your secure ProFox Sales Assessment Guide is ready. It shows the three-step assessment journey, your current phase, role context and the rules that apply throughout selection.</p><p><a href="{{taskUrl}}" style="display:inline-block;background:#000080;color:#fff;text-decoration:none;padding:13px 20px;border-radius:9px;font-weight:700">Open Assessment Guide</a></p><div style="margin-top:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;font-size:14px;line-height:23px;color:#334155"><strong>1. Sales Practical Interview</strong><br><strong>2. Lead Research Test</strong> - 5 researched businesses<br><strong>3. CRM Assessment</strong></div><p style="font-size:13px;line-height:21px;color:#64748b">Continue from your current recruitment stage and follow the most recent ProFox email for the exact action required. This guide does not grant live CRM or active Sales access. Full Sales Academy account access is issued only after selection and signed-agreement verification.</p><p style="font-size:13px;color:#64748b">Application reference: {{applicationReference}}<br>Support: {{supportEmail}}</p></td></tr></table></td></tr></table></body></html>$html$,
  true,'Stage-neutral secure Assessment Guide access email used for active candidates who entered the Sales assessment sequence before guide provisioning was introduced.'
where not exists(select 1 from public.notification_templates where template_key='recruitment_assessment_guide_access');

do $block$
declare
  a public.applicants%rowtype;
  v_issue jsonb;
  v_instance uuid;
begin
  for a in
    select * from public.applicants
    where career_job_id='6672b102-bf96-4f68-aa0b-a0224587a5fe'
      and closed_at is null and coalesce(btrim(refusal_reason),'')=''
      and stage in ('Shortlisted','Sales Assessment','Lead Research Test','CRM Assessment')
      and not exists(
        select 1 from public.recruitment_task_instances t
        where t.applicant_id=applicants.id
          and coalesce(t.template_snapshot->>'taskKey','')='sales_assessment_hub'
          and t.status in ('Issued','Viewed','In Progress')
      )
  loop
    v_issue:=public.issue_recruitment_task_internal(a.id,'Shortlisted','',false);
    if v_issue is not null and coalesce(v_issue->>'instanceId','')<>'' then
      v_instance:=(v_issue->>'instanceId')::uuid;
      perform public.enqueue_notification(
        'recruitment:'||a.id::text||':assessment-guide-access-v1',
        'recruitment_assessment_guide_access',lower(btrim(a.email)),null,
        public.recruitment_notification_payload(a)||jsonb_build_object('taskInstanceId',v_instance),now()
      );
    end if;
  end loop;
end;
$block$;
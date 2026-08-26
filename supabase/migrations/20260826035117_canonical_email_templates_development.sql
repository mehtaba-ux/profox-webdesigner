-- Canonical ProFox Development operational email templates.
DO $$
DECLARE v_updated integer := 0;
BEGIN
  WITH input(template_key, subject_template, preheader, body_template, title, category) AS (
    VALUES
      ('development_incident',
       'Development service issue requires review',
       'A Development service issue has been recorded for operational review.',
       E'A Development service issue has been recorded.\n\nIssue: {{title}}\n\nReview the canonical ProFox record and confirm the impact, accountable owner, corrective action and verification before marking the issue complete. Keep the supporting evidence and final decisions in ProFox so the operational record remains complete.\n\nProFox Development Operations\nProFox Web Designer\nhttps://www.profoxwebdesigner.com/',
       'Development service issue',
       'DEVELOPMENT'),
      ('development_quality_finding',
       'Development quality review required',
       'A Development quality finding requires review before the affected work proceeds.',
       E'A Development quality finding has been recorded.\n\nQuality finding: {{title}}\n\nReview the canonical ProFox record, correct the identified issue and complete the required verification before the affected work proceeds through its quality gate. Keep the evidence and final decision in ProFox.\n\nProFox Development Operations\nProFox Web Designer\nhttps://www.profoxwebdesigner.com/',
       'Development quality review required',
       'DEVELOPMENT')
  )
  UPDATE public.notification_templates AS nt
  SET subject_template=input.subject_template,
      body_template=input.body_template,
      html_template=public.profox_build_canonical_email_html(input.title,input.subject_template,input.preheader,input.body_template,input.category),
      updated_at=now()
  FROM input
  WHERE nt.template_key=input.template_key AND nt.active=true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 2 THEN
    RAISE EXCEPTION 'Expected 2 Development email templates, updated %', v_updated;
  END IF;
END;
$$;

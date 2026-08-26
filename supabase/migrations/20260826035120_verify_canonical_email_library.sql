-- Verify the complete ProFox email library and remove the temporary canonical renderer.
DO $$
DECLARE
  v_total integer;
  v_unique integer;
  v_html integer;
  v_site integer;
  v_html_site integer;
  v_disallowed integer;
BEGIN
  SELECT count(*),
         count(distinct template_key),
         count(*) filter (where coalesce(html_template,'') <> ''),
         count(*) filter (where body_template like '%https://www.profoxwebdesigner.com/%'),
         count(*) filter (where html_template like '%profoxwebdesigner.com%'),
         count(*) filter (
           where public.profox_email_copy_has_disallowed_symbols(subject_template)
              or public.profox_email_copy_has_disallowed_symbols(body_template)
         )
  INTO v_total, v_unique, v_html, v_site, v_html_site, v_disallowed
  FROM public.notification_templates
  WHERE active = true;

  IF v_total <> 124 OR v_unique <> 124 OR v_html <> 124 OR v_site <> 124 OR v_html_site <> 124 OR v_disallowed <> 0 THEN
    RAISE EXCEPTION 'ProFox email library verification failed: total %, unique %, html %, website %, html website %, disallowed %',
      v_total, v_unique, v_html, v_site, v_html_site, v_disallowed;
  END IF;
END;
$$;

drop function if exists public.profox_build_canonical_email_html(text,text,text,text,text);

-- Canonical ProFox email HTML helper used by the canonical email-library data batches.
create or replace function public.profox_build_canonical_email_html(
  p_title text,
  p_subject text,
  p_preheader text,
  p_body text,
  p_category text
)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_title text := coalesce(p_title,'');
  v_subject text := coalesce(p_subject,'');
  v_preheader text := coalesce(p_preheader,'');
  v_body text := coalesce(p_body,'');
  v_category text := upper(coalesce(nullif(trim(p_category),''),'PROFOX'));
begin
  v_title := replace(replace(replace(v_title,'&','&amp;'),'<','&lt;'),'>','&gt;');
  v_subject := replace(replace(replace(v_subject,'&','&amp;'),'<','&lt;'),'>','&gt;');
  v_preheader := replace(replace(replace(v_preheader,'&','&amp;'),'<','&lt;'),'>','&gt;');
  v_body := replace(replace(replace(v_body,'&','&amp;'),'<','&lt;'),'>','&gt;');
  v_body := regexp_replace(v_body, '(\{\{[A-Za-z0-9_]*(Url|URL|url|Link)\}\})', '<a href="\1" style="color:#000080;text-decoration:underline;font-weight:700;">Open link</a>', 'g');
  v_body := replace(v_body, E'\n', '<br>');
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' || v_subject || '</title></head>'
    || '<body style="margin:0;padding:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">'
    || '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' || v_preheader || '</div>'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f5fb;"><tr><td align="center" style="padding:24px 12px;">'
    || '<table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">'
    || '<tr><td style="height:5px;background:#000080;font-size:0;line-height:0;">&nbsp;</td></tr>'
    || '<tr><td style="padding:24px 28px 18px;border-bottom:1px solid #eef2f7;"><div style="font-size:20px;line-height:26px;font-weight:800;color:#000080;">ProFox Web Designer</div>'
    || '<div style="margin-top:5px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.2px;color:#64748b;">' || v_category || '</div></td></tr>'
    || '<tr><td style="padding:28px;"><h1 style="margin:0 0 20px;font-size:24px;line-height:32px;font-weight:700;color:#0f172a;">' || v_title || '</h1>'
    || '<div style="font-size:15px;line-height:24px;color:#334155;">' || v_body || '</div></td></tr>'
    || '<tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:19px;color:#64748b;">ProFox Web Designer &nbsp;|&nbsp; '
    || '<a href="https://www.profoxwebdesigner.com/" style="color:#000080;text-decoration:none;font-weight:700;">www.profoxwebdesigner.com</a></td></tr>'
    || '</table></td></tr></table></body></html>';
end;
$function$;

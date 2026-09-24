create or replace function public.communication_attachment_type_allowed(p_content_type text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(btrim(coalesce(p_content_type,''))) = any(array[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/webm','video/quicktime','video/mpeg',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv'
  ]::text[])
$$;

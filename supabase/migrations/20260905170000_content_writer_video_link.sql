begin;

-- Content Writer candidates should share a viewable external video link instead of
-- uploading a large video file into recruitment storage.
with target as (
  select id, role_details
  from public.career_jobs
  where slug = 'content-writer'
  for update
), transformed as (
  select
    id,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          role_details,
          '{applicationForm,schemaVersion}',
          '4'::jsonb,
          true
        ),
        '{applicationForm,steps}',
        coalesce((
          select jsonb_agg(
            case
              when step->>'id' = 'confirm' then step || jsonb_build_object(
                'description', 'Upload your CV, share your introduction-video link, and confirm the working terms before submitting.'
              )
              else step
            end
            order by ord
          )
          from jsonb_array_elements(coalesce(role_details->'applicationForm'->'steps', '[]'::jsonb)) with ordinality as s(step, ord)
        ), '[]'::jsonb),
        true
      ),
      '{applicationForm,fields}',
      coalesce((
        select jsonb_agg(
          case
            when field->>'key' = 'video' then
              (field - 'accept') || jsonb_build_object(
                'type', 'url',
                'label', 'Introduction video link',
                'help', 'Record a short introduction and paste a shareable Loom, YouTube, Vimeo, Google Drive or other video link that we can open without requesting access.',
                'placeholder', 'https://www.loom.com/share/...',
                'required', true,
                'active', true,
                'system', true,
                'locked', true
              )
            else field
          end
          order by ord
        )
        from jsonb_array_elements(coalesce(role_details->'applicationForm'->'fields', '[]'::jsonb)) with ordinality as f(field, ord)
      ), '[]'::jsonb),
      true
    ) as role_details
  from target
)
update public.career_jobs as job
set role_details = transformed.role_details,
    updated_at = now()
from transformed
where job.id = transformed.id;

-- Keep the proven v3 validation implementation as a private legacy helper. The
-- new public wrapper supplies only a sentinel path to satisfy the legacy file
-- check, then immediately clears that path and stores the candidate's URL in
-- applicants.video_url. Direct access to the legacy RPC is revoked.
alter function public.submit_public_content_writer_application(jsonb)
  rename to submit_public_content_writer_application_v3_legacy;

revoke all on function public.submit_public_content_writer_application_v3_legacy(jsonb) from public;
revoke all on function public.submit_public_content_writer_application_v3_legacy(jsonb) from anon;
revoke all on function public.submit_public_content_writer_application_v3_legacy(jsonb) from authenticated;

create or replace function public.submit_public_content_writer_application(p_application jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload jsonb := coalesce(p_application, '{}'::jsonb);
  v_video_url text := btrim(coalesce(
    p_application->'responses'->>'video',
    p_application->>'video',
    p_application->>'videoUrl',
    ''
  ));
  v_result jsonb;
  v_applicant_id uuid;
begin
  if v_video_url = '' then
    return jsonb_build_object(
      'success', false,
      'field', 'video',
      'error', 'Introduction video link is required.'
    );
  end if;

  if char_length(v_video_url) > 2048 or v_video_url !~* '^https://[^[:space:]]+$' then
    return jsonb_build_object(
      'success', false,
      'field', 'video',
      'error', 'Please provide a complete HTTPS shareable video link.'
    );
  end if;

  -- The private v3 helper still contains its historical secure-upload guard.
  -- This sentinel never represents a real object and is cleared after insert.
  v_payload := jsonb_set(
    v_payload,
    '{videoStoragePath}',
    to_jsonb('applications/external-video-link'::text),
    true
  );

  v_result := public.submit_public_content_writer_application_v3_legacy(v_payload);

  if coalesce((v_result->>'success')::boolean, false)
     and not coalesce((v_result->>'duplicate')::boolean, false)
     and v_result ? 'applicant_id' then
    begin
      v_applicant_id := (v_result->>'applicant_id')::uuid;
    exception when others then
      v_applicant_id := null;
    end;

    if v_applicant_id is not null then
      update public.applicants
      set video_url = v_video_url,
          video_storage_path = null,
          application_version = 'content_writer_dynamic_v4',
          application_policy_version = 'content_writer_dynamic_v4'
      where id = v_applicant_id;

      v_result := v_result || jsonb_build_object('formSchemaVersion', 4);
    end if;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.submit_public_content_writer_application(jsonb) from public;
grant execute on function public.submit_public_content_writer_application(jsonb) to anon, authenticated, service_role;

comment on function public.submit_public_content_writer_application(jsonb) is
  'Submits the dynamic Content Writer application. The required introduction video is supplied as a shareable HTTPS link and stored in applicants.video_url; video file uploads are not accepted by this workflow.';

commit;

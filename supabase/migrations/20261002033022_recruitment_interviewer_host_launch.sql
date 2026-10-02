create or replace function public.admin_get_recruitment_interviews(p_applicant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_result jsonb;
begin
  if not public.can_manage_content_applicant(p_applicant_id) and not public.is_admin() then
    raise exception 'Recruitment management access required.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',ri.id,
        'applicantId',ri.applicant_id,
        'stage',ri.stage,
        'meetingId',m.id,
        'interviewerId',ri.interviewer_id,
        'interviewerName',u.full_name,
        'interviewType',ri.interview_type,
        'startAt',m.start_at,
        'endAt',m.end_at,
        'timezone',m.timezone,
        'meetingUrl',
          case
            when (public.is_admin() or ri.interviewer_id=auth.uid())
              and coalesce(mpl.host_url,'') ~* '^https://'
              and coalesce(mpl.host_url,'') ilike '%embedmeeting.jsp%'
              and coalesce(mpl.host_url,'') ~* '[?&]t='
              then mpl.host_url
            when coalesce(mpl.join_url,'') ~* '^https://'
              then mpl.join_url
            when coalesce(m.meeting_url,'') ~* '^https://'
              then m.meeting_url
            else ''
          end,
        'meetingLaunchRole',
          case
            when (public.is_admin() or ri.interviewer_id=auth.uid())
              and coalesce(mpl.host_url,'') ~* '^https://'
              and coalesce(mpl.host_url,'') ilike '%embedmeeting.jsp%'
              and coalesce(mpl.host_url,'') ~* '[?&]t='
              then 'host'
            else 'participant'
          end,
        'status',m.status,
        'outcomeNotes',ri.outcome_notes,
        'createdAt',ri.created_at,
        'updatedAt',ri.updated_at
      )
      order by m.start_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.recruitment_interviews ri
  join public.sales_meetings m on m.id=ri.meeting_id
  left join public.user_profiles u on u.id=ri.interviewer_id
  left join public.meeting_provider_private_links mpl
    on mpl.meeting_id=m.id and mpl.provider='zoho_meeting'
  where ri.applicant_id=p_applicant_id;

  return v_result;
end;
$$;

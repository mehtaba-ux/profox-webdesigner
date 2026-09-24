-- Final workforce Academy reconciliation.
-- Reuses the existing Content Academy module/progress/review records and the shared
-- training_tracks/training_track_modules dispatcher introduced for UI/UX and Development.
-- No duplicate LMS, module catalog or certification system is created.

-- Content Writer already has a canonical career job and Content Academy modules.
-- Add only the shared role/track metadata required by the later multi-role dispatcher.
update public.career_jobs
set role_details = jsonb_set(
      jsonb_set(coalesce(role_details,'{}'::jsonb),'{systemRole}','"content_writer"'::jsonb,true),
      '{trainingTrack}','"content_delivery"'::jsonb,true
    ),
    updated_at=now()
where slug='content-writer' and application_type='content_writer';

insert into public.training_tracks(track_key,name,target_role,department,description)
values(
  'content_delivery',
  'ProFox Content Academy',
  'content_writer',
  'Content',
  'PF-SOP-07 Content Writer onboarding from research and evidence through independently reviewed practical certification and UI/UX-ready handoff.'
)
on conflict(track_key) do update set
  name=excluded.name,
  target_role=excluded.target_role,
  department=excluded.department,
  description=excluded.description,
  active=true,
  updated_at=now();

-- Map the seven EXISTING Content Academy modules into the shared track registry.
-- The module rows themselves remain the single canonical records created by PF-SOP-07.
insert into public.training_track_modules(
  track_key,module_id,sort_order,required,passing_score_override,requires_review_override
)
select
  'content_delivery',m.id,
  case m.slug
    when 'content-operating-model' then 1
    when 'content-pf-sop-07' then 2
    when 'content-research-evidence' then 3
    when 'content-conversion-search' then 4
    when 'content-ai-confidentiality' then 5
    when 'content-review-handoff' then 6
    when 'content-practical-certification' then 7
  end,
  coalesce(m.required,true),
  m.passing_score,
  coalesce(m.requires_admin_review,false)
from public.training_modules m
where m.slug in(
  'content-operating-model','content-pf-sop-07','content-research-evidence',
  'content-conversion-search','content-ai-confidentiality','content-review-handoff',
  'content-practical-certification'
)
on conflict(track_key,module_id) do update set
  sort_order=excluded.sort_order,
  required=excluded.required,
  passing_score_override=excluded.passing_score_override,
  requires_review_override=excluded.requires_review_override;

-- One authoritative track resolver for all current workforce Academies.
-- Candidate job metadata wins; role fallback keeps already-activated staff connected.
create or replace function public.training_track_for_user(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_track text; v_role text;
begin
  select public.career_job_training_track(a.career_job_id)
    into v_track
  from public.applicants a
  where a.linked_user_id=p_user_id
  order by a.created_at desc
  limit 1;

  if v_track is not null and v_track<>'general' then
    return v_track;
  end if;

  select role into v_role from public.user_profiles where id=p_user_id;
  return case
    when v_role in('sales','sales_rep','sales_team') then 'sales'
    when v_role='content_writer' then 'content_delivery'
    when v_role='uiux_designer' then 'uiux_design'
    when v_role in('developer','web_developer','developer_designer') then 'web_development'
    else null
  end;
end;
$$;

grant execute on function public.training_track_for_user(uuid) to authenticated;

-- Keep the shared dispatcher explicit. Content does NOT gain a fake Sales/UIUX/Developer
-- Final Approval stage: its protected practical-review RPC remains the activation authority.
create or replace function public.request_my_final_approval()
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_track text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_track:=public.training_track_for_user(auth.uid());
  if v_track='web_development' then perform public.request_developer_final_approval(); return; end if;
  if v_track='uiux_design' then perform public.request_uiux_final_approval(); return; end if;
  if v_track='sales' then perform public.request_sales_final_approval(); return; end if;
  if v_track='content_delivery' then
    raise exception 'Content Writer activation is controlled by the independently reviewed Content Practical Certification.';
  end if;
  raise exception 'No Final Approval workflow is configured for this training track.';
end;
$$;

grant execute on function public.request_my_final_approval() to authenticated;

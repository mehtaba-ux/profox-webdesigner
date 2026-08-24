-- PF UI/UX Designer Team — required public application evidence guard.
-- The public form already validates these fields; this trigger makes the same minimums authoritative server-side
-- for UI/UX role-v1 application inserts without affecting Sales or Admin-created legacy applicants.

create or replace function public.validate_uiux_role_application_evidence()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_role text;
begin
  if new.application_version is distinct from 'uiux_role_v1' then return new; end if;
  v_role:=coalesce(public.career_job_system_role(new.career_job_id),'pending');
  if v_role<>'uiux_designer' then return new; end if;

  if coalesce(new.portfolio_url,'')!~*'^https?://' then raise exception 'A valid UI/UX portfolio URL is required.'; end if;
  if coalesce(new.cv_storage_path,'')='' and coalesce(new.cv_url,'')='' then raise exception 'A CV or resume is required.'; end if;
  if coalesce(new.available_hours_per_week,0)<1 then raise exception 'Weekly availability is required.'; end if;
  if new.has_laptop_internet is not true then raise exception 'Required remote-work equipment and internet confirmation is missing.'; end if;
  if new.accuracy_confirmed_at is null or new.privacy_consent_at is null then raise exception 'Application accuracy and privacy consent are required.'; end if;

  if length(trim(coalesce(new.application_answers->>'figmaExperience','')))<6 then raise exception 'Figma production-work experience is required.'; end if;
  if length(trim(coalesce(new.application_answers->>'responsiveExperience','')))<6 then raise exception 'Responsive design experience is required.'; end if;
  if length(trim(coalesce(new.application_answers->>'designSystemsExperience','')))<6 then raise exception 'Design-system/component experience is required.'; end if;
  if length(trim(coalesce(new.application_answers->>'strongestCaseStudy','')))<11 then raise exception 'A strongest portfolio case-study explanation is required.'; end if;
  if length(trim(coalesce(new.application_answers->>'caseStudyContribution','')))<11 then raise exception 'Your individual contribution to the selected case study is required.'; end if;
  if length(trim(coalesce(new.application_answers->>'developerHandoffExperience','')))<6 then raise exception 'Developer handoff experience is required.'; end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_uiux_role_application_evidence on public.applicants;
create trigger trg_validate_uiux_role_application_evidence
before insert on public.applicants
for each row execute function public.validate_uiux_role_application_evidence();

revoke all on function public.validate_uiux_role_application_evidence() from public,anon,authenticated;

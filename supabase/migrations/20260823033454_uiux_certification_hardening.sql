-- PF UI/UX Designer Team — protect the final certification from client-side completion bypass.

create or replace function public.protect_uiux_final_certification_progress()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_slug text; v_submission jsonb; v_is_admin boolean:=public.is_admin();
begin
  select slug into v_slug from public.training_modules where id=new.module_id;
  if v_slug<>'uiux-final-certification' then return new; end if;

  -- Admin review RPC may set Passed/Retry Required. The trainee may only submit valid evidence.
  if v_is_admin then return new; end if;
  if auth.uid() is null or auth.uid()<>old.user_id then raise exception 'You may only update your own certification progress.'; end if;

  if new.status is distinct from old.status then
    if new.status='Submitted' then
      select ta.submission_data into v_submission
      from public.training_assignments ta
      where ta.progress_id=old.id and ta.user_id=old.user_id and ta.module_id=old.module_id
      order by ta.created_at desc,ta.id desc limit 1;
      if coalesce(v_submission->>'type','')<>'uiux_final_certification' then raise exception 'A UI/UX Final Certification evidence submission is required.'; end if;
      if coalesce(v_submission->>'figmaUrl','')!~* '^https?://' then raise exception 'Final Certification requires a valid Figma/design evidence URL.'; end if;
      if length(trim(coalesce(v_submission->>'rationale','')))<30
         or length(trim(coalesce(v_submission->>'responsive','')))<30
         or length(trim(coalesce(v_submission->>'designSystem','')))<30
         or length(trim(coalesce(v_submission->>'accessibility','')))<30
         or length(trim(coalesce(v_submission->>'handoff','')))<30 then
        raise exception 'Final Certification evidence is incomplete.';
      end if;
    elsif new.status in('Passed','Completed') then
      raise exception 'UI/UX Final Certification can only be passed through independent Management review.';
    elsif new.status not in('In Progress','Retry Required') then
      raise exception 'Invalid UI/UX Final Certification transition.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_uiux_final_certification_progress on public.user_training_progress;
create trigger trg_protect_uiux_final_certification_progress
before update on public.user_training_progress
for each row execute function public.protect_uiux_final_certification_progress();

revoke all on function public.protect_uiux_final_certification_progress() from public,anon,authenticated;

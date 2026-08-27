-- One-time Admin-only test bypass for validating the post-Academy recruitment flow.
-- This never marks training evidence complete and never authorizes live Sales activation.

create table if not exists public.sales_academy_test_bypasses (
  id uuid primary key default extensions.gen_random_uuid(),
  singleton_key smallint not null default 1 check (singleton_key = 1),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  linked_user_id uuid not null references public.user_profiles(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) >= 12),
  status text not null default 'active' check (status in ('active','consumed','expired','revoked')),
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  advanced_to_final_at timestamptz,
  consumed_at timestamptz,
  consumed_by uuid references public.user_profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint sales_academy_test_bypasses_single_use unique (singleton_key),
  constraint sales_academy_test_bypasses_applicant_once unique (applicant_id)
);

alter table public.sales_academy_test_bypasses enable row level security;
revoke all on table public.sales_academy_test_bypasses from anon, authenticated;
grant select on table public.sales_academy_test_bypasses to authenticated;

drop policy if exists sales_academy_test_bypasses_admin_select on public.sales_academy_test_bypasses;
create policy sales_academy_test_bypasses_admin_select
on public.sales_academy_test_bypasses
for select
to authenticated
using (public.is_admin());

create or replace function public.sales_academy_test_bypass_active(p_applicant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.sales_academy_test_bypasses b
    where b.applicant_id = p_applicant_id
      and b.status = 'active'
      and b.advanced_to_final_at is not null
      and b.consumed_at is null
      and b.expires_at > now()
  );
$$;
revoke all on function public.sales_academy_test_bypass_active(uuid) from public, anon, authenticated;

create or replace function public.admin_get_sales_academy_test_bypass_status(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_bypass public.sales_academy_test_bypasses%rowtype;
  v_total integer := 0;
  v_completed integer := 0;
  v_global_used boolean := false;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_app
  from public.applicants
  where linked_user_id = p_user_id
    and coalesce(public.career_job_system_role(career_job_id),'') = 'sales'
  order by created_at desc
  limit 1;
  if not found then raise exception 'Linked Sales candidate record not found.'; end if;

  select exists(select 1 from public.sales_academy_test_bypasses) into v_global_used;
  select * into v_bypass
  from public.sales_academy_test_bypasses
  order by created_at desc
  limit 1;

  select count(*)::integer into v_total
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  where tm.track_key='sales' and tm.required=true and m.active=true;

  select count(*)::integer into v_completed
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  join public.user_training_progress p on p.module_id=m.id and p.user_id=v_app.linked_user_id
  where tm.track_key='sales' and tm.required=true and m.active=true
    and p.status in ('Passed','Completed')
    and (coalesce(tm.passing_score_override,m.passing_score) is null
         or coalesce(p.score,100) >= coalesce(tm.passing_score_override,m.passing_score));

  return jsonb_build_object(
    'applicantId',v_app.id,
    'stage',v_app.stage,
    'totalRequired',v_total,
    'completedRequired',v_completed,
    'actualProgressPercent',case when v_total=0 then 0 else round((v_completed::numeric/v_total::numeric)*100)::integer end,
    'globallyUsed',v_global_used,
    'usedForThisCandidate',coalesce(v_bypass.applicant_id=v_app.id,false),
    'active',coalesce(v_bypass.applicant_id=v_app.id and v_bypass.status='active' and v_bypass.consumed_at is null and v_bypass.expires_at>now(),false),
    'consumed',coalesce(v_bypass.applicant_id=v_app.id and v_bypass.consumed_at is not null,false),
    'expiresAt',case when v_bypass.applicant_id=v_app.id then v_bypass.expires_at else null end,
    'eligible',v_app.stage='Sales Academy Training'
      and v_app.linked_user_id is not null
      and lower(coalesce(v_app.agreement_status,''))='signed'
      and v_app.academy_started_at is not null
      and not v_global_used,
    'liveActivationStillBlocked',true
  );
end;
$$;
revoke all on function public.admin_get_sales_academy_test_bypass_status(uuid) from public, anon;
grant execute on function public.admin_get_sales_academy_test_bypass_status(uuid) to authenticated;

create or replace function public.mark_sales_academy_completion_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.stage='Sales Academy Training' and new.stage='Final Approval' then
    if coalesce(current_setting('profox.sales_academy_test_bypass_applicant',true),'') <> new.id::text then
      new.academy_completed_at := coalesce(new.academy_completed_at, now());
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_sales_academy_non_bypassable_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_ready boolean := false;
  v_test_bypass boolean := false;
  v_test_context text := coalesce(current_setting('profox.sales_academy_test_bypass_applicant',true),'');
begin
  v_role:=coalesce(public.career_job_system_role(coalesce(new.career_job_id,old.career_job_id)), '');
  if v_role<>'sales' then return new; end if;

  if new.stage is distinct from old.stage then
    if new.stage='Final Approval' and old.stage<>'Sales Academy Training' then
      raise exception 'Sales candidates can enter Final Approval only after completing Sales Academy Training.';
    end if;
    if new.stage='Ready for System Access' and old.stage<>'Final Approval' then
      raise exception 'Sales candidates can enter Ready for System Access only from Final Approval.';
    end if;
    if new.stage='Activated' and old.stage<>'Ready for System Access' then
      raise exception 'Sales candidates can be activated only from Ready for System Access.';
    end if;
  end if;

  if new.stage='Final Approval' and old.stage='Sales Academy Training' and v_test_context=new.id::text then
    v_test_bypass:=true;
  elsif new.stage='Ready for System Access' or (new.final_approval is true and old.final_approval is distinct from true) then
    v_test_bypass:=public.sales_academy_test_bypass_active(new.id);
  end if;

  -- A test bypass never authorizes live activation.
  if new.stage='Activated' then v_test_bypass:=false; end if;

  if new.stage in('Final Approval','Ready for System Access','Activated')
     or (new.final_approval is true and old.final_approval is distinct from true) then
    if new.linked_user_id is null then raise exception 'A linked Sales Academy account is required before advanced access.'; end if;
    if lower(coalesce(new.agreement_status,''))<>'signed' then raise exception 'A verified Sales Partner Agreement is required before advanced access.'; end if;
    if new.academy_started_at is null or new.academy_due_at is null then raise exception 'Sales Academy Training must be started before advanced access.'; end if;

    if not v_test_bypass then
      if new.academy_review_wait_started_at is not null and new.academy_completed_at is null then
        raise exception 'Sales Academy progression is locked while a required Management review is pending.';
      end if;
      v_ready:=public.sales_academy_training_ready(new.linked_user_id);
      if not v_ready then
        raise exception 'Sales Academy completion is mandatory. All required Sales modules, passing scores, Management reviews and Final Certification must be complete before advanced access.';
      end if;
      if new.academy_completed_at is null and now()>new.academy_due_at then
        raise exception 'The Sales Academy deadline has passed. Complete the controlled Management review process before advanced access.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.admin_test_skip_sales_academy(p_user_id uuid, p_reason text default 'One-time Admin test of the post-Academy recruitment flow')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_row public.sales_academy_test_bypasses%rowtype;
  v_total integer := 0;
  v_completed integer := 0;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if char_length(btrim(coalesce(p_reason,'')))<12 then raise exception 'A clear testing reason of at least 12 characters is required.'; end if;

  select * into v_app
  from public.applicants
  where linked_user_id=p_user_id
    and coalesce(public.career_job_system_role(career_job_id),'')='sales'
  order by created_at desc
  limit 1
  for update;
  if not found then raise exception 'Linked Sales candidate record not found.'; end if;
  if coalesce(btrim(v_app.refusal_reason),'')<>'' or v_app.closed_at is not null then raise exception 'Closed candidates cannot use the test bypass.'; end if;
  if v_app.stage<>'Sales Academy Training' then raise exception 'The one-time test bypass is available only during Sales Academy Training.'; end if;
  if v_app.linked_user_id is null then raise exception 'A linked Sales Academy account is required.'; end if;
  if lower(coalesce(v_app.agreement_status,''))<>'signed' then raise exception 'A verified Sales Partner Agreement is required before the test bypass.'; end if;
  if v_app.academy_started_at is null or v_app.academy_due_at is null then raise exception 'The candidate must first enter the Sales Academy normally before the test bypass can be used.'; end if;
  if public.sales_academy_training_ready(v_app.linked_user_id) then raise exception 'This candidate already satisfies the real Sales Academy gate. Use the normal Final Approval flow.'; end if;
  if exists(select 1 from public.sales_academy_test_bypasses) then raise exception 'The one-time Sales Academy test bypass has already been used and cannot be issued again.'; end if;

  select count(*)::integer into v_total
  from public.training_track_modules tm join public.training_modules m on m.id=tm.module_id
  where tm.track_key='sales' and tm.required=true and m.active=true;
  select count(*)::integer into v_completed
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id
  join public.user_training_progress p on p.module_id=m.id and p.user_id=v_app.linked_user_id
  where tm.track_key='sales' and tm.required=true and m.active=true
    and p.status in('Passed','Completed')
    and (coalesce(tm.passing_score_override,m.passing_score) is null or coalesce(p.score,100)>=coalesce(tm.passing_score_override,m.passing_score));

  insert into public.sales_academy_test_bypasses(applicant_id,linked_user_id,reason,created_by)
  values(v_app.id,v_app.linked_user_id,left(btrim(p_reason),1000),auth.uid())
  returning * into v_row;

  perform set_config('profox.sales_academy_test_bypass_applicant',v_app.id::text,true);
  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants
  set stage='Final Approval',onboarding_status='in_progress',updated_at=now()
  where id=v_app.id;

  update public.sales_academy_test_bypasses
  set advanced_to_final_at=now(),updated_at=now()
  where id=v_row.id
  returning * into v_row;

  perform public.log_applicant_event(
    v_app.id,'recruitment','test_academy_bypass','TEST ONLY: Sales Academy bypass used',
    'Admin used the one-time test-only Sales Academy bypass. Training records were not marked complete and live activation remains protected.',
    'Sales Academy Training','Final Approval','admin',auth.uid(),'sales_academy_test_bypasses',v_row.id,
    jsonb_build_object('reason',left(btrim(p_reason),1000),'completedRequired',v_completed,'totalRequired',v_total,'expiresAt',v_row.expires_at,'liveActivationStillBlocked',true)
  );

  return jsonb_build_object(
    'success',true,'testOnly',true,'applicantId',v_app.id,'fromStage','Sales Academy Training','toStage','Final Approval',
    'completedRequired',v_completed,'totalRequired',v_total,'actualProgressPercent',case when v_total=0 then 0 else round((v_completed::numeric/v_total::numeric)*100)::integer end,
    'expiresAt',v_row.expires_at,'liveActivationStillBlocked',true
  );
end;
$$;
revoke all on function public.admin_test_skip_sales_academy(uuid,text) from public, anon;
grant execute on function public.admin_test_skip_sales_academy(uuid,text) to authenticated;

create or replace function public.approve_sales_candidate_final(p_applicant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_app public.applicants%rowtype;
  v_missing_required integer;
  v_missing_reviews integer;
  v_final_module public.training_modules%rowtype;
  v_final_progress public.user_training_progress%rowtype;
  v_final_review public.training_reviews%rowtype;
  v_final_session public.final_certification_sessions%rowtype;
  v_final_required_score integer:=90;
  v_test_bypass boolean:=false;
begin
  if not public.is_admin() then raise exception 'Unauthorized: only an active Admin may grant final approval.'; end if;
  select * into v_app from public.applicants where id=p_applicant_id for update;
  if not found then raise exception 'Candidate not found.'; end if;
  if v_app.stage='Ready for System Access' and coalesce(v_app.final_approval,false)=true then return; end if;
  if v_app.linked_user_id is null then raise exception 'Candidate account must be linked before final approval.'; end if;
  if lower(coalesce(v_app.agreement_status,''))<>'signed' then raise exception 'Signed sales agreement is required.'; end if;
  if v_app.stage<>'Final Approval' then raise exception 'Candidate must complete Sales Academy Training and request Final Approval before Admin approval.'; end if;

  v_test_bypass:=public.sales_academy_test_bypass_active(v_app.id);

  if not v_test_bypass then
    if not public.sales_academy_training_ready(v_app.linked_user_id) then
      raise exception 'Sales Academy completion is mandatory before final approval.';
    end if;

    select count(*) into v_missing_required
    from public.training_track_modules tm join public.training_modules m on m.id=tm.module_id
    where tm.track_key='sales' and tm.required=true and m.active=true
      and not exists(
        select 1 from public.user_training_progress p
        where p.user_id=v_app.linked_user_id and p.module_id=m.id and p.status in('Passed','Completed')
          and (coalesce(tm.passing_score_override,m.passing_score) is null or coalesce(p.score,100)>=coalesce(tm.passing_score_override,m.passing_score))
      );
    if v_missing_required>0 then raise exception 'All required Sales Academy modules must be passed before final approval. Missing: %',v_missing_required; end if;

    select count(*) into v_missing_reviews
    from public.training_track_modules tm join public.training_modules m on m.id=tm.module_id
    where tm.track_key='sales' and tm.required=true and m.active=true
      and coalesce(tm.requires_review_override,m.requires_admin_review,false)=true
      and not exists(
        select 1 from public.user_training_progress p
        join lateral(
          select tr.status,tr.score,tr.reviewer_id from public.training_reviews tr
          where tr.progress_id=p.id order by tr.created_at desc,tr.id desc limit 1
        ) r on true
        where p.user_id=v_app.linked_user_id and p.module_id=m.id and p.status='Passed'
          and r.status='Passed' and r.reviewer_id is not null
          and (coalesce(tm.passing_score_override,m.passing_score) is null or coalesce(r.score,100)>=coalesce(tm.passing_score_override,m.passing_score))
      );
    if v_missing_reviews>0 then raise exception 'All Management-reviewed Sales Academy gates must pass before final approval. Missing: %',v_missing_reviews; end if;

    select m.* into v_final_module
    from public.training_track_modules tm join public.training_modules m on m.id=tm.module_id
    where tm.track_key='sales' and m.slug='final-certification' and m.active=true
    order by tm.sort_order desc limit 1;
    if not found then raise exception 'Sales Final Certification module is unavailable.'; end if;
    select coalesce(tm.passing_score_override,v_final_module.passing_score,90) into v_final_required_score
    from public.training_track_modules tm where tm.track_key='sales' and tm.module_id=v_final_module.id limit 1;

    select * into v_final_progress from public.user_training_progress
    where user_id=v_app.linked_user_id and module_id=v_final_module.id for update;
    if not found or v_final_progress.status<>'Passed' or coalesce(v_final_progress.score,0)<v_final_required_score then
      raise exception 'Sales Final Certification must be passed at the current configured standard before final approval.';
    end if;
    select * into v_final_review from public.training_reviews where progress_id=v_final_progress.id order by created_at desc,id desc limit 1;
    if not found or v_final_review.status<>'Passed' or v_final_review.reviewer_id is null or coalesce(v_final_review.score,0)<v_final_required_score then
      raise exception 'Sales Final Certification requires a passing Management live review at the current configured standard.';
    end if;
    select * into v_final_session from public.final_certification_sessions where progress_id=v_final_progress.id and status='passed' order by attempt_no desc limit 1;
    if not found or coalesce(v_final_session.score,0)<v_final_required_score or jsonb_array_length(coalesce(v_final_session.critical_failures,'[]'::jsonb))>0 then
      raise exception 'A passing live Sales Final Certification session with zero critical failures is required.';
    end if;
  end if;

  perform set_config('profox.final_approval_rpc','1',true);
  update public.applicants
  set final_approval=true,
      stage='Ready for System Access',
      onboarding_status='in_progress',
      onboarding_progress=case when v_test_bypass then onboarding_progress else 100 end,
      updated_at=now()
  where id=p_applicant_id;

  update public.user_profiles
  set onboarding_progress=case when v_test_bypass then onboarding_progress else 100 end,
      onboarding_status='in_progress',status='onboarding',updated_at=now()
  where id=v_app.linked_user_id;

  if v_test_bypass then
    update public.sales_academy_test_bypasses
    set status='consumed',consumed_at=now(),consumed_by=auth.uid(),updated_at=now()
    where applicant_id=v_app.id and status='active' and consumed_at is null;
    perform public.log_applicant_event(
      v_app.id,'recruitment','test_academy_bypass_consumed','TEST ONLY: Academy bypass consumed at Final Approval',
      'The one-time test bypass allowed Final Approval testing through Ready for System Access. Live activation remains protected by the real Sales Academy gate.',
      'Final Approval','Ready for System Access','admin',auth.uid(),'applicants',v_app.id,
      jsonb_build_object('liveActivationStillBlocked',true)
    );
  end if;
end;
$$;

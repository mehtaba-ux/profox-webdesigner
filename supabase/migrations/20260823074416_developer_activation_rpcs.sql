-- Developer Academy activation and service-role account linking.
create or replace function public.developer_training_ready(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_missing int;
begin
  select count(*) into v_missing
  from public.training_track_modules tm
  join public.training_modules m on m.id=tm.module_id and m.active=true
  where tm.track_key='web_development' and tm.required
    and not exists(
      select 1 from public.user_training_progress p
      where p.user_id=p_user_id and p.module_id=m.id and p.status in('Passed','Completed')
        and (coalesce(tm.passing_score_override,m.passing_score) is null or coalesce(p.score,100)>=coalesce(tm.passing_score_override,m.passing_score))
        and (coalesce(tm.requires_review_override,m.requires_admin_review,false)=false
             or exists(select 1 from public.training_reviews r where r.progress_id=p.id and r.status='Passed' and r.reviewer_id is not null))
    );
  return v_missing=0;
end;
$$;

create or replace function public.request_developer_final_approval()
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  a public.applicants%rowtype;
  m public.training_modules%rowtype;
  p public.user_training_progress%rowtype;
  r public.training_reviews%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into a from public.applicants where linked_user_id=auth.uid() order by created_at desc limit 1 for update;
  if not found or coalesce(public.career_job_system_role(a.career_job_id),'')<>'developer' then raise exception 'Linked Web Developer candidate record not found.'; end if;
  if a.stage='Final Approval' then return; end if;
  if a.stage<>'Developer Academy' then raise exception 'Candidate must be in Developer Academy before requesting Final Approval.'; end if;
  if lower(coalesce(a.agreement_status,''))<>'signed' then raise exception 'Verified Web Developer agreement is required.'; end if;
  if not public.developer_training_ready(auth.uid()) then raise exception 'Complete and pass every required Developer Academy module before requesting Final Approval.'; end if;
  select * into m from public.training_modules where slug='dev-final-certification' and active=true;
  select * into p from public.user_training_progress where user_id=auth.uid() and module_id=m.id;
  if not found or p.status<>'Passed' or coalesce(p.score,0)<coalesce(m.passing_score,90) then raise exception 'Web Developer Final Certification must be passed before Final Approval.'; end if;
  select * into r from public.training_reviews where progress_id=p.id order by created_at desc,id desc limit 1;
  if not found or r.status<>'Passed' or r.reviewer_id is null then raise exception 'Web Developer Final Certification requires independent Management review.'; end if;
  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants set stage='Final Approval',onboarding_status='in_progress',onboarding_progress=100,updated_at=now() where id=a.id;
end;
$$;

create or replace function public.approve_developer_candidate_final(p_applicant_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare a public.applicants%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an active Admin may grant Final Approval.'; end if;
  select * into a from public.applicants where id=p_applicant_id for update;
  if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(public.career_job_system_role(a.career_job_id),'')<>'developer' then raise exception 'Candidate is not in the Web Developer workflow.'; end if;
  if a.linked_user_id is null then raise exception 'Candidate account must be linked first.'; end if;
  if a.stage not in('Final Approval','Ready for System Access') then raise exception 'Candidate must request Final Approval first.'; end if;
  if lower(coalesce(a.agreement_status,''))<>'signed' or not public.developer_training_ready(a.linked_user_id) then raise exception 'Verified agreement and all required Developer Academy gates are required.'; end if;
  perform set_config('profox.final_approval_rpc','1',true);
  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants set final_approval=true,stage='Ready for System Access',onboarding_status='in_progress',onboarding_progress=100,updated_at=now() where id=a.id;
  update public.user_profiles set onboarding_progress=100,onboarding_status='in_progress',status='onboarding',updated_at=now() where id=a.linked_user_id;
end;
$$;

create or replace function public.activate_web_developer(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare a public.applicants%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an active Admin may activate a Web Developer.'; end if;
  select * into a from public.applicants
  where linked_user_id=p_user_id and coalesce(public.career_job_system_role(career_job_id),'')='developer'
  order by created_at desc limit 1 for update;
  if not found then raise exception 'Web Developer candidate record not found.'; end if;
  if a.stage='Activated' and exists(select 1 from public.user_profiles where id=p_user_id and role='developer' and status='active') then return; end if;
  if a.stage<>'Ready for System Access' or a.final_approval is not true then raise exception 'Final Approval is required before activation.'; end if;
  if lower(coalesce(a.agreement_status,''))<>'signed' or not public.developer_training_ready(p_user_id) then raise exception 'Verified agreement and Developer Academy certification are required before activation.'; end if;
  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.user_profiles set role='developer',department='Development',status='active',onboarding_status='completed',onboarding_progress=100,updated_at=now() where id=p_user_id;
  if not found then raise exception 'Linked user profile not found.'; end if;
  update public.applicants set stage='Activated',onboarding_status='completed',onboarding_progress=100,updated_at=now() where id=a.id;
end;
$$;

create or replace function public.service_link_invited_developer_candidate(p_applicant_id uuid,p_target_user_id uuid,p_account_invite_url text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  a public.applicants%rowtype;
  p public.user_profiles%rowtype;
  v_outbox uuid;
begin
  if current_user not in('postgres','service_role') and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Service role required.'; end if;
  select * into a from public.applicants where id=p_applicant_id for update;
  if not found then raise exception 'Candidate not found.'; end if;
  if coalesce(public.career_job_system_role(a.career_job_id),'')<>'developer' then raise exception 'Candidate is not in the Web Developer workflow.'; end if;
  if coalesce(trim(a.refusal_reason),'')<>'' then raise exception 'Closed candidates cannot receive onboarding access.'; end if;
  if a.stage not in('Selected','Agreement Pending','Developer Academy') then raise exception 'Candidate is not in an account-invitation stage.'; end if;
  if lower(coalesce(a.agreement_status,''))<>'signed' then raise exception 'Verified Web Developer Agreement is required before account access.'; end if;
  if length(trim(coalesce(p_account_invite_url,'')))<20 or p_account_invite_url !~* '^https?://' then raise exception 'A valid secure account setup URL is required.'; end if;
  select * into p from public.user_profiles where id=p_target_user_id for update;
  if not found then raise exception 'Invited user profile not found.'; end if;
  if lower(trim(coalesce(p.email,'')))<>lower(trim(coalesce(a.email,''))) then raise exception 'Invited account email must exactly match the candidate application.'; end if;
  if p.role='admin' then raise exception 'An Admin account cannot be linked as a Developer trainee.'; end if;
  if p.status='active' and p.role in('developer','web_developer','developer_designer') then raise exception 'This account is already an active Developer.'; end if;
  if exists(select 1 from public.applicants x where x.linked_user_id=p_target_user_id and x.id<>p_applicant_id and x.stage<>'Activated' and coalesce(trim(x.refusal_reason),'')='') then raise exception 'This account is already linked to another active candidate.'; end if;
  perform set_config('profox.recruitment_stage_rpc','1',true);
  update public.applicants set linked_user_id=p_target_user_id,stage='Developer Academy',onboarding_status='in_progress',onboarding_invite_sent_at=coalesce(onboarding_invite_sent_at,now()),onboarding_invite_last_sent_at=now(),onboarding_invite_count=onboarding_invite_count+1,updated_at=now() where id=p_applicant_id;
  update public.user_profiles set full_name=coalesce(nullif(trim(a.full_name),''),full_name),phone=coalesce(nullif(trim(a.phone),''),phone),country=coalesce(nullif(trim(a.country),''),country),timezone=coalesce(nullif(trim(a.timezone),''),timezone),role='developer',department='Development',status='onboarding',onboarding_status='in_progress',onboarding_progress=least(coalesce(onboarding_progress,0),99),updated_at=now() where id=p_target_user_id;
  v_outbox:=public.enqueue_notification('recruitment:'||p_applicant_id::text||':developer-account-invite:'||(a.onboarding_invite_count+1)::text,'recruitment_developer_account_invite',lower(trim(a.email)),p_target_user_id,public.recruitment_notification_payload(a)||jsonb_build_object('accountInviteUrl',p_account_invite_url,'applicationReference',a.application_reference),now());
  perform public.log_applicant_event(p_applicant_id,'account','developer_academy_account_invited','Developer Academy account invitation sent','The Web Developer account was securely linked in onboarding mode.',p.status,'onboarding','system',null,'user_profiles',p_target_user_id,jsonb_build_object('inviteNumber',a.onboarding_invite_count+1,'outboxId',v_outbox));
  return jsonb_build_object('success',true,'linkedUserId',p_target_user_id,'stage','Developer Academy','status','onboarding','inviteNumber',a.onboarding_invite_count+1,'trainingTrack','web_development');
end;
$$;

revoke all on function public.service_link_invited_developer_candidate(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.developer_training_ready(uuid) from public,anon;
grant execute on function public.request_developer_final_approval() to authenticated;
grant execute on function public.approve_developer_candidate_final(uuid) to authenticated;
grant execute on function public.activate_web_developer(uuid) to authenticated;
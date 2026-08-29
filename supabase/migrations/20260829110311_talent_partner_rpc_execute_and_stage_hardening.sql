-- Final Talent Partner hardening: canonical privacy-safe stage mapping and least-privilege RPC execution.

create or replace function public.talent_partner_safe_stage(p_stage text, p_refusal_reason text)
returns text
language sql
immutable
set search_path=public,pg_temp
as $$
  select case
    when coalesce(trim(p_refusal_reason),'')<>'' then 'Closed'
    when coalesce(trim(p_stage),'') in ('Activated') then 'Activated'
    when coalesce(trim(p_stage),'') in ('System Access','Ready for System Access','Final Approval') then 'Final approval'
    when coalesce(trim(p_stage),'') in ('Final Certification') then 'Final certification'
    when coalesce(trim(p_stage),'') in ('Sales Academy','Sales Academy Training','One-Day Training','Design Academy','Developer Academy','Content Academy') then 'Training'
    when coalesce(trim(p_stage),'') in ('Conditional Selected','Selected','Agreement','Agreement Pending') then 'Conditional selection'
    when coalesce(trim(p_stage),'') in ('Shortlisted') then 'Shortlisted'
    when coalesce(trim(p_stage),'') in ('Sales Suitability Assessment','Sales Assessment','Sales Practical Assessment','Lead Research Assessment','Lead Research Test','CRM Assessment','Technical Assessment','Design Assessment','Content Assessment','Development Practical','Figma Practical','Practical Certification','Technical Interview','Design Interview') then 'Assessment'
    when coalesce(trim(p_stage),'') in ('Initial Screening','Video Review','Video Pending','Video & Resume Review','Code & Portfolio Review','Portfolio Review') then 'Under review'
    when coalesce(trim(p_stage),'') in ('Application','New Application') then 'Application received'
    else 'Under review'
  end;
$$;

-- Remove default/broad EXECUTE grants first.
revoke all privileges on function public.public_track_talent_partner_visit(text,text,text,jsonb) from public, anon, authenticated;
revoke all privileges on function public.public_claim_talent_partner_application(text,text,text,text) from public, anon, authenticated;
revoke all privileges on function public.request_talent_partner_account(text,text) from public, anon, authenticated;
revoke all privileges on function public.talent_partner_update_my_profile(text,text,text[],text,text,text) from public, anon, authenticated;
revoke all privileges on function public.talent_partner_get_dashboard() from public, anon, authenticated;
revoke all privileges on function public.talent_partner_mark_notification_read(uuid) from public, anon, authenticated;

revoke all privileges on function public.admin_approve_talent_partner_project_reward(uuid,uuid,numeric,text,text) from public, anon, authenticated;
revoke all privileges on function public.admin_create_talent_partner_payout_batch() from public, anon, authenticated;
revoke all privileges on function public.admin_mark_talent_partner_payout_paid(uuid,text) from public, anon, authenticated;
revoke all privileges on function public.admin_override_talent_partner_referral(uuid,uuid,text) from public, anon, authenticated;
revoke all privileges on function public.admin_record_talent_partner_salary_transition(uuid,date,numeric,text,text) from public, anon, authenticated;
revoke all privileges on function public.admin_refresh_talent_partner_rewards() from public, anon, authenticated;
revoke all privileges on function public.admin_save_talent_partner_program_settings(jsonb) from public, anon, authenticated;
revoke all privileges on function public.admin_save_talent_partner_reward_plan(uuid,boolean,text,integer,jsonb,boolean,integer,text,numeric,numeric,text,integer) from public, anon, authenticated;
revoke all privileges on function public.admin_set_talent_partner_status(uuid,text,text) from public, anon, authenticated;
revoke all privileges on function public.admin_update_talent_partner_reward_status(uuid,text,text) from public, anon, authenticated;

revoke all privileges on function public.talent_partner_create_retention_reward(uuid) from public, anon, authenticated;
revoke all privileges on function public.talent_partner_default_reward_model(public.career_jobs) from public, anon, authenticated;
revoke all privileges on function public.talent_partner_event_rule(public.talent_partner_reward_plans,integer,numeric) from public, anon, authenticated;
revoke all privileges on function public.talent_partner_generate_sale_reward(uuid) from public, anon, authenticated;
revoke all privileges on function public.talent_partner_new_code() from public, anon, authenticated;
revoke all privileges on function public.talent_partner_notify(uuid,text,text,text,text,text) from public, anon, authenticated;
revoke all privileges on function public.talent_partner_payment_reward_trigger() from public, anon, authenticated;
revoke all privileges on function public.talent_partner_record_salary_transition_internal(uuid,date,numeric,text,text,uuid,uuid,text) from public, anon, authenticated;
revoke all privileges on function public.talent_partner_safe_stage(text,text) from public, anon, authenticated;
revoke all privileges on function public.talent_partner_sales_progression_retention_trigger() from public, anon, authenticated;
revoke all privileges on function public.talent_partner_seed_job_plan() from public, anon, authenticated;
revoke all privileges on function public.talent_partner_sync_referral_from_applicant() from public, anon, authenticated;

-- Explicit public application-attribution entry points.
grant execute on function public.public_track_talent_partner_visit(text,text,text,jsonb) to anon, authenticated;
grant execute on function public.public_claim_talent_partner_application(text,text,text,text) to anon, authenticated;

-- Explicit authenticated Talent Partner entry points.
grant execute on function public.request_talent_partner_account(text,text) to authenticated;
grant execute on function public.talent_partner_update_my_profile(text,text,text[],text,text,text) to authenticated;
grant execute on function public.talent_partner_get_dashboard() to authenticated;
grant execute on function public.talent_partner_mark_notification_read(uuid) to authenticated;

-- Admin RPCs are authenticated-only at the database privilege layer and retain their internal is_admin() authorization gate.
grant execute on function public.admin_approve_talent_partner_project_reward(uuid,uuid,numeric,text,text) to authenticated;
grant execute on function public.admin_create_talent_partner_payout_batch() to authenticated;
grant execute on function public.admin_mark_talent_partner_payout_paid(uuid,text) to authenticated;
grant execute on function public.admin_override_talent_partner_referral(uuid,uuid,text) to authenticated;
grant execute on function public.admin_record_talent_partner_salary_transition(uuid,date,numeric,text,text) to authenticated;
grant execute on function public.admin_refresh_talent_partner_rewards() to authenticated;
grant execute on function public.admin_save_talent_partner_program_settings(jsonb) to authenticated;
grant execute on function public.admin_save_talent_partner_reward_plan(uuid,boolean,text,integer,jsonb,boolean,integer,text,numeric,numeric,text,integer) to authenticated;
grant execute on function public.admin_set_talent_partner_status(uuid,text,text) to authenticated;
grant execute on function public.admin_update_talent_partner_reward_status(uuid,text,text) to authenticated;
-- Module 20 — extend the existing global assignment validator for the secured capstone evidence types.
-- All non-Final-Certification module behavior is preserved.

create or replace function public.validate_training_assignment_submission()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_module_slug text;
  v_progress public.user_training_progress%rowtype;
  v_quiz_rpc text:=coalesce(current_setting('profox.training_quiz_rpc',true),'');
  v_lead_research_rpc text:=coalesce(current_setting('profox.training_lead_research_rpc',true),'');
  v_loom_rpc text:=coalesce(current_setting('profox.training_loom_rpc',true),'');
  v_final_rpc text:=coalesce(current_setting('profox.training_final_certification_rpc',true),'');
  v_type text:=coalesce(new.submission_data->>'type','');
begin
  if public.is_admin() then return new; end if;
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Training submissions may only be created for the signed-in trainee.';
  end if;

  select slug into v_module_slug from public.training_modules where id=new.module_id and active=true;
  if v_module_slug is null then raise exception 'Training module is missing or inactive.'; end if;
  if new.progress_id is null then raise exception 'Training progress reference is required.'; end if;
  select * into v_progress from public.user_training_progress where id=new.progress_id;
  if not found or v_progress.user_id is distinct from new.user_id or v_progress.module_id is distinct from new.module_id then
    raise exception 'Training submission does not match the trainee progress record.';
  end if;

  if v_module_slug='lead-research' then
    if v_type<>'lead_research_v2' or v_lead_research_rpc<>'1' then raise exception 'Lead Research must be submitted through the secure research qualification workflow.'; end if;
  elsif v_module_slug='loom-outreach' then
    if v_type<>'loom_outreach_v2' or v_loom_rpc<>'1' then raise exception 'Personalized Loom Outreach must be submitted through the secure Module 6 certification workflow.'; end if;
    if coalesce(new.submission_data->>'loomUrl','') !~* '^https?://([a-z0-9-]+\.)?loom\.com/(share|v)/' then raise exception 'A valid Loom share URL is required.'; end if;
  elsif v_module_slug='mock-call-test' then
    if v_type<>'mock_sales_call' then raise exception 'Invalid mock sales call submission type.'; end if;
  elsif v_module_slug='crm-training' then
    if v_type<>'crm_practical' then raise exception 'Invalid CRM practical submission type.'; end if;
  elsif v_module_slug='final-certification' then
    if v_type='final_certification_mission_v1' then
      if v_final_rpc<>'1' or coalesce((new.submission_data->>'verified')::boolean,false) is not true or coalesce((new.submission_data->>'synthetic')::boolean,false) is not true or nullif(btrim(new.submission_data->>'missionKey'),'') is null or coalesce((new.submission_data->>'missionOrder')::integer,0) not between 1 and 12 then
        raise exception 'Final Certification mission evidence must come from the secure capstone mission workflow.';
      end if;
    elsif v_type='final_certification_judgment_v1' then
      if v_final_rpc<>'1' or v_quiz_rpc<>'1' or coalesce((new.submission_data->>'score')::integer,-1) not between 0 and 100 or jsonb_typeof(new.submission_data->'feedback')<>'array' then
        raise exception 'Final Certification judgment evidence must come from the secure server-scored capstone workflow.';
      end if;
    elsif v_type='final_certification_self_assessment_v1' then
      if v_final_rpc<>'1' or nullif(new.submission_data->>'sessionId','') is null then
        raise exception 'Final Certification self-assessment evidence must come from the secure live-capstone workflow.';
      end if;
    elsif v_type='final_certification_exam' then
      -- Backward compatibility for any older client still rendering the retired 15-question exam.
      if v_quiz_rpc<>'1' then raise exception 'Final Certification must be submitted through a secure server-scored workflow.'; end if;
      if jsonb_typeof(new.submission_data->'answers')<>'array' or jsonb_array_length(new.submission_data->'answers')<>15 then raise exception 'Legacy Final Certification requires exactly 15 server-scored answers.'; end if;
    else
      raise exception 'Unsupported Final Certification evidence type.';
    end if;
  end if;
  return new;
end;
$$;

-- Make structured website qualification visible in the existing CRM Qualification panel
-- without creating a second lead-detail system.

create or replace function public.crm_calculate_website_qualification(p_answers jsonb,p_email text)
returns table(score integer,quality text,reason text,estimated_value numeric)
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_cfg jsonb:='{}'::jsonb;
  v_field jsonb;
  v_option jsonb;
  v_answer text;
  v_score integer:=0;
  v_estimated numeric:=0;
  v_high integer:=70;
  v_medium integer:=40;
  v_business_bonus integer:=5;
  v_detail_bonus integer:=5;
  v_project_detail text:='';
  v_budget text:='';
  v_timeline text:='';
  v_role text:='';
  v_goal text:='';
  v_domain text:=lower(split_part(coalesce(p_email,''),'@',2));
begin
  select coalesce(config_value,'{}'::jsonb) into v_cfg
  from public.system_configuration where config_key='public_contact_form';
  v_high:=greatest(1,least(100,coalesce((v_cfg#>>'{scoring,highThreshold}')::integer,70)));
  v_medium:=greatest(0,least(v_high,coalesce((v_cfg#>>'{scoring,mediumThreshold}')::integer,40)));
  v_business_bonus:=greatest(0,least(20,coalesce((v_cfg#>>'{scoring,businessEmailBonus}')::integer,5)));
  v_detail_bonus:=greatest(0,least(20,coalesce((v_cfg#>>'{scoring,projectDetailBonus}')::integer,5)));

  for v_field in select value from jsonb_array_elements(coalesce(v_cfg->'fields','[]'::jsonb)) loop
    if coalesce((v_field->>'enabled')::boolean,true) is not true or not public.crm_public_form_field_visible(v_field,p_answers) then continue; end if;
    v_answer:=case when jsonb_typeof(p_answers->(v_field->>'id'))='string' then p_answers->>(v_field->>'id') else '' end;
    if v_answer='' then continue; end if;
    case v_field->>'purpose'
      when 'projectDetails' then v_project_detail:=v_answer;
      when 'budgetRange' then v_budget:=v_answer;
      when 'timeline' then v_timeline:=v_answer;
      when 'decisionRole' then v_role:=v_answer;
      when 'businessGoal' then v_goal:=v_answer;
      else null;
    end case;
    if jsonb_typeof(v_field->'options')='array' then
      select value into v_option
      from jsonb_array_elements(v_field->'options')
      where value->>'value'=v_answer limit 1;
      if v_option is not null then
        v_score:=v_score+greatest(0,least(50,coalesce((v_option->>'score')::integer,0)));
        if v_field->>'purpose'='budgetRange' then v_estimated:=greatest(0,coalesce((v_option->>'estimatedValue')::numeric,0)); end if;
      end if;
      v_option:=null;
    end if;
  end loop;

  if v_domain<>'' and v_domain not in ('gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','outlook.com','hotmail.com','live.com','icloud.com','aol.com','proton.me','protonmail.com') then
    v_score:=v_score+v_business_bonus;
  end if;
  if char_length(btrim(v_project_detail))>=80 then v_score:=v_score+v_detail_bonus; end if;
  v_score:=greatest(0,least(100,v_score));
  score:=v_score;
  quality:=case when v_score>=v_high then 'High' when v_score>=v_medium then 'Medium' else 'Low' end;
  reason:=left(concat_ws(' · ',
    'Website qualification',
    case when v_budget<>'' then 'Budget: '||v_budget end,
    case when v_timeline<>'' then 'Timeline: '||v_timeline end,
    case when v_role<>'' then 'Role: '||v_role end,
    case when v_goal<>'' then 'Goal: '||v_goal end
  ),1000);
  estimated_value:=v_estimated;
  return next;
end;
$function$;

revoke all on function public.crm_calculate_website_qualification(jsonb,text) from public,anon,authenticated;

-- Conversion-optimized website lead qualification + configurable CRM assignment.
-- Backward compatible with the legacy 4-field contact payload while the UI rolls out.

alter table public.crm_leads
  add column if not exists business_goal text,
  add column if not exists budget_range text,
  add column if not exists project_timeline text,
  add column if not exists decision_role text,
  add column if not exists project_details text,
  add column if not exists qualification_data jsonb not null default '{}'::jsonb,
  add column if not exists attribution jsonb not null default '{}'::jsonb;

insert into public.system_configuration(config_key,config_value,description,updated_at)
values(
  'public_contact_form',
  $json${
    "version": 1,
    "enabled": true,
    "experience": {
      "eyebrow": "Start your project",
      "title": "Tell us what you're building",
      "subtitle": "A few focused questions help us understand your goals and recommend the right next step.",
      "estimatedTime": "Takes about 2 minutes",
      "previousLabel": "Back",
      "nextLabel": "Continue",
      "submitLabel": "Request My Project Review",
      "successTitle": "Thank you — your project is in review.",
      "successMessage": "Our team will review your requirements and respond with the best next step.",
      "privacyText": "Your information stays private. No spam. No obligation."
    },
    "steps": [
      {"id":"about","title":"About you & your project","subtitle":"Start with the essentials so we know who we are helping."},
      {"id":"fit","title":"Goals, budget & timing","subtitle":"This helps us recommend the right scope and next step."}
    ],
    "scoring": {"highThreshold":70,"mediumThreshold":40,"businessEmailBonus":5,"projectDetailBonus":5},
    "fields": [
      {"id":"fullName","purpose":"fullName","type":"text","label":"Full name","placeholder":"John Smith","helpText":"","required":true,"enabled":true,"locked":true,"stepId":"about","order":10,"width":"half","options":[]},
      {"id":"email","purpose":"email","type":"email","label":"Business email","placeholder":"john@company.com","helpText":"Personal email is okay if that is what you use for business.","required":true,"enabled":true,"locked":true,"stepId":"about","order":20,"width":"half","options":[]},
      {"id":"companyName","purpose":"companyName","type":"text","label":"Company / business name","placeholder":"Acme Roofing Ltd.","helpText":"","required":true,"enabled":true,"locked":false,"stepId":"about","order":30,"width":"half","options":[]},
      {"id":"website","purpose":"website","type":"url","label":"Company website","placeholder":"https://example.com","helpText":"Optional — share it if you already have one.","required":false,"enabled":true,"locked":false,"stepId":"about","order":40,"width":"half","options":[]},
      {"id":"serviceInterest","purpose":"serviceInterest","type":"single_select","display":"cards","label":"What do you need help with?","placeholder":"Choose the closest option","helpText":"Choose the closest fit. You can explain details on the next step.","required":true,"enabled":true,"locked":false,"stepId":"about","order":50,"width":"full","options":[
        {"value":"Website Design & Development","label":"Website Design & Development","score":5},
        {"value":"Website Redesign / Conversion Improvement","label":"Website Redesign / Conversion Improvement","score":5},
        {"value":"Custom Web Application","label":"Custom Web Application","score":5},
        {"value":"E-commerce Website","label":"E-commerce Website","score":5},
        {"value":"UI/UX Design","label":"UI/UX Design","score":5},
        {"value":"Email Marketing & Business Automation","label":"Email Marketing & Business Automation","score":5},
        {"value":"Website Maintenance / Ongoing Support","label":"Website Maintenance / Ongoing Support","score":4},
        {"value":"Not Sure — I Need Guidance","label":"Not Sure — I Need Guidance","score":2},
        {"value":"Other","label":"Other","score":2}
      ]},
      {"id":"businessGoal","purpose":"businessGoal","type":"single_select","display":"cards","label":"What would you most like this project to achieve?","placeholder":"Choose your primary goal","helpText":"Pick the outcome that matters most right now.","required":true,"enabled":true,"locked":false,"stepId":"fit","order":10,"width":"full","options":[
        {"value":"Generate more qualified leads","label":"Generate more qualified leads","score":10},
        {"value":"Increase conversions / sales","label":"Increase conversions / sales","score":10},
        {"value":"Build stronger credibility and positioning","label":"Build stronger credibility and positioning","score":10},
        {"value":"Launch a new business / product / service","label":"Launch a new business / product / service","score":10},
        {"value":"Replace an outdated website","label":"Replace an outdated website","score":10},
        {"value":"Improve customer experience","label":"Improve customer experience","score":10},
        {"value":"Automate a manual business process","label":"Automate a manual business process","score":10},
        {"value":"Build a custom web platform / application","label":"Build a custom web platform / application","score":10},
        {"value":"Other","label":"Other","score":5}
      ]},
      {"id":"budgetRange","purpose":"budgetRange","type":"single_select","display":"cards","label":"What budget have you allocated for this project?","placeholder":"Choose a range","helpText":"A range is enough. It helps us recommend a realistic scope without wasting your time.","required":true,"enabled":true,"locked":false,"stepId":"fit","order":20,"width":"full","options":[
        {"value":"Under $1,000","label":"Under $1,000","score":0,"estimatedValue":750},
        {"value":"$1,000 – $3,000","label":"$1,000 – $3,000","score":8,"estimatedValue":2000},
        {"value":"$3,000 – $6,000","label":"$3,000 – $6,000","score":16,"estimatedValue":4500},
        {"value":"$6,000 – $15,000","label":"$6,000 – $15,000","score":25,"estimatedValue":10500},
        {"value":"$15,000 – $30,000","label":"$15,000 – $30,000","score":30,"estimatedValue":22500},
        {"value":"$30,000+","label":"$30,000+","score":35,"estimatedValue":30000},
        {"value":"Not sure — I need guidance","label":"Not sure — I need guidance","score":10,"estimatedValue":0}
      ]},
      {"id":"timeline","purpose":"timeline","type":"single_select","display":"cards","label":"When would you like to get started?","placeholder":"Choose a timeframe","helpText":"An approximate timeframe is perfect.","required":true,"enabled":true,"locked":false,"stepId":"fit","order":30,"width":"full","options":[
        {"value":"As soon as possible","label":"As soon as possible","score":25},
        {"value":"Within 2–4 weeks","label":"Within 2–4 weeks","score":20},
        {"value":"Within 1–3 months","label":"Within 1–3 months","score":15},
        {"value":"Within 3–6 months","label":"Within 3–6 months","score":8},
        {"value":"6+ months","label":"6+ months","score":4},
        {"value":"Just exploring for now","label":"Just exploring for now","score":0}
      ]},
      {"id":"decisionRole","purpose":"decisionRole","type":"single_select","display":"cards","label":"What best describes your role in this project?","placeholder":"Choose one","helpText":"This helps us prepare the right kind of conversation.","required":true,"enabled":true,"locked":false,"stepId":"fit","order":40,"width":"full","options":[
        {"value":"I'm the primary decision-maker","label":"I'm the primary decision-maker","score":20},
        {"value":"I'm part of the decision-making team","label":"I'm part of the decision-making team","score":15},
        {"value":"I'm researching options for my company","label":"I'm researching options for my company","score":5},
        {"value":"I'm gathering information for a client","label":"I'm gathering information for a client","score":8},
        {"value":"Other","label":"Other","score":3}
      ]},
      {"id":"projectDetails","purpose":"projectDetails","type":"textarea","label":"Tell us a little about your project","placeholder":"What are you looking to improve, build, or achieve?","helpText":"A short summary is enough — no need to prepare a formal brief.","required":true,"enabled":true,"locked":false,"stepId":"fit","order":50,"width":"full","minLength":20,"maxLength":4000,"options":[]},
      {"id":"phone","purpose":"phone","type":"tel","label":"Phone / WhatsApp","placeholder":"+1 555 123 4567","helpText":"Optional — useful if you prefer a call or WhatsApp follow-up.","required":false,"enabled":true,"locked":false,"stepId":"fit","order":60,"width":"half","options":[]}
    ]
  }$json$::jsonb,
  'Public conversion-optimized contact form definition. Editable from Admin without code changes.',
  now()
)
on conflict(config_key) do nothing;

insert into public.system_configuration(config_key,config_value,description,updated_at)
values(
  'crm_lead_assignment',
  '{"version":1,"mode":"manual","managerUserIds":[],"eligibleSalespersonIds":[]}'::jsonb,
  'Website CRM lead ownership policy. Manual is the safe default; round_robin distributes new website leads evenly.',
  now()
)
on conflict(config_key) do nothing;

create table if not exists public.crm_lead_assignment_state(
  singleton_key text primary key default 'website' check(singleton_key='website'),
  last_salesperson_id uuid references public.user_profiles(id) on delete set null,
  cycle_count bigint not null default 0 check(cycle_count>=0),
  updated_at timestamptz not null default now()
);
alter table public.crm_lead_assignment_state enable row level security;
revoke all on table public.crm_lead_assignment_state from anon,authenticated;
insert into public.crm_lead_assignment_state(singleton_key) values('website') on conflict(singleton_key) do nothing;

create or replace function public.crm_can_manage_lead_assignment()
returns boolean
language sql
stable security definer
set search_path to 'public','pg_temp'
as $function$
  select (select auth.uid()) is not null and (
    public.is_admin()
    or exists(
      select 1
      from public.user_profiles u
      join public.system_configuration c on c.config_key='crm_lead_assignment'
      where u.id=(select auth.uid())
        and u.status='active'
        and coalesce(c.config_value->'managerUserIds','[]'::jsonb) ? u.id::text
    )
  );
$function$;

create or replace function public.crm_can_access_lead(p_lead_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public','pg_temp'
as $function$
  select (select auth.uid()) is not null and exists(
    select 1 from public.crm_leads l
    where l.id=p_lead_id
      and (public.crm_can_manage_lead_assignment() or l.salesperson_id=(select auth.uid()))
  );
$function$;

alter policy crm_leads_select on public.crm_leads
  using (public.crm_can_manage_lead_assignment() or salesperson_id=(select auth.uid()));

create or replace function public.crm_public_form_field_visible(p_field jsonb,p_answers jsonb)
returns boolean
language plpgsql
immutable
set search_path to 'public','pg_temp'
as $function$
declare
  v_condition jsonb:=coalesce(p_field->'condition','{}'::jsonb);
  v_field_id text:=coalesce(v_condition->>'fieldId','');
  v_operator text:=coalesce(v_condition->>'operator','equals');
  v_expected text:=coalesce(v_condition->>'value','');
  v_actual jsonb;
begin
  if v_field_id='' then return true; end if;
  v_actual:=coalesce(p_answers->v_field_id,'null'::jsonb);
  if v_operator='not_equals' then return trim(both '"' from v_actual::text)<>v_expected; end if;
  if v_operator='contains' and jsonb_typeof(v_actual)='array' then return v_actual ? v_expected; end if;
  return trim(both '"' from v_actual::text)=v_expected;
end;
$function$;

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
    if v_field->>'purpose'='projectDetails' then v_project_detail:=v_answer; end if;
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
  reason:='Website qualification score from service fit, business goal, budget, timeline, buying role and project context.';
  estimated_value:=v_estimated;
  return next;
end;
$function$;

create or replace function public.crm_prepare_lead()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_scoring record; v_qualified record;
begin
  new.source:=left(btrim(coalesce(new.source,'Other')),120);
  if new.origin_type is null or new.origin_type not in ('manual','website','paid_ads','referral','other') then
    new.origin_type:=case
      when lower(new.source) ~ '(google ads|meta ads|facebook ads|linkedin ads|paid|campaign|ppc)' then 'paid_ads'
      when lower(new.source) ~ '(website|live chat|contact form|web form)' then 'website'
      when lower(new.source) ~ '(referral|partner)' then 'referral'
      else 'manual'
    end;
  elsif new.origin_type='manual' and lower(new.source) ~ '(google ads|meta ads|facebook ads|linkedin ads|paid|campaign|ppc)' then
    new.origin_type:='paid_ads';
  elsif new.origin_type='manual' and lower(new.source) ~ '(website|live chat|contact form|web form)' then
    new.origin_type:='website';
  end if;

  if new.origin_type='website'
     and jsonb_typeof(coalesce(new.qualification_data,'{}'::jsonb))='object'
     and new.qualification_data<>'{}'::jsonb
     and (tg_op='INSERT' or new.qualification_data is distinct from old.qualification_data or new.email is distinct from old.email)
  then
    select * into v_qualified from public.crm_calculate_website_qualification(new.qualification_data,new.email);
    new.lead_score:=v_qualified.score;
    new.lead_quality:=v_qualified.quality;
    new.score_reason:=v_qualified.reason;
    if coalesce(v_qualified.estimated_value,0)>0 then new.estimated_value:=v_qualified.estimated_value; end if;
  elsif tg_op='INSERT' then
    select * into v_scoring from public.crm_lead_score_values(new.origin_type,new.source);
    new.lead_score:=v_scoring.score;
    new.lead_quality:=v_scoring.quality;
    new.score_reason:=v_scoring.reason;
  elsif new.origin_type is distinct from old.origin_type or new.source is distinct from old.source then
    select * into v_scoring from public.crm_lead_score_values(new.origin_type,new.source);
    new.lead_score:=v_scoring.score;
    new.lead_quality:=v_scoring.quality;
    new.score_reason:=v_scoring.reason;
  end if;

  if tg_op='INSERT' and new.salesperson_id is not null then
    new.assigned_at:=coalesce(new.assigned_at,now());
    new.assigned_by:=coalesce(new.assigned_by,new.created_by,(select auth.uid()));
  elsif tg_op='UPDATE' and new.salesperson_id is distinct from old.salesperson_id then
    new.assigned_at:=case when new.salesperson_id is null then null else now() end;
    new.assigned_by:=case when new.salesperson_id is null then null else (select auth.uid()) end;
  end if;
  return new;
end;
$function$;

create or replace function public.crm_pick_next_lead_assignee(p_require_auto_mode boolean default true)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_cfg jsonb:='{}'::jsonb;
  v_ids uuid[]:='{}'::uuid[];
  v_last uuid;
  v_pos integer;
  v_next uuid;
begin
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='crm_lead_assignment';
  if p_require_auto_mode and coalesce(v_cfg->>'mode','manual')<>'round_robin' then return null; end if;

  perform pg_advisory_xact_lock(hashtext('profox:crm:lead-round-robin'));
  select last_salesperson_id into v_last from public.crm_lead_assignment_state where singleton_key='website' for update;

  select coalesce(array_agg(u.id order by u.created_at,u.id),'{}'::uuid[]) into v_ids
  from public.user_profiles u
  left join public.workforce_capability_profiles cp on cp.user_id=u.id
  where u.status='active'
    and u.onboarding_status='completed'
    and u.role in ('sales','sales_rep','sales_team')
    and coalesce(cp.availability_status,'Available')<>'Unavailable'
    and lower(coalesce(cp.certification_state,'active')) not in ('revoked','expired','suspended','failed')
    and (
      jsonb_array_length(coalesce(v_cfg->'eligibleSalespersonIds','[]'::jsonb))=0
      or coalesce(v_cfg->'eligibleSalespersonIds','[]'::jsonb) ? u.id::text
    );
  if coalesce(array_length(v_ids,1),0)=0 then return null; end if;
  v_pos:=array_position(v_ids,v_last);
  if v_pos is null or v_pos>=array_length(v_ids,1) then v_next:=v_ids[1]; else v_next:=v_ids[v_pos+1]; end if;
  update public.crm_lead_assignment_state
  set last_salesperson_id=v_next,cycle_count=cycle_count+1,updated_at=now()
  where singleton_key='website';
  return v_next;
end;
$function$;

create or replace function public.get_public_contact_form_configuration()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare v_cfg jsonb;
begin
  select config_value into v_cfg from public.system_configuration where config_key='public_contact_form';
  return coalesce(v_cfg,'{}'::jsonb);
end;
$function$;

create or replace function public.crm_admin_get_contact_lead_configuration()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare v_form jsonb; v_assignment jsonb; v_staff jsonb; v_sales jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  select config_value into v_form from public.system_configuration where config_key='public_contact_form';
  select config_value into v_assignment from public.system_configuration where config_key='crm_lead_assignment';
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(btrim(u.full_name),''),u.email),'email',u.email,'role',u.role,'department',coalesce(u.department,'')) order by coalesce(nullif(btrim(u.full_name),''),u.email)),'[]'::jsonb)
  into v_staff from public.user_profiles u
  where u.status='active' and u.role not in ('customer','pending');
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(btrim(u.full_name),''),u.email),'email',u.email,'role',u.role) order by coalesce(nullif(btrim(u.full_name),''),u.email)),'[]'::jsonb)
  into v_sales from public.user_profiles u
  where u.status='active' and u.onboarding_status='completed' and u.role in ('sales','sales_rep','sales_team');
  return jsonb_build_object('form',coalesce(v_form,'{}'::jsonb),'assignment',coalesce(v_assignment,'{}'::jsonb),'staff',v_staff,'salespeople',v_sales);
end;
$function$;

create or replace function public.crm_admin_save_contact_lead_configuration(p_form jsonb,p_assignment jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_field jsonb; v_id text; v_type text; v_purpose text;
  v_ids text[]:='{}'::text[]; v_full boolean:=false; v_email boolean:=false;
  v_mode text:=coalesce(p_assignment->>'mode','manual'); v_uid text;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if jsonb_typeof(p_form)<>'object' or jsonb_typeof(p_form->'steps')<>'array' or jsonb_typeof(p_form->'fields')<>'array' then raise exception 'Form configuration is invalid.'; end if;
  if jsonb_array_length(p_form->'steps') not between 1 and 4 then raise exception 'Use between 1 and 4 form steps.'; end if;
  if jsonb_array_length(p_form->'fields') not between 2 and 30 then raise exception 'Use between 2 and 30 form fields.'; end if;
  for v_field in select value from jsonb_array_elements(p_form->'fields') loop
    v_id:=btrim(coalesce(v_field->>'id','')); v_type:=coalesce(v_field->>'type','text'); v_purpose:=coalesce(v_field->>'purpose','');
    if v_id!~'^[A-Za-z][A-Za-z0-9_]{1,63}$' then raise exception 'Every field needs a stable identifier.'; end if;
    if v_id=any(v_ids) then raise exception 'Form field identifiers must be unique.'; end if;
    v_ids:=array_append(v_ids,v_id);
    if v_type not in ('text','email','url','tel','textarea','single_select') then raise exception 'Unsupported form field type: %',v_type; end if;
    if coalesce((v_field->>'enabled')::boolean,true) and v_purpose='fullName' and coalesce((v_field->>'required')::boolean,false) then v_full:=true; end if;
    if coalesce((v_field->>'enabled')::boolean,true) and v_purpose='email' and coalesce((v_field->>'required')::boolean,false) then v_email:=true; end if;
  end loop;
  if not v_full or not v_email then raise exception 'Full name and email must remain enabled and required.'; end if;
  if v_mode not in ('manual','round_robin') then raise exception 'Assignment mode must be manual or round_robin.'; end if;
  if jsonb_typeof(coalesce(p_assignment->'managerUserIds','[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_assignment->'eligibleSalespersonIds','[]'::jsonb))<>'array' then raise exception 'Assignment member lists are invalid.'; end if;
  for v_uid in select jsonb_array_elements_text(coalesce(p_assignment->'managerUserIds','[]'::jsonb)) loop
    if not exists(select 1 from public.user_profiles u where u.id=v_uid::uuid and u.status='active' and u.role not in ('customer','pending')) then raise exception 'An assignment manager is no longer an active staff member.'; end if;
  end loop;
  for v_uid in select jsonb_array_elements_text(coalesce(p_assignment->'eligibleSalespersonIds','[]'::jsonb)) loop
    if not exists(select 1 from public.user_profiles u where u.id=v_uid::uuid and u.status='active' and u.onboarding_status='completed' and u.role in ('sales','sales_rep','sales_team')) then raise exception 'An automatic-assignment salesperson is not active and eligible.'; end if;
  end loop;
  insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  values('public_contact_form',p_form,'Public contact form configuration',(select auth.uid()),now())
  on conflict(config_key) do update set config_value=excluded.config_value,updated_by=excluded.updated_by,updated_at=now();
  insert into public.system_configuration(config_key,config_value,description,updated_by,updated_at)
  values('crm_lead_assignment',p_assignment,'CRM lead assignment configuration',(select auth.uid()),now())
  on conflict(config_key) do update set config_value=excluded.config_value,updated_by=excluded.updated_by,updated_at=now();
  return public.crm_admin_get_contact_lead_configuration();
end;
$function$;

create or replace function public.crm_get_lead_assignment_status()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare v_cfg jsonb:='{}'::jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_cfg from public.system_configuration where config_key='crm_lead_assignment';
  return jsonb_build_object(
    'canManage',public.crm_can_manage_lead_assignment(),
    'mode',coalesce(v_cfg->>'mode','manual'),
    'eligibleSalespersonIds',coalesce(v_cfg->'eligibleSalespersonIds','[]'::jsonb)
  );
end;
$function$;

create or replace function public.crm_list_lead_assignees()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not exists(
    select 1 from public.user_profiles u where u.id=(select auth.uid()) and u.status='active'
  ) then raise exception 'CRM access required.'; end if;
  if not public.crm_can_manage_lead_assignment() and not exists(
    select 1 from public.user_profiles u where u.id=(select auth.uid()) and u.role in ('sales','sales_rep','sales_team')
  ) then raise exception 'CRM access required.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'name',coalesce(nullif(btrim(u.full_name),''),u.email),'avatarUrl',coalesce(u.avatar_url,''),'role',u.role,
    'status',u.status,'onboardingStatus',u.onboarding_status
  ) order by coalesce(nullif(btrim(u.full_name),''),u.email)),'[]'::jsonb) into v_result
  from public.user_profiles u
  where u.status='active' and u.onboarding_status='completed' and u.role in ('sales','sales_rep','sales_team');
  return v_result;
end;
$function$;

create or replace function public.crm_assign_lead(p_lead_id uuid,p_salesperson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_lead public.crm_leads%rowtype;
begin
  if not public.crm_can_manage_lead_assignment() then raise exception 'Lead assignment permission required.'; end if;
  if not exists(select 1 from public.user_profiles u where u.id=p_salesperson_id and u.status='active' and u.onboarding_status='completed' and u.role in ('sales','sales_rep','sales_team')) then
    raise exception 'Choose an active, qualified Sales Representative.';
  end if;
  update public.crm_leads set salesperson_id=p_salesperson_id where id=p_lead_id returning * into v_lead;
  if not found then raise exception 'Lead not found.'; end if;
  update public.sales_chat_conversations set current_sales_id=p_salesperson_id,updated_at=now() where crm_lead_id=p_lead_id and status<>'resolved';
  return jsonb_build_object('success',true,'leadId',v_lead.id,'salespersonId',v_lead.salesperson_id,'assignedAt',v_lead.assigned_at);
end;
$function$;

create or replace function public.crm_bulk_assign_leads(p_lead_ids uuid[],p_salesperson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_count integer:=0;
begin
  if not public.crm_can_manage_lead_assignment() then raise exception 'Lead assignment permission required.'; end if;
  if coalesce(array_length(p_lead_ids,1),0) not between 1 and 200 then raise exception 'Select between 1 and 200 leads.'; end if;
  if not exists(select 1 from public.user_profiles u where u.id=p_salesperson_id and u.status='active' and u.onboarding_status='completed' and u.role in ('sales','sales_rep','sales_team')) then raise exception 'Choose an active, qualified Sales Representative.'; end if;
  update public.crm_leads set salesperson_id=p_salesperson_id where id=any(p_lead_ids) and archived_at is null;
  get diagnostics v_count=row_count;
  update public.sales_chat_conversations set current_sales_id=p_salesperson_id,updated_at=now() where crm_lead_id=any(p_lead_ids) and status<>'resolved';
  return jsonb_build_object('success',true,'assignedCount',v_count,'salespersonId',p_salesperson_id);
end;
$function$;

create or replace function public.crm_distribute_leads_round_robin(p_lead_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_lead_id uuid; v_seller uuid; v_count integer:=0; v_assignments jsonb:='[]'::jsonb;
begin
  if not public.crm_can_manage_lead_assignment() then raise exception 'Lead assignment permission required.'; end if;
  if coalesce(array_length(p_lead_ids,1),0) not between 1 and 200 then raise exception 'Select between 1 and 200 leads.'; end if;
  foreach v_lead_id in array p_lead_ids loop
    if not exists(select 1 from public.crm_leads l where l.id=v_lead_id and l.archived_at is null) then continue; end if;
    v_seller:=public.crm_pick_next_lead_assignee(false);
    if v_seller is null then raise exception 'No active eligible salesperson is available for round-robin assignment.'; end if;
    update public.crm_leads set salesperson_id=v_seller where id=v_lead_id;
    update public.sales_chat_conversations set current_sales_id=v_seller,updated_at=now() where crm_lead_id=v_lead_id and status<>'resolved';
    v_count:=v_count+1;
    v_assignments:=v_assignments||jsonb_build_array(jsonb_build_object('leadId',v_lead_id,'salespersonId',v_seller));
  end loop;
  return jsonb_build_object('success',true,'assignedCount',v_count,'assignments',v_assignments);
end;
$function$;

create or replace function public.submit_public_crm_lead(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_form jsonb:='{}'::jsonb; v_field jsonb; v_options jsonb; v_answer jsonb; v_answers jsonb:='{}'::jsonb; v_clean jsonb:='{}'::jsonb;
  v_id text; v_purpose text; v_type text; v_text text; v_required boolean; v_visible boolean; v_valid_option boolean;
  v_legacy boolean:=jsonb_typeof(p_payload->'answers')<>'object';
  v_name text:=''; v_email text:=''; v_company text:=''; v_website text:=''; v_service text:=''; v_goal text:=''; v_budget text:=''; v_timeline text:=''; v_decision text:=''; v_details text:=''; v_phone text:='';
  v_email_hash text; v_last timestamptz; v_seller uuid; v_lead public.crm_leads%rowtype; v_attr jsonb:='{}'::jsonb; v_key text; v_val text;
begin
  if btrim(coalesce(p_payload->>'honeypot',''))<>'' then return jsonb_build_object('success',true); end if;
  if octet_length(coalesce(p_payload::text,''))>50000 then raise exception 'The enquiry is too large.'; end if;
  select coalesce(config_value,'{}'::jsonb) into v_form from public.system_configuration where config_key='public_contact_form';
  if coalesce((v_form->>'enabled')::boolean,true) is not true then raise exception 'Project enquiries are temporarily unavailable. Please contact us by email.'; end if;

  if v_legacy then
    v_name:=btrim(coalesce(p_payload->>'fullName','')); v_email:=lower(btrim(coalesce(p_payload->>'email','')));
    v_service:=btrim(coalesce(p_payload->>'subject','')); v_details:=btrim(coalesce(p_payload->>'message',''));
    if char_length(v_name) not between 2 and 120 then raise exception 'Enter your full name.'; end if;
    if char_length(v_email)>254 or v_email!~'^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Enter a valid email address.'; end if;
    if char_length(v_service) not between 2 and 180 then raise exception 'Choose a valid enquiry subject.'; end if;
    if char_length(v_details) not between 5 and 4000 then raise exception 'Your message must be between 5 and 4000 characters.'; end if;
    v_company:=v_name;
  else
    v_answers:=p_payload->'answers';
    for v_field in select value from jsonb_array_elements(coalesce(v_form->'fields','[]'::jsonb)) order by coalesce((value->>'order')::integer,0) loop
      if coalesce((v_field->>'enabled')::boolean,true) is not true then continue; end if;
      v_id:=btrim(coalesce(v_field->>'id','')); if v_id='' then continue; end if;
      v_visible:=public.crm_public_form_field_visible(v_field,v_answers); if not v_visible then continue; end if;
      v_answer:=v_answers->v_id; v_required:=coalesce((v_field->>'required')::boolean,false); v_type:=coalesce(v_field->>'type','text');
      if v_answer is null or v_answer='null'::jsonb or (jsonb_typeof(v_answer)='string' and btrim(v_answer#>>'{}')='') then
        if v_required then raise exception 'Please complete %.',coalesce(v_field->>'label','this required field'); end if;
        continue;
      end if;
      if jsonb_typeof(v_answer)<>'string' then raise exception 'A form answer has an invalid format.'; end if;
      v_text:=btrim(v_answer#>>'{}');
      if char_length(v_text)>coalesce((v_field->>'maxLength')::integer,case when v_type='textarea' then 4000 else 500 end) then raise exception '% is too long.',coalesce(v_field->>'label','A field'); end if;
      if char_length(v_text)<coalesce((v_field->>'minLength')::integer,0) then raise exception '% needs a little more detail.',coalesce(v_field->>'label','A field'); end if;
      if v_type='email' and (char_length(v_text)>254 or lower(v_text)!~'^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$') then raise exception 'Enter a valid email address.'; end if;
      if v_type='url' and v_text<>'' and v_text!~*'^https?://[^[:space:]]+$' then raise exception 'Enter a complete website URL beginning with http:// or https://.'; end if;
      if v_type='single_select' then
        v_valid_option:=exists(select 1 from jsonb_array_elements(coalesce(v_field->'options','[]'::jsonb)) o where o->>'value'=v_text);
        if not v_valid_option then raise exception 'Choose a valid option for %.',coalesce(v_field->>'label','this field'); end if;
      end if;
      v_clean:=v_clean||jsonb_build_object(v_id,v_text);
      v_purpose:=coalesce(v_field->>'purpose','');
      case v_purpose
        when 'fullName' then v_name:=v_text;
        when 'email' then v_email:=lower(v_text);
        when 'companyName' then v_company:=v_text;
        when 'website' then v_website:=v_text;
        when 'serviceInterest' then v_service:=v_text;
        when 'businessGoal' then v_goal:=v_text;
        when 'budgetRange' then v_budget:=v_text;
        when 'timeline' then v_timeline:=v_text;
        when 'decisionRole' then v_decision:=v_text;
        when 'projectDetails' then v_details:=v_text;
        when 'phone' then v_phone:=v_text;
        else null;
      end case;
    end loop;
    if char_length(v_name) not between 2 and 120 then raise exception 'Enter your full name.'; end if;
    if char_length(v_email)>254 or v_email!~'^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Enter a valid email address.'; end if;
    if v_service='' then v_service:='Project enquiry'; end if;
    if v_company='' then v_company:=v_name; end if;
  end if;

  if jsonb_typeof(p_payload->'attribution')='object' then
    foreach v_key in array array['utmSource','utmMedium','utmCampaign','utmContent','utmTerm','landingPage','referrer','gclid','fbclid'] loop
      v_val:=left(btrim(coalesce(p_payload#>>array['attribution',v_key],'')),500);
      if v_val<>'' then v_attr:=v_attr||jsonb_build_object(v_key,v_val); end if;
    end loop;
  end if;

  v_email_hash:=encode(extensions.digest(v_email,'sha256'),'hex');
  insert into public.crm_public_lead_rate_limits(email_hash,last_submitted_at) values(v_email_hash,now()-interval '2 minutes') on conflict(email_hash) do nothing;
  select last_submitted_at into v_last from public.crm_public_lead_rate_limits where email_hash=v_email_hash for update;
  if v_last>now()-interval '60 seconds' then raise exception 'Please wait before submitting another enquiry.'; end if;
  update public.crm_public_lead_rate_limits set last_submitted_at=now() where email_hash=v_email_hash;

  select * into v_lead from public.crm_leads where lower(email)=v_email and converted_opportunity_id is null and archived_at is null order by created_at desc limit 1 for update;
  if found then
    if v_lead.salesperson_id is null then v_seller:=public.crm_pick_next_lead_assignee(true); else v_seller:=v_lead.salesperson_id; end if;
    update public.crm_leads set
      title=v_service,company_name=coalesce(nullif(v_company,''),company_name),contact_name=v_name,email=v_email,
      phone=coalesce(nullif(v_phone,''),phone),website=coalesce(nullif(v_website,''),website),service_interest=v_service,
      business_goal=coalesce(nullif(v_goal,''),business_goal),budget_range=coalesce(nullif(v_budget,''),budget_range),
      project_timeline=coalesce(nullif(v_timeline,''),project_timeline),decision_role=coalesce(nullif(v_decision,''),decision_role),
      project_details=coalesce(nullif(v_details,''),project_details),qualification_data=case when v_legacy then qualification_data else v_clean end,
      attribution=case when v_attr='{}'::jsonb then attribution else attribution||v_attr end,
      notes=left(concat_ws(chr(10)||chr(10),nullif(notes,''),'Website enquiry: '||v_details),5000),
      salesperson_id=coalesce(salesperson_id,v_seller),source='Website Contact Form',origin_type='website'
    where id=v_lead.id returning * into v_lead;
    perform public.crm_write_lead_event(v_lead.id,'website_enquiry','New website enquiry received',left(v_details,5000),
      jsonb_build_object('service',v_service,'businessGoal',v_goal,'budget',v_budget,'timeline',v_timeline,'decisionRole',v_decision,'attribution',v_attr),null,v_name,'customer');
  else
    v_seller:=public.crm_pick_next_lead_assignee(true);
    insert into public.crm_leads(
      title,company_name,contact_name,email,phone,website,country,source,origin_type,salesperson_id,service_interest,status,notes,self_generated,
      business_goal,budget_range,project_timeline,decision_role,project_details,qualification_data,attribution
    ) values(
      v_service,v_company,v_name,v_email,v_phone,v_website,'Unknown','Website Contact Form','website',v_seller,v_service,'New',v_details,false,
      nullif(v_goal,''),nullif(v_budget,''),nullif(v_timeline,''),nullif(v_decision,''),nullif(v_details,''),case when v_legacy then '{}'::jsonb else v_clean end,v_attr
    ) returning * into v_lead;
  end if;
  return jsonb_build_object('success',true,'reference','LEAD-'||upper(left(replace(v_lead.id::text,'-',''),8)),'assigned',v_lead.salesperson_id is not null);
end;
$function$;

revoke all on function public.crm_pick_next_lead_assignee(boolean) from public,anon,authenticated;
revoke all on function public.crm_calculate_website_qualification(jsonb,text) from public,anon,authenticated;
revoke all on function public.crm_public_form_field_visible(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.get_public_contact_form_configuration() to anon,authenticated;
grant execute on function public.submit_public_crm_lead(jsonb) to anon,authenticated;
grant execute on function public.crm_admin_get_contact_lead_configuration() to authenticated;
grant execute on function public.crm_admin_save_contact_lead_configuration(jsonb,jsonb) to authenticated;
grant execute on function public.crm_get_lead_assignment_status() to authenticated;
grant execute on function public.crm_bulk_assign_leads(uuid[],uuid) to authenticated;
grant execute on function public.crm_distribute_leads_round_robin(uuid[]) to authenticated;
grant execute on function public.crm_assign_lead(uuid,uuid) to authenticated;
grant execute on function public.crm_list_lead_assignees() to authenticated;

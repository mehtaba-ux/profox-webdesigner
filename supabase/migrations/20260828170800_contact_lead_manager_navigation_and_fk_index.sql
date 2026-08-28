-- Final release hardening for the qualified contact lead workflow.
-- Keep assignment managers aligned with roles that can already reach the CRM Leads workspace,
-- and cover the round-robin cursor foreign key reported by Supabase advisors.

create index if not exists idx_crm_lead_assignment_state_last_salesperson_id
  on public.crm_lead_assignment_state(last_salesperson_id);

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
  where u.status='active'
    and u.role in ('sales','sales_rep','sales_team');
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
    if not exists(
      select 1 from public.user_profiles u
      where u.id=v_uid::uuid
        and u.status='active'
        and u.role in ('sales','sales_rep','sales_team')
    ) then
      raise exception 'Assignment managers must be active CRM Sales staff.';
    end if;
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

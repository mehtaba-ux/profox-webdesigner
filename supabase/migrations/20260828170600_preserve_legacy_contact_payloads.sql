-- Preserve older contact surfaces during the deployment window.
-- The configured form handler remains authoritative for the new answers{} payload.

alter function public.submit_public_crm_lead(jsonb) rename to submit_public_crm_lead_configured;

create or replace function public.submit_public_crm_lead(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_name text;
  v_email text;
  v_subject text;
  v_message text;
  v_email_hash text;
  v_last timestamptz;
  v_seller uuid;
  v_lead public.crm_leads%rowtype;
begin
  if jsonb_typeof(p_payload->'answers')='object' then
    return public.submit_public_crm_lead_configured(p_payload);
  end if;

  if btrim(coalesce(p_payload->>'honeypot',''))<>'' then return jsonb_build_object('success',true); end if;
  v_name:=btrim(coalesce(p_payload->>'fullName',''));
  v_email:=lower(btrim(coalesce(p_payload->>'email','')));
  v_subject:=btrim(coalesce(p_payload->>'subject',''));
  v_message:=btrim(coalesce(p_payload->>'message',''));
  if char_length(v_name) not between 2 and 120 then raise exception 'Enter your full name.'; end if;
  if char_length(v_email)>254 or v_email!~'^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Enter a valid email address.'; end if;
  if char_length(v_subject) not between 2 and 180 then raise exception 'Choose a valid enquiry subject.'; end if;
  if char_length(v_message) not between 5 and 4000 then raise exception 'Your message must be between 5 and 4000 characters.'; end if;

  v_email_hash:=encode(extensions.digest(v_email,'sha256'),'hex');
  insert into public.crm_public_lead_rate_limits(email_hash,last_submitted_at)
  values(v_email_hash,now()-interval '2 minutes') on conflict(email_hash) do nothing;
  select last_submitted_at into v_last from public.crm_public_lead_rate_limits where email_hash=v_email_hash for update;
  if v_last>now()-interval '60 seconds' then raise exception 'Please wait before submitting another enquiry.'; end if;
  update public.crm_public_lead_rate_limits set last_submitted_at=now() where email_hash=v_email_hash;

  select * into v_lead
  from public.crm_leads
  where lower(email)=v_email and converted_opportunity_id is null and archived_at is null
  order by created_at desc limit 1 for update;

  if found then
    if v_lead.salesperson_id is null then v_seller:=public.crm_pick_next_lead_assignee(true); else v_seller:=v_lead.salesperson_id; end if;
    update public.crm_leads set
      title=v_subject,
      service_interest=v_subject,
      notes=left(concat_ws(chr(10)||chr(10),nullif(notes,''),'Website enquiry: '||v_message),5000),
      salesperson_id=coalesce(salesperson_id,v_seller),
      source='Website Contact Form',
      origin_type='website'
    where id=v_lead.id returning * into v_lead;
    perform public.crm_write_lead_event(
      v_lead.id,'website_enquiry','New website enquiry received',v_message,
      jsonb_build_object('service',v_subject,'source','Website Contact Form','legacyPayload',true),null,v_name,'customer'
    );
  else
    v_seller:=public.crm_pick_next_lead_assignee(true);
    insert into public.crm_leads(
      title,company_name,contact_name,email,country,source,origin_type,salesperson_id,service_interest,status,notes,self_generated
    ) values(
      v_subject,v_name,v_name,v_email,'Unknown','Website Contact Form','website',v_seller,v_subject,'New',v_message,false
    ) returning * into v_lead;
  end if;

  return jsonb_build_object(
    'success',true,
    'reference','LEAD-'||upper(left(replace(v_lead.id::text,'-',''),8)),
    'assigned',v_lead.salesperson_id is not null
  );
end;
$function$;

revoke all on function public.submit_public_crm_lead_configured(jsonb) from public,anon,authenticated;
grant execute on function public.submit_public_crm_lead(jsonb) to anon,authenticated;

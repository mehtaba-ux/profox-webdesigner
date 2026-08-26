with source_rows as (
  select lower(btrim(email)) email,coalesce(nullif(btrim(contact_name),''),nullif(btrim(company_name),''),'') display_name,coalesce(phone,'') phone,created_at seen_at from public.crm_leads where btrim(coalesce(email,''))<>''
  union all select lower(btrim(email)),coalesce(nullif(btrim(contact_name),''),nullif(btrim(company_name),''),''),coalesce(phone,''),created_at from public.crm_opportunities where btrim(coalesce(email,''))<>''
  union all select lower(btrim(email)),coalesce(nullif(btrim(contact_name),''),nullif(btrim(customer_name),''),''),coalesce(phone,''),created_at from public.quotations where btrim(coalesce(email,''))<>''
  union all select lower(btrim(email)),coalesce(nullif(btrim(primary_contact_name),''),nullif(btrim(company_name),''),''),coalesce(phone,''),created_at from public.clients where btrim(coalesce(email,''))<>''
  union all select lower(btrim(customer_email)),coalesce(customer_name,''),coalesce(customer_phone,''),created_at from public.sales_chat_conversations where btrim(coalesce(customer_email,''))<>''
  union all select lower(btrim(customer_email)),coalesce(customer_name,''),'',created_at from public.payments where btrim(coalesce(customer_email,''))<>''
), aggregated as (
  select email,max(nullif(display_name,'')) display_name,max(nullif(phone,'')) phone,min(seen_at) first_seen_at,max(seen_at) last_seen_at
  from source_rows where email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' group by email
)
insert into public.customer_identities(email,display_name,phone,first_seen_at,last_seen_at,created_at,updated_at)
select email,coalesce(display_name,''),coalesce(phone,''),coalesce(first_seen_at,now()),coalesce(last_seen_at,now()),coalesce(first_seen_at,now()),now() from aggregated
on conflict(email) do update set display_name=case when excluded.display_name<>'' then excluded.display_name else public.customer_identities.display_name end,phone=case when excluded.phone<>'' then excluded.phone else public.customer_identities.phone end,first_seen_at=least(public.customer_identities.first_seen_at,excluded.first_seen_at),last_seen_at=greatest(public.customer_identities.last_seen_at,excluded.last_seen_at),updated_at=now();

update public.crm_leads r set customer_identity_id=i.id from public.customer_identities i where r.customer_identity_id is null and lower(btrim(coalesce(r.email,'')))=i.email;
update public.crm_opportunities r set customer_identity_id=i.id from public.customer_identities i where r.customer_identity_id is null and lower(btrim(coalesce(r.email,'')))=i.email;
select set_config('profox.quotation_atomic_rpc','1',true);
update public.quotations r set customer_identity_id=i.id from public.customer_identities i where r.customer_identity_id is null and lower(btrim(coalesce(r.email,'')))=i.email;
select set_config('profox.quotation_atomic_rpc','',true);
update public.clients r set customer_identity_id=i.id from public.customer_identities i where r.customer_identity_id is null and lower(btrim(coalesce(r.email,'')))=i.email;
update public.sales_chat_conversations r set customer_identity_id=i.id from public.customer_identities i where r.customer_identity_id is null and lower(btrim(coalesce(r.customer_email,'')))=i.email;
select set_config('profox.payment_plan_sync','1',true);
update public.payments r set customer_identity_id=i.id from public.customer_identities i where r.customer_identity_id is null and lower(btrim(coalesce(r.customer_email,'')))=i.email;
select set_config('profox.payment_plan_sync','',true);

update public.customer_identities i set linked_user_id=c.linked_user_id,updated_at=now()
from (select distinct on (customer_identity_id) customer_identity_id,linked_user_id from public.clients where customer_identity_id is not null and linked_user_id is not null order by customer_identity_id,created_at) c
where i.id=c.customer_identity_id and i.linked_user_id is null;
update public.customer_identities i set relationship_status='client',updated_at=now() where exists(select 1 from public.clients c where c.customer_identity_id=i.id and c.status='Active');
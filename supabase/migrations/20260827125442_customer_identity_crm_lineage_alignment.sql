create or replace function public.sync_customer_identity_reference()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare
  v_row jsonb:=to_jsonb(new); v_email text; v_name text; v_phone text; v_id uuid; v_parent uuid; v_ref uuid;
begin
  -- Prefer the canonical CRM lineage over a delivery/contact email snapshot.
  if tg_table_name='crm_opportunities' and nullif(v_row->>'lead_id','') is not null then
    v_ref:=(v_row->>'lead_id')::uuid;
    select customer_identity_id into v_parent from public.crm_leads where id=v_ref;
  elsif tg_table_name='quotations' and nullif(v_row->>'opportunity_id','') is not null then
    v_ref:=(v_row->>'opportunity_id')::uuid;
    select customer_identity_id into v_parent from public.crm_opportunities where id=v_ref;
  elsif tg_table_name='clients' and nullif(v_row->>'source_opportunity_id','') is not null then
    v_ref:=(v_row->>'source_opportunity_id')::uuid;
    select customer_identity_id into v_parent from public.crm_opportunities where id=v_ref;
  elsif tg_table_name='payments' then
    if nullif(v_row->>'opportunity_id','') is not null then
      v_ref:=(v_row->>'opportunity_id')::uuid;
      select customer_identity_id into v_parent from public.crm_opportunities where id=v_ref;
    elsif nullif(v_row->>'quotation_id','') is not null then
      v_ref:=(v_row->>'quotation_id')::uuid;
      select customer_identity_id into v_parent from public.quotations where id=v_ref;
    end if;
  elsif tg_table_name='sales_chat_conversations' and nullif(v_row->>'quotation_id','') is not null then
    v_ref:=(v_row->>'quotation_id')::uuid;
    select customer_identity_id into v_parent from public.quotations where id=v_ref;
  end if;

  if v_parent is not null then
    new.customer_identity_id:=v_parent;
    return new;
  end if;

  v_email:=coalesce(v_row->>'email',v_row->>'customer_email','');
  v_name:=coalesce(v_row->>'contact_name',v_row->>'primary_contact_name',v_row->>'customer_name',v_row->>'company_name','');
  v_phone:=coalesce(v_row->>'phone',v_row->>'customer_phone','');
  if btrim(coalesce(v_email,''))='' then return new; end if;
  v_id:=public.customer_identity_resolve(v_email,v_name,v_phone);
  if v_id is not null then new.customer_identity_id:=v_id; end if;
  return new;
end;$function$;

-- Align existing linked records without changing their commercial/contact snapshots.
update public.crm_opportunities o set customer_identity_id=l.customer_identity_id,updated_at=now() from public.crm_leads l where o.lead_id=l.id and l.customer_identity_id is not null and o.customer_identity_id is distinct from l.customer_identity_id;

select set_config('profox.quotation_atomic_rpc','1',true);
update public.quotations q set customer_identity_id=o.customer_identity_id,updated_at=now() from public.crm_opportunities o where q.opportunity_id=o.id and o.customer_identity_id is not null and q.customer_identity_id is distinct from o.customer_identity_id;
select set_config('profox.quotation_atomic_rpc','',true);

update public.clients c set customer_identity_id=o.customer_identity_id,updated_at=now() from public.crm_opportunities o where c.source_opportunity_id=o.id and o.customer_identity_id is not null and c.customer_identity_id is distinct from o.customer_identity_id;

select set_config('profox.payment_plan_sync','1',true);
update public.payments p set customer_identity_id=o.customer_identity_id,updated_at=now() from public.crm_opportunities o where p.opportunity_id=o.id and o.customer_identity_id is not null and p.customer_identity_id is distinct from o.customer_identity_id;
select set_config('profox.payment_plan_sync','',true);

update public.sales_chat_conversations c set customer_identity_id=q.customer_identity_id,updated_at=now() from public.quotations q where c.quotation_id=q.id and q.customer_identity_id is not null and c.customer_identity_id is distinct from q.customer_identity_id;